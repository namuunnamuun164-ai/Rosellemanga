-- ШИНЭ (хэрэглэгчийн хvсэлт): Даалгаврын системийг vргэлжлvvлэн өргөтгөв —
--   1) "manga_chapters" төрөл — ТОДОРХОЙ НЭГ манганаас N бvлэг унших.
--   2) "manual" төрлийн даалгаварт баталгаажуулах ЗУРАГ хавсаргах шаардлага
--      (requires_proof) сонголт.
--   3) Шагналын төрөл (reward_type) — 💐 цэцэг эсвэл 👑 VIP хоног шууд өгөх.

alter table public.tasks add column if not exists target_manga_id bigint references public.mangas(id) on delete set null;
alter table public.tasks add column if not exists requires_proof boolean not null default false;
alter table public.tasks add column if not exists reward_type text not null default 'flowers';
alter table public.tasks add column if not exists reward_vip_days int;

alter table public.tasks
  drop constraint if exists tasks_requirement_type_check;
alter table public.tasks
  add constraint tasks_requirement_type_check check (requirement_type in ('comments', 'chapters_read', 'manga_chapters', 'manual'));

alter table public.tasks
  drop constraint if exists tasks_reward_type_check;
alter table public.tasks
  add constraint tasks_reward_type_check check (reward_type in ('flowers', 'vip_days'));

alter table public.task_claims add column if not exists proof_image_url text;

-- ЗАСВАР: manga_chapters төрөлд requirement_count > 0 шалгалт хэвээрээ хvчинтэй
-- (тухайн constraint аль хэдийн байгаа тул нэмж өөрчлөх шаардлагагvй).

create or replace function public.claim_task(task_id_in bigint, proof_image_url_in text default null)
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
    if t.requires_proof and (proof_image_url_in is null or length(trim(proof_image_url_in)) = 0) then
      raise exception 'proof_required';
    end if;
    insert into public.task_claims (user_id, task_id, status, proof_image_url)
      values (auth.uid(), task_id_in, 'pending', proof_image_url_in);
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

grant execute on function public.claim_task(bigint, text) to authenticated;

-- ЗАСВАР: шагналыг reward_type-аас хамааруулж (цэцэг эсвэл VIP хоног) олгоно.
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
