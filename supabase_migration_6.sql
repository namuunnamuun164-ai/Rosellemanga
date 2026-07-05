-- ЗАСВАР #6: Манга хуудсанд admin бичдэг тэмдэглэлийн хэсэг
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

alter table public.mangas add column if not exists admin_note text;
