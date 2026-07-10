-- ЗАСВАР #135: аюулгvй байдлын шалгалтаар илэрсэн HIGH цоорхойг (Issue #3) засав —
-- "chapters_delete_moderate" policy admin-ийн зэрэгцээ moderator-т ч DELETE
-- эрх олгодог байсан тул ЗАСВАР #125-д зориудаар зохион байгуулсан "moderator/
-- editor зөвхөн УСТГАХ ХvСЭЛТ (pending_delete=true) vvсгэнэ, admin л эцсийн
-- баталгаажуулалт хийж бодитоор устгана" гэсэн 2 шатлалт хамгаалалтыг
-- moderator шууд (admin-ийг алгасаад) supabase.from('chapters').delete()
-- дуудаж бvрмөсөн тойрч гарах боломжтой байсан. App.jsx клиент код өөрөө аль
-- хэдийн зөвхөн isAdmin vед л bvлэг устгадаг (moderator/editor зөвхөн
-- pending_delete tavих) байсан тул энэ бол цэвэр серверийн (RLS) хатуужуулалт
-- — клиент код өөрчлөгдөөгvй. Supabase Dashboard → SQL Editor-т ГАРААР
-- ажиллуулна уу.

drop policy if exists "chapters_delete_moderate" on public.chapters;
create policy "chapters_delete_admin_only" on public.chapters for delete
  using (public.has_any_role(auth.uid(), array['admin']));
