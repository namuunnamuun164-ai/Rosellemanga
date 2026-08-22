-- ШИНЭ (хэрэглэгчийн хvсэлт): Reel хэсгийг сайжруулав —
--   1) Ганц видеоны оронд/зэрэгцvvлэн, дээд тал нь 10 ЗУРГААС бvрдсэн
--      "зурган цуврал" (slideshow) reel vvсгэж болно.
--   2) Видео (эсвэл зурган цуврал)-д тусдаа дуу/хөгжим (audio_url) хавсаргаж
--      болно — хавсаргавал видеоны өөрийнх нь дууг нам болгож, зөвхөн
--      энэ тусгай дуу л сонсогдоно.

alter table public.reels alter column video_url drop not null;
alter table public.reels add column if not exists image_urls text[];
alter table public.reels add column if not exists audio_url text;

alter table public.reels
  drop constraint if exists reels_media_check;
alter table public.reels
  add constraint reels_media_check check (
    video_url is not null or (image_urls is not null and array_length(image_urls, 1) > 0)
  );

alter table public.reels
  drop constraint if exists reels_image_count_check;
alter table public.reels
  add constraint reels_image_count_check check (
    image_urls is null or array_length(image_urls, 1) <= 10
  );
