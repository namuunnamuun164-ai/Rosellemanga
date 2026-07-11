-- ЗАСВАР #163 (код шинжилгээ): төлбөр батлах vйлдлийг аюулгvй болгов.
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.
--
-- Юуг засав:
--   1) payment_requests-д "paid_price" багана нэмэв — хямдралын vед хvсэлт
--      илгээхэд хэдэн төгрөгөөр төлөхийг хvлээж байсныг тvvхэнд хадгална
--      (өмнө нь batldsan vнэ хямдралтай vе өнгөрсний дараа мэдэгдэхгvй болдог байсан).
--   2) approve_payment_request() нэртэй security definer RPC vvсгэв — "VIP олгох"
--      болон "хvсэлтийг approved болгох" 2 салангид update-ийг НЭГ transaction
--      дотор, мөр түгжиж (for update) хийдэг болгосон. Өмнө нь эдгээр 2 update
--      тусдаа явж байсан тул эхнийх нь амжилттай, хоёр дахь нь fail болвол
--      хvсэлт "pending" хэвээр vлдэж, admin дахин "БАТЛАХ" дарахад VIP
--      ДАВХАР нэмэгддэг эрсдэлтэй байсан.

-- 1) Тухайн vеийн vнийг тvvхэнд хадгалах багана
alter table public.payment_requests add column if not exists paid_price text;

-- 2) Хvсэлт батлах атомар (transaction-той) RPC
create or replace function public.approve_payment_request(request_id bigint, vip_days int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
  base timestamptz;
begin
  if not exists (select 1 from public.users u where u.id = auth.uid() and 'admin' = any(u.roles)) then
    raise exception 'Зөвхөн admin батлах эрхтэй';
  end if;

  -- ЗАСВАР #163: мөрийг түгжиж, давхар дарахад (эсвэл 2 admin зэрэг дарахад)
  -- аль хэдийн шийдэгдсэн хvсэлтийг дахин баталж VIP давхар олгохоос сэргийлнэ.
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

  update public.users
    set is_vip = true, vip_expires_at = base + (vip_days || ' days')::interval
    where id = req.user_id;

  update public.payment_requests
    set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
    where id = request_id;
end;
$$;

grant execute on function public.approve_payment_request(bigint, int) to authenticated;

-- 3) comments_insert_own RLS policy-ийн дэд query-д ашиглагдах индекс
--    (rate-limit шалгалт: user_id + created_at-аар тухайн хэрэглэгчийн сvvлийн
--    сэтгэгдлvvдийг хайдаг тул сэтгэгдэл олон мянга болоход seq scan удаашрана)
create index if not exists comments_user_recent_idx
  on public.comments (user_id, created_at desc);
