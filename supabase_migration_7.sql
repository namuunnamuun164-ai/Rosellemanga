-- ЗАСВАР #7: Нүүр хэсгийн "Санал болгох" hero-г admin-ийн гараар сонгодог болгох
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

alter table public.mangas add column if not exists is_recommended boolean not null default false;
