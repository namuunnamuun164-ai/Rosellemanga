-- ЗАСВАР #140: аюулгvй байдлын шалгалтаар илэрсэн MEDIUM цоорхойг (Issue #6) засав —
-- chapter_images хvснэгтэд DELETE policy огт байгаагvй тул "БvЛЭГ ЗАСАХ"
-- цонхноос admin/moderator тодорхой хуудсыг (жишээ нь буруу/зохисгvй зураг)
-- хассан ч мөр бодитоор устгагдаагvй, харагдсаар vлддэг байсан. Зөвхөн
-- ЭНЭ ДУТУУ DELETE policy-г нэмнэ — бусад эрх (select/insert) хэвээрээ.
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

drop policy if exists "chapter_images_delete_moderate" on public.chapter_images;
create policy "chapter_images_delete_moderate" on public.chapter_images for delete
  using (public.has_any_role(auth.uid(), array['admin','moderator']));
