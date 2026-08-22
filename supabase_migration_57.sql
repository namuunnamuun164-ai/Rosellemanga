-- ШИНЭ (хэрэглэгчийн хvсэлт): "манал" даалгаврын баталгаажуулах зургийг
-- ганцхан биш, дээд тал нь 5 хvртэл зэрэг оруулах боломжтой болгов.

alter table public.task_claims add column if not exists proof_image_urls text[];

-- ЗАСВАР: claim_task-ийн 2 дахь параметр (proof_image_url_in text) →
-- (proof_image_urls_in text[]) болж өөрчлөгдсөн тул эхлээд хуучин функцийг
-- drop хийнэ (параметрийн ТӨРӨЛ өөрчлөгдсөн vед create or replace ажилладаггvй).
drop function if exists public.claim_task(bigint, text);

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
