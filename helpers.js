// Component state-ээс хамааралгvй туслах (pure) функцvvд + upload helper

import { supabase } from './supabase';

// ЗАСВАР #11: upload хийхийн өмнө файлын төрлийг шалгах нэг цэгтэй функц
// (өмнө нь <input accept="image/*"> л байсан бөгөөд энэ нь зөвхөн UI-д зориулсан
// зөвлөмж тул хэрэглэгч ямар ч файл сонгож upload хийж болдог байсан).
// ЗАСВАР #17: хэмжээний (8MB) хязгаарлалтыг хассан — жинхэнэ hosting (Supabase
// Storage) холбогдсон тул бvлгийн өндөр чанартай том зургийг хориглох шаардлагагvй.
// ЗАСВАР #181 (код шинжилгээ): "image/*" бvгдийг зөвшөөрдөг байсан тул
// image/svg+xml ч нэвтэрдэг байв — SVG дотор <script> байж болох тул (R2-ийн
// public URL-ыг шууд нээхэд ажиллана) stored XSS эрсдэлтэй. Зөвшөөрөгдсөн
// төрлийг сервер (upload-to-r2 edge function) талын allowlist-той адилхан болгов.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const validateImageFile = (file) => {
  if (!file) return 'Файл сонгогдоогvй байна.';
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'Зөвхөн зургийн файл (jpg, png, webp, gif) оруулна уу.';
  return null;
};

// ШИНЭ: HEIC/HEIF (iPhone-ийн өгөгдмөл зургийн формат) файлыг таних. Ихэнх
// browser (Safari-с бусад) HEIC-ийг canvas/createImageBitmap-аар шууд decode
// хийж чаддаггvй, мөн дээрх ALLOWED_IMAGE_TYPES жагсаалтад ч байхгvй тул
// validateImageFile-д "буруу төрөл" гэж татгалзагддаг байсан.
const HEIC_TYPES = ['image/heic', 'image/heif'];
const HEIC_BRANDS = ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'];
const isHeicFile = (file) => {
  if (!file) return false;
  if (HEIC_TYPES.includes((file.type || '').toLowerCase())) return true;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif');
};

// ЗАСВАР #241 (хэрэглэгчийн гомдол — зарим Android утас HEIC файлыг буруу
// (жишээ нь хоосон эсвэл "image/jpeg") MIME төрөлтэй, .jpg өргөтгөлтэй
// сонгуулдаг тул isHeicFile дээрх extension/MIME шалгалтаар олдохгvй, тул
// heic2any-гээр хөрвvvлэгдэлгvй шууд decode-д орж "The source image could not
// be decoded" алдаанд хvргэдэг байв. ISO BMFF (HEIC) файл бvр эхний 12 байтдаа
// "....ftypheic" маягийн brand агуулдаг тул extension/MIME худал ярьсан ч энэ
// байтаар нь бодитоор таньж болно.
const sniffHeicBrand = async (file) => {
  try {
    const head = new Uint8Array(await file.slice(4, 12).arrayBuffer());
    if (head.length < 8) return false;
    const ftyp = String.fromCharCode(...head.slice(0, 4));
    if (ftyp !== 'ftyp') return false;
    const brand = String.fromCharCode(...head.slice(4, 8)).toLowerCase();
    return HEIC_BRANDS.includes(brand);
  } catch {
    return false;
  }
};

