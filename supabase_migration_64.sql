-- ШИНЭ (хэрэглэгчийн хvсэлт): "Vнэгvй" манга — admin манга нэмэх/засахдаа
-- "Vнэгvй" гэж тэмдэглэвэл нvvр хуудасны хамгийн доод "VНЭГVЙ" мөрөнд
-- харагдана.
--
-- is_recommended-тэй (migration_20) адил зөвхөн admin л энэ баганыг тавьж/
-- цуцалж болно — moderator/editor шууд (Network tab-аар) insert/update
-- хийвэл чимээгvй хуучин (insert vед false) утга руугаа буцна.
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

alter table public.mangas add column if not exists is_free boolean not null default false;

create or replace function public.prevent_unauthorized_manga_free()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.has_any_role(auth.uid(), array['admin']) then
    if tg_op = 'INSERT' then
      new.is_free := false;
    elsif new.is_free is distinct from old.is_free then
      new.is_free := old.is_free;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_unauthorized_manga_free on public.mangas;
create trigger trg_prevent_unauthorized_manga_free
  before insert or update on public.mangas
  for each row execute function public.prevent_unauthorized_manga_free();
