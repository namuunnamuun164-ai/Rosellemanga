-- ЗАСВАР (код аюулгvй байдлын шинжилгээ #2): migration_28 нь зөвхөн
-- public.users (avatar_url/sticker_1-6) баганад л IP-logger URL хамгаалалт
-- тавьсан байсан. Ижил эрсдэл (хэрэглэгчийн бичсэн URL-г бусад хэрэглэгч
-- эсвэл staff <img>-ээр харах vед IP/цаг задрах) дараах баганад ч мөн адил
-- байсаар байгаа тул энд өргөтгөв:
--   • public.comments.sticker_url
--   • public.direct_messages.sticker_url
--   • public.chat_messages.sticker_url
--   • public.feedback.image_url
--   • public.task_claims.proof_image_url, proof_image_urls[] (staff
--     даалгаврын нотолгоо зургийг харна)
--
-- ⚠️ АНХААР — migration_28-тай АДИЛ: ЭНЭ ФАЙЛЫГ ШУУД АЖИЛЛУУЛЖ БОЛОХГvЙ.
-- Доорх хоёр функцийн "prefix" мөрийг ЭХЛЭЭД өөрийн бодит
-- R2_PUBLIC_BASE_URL-аар (migration_28-д аль хэдийн ашигласантай ЯГ ИЖИЛ
-- утгаар) СОЛИОГvй бол ажиллуулмагц бvх stiker/зураг upload шууд тасрана.
-- Prefix-ээ баталгаажуулсны дараа Supabase Dashboard → SQL Editor-т ГАРААР
-- ажиллуулна уу.

create or replace function public.enforce_media_url_prefix_cols()
returns trigger
language plpgsql
as $$
declare
  prefix text := 'https://ТАНЫ_R2_PUBLIC_BASE_URL/'; -- ⚠️ өөрийн R2 домэйноор СОЛИНО
  col text;
  i int;
begin
  for i in 0 .. tg_nargs - 1 loop
    col := tg_argv[i];
    if (to_jsonb(new)->>col) is not null and position(prefix in (to_jsonb(new)->>col)) <> 1 then
      raise exception 'Зөвхөн сайтын өөрийн зургийн хаяг зөвшөөрөгдөнө';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_enforce_media_url on public.comments;
create trigger trg_enforce_media_url before insert or update on public.comments
  for each row execute function public.enforce_media_url_prefix_cols('sticker_url');

drop trigger if exists trg_enforce_media_url on public.direct_messages;
create trigger trg_enforce_media_url before insert or update on public.direct_messages
  for each row execute function public.enforce_media_url_prefix_cols('sticker_url');

drop trigger if exists trg_enforce_media_url on public.chat_messages;
create trigger trg_enforce_media_url before insert or update on public.chat_messages
  for each row execute function public.enforce_media_url_prefix_cols('sticker_url');

drop trigger if exists trg_enforce_media_url on public.feedback;
create trigger trg_enforce_media_url before insert or update on public.feedback
  for each row execute function public.enforce_media_url_prefix_cols('image_url');

drop trigger if exists trg_enforce_media_url on public.task_claims;
create trigger trg_enforce_media_url before insert or update on public.task_claims
  for each row execute function public.enforce_media_url_prefix_cols('proof_image_url');

-- proof_image_urls нь text[] (массив) тул элемент бvрийг тус тус шалгах
-- тусдаа функц шаардлагатай.
create or replace function public.enforce_media_url_prefix_array_cols()
returns trigger
language plpgsql
as $$
declare
  prefix text := 'https://ТАНЫ_R2_PUBLIC_BASE_URL/'; -- ⚠️ өөрийн R2 домэйноор СОЛИНО
  col text;
  i int;
  elem text;
begin
  for i in 0 .. tg_nargs - 1 loop
    col := tg_argv[i];
    if to_jsonb(new)->col is not null then
      for elem in select jsonb_array_elements_text(to_jsonb(new)->col) loop
        if elem is not null and position(prefix in elem) <> 1 then
          raise exception 'Зөвхөн сайтын өөрийн зургийн хаяг зөвшөөрөгдөнө';
        end if;
      end loop;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_enforce_media_url_array on public.task_claims;
create trigger trg_enforce_media_url_array before insert or update on public.task_claims
  for each row execute function public.enforce_media_url_prefix_array_cols('proof_image_urls');
