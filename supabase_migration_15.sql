-- ЗАСВАР #127: admin/moderator/editor эрхтэй хэрэглэгч 3 биш 6 хvртэл стикер
-- хадгалж болохоор sticker_4/5/6 баганыг нэмэв (App.jsx-ийн stickerSlots
-- isStaff vед [1..6], бусад vед [1..3] ашиглана). Supabase Dashboard →
-- SQL Editor-т ГАРААР ажиллуулна уу.

alter table public.users add column if not exists sticker_4 text;
alter table public.users add column if not exists sticker_5 text;
alter table public.users add column if not exists sticker_6 text;
