import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { genres, MANGA_STATUSES, STATUS_META, DEFAULT_STATUS_META, PLANS, PLAN_DAYS, DAYS, SALE } from './constants';
import { validateImageFile, uploadToR2, deleteFromR2, formatMnDate, formatNumericDate, formatRemaining, normalizeGmailEmail, getAnonViewerKey, formatCountdownClock, splitTallImageFile, cropImageFile } from './helpers';
import { IconHome, IconGrid, IconBookmark, IconSearch, IconMenu, IconPencil, IconCheck, IconChevronUp, IconChevronDown, IconImage, IconTrash, IconCrop } from './icons';
import { PasswordField } from './PasswordField';

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
  // ЗАСВАР #176: "ЭРХ АВАХ" хуудсанд орох бvрт (хэрэв өмнө нь сонгоогvй бол)
  // "САНАЛ БОЛГОХ" (recommended) багцыг өмнөөс нь сонгосон байдлаар харуулна —
  // хэрэглэгчийн өгсөн жишээ загварт дундах багц урьдчилан сонгогдсон байдагтай адил.
  useEffect(() => {
    if (page !== 'vip' || selectedPlan) return;
    const rec = PLANS.find(p => p.recommended);
    if (rec) setSelectedPlan(rec.key);
  }, [page]);
  // ЗАСВАР #91: "Төлбөр төлсөн" хүсэлт admin-д очиж, admin шалгаад батлах/цуцлах
  const [paymentRequestSending, setPaymentRequestSending] = useState(false);
  const [paymentRequests, setPaymentRequests] = useState([]);
  // ЗАСВАР #163: admin-д VIP эрх авсан хэрэглэгчдийн жагсаалт (имэйл + vлдсэн хоног)
  const [vipUsers, setVipUsers] = useState([]);
  // ЗАСВАР #163: admin-ий статистик таб — цагаар идэвхжил + сvvлийн 1 сарын топ манга
  const [viewsByHour, setViewsByHour] = useState([]);
  const [topMangaMonth, setTopMangaMonth] = useState([]);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeGenre, setActiveGenre] = useState('Бүгд');
  // ЗАСВАР #95: library/history/readChapters-г localStorage-с Supabase руу
  // шилжүүлэв (user_library, reading_progress хүснэгтүүд) — төхөөрөмж
  // солиход ч мэдээлэл алдагдахгүй, зөвхөн нэвтэрсэн үед л ажиллана.
  const [library, setLibrary] = useState([]);
  const [history, setHistory] = useState([]);
  const [dbMangas, setDbMangas] = useState([]);
  const [authPage, setAuthPage] = useState(null);
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  // ЗАСВАР #156: "БvРТГvvЛЭХ"/"НЭВТРЭХ" товчийг олон дарахад давхар (олон
  // удаа) имэйл/хvсэлт явуулахаас сэргийлнэ
  const [authSubmitting, setAuthSubmitting] = useState(false);
  // ШИНЭ: нууц үг сэргээх урсгал (имэйлээр 8 оронтой код)
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
  const [adminManga, setAdminManga] = useState({ title: '', desc: '', genres: [], status: 'Гарч байгаа' });
  // ЗАСВАР #142: "НЭМЭХ" товчийг олон дарахад давхар манга vvсгэхээс сэргийлнэ
  const [mangaSaving, setMangaSaving] = useState(false);
  const [adminWorkerEmail, setAdminWorkerEmail] = useState('');
  // ЗАСВАР #31: цуглуулга болсон — олон staff role-ийг зэрэг чеклэж болно
  const [adminWorkerRoles, setAdminWorkerRoles] = useState([]);
  // ЗАСВАР #121: одоо модератор/эдитор эрхтэй хэрэглэгчдийн жагсаалт (эрхийг хураах товчтой)
  const [staffUsers, setStaffUsers] = useState([]);
  // ШИНЭ: VIP олгох (role-оос тусад нь, хоногийн хугацаатай)
  const [vipEmail, setVipEmail] = useState('');
  const [vipDays, setVipDays] = useState('30');
  const [vipSaving, setVipSaving] = useState(false);
  const [posterFile, setPosterFile] = useState(null);
  // ШИНЭ: нүүр хэсгийн "Санал болгох" мөрөнд ашиглах урт нарийн (portrait) баннер зураг
  const [bannerFile, setBannerFile] = useState(null);
  // ШИНЭ: оруулсан мангаг засах (edit) цонх
  const [editManga, setEditManga] = useState(null);
  const [editMangaForm, setEditMangaForm] = useState({ title: '', desc: '', genres: [], status: 'Гарч байгаа' });
  const [editPosterFile, setEditPosterFile] = useState(null);
  const [editBannerFile, setEditBannerFile] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  // ЗАСВАР #124: оруулсан бvлгийг засах (cover зураг солих, хуудсын зураг нэмэх/хасах/дараалал солих)
  const [editChapter, setEditChapter] = useState(null);
  const [editChapterForm, setEditChapterForm] = useState({ chapter_number: '', title: '', label: '', is_vip: false, publish_at: '' });
  const [editChapterCoverFile, setEditChapterCoverFile] = useState(null);
  const [editChapterExistingImages, setEditChapterExistingImages] = useState([]); // DB-д байгаа [{id, image_url, page_number}]
  const [editChapterNewFiles, setEditChapterNewFiles] = useState([]); // шинээр нэмэх файлууд
  const [editChapterSaving, setEditChapterSaving] = useState(false);
  const [editChapterNewFileUrls, setEditChapterNewFileUrls] = useState([]);
  // ЗАСВАР #161: бvлэг ЗАСАХ цонхонд ч (нэмэх цонхны adил) бvтэн харах (preview) товч
  const [editChapterPreviewOpen, setEditChapterPreviewOpen] = useState(false);
  useEffect(() => {
    const urls = editChapterNewFiles.map(f => URL.createObjectURL(f));
    setEditChapterNewFileUrls(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [editChapterNewFiles]);

  // ЗАСВАР #163: "БvЛЭГ ЗАСАХ"-ийн "Бvтэн харах" preview дотор ч зураг дээр
  // дарахад засварлах (crop/replace/delete) цонх нээгдэнэ. target нь
  // { kind: 'existing', index } (аль хэдийн R2-д байгаа, DB мөртэй) эсвэл
  // { kind: 'new', index } (шинээр сонгосон, хараахан upload хийгээгvй) байна.
  const [editChapterEditTarget, setEditChapterEditTarget] = useState(null);
  const [editChapterEditBusy, setEditChapterEditBusy] = useState(false);
  const editChapterReplaceInputRef = useRef(null);
  // ЗАСВАР #173: "Тайрах" дарахад дэлгэцийн БvХ өндрийг эзэлсэн тусдаа цонх
  // нээгдэж, зургаа гараараа дээшээ/доошоо чирж тогтмол цонхны цаана
  // байрлуулна (Instagram-ий profile crop шиг). "existing" (DB/R2-д байгаа)
  // болон "new" (upload хийгээгvй) хоёул дээр ажиллана.
  const [editChapterCropOpen, setEditChapterCropOpen] = useState(false);
  const [editChapterCropPanY, setEditChapterCropPanY] = useState(0);
  const [editChapterCropZoom, setEditChapterCropZoom] = useState(1);
  // ЗАСВАР #175: цонхны дээд/доод ирмэгт харандаа/зов тэмдэг sticker харуулж,
  // чирж байх vед зов тэмдэг болно (StitchPics-ийн визуал заавар шиг).
  const [editChapterCropDragging, setEditChapterCropDragging] = useState(false);
  const editChapterCropFrameRef = useRef(null);
  const editChapterCropImgRef = useRef(null);

  const closeEditChapterEditor = () => { setEditChapterEditTarget(null); setEditChapterCropOpen(false); setEditChapterCropPanY(0); setEditChapterCropZoom(1); };

  const deleteEditChapterEditImage = () => {
    if (!editChapterEditTarget) return;
    const { kind, index } = editChapterEditTarget;
    if (kind === 'existing') {
      setEditChapterExistingImages(prev => prev.filter((_, idx) => idx !== index));
    } else {
      setEditChapterNewFiles(prev => prev.filter((_, idx) => idx !== index));
    }
    closeEditChapterEditor();
  };

  // ЗАСВАР #163: per-image edit цонхноос дараалал сольно — "existing"/"new" 2
  // бvлгийн дотор л шилждэг (тэдгээрийн хоорондох хилийг (эхлээд existing, дараа
  // нь new) хадгалах save-логиктой нийцvvлэхийн тулд).
  const moveEditChapterEditImage = (dir) => {
    if (!editChapterEditTarget) return;
    const { kind, index } = editChapterEditTarget;
    const isExisting = kind === 'existing';
    const len = isExisting ? editChapterExistingImages.length : editChapterNewFiles.length;
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= len) return;
    const setter = isExisting ? setEditChapterExistingImages : setEditChapterNewFiles;
    setter(prev => {
      const arr = [...prev];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
    setEditChapterEditTarget({ kind, index: newIndex });
    setEditChapterCropOpen(false);
    setEditChapterCropPanY(0);
    setEditChapterCropZoom(1);
  };

  // ЗАСВАР #163: аль хэдийн R2-д байгаа зургийг crop/replace хийхэд шинэ файлыг
  // тэр даруй R2-д upload хийж, chapter_images мөрийг шинэ URL руу шинэчилж,
  // хуучин файлыг R2-с устгана (эх зургийг бvтнээр нь татаж канвас дээр авчрах
  // шаардлагатай тул crop-ийн хувьд эх URL-ыг fetch хийж blob болгоно).
  const applyExistingChapterImageEdit = async (produceNewFileFrom) => {
    if (!editChapterEditTarget || editChapterEditTarget.kind !== 'existing' || editChapterEditBusy) return;
    const img = editChapterExistingImages[editChapterEditTarget.index];
    if (!img) return;
    setEditChapterEditBusy(true);
    try {
      const newFile = await produceNewFileFrom(img);
      const ext = (img.image_url.split('.').pop() || 'jpg').split('?')[0];
      const newUrl = await uploadToR2(newFile, `chapters/${editChapter.id}/${Date.now()}-edited.${ext}`);
      const { error } = await supabase.from('chapter_images').update({ image_url: newUrl }).eq('id', img.id);
      if (error) { notify('Алдаа: ' + error.message); setEditChapterEditBusy(false); return; }
      setEditChapterExistingImages(prev => prev.map((it, idx) => idx === editChapterEditTarget.index ? { ...it, image_url: newUrl } : it));
      try { await deleteFromR2([img.image_url]); } catch { /* хор хөнөөлгvй */ }
    } catch (e) {
      notify('Алдаа: ' + e.message);
    }
    setEditChapterEditBusy(false);
  };

  const handleEditChapterReplaceFile = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !editChapterEditTarget) return;
    const invalid = validateImageFile(file);
    if (invalid) { notify(invalid); return; }
    if (editChapterEditTarget.kind === 'new') {
      setEditChapterNewFiles(prev => prev.map((f, idx) => idx === editChapterEditTarget.index ? file : f));
    } else {
      applyExistingChapterImageEdit(async () => file);
    }
  };

  const openEditChapterCrop = () => {
    if (!editChapterEditTarget) return;
    setEditChapterCropOpen(true);
    setEditChapterCropPanY(0);
    setEditChapterCropZoom(1);
  };
  const closeEditChapterCrop = () => {
    setEditChapterCropOpen(false);
    setEditChapterCropPanY(0);
    setEditChapterCropZoom(1);
  };

  const startEditChapterCropPanDrag = (e) => {
    e.preventDefault();
    const imgEl = editChapterCropImgRef.current;
    const frameEl = editChapterCropFrameRef.current;
    if (!imgEl || !frameEl) return;
    const fullHeight = imgEl.clientHeight;
    const frameHeight = frameEl.clientHeight;
    if (fullHeight <= 0) return; // зураг decode хийгдэж дуусаагvй байна
    const minY = Math.min(0, frameHeight - fullHeight);
    const point = e.touches ? e.touches[0] : e;
    const startClientY = point.clientY;
    const startPanY = editChapterCropPanY;
    setEditChapterCropDragging(true);

    const onMove = (ev) => {
      if (ev.touches) ev.preventDefault();
      const p = ev.touches ? ev.touches[0] : ev;
      setEditChapterCropPanY(Math.min(0, Math.max(minY, startPanY + (p.clientY - startClientY))));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      setEditChapterCropDragging(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  const changeEditChapterCropZoom = (delta) => {
    setEditChapterCropZoom(z => Math.max(0.5, Math.min(3, +(z + delta).toFixed(2))));
    setEditChapterCropPanY(0);
  };

  // ЗАСВАР #173: "Тайрах" дарахад одоо цонхонд харагдаж буй хэсгийг л vлдээж,
  // цонхыг хааж жагсаалт руу буцна. "existing" бол шинэ файлыг тэр даруй R2-д
  // upload хийж DB мөрийг шинэчилнэ (applyExistingChapterImageEdit), "new" бол
  // зөвхөн local state дотор солино.
  const confirmEditChapterCrop = async () => {
    const imgEl = editChapterCropImgRef.current;
    const frameEl = editChapterCropFrameRef.current;
    if (!imgEl || !frameEl || !editChapterEditTarget) return;
    const fullHeight = imgEl.clientHeight;
    const frameHeight = frameEl.clientHeight;
    const EPS = 4;
    if (editChapterCropPanY === 0 && fullHeight <= frameHeight + EPS) { closeEditChapterCrop(); return; }
    const scaleY = imgEl.naturalHeight / fullHeight;
    const rect = {
      x: 0,
      y: Math.round(-editChapterCropPanY * scaleY),
      width: imgEl.naturalWidth,
      height: Math.round(Math.min(frameHeight, fullHeight) * scaleY),
    };
    rect.height = Math.min(rect.height, imgEl.naturalHeight - rect.y);
    if (editChapterEditTarget.kind === 'new') {
      setEditChapterEditBusy(true);
      try {
        const newFile = await cropImageFile(editChapterNewFiles[editChapterEditTarget.index], rect);
        setEditChapterNewFiles(prev => prev.map((f, idx) => idx === editChapterEditTarget.index ? newFile : f));
        closeEditChapterCrop();
      } catch (e) {
        notify('Алдаа: ' + e.message);
      }
      setEditChapterEditBusy(false);
    } else {
      await applyExistingChapterImageEdit(async (img) => {
        const resp = await fetch(img.image_url);
        const blob = await resp.blob();
        const srcFile = new File([blob], `image.${(img.image_url.split('.').pop() || 'jpg').split('?')[0]}`, { type: blob.type });
        return cropImageFile(srcFile, rect);
      });
      closeEditChapterCrop();
    }
  };

  // ЗАСВАР #124: хадгалахдаа анх татсан зурагнуудаас алийг нь хассаныг мэдэхийн тулд
  // анхны мөрvvдийг (id + image_url) тусад нь хадгална (устгагдсан мөрийг ганцаарчлан
  // хасах, ЗАСВАР #163: мөн R2-с бодит файлыг нь устгахад image_url хэрэгтэй тул).
  const editChapterInitialImages = useRef([]);
  // ЗАСВАР #145: гарах цагийг эдитлээд өөрчилсөн эсэхийг мэдэхийн тулд анхны
  // (DB-д байгаа) утгыг хадгална — өөрчилсөн vед л created_at-ыг "одоо" болгож,
  // бvлгийг шинэ мэт "ШИНЭ БvЛЭГ" мөрөнд дахин гаргана.
  const editChapterInitialPublishAt = useRef(null);
  // datetime-local input-д тохирох "YYYY-MM-DDTHH:mm" (локал цагийн бvс) формат руу хөрвvvлнэ
  const toLocalDateTimeInput = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  // ЗАСВАР #124: бvлэг засах цонхыг нээж, тухайн бvлгийн одоогийн зургуудыг татна
  const openEditChapter = (ch) => {
    setEditChapterForm({ chapter_number: String(ch.chapter_number), title: ch.title || '', label: ch.label || '', is_vip: ch.is_vip || false, publish_at: toLocalDateTimeInput(ch.publish_at) });
    editChapterInitialPublishAt.current = ch.publish_at || null;
    setEditChapterCoverFile(null);
    setEditChapterNewFiles([]);
    setEditChapter(ch);
    supabase.from('chapter_images').select('id, chapter_id, image_url, page_number').eq('chapter_id', ch.id).order('page_number')
      .then(({ data }) => {
        setEditChapterExistingImages(data || []);
        editChapterInitialImages.current = data || [];
      });
  };
  // ШИНЭ: "Хувиар" тусдаа хуудас байхаа больж, avatar дээр дарахад буланд гарч ирэх жижиг цонх боллоо
  const [profileOpen, setProfileOpen] = useState(false);
  // ШИНЭ: site-тэй өнгө нийцсэн мэдэгдлийн карт (toast) — browser notify()-ийг орлоно
  const [toasts, setToasts] = useState([]);
  const [chapterManga, setChapterManga] = useState('');
  const [chapterNumber, setChapterNumber] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterFiles, setChapterFiles] = useState([]);
  // ЗАСВАР #163: "Бvтнээр" (өөрчлөхгvй) эсвэл "Хуваах" (4000px-ээс урт зургийг
  // тэр хэмжээгээр таслаж, олон хуудас болгох) горим сонгох.
  const [chapterSplitMode, setChapterSplitMode] = useState('full');
  // ЗАСВАР #169: "БvТНЭЭР ХАРАХ" preview дотор зураг дээр дарж Солих/Устгах/Зөөх хийж болно.
  const [chapterEditIndex, setChapterEditIndex] = useState(null); // chapterFiles-ийн alь index засварлаж буй
  const [chapterEditBusy, setChapterEditBusy] = useState(false);
  // ЗАСВАР #174: "Тайрах" дарахад тусдаа цонх/хуудас vvсгэхгvйгээр, яг
  // тухайн (сонгогдсон) зурган дээр нь шууд дотор нь тогтмол өндөртэй цонх
  // болж, зургаа гараараа дээшээ/доошоо чирж тохируулна — зөвхөн дээд/доод
  // (өндрийн чиглэл) тайрна, өргөн хэвээрээ vлдэнэ.
  const [chapterCropActive, setChapterCropActive] = useState(false);
  const [chapterCropPanY, setChapterCropPanY] = useState(0);
  const [chapterCropZoom, setChapterCropZoom] = useState(1);
  const [chapterCropBusy, setChapterCropBusy] = useState(false);
  // ЗАСВАР #175: цонхны дээд/доод ирмэгт харандаа/зов тэмдэг sticker харуулж,
  // чирж байх vед зов тэмдэг болно (StitchPics-ийн визуал заавар шиг).
  const [chapterCropDragging, setChapterCropDragging] = useState(false);
  const chapterCropFrameRef = useRef(null);
  const chapterCropImgRef = useRef(null);
  // ЗАСВАР #118: URL.createObjectURL-ийг render болгонд шинээр үүсгэдэг байсан
  // memory leak-ийг засав — blob URL-уудыг файл өөрчлөгдөх үед л нэг удаа
  // үүсгэж, хуучныг нь revoke хийнэ.
  const [chapterFileUrls, setChapterFileUrls] = useState([]);
  useEffect(() => {
    const urls = chapterFiles.map(f => URL.createObjectURL(f));
    setChapterFileUrls(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [chapterFiles]);

  // ЗАСВАР #164: "БvТНЭЭР ХАРАХ" preview-с дарж нээгдэх per-image edit vйлдлvvд
  const closeChapterEdit = () => { setChapterEditIndex(null); setChapterCropActive(false); setChapterCropPanY(0); setChapterCropZoom(1); };

  const deleteChapterEditImage = () => {
    if (chapterEditIndex === null) return;
    setChapterFiles(prev => prev.filter((_, idx) => idx !== chapterEditIndex));
    closeChapterEdit();
  };

  // ЗАСВАР #163: per-image edit цонхноос шууд дараалал сольж болно (дээш/доош)
  const moveChapterEditImage = (dir) => {
    if (chapterEditIndex === null) return;
    const newIndex = chapterEditIndex + dir;
    if (newIndex < 0 || newIndex >= chapterFiles.length) return;
    setChapterFiles(prev => {
      const arr = [...prev];
      [arr[chapterEditIndex], arr[newIndex]] = [arr[newIndex], arr[chapterEditIndex]];
      return arr;
    });
    setChapterEditIndex(newIndex);
    setChapterCropActive(false);
    setChapterCropPanY(0);
    setChapterCropZoom(1);
  };

  const chapterReplaceInputRef = useRef(null);
  const handleChapterReplaceFile = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || chapterEditIndex === null) return;
    const invalid = validateImageFile(file);
    if (invalid) { notify(invalid); return; }
    setChapterFiles(prev => prev.map((f, idx) => idx === chapterEditIndex ? file : f));
  };

  const openChapterCrop = () => {
    if (chapterEditIndex === null) return;
    setChapterCropActive(true);
    setChapterCropPanY(0);
    setChapterCropZoom(1);
  };
  const closeChapterCrop = () => {
    setChapterCropActive(false);
    setChapterCropPanY(0);
    setChapterCropZoom(1);
  };

  // ЗАСВАР #173: зургийг тогтмол (дэлгэцийн бvх өндөртэй) цонхны дотор
  // дээшээ/доошоо чирнэ.
  const startChapterCropPanDrag = (e) => {
    e.preventDefault();
    const imgEl = chapterCropImgRef.current;
    const frameEl = chapterCropFrameRef.current;
    if (!imgEl || !frameEl) return;
    const fullHeight = imgEl.clientHeight;
    const frameHeight = frameEl.clientHeight;
    if (fullHeight <= 0) return; // зураг decode хийгдэж дуусаагvй байна
    const minY = Math.min(0, frameHeight - fullHeight);
    const point = e.touches ? e.touches[0] : e;
    const startClientY = point.clientY;
    const startPanY = chapterCropPanY;
    setChapterCropDragging(true);

    const onMove = (ev) => {
      if (ev.touches) ev.preventDefault();
      const p = ev.touches ? ev.touches[0] : ev;
      setChapterCropPanY(Math.min(0, Math.max(minY, startPanY + (p.clientY - startClientY))));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      setChapterCropDragging(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  // ЗАСВАР #173: zoom өөрчлөгдөх бvрт (өөр хэмжээтэй болж харагдах тул өмнөх
  // pan утга худал болдог) байрлалыг "0" (дээд ирмэгтэй тааруулсан)-руу дахин тохируулна.
  const changeChapterCropZoom = (delta) => {
    setChapterCropZoom(z => Math.max(0.5, Math.min(3, +(z + delta).toFixed(2))));
    setChapterCropPanY(0);
  };

  // ЗАСВАР #173: "Тайрах" дарахад одоо цонхонд харагдаж буй хэсгийг л vлдээж,
  // цонхыг хааж жагсаалт руу буцна.
  const confirmChapterCrop = async () => {
    const imgEl = chapterCropImgRef.current;
    const frameEl = chapterCropFrameRef.current;
    if (!imgEl || !frameEl || chapterEditIndex === null) return;
    const fullHeight = imgEl.clientHeight;
    const frameHeight = frameEl.clientHeight;
    const EPS = 4;
    if (chapterCropPanY === 0 && fullHeight <= frameHeight + EPS) { closeChapterCrop(); return; }
    const scaleY = imgEl.naturalHeight / fullHeight;
    const rect = {
      x: 0,
      y: Math.round(-chapterCropPanY * scaleY),
      width: imgEl.naturalWidth,
      height: Math.round(Math.min(frameHeight, fullHeight) * scaleY),
    };
    rect.height = Math.min(rect.height, imgEl.naturalHeight - rect.y);
    const targetIndex = chapterEditIndex;
    setChapterCropBusy(true);
    try {
      const newFile = await cropImageFile(chapterFiles[targetIndex], rect);
      setChapterFiles(prev => prev.map((f, idx) => idx === targetIndex ? newFile : f));
      closeChapterCrop();
    } catch (e) {
      notify('Алдаа: ' + e.message);
    }
    setChapterCropBusy(false);
  };

  // ШИНЭ: upload хийхийн өмнө сонгосон зургуудыг бүлэг уншиж байгаа мэт бүтнээр нь харах
  const [chapterPreviewOpen, setChapterPreviewOpen] = useState(false);
  // ШИНЭ: уншиж байгаа хуудасны дээд талд бүлгийн дугаар дарахад бусад бүлгүүд жагсаана
  const [chapterSwitcherOpen, setChapterSwitcherOpen] = useState(false);
  // ЗАСВАР #102: бүлэг уншихад zoom (томруулах/жижигрvvлэх) хэсэг, 100%-с эхэлнэ
  const [readerZoom, setReaderZoom] = useState(100);
  // ЗАСВАР #102: доошоо гvйлгэхэд толгой хэсгийг нуух, дээшээ гvйлгэхэд харуулах
  const [readerHeaderVisible, setReaderHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);
  // ЗАСВАР #141: Safari (ялангуяа утсан дээр) удаан нуугдсан tab-ыг санамсаргvй
  // дахин ачаалахад унших байрлал алдагдаж, эхнээс эхэлдэг байсан асуудлыг
  // багасгах зорилгоор гvйлгэсэн байрлалыг тогтмол хугацаанд sessionStorage-д
  // хадгална (доор өөр effect-ээр буцааж сэргээнэ).
  const lastScrollSaveTime = useRef(0);
  useEffect(() => {
    if (page !== 'reader' || !selectedChapter) return;
    lastScrollY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastScrollY.current && y > 80) setReaderHeaderVisible(false);
      else if (y < lastScrollY.current) setReaderHeaderVisible(true);
      lastScrollY.current = y;
      const now = Date.now();
      if (now - lastScrollSaveTime.current > 300) {
        lastScrollSaveTime.current = now;
        try { sessionStorage.setItem(`reader_scroll_${selectedChapter.id}`, String(y)); } catch { /* Safari private mode гэх мэтэд sessionStorage хаалттай байж болно */ }
      }
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, [page, selectedChapter]);

  // ЗАСВАР #103: бүлэг уншиж байх үед гараар (pinch) zoom хийж болохоор
  // viewport хязгаарлалтыг түр сулруулна; бусад хуудсанд буцаагаад хориглоно.
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    meta.setAttribute('content', page === 'reader'
      ? 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes'
      : 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  }, [page]);
  // ЗАСВАР #58: удирдлагын панелийг доошоо жагсаасан олон карт биш, хажуу тийш
  // жигсаасан таб (each) хэсэгтэй болгосон
  const [adminTab, setAdminTab] = useState('manga');
  const [chapterUploading, setChapterUploading] = useState(false);
  // ШИНЭ: бvлэг нэмэхэд зургууд хэдэн хувь upload болсныг харуулна
  const [chapterUploadProgress, setChapterUploadProgress] = useState(0);
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
  // ЗАСВАР #108: сэтгэгдэлд хавсаргах сонгосон стикер, upload хийж буй slot
  const [selectedSticker, setSelectedSticker] = useState(null);
  const [stickerUploading, setStickerUploading] = useState(null);
  const [commentSending, setCommentSending] = useState(false);
  // { [mangaId]: [бүлгийн дугаарууд] } — уншсан бүлгүүд
  const [readChapters, setReadChapters] = useState({});
  // ШИНЭ: role систем, нийтлэх урсгал, report
  const [chapterIsVip, setChapterIsVip] = useState(false);
  // ЗАСВАР #60: "ҮНЭГҮЙ"/"VIP" бэлгэдлийн оронд admin өөрөө бичих дурын тэмдэглэгээ (жишээ нь S1 END)
  const [chapterLabel, setChapterLabel] = useState('');
  // ШИНЭ: admin/moderator шууд нэмэхдээ ч ирээдүйн гарах цаг товлож болно
  const [chapterPublishAt, setChapterPublishAt] = useState('');
  const [pendingChapters, setPendingChapters] = useState([]);
  const [reportsList, setReportsList] = useState([]);
  // ЗАСВАР #125: moderator/editor-ийн устгах хvсэлт илгээсэн бvлгvvд (зөвхөн admin баталгаажуулна)
  const [pendingDeleteChapters, setPendingDeleteChapters] = useState([]);

  // ШИНЭ: бүлгийн cover, эрэмбэ, хуваарь, like/reply, countdown
  const [chapterCover, setChapterCover] = useState(null);
  const [chapterSort, setChapterSort] = useState('asc');
  // ЗАСВАР #111: манга дэлгэрэнгvй хуудсанд бvлгийн дугаараар хайх
  const [chapterSearch, setChapterSearch] = useState('');
  const [pendingTimes, setPendingTimes] = useState({});
  const [myLikes, setMyLikes] = useState([]);
  // ШИНЭ: сэтгэгдэл бүрийн like-ийн тоо (comment_id -> тоо), aggregate embed-гүйгээр тооцно
  const [commentLikeCounts, setCommentLikeCounts] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [nowTs, setNowTs] = useState(Date.now());

  // ЗАСВАР #109: манга дэлгэрэнгүй хуудасны tab, vнэлгээ, манганы ерөнхий сэтгэгдэл
  const [detailTab, setDetailTab] = useState('info');
  const [mangaRatings, setMangaRatings] = useState([]);
  const [ratingSending, setRatingSending] = useState(false);
  const [ratingInput, setRatingInput] = useState('');
  const [mangaComments, setMangaComments] = useState([]);
  const [mangaCommentText, setMangaCommentText] = useState('');
  const [mangaCommentSending, setMangaCommentSending] = useState(false);
  const [myMangaLikes, setMyMangaLikes] = useState([]);
  const [mangaCommentLikeCounts, setMangaCommentLikeCounts] = useState({});
  const [mangaReplyTo, setMangaReplyTo] = useState(null);
  const [mangaReplyText, setMangaReplyText] = useState('');
  const [mangaSelectedSticker, setMangaSelectedSticker] = useState(null);

  // ЗАСВАР #113: "Юу уншихаа мэдэхгvй vv?" reel (tiktok маягийн) feed
  const [dbReels, setDbReels] = useState([]);
  const [myReelLikes, setMyReelLikes] = useState([]);
  const [reelLikeCounts, setReelLikeCounts] = useState({});
  // ЗАСВАР #161: reel-vvдийг нээхэд дуу нь автоматаар хаалттай (muted) эхэлдэг
  // байснийг өөрчилж, шууд дуутайгаар нээгддэг болгов (хэрэглэгч "Reels" рvv
  // орох дарах vйлдэл өөрөө user gesture тул browser-vvд ихэнхдээ зөвшөөрдөг).
  const [reelsMuted, setReelsMuted] = useState(false);
  const [adminReelManga, setAdminReelManga] = useState('');
  const [reelVideoFile, setReelVideoFile] = useState(null);
  const [reelUploading, setReelUploading] = useState(false);

  // ЗАСВАР #117: сэтгэгдэл дэх стикер зургийг дарж томруулж vзэх (lightbox)
  const [zoomedSticker, setZoomedSticker] = useState(null);

  // ЗАСВАР #130: бvлэг устгах хvсэлттэй холбоотой цайвар browser window.confirm()-г
  // site-тэй өнгө нийцсэн загвартай цонхоор сольсон.
  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }
  // ЗАСВАР #163: манганы 7 хоног бvрийн хуваарь засах window.prompt()-г (2 удаагийн
  // цайвар browser prompt) site-тэй өнгө нийцсэн нэг загварт цонхоор сольсон.
  const [scheduleEditModal, setScheduleEditModal] = useState(null); // { manga, day, time }
  // ЗАСВАР #163: сэтгэгдэл мэдэгдэх (report) шалтгаан бичих window.prompt()-г
  // site-тэй өнгө нийцсэн загварт цонхоор сольсон.
  const [reportReasonModal, setReportReasonModal] = useState(null); // { onSubmit, reason }
  const askConfirm = (message, onConfirm) => setConfirmModal({ message, onConfirm });

  // ЗАСВАР #150: "Smut" төрөлтэй манганы дэлгэрэнгvй хуудсанд ороход 18+
  // анхааруулга харуулна — уншигч нэг удаа "ОЙЛГОЛОО" дарсны дараа (уг
  // browser-т) дахин харагдахгvй (localStorage-д тэмдэглэнэ).
  const [smutWarningOpen, setSmutWarningOpen] = useState(false);
  useEffect(() => {
    if (page !== 'detail' || !selected) { setSmutWarningOpen(false); return; }
    if (!(selected.genres || []).includes('Smut')) { setSmutWarningOpen(false); return; }
    try {
      if (localStorage.getItem('smut_warning_ack') === '1') { setSmutWarningOpen(false); return; }
    } catch { /* localStorage хаалттай vед анхааруулгыг харин ч харуулна */ }
    setSmutWarningOpen(true);
  }, [page, selected]);

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
  // ЗАСВАР #127: staff (admin/moderator/editor) 6 хvртэл, энгийн хэрэглэгч 3 хvртэл стикер хадгалж болно
  const stickerSlots = isStaff ? [1, 2, 3, 4, 5, 6] : [1, 2, 3];
  const myStickers = stickerSlots.map(n => userProfile?.[`sticker_${n}`]).filter(Boolean);

  // ШИНЭ: тодорхой цагт (publish_at) товлогдсон бүлгүүд — хуваарийн хуудсанд харуулна
  const [scheduledChapters, setScheduledChapters] = useState([]);
  // ЗАСВАР #147: Хуваарь хуудсыг comic app шиг өдөр тус бvрийн ТАБ (тухайн
  // vед зөвхөн 1 өдрийн агуулга харагдана) болгов — 7 хоногийн дараалал нь
  // Даваа-с (хэвийн долоо хоногийн дараалал) хэвээрээ, гэхдээ хуудас нээгдэх
  // бvрт ЭНЭ ӨДРИЙН таб автоматаар сонгогдоно.
  const [scheduleDay, setScheduleDay] = useState(() => new Date().getDay());
  useEffect(() => {
    if (page === 'schedule') setScheduleDay(new Date().getDay());
  }, [page]);
  // ЗАСВАР #44: нүүр хэсгийн "ШИНЭ БҮЛЭГ" одоо мангаар биш, БҮЛЭГ бүрээр (өөрийн
  // cover зурагтайгаа) харуулна — 1 манга 10 бүлэг гаргавал 10 тусдаа карт гарна
  const [recentChapters, setRecentChapters] = useState([]);
  // ШИНЭ: сүүлийн 30 хоногт хамгийн их үзэгдсэн 10 манга (нүүр хэсгийн "Санал болгох" мөр)
  const [topMangaIds, setTopMangaIds] = useState(null); // null = ачаалж дуусаагүй
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

  // ЗАСВАР #146: Хуваарь хуудсанд секунд бvрээр тоологддог (жишээ нь 12:15:28)
  // цаг харуулах тул зөвхөн тэр хуудсан дээр байх vед л 1 секунд тутам сэргээнэ
  // (бусад хуудсанд 30 сек хангалттай тул илишдэн re-render хийхгvй).
  const [scheduleNowTs, setScheduleNowTs] = useState(Date.now());
  useEffect(() => {
    if (page !== 'schedule' && page !== 'detail') return;
    setScheduleNowTs(Date.now());
    const t = setInterval(() => setScheduleNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [page]);

  // ШИНЭ: цонхны хэмжээгээр утас/компьютер горимыг мэдэрнэ (hamburger цэс)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Хуудас солигдох бүрт утасны цэсийг автоматаар хаана
  useEffect(() => { setSidebarOpen(false); }, [page]);


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

  // ЗАСВАР #146: admin "ГАРАХ ХУВААРЬ" хуудаснаас тодорхой бvлгийн товлолтыг
  // (эсвэл манганы 7 хоног бvрийн давтагдах хуваарийг) гараар устгаж болно —
  // бvлэг/мангаг vvнээр бvрэн устгахгvй, зөвхөн ХУВААРИАС нь хасна.
  const removeChapterSchedule = (ch) => {
    askConfirm(`Бvлэг ${ch.chapter_number}-ийн товлолтыг хуваариас хасах уу?`, async () => {
      const { error } = await supabase.from('chapters').update({ publish_at: null }).eq('id', ch.id);
      if (error) { notify('Алдаа: ' + error.message); return; }
      setScheduledChapters(prev => prev.filter(x => x.id !== ch.id));
      notify('Товлолт хуваариас хасагдлаа.');
    });
  };
  const removeMangaSchedule = (m) => {
    askConfirm(`"${m.title}"-ийн 7 хоног бvрийн хуваарийг хасах уу?`, async () => {
      const { error } = await supabase.from('mangas').update({ schedule_day: null, schedule_time: null }).eq('id', m.id);
      if (error) { notify('Алдаа: ' + error.message); return; }
      setDbMangas(prev => prev.map(x => x.id === m.id ? { ...x, schedule_day: null, schedule_time: null } : x));
      notify('Хуваариас хасагдлаа.');
    });
  };
  // ЗАСВАР #157: admin манганы 7 хоног бvрийн давтагдах хуваарийг ("өдөр",
  // "цаг") Хуваарь хуудаснаас шууд гараар засаж болно
  const editMangaSchedule = (m) => {
    setScheduleEditModal({ manga: m, day: String(m.schedule_day ?? ''), time: m.schedule_time || '' });
  };
  const saveMangaSchedule = async () => {
    const { manga: m, day: dayInput, time: timeInput } = scheduleEditModal;
    const dayNum = Number(dayInput);
    if (dayInput.trim() === '' || !Number.isInteger(dayNum) || dayNum < 0 || dayNum > 6) { notify('Алдаа: 0-6 хооронд тоо оруулна уу!'); return; }
    if (!/^\d{1,2}:\d{2}$/.test(timeInput.trim())) { notify('Алдаа: цагийг ЦЦ:ММ хэлбэрээр оруулна уу!'); return; }
    const { error } = await supabase.from('mangas').update({ schedule_day: dayNum, schedule_time: timeInput.trim() }).eq('id', m.id);
    if (error) { notify('Алдаа: ' + error.message); return; }
    setDbMangas(prev => prev.map(x => x.id === m.id ? { ...x, schedule_day: dayNum, schedule_time: timeInput.trim() } : x));
    setScheduleEditModal(null);
    notify('Хуваарь шинэчлэгдлээ.');
  };

  // ЗАСВАР #95: нэвтрэхэд Supabase-с хадгалсан манга + унших явцыг татаж ирнэ;
  // гарахад (logout) локал state-ийг цэвэрлэнэ (DB-д хэвээрээ үлдэнэ).
  useEffect(() => {
    // ЗАСВАР #118: нэвтрээгүй (зочин) хэрэглэгчийн түүх/уншсан бүлэг refresh
    // хийхэд алга болдог байсан — зочинд localStorage-с сэргээдэг болгов.
    if (!currentUser) {
      setLibrary([]);
      try {
        setHistory(JSON.parse(localStorage.getItem('guest_history') || '[]'));
        setReadChapters(JSON.parse(localStorage.getItem('guest_read_chapters') || '{}'));
      } catch {
        setHistory([]);
        setReadChapters({});
      }
      return;
    }
    supabase.from('user_library').select('manga_id').eq('user_id', currentUser.id)
      .then(({ data }) => setLibrary((data || []).map(r => r.manga_id)));
    supabase.from('reading_progress').select('manga_id, last_chapter, read_chapters, updated_at').eq('user_id', currentUser.id)
      .then(({ data }) => {
        const rows = data || [];
        setHistory(rows
          .map(r => ({ mangaId: r.manga_id, chapter: r.last_chapter, date: new Date(r.updated_at).getTime() }))
          .sort((a, b) => b.date - a.date));
        setReadChapters(Object.fromEntries(rows.map(r => [r.manga_id, r.read_chapters || []])));
      });
  }, [currentUser]);

  const toggleLibrary = async (id) => {
    if (!currentUser) { setAuthPage('login'); return; }
    if (library.includes(id)) {
      setLibrary(prev => prev.filter(x => x !== id));
      await supabase.from('user_library').delete().eq('user_id', currentUser.id).eq('manga_id', id);
    } else {
      setLibrary(prev => [...prev, id]);
      await supabase.from('user_library').insert({ user_id: currentUser.id, manga_id: id });
    }
  };

  // ЗАСВАР #61: манга дэлгэрэнгүй хуудас руу орохдоо одоогийн хуудсыг санана,
  // ингэснээр "Буцах" дарахад тухайн хуудас руу нь буцаж очно (үргэлж Нүүр биш)
  const goToDetail = (manga) => {
    setPreviousPage(page);
    setSelected(manga);
    setMangaNoteEditing(false);
    setPage('detail');
  };

  // ЗАСВАР #155: production-д гарахын өмнө нийт сайт даяар (60 гаруй газарт)
  // Supabase/Postgres-ээс ирдэг англи, техникийн raw алдааны бичвэрvvдийг
  // (жишээ нь "duplicate key value violates unique constraint") хэрэглэгчид
  // ойлгомжтой монгол бичвэр рvv хөрвvvлнэ. Дуудлага бvр дээр нь тусад нь
  // бичихийн оронд notify()-ийн ӨӨРИЙН дотор нэг газар шvvдэг тул БvХ
  // дуудлагад автоматаар хамрагдана (шинэ notify() нэмэгдэхэд ч дахин
  // бичих шаардлагагvй).
  const translateErrorText = (text) => {
    if (!text) return text;
    const rules = [
      [/already registered|already exists/i, 'энэ имэйл хаягаар аль хэдийн бvртгэлтэй хэрэглэгч байна'],
      [/database error saving new user/i, 'энэ имэйл хаяг (өөр бичлэгээр ч гэсэн) аль хэдийн бvртгэлтэй байж магадгvй'],
      [/password.*(least|short|characters)/i, 'нууц vг хэт богино байна (дор хаяж 6 тэмдэгттэй байх ёстой)'],
      [/invalid email/i, 'имэйл хаяг буруу байна'],
      [/token has expired|otp.*expired|invalid.*otp|invalid.*token/i, 'код буруу эсвэл хугацаа дууссан байна — зөвхөн хамгийн сvvлд илгээсэн код хvчинтэй'],
      [/rate limit/i, 'хэт олон удаа оролдлоо. Түр хvлээгээд дахин оролдоно уу'],
      [/duplicate key value violates unique constraint/i, 'ийм мэдээлэл (давхардсан утга) аль хэдийн бvртгэлтэй байна'],
      [/violates foreign key constraint/i, 'холбогдох мэдээлэл олдсонгvй эсвэл өмнө нь устсан байна'],
      [/violates row-level security|permission denied|new row violates/i, 'танд энэ vйлдлийг хийх эрх байхгvй байна'],
      [/jwt expired|invalid jwt/i, 'нэвтрэлтийн хугацаа дууссан байна, дахин нэвтэрнэ vv'],
      [/failed to fetch|networkerror|network request failed/i, 'сvлжээний алдаа гарлаа. Интернэт холболтоо шалгаад дахин оролдоно уу'],
      [/value too long/i, 'оруулсан текст хэт урт байна'],
      [/null value in column .* violates not-null constraint/i, 'заавал бөглөх талбар хоосон байна'],
    ];
    let result = text;
    for (const [pattern, replacement] of rules) {
      if (pattern.test(result)) { result = result.replace(pattern, replacement); break; }
    }
    return result;
  };

  // ЗАСВАР #32: цайвар browser notify()-ийн оронд site-тэй өнгө нийцсэн жижиг
  // мэдэгдлийн карт (toast). Мессежид "Алдаа" гэсэн үг байвал улаан, эс бол
  // ногоон хүрээтэй харагдана — ингэснээр 75 notify() дуудлагыг нэг нэгээр нь
  // төрөл ялгаж бичихийн оронд зүгээр л alert-ийг notify-гаар сольсон.
  const notify = (rawMessage) => {
    const message = translateErrorText(rawMessage);
    const type = /алдаа/i.test(message) ? 'error' : 'success';
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  };

  // Supabase-ээс манга татах — админ шинээр нэмсний дараа дахин дуудаж болохоор
  // тусдаа функц болгосон (ЗАСВАР: өмнө нь нэмсний дараа refresh хийх шаардлагатай байсан).
  const fetchMangas = useCallback(() => {
    // ЗАСВАР #159: select('*')-ийн оронд шаардлагатай баганаа зааж татна — egress багасна
    supabase.from('mangas')
      .select('id, title, description, genres, status, poster_url, banner_url, views, is_hidden, schedule_day, schedule_time, created_at, admin_note, is_recommended')
      .then(({ data, error }) => {
      if (error) console.error('Supabase манга алдаа:', error);
      if (data && data.length > 0) {
        setDbMangas(data.map(m => ({
          id: m.id,
          title: m.title,
          desc: m.description,
          // ЗАСВАР #56: хуучин ганц "genre" багана migration_5-аар бvх мөрөнд
          // "genres" рvv нэг удаа backfill хийгдсэн тул одоо зөвхөн үvнийг уншина
          genres: m.genres || [],
          status: m.status,
          poster: m.poster_url,
          banner_url: m.banner_url, // ШИНЭ: нүүр хэсгийн "Санал болгох" мөрөнд ашиглах урт нарийн зураг
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
    // ЗАСВАР #159: өмнө нь шинэ хуудас нээгдэх бvрт бvх хэрэглэгчийн сvvлийн 30
    // хоногийн mangaviewevents-ийг шууд count/group хийдэг (хамгийн хvнд query)
    // байсан — одоо цагийн 1 удаа (pg_cron) урьдчилан тооцоод хадгалдаг жижиг
    // top_manga_cache хvснэгтээс л уншина, зөвхөн тэр хоосон vед rpc-руу орно.
    supabase.from('top_manga_cache').select('manga_id').order('rank')
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          setTopMangaIds(data.map(r => r.manga_id));
          return;
        }
        supabase.rpc('top_manga_last_days', { days_back: 30, result_limit: 10 })
          .then(({ data: d }) => setTopMangaIds(d ? d.map(r => r.manga_id) : []));
      });
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
  const heroTouchX = useRef(null);
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
    supabase.from('users').select('roles, name, avatar_url, is_vip, vip_expires_at, sticker_1, sticker_2, sticker_3, sticker_4, sticker_5, sticker_6').eq('id', userId).single()
      .then(({ data }) => {
        if (data) {
          setUserRoles(data.roles || []);
          setUserProfile(data);
          setProfileName(data.name || '');
        }
      });
  }, []);

  // ШИНЭ: нууц үг сэргээх — имэйл рүү 8 оронтой код илгээнэ
  // (Supabase талд Authentication → Email Templates → Reset Password загварт
  // холбоос ({{ .ConfirmationURL }})-ны оронд {{ .Token }} гэж тавьсан байх ёстой,
  // эс тэгвэл имэйлд код биш холбоос ирнэ).
  const sendResetCode = async () => {
    // ЗАСВАР #156: маш хурдан давхар дарахад disabled attribute хараахан
    // идэвхжээгvй байж болзошгvй тул энд ч давхар шалгана
    if (resendCooldown > 0 || resetSending) return;
    if (!authForm.email.trim()) { notify('Имэйлээ оруулна уу!'); return; }
    setResetSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(authForm.email.trim());
    setResetSending(false);
    if (error) { notify('Алдаа: ' + error.message); return; }
    setResetCode('');
    setResetNewPassword('');
    setAuthPage('reset');
    setResendCooldown(30); // ЗАСВАР #40: дахин илгээхэд 30 секундын хүлээлт
    notify('Танд 8 оронтой баталгаажуулах код имэйлээр илгээгдлээ 📧');
  };

  // Дахин илгээх хүлээлтийн секундыг 1 секунд тутам бууруулна
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(prev => (prev <= 1 ? 0 : prev - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown > 0]);

  // ШИНЭ: илгээсэн кодыг шалгаад шинэ нууц үгийг хадгална
  const confirmResetCode = async () => {
    if (resetCode.trim().length !== 8) { notify('8 оронтой кодоо бүрэн оруулна уу!'); return; }
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

  // ЗАСВАР #99: URL routing — хуудас бүр өөрийн URL-тэй болгож, browser-ийн
  // native буцах/урагшаа товч (мөн refresh) зөв ажилладаг болгов. Өмнө нь
  // бүх навигац зөвхөн React state-ээр (URL хэзээ ч солигдохгvй) хийгддэг
  // байсан тул browser буцах товч дарахад сайтаас шууд гардаг байсан.
  const isPopStateNav = useRef(false);
  const didInitialRestore = useRef(false);
  const reelVideoRefs = useRef({});
  // ЗАСВАР #100: deep-link (жишээ нь /manga/2 руу шууд орох эсвэл refresh хийх)
  // үед dbMangas ирэхээс ӨМНӨ sync effect ажиллаж, URL-ыг '/' болгож дарж бичдэг
  // байсан bug-ыг засав — одоо анхны сэргээлт дуустал sync хийхгvй хvлээнэ.
  const [routeReady, setRouteReady] = useState(() => window.location.pathname === '/');

  const computePath = useCallback(() => {
    if (page === 'detail' && selected) return `/manga/${selected.id}`;
    if (page === 'reader' && selected && selectedChapter) return `/manga/${selected.id}/chapter/${selectedChapter.chapter_number}`;
    if (page === 'home') return '/';
    return `/${page}`;
  }, [page, selected, selectedChapter]);

  const restoreFromPath = useCallback((pathname) => {
    const chMatch = pathname.match(/^\/manga\/(\d+)\/chapter\/([\d.]+)$/);
    const mMatch = pathname.match(/^\/manga\/(\d+)$/);
    if (chMatch || mMatch) {
      const mangaId = Number((chMatch || mMatch)[1]);
      const manga = dbMangas.find(m => m.id === mangaId);
      if (!manga) { setPage('home'); return; }
      setSelected(manga);
      if (chMatch) {
        supabase.from('chapters').select('id, manga_id, chapter_number, title, label, is_vip, status, is_hidden, pending_delete, publish_at, created_at, thumbnail_url').eq('manga_id', mangaId).eq('chapter_number', Number(chMatch[2])).maybeSingle()
          .then(({ data }) => {
            if (!data) { setPage('detail'); return; }
            // ЗАСВАР #163: шууд линкээр (deep-link) орж ирэхэд ч openReader-тэй
            // ижил VIP/цагийн шалгалтыг хийнэ — эс бол RLS-ээр далдлагдсан зурагны
            // "Ачааллаж байна..." дэлгэц дээр хэрэглэгч учрыг олохгvй царцдаг байсан.
            if (data.is_vip && !isVip) {
              notify('👑 Энэ бол VIP бүлэг. Унших эрх авна уу!');
              setPreviousPage('detail');
              setPage('vip');
              return;
            }
            if (chapterLocked(data) && !isStaff) {
              notify(`⏳ Энэ бүлэг ${formatRemaining(new Date(data.publish_at).getTime() - nowTs)}-ийн дараа нээгдэнэ!`);
              setPage('detail');
              return;
            }
            setSelectedChapter(data);
            setPage('reader');
          });
      } else {
        setPage('detail');
      }
      return;
    }
    const seg = pathname.replace(/^\//, '');
    setPage(['all', 'schedule', 'vip', 'library', 'admin', 'reels'].includes(seg) ? seg : 'home');
  }, [dbMangas, isVip, isStaff, nowTs, chapterLocked, notify]);

  // Анх ачаалахад (эсвэл dbMangas ирэхэд) одоогийн URL-аас хуудсыг сэргээнэ
  useEffect(() => {
    if (didInitialRestore.current || dbMangas.length === 0) return;
    didInitialRestore.current = true;
    const pathname = window.location.pathname;
    if (pathname && pathname !== '/') {
      isPopStateNav.current = true;
      restoreFromPath(pathname);
    }
    setRouteReady(true);
  }, [dbMangas, restoreFromPath]);

  // Browser-ийн буцах/урагшаа товч дарахад URL-аас дахин state сэргээнэ
  useEffect(() => {
    const onPopState = () => {
      isPopStateNav.current = true;
      restoreFromPath(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [restoreFromPath]);

  // Хуудас/манга/бүлэг солигдох бүрт URL-ыг синк хийнэ (popstate-с үүдсэн
  // өөрчлөлт бол шинэ history entry нэмэхгvй, зөвхөн жинхэнэ навигацид нэмнэ)
  useEffect(() => {
    if (!routeReady) return;
    const path = computePath();
    const oldPath = window.location.pathname;
    if (oldPath === path) return;
    if (isPopStateNav.current) {
      isPopStateNav.current = false;
      return;
    }
    // ЗАСВАР #163: нэг мангын дотор бvлэг сольж уншихад ("дараагийн/өмнөх
    // бvлэг", chapter switcher) шинэ history мөр нэмэхийн оронд одоогийнхыг
    // нь ЗАСНА (replaceState) — эс бол унших бvр л шинэ мөр нэмэгдэж, Safari-ийн
    // native "буцах" (товч/swipe) дарахад нvvр/дэлгэрэнгvй хуудас руу биш
    // өмнөх (аль хэдийн уншсан) бvлэг рvv буцдаг тул хэрэглэгчид "буруу
    // мангад орлоо" мэт төөрөгдөл vvсгэдэг байв.
    const chapterPathRe = /^\/manga\/(\d+)\/chapter\//;
    const oldMatch = oldPath.match(chapterPathRe);
    const newMatch = path.match(chapterPathRe);
    const sameMangaChapterNav = oldMatch && newMatch && oldMatch[1] === newMatch[1];
    if (sameMangaChapterNav) {
      window.history.replaceState(null, '', path);
    } else {
      window.history.pushState(null, '', path);
    }
  }, [computePath, routeReady]);

  // ЗАСВАР #123: browser native scroll restoration идэвхгvй болгож (тэр нь
  // хуучин, тохирохгvй болсон scroll байрлалыг сэргээж, "дундаа хаягдсан" мэт
  // харагдуулж байсан), хуудас солигдох бvрт дээшээ (0,0) шилжvvлнэ — ингэснээр
  // Буцах (native эсвэл in-app) дарахад vргэлж хуудасны эхнээс эхэлнэ.
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, selected?.id, selectedChapter?.id]);

  useEffect(() => {
    if (page !== 'detail' || !selected) return;
    // ЗАСВАР #10: манга хурдан сольход хуучин хүсэлт хожуу ирж шинэ жагсаалтыг
    // дарж бичихээс сэргийлнэ (race condition).
    let cancelled = false;
    // Энгийн хэрэглэгч зөвхөн нийтлэгдсэн, нуугдаагvй бүлгийг харна; staff бүгдийг харна
    // ЗАСВАР #119: is_hidden шvvлтvvр дутуу байсан тул "Нуух" товч дарсан ч
    // энгийн хэрэглэгчид тухайн бvлэг хэвээр харагдаж, нээгдэж байсан bug-ыг засав.
    let q = supabase.from('chapters').select('id, manga_id, chapter_number, title, label, is_vip, status, is_hidden, pending_delete, publish_at, created_at, thumbnail_url').eq('manga_id', selected.id);
    // ЗАСВАР #119: is_hidden багана хуучин бvлгvvдэд NULL байж болох тул
    // "is_hidden.eq.false"-той хамт NULL-ийг ч бас "нуугдаагvй" гэж vзнэ
    // ЗАСВАР #125: устгах хvсэлт илгээгдсэн (pending_delete) бvлгийг ч бас нуана
    if (!isStaff) q = q.eq('status', 'published').eq('pending_delete', false).or('is_hidden.is.null,is_hidden.eq.false');
    q.order('chapter_number').then(({ data }) => { if (!cancelled) setDbChapters(data || []); });
    return () => { cancelled = true; };
  }, [page, selected, isStaff]);

  // ШИНЭ: манга дэлгэрэнгүй хуудсыг нээх бүрт үзэлтийг DB талд атомаар нэмэгдүүлнэ
  // ("Бүх гаргалт" хуудсанд үзэлтээр эрэмбэлэхэд ашиглана)
  useEffect(() => {
    if (page !== 'detail' || !selected) return;
    // ЗАСВАР #120: supabase-js-ийн query builder нь "lazy thenable" тул .then()
    // дуудаагvй бол бодит HTTP хvсэлт ОГТ явдаггvй (bare дуудлага чимээгvй
    // юу ч хийдэггvй байсан) — тиймээс vзэлт бодит DB-д хэзээ ч нэмэгдэхгvй,
    // харин client талд л түр (session доторх) нэмэгдсэн мэт харагддаг байв.
    // ЗАСВАР #139: зочин (нэвтрээгvй) хэрэглэгчийг ялгах key дамжуулж, ижил
    // vзэгч давтан үзэхэд vзэлтийг дахин тоолохгvй байхаар server талд шvvнэ.
    supabase.rpc('increment_manga_views', { input_id: selected.id, viewer_key: getAnonViewerKey() })
      .then(({ error }) => { if (error) console.error('Vзэлт нэмэгдvvлэх алдаа:', error); });
    setDbMangas(prev => prev.map(m => m.id === selected.id ? { ...m, views: (m.views || 0) + 1 } : m));
    setSelected(prev => prev && prev.id === selected.id ? { ...prev, views: (prev.views || 0) + 1 } : prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selected?.id]);

  // ЗАСВАР #109: манга дэлгэрэнгүй хуудсанд орох бvрт vнэлгээ + манганы
  // ерөнхий сэтгэгдлийг татна (tab солиход дахин дуудахгvйгээр урьдчилж бэлдэнэ).
  useEffect(() => {
    if (page !== 'detail' || !selected) return;
    let cancelled = false;
    fetchMangaRatings(selected.id, () => cancelled);
    fetchMangaComments(selected.id, () => cancelled);
    setDetailTab('chapters');
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selected?.id]);

  useEffect(() => {
    if (page !== 'reader' || !selectedChapter) return;
    // ЗАСВАР #10: бүлэг хурдан сольход хуучин зураг/сэтгэгдлийн хүсэлт хожуу ирж
    // шинэ бүлгийн дээр буухаас сэргийлнэ.
    let cancelled = false;
    setChapterImages([]); // өмнөх бүлгийн зураг түр харагдахаас сэргийлнэ
    supabase.from('chapter_images').select('id, chapter_id, image_url, page_number').eq('chapter_id', selectedChapter.id).order('page_number')
      .then(({ data }) => {
        if (cancelled || !data) return;
        setChapterImages(data);
        // ЗАСВАР #141: Safari tab-ыг санамсаргvй дахин ачаалахад (жишээ нь
        // хэдэн минут нуугдсаны дараа) URL-аас зөв бvлэг рvv сэргэдэг ч
        // гvйлгэсэн байрлалаа алддаг байсныг эндvvгээр сэргээнэ.
        try {
          const savedY = sessionStorage.getItem(`reader_scroll_${selectedChapter.id}`);
          if (savedY) {
            requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, Number(savedY))));
          }
        } catch { /* Safari private mode гэх мэтэд sessionStorage хаалттай байж болно */ }
      });
    fetchComments(selectedChapter.id, () => cancelled);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selectedChapter]);

  // ЗАСВАР #113: "Юу уншихаа мэдэхгvй vv?" хуудсанд эсвэл admin "REEL НЭМЭХ" tab-д ороход reel-vvдийг татна
  useEffect(() => {
    if (page !== 'reels' && !(page === 'admin' && adminTab === 'reels')) return;
    let cancelled = false;
    fetchReels(() => cancelled);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, adminTab]);

  // ЗАСВАР #113: харагдаж буй reel-ийг л автоматаар тоглуулж, бусдыг зогсооно
  // (like дархад dbReels дахин ачаалагддаггvй тул энэ effect тоглуулалтыг тасалдуулахгvй)
  useEffect(() => {
    if (page !== 'reels' || dbReels.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.play().catch(() => {});
        else entry.target.pause();
      });
    }, { threshold: 0.6 });
    Object.values(reelVideoRefs.current).forEach(v => observer.observe(v));
    return () => observer.disconnect();
  }, [page, dbReels]);

  // ЗАСВАР #126: users_select_all policy-г (хэн ч бvх багана, тухайлбал имэйл,
  // уншиж чаддаг байсан цоорхойг) хумьсны дараа "users!user_id(...)" embed
  // зөвхөн өөрийн болон staff-ийн мөрөнд л ажиллах болсон тул, сэтгэгдэл
  // бичсэн БУСАД хэрэглэгчийн нэр/avatar-г security definer RPC
  // (get_public_profiles)-аар тусад нь татаж merge хийнэ.
  const attachAuthors = async (list) => {
    const ids = [...new Set(list.map(c => c.user_id))];
    if (ids.length === 0) return list;
    const { data } = await supabase.rpc('get_public_profiles', { user_ids: ids });
    const byId = Object.fromEntries((data || []).map(u => [u.id, u]));
    return list.map(c => ({ ...c, users: byId[c.user_id] || null }));
  };

  // ШИНЭ: сэтгэгдэл татах (нэр, avatar, like-ийн тоотой хамт)
  // isCancelled — өмнөх бүлгийн хүсэлт хожуу ирвэл state дарж бичихээс сэргийлэх (заавал биш)
  const fetchComments = (chapterId, isCancelled = () => false) => {
    // ЗАСВАР #41: comment_likes(count) aggregate embed-г хассан — энэ нь Supabase
    // төслийн "Aggregate functions" тохиргоо идэвхгүй үед (шинэ төсөлд анхны
    // тохиргоогоор идэвхгүй байдаг) query-г бүхэлд нь унагааж, "сэтгэгдэл татахад
    // алдаа гарлаа" гэсэн алдаа гаргадаг байсан. Одоо like-ийн тоог тусад нь
    // татаж, клиент талд өөрөө тоолдог болгосон — Supabase-ийн тохиргооноос үл хамаарна.
    supabase.from('comments')
      .select('id, chapter_id, user_id, content, parent_id, sticker_url, created_at')
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: false })
      .limit(200) // ЗАСВАР #118: өсөлтөд бэлтгэж хязгаартай татна
      .then(async ({ data, error }) => {
        if (isCancelled()) return;
        if (error) { console.error('Сэтгэгдэл татах алдаа:', error); notify('Алдаа: сэтгэгдэл татахад алдаа гарлаа (' + error.message + ')'); return; }
        const commentsList = await attachAuthors(data || []);
        if (isCancelled()) return;
        setComments(commentsList);
        if (commentsList.length === 0) { setCommentLikeCounts({}); setMyLikes([]); return; }
        supabase.from('comment_likes').select('comment_id').in('comment_id', commentsList.map(c => c.id))
          .then(({ data: likeRows }) => {
            if (isCancelled()) return;
            const counts = {};
            (likeRows || []).forEach(r => { counts[r.comment_id] = (counts[r.comment_id] || 0) + 1; });
            setCommentLikeCounts(counts);
          });
        // ЗАСВАР #118: өмнө нь хэрэглэгчийн САЙТ ДАЯАРХ бүх like-ийг татдаг
        // байсан — одоо зөвхөн энэ жагсаалтын сэтгэгдлүүдээр хязгаарлана.
        if (currentUser) {
          supabase.from('comment_likes').select('comment_id')
            .eq('user_id', currentUser.id)
            .in('comment_id', commentsList.map(c => c.id))
            .then(({ data: mine }) => { if (!isCancelled()) setMyLikes((mine || []).map(x => x.comment_id)); });
        }
      });
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
    if (!text && !selectedSticker) return;
    setCommentSending(true);
    const { error } = await supabase.from('comments').insert({
      chapter_id: selectedChapter.id,
      user_id: currentUser.id,
      content: text,
      parent_id: parentId,
      sticker_url: parentId ? null : selectedSticker,
    });
    setCommentSending(false);
    if (error) {
      // ЗАСВАР #163: RLS-ийн 5 секундийн rate-limit (migration_21) энд "эрх байхгvй"
      // гэсэн ерөнхий орчуулгатай ижил алдаа (violates row-level security) буцаадаг
      // тул хэрэглэгчид тодорхой (яагаад блоклогдсоноо ойлгомжтой) мессеж vзvvлнэ.
      if (/row-level security|permission denied/i.test(error.message)) {
        notify('⏳ Хэт хурдан байна — 5 секунд хvлээгээд дахин илгээнэ vv');
      } else {
        notify('Алдаа: ' + error.message);
      }
      return;
    }
    if (parentId) { setReplyText(''); setReplyTo(null); }
    else { setCommentText(''); setSelectedSticker(null); }
    fetchComments(selectedChapter.id);
  };

  // ЗАСВАР #109: манганы ерөнхий (chapter-гvй) сэтгэгдэл — bvлгийн сэтгэгдэлтэй
  // адил логиктой, гэхдээ tусдаа state ашиглана (page тус бvр дээр зэрэг
  // ажиллах шаардлагагvй ч, chapter-comment feature-ийг эвдэхгvйгээр найдвартай байлгах үvднээс).
  const fetchMangaComments = (mangaId, isCancelled = () => false) => {
    supabase.from('comments')
      .select('id, manga_id, user_id, content, parent_id, sticker_url, created_at')
      .eq('manga_id', mangaId)
      .order('created_at', { ascending: false })
      .limit(200) // ЗАСВАР #118: өсөлтөд бэлтгэж хязгаартай татна
      .then(async ({ data, error }) => {
        if (isCancelled()) return;
        if (error) { console.error('Манганы сэтгэгдэл татах алдаа:', error); return; }
        const list = await attachAuthors(data || []);
        if (isCancelled()) return;
        setMangaComments(list);
        if (list.length === 0) { setMangaCommentLikeCounts({}); setMyMangaLikes([]); return; }
        supabase.from('comment_likes').select('comment_id').in('comment_id', list.map(c => c.id))
          .then(({ data: likeRows }) => {
            if (isCancelled()) return;
            const counts = {};
            (likeRows || []).forEach(r => { counts[r.comment_id] = (counts[r.comment_id] || 0) + 1; });
            setMangaCommentLikeCounts(counts);
          });
        // ЗАСВАР #118: миний like-ийг зөвхөн энэ жагсаалтын сэтгэгдлүүдээр хязгаарлана
        if (currentUser) {
          supabase.from('comment_likes').select('comment_id')
            .eq('user_id', currentUser.id)
            .in('comment_id', list.map(c => c.id))
            .then(({ data: mine }) => { if (!isCancelled()) setMyMangaLikes((mine || []).map(x => x.comment_id)); });
        }
      });
  };

  const toggleMangaCommentLike = async (c) => {
    if (!currentUser) { setAuthPage('login'); return; }
    if (myMangaLikes.includes(c.id)) {
      await supabase.from('comment_likes').delete().eq('comment_id', c.id).eq('user_id', currentUser.id);
    } else {
      const { error } = await supabase.from('comment_likes').insert({ comment_id: c.id, user_id: currentUser.id });
      if (error) { notify('Алдаа: ' + error.message); return; }
    }
    fetchMangaComments(selected.id);
  };

  const postMangaComment = async (parentId = null, textOverride = null) => {
    if (!currentUser) { setAuthPage('login'); return; }
    const text = (textOverride !== null ? textOverride : mangaCommentText).trim();
    if (!text && !mangaSelectedSticker) return;
    setMangaCommentSending(true);
    const { error } = await supabase.from('comments').insert({
      manga_id: selected.id,
      user_id: currentUser.id,
      content: text,
      parent_id: parentId,
      sticker_url: parentId ? null : mangaSelectedSticker,
    });
    setMangaCommentSending(false);
    if (error) {
      if (/row-level security|permission denied/i.test(error.message)) {
        notify('⏳ Хэт хурдан байна — 5 секунд хvлээгээд дахин илгээнэ vv');
      } else {
        notify('Алдаа: ' + error.message);
      }
      return;
    }
    if (parentId) { setMangaReplyText(''); setMangaReplyTo(null); }
    else { setMangaCommentText(''); setMangaSelectedSticker(null); }
    fetchMangaComments(selected.id);
  };

  const deleteMangaComment = (c) => {
    askConfirm('Сэтгэгдлийг устгах уу?', async () => {
      const { error } = await supabase.from('comments').delete().eq('id', c.id);
      if (error) notify('Алдаа: ' + error.message);
      else fetchMangaComments(selected.id);
    });
  };

  const reportMangaComment = (c) => {
    if (!currentUser) { setAuthPage('login'); return; }
    setReportReasonModal({
      reason: '',
      onSubmit: async (reason) => {
        const { error } = await supabase.from('reports').insert({
          comment_id: c.id,
          reporter_id: currentUser.id,
          reason: reason || '',
        });
        if (error) notify('Алдаа: ' + error.message);
        else notify('Мэдэгдэл илгээгдлээ. Модератор шалгах болно 🚩');
      },
    });
  };

  // ЗАСВАР #109: 1-10 vнэлгээ — татах болон санал өгөх (upsert, дараа нь өөрчилж болно)
  const fetchMangaRatings = (mangaId, isCancelled = () => false) => {
    supabase.from('manga_ratings').select('user_id, score').eq('manga_id', mangaId)
      .then(({ data }) => { if (!isCancelled()) setMangaRatings(data || []); });
  };

  const submitMangaRating = async (score) => {
    if (!currentUser) { setAuthPage('login'); return; }
    setRatingSending(true);
    const { error } = await supabase.from('manga_ratings')
      .upsert({ user_id: currentUser.id, manga_id: selected.id, score, updated_at: new Date().toISOString() }, { onConflict: 'user_id,manga_id' });
    setRatingSending(false);
    if (error) { notify('Алдаа: ' + error.message); return; }
    notify('Vнэлгээ хадгалагдлаа! 🎉');
    fetchMangaRatings(selected.id);
  };

  // ЗАСВАР #113: reel-vvдийг манга мэдээлэл + like-ийн тоотой нь татна
  const fetchReels = (isCancelled = () => false) => {
    supabase.from('reels').select('id, manga_id, video_url, created_at').order('created_at', { ascending: false })
      .limit(30) // ЗАСВАР #118: өсөлтөд бэлтгэж хязгаартай татна
      .then(({ data, error }) => {
        if (isCancelled()) return;
        if (error) { console.error('Reel татах алдаа:', error); return; }
        // ЗАСВАР #122: reel feed-ийг санамсаргvй (random) дараалалтай болгов
        // (Fisher-Yates shuffle, client талд — DB талын дараалал хэвээрээ)
        const list = [...(data || [])];
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
        setDbReels(list);
        if (list.length === 0) { setReelLikeCounts({}); setMyReelLikes([]); return; }
        supabase.from('reel_likes').select('reel_id').in('reel_id', list.map(r => r.id))
          .then(({ data: likeRows }) => {
            if (isCancelled()) return;
            const counts = {};
            (likeRows || []).forEach(r => { counts[r.reel_id] = (counts[r.reel_id] || 0) + 1; });
            setReelLikeCounts(counts);
          });
        // ЗАСВАР #118: миний like-ийг зөвхөн энэ жагсаалтын reel-үүдээр хязгаарлана
        if (currentUser) {
          supabase.from('reel_likes').select('reel_id')
            .eq('user_id', currentUser.id)
            .in('reel_id', list.map(r => r.id))
            .then(({ data: mine }) => { if (!isCancelled()) setMyReelLikes((mine || []).map(x => x.reel_id)); });
        }
      });
  };

  // ЗАСВАР #113: зvрх дарах/болих — feed дэхь video-г дахин ачаалуулж тоглуулалтыг
  // тасалдуулахгvйн тулд dbReels-ийг дахин ТАТАХГVЙгээр орон нутгийн (optimistic) байдлаар шинэчилнэ
  const toggleReelLike = async (reel) => {
    if (!currentUser) { setAuthPage('login'); return; }
    const liked = myReelLikes.includes(reel.id);
    setMyReelLikes(prev => liked ? prev.filter(id => id !== reel.id) : [...prev, reel.id]);
    setReelLikeCounts(prev => ({ ...prev, [reel.id]: Math.max(0, (prev[reel.id] || 0) + (liked ? -1 : 1)) }));
    const { error } = liked
      ? await supabase.from('reel_likes').delete().eq('reel_id', reel.id).eq('user_id', currentUser.id)
      : await supabase.from('reel_likes').insert({ reel_id: reel.id, user_id: currentUser.id });
    if (error) { notify('Алдаа: ' + error.message); fetchReels(); }
  };

  // ЗАСВАР #108: профайлдаа хадгалсан 3 стикер upload/устгах
  const uploadSticker = async (slot, file) => {
    if (!currentUser || !file) return;
    const invalid = validateImageFile(file);
    if (invalid) { notify(invalid); return; }
    setStickerUploading(slot);
    const oldUrl = userProfile?.[`sticker_${slot}`];
    try {
      const ext = file.name.split('.').pop();
      const url = await uploadToR2(file, `stickers/${currentUser.id}/${slot}-${Date.now()}.${ext}`);
      const { error } = await supabase.from('users').update({ [`sticker_${slot}`]: url }).eq('id', currentUser.id);
      if (error) { notify('Алдаа: ' + error.message); } else {
        fetchProfile(currentUser.id);
        notify('Стикер нэмэгдлээ! 🎉');
        // ЗАСВАР #163: хуучин стикер файл R2-д мөнхөд орхигддог байсныг засав
        if (oldUrl) { try { await deleteFromR2([oldUrl]); } catch { /* хор хөнөөлгvй */ } }
      }
    } catch (e) {
      notify('Upload алдаа: ' + e.message);
    }
    setStickerUploading(null);
  };

  const deleteSticker = async (slot) => {
    if (!currentUser) return;
    const oldUrl = userProfile?.[`sticker_${slot}`];
    const { error } = await supabase.from('users').update({ [`sticker_${slot}`]: null }).eq('id', currentUser.id);
    if (error) { notify('Алдаа: ' + error.message); return; }
    fetchProfile(currentUser.id);
    // ЗАСВАР #163: устгасан стикерийн бодит файлыг R2-с ч мөн хасна
    if (oldUrl) { try { await deleteFromR2([oldUrl]); } catch { /* хор хөнөөлгvй */ } }
  };

  // ШИНЭ: профайл зураг (avatar) оруулах
  const uploadAvatar = async (file) => {
    if (!file || !currentUser) return;
    const invalid = validateImageFile(file);
    if (invalid) { notify(invalid); return; }
    setAvatarUploading(true);
    const oldUrl = userProfile?.avatar_url;
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
    // ЗАСВАР #163: хуучин avatar файл R2-д мөнхөд орхигддог байсныг засав
    if (oldUrl) { try { await deleteFromR2([oldUrl]); } catch { /* хор хөнөөлгvй */ } }
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

  // ЗАСВАР #125: moderator/editor-ийн устгах хvсэлт илгээсэн бvлгvvд (зөвхөн admin)
  const fetchPendingDeleteChapters = useCallback(() => {
    supabase.from('chapters').select('*, mangas(title), users!delete_requested_by(name, email)').eq('pending_delete', true).order('delete_requested_at')
      .then(({ data, error }) => { if (error) console.error('Устгах хvсэлт татах алдаа:', error); else setPendingDeleteChapters(data || []); });
  }, []);

  // ЗАСВАР #121: одоо Модератор/Эдитор эрхтэй хэрэглэгчдийг татна (эрх хураах жагсаалт)
  // ЗАСВАР #128: admin эрхтэй хэрэглэгчийг ч жагсаалтад оруулав (өмнө нь энэ
  // жагсаалт "moderator"/"editor"-оор л шvvдэг байсан тул admin эрхийг vvгээр
  // хураах боломжгvй байсан).
  const fetchStaffUsers = useCallback(() => {
    supabase.from('users').select('id, email, name, roles').overlaps('roles', ['admin', 'moderator', 'editor']).order('email')
      .then(({ data, error }) => { if (error) console.error('Staff татах алдаа:', error); else setStaffUsers(data || []); });
  }, []);

  // ЗАСВАР #163: одоо идэвхтэй (дуусаагvй) VIP эрхтэй хэрэглэгчдийг vлдсэн
  // хугацаагаар нь эрэмбэлж татна — админ хуудсанд имэйл + vлдсэн хоногийг харуулна
  const fetchVipUsers = useCallback(() => {
    supabase.from('users').select('id, email, name, vip_expires_at')
      .eq('is_vip', true)
      .order('vip_expires_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error('VIP хэрэглэгч татах алдаа:', error); return; }
        const now = Date.now();
        setVipUsers((data || []).filter(u => !u.vip_expires_at || new Date(u.vip_expires_at).getTime() > now));
      });
  }, []);

  // ЗАСВАР #163: admin-ий "📊 СТАТИСТИК" таб — цагаар идэвхжил (сvvлийн 30 хоног)
  // + сvvлийн 1 сарын хамгийн их уншигдсан 10 манга (top_manga_last_days-тэй ижил
  // өгөгдлийг ашиглана, зөвхөн admin-д харагдана).
  const fetchAnalytics = useCallback(() => {
    supabase.rpc('admin_views_by_hour', { days_back: 30 })
      .then(({ data, error }) => {
        if (error) { console.error('Цагийн статистик татах алдаа:', error); return; }
        setViewsByHour(data || []);
      });
    supabase.rpc('top_manga_last_days', { days_back: 30, result_limit: 10 })
      .then(({ data, error }) => {
        if (error) { console.error('Топ манга татах алдаа:', error); return; }
        setTopMangaMonth(data || []);
      });
  }, []);

  // ЗАСВАР #128: нэг товч дарахад moderator+editor хоёуланг зэрэг хураадаг
  // байсныг өөрчилж, эрх тус бvрийг (admin-г ч оролцуулаад) тусад нь сонгож
  // хураах боломжтой болгов.
  const revokeSingleRole = (user, role) => {
    if (user.id === currentUser?.id && role === 'admin') {
      notify('Алдаа: өөрийн Админ эрхийг өөрөө хураах боломжгүй.');
      return;
    }
    askConfirm(`${user.email} хэрэглэгчээс ${ROLE_LABELS[role] || role} эрхийг хураах уу?`, async () => {
      const newRoles = (user.roles || []).filter(r => r !== role);
      const { error } = await supabase.from('users').update({ roles: newRoles }).eq('id', user.id);
      if (error) { notify('Алдаа: ' + error.message); return; }
      notify('Эрх хураагдлаа.');
      fetchStaffUsers();
    });
  };

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
      fetchStaffUsers();
      fetchPendingDeleteChapters();
      fetchVipUsers();
      fetchAnalytics();
    }
  }, [page, isStaff, canModerate, isAdmin, fetchPending, fetchReports, fetchPaymentRequests, fetchStaffUsers, fetchPendingDeleteChapters, fetchVipUsers, fetchAnalytics]);

  // ЗАСВАР #21: тодорхой цагт (publish_at) товлогдсон бvлгvvдийг татаж,
  // хуваарийн хуудсанд манга-түвшний долоо хоногийн хуваариас гадна харуулна
  // (өмнө нь энэ хуудас зөвхөн mangas.schedule_day ашигладаг байсан тул нэг
  // өдөрт олон бүлэг товлогдсон ч харагддаггүй байсан).
  // ЗАСВАР #146: өмнө нь зөвхөн ИРЭЭДvЙН (гарч амжаагvй) бvлгvvдийг татдаг байсан
  // тул гарсны дараа шууд алга болдог байв. Одоо өнгөрсөн 3 хоног + ирээдvйн
  // 3 хоногийн (нийт 7 хоногийн) цонхыг л татна — 3 хоногоос хэтэрсэн өнгөрсөн
  // мэдээлэл автоматаар (дараагийн ачаалалтаас) харагдахгvй болно.
  useEffect(() => {
    if (page !== 'schedule') return;
    let cancelled = false;
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAhead = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    // ЗАСВАР #151: is_hidden-г ч сонгоно — эс тэгвэл нуугдсан манганы бvлэг
    // guest хэрэглэгчид "нэргvй" (ch.mangas null болж) харагдах эрсдэлтэй
    supabase.from('chapters').select('id, manga_id, chapter_number, title, label, status, is_vip, is_hidden, pending_delete, publish_at, created_at, thumbnail_url, mangas(title, poster_url, is_hidden)')
      .not('publish_at', 'is', null)
      .gte('publish_at', threeDaysAgo)
      .lte('publish_at', threeDaysAhead)
      .order('publish_at')
      .then(({ data }) => { if (!cancelled) setScheduledChapters(data || []); });
    return () => { cancelled = true; };
  }, [page]);

  // ЗАСВАР #44: нүүр хуудсанд харуулах хамгийн сүүлд нийтлэгдсэн бүлгүүд
  // (нэг манга дараалан хэдэн бүлэг гаргасан ч бүгд тусдаа карт болно)
  useEffect(() => {
    if (page !== 'home') return;
    let cancelled = false;
    supabase.from('chapters').select('id, manga_id, chapter_number, title, label, status, is_vip, is_hidden, pending_delete, publish_at, created_at, thumbnail_url, mangas(id, title, poster_url, is_hidden)')
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
      setPreviousPage(page);
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
    const nextHistory = [
      { mangaId: manga.id, chapter: chapter.chapter_number, date: Date.now() },
      ...history.filter(h => h.mangaId !== manga.id),
    ];
    setHistory(nextHistory);
    // ШИНЭ: энэ бүлгийг "уншсан" гэж тэмдэглэнэ (нэвтэрсэн бол Supabase-д,
    // ЗАСВАР #118: зочин бол localStorage-д — refresh хийхэд алга болохгүй)
    const existing = readChapters[manga.id] || [];
    const nextRead = existing.includes(chapter.chapter_number) ? existing : [...existing, chapter.chapter_number];
    setReadChapters(prev => ({ ...prev, [manga.id]: nextRead }));
    if (currentUser) {
      supabase.from('reading_progress').upsert({
        user_id: currentUser.id,
        manga_id: manga.id,
        last_chapter: chapter.chapter_number,
        read_chapters: nextRead,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,manga_id' }).then(({ error }) => { if (error) notify('Алдаа: ' + error.message); });
    } else {
      try {
        localStorage.setItem('guest_history', JSON.stringify(nextHistory));
        localStorage.setItem('guest_read_chapters', JSON.stringify({ ...readChapters, [manga.id]: nextRead }));
      } catch { /* localStorage боломжгүй үед чимээгүй өнгөрнө */ }
    }
  };

  // ШИНЭ: сэтгэгдэл устгах (өөрийн эсвэл moderator/admin)
  const deleteComment = (c) => {
    askConfirm('Сэтгэгдлийг устгах уу?', async () => {
      const { error } = await supabase.from('comments').delete().eq('id', c.id);
      if (error) notify('Алдаа: ' + error.message);
      else fetchComments(selectedChapter.id);
    });
  };

  // ШИНЭ: сэтгэгдэл report хийх
  const reportComment = (c) => {
    if (!currentUser) { setAuthPage('login'); return; }
    setReportReasonModal({
      reason: '',
      onSubmit: async (reason) => {
        const { error } = await supabase.from('reports').insert({
          comment_id: c.id,
          reporter_id: currentUser.id,
          reason: reason || '',
        });
        if (error) notify('Алдаа: ' + error.message);
        else notify('Мэдэгдэл илгээгдлээ. Модератор шалгах болно 🚩');
      },
    });
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
          <div style={{ position: 'absolute', top: 5, left: 5, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase' }}>{(STATUS_META[m.status] || DEFAULT_STATUS_META).badge}</div>
        )}
        {m.is_hidden && (
          <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.8)', color: '#f5a623', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>🥀 НУУГДСАН</div>
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

  // ШИНЭ: нүүр хэсгийн ангилал тус бүрийн манга картын хэмжээ
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
          <div key={item.p} onClick={() => { setPreviousPage(page); setPage(item.p); if (item.p === 'all') setAllCategory(null); }}
            style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 2, cursor: 'pointer', fontSize: 14, color: page === item.p ? '#fff' : '#888', background: page === item.p ? '#1a1a1a' : 'transparent', fontWeight: page === item.p ? 600 : 400, display: 'flex', alignItems: 'center', gap: 10 }}>
            {item.icon}
            {item.label}
          </div>
        ))}
        {/* ЗАСВАР #114: "Эрх авах" (VIP)-ийг эндvv зөөв, "Юу унших вэ?"-тэй байрлал сольсон */}
        <div onClick={() => { setPreviousPage(page); setPage('vip'); }}
          style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 2, cursor: 'pointer', fontSize: 14, color: page === 'vip' ? '#8B0000' : '#888', background: page === 'vip' ? '#1a1a1a' : 'transparent', fontWeight: page === 'vip' ? 600 : 400, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          Эрх авах
        </div>

        <div style={{ fontSize: 11, color: '#444', letterSpacing: 1, margin: '1.5rem 0 0.5rem', paddingLeft: 8 }}>ХЭРЭГЛЭГЧ</div>
        <div onClick={() => { setPreviousPage(page); setPage('library'); }}
          style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 2, cursor: 'pointer', fontSize: 14, color: page === 'library' ? '#fff' : '#888', background: page === 'library' ? '#1a1a1a' : 'transparent', fontWeight: page === 'library' ? 600 : 400, display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconBookmark />
          Миний сан
        </div>
        {/* ЗАСВАР #113/#114: TikTok маягийн reel feed — нэрийг "Юу унших вэ?" болгож,
            байрлалыг "Эрх авах"-тай сольсон */}
        <div onClick={() => { setPreviousPage(page); setPage('reels'); }}
          style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 2, cursor: 'pointer', fontSize: 14, color: page === 'reels' ? '#fff' : '#888', background: page === 'reels' ? '#1a1a1a' : 'transparent', fontWeight: page === 'reels' ? 600 : 400, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>
          Юу унших вэ?
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
                <button disabled={authSubmitting} onClick={async () => {
                  // ЗАСВАР #156: олон дарахад давхар хvсэлт (жишээ нь олон
                  // бvртгvvлэх имэйл) явуулахаас сэргийлж, хамгийн эхэнд шалгана
                  if (authSubmitting) return;
                  setAuthSubmitting(true);
                  if (authPage === 'register') {
                    // ЗАСВАР #160: бvртгvvлэхэд имэйл баталгаажуулах шаардлагыг Supabase
                    // Dashboard-с унтраасан (spam-д ордог асуудлаас болж) — тэгэхээр
                    // signUp шууд session-той буцаж ирнэ, тэр vед нэвтэрсэн мэт шууд
                    // хаана; хэрэв ямар нэг шалтгаанаар session ирэхгvй бол (жишээ нь
                    // тохиргоо буцаагдсан) хуучин "имэйлээ шалгана уу" мессежийг vзvvлнэ.
                    const { data, error } = await supabase.auth.signUp({
                      email: authForm.email,
                      password: authForm.password,
                      options: { data: { name: authForm.name } }
                    });
                    if (error) notify('Алдаа: ' + error.message);
                    else if (data.session) {
                      setAuthPage(null);
                      notify('Бүртгэл амжилттай! Тавтай морил 🎉');
                    } else {
                      notify('Бүртгэл амжилттай! Имэйлээ шалгана уу 📧');
                    }
                  } else {
                    const { error } = await supabase.auth.signInWithPassword({
                      email: authForm.email,
                      password: authForm.password,
                    });
                    if (error) notify('Алдаа: Нэвтрэх имэйл эсвэл нууц үг буруу байна');
                    else {
                      setAuthPage(null);
                      notify('Амжилттай нэвтэрлээ! 🎉');
                    }
                  }
                  setAuthSubmitting(false);
                }} style={{ width: '100%', background: authSubmitting ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontSize: 15, cursor: authSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 16 }}>
                  {authSubmitting ? 'ХАДГАЛЖ БАЙНА...' : (authPage === 'login' ? 'НЭВТРЭХ' : 'БҮРТГҮҮЛЭХ')}
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
                  Бүртгэлтэй имэйлээ оруулна уу. Бид танд 8 оронтой баталгаажуулах код илгээх болно.
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
                  <strong style={{ color: '#fff' }}>{authForm.email}</strong> хаяг руу илгээсэн 8 оронтой кодыг оруулна уу.
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>8 ОРОНТОЙ КОД</div>
                  <input value={resetCode} inputMode="numeric" maxLength={8}
                    onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="00000000"
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

        {/* ЗАСВАР #105: Topbar-ыг chapter уншиж байх үед нуув (reader-ийн
            өөрийн компакт header-тэй давхцаж зай дэмий эзэлдэг байсан).
            ЗАСВАР #113: reels хуудсанд ч бас нуув — бvтэн дэлгэцийн видео feed. */}
        {page !== 'reader' && page !== 'reels' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap', padding: '0.75rem 1rem', borderBottom: '1px solid #1a1a1a', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 50, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, minWidth: 0 }}>
            {isMobile && (
              <span onClick={() => setSidebarOpen(true)} style={{ cursor: 'pointer', color: '#fff', flexShrink: 0 }}>
                <IconMenu />
              </span>
            )}
            {/* ЗАСВАР #161: топбар дахь логог жоохон томруулав (34/36 → 40/44) */}
            <img src="/logo.png" alt="logo" style={{ height: isMobile ? 40 : 44, width: 'auto', maxWidth: 150, objectFit: 'contain', flexShrink: 0 }} />
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

                        {/* ЗАСВАР #108: хэрэглэгчийн 3 хvртэлх стикер (сэтгэгдэлд ашиглана)
                            ЗАСВАР #127: admin/moderator/editor эрхтэй бол 6 хvртэл */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>СТИКЕР (сэтгэгдэлд ашиглана, дээд тал нь {stickerSlots.length})</div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {stickerSlots.map(slot => {
                              const url = userProfile?.[`sticker_${slot}`];
                              return (
                                <div key={slot} style={{ position: 'relative', width: 56, height: 56 }}>
                                  {url ? (
                                    <>
                                      <img src={url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, border: '1px solid #2a2a2a' }} />
                                      <span onClick={() => deleteSticker(slot)} title="Устгах"
                                        style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#8B0000', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</span>
                                    </>
                                  ) : (
                                    <label style={{ width: 56, height: 56, borderRadius: 10, border: '1px dashed #333', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#555', fontSize: 20 }}>
                                      {stickerUploading === slot ? '…' : '+'}
                                      <input type="file" accept="image/*" style={{ display: 'none' }}
                                        onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadSticker(slot, f); }} />
                                    </label>
                                  )}
                                </div>
                              );
                            })}
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
        )}

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
            {/* ЗАСВАР #101: hero-г бүтэн-хэмжээ (edge-to-edge) биш, хvрээтэй/
                бага хэмжээтэй цэгцтэй карт болгов; доод талын цэг (dots)
                заагчийг хассан, оронд нь гар/хулгана chvvргэх (swipe/drag)
                дэмжлэг нэмэв. */}
            {heroManga && (
              <div style={{ padding: '1.25rem 1.5rem 0' }}>
                <div
                  onClick={() => goToDetail(heroManga)}
                  onTouchStart={e => { heroTouchX.current = e.touches[0].clientX; }}
                  onTouchEnd={e => {
                    if (heroTouchX.current == null || recommendedMangas.length < 2) return;
                    const delta = e.changedTouches[0].clientX - heroTouchX.current;
                    if (Math.abs(delta) > 50) {
                      if (delta < 0) setHeroIndex(prev => (prev + 1) % recommendedMangas.length);
                      else setHeroIndex(prev => (prev - 1 + recommendedMangas.length) % recommendedMangas.length);
                    }
                    heroTouchX.current = null;
                  }}
                  style={{ position: 'relative', height: isMobile ? 220 : 400, overflow: 'hidden', cursor: 'pointer', borderRadius: 16, border: '1px solid #232a38' }}>
                  {recommendedMangas.map((m, i) => (
                    <div key={m.id} style={{ position: 'absolute', inset: 0, opacity: heroIndex === i ? 1 : 0, transition: 'opacity 0.9s ease' }}>
                      <img src={m.banner_url || m.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,10,10,0.95) 15%, rgba(10,10,10,0.2) 60%, rgba(10,10,10,0.5))' }} />
                    </div>
                  ))}
                  <div style={{ position: 'absolute', bottom: '1.25rem', left: '1.5rem', right: '1.5rem', zIndex: 2 }}>
                    {/* ЗАСВАР #115: илvv загварлаг (serif) фонт, жижигрvvлсэн хэмжээ */}
                    <div style={{ fontFamily: "'Noto Serif', serif", fontStyle: 'italic', fontSize: 15, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1.3, maxWidth: 640 }}>
                      {heroManga.title}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sections — ЗАСВАР #79: захиалсан дараалал: ТҮҮХ → ШИНЭ БҮЛЭГ → ШИНЭ МАНГА → САНАЛ БОЛГОХ → ДУУССАН */}
            <div style={{ padding: '1.5rem 2rem 3rem' }}>
              {allMangas.filter(m => history.find(h => h.mangaId === m.id)).length > 0 && (
                <div style={{ marginBottom: '2.5rem' }}>
                  <SectionHeader title="ТҮҮХ" onClick={() => { setPreviousPage('home'); setAllCategory('history'); setPage('all'); }} />
                  <div className="scroll-row" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                    {allMangas.filter(m => history.find(h => h.mangaId === m.id)).map(m => <div key={m.id} style={scrollCardStyle}><MangaCard m={m} showChapter={true} /></div>)}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '2.5rem' }}>
                <SectionHeader title="ШИНЭ БҮЛЭГ" onClick={() => { setPreviousPage('home'); setAllCategory('recentChapter'); setPage('all'); }} />
                <div className="scroll-row" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                  {recentChapters
                    .filter(ch => (isStaff || (ch.mangas && !ch.mangas.is_hidden)) && (isStaff || !ch.is_hidden) && (isStaff || !ch.pending_delete) && (isStaff || !chapterLocked(ch)))
                    .map(ch => (
                      <div key={ch.id}
                        onClick={() => ch.mangas && openReader(dbMangas.find(m => m.id === ch.mangas.id) || { id: ch.mangas.id, title: ch.mangas.title, poster: ch.mangas.poster_url }, ch)}
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
                  <SectionHeader title="ШИНЭ МАНГА" onClick={() => { setPreviousPage('home'); setAllCategory('new'); setPage('all'); }} />
                  <div className="scroll-row" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                    {newMangas.map(m => <div key={m.id} style={scrollCardStyle}><MangaCard m={m} showChapter={false} /></div>)}
                  </div>
                </div>
              )}

              {/* ЗАСВАР #76: САНАЛ БОЛГОХ — admin гараар сонгосон 10 манга */}
              {curatedRecommended.length > 0 && (
                <div style={{ marginBottom: '2.5rem' }}>
                  <SectionHeader title="САНАЛ БОЛГОХ" onClick={() => { setPreviousPage('home'); setAllCategory('recommended'); setPage('all'); }} />
                  <div className="scroll-row" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                    {curatedRecommended.map(m => <div key={m.id} style={scrollCardStyle}><MangaCard m={m} showChapter={false} /></div>)}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '2.5rem' }}>
                <SectionHeader title="ДУУССАН" onClick={() => { setPreviousPage('home'); setAllCategory('finished'); setPage('all'); }} />
                <div className="scroll-row" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                  {allMangas.filter(m => m.status === 'Дууссан').map(m => <div key={m.id} style={scrollCardStyle}><MangaCard m={m} showChapter={false} /></div>)}
                </div>
              </div>
            </div>

            {/* ЗАСВАР #178: нvvр хуудасны хамгийн доод хэсэгт "бидний тухай" маягийн
                footer нэмэв — сайтын нэр + гол хуудсууд руу шилжих холбоос +
                copyright. */}
            <div style={{ marginTop: '3rem', padding: '3rem 2rem', background: '#0a0e17', textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>Roselle Manga</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
                {navItems.concat([{ label: 'Миний сан', p: 'library' }, { label: 'Эрх авах', p: 'vip' }]).map(item => (
                  <span key={item.p} onClick={() => { setPreviousPage('home'); setPage(item.p); if (item.p === 'all') setAllCategory(null); }}
                    style={{ color: '#8a92a6', fontSize: 14, cursor: 'pointer' }}>
                    {item.label}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: '2rem', color: '#4a5164', fontSize: 12 }}>
                © {new Date().getFullYear()} Roselle Manga
              </div>
            </div>
          </div>
        )}

        {/* ALL PAGE */}
        {page === 'all' && (
          <div style={{ padding: '1.5rem 2rem' }}>
            {/* ЗАСВАР #82: категорийн сумаар орж ирсэн үед хайлт/төрөл/эрэмбэ
                хэсгүүд шаардлагагүй тул зөвхөн "Бүх гаргалт"-аар (allCategory
                хоосон) орж ирсэн үед л харуулна. */}
            {!allCategory && (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
                    .filter(ch => (isStaff || (ch.mangas && !ch.mangas.is_hidden)) && (isStaff || !ch.is_hidden) && (isStaff || !ch.pending_delete) && (isStaff || !chapterLocked(ch)))
                    .map(ch => (
                      <div key={ch.id}
                        onClick={() => ch.mangas && openReader(dbMangas.find(m => m.id === ch.mangas.id) || { id: ch.mangas.id, title: ch.mangas.title, poster: ch.mangas.poster_url }, ch)}
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
                {recentChapters.filter(ch => (isStaff || (ch.mangas && !ch.mangas.is_hidden)) && (isStaff || !ch.is_hidden) && (isStaff || !ch.pending_delete) && (isStaff || !chapterLocked(ch))).length === 0 && (
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
            <SectionHeader title="ХУВААРЬ" onClick={() => {}} />

            {/* ЗАСВАР #107: манга-т гараар хуваарь тавьдаг байсан admin форм-ыг
                хассан — одоо зөвхөн "БҮЛЭГ НЭМЭХ" дэх "Гарах цаг товлох" талбараар
                л энэ хуудсанд автоматаар харагдана (dayChapters). */}

            {/* ЗАСВАР #147: 7 хоногийг доошоо 7 карт биш, comic app-vvдийн шиг
                дээшээ мөр болгож ТАБ-аар сонгодог болгов — дараалал нь хэвийн
                долоо хоногийн Даваа-с эхэлдэг дараалал хэвээрээ, гэхдээ хуудас
                нээгдэх бvрт ӨНӨӨДРИЙН таб автоматаар сонгогдоно. */}
            {/* ЗАСВАР #148: 7 таб утсан дээр ч хажуу тийш гvйлгэхгvйгээр багтаах
                зорилгоор flexShrink:0 (өргөнөө барьдаг)-ын оронд flex:1 (7-г
                тэнцvv хуваадаг) болгож, хvрээг (хэрэггvй) арилгаж, фонтыг
                нарийсгаж илvv цэвэрхэн болгов. */}
            {/* ЗАСВАР #158: "ӨНӨӨДӨР" бичвэрийг жижиг цэгээр сольж, нэрийг
                таслахгvй (хэрэгтэй бол 2 мөр болно) байдлаар тохируулав. */}
            <div style={{ display: 'flex', gap: isMobile ? 4 : 8, marginBottom: '1.25rem' }}>
              {[1, 2, 3, 4, 5, 6, 0].map(d => {
                const isToday = d === new Date().getDay();
                const isSelected = d === scheduleDay;
                return (
                  <div key={d} onClick={() => setScheduleDay(d)}
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer', padding: isMobile ? '8px 3px' : '10px 10px', borderRadius: 8, textAlign: 'center', background: isSelected ? '#8B0000' : '#0f1219' }}>
                    <div style={{ fontWeight: 600, fontSize: isMobile ? 11 : 13, color: '#fff', lineHeight: 1.25 }}>{DAYS[d]}</div>
                    {isToday && <div style={{ width: 5, height: 5, borderRadius: '50%', background: isSelected ? '#fff' : '#8B0000', margin: '5px auto 0' }} />}
                  </div>
                );
              })}
            </div>

            {(() => {
                const d = scheduleDay;
                {/* ЗАСВАР #72: schedule_day нь NULL үед Number(null) === 0 болж, хуваарьгүй
                    манга бүгд "Ням" гарагт орж ирдэг байсан алдааг засав */}
                const dayMangas = dbMangas.filter(m => m.schedule_day != null && Number(m.schedule_day) === d);
                // ЗАСВАР #21: тухайн долоо хоногт унах тодорхой цагт товлогдсон бүлгүүд
                // (scheduledChapters аль хэдийн ±3 хоногийн цонхонд хязгаарлагдсан тул
                // getDay()-ээр хуваарилах нь давхцалгvй найдвартай)
                // ЗАСВАР #151: нуугдсан манганы бvлгийг (staff-аас бусдад) харуулахгvй —
                // эс тэгвэл ch.mangas RLS-ээр null болж, гарчиг/зураггvй "хоосон" мөр харагдана
                const dayChapters = scheduledChapters.filter(ch => new Date(ch.publish_at).getDay() === d && (isStaff || (ch.mangas && !ch.mangas.is_hidden)));
                const isToday = d === new Date().getDay();
                return (
                  // ЗАСВАР #158: карт томруулж (padding нэмэгдсэн), "ӨНӨӨДӨР" бичвэрийг
                  // цэгээр сольж, гарчгийг vргэлж цагаанаар (улаанаар биш) харуулав.
                  <div style={{ background: isToday ? 'rgba(139,0,0,0.08)' : '#0f1219', border: isToday ? '1px solid rgba(139,0,0,0.4)' : '1px solid #1c2230', borderRadius: 14, padding: '1.25rem' }}>
                    <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {DAYS[d]}
                      {isToday && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#8B0000', display: 'inline-block' }} />}
                    </div>
                    {dayMangas.length === 0 && dayChapters.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#444' }}>—</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {dayMangas.map((m, i) => {
                          const next = nextScheduleDate(m.schedule_day, m.schedule_time);
                          const remainingMs = next ? next.getTime() - scheduleNowTs : null;
                          return (
                            <div key={`m${m.id}`} onClick={() => goToDetail(m)}
                              style={{ display: 'flex', gap: 14, alignItems: 'center', cursor: 'pointer', padding: '10px 0', borderTop: i > 0 ? '1px solid #1c2230' : 'none' }}>
                              <img src={m.poster} alt="" style={{ width: 56, height: 76, objectFit: 'cover', objectPosition: 'top', borderRadius: 8, border: '2px solid #000', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                                {/* ЗАСВАР #158: нэрний доор статик цагийн ("18:00") оронд, тэр
                                    ЯГ БАЙРАНД нь секунд тутам тоологддог countdown-г харуулна —
                                    баруун буланд байсан тусдаа countdown-г арилгав.
                                    ЗАСВАР #161: нэгэнт цаг нь өнгөрсөн (гарсан) бол цаг огт
                                    харуулахгvй болгов (статик цагийн fallback-ыг арилгав). */}
                                {m.schedule_time && remainingMs != null && remainingMs > 0 && (
                                  <div style={{ fontSize: 12, color: '#fff', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCountdownClock(remainingMs)}</span>
                                  </div>
                                )}
                              </div>
                              {isAdmin && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                                  <span onClick={e => { e.stopPropagation(); editMangaSchedule(m); }} title="Хуваарийг засах"
                                    style={{ fontSize: 15, color: '#ccc', cursor: 'pointer' }}>✎</span>
                                  <span onClick={e => { e.stopPropagation(); removeMangaSchedule(m); }} title="Хуваариас хасах"
                                    style={{ fontSize: 15, color: '#8B0000', cursor: 'pointer', fontWeight: 700 }}>✕</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {dayChapters.map((ch, i) => {
                          const remainingMs = new Date(ch.publish_at).getTime() - scheduleNowTs;
                          // ЗАСВАР #146: бvлэгт өөрийн гэсэн нэр (default "Бvлэг N"-ээс өөр)
                          // оруулсан бол мангeны нэр + бvлгийн дугаарын хамт харуулна
                          const hasCustomTitle = ch.title && ch.title.trim() && ch.title.trim() !== `Бvлэг ${ch.chapter_number}`;
                          return (
                            <div key={`c${ch.id}`} onClick={() => goToDetail({ id: ch.manga_id, title: ch.mangas?.title, poster: ch.mangas?.poster_url })}
                              style={{ display: 'flex', gap: 14, alignItems: 'center', cursor: 'pointer', padding: '10px 0', borderTop: (dayMangas.length > 0 || i > 0) ? '1px solid #1c2230' : 'none' }}>
                              {/* ЗАСВАР #148: тухайн бvлгийн (публик) cover зурган дээр бvлгийн
                                  дугаарыг нvvр хуудасны "ШИНЭ БvЛЭГ" мөртэй адил жижиг тэмдэг
                                  (badge)-ээр давхарлав */}
                              <div style={{ position: 'relative', width: 56, height: 76, flexShrink: 0 }}>
                                <img src={ch.thumbnail_url || ch.mangas?.poster_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', borderRadius: 8, border: '2px solid #000' }} />
                                <div style={{ position: 'absolute', top: 3, left: 3, background: '#8B0000', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4 }}>{ch.chapter_number}</div>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {/* ЗАСВАР #161: нэрний ард "— Бvлэг N" гэдгийг арилгав (дугаар нь
                                    аль хэдийн cover зурган дээрх тэмдэгт харагдаж байгаа тул давхардуулахгvй) */}
                                <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {ch.mangas?.title || 'Манга'}{hasCustomTitle ? ` · ${ch.title}` : ''}
                                </div>
                                {/* ЗАСВАР #158: нэрний доорх статик цагийн оронд секунд тутам
                                    тоологддог countdown-г шууд ЭНД харуулна
                                    ЗАСВАР #161: нэгэнт гарсан (өнгөрсөн) бол цаг огт харуулахгvй */}
                                {remainingMs > 0 && (
                                  <div style={{ fontSize: 12, color: '#fff', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCountdownClock(remainingMs)}</span>
                                  </div>
                                )}
                              </div>
                              {isAdmin && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                                  <span onClick={e => { e.stopPropagation(); openEditChapter(ch); }} title="Бvлгийг засах"
                                    style={{ fontSize: 15, color: '#ccc', cursor: 'pointer' }}>✎</span>
                                  <span onClick={e => { e.stopPropagation(); removeChapterSchedule(ch); }} title="Хуваариас хасах"
                                    style={{ fontSize: 15, color: '#8B0000', cursor: 'pointer', fontWeight: 700 }}>✕</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>
        )}

        {/* ЗАСВАР #113: "Юу уншихаа мэдэхгvй vv?" — TikTok маягийн доошоо гvйдэг reel feed */}
        {page === 'reels' && (
          <div className="reel-feed" style={{ overflowY: 'scroll', scrollSnapType: 'y mandatory', background: '#000' }}>
            <button onClick={() => setReelsMuted(m => !m)} title={reelsMuted ? 'Дуу нээх' : 'Дуу хаах'}
              style={{ position: 'fixed', top: 16, right: 16, zIndex: 3, width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer' }}>
              {reelsMuted
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
            </button>

            {dbReels.length === 0 ? (
              <div className="reel-item" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 14, scrollSnapAlign: 'start', gap: 8 }}>
                <span style={{ fontSize: 32 }}>🎬</span>
                Одоогоор reel алга байна.
              </div>
            ) : dbReels.map(reel => {
              const manga = dbMangas.find(m => m.id === reel.manga_id);
              const liked = myReelLikes.includes(reel.id);
              const likeCount = reelLikeCounts[reel.id] || 0;
              return (
                <div key={reel.id} className="reel-item" style={{ position: 'relative', scrollSnapAlign: 'start', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <video
                    ref={el => { if (el) reelVideoRefs.current[reel.id] = el; else delete reelVideoRefs.current[reel.id]; }}
                    src={reel.video_url} muted={reelsMuted} loop playsInline
                    // ЗАСВАР #143: реел дээр дарахад тоглуулах/зогсоохоос гадна дуугvй
                    // (бvгд өгөгдмөлөөр дуугvй эхэлдэг, browser-ийн autoplay
                    // бодлогын улмаас) байвал дууг нь ч нээнэ — өмнө нь зөвхөн
                    // буланд байрлах жижиг дуут дvрс дарж л дуу нээгддэг байсан.
                    onClick={e => {
                      if (reelsMuted) setReelsMuted(false);
                      e.currentTarget.paused ? e.currentTarget.play().catch(() => {}) : e.currentTarget.pause();
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', cursor: 'pointer' }} />

                  <button onClick={() => setPage('home')} title="Буцах"
                    style={{ position: 'absolute', top: 16, left: 16, width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', zIndex: 2 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>

                  <div style={{ position: 'absolute', right: 14, bottom: 110, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 2 }}>
                    <span onClick={() => toggleReelLike(reel)}
                      style={{ cursor: 'pointer', width: 46, height: 46, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill={liked ? '#e0245e' : 'none'} stroke={liked ? '#e0245e' : '#fff'} strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
                    </span>
                    <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{likeCount}</span>
                  </div>

                  {manga && (
                    <div style={{ position: 'absolute', left: 14, right: 74, bottom: 28, zIndex: 2 }}>
                      <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, marginBottom: 10, textShadow: '0 1px 4px rgba(0,0,0,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{manga.title}</div>
                      <button onClick={() => goToDetail(manga)}
                        style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '11px 40px', borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', maxWidth: 280 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                        Унших
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
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

        {/* DETAIL PAGE — ЗАСВАР #110: cover-с vvсгэсэн бvдэгрvvлсэн дэвсгэр, том
            голлосон cover, орчуулагчийн нэрийг энгийн (хvрээгvй) мөр болгож,
            3 tab-тай (Бvлгvvд / Мэдээлэл / Vнэлгээ+сэтгэгдэл) шинэ бvтэц. */}
        {page === 'detail' && selected && (
          <div>
            <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
              {/* ЗАСВАР #114: дэвсгэрт cover биш, манганы panel/banner зургийг ашиглана
                  (banner байхгvй бол л cover-с нөөцлөнө) */}
              <img src={selected.banner_url || selected.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', transform: 'scale(1.1)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(10,10,10,0.95))' }} />

              <button onClick={() => setPage(previousPage)} title="Буцах"
                style={{ position: 'absolute', top: 16, left: 16, zIndex: 5, width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', cursor: 'pointer', backdropFilter: 'blur(6px)' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>

              <button onClick={() => toggleLibrary(selected.id)}
                style={{ position: 'absolute', top: 16, right: 16, zIndex: 5, background: library.includes(selected.id) ? 'rgba(139,0,0,0.85)' : 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '8px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer', backdropFilter: 'blur(6px)', fontWeight: 700 }}>
                {library.includes(selected.id) ? '★ Хадгалсан' : '☆ Хадгалах'}
              </button>
            </div>

            {/* Голлосон том cover */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: -110, position: 'relative', zIndex: 2 }}>
              <img src={selected.poster} alt="" style={{ width: 200, height: 272, objectFit: 'cover', borderRadius: 16, boxShadow: '0 14px 36px rgba(0,0,0,0.6)', border: '3px solid #0a0a0a' }} />
            </div>

            {/* ЗАСВАР #112: гарчиг + орчуулагчдын нэрийг 3 tab-ын дээр, cover-ийн
                доор байнга харагдахаар зөөв (өмнө нь зөвхөн "Бvлгvvд" tab дотор байсан) */}
            <div style={{ textAlign: 'center', padding: '1rem 2rem 0' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{selected.title}</div>
              {(selected.admin_note || canModerate) && (
                <div style={{ marginTop: 8 }}>
                  {mangaNoteEditing ? (
                    <div style={{ background: '#111', border: '1px solid #222', borderRadius: 10, padding: 12, textAlign: 'left' }}>
                      <textarea value={mangaNoteDraft} onChange={e => setMangaNoteDraft(e.target.value)}
                        rows={2} placeholder="Орчуулагчдын нэрс (жишээ нь: Бат, Болд)..."
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
                      style={{ fontSize: 13, color: '#8a92a6', cursor: canModerate ? 'pointer' : 'default' }}>
                      {selected.admin_note || (canModerate ? '+ Орчуулагчдын нэр нэмэх' : '')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Staff vйлдлvvд — голлуулсан */}
            {(canModerate || isAdmin) && dbMangas.find(d => d.id === selected.id) && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', padding: '1rem 2rem 0' }}>
                {canModerate && (
                  <button onClick={async () => {
                    const nv = !selected.is_hidden;
                    const { error } = await supabase.from('mangas').update({ is_hidden: nv }).eq('id', selected.id);
                    if (error) { notify('Алдаа: ' + error.message); return; }
                    setSelected({ ...selected, is_hidden: nv });
                    fetchMangas();
                    notify(nv ? 'Манга нуугдлаа 🥀' : 'Манга ил боллоо 🌹');
                  }}
                    style={{ background: selected.is_hidden ? '#1e5c2e' : 'rgba(139,0,0,0.25)', color: '#fff', border: '1px solid #444', padding: '9px 20px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
                    {selected.is_hidden ? '🌹 ИЛ БОЛГОХ' : '🥀 НУУХ'}
                  </button>
                )}
                {isAdmin && (
                  <button onClick={async () => {
                    const nv = !selected.is_recommended;
                    const { error } = await supabase.from('mangas').update({ is_recommended: nv }).eq('id', selected.id);
                    if (error) { notify('Алдаа: ' + error.message); return; }
                    setSelected({ ...selected, is_recommended: nv });
                    fetchMangas();
                    notify(nv ? 'Санал болгох хэсэгт нэмэгдлээ ⭐' : 'Санал болгох хэсгээс хасагдлаа');
                  }}
                    style={{ background: selected.is_recommended ? '#8B0000' : 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '9px 20px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
                    {selected.is_recommended ? '⭐ САНАЛ БОЛГОСОН' : '☆ САНАЛ БОЛГОХ'}
                  </button>
                )}
                {canModerate && (
                  <button onClick={() => {
                    setEditMangaForm({ title: selected.title, desc: selected.desc || '', genres: selected.genres || [], status: selected.status });
                    setEditPosterFile(null);
                    setEditBannerFile(null);
                    setEditManga(selected);
                  }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '9px 20px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
                    ЗАСАХ
                  </button>
                )}
              </div>
            )}

            {/* Tab bar — Бvлгvvд / Мэдээлэл / Vнэлгээ+сэтгэгдэл */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 56, borderBottom: '1px solid #1c2230', marginTop: '1.5rem' }}>
              {[
                { key: 'chapters', icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>) },
                { key: 'info', icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>) },
                { key: 'rating', icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>) },
              ].map(t => (
                <div key={t.key} onClick={() => setDetailTab(t.key)}
                  style={{ padding: '12px 4px 10px', cursor: 'pointer', color: detailTab === t.key ? '#fff' : '#555', borderBottom: detailTab === t.key ? '2px solid #fff' : '2px solid transparent' }}>
                  {t.icon}
                </div>
              ))}
            </div>

            <div style={{ padding: '1.5rem 2rem' }}>
              {/* ЗАСВАР #110: "Бvлгvvд" tab — гарчиг + орчуулагчийн нэр (энгийн, хvрээгvй) + бvлгийн жагсаалт */}
              {detailTab === 'chapters' && (
                <>
                  {/* ЗАСВАР #112: бvлгийн тоог "БҮЛГҮҮД" гарчигт нэмэв, "N/N" тоолуурыг
                      хассан, vзэлтэнд "Vзэлт" гэсэн vг нэмэв */}
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#aaa', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#161b26', border: '1px solid #232a38', borderRadius: 20, padding: '4px 12px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8a92a6" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      Vзэлт {selected.views || 0}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#161b26', border: '1px solid #232a38', borderRadius: 20, padding: '4px 12px', color: (STATUS_META[selected.status] || DEFAULT_STATUS_META).color }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                      {selected.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 4, height: 20, background: '#8B0000', borderRadius: 2 }} />
                      <span style={{ fontWeight: 800, fontSize: 18 }}>БҮЛГҮҮД ({dbChapters.length > 0 ? dbChapters.length : selected.chapters})</span>
                    </div>
                    <div onClick={() => setChapterSort(s => s === 'asc' ? 'desc' : 'asc')}
                      style={{ background: '#161b26', border: '1px solid #232a38', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                      ⇅ {chapterSort === 'asc' ? `1-${dbChapters.length}` : `${dbChapters.length}-1`}
                    </div>
                  </div>

                  {/* ЗАСВАР #111: бvлгийн дугаараар хайх */}
                  <input value={chapterSearch} onChange={e => setChapterSearch(e.target.value)}
                    type="number" placeholder="Бvлгийн дугаараар хайх..."
                    style={{ width: '100%', background: '#161b26', border: '1px solid #232a38', borderRadius: 10, padding: '9px 14px', color: '#fff', fontSize: 13, outline: 'none', marginBottom: 14, boxSizing: 'border-box' }} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {dbChapters.length > 0 ? [...dbChapters]
                      .filter(ch => !chapterSearch.trim() || String(ch.chapter_number).includes(chapterSearch.trim()))
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
                            {ch.thumbnail_url ? (
                              <img src={ch.thumbnail_url} alt="" style={{ width: 96, height: 64, borderRadius: 12, objectFit: 'cover', objectPosition: 'top', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 96, height: 64, borderRadius: 12, background: 'rgba(139,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, color: '#8B0000', flexShrink: 0 }}>{ch.chapter_number}</div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 14, fontWeight: 500, color: '#dde1ea' }}>{ch.chapter_number}-р бүлэг</span>
                                {ch.label && (
                                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: '#f5a623', border: '1px solid rgba(245,166,35,0.4)', background: 'rgba(245,166,35,0.08)', padding: '3px 12px', borderRadius: 20 }}>{ch.label}</span>
                                )}
                                {isStaff && ch.status === 'pending' && <span style={{ fontSize: 10, color: '#f5a623', fontWeight: 700 }}>ХҮЛЭЭГДЭЖ БУЙ</span>}
                                {isStaff && ch.status === 'rejected' && <span style={{ fontSize: 10, color: '#8B0000', fontWeight: 700 }}>ТАТГАЛЗСАН</span>}
                                {isStaff && ch.is_hidden && <span style={{ fontSize: 10, color: '#888', fontWeight: 700 }}>🥀 НУУГДСАН</span>}
                                {isStaff && ch.pending_delete && <span style={{ fontSize: 10, color: '#f5a623', fontWeight: 700 }}>⏳ УСТГАХ ХvЛЭЭГДЭЖ БУЙ</span>}
                              </div>
                              <div style={{ fontSize: 12, color: locked ? '#fff' : '#6b7385', marginTop: 5, display: 'flex', gap: 10, alignItems: 'center' }}>
                                {locked ? (
                                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>⏳ {formatCountdownClock(new Date(ch.publish_at).getTime() - scheduleNowTs)}</span>
                                ) : (
                                  <span>{formatNumericDate(ch.created_at)}</span>
                                )}
                              </div>
                            </div>
                            {isLast && (
                              <div style={{ position: 'absolute', top: -8, left: 14, background: '#8B0000', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 10, letterSpacing: 0.5 }}>СҮҮЛД УНШСАН</div>
                            )}
                            {canModerate && (
                              <span onClick={(e) => { e.stopPropagation(); openEditChapter(ch); }} title="Засах"
                                style={{ fontSize: 15, cursor: 'pointer', padding: 4 }}>
                                ✏️
                              </span>
                            )}
                            {canModerate && (
                              <span onClick={async (e) => {
                                e.stopPropagation();
                                const nv = !ch.is_hidden;
                                const { error } = await supabase.from('chapters').update({ is_hidden: nv }).eq('id', ch.id);
                                if (error) { notify('Алдаа: ' + error.message); return; }
                                setDbChapters(prev => prev.map(x => x.id === ch.id ? { ...x, is_hidden: nv } : x));
                              }} title={ch.is_hidden ? 'Ил болгох' : 'Нуух'}
                                style={{ fontSize: 16, cursor: 'pointer', padding: 4 }}>
                                {ch.is_hidden ? '🌹' : '🥀'}
                              </span>
                            )}
                            {/* ЗАСВАР #125: admin шууд устгана (R2-с зурагны хамт), moderator/editor
                                зөвхөн ХvСЭЛТ vvсгэнэ — admin "УСТГАХ ХvСЭЛТ" tab-аас баталгаажуулна. */}
                            {isStaff && (
                              <span onClick={(e) => {
                                e.stopPropagation();
                                if (isAdmin) {
                                  askConfirm(`Бүлэг ${ch.chapter_number}-ийг бvрмөсөн устгах уу? Энэ vйлдлийг БУЦААХ БОЛОМЖГvЙ (зурагнууд R2-с ч устна).`, async () => {
                                    const { data: images } = await supabase.from('chapter_images').select('image_url').eq('chapter_id', ch.id);
                                    const urls = [...(images || []).map(i => i.image_url), ch.thumbnail_url].filter(Boolean);
                                    try { await deleteFromR2(urls); } catch (err) { notify('Анхаар: зарим файл R2-с устгагдсангvй (' + err.message + ').'); }
                                    await supabase.from('chapter_images').delete().eq('chapter_id', ch.id);
                                    const { error } = await supabase.from('chapters').delete().eq('id', ch.id);
                                    if (error) { notify('Алдаа: ' + error.message); return; }
                                    setDbChapters(prev => prev.filter(x => x.id !== ch.id));
                                    notify('Бүлэг бvрмөсөн устгагдлаа 🗑');
                                  });
                                } else {
                                  if (ch.pending_delete) { notify('Энэ бvлэг аль хэдийн устгах хvсэлттэй, админ шалгах хvртэл хvлээнэ vv.'); return; }
                                  askConfirm(`Бvлэг ${ch.chapter_number}-ийг устгах хvсэлт илгээх vv? Админ баталгаажуулах хvртэл хvлээгдэнэ.`, async () => {
                                    const { error } = await supabase.from('chapters').update({ pending_delete: true, delete_requested_by: currentUser.id, delete_requested_at: new Date().toISOString() }).eq('id', ch.id);
                                    if (error) { notify('Алдаа: ' + error.message); return; }
                                    setDbChapters(prev => prev.map(x => x.id === ch.id ? { ...x, pending_delete: true } : x));
                                    notify('Устгах хvсэлт илгээгдлээ. Админ баталгаажуулах хvртэл хvлээнэ vv.');
                                  });
                                }
                              }} title={ch.pending_delete ? 'Устгах хvсэлттэй' : 'Устгах'}
                                style={{ fontSize: 16, cursor: 'pointer', padding: 4, color: ch.pending_delete ? '#f5a623' : '#8B0000' }}>
                                {ch.pending_delete ? '⏳' : '🗑'}
                              </span>
                            )}
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
                </>
              )}

              {/* ЗАСВАР #111: "Мэдээлэл" tab — товч тайлбарыг хvрээтэй дөрвөлжин
                  карт болгож, талуудаас нь жигд зайтай болгов. Vзэлт/төлвийн
                  pill-vvдийг "Бvлгvvд" tab руу зөөсөн тул энд зөвхөн тайлбар+төрөл. */}
              {detailTab === 'info' && (
                <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 14, padding: '1.25rem' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 14 }}>
                    {/* ЗАСВАР #149: хvрээг бvдэг улаанаар, vсгийг цагаанаар солив
                        (өмнө нь хvрээ болон vсэг хоёул цэвэр улаан байсан) */}
                    {(selected.genres || []).map(g => (
                      <span key={g} style={{ fontSize: 11, color: '#fff', border: '1px solid rgba(139,0,0,0.4)', display: 'inline-block', padding: '2px 10px', borderRadius: 4, background: '#0a0a0a' }}>{g.toUpperCase()}</span>
                    ))}
                  </div>
                  <div style={{ color: '#bbb', fontSize: 13, lineHeight: 1.6 }}>{selected.desc}</div>
                </div>
              )}

              {/* ЗАСВАР #110: "Vнэлгээ" tab — 1-10 vнэлгээ + манганы ерөнхий сэтгэгдэл */}
              {detailTab === 'rating' && (
                <div>
                  {/* ЗАСВАР #111: 10 товчны оронд тоо бичдэг, илvv загварлаг vнэлгээний карт */}
                  <div style={{ background: 'linear-gradient(160deg, #1a1210, #111)', border: '1px solid #2a1e1a', borderRadius: 18, padding: '1.75rem 1.25rem', marginBottom: '2rem', textAlign: 'center' }}>
                    {(() => {
                      const count = mangaRatings.length;
                      const avg = count > 0 ? (mangaRatings.reduce((s, r) => s + r.score, 0) / count) : 0;
                      const myScore = mangaRatings.find(r => r.user_id === currentUser?.id)?.score || 0;
                      return (
                        <>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
                            <span style={{ fontSize: 20, color: '#f5a623' }}>★</span>
                            <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{avg.toFixed(1)}</div>
                            <span style={{ fontSize: 16, color: '#666', fontWeight: 700 }}>/ 10</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 6, marginBottom: 20 }}>{count} санал{myScore ? ` · Таны vнэлгээ: ${myScore}` : ''}</div>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                            <input type="number" min="1" max="10" value={ratingInput}
                              onChange={e => setRatingInput(e.target.value)}
                              placeholder={myScore ? String(myScore) : '1-10'}
                              style={{ width: 70, textAlign: 'center', background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, padding: '10px 0', color: '#fff', fontSize: 16, fontWeight: 700, outline: 'none' }} />
                            <button disabled={ratingSending} onClick={() => {
                              const n = Number(ratingInput);
                              if (!n || n < 1 || n > 10) { notify('1-10 хooрондох бvхэл тоо оруулна уу!'); return; }
                              submitMangaRating(n);
                              setRatingInput('');
                            }}
                              style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '11px 22px', borderRadius: 10, cursor: ratingSending ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13 }}>
                              {ratingSending ? '...' : (myScore ? 'ӨӨРЧЛӨХ' : 'ҮНЭЛЭХ')}
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
                    <div style={{ width: 4, height: 18, background: '#8B0000', borderRadius: 2 }} />
                    <span style={{ fontWeight: 800, fontSize: 15 }}>СЭТГЭГДЭЛ ({mangaComments.length})</span>
                  </div>

                  {currentUser ? (
                    <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', alignItems: 'flex-start' }}>
                      <Avatar url={userProfile?.avatar_url} letter={currentUser.email[0]} size={28} />
                      <div style={{ flex: 1 }}>
                        <textarea value={mangaCommentText} onChange={e => setMangaCommentText(e.target.value)}
                          placeholder="Энэ манганы тухай сэтгэгдлээ бичнэ vv..."
                          maxLength={2000}
                          rows={2}
                          style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 10, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                        {/* ЗАСВАР #111: профайлд хадгалсан стикерээ сэтгэгдэлдээ хавсаргах */}
                        {myStickers.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                            {myStickers.map((url, i) => (
                              <img key={i} src={url} alt="" onClick={() => setMangaSelectedSticker(prev => prev === url ? null : url)}
                                style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: mangaSelectedSticker === url ? '2px solid #8B0000' : '2px solid transparent', opacity: mangaSelectedSticker === url ? 1 : 0.6 }} />
                            ))}
                          </div>
                        )}
                        <button onClick={() => postMangaComment()} disabled={mangaCommentSending || (!mangaCommentText.trim() && !mangaSelectedSticker)}
                          style={{ marginTop: 6, background: (mangaCommentText.trim() || mangaSelectedSticker) && !mangaCommentSending ? '#8B0000' : '#222', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 8, cursor: (mangaCommentText.trim() || mangaSelectedSticker) && !mangaCommentSending ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 11 }}>
                          {mangaCommentSending ? 'ИЛГЭЭЖ БАЙНА...' : 'ИЛГЭЭХ'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 10, padding: '12px 16px', marginBottom: '1.25rem', fontSize: 12, color: '#888' }}>
                      Сэтгэгдэл бичихийн тулд <span onClick={() => setAuthPage('login')} style={{ color: '#8B0000', cursor: 'pointer', fontWeight: 700 }}>нэвтэрнэ vv</span>
                    </div>
                  )}

                  {(() => {
                    const topLevel = mangaComments.filter(c => !c.parent_id);
                    const repliesOf = (id) => mangaComments.filter(c => c.parent_id === id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                    const renderMangaComment = (c, isReply) => {
                      const likeCount = mangaCommentLikeCounts[c.id] || 0;
                      const liked = myMangaLikes.includes(c.id);
                      return (
                        <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'flex-start', marginLeft: isReply ? 32 : 0 }}>
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
                              <span style={{ fontSize: 11, color: '#6b7385' }}>{formatMnDate(c.created_at)}</span>
                              <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                                {currentUser && (c.user_id === currentUser.id || canModerate) && (
                                  <span onClick={() => deleteMangaComment(c)} title="Устгах" style={{ cursor: 'pointer', fontSize: 11, color: '#8B0000' }}>🗑</span>
                                )}
                                {currentUser && c.user_id !== currentUser.id && (
                                  <span onClick={() => reportMangaComment(c)} title="Мэдэгдэх" style={{ cursor: 'pointer', fontSize: 11, color: '#555' }}>🚩</span>
                                )}
                              </span>
                            </div>
                            {c.content && (
                              <div style={{ fontSize: 12, color: '#dde1ea', lineHeight: 1.45, whiteSpace: 'pre-wrap', marginTop: 3 }}>{c.content}</div>
                            )}
                            {c.sticker_url && (
                              <img src={c.sticker_url} alt="" onClick={() => setZoomedSticker(c.sticker_url)}
                                style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, marginTop: 6, cursor: 'zoom-in' }} />
                            )}
                            <div style={{ display: 'flex', gap: 14, marginTop: 6, alignItems: 'center' }}>
                              <span onClick={() => toggleMangaCommentLike(c)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: liked ? '#e0245e' : '#8a92a6', userSelect: 'none' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill={liked ? '#e0245e' : 'none'} stroke={liked ? '#e0245e' : '#8a92a6'} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                                {likeCount}
                              </span>
                              {!isReply && (
                                <span onClick={() => { setMangaReplyTo(mangaReplyTo === c.id ? null : c.id); setMangaReplyText(''); }}
                                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8a92a6', userSelect: 'none' }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a92a6" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                  Хариулах
                                </span>
                              )}
                            </div>
                            {mangaReplyTo === c.id && (
                              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                                <input value={mangaReplyText} onChange={e => setMangaReplyText(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') postMangaComment(c.id, mangaReplyText); }}
                                  placeholder={`${c.users?.name || 'Хэрэглэгч'}-д хариулах...`}
                                  maxLength={2000}
                                  autoFocus
                                  style={{ flex: 1, background: '#10141d', border: '1px solid #232a38', borderRadius: 10, padding: '9px 14px', color: '#fff', fontSize: 13, outline: 'none' }} />
                                <button onClick={() => postMangaComment(c.id, mangaReplyText)} disabled={!mangaReplyText.trim()}
                                  style={{ background: mangaReplyText.trim() ? '#8B0000' : '#222', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: mangaReplyText.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 12 }}>
                                  ИЛГЭЭХ
                                </button>
                              </div>
                            )}
                            <div style={{ marginTop: repliesOf(c.id).length > 0 ? 16 : 0 }}>
                              {repliesOf(c.id).map(r => renderMangaComment(r, true))}
                            </div>
                          </div>
                        </div>
                      );
                    };

                    return topLevel.length > 0 ? topLevel.map(c => renderMangaComment(c, false)) : (
                      <div style={{ color: '#555', fontSize: 13, textAlign: 'center', padding: '1.5rem 0' }}>
                        Одоогоор сэтгэгдэл алга. Анхны сэтгэгдлийг vлдээгээрэй! 💬
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIP PAGE — үнийг PLANS-аас уншина (ЗАСВАР #3). ЗАСВАР #176: хэрэглэгчийн
            өгсөн жишээ загвар (тод гарчиг + босоо жагссан радио-картууд +
            давуу тал жагсаалт + нэг "Vргэлжлvvлэх" товч)-ыг сайтын улаан
            (#8B0000) өнгийг ашиглаж дахин зохион байгуулав. */}
        {page === 'vip' && (
          <div style={{ minHeight: '100vh', background: '#050505', color: '#fff', padding: '2rem 1.25rem 3rem', boxSizing: 'border-box' }}>
            <div style={{ maxWidth: 480, margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setPage(previousPage)} title="Хаах"
                  style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 18 }}>
                  ✕
                </button>
              </div>

              <div style={{ textAlign: 'center', marginTop: 4, marginBottom: 28 }}>
                <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 32, fontWeight: 700, lineHeight: 1.3, color: '#ffd9d9' }}>
                  ЭРХ АВАХ
                </div>
                <div style={{ color: '#9aa0ac', marginTop: 14, fontSize: 14 }}>Бvх контентыг нээж, хязгааргvй уншаарай!</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {PLANS.map(plan => {
                  // ЗАСВАР #163: тухайн багц түр зуурын хямдралтай, хугацаа нь
                  // дуусаагvй бол хямдарсан vнийг vзvvлнэ (хугацаа дуусмагц
                  // автоматаар анхны vнэ рvv буцна, код дахин засах шаардлагагvй).
                  const salePrice = SALE.prices[plan.key];
                  const onSale = !!salePrice && nowTs < new Date(SALE.endsAt).getTime();
                  const toNum = s => Number(String(s).replace(/[^0-9]/g, ''));
                  const percentOff = onSale ? Math.round((1 - toNum(salePrice) / toNum(plan.price)) * 100) : 0;
                  const remainingMs = new Date(SALE.endsAt).getTime() - nowTs;
                  const days = PLAN_DAYS[plan.key] || 30;
                  const perDay = Math.round(toNum(plan.price) / days);
                  const perDaySale = onSale ? Math.round(toNum(salePrice) / days) : null;
                  const isSelected = selectedPlan === plan.key;
                  // ЗАСВАР #177: 3/6 сарын багцыг сар тутам (1 сарын багцын vнээр) тусад
                  // нь авахтай харьцуулж хэдэн хувиар хямдардгийг vзvvлнэ (SALE-той
                  // хамааралгvй, зөвхөн багцын өөрийн бvтэцийн хэмнэлт).
                  const months = Math.round(days / 30);
                  const naiveMonthlyTotal = toNum(PLANS[0].price) * months;
                  const bundleSavingsPercent = months > 1 ? Math.round((1 - toNum(plan.price) / naiveMonthlyTotal) * 100) : 0;
                  return (
                    <div key={plan.key} onClick={() => setSelectedPlan(plan.key)}
                      style={{ position: 'relative', border: isSelected ? '2px solid #8B0000' : '1px solid #2a2a2a', background: isSelected ? 'rgba(139,0,0,0.12)' : 'transparent', borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
                      {onSale && remainingMs > 0 && plan.key === PLANS[0].key && (
                        <div style={{ position: 'absolute', top: -13, left: 16, background: '#8B0000', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20, fontVariantNumeric: 'tabular-nums' }}>
                          {formatCountdownClock(remainingMs)}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', border: isSelected ? 'none' : '2px solid #555', background: isSelected ? '#8B0000' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isSelected && <IconCheck size={14} color="#fff" />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {plan.label}
                            {plan.recommended && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="#8B0000" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                            Өдрийн · ₮{(onSale ? perDaySale : perDay).toLocaleString()}
                            {onSale && <> / <span style={{ textDecoration: 'line-through' }}>₮{perDay.toLocaleString()}</span></>}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {onSale && <div style={{ color: '#ff6b6b', fontSize: 12, fontWeight: 800 }}>{percentOff}% OFF</div>}
                        {!onSale && bundleSavingsPercent > 0 && <div style={{ color: '#ff6b6b', fontSize: 12, fontWeight: 800 }}>{bundleSavingsPercent}% хэмнэнэ</div>}
                        <div style={{ fontWeight: 800, fontSize: 16, marginTop: (onSale || bundleSavingsPercent > 0) ? 4 : 0 }}>{onSale ? salePrice : plan.price}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 18 }}>
                {[
                  {
                    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B0000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>),
                    title: 'Хязгааргvй унших', desc: 'Бvх манга, манхвыг чөлөөтэй уншина',
                  },
                  {
                    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B0000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>),
                    title: 'Чанартай орчуулга', desc: 'Мэргэжлийн, ойлгомжтой орчуулгатай унших',
                  },
                  {
                    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="#8B0000" stroke="none"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z"/></svg>),
                    title: 'HD чанартай зураг', desc: 'Тод, өндөр нягтралтай хуудсаар унших',
                  },
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ lineHeight: 1, flexShrink: 0 }}>{f.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{f.title}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button disabled={!selectedPlan} onClick={() => selectedPlan && setShowPopup(true)}
                style={{ width: '100%', marginTop: 32, padding: 16, border: 'none', borderRadius: 30, background: selectedPlan ? '#8B0000' : '#333', color: '#fff', fontWeight: 800, fontSize: 15, cursor: selectedPlan ? 'pointer' : 'not-allowed' }}>
                Vргэлжлvvлэх
              </button>
            </div>
          </div>
        )}

        {/* ЗАСВАР #93: iOS Safari-ийн native scroll indicator-той давхцаж "2 тэмдэг"
            шиг харагддаг байсан тул өөрийн улаан зураасыг бүрмөсөн хассан. */}

        {/* READER PAGE — ЗАСВАР #19: 100% өргөнөөр (edge-to-edge) харагдана, ойртуулах (pinch-zoom) хориглосон */}
        {page === 'reader' && selectedChapter && (
          <div style={{ touchAction: 'pan-y pinch-zoom' }}>
            {/* ЗАСВАР #34: доошоо гүйлгэсэн ч буцах товч үргэлж хүрч болохоор
                sticky (шидэгдэж) байрлалтай болгосон — өмнө нь энгийн урсгалд
                байсан тул урт бүлгийг доош гүйлгэхэд буцах товч дэлгэцээс гарч
                дахин дээшлүүлж байж л дарж болдог байсан. */}
            {/* ЗАСВАР #70: гарчиг төвд биш, бүлгийн дугаарыг дан тоогоор баруун
                дээд буланд байрлуулав (буцах товч зүүн талдаа хэвээрээ) */}
            <div style={{ position: 'sticky', padding: '1rem', top: 0, zIndex: 60, background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transform: readerHeaderVisible ? 'translateY(0)' : 'translateY(-100%)', opacity: readerHeaderVisible ? 1 : 0, transition: 'transform 0.25s ease, opacity 0.25s ease' }}>
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
              {/* ЗАСВАР #102: zoom (томруулах/жижигрvvлэх) товч, 100%-с эхэлнэ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setReaderZoom(z => Math.max(50, z - 10))} title="Жижигрvvлэх"
                  style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>
                  −
                </button>
                <span style={{ fontSize: 11, color: '#aaa', minWidth: 34, textAlign: 'center' }}>{readerZoom}%</span>
                <button onClick={() => setReaderZoom(z => Math.min(200, z + 10))} title="Томруулах"
                  style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>
                  +
                </button>
              </div>
            </div>

            {/* ЗАСВАР #85: бүлгийн зургийг татаж авахаас сэргийлэв (right-click
                context menu + drag хоёуланг нь хориглов). 100% хамгаалалт биш
                (screenshot-с сэргийлэх боломжгүй), гэвч энгийн татаж авахыг
                нэлээд төвөгтэй болгоно. */}
            {chapterImages.length > 0 ? (
              // ЗАСВАР #118: CSS "zoom" нь стандарт бус тул Firefox болон Safari (тэр
              // дундаа iPhone) дээр огт ажилладаггvй байсан (зөвхөн Chrome/Edge дэмждэг),
              // мөн компьютер/notebook-ийн өргөн дэлгэцэд зураг ирмэг хvртэл (edge-to-edge)
              // сунаж хэт том харагддаг байсан. Одоо бvх browser дээр ажилладаг "width: %"
              // аргаар зуми хэрэгжvvлж, унших багана (720px)-аар хязгаарлав.
              <div style={{ maxWidth: 720, margin: '0 auto' }}>
                <div style={{ width: `${readerZoom}%`, margin: '0 auto' }}>
                  {/* ЗАСВАР #159: эхний 3 хуудсыг шууд (eager), vлдсэнийг lazy ачаална —
                      урт бvлэг нээхэд бvх зургийг нэг зэрэг ачаалахгvй, дэлгэц дээр
                      ойртох vед нь татдаг болгож эхний ачааллыг хурдасгав. */}
                  {chapterImages.map((img, i) => (
                    <img key={img.id} src={img.image_url} alt={`Page ${img.page_number}`}
                      loading={i < 3 ? 'eager' : 'lazy'}
                      decoding="async"
                      onContextMenu={e => e.preventDefault()}
                      draggable={false}
                      style={{ width: '100%', display: 'block', marginBottom: 0, verticalAlign: 'top', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }} />
                  ))}
                </div>
              </div>
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
                      maxLength={2000}
                      rows={2}
                      style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 10, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    {/* ЗАСВАР #108: профайлд хадгалсан стикерээ сэтгэгдэлдээ хавсаргах */}
                    {myStickers.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        {myStickers.map((url, i) => (
                          <img key={i} src={url} alt="" onClick={() => setSelectedSticker(prev => prev === url ? null : url)}
                            style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: selectedSticker === url ? '2px solid #8B0000' : '2px solid transparent', opacity: selectedSticker === url ? 1 : 0.6 }} />
                        ))}
                      </div>
                    )}
                    <button onClick={() => postComment()} disabled={commentSending || (!commentText.trim() && !selectedSticker)}
                      style={{ marginTop: 6, background: (commentText.trim() || selectedSticker) && !commentSending ? '#8B0000' : '#222', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 8, cursor: (commentText.trim() || selectedSticker) && !commentSending ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 11 }}>
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
                          {/* ЗАСВАР #104: chapter уншиж буй хуудсанд admin/moderator/editor
                              бэлгэдлийг харуулахгvй болгов */}
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
                        {c.content && (
                          <div style={{ fontSize: 12, color: '#dde1ea', lineHeight: 1.45, whiteSpace: 'pre-wrap', marginTop: 3 }}>{c.content}</div>
                        )}
                        {c.sticker_url && (
                          <img src={c.sticker_url} alt="" onClick={() => setZoomedSticker(c.sticker_url)}
                            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, marginTop: 6, cursor: 'zoom-in' }} />
                        )}
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
                              maxLength={2000}
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
                { key: 'reels', label: 'REEL НЭМЭХ', show: canModerate },
                { key: 'roles', label: 'ЭРХ ОЛГОХ', show: isAdmin },
                { key: 'vip', label: 'VIP ОЛГОХ', show: isAdmin },
                { key: 'payments', label: `ТӨЛБӨРИЙН ХҮСЭЛТ (${paymentRequests.length})`, show: isAdmin },
                { key: 'pending', label: `ХҮЛЭЭГДЭЖ БУЙ (${pendingChapters.length})`, show: canModerate },
                { key: 'deleteRequests', label: `УСТГАХ ХҮСЭЛТ (${pendingDeleteChapters.length})`, show: isAdmin },
                { key: 'reports', label: `МЭДЭГДЭЛ (${reportsList.length})`, show: canModerate },
                { key: 'analytics', label: '📊 СТАТИСТИК', show: isAdmin },
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
                <button disabled={mangaSaving} onClick={async () => {
                  // ЗАСВАР #142: олон дарахад давхар vvсгэхээс сэргийлж, хамгийн эхэнд шалгана
                  // (disabled attribute React-ийн дараагийн render хvртэл хойшлогддог тул
                  // маш хурдан давхар дарахад тvvнийг ганцаараа найдаж болохгvй).
                  if (mangaSaving) return;
                  if (!adminManga.title) { notify('Гарчиг оруулна уу!'); return; }
                  // ЗАСВАР #118: төрлийн шалгалтыг upload-ын ӨМНӨ зөөв — өмнө нь
                  // зургууд R2 руу орсны ДАРАА шалгалт унаж, орфон файл үлддэг байсан.
                  if (adminManga.genres.length === 0) { notify('Дор хаяж 1 төрөл сонгоно уу!'); return; }
                  const badFile = [posterFile, bannerFile].filter(Boolean).map(validateImageFile).find(Boolean);
                  if (badFile) { notify(badFile); return; }
                  setMangaSaving(true);
                  let posterUrl = '';
                  if (posterFile) {
                    const fileExt = posterFile.name.split('.').pop();
                    const fileName = `${Date.now()}.${fileExt}`;
                    try {
                      posterUrl = await uploadToR2(posterFile, `posters/${fileName}`);
                    } catch (uploadError) { notify('Зураг upload алдаа: ' + uploadError.message); setMangaSaving(false); return; }
                  }
                  let bannerUrl = '';
                  if (bannerFile) {
                    const fileExt = bannerFile.name.split('.').pop();
                    const fileName = `${Date.now()}-banner.${fileExt}`;
                    try {
                      bannerUrl = await uploadToR2(bannerFile, `banners/${fileName}`);
                    } catch (uploadError) { notify('Баннер upload алдаа: ' + uploadError.message); setMangaSaving(false); return; }
                  }
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
                    setAdminManga({ title: '', desc: '', genres: [], status: 'Гарч байгаа' });
                    setPosterFile(null);
                    setBannerFile(null);
                    fetchMangas(); // ЗАСВАР: жагсаалтыг шууд шинэчилнэ (өмнө нь refresh хэрэгтэй байсан)
                  }
                  setMangaSaving(false);
                }} style={{ width: '100%', background: mangaSaving ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 700, cursor: mangaSaving ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                  {mangaSaving ? 'ХАДГАЛЖ БАЙНА...' : 'НЭМЭХ'}
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
                  {/* ЗАСВАР #163: "Дууссан" төлөвтэй мангад шинэ бvлэг нэмэх шаардлагагvй тул
                      жагсаалтаас хасаж, олдоцыг хялбарчилав (мангатай олон болсноор нэр олоход хэцvv болсон). */}
                  <select value={chapterManga} onChange={e => setChapterManga(e.target.value)}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }}>
                    <option value="">-- Манга сонгох --</option>
                    {dbMangas.filter(m => m.status !== 'Дууссан').map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
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

                  {/* ЗАСВАР #163: "Бvтнээр" (өөрчлөхгvй) / "Хуваах" (4000px-ээс урт зургийг
                      тэр хэмжээгээр таслаж олон хуудас болгох) горим сонголт. */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button type="button" onClick={() => setChapterSplitMode('full')}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: chapterSplitMode === 'full' ? '1px solid #8B0000' : '1px solid #2a2a2a', background: chapterSplitMode === 'full' ? 'rgba(139,0,0,0.15)' : '#1a1a1a', color: chapterSplitMode === 'full' ? '#fff' : '#888', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Бvтнээр
                    </button>
                    <button type="button" onClick={() => setChapterSplitMode('split')}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: chapterSplitMode === 'split' ? '1px solid #8B0000' : '1px solid #2a2a2a', background: chapterSplitMode === 'split' ? 'rgba(139,0,0,0.15)' : '#1a1a1a', color: chapterSplitMode === 'split' ? '#fff' : '#888', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Хуваах (4000px)
                    </button>
                  </div>
                  {chapterSplitMode === 'split' && (
                    <div style={{ fontSize: 10, color: '#f5a623', marginBottom: 8 }}>4000px-ээс урт зураг тэр хэмжээгээр нь автоматаар олон хуудас болж хуваагдана (өргөн хэвээрээ vлдэнэ). Upload хийхэд арай удаан байж болно.</div>
                  )}

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
                          <img src={chapterFileUrls[i]} alt={`${i + 1}`} loading="lazy" decoding="async"
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
                        🖼️ БҮТНЭЭР ХАРАХ
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
                    // ЗАСВАР #142: олон дарахад давхар бvлэг vvсгэхээс сэргийлж, хамгийн эхэнд шалгана
                    // (disabled attribute React-ийн дараагийн render хvртэл хойшлогддог тул
                    // маш хурдан давхар дарахад тvvнийг ганцаараа найдаж болохгvй).
                    if (chapterUploading) return;
                    if (!chapterManga) { notify('Манга сонгоно уу!'); return; }
                    if (!chapterNumber) { notify('Бүлгийн дугаар оруулна уу!'); return; }
                    if (chapterFiles.length === 0) { notify('Зураг сонгоно уу!'); return; }
                    // ЗАСВАР #11: бүх зургийг (cover + хуудсууд) upload эхлэхээс өмнө шалгана
                    const badFile = [chapterCover, ...chapterFiles].filter(Boolean).map(validateImageFile).find(Boolean);
                    if (badFile) { notify(badFile); return; }

                    setChapterUploading(true);
                    setChapterUploadProgress(0);

                    // ЗАСВАР #163: "Хуваах" горим сонгосон бол 4000px-ээс урт зургийг
                    // upload эхлэхээс өмнө хэсэг хэсэг болгож таслана (нэг нэгээр нь,
                    // зэрэг биш — олон том зургийг зэрэг декодлож санах ойг дvvргэхээс сэргийлнэ).
                    let filesToUpload = chapterFiles;
                    if (chapterSplitMode === 'split') {
                      const expanded = [];
                      for (const f of chapterFiles) {
                        // eslint-disable-next-line no-await-in-loop
                        const parts = await splitTallImageFile(f, 4000);
                        expanded.push(...parts);
                      }
                      filesToUpload = expanded;
                    }

                    // ШИНЭ: cover (байвал) + бvх хуудасны зургийг тоолж, upload
                    // болгонд хэдэн хувь дуусаж байгааг тооцно.
                    const totalUploads = (chapterCover ? 1 : 0) + filesToUpload.length;
                    let doneUploads = 0;
                    const markUploadDone = () => {
                      doneUploads += 1;
                      setChapterUploadProgress(totalUploads > 0 ? Math.round((doneUploads / totalUploads) * 100) : 0);
                    };

                    const { data: chapterData, error: chapterError } = await supabase
                      .from('chapters')
                      .insert({
                        manga_id: chapterManga,
                        chapter_number: Number(chapterNumber),
                        title: chapterTitle || `Бүлэг ${chapterNumber}`,
                        is_vip: chapterIsVip,
                        label: chapterLabel.trim() || null,
                        // Editor-only → 'pending' (батлагдах хүртэл харагдахгүй), бусад staff → шууд нийтлэгдэнэ.
                        // ЗАСВАР #126: chapters_insert_staff RLS policy (WITH CHECK) editor-only
                        // мөрийг status='pending' биш утгаар оруулахыг сервер талд хориглодог
                        // болсон тул энд хуурч (жишээ нь Network tab-аар мутлаж) болохгүй.
                        status: editorOnly ? 'pending' : 'published',
                        publish_at: !editorOnly && chapterPublishAt ? new Date(chapterPublishAt).toISOString() : null,
                        // ЗАСВАР #163: зургууд бvгд амжилттай орох хvртэл нуугдмал байлгана —
                        // эс бол эхний секундээс "published" болоод хагас хуудастай харагдана.
                        // Бvх зураг амжилттай орсны дараа доор is_hidden:false болгоно.
                        // editorOnly-ийн хувьд status аль хэдийн 'pending' тул нэмж нуух
                        // шаардлагагvй — БОЛОХГvй ч, учир нь chapters_update_moderate RLS
                        // policy зөвхөн admin/moderator-т update зөвшөөрдөг тул editor доорх
                        // is_hidden:false update-ыг өөрөө хийж чадахгvй (чимээгvй RLS-д
                        // хориглогдож), бvлэг нь admin батласны дараа ч мөнхөд нуугдмал vлдэнэ.
                        is_hidden: editorOnly ? false : true,
                      })
                      .select()
                      .single();

                    if (chapterError) {
                      notify('Алдаа: ' + chapterError.message);
                      setChapterUploading(false);
                      return;
                    }

                    let thumbnailUrl = '';
                    let uploadFailed = false;

                    // ШИНЭ: тусдаа cover зураг оруулсан бол эхэлж upload хийнэ
                    if (chapterCover) {
                      const cExt = chapterCover.name.split('.').pop();
                      const cName = `chapters/${chapterData.id}/cover.${cExt}`;
                      try {
                        thumbnailUrl = await uploadToR2(chapterCover, cName);
                      } catch (cErr) { notify('Cover upload алдаа: ' + cErr.message); uploadFailed = true; }
                      markUploadDone();
                    }

                    for (let i = 0; i < filesToUpload.length; i++) {
                      const file = filesToUpload[i];
                      const fileExt = file.name.split('.').pop();
                      const fileName = `chapters/${chapterData.id}/${i + 1}.${fileExt}`;

                      let publicUrl;
                      try {
                        publicUrl = await uploadToR2(file, fileName);
                      } catch (uploadError) {
                        notify(`Зураг ${i + 1} upload алдаа: ` + uploadError.message);
                        uploadFailed = true;
                        markUploadDone();
                        continue;
                      }
                      markUploadDone();

                      // ЗАСВАР #63: эхний хуудсыг автоматаар thumbnail болгож хадгалдаг байсныг
                      // хассан — тэр нь дурын (санамсаргүй харагдах) хуудасны зургийг "cover"
                      // мэт харуулдаг байсан. Одоо зөвхөн admin ЗОРИУДАА оруулсан cover л
                      // thumbnail болно; оруулаагүй бол харуулах хэсэгт манга poster ашиглана.
                      const { error: imgError } = await supabase.from('chapter_images').insert({
                        chapter_id: chapterData.id,
                        image_url: publicUrl,
                        page_number: i + 1,
                      });
                      if (imgError) { notify(`Зураг ${i + 1} хадгалах алдаа: ` + imgError.message); uploadFailed = true; }
                    }

                    // ЗАСВАР #163: бvх зураг амжилттай орсон vед л ил болгоно; аль нэг нь
                    // амжилтгvй болсон бол is_hidden:true хэвээр vлдээж, admin/moderator-т л
                    // (staff тул is_hidden vл харгалзан) харагдаж дутуу хуудсаа нөхөх боломжтой байна.
                    const chapterUpdates = {};
                    if (!uploadFailed) chapterUpdates.is_hidden = false;
                    if (thumbnailUrl) chapterUpdates.thumbnail_url = thumbnailUrl;
                    if (Object.keys(chapterUpdates).length > 0) {
                      await supabase.from('chapters')
                        .update(chapterUpdates)
                        .eq('id', chapterData.id);
                    }

                    if (uploadFailed) {
                      notify('⚠️ Зарим зураг амжилтгvй боллоо — бvлгийг "нуугдсан" төлөвтэй vлдээлээ, дутуу хуудсаа chapter засварлах цэснээс нөхнө vv');
                    } else {
                      notify(editorOnly
                        ? 'Бүлэг илгээгдлээ! Модератор баталсны дараа нийтлэгдэнэ ✅'
                        : 'Бүлэг амжилттай нэмэгдлээ! 🎉');
                    }
                    setChapterManga('');
                    setChapterNumber('');
                    setChapterTitle('');
                    setChapterFiles([]);
                    setChapterCover(null);
                    setChapterIsVip(false);
                    setChapterLabel('');
                    setChapterPublishAt('');
                    setChapterUploading(false);
                    setChapterUploadProgress(0);
                  }}
                  style={{
                    width: '100%', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 700,
                    cursor: chapterUploading ? 'not-allowed' : 'pointer', fontSize: 14,
                    // ШИНЭ: upload хийж байх vед хэдэн хувь дуусснаа товч дээр
                    // өнгөөр (progress bar шиг) болон тоогоор хамт харуулна.
                    background: chapterUploading
                      ? `linear-gradient(to right, #8B0000 ${chapterUploadProgress}%, #3a3a3a ${chapterUploadProgress}%)`
                      : '#8B0000',
                  }}>
                  {chapterUploading ? `УНШИЖ БАЙНА... ${chapterUploadProgress}%` : 'БҮЛЭГ НЭМЭХ'}
                </button>
              </div>
              )}

              {/* ЗАСВАР #113: Reel нэмэх — зөвхөн admin/moderator */}
              {adminTab === 'reels' && canModerate && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e', maxWidth: 480 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                  REEL НЭМЭХ
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>МАНГА СОНГО</div>
                  <select value={adminReelManga} onChange={e => setAdminReelManga(e.target.value)}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }}>
                    <option value="">-- Манга сонгох --</option>
                    {dbMangas.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ВИДЕО ФАЙЛ</div>
                  <input type="file" accept="video/*" onChange={e => setReelVideoFile(e.target.files[0] || null)}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                  <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>1 мангад олон reel нэмж болно</div>
                </div>

                <button
                  disabled={reelUploading}
                  onClick={async () => {
                    if (!adminReelManga) { notify('Манга сонгоно уу!'); return; }
                    if (!reelVideoFile) { notify('Видео файл сонгоно уу!'); return; }
                    if (!reelVideoFile.type.startsWith('video/')) { notify('Алдаа: зөвхөн видео файл оруулна уу.'); return; }
                    setReelUploading(true);
                    let videoUrl;
                    try {
                      const ext = reelVideoFile.name.split('.').pop();
                      videoUrl = await uploadToR2(reelVideoFile, `reels/${Date.now()}.${ext}`);
                    } catch (uploadError) {
                      notify('Видео upload алдаа: ' + uploadError.message);
                      setReelUploading(false);
                      return;
                    }
                    const { error } = await supabase.from('reels').insert({
                      manga_id: adminReelManga,
                      video_url: videoUrl,
                      created_by: currentUser.id,
                    });
                    setReelUploading(false);
                    if (error) { notify('Алдаа: ' + error.message); return; }
                    notify('Reel амжилттай нэмэгдлээ! 🎉');
                    setAdminReelManga('');
                    setReelVideoFile(null);
                    fetchReels();
                  }}
                  style={{ width: '100%', background: reelUploading ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 700, cursor: reelUploading ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                  {reelUploading ? 'УНШИЖ БАЙНА...' : 'REEL НЭМЭХ'}
                </button>

                {dbReels.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>ОРУУЛСАН REEL-vvД ({dbReels.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                      {dbReels.map(reel => {
                        const manga = dbMangas.find(m => m.id === reel.manga_id);
                        return (
                          <div key={reel.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1a1a1a', borderRadius: 8, padding: '8px 10px' }}>
                            <video src={reel.video_url} muted style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 6, background: '#000', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{manga?.title || 'Манга'}</div>
                            <span onClick={() => askConfirm('Энэ reel-ийг устгах уу?', async () => {
                              const { error } = await supabase.from('reels').delete().eq('id', reel.id);
                              if (error) notify('Алдаа: ' + error.message); else fetchReels();
                            })}
                              title="Устгах"
                              style={{ cursor: 'pointer', color: '#8B0000', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✕</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
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
                  // ЗАСВАР #133: public.users.email (хэн ч өөрийн мөрөнд солиж болдог,
                  // итгэмжлэгдэхгvй багана)-ээр хайхын оронд auth.users (жинхэнэ,
                  // баталгаажсан имэйл)-ээр хайдаг security definer RPC ашиглана —
                  // эс бол халдагч өөрийн email-ээ өөр хvний имэйл рvv солиод, тэр
                  // хvнд зориулсан эрхийг өөртөө авах боломжтой байсан.
                  const { data: userData, error: userError } = await supabase
                    .rpc('admin_lookup_user_by_email', { lookup_email: adminWorkerEmail.trim() })
                    .maybeSingle();
                  // ЗАСВАР: алдааг эхэлж шалгадаг болгосон (өмнө нь дараалал буруу байсан)
                  if (userError) { notify('Алдаа: ' + userError.message); return; }
                  if (!userData) { notify('Тэр имэйлтэй хэрэглэгч олдсонгүй! Хэрэглэгч эхлээд сайтад бүртгүүлсэн байх ёстой. ' + adminWorkerEmail); return; }
                  // ЗАСВАР #129: staff эрх (admin/moderator/editor) олгохоос өмнө ижил Gmail
                  // хайрцгийн өөр бичлэгээр (цэг/+alias) өөр хэрэглэгч аль хэдийн staff
                  // эрхтэй эсэхийг шалгана — нэг хvн олон бvртгэлээр давхар staff болохоос сэргийлнэ.
                  if (adminWorkerRoles.length > 0) {
                    const targetNorm = normalizeGmailEmail(userData.email);
                    const clash = staffUsers.find(su => su.id !== userData.id && normalizeGmailEmail(su.email) === targetNorm);
                    if (clash) { notify(`Алдаа: энэ Gmail хаяг (өөр бичлэгээр: ${clash.email}) аль хэдийн staff эрхтэй байна.`); return; }
                  }
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
                    fetchStaffUsers();
                  }
                }} style={{ width: '100%', background: '#8B0000', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                  ЭРХ ОЛГОХ
                </button>

                {/* ЗАСВАР #128: admin/модератор/эдитор эрхтэй хэрэглэгчдийн жагсаалт —
                    эрх тус бvр дээрх ✕ дарж яг тэр НЭГ эрхийг л хураана (бусад эрх хэвээр vлдэнэ) */}
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>АДМИН/МОДЕРАТОР/ЭДИТОР ЭРХТЭЙ ХЭРЭГЛЭГЧИД ({staffUsers.length})</div>
                  {staffUsers.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#555' }}>Одоогоор эрхтэй хэрэглэгч алга байна.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {staffUsers.map(u => (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1a1a1a', borderRadius: 8, padding: '8px 12px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || u.email}</div>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                              {u.roles.map(r => (
                                <span key={r} onClick={() => revokeSingleRole(u, r)} title={`${ROLE_LABELS[r] || r} эрхийг хураах`}
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, color: '#8B0000', border: '1px solid #8B0000', padding: '1px 8px', borderRadius: 10, cursor: 'pointer' }}>
                                  {(ROLE_LABELS[r] || r).toUpperCase()}
                                  <span style={{ fontSize: 10 }}>✕</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '1rem', padding: '1rem', background: '#1a1a1a', borderRadius: 8, fontSize: 11, color: '#777', lineHeight: 1.7 }}>
                  💡 Мөн Supabase Dashboard → Table Editor → users хүснэгтээс role баганыг шууд засаж болно.
                </div>
              </div>
              )}

              {/* ЗАСВАР #20: VIP олгох — role-оос тусад нь, хэдэн хоногийн хугацаатай */}
              {adminTab === 'vip' && isAdmin && (
              <>
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
                    // ЗАСВАР #133: public.users.email биш, auth.users (жинхэнэ имэйл)-ээр хайна
                    const { data: userData, error: userError } = await supabase
                      .rpc('admin_lookup_user_by_email', { lookup_email: vipEmail.trim() })
                      .maybeSingle();
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
                    // ЗАСВАР #133: public.users.email биш, auth.users (жинхэнэ имэйл)-ээр хайна
                    const { data: userData, error: userError } = await supabase
                      .rpc('admin_lookup_user_by_email', { lookup_email: vipEmail.trim() })
                      .maybeSingle();
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

              {/* ЗАСВАР #163: одоо идэвхтэй VIP эрхтэй хэрэглэгчдийн жагсаалт —
                  vлдсэн хугацаагаар нь (хамгийн эрт дуусах нь эхэндээ) эрэмбэлнэ */}
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e', maxWidth: 480, marginTop: '1.5rem' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#f5a623', borderRadius: 2 }} />
                  👑 ИДЭВХТЭЙ VIP ХЭРЭГЛЭГЧИД ({vipUsers.length})
                </div>
                {vipUsers.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#555' }}>Одоогоор VIP хэрэглэгч алга</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                    {vipUsers.map(u => {
                      const daysLeft = u.vip_expires_at ? Math.max(0, Math.ceil((new Date(u.vip_expires_at).getTime() - nowTs) / 86400000)) : null;
                      return (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#1a1a1a', borderRadius: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || 'Хэрэглэгч'}</div>
                            <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#f5a623', whiteSpace: 'nowrap' }}>
                            {daysLeft === null ? 'Хугацаагvй' : `${daysLeft} хоног vлдсэн`}
                          </div>
                          <span onClick={() => askConfirm(`${u.email}-ийн VIP эрхийг цуцлах уу?`, async () => {
                            const { error } = await supabase.from('users').update({ is_vip: false, vip_expires_at: null }).eq('id', u.id);
                            if (error) { notify('Алдаа: ' + error.message); return; }
                            notify('VIP цуцлагдлаа');
                            fetchVipUsers();
                          })} title="VIP цуцлах"
                            style={{ cursor: 'pointer', color: '#8B0000', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✕</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </>
              )}

              {/* ЗАСВАР #91: "ТӨЛБӨР ТӨЛСӨН" хvсэлтvvд — admin шалгаад батлах/цуцлах */}
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
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{plan ? `${plan.label} — ${req.paid_price || plan.price}` : req.plan_key} · {formatMnDate(req.created_at)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={async () => {
                          // ЗАСВАР #163: VIP олгох + хvсэлтийг "approved" болгохыг НЭГ transaction-той
                          // security definer RPC-ээр хийнэ — эс бол хоёрын нэг нь fail болоход
                          // хvсэлт "pending" хэвээр vлдэж, дахин "БАТЛАХ" дарахад VIP давхар
                          // нэмэгдэх эрсдэлтэй байсан (RPC мөрийг түгжиж давхар батлахыг ч хориглоно).
                          const days = PLAN_DAYS[req.plan_key] || 30;
                          const { error: approveError } = await supabase.rpc('approve_payment_request', { request_id: req.id, vip_days: days });
                          if (approveError) { notify('Алдаа: ' + approveError.message); return; }
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
                        // ЗАСВАР #144: олон moderator зэрэг нэг цонхыг нээж байвал, нэг
                        // moderator шийдвэрлэсний дараа нөгөөгийнх нь жагсаалт (realtime
                        // бус тул) шинэчлэгдэхгvй хуучин хэвээрээ vлдэнэ — тэр vед
                        // хоёр дахь moderator дахин "БАТЛАХ" дарвал .eq('status','pending')
                        // нэмж шалгаж, аль хэдийн шийдвэрлэгдсэн бол давхар өөрчлөхгvй.
                        const { data, error } = await supabase.from('chapters').update({
                          status: 'published',
                          publish_at: t ? new Date(t).toISOString() : null,
                          // ЗАСВАР #163: editor upload-ын vед is_hidden:false update нь editor-т
                          // байхгvй RLS эрхээр чимээгvй бvтэлгvйтдэг байсан тул энд admin/moderator-
                          // ийн батлах vйлдэлд ч мөн адил (найдвартай байдлаар) нээж өгнө.
                          is_hidden: false,
                        }).eq('id', ch.id).eq('status', 'pending').select();
                        if (error) { notify('Алдаа: ' + error.message); return; }
                        if (!data || data.length === 0) {
                          notify('Энэ бvлгийг өөр moderator аль хэдийн шалгасан байна.');
                        } else {
                          notify(t ? `Батлагдлаа! ${formatMnDate(t)}-нд нийтлэгдэнэ 🕐` : 'Бүлэг шууд нийтлэгдлээ! ✅');
                        }
                        fetchPending();
                      }} style={{ background: '#1e5c2e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                        ✓ БАТЛАХ
                      </button>
                      <button onClick={() => askConfirm('Энэ бүлгийг татгалзах уу?', async () => {
                        const { data, error } = await supabase.from('chapters').update({ status: 'rejected' }).eq('id', ch.id).eq('status', 'pending').select();
                        if (error) { notify('Алдаа: ' + error.message); return; }
                        if (!data || data.length === 0) notify('Энэ бvлгийг өөр moderator аль хэдийн шалгасан байна.');
                        fetchPending();
                      })} style={{ background: 'rgba(139,0,0,0.2)', color: '#8B0000', border: '1px solid #8B0000', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                        ✕ ТАТГАЛЗАХ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ЗАСВАР #125: устгах хvсэлт — moderator/editor дарсан "Устгах" зөвхөн энд ирнэ, admin л бодитоор устгана */}
            {adminTab === 'deleteRequests' && isAdmin && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                  УСТГАХ ХҮСЭЛТ ({pendingDeleteChapters.length})
                </div>
                {pendingDeleteChapters.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#555' }}>Устгах хүсэлт алга ✓</div>
                ) : pendingDeleteChapters.map(ch => (
                  <div key={ch.id} style={{ padding: '12px 14px', background: '#1a1a1a', borderRadius: 10, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {ch.thumbnail_url && <img src={ch.thumbnail_url} alt="" style={{ width: 60, height: 40, borderRadius: 8, objectFit: 'cover', objectPosition: 'top' }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ch.mangas?.title || 'Манга'} — Бүлэг {ch.chapter_number}
                        </div>
                        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                          Хүссэн: {ch.users?.name || ch.users?.email || 'Хэрэглэгч'}{ch.delete_requested_at ? ` — ${formatMnDate(ch.delete_requested_at)}` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      <button onClick={() => askConfirm(`Бүлэг ${ch.chapter_number}-ийг бvрмөсөн устгах уу? Энэ vйлдлийг БУЦААХ БОЛОМЖГvЙ (зурагнууд R2-с ч устна).`, async () => {
                        const { data: images } = await supabase.from('chapter_images').select('image_url').eq('chapter_id', ch.id);
                        const urls = [...(images || []).map(i => i.image_url), ch.thumbnail_url].filter(Boolean);
                        try {
                          await deleteFromR2(urls);
                        } catch (e) {
                          notify('Анхаар: зарим файл R2-с устгагдсангvй (' + e.message + '), гэхдээ мэдээллийг vргэлжлvvлж устгана.');
                        }
                        await supabase.from('chapter_images').delete().eq('chapter_id', ch.id);
                        const { error } = await supabase.from('chapters').delete().eq('id', ch.id);
                        if (error) { notify('Алдаа: ' + error.message); return; }
                        notify('Бvлэг бvрмөсөн устгагдлаа 🗑');
                        fetchPendingDeleteChapters();
                      })} style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                        ✓ БАТАЛГААЖУУЛАХ (УСТГАХ)
                      </button>
                      <button onClick={async () => {
                        const { error } = await supabase.from('chapters').update({ pending_delete: false, delete_requested_by: null, delete_requested_at: null }).eq('id', ch.id);
                        if (error) { notify('Алдаа: ' + error.message); return; }
                        notify('Устгах хvсэлт татгалзагдлаа, бvлэг сэргэлээ ✓');
                        fetchPendingDeleteChapters();
                      }} style={{ background: 'rgba(255,255,255,0.08)', color: '#ccc', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
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
                        <button onClick={() => askConfirm('Сэтгэгдлийг устгах уу?', async () => {
                          await supabase.from('comments').delete().eq('id', r.comments.id);
                          fetchReports();
                        })} style={{ background: 'rgba(139,0,0,0.2)', color: '#8B0000', border: '1px solid #8B0000', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
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

            {/* ЗАСВАР #163: admin-ий статистик таб — цагаар идэвхжил + сvvлийн 1 сарын топ манга */}
            {adminTab === 'analytics' && isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                    🕐 ЦАГААР ИДЭВХЖИЛ (сvvлийн 30 хоног)
                  </div>
                  {viewsByHour.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#555' }}>Одоогоор өгөгдөл алга</div>
                  ) : (() => {
                    const maxCount = Math.max(...viewsByHour.map(h => Number(h.view_count)), 1);
                    const byHour = {};
                    viewsByHour.forEach(h => { byHour[h.hour_of_day] = Number(h.view_count); });
                    return (
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140 }}>
                        {Array.from({ length: 24 }, (_, h) => {
                          const count = byHour[h] || 0;
                          return (
                            <div key={h} title={`${h}:00 — ${count} vзэлт`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                              <div style={{ width: '100%', height: 100, display: 'flex', alignItems: 'flex-end' }}>
                                <div style={{ width: '100%', height: `${Math.max(2, (count / maxCount) * 100)}%`, background: count > 0 ? '#8B0000' : '#222', borderRadius: '3px 3px 0 0' }} />
                              </div>
                              <span style={{ fontSize: 8, color: '#555' }}>{h}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <div style={{ fontSize: 11, color: '#555', marginTop: 10 }}>Цаг нь Улаанбаатарын цагийн бvсээр (UTC+8)</div>
                </div>

                <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e', maxWidth: 480 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                    🔥 СvvЛИЙН 1 САРЫН ТОП МАНГА
                  </div>
                  {topMangaMonth.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#555' }}>Одоогоор өгөгдөл алга</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {topMangaMonth.map((row, i) => {
                        const m = dbMangas.find(x => x.id === row.manga_id);
                        return (
                          <div key={row.manga_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#1a1a1a', borderRadius: 8 }}>
                            <span style={{ width: 20, textAlign: 'center', fontWeight: 800, color: '#8B0000', flexShrink: 0 }}>{i + 1}</span>
                            {m?.poster && <img src={m.poster} alt="" loading="lazy" style={{ width: 32, height: 44, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
                            <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m?.title || `Манга #${row.manga_id}`}</div>
                            <div style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>{row.recent_views} vзэлт</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* POPUP — үнийг PLANS-аас уншина (ЗАСВАР #3: 6 сар одоо 25,000₮ гэж зөв гарна) */}
        {showPopup && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
            <div style={{ width: 400, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto', background: '#111', border: '1px solid #222', borderRadius: 18, padding: '1.5rem', position: 'relative', boxSizing: 'border-box' }}>

              {/* ЗАСВАР #97: буцах товч нэмэв */}
              <button onClick={() => setShowPopup(false)} title="Буцах"
                style={{ position: 'absolute', top: 14, left: 16, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span onClick={() => setShowPopup(false)} style={{ position: 'absolute', top: 14, right: 16, cursor: 'pointer', fontSize: 18, color: '#555' }}>✕</span>

              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>ТӨЛБӨРИЙН МЭДЭЭЛЭЛ</div>
                <div style={{ fontSize: 20, color: '#8B0000', marginTop: 6, fontWeight: 800 }}>
                  {(() => {
                    const p = PLANS.find(x => x.key === selectedPlan);
                    if (!p) return '';
                    // ЗАСВАР #163: түр зуурын хямдралтай vед popup дээр ч хямдарсан vнийг харуулна
                    const salePrice = SALE.prices[p.key];
                    const onSale = !!salePrice && Date.now() < new Date(SALE.endsAt).getTime();
                    return `${p.label} — ${onSale ? salePrice : p.price}`;
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

              {/* ЗАСВАР #106: санамж хэсгийг тус тусад нь мөрлөж, жигд/цэгцтэй харагдацтай болгов */}
              <div style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.4)', borderRadius: 12, padding: '14px', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#f5a623', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                  САНАМЖ
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#ccc', lineHeight: 1.5 }}>
                    <span style={{ color: '#f5a623', flexShrink: 0 }}>•</span>
                    <span>Гүйлгээний утга дээрээ <strong style={{ color: '#fff' }}>gmail хаяг, сарын дугаараа</strong> бичээрэй <span style={{ color: '#8a92a6' }}>(жишээ нь: dolgoon@gmail.com 3)</span></span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#ccc', lineHeight: 1.5 }}>
                    <span style={{ color: '#f5a623', flexShrink: 0 }}>•</span>
                    <span>Гүйлгээ хийсэн баримтаа манай page рүү явуулбал эрх илүү хурдан идэвхжинэ</span>
                  </div>
                </div>
              </div>

              {/* ЗАСВАР #91: дарахад admin-д "Төлбөр төлсөн" хүсэлт үүсгэж илгээнэ */}
              <button disabled={paymentRequestSending} onClick={async () => {
                if (!currentUser || !selectedPlan) { setShowPopup(false); return; }
                setPaymentRequestSending(true);
                // ЗАСВАР #163: хямдралын vед хvсэлт илгээхэд хэдэн төгрөгөөр төлөхийг
                // хvлээж байсныг хадгална (хямдрал дуусаад ч тvvхэнд мэдэгдэхээр)
                const planForPrice = PLANS.find(p => p.key === selectedPlan);
                const salePriceForReq = SALE.prices[selectedPlan];
                const paidPrice = (!!salePriceForReq && Date.now() < new Date(SALE.endsAt).getTime())
                  ? salePriceForReq
                  : planForPrice?.price;
                const { error } = await supabase.from('payment_requests').insert({ user_id: currentUser.id, plan_key: selectedPlan, paid_price: paidPrice });
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
              <button onClick={() => { setChapterPreviewOpen(false); closeChapterEdit(); }} title="Буцах"
                style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Урьдчилан харах ({chapterFiles.length} зураг)</div>
              {/* ЗАСВАР #127: жинхэнэ уншигчийн хуудастай адил zoom товч нэмэв —
                  өмнө нь энэ цонхонд zoom огт байгаагvй тул "zoom ажиллахгvй байна"
                  гэж харагддаг байсан (бодит уншигчийн хуудсанд байдаг readerZoom
                  state-ийг хамт ашигладаг тул хоёр газар зэрэг тохирсон хэвээр байна). */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setReaderZoom(z => Math.max(50, z - 10))} title="Жижигрvvлэх"
                  style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>
                  −
                </button>
                <span style={{ fontSize: 11, color: '#aaa', minWidth: 34, textAlign: 'center' }}>{readerZoom}%</span>
                <button onClick={() => setReaderZoom(z => Math.min(200, z + 10))} title="Томруулах"
                  style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>
                  +
                </button>
              </div>
            </div>
            <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: chapterEditIndex !== null ? 90 : 0 }}>
              <div style={{ width: `${readerZoom}%`, margin: '0 auto' }}>
                {chapterFiles.map((file, i) => {
                  const isSelected = chapterEditIndex === i;
                  if (isSelected && chapterCropActive) {
                    return (
                      <div key={i} ref={chapterCropFrameRef} onPointerDown={startChapterCropPanDrag}
                        style={{ position: 'relative', zIndex: 2, width: '100%', height: '60vh', overflow: 'hidden', background: '#000', touchAction: 'none', cursor: 'grab', border: '3px solid #f5a623', boxSizing: 'border-box' }}>
                        <img ref={chapterCropImgRef} src={chapterFileUrls[i]} alt={`${i + 1}`} draggable={false}
                          style={{ position: 'absolute', left: 0, top: chapterCropPanY, width: `${100 * chapterCropZoom}%`, opacity: chapterCropBusy ? 0.4 : 1 }} />
                        <div style={{ position: 'absolute', left: '50%', top: 10, transform: 'translateX(-50%)', pointerEvents: 'none', width: 32, height: 32, borderRadius: '50%', background: '#f5a623', boxShadow: '0 1px 6px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {chapterCropDragging ? <IconCheck size={16} color="#000" /> : <IconPencil size={14} color="#000" />}
                        </div>
                        <div style={{ position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)', pointerEvents: 'none', width: 32, height: 32, borderRadius: '50%', background: '#f5a623', boxShadow: '0 1px 6px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {chapterCropDragging ? <IconCheck size={16} color="#000" /> : <IconPencil size={14} color="#000" />}
                        </div>
                      </div>
                    );
                  }
                  if (isSelected) {
                    return (
                      <div key={i} style={{ position: 'relative', zIndex: 2, border: '3px solid #f5a623', boxSizing: 'border-box' }}>
                        <img src={chapterFileUrls[i]} alt={`${i + 1}`} style={{ width: '100%', display: 'block', opacity: chapterEditBusy ? 0.4 : 1 }} />
                      </div>
                    );
                  }
                  return (
                    <div key={i} onClick={() => setChapterEditIndex(i)} style={{ position: 'relative', cursor: 'pointer' }}>
                      <img src={chapterFileUrls[i]} alt={`${i + 1}`} loading="lazy" decoding="async"
                        style={{ width: '100%', display: 'block', verticalAlign: 'top' }} />
                      <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.65)', color: '#fff', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconPencil size={13} color="#fff" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ЗАСВАР #164: доод талд бэхлэгдсэн action bar — тусдаа цонх нээгдэхгvй,
                зөвхөн зураг сонгогдсон vед л гарч ирнэ. */}
            {chapterEditIndex !== null && (
              <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(6px)', borderTop: '1px solid #1e1e1e', padding: '1rem' }}>
                {chapterCropActive && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
                    <button onClick={() => changeChapterCropZoom(-0.1)} title="Жижигрvvлэх"
                      style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#ccc', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>−</button>
                    <span style={{ fontSize: 11, color: '#aaa', minWidth: 40, textAlign: 'center' }}>{Math.round(chapterCropZoom * 100)}%</span>
                    <button onClick={() => changeChapterCropZoom(0.1)} title="Томруулах"
                      style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#ccc', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>+</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                  <button disabled={chapterEditBusy || chapterEditIndex === 0} onClick={() => moveChapterEditImage(-1)} title="Дээш"
                    style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #2a2a2a', background: '#1a1a1a', color: chapterEditIndex === 0 ? '#444' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: chapterEditIndex === 0 ? 'not-allowed' : 'pointer' }}>
                    <IconChevronUp />
                  </button>
                  <button disabled={chapterEditBusy || chapterEditIndex === chapterFiles.length - 1} onClick={() => moveChapterEditImage(1)} title="Доош"
                    style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #2a2a2a', background: '#1a1a1a', color: chapterEditIndex === chapterFiles.length - 1 ? '#444' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: chapterEditIndex === chapterFiles.length - 1 ? 'not-allowed' : 'pointer' }}>
                    <IconChevronDown />
                  </button>
                  <button disabled={chapterEditBusy} onClick={() => chapterReplaceInputRef.current?.click()} title="Солих"
                    style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <IconImage />
                  </button>
                  <input ref={chapterReplaceInputRef} type="file" accept="image/*" onChange={handleChapterReplaceFile} style={{ display: 'none' }} />
                  <button disabled={chapterEditBusy} onClick={() => askConfirm('Энэ хуудсыг устгах уу?', deleteChapterEditImage)} title="Устгах"
                    style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #8B0000', background: 'rgba(139,0,0,0.15)', color: '#ff6b6b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <IconTrash />
                  </button>
                  <button disabled={chapterCropBusy} onClick={chapterCropActive ? confirmChapterCrop : openChapterCrop} title="Тайрах"
                    style={{ width: 38, height: 38, borderRadius: 8, border: chapterCropActive ? '1px solid #f5a623' : '1px solid #2a2a2a', background: chapterCropActive ? 'rgba(245,166,35,0.15)' : '#1a1a1a', color: chapterCropActive ? '#f5a623' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <IconCrop />
                  </button>
                  <button disabled={chapterEditBusy} onClick={() => { setChapterPreviewOpen(false); closeChapterEdit(); }}
                    style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#8B0000', color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <IconCheck size={15} /> Хадгалах
                  </button>
                </div>
              </div>
            )}
          </div>
        )}


        {/* ЗАСВАР #130: устгах хvсэлттэй холбоотой баталгаажуулах цонх (window.confirm-ийн оронд).
            ЗАСВАР #163: zIndex-ийг бусад бvх fixed overlay-с (жишээ нь "Бvтэн харах" preview,
            zIndex:1000) ДЭЭГvvР болгов — өмнө нь тэдэнтэй ижил 1000 байсан тул DOM дараалал
            дараа ирдэг preview overlay-ийн ард нуугдаж, "Тийм" батлах товч харагдахгvй,
            дарагдахгvй болж, устгах vйлдэл огт хэрэгжихгvй байдалд хvргэдэг байв. */}
        {confirmModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
            <div style={{ width: 380, maxWidth: '100%', background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.75rem', boxSizing: 'border-box' }}>
              <div style={{ fontSize: 14, color: '#eee', lineHeight: 1.5, marginBottom: '1.5rem', whiteSpace: 'pre-line' }}>{confirmModal.message}</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmModal(null)}
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#ccc', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                  Болих
                </button>
                <button onClick={() => { const fn = confirmModal.onConfirm; setConfirmModal(null); fn(); }}
                  style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                  Тийм
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ЗАСВАР #163: манганы 7 хоног бvрийн хуваарь засах цонх (window.prompt-ийн оронд) */}
        {scheduleEditModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div style={{ width: 340, maxWidth: '100%', background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.75rem', boxSizing: 'border-box' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: '1.25rem' }}>"{scheduleEditModal.manga.title}" — хуваарь засах</div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>ӨДӨР</div>
                <select value={scheduleEditModal.day} onChange={e => setScheduleEditModal(prev => ({ ...prev, day: e.target.value }))}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>ЦАГ (ЦЦ:ММ, жишээ нь 18:30)</div>
                <input value={scheduleEditModal.time} onChange={e => setScheduleEditModal(prev => ({ ...prev, time: e.target.value }))}
                  placeholder="18:30"
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setScheduleEditModal(null)}
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#ccc', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                  Болих
                </button>
                <button onClick={saveMangaSchedule}
                  style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                  Хадгалах
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ЗАСВАР #163: сэтгэгдэл мэдэгдэх шалтгаан бичих цонх (window.prompt-ийн оронд) */}
        {reportReasonModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div style={{ width: 380, maxWidth: '100%', background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.75rem', boxSizing: 'border-box' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>🚩 Мэдэгдэх шалтгаан</div>
              <textarea value={reportReasonModal.reason} onChange={e => setReportReasonModal(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Шалтгаанаа бичнэ vv (заавал биш)" rows={3}
                style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: '1.5rem', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setReportReasonModal(null)}
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#ccc', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                  Болих
                </button>
                <button onClick={() => { const fn = reportReasonModal.onSubmit; const reason = reportReasonModal.reason; setReportReasonModal(null); fn(reason); }}
                  style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                  Илгээх
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ЗАСВАР #150: "Smut" төрөлтэй манганд зориулсан 18+ анхааруулга */}
        {smutWarningOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div style={{ width: 400, maxWidth: '100%', background: '#111', border: '1px solid #2a2a2a', borderRadius: 18, padding: '2rem', boxSizing: 'border-box', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔞</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>18+ Насны хязгаарлалт</div>
              <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6, marginBottom: '1.75rem' }}>
                Энэ манга насанд хvрэгчдэд (18+) зориулсан хэсэн агуулсан байж болзошгvй.
                Хэрэв насанд хvрээгvй бол цааш vзэхийг зөвлөхгvй. Үvнээс vvдэх
               vр дагаварт сайт хариуцлага хvлээхгvй.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => {
                  // ЗАСВАР #152: selected-ийг null болгодог байсныг хассан —
                  // хэрэв previousPage нь 'detail' байвал (өөр манга хуудаснаас
                  // энд орсон vед) page='detail' + selected=null гэсэн эвдэрсэн
                  // төлөвт орж, "мэдээлэл дутуу" манга хуудас харагддаг байсан.
                  // Бусад "Буцах" товчнуудтай адил зөвхөн page-г л сэргээнэ.
                  setSmutWarningOpen(false);
                  setPage(previousPage);
                }} style={{ flex: 1, background: 'rgba(255,255,255,0.08)', color: '#ccc', border: '1px solid rgba(255,255,255,0.15)', padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  БУЦАХ
                </button>
                <button onClick={() => {
                  try { localStorage.setItem('smut_warning_ack', '1'); } catch { /* хаалттай vед зөвхөн энэ удаад л зөвшөөрнө */ }
                  setSmutWarningOpen(false);
                }} style={{ flex: 1, background: '#8B0000', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  ОЙЛГОЛОО
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ЗАСВАР #117: сэтгэгдэл дэх стикер зургийг дарж томруулж vзэх (lightbox) */}
        {zoomedSticker && (
          <div onClick={() => setZoomedSticker(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 24, cursor: 'zoom-out' }}>
            <img src={zoomedSticker} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12 }} />
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
                // ЗАСВАР #118: төрлийн шалгалтыг setEditSaving(true)-ийн ӨМНӨ зөөв —
                // өмнө нь шалгалт унахад editSaving true хэвээр үлдэж, товч
                // "ХАДГАЛЖ БАЙНА..." дээр үүрд гацдаг байсан.
                if (editMangaForm.genres.length === 0) { notify('Дор хаяж 1 төрөл сонгоно уу!'); return; }
                setEditSaving(true);
                const updates = {
                  title: editMangaForm.title,
                  description: editMangaForm.desc,
                  genres: editMangaForm.genres,
                  status: editMangaForm.status,
                };
                if (editPosterFile) {
                  const fileExt = editPosterFile.name.split('.').pop();
                  const fileName = `${Date.now()}.${fileExt}`;
                  const oldPosterUrl = editManga.poster;
                  try {
                    updates.poster_url = await uploadToR2(editPosterFile, `posters/${fileName}`);
                  } catch (upErr) { notify('Poster upload алдаа: ' + upErr.message); setEditSaving(false); return; }
                  // ЗАСВАР #163: poster солиход хуучин файл R2-д мөнхөд орхигддог байсныг засав
                  if (oldPosterUrl) { try { await deleteFromR2([oldPosterUrl]); } catch { /* хор хөнөөлгvй */ } }
                }
                if (editBannerFile) {
                  const fileExt = editBannerFile.name.split('.').pop();
                  const fileName = `${Date.now()}-banner.${fileExt}`;
                  const oldBannerUrl = editManga.banner_url;
                  try {
                    updates.banner_url = await uploadToR2(editBannerFile, `banners/${fileName}`);
                  } catch (upErr) { notify('Баннер upload алдаа: ' + upErr.message); setEditSaving(false); return; }
                  if (oldBannerUrl) { try { await deleteFromR2([oldBannerUrl]); } catch { /* хор хөнөөлгvй */ } }
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

        {/* ЗАСВАР #124: БҮЛЭГ ЗАСАХ цонх — cover зураг солих, хуудсын зураг нэмэх/хасах/дараалал солих */}
        {editChapter && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }}>
            <div style={{ width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#111', border: '1px solid #222', borderRadius: 20, padding: '2rem', position: 'relative', boxSizing: 'border-box' }}>
              <span onClick={() => setEditChapter(null)} style={{ position: 'absolute', top: 16, right: 20, cursor: 'pointer', fontSize: 20, color: '#555' }}>✕</span>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: '1.5rem' }}>БҮЛЭГ ЗАСАХ</div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БҮЛГИЙН ДУГААР</div>
                  <input type="number" value={editChapterForm.chapter_number} onChange={e => setEditChapterForm({ ...editChapterForm, chapter_number: e.target.value })}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БҮЛГИЙН НЭР</div>
                  <input value={editChapterForm.title} onChange={e => setEditChapterForm({ ...editChapterForm, title: e.target.value })}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ТЭМДЭГЛЭГЭЭ (заавал биш, жишээ нь: S1 END)</div>
                <input value={editChapterForm.label} onChange={e => setEditChapterForm({ ...editChapterForm, label: e.target.value })}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 13, color: '#aaa' }}>
                <input type="checkbox" checked={editChapterForm.is_vip} onChange={e => setEditChapterForm({ ...editChapterForm, is_vip: e.target.checked })}
                  style={{ accentColor: '#8B0000', width: 16, height: 16 }} />
                VIP бүлэг (зөвхөн эрхтэй хэрэглэгч уншина)
              </label>

              {/* ЗАСВАР #145: гарах цагийг эндээс ч засаж болно. Хэрэв цагийг
                  өөрчилвөл, хадгалахад бvлэг шинээр нэмэгдсэн мэт "ШИНЭ БvЛЭГ"
                  мөрөнд дахин гарна (created_at нь "одоо" болж шинэчлэгдэнэ). */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ГАРАХ ЦАГ (заавал биш — өөрчилбол "ШИНЭ БvЛЭГ" мөрөнд дахин гарна)</div>
                <input type="datetime-local" value={editChapterForm.publish_at} onChange={e => setEditChapterForm({ ...editChapterForm, publish_at: e.target.value })}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', colorScheme: 'dark', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>COVER ЗУРАГ (заавал биш — солихгvй бол хуучнаараа vлдэнэ)</div>
                {editChapter.thumbnail_url && (
                  <img src={editChapter.thumbnail_url} alt="" style={{ width: 76, height: 102, objectFit: 'cover', borderRadius: 8, marginBottom: 8, display: 'block', border: '1px solid #2a2a2a' }} />
                )}
                <input type="file" accept="image/*" onChange={e => setEditChapterCoverFile(e.target.files[0] || null)}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: '#888' }}>ОДОО БАЙГАА ЗУРАГНУУД ({editChapterExistingImages.length})</div>
                  {/* ЗАСВАР #161: нэмэх цонхны adил бvтэн харах (preview) товч */}
                  {(editChapterExistingImages.length > 0 || editChapterNewFiles.length > 0) && (
                    <button onClick={() => setEditChapterPreviewOpen(true)}
                      style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      🖼️ БҮТЭН ХАРАХ
                    </button>
                  )}
                </div>
                {editChapterExistingImages.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, maxHeight: 260, overflowY: 'auto', padding: 4, background: '#0d0d0d', borderRadius: 8 }}>
                    {editChapterExistingImages.map((img, i) => (
                      <div key={img.id} style={{ position: 'relative', width: 76 }}>
                        <img src={img.image_url} alt={`${i + 1}`} loading="lazy" decoding="async" style={{ width: 76, height: 102, objectFit: 'cover', borderRadius: 8, border: '1px solid #2a2a2a', display: 'block' }} />
                        <div style={{ position: 'absolute', top: 3, left: 3, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4 }}>{i + 1}</div>
                        <span onClick={() => setEditChapterExistingImages(prev => prev.filter((_, idx) => idx !== i))}
                          title="Устгах"
                          style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(139,0,0,0.9)', color: '#fff', fontSize: 11, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, gap: 4 }}>
                          <span onClick={() => i > 0 && setEditChapterExistingImages(prev => { const arr = [...prev]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; return arr; })}
                            title="Зvvн тийш зөөх"
                            style={{ flex: 1, textAlign: 'center', cursor: i > 0 ? 'pointer' : 'default', opacity: i > 0 ? 1 : 0.25, fontSize: 12, color: '#ccc', padding: '3px 0', background: '#1a1a1a', borderRadius: 4 }}>◀</span>
                          <span onClick={() => i < editChapterExistingImages.length - 1 && setEditChapterExistingImages(prev => { const arr = [...prev]; [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; return arr; })}
                            title="Баруун тийш зөөх"
                            style={{ flex: 1, textAlign: 'center', cursor: i < editChapterExistingImages.length - 1 ? 'pointer' : 'default', opacity: i < editChapterExistingImages.length - 1 ? 1 : 0.25, fontSize: 12, color: '#ccc', padding: '3px 0', background: '#1a1a1a', borderRadius: 4 }}>▶</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#555' }}>Зураг алга.</div>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ШИНЭ ЗУРАГ НЭМЭХ (жагсаалтын төгсгөлд нэмэгдэнэ)</div>
                <input type="file" accept="image/*" multiple
                  onChange={e => { const picked = Array.from(e.target.files); setEditChapterNewFiles(prev => [...prev, ...picked]); e.target.value = ''; }}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                {editChapterNewFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, maxHeight: 260, overflowY: 'auto', padding: 4, background: '#0d0d0d', borderRadius: 8 }}>
                    {editChapterNewFiles.map((file, i) => (
                      <div key={i} style={{ position: 'relative', width: 76 }}>
                        <img src={editChapterNewFileUrls[i]} alt="" loading="lazy" decoding="async" style={{ width: 76, height: 102, objectFit: 'cover', borderRadius: 8, border: '1px solid #2a2a2a', display: 'block' }} />
                        <div style={{ position: 'absolute', top: 3, left: 3, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4 }}>{editChapterExistingImages.length + i + 1}</div>
                        <span onClick={() => setEditChapterNewFiles(prev => prev.filter((_, idx) => idx !== i))}
                          title="Устгах"
                          style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(139,0,0,0.9)', color: '#fff', fontSize: 11, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button disabled={editChapterSaving} onClick={async () => {
                if (!editChapterForm.chapter_number) { notify('Бvлгийн дугаар оруулна уу!'); return; }
                if (editChapterExistingImages.length === 0 && editChapterNewFiles.length === 0) { notify('Дор хаяж 1 зураг vлдэх ёстой!'); return; }
                const badFile = [editChapterCoverFile, ...editChapterNewFiles].filter(Boolean).map(validateImageFile).find(Boolean);
                if (badFile) { notify(badFile); return; }
                setEditChapterSaving(true);

                // ЗАСВАР #145: гарах цагийг өөрчилсөн эсэхийг анхны утгатай нь харьцуулна
                const newPublishAtIso = editChapterForm.publish_at ? new Date(editChapterForm.publish_at).toISOString() : null;
                const publishAtChanged = newPublishAtIso !== editChapterInitialPublishAt.current;
                const updates = {
                  chapter_number: Number(editChapterForm.chapter_number),
                  title: editChapterForm.title.trim() || `Бvлэг ${editChapterForm.chapter_number}`,
                  label: editChapterForm.label.trim() || null,
                  is_vip: editChapterForm.is_vip,
                  publish_at: newPublishAtIso,
                };
                // Гарах цагийг зориудаар өөрчилсөн бол бvлгийг шинэ мэт "ШИНЭ БvЛЭГ" мөрөнд
                // дахин гаргахын тулд created_at-ыг "одоо" болгоно.
                if (publishAtChanged) updates.created_at = new Date().toISOString();
                if (editChapterCoverFile) {
                  const ext = editChapterCoverFile.name.split('.').pop();
                  const oldThumbnailUrl = editChapter.thumbnail_url;
                  try {
                    updates.thumbnail_url = await uploadToR2(editChapterCoverFile, `chapters/${editChapter.id}/cover-${Date.now()}.${ext}`);
                  } catch (e) { notify('Cover upload алдаа: ' + e.message); setEditChapterSaving(false); return; }
                  // ЗАСВАР #163: cover солиход хуучин файл R2-д мөнхөд орхигддог байсныг засав
                  if (oldThumbnailUrl) { try { await deleteFromR2([oldThumbnailUrl]); } catch { /* хор хөнөөлгvй, orphan хэвээр vлдэнэ */ } }
                }

                const { error: chError } = await supabase.from('chapters').update(updates).eq('id', editChapter.id);
                if (chError) { notify('Алдаа: ' + chError.message); setEditChapterSaving(false); return; }

                // Устгагдсан (жагсаалтаас хассан) зургуудыг R2-с БОЛОН DB-с хасна
                // (ЗАСВАР #163: өмнө нь зөвхөн DB мөрийг устгаад, бодит файлыг R2-д
                // мөнхөд орхидог байсан — "хассан" зургууд хэзээ ч устдаггvй хуримтлагдаж байв).
                const keptIds = editChapterExistingImages.map(img => img.id);
                const removedImages = editChapterInitialImages.current.filter(img => !keptIds.includes(img.id));
                if (removedImages.length > 0) {
                  const removedUrls = removedImages.map(img => img.image_url).filter(Boolean);
                  try { await deleteFromR2(removedUrls); } catch (e) { notify('Анхаар: зарим зураг R2-с устгагдсангvй (' + e.message + ').'); }
                  await supabase.from('chapter_images').delete().in('id', removedImages.map(img => img.id));
                }
                // ЗАСВАР #163: vлдсэн зургуудын дарааллыг (page_number) НЭГ transaction-той
                // security definer RPC-ээр шинэчилнэ (өмнө нь 2N дараалсан HTTP update
                // явуулдаг байсан тул сvлжээ дундаа тасарвал дараалал хагас эвдэрч vлдэх
                // эрсдэлтэй байв — RPC бvгдийг нэг дор, бvтэн эсвэл огт биш хийнэ).
                if (editChapterExistingImages.length > 0) {
                  const { error: reorderError } = await supabase.rpc('reorder_chapter_images', {
                    chapter_id_in: editChapter.id,
                    image_ids: editChapterExistingImages.map(img => img.id),
                  });
                  if (reorderError) notify('Дараалал шинэчлэх алдаа: ' + reorderError.message);
                }
                // Шинэ зургуудыг upload хийж, vлдсэн зургуудын араас дараалуулж нэмнэ
                let nextPage = editChapterExistingImages.length + 1;
                for (const file of editChapterNewFiles) {
                  const ext = file.name.split('.').pop();
                  try {
                    const url = await uploadToR2(file, `chapters/${editChapter.id}/${Date.now()}-${nextPage}.${ext}`);
                    await supabase.from('chapter_images').insert({ chapter_id: editChapter.id, image_url: url, page_number: nextPage });
                    nextPage++;
                  } catch (e) { notify(`Зураг upload алдаа: ${e.message}`); }
                }

                setEditChapterSaving(false);
                setDbChapters(prev => prev.map(x => x.id === editChapter.id ? { ...x, ...updates } : x));
                setEditChapter(null);
                notify('Бvлэг шинэчлэгдлээ! 🎉');
              }} style={{ width: '100%', background: editChapterSaving ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 700, cursor: editChapterSaving ? 'not-allowed' : 'pointer', fontSize: 15 }}>
                {editChapterSaving ? 'ХАДГАЛЖ БАЙНА...' : 'ХАДГАЛАХ'}
              </button>
            </div>
          </div>
        )}

        {/* ЗАСВАР #161: бvлэг ЗАСАХ цонхны "БvТЭН ХАРАХ" — одоо байгаа (order-той) зурган
            дараалал + шинээр нэмсэн зургуудыг хамт, жинхэнэ уншигчийн хуудастай адил харуулна */}
        {editChapterPreviewOpen && (
          <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 1000, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', position: 'sticky', top: 0, zIndex: 10, background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(6px)' }}>
              <button onClick={() => { setEditChapterPreviewOpen(false); closeEditChapterEditor(); }} title="Буцах"
                style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Бvтэн харах ({editChapterExistingImages.length + editChapterNewFiles.length} зураг)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setReaderZoom(z => Math.max(50, z - 10))} title="Жижигрvvлэх"
                  style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>
                  −
                </button>
                <span style={{ fontSize: 11, color: '#aaa', minWidth: 34, textAlign: 'center' }}>{readerZoom}%</span>
                <button onClick={() => setReaderZoom(z => Math.min(200, z + 10))} title="Томруулах"
                  style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>
                  +
                </button>
              </div>
            </div>
            <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: editChapterEditTarget ? 90 : 0 }}>
              <div style={{ width: `${readerZoom}%`, margin: '0 auto' }}>
                {/* ЗАСВАР #164: "existing" (DB-д аль хэдийн байгаа) зургийг зөвхөн
                    Солих/Устгах/Зөөх л ажиллана (align/stitch хийхгvй — учир нь энэ нь
                    2 өөр DB мөрийг нэгтгэх/дараалал өөрчлөх нэмэлт логик шаардана). */}
                {editChapterExistingImages.map((img, i) => {
                  const isSelected = editChapterEditTarget?.kind === 'existing' && editChapterEditTarget.index === i;
                  if (isSelected && editChapterCropOpen) {
                    return (
                      <div key={img.id} ref={editChapterCropFrameRef} onPointerDown={startEditChapterCropPanDrag}
                        style={{ position: 'relative', zIndex: 2, width: '100%', height: '60vh', overflow: 'hidden', background: '#000', touchAction: 'none', cursor: 'grab', border: '3px solid #f5a623', boxSizing: 'border-box' }}>
                        <img ref={editChapterCropImgRef} src={img.image_url} alt={`${i + 1}`} draggable={false}
                          style={{ position: 'absolute', left: 0, top: editChapterCropPanY, width: `${100 * editChapterCropZoom}%`, opacity: editChapterEditBusy ? 0.4 : 1 }} />
                        <div style={{ position: 'absolute', left: '50%', top: 10, transform: 'translateX(-50%)', pointerEvents: 'none', width: 32, height: 32, borderRadius: '50%', background: '#f5a623', boxShadow: '0 1px 6px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {editChapterCropDragging ? <IconCheck size={16} color="#000" /> : <IconPencil size={14} color="#000" />}
                        </div>
                        <div style={{ position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)', pointerEvents: 'none', width: 32, height: 32, borderRadius: '50%', background: '#f5a623', boxShadow: '0 1px 6px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {editChapterCropDragging ? <IconCheck size={16} color="#000" /> : <IconPencil size={14} color="#000" />}
                        </div>
                      </div>
                    );
                  }
                  if (isSelected) {
                    return (
                      <div key={img.id} style={{ position: 'relative', zIndex: 2, border: '3px solid #f5a623', boxSizing: 'border-box' }}>
                        <img src={img.image_url} alt={`${i + 1}`} style={{ width: '100%', display: 'block', opacity: editChapterEditBusy ? 0.4 : 1 }} />
                      </div>
                    );
                  }
                  return (
                    <div key={img.id} onClick={() => setEditChapterEditTarget({ kind: 'existing', index: i })} style={{ position: 'relative', cursor: 'pointer' }}>
                      <img src={img.image_url} alt={`${i + 1}`} loading="lazy" decoding="async"
                        style={{ width: '100%', display: 'block', verticalAlign: 'top' }} />
                      <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.65)', color: '#fff', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconPencil size={13} color="#fff" />
                      </div>
                    </div>
                  );
                })}
                {editChapterNewFiles.map((file, i) => {
                  const isSelected = editChapterEditTarget?.kind === 'new' && editChapterEditTarget.index === i;
                  if (isSelected && editChapterCropOpen) {
                    return (
                      <div key={`new${i}`} ref={editChapterCropFrameRef} onPointerDown={startEditChapterCropPanDrag}
                        style={{ position: 'relative', zIndex: 2, width: '100%', height: '60vh', overflow: 'hidden', background: '#000', touchAction: 'none', cursor: 'grab', border: '3px solid #f5a623', boxSizing: 'border-box' }}>
                        <img ref={editChapterCropImgRef} src={editChapterNewFileUrls[i]} alt={`${editChapterExistingImages.length + i + 1}`} draggable={false}
                          style={{ position: 'absolute', left: 0, top: editChapterCropPanY, width: `${100 * editChapterCropZoom}%`, opacity: editChapterEditBusy ? 0.4 : 1 }} />
                        <div style={{ position: 'absolute', left: '50%', top: 10, transform: 'translateX(-50%)', pointerEvents: 'none', width: 32, height: 32, borderRadius: '50%', background: '#f5a623', boxShadow: '0 1px 6px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {editChapterCropDragging ? <IconCheck size={16} color="#000" /> : <IconPencil size={14} color="#000" />}
                        </div>
                        <div style={{ position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)', pointerEvents: 'none', width: 32, height: 32, borderRadius: '50%', background: '#f5a623', boxShadow: '0 1px 6px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {editChapterCropDragging ? <IconCheck size={16} color="#000" /> : <IconPencil size={14} color="#000" />}
                        </div>
                      </div>
                    );
                  }
                  if (isSelected) {
                    return (
                      <div key={`new${i}`} style={{ position: 'relative', zIndex: 2, border: '3px solid #f5a623', boxSizing: 'border-box' }}>
                        <img src={editChapterNewFileUrls[i]} alt={`${editChapterExistingImages.length + i + 1}`} style={{ width: '100%', display: 'block', opacity: editChapterEditBusy ? 0.4 : 1 }} />
                      </div>
                    );
                  }
                  return (
                    <div key={`new${i}`} onClick={() => setEditChapterEditTarget({ kind: 'new', index: i })} style={{ position: 'relative', cursor: 'pointer' }}>
                      <img src={editChapterNewFileUrls[i]} alt={`${editChapterExistingImages.length + i + 1}`} loading="lazy" decoding="async"
                        style={{ width: '100%', display: 'block', verticalAlign: 'top' }} />
                      <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.65)', color: '#fff', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconPencil size={13} color="#fff" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ЗАСВАР #164: доод талд бэхлэгдсэн action bar — тусдаа цонх нээгдэхгvй. */}
            {editChapterEditTarget && (
              <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(6px)', borderTop: '1px solid #1e1e1e', padding: '1rem' }}>
                {editChapterCropOpen && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
                    <button onClick={() => changeEditChapterCropZoom(-0.1)} title="Жижигрvvлэх"
                      style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#ccc', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>−</button>
                    <span style={{ fontSize: 11, color: '#aaa', minWidth: 40, textAlign: 'center' }}>{Math.round(editChapterCropZoom * 100)}%</span>
                    <button onClick={() => changeEditChapterCropZoom(0.1)} title="Томруулах"
                      style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#ccc', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>+</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                  {(() => {
                    const arrLen = editChapterEditTarget.kind === 'existing' ? editChapterExistingImages.length : editChapterNewFiles.length;
                    const atStart = editChapterEditTarget.index === 0;
                    const atEnd = editChapterEditTarget.index === arrLen - 1;
                    return (
                      <>
                        <button disabled={editChapterEditBusy || atStart} onClick={() => moveEditChapterEditImage(-1)} title="Дээш"
                          style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #2a2a2a', background: '#1a1a1a', color: atStart ? '#444' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: atStart ? 'not-allowed' : 'pointer' }}>
                          <IconChevronUp />
                        </button>
                        <button disabled={editChapterEditBusy || atEnd} onClick={() => moveEditChapterEditImage(1)} title="Доош"
                          style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #2a2a2a', background: '#1a1a1a', color: atEnd ? '#444' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: atEnd ? 'not-allowed' : 'pointer' }}>
                          <IconChevronDown />
                        </button>
                      </>
                    );
                  })()}
                  <button disabled={editChapterEditBusy} onClick={() => editChapterReplaceInputRef.current?.click()} title="Солих"
                    style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <IconImage />
                  </button>
                  <input ref={editChapterReplaceInputRef} type="file" accept="image/*" onChange={handleEditChapterReplaceFile} style={{ display: 'none' }} />
                  <button disabled={editChapterEditBusy} onClick={() => askConfirm('Энэ хуудсыг устгах уу?', deleteEditChapterEditImage)} title="Устгах"
                    style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #8B0000', background: 'rgba(139,0,0,0.15)', color: '#ff6b6b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <IconTrash />
                  </button>
                  <button disabled={editChapterEditBusy} onClick={editChapterCropOpen ? confirmEditChapterCrop : openEditChapterCrop} title="Тайрах"
                    style={{ width: 38, height: 38, borderRadius: 8, border: editChapterCropOpen ? '1px solid #f5a623' : '1px solid #2a2a2a', background: editChapterCropOpen ? 'rgba(245,166,35,0.15)' : '#1a1a1a', color: editChapterCropOpen ? '#f5a623' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <IconCrop />
                  </button>
                  <button disabled={editChapterEditBusy} onClick={() => { setEditChapterPreviewOpen(false); closeEditChapterEditor(); }}
                    style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#8B0000', color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <IconCheck size={15} /> Хадгалах
                  </button>
                </div>
              </div>
            )}
          </div>
        )}


      </div>
    </div>
  );
}