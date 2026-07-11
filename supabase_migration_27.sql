-- ЗАСВАР #163 (код шинжилгээ, 2-р ээлж): бvрэн шалгалтаар илэрсэн CRITICAL/HIGH/
-- MEDIUM цоорхойнуудыг засав. Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

-- ============================================================
-- 🔴 CRITICAL 1) pending_delete баганууд — supabase_setup.sql-ийг "бvрэн
--    consolidated" гэж шинэчлэхдээ migration_13-ийн эдгээр 3 баганыг санамсаргvй
--    орхигдуулсан байсан (production дээр аль хэдийн байгаа тул энд өөрчлөлт
--    гарахгvй, зөвхөн ямар нэг шалтгаанаар дутуу бол найдвартай нөхнө).
-- ============================================================
alter table public.chapters add column if not exists pending_delete boolean not null default false;
alter table public.chapters add column if not exists delete_requested_by uuid references public.users(id) on delete set null;
alter table public.chapters add column if not exists delete_requested_at timestamptz;

-- ============================================================
-- 🔴 CRITICAL 2) "БҮЛЭГ НЭМЭХ" (ЗАСВАР #163, 1-р ээлж)-ийн is_hidden атомар
--    засвар editor-ийн бvлгийг мөнхөд нуугдмал vлдээдэг байсан (editor-т
--    chapters_update_moderate update эрх байхгvй тул is_hidden:false руу шилжvvлэх
--    update нь RLS-д чимээгvй хориглогддог байв). App.jsx талд аль хэдийн
--    (1) editorOnly vед insert дээр шууд is_hidden:false тавьдаг, (2) admin
--    "БАТЛАХ" vйлдэл дээр ч мөн адил is_hidden:false тавьдаг болгож зассан.
--    Энд нэмээд editor-т өөрийн "pending" бvлгээ update хийх эрх өгч, ирээдvйд
--    ижил төрлийн чимээгvй RLS-алдаа гарахаас урьдчилан сэргийлнэ.
-- ============================================================
drop policy if exists "chapters_update_editor_own_pending" on public.chapters;
create policy "chapters_update_editor_own_pending" on public.chapters for update
  using (
    public.has_any_role(auth.uid(), array['editor'])
    and status = 'pending'
  )
  with check (status = 'pending');

-- ============================================================
-- 🔴 CRITICAL 3) top_manga_cache — App.jsx (ЗАСВАР #159) энэ хvснэгтээс уншина
--    гэж бичсэн ч хvснэгт хаана ч vvсгэгдээгvй байсан (фантом оновчлол — сайт
--    query-ийн алдаагаар chalgvй RPC fallback руу орж ажилладаг байв).
-- ============================================================
create table if not exists public.top_manga_cache (
  rank int primary key,
  manga_id bigint not null references public.mangas(id) on delete cascade,
  refreshed_at timestamptz not null default now()
);
alter table public.top_manga_cache enable row level security;
drop policy if exists "top_manga_cache_select_all" on public.top_manga_cache;
create policy "top_manga_cache_select_all" on public.top_manga_cache for select using (true);

create or replace function public.refresh_top_manga_cache()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.top_manga_cache;
  insert into public.top_manga_cache (rank, manga_id)
  select row_number() over (order by count(*) desc), manga_id
  from public.manga_view_events
  where viewed_at > now() - interval '30 days'
  group by manga_id
  order by count(*) desc
  limit 10;
end;
$$;

-- Идэвхжvvлсний дараа (Database → Extensions → pg_cron) НЭГ УДАА:
-- select cron.schedule('refresh-top-manga-cache', '0 * * * *', $$select public.refresh_top_manga_cache()$$);

-- ============================================================
-- 🟠 HIGH 5) chapter_images_insert_staff — editor дурын (бусдын published)
--    бvлэгт зураг чихэж (vandalism) чадаж байсныг зөвхөн ӨӨРИЙН "pending"
--    бvлэгтээ хязгаарлав.
-- ============================================================
drop policy if exists "chapter_images_insert_staff" on public.chapter_images;
create policy "chapter_images_insert_staff" on public.chapter_images for insert
  with check (
    public.has_any_role(auth.uid(), array['admin','moderator'])
    or (
      public.has_any_role(auth.uid(), array['editor'])
      and exists (select 1 from public.chapters c where c.id = chapter_id and c.status = 'pending')
    )
  );

