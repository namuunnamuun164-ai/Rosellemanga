-- ШИНЭ (хэрэглэгчийн хvсэлт): "Бvгдийн шаана" эрх — зөвхөн admin vvсгэдэг,
-- тодорхой эрхтэй хэрэглэгчдэд (мөн admin/moderator/editor-т) л харагддаг
-- тусгай манга. Дараа нь admin vvнийг "Нийтэд нээх" (restricted_role-г цэвэрлэх)
-- замаар бvх хэрэглэгчид харагдахаар болгож болно.

alter table public.mangas add column if not exists restricted_role text;

-- ЗАСВАР: mangas_select-г хуучин (is_hidden) шалгалт дээр нь давхар
-- restricted_role шалгалт нэмж дахин тодорхойлно.
drop policy if exists "mangas_select" on public.mangas;
create policy "mangas_select" on public.mangas for select
  using (
    (
      coalesce(is_hidden, false) = false
      or public.has_any_role(auth.uid(), array['admin','moderator','editor'])
    )
    and (
      restricted_role is null
      or public.has_any_role(auth.uid(), array['admin','moderator','editor'])
      or public.has_any_role(auth.uid(), array[restricted_role])
    )
  );

-- ЗАСВАР: манга vvсгэхдээ restricted_role тавихыг ЗӨВХӨН admin хийж болно
-- (moderator/editor хэвийн шинэ манга нэмж болно, харин хязгаарлалт тавьж чадахгvй).
drop policy if exists "mangas_insert_staff" on public.mangas;
create policy "mangas_insert_staff_role_checked" on public.mangas for insert
  with check (
    public.has_any_role(auth.uid(), array['admin','moderator','editor'])
    and (restricted_role is null or public.has_any_role(auth.uid(), array['admin']))
  );

-- ЗАСВАР: засварлахдаа ч (Нийтэд нээх зэрэг) restricted_role-ыг зөвхөн admin өөрчилж болно.
drop policy if exists "mangas_update_moderate" on public.mangas;
create policy "mangas_update_moderate_role_checked" on public.mangas for update
  using (public.has_any_role(auth.uid(), array['admin','moderator']))
  with check (
    public.has_any_role(auth.uid(), array['admin','moderator'])
    and (restricted_role is null or public.has_any_role(auth.uid(), array['admin']))
  );