// ШИНЭ: HEIC/HEIF зургийг validateImageFile/upload/optimize урсгалд орохоос
// ӨМНӨ image/jpeg рvv хөрвvvлнэ. HEIC биш файлыг хэвээр нь буцаана.
// heic2any-г dynamic import хийж байгаа нь (том сан тул) зөвхөн бодитоор
// HEIC файл сонгогдсон vед л ачаалуулахын тулд (энгийн jpg/png upload-д
// нөлөөлөхгvй).
export const normalizeImageFile = async (file) => {
  if (!file) return file;
  // ALLOWED_IMAGE_TYPES-д таарч буй (жинхэнэ MIME мэдvvлсэн) файлыг дахин
  // sniff хийж цаг vрэхгvй — зөвхөн MIME нь итгэмээргvй vед л байтаар шалгана.
  const looksHeic = isHeicFile(file) || (!ALLOWED_IMAGE_TYPES.includes(file.type) && await sniffHeicBrand(file));
  if (!looksHeic) return file;
  let converted;
  try {
    const heic2any = (await import('heic2any')).default;
    converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  } catch (e) {
    throw new Error('HEIC зургийг хөрвvvлэхэд алдаа гарлаа — өөр форматтай (jpg/png) зураг оруулна уу.');
  }
  // heic2any нь заримдаа (жишээ нь Live Photo) Blob[] буцаадаг тул эхнийхийг нь авна.
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
};

// ЗАСВАР #94: зургийн upload-ыг Supabase Storage-с Cloudflare R2 руу шилжvvлэв
// (upload-to-r2 edge function-оор дамжуулж, Secret Access Key browser талд гардаггvй).
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

// ЗАСВАР #68: "2026.07.13" маягийн цэвэрхэн тоон огноо (бvлгийн жагсаалтад ашиглана)
export const formatNumericDate = (dateStr) => {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
};

// ЗАСВАР #139: манганы vзэлт (views) хиймлээр өсгөхөөс сэргийлэх зорилгоор
// increment_manga_views RPC-д зочин (нэвтрээгvй) хэрэглэгчийг ялгах тогтвортой
// (browser-д хадгалагдсан) key дамжуулна — нэвтэрсэн бол сервер талд auth.uid()
// ашиглах тул vvнийг vл хэрэглэнэ, харин зочинд өөр аргагvй тул хэрэгтэй.
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

// Vлдсэн хугацааг "2 өдөр 3 цаг" маягаар
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
// ЗАСВАР #193 (код шинжилгээ): маш урт (өндөр нягтралтай) зураг оруулахад
// browser tab бvхэлдээ "унаад" (crash/freeze) байсан гомдол ирсэн — vvний
// шалтгаан нь createImageBitmap(file) нь эх зургийг ПИКСЕЛИЙН хэмжээгээр нь
// (файлын MB биш) бvхэлд нь санах ойд decode хийдэгт байна: жишээ нь
// 4000x60000 пиксел зураг ойролцоогоор 1GB+ санах ой шаардана. Vvнийг бvрэн
// арилгах боломжгvй (canvas ашиглахын тулд заавал decode хийх ёстой) тул,
// хамгийн багадаа browser-ийг найдваргvй байдалд оруулахын оронд ойлгомжтой
// алдаа vзvvлж, эх зургийг жижигрvvлж дахин оруулахыг санал болгоно.
const MAX_SAFE_PIXELS = 120_000_000; // ~120 megapixel — ердийн урт вэбтvн (webtoon) стрипэд хvрэлцээтэй

// ЗАСВАР #237 (код шинжилгээ): файлыг НЭГ Л УДАА arrayBuffer()-аар уншиж,
// санах ойд байрлах (дахин дахин уншигдахуйц) тогтвортой Blob vvсгэнэ.
// Утасны файл сонгогч (жишээ нь Android content picker)-с ирсэн File зарим
// vед НЭГ Л УДАА уншигддаг stream шиг ажилладаг тул хоёр (probe + bitmap)
// дахин уншихад "The source image could not be decoded" алдаа өгдгийг
// ажиглав — vvнээс сэргийлэхийн тулд бvх дуудагчид ЭНЭ НЭГ Blob-ыг vргэлж
// дахин ашиглана.
const toStableBlob = async (file) => new Blob([await file.arrayBuffer()], { type: file.type });

// <img>.decode()-оор хямд аргаар эх зургийн жинхэнэ хэмжээг мэднэ (crop
// хэрэгсэлтэй адил, өмнө батлагдсан арга — App.jsx-ийн openEditChapterCrop-ыг vз).
// Амжилтгvй бол null буцаана (дуудагч тал хуучин (бvтнээр decode) замаар vргэлжлvvлнэ).
const probeImageDimensions = async (stableBlob) => {
  try {
    const url = URL.createObjectURL(stableBlob);
    const probe = new Image();
    probe.src = url;
    await probe.decode();
    const dims = { width: probe.naturalWidth, height: probe.naturalHeight };
    URL.revokeObjectURL(url);
    return dims;
  } catch {
    return null;
  }
};

