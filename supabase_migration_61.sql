-- ЗАСВАР (код аюулгvй байдлын шинжилгээ #3, App.jsx correctness review):
--   1) admin_revoke_role — "ЭРХ ОЛГОХ" табын эрх хураах vйлдлийг
--      admin_grant_roles-тэй адил security definer RPC болгов. Өмнө нь клиент
--      хуучирсан staffUsers массиваас newRoles-г бодож ШУУД users.roles-д
--      бичдэг байсан тул (1) хоёр admin зэрэг өөр өөр эрх дээр ажиллавал нэгнийх
--      нь өөрчлөлт нөгөөгийнхийг дарж бичих (lost update), (2) "өөрийн admin
--      эрхээ хураахгvй" хамгаалалт зөвхөн клиент код дотор байсан тул серверийн
--      түвшинд ямар ч баталгаагvй байв. Одоо array_remove-г сервер дээр
--      атомоор хийж, self-revoke хамгаалалтыг ч RPC дотор шалгана.
--   2) admin_grant_vip_days / admin_revoke_vip — гараар VIP олгох/цуцлах
--      (админ хуудасны "VIP ОЛГОХ" маягт) нь approve_payment_request-тэй адил
--      atomic UPDATE ашигладаг болгов. Өмнө нь клиент дээр "base" (одоогийн
--      дуусах хугацаа) тооцоод дараа нь UPDATE хийдэг байсан тул хоёр удаа
--      дараалан дарах (эсвэл payment-ийн батлалттай зэрэг орох) vед нэг нь
--      нөгөөгөө дарж, VIP хугацаа дутуу/илvv бичигдэх боломжтой байв.
--   3) mark_chapter_read — reading_progress.read_chapters-г клиент бvхэлд нь
--      чөлөөтэй бичдэг (upsert) байсныг хаав. Энэ нь claim_task RPC-ийн
--      "chapters_read"/"manga_chapters" төрлийн даалгаврын явцыг ЯГ ЭНЭ
--      хvснэгтээс шууд уншдаг тул, хэн ч REST-ээр хуурамч том read_chapters
--      массив бичээд, нэг ч бvлэг унших шаардлагагvйгээр даалгаврын шагнал
--      (VIP хоног/цэцэг) авах боломжтой байсан томоохон цоорхой байв. Одоо
--      зөвхөн НЭГ бvлгийг л (давхардуулахгvйгээр) нэмдэг security definer
--      RPC-ээр л бичигддэг, шууд INSERT/UPDATE RLS-г хаав.

-- ========================================================================
-- 1) admin_revoke_role
-- ========================================================================
create or replace function public.admin_revoke_role(target_user_id uuid, role_in text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_any_role(auth.uid(), array['admin']) then
    raise exception 'Зөвхөн admin энэ vйлдлийг хийж болно.';
  end if;
  if target_user_id = auth.uid() and role_in = 'admin' then
    raise exception 'cannot_self_revoke_admin';
  end if;

  update public.users
    set roles = array_remove(coalesce(roles, array[]::text[]), role_in)
    where id = target_user_id;
end;
$$;

grant execute on function public.admin_revoke_role(uuid, text) to authenticated;

-- ========================================================================
-- 2) admin_grant_vip_days / admin_revoke_vip
-- ========================================================================
create or replace function public.admin_grant_vip_days(target_user_id uuid, days int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_any_role(auth.uid(), array['admin']) then
    raise exception 'Зөвхөн admin энэ vйлдлийг хийж болно.';
  end if;
  if days is null or days <= 0 then
    raise exception 'invalid_days';
  end if;

  update public.users
    set is_vip = true,
        vip_expires_at = (case
          when is_vip and vip_expires_at is not null and vip_expires_at > now()
          then vip_expires_at
          else now()
        end) + (days || ' days')::interval
    where id = target_user_id;
end;
$$;

grant execute on function public.admin_grant_vip_days(uuid, int) to authenticated;

create or replace function public.admin_revoke_vip(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_any_role(auth.uid(), array['admin']) then
    raise exception 'Зөвхөн admin энэ vйлдлийг хийж болно.';
  end if;

  update public.users set is_vip = false, vip_expires_at = null where id = target_user_id;
end;
$$;

grant execute on function public.admin_revoke_vip(uuid) to authenticated;

-- ========================================================================
-- 3) mark_chapter_read — reading_progress-ийг зөвхөн RPC-ээр л бичих
-- ========================================================================
create or replace function public.mark_chapter_read(manga_id_in bigint, chapter_number_in numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if chapter_number_in is null then
    raise exception 'invalid_chapter';
  end if;
  if not exists (select 1 from public.mangas where id = manga_id_in) then
    raise exception 'manga_not_found';
  end if;

  insert into public.reading_progress (user_id, manga_id, last_chapter, read_chapters, updated_at)
    values (auth.uid(), manga_id_in, chapter_number_in, array[chapter_number_in], now())
  on conflict (user_id, manga_id) do update
    set last_chapter = greatest(reading_progress.last_chapter, excluded.last_chapter),
        read_chapters = case
          when chapter_number_in = any(reading_progress.read_chapters) then reading_progress.read_chapters
          else array_append(reading_progress.read_chapters, chapter_number_in)
        end,
        updated_at = now();
end;
$$;

grant execute on function public.mark_chapter_read(bigint, numeric) to authenticated;

-- ЗАСВАР: клиент шууд INSERT/UPDATE/DELETE хийж чадахгvй болгож, зөвхөн
-- ӨӨРИЙН явцаа унших боломжтой vлдээв (бичих зам ганцхан mark_chapter_read
-- RPC — дээрхтэй адил security definer тул RLS-г тойрч бичнэ).
drop policy if exists "reading_progress_own" on public.reading_progress;
drop policy if exists "reading_progress_select_own" on public.reading_progress;
create policy "reading_progress_select_own" on public.reading_progress for select
  using (auth.uid() = user_id);
