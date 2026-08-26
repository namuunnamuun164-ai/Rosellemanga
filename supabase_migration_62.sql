-- ЗАСВАР (хэрэглэгчийн мэдэгдсэн алдаа): "ЭРХ ОЛГОХ" маягтаар admin нэг хэрэглэгчид
-- жишээ нь зөвхөн "shaana" checkbox-ыг чагтлаад илгээхэд, тэр хэрэглэгчийн ӨМНӨХ
-- бусад эрх (moderator/editor/admin) БvГД арилж (заримдаа admin эрх нь ч алдагдаж
-- удирдлагын хуудас бvр гарахгvй болдог байсан) — учир нь admin_grant_roles нь
-- "roles = new_roles" гэж БvХЭЛД нь REPLACE хийдэг, харин checkbox форм өмнөх эрхийг
-- урьдчилан ачаалж харуулдаггvй байсан тул admin өөрийн мэдэлгvй бусад эрхийг арилгадаг
-- байв. Одоо admin_lookup_user_by_email нь тухайн хэрэглэгчийн ОДООГИЙН roles-г ч
-- буцаадаг болгож, App.jsx-ийн имэйл талбар дээр checkbox-уудыг урьдчилан чагталгуулна.

drop function if exists public.admin_lookup_user_by_email(text);

create or replace function public.admin_lookup_user_by_email(lookup_email text)
returns table(id uuid, email text, is_vip boolean, vip_expires_at timestamptz, roles text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_any_role(auth.uid(), array['admin']) then
    raise exception 'Зөвхөн admin энэ vйлдлийг хийж болно.';
  end if;
  return query
    select u.id, au.email::text, u.is_vip, u.vip_expires_at, coalesce(u.roles, array[]::text[])
    from auth.users au
    join public.users u on u.id = au.id
    where lower(au.email) = lower(trim(lookup_email))
    limit 1;
end;
$$;

grant execute on function public.admin_lookup_user_by_email(text) to authenticated;
