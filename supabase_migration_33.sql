-- ЗАСВАР (хэрэглэгчийн хvсэлт): 1 хэрэглэгч зэрэг олон "pending" (шалгагдаж
-- буй) төлбөрийн хvсэлт vvсгэж болдог байсан — App.jsx-д client талын шалгалт
-- нэмсэн ч, олон tab/хурдан давхар дарах гэх мэт race condition-оос бvрэн
-- хамгаалахын тулд DB талд партиал (зөвхөн pending мөрvvдэд хамаарах) unique
-- index нэмнэ. Хэрэглэгч НЭГ ЛДAA зөвхөн 1 pending хvсэлттэй байж чадна —
-- admin батлах/цуцлах (status өөрчлөгдмөгц) дараа л дараагийн хvсэлтээ явуулж болно.

-- Хэрэв энэ мөр "could not create unique index... duplicate key value" гэсэн
-- алдаагаар унавал, эхлээд давхардсан pending мөрvvдийг олж (доорх query-г
-- SQL Editor-т ажиллуулж vзнэ vv) гараар цэвэрлэсний дараа дахин ажиллуулна:
--   select user_id, count(*) from public.payment_requests
--   where status = 'pending' group by user_id having count(*) > 1;

create unique index if not exists payment_requests_one_pending_per_user
  on public.payment_requests (user_id)
  where status = 'pending';
