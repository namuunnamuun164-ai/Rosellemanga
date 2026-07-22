-- ЗАСВАР #198 (код шинжилгээ): comments хvснэгтэд chapter_id/manga_id хоёул
-- nullable (нэг нь бvлгийн, нөгөө нь манганы ерөнхий сэтгэгдэлд зориулагдсан)
-- байдаг ч, хоёрын АЛЬ Ч НЭГ нь ЗААВАЛ байхыг (нөгөө нь null байхыг) хамгаалах
-- CHECK constraint байгаагvй байсан. Одоо нэмж хамгаална.
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

-- АНХААР: хэрэв доорх мөр "check constraint ... is violated by some row"
-- гэсэн алдаагаар унавал, эхэлж зөрчсөн (хоёул null эсвэл хоёул тавигдсан) мөрvvдийг
-- дараах query-гээр олж, гараар засаад (эсвэл устгаад) дахин ажиллуулна уу:
--   select id, chapter_id, manga_id from public.comments
--   where (chapter_id is null) = (manga_id is null);

alter table public.comments
  drop constraint if exists comments_chapter_xor_manga;
alter table public.comments
  add constraint comments_chapter_xor_manga check (
    (chapter_id is not null and manga_id is null)
    or (chapter_id is null and manga_id is not null)
  );
