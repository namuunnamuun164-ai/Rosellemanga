-- ЗАСВАР (хэрэглэгчийн хvсэлт): "гараар" (manual) даалгаврыг зураг
-- баталгаажуулалтгvйгээр ч vvсгэх боломжтой байсан тул зарим тохиолдолд
-- хэрэглэгч зvгээр л "БИЕЛvvЛЛЭЭ" дараад (баталгаажуулах зvйлгvйгээр)
-- admin-ий батламжийг хvлээж эхэлдэг байв — гэхдээ энэ нь хvнд итгэлцлээр
-- шалгагддаг тул амархан "худал мэдэгдэх" боломжтой мэт мэдрэгддэг байсан.
-- Одоо MANUAL төрлийн ДАРААГИЙН даалгавар бvр ЗААВАЛ баталгаажуулах зураг
-- шаардана (admin "заавал биш" гэж сонгосон ч vл харгалзан) — task_claims
-- мөр бvр аль хэдийн admin/moderator-ийн нvдээр шалгагддаг хэвээр байгаа тул
-- зурагтай хамт vзэж шийднэ.

drop function if exists public.claim_task(bigint, text);

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
    -- ЗАСВАР: цаашид manual даалгавар бvр ЗААВАЛ зурагтай байна (requires_proof
    -- баганаас vл хамаарна).
    if proof_image_url_in is null or length(trim(proof_image_url_in)) = 0 then
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
