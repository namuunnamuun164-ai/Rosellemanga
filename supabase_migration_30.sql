-- ЗАСВАР #163: "Бvтэн харах" цонхны зураг СОЛИХ/ТАЙРАХ/УСТГАХ vйлдэл editor
-- эрхтэй хvнд бодитоор хадгалагдахгvй байсан 2 RLS цоорхойг засав.
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

-- 1) chapter_images хvснэгтэд UPDATE policy огт байгаагvй (зөвхөн
-- select/insert/delete байсан). Vvнээс vvдэж зураг СОЛИХ/ТАЙРАХ vйлдэл нь
-- image_url-г шинэчлэхийг оролдоход RLS-ээр 0 мөр таарч, Supabase JS
-- "алдаагvй" (error=null) л буцаадаг тул клиент талд "амжилттай солигдсон"
-- мэт харагдаад бодит DB-д хадгалагдаагvй байв. Insert policy-той ижил
-- хамрах хvрээгээр (admin/moderator бvгдийг, editor зөвхөн өөрийн "pending"
-- бvлгийнхийг) UPDATE зөвшөөрнө.
drop policy if exists "chapter_images_update_staff" on public.chapter_images;
create policy "chapter_images_update_staff" on public.chapter_images for update
  using (
    public.has_any_role(auth.uid(), array['admin','moderator'])
    or (
      public.has_any_role(auth.uid(), array['editor'])
      and exists (select 1 from public.chapters c where c.id = chapter_id and c.status = 'pending')
    )
  )
  with check (
    public.has_any_role(auth.uid(), array['admin','moderator'])
    or (
      public.has_any_role(auth.uid(), array['editor'])
      and exists (select 1 from public.chapters c where c.id = chapter_id and c.status = 'pending')
    )
  );

-- 2) DELETE policy зөвхөн admin/moderator-ыг зөвшөөрдөг байсан тул, editor
-- "Бvтэн харах"-аас зураг устгаад эцсийн "Хадгалах" дарахад, RLS-ээр DB-с
-- бодитоор устгагдахгvй (0 мөр таарч, алдаагvй) орхигддог байв. Insert/update
-- policy-той адилхан хамрах хvрээгээр нээв.
drop policy if exists "chapter_images_delete_moderate" on public.chapter_images;
create policy "chapter_images_delete_moderate" on public.chapter_images for delete
  using (
    public.has_any_role(auth.uid(), array['admin','moderator'])
    or (
      public.has_any_role(auth.uid(), array['editor'])
      and exists (select 1 from public.chapters c where c.id = chapter_id and c.status = 'pending')
    )
  );
