-- ШИНЭ (хэрэглэгчийн хvсэлт): admin "БАТЛАХ" дарж VIP хvсэлтийг зөвшөөрөхөд,
-- багцаас хамааран ХОЁР тvр vзvvлэлт давхар нэмэгдэнэ — эдгээр нь хоорондоо
-- ХОЛБООГvй, тусдаа 2 систем:
--   1) "цэцэг" (💐 flower_balance) — даалгавартай ижил, ГАНЦ VIP бvлгийг 3
--      хоногийн турш нээхэд зарцуулна: 1 сар→3, 3 сар→10, 6 сар→30 цэцэг.
--   2) "оноо" (loyalty_points) — VIP худалдан авалт бvрт цугладаг, 5000
--      онооноос дээш болмогц дахин VIP-г мөнгvйгээр (оноогоор) солиход
--      ашиглана: 1 сар→500, 3 сар→2000, 6 сар→5000 оноо.

alter table public.users add column if not exists loyalty_points integer not null default 0;
alter table public.users
  drop constraint if exists users_loyalty_points_check;
alter table public.users
  add constraint users_loyalty_points_check check (loyalty_points >= 0);

create or replace function public.approve_payment_request(request_id bigint, vip_days int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
  base timestamptz;
  bonus_flowers int;
  bonus_points int;
begin
  if not public.has_any_role(auth.uid(), array['admin']) then
    raise exception 'Зөвхөн admin батлах эрхтэй';
  end if;

  select * into req from public.payment_requests where id = request_id for update;
  if req is null then
    raise exception 'Хvсэлт олдсонгvй';
  end if;
  if req.status <> 'pending' then
    raise exception 'Энэ хvсэлт аль хэдийн шийдэгдсэн байна';
  end if;

  select case
           when u.is_vip and u.vip_expires_at is not null and u.vip_expires_at > now()
           then u.vip_expires_at
           else now()
         end
    into base
    from public.users u where u.id = req.user_id;

  -- ЗАСВАР: багцын key (1sar/3sar/6sar)-аас хамааран бонус цэцэг/оноог тодорхойлно.
  bonus_flowers := case req.plan_key
    when '1sar' then 3
    when '3sar' then 10
    when '6sar' then 30
    else 0
  end;
  bonus_points := case req.plan_key
    when '1sar' then 500
    when '3sar' then 2000
    when '6sar' then 5000
    else 0
  end;

  update public.users
    set is_vip = true, vip_expires_at = base + (vip_days || ' days')::interval,
        flower_balance = flower_balance + bonus_flowers,
        loyalty_points = loyalty_points + bonus_points
    where id = req.user_id;

  update public.payment_requests
    set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
    where id = request_id;
end;
$$;

grant execute on function public.approve_payment_request(bigint, int) to authenticated;
