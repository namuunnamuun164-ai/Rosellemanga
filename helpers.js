// Component state-ээс хамааралгvй туслах (pure) функцvvд + upload helper

import { supabase } from './supabase';

// ЗАСВАР #11: upload хийхийн өмнө файлын төрлийг шалгах нэг цэгтэй функц
// (өмнө нь <input accept="image/*"> л байсан бөгөөд энэ нь зөвхөн UI-д зориулсан
// зөвлөмж тул хэрэглэгч ямар ч файл сонгож upload хийж болдог байсан).
// ЗАСВАР #17: хэмжээний (8MB) хязгаарлалтыг хассан — жинхэнэ hosting (Supabase
// Storage) холбогдсон тул бүлгийн өндөр чанартай том зургийг хориглох шаардлагагүй.
export const validateImageFile = (file) => {
  if (!file) return 'Файл сонгогдоогүй байна.';
  if (!file.type.startsWith('image/')) return 'Зөвхөн зургийн файл (jpg, png, webp г.м.) оруулна уу.';
  return null;
};

// ЗАСВАР #94: зургийн upload-ыг Supabase Storage-с Cloudflare R2 руу шилжүүлэв
// (upload-to-r2 edge function-оор дамжуулж, Secret Access Key browser талд гардаггүй).
export const uploadToR2 = async (file, path) => {
  const { data: { session } } = await supabase.auth.getSession();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', path);
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-to-r2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload алдаа гарлаа');
  return data.publicUrl;
};

// ЗАСВАР #125: R2 дээрх бодит файлыг устгах (зөвхөн админ, серверт дахин шалгагдана).
// urls нь uploadToR2-с буцсан бvтэн public URL-ууд байна — path-ыг нь server
// талд R2_PUBLIC_BASE_URL-аар нь тайрч тооцно.
export const deleteFromR2 = async (urls) => {
  if (!urls || urls.length === 0) return;
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-to-r2`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Устгах алдаа гарлаа');
  return data;
};

// "2026 оны 6-р сарын 25" маягийн огноо
export const formatMnDate = (dateStr) => {
  const d = new Date(dateStr);
  return `${d.getFullYear()} оны ${d.getMonth() + 1}-р сарын ${d.getDate()}`;
};

// ЗАСВАР #68: "2026.07.13" маягийн цэвэрхэн тоон огноо (бүлгийн жагсаалтад ашиглана)
export const formatNumericDate = (dateStr) => {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
};

// Үлдсэн хугацааг "2 өдөр 3 цаг" маягаар
export const formatRemaining = (ms) => {
  if (ms <= 0) return '';
  const mins = Math.ceil(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return `${days} өдөр ${hours} цаг`;
  if (hours > 0) return `${hours} цаг ${m} мин`;
  return `${m} мин`;
};
