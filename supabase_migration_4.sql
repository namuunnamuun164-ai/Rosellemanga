-- ЗАСВАР #4: Админ/модератор бүлэг устгах боломжтой болсонтой холбоотой.
-- chapters хүснэгтэд DELETE эрхийн policy огт байгаагүй тул RLS анхныхаараа
-- бүх устгах хүсэлтийг хориглодог байсан — админ панелаас 🗑 дарсан ч чимээгүй
-- амжилтгүй болно (0 мөр устгагдана, алдаа ч гарахгүй).
--
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

drop policy if exists "chapters_delete_moderate" on public.chapters;
create policy "chapters_delete_moderate" on public.chapters for delete
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator']));
