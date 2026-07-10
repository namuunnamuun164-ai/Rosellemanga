-- ЗАСВАР #126: код шинжилгээгээр илэрсэн 5 чухал/өндөр зэрэглэлийн RLS цоорхойг
-- (клиент талд л шалгаад, серверт (Supabase REST/RLS) хамгаалаагvй байсан
-- зөвшөөрлvvдийг) засав. Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.
--
-- Юуг засав:
--   1) VIP/товлогдсон бvлгийн зургийг хэн ч (нэвтрээгvй хvн ч) REST API-аар
--      шууд дуудаж vнэгvй авч чаддаг байсныг chapters/chapter_images SELECT
--      policy-д is_vip/publish_at шалгалт нэмж хаав.
--   2) Хэрэглэгч өөрийгөө шууд VIP болгож чаддаг (is_vip/vip_expires_at
--      баганыг users_update_own policy хамгаалдаггvй байсан) цоорхойг
--      prevent_role_escalation trigger-т нэмж хаав.
--   3) users хvснэгтийг ("using (true)") хэн ч бvрэн уншиж (имэйл гэх мэт)
--      чаддаг байсныг зөвхөн өөрийн мөр + staff-аар хязгаарлав. Сэтгэгдлийн
--      эзэмшигчийн нэр/зураг vзvvлэхэд шаардлагатай нээлттэй мэдээллийг
--      (email биш) get_public_profiles() security definer функцээр дамжуулна.
--   4) editor эрхтэй хэрэглэгч бvлгийг шалгуулалгvй шууд "published" болгож
--      оруулж чаддаг байсныг chapters_insert_staff-ийн WITH CHECK-д хаав.
--   5) editor эрхтэй хэрэглэгч mangas хvснэгтийн ЛЮБОЙ баганыг (нуух, санал
--      болгох гэх мэт зөвхөн admin/moderator-д зориулсан vйлдлvvд) шууд
--      засаж чаддаг байсныг mangas_update-г admin/moderator-аар хязгаарлав.

-- ============================================================
-- 1) VIP + товлосон цагийг chapters/chapter_images SELECT дээр биет хамгаалав
-- ============================================================
drop policy if exists "chapters_select" on public.chapters;
create policy "chapters_select" on public.chapters for select
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator','editor'])
    or (
      status = 'published'
      and (publish_at is null or publish_at <= now())
      and (
        not is_vip
        or exists (
          select 1 from public.users u where u.id = auth.uid()
            and u.is_vip and (u.vip_expires_at is null or u.vip_expires_at > now())
        )
      )
    )
  );

drop policy if exists "chapter_images_select" on public.chapter_images;
create policy "chapter_images_select" on public.chapter_images for select
  using (
    exists (
      select 1 from public.chapters c
      where c.id = chapter_id
        and (
          exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator','editor'])
          or (
            c.status = 'published'
            and (c.publish_at is null or c.publish_at <= now())
            and (
              not c.is_vip
              or exists (
                select 1 from public.users u where u.id = auth.uid()
                  and u.is_vip and (u.vip_expires_at is null or u.vip_expires_at > now())
              )
            )
          )
        )
    )
  );

-- ============================================================
-- 2) is_vip/vip_expires_at-г (roles-той адил) trigger-ээр хамгаалав —
--    зөвхөн admin (эсвэл SQL Editor/service_role) л өөрчилж чадна.
-- ============================================================
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.roles is distinct from old.roles
     or new.is_vip is distinct from old.is_vip
     or new.vip_expires_at is distinct from old.vip_expires_at then
    if auth.uid() is not null and not exists (
      select 1 from public.users u where u.id = auth.uid() and 'admin' = any(u.roles)
    ) then
      new.roles := old.roles;
      new.is_vip := old.is_vip;
      new.vip_expires_at := old.vip_expires_at;
    end if;
  end if;
  return new;
end;
$$;
-- (trg_prevent_role_escalation trigger нь аль хэдийн энэ функцийг дуудаж
-- байгаа тул дахин vvсгэх шаардлагагvй, create or replace хангалттай.)

-- ============================================================
-- 3) users хvснэгтийг зөвхөн өөрийн мөр/staff-аар хязгаарлаж, нээлттэй
--    profile мэдээллийг (email биш) security definer функцээр гаргав.
-- ============================================================
drop policy if exists "users_select_all" on public.users;
create policy "users_select_own_or_staff" on public.users for select
  using (
    auth.uid() = id
    or exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator','editor'])
  );

create or replace function public.get_public_profiles(user_ids uuid[])
returns table(id uuid, name text, avatar_url text, roles text[])
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.name, u.avatar_url, u.roles
  from public.users u
  where u.id = any(user_ids);
$$;

grant execute on function public.get_public_profiles(uuid[]) to anon, authenticated;

-- ============================================================
-- 4) editor эрхтэй хэрэглэгч "pending" бусаар (жишээ нь шууд "published")
--    бvлэг оруулж чадахгvй болгов — admin/moderator хязгааргvй.
-- ============================================================
drop policy if exists "chapters_insert_staff" on public.chapters;
create policy "chapters_insert_staff" on public.chapters for insert
  with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator'])
    or (
      exists (select 1 from public.users u where u.id = auth.uid() and 'editor' = any(u.roles))
      and status = 'pending'
    )
  );

-- ============================================================
-- 5) mangas UPDATE-г editor-оос хасаж, admin/moderator-оор хязгаарлав
--    (нуух/санал болгох зэрэг vйлдлvvд UI дээр аль хэдийн зөвхөн
--    canModerate/isAdmin-д харагддаг байсан ч RLS vvнийг баталгаажуулдаггvй байв).
-- ============================================================
drop policy if exists "mangas_update_staff" on public.mangas;
create policy "mangas_update_moderate" on public.mangas for update
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.roles && array['admin','moderator']));
