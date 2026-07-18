-- ЗАСВАР #179-192 (код шинжилгээ): гаднын код шинжилгээний тайланд бичигдсэн
-- 17 зvйлийн дотроос энд DB талд шаардлагатай өөрчлөлтvvдийг нэгтгэв.
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

-- ============================================================
-- 1) ЗАСВАР #180: users хvснэгтэд өөрийгөө admin/VIP болгох боломжтой
--    цоорхойг таглана (RLS нь МӨРИЙН түвшинд л шалгадаг тул баганыг
--    хамгаалахгvй бол хэн ч { roles: ['admin'], is_vip: true } явуулж болно).
-- ============================================================
create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_any_role(auth.uid(), array['admin']) then
    if (new.roles is distinct from old.roles)
       or (new.is_vip is distinct from old.is_vip)
       or (new.vip_expires_at is distinct from old.vip_expires_at) then
      raise exception 'Зөвхөн admin эрх/VIP төлөвийг өөрчилж болно.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_privilege_escalation on public.users;
create trigger trg_prevent_self_privilege_escalation
  before update on public.users
  for each row execute function public.prevent_self_privilege_escalation();

-- ============================================================
-- 2) ЗАСВАР #183: (manga_id, chapter_number) хосол давхардахгvй байх.
--    Хэрэв "duplicate key" алдаагаар унавал эхэлж давхардсан бvлгvvдийг олж
--    (доорх query) цэвэрлэсний дараа энэ хэсгийг дахин ажиллуулна:
--      select manga_id, chapter_number, count(*) from public.chapters
--      group by manga_id, chapter_number having count(*) > 1;
-- ============================================================
create unique index if not exists chapters_manga_chapter_unique_idx on public.chapters (manga_id, chapter_number);

-- ============================================================
-- 3) ЗАСВАР #185: сэтгэгдлийн 5 секундийн rate-limit-ийг RLS policy-ийн
--    WITH CHECK-ээс тусад нь trigger рvv шилжvvлж, ялгаатай ('rate_limited')
--    алдаа буцаана — эс бол ямар ч RLS зөрчлийг клиент "хэт хурдан" гэж
--    буруу тайлбарладаг байв.
-- ============================================================
drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments for insert
  with check (auth.uid() = user_id);

create or replace function public.enforce_comment_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.comments c
    where c.user_id = new.user_id
      and c.created_at > now() - interval '5 seconds'
  ) then
    raise exception 'rate_limited';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_comment_rate_limit on public.comments;
create trigger trg_enforce_comment_rate_limit
  before insert on public.comments
  for each row execute function public.enforce_comment_rate_limit();

-- ============================================================
-- 4) ЗАСВАР #187: "ЭРХ ОЛГОХ" дэх Gmail давхцлын шалгалтыг клиентийн async
--    staffUsers state (race condition-той) биш, сервер талд (auth.users-ийн
--    жинхэнэ баталгаажсан имэйлээр) НЭГ RPC дотор хийнэ.
-- ============================================================
create or replace function public.normalize_gmail_email(raw_email text)
returns text
language plpgsql
immutable
as $$
declare
  local_part text;
  domain_part text;
  norm text;
begin
  if raw_email is null then return ''; end if;
  norm := lower(trim(raw_email));
  local_part := split_part(norm, '@', 1);
  domain_part := split_part(norm, '@', 2);
  if domain_part = '' then return norm; end if;
  if domain_part in ('gmail.com', 'googlemail.com') then
    return replace(split_part(local_part, '+', 1), '.', '') || '@gmail.com';
  end if;
  return local_part || '@' || domain_part;
end;
$$;

create or replace function public.admin_grant_roles(target_user_id uuid, new_roles text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_norm text;
  clash_email text;
begin
  if not public.has_any_role(auth.uid(), array['admin']) then
    raise exception 'Зөвхөн admin энэ vйлдлийг хийж болно.';
  end if;

  if coalesce(array_length(new_roles, 1), 0) > 0 then
    select public.normalize_gmail_email(au.email::text) into target_norm
    from auth.users au where au.id = target_user_id;

    select au.email::text into clash_email
    from public.users u
    join auth.users au on au.id = u.id
    where u.id <> target_user_id
      and coalesce(array_length(u.roles, 1), 0) > 0
      and public.normalize_gmail_email(au.email::text) = target_norm
    limit 1;

    if clash_email is not null then
      raise exception 'gmail_clash:%', clash_email;
    end if;
  end if;

  update public.users set roles = new_roles where id = target_user_id;
end;
$$;

grant execute on function public.admin_grant_roles(uuid, text[]) to authenticated;

-- ============================================================
-- 5) ЗАСВАР #190: vзэлт (views) давхар тоологдохоос сэргийлж, RPC одоо
--    ЖИНХЭНЭ шинэ тооллого хийсэн эсэхийг (boolean) буцаана — клиент код
--    (App.jsx) зөвхөн true vед л optimistic +1-ийг хийнэ.
-- ============================================================
drop function if exists public.increment_manga_views(bigint, text);
create or replace function public.increment_manga_views(input_id bigint, viewer_key text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_key text;
  recent_count int;
begin
  effective_key := coalesce(auth.uid()::text, left(nullif(trim(viewer_key), ''), 64));
  if effective_key is null then
    return false;
  end if;

  select count(*) into recent_count
  from public.manga_view_events e
  where e.manga_id = input_id
    and e.viewer_key = effective_key
    and e.viewed_at > now() - interval '30 minutes';

  if recent_count > 0 then
    return false;
  end if;

  update public.mangas set views = views + 1 where id = input_id;
  insert into public.manga_view_events (manga_id, viewer_key) values (input_id, effective_key);
  return true;
end;
$$;

grant execute on function public.increment_manga_views(bigint, text) to anon, authenticated;
