-- ЗАСВАР #9: "Хадгалсан манга" (library), "Түүх" (history), "Уншсан бүлэг"
-- (read chapters) мэдээллийг browser-ийн localStorage-с Supabase руу шилжүүлэв.
-- Ингэснээр төхөөрөмж солиход ч мэдээлэл алдагдахгүй, олон төхөөрөмж дээр синк болно.
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

create table if not exists public.user_library (
  user_id uuid not null references public.users(id) on delete cascade,
  manga_id bigint not null references public.mangas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, manga_id)
);

create table if not exists public.reading_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  manga_id bigint not null references public.mangas(id) on delete cascade,
  last_chapter numeric not null,
  read_chapters numeric[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, manga_id)
);

alter table public.user_library enable row level security;
alter table public.reading_progress enable row level security;

drop policy if exists "user_library_own" on public.user_library;
create policy "user_library_own" on public.user_library for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "reading_progress_own" on public.reading_progress;
create policy "reading_progress_own" on public.reading_progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
