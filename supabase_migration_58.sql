-- ЗАСВАР (хэрэглэгчийн хvсэлт): "vнэгvй цэцэг бэлэглэх" (admin/moderator/
-- editor) функцийг DM-ийн жижиг checkbox-оос гаргаж, тусдаа хуудас болгосонтой
-- холбогдуулан:
--   1) Сарын хязгаарыг 30 → 10 болгов.
--   2) Заавал биш "мессеж" талбар нэмж, өгсөн бол хvлээн авагчийн DM-д
--      харагдана (энгийн gift_flowers RPC direct_messages мөр vvсгэдэгтэй адил
--      загвар — өмнө нь эндvv дутуу байсан тул хvлээн авагч мэдэгддэггvй байв).
--   3) Хvлээн авагч ӨӨРИЙН ирсэн staff_flower_gifts мөрvvдээ уншиж (мэдэгдлийн
--      хонхонд харуулахын тулд) чадахаар RLS select policy-г өргөтгөв — өмнө
--      нь зөвхөн илгээгч (staff) болон admin л уншиж чаддаг байв.

drop policy if exists "staff_flower_gifts_select_own" on public.staff_flower_gifts;
create policy "staff_flower_gifts_select_own" on public.staff_flower_gifts for select
  using (auth.uid() = staff_id or auth.uid() = recipient_id or public.has_any_role(auth.uid(), array['admin']));

drop function if exists public.gift_flowers_as_staff(uuid, int);

create or replace function public.gift_flowers_as_staff(recipient_id_in uuid, amount_in int, message_in text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'moderator', 'editor']) then
    raise exception 'not_staff';
  end if;
  if amount_in is null or amount_in <= 0 then
    raise exception 'invalid_amount';
  end if;
  if recipient_id_in = auth.uid() then
    raise exception 'cannot_gift_self';
  end if;
  if exists (
    select 1 from public.blocked_users
    where (blocker_id = recipient_id_in and blocked_id = auth.uid())
       or (blocker_id = auth.uid() and blocked_id = recipient_id_in)
  ) then
    raise exception 'blocked';
  end if;

  select coalesce(sum(amount), 0) into used from public.staff_flower_gifts
    where staff_id = auth.uid() and created_at >= date_trunc('month', now());
  if used + amount_in > 10 then
    raise exception 'quota_exceeded';
  end if;

  update public.users set flower_balance = flower_balance + amount_in where id = recipient_id_in;
  insert into public.staff_flower_gifts (staff_id, recipient_id, amount) values (auth.uid(), recipient_id_in, amount_in);
  -- ЗАСВАР: хvлээн авагч DM-даа "цэцэг бэлэглэлээ" гэсэн мэдэгдэл (мессежтэй
  -- бол хамт) харна — энгийн gift_flowers RPC-тэй ижил загвар.
  insert into public.direct_messages (sender_id, recipient_id, message_type, gift_amount, message)
    values (auth.uid(), recipient_id_in, 'gift_flowers', amount_in, nullif(trim(message_in), ''));
end;
$$;

grant execute on function public.gift_flowers_as_staff(uuid, int, text) to authenticated;

create or replace function public.get_staff_gift_quota_remaining()
returns int
language sql
security definer
set search_path = public
stable
as $$
  select greatest(0, 10 - coalesce((
    select sum(amount) from public.staff_flower_gifts
    where staff_id = auth.uid() and created_at >= date_trunc('month', now())
  ), 0));
$$;

grant execute on function public.get_staff_gift_quota_remaining() to authenticated;
