-- ЗАСВАР #113: "Юу уншихаа мэдэхгvй vv?" - TikTok маягийн reel feed.
-- Зөвхөн admin/moderator reel нэмнэ (upload-to-r2 edge function талд ч
-- MODERATOR_ONLY_PREFIXES-ээр хамгаалагдсан), бvх хэрэглэгч vзэж, лайк дарж болно.
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

create table if not exists public.reels (
  id bigint generated always as identity primary key,
  manga_id bigint not null references public.mangas(id) on delete cascade,
  video_url text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.reels enable row level security;

drop policy if exists "reels_select_all" on public.reels;
create policy "reels_select_all" on public.reels for select using (true);

drop policy if exists "reels_moderator_write" on public.reels;
create policy "reels_moderator_write" on public.reels for all
  using (exists (
    select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator']
  ))
  with check (exists (
    select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator']
  ));

create table if not exists public.reel_likes (
  reel_id bigint not null references public.reels(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);

alter table public.reel_likes enable row level security;

drop policy if exists "reel_likes_select_all" on public.reel_likes;
create policy "reel_likes_select_all" on public.reel_likes for select using (true);

drop policy if exists "reel_likes_own" on public.reel_likes;
create policy "reel_likes_own" on public.reel_likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
