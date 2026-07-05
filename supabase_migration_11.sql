-- ЗАСВАР #11: Манга дэлгэрэнгүй хуудсанд (1) уншигчдын 1-10 үнэлгээ, (2) манганы
-- тухай ерөнхий сэтгэгдлийн хэсэг (бүлгийн сэтгэгдлээс тусдаа) нэмэв.
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

create table if not exists public.manga_ratings (
  user_id uuid not null references public.users(id) on delete cascade,
  manga_id bigint not null references public.mangas(id) on delete cascade,
  score smallint not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, manga_id)
);

alter table public.manga_ratings enable row level security;

drop policy if exists "manga_ratings_select_all" on public.manga_ratings;
create policy "manga_ratings_select_all" on public.manga_ratings for select using (true);

drop policy if exists "manga_ratings_own" on public.manga_ratings;
create policy "manga_ratings_own" on public.manga_ratings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- comments хvснэгтэд манганы ерөнхий сэтгэгдэл (chapter-гvй) бичих боломж нэмэв
alter table public.comments alter column chapter_id drop not null;
alter table public.comments add column if not exists manga_id bigint references public.mangas(id) on delete cascade;
