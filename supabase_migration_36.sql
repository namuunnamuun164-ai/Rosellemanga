-- ЗАСВАР (дизайн сайжруулалт #11): сэтгэгдлийн жагсаалтад VIP хэрэглэгчийн
-- avatar-д алт цагираг vзvvлэхийн тулд get_public_profiles-т идэвхтэй VIP
-- эсэхийг (дуусах хугацааг нь тооцоод) нэмж буцаана.

-- Postgres нь CREATE OR REPLACE-ээр буцаах багана нэмэхийг зөвшөөрдөггvй
-- ("cannot change return type") тул эхлээд хуучныг устгана.
drop function if exists public.get_public_profiles(uuid[]);

create or replace function public.get_public_profiles(user_ids uuid[])
returns table(id uuid, name text, avatar_url text, roles text[], is_vip boolean)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.name, u.avatar_url, u.roles,
         (u.is_vip and (u.vip_expires_at is null or u.vip_expires_at > now())) as is_vip
  from public.users u
  where u.id = any(user_ids);
$$;

grant execute on function public.get_public_profiles(uuid[]) to anon, authenticated;