// ЗАСВАР #241 (хэрэглэгчийн гомдол — Samsung S22 дээр зарим screenshot/өөр
// апп-аас хуулсан зураг decode хийгдэхгvй): өмнө нь эвдэрсэн файл зөвхөн
// upload товч дарахад (split/optimize урсгалын дотор) илэрдэг байсан тул
// хэрэглэгч аль файл нь эвдэрсэнийг мэдэхгvйгээр бvх бvлгийг upload хийж
// чадахгvй байв. Одоо файл СОНГОМОГЦ (upload дарахаас өмнө) шалгаж, эвдэрсэн
// бол тэр даруй (нэрээр нь) мэдэгдэж жагсаалтад огт нэмэхгvй байх боломжтой.
export const checkImageDecodable = async (file) => {
  try {
    const stableBlob = await toStableBlob(file);
    const bitmap = await createImageBitmap(stableBlob);
    bitmap.close?.();
    return true;
  } catch {
    return false;
  }
};

// ЗАСВАР #224 (код шинжилгээ): decode vеэрээ аль хэдийн мэдэгдэж байгаа
// width/height-ыг шууд буцаана (дуудагч тал дахин decode хийх шаардлагагvй).
// ЗАСВАР #238 (код шинжилгээ): өмнө нь эх зургийг ЭХЛЭЭД бvтнээр нь (бvх
// өндрөөр нь) НЭГ ImageBitmap-д decode хийгээд, дараа нь тэрнээс хэсэг
// хэсгийг canvas-д зурдаг байсан. НАРИЙХАН (жишээ нь 1200px-с нарийн, тул
// optimizeImageFile жижигрvvлдэггvй) БОЛОВЧ МАШ УРТ (жишээ нь 58000px)
// зурагт энэ нь MAX_SAFE_PIXELS шалгалтыг давсан ч ("зөвшөөрөгдсөн" MP
// хэмжээтэй атлаа), эцсийн ГАРАЛТЫН canvas бvтэн 58000px өндөртэй байх
// шаардлагатай болж, iOS Safari-ийн canvas-ийн хэмжээний хязгаараас хэтэрч
// toBlob() null буцаадаг байв (жишээ нь "58000-тай урт зураг" гомдол).
// Одоо createImageBitmap-ийн (sx, sy, sw, sh) crop overload-оор ЗӨВХӨН
// тухайн НЭГ хэсгийг л decode хийж, ЗӨВХӨН тэр хэсгийн (≤maxHeight)
// хэмжээтэй жижиг canvas дээр зурна — эх зураг хэдий чинээ урт байсан ч
// НЭГ ч удаа бvтэн өндрөөрөө canvas/decode vvсгэхгvй.
export const splitTallImageFile = async (file, maxHeight = 4000) => {
  const stableBlob = await toStableBlob(file);
  let dims = await probeImageDimensions(stableBlob);
  if (!dims) {
    // Хэмжээг хямд аргаар мэдэж чадаагvй ховор тохиолдолд хуучин (бvтнээр decode) замаар нөхнө.
    const bitmap = await createImageBitmap(stableBlob);
    dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
  }
  const { width, height } = dims;

  if (height <= maxHeight) {
    return [{ file, width, height }];
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const mimeType = file.type || (ext === 'png' ? 'image/png' : 'image/jpeg');
  const baseName = file.name.replace(/\.[^.]+$/, '');

  const pieces = [];
  let y = 0;
  let partIndex = 1;
  while (y < height) {
    const pieceHeight = Math.min(maxHeight, height - y);
    // eslint-disable-next-line no-await-in-loop
    const bitmap = await createImageBitmap(stableBlob, 0, y, width, pieceHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = pieceHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    // eslint-disable-next-line no-await-in-loop
    const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.92));
    // ЗАСВАР #191 (код шинжилгээ): маш том canvas дээр browser toBlob-оор null
    // буцааж болно (жишээ нь санах ой хvрэлцэхгvй vед) — шалгахгvй бол
    // new File([null], ...) гэсэн эвдэрсэн (0 байттай) файл vvсгэдэг байв.
    if (!blob) throw new Error('Зургийг хэсэглэхэд алдаа гарлаа (санах ой хvрэлцэхгvй байж магадгvй).');
    pieces.push({ file: new File([blob], `${baseName}-p${partIndex}.${ext}`, { type: mimeType }), width, height: pieceHeight });
    y += pieceHeight;
    partIndex += 1;
  }
  return pieces;
};

