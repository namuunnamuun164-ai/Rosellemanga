-- ЗАСВАР #163: admin-ий "📊 СТАТИСТИК" таб — өдрийн аль цагт хамгийн их
-- уншигддагийг харуулах RPC. Зөвхөн admin дуудаж болно (function дотроо шалгана).
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

create or replace function public.admin_views_by_hour(days_back int default 30)
returns table(hour_of_day int, view_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_any_role(auth.uid(), array['admin']) then
    raise exception 'Зөвхөн admin энэ vйлдлийг хийж болно.';
  end if;
  return query
    select extract(hour from (e.viewed_at at time zone 'Asia/Ulaanbaatar'))::int as hour_of_day,
           count(*) as view_count
    from public.manga_view_events e
    where e.viewed_at > now() - (days_back || ' days')::interval
    group by 1
    order by 1;
end;
$$;

grant execute on function public.admin_views_by_hour(int) to authenticated;
