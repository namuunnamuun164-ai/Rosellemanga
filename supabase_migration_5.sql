-- ЗАСВАР #5: 1-3 төрөл зэрэг сонгох (genres) + бүлгийн дурын тэмдэглэгээ (label)
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

-- 1) Манга 1-3 төрөлтэй байж болно (хуучин ганц genre баганаас автоматаар шилжинэ)
alter table public.mangas add column if not exists genres text[] not null default '{}';
update public.mangas set genres = array[genre] where genre is not null and genres = '{}';

-- 2) Бүлэгт "ҮНЭГҮЙ"/"VIP" бэлгэдлийн оронд admin-ийн бичдэг дурын тэмдэглэгээ (жишээ нь S1 END)
alter table public.chapters add column if not exists label text;
