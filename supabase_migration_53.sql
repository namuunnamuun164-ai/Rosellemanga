-- ШИНЭ (хэрэглэгчийн хvсэлт): группд ("Roselle уншигчид" болон "Админуудын
-- чат") ч хувийн зурвас (DM)-тэй адил тодорхой мессежид ❤️ дарах, "Хариулах"
-- (reply) хийх боломжтой болгов.

alter table public.chat_messages add column if not exists reply_to_id bigint references public.chat_messages(id) on delete set null;

create table if not exists public.chat_message_likes (
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.chat_message_likes enable row level security;

-- ЗАСВАР: like-ыг зөвхөн тухайн мессежийг унших эрхтэй хvн л харах/дарах ёстой
-- (staff өрөөний мессежийг унших эрхгvй хvн уг өрөөний мессежид like ч
-- хийж/харж чадахгvй байх ёстой тул chat_messages-ийн room-той адил дvрмийг
-- давтав).
drop policy if exists "chat_message_likes_select_readable" on public.chat_message_likes;
create policy "chat_message_likes_select_readable" on public.chat_message_likes for select
  using (
    exists (
      select 1 from public.chat_messages cm
      where cm.id = chat_message_likes.message_id
        and (cm.room = 'public' or (cm.room = 'staff' and public.has_any_role(auth.uid(), array['admin','moderator','editor'])))
    )
  );

drop policy if exists "chat_message_likes_insert_own" on public.chat_message_likes;
create policy "chat_message_likes_insert_own" on public.chat_message_likes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.chat_messages cm
      where cm.id = chat_message_likes.message_id
        and (cm.room = 'public' or (cm.room = 'staff' and public.has_any_role(auth.uid(), array['admin','moderator','editor'])))
    )
  );

drop policy if exists "chat_message_likes_delete_own" on public.chat_message_likes;
create policy "chat_message_likes_delete_own" on public.chat_message_likes for delete
  using (auth.uid() = user_id);

create index if not exists chat_message_likes_message_idx on public.chat_message_likes (message_id);
