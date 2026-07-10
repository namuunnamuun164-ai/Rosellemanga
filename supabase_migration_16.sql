-- ЗАСВАР #131: сайт даяар 1 Gmail хайрцагт (цэг/+alias-аар ялгаатай ч бодит
-- байдал дээр ижил инбокс руу очдог) 1-Л хэрэглэгч бvртгvvлж болохоор
-- бvртгvvлэх (auth.signUp) vеийн шалгалтыг сервер талд (DB trigger) хийв —
-- зөвхөн admin/moderator/editor эрх олгох vеийн шалгалт (migration_14/App.jsx)
-- хангалтгvй байсан, учир нь энгийн хэрэглэгчийн бvртгvvлэлт vvгээр
-- шалгагддаггvй байсан. Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.
--
-- Анхаар: Supabase-ийн Auth сервер (GoTrue) заримдаа энэ trigger-ээс гарсан
-- тодорхой мессежийг клиент рvv шууд дамжуулахгvй, харин ерөнхий "Database
-- error saving new user" гэсэн алдаа vзvvлж болзошгvй (Supabase-ийн хувилбараас
-- хамаарна) — гэхдээ ямар ч тохиолдолд ДАВХАР бvртгэл vvсэхгvй, signUp
-- амжилтгvй болно.

create or replace function public.normalize_gmail(input_email text)
returns text
language plpgsql
immutable
as $$
declare
  local_part text;
  domain_part text;
  at_pos int;
begin
  if input_email is null then return null; end if;
  at_pos := position('@' in input_email);
  if at_pos = 0 then return lower(input_email); end if;
  local_part := lower(left(input_email, at_pos - 1));
  domain_part := lower(right(input_email, length(input_email) - at_pos));
  if domain_part in ('gmail.com', 'googlemail.com') then
    domain_part := 'gmail.com';
    local_part := split_part(local_part, '+', 1);
    local_part := replace(local_part, '.', '');
  end if;
  return local_part || '@' || domain_part;
end;
$$;

create or replace function public.prevent_duplicate_gmail()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from auth.users u
    where u.id <> new.id
      and public.normalize_gmail(u.email) = public.normalize_gmail(new.email)
  ) then
    raise exception 'Энэ Gmail хаягаар (өөр бичлэгээр ч гэсэн, жишээ нь цэг/+alias) аль хэдийн бүртгэлтэй хэрэглэгч байна.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_gmail on auth.users;
create trigger trg_prevent_duplicate_gmail
  before insert on auth.users
  for each row execute function public.prevent_duplicate_gmail();