// ЗАСВАР #200 (хэрэглэгчийн хvсэлт — дата хэрэглээ багасгах): бvлгийн хуудасны
// зургийг унших дэлгэцэд шаардлагагvй өндөр нягтралтай (жишээ нь 2000-3000px+
// өргөнтэй) хэвээр нь R2-д хадгалж, уншигч бvр тэр хэмжээгээр нь татдаг байсан.
// Одоо upload хийхийн өмнө: (1) өргөн нь 1200px-ээс ДЭЭШ бол л 1200px рvv
// (харьцаагаа хадгалж) жижигрvvлнэ — 1200-аас бага/тэнцvv бол хэмжээг vл
// хөндөнө; (2) WEBP форматруу хөрвvvлнэ (ижил чанарт ихэвчлэн 25-50% бага байт).
// Энэ нь ЗӨВХӨН ШИНЭЭР upload хийж буй зурагт нөлөөлнө, өмнө орсон хуучин
// зургуудыг vл хөндөнө.
export const optimizeImageFile = async (file, maxWidth = 1200, quality = 0.85) => {
  // ЗАСВАР #236 (код шинжилгээ): маш өндөр нягтралтай (жишээ нь 30000px+
  // өндөртэй, утсаар бvтэн бvлгийг нэг зурагт хуулсан) эх зургийг ӨМНӨ нь
  // ЭХЛЭЭД бvтнээр нь (жижигрvvлэхээс өмнө) createImageBitmap-аар decode
  // хийж MAX_SAFE_PIXELS-тэй харьцуулдаг байсан — эцсийн vр дvн (maxWidth-д
  // багассны дараа) бvрэн аюулгvй хэмжээтэй болох байсан ч, эх decode
  // дээрээ л алдаа шидээд бvлэг нэмэхийг (бусад зурагтай хамт) бvхэлд нь
  // зогсоодог байв. Одоо эхлээд хямд (header-с уншигддаг metadata) хэмжээг
  // <img>.decode()-оор мэдэж аваад (crop хэрэгсэлтэй адил, өмнө батлагдсан
  // арга — App.jsx-ийн openEditChapterCrop-ыг vз), жижигрvvлэх шаардлагатай
  // бол createImageBitmap-ийн resizeWidth сонголтоор шууд ЖИЖИГ хэмжээтэйгээр
  // decode хийлгэнэ — том (жишээ нь 480MB+) pixel buffer огт vvсэхгvй тул
  // санах ойн ачаалал vндсэндээ арилна.
  // ЗАСВАР #237 (код шинжилгээ): дээрх хэмжээг мэдэх (probe) болон доорх
  // бодит bitmap vvсгэх хоёр vйлдэл хоёул ЯГ ТvvНХ эх `file`-ыг унших ёстой
  // тул тогтвортой Blob (toStableBlob) ашиглана — splitTallImageFile-тэй
  // адил шалтгаан (дээрх коммент, мөн тэнд байгаа коммент-ыг vз).
  const stableBlob = await toStableBlob(file);
  const dims = await probeImageDimensions(stableBlob);
  const naturalWidth = dims?.width || 0;
  const naturalHeight = dims?.height || 0;

  let bitmap;
  if (naturalWidth > maxWidth) {
    const resizeHeight = Math.round(naturalHeight * (maxWidth / naturalWidth));
    bitmap = await createImageBitmap(stableBlob, { resizeWidth: maxWidth, resizeHeight, resizeQuality: 'medium' });
  } else {
    // ЗАСВАР #193-тай адил шалтгаанаар (browser tab унах эрсдэл): жижигрvvлэх
    // шаардлагагvй (өргөрхөн) зурагт л энэ хуучин шалгалт хэвээр хамаарна.
    if (naturalWidth && naturalHeight && naturalWidth * naturalHeight > MAX_SAFE_PIXELS) {
      throw new Error(`Зураг хэт өндөр нягтралтай (${naturalWidth}x${naturalHeight}px) тул browser найдвартай боловсруулж чадахгvй байж магадгvй — эх зургийг жижигрvvлж дахин оруулна уу.`);
    }
    bitmap = await createImageBitmap(stableBlob);
  }
  const { width, height } = bitmap;
  const targetWidth = Math.min(width, maxWidth);
  const targetHeight = Math.round(height * (targetWidth / width));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob) throw new Error('Зургийг шахахад алдаа гарлаа (санах ой хvрэлцэхгvй байж магадгvй).');
  // ЗАСВАР #209 (код шинжилгээ): Safari (ялангуяа iOS) canvas.toBlob-д
  // "image/webp" хvсэхэд ЖИНХЭНЭ webp гаргадаггvй — чимээгvйгээр PNG рvv
  // "буцдаг" (fallback хийдэг) боловч бид vvнийг мэдэхгvйгээр File-ыг
  // хvчээр type:'image/webp' гэж шошголдог байсан тул бодит байт (PNG)
  // болон мэдvvлсэн төрөл (webp) зөрчилдөж, сервер талын magic-byte шалгалт
  // (ЗАСВАР #181) "Файлын агуулга мэдvvлсэн төрөлтэйгээ тохирохгvй байна"
  // гэж татгалздаг байв — зөвхөн утсан дээр (Safari) л гардаг байсны учир
  // энэ байв. Одоо browser-ийн БОДИТООР vvсгэсэн blob.type-ыг ашиглана.
  const actualType = blob.type || 'image/jpeg';
  const ext = actualType === 'image/webp' ? 'webp' : actualType === 'image/png' ? 'png' : 'jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '');
  // ЗАСВАР #224 (код шинжилгээ): дуудагч тал дахин decode хийхгvйгээр хэмжээг
  // мэдэж авдаг болгохын тулд targetWidth/targetHeight-ыг File-тай хамт буцаана.
  return { file: new File([blob], `${baseName}.${ext}`, { type: actualType }), width: targetWidth, height: targetHeight };
};

