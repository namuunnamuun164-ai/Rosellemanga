-- ЗАСВАР #153: migration_14-ийн "chapters_select" засвар хэт хатуу байсныг
-- зассан (regression fix) — тэр vед VIP/товлосон бvлгийн ЗУРАГ (chapter_images)-ыг
-- хамгаалахын зэрэгцээ, "chapters" хvснэгтийн МӨР ӨӨРИЙГ НЬ (гарчиг, дугаар,
-- thumbnail зэрэг метадата) ч мөн адил VIP/цагийн шалгалтад хамруулчихсан байв.
--
-- Vvний vр дvнд: VIP эсвэл ирээдvйд гарах цагтай (moderator/admin шууд
-- нийтэлсэн ч гэсэн) БvЛЭГ бvхэлдээ (гарчиг хvртэл) нэвтрээгvй/VIP бус
-- хэрэглэгчид ЕР НЬ ХАРАГДАХГvй болчихсон байв. Гэтэл App.jsx-ийн клиент код
-- vvнийг vvгээр (бvлгийг жагсаалтад ХАРУУЛААД, зөвхөн 🔒 дvрс/уншихыг нь
-- хориглоод) харуулахаар зохиогдсон — жинхэнэ хамгаалах ёстой зvйл бол
-- ЗӨВХӨН бодит хуудасны ЗУРАГ (chapter_images), бvлгийн МЕТАДАТА биш.
--
-- ШИЙДЭЛ: "chapters_select"-ийг анхных руу нь (зөвхөн status='published' эсвэл
-- staff) буцаав — VIP/цагийн жинхэнэ хамгаалалт "chapter_images_select" дээр
-- (migration_14-ээр аль хэдийн зөв нэмэгдсэн, өөрчлөгдөөгvй хэвээр vлдэнэ)
-- дангаараа хэвээр vлдэнэ. Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

drop policy if exists "chapters_select" on public.chapters;
create policy "chapters_select" on public.chapters for select
  using (
    status = 'published'
    or exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator','editor'])
  );
