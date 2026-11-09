-- ЗАСВАР (хэрэглэгчийн хvсэлт): "Vнэгvй" (is_free) тэмдгийг admin-аас гадна
-- moderator ч тавьж/цуцалж болдог болгов (migration_64-ийн trigger-ийг солино).
-- editor болон бусад хэрэглэгч өөрчилбөл чимээгvй хуучин (insert vед false)
-- утга руугаа буцсаар байна.
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу (migration_64-ийн дараа).

create or replace function public.prevent_unauthorized_manga_free()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.has_any_role(auth.uid(), array['admin','moderator']) then
    if tg_op = 'INSERT' then
      new.is_free := false;
    elsif new.is_free is distinct from old.is_free then
      new.is_free := old.is_free;
    end if;
  end if;
  return new;
end;
$$;
