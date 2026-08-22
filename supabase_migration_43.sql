-- ШИНЭ (хэрэглэгчийн хvсэлт): "Нийтийн чат" (одоо "Roselle уншигчид" нэртэй)-ээс
-- гадна, зөвхөн editor/moderator/admin эрхтэй хvмvvст л харагдах тусдаа
-- "Админуудын чат" өрөө нэмнэ — хоёулаа НЭГ chat_messages хvснэгтийг room
-- баганаар ялгаж ашиглана.

alter table public.chat_messages add column if not exists room text not null default 'public';

alter table public.chat_messages
  drop constraint if exists chat_messages_room_check;
alter table public.chat_messages
  add constraint chat_messages_room_check check (room in ('public', 'staff'));

-- ЗАСВАР: "public" өрөөг хэн ч (нэвтэрсэн бол) уншиж болно, "staff" өрөөг
-- зөвхөн editor/moderator/admin эрхтэй хvн уншина.
drop policy if exists "chat_messages_select_authenticated" on public.chat_messages;
create policy "chat_messages_select_public_or_staff" on public.chat_messages for select
  using (
    room = 'public'
    or (room = 'staff' and public.has_any_role(auth.uid(), array['admin','moderator','editor']))
  );

-- ЗАСВАР: "public" өрөөнд хэн ч бичиж болно, "staff" өрөөнд зөвхөн staff эрхтэй бичнэ.
drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own_room_checked" on public.chat_messages for insert
  with check (
    auth.uid() = user_id
    and (room = 'public' or (room = 'staff' and public.has_any_role(auth.uid(), array['admin','moderator','editor'])))
  );

create index if not exists chat_messages_room_created_idx on public.chat_messages (room, created_at desc);
