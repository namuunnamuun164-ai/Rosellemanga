-- ЗАСВАР #163 (код шинжилгээ) — 🟠 HIGH #6: avatar_url / sticker_1-6 баганад
-- хэрэглэгч REST-ээр шууд ДУРЫН гадаад URL (жишээ нь IP logger зураг) тавьж
-- болдог — тэр зургийг сэтгэгдэл харсан бусад хэрэглэгчийн browser ачаалж,
-- IP/цагийг гадны серверт задруулах вектор vvсгэнэ.
--
-- ⚠️ АНХААР — ЭНЭ ФАЙЛЫГ ШУУД АЖИЛЛУУЛЖ БОЛОХГvЙ. Доорх "prefix" мөрийг
-- ЭХЛЭЭД өөрийн бодит R2_PUBLIC_BASE_URL-аар (Cloudflare R2 secret-д
-- тохируулсан утга, жишээ нь https://pub-xxxxxxxx.r2.dev/ эсвэл өөрийн custom
-- domain) СОЛИОГvй бол ажиллуулмагц бvх хэрэглэгчийн avatar/sticker upload
-- шууд тасарна (буруу prefix танигдахгvй тул). Prefix-ээ баталгаажуулсны
-- дараа Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

create or replace function public.enforce_media_url_prefix()
returns trigger
language plpgsql
as $$
declare
  prefix text := 'https://ТАНЫ_R2_PUBLIC_BASE_URL/'; -- ⚠️ өөрийн R2 домэйноор СОЛИНО
  col text;
begin
  foreach col in array array['avatar_url','sticker_1','sticker_2','sticker_3','sticker_4','sticker_5','sticker_6'] loop
    if (to_jsonb(new)->>col) is not null and position(prefix in (to_jsonb(new)->>col)) <> 1 then
      raise exception 'Зөвхөн сайтын өөрийн зургийн хаяг зөвшөөрөгдөнө';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_enforce_media_url on public.users;
create trigger trg_enforce_media_url before insert or update on public.users
  for each row execute function public.enforce_media_url_prefix();
