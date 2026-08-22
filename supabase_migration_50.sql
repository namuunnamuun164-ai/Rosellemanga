-- ШИНЭ (хэрэглэгчийн хvсэлт): "Даалгавар"-т ГАРААР (сэтгэгдэл/бvлэг тоолохгvйгээр)
-- "Биелvvллээ" гэж тэмдэглэдэг төрөл нэмнэ — ийм даалгаврыг admin/moderator
-- нэг товчоор баталгаажуулснаар цэцэг олгогдоно (шууд бус, хуурахаас хамгаална).

alter table public.tasks
  drop constraint if exists tasks_requirement_type_check;
alter table public.tasks
  add constraint tasks_requirement_type_check check (requirement_type in ('comments', 'chapters_read', 'manual'));

alter table public.task_claims add column if not exists status text not null default 'approved';
alter table public.task_claims
  drop constraint if exists task_claims_status_check;
alter table public.task_claims
  add constraint task_claims_status_check check (status in ('pending', 'approved'));

-- ЗАСВАР: admin/moderator batalgaajуулах жагсаалтдаа бvх хэрэглэгчийн
-- task_claims-ийг харах шаардлагатай тул select policy-г өргөтгөв.
drop policy if exists "task_claims_select_own" on public.task_claims;
drop policy if exists "task_claims_select_own_or_staff" on public.task_claims;
create policy "task_claims_select_own_or_staff" on public.task_claims for select
  using (auth.uid() = user_id or public.has_any_role(auth.uid(), array['admin', 'moderator']));

-- ЗАСВАР: manual төрлийн даалгаврыг шууд (баталгаажуулалтгvйгээр) "pending"
-- төлөвтэй тэмдэглэнэ — шагналыг admin/moderator баталсны дараа л олгоно.
create or replace function public.claim_task(task_id_in bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  progress_count int;
begin
  select * into t from public.tasks where id = task_id_in and is_active;
  if t is null then
    raise exception 'Даалгавар олдсонгvй';
  end if;

  if exists (select 1 from public.task_claims where user_id = auth.uid() and task_id = task_id_in) then
    raise exception 'already_claimed';
  end if;

  if t.requirement_type = 'manual' then
    insert into public.task_claims (user_id, task_id, status) values (auth.uid(), task_id_in, 'pending');
    return;
  end if;

  if t.requirement_type = 'comments' then
    select count(*) into progress_count from public.comments where user_id = auth.uid();
  elsif t.requirement_type = 'chapters_read' then
    select coalesce(sum(coalesce(array_length(read_chapters, 1), 0)), 0) into progress_count
      from public.reading_progress where user_id = auth.uid();
  else
    raise exception 'unknown_requirement_type';
  end if;

  if progress_count < t.requirement_count then
    raise exception 'not_enough_progress';
  end if;

  insert into public.task_claims (user_id, task_id, status) values (auth.uid(), task_id_in, 'approved');

  update public.users
    set flower_balance = flower_balance + t.reward_flowers
    where id = auth.uid();
end;
$$;

grant execute on function public.claim_task(bigint) to authenticated;

-- ЗАСВАР: admin/moderator "гараар биелvvлсэн" мэдэгдлийг баталж, зөвхөн ТЭР vед л цэцэг олгоно.
create or replace function public.approve_task_claim(user_id_in uuid, task_id_in bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  c record;
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

  update public.users
    set flower_balance = flower_balance + t.reward_flowers
    where id = user_id_in;
end;
$$;

grant execute on function public.approve_task_claim(uuid, bigint) to authenticated;

create or replace function public.reject_task_claim(user_id_in uuid, task_id_in bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_any_role(auth.uid(), array['admin', 'moderator']) then
    raise exception 'Зөвхөн admin/moderator татгалзах эрхтэй';
  end if;

  delete from public.task_claims where user_id = user_id_in and task_id = task_id_in and status = 'pending';
end;
$$;

grant execute on function public.reject_task_claim(uuid, bigint) to authenticated;
