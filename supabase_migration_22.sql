-- ЗАСВАР #139: аюулгvй байдлын шалгалтаар илэрсэн MEDIUM цоорхойг (Issue #8) засав —
-- increment_manga_views() ямар ч хязгаарлалтгvй, хэн ч (нэвтрээгvй хvн ч)
-- давтан дуудаад манганы vзэлт/"Санал болгох" эрэмбийг хvссэнээрээ өсгөж
-- чаддаг байсан. Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.
--
-- ШИЙДЭЛ: manga_view_events-д "viewer_key" багана нэмж, тухайн (манга,
-- vзэгч) хослол сvvлийн 30 минутад аль хэдийн бvртгэгдсэн бол дахин
-- тоолохгvй болгов.
--   - Нэвтэрсэн хэрэглэгчид: viewer_key нь auth.uid() (хуурамчаар vvсгэх
--     боломжгvй, JWT-ээр баталгаажсан) — клиентээс ямар ч утга дамжуулсан
--     хамаагvй vvнийг ашиглана.
--   - Зочин (нэвтрээгvй) vзэгчид: browser-д тогтвортой хадгалагдсан санамсаргvй
--     key (клиентээс дамжина) ашиглана — script нэг key-ээр давтан дуудвал
--     хориглогдоно (шинэ key бvрийг дур мэдэн зохиох боломжтой хэн нэгнээс
--     100% хамгаалахгvй ч, "lightweight" зорилготой давхцахгvй давхардлыг хаана).
-- top_manga_last_days() нь зөвхөн manga_id/viewed_at ашигладаг тул шинэ
-- баганаас vл хамааран одоогийнхоороо (ижил үр дvнтэй) vргэлжлэн ажиллана.

alter table public.manga_view_events add column if not exists viewer_key text;

create index if not exists manga_view_events_dedup_idx
  on public.manga_view_events (manga_id, viewer_key, viewed_at);

drop function if exists public.increment_manga_views(bigint);
create or replace function public.increment_manga_views(input_id bigint, viewer_key text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_key text;
  recent_count int;
begin
  effective_key := coalesce(auth.uid()::text, nullif(trim(viewer_key), ''));
  if effective_key is null then
    return;
  end if;

  select count(*) into recent_count
  from public.manga_view_events e
  where e.manga_id = input_id
    and e.viewer_key = effective_key
    and e.viewed_at > now() - interval '30 minutes';

  if recent_count > 0 then
    return;
  end if;

  update public.mangas set views = views + 1 where id = input_id;
  insert into public.manga_view_events (manga_id, viewer_key) values (input_id, effective_key);
end;
$$;

grant execute on function public.increment_manga_views(bigint, text) to anon, authenticated;
