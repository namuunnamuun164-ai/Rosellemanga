-- ЗАСВАР #132: ЯАРАЛТАЙ HOTFIX — migration_14-д нэмсэн users_select_own_or_staff
-- policy өөрөө "public.users" хvснэгт рvv (exists select ... from public.users)
-- шалгалт хийдэг байсан тул Postgres "infinite recursion detected in policy
-- for relation users" (42P17) алдаа өгч эхэлсэн — учир нь users-ийн SELECT
-- policy-г тооцоолохын тулд ДАХИН users-ийн SELECT policy-г тооцоолох шаардлагатай
-- болж, төгсгөлгvй давталтад орсон. mangas/chapters зэрэг БУСАД бvх хvснэгтийн
-- policy ч "exists (select ... from public.users)" ашигладаг тул энэ нэг
-- алдаанаас болж САЙТ ДЭЭРХ БVХ ӨГӨГДӨЛ (манга, бvлэг гэх мэт) харагдахаа больсон.
--
-- ШИЙДЭЛ: "энэ хэрэглэгч staff/admin мөн vv" гэдгийг шалгах логикийг security
-- definer функц рvv гаргав — ийм функц дуудагдахдаа RLS-г тойрдог (өмнө нь
-- increment_manga_views/get_public_profiles-д хэрэглэсэнтэй адил, аль хэдийн
-- турших баталгаажсан арга) тул users-ийн SELECT policy дахин өөрийгөө
-- дуудахгvй, давталт тасална. Supabase Dashboard → SQL Editor-т ЯАРАЛТАЙ
-- ГАРААР ажиллуулна уу.

create or replace function public.has_any_role(uid uuid, wanted text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users u where u.id = uid and u.roles && wanted
  );
$$;

grant execute on function public.has_any_role(uuid, text[]) to anon, authenticated;

drop policy if exists "users_select_own_or_staff" on public.users;
create policy "users_select_own_or_staff" on public.users for select
  using (
    auth.uid() = id
    or public.has_any_role(auth.uid(), array['admin','moderator','editor'])
  );

-- ЗАСВАР #132: users_update_by_admin (анхны setup.sql-с) ч адилхан recursion-той
-- байсан (яг адил хэлбэрийн raw subquery) тул мөн адил функцээр солив.
drop policy if exists "users_update_by_admin" on public.users;
create policy "users_update_by_admin" on public.users for update
  using (public.has_any_role(auth.uid(), array['admin']))
  with check (true);
