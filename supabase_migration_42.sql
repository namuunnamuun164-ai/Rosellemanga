-- ШИНЭ (хэрэглэгчийн хvсэлт): Хувийн зурвасын системийг vргэлжлvvлэн
-- сайжруулав — хvн блоклох, харилцаа устгах, бие биедээ цэцэг/VIP бэлэглэх.

-- 1) blocked_users -----------------------------------------------------------
create table if not exists public.blocked_users (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

alter table public.blocked_users
  drop constraint if exists blocked_users_not_self;
alter table public.blocked_users
  add constraint blocked_users_not_self check (blocker_id <> blocked_id);

alter table public.blocked_users enable row level security;

drop policy if exists "blocked_users_select_own" on public.blocked_users;
create policy "blocked_users_select_own" on public.blocked_users for select
  using (auth.uid() = blocker_id);

drop policy if exists "blocked_users_insert_own" on public.blocked_users;
create policy "blocked_users_insert_own" on public.blocked_users for insert
  with check (auth.uid() = blocker_id);

drop policy if exists "blocked_users_delete_own" on public.blocked_users;
create policy "blocked_users_delete_own" on public.blocked_users for delete
  using (auth.uid() = blocker_id);

-- 2) direct_messages-д "бэлэг" төрлvvд + харилцаа устгах эрх нэмнэ -----------
alter table public.direct_messages
  drop constraint if exists direct_messages_type_check;
alter table public.direct_messages
  add constraint direct_messages_type_check check (message_type in ('text', 'sticker', 'manga_share', 'gift_flowers', 'gift_vip'));

alter table public.direct_messages add column if not exists gift_amount int;

-- ЗАСВАР: хэрэглэгч хоорондоо бvтэн харилцаагаа (хоёр талдаа) устгаж болно.
drop policy if exists "direct_messages_delete_participant" on public.direct_messages;
create policy "direct_messages_delete_participant" on public.direct_messages for delete
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- ЗАСВАР: блоклосон хvмvvсийн хооронд шинэ мессеж (текст ч, бэлэг ч)
-- бичигдэхгvй байхаар шалгалтыг нэмж, function-ыг дахин тодорхойлно.
create or replace function public.validate_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id = new.recipient_id then
    raise exception 'cannot_message_self';
  end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = new.sender_id and b.blocked_id = new.recipient_id)
       or (b.blocker_id = new.recipient_id and b.blocked_id = new.sender_id)
  ) then
    raise exception 'blocked';
  end if;
  if new.message_type = 'text' and (new.content is null or length(trim(new.content)) = 0) then
    raise exception 'empty_message';
  end if;
  if new.message_type = 'sticker' and new.sticker_url is null then
    raise exception 'missing_sticker';
  end if;
  if new.message_type = 'manga_share' and new.manga_id is null then
    raise exception 'missing_manga';
  end if;
  if new.reply_to_id is not null and not exists (
    select 1 from public.direct_messages dm
    where dm.id = new.reply_to_id
      and ((dm.sender_id = new.sender_id and dm.recipient_id = new.recipient_id)
        or (dm.sender_id = new.recipient_id and dm.recipient_id = new.sender_id))
  ) then
    raise exception 'invalid_reply';
  end if;
  return new;
end;
$$;

-- 3) цэцэг бэлэглэх -----------------------------------------------------------
create or replace function public.gift_flowers(recipient_id_in uuid, amount_in int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if amount_in is null or amount_in <= 0 then
    raise exception 'invalid_amount';
  end if;
  if recipient_id_in = auth.uid() then
    raise exception 'cannot_gift_self';
  end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = auth.uid() and b.blocked_id = recipient_id_in)
       or (b.blocker_id = recipient_id_in and b.blocked_id = auth.uid())
  ) then
    raise exception 'blocked';
  end if;
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.flower_balance >= amount_in) then
    raise exception 'not_enough_flowers';
  end if;

  update public.users set flower_balance = flower_balance - amount_in where id = auth.uid();
  update public.users set flower_balance = flower_balance + amount_in where id = recipient_id_in;

  insert into public.direct_messages (sender_id, recipient_id, message_type, gift_amount)
    values (auth.uid(), recipient_id_in, 'gift_flowers', amount_in);
end;
$$;

grant execute on function public.gift_flowers(uuid, int) to authenticated;

-- 4) VIP бэлэглэх (өөрийн "од"-оор, 5000 од = 1 сарын VIP найздаа) ------------
create or replace function public.gift_vip_with_points(recipient_id_in uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  needed constant int := 5000;
  gift_days constant int := 30;
  base timestamptz;
begin
  if recipient_id_in = auth.uid() then
    raise exception 'cannot_gift_self';
  end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = auth.uid() and b.blocked_id = recipient_id_in)
       or (b.blocker_id = recipient_id_in and b.blocked_id = auth.uid())
  ) then
    raise exception 'blocked';
  end if;
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.loyalty_points >= needed) then
    raise exception 'not_enough_points';
  end if;

  select case
           when u.is_vip and u.vip_expires_at is not null and u.vip_expires_at > now()
           then u.vip_expires_at
           else now()
         end
    into base
    from public.users u where u.id = recipient_id_in;

  update public.users set loyalty_points = loyalty_points - needed where id = auth.uid();
  update public.users
    set is_vip = true, vip_expires_at = base + (gift_days || ' days')::interval
    where id = recipient_id_in;

  insert into public.direct_messages (sender_id, recipient_id, message_type, gift_amount)
    values (auth.uid(), recipient_id_in, 'gift_vip', gift_days);
end;
$$;

grant execute on function public.gift_vip_with_points(uuid) to authenticated;

-- 5) шинэ зурвас хайхад аль хэдийн блоклосон/блоклогдсон хvнийг харуулахгvй --
create or replace function public.search_users(query_in text)
returns table(id uuid, name text, avatar_url text)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.name, u.avatar_url
  from public.users u
  where u.id <> auth.uid()
    and u.name is not null
    and u.name ilike '%' || query_in || '%'
    and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = auth.uid() and b.blocked_id = u.id)
         or (b.blocker_id = u.id and b.blocked_id = auth.uid())
    )
  order by u.name
  limit 10;
$$;
