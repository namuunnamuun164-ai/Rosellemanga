-- ЗАСВАР #125: Бvлэг устгах эрхийг зэрэглэнэ — admin шууд устгана (R2-с бодит
-- файлын хамт), харин moderator/editor дарахад ЗӨВХӨН ХvСЭЛТ vvсгэж, admin
-- баталгаажуулах хvртэл хvлээнэ (уг хугацаанд энгийн уншигчид харагдахгvй).
-- Supabase Dashboard → SQL Editor-т ГАРААР ажиллуулна уу.

alter table public.chapters add column if not exists pending_delete boolean not null default false;
alter table public.chapters add column if not exists delete_requested_by uuid references public.users(id) on delete set null;
alter table public.chapters add column if not exists delete_requested_at timestamptz;
