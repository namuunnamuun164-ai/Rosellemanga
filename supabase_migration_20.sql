-- ЗАСВАР #136: аюулгvй байдлын шалгалтаар илэрсэн MEDIUM цоорхойг (Issue #4) засав —
-- "mangas_update_moderate" policy (ЗАСВАР #126, migration_14) admin болон
-- moderator хоёуланд mangas хvснэгтийн БvХ баганыг (title, desc, is_hidden
-- гэх мэт) засах эрх өгдөг. Энэ өөрөө зөв (moderator title/is_hidden засах
-- ёстой), ГЭХДЭЭ "is_recommended" (нvvр хэсгийн "САНАЛ БОЛГОХ" hero) UI дээр
-- ЗӨВХӨН isAdmin-д харагддаг тул RLS-ээр ч мөн admin-аар хязгаарлах ёстой —
-- эс бол moderator шууд (Network tab-аар) .update({is_recommended:true})
-- дуудаж, admin-ийн зөвшөөрөлгvйгээр дурын мангаг hero-д гаргаж чадна байсан.
--
-- ШИЙДЭЛ: mangas_update_moderate policy-г (мөн moderator-ийн бусад бvх эрхийг)
-- ХЭВЭЭР vлдээгээд, зөвхөн "is_recommended" баганыг users хvснэгт дэх
-- roles/is_vip/email-тэй адил trigger-ээр хамгаалав — admin биш хэн ч
-- (moderator ч оролцуулаад) энэ баганыг өөрчилбол чимээгvй хуучин утга руугаа
-- буцна. Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

create or replace function public.prevent_unauthorized_manga_recommend()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_recommended is distinct from old.is_recommended then
    if auth.uid() is not null and not public.has_any_role(auth.uid(), array['admin']) then
      new.is_recommended := old.is_recommended;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_unauthorized_manga_recommend on public.mangas;
create trigger trg_prevent_unauthorized_manga_recommend
  before update on public.mangas
  for each row execute function public.prevent_unauthorized_manga_recommend();
