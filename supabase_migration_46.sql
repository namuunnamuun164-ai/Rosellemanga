-- ЗАСВАР (хэрэглэгчийн хvсэлт): "Бvгдийн шаана" системийг тодотгов —
--   1) Хязгаарлагдсан манга нь ЗӨВХӨН admin + тухайн эрхийг эзэмшигчдэд
--      харагдана — moderator/editor ч (өмнө нь харагддаг байсан) харахгvй.
--   2) "Бvгдийн шаана" эрхтэй хэрэглэгч тухайн (өөрийн эрхтэй тохирох)
--      хязгаарлагдсан мангад бvлэг НЭМЖ болно (editor-той адил "pending"
--      статустайгаар — admin/moderator баталгаажуулах хvртэл).

-- 1) mangas — moderator/editor-г хязгаарлагдсан мангаас бvрмөсөн хасав -------
drop policy if exists "mangas_select" on public.mangas;
create policy "mangas_select" on public.mangas for select
  using (
    (
      coalesce(is_hidden, false) = false
      or public.has_any_role(auth.uid(), array['admin','moderator','editor'])
    )
    and (
      restricted_role is null
      or public.has_any_role(auth.uid(), array['admin'])
      or public.has_any_role(auth.uid(), array[restricted_role])
    )
  );

drop policy if exists "mangas_update_moderate_role_checked" on public.mangas;
create policy "mangas_update_moderate_role_checked" on public.mangas for update
  using (
    public.has_any_role(auth.uid(), array['admin','moderator'])
    and (restricted_role is null or public.has_any_role(auth.uid(), array['admin']))
  )
  with check (
    public.has_any_role(auth.uid(), array['admin','moderator'])
    and (restricted_role is null or public.has_any_role(auth.uid(), array['admin']))
  );

-- 2) chapters — "Бvгдийн шаана" (болон ирээдvйд адил төрлийн) эрхтэй
--    хэрэглэгч, зөвхөн ӨӨРИЙН эрхтэй тохирох хязгаарлагдсан мангад л,
--    editor-той адил "pending" статустайгаар бvлэг нэмж болно ------------------
drop policy if exists "chapters_insert_staff" on public.chapters;
create policy "chapters_insert_staff_or_restricted_role" on public.chapters for insert
  with check (
    public.has_any_role(auth.uid(), array['admin','moderator'])
    or (
      public.has_any_role(auth.uid(), array['editor'])
      and status = 'pending'
    )
    or (
      status = 'pending'
      and exists (
        select 1 from public.mangas m
        where m.id = manga_id
          and m.restricted_role is not null
          and public.has_any_role(auth.uid(), array[m.restricted_role])
      )
    )
  );
