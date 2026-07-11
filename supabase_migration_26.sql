-- ЗАСВАР #163 (код шинжилгээ): 20,000 хэрэглэгч / 2,000 бvлгийн хэмжээнд
-- Postgres-ийн хувьд бодит ачаалал маш жижиг ч, тэр хэмжээнд хvрэхээс ӨМНӨ
-- хийвэл зохих 3 зvйл. Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.
--
-- Юуг засав:
--   1) has_any_role() (migration_17-оор аль хэдийн vvссэн, зөвхөн users-ийн
--      2 policy-д ашиглагдаж байсан) функцийг vлдсэн БvХ policy-д ашиглав —
--      өмнө нь policy бvр мөр бvр дээр "exists (select ... from public.users)"
--      raw дэд query давтан бичигдсэн байсан.
--   2) manga_view_events-д хугацааны (viewed_at) индекс + хуучин мөр цэвэрлэх
--      (purge) функц нэмэв — энэ хvснэгт цорын ганц ЖИНХЭНЭ өсөлттэй хvснэгт
--      (20 мянган хэрэглэгч өдөрт дунджаар 5 vзэлт хийхэд жилд ~35 сая мөр).
--   3) Postgres FK (foreign key)-д АВТОМАТААР индекс vvсгэдэггvй тул хамгийн
--      их хайлт хийгддэг холбоосуудад индекс нэмэв.

-- ============================================================
-- 1) has_any_role()-г vлдсэн бvх policy-д ашиглав (гvйцэтгэлийн ялгаа зөвхөн
--    хэрэглэгч олон (мянгаараа) болмогц мэдрэгдэнэ — одоо асуудалгvй ч урьдчилан
--    засаж тавихад хямд).
-- ============================================================

-- mangas
drop policy if exists "mangas_select" on public.mangas;
create policy "mangas_select" on public.mangas for select
  using (
    coalesce(is_hidden, false) = false
    or public.has_any_role(auth.uid(), array['admin','moderator','editor'])
  );

drop policy if exists "mangas_insert_staff" on public.mangas;
create policy "mangas_insert_staff" on public.mangas for insert
  with check (public.has_any_role(auth.uid(), array['admin','moderator','editor']));

drop policy if exists "mangas_update_moderate" on public.mangas;
create policy "mangas_update_moderate" on public.mangas for update
  using (public.has_any_role(auth.uid(), array['admin','moderator']));

-- chapters
drop policy if exists "chapters_insert_staff" on public.chapters;
create policy "chapters_insert_staff" on public.chapters for insert
  with check (
    public.has_any_role(auth.uid(), array['admin','moderator'])
    or (
      public.has_any_role(auth.uid(), array['editor'])
      and status = 'pending'
    )
  );

drop policy if exists "chapters_update_moderate" on public.chapters;
create policy "chapters_update_moderate" on public.chapters for update
  using (public.has_any_role(auth.uid(), array['admin','moderator']));

-- chapter_images (VIP/publish_at шалгалт хэвээрээ, зөвхөн staff-ийн эрхийн шалгалтыг л сольсон)
drop policy if exists "chapter_images_select" on public.chapter_images;
create policy "chapter_images_select" on public.chapter_images for select
  using (
    exists (
      select 1 from public.chapters c
      where c.id = chapter_id
        and (
          public.has_any_role(auth.uid(), array['admin','moderator','editor'])
          or (
            c.status = 'published'
            and (c.publish_at is null or c.publish_at <= now())
            and (
              not c.is_vip
              or exists (
                select 1 from public.users u where u.id = auth.uid()
                  and u.is_vip and (u.vip_expires_at is null or u.vip_expires_at > now())
              )
            )
          )
        )
    )
  );

drop policy if exists "chapter_images_insert_staff" on public.chapter_images;
create policy "chapter_images_insert_staff" on public.chapter_images for insert
  with check (public.has_any_role(auth.uid(), array['admin','moderator','editor']));

-- comments
drop policy if exists "comments_delete_own_or_mod" on public.comments;
create policy "comments_delete_own_or_mod" on public.comments for delete
  using (
    auth.uid() = user_id
    or public.has_any_role(auth.uid(), array['admin','moderator'])
  );

-- reports
drop policy if exists "reports_select_mod" on public.reports;
create policy "reports_select_mod" on public.reports for select
  using (public.has_any_role(auth.uid(), array['admin','moderator']));

drop policy if exists "reports_update_mod" on public.reports;
create policy "reports_update_mod" on public.reports for update
  using (public.has_any_role(auth.uid(), array['admin','moderator']));

-- payment_requests
drop policy if exists "payment_requests_select_own_or_admin" on public.payment_requests;
create policy "payment_requests_select_own_or_admin" on public.payment_requests for select
  using (
    auth.uid() = user_id
    or public.has_any_role(auth.uid(), array['admin'])
  );

drop policy if exists "payment_requests_update_admin" on public.payment_requests;
create policy "payment_requests_update_admin" on public.payment_requests for update
  using (public.has_any_role(auth.uid(), array['admin']));

-- reels
drop policy if exists "reels_moderator_write" on public.reels;
create policy "reels_moderator_write" on public.reels for all
  using (public.has_any_role(auth.uid(), array['admin','moderator']))
  with check (public.has_any_role(auth.uid(), array['admin','moderator']));

-- storage (chapters/posters/banners upload)
drop policy if exists "manga_site_staff_upload" on storage.objects;
create policy "manga_site_staff_upload" on storage.objects for insert
  with check (
    bucket_id = 'manga-site'
    and (storage.foldername(name))[1] in ('posters', 'banners', 'chapters')
    and public.has_any_role(auth.uid(), array['admin','moderator','editor'])
  );

-- ============================================================
-- 2) manga_view_events — хугацааны индекс + purge функц
-- ============================================================
create index if not exists manga_view_events_viewed_at_idx
  on public.manga_view_events (viewed_at);

create or replace function public.purge_old_manga_view_events()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.manga_view_events where viewed_at < now() - interval '45 days';
$$;

grant execute on function public.purge_old_manga_view_events() to authenticated;

-- Дараах командыг НЭГ УДАА гараар ажиллуулж, өдөр бvр шөнийн 03:00 (UTC)
-- цагт purge-ийг автоматаар ажиллуулна. Урьдчилсан нөхцөл: Supabase Dashboard
-- → Database → Extensions-ээс "pg_cron" өргөтгөлийг эхлээд идэвхжvvл.
--
-- select cron.schedule(
--   'purge-manga-view-events',
--   '0 3 * * *',
--   $$select public.purge_old_manga_view_events()$$
-- );

-- ============================================================
-- 3) FK индексvvд (Postgres FK-д автоматаар индекс vvсгэдэггvй)
-- ============================================================
create index if not exists chapters_manga_idx on public.chapters (manga_id);
create index if not exists chapter_images_chapter_idx on public.chapter_images (chapter_id, page_number);
create index if not exists comments_chapter_idx on public.comments (chapter_id, created_at desc);
create index if not exists comments_manga_idx on public.comments (manga_id, created_at desc);