-- ============================================================
-- 🟠 HIGH 7) Ашиглагдахаа больсон Supabase Storage upload policy-ууд (upload
--    бvгд R2 руу шилжсэн, #94) — өмнө нь ямар ч нэвтэрсэн хэрэглэгч дурын нэр/
--    хэмжээгээр чөлөөтэй upload хийж чаддаг vнэгvй file-hosting цоорхой байв.
-- ============================================================
drop policy if exists "manga_site_avatar_upload" on storage.objects;
drop policy if exists "manga_site_staff_upload" on storage.objects;

-- ============================================================
-- 🟠 HIGH 8) purge_old_manga_view_events()-д authenticated grant шаардлагагvй
--    (pg_cron admin эрхээр дуудна).
-- ============================================================
revoke execute on function public.purge_old_manga_view_events() from authenticated, anon;

-- ============================================================
-- 🟡 MEDIUM 9) is_hidden/pending_delete-тэй бvлгийн МЕТАДАТА REST-ээр шууд
--    query хийвэл харагддаг байсныг хаав.
-- ============================================================
drop policy if exists "chapters_select" on public.chapters;
create policy "chapters_select" on public.chapters for select
  using (
    (status = 'published' and coalesce(is_hidden, false) = false and coalesce(pending_delete, false) = false)
    or public.has_any_role(auth.uid(), array['admin','moderator','editor'])
  );

-- ============================================================
-- 🟡 MEDIUM 10) viewer_key уртын хязгаар (хорлонтой клиент маш урт key
--    дамжуулж хvснэгт/индексийг бөглөхөөс сэргийлнэ).
-- ============================================================
alter table public.manga_view_events
  drop constraint if exists manga_view_events_viewer_key_check;
alter table public.manga_view_events
  add constraint manga_view_events_viewer_key_check check (char_length(viewer_key) <= 64);

create or replace function public.increment_manga_views(input_id bigint, viewer_key text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_key text;
  recent_count int;
begin
  effective_key := coalesce(auth.uid()::text, left(nullif(trim(viewer_key), ''), 64));
  if effective_key is null then
    return;
  end if;

  select count(*) into recent_count
  from public.manga_view_events e
  where e.manga_id = input_id
    and e.viewer_key = effective_key
    and e.viewed_at > now() - interval '30 minutes';

  if recent_count > 0 then
    return;
  end if;

  update public.mangas set views = views + 1 where id = input_id;
  insert into public.manga_view_events (manga_id, viewer_key) values (input_id, effective_key);
end;
$$;

-- ============================================================
-- 🟡 MEDIUM 16) Хуудасны дараалал солих RPC — 2N дараалсан HTTP update-ыг
--    НЭГ transaction-той RPC болгов (сvлжээ дундаа тасрахад дараалал
--    хагас эвдэрч vлдэх эрсдэлийг арилгана).
-- ============================================================
create or replace function public.reorder_chapter_images(chapter_id_in bigint, image_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
begin
  if not public.has_any_role(auth.uid(), array['admin','moderator','editor']) then
    raise exception 'Зөвхөн staff энэ vйлдлийг хийж болно';
  end if;
  if exists (
    select 1 from unnest(image_ids) as iid
    where not exists (select 1 from public.chapter_images ci where ci.id = iid and ci.chapter_id = chapter_id_in)
  ) then
    raise exception 'Зарим зураг энэ бvлэгт харьяалагдахгvй байна';
  end if;

  for i in 1 .. coalesce(array_length(image_ids, 1), 0) loop
    update public.chapter_images set page_number = -i where id = image_ids[i];
  end loop;
  for i in 1 .. coalesce(array_length(image_ids, 1), 0) loop
    update public.chapter_images set page_number = i where id = image_ids[i];
  end loop;
end;
$$;

grant execute on function public.reorder_chapter_images(bigint, bigint[]) to authenticated;
