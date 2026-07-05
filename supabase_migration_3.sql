-- ЗАСВАР #3: Жинхэнэ олон-role дэмжлэг (multi-role).
--
-- Юу болсон бэ: өмнө нь users.role нэг л утгатай текст багана байсан
-- (жишээ нь зөвхөн 'admin' ЭСВЭЛ 'moderator', хоёуланг нь зэрэг байлгах
-- боломжгүй). Танд "admin болон vip-ийг зэрэг өгөхөд admin цэс алга
-- болчихлоо" гэсэн алдаа гарсан нь яг үүнээс шалтгаалсан — SQL Editor-оос
-- role баганад хэдэн утга зэрэг оруулах гэж оролдоход (жишээ нь "admin,vip"
-- гэх мэт) энэ нь ганц ТЭНЦҮҮ утгатай харьцуулагддаг тул аль нь ч биш болж,
-- isStaff шалгалт бүрмөсөн худал (false) гарч, admin цэс алга болдог байсан.
--
-- Одооноос role-ийн ОРОНД roles (массив) багана ашиглана. admin/moderator/
-- editor-ийг ХАМТАД нь (жишээ нь moderator+editor) чөлөөтэй олгож болно.
-- VIP хэвээрээ тусдаа (is_vip + vip_expires_at) — үүнийг өөрчлөөгүй.
--
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

-- ============================================================
-- 1) roles багана нэмэх + хуучин role-оос шилжүүлэх (migrate)
-- ============================================================
alter table public.users add column if not exists roles text[] not null default '{}';

update public.users
set roles = array[role]
where role in ('admin', 'moderator', 'editor') and roles = '{}';

-- ============================================================
-- 2) role escalation хамгаалалтыг roles массивт тааруулах
-- ============================================================
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.roles is distinct from old.roles then
    if auth.uid() is not null and not exists (
      select 1 from public.users u where u.id = auth.uid() and 'admin' = any(u.roles)
    ) then
      new.roles := old.roles;
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- 3) RLS policy-үүдийг roles массив ашигладаг болгож дахин үүсгэнэ
-- ============================================================
drop policy if exists "users_update_by_admin" on public.users;
create policy "users_update_by_admin" on public.users for update
  using (exists (select 1 from public.users u where u.id = auth.uid() and 'admin' = any(u.roles)))
  with check (true);

drop policy if exists "mangas_select" on public.mangas;
create policy "mangas_select" on public.mangas for select
  using (
    coalesce(is_hidden, false) = false
    or exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator','editor'])
  );

drop policy if exists "mangas_insert_staff" on public.mangas;
create policy "mangas_insert_staff" on public.mangas for insert
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator','editor']));

drop policy if exists "mangas_update_staff" on public.mangas;
create policy "mangas_update_staff" on public.mangas for update
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator','editor']));

drop policy if exists "chapters_select" on public.chapters;
create policy "chapters_select" on public.chapters for select
  using (
    status = 'published'
    or exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator','editor'])
  );

drop policy if exists "chapters_insert_staff" on public.chapters;
create policy "chapters_insert_staff" on public.chapters for insert
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator','editor']));

drop policy if exists "chapters_update_moderate" on public.chapters;
create policy "chapters_update_moderate" on public.chapters for update
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator']));

drop policy if exists "chapter_images_select" on public.chapter_images;
create policy "chapter_images_select" on public.chapter_images for select
  using (
    exists (
      select 1 from public.chapters c
      where c.id = chapter_id
        and (c.status = 'published' or exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator','editor']))
    )
  );

drop policy if exists "chapter_images_insert_staff" on public.chapter_images;
create policy "chapter_images_insert_staff" on public.chapter_images for insert
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator','editor']));

drop policy if exists "comments_delete_own_or_mod" on public.comments;
create policy "comments_delete_own_or_mod" on public.comments for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator'])
  );

drop policy if exists "reports_select_mod" on public.reports;
create policy "reports_select_mod" on public.reports for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator']));

drop policy if exists "reports_update_mod" on public.reports;
create policy "reports_update_mod" on public.reports for update
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator']));

drop policy if exists "manga_site_staff_upload" on storage.objects;
create policy "manga_site_staff_upload" on storage.objects for insert
  with check (
    bucket_id = 'manga-site'
    and (storage.foldername(name))[1] in ('posters', 'banners', 'chapters')
    and exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator','editor'])
  );

-- Анхны admin-аа гараар тохируулна уу (өөрийн имэйлээр солино):
-- update public.users set roles = array['admin'] where email = 'ТАНЫ_ИМЭЙЛ@жишээ.com';
