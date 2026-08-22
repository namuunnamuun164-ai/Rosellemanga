-- ШИНЭ (хэрэглэгчийн хvсэлт): "оноо" (loyalty_points) 5000-д хvрвэл, admin-ий
-- баталгаажуулалт шаардахгvйгээр хэрэглэгч мөнгvйгээр VIP-г онооноороо солино.
-- АНХААР: 5000 оноог хэдэн хоногийн VIP-тэй тэнцvvлэхийг тодорхой заагаагvй
-- байсан тул анхны утгаар "1 сар (30 хоног)" гэж тохируулав — өөр байх ёстой
-- бол зvгээр vvнийг хэлээрэй, амархан өөрчилье.

create or replace function public.redeem_points_for_vip()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  needed constant int := 5000;
  reward_days constant int := 30;
  base timestamptz;
begin
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.loyalty_points >= needed) then
    raise exception 'not_enough_points';
  end if;

  select case
           when u.is_vip and u.vip_expires_at is not null and u.vip_expires_at > now()
           then u.vip_expires_at
           else now()
         end
    into base
    from public.users u where u.id = auth.uid();

  update public.users
    set loyalty_points = loyalty_points - needed,
        is_vip = true, vip_expires_at = base + (reward_days || ' days')::interval
    where id = auth.uid();
end;
$$;

grant execute on function public.redeem_points_for_vip() to authenticated;