// ЗАСВАР #173: зургийг өгөгдсөн тэгш өнцөгт хэсгээр нь таслана. rect нь эх
// зургийн БОДИТ (natural) пикселийн нэгжээр өгөгдсөн байх ёстой.
export const cropImageFile = async (file, rect) => {
  const bitmap = await createImageBitmap(file);
  // ЗАСВАР #193: splitTallImageFile-тэй адил шалтгаанаар (эх зургийг бvхэлд нь
  // decode хийхэд browser tab унах эрсдэлтэй) хэт өндөр нягтралтай эх зургийг
  // тайрахаас өмнө шалгана.
  if (bitmap.width * bitmap.height > MAX_SAFE_PIXELS) {
    bitmap.close?.();
    throw new Error(`Зураг хэт өндөр нягтралтай (${bitmap.width}x${bitmap.height}px) тул browser найдвартай боловсруулж чадахгvй байж магадгvй — эх зургийг жижигрvvлж дахин оруулна уу.`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const mimeType = file.type || 'image/jpeg';
  const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.92));
  // ЗАСВАР #191 (код шинжилгээ): доорх splitTallImageFile-тэй адил шалтгаанаар
  if (!blob) throw new Error('Зургийг тайрахад алдаа гарлаа (санах ой хvрэлцэхгvй байж магадгvй).');
  return new File([blob], file.name, { type: mimeType });
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
