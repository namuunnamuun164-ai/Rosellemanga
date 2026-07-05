import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

const genres = ['Action', 'Historical', 'Modern', 'Smut', 'BL', 'Horror', 'Romance'];

// ЗАСВАР #75: "Дууссан"/"Үргэлжилж байна" 2-оос гадна "Завсарлага авсан",
// "Гаргалт зогссон" 2 төлөв нэмэв. Өнгө/бэлгэдлийг нэг газар тодорхойлж,
// MangaCard болон Detail хуудас хоёулаа үүнээс уншина (давхардуулахгүйн тулд).
const MANGA_STATUSES = ['Гарч байгаа', 'Дууссан', 'Завсарлага авсан', 'Гаргалт гүйцсэн'];
const STATUS_META = {
  'Дууссан': { color: '#4caf50', badge: 'ДУУССАН' },
  'Гарч байгаа': { color: '#3b82f6', badge: 'Гарч байгаа' },
  'Завсарлага авсан': { color: '#f5a623', badge: 'ЗАВСАРЛАГА' },
  'Гаргалт гүйцсэн': { color: '#888', badge: 'Гаргалт гүйцсэн' },
};
// ЗАСВАР #92: MANGA_STATUSES/STATUS_META-д байхгүй (жишээ нь хуучин/устгагдсан
// нэрээр хадгалагдсан) төлөвтэй манга таарвал .badge дээр crash хийхээс сэргийлж,
// тодорхой нэр рүү биш ямар ч байдлаар найдвартай нөөц утга руу шилждэг болгов.
const DEFAULT_STATUS_META = { color: '#8B0000', badge: '' };
// ЗАСВАР #3: Үнийн мэдээллийг нэг газар тодорхойлж, VIP хуудас болон popup хоёулаа
// эндээс уншдаг болгосон (өмнө нь 6 сарын багц 25,000₮ / 50,000₮ гэж зөрж байсан).
const PLANS = [
  { key: '1sar', label: '1 САР', price: '5,000₮', features: ['Бүх манхва унших', 'HD чанар'], recommended: false },
  { key: '3sar', label: '3 САР', price: '13,500₮', features: ['Бүх манхва унших', 'HD чанар', '10% хэмнэлт'], recommended: true },
  { key: '6sar', label: '6 САР', price: '25,000₮', features: ['Бүх манхва унших', 'HD чанар', '1 сар үнэгүй'], recommended: false },
];
// ЗАСВАР #91: "Төлбөр төлсөн" хүсэлт батлахад багц тус бүрийн VIP хоногийг тооцоход ашиглана
const PLAN_DAYS = { '1sar': 30, '3sar': 90, '6sar': 180 };

// localStorage-оос аюулгүй унших туслах функц
const loadLS = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// ЗАСВАР #11: upload хийхийн өмнө файлын төрлийг шалгах нэг цэгтэй функц
// (өмнө нь <input accept="image/*"> л байсан бөгөөд энэ нь зөвхөн UI-д зориулсан
// зөвлөмж тул хэрэглэгч ямар ч файл сонгож upload хийж болдог байсан).
// ЗАСВАР #17: хэмжээний (8MB) хязгаарлалтыг хассан — жинхэнэ hosting (Supabase
// Storage) холбогдсон тул бүлгийн өндөр чанартай том зургийг хориглох шаардлагагүй.
const validateImageFile = (file) => {
  if (!file) return 'Файл сонгогдоогүй байна.';
  if (!file.type.startsWith('image/')) return 'Зөвхөн зургийн файл (jpg, png, webp г.м.) оруулна уу.';
  return null;
};

// ЗАСВАР #94: зургийн upload-ыг Supabase Storage-с Cloudflare R2 руу шилжүүлэв
// (upload-to-r2 edge function-оор дамжуулж, Secret Access Key browser талд гардаггүй).
const uploadToR2 = async (file, path) => {
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

const IconHome = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  </svg>
);
const IconGrid = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
  </svg>
);
const IconBookmark = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>
);
const IconSearch = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
// ШИНЭ: утасны hamburger цэсний icon
const IconMenu = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);

// ШИНЭ: нууц үг оруулах талбар — нүд дарж харуулах/нуух товчтой
const PasswordField = ({ value, onChange, placeholder, onKeyDown }) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange} onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 44px 10px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
      <span onClick={() => setShow(s => !s)} title={show ? 'Нууц үг нуух' : 'Нууц үг харуулах'}
        style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#888', fontSize: 15, userSelect: 'none' }}>
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        )}
      </span>
    </div>
  );
};

