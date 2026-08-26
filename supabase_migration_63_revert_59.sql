-- migration_59.sql-ийг СЭРГЭЭХ (revert) — хэрэглэгчийн хvсэлтээр.
--
-- ⚠️ АНХААР: энэ нь дараах 6 функц/trigger-ийг migration_59-ээс ӨМНӨХ (анхны)
-- байдалд нь буцаана. Ингэснээр migration_59-д зассан дараах зvйлс дахин
-- эргэж ирнэ:
--   • gift_flowers_as_staff — сарын 10 хязгаарын TOCTOU race ДАХИН vvснэ,
--     мөн direct_messages-д vл байх "message" баганад бичихийг оролддог
--     байсан тул энэ RPC ер нь runtime алдаатай, ажиллахгvй болно (staff
--     цэцэг бэлэглэхийг оролдоход "message" багана олдсонгvй гэсэн алдаа
--     өгнө).
--   • approve_payment_request / redeem_points_for_vip / gift_vip_with_points /
--     claim_task / approve_task_claim — vip_expires_at-ийн lost-update race
--     ДАХИН vvснэ (хоёр зэрэгцээ VIP олгох дуудлагын нэг нь нөгөөгөө дарж бичих
--     эрсдэлтэй болно).
--   • direct_messages-ийн "хvлээн авагч зөвхөн read_at-аа өөрчилнө" trigger
--     хасагдана (хvлээн авагч дахин мессежийн бусад баганыг PATCH хийж
--     чадах болно).
--
-- Энэ нь ТАНЫ 401/session алдаатай ХОЛБООГvЙ (тэр нь Supabase Auth-ийн
-- "Detect and revoke potentially compromised refresh tokens" тохиргоо +
-- олон tab зэрэг нээлттэй байснаас vvссэн, DB-тэй хамаагvй асуудал байсан).

-- ========================================================================
-- 1) gift_flowers_as_staff → migration_58-ийн анхны хувилбар
-- ========================================================================
create or replace function public.gift_flowers_as_staff(recipient_id_in uuid, amount_in int, message_in text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'moderator', 'editor']) then
    raise exception 'not_staff';
  end if;
  if amount_in is null or amount_in <= 0 then
    raise exception 'invalid_amount';
  end if;
  if recipient_id_in = auth.uid() then
    raise exception 'cannot_gift_self';
  end if;
  if exists (
    select 1 from public.blocked_users
    where (blocker_id = recipient_id_in and blocked_id = auth.uid())
       or (blocker_id = auth.uid() and blocked_id = recipient_id_in)
  ) then
    raise exception 'blocked';
  end if;

  select coalesce(sum(amount), 0) into used from public.staff_flower_gifts
    where staff_id = auth.uid() and created_at >= date_trunc('month', now());
  if used + amount_in > 10 then
    raise exception 'quota_exceeded';
  end if;

  update public.users set flower_balance = flower_balance + amount_in where id = recipient_id_in;
  insert into public.staff_flower_gifts (staff_id, recipient_id, amount) values (auth.uid(), recipient_id_in, amount_in);
  insert into public.direct_messages (sender_id, recipient_id, message_type, gift_amount, message)
    values (auth.uid(), recipient_id_in, 'gift_flowers', amount_in, nullif(trim(message_in), ''));
end;
$$;

grant execute on function public.gift_flowers_as_staff(uuid, int, text) to authenticated;

-- ========================================================================
-- 2) vip_expires_at-той 5 RPC → анхны (base-хувьсагчтай) хувилбар
-- ========================================================================
create or replace function public.approve_payment_request(request_id bigint, vip_days int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
  base timestamptz;
begin
  if not public.has_any_role(auth.uid(), array['admin']) then
    raise exception 'Зөвхөн admin батлах эрхтэй';
  end if;

  select * into req from public.payment_requests where id = request_id for update;
  if req is null then
    raise exception 'Хvсэлт олдсонгvй';
  end if;
  if req.status <> 'pending' then
    raise exception 'Энэ хvсэлт аль хэдийн шийдэгдсэн байна';
  end if;

  select case
           when u.is_vip and u.vip_expires_at is not null and u.vip_expires_at > now()
           then u.vip_expires_at
           else now()
         end
    into base
    from public.users u where u.id = req.user_id;

  update public.users
    set is_vip = true, vip_expires_at = base + (vip_days || ' days')::interval
    where id = req.user_id;

  update public.payment_requests
    set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
    where id = request_id;
end;
$$;

grant execute on function public.approve_payment_request(bigint, int) to authenticated;

create or replace function public.redeem_points_for_vip()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  needed constant int := 5000;
  reward_days constant int := 30;
  base timestamptz;
begin
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.loyalty_points >= needed) then
    raise exception 'not_enough_points';
  end if;

  select case
           when u.is_vip and u.vip_expires_at is not null and u.vip_expires_at > now()
           then u.vip_expires_at
           else now()
         end
    into base
    from public.users u where u.id = auth.uid();

  update public.users
    set loyalty_points = loyalty_points - needed,
        is_vip = true, vip_expires_at = base + (reward_days || ' days')::interval
    where id = auth.uid();
end;
$$;

