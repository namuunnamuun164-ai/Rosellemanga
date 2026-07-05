-- ЗАСВАР #10: Хэрэглэгч профайлдаа 3 хvртэлх "стикер" (өөрийн зураг) хадгалж,
-- тэдгээрийг сэтгэгдэл бичихдээ ашиглаж болох боломж нэмэв.
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

alter table public.users add column if not exists sticker_1 text;
alter table public.users add column if not exists sticker_2 text;
alter table public.users add column if not exists sticker_3 text;

alter table public.comments add column if not exists sticker_url text;