export default function App() {
  const [page, setPage] = useState('home');
  const [selected, setSelected] = useState(null);
  // ЗАСВАР #61: манга дэлгэрэнгүй рүү аль хуудаснаас орсноо санаж, "Буцах" дарахад
  // үргэлж "Нүүр" рүү биш, ЯГ ТЭР хуудас руу нь буцаадаг болгосон
  const [previousPage, setPreviousPage] = useState('home');
  // ШИНЭ: манга хуудсанд admin бичдэг тэмдэглэл засах горим
  const [mangaNoteEditing, setMangaNoteEditing] = useState(false);
  const [mangaNoteDraft, setMangaNoteDraft] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  // ЗАСВАР #91: "Төлбөр төлсөн" хүсэлт admin-д очиж, admin шалгаад батлах/цуцлах
  const [paymentRequestSending, setPaymentRequestSending] = useState(false);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeGenre, setActiveGenre] = useState('Бүгд');
  // ЗАСВАР #7: library болон history-г localStorage-д хадгалдаг болгосон
  // (өмнө нь refresh хийхэд алга болдог байсан, history нь хатуу бичсэн массив байсан).
  const [library, setLibrary] = useState(() => loadLS('manga_library', []));
  const [history, setHistory] = useState(() => loadLS('manga_history', []));
  const [dbMangas, setDbMangas] = useState([]);
  const [authPage, setAuthPage] = useState(null);
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  // ШИНЭ: нууц үг сэргээх урсгал (имэйлээр 6 оронтой код)
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetSending, setResetSending] = useState(false);
  // ШИНЭ: код дахин илгээхэд 30 секундын хүлээлт (spam-аас сэргийлнэ)
  const [resendCooldown, setResendCooldown] = useState(0);
  // ШИНЭ: утасны hamburger цэс
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 900);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [genreOpen, setGenreOpen] = useState(false);
  const [dbChapters, setDbChapters] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [chapterImages, setChapterImages] = useState([]);
  // ЗАСВАР #56: 1 төрлийн оронд 1-3 төрөл зэрэг сонгож болдог болгосон (массив)
  const [adminManga, setAdminManga] = useState({ title: '', desc: '', genres: [], status: 'Үргэлжилж байна' });
  const [adminWorkerEmail, setAdminWorkerEmail] = useState('');
  // ЗАСВАР #31: цуглуулга болсон — олон staff role-ийг зэрэг чеклэж болно
  const [adminWorkerRoles, setAdminWorkerRoles] = useState([]);
  // ШИНЭ: VIP олгох (role-оос тусад нь, хоногийн хугацаатай)
  const [vipEmail, setVipEmail] = useState('');
  const [vipDays, setVipDays] = useState('30');
  const [vipSaving, setVipSaving] = useState(false);
  const [posterFile, setPosterFile] = useState(null);
  // ШИНЭ: нүүр хэсгийн "Санал болгох" мөрөнд ашиглах урт нарийн (portrait) баннер зураг
  const [bannerFile, setBannerFile] = useState(null);
  // ШИНЭ: оруулсан мангаг засах (edit) цонх
  const [editManga, setEditManga] = useState(null);
  const [editMangaForm, setEditMangaForm] = useState({ title: '', desc: '', genres: [], status: 'Үргэлжилж байна' });
  const [editPosterFile, setEditPosterFile] = useState(null);
  const [editBannerFile, setEditBannerFile] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  // ШИНЭ: "Хувиар" тусдаа хуудас байхаа больж, avatar дээр дарахад буланд гарч ирэх жижиг цонх боллоо
  const [profileOpen, setProfileOpen] = useState(false);
  // ШИНЭ: site-тэй өнгө нийцсэн мэдэгдлийн карт (toast) — browser notify()-ийг орлоно
  const [toasts, setToasts] = useState([]);
  const [chapterManga, setChapterManga] = useState('');
  const [chapterNumber, setChapterNumber] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterFiles, setChapterFiles] = useState([]);
  // ШИНЭ: upload хийхийн өмнө сонгосон зургуудыг бүлэг уншиж байгаа мэт бүтнээр нь харах
  const [chapterPreviewOpen, setChapterPreviewOpen] = useState(false);
  // ШИНЭ: уншиж байгаа хуудасны дээд талд бүлгийн дугаар дарахад бусад бүлгүүд жагсаана
  const [chapterSwitcherOpen, setChapterSwitcherOpen] = useState(false);
  // ЗАСВАР #58: удирдлагын панелийг доошоо жагсаасан олон карт биш, хажуу тийш
  // жигсаасан таб (each) хэсэгтэй болгосон
  const [adminTab, setAdminTab] = useState('manga');
  const [chapterUploading, setChapterUploading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  // ЗАСВАР #31: role одоо цуглуулга (жишээ нь moderator+editor зэрэг байж болно) —
  // өмнө нь ганц утгатай string байсан тул хоёр эрхийг зэрэг олгох боломжгүй,
  // мөн SQL Editor-с "admin,vip" гэх мэт хуурамч утга зохиомол оруулахад
  // isStaff шалгалт "тэнцүү" харьцуулалтаас болж бүрмөсөн унтардаг эмзэг байсан.
  const [userRoles, setUserRoles] = useState([]);
  const [adminStats, setAdminStats] = useState({ mangas: 0, users: 0, chapters: 0 });
  // ШИНЭ: профайл (нэр, avatar), сэтгэгдэл, уншсан бүлгийн тэмдэглэгээ
  const [userProfile, setUserProfile] = useState(null);
  const [profileName, setProfileName] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  // { [mangaId]: [бүлгийн дугаарууд] } — уншсан бүлгүүд
  const [readChapters, setReadChapters] = useState(() => loadLS('manga_read', {}));
  // ШИНЭ: role систем, нийтлэх урсгал, report
  const [chapterIsVip, setChapterIsVip] = useState(false);
  // ЗАСВАР #60: "ҮНЭГҮЙ"/"VIP" бэлгэдлийн оронд admin өөрөө бичих дурын тэмдэглэгээ (жишээ нь S1 END)
  const [chapterLabel, setChapterLabel] = useState('');
  // ШИНЭ: admin/moderator шууд нэмэхдээ ч ирээдүйн гарах цаг товлож болно
  const [chapterPublishAt, setChapterPublishAt] = useState('');
  const [pendingChapters, setPendingChapters] = useState([]);
  const [reportsList, setReportsList] = useState([]);

  // ШИНЭ: бүлгийн cover, эрэмбэ, хуваарь, like/reply, countdown
  const [chapterCover, setChapterCover] = useState(null);
  const [chapterSort, setChapterSort] = useState('asc');
  const [pendingTimes, setPendingTimes] = useState({});
  const [myLikes, setMyLikes] = useState([]);
  // ШИНЭ: сэтгэгдэл бүрийн like-ийн тоо (comment_id -> тоо), aggregate embed-гүйгээр тооцно
  const [commentLikeCounts, setCommentLikeCounts] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [nowTs, setNowTs] = useState(Date.now());

  // ============ ROLE СИСТЕМ ============
  // admin     — бүх эрх
  // moderator — манга/бүлэг нэмэх, Editor-ийн хүсэлт батлах/татгалзах, сэтгэгдэл устгах, report шалгах (манга устгах эрхгүй)
  // editor    — манга/бүлэг нэмэх, бүлэг нь "Хүлээгдэж буй" төлөвтэй орно (өөрөө нийтлэх эрхгүй)
  // user      — унших, хадгалах, сэтгэгдэл бичих
  //
  // ЗАСВАР #20: VIP-ийг role-оос тусад нь (is_vip + vip_expires_at) болгосон —
  // ингэснээр нэг хэрэглэгч жишээ нь "moderator" ЗЭРЭГ "vip" байж болно (өмнө нь
  // role нэг л утгатай байсан тул staff эрх + төлбөртэй VIP хугацааг зэрэг барих
  // боломжгүй байсан), мөн VIP-д дуусах хугацаа (vip_expires_at) тавих боломжтой болсон.
  const isAdmin = userRoles.includes('admin');
  const isStaff = isAdmin || userRoles.includes('moderator') || userRoles.includes('editor');
  const canModerate = isAdmin || userRoles.includes('moderator');
  // editor эрхтэй ХАРИН moderator/admin биш үед л бүлэг нь "Хүлээгдэж буй" ордог
  // (moderator/admin аль хэдийн батлах эрхтэй тул өөрсдийн оруулснаа шууд нийтэлж болно)
  const editorOnly = userRoles.includes('editor') && !canModerate;
  const hasActiveVip = !!userProfile?.is_vip && (!userProfile?.vip_expires_at || new Date(userProfile.vip_expires_at).getTime() > nowTs);
  const isVip = isStaff || hasActiveVip;
  const ROLE_LABELS = { admin: 'Админ', moderator: 'Модератор', editor: 'Эдитор', user: 'Хэрэглэгч' };

  // ШИНЭ: тодорхой цагт (publish_at) товлогдсон бүлгүүд — хуваарийн хуудсанд харуулна
  const [scheduledChapters, setScheduledChapters] = useState([]);
  // ЗАСВАР #44: нүүр хэсгийн "ШИНЭ БҮЛЭГ" одоо мангаар биш, БҮЛЭГ бүрээр (өөрийн
  // cover зурагтайгаа) харуулна — 1 манга 10 бүлэг гаргавал 10 тусдаа карт гарна
  const [recentChapters, setRecentChapters] = useState([]);
  // ШИНЭ: сүүлийн 30 хоногт хамгийн их үзэгдсэн 10 манга (нүүр хэсгийн "Санал болгох" мөр)
  const [topMangaIds, setTopMangaIds] = useState(null); // null = ачаалж дуусаагүй
  const [scheduleMangaId, setScheduleMangaId] = useState('');
  const [scheduleDay, setScheduleDay] = useState('6');
  const [scheduleTime, setScheduleTime] = useState('20:00');
  // ШИНЭ: Бүх гаргалт хуудсыг шинээр эсвэл үзэлтээр эрэмбэлэх
  const [allSort, setAllSort] = useState('default');
  // ЗАСВАР #81: нүүр хэсгийн мөр бүрийн "цааш үзэх" сум зөвхөн тухайн ангиллын
  // мангыг харуулдаг болгох (өмнө нь ямар ч категориос дарсан бай, "Бүх гаргалт"
  // хуудсанд БҮХ манга гардаг байсан).
  const [allCategory, setAllCategory] = useState(null);

  // Countdown-ууд шинэчлэгдэж байхын тулд 30 сек тутам "одоо"-г сэргээнэ
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // ШИНЭ: цонхны хэмжээгээр утас/компьютер горимыг мэдэрнэ (hamburger цэс)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Хуудас солигдох бүрт утасны цэсийг автоматаар хаана
  useEffect(() => { setSidebarOpen(false); }, [page]);

  const DAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];

  // "2026 оны 6-р сарын 25" маягийн огноо
  const formatMnDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()} оны ${d.getMonth() + 1}-р сарын ${d.getDate()}`;
  };

  // ЗАСВАР #68: "2026.07.13" маягийн цэвэрхэн тоон огноо (бүлгийн жагсаалтад ашиглана)
  const formatNumericDate = (dateStr) => {
    const d = new Date(dateStr);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}.${mm}.${dd}`;
  };

  // Үлдсэн хугацааг "2 өдөр 3 цаг" маягаар
  const formatRemaining = (ms) => {
    if (ms <= 0) return '';
    const mins = Math.ceil(ms / 60000);
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (days > 0) return `${days} өдөр ${hours} цаг`;
    if (hours > 0) return `${hours} цаг ${m} мин`;
    return `${m} мин`;
  };

  // Долоо хоногийн хуваариас дараагийн гарах огноог тооцно
  const nextScheduleDate = (day, time) => {
    if (day == null || !time) return null;
    const [hh, mm] = time.split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm || 0, 0, 0);
    let diff = (Number(day) - d.getDay() + 7) % 7;
    if (diff === 0 && d.getTime() <= nowTs) diff = 7;
    d.setDate(d.getDate() + diff);
    return d;
  };

  // Товлосон цаг нь болоогүй бүлэг эсэх
  const chapterLocked = (ch) => ch.publish_at && new Date(ch.publish_at).getTime() > nowTs;

  // library өөрчлөгдөх бүрт localStorage-д хадгална
  useEffect(() => {
    localStorage.setItem('manga_library', JSON.stringify(library));
  }, [library]);

  // history өөрчлөгдөх бүрт localStorage-д хадгална
  useEffect(() => {
    localStorage.setItem('manga_history', JSON.stringify(history));
  }, [history]);

  // уншсан бүлгүүдийг localStorage-д хадгална
  useEffect(() => {
    localStorage.setItem('manga_read', JSON.stringify(readChapters));
  }, [readChapters]);

  const toggleLibrary = (id) => {
    setLibrary(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // ЗАСВАР #61: манга дэлгэрэнгүй хуудас руу орохдоо одоогийн хуудсыг санана,
  // ингэснээр "Буцах" дарахад тухайн хуудас руу нь буцаж очно (үргэлж Нүүр биш)
  const goToDetail = (manga) => {
    setPreviousPage(page);
    setSelected(manga);
    setMangaNoteEditing(false);
    setPage('detail');
  };

  // ЗАСВАР #32: цайвар browser notify()-ийн оронд site-тэй өнгө нийцсэн жижиг
  // мэдэгдлийн карт (toast). Мессежид "Алдаа" гэсэн үг байвал улаан, эс бол
  // ногоон хүрээтэй харагдана — ингэснээр 75 notify() дуудлагыг нэг нэгээр нь
  // төрөл ялгаж бичихийн оронд зүгээр л alert-ийг notify-гаар сольсон.
  const notify = (message) => {
    const type = /алдаа/i.test(message) ? 'error' : 'success';
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  };

  // Supabase-ээс манга татах — админ шинээр нэмсний дараа дахин дуудаж болохоор
  // тусдаа функц болгосон (ЗАСВАР: өмнө нь нэмсний дараа refresh хийх шаардлагатай байсан).
  const fetchMangas = useCallback(() => {
    supabase.from('mangas').select('*').then(({ data, error }) => {
      if (error) console.error('Supabase манга алдаа:', error);
      if (data && data.length > 0) {
        setDbMangas(data.map(m => ({
          id: m.id,
          title: m.title,
          desc: m.description,
          // ЗАСВАР #56: 1-3 төрөл зэрэг байж болно; хуучин ганц genre баганатай
          // мөрүүд рүү буцаад тохирохын тулд нөөц (fallback) байдлаар хамааруулна
          genres: (m.genres && m.genres.length > 0) ? m.genres : (m.genre ? [m.genre] : []),
          status: m.status,
          poster: m.poster_url,
          banner_url: m.banner_url, // ШИНЭ: нүүр хэсгийн "Санал болгох" мөрөнд ашиглах урт нарийн зураг
          rating: 4.9,
          views: m.views || 0, // ШИНЭ: "Бүх гаргалт" хуудсыг үзэлтээр эрэмбэлэхэд ашиглана
          chapters: 0, // жинхэнэ тоог detail хуудсанд dbChapters-ээс харуулна (ЗАСВАР #6)
          is_hidden: m.is_hidden || false,
          schedule_day: m.schedule_day,
          schedule_time: m.schedule_time,
          created_at: m.created_at, // ШИНЭ: нүүр хэсгийн "Шинэ манга" мөрд ашиглана
          admin_note: m.admin_note, // ШИНЭ: манга хуудсанд admin бичдэг тэмдэглэл
          is_recommended: m.is_recommended || false, // ЗАСВАР #71: "Санал болгох" hero-д admin гараар сонгосон эсэх
        })));
      }
    });
  }, []);

  // Нэвтрэх/эрх өөрчлөгдөхөд дахин татна (staff нуугдсан мангаг харна)
  useEffect(() => { fetchMangas(); }, [fetchMangas, isStaff]);

  // ЗАСВАР #15: гараар бичсэн демо жагсаалтыг (mangas) бүрэн хассан — манга
  // бүгд admin хуудаснаас DB-рүү орж ирдэг болсон тул зөвхөн dbMangas ашиглана.
  const allMangas = dbMangas;

  // ЗАСВАР #24: нүүр хэсгийн "Санал болгох" мөрийг сүүлийн 30 хоногт хамгийн их
  // үзэгдсэн 10 мангаар дүүргэнэ. Тоолол нь manga_view_events хүснэгт дэх
  // цаг тэмдэгтэй бодит үзэлтийн бүртгэлээс тооцогдоно (нийт views баганаас
  // ялгаатай нь — энэ зөвхөн сүүлийн 30 хоногийг харгалзана).
  useEffect(() => {
    supabase.rpc('top_manga_last_days', { days_back: 30, result_limit: 10 })
      .then(({ data }) => setTopMangaIds(data ? data.map(r => r.manga_id) : []));
  }, []);

  // ЗАСВАР #71: "Санал болгох" hero-г автомат үзэлтийн тоогоор биш, admin-ийн
  // ГАРААР сонгосон 10 мангаар харуулна (шинэ сайтад үзэлтийн статистик бага/
  // найдваргүй байдаг тул admin-ийн шийдвэр илүү тохиромжтой). Хэрэв admin
  // хараахан юу ч сонгоогүй бол сүүлийн 30 хоногийн ТОП-руу, тэр ч байхгүй бол
  // эхний 10 манга руу нөөцөлнө.
  // ЗАСВАР #76: нүүр хэсгийн "САНАЛ БОЛГОХ" МӨР — зөвхөн admin-ийн гараар
  // сонгосон манга (30 хоногийн тренд рүү нөөцлөхгүй), тул hero-той давхцахгүй
  // тусдаа мөр болно.
  const curatedRecommended = allMangas.filter(m => m.is_recommended).slice(0, 10);

  // ЗАСВАР #87: hero-г дахин сүүлийн 30 хоногийн үзэлтээр тэргүүлэгчээр дүүргэнэ
  // (admin-ийн гараар сонгосон жагсаалт нь доор тусдаа "САНАЛ БОЛГОХ" мөрөнд
  // байгаа тул hero-той давхцах шаардлагагүй болсон).
  const recommendedMangas = (() => {
    if (topMangaIds && topMangaIds.length > 0) {
      const byId = topMangaIds.map(id => allMangas.find(m => m.id === id)).filter(Boolean);
      if (byId.length > 0) return byId;
    }
    return allMangas.slice(0, 10); // өгөгдөл дутуу/шинэ сайт үед нөөц жагсаалт
  })();

  // ЗАСВАР #64: нүүр хэсгийн "Шинэ манга" мөр — саяхан нэмэгдсэн манганууд
  const newMangas = [...allMangas]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 10);

  // ЗАСВАР #57: full-width hero-г автоматаар эргүүлнэ (жижиг карт мөрийн scroll-ийн оронд)
  const [heroIndex, setHeroIndex] = useState(0);
  useEffect(() => {
    if (page !== 'home' || recommendedMangas.length === 0) return;
    const timer = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % recommendedMangas.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [page, recommendedMangas.length]);
  useEffect(() => {
    setHeroIndex(prev => (recommendedMangas.length > 0 ? prev % recommendedMangas.length : 0));
  }, [recommendedMangas.length]);
  const heroManga = recommendedMangas[heroIndex] || recommendedMangas[0];

  // Хэрэглэгчийн role, нэр, avatar-ыг нэг дор татна
  const fetchProfile = useCallback((userId) => {
    supabase.from('users').select('roles, name, avatar_url, is_vip, vip_expires_at').eq('id', userId).single()
      .then(({ data }) => {
        if (data) {
          setUserRoles(data.roles || []);
          setUserProfile(data);
          setProfileName(data.name || '');
        }
      });
  }, []);

  // ШИНЭ: нууц үг сэргээх — имэйл рүү 6 оронтой код илгээнэ
  // (Supabase талд Authentication → Email Templates → Reset Password загварт
  // холбоос ({{ .ConfirmationURL }})-ны оронд {{ .Token }} гэж тавьсан байх ёстой,
  // эс тэгвэл имэйлд код биш холбоос ирнэ).
  const sendResetCode = async () => {
    if (resendCooldown > 0) return;
    if (!authForm.email.trim()) { notify('Имэйлээ оруулна уу!'); return; }
    setResetSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(authForm.email.trim());
    setResetSending(false);
    if (error) { notify('Алдаа: ' + error.message); return; }
    setResetCode('');
    setResetNewPassword('');
    setAuthPage('reset');
    setResendCooldown(30); // ЗАСВАР #40: дахин илгээхэд 30 секундын хүлээлт
    notify('Танд 6 оронтой баталгаажуулах код имэйлээр илгээгдлээ 📧');
  };

  // Дахин илгээх хүлээлтийн секундыг 1 секунд тутам бууруулна
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(prev => (prev <= 1 ? 0 : prev - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown > 0]);

  // ШИНЭ: илгээсэн кодыг шалгаад шинэ нууц үгийг хадгална
  const confirmResetCode = async () => {
    if (resetCode.trim().length !== 6) { notify('6 оронтой кодоо бүрэн оруулна уу!'); return; }
    if (resetNewPassword.length < 6) { notify('Шинэ нууц үг 6-с дээш тэмдэгттэй байх ёстой!'); return; }
    setResetSending(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: authForm.email.trim(),
      token: resetCode.trim(),
      type: 'recovery',
    });
    if (verifyError) { setResetSending(false); notify('Алдаа: ' + verifyError.message); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password: resetNewPassword });
    setResetSending(false);
    if (updateError) { notify('Алдаа: ' + updateError.message); return; }
    notify('Нууц үг амжилттай солигдлоо! Одоо шинэ нууц үгээрээ нэвтэрнэ үү 🎉');
    setResetCode('');
    setResetNewPassword('');
    setAuthPage('login');
  };

  useEffect(() => {
    // ЗАСВАР #55: имэйл баталгаажуулах холбоос дээр дараад сайт руу буцаж ирэхэд
    // (URL дээр code/access_token/type=signup гэх мэт үлдэгдэл байвал) хоосон/JSON
    // хуудас харагдахын оронд "Имэйл баталгаажлаа" гэсэн ойлгомжтой мэдэгдэл
    // харуулаад, URL-ыг цэвэрлэнэ.
    const url = window.location.href;
    const isAuthCallback = /[?&#](code|access_token)=/.test(url) || /type=(signup|recovery|email)/.test(url);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setCurrentUser(session.user);
        fetchProfile(session.user.id);
        if (isAuthCallback) notify('Имэйл баталгаажлаа! Тавтай морилно уу 🎉');
      }
      if (isAuthCallback) window.history.replaceState(null, '', window.location.pathname);
    });
    // ЗАСВАР #8: subscription-ийг cleanup хийдэг болгосон (memory leak байсан)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setCurrentUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setCurrentUser(null);
        setUserRoles([]);
        setUserProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  useEffect(() => {
    if (page !== 'detail' || !selected) return;
    // ЗАСВАР #10: манга хурдан сольход хуучин хүсэлт хожуу ирж шинэ жагсаалтыг
    // дарж бичихээс сэргийлнэ (race condition).
    let cancelled = false;
    // Энгийн хэрэглэгч зөвхөн нийтлэгдсэн бүлгийг харна; staff бүгдийг харна
    let q = supabase.from('chapters').select('*').eq('manga_id', selected.id);
    if (!isStaff) q = q.eq('status', 'published');
    q.order('chapter_number').then(({ data }) => { if (!cancelled) setDbChapters(data || []); });
    return () => { cancelled = true; };
  }, [page, selected, isStaff]);

  // ШИНЭ: манга дэлгэрэнгүй хуудсыг нээх бүрт үзэлтийг DB талд атомаар нэмэгдүүлнэ
  // ("Бүх гаргалт" хуудсанд үзэлтээр эрэмбэлэхэд ашиглана)
  useEffect(() => {
    if (page !== 'detail' || !selected) return;
    supabase.rpc('increment_manga_views', { input_id: selected.id });
    setDbMangas(prev => prev.map(m => m.id === selected.id ? { ...m, views: (m.views || 0) + 1 } : m));
    setSelected(prev => prev && prev.id === selected.id ? { ...prev, views: (prev.views || 0) + 1 } : prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selected?.id]);

  useEffect(() => {
    if (page !== 'reader' || !selectedChapter) return;
    // ЗАСВАР #10: бүлэг хурдан сольход хуучин зураг/сэтгэгдлийн хүсэлт хожуу ирж
    // шинэ бүлгийн дээр буухаас сэргийлнэ.
    let cancelled = false;
    setChapterImages([]); // өмнөх бүлгийн зураг түр харагдахаас сэргийлнэ
    supabase.from('chapter_images').select('*').eq('chapter_id', selectedChapter.id).order('page_number')
      .then(({ data }) => { if (!cancelled && data) setChapterImages(data); });
    fetchComments(selectedChapter.id, () => cancelled);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selectedChapter]);

  // ШИНЭ: сэтгэгдэл татах (нэр, avatar, like-ийн тоотой хамт)
  // isCancelled — өмнөх бүлгийн хүсэлт хожуу ирвэл state дарж бичихээс сэргийлэх (заавал биш)
  const fetchComments = (chapterId, isCancelled = () => false) => {
    // ЗАСВАР #41: comment_likes(count) aggregate embed-г хассан — энэ нь Supabase
    // төслийн "Aggregate functions" тохиргоо идэвхгүй үед (шинэ төсөлд анхны
    // тохиргоогоор идэвхгүй байдаг) query-г бүхэлд нь унагааж, "сэтгэгдэл татахад
    // алдаа гарлаа" гэсэн алдаа гаргадаг байсан. Одоо like-ийн тоог тусад нь
    // татаж, клиент талд өөрөө тоолдог болгосон — Supabase-ийн тохиргооноос үл хамаарна.
    // ЗАСВАР #74: "Could not embed because more than one relationship was found
    // for 'comments' and 'users'" алдааг засав — comments/users хооронд PostgREST
    // хэд хэдэн FK харж, аль нэгийг нь сонгож чадахгүй байсан тул !user_id гэж
    // яг аль баганаар холбогдохыг нь тодорхой зааж өгсөн.
    supabase.from('comments')
      .select('*, users!user_id(name, avatar_url, roles)')
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (isCancelled()) return;
        if (error) { console.error('Сэтгэгдэл татах алдаа:', error); notify('Алдаа: сэтгэгдэл татахад алдаа гарлаа (' + error.message + ')'); return; }
        const commentsList = data || [];
        setComments(commentsList);
        if (commentsList.length === 0) { setCommentLikeCounts({}); return; }
        supabase.from('comment_likes').select('comment_id').in('comment_id', commentsList.map(c => c.id))
          .then(({ data: likeRows }) => {
            if (isCancelled()) return;
            const counts = {};
            (likeRows || []).forEach(r => { counts[r.comment_id] = (counts[r.comment_id] || 0) + 1; });
            setCommentLikeCounts(counts);
          });
      });
    if (currentUser) {
      supabase.from('comment_likes').select('comment_id').eq('user_id', currentUser.id)
        .then(({ data }) => { if (!isCancelled()) setMyLikes((data || []).map(x => x.comment_id)); });
    }
  };

  // ШИНЭ: like дарах/болих
  const toggleLike = async (c) => {
    if (!currentUser) { setAuthPage('login'); return; }
    if (myLikes.includes(c.id)) {
      await supabase.from('comment_likes').delete().eq('comment_id', c.id).eq('user_id', currentUser.id);
    } else {
      const { error } = await supabase.from('comment_likes').insert({ comment_id: c.id, user_id: currentUser.id });
      if (error) { notify('Алдаа: ' + error.message); return; }
    }
    fetchComments(selectedChapter.id);
  };

  // ШИНЭ: сэтгэгдэл/хариулт илгээх (parentId байвал хариулт болно)
  const postComment = async (parentId = null, textOverride = null) => {
    if (!currentUser) { setAuthPage('login'); return; }
    const text = (textOverride !== null ? textOverride : commentText).trim();
    if (!text) return;
    setCommentSending(true);
    const { error } = await supabase.from('comments').insert({
      chapter_id: selectedChapter.id,
      user_id: currentUser.id,
      content: text,
      parent_id: parentId,
    });
    setCommentSending(false);
    if (error) { notify('Алдаа: ' + error.message); return; }
    if (parentId) { setReplyText(''); setReplyTo(null); }
    else setCommentText('');
    fetchComments(selectedChapter.id);
  };

  // ШИНЭ: профайл зураг (avatar) оруулах
  const uploadAvatar = async (file) => {
    if (!file || !currentUser) return;
    const invalid = validateImageFile(file);
    if (invalid) { notify(invalid); return; }
    setAvatarUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `avatars/${currentUser.id}-${Date.now()}.${fileExt}`;
    let publicUrl;
    try {
      publicUrl = await uploadToR2(file, fileName);
    } catch (uploadError) { notify('Зураг upload алдаа: ' + uploadError.message); setAvatarUploading(false); return; }
    const { error } = await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', currentUser.id);
    setAvatarUploading(false);
    if (error) { notify('Алдаа: ' + error.message); return; }
    fetchProfile(currentUser.id);
    notify('Профайл зураг шинэчлэгдлээ! 🎉');
  };

  // ШИНЭ: профайл нэр хадгалах
  const saveProfileName = async () => {
    if (!currentUser) return;
    const { error } = await supabase.from('users').update({ name: profileName.trim() }).eq('id', currentUser.id);
    if (error) notify('Алдаа: ' + error.message);
    else { fetchProfile(currentUser.id); notify('Нэр хадгалагдлаа! 🎉'); }
  };

  // Хэрэглэгчийн жижиг avatar (сэтгэгдэл, topbar-т ашиглана)
  const Avatar = ({ url, letter, size = 34 }) => (
    url ? (
      <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    ) : (
      <div style={{ width: size, height: size, borderRadius: '50%', background: '#8B0000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.42, color: '#fff', flexShrink: 0 }}>
        {(letter || '?').toUpperCase()}
      </div>
    )
  );

  // ШИНЭ: батлах хүлээгдэж буй бүлгүүд (moderator/admin)
  const fetchPending = useCallback(() => {
    supabase.from('chapters').select('*, mangas(title)').eq('status', 'pending').order('created_at')
      .then(({ data }) => setPendingChapters(data || []));
  }, []);

  // ШИНЭ: сэтгэгдлийн report-ууд (moderator/admin)
  const fetchReports = useCallback(() => {
    // ЗАСВАР #74: адил төстэй "олон FK" алдаанаас сэргийлж баганаар нь тодорхой заасан
    supabase.from('reports').select('*, comments!comment_id(id, content), users!reporter_id(name)').eq('status', 'open').order('created_at')
      .then(({ data }) => setReportsList(data || []));
  }, []);

  // ЗАСВАР #91: "Төлбөр төлсөн" хүлээгдэж буй хүсэлтүүд (зөвхөн admin)
  const fetchPaymentRequests = useCallback(() => {
    supabase.from('payment_requests').select('*, users!user_id(name, email)').eq('status', 'pending').order('created_at')
      .then(({ data }) => setPaymentRequests(data || []));
  }, []);

  // Удирдлагын хуудас нээгдэхэд бодит статистик татна
  useEffect(() => {
    if (page === 'admin' && isStaff) {
      Promise.all([
        supabase.from('mangas').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('chapters').select('*', { count: 'exact', head: true }),
      ]).then(([m, u, c]) => {
        setAdminStats({ mangas: m.count ?? 0, users: u.count ?? 0, chapters: c.count ?? 0 });
      });
    }
    if (page === 'admin' && canModerate) {
      fetchPending();
      fetchReports();
    }
    if (page === 'admin' && isAdmin) {
      fetchPaymentRequests();
    }
  }, [page, isStaff, canModerate, isAdmin, fetchPending, fetchReports, fetchPaymentRequests]);

  // ЗАСВАР #21: тодорхой цагт (publish_at) товлогдсон ирээдүйн бүлгүүдийг татаж,
  // хуваарийн хуудсанд манга-түвшний долоо хоногийн хуваариас гадна харуулна
  // (өмнө нь энэ хуудас зөвхөн mangas.schedule_day ашигладаг байсан тул нэг
  // өдөрт олон бүлэг товлогдсон ч харагддаггүй байсан).
  useEffect(() => {
    if (page !== 'schedule') return;
    let cancelled = false;
    supabase.from('chapters').select('*, mangas(title, poster_url)')
      .not('publish_at', 'is', null)
      .gte('publish_at', new Date().toISOString())
      .order('publish_at')
      .then(({ data }) => { if (!cancelled) setScheduledChapters(data || []); });
    return () => { cancelled = true; };
  }, [page]);

  // ЗАСВАР #44: нүүр хуудсанд харуулах хамгийн сүүлд нийтлэгдсэн бүлгүүд
  // (нэг манга дараалан хэдэн бүлэг гаргасан ч бүгд тусдаа карт болно)
  useEffect(() => {
    if (page !== 'home') return;
    let cancelled = false;
    supabase.from('chapters').select('*, mangas(id, title, poster_url, is_hidden)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (!cancelled) setRecentChapters(data || []); });
    return () => { cancelled = true; };
  }, [page]);

  // ЗАСВАР #81: "Бүх гаргалт" хуудсанд орохоос өмнө аль ангиллын сумаар (ШИНЭ
  // МАНГА/ДУУССАН/САНАЛ БОЛГОХ/ТҮҮХ) орж ирснээс хамааран эх жагсаалтыг сонгоно.
  const allCategoryBase = (() => {
    if (allCategory === 'new') return newMangas;
    if (allCategory === 'finished') return allMangas.filter(m => m.status === 'Дууссан');
    if (allCategory === 'recommended') return curatedRecommended;
    if (allCategory === 'history') return allMangas.filter(m => history.find(h => h.mangaId === m.id));
    if (allCategory === 'recentChapter') return allMangas.filter(m => recentChapters.find(ch => ch.mangas?.id === m.id));
    return allMangas;
  })();

  // ЗАСВАР #1: Хайлт/жанрын шүүлт одоо DB-гийн мангаг ч хамруулдаг болсон
  // (өмнө нь зөвхөн хатуу бичсэн `mangas` массивыг шүүдэг байсан).
  const filtered = allCategoryBase.filter(m =>
    (activeGenre === 'Бүгд' || (m.genres || []).includes(activeGenre)) &&
    m.title.toLowerCase().includes(search.toLowerCase())
  );

  // ШИНЭ: "Бүх гаргалт" хуудсанд хамгийн их үзэлттэй мангаагаас нь харуулах эрэмбэ
  const sortedFiltered = allSort === 'views' ? [...filtered].sort((a, b) => (b.views || 0) - (a.views || 0)) : filtered;

  // Бүлэг нээхэд түүхэнд бүртгэнэ (нэг мангад хамгийн сүүлийн бүлгийг л хадгална)
  const openReader = (manga, chapter) => {
    // ШИНЭ: VIP бүлгийг зөвхөн VIP/staff уншина
    if (chapter.is_vip && !isVip) {
      notify('👑 Энэ бол VIP бүлэг. Унших эрх авна уу!');
      setPage('vip');
      return;
    }
    // ШИНЭ: товлосон цаг болоогүй бүлэг
    if (chapterLocked(chapter) && !isStaff) {
      notify(`⏳ Энэ бүлэг ${formatRemaining(new Date(chapter.publish_at).getTime() - nowTs)}-ийн дараа нээгдэнэ!`);
      return;
    }
    setSelected(manga);
    setSelectedChapter(chapter);
    setPage('reader');
    setHistory(prev => [
      { mangaId: manga.id, chapter: chapter.chapter_number, date: Date.now() },
      ...prev.filter(h => h.mangaId !== manga.id),
    ]);
    // ШИНЭ: энэ бүлгийг "уншсан" гэж тэмдэглэнэ
    setReadChapters(prev => {
      const list = prev[manga.id] || [];
      if (list.includes(chapter.chapter_number)) return prev;
      return { ...prev, [manga.id]: [...list, chapter.chapter_number] };
    });
  };

  // ШИНЭ: сэтгэгдэл устгах (өөрийн эсвэл moderator/admin)
  const deleteComment = async (c) => {
    if (!window.confirm('Сэтгэгдлийг устгах уу?')) return;
    const { error } = await supabase.from('comments').delete().eq('id', c.id);
    if (error) notify('Алдаа: ' + error.message);
    else fetchComments(selectedChapter.id);
  };

  // ШИНЭ: сэтгэгдэл report хийх
  const reportComment = async (c) => {
    if (!currentUser) { setAuthPage('login'); return; }
    const reason = window.prompt('Шалтгаанаа бичнэ үү (заавал биш):');
    if (reason === null) return;
    const { error } = await supabase.from('reports').insert({
      comment_id: c.id,
      reporter_id: currentUser.id,
      reason: reason || '',
    });
    if (error) notify('Алдаа: ' + error.message);
    else notify('Мэдэгдэл илгээгдлээ. Модератор шалгах болно 🚩');
  };

  const navItems = [
    { label: 'Нүүр', p: 'home', icon: <IconHome /> },
    { label: 'Бүх гаргалт', p: 'all', icon: <IconGrid /> },
    { label: 'Хуваарь', p: 'schedule', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  ];

  const MangaCard = ({ m, showChapter }) => (
    <div onClick={() => goToDetail(m)} style={{ cursor: 'pointer', position: 'relative' }}>
      <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '3/4' }}>
        <img src={m.poster} alt={m.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {showChapter && history.find(h => h.mangaId === m.id) && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.8)', padding: '6px 8px', fontSize: 11, color: '#aaa' }}>
            Бүлэг {history.find(h => h.mangaId === m.id).chapter}
          </div>
        )}
        {!showChapter && !m.is_hidden && (STATUS_META[m.status] || DEFAULT_STATUS_META).badge && (
          <div style={{ position: 'absolute', top: 6, left: 6, background: (STATUS_META[m.status] || DEFAULT_STATUS_META).color, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>{(STATUS_META[m.status] || DEFAULT_STATUS_META).badge}</div>
        )}
        {m.is_hidden && (
          <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.8)', color: '#f5a623', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>🙈 НУУГДСАН</div>
        )}
      </div>
      <div style={{ padding: '6px 2px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{m.title}</div>
        <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{(m.genres || []).join(' / ').toUpperCase()}</div>
      </div>
    </div>
  );

  // ЗАСВАР #43: "БҮГДИЙГ ҮЗЭХ" гэсэн үг хэрэггүй, зөвхөн хажуу тийш харсан сум үлдэнэ
  const SectionHeader = ({ title, onClick }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 4, height: 20, background: '#8B0000', borderRadius: 2 }} />
        <span style={{ fontWeight: 800, fontSize: 16 }}>{title}</span>
      </div>
      <span onClick={onClick} title="Бүгдийг үзэх"
        style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', cursor: 'pointer', border: '1px solid #2a2a2a', background: '#141414' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </span>
    </div>
  );

  // ШИНЭ: нүүр хэсгийн ангилал тус бүрийг хажуу тийш гүйдэг мөр (carousel) болгох стиль
  const scrollRowStyle = { display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'thin' };
  const scrollCardStyle = { width: 130, flexShrink: 0 };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: "'Noto Sans', Arial, 'Segoe UI', sans-serif" }}>

      {/* ШИНЭ: site-тэй өнгө нийцсэн мэдэгдлийн карт (toast) — browser alert()-ийг орлоно */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
          {toasts.map(t => (
            <div key={t.id} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{ background: '#161616', border: `1px solid ${t.type === 'error' ? '#8B0000' : '#2e7d32'}`, borderLeft: `4px solid ${t.type === 'error' ? '#e0245e' : '#3ddc97'}`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#eee', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', cursor: 'pointer', lineHeight: 1.5 }}>
              {t.message}
            </div>
          ))}
        </div>
      )}

      {/* ШИНЭ: утсанд цэс нээлттэй үед арын хар давхарга — дарахад цэс хаагдана */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 150 }} />
      )}

      {/* Sidebar — утсан дээр hamburger-ээр гарч ирдэг drawer болно */}
      <div style={{ width: 220, background: '#0f0f0f', borderRight: '1px solid #1a1a1a', padding: '1.5rem 1rem', position: 'fixed', height: '100vh', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto', transition: 'transform 0.25s ease', transform: isMobile && !sidebarOpen ? 'translateX(-100%)' : 'translateX(0)' }}>

        {isMobile && (
          <span onClick={() => setSidebarOpen(false)}
            style={{ position: 'absolute', top: 14, right: 14, cursor: 'pointer', fontSize: 20, color: '#555' }}>✕</span>
        )}

        <div onClick={() => setPage('home')} style={{ marginBottom: '2rem', cursor: 'pointer' }}>
          <img src="/logo.png" alt="logo" style={{ width: 130, maxHeight: 48, height: 'auto', objectFit: 'contain' }} />
        </div>

        <div style={{ fontSize: 11, color: '#444', letterSpacing: 1, marginBottom: '0.5rem', paddingLeft: 8 }}>ҮНДСЭН</div>
        {navItems.map(item => (
          <div key={item.p} onClick={() => { setPage(item.p); if (item.p === 'all') setAllCategory(null); }}
            style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 2, cursor: 'pointer', fontSize: 14, color: page === item.p ? '#fff' : '#888', background: page === item.p ? '#1a1a1a' : 'transparent', fontWeight: page === item.p ? 600 : 400, display: 'flex', alignItems: 'center', gap: 10 }}>
            {item.icon}
            {item.label}
          </div>
        ))}

        <div style={{ fontSize: 11, color: '#444', letterSpacing: 1, margin: '1.5rem 0 0.5rem', paddingLeft: 8 }}>ХЭРЭГЛЭГЧ</div>
        <div onClick={() => setPage('library')}
          style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 2, cursor: 'pointer', fontSize: 14, color: page === 'library' ? '#fff' : '#888', background: page === 'library' ? '#1a1a1a' : 'transparent', fontWeight: page === 'library' ? 600 : 400, display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconBookmark />
          Миний сан
        </div>
        <div onClick={() => setPage('vip')}
          style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 2, cursor: 'pointer', fontSize: 14, color: page === 'vip' ? '#8B0000' : '#888', background: page === 'vip' ? '#1a1a1a' : 'transparent', fontWeight: page === 'vip' ? 600 : 400, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          Эрх авах
        </div>

        {/* ЗАСВАР #45: sidebar-ийн ёроолд site нэр + сошиал линкүүд
            (facebook/discord/instagram href-үүд түр placeholder '#' — бодит
            линкээ өгвөл шууд солино). */}
        <div style={{ marginTop: 'auto', paddingTop: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#555', fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>Roselle Manga</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            <a href="https://www.facebook.com/share/1EPQ7dvPse/?mibextid=wwXIfr" target="_blank" rel="noreferrer" title="Facebook"
              style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', color: '#888', textDecoration: 'none' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5h2.5l.5-3h-3V8.5c0-.9.25-1.5 1.5-1.5H16.6V4.3C16.3 4.25 15.4 4.17 14.3 4.17c-2.3 0-3.8 1.4-3.8 3.9V10.5H8v3h2.5V21h3z"/></svg>
            </a>
            <a href="https://discord.gg/zVqcGQPF8" target="_blank" rel="noreferrer" title="Discord"
              style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', color: '#888', textDecoration: 'none' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6.5a17 17 0 0 0-4.2-1.3l-.2.4a12 12 0 0 1 3.7 1.9 15 15 0 0 0-14.6 0 12 12 0 0 1 3.7-1.9l-.2-.4A17 17 0 0 0 4 6.5C2 9.6 1.4 12.6 1.6 15.6a17 17 0 0 0 5.1 2.6l.6-1a11 11 0 0 1-1.8-.9l.4-.3a12 12 0 0 0 10.2 0l.4.3a11 11 0 0 1-1.8.9l.6 1a17 17 0 0 0 5.1-2.6c.3-3.5-.5-6.5-2.4-9.1zM9 14c-.7 0-1.3-.7-1.3-1.5S8.3 11 9 11s1.3.7 1.3 1.5S9.7 14 9 14zm6 0c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.3.7 1.3 1.5-.6 1.5-1.3 1.5z"/></svg>
            </a>
            <a href="https://www.instagram.com/theroselle_?igsh=MXQ0d3ZjY3g5N3Zwag%3D%3D&utm_source=qr" target="_blank" rel="noreferrer" title="Instagram"
              style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', color: '#888', textDecoration: 'none' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>
            </a>
          </div>
        </div>

      </div>
      {/* Sidebar төгсөв */}

      {/* AUTH OVERLAY */}
      {authPage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#111', borderRadius: 16, padding: '2.5rem', width: 400, maxWidth: '100%', border: '1px solid #222', position: 'relative', boxSizing: 'border-box' }}>
            <span onClick={() => setAuthPage(null)} style={{ position: 'absolute', top: 16, right: 20, cursor: 'pointer', fontSize: 20, color: '#555' }}>✕</span>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <img src="/logo.png" alt="logo" style={{ height: 60, width: 'auto', objectFit: 'contain', marginBottom: 12 }} />
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {authPage === 'login' && 'НЭВТРЭХ'}
                {authPage === 'register' && 'БҮРТГҮҮЛЭХ'}
                {authPage === 'forgot' && 'НУУЦ ҮГ СЭРГЭЭХ'}
                {authPage === 'reset' && 'КОД БАТАЛГААЖУУЛАХ'}
              </div>
            </div>

            {/* НЭВТРЭХ / БҮРТГҮҮЛЭХ */}
            {(authPage === 'login' || authPage === 'register') && (
              <>
                {authPage === 'register' && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>НЭР</div>
                    <input value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})}
                      placeholder="Нэрээ оруулна уу"
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                )}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>ИМЭЙЛ</div>
                  <input value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})}
                    placeholder="example@email.com"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>НУУЦ ҮГ</div>
                  <PasswordField value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})}
                    placeholder="••••••••" />
                </div>
                {authPage === 'login' && (
                  <div style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
                    <span onClick={() => { setResetCode(''); setResetNewPassword(''); setAuthPage('forgot'); }}
                      style={{ color: '#8B0000', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                      Нууц үгээ мартсан уу?
                    </span>
                  </div>
                )}
                {authPage === 'register' && <div style={{ marginBottom: '1.5rem' }} />}
                <button onClick={async () => {
                  if (authPage === 'register') {
                    const { error } = await supabase.auth.signUp({
                      email: authForm.email,
                      password: authForm.password,
                      options: { data: { name: authForm.name } }
                    });
                    if (error) notify('Алдаа: ' + error.message);
                    else notify('Бүртгэл амжилттай! Имэйлээ шалгана уу 📧');
                  } else {
                    const { error } = await supabase.auth.signInWithPassword({
                      email: authForm.email,
                      password: authForm.password,
                    });
                    if (error) notify('Алдаа: ' + error.message);
                    else {
                      setAuthPage(null);
                      notify('Амжилттай нэвтэрлээ! 🎉');
                    }
                  }
                }} style={{ width: '100%', background: '#8B0000', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontSize: 15, cursor: 'pointer', fontWeight: 700, marginBottom: 16 }}>
                  {authPage === 'login' ? 'НЭВТРЭХ' : 'БҮРТГҮҮЛЭХ'}
                </button>
                <div style={{ textAlign: 'center', fontSize: 13, color: '#555' }}>
                  {authPage === 'login' ? (
                    <span>Бүртгэл байхгүй юу? <span onClick={() => setAuthPage('register')} style={{ color: '#8B0000', cursor: 'pointer', fontWeight: 600 }}>Бүртгүүлэх</span></span>
                  ) : (
                    <span>Бүртгэл байна уу? <span onClick={() => setAuthPage('login')} style={{ color: '#8B0000', cursor: 'pointer', fontWeight: 600 }}>Нэвтрэх</span></span>
                  )}
                </div>
              </>
            )}

            {/* НУУЦ ҮГ МАРТСАН — имэйл оруулаад код авах */}
            {authPage === 'forgot' && (
              <>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
                  Бүртгэлтэй имэйлээ оруулна уу. Бид танд 6 оронтой баталгаажуулах код илгээх болно.
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>ИМЭЙЛ</div>
                  <input value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})}
                    placeholder="example@email.com"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <button onClick={sendResetCode} disabled={resetSending || resendCooldown > 0}
                  style={{ width: '100%', background: (resetSending || resendCooldown > 0) ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontSize: 15, cursor: (resetSending || resendCooldown > 0) ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 16 }}>
                  {resetSending ? 'ИЛГЭЭЖ БАЙНА...' : resendCooldown > 0 ? `ДАХИН ИЛГЭЭХ (${resendCooldown}с)` : 'КОД ИЛГЭЭХ'}
                </button>
                <div style={{ textAlign: 'center', fontSize: 13, color: '#555' }}>
                  <span onClick={() => setAuthPage('login')} style={{ color: '#8B0000', cursor: 'pointer', fontWeight: 600 }}>← Нэвтрэх рүү буцах</span>
                </div>
              </>
            )}

            {/* КОД БАТАЛГААЖУУЛАХ — код + шинэ нууц үг */}
            {authPage === 'reset' && (
              <>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
                  <strong style={{ color: '#fff' }}>{authForm.email}</strong> хаяг руу илгээсэн 6 оронтой кодыг оруулна уу.
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>6 ОРОНТОЙ КОД</div>
                  <input value={resetCode} inputMode="numeric" maxLength={6}
                    onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 20, letterSpacing: 8, textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>ШИНЭ НУУЦ ҮГ</div>
                  <PasswordField value={resetNewPassword} onChange={e => setResetNewPassword(e.target.value)}
                    placeholder="Дор хаяж 6 тэмдэгт" />
                </div>
                <button onClick={confirmResetCode} disabled={resetSending}
                  style={{ width: '100%', background: resetSending ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontSize: 15, cursor: resetSending ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 16 }}>
                  {resetSending ? 'БАТАЛГААЖУУЛЖ БАЙНА...' : 'НУУЦ ҮГ СОЛИХ'}
                </button>
                <div style={{ textAlign: 'center', fontSize: 13, color: '#555' }}>
                  {/* ЗАСВАР #40: 30 секундын цэвэрхэн countdown — spam-ийг бэлхэнэ */}
                  {resendCooldown > 0 ? (
                    <span style={{ color: '#555' }}>Дахин илгээх ({resendCooldown}с)</span>
                  ) : (
                    <span onClick={sendResetCode} style={{ color: '#8B0000', cursor: 'pointer', fontWeight: 600 }}>Код дахин илгээх</span>
                  )}
                  {' · '}
                  <span onClick={() => setAuthPage('login')} style={{ color: '#888', cursor: 'pointer', fontWeight: 600 }}>Нэвтрэх рүү буцах</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Search overlay */}
      {searchOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10rem' }}>
          {/* ЗАСВАР #46: хайлт хэсэгт ✕-ээс гадна энгийн "← Буцах" товч нэмсэн */}
          <button onClick={() => { setSearchOpen(false); setSearch(''); }} title="Буцах"
            style={{ position: 'absolute', top: 24, left: 24, width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ width: '60%', display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid #333', paddingBottom: 16 }}>
            <span style={{ color: '#8B0000' }}><IconSearch /></span>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Манга хайх..."
              style={{ background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 28, fontWeight: 700, flex: 1 }} />
            <span onClick={() => { setSearchOpen(false); setSearch(''); }} style={{ cursor: 'pointer', fontSize: 24, color: '#aaa' }}>✕</span>
          </div>
          {search && (
            <div style={{ width: '60%', marginTop: 24 }}>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>ХАЙЛТЫН ИЛЭРЦ ({filtered.length})</div>
              {filtered.map(m => (
                <div key={m.id} onClick={() => { goToDetail(m); setSearchOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderRadius: 8, cursor: 'pointer', background: '#111', marginBottom: 8 }}>
                  <img src={m.poster} alt={m.title} style={{ width: 48, height: 64, objectFit: 'cover', borderRadius: 6 }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{m.title}</div>
                    <div style={{ fontSize: 12, color: '#8B0000', marginTop: 4, border: '1px solid #8B0000', display: 'inline-block', padding: '2px 8px', borderRadius: 4 }}>{(m.genres || []).join(' / ').toUpperCase()}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: '#555' }}>›</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main */}
      <div style={{ marginLeft: isMobile ? 0 : 220, flex: 1, minWidth: 0 }}>

        {/* Topbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap', padding: '0.75rem 1rem', borderBottom: '1px solid #1a1a1a', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 50, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, minWidth: 0 }}>
            {isMobile && (
              <span onClick={() => setSidebarOpen(true)} style={{ cursor: 'pointer', color: '#fff', flexShrink: 0 }}>
                <IconMenu />
              </span>
            )}
            <img src="/logo.png" alt="logo" style={{ height: isMobile ? 26 : 36, width: 'auto', maxWidth: 120, objectFit: 'contain', flexShrink: 0 }} />
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
            <span onClick={() => setSearchOpen(true)} style={{ cursor: 'pointer', color: '#aaa' }}>
              <IconSearch />
            </span>

            {currentUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* ЗАСВАР #53: emoji stiker-үүдийг цэвэрхэн SVG дүрсээр сольж байгаагийн нэг хэсэг */}
                {isStaff && (
                  <button onClick={() => setPage('admin')}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(139,0,0,0.2)', color: '#8B0000', border: '1px solid #8B0000', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    {isAdmin ? 'АДМИН' : 'УДИРДЛАГА'}
                  </button>
                )}
                <div style={{ position: 'relative' }}>
                  <div onClick={() => setProfileOpen(o => !o)} title="Хувиар" style={{ cursor: 'pointer' }}>
                    <Avatar url={userProfile?.avatar_url} letter={currentUser.email[0]} size={34} />
                  </div>

                  {/* ЗАСВАР #30: "Хувиар" тусдаа хуудас байхгүй болсон — avatar дээр дарахад
                      буланд гарч ирдэг жижиг цонх (dropdown) болгосон */}
                  {profileOpen && (
                    <>
                      <div onClick={() => setProfileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 290 }} />
                      <div style={{ position: 'absolute', top: '120%', right: 0, width: 320, maxWidth: '90vw', background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem', zIndex: 291, boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: '1.25rem' }}>
                          <div style={{ position: 'relative' }}>
                            <Avatar url={userProfile?.avatar_url} letter={currentUser.email[0]} size={56} />
                            <label style={{ position: 'absolute', bottom: -2, right: -2, background: '#8B0000', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid #111', fontSize: 11 }} title="Зураг солих">
                              {avatarUploading ? '⏳' : '📷'}
                              <input type="file" accept="image/*" style={{ display: 'none' }}
                                onChange={e => { if (e.target.files[0]) uploadAvatar(e.target.files[0]); e.target.value = ''; }} />
                            </label>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userProfile?.name || currentUser.user_metadata?.name || 'Хэрэглэгч'}</div>
                            <div style={{ color: '#888', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.email}</div>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                              {userRoles.map(r => (
                                <div key={r} style={{ display: 'inline-block', background: 'rgba(139,0,0,0.15)', border: '1px solid #8B0000', color: '#8B0000', fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10 }}>{(ROLE_LABELS[r] || r).toUpperCase()}</div>
                              ))}
                              {/* ЗАСВАР #39: дуусах огноо биш, үлдсэн хоногийн тоог харуулна (жишээ нь 28 хоног) */}
                              {hasActiveVip && (
                                <div style={{ display: 'inline-block', background: 'rgba(245,166,35,0.15)', border: '1px solid #f5a623', color: '#f5a623', fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10 }}>
                                  👑 VIP{userProfile?.vip_expires_at ? ` · ${Math.max(0, Math.ceil((new Date(userProfile.vip_expires_at).getTime() - nowTs) / 86400000))} хоног үлдсэн` : ''}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>ХАРАГДАХ НЭР</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input value={profileName} onChange={e => setProfileName(e.target.value)}
                              placeholder="Нэрээ оруулна уу"
                              style={{ flex: 1, minWidth: 0, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }} />
                            <button onClick={saveProfileName}
                              style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                              ХАДГАЛАХ
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                          {[
                            { label: 'Хадгалсан', value: library.length },
                            { label: 'Уншсан манга', value: history.length },
                            { label: 'Уншсан бүлэг', value: Object.values(readChapters).reduce((s, a) => s + a.length, 0) },
                          ].map((s, i) => (
                            <div key={i} style={{ background: '#1a1a1a', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
                              <div style={{ fontSize: 17, fontWeight: 800 }}>{s.value}</div>
                              <div style={{ fontSize: 10, color: '#777', marginTop: 2 }}>{s.label}</div>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={async () => {
                            await supabase.auth.signOut();
                            setCurrentUser(null);
                            setUserProfile(null);
                            setProfileOpen(false);
                            setPage('home');
                          }}
                          style={{ width: '100%', background: 'rgba(139,0,0,0.15)', color: '#8B0000', border: '1px solid #8B0000', padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                          ГАРАХ
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <button onClick={() => setAuthPage('login')}
                style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                НЭВТРЭХ
              </button>
            )}
          </div>
        </div>

        {/* HOME PAGE — DB-д манга байхгүй бол (жишээ нь шинэ суулгасан үед) хоосон дэлгэц биш зурвас харуулна */}
        {page === 'home' && allMangas.length === 0 && (
          <div style={{ color: '#555', textAlign: 'center', marginTop: '6rem' }}>
            Одоогоор манга байхгүй байна. Admin хуудаснаас манга нэмнэ үү.
          </div>
        )}
        {page === 'home' && allMangas.length > 0 && (
          <div>
            {/* ЗАСВАР #62: hero-г арай богиносгож (460→320), "30 хоногийн ТОП" бичгийг
                хассан, гарчгийн фонтыг жижигрүүлж, БҮХЭЛ slide-ыг дархад манга
                хуудас руу ордог болгосон (өмнө нь зөвхөн гарчиг л дархад ажилладаг,
                бусад хэсэгт дарахад юу ч болдоггүй байсан). */}
            {heroManga && (
              <div onClick={() => goToDetail(heroManga)} style={{ position: 'relative', height: 320, overflow: 'hidden', cursor: 'pointer' }}>
                {recommendedMangas.map((m, i) => (
                  <div key={m.id} style={{ position: 'absolute', inset: 0, opacity: heroIndex === i ? 1 : 0, transition: 'opacity 0.9s ease' }}>
                    <img src={m.banner_url || m.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,10,10,0.95) 15%, rgba(10,10,10,0.2) 60%, rgba(10,10,10,0.5))' }} />
                  </div>
                ))}
                <div style={{ position: 'absolute', bottom: '2rem', left: '2rem', right: '2rem', zIndex: 2 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2, marginBottom: 14, maxWidth: 640 }}>
                    {heroManga.title}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {recommendedMangas.map((_, i) => (
                      <div key={i} onClick={e => { e.stopPropagation(); setHeroIndex(i); }}
                        style={{ width: heroIndex === i ? 24 : 8, height: 8, borderRadius: 4, background: heroIndex === i ? '#fff' : 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'all 0.3s' }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Sections — ЗАСВАР #79: захиалсан дараалал: ТҮҮХ → ШИНЭ БҮЛЭГ → ШИНЭ МАНГА → САНАЛ БОЛГОХ → ДУУССАН */}
            <div style={{ padding: '1.5rem 2rem 3rem' }}>
              {allMangas.filter(m => history.find(h => h.mangaId === m.id)).length > 0 && (
                <div style={{ marginBottom: '2.5rem' }}>
                  <SectionHeader title="ТҮҮХ" onClick={() => { setAllCategory('history'); setPage('all'); }} />
                  <div className="scroll-row" style={scrollRowStyle}>
                    {allMangas.filter(m => history.find(h => h.mangaId === m.id)).map(m => <div key={m.id} style={scrollCardStyle}><MangaCard m={m} showChapter={true} /></div>)}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '2.5rem' }}>
                <SectionHeader title="ШИНЭ БҮЛЭГ" onClick={() => { setAllCategory('recentChapter'); setPage('all'); }} />
                <div className="scroll-row" style={scrollRowStyle}>
                  {recentChapters
                    .filter(ch => (isStaff || !ch.mangas?.is_hidden) && (isStaff || !chapterLocked(ch)))
                    .map(ch => (
                      <div key={ch.id}
                        onClick={() => ch.mangas && openReader({ id: ch.mangas.id, title: ch.mangas.title, poster: ch.mangas.poster_url }, ch)}
                        style={{ ...scrollCardStyle, cursor: 'pointer' }}>
                        <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '3/4' }}>
                          <img src={ch.mangas?.poster_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div style={{ position: 'absolute', top: 6, left: 6, background: '#8B0000', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>Бүлэг {ch.chapter_number}</div>
                        </div>
                        <div style={{ padding: '6px 2px' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{ch.mangas?.title}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* ЗАСВАР #64: ШИНЭ МАНГА — саяхан нэмэгдсэн манганууд */}
              {newMangas.length > 0 && (
                <div style={{ marginBottom: '2.5rem' }}>
                  <SectionHeader title="ШИНЭ МАНГА" onClick={() => { setAllCategory('new'); setPage('all'); }} />
                  <div className="scroll-row" style={scrollRowStyle}>
                    {newMangas.map(m => <div key={m.id} style={scrollCardStyle}><MangaCard m={m} showChapter={false} /></div>)}
                  </div>
                </div>
              )}

              {/* ЗАСВАР #76: САНАЛ БОЛГОХ — admin гараар сонгосон 10 манга */}
              {curatedRecommended.length > 0 && (
                <div style={{ marginBottom: '2.5rem' }}>
                  <SectionHeader title="САНАЛ БОЛГОХ" onClick={() => { setAllCategory('recommended'); setPage('all'); }} />
                  <div className="scroll-row" style={scrollRowStyle}>
                    {curatedRecommended.map(m => <div key={m.id} style={scrollCardStyle}><MangaCard m={m} showChapter={false} /></div>)}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '2.5rem' }}>
                <SectionHeader title="ДУУССАН" onClick={() => { setAllCategory('finished'); setPage('all'); }} />
                <div className="scroll-row" style={scrollRowStyle}>
                  {allMangas.filter(m => m.status === 'Дууссан').map(m => <div key={m.id} style={scrollCardStyle}><MangaCard m={m} showChapter={false} /></div>)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ALL PAGE */}
        {page === 'all' && (
          <div style={{ padding: '1.5rem 2rem' }}>
            {/* ЗАСВАР #80: "цааш үзэх" тэмдгээр орж ирэхэд буцах товч байхгүй байсныг засав */}
            <button onClick={() => setPage('home')} title="Буцах"
              style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', marginBottom: '1.25rem' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            {/* ЗАСВАР #82: категорийн сумаар орж ирсэн үед хайлт/төрөл/эрэмбэ
                хэсгүүд шаардлагагүй тул зөвхөн "Бүх гаргалт"-аар (allCategory
                хоосон) орж ирсэн үед л харуулна. */}
            {!allCategory && (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Манга хайх..."
                    style={{ background: '#111', border: '1px solid #222', borderRadius: 6, padding: '8px 16px', color: '#fff', fontSize: 13, outline: 'none', width: 240 }} />
                  <div style={{ position: 'relative' }}>
                    <div onClick={() => setGenreOpen(prev => !prev)}
                      style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 24, minWidth: 160 }}>
                      <span>ТӨРӨЛ: {activeGenre.toUpperCase()}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                    {genreOpen && (
                      <div style={{ position: 'absolute', top: '110%', left: 0, background: '#111', border: '1px solid #222', borderRadius: 8, overflow: 'hidden', zIndex: 100, minWidth: 160 }}>
                        <div onClick={() => { setActiveGenre('Бүгд'); setGenreOpen(false); }}
                          style={{ padding: '10px 16px', fontSize: 13, cursor: 'pointer', color: activeGenre === 'Бүгд' ? '#8B0000' : '#aaa', fontWeight: activeGenre === 'Бүгд' ? 700 : 400 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>БҮГД</div>
                        {genres.map(g => (
                          <div key={g} onClick={() => { setActiveGenre(g); setGenreOpen(false); }}
                            style={{ padding: '10px 16px', fontSize: 13, cursor: 'pointer', color: activeGenre === g ? '#8B0000' : '#aaa', fontWeight: activeGenre === g ? 700 : 400 }}
                            onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{g.toUpperCase()}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {/* ЗАСВАР #27: 3 харагдах загварын сонголтыг хассан — grid дан ганц загвар үлдсэн */}
                <div style={{ display: 'flex', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { key: 'default', label: 'ШИНЭЭР' },
                      { key: 'views', label: 'ҮЗЭЛТЭЭР' },
                    ].map(s => (
                      <div key={s.key} onClick={() => setAllSort(s.key)}
                        style={{ fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 16, cursor: 'pointer', background: allSort === s.key ? '#8B0000' : '#12161f', color: allSort === s.key ? '#fff' : '#8a92a6', border: '1px solid #1e2430' }}>
                        {s.label}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <SectionHeader title={{
              new: 'ШИНЭ МАНГА',
              finished: 'ДУУССАН',
              recommended: 'САНАЛ БОЛГОХ',
              history: 'ТҮҮХ',
              recentChapter: 'ШИНЭ БҮЛЭГ',
            }[allCategory] || 'БҮХ ГАРГАЛТ'} onClick={() => {}} />

            {/* ЗАСВАР #83: ШИНЭ БҮЛЭГ ангиллаар орж ирсэн үед манга биш, бүлэг тус
                бүрийг (cover + бүлгийн дугаараар) харуулна — нүүр хэсгийн мөртэй
                адил мэдээлэл алдагдахгүй. */}
            {allCategory === 'recentChapter' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 16 }}>
                  {recentChapters
                    .filter(ch => (isStaff || !ch.mangas?.is_hidden) && (isStaff || !chapterLocked(ch)))
                    .map(ch => (
                      <div key={ch.id}
                        onClick={() => ch.mangas && openReader({ id: ch.mangas.id, title: ch.mangas.title, poster: ch.mangas.poster_url }, ch)}
                        style={{ cursor: 'pointer' }}>
                        <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '3/4' }}>
                          <img src={ch.mangas?.poster_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div style={{ position: 'absolute', top: 6, left: 6, background: '#8B0000', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>Бүлэг {ch.chapter_number}</div>
                        </div>
                        <div style={{ padding: '6px 2px' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{ch.mangas?.title}</div>
                        </div>
                      </div>
                    ))}
                </div>
                {recentChapters.filter(ch => (isStaff || !ch.mangas?.is_hidden) && (isStaff || !chapterLocked(ch))).length === 0 && (
                  <div style={{ color: '#555', textAlign: 'center', marginTop: '4rem' }}>Илэрц олдсонгүй</div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 16 }}>
                  {sortedFiltered.map(m => <MangaCard key={m.id} m={m} showChapter={false} />)}
                </div>
                {filtered.length === 0 && <div style={{ color: '#555', textAlign: 'center', marginTop: '4rem' }}>Илэрц олдсонгүй</div>}
              </>
            )}
          </div>
        )}

        {/* ШИНЭ: ХУВААРЬ — 7 хоногийн гарагаар манга гарах цаг */}
        {page === 'schedule' && (
          <div style={{ padding: '1.5rem 2rem' }}>
            <SectionHeader title="ГАРАХ ХУВААРЬ" onClick={() => {}} />

            {/* Staff: хуваарь тохируулах */}
            {canModerate && (
              <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>МАНГА</div>
                  <select value={scheduleMangaId} onChange={e => setScheduleMangaId(e.target.value)}
                    style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', minWidth: 200 }}>
                    <option value="">-- Манга сонгох --</option>
                    {dbMangas.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ГАРАГ</div>
                  <select value={scheduleDay} onChange={e => setScheduleDay(e.target.value)}
                    style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }}>
                    {[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{DAYS[d]}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ЦАГ</div>
                  <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                    style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '7px 12px', color: '#fff', fontSize: 13, outline: 'none', colorScheme: 'dark' }} />
                </div>
                <button onClick={async () => {
                  if (!scheduleMangaId) { notify('Манга сонгоно уу!'); return; }
                  const { error } = await supabase.from('mangas').update({
                    schedule_day: Number(scheduleDay),
                    schedule_time: scheduleTime,
                  }).eq('id', scheduleMangaId);
                  if (error) notify('Алдаа: ' + error.message);
                  else { notify('Хуваарь хадгалагдлаа! 📅'); fetchMangas(); }
                }} style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  ХАДГАЛАХ
                </button>
                <button onClick={async () => {
                  if (!scheduleMangaId) { notify('Манга сонгоно уу!'); return; }
                  const { error } = await supabase.from('mangas').update({ schedule_day: null, schedule_time: null }).eq('id', scheduleMangaId);
                  if (error) notify('Алдаа: ' + error.message);
                  else { notify('Хуваарь устгагдлаа'); fetchMangas(); }
                }} style={{ background: '#222', color: '#aaa', border: '1px solid #333', padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  УСТГАХ
                </button>
              </div>
            )}

            {/* ЗАСВАР #28: 7 хоногийг хажуу хажуугаар (багана) биш, доошоо цувсан
                мөр мөрөөр харуулж, дотор нь нягт жагсаалт (compact) хэлбэрээр
                бүлгийн cover зураг + нэр + бүлгийн дугаар + цагийг харуулна. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3, 4, 5, 6, 0].map(d => {
                {/* ЗАСВАР #72: schedule_day нь NULL үед Number(null) === 0 болж, хуваарьгүй
                    манга бүгд "Ням" гарагт орж ирдэг байсан алдааг засав */}
                const dayMangas = dbMangas.filter(m => m.schedule_day != null && Number(m.schedule_day) === d);
                // ЗАСВАР #21: тухайн долоо хоногт унах тодорхой цагт товлогдсон бүлгүүд
                const dayChapters = scheduledChapters.filter(ch => new Date(ch.publish_at).getDay() === d);
                const isToday = new Date().getDay() === d;
                return (
                  <div key={d} style={{ background: isToday ? 'rgba(139,0,0,0.08)' : '#0f1219', border: isToday ? '1px solid #8B0000' : '1px solid #1c2230', borderRadius: 14, padding: '1rem' }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8, color: isToday ? '#8B0000' : '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {DAYS[d]}
                      {isToday && <span style={{ fontSize: 9, background: '#8B0000', color: '#fff', padding: '2px 8px', borderRadius: 10 }}>ӨНӨӨДӨР</span>}
                    </div>
                    {dayMangas.length === 0 && dayChapters.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#444' }}>—</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {dayMangas.map((m, i) => {
                          const next = nextScheduleDate(m.schedule_day, m.schedule_time);
                          return (
                            <div key={`m${m.id}`} onClick={() => goToDetail(m)}
                              style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', padding: '8px 0', borderTop: i > 0 ? '1px solid #1c2230' : 'none' }}>
                              <img src={m.poster} alt="" style={{ width: 46, height: 62, objectFit: 'cover', objectPosition: 'top', borderRadius: 8, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                                <div style={{ fontSize: 11, color: '#fff', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                                  {String(m.schedule_time).slice(0, 5)}{next ? ` · Үлдсэн: ${formatRemaining(next.getTime() - nowTs)}` : ''}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {dayChapters.map((ch, i) => (
                          <div key={`c${ch.id}`} onClick={() => goToDetail({ id: ch.manga_id, title: ch.mangas?.title, poster: ch.mangas?.poster_url })}
                            style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', padding: '8px 0', borderTop: (dayMangas.length > 0 || i > 0) ? '1px solid #1c2230' : 'none' }}>
                            <img src={ch.thumbnail_url || ch.mangas?.poster_url} alt="" style={{ width: 46, height: 62, objectFit: 'cover', objectPosition: 'top', borderRadius: 8, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ch.mangas?.title || 'Манга'} — Бүлэг {ch.chapter_number}
                              </div>
                              <div style={{ fontSize: 11, color: '#fff', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                                {String(ch.publish_at).slice(11, 16)} · Үлдсэн: {formatRemaining(new Date(ch.publish_at).getTime() - nowTs)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}



        {/* LIBRARY PAGE */}
        {page === 'library' && (
          <div style={{ padding: '1.5rem 2rem' }}>
            <SectionHeader title="МИНИЙ САН" onClick={() => {}} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 16 }}>
              {allMangas.filter(m => library.includes(m.id)).map(m => (
                <div key={m.id} style={{ position: 'relative' }}>
                  <MangaCard m={m} showChapter={false} />
                  <button onClick={() => toggleLibrary(m.id)}
                    style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#f5a623', fontSize: 16, cursor: 'pointer', borderRadius: 4, padding: '2px 6px' }}>★</button>
                </div>
              ))}
            </div>
            {library.length === 0 && <div style={{ color: '#555', textAlign: 'center', marginTop: '4rem' }}>Хадгалсан манга байхгүй байна</div>}
          </div>
        )}

        {/* DETAIL PAGE */}
        {page === 'detail' && selected && (
          <div>
            {/* ЗАСВАР #29: тайлбар урт үед хэсэг нь тасарч харагдахгүй болдог байсныг
                засав — өмнө нь мэдээллийн блок (poster+нэр+тайлбар+товч) 400px-ээр
                хатуу хязгаарлагдсан, overflow:hidden банерийн ДОТОР absolute
                байрлалтай байсан тул урт тайлбар дээшээ ургаад таслагддаг байсан.
                Одоо банер зөвхөн чимэглэлийн дэвсгэр (тогтмол өндөртэй), мэдээллийн
                блок нь ердийн урсгалд (overflow хийхгүй, хэдий ч урт байсан бүрэн
                харагдана) байрлана. */}
            <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
              <img src={selected.banner_url || selected.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', filter: 'blur(2px)', transform: 'scale(1.05)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} />

              {/* ЗАСВАР #37/#61: буцах товчийг банер дээр бас нэгийг тавьж, доод
                  мөрийн товчнуудаас үл хамааран үргэлж харагдаж байхаар болгосон.
                  Одоо үргэлж "Нүүр" биш, орж ирсэн хуудас руугаа буцаана. */}
              <button onClick={() => setPage(previousPage)} title="Буцах"
                style={{ position: 'absolute', top: 16, left: 16, zIndex: 5, width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', cursor: 'pointer', backdropFilter: 'blur(6px)' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>

              {/* ЗАСВАР #77: "Дараагийн бүлэг" countdown-ыг буланд харуулахаа больж,
                  түүний оронд Хадгалах товчийг floating байдлаар тавив. */}
              <button onClick={() => toggleLibrary(selected.id)}
                style={{ position: 'absolute', top: 16, right: 16, zIndex: 5, background: library.includes(selected.id) ? 'rgba(139,0,0,0.85)' : 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '8px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer', backdropFilter: 'blur(6px)', fontWeight: 700 }}>
                {library.includes(selected.id) ? '★ Хадгалсан' : '☆ Хадгалах'}
              </button>
            </div>

            {/* ЗАСВАР #66: cover зурган хажууд төрөл badge + хадгалах товчийг зөөв,
                гарчгийг жижигрүүлж, ★4.9 үнэлгээг бүр мөсөн хассан, "Уншиж
                эхлэх"/"Хадгалах" текст товчнуудыг мөрнөөс хассан (Хадгалах
                нь cover-ийн доор жижиг товч болов), суллагдсан зайд admin
                бичдэг тэмдэглэлийн хэсэг нэмсэн. */}
            <div style={{ padding: '0 2rem 1.5rem', marginTop: -60, position: 'relative', zIndex: 2 }}>
              {/* ЗАСВАР #78: жанр + орчуулагчийн нэр (admin_note)-г cover-ийн ДООР биш,
                  cover-ийн ХАЖУУД (баруун талын хоосон зайд) байрлуулав — доор нь
                  бүтэн өргөнөөр гарчиг/тайлбар зэргийг тусад нь мөрлөв. */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
                <img src={selected.poster} alt="" style={{ width: 130, height: 178, objectFit: 'cover', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(selected.genres || []).map(g => (
                      <span key={g} style={{ fontSize: 11, color: '#8B0000', border: '1px solid #8B0000', display: 'inline-block', padding: '2px 10px', borderRadius: 4, background: '#0a0a0a' }}>{g.toUpperCase()}</span>
                    ))}
                  </div>

                  {(selected.admin_note || canModerate) && (
                    <div>
                      {mangaNoteEditing ? (
                        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 10, padding: 12 }}>
                          <textarea value={mangaNoteDraft} onChange={e => setMangaNoteDraft(e.target.value)}
                            rows={2} placeholder="Орчуулагчийн нэр (жишээ нь: Орчуулагч: Бат, Болд)..."
                            style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button onClick={async () => {
                              const { error } = await supabase.from('mangas').update({ admin_note: mangaNoteDraft.trim() || null }).eq('id', selected.id);
                              if (error) { notify('Алдаа: ' + error.message); return; }
                              setSelected({ ...selected, admin_note: mangaNoteDraft.trim() || null });
                              setMangaNoteEditing(false);
                            }} style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>ХАДГАЛАХ</button>
                            <button onClick={() => setMangaNoteEditing(false)}
                              style={{ background: '#222', color: '#aaa', border: '1px solid #333', padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>ЦУЦЛАХ</button>
                          </div>
                        </div>
                      ) : (
                        <div onClick={() => canModerate && (setMangaNoteDraft(selected.admin_note || ''), setMangaNoteEditing(true))}
                          style={{ borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dde1ea', lineHeight: 1.6, cursor: canModerate ? 'pointer' : 'default' }}>
                          <span style={{ fontWeight: 400, color: '#fff' }}>Admin: </span>
                          {selected.admin_note || (canModerate ? '+ Орчуулагчийн нэр нэмэх (дарж бичнэ үү)' : '')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ paddingBottom: 4 }}>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{selected.title}</div>
                <div style={{ color: '#bbb', fontSize: 13, marginBottom: 12, lineHeight: 1.6 }}>{selected.desc}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#aaa', marginBottom: 16, flexWrap: 'wrap' }}>
                  {/* ЗАСВАР #6: DB-гийн мангад "0 бүлэг" гэж гардаг байсныг
                      бодит бүлгийн тоог харуулдаг болгосон */}
                  {/* ЗАСВАР #49: энгийн текст биш, жижиг pill badge хэлбэрээр цэгцтэй харуулна */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#161b26', border: '1px solid #232a38', borderRadius: 20, padding: '4px 12px' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8a92a6" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    {dbChapters.length > 0 ? dbChapters.length : selected.chapters} бүлэг
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#161b26', border: '1px solid #232a38', borderRadius: 20, padding: '4px 12px' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8a92a6" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    {selected.views || 0}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#161b26', border: '1px solid #232a38', borderRadius: 20, padding: '4px 12px', color: (STATUS_META[selected.status] || DEFAULT_STATUS_META).color }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                    {selected.status}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {/* ШИНЭ: манга нуух/ил болгох (moderator/admin, зөвхөн DB манга) */}
                  {canModerate && dbMangas.find(d => d.id === selected.id) && (
                    <button onClick={async () => {
                      const nv = !selected.is_hidden;
                      const { error } = await supabase.from('mangas').update({ is_hidden: nv }).eq('id', selected.id);
                      if (error) { notify('Алдаа: ' + error.message); return; }
                      setSelected({ ...selected, is_hidden: nv });
                      fetchMangas();
                      notify(nv ? 'Манга нуугдлаа 🙈' : 'Манга ил боллоо 👁');
                    }}
                      style={{ background: selected.is_hidden ? '#1e5c2e' : 'rgba(139,0,0,0.25)', color: '#fff', border: '1px solid #444', padding: '10px 24px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
                      {selected.is_hidden ? '👁 ИЛ БОЛГОХ' : '🙈 НУУХ'}
                    </button>
                  )}
                  {/* ЗАСВАР #71: нүүр хэсгийн "Санал болгох" hero-д гараар нэмэх/хасах (зөвхөн admin) */}
                  {isAdmin && dbMangas.find(d => d.id === selected.id) && (
                    <button onClick={async () => {
                      const nv = !selected.is_recommended;
                      const { error } = await supabase.from('mangas').update({ is_recommended: nv }).eq('id', selected.id);
                      if (error) { notify('Алдаа: ' + error.message); return; }
                      setSelected({ ...selected, is_recommended: nv });
                      fetchMangas();
                      notify(nv ? 'Санал болгох хэсэгт нэмэгдлээ ⭐' : 'Санал болгох хэсгээс хасагдлаа');
                    }}
                      style={{ background: selected.is_recommended ? '#8B0000' : 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '10px 24px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
                      {selected.is_recommended ? '⭐ САНАЛ БОЛГОСОН' : '☆ САНАЛ БОЛГОХ'}
                    </button>
                  )}
                  {/* ШИНЭ: оруулсан мангаг засах */}
                  {canModerate && dbMangas.find(d => d.id === selected.id) && (
                    <button onClick={() => {
                      setEditMangaForm({ title: selected.title, desc: selected.desc || '', genres: selected.genres || [], status: selected.status });
                      setEditPosterFile(null);
                      setEditBannerFile(null);
                      setEditManga(selected);
                    }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '10px 24px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
                      ЗАСАХ
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div style={{ padding: '1.5rem 2rem' }}>
              {/* ШИНЭ ЗАГВАР: гарчиг + эрэмбэ + тоолуур */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 20, background: '#8B0000', borderRadius: 2 }} />
                  <span style={{ fontWeight: 800, fontSize: 18 }}>БҮЛГҮҮД</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div onClick={() => setChapterSort(s => s === 'asc' ? 'desc' : 'asc')}
                    style={{ background: '#161b26', border: '1px solid #232a38', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    ⇅ {chapterSort === 'asc' ? `1-${dbChapters.length}` : `${dbChapters.length}-1`}
                  </div>
                  <span style={{ fontSize: 14, color: '#888', fontWeight: 700 }}>{dbChapters.length}/{dbChapters.length}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {dbChapters.length > 0 ? [...dbChapters]
                  .sort((a, b) => chapterSort === 'asc' ? a.chapter_number - b.chapter_number : b.chapter_number - a.chapter_number)
                  .map(ch => {
                    const isLast = history.find(h => h.mangaId === selected.id)?.chapter === ch.chapter_number;
                    const locked = chapterLocked(ch);
                    const needsVip = ch.is_vip && !isVip;
                    return (
                      <div key={ch.id}
                        onClick={() => openReader(selected, ch)}
                        style={{ background: '#10141d', borderRadius: 16, padding: '14px 18px', cursor: 'pointer', border: (needsVip || locked) ? '1px solid rgba(245,166,35,0.45)' : isLast ? '1px solid #8B0000' : '1px solid #1c2230', display: 'flex', alignItems: 'center', gap: 16, position: 'relative', transition: 'background 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#161b26'}
                        onMouseLeave={e => e.currentTarget.style.background = '#10141d'}>
                        {/* Бүлгийн cover зураг */}
                        {ch.thumbnail_url ? (
                          <img src={ch.thumbnail_url} alt="" style={{ width: 96, height: 64, borderRadius: 12, objectFit: 'cover', objectPosition: 'top', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 96, height: 64, borderRadius: 12, background: 'rgba(139,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, color: '#8B0000', flexShrink: 0 }}>{ch.chapter_number}</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* ЗАСВАР #69: бүлгийн нэрийг хассан, дугаарыг "N-р бүлэг" гэж жижигдүү,
                              нарийхан фонтоор харуулна. Доод мөрөнд: түгжээтэй бол үлдсэн
                              хугацаа, нийтлэгдсэн бол цэвэрхэн тоон огноо (жишээ 2026.07.13). */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: '#dde1ea' }}>{ch.chapter_number}-р бүлэг</span>
                            {/* ЗАСВАР #60: "ҮНЭГҮЙ"/"VIP" гэсэн текст badge-үүдийг хассан (VIP хориг
                                хэвээрээ padlock дүрсээр баруун талд харагдана), оронд нь admin-ийн
                                оруулсан дурын тэмдэглэгээ (жишээ нь "S1 END") гарч ирнэ */}
                            {ch.label && (
                              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: '#f5a623', border: '1px solid rgba(245,166,35,0.4)', background: 'rgba(245,166,35,0.08)', padding: '3px 12px', borderRadius: 20 }}>{ch.label}</span>
                            )}
                            {isStaff && ch.status === 'pending' && <span style={{ fontSize: 10, color: '#f5a623', fontWeight: 700 }}>ХҮЛЭЭГДЭЖ БУЙ</span>}
                            {isStaff && ch.status === 'rejected' && <span style={{ fontSize: 10, color: '#8B0000', fontWeight: 700 }}>ТАТГАЛЗСАН</span>}
                            {isStaff && ch.is_hidden && <span style={{ fontSize: 10, color: '#888', fontWeight: 700 }}>🙈 НУУГДСАН</span>}
                          </div>
                          <div style={{ fontSize: 12, color: locked ? '#f5a623' : '#6b7385', marginTop: 5, display: 'flex', gap: 10, alignItems: 'center' }}>
                            {locked ? (
                              <span>⏳ {formatRemaining(new Date(ch.publish_at).getTime() - nowTs)}</span>
                            ) : (
                              <span>{formatNumericDate(ch.created_at)}</span>
                            )}
                          </div>
                        </div>
                        {isLast && (
                          <div style={{ position: 'absolute', top: -8, left: 14, background: '#8B0000', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 10, letterSpacing: 0.5 }}>СҮҮЛД УНШСАН</div>
                        )}
                        {/* ШИНЭ: бүлэг нуух товч (moderator/admin) */}
                        {canModerate && (
                          <span onClick={async (e) => {
                            e.stopPropagation();
                            const nv = !ch.is_hidden;
                            const { error } = await supabase.from('chapters').update({ is_hidden: nv }).eq('id', ch.id);
                            if (error) { notify('Алдаа: ' + error.message); return; }
                            setDbChapters(prev => prev.map(x => x.id === ch.id ? { ...x, is_hidden: nv } : x));
                          }} title={ch.is_hidden ? 'Ил болгох' : 'Нуух'}
                            style={{ fontSize: 16, cursor: 'pointer', padding: 4 }}>
                            {ch.is_hidden ? '👁' : '🙈'}
                          </span>
                        )}
                        {/* ЗАСВАР #38: бүлэг устгах (admin/moderator) */}
                        {canModerate && (
                          <span onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm(`Бүлэг ${ch.chapter_number}-ийг бүрмөсөн устгах уу? Энэ үйлдлийг буцаах боломжгүй.`)) return;
                            const { error } = await supabase.from('chapters').delete().eq('id', ch.id);
                            if (error) { notify('Алдаа: ' + error.message); return; }
                            setDbChapters(prev => prev.filter(x => x.id !== ch.id));
                            notify('Бүлэг устгагдлаа 🗑');
                          }} title="Устгах"
                            style={{ fontSize: 16, cursor: 'pointer', padding: 4, color: '#8B0000' }}>
                            🗑
                          </span>
                        )}
                        {/* Баруун талын icon: түгжээ эсвэл сум */}
                        {(needsVip || locked) ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                        )}
                      </div>
                    );
                  }) : (
                  <div style={{ color: '#555', fontSize: 14 }}>Одоогоор бүлэг ороогүй байна.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIP PAGE — үнийг PLANS-аас уншина (ЗАСВАР #3) */}
        {page === 'vip' && (
          <div style={{ padding: '3rem 2rem', minHeight: '100vh', background: '#050505', color: '#fff' }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <div style={{ fontSize: 42, fontWeight: 900 }}>ЭРХ АВАХ</div>
              <div style={{ color: '#777', marginTop: 10 }}>Өөрт тохирох багцаа сонгоно уу</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
              {PLANS.map(plan => (
                <div key={plan.key}
                  style={{ width: 300, background: '#111', padding: 30, borderRadius: 20, border: '2px solid #8B0000', transition: '0.3s', cursor: 'pointer', position: 'relative', boxShadow: plan.recommended ? '0 0 30px #8B0000' : 'none' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(139,0,0,0.5)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = plan.recommended ? '0 0 30px #8B0000' : 'none'; }}>
                  {plan.recommended && (
                    <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: '#8B0000', padding: '4px 16px', borderRadius: 20, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>САНАЛ БОЛГОХ</div>
                  )}
                  <h2 style={{ textAlign: 'center', color: '#fff', marginBottom: 8 }}>{plan.label}</h2>
                  <div style={{ textAlign: 'center', fontSize: 40, fontWeight: 900, margin: '20px 0', color: '#fff' }}>{plan.price}</div>
                  <div style={{ lineHeight: 2, color: '#aaa', marginBottom: 8 }}>
                    {plan.features.map((f, i) => <div key={i}>✓ {f}</div>)}
                  </div>
                  <button onClick={() => { setSelectedPlan(plan.key); setShowPopup(true); }}
                    style={{ width: '100%', marginTop: 24, padding: 14, border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', background: selectedPlan === plan.key ? '#8B0000' : '#222', color: '#fff' }}>
                    {selectedPlan === plan.key ? 'СОНГОГДСОН' : 'СОНГОХ'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ЗАСВАР #93: iOS Safari-ийн native scroll indicator-той давхцаж "2 тэмдэг"
            шиг харагддаг байсан тул өөрийн улаан зураасыг бүрмөсөн хассан. */}

        {/* READER PAGE — ЗАСВАР #19: 100% өргөнөөр (edge-to-edge) харагдана, ойртуулах (pinch-zoom) хориглосон */}
        {page === 'reader' && selectedChapter && (
          <div style={{ touchAction: 'pan-y' }}>
            {/* ЗАСВАР #34: доошоо гүйлгэсэн ч буцах товч үргэлж хүрч болохоор
                sticky (шидэгдэж) байрлалтай болгосон — өмнө нь энгийн урсгалд
                байсан тул урт бүлгийг доош гүйлгэхэд буцах товч дэлгэцээс гарч
                дахин дээшлүүлж байж л дарж болдог байсан. */}
            {/* ЗАСВАР #70: гарчиг төвд биш, бүлгийн дугаарыг дан тоогоор баруун
                дээд буланд байрлуулав (буцах товч зүүн талдаа хэвээрээ) */}
            <div style={{ position: 'sticky', padding: '1rem', top: 0, zIndex: 60, background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button onClick={() => setPage('detail')} title="Буцах"
                style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div style={{ position: 'relative' }}>
                <div onClick={() => setChapterSwitcherOpen(o => !o)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: dbChapters.length > 0 ? 'pointer' : 'default', fontWeight: 700, fontSize: 16, color: '#fff' }}>
                  <span>{selectedChapter.chapter_number}</span>
                  {dbChapters.length > 0 && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  )}
                </div>
                {chapterSwitcherOpen && dbChapters.length > 0 && (
                  <>
                    <div onClick={() => setChapterSwitcherOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                    <div style={{ position: 'absolute', top: '130%', right: 0, width: 160, maxHeight: 320, overflowY: 'auto', background: '#161616', border: '1px solid #2a2a2a', borderRadius: 10, zIndex: 61, boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
                      {[...dbChapters].sort((a, b) => b.chapter_number - a.chapter_number).map(ch => (
                        <div key={ch.id} onClick={() => { setChapterSwitcherOpen(false); openReader(selected, ch); }}
                          style={{ padding: '10px 14px', fontSize: 14, fontWeight: 700, textAlign: 'center', cursor: 'pointer', background: ch.id === selectedChapter.id ? '#1e2430' : 'transparent', color: ch.id === selectedChapter.id ? '#fff' : '#ccc' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#1e2430'}
                          onMouseLeave={e => e.currentTarget.style.background = ch.id === selectedChapter.id ? '#1e2430' : 'transparent'}>
                          {ch.chapter_number}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ЗАСВАР #85: бүлгийн зургийг татаж авахаас сэргийлэв (right-click
                context menu + drag хоёуланг нь хориглов). 100% хамгаалалт биш
                (screenshot-с сэргийлэх боломжгүй), гэвч энгийн татаж авахыг
                нэлээд төвөгтэй болгоно. */}
            {chapterImages.length > 0 ? (
              chapterImages.map(img => (
                <img key={img.id} src={img.image_url} alt={`Page ${img.page_number}`}
                  onContextMenu={e => e.preventDefault()}
                  draggable={false}
                  style={{ width: '100%', display: 'block', marginBottom: 0, verticalAlign: 'top', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }} />
              ))
            ) : (
              <div style={{ color: '#555', textAlign: 'center', marginTop: '3rem' }}>Зураг ачааллаж байна эсвэл байхгүй байна...</div>
            )}

            {/* Өмнөх / Дараах бүлэг рүү шилжих товч */}
            {dbChapters.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2rem 1rem' }}>
                {(() => {
                  const idx = dbChapters.findIndex(c => c.id === selectedChapter.id);
                  const prevCh = idx > 0 ? dbChapters[idx - 1] : null;
                  const nextCh = idx >= 0 && idx < dbChapters.length - 1 ? dbChapters[idx + 1] : null;
                  return (
                    <>
                      <button disabled={!prevCh}
                        onClick={() => prevCh && openReader(selected, prevCh)}
                        style={{ background: prevCh ? '#111' : '#0a0a0a', border: '1px solid #333', color: prevCh ? '#fff' : '#444', padding: '10px 20px', borderRadius: 8, cursor: prevCh ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700 }}>
                        ← Өмнөх бүлэг
                      </button>
                      <button disabled={!nextCh}
                        onClick={() => nextCh && openReader(selected, nextCh)}
                        style={{ background: nextCh ? '#8B0000' : '#0a0a0a', border: '1px solid #333', color: nextCh ? '#fff' : '#444', padding: '10px 20px', borderRadius: 8, cursor: nextCh ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700 }}>
                        Дараах бүлэг →
                      </button>
                    </>
                  );
                })()}
              </div>
            )}

            {/* ШИНЭ: СЭТГЭГДЛИЙН ХЭСЭГ — ЗАСВАР #88: гар утсан дэлгэц дээр 100%
                өргөнд зөв багтаах хажуугийн зай + арай эмхэтгэн жижигрүүлсэн хэмжээ */}
            <div style={{ marginTop: '2.5rem', borderTop: '1px solid #1a1a1a', padding: '1.5rem 1rem 0', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
                <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                <span style={{ fontWeight: 800, fontSize: 13 }}>СЭТГЭГДЭЛ ({comments.length})</span>
              </div>

              {/* Сэтгэгдэл бичих */}
              {currentUser ? (
                <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', alignItems: 'flex-start' }}>
                  <Avatar url={userProfile?.avatar_url} letter={currentUser.email[0]} size={28} />
                  <div style={{ flex: 1 }}>
                    <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                      placeholder="Сэтгэгдлээ бичнэ үү..."
                      rows={2}
                      style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 10, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <button onClick={() => postComment()} disabled={commentSending || !commentText.trim()}
                      style={{ marginTop: 6, background: commentText.trim() && !commentSending ? '#8B0000' : '#222', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 8, cursor: commentText.trim() && !commentSending ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 11 }}>
                      {commentSending ? 'ИЛГЭЭЖ БАЙНА...' : 'ИЛГЭЭХ'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 10, padding: '12px 16px', marginBottom: '1.25rem', fontSize: 12, color: '#888' }}>
                  Сэтгэгдэл бичихийн тулд <span onClick={() => setAuthPage('login')} style={{ color: '#8B0000', cursor: 'pointer', fontWeight: 700 }}>нэвтэрнэ үү</span>
                </div>
              )}

              {/* Сэтгэгдлийн жагсаалт — dollsmanga загвар: ♡ like + Хариулах */}
              {(() => {
                const topLevel = comments.filter(c => !c.parent_id);
                const repliesOf = (id) => comments.filter(c => c.parent_id === id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                const renderComment = (c, isReply) => {
                  const likeCount = commentLikeCounts[c.id] || 0;
                  const liked = myLikes.includes(c.id);
                  return (
                    <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'flex-start', marginLeft: isReply ? 32 : 0 }}>
                      {/* Хүрээтэй дугуй avatar */}
                      {c.users?.avatar_url ? (
                        <img src={c.users.avatar_url} alt="" style={{ width: isReply ? 24 : 30, height: isReply ? 24 : 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #2a3142' }} />
                      ) : (
                        <div style={{ width: isReply ? 24 : 30, height: isReply ? 24 : 30, borderRadius: '50%', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: isReply ? 11 : 13, color: '#fff', flexShrink: 0 }}>
                          {(c.users?.name || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: 12 }}>{c.users?.name || 'Хэрэглэгч'}</span>
                          {/* ЗАСВАР #42: staff (admin/moderator/editor) сэтгэгдлийн хажууд эрхийн бэлгэдэл */}
                          {c.users?.roles?.includes('admin') && (
                            <span style={{ fontSize: 8, fontWeight: 800, color: '#8B0000', border: '1px solid #8B0000', padding: '1px 6px', borderRadius: 8, letterSpacing: 0.5 }}>АДМИН</span>
                          )}
                          {!c.users?.roles?.includes('admin') && c.users?.roles?.some(r => ['moderator', 'editor'].includes(r)) && (
                            <span style={{ fontSize: 8, fontWeight: 800, color: '#f5a623', border: '1px solid #f5a623', padding: '1px 6px', borderRadius: 8, letterSpacing: 0.5 }}>{c.users.roles.includes('moderator') ? 'МОДЕРАТОР' : 'ЭДИТОР'}</span>
                          )}
                          <span style={{ fontSize: 11, color: '#6b7385' }}>{formatMnDate(c.created_at)}</span>
                          <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                            {currentUser && (c.user_id === currentUser.id || canModerate) && (
                              <span onClick={() => deleteComment(c)} title="Устгах" style={{ cursor: 'pointer', fontSize: 11, color: '#8B0000' }}>🗑</span>
                            )}
                            {currentUser && c.user_id !== currentUser.id && (
                              <span onClick={() => reportComment(c)} title="Мэдэгдэх" style={{ cursor: 'pointer', fontSize: 11, color: '#555' }}>🚩</span>
                            )}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#dde1ea', lineHeight: 1.45, whiteSpace: 'pre-wrap', marginTop: 3 }}>{c.content}</div>
                        {/* ♡ 0   💬 Хариулах */}
                        <div style={{ display: 'flex', gap: 14, marginTop: 6, alignItems: 'center' }}>
                          <span onClick={() => toggleLike(c)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: liked ? '#e0245e' : '#8a92a6', userSelect: 'none' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill={liked ? '#e0245e' : 'none'} stroke={liked ? '#e0245e' : '#8a92a6'} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                            {likeCount}
                          </span>
                          {!isReply && (
                            <span onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(''); }}
                              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8a92a6', userSelect: 'none' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a92a6" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                              Хариулах
                            </span>
                          )}
                        </div>
                        {/* Хариулт бичих талбар */}
                        {replyTo === c.id && (
                          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                            <input value={replyText} onChange={e => setReplyText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') postComment(c.id, replyText); }}
                              placeholder={`${c.users?.name || 'Хэрэглэгч'}-д хариулах...`}
                              autoFocus
                              style={{ flex: 1, background: '#10141d', border: '1px solid #232a38', borderRadius: 10, padding: '9px 14px', color: '#fff', fontSize: 13, outline: 'none' }} />
                            <button onClick={() => postComment(c.id, replyText)} disabled={!replyText.trim()}
                              style={{ background: replyText.trim() ? '#8B0000' : '#222', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: replyText.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 12 }}>
                              ИЛГЭЭХ
                            </button>
                          </div>
                        )}
                        {/* Хариултууд */}
                        <div style={{ marginTop: repliesOf(c.id).length > 0 ? 16 : 0 }}>
                          {repliesOf(c.id).map(r => renderComment(r, true))}
                        </div>
                      </div>
                    </div>
                  );
                };

                return topLevel.length > 0 ? topLevel.map(c => renderComment(c, false)) : (
                  <div style={{ color: '#555', fontSize: 13, textAlign: 'center', padding: '1.5rem 0' }}>
                    Одоогоор сэтгэгдэл алга. Анхны сэтгэгдлийг үлдээгээрэй! 💬
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ADMIN / УДИРДЛАГЫН PAGE — staff бүгд орно, харагдах хэсэг нь эрхээс хамаарна */}
        {page === 'admin' && isStaff && (
          <div style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '2rem' }}>
              <div style={{ width: 4, height: 20, background: '#8B0000', borderRadius: 2 }} />
              <span style={{ fontWeight: 800, fontSize: 20 }}>УДИРДЛАГЫН ПАНЕЛ</span>
              <span style={{ fontSize: 11, background: 'rgba(139,0,0,0.15)', border: '1px solid #8B0000', color: '#8B0000', padding: '2px 10px', borderRadius: 10, fontWeight: 700 }}>
                {userRoles.map(r => ROLE_LABELS[r] || r).join(' · ')}
              </span>
            </div>

            {/* Статистик одоо DB-ээс бодитоор татагдана */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: '2rem' }}>
              {[
                { label: 'Нийт манга', value: adminStats.mangas, icon: '📚' },
                { label: 'Нийт хэрэглэгч', value: adminStats.users, icon: '👥' },
                { label: 'Нийт бүлэг', value: adminStats.chapters, icon: '📖' },
              ].map((stat, i) => (
                <div key={i} style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 32 }}>{stat.icon}</span>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{stat.value}</div>
                    <div style={{ fontSize: 13, color: '#555' }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* ЗАСВАР #58: хажуу тийш жигсаасан таб-ууд — эрхээс хамааран харагдана */}
            <div style={{ display: 'flex', gap: 6, marginBottom: '1.5rem', flexWrap: 'wrap', borderBottom: '1px solid #1e1e1e', paddingBottom: 12 }}>
              {[
                { key: 'manga', label: 'МАНГА НЭМЭХ', show: isStaff },
                { key: 'chapter', label: 'БҮЛЭГ НЭМЭХ', show: isStaff },
                { key: 'roles', label: 'ЭРХ ОЛГОХ', show: isAdmin },
                { key: 'vip', label: 'VIP ОЛГОХ', show: isAdmin },
                { key: 'payments', label: `ТӨЛБӨРИЙН ХҮСЭЛТ (${paymentRequests.length})`, show: isAdmin },
                { key: 'pending', label: `ХҮЛЭЭГДЭЖ БУЙ (${pendingChapters.length})`, show: canModerate },
                { key: 'reports', label: `МЭДЭГДЭЛ (${reportsList.length})`, show: canModerate },
              ].filter(t => t.show).map(t => (
                <div key={t.key} onClick={() => setAdminTab(t.key)}
                  style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: adminTab === t.key ? '#8B0000' : '#161616', color: adminTab === t.key ? '#fff' : '#888' }}>
                  {t.label}
                </div>
              ))}
            </div>

            <div>

              {/* Манга нэмэх */}
              {adminTab === 'manga' && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e', maxWidth: 480 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                  МАНГА НЭМЭХ
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ГАРЧИГ</div>
                  <input value={adminManga.title} onChange={e => setAdminManga({...adminManga, title: e.target.value})}
                    placeholder="Мангын нэр"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ТАЙЛБАР</div>
                  <input value={adminManga.desc} onChange={e => setAdminManga({...adminManga, desc: e.target.value})}
                    placeholder="Мангын тайлбар"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  {/* ЗАСВАР #56: 1 төрөл биш, 1-3 төрөл зэрэг сонгож болно */}
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ТӨРӨЛ (дээд тал нь 3)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {genres.map(g => {
                      const active = adminManga.genres.includes(g);
                      return (
                        <span key={g} onClick={() => setAdminManga(prev => {
                          if (prev.genres.includes(g)) return { ...prev, genres: prev.genres.filter(x => x !== g) };
                          if (prev.genres.length >= 3) { notify('Хамгийн ихдээ 3 төрөл сонгож болно!'); return prev; }
                          return { ...prev, genres: [...prev.genres, g] };
                        })}
                          style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 16, cursor: 'pointer', background: active ? '#8B0000' : '#1a1a1a', color: active ? '#fff' : '#aaa', border: '1px solid #2a2a2a' }}>
                          {g}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ТӨЛӨВ</div>
                  <select value={adminManga.status} onChange={e => setAdminManga({...adminManga, status: e.target.value})}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }}>
                    {MANGA_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>POSTER ЗУРАГ</div>
                  <input type="file" accept="image/*" onChange={e => setPosterFile(e.target.files[0])}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БАННЕР ЗУРАГ (нүүр хэсгийн "Санал болгох" мөрөнд харагдах урт нарийн зураг)</div>
                  <input type="file" accept="image/*" onChange={e => setBannerFile(e.target.files[0] || null)}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                  <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Оруулаагүй бол poster зураг ашиглагдана</div>
                </div>
                <button onClick={async () => {
                  if (!adminManga.title) { notify('Гарчиг оруулна уу!'); return; }
                  const badFile = [posterFile, bannerFile].filter(Boolean).map(validateImageFile).find(Boolean);
                  if (badFile) { notify(badFile); return; }
                  let posterUrl = '';
                  if (posterFile) {
                    const fileExt = posterFile.name.split('.').pop();
                    const fileName = `${Date.now()}.${fileExt}`;
                    try {
                      posterUrl = await uploadToR2(posterFile, `posters/${fileName}`);
                    } catch (uploadError) { notify('Зураг upload алдаа: ' + uploadError.message); return; }
                  }
                  let bannerUrl = '';
                  if (bannerFile) {
                    const fileExt = bannerFile.name.split('.').pop();
                    const fileName = `${Date.now()}-banner.${fileExt}`;
                    try {
                      bannerUrl = await uploadToR2(bannerFile, `banners/${fileName}`);
                    } catch (uploadError) { notify('Баннер upload алдаа: ' + uploadError.message); return; }
                  }
                  if (adminManga.genres.length === 0) { notify('Дор хаяж 1 төрөл сонгоно уу!'); return; }
                  const { error } = await supabase.from('mangas').insert({
                    title: adminManga.title,
                    description: adminManga.desc,
                    genres: adminManga.genres,
                    status: adminManga.status,
                    poster_url: posterUrl,
                    banner_url: bannerUrl || null,
                    created_by: currentUser.id,
                  });
                  if (error) notify('Алдаа: ' + error.message);
                  else {
                    notify('Манга амжилттай нэмэгдлээ! 🎉');
                    setAdminManga({ title: '', desc: '', genres: [], status: 'Үргэлжилж байна' });
                    setPosterFile(null);
                    setBannerFile(null);
                    fetchMangas(); // ЗАСВАР: жагсаалтыг шууд шинэчилнэ (өмнө нь refresh хэрэгтэй байсан)
                  }
                }} style={{ width: '100%', background: '#8B0000', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                  НЭМЭХ
                </button>
              </div>
              )}

              {/* Бүлэг нэмэх */}
              {adminTab === 'chapter' && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e', maxWidth: 480 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                  БҮЛЭГ НЭМЭХ
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>МАНГА СОНГО</div>
                  <select value={chapterManga} onChange={e => setChapterManga(e.target.value)}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }}>
                    <option value="">-- Манга сонгох --</option>
                    {dbMangas.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БҮЛГИЙН ДУГААР</div>
                    <input type="number" value={chapterNumber} onChange={e => setChapterNumber(e.target.value)}
                      placeholder="1"
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БҮЛГИЙН НЭР (заавал биш)</div>
                    <input value={chapterTitle} onChange={e => setChapterTitle(e.target.value)}
                      placeholder="Жишээ: Эхлэл"
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {/* ШИНЭ: бүлгийн COVER зураг тусдаа оруулна */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БҮЛГИЙН COVER ЗУРАГ (жагсаалтад харагдана)</div>
                  <input type="file" accept="image/*" onChange={e => setChapterCover(e.target.files[0] || null)}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                  <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Оруулаагүй бол эхний хуудас автоматаар cover болно</div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БҮЛГИЙН ЗУРАГНУУД (хуудас бүрээр, дараалсан)</div>
                  {/* ЗАСВАР #23: сонгосон зургуудыг шууд upload хийдэггүй болгож, эхлээд
                      шалгах/устгах/дараалал сольж болдог preview үзүүлдэг болгосон.
                      Дахин файл сонговол ХУУЧНЫГ ДАРААГҮЙ нэмэгдэнэ (өмнө нь бүхэлд нь орлуулдаг байсан). */}
                  <input type="file" accept="image/*" multiple
                    onChange={e => { const picked = Array.from(e.target.files); setChapterFiles(prev => [...prev, ...picked]); e.target.value = ''; }}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                  <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Дахин сонговол нэмэгдэнэ. Доор гүйлгэж харж, устгаж, дараалал сольж болно.</div>

                  {chapterFiles.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, maxHeight: 320, overflowY: 'auto', padding: 4, background: '#0d0d0d', borderRadius: 8 }}>
                      {chapterFiles.map((file, i) => (
                        <div key={i} style={{ position: 'relative', width: 76 }}>
                          <img src={URL.createObjectURL(file)} alt={`${i + 1}`}
                            style={{ width: 76, height: 102, objectFit: 'cover', borderRadius: 8, border: '1px solid #2a2a2a', display: 'block' }} />
                          <div style={{ position: 'absolute', top: 3, left: 3, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4 }}>{i + 1}</div>
                          <span onClick={() => setChapterFiles(prev => prev.filter((_, idx) => idx !== i))}
                            title="Устгах"
                            style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(139,0,0,0.9)', color: '#fff', fontSize: 11, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</span>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, gap: 4 }}>
                            <span onClick={() => i > 0 && setChapterFiles(prev => { const arr = [...prev]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; return arr; })}
                              title="Зүүн тийш зөөх"
                              style={{ flex: 1, textAlign: 'center', cursor: i > 0 ? 'pointer' : 'default', opacity: i > 0 ? 1 : 0.25, fontSize: 12, color: '#ccc', padding: '3px 0', background: '#1a1a1a', borderRadius: 4 }}>◀</span>
                            <span onClick={() => i < chapterFiles.length - 1 && setChapterFiles(prev => { const arr = [...prev]; [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; return arr; })}
                              title="Баруун тийш зөөх"
                              style={{ flex: 1, textAlign: 'center', cursor: i < chapterFiles.length - 1 ? 'pointer' : 'default', opacity: i < chapterFiles.length - 1 ? 1 : 0.25, fontSize: 12, color: '#ccc', padding: '3px 0', background: '#1a1a1a', borderRadius: 4 }}>▶</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {chapterFiles.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <div style={{ fontSize: 12, color: '#8B0000' }}>{chapterFiles.length} зураг сонгогдсон</div>
                      {/* ЗАСВАР #36: бүлэг уншиж байгаа юм шиг бүтнээр нь харах цонх */}
                      <button onClick={() => setChapterPreviewOpen(true)}
                        style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        👁 БҮТНЭЭР ХАРАХ
                      </button>
                    </div>
                  )}
                </div>

                {/* ШИНЭ: VIP бүлэг checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, color: '#aaa' }}>
                  <input type="checkbox" checked={chapterIsVip} onChange={e => setChapterIsVip(e.target.checked)}
                    style={{ accentColor: '#8B0000', width: 16, height: 16 }} />
                  VIP бүлэг (зөвхөн эрхтэй хэрэглэгч уншина)
                </label>

                {/* ЗАСВАР #60: "ҮНЭГҮЙ"/"VIP" бэлгэдлийн оронд бичдэг дурын тэмдэглэгээ */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ТЭМДЭГЛЭГЭЭ (заавал биш, жишээ нь: S1 END)</div>
                  <input value={chapterLabel} onChange={e => setChapterLabel(e.target.value)}
                    placeholder="S1 END"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                {editorOnly && (
                  <div style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: '#f5a623', lineHeight: 1.5 }}>
                    ℹ️ Таны оруулсан бүлэг Модератор баталсны дараа нийтлэгдэнэ.
                  </div>
                )}

                {/* ЗАСВАР #22: admin/moderator шууд нэмэхдээ ч ирээдүйн гарах цаг товлож болно
                    (editor-only-д харагдахгүй — тэдний бүлэг барьцаагаар аяндаа "Хүлээгдэж буй" ордог) */}
                {!editorOnly && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ГАРАХ ЦАГ ТОВЛОХ (заавал биш — хоосон бол шууд нийтлэгдэнэ)</div>
                    <input type="datetime-local" value={chapterPublishAt} onChange={e => setChapterPublishAt(e.target.value)}
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', colorScheme: 'dark', boxSizing: 'border-box' }} />
                  </div>
                )}

                <button
                  disabled={chapterUploading}
                  onClick={async () => {
                    if (!chapterManga) { notify('Манга сонгоно уу!'); return; }
                    if (!chapterNumber) { notify('Бүлгийн дугаар оруулна уу!'); return; }
                    if (chapterFiles.length === 0) { notify('Зураг сонгоно уу!'); return; }
                    // ЗАСВАР #11: бүх зургийг (cover + хуудсууд) upload эхлэхээс өмнө шалгана
                    const badFile = [chapterCover, ...chapterFiles].filter(Boolean).map(validateImageFile).find(Boolean);
                    if (badFile) { notify(badFile); return; }

                    setChapterUploading(true);

                    const { data: chapterData, error: chapterError } = await supabase
                      .from('chapters')
                      .insert({
                        manga_id: chapterManga,
                        chapter_number: Number(chapterNumber),
                        title: chapterTitle || `Бүлэг ${chapterNumber}`,
                        is_vip: chapterIsVip,
                        label: chapterLabel.trim() || null,
                        // Editor-only → 'pending' (батлагдах хүртэл харагдахгүй), бусад staff → шууд нийтлэгдэнэ.
                        // DB талд trigger давхар шалгадаг тул энд хуурч болохгүй.
                        status: editorOnly ? 'pending' : 'published',
                        publish_at: !editorOnly && chapterPublishAt ? new Date(chapterPublishAt).toISOString() : null,
                      })
                      .select()
                      .single();

                    if (chapterError) {
                      notify('Алдаа: ' + chapterError.message);
                      setChapterUploading(false);
                      return;
                    }

                    let thumbnailUrl = '';

                    // ШИНЭ: тусдаа cover зураг оруулсан бол эхэлж upload хийнэ
                    if (chapterCover) {
                      const cExt = chapterCover.name.split('.').pop();
                      const cName = `chapters/${chapterData.id}/cover.${cExt}`;
                      try {
                        thumbnailUrl = await uploadToR2(chapterCover, cName);
                      } catch (cErr) { notify('Cover upload алдаа: ' + cErr.message); }
                    }

                    for (let i = 0; i < chapterFiles.length; i++) {
                      const file = chapterFiles[i];
                      const fileExt = file.name.split('.').pop();
                      const fileName = `chapters/${chapterData.id}/${i + 1}.${fileExt}`;

                      let publicUrl;
                      try {
                        publicUrl = await uploadToR2(file, fileName);
                      } catch (uploadError) {
                        notify(`Зураг ${i + 1} upload алдаа: ` + uploadError.message);
                        continue;
                      }

                      // ЗАСВАР #63: эхний хуудсыг автоматаар thumbnail болгож хадгалдаг байсныг
                      // хассан — тэр нь дурын (санамсаргүй харагдах) хуудасны зургийг "cover"
                      // мэт харуулдаг байсан. Одоо зөвхөн admin ЗОРИУДАА оруулсан cover л
                      // thumbnail болно; оруулаагүй бол харуулах хэсэгт манга poster ашиглана.
                      await supabase.from('chapter_images').insert({
                        chapter_id: chapterData.id,
                        image_url: publicUrl,
                        page_number: i + 1,
                      });
                    }

                    if (thumbnailUrl) {
                      await supabase.from('chapters')
                        .update({ thumbnail_url: thumbnailUrl })
                        .eq('id', chapterData.id);
                    }

                    notify(editorOnly
                      ? 'Бүлэг илгээгдлээ! Модератор баталсны дараа нийтлэгдэнэ ✅'
                      : 'Бүлэг амжилттай нэмэгдлээ! 🎉');
                    setChapterManga('');
                    setChapterNumber('');
                    setChapterTitle('');
                    setChapterFiles([]);
                    setChapterCover(null);
                    setChapterIsVip(false);
                    setChapterLabel('');
                    setChapterPublishAt('');
                    setChapterUploading(false);
                  }}
                  style={{ width: '100%', background: chapterUploading ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 700, cursor: chapterUploading ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                  {chapterUploading ? 'УНШИЖ БАЙНА...' : 'БҮЛЭГ НЭМЭХ'}
                </button>
              </div>
              )}

              {/* Эрх олгох — ЗӨВХӨН АДМИН */}
              {adminTab === 'roles' && isAdmin && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e', maxWidth: 480 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                  ЭРХ ОЛГОХ
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ИМЭЙЛ (Gmail г.м.)</div>
                  <input value={adminWorkerEmail} onChange={e => setAdminWorkerEmail(e.target.value)}
                    placeholder="Хэрэглэгчийн имэйл"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                {/* ЗАСВАР #31: сонголтоор биш, чеклэх маягаар — нэг хэрэглэгчид
                    admin/moderator/editor-ийг ХАМТАД нь (жишээ нь moderator+editor) олгож болно */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>ЭРХ (олноор нь сонгож болно)</div>
                  {[
                    { key: 'editor', desc: 'Эдитор — манга/бүлэг нэмэх (батлагдсаны дараа нийтлэгдэнэ)' },
                    { key: 'moderator', desc: 'Модератор — + батлах/татгалзах, сэтгэгдэл устгах, report' },
                    { key: 'admin', desc: 'Админ — бүх эрх' },
                  ].map(r => (
                    <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 12, color: '#ccc' }}>
                      <input type="checkbox" checked={adminWorkerRoles.includes(r.key)}
                        onChange={e => setAdminWorkerRoles(prev => e.target.checked ? [...prev, r.key] : prev.filter(x => x !== r.key))}
                        style={{ accentColor: '#8B0000', width: 15, height: 15, flexShrink: 0 }} />
                      {r.desc}
                    </label>
                  ))}
                </div>
                <button onClick={async () => {
                  if (!adminWorkerEmail) { notify('Имэйл оруулна уу!'); return; }
                  const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('id, email')
                    .eq('email', adminWorkerEmail.trim())
                    .maybeSingle();
                  // ЗАСВАР: алдааг эхэлж шалгадаг болгосон (өмнө нь дараалал буруу байсан)
                  if (userError) { notify('Алдаа: ' + userError.message); return; }
                  if (!userData) { notify('Тэр имэйлтэй хэрэглэгч олдсонгүй! Хэрэглэгч эхлээд сайтад бүртгүүлсэн байх ёстой. ' + adminWorkerEmail); return; }
                  const { error } = await supabase
                    .from('users')
                    .update({ roles: adminWorkerRoles })
                    .eq('id', userData.id);
                  if (error) notify('Алдаа: ' + error.message);
                  else {
                    const label = adminWorkerRoles.length > 0 ? adminWorkerRoles.map(r => ROLE_LABELS[r]).join(' + ') : 'Хэрэглэгч (эрхгүй)';
                    notify(`${label} эрх амжилттай олгогдлоо! 🎉`);
                    setAdminWorkerEmail('');
                    setAdminWorkerRoles([]);
                  }
                }} style={{ width: '100%', background: '#8B0000', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                  ЭРХ ОЛГОХ
                </button>

                <div style={{ marginTop: '1rem', padding: '1rem', background: '#1a1a1a', borderRadius: 8, fontSize: 11, color: '#777', lineHeight: 1.7 }}>
                  💡 Мөн Supabase Dashboard → Table Editor → users хүснэгтээс role баганыг шууд засаж болно.
                </div>
              </div>
              )}

              {/* ЗАСВАР #20: VIP олгох — role-оос тусад нь, хэдэн хоногийн хугацаатай */}
              {adminTab === 'vip' && isAdmin && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e', maxWidth: 480 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#f5a623', borderRadius: 2 }} />
                  👑 VIP ОЛГОХ
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ИМЭЙЛ</div>
                  <input value={vipEmail} onChange={e => setVipEmail(e.target.value)}
                    placeholder="Хэрэглэгчийн имэйл"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ХЭДЭН ХОНОГ</div>
                  <input type="number" min="1" value={vipDays} onChange={e => setVipDays(e.target.value)}
                    placeholder="30"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button disabled={vipSaving} onClick={async () => {
                    if (!vipEmail.trim()) { notify('Имэйл оруулна уу!'); return; }
                    const days = Number(vipDays);
                    if (!days || days <= 0) { notify('Хоногийн тоог зөв оруулна уу!'); return; }
                    setVipSaving(true);
                    const { data: userData, error: userError } = await supabase.from('users').select('id, vip_expires_at, is_vip')
                      .eq('email', vipEmail.trim()).maybeSingle();
                    if (userError) { notify('Алдаа: ' + userError.message); setVipSaving(false); return; }
                    if (!userData) { notify('Тэр имэйлтэй хэрэглэгч олдсонгүй!'); setVipSaving(false); return; }
                    // Идэвхтэй VIP-тэй бол одоо байгаа дуусах хугацаан дээр нь нэмнэ, эс бол өнөөдрөөс эхэлнэ
                    const base = (userData.is_vip && userData.vip_expires_at && new Date(userData.vip_expires_at).getTime() > Date.now())
                      ? new Date(userData.vip_expires_at)
                      : new Date();
                    base.setDate(base.getDate() + days);
                    const { error } = await supabase.from('users')
                      .update({ is_vip: true, vip_expires_at: base.toISOString() })
                      .eq('id', userData.id);
                    setVipSaving(false);
                    if (error) { notify('Алдаа: ' + error.message); return; }
                    notify(`VIP ${days} хоногоор олгогдлоо! 👑 (${formatMnDate(base.toISOString())} хүртэл)`);
                    setVipEmail('');
                  }} style={{ flex: 1, background: vipSaving ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 700, cursor: vipSaving ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                    VIP ОЛГОХ
                  </button>
                  <button disabled={vipSaving} onClick={async () => {
                    if (!vipEmail.trim()) { notify('Имэйл оруулна уу!'); return; }
                    const { data: userData, error: userError } = await supabase.from('users').select('id').eq('email', vipEmail.trim()).maybeSingle();
                    if (userError) { notify('Алдаа: ' + userError.message); return; }
                    if (!userData) { notify('Тэр имэйлтэй хэрэглэгч олдсонгүй!'); return; }
                    const { error } = await supabase.from('users').update({ is_vip: false, vip_expires_at: null }).eq('id', userData.id);
                    if (error) notify('Алдаа: ' + error.message);
                    else { notify('VIP цуцлагдлаа'); setVipEmail(''); }
                  }} style={{ background: '#222', color: '#aaa', border: '1px solid #333', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    ЦУЦЛАХ
                  </button>
                </div>
              </div>
              )}

              {/* ЗАСВАР #91: "ТӨЛБӨР ТӨЛСӨН" хүсэлтүүд — admin шалгаад батлах/цуцлах */}
              {adminTab === 'payments' && isAdmin && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#f5a623', borderRadius: 2 }} />
                  ТӨЛБӨРИЙН ХҮСЭЛТ ({paymentRequests.length})
                </div>
                {paymentRequests.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#555' }}>Хүлээгдэж буй хүсэлт алга ✓</div>
                ) : paymentRequests.map(req => {
                  const plan = PLANS.find(p => p.key === req.plan_key);
                  return (
                    <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: '#1a1a1a', borderRadius: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{req.users?.name || 'Хэрэглэгч'} <span style={{ color: '#666', fontWeight: 400 }}>({req.users?.email})</span></div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{plan ? `${plan.label} — ${plan.price}` : req.plan_key} · {formatMnDate(req.created_at)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={async () => {
                          const days = PLAN_DAYS[req.plan_key] || 30;
                          const { data: userData, error: userError } = await supabase.from('users').select('vip_expires_at, is_vip').eq('id', req.user_id).single();
                          if (userError) { notify('Алдаа: ' + userError.message); return; }
                          const base = (userData.is_vip && userData.vip_expires_at && new Date(userData.vip_expires_at).getTime() > Date.now())
                            ? new Date(userData.vip_expires_at)
                            : new Date();
                          base.setDate(base.getDate() + days);
                          const { error: vipError } = await supabase.from('users').update({ is_vip: true, vip_expires_at: base.toISOString() }).eq('id', req.user_id);
                          if (vipError) { notify('Алдаа: ' + vipError.message); return; }
                          const { error: reqError } = await supabase.from('payment_requests')
                            .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: currentUser.id }).eq('id', req.id);
                          if (reqError) { notify('Алдаа: ' + reqError.message); return; }
                          notify(`VIP ${days} хоногоор олгогдлоо! 👑`);
                          fetchPaymentRequests();
                        }} style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                          БАТЛАХ
                        </button>
                        <button onClick={async () => {
                          const { error } = await supabase.from('payment_requests')
                            .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: currentUser.id }).eq('id', req.id);
                          if (error) { notify('Алдаа: ' + error.message); return; }
                          notify('Хүсэлт цуцлагдлаа');
                          fetchPaymentRequests();
                        }} style={{ background: '#222', color: '#aaa', border: '1px solid #333', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                          ЦУЦЛАХ
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}

            </div>

            {/* ШИНЭ: БАТЛАХ ХҮЛЭЭГДЭЖ БУЙ БҮЛГҮҮД — moderator/admin */}
            {adminTab === 'pending' && canModerate && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#f5a623', borderRadius: 2 }} />
                  БАТЛАХ ХҮЛЭЭГДЭЖ БУЙ БҮЛГҮҮД ({pendingChapters.length})
                </div>
                {pendingChapters.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#555' }}>Хүлээгдэж буй бүлэг алга ✓</div>
                ) : pendingChapters.map(ch => (
                  <div key={ch.id} style={{ padding: '12px 14px', background: '#1a1a1a', borderRadius: 10, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {ch.thumbnail_url && <img src={ch.thumbnail_url} alt="" style={{ width: 60, height: 40, borderRadius: 8, objectFit: 'cover', objectPosition: 'top' }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ch.mangas?.title || 'Манга'} — Бүлэг {ch.chapter_number}
                          {ch.is_vip && <span style={{ marginLeft: 8 }}>👑</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{ch.title}</div>
                      </div>
                    </div>
                    {/* ШИНЭ: нийтлэгдэх цаг тохируулах (хоосон бол шууд нийтлэгдэнэ) */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#888' }}>🕐 Гарах цаг:</span>
                      <input type="datetime-local"
                        value={pendingTimes[ch.id] || ''}
                        onChange={e => setPendingTimes(prev => ({ ...prev, [ch.id]: e.target.value }))}
                        style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 12, outline: 'none', colorScheme: 'dark' }} />
                      <button onClick={async () => {
                        const t = pendingTimes[ch.id];
                        const { error } = await supabase.from('chapters').update({
                          status: 'published',
                          publish_at: t ? new Date(t).toISOString() : null,
                        }).eq('id', ch.id);
                        if (error) notify('Алдаа: ' + error.message);
                        else {
                          notify(t ? `Батлагдлаа! ${formatMnDate(t)}-нд нийтлэгдэнэ 🕐` : 'Бүлэг шууд нийтлэгдлээ! ✅');
                          fetchPending();
                        }
                      }} style={{ background: '#1e5c2e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                        ✓ БАТЛАХ
                      </button>
                      <button onClick={async () => {
                        if (!window.confirm('Энэ бүлгийг татгалзах уу?')) return;
                        const { error } = await supabase.from('chapters').update({ status: 'rejected' }).eq('id', ch.id);
                        if (error) notify('Алдаа: ' + error.message);
                        else fetchPending();
                      }} style={{ background: 'rgba(139,0,0,0.2)', color: '#8B0000', border: '1px solid #8B0000', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                        ✕ ТАТГАЛЗАХ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ШИНЭ: REPORT ШАЛГАХ — moderator/admin */}
            {adminTab === 'reports' && canModerate && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                  🚩 СЭТГЭГДЛИЙН МЭДЭГДЭЛ ({reportsList.length})
                </div>
                {reportsList.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#555' }}>Шалгах мэдэгдэл алга ✓</div>
                ) : reportsList.map(r => (
                  <div key={r.id} style={{ padding: '12px 14px', background: '#1a1a1a', borderRadius: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
                      Мэдэгдсэн: <span style={{ color: '#fff', fontWeight: 600 }}>{r.users?.name || 'Хэрэглэгч'}</span>
                      {r.reason && <span> — Шалтгаан: "{r.reason}"</span>}
                    </div>
                    <div style={{ fontSize: 13, color: '#ccc', background: '#111', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                      {r.comments?.content || '(сэтгэгдэл устгагдсан)'}
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {r.comments && (
                        <button onClick={async () => {
                          if (!window.confirm('Сэтгэгдлийг устгах уу?')) return;
                          await supabase.from('comments').delete().eq('id', r.comments.id);
                          fetchReports();
                        }} style={{ background: 'rgba(139,0,0,0.2)', color: '#8B0000', border: '1px solid #8B0000', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                          🗑 СЭТГЭГДЛИЙГ УСТГАХ
                        </button>
                      )}
                      <button onClick={async () => {
                        await supabase.from('reports').update({ status: 'resolved' }).eq('id', r.id);
                        fetchReports();
                      }} style={{ background: '#222', color: '#aaa', border: '1px solid #333', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                        ЗҮГЭЭР, ХААХ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* POPUP — үнийг PLANS-аас уншина (ЗАСВАР #3: 6 сар одоо 25,000₮ гэж зөв гарна) */}
        {showPopup && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
            <div style={{ width: 400, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto', background: '#111', border: '1px solid #222', borderRadius: 18, padding: '1.5rem', position: 'relative', boxSizing: 'border-box' }}>

              <span onClick={() => setShowPopup(false)} style={{ position: 'absolute', top: 14, right: 16, cursor: 'pointer', fontSize: 18, color: '#555' }}>✕</span>

              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>ТӨЛБӨРИЙН МЭДЭЭЛЭЛ</div>
                <div style={{ fontSize: 12, color: '#8B0000', marginTop: 4, fontWeight: 700 }}>
                  {(() => {
                    const p = PLANS.find(x => x.key === selectedPlan);
                    return p ? `${p.label} — ${p.price}` : '';
                  })()}
                </div>
              </div>

              <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '1.1rem', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: '0.75rem', textAlign: 'center', letterSpacing: 1 }}>ДАРААХ ДАНСАНД ШИЛЖҮҮЛНЭ ҮҮ</div>

                {[
                  { label: 'Банкны нэр', value: 'Хаан банк', copyable: false },
                  { label: 'Дансны дугаар', value: '350005005401075000', copyable: true },
                  { label: 'Хүлээн авагч', value: 'Хандсүрэн Энхнамуун', copyable: false },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: i < 2 ? '1px solid #2a2a2a' : 'none' }}>
                    <span style={{ fontSize: 11, color: '#666' }}>{item.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      {/* ЗАСВАР #89: "Хуулах" товчийг дугаарын ард биш урд тал руу шилжүүлэв */}
                      {item.copyable && (
                        <button onClick={() => navigator.clipboard.writeText(item.value).then(() => notify(item.label + ' хуулагдлаа!'))}
                          title="Хуулах"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', border: '1px solid #333', color: '#ccc', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', flexShrink: 0 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        </button>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflowWrap: 'anywhere', textAlign: 'right' }}>{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* ЗАСВАР #90: 1,2-р санамжийг нэг өгүүлбэр болгож нэгтгэв, 2-р
                  тэмдэглэлийг баримт илгээх тухай болгож өөрчилсөн (gmail
                  бичих давхардлыг арилгав). */}
              <div style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.4)', borderRadius: 12, padding: '12px 14px', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#f5a623', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                  САНАМЖ
                </div>
                <div style={{ fontSize: 11, color: '#ccc', lineHeight: 1.7 }}>
                  · Гүйлгээний утга дээрээ <strong style={{ color: '#fff' }}>gmail хаяг, сарын дугаараа</strong> бичээрэй <span style={{ color: '#8a92a6' }}>(жишээ нь: dolgoon@gmail.com 3)</span><br />
                  · Гүйлгээ хийсэн баримтаа манай page рүү явуулбал эрх илүү хурдан идэвхжинэ
                </div>
              </div>

              {/* ЗАСВАР #91: дарахад admin-д "Төлбөр төлсөн" хүсэлт үүсгэж илгээнэ */}
              <button disabled={paymentRequestSending} onClick={async () => {
                if (!currentUser || !selectedPlan) { setShowPopup(false); return; }
                setPaymentRequestSending(true);
                const { error } = await supabase.from('payment_requests').insert({ user_id: currentUser.id, plan_key: selectedPlan });
                setPaymentRequestSending(false);
                if (error) { notify('Алдаа: ' + error.message); return; }
                notify('Хүсэлт илгээгдлээ! Admin шалгаад баталгаажуулах болно 🎉');
                setShowPopup(false);
              }}
                style={{ width: '100%', padding: 13, border: 'none', borderRadius: 12, background: paymentRequestSending ? '#555' : '#8B0000', color: '#fff', fontWeight: 700, cursor: paymentRequestSending ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                {paymentRequestSending ? 'ИЛГЭЭЖ БАЙНА...' : 'ТӨЛБӨР ТӨЛСӨН'}
              </button>

            </div>
          </div>
        )}

        {/* ШИНЭ: сонгосон бүлгийн зургуудыг бүлэг уншиж байгаа мэт бүтнээр нь харах цонх */}
        {chapterPreviewOpen && (
          <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 999, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', position: 'sticky', top: 0, zIndex: 10, background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(6px)' }}>
              <button onClick={() => setChapterPreviewOpen(false)} title="Буцах"
                style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Урьдчилан харах ({chapterFiles.length} зураг)</div>
              <div style={{ width: 80 }} />
            </div>
            {chapterFiles.map((file, i) => (
              <img key={i} src={URL.createObjectURL(file)} alt={`${i + 1}`}
                style={{ width: '100%', display: 'block', verticalAlign: 'top' }} />
            ))}
          </div>
        )}

        {/* ШИНЭ: МАНГА ЗАСАХ цонх */}
        {editManga && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }}>
            <div style={{ width: 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#111', border: '1px solid #222', borderRadius: 20, padding: '2rem', position: 'relative', boxSizing: 'border-box' }}>
              <span onClick={() => setEditManga(null)} style={{ position: 'absolute', top: 16, right: 20, cursor: 'pointer', fontSize: 20, color: '#555' }}>✕</span>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: '1.5rem' }}>МАНГА ЗАСАХ</div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ГАРЧИГ</div>
                <input value={editMangaForm.title} onChange={e => setEditMangaForm({ ...editMangaForm, title: e.target.value })}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ТАЙЛБАР</div>
                <input value={editMangaForm.desc} onChange={e => setEditMangaForm({ ...editMangaForm, desc: e.target.value })}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ТӨРӨЛ (дээд тал нь 3)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {genres.map(g => {
                    const active = editMangaForm.genres.includes(g);
                    return (
                      <span key={g} onClick={() => setEditMangaForm(prev => {
                        if (prev.genres.includes(g)) return { ...prev, genres: prev.genres.filter(x => x !== g) };
                        if (prev.genres.length >= 3) { notify('Хамгийн ихдээ 3 төрөл сонгож болно!'); return prev; }
                        return { ...prev, genres: [...prev.genres, g] };
                      })}
                        style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 16, cursor: 'pointer', background: active ? '#8B0000' : '#1a1a1a', color: active ? '#fff' : '#aaa', border: '1px solid #2a2a2a' }}>
                        {g}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ТӨЛӨВ</div>
                <select value={editMangaForm.status} onChange={e => setEditMangaForm({ ...editMangaForm, status: e.target.value })}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }}>
                  {MANGA_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>POSTER ЗУРАГ (заавал биш — солихгүй бол хуучнаараа үлдэнэ)</div>
                <input type="file" accept="image/*" onChange={e => setEditPosterFile(e.target.files[0] || null)}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БАННЕР ЗУРАГ (заавал биш — солихгүй бол хуучнаараа үлдэнэ)</div>
                <input type="file" accept="image/*" onChange={e => setEditBannerFile(e.target.files[0] || null)}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              <button disabled={editSaving} onClick={async () => {
                if (!editMangaForm.title.trim()) { notify('Гарчиг оруулна уу!'); return; }
                const badFile = [editPosterFile, editBannerFile].filter(Boolean).map(validateImageFile).find(Boolean);
                if (badFile) { notify(badFile); return; }
                setEditSaving(true);
                if (editMangaForm.genres.length === 0) { notify('Дор хаяж 1 төрөл сонгоно уу!'); return; }
                const updates = {
                  title: editMangaForm.title,
                  description: editMangaForm.desc,
                  genres: editMangaForm.genres,
                  status: editMangaForm.status,
                };
                if (editPosterFile) {
                  const fileExt = editPosterFile.name.split('.').pop();
                  const fileName = `${Date.now()}.${fileExt}`;
                  try {
                    updates.poster_url = await uploadToR2(editPosterFile, `posters/${fileName}`);
                  } catch (upErr) { notify('Poster upload алдаа: ' + upErr.message); setEditSaving(false); return; }
                }
                if (editBannerFile) {
                  const fileExt = editBannerFile.name.split('.').pop();
                  const fileName = `${Date.now()}-banner.${fileExt}`;
                  try {
                    updates.banner_url = await uploadToR2(editBannerFile, `banners/${fileName}`);
                  } catch (upErr) { notify('Баннер upload алдаа: ' + upErr.message); setEditSaving(false); return; }
                }
                const { error } = await supabase.from('mangas').update(updates).eq('id', editManga.id);
                setEditSaving(false);
                if (error) { notify('Алдаа: ' + error.message); return; }
                setSelected(prev => prev && prev.id === editManga.id ? { ...prev, ...updates, desc: updates.description, poster: updates.poster_url || prev.poster, banner_url: updates.banner_url || prev.banner_url } : prev);
                fetchMangas();
                setEditManga(null);
                notify('Манга шинэчлэгдлээ! 🎉');
              }} style={{ width: '100%', background: editSaving ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer', fontSize: 15 }}>
                {editSaving ? 'ХАДГАЛЖ БАЙНА...' : 'ХАДГАЛАХ'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}