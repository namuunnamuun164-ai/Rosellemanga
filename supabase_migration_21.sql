-- ЗАСВАР #138: аюулгvй байдлын шалгалтаар илэрсэн MEDIUM цоорхойг (Issue #7) засав —
-- сэтгэгдэл (comments) бичихэд урт хязгаар ч, давтамжийн хязгаарлалт ч
-- байгаагvй тул script-ээр хязгааргvй тооны/хэмжээний сэтгэгдэл нэг зэрэг
-- илгээж, feed-ийг дvvргэх (flood) боломжтой байсан. UI-д ямар ч өөрчлөлт
-- ороогvй — зөвхөн серверийн (DB) хамгаалалт. Supabase Dashboard → SQL
-- Editor-т ГАРААР ажиллуулна уу.

-- 1) Урт хязгаарлалт (ойлгомжтой дээд тал — жирийн сэтгэгдэл 2000 тэмдэгтээс хэтрэхгvй)
alter table public.comments
  drop constraint if exists comments_content_length;
alter table public.comments
  add constraint comments_content_length check (char_length(content) <= 2000);

-- 2) Хөнгөн (lightweight) давтамжийн хязгаарлалт — 1 хэрэглэгч 5 секундэд
--    дор хаяж 1 удаа л шинэ сэтгэгдэл бичиж болно (chapter/manga аль алинд нь
--    хамаарна, учир нь хоёулаа ижил "comments" хvснэгтэд хадгалагддаг).
--    comments_select_all нь "using(true)" (тогтмол, дэд query-гvй) тул энд
--    доtorh дэд query-г ашиглахад users_select_own_or_staff-д тохиолдсонтой
--    адил infinite recursion vvсэхгvй.
drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.comments c
      where c.user_id = auth.uid()
        and c.created_at > now() - interval '5 seconds'
    )
  );