grant execute on function public.redeem_points_for_vip() to authenticated;

create or replace function public.gift_vip_with_points(recipient_id_in uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  needed constant int := 5000;
  gift_days constant int := 30;
  base timestamptz;
begin
  if recipient_id_in = auth.uid() then
    raise exception 'cannot_gift_self';
  end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = auth.uid() and b.blocked_id = recipient_id_in)
       or (b.blocker_id = recipient_id_in and b.blocked_id = auth.uid())
  ) then
    raise exception 'blocked';
  end if;
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.loyalty_points >= needed) then
    raise exception 'not_enough_points';
  end if;

  select case
           when u.is_vip and u.vip_expires_at is not null and u.vip_expires_at > now()
           then u.vip_expires_at
           else now()
         end
    into base
    from public.users u where u.id = recipient_id_in;

  update public.users set loyalty_points = loyalty_points - needed where id = auth.uid();
  update public.users
    set is_vip = true, vip_expires_at = base + (gift_days || ' days')::interval
    where id = recipient_id_in;

  insert into public.direct_messages (sender_id, recipient_id, message_type, gift_amount)
    values (auth.uid(), recipient_id_in, 'gift_vip', gift_days);
end;
$$;

grant execute on function public.gift_vip_with_points(uuid) to authenticated;

create or replace function public.claim_task(task_id_in bigint, proof_image_urls_in text[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  progress_count int;
  base timestamptz;
begin
  select * into t from public.tasks where id = task_id_in and is_active;
  if t is null then
    raise exception 'Даалгавар олдсонгvй';
  end if;

  if exists (select 1 from public.task_claims where user_id = auth.uid() and task_id = task_id_in) then
    raise exception 'already_claimed';
  end if;

  if t.requirement_type = 'manual' then
    if proof_image_urls_in is null or array_length(proof_image_urls_in, 1) is null or array_length(proof_image_urls_in, 1) = 0 then
      raise exception 'proof_required';
    end if;
    if array_length(proof_image_urls_in, 1) > 5 then
      raise exception 'too_many_proof_images';
    end if;
    insert into public.task_claims (user_id, task_id, status, proof_image_urls)
      values (auth.uid(), task_id_in, 'pending', proof_image_urls_in);
    return;
  end if;

  if t.requirement_type = 'comments' then
    select count(*) into progress_count from public.comments where user_id = auth.uid();
  elsif t.requirement_type = 'chapters_read' then
    select coalesce(sum(coalesce(array_length(read_chapters, 1), 0)), 0) into progress_count
      from public.reading_progress where user_id = auth.uid();
  elsif t.requirement_type = 'manga_chapters' then
    select coalesce(sum(coalesce(array_length(read_chapters, 1), 0)), 0) into progress_count
      from public.reading_progress where user_id = auth.uid() and manga_id = t.target_manga_id;
  else
    raise exception 'unknown_requirement_type';
  end if;

  if progress_count < t.requirement_count then
    raise exception 'not_enough_progress';
  end if;

  insert into public.task_claims (user_id, task_id, status) values (auth.uid(), task_id_in, 'approved');

  if t.reward_type = 'vip_days' then
    select case
             when u.is_vip and u.vip_expires_at is not null and u.vip_expires_at > now()
             then u.vip_expires_at
             else now()
           end
      into base from public.users u where u.id = auth.uid();
    update public.users
      set is_vip = true, vip_expires_at = base + (coalesce(t.reward_vip_days, 1) || ' days')::interval
      where id = auth.uid();
  else
    update public.users set flower_balance = flower_balance + t.reward_flowers where id = auth.uid();
  end if;
end;
$$;

grant execute on function public.claim_task(bigint, text[]) to authenticated;

create or replace function public.approve_task_claim(user_id_in uuid, task_id_in bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  c record;
  base timestamptz;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'moderator']) then
    raise exception 'Зөвхөн admin/moderator батлах эрхтэй';
  end if;

  select * into c from public.task_claims where user_id = user_id_in and task_id = task_id_in for update;
  if c is null then
    raise exception 'Хvсэлт олдсонгvй';
  end if;
  if c.status = 'approved' then
    raise exception 'already_approved';
  end if;

  select * into t from public.tasks where id = task_id_in;

  update public.task_claims set status = 'approved' where user_id = user_id_in and task_id = task_id_in;

  if t.reward_type = 'vip_days' then
    select case
             when u.is_vip and u.vip_expires_at is not null and u.vip_expires_at > now()
             then u.vip_expires_at
             else now()
           end
      into base from public.users u where u.id = user_id_in;
    update public.users
      set is_vip = true, vip_expires_at = base + (coalesce(t.reward_vip_days, 1) || ' days')::interval
      where id = user_id_in;
  else
    update public.users set flower_balance = flower_balance + t.reward_flowers where id = user_id_in;
  end if;
end;
$$;

grant execute on function public.approve_task_claim(uuid, bigint) to authenticated;

-- ========================================================================
-- 3) direct_messages: read-only trigger-ийг хасах
-- ========================================================================
drop trigger if exists trg_enforce_dm_recipient_read_only on public.direct_messages;
drop function if exists public.enforce_dm_recipient_read_only();
