-- ЗАСВАР #133: Аюулгvй байдлын шалгалтаар илэрсэн CRITICAL цоорхойг (Issue #1)
-- засав — admin "ЭРХ ОЛГОХ" / "VIP ОЛГОХ" vйлдлvvд хэрэглэгчийг ХАЙХДАА
-- public.users.email баганаар хайдаг байсан. Энэ багана НЭГ Ч ХЯЗГААРЛАЛТГvй
-- users_update_own policy-оор хэн ч (өөрийн мөрөнд) дурын утга руу солиж болдог
-- байсан тул халдагч өөрийн email-ээ бай (victim) хvний имэйл рvv солиод,
-- admin тэр имэйлээр эрх/VIP олгохыг хvлээж, бодит эзнийх нь оронд ӨӨРТӨӨ
-- эрх/VIP авах боломжтой байсан. Supabase Dashboard → SQL Editor-т ГАРААР
-- ажиллуулна уу.
--
-- ШИЙДЭЛ (2 давхар хамгаалалт):
--   1) Хайлтыг public.users.email (итгэмжлэгдэхгvй) БИШ, auth.users.email
--      (зөвхөн Supabase Auth-ийн баталгаажуулсан имэйл-солих vрдэвчээр л
--      өөрчлөгддөг, жинхэнэ эх сурвалж) дээр vндэслэсэн security definer
--      функцээр хийдэг болгов.
--   2) Root cause-ыг нь ч хаах vvднээс public.users.email-г ч мөн adati
--      roles/is_vip-той адил trigger-ээр хамгаалж, энгийн хэрэглэгч өөрийн
--      мөрөн дэх email-ээ өөрчилж чадахгvй болгов (апп-д vvнийг өөрчлөх UI
--      vйлдвэрлэлийн урсгал байхгvй тул функционал алдагдахгvй).

-- 1) public.users.email-г roles/is_vip/vip_expires_at-той адил хамгаална
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.roles is distinct from old.roles
     or new.is_vip is distinct from old.is_vip
     or new.vip_expires_at is distinct from old.vip_expires_at
     or new.email is distinct from old.email then
    if auth.uid() is not null and not exists (
      select 1 from public.users u where u.id = auth.uid() and 'admin' = any(u.roles)
    ) then
      new.roles := old.roles;
      new.is_vip := old.is_vip;
      new.vip_expires_at := old.vip_expires_at;
      new.email := old.email;
    end if;
  end if;
  return new;
end;
$$;

-- 2) admin-ийн "ЭРХ ОЛГОХ"/"VIP ОЛГОХ"-д ашиглах, auth.users (жинхэнэ,
--    баталгаажсан имэйл)-ээр хайдаг, зөвхөн admin дуудаж болох функц.
create or replace function public.admin_lookup_user_by_email(lookup_email text)
returns table(id uuid, email text, is_vip boolean, vip_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_any_role(auth.uid(), array['admin']) then
    raise exception 'Зөвхөн admin энэ vйлдлийг хийж болно.';
  end if;
  return query
    select u.id, au.email::text, u.is_vip, u.vip_expires_at
    from auth.users au
    join public.users u on u.id = au.id
    where lower(au.email) = lower(trim(lookup_email))
    limit 1;
end;
$$;

grant execute on function public.admin_lookup_user_by_email(text) to authenticated;
