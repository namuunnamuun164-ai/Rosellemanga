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

// ЗАСВАР #129: Gmail нь local part дахь цэг (.) болон "+alias"-ыг vл тооцдог
// (жишээ нь "u.ser+work@gmail.com" == "user@gmail.com" яг ижил хайрцаг руу очно).
// Admin/moderator/editor эрх олгохоос өмнө нэг хvн ижил Gmail хайрцгаараа олон
// бvртгэл vvсгэж давхар staff болохоос сэргийлэхийн тулд харьцуулалтад ашиглана.
export const normalizeGmailEmail = (email) => {
  if (!email) return '';
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (!domain) return email.trim().toLowerCase();
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return local.split('+')[0].replace(/\./g, '') + '@gmail.com';
  }
  return `${local}@${domain}`;
};

// ЗАСВАР #139: манганы vзэлт (views) хиймлээр өсгөхөөс сэргийлэх зорилгоор
// increment_manga_views RPC-д зочин (нэвтрээгvй) хэрэглэгчийг ялгах тогтвортой
// (browser-д хадгалагдсан) key дамжуулна — нэвтэрсэн бол сервер талд auth.uid()
// ашиглах тул vvнийг үл хэрэглэнэ, харин зочинд өөр аргагvй тул хэрэгтэй.
export const getAnonViewerKey = () => {
  try {
    let key = localStorage.getItem('anon_viewer_key');
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem('anon_viewer_key', key);
    }
    return key;
  } catch {
    return '';
  }
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

// ЗАСВАР #163: "Хуваах" горим — 4000px-ээс өндөр (урт) зургийг тэр өндрөөр нь
// (өргөнийг vл өөрчлөн) олон хэсэг болгож таслана. 4000px-ээс богино/тэнцvv
// зургийг vл хөндөж, нэг элементтэй массив (өөрөө) хэвээр буцаана. Зургуудыг
// НЭГ НЭГЭЭР нь (Promise.all биш) дараалуулж дуудахыг зөвлөнө — эс бол олон
// том зургийг зэрэг декодлож санах ойн ачаалал vvсгэнэ (өмнөх ЗАСВАР #163-ийн
// urt зургийн crash-тай адил асуудал).
export const splitTallImageFile = async (file, maxHeight = 4000) => {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  if (height <= maxHeight) {
    bitmap.close?.();
    return [file];
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const mimeType = file.type || (ext === 'png' ? 'image/png' : 'image/jpeg');
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  const ctx = canvas.getContext('2d');

  const pieces = [];
  let y = 0;
  let partIndex = 1;
  while (y < height) {
    const pieceHeight = Math.min(maxHeight, height - y);
    canvas.height = pieceHeight;
    ctx.clearRect(0, 0, width, pieceHeight);
    ctx.drawImage(bitmap, 0, y, width, pieceHeight, 0, 0, width, pieceHeight);
    // eslint-disable-next-line no-await-in-loop
    const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.92));
    pieces.push(new File([blob], `${baseName}-p${partIndex}.${ext}`, { type: mimeType }));
    y += pieceHeight;
    partIndex += 1;
  }
  bitmap.close?.();
  return pieces;
};

// ЗАСВАР #146: "цаг:минут:секунд" (жишээ нь 12:15:28) маягийн цэвэрхэн тоон
// countdown формат — хуваарийн хуудсанд секунд тутам шинэчлэгдэж харагдана
export const formatCountdownClock = (ms) => {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
};
