-- ШИНЭ (хэрэглэгчийн хvсэлт): "Санал хvсэлт" хуудсанд зөвхөн идэвхтэй VIP
-- хэрэглэгчдэд харагдах "Admin дэмжих" (хандив мэдэгдэх) хэсэг. feedback
-- хvснэгтийг vргэлжлvvлэн ашиглаж, шинэ category='donation' нэмнэ.

alter table public.feedback
  drop constraint if exists feedback_category_check;
alter table public.feedback
  add constraint feedback_category_check check (category in ('suggestion', 'complaint', 'request', 'team', 'donation'));
