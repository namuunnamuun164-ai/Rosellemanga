-- ШИНЭ (хэрэглэгчийн хvсэлт — гvйцэтгэлийн сайжруулалт): "Нийтийн чат" /
-- "Админуудын чат" болон хувийн зурвас (DM) хуудсуудад 4 секунд тутамд
-- бvтэн жагсаалт дахин татдаг polling-ийн оронд Supabase Realtime
-- (WebSocket, зөвхөн бодит шинэ/устсан мөр vед л event ирнэ) ашиглахаар
-- App.jsx-г шинэчлэв. Realtime ажиллахын тулд эдгээр хvснэгтийг
-- "supabase_realtime" publication-д нэмэх шаардлагатай.

alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.direct_messages;

-- АНХААР: дээрх коммандууд аль хэдийн нэмэгдсэн бол алдаа заана
-- ("relation already member of publication") — тэр тохиолдолд зvгээр
-- vvнийг vл тоож vргэлжлvvлээрэй, аль хэдийн зөв тохируулагдсан гэсэн vг.
--
-- Мөн Supabase Dashboard → Database → Replication хэсэгт ороод,
-- "chat_messages" болон "direct_messages" хvснэгтvvдийн эсрэг Realtime
-- (INSERT/DELETE) идэвхтэй эсэхийг нvдээр давхар шалгаарай.
