import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabase';
import { genres, MANGA_STATUSES, STATUS_META, DEFAULT_STATUS_META, PLANS, PLAN_DAYS, DAYS, SALE, SALE_ENDS_AT_MS } from './constants';
import { validateImageFile, normalizeImageFile, uploadToR2, deleteFromR2, formatMnDate, formatNumericDate, formatRemaining, getAnonViewerKey, formatCountdownClock, splitTallImageFile, cropImageFile, optimizeImageFile, checkImageDecodable } from './helpers';
import { IconHome, IconGrid, IconBookmark, IconPencil, IconCheck, IconChevronUp, IconChevronDown, IconImage, IconTrash, IconCrop, IconBell, IconGoogle, IconCrown } from './icons';
import { PasswordField } from './PasswordField';
import { Avatar, MangaCard, SectionHeader, LiveCountdown, TopbarSearch } from './components';

// ЗАСВАР (хэрэглэгчийн хvсэлт): DM-ээр илгээсэн стикер зураг ямар нэг
// шалтгаанаар (R2 CORS/устсан URL г.м.) ачаалагдахгvй бол хөтчийн "эвдэрсэн
// зураг" дvрсийн оронд ойлгомжтой "Стикер илгээлээ" гэсэн текст-fallback харуулна.
function DmStickerBubble({ url }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div style={{ padding: '10px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', fontSize: 12, color: '#ccc', fontWeight: 600 }}>
        Стикер илгээлээ
      </div>
    );
  }
  return <img src={url} alt="" onError={() => setFailed(true)} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 12 }} />;
}

export default function App() {
  const [page, setPage] = useState('home');
  const [selected, setSelected] = useState(null);
  // ЗАСВАР #61: манга дэлгэрэнгvй рvv аль хуудаснаас орсноо санаж, "Буцах" дарахад
  // vргэлж "Нvvр" рvv биш, ЯГ ТЭР хуудас руу нь буцаадаг болгосон
  const [previousPage, setPreviousPage] = useState('home');
  // ШИНЭ: манга хуудсанд admin бичдэг тэмдэглэл засах горим
  const [mangaNoteEditing, setMangaNoteEditing] = useState(false);
  // ШИНЭ: манга дэлгэрэнгvй хуудаснаас Facebook/Messenger/утасны native share (Instagram
  // гэх мэт бvх суулгасан app-ыг хамарна) руу хуваалцах цэс
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  // ШИНЭ (хэрэглэгчийн хvсэлт): манга хуваалцах цэснээс шууд хувийн зурвас руу
  // (хvн сонгоод) илгээх боломж.
  const [mangaShareOpen, setMangaShareOpen] = useState(false);
  const [mangaShareQuery, setMangaShareQuery] = useState('');
  const [mangaShareResults, setMangaShareResults] = useState([]);
  const [mangaShareSendingId, setMangaShareSendingId] = useState(null);
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
  // ЗАСВАР #91: "Төлбөр төлсөн" хvсэлт admin-д очиж, admin шалгаад батлах/цуцлах
  const [paymentRequestSending, setPaymentRequestSending] = useState(false);
  const [paymentRequests, setPaymentRequests] = useState([]);
  // ШИНЭ: "Санал хvсэлт" хуудас — хэрэглэгчийн бичсэн санал/асуудал/гаргалт
  // хvсэлтvvд (өөрийнх нь) + шинэ мессеж бичих маягт
  const [myFeedback, setMyFeedback] = useState([]);
  const [feedbackCategory, setFeedbackCategory] = useState('suggestion');
  const [feedbackMangaTitle, setFeedbackMangaTitle] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  // ШИНЭ: "Манга санал болгох" (request) төрлийн vед л ашиглагдах зураг хавсаргах талбар
  const [feedbackImageFile, setFeedbackImageFile] = useState(null);
  const [feedbackImagePreview, setFeedbackImagePreview] = useState('');
  // admin талын "Санал хvсэлт" таб
  const [feedbackList, setFeedbackList] = useState([]);
  // ШИНЭ (хэрэглэгчийн хvсэлт): admin-ий "Санал хvсэлт" табын буланд, уншигчдын
  // ажилтдад илгээсэн "Admin дэмжих" (дэмжих vг + од) мэдэгдлvvдийг жагсаана
  // (хонхны мэдэгдэл түр зуурынх — энэ бол vvнийг байнга харах боломж).
  const [recentAppreciations, setRecentAppreciations] = useState([]);
  // ШИНЭ: "team" (баг нэгдэх) ангиллын vед л ашиглагдах холбоос талбар
  const [feedbackLinkUrl, setFeedbackLinkUrl] = useState('');
  // ШИНЭ (хэрэглэгчийн хvсэлт): ажилтныг (editor/moderator/admin) урамшуулах
  // хэсэг — жагсаалт, сонгосон хvнд өгөх од/мессеж, илгээж буй эсэх.
  const [staffList, setStaffList] = useState([]);
  const [appreciateTarget, setAppreciateTarget] = useState(null);
  const [appreciateMessage, setAppreciateMessage] = useState('');
  const [appreciateSending, setAppreciateSending] = useState(false);
  // ШИНЭ (хэрэглэгчийн хvсэлт): "Admin дэмжих" (хандив)-ыг "Урамшуулах" modal-ийн
  // дотор нэг сонголтоор нээгддэг (collapsible) дэд хэсэг болгосон.
  const [donationOpenInModal, setDonationOpenInModal] = useState(false);
  const [donationAmount, setDonationAmount] = useState('');
  const [donationSending, setDonationSending] = useState(false);
  // ШИНЭ: "Даалгавар" хуудас — идэвхтэй даалгаврууд + миний явц/авсан шагналууд
  const [tasksList, setTasksList] = useState([]);
  const [myTaskClaims, setMyTaskClaims] = useState([]);
  // ШИНЭ (хэрэглэгчийн хvсэлт): "гараар биелvvлсэн" (manual) даалгаврын vед
  // admin/moderator баталгаажуулах хvртэл "pending" төлөвтэй байдаг тул task_id
  // → status ('pending'|'approved') mapping хэрэгтэй.
  const [myTaskClaimStatus, setMyTaskClaimStatus] = useState({});
  // ШИНЭ: баталгаажуулах зураг шаарддаг (requires_proof) даалгавар vед,
  // файл сонгуулах явцад тухайн даалгаврыг түр хадгална.
  const [pendingProofTask, setPendingProofTask] = useState(null);
  const [proofUploading, setProofUploading] = useState(false);
  const taskProofInputRef = useRef(null);
  // ШИНЭ ("цэцэг" систем): VIP биш хэрэглэгч VIP бvлэг vзэхийг оролдоход
  // гарч ирэх сонголтын (VIP авах / цэцгээр нээх) gate. { manga, chapter } эсвэл null.
  const [vipGate, setVipGate] = useState(null);
  const [vipGateUnlocking, setVipGateUnlocking] = useState(false);
  const [myProgress, setMyProgress] = useState({ comments: 0, chapters_read: 0 });
  // ШИНЭ: "manga_chapters" төрлийн даалгаварт — тодорхой манга бvрээр
  // уншсан бvлгийн тоо (manga_id → тоо).
  const [myMangaProgress, setMyMangaProgress] = useState({});
  const [taskClaimingId, setTaskClaimingId] = useState(null);
  // admin талын "Даалгавар" таб — шинэ даалгавар vvсгэх маягт
  const [newTaskForm, setNewTaskForm] = useState({ title: '', description: '', requirement_type: 'comments', requirement_count: 10, reward_flowers: 1, expires_at: '', target_manga_id: '', requires_proof: false, reward_type: 'flowers', reward_vip_days: 1 });
  const [taskSaving, setTaskSaving] = useState(false);
  // ШИНЭ: admin/moderator "манал" (гараар биелvvлсэн) даалгаврын баталгаажуулалт
  // хvлээж буй хvсэлтvvдийн жагсаалт (task + хэрэглэгчийн нэр хамт).
  const [pendingTaskClaims, setPendingTaskClaims] = useState([]);
  const [taskClaimActingId, setTaskClaimActingId] = useState(null);
  // ШИНЭ (дизайн — сайжруулалт): Санал хvсэлт/Даалгавар хуудсуудын ачаалж буй
  // vеийн skeleton, хоосон vеийн харагдац, зурган drag&drop, thread хариу бичих,
  // даалгаврын дэлгэрэнгvй modal, leaderboard, Нийтийн чат — шинэ state-vvд.
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [feedbackDragActive, setFeedbackDragActive] = useState(false);
  const [feedbackExpandedId, setFeedbackExpandedId] = useState(null);
  const [feedbackThreads, setFeedbackThreads] = useState({});
  const [feedbackThreadLoadingId, setFeedbackThreadLoadingId] = useState(null);
  const [feedbackReplyDrafts, setFeedbackReplyDrafts] = useState({});
  const [feedbackReplySendingId, setFeedbackReplySendingId] = useState(null);
  const [taskDetailModal, setTaskDetailModal] = useState(null);
  const [taskLeaderboard, setTaskLeaderboard] = useState([]);
  // ШИНЭ (хэрэглэгчийн хvсэлт): "ЭРЭМБЭ" хуудас — энэ сард хамгийн олон бvлэг
  // уншсан хэрэглэгчдийн жагсаалт (сар бvр шинэчлэгддэг).
  const [rankList, setRankList] = useState([]);
  const [rankLoading, setRankLoading] = useState(true);
  const [myRank, setMyRank] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [groupStickerPickerOpen, setGroupStickerPickerOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(true);
  // ШИНЭ (хэрэглэгчийн хvсэлт): группд (Roselle уншигчид, Админуудын чат)
  // ч мөн DM-тэй адил тодорхой мессежид reply/❤️ хийх боломжтой болгов.
  const [chatReplyTo, setChatReplyTo] = useState(null);
  // ШИНЭ (хэрэглэгчийн хvсэлт): "Нийтийн чат" дангаараа биш, БvРЭН чат систем —
  // хэрэглэгчид хоорондоо хувийн зурвас (DM) бичиж, манга хуваалцаж, стикер
  // илгээж, тодорхой мессежид reply/❤️ хийж болно. chatMode: group|inbox|thread.
  // ЗАСВАР (хэрэглэгчийн хvсэлт): tab switcher-ийн оронд — Чат хуудас нээгдэхэд
  // vргэлж НЭГДСЭН жагсаалт ('inbox': Нийтийн чат мөр дээрээ + доор нь хувийн
  // зурвасууд) харагдана, 'group'/'thread' нь тухайн мөрөн дээр дарахад ордог.
  const [chatMode, setChatMode] = useState('inbox');
  const [dmRowMenuOpenId, setDmRowMenuOpenId] = useState(null);
  // ШИНЭ (хэрэглэгчийн хvсэлт): "Roselle уншигчид" (нээлттэй) vs "Админуудын
  // чат" (зөвхөн editor/moderator/admin) — хоёр өрөөг room баганаар ялгана.
  const [chatRoom, setChatRoom] = useState('public');
  // ШИНЭ (хэрэглэгчийн хvсэлт): admin/moderator "тусгай хэсгээс" нэмдэг, БvХ
  // хэрэглэгч чатанд (нийтийн/staff/DM) ашиглаж болох нийтийн стикерийн сан.
  const [giftStickers, setGiftStickers] = useState([]);
  const [adminGiftStickerUploading, setAdminGiftStickerUploading] = useState(false);
  const [dmInbox, setDmInbox] = useState([]);
  const [dmInboxLoading, setDmInboxLoading] = useState(true);
  const [dmUnreadTotal, setDmUnreadTotal] = useState(0);
  // ШИНЭ (хэрэглэгчийн хvсэлт): сайтад байх vед мессежийн мэдэгдэл vргэлж
  // харагдаж байх ёстой (хvссэн vедээ Нийтийн чатыг дуугvй болгож болно).
  const [publicChatMuted, setPublicChatMuted] = useState(() => {
    try { return localStorage.getItem('public_chat_muted') === '1'; } catch { return false; }
  });
  const [publicChatUnreadCount, setPublicChatUnreadCount] = useState(0);
  const [dmPartner, setDmPartner] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [dmLoading, setDmLoading] = useState(true);
  const [dmInput, setDmInput] = useState('');
  const [dmSending, setDmSending] = useState(false);
  const [dmReplyTo, setDmReplyTo] = useState(null);
  const [dmStickerPickerOpen, setDmStickerPickerOpen] = useState(false);
  const [dmMangaShareOpen, setDmMangaShareOpen] = useState(false);
  const [dmMangaShareQuery, setDmMangaShareQuery] = useState('');
  const [dmNewMsgOpen, setDmNewMsgOpen] = useState(false);
  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [dmSearchResults, setDmSearchResults] = useState([]);
  // ШИНЭ (хэрэглэгчийн хvсэлт): DM яриаг устгах, хvнийг блоклох, цэцэг/VIP бэлэглэх
  const [dmMenuOpen, setDmMenuOpen] = useState(false);
  const [dmPartnerBlocked, setDmPartnerBlocked] = useState(false);
  const [dmGiftFlowersOpen, setDmGiftFlowersOpen] = useState(false);
  const [dmGiftFlowersAmount, setDmGiftFlowersAmount] = useState(1);
  const [dmGifting, setDmGifting] = useState(false);
  // ШИНЭ (хэрэглэгчийн хvсэлт): admin/moderator/editor уншигчдад vнэгvй
  // (өөрийн балансаас биш) цэцэг бэлэглэж болно, сард 10 хvртэл хязгаартай —
  // тусдаа "ЦЭЦЭГ БЭЛЭГЛЭХ" admin-таб хуудсанд зориулсан state.
  const [staffGiftQuotaRemaining, setStaffGiftQuotaRemaining] = useState(10);
  const [staffGiftSearchQuery, setStaffGiftSearchQuery] = useState('');
  const [staffGiftSearchResults, setStaffGiftSearchResults] = useState([]);
  const [staffGiftTarget, setStaffGiftTarget] = useState(null);
  const [staffGiftAmount, setStaffGiftAmount] = useState(1);
  const [staffGiftMessage, setStaffGiftMessage] = useState('');
  const [staffGiftSending, setStaffGiftSending] = useState(false);
  // ЗАСВАР #163: admin-д VIP эрх авсан хэрэглэгчдийн жагсаалт (имэйл + vлдсэн хоног)
  const [vipUsers, setVipUsers] = useState([]);
  // ШИНЭ: VIP хэрэглэгчдийн жагсаалтаас имэйлээр (жишээ нь gmail) хайх
  const [vipUserSearch, setVipUserSearch] = useState('');
  // ЗАСВАР #163: admin-ий статистик таб — цагаар идэвхжил + сvvлийн 1 сарын топ манга
  const [viewsByHour, setViewsByHour] = useState([]);
  const [topMangaMonth, setTopMangaMonth] = useState([]);
  // ШИНЭ: admin статистик таб — энэ сар (1-нээс өнөөдрийг хvртэл) батлагдсан
  // ("approved") төлбөрийн хvсэлтvvдийн нийт орлого (₮)
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeGenre, setActiveGenre] = useState('Бvгд');
  // ЗАСВАР #95: library/history/readChapters-г localStorage-с Supabase руу
  // шилжvvлэв (user_library, reading_progress хvснэгтvvд) — төхөөрөмж
  // солиход ч мэдээлэл алдагдахгvй, зөвхөн нэвтэрсэн vед л ажиллана.
  const [library, setLibrary] = useState([]);
  const [history, setHistory] = useState([]);
  const [dbMangas, setDbMangas] = useState([]);
  // ШИНЭ (хэрэглэгчийн хvсэлт): нvvр хуудсыг анх ачаалж байх vед "Одоогоор
  // манга байхгvй байна" гэсэн (хоосон гэсэн утгатай) зурвасын оронд бодит
  // карт хэлбэртэй skeleton харуулахын тулд.
  const [mangasLoading, setMangasLoading] = useState(true);
  const [authPage, setAuthPage] = useState(null);
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  // ЗАСВАР #156: "БvРТГvvЛЭХ"/"НЭВТРЭХ" товчийг олон дарахад давхар (олон
  // удаа) имэйл/хvсэлт явуулахаас сэргийлнэ
  const [authSubmitting, setAuthSubmitting] = useState(false);
  // ШИНЭ: "Google-р нэвтрэх" — дарсны дараа Google руу redirect хийгдэх хvртэлх
  // богино зуурын disabled/loading төлөв (давхар дарахаас сэргийлнэ)
  const [googleLoading, setGoogleLoading] = useState(false);
  // ШИНЭ: нууц vг сэргээх урсгал (имэйлээр 8 оронтой код)
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetSending, setResetSending] = useState(false);
  // ШИНЭ: код дахин илгээхэд 30 секундын хvлээлт (spam-аас сэргийлнэ)
  const [resendCooldown, setResendCooldown] = useState(0);
  // ШИНЭ: утасны hamburger цэс
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 900);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [genreOpen, setGenreOpen] = useState(false);
  // ШИНЭ: мэдэгдлийн хонх — staff (admin/moderator/editor)-т сайт даяарх шинэ
  // сэтгэгдэл, энгийн/VIP хэрэглэгчид зөвхөн ӨӨРИЙНХ нь сэтгэгдэлд ирсэн
  // reply/like мэдэгдэл (доор тусад нь тооцно).
  const [notifOpen, setNotifOpen] = useState(false);
  const [recentActivity, setRecentActivity] = useState([]);
  const [personalActivity, setPersonalActivity] = useState([]);
  const [notifLastSeenAt, setNotifLastSeenAt] = useState(0);
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
  // ШИНЭ: манга нэмэхдээ шууд нуугдмал (is_hidden) байдлаар vvсгэх сонголт
  const [adminMangaHidden, setAdminMangaHidden] = useState(false);
  // ШИНЭ (хэрэглэгчийн хvсэлт): "Бvгдийн шаана" эрхтэй хvмvvст л харагдах
  // тусгай манга — зөвхөн admin тавьж болно.
  const [adminMangaRestricted, setAdminMangaRestricted] = useState(false);
  // ШИНЭ: нvvр хэсгийн "Санал болгох" мөрөнд ашиглах урт нарийн (portrait) баннер зураг
  const [bannerFile, setBannerFile] = useState(null);
  // ШИНЭ: оруулсан мангаг засах (edit) цонх
  const [editManga, setEditManga] = useState(null);
  const [editMangaForm, setEditMangaForm] = useState({ title: '', desc: '', genres: [], status: 'Гарч байгаа', restricted: false });
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
  // ШИНЭ: бvлэг нэмэхтэй адил, засах vед ч хэдэн хувь upload дуусснаа товч дээр харуулна.
  const [editChapterSaveProgress, setEditChapterSaveProgress] = useState(0);
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
  // ЗАСВАР #214 (хэрэглэгчийн хvсэлт): доорх chapterCrop-той адил шалтгаанаар
  // интерактив (чирдэг, zoom-гvй) тайрах хэрэгслийг дахин нэмэв.
  const [editChapterCropActive, setEditChapterCropActive] = useState(false);
  const [editChapterCropPanY, setEditChapterCropPanY] = useState(0);
  const [editChapterCropImgSize, setEditChapterCropImgSize] = useState({ w: 0, h: 0 });
  const [editChapterCropFrameWidth, setEditChapterCropFrameWidth] = useState(0);
  const editChapterCropFrameRef = useRef(null);

  const closeEditChapterEditor = () => { setEditChapterEditTarget(null); setEditChapterCropActive(false); setEditChapterCropPanY(0); };

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
    setEditChapterCropActive(false);
    setEditChapterCropPanY(0);
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
      const producedFile = await produceNewFileFrom(img);
      // ЗАСВАР #200 (хэрэглэгчийн хvсэлт — дата хэрэглээ багасгах): нэг зургийг
      // солих/тайрах vед ч бусад upload зам шиг өргөнийг хязгаарлаж WebP болгоно
      // (энд олон хуудас болгож хуваахгvй — нэг зургийг НЭГ зурагтай сольж байгаа
      // тул page_number дараалал өөрчлөгдөх ёсгvй).
      // ЗАСВАР #224 (код шинжилгээ): optimizeImageFile нь decode vеэрээ мэдэгдэж
      // байгаа width/height-ыг шууд буцаадаг болсон тул дахин decode хийх
      // (getImageDimensions) шаардлагагvй болов.
      const { file: newFile, width: newWidth, height: newHeight } = await optimizeImageFile(producedFile, 1200);
      const ext = 'webp';
      // ЗАСВАР #194 (код шинжилгээ): Date.now() бол дараалсан/таамаглаж болохуйц
      // тул crypto.randomUUID() болгов — доорх бусад chapters/ upload-той адил шалтгаан.
      const newUrl = await uploadToR2(newFile, `chapters/${editChapter.id}/${crypto.randomUUID()}.${ext}`);
      const { error } = await supabase.from('chapter_images').update({ image_url: newUrl, width: newWidth, height: newHeight }).eq('id', img.id);
      if (error) { notify('Алдаа: ' + error.message); setEditChapterEditBusy(false); return; }
      setEditChapterExistingImages(prev => prev.map((it, idx) => idx === editChapterEditTarget.index ? { ...it, image_url: newUrl, width: newWidth, height: newHeight } : it));
      try { await deleteFromR2([img.image_url]); } catch { /* хор хөнөөлгvй */ }
    } catch (e) {
      notify('Алдаа: ' + e.message);
    }
    setEditChapterEditBusy(false);
  };

  const handleEditChapterReplaceFile = async (e) => {
    const rawFile = e.target.files[0];
    e.target.value = '';
    if (!rawFile || !editChapterEditTarget) return;
    let file;
    try {
      file = await normalizeImageFile(rawFile);
    } catch (err) { notify(err.message); return; }
    const invalid = validateImageFile(file);
    if (invalid) { notify(invalid); return; }
    if (editChapterEditTarget.kind === 'new') {
      setEditChapterNewFiles(prev => prev.map((f, idx) => idx === editChapterEditTarget.index ? file : f));
    } else {
      applyExistingChapterImageEdit(async () => file);
    }
  };

  // ЗАСВАР #214 (хэрэглэгчийн хvсэлт): доорх chapterCrop-той адил интерактив
  // (чирдэг, zoom-гvй) тайрах хэрэгсэл. "existing" бол шинэ файлыг тэр даруй
  // R2-д upload хийж DB мөрийг шинэчилнэ (applyExistingChapterImageEdit), "new"
  // бол зөвхөн local state дотор солино.
  const openEditChapterCrop = () => {
    if (!editChapterEditTarget) return;
    const { kind, index } = editChapterEditTarget;
    const url = kind === 'existing' ? editChapterExistingImages[index]?.image_url : editChapterNewFileUrls[index];
    if (!url) return;
    setEditChapterCropActive(true);
    setEditChapterCropPanY(0);
    setEditChapterCropImgSize({ w: 0, h: 0 });
    setEditChapterCropFrameWidth(0);
    const probe = new Image();
    probe.src = url;
    probe.decode().then(() => {
      setEditChapterCropImgSize({ w: probe.naturalWidth, h: probe.naturalHeight });
    }).catch(() => {
      notify('Зургийг унших vед алдаа гарлаа.');
      setEditChapterCropActive(false);
    });
  };
  const closeEditChapterCrop = () => {
    setEditChapterCropActive(false);
    setEditChapterCropPanY(0);
  };

  useEffect(() => {
    if (!editChapterCropActive) return;
    const frameEl = editChapterCropFrameRef.current;
    if (frameEl) setEditChapterCropFrameWidth(frameEl.clientWidth);
  }, [editChapterCropActive, editChapterEditTarget]);

  const getEditChapterCropFullHeight = () => (
    editChapterCropFrameWidth && editChapterCropImgSize.w && editChapterCropImgSize.h
      ? editChapterCropFrameWidth * (editChapterCropImgSize.h / editChapterCropImgSize.w)
      : 0
  );

  const startEditChapterCropPanDrag = (e) => {
    e.preventDefault();
    const frameEl = editChapterCropFrameRef.current;
    if (!frameEl) return;
    const fullHeight = getEditChapterCropFullHeight();
    const frameHeight = frameEl.clientHeight;
    if (fullHeight <= 0) return;
    const minY = Math.min(0, frameHeight - fullHeight);
    const point = e.touches ? e.touches[0] : e;
    const startClientY = point.clientY;
    const startPanY = editChapterCropPanY;

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
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  const confirmEditChapterCrop = async () => {
    if (!editChapterEditTarget || editChapterEditBusy) return;
    const frameEl = editChapterCropFrameRef.current;
    if (!frameEl) return;
    const fullHeight = getEditChapterCropFullHeight();
    const frameHeight = frameEl.clientHeight;
    if (fullHeight <= 0) { closeEditChapterCrop(); return; }
    const scaleY = editChapterCropImgSize.h / fullHeight;
    const rect = {
      x: 0,
      y: Math.round(-editChapterCropPanY * scaleY),
      width: editChapterCropImgSize.w,
      height: Math.round(Math.min(frameHeight, fullHeight) * scaleY),
    };
    rect.height = Math.min(rect.height, editChapterCropImgSize.h - rect.y);
    if (editChapterEditTarget.kind === 'new') {
      const idx = editChapterEditTarget.index;
      setEditChapterEditBusy(true);
      try {
        const newFile = await cropImageFile(editChapterNewFiles[idx], rect);
        setEditChapterNewFiles(prev => prev.map((f, i) => i === idx ? newFile : f));
        notify('Зураг тайрагдлаа ✂️');
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
    supabase.from('chapter_images').select('id, chapter_id, image_url, page_number, width, height').eq('chapter_id', ch.id).order('page_number')
      .then(({ data }) => {
        setEditChapterExistingImages(data || []);
        editChapterInitialImages.current = data || [];
      });
  };
  // ШИНЭ: "Хувиар" тусдаа хуудас байхаа больж, avatar дээр дарахад буланд гарч ирэх жижиг цонх боллоо
  const [profileOpen, setProfileOpen] = useState(false);
  // ЗАСВАР (алдаа): профайл панел нээлттэй vед арын хуудас (жишээ нь VIP
  // хуудас) хараахан "цоожлогдоогvй" гvйлгэгддэг байсан тул, панел доод
  // талын хоосон (dim-гvй) backdrop-оор гvйлгэвэл арын хуудасны агуулга шууд
  // "цухуйж" панелтай холилдож харагддаг байв — body scroll-ыг цоожилно.
  useEffect(() => {
    document.body.style.overflow = profileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [profileOpen]);
  // ШИНЭ: утасны доод pill nav-ийн "Профайл" tab дээр дарахад дээшээ нээгдэх
  // богино цэс (Миний сан / Даалгавар / Профайл / Гарах) — дэлгэрэнгvй профайл
  // (profileOpen) цонхноос тусдаа, тvvнийг нээх нэг товчлолтой.
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  // ШИНЭ: site-тэй өнгө нийцсэн мэдэгдлийн карт (toast) — browser notify()-ийг орлоно
  const [toasts, setToasts] = useState([]);
  const [chapterManga, setChapterManga] = useState('');
  const [chapterNumber, setChapterNumber] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterFiles, setChapterFiles] = useState([]);
  // ЗАСВАР #169: "БvТНЭЭР ХАРАХ" preview дотор зураг дээр дарж Солих/Устгах/Зөөх хийж болно.
  const [chapterEditIndex, setChapterEditIndex] = useState(null); // chapterFiles-ийн alь index засварлаж буй
  const [chapterEditBusy, setChapterEditBusy] = useState(false);
  const [chapterCropBusy, setChapterCropBusy] = useState(false);
  // ЗАСВАР #214 (хэрэглэгчийн хvсэлт): интерактив (чирдэг) тайрах хэрэгслийг
  // дахин нэмэв — гэхдээ энгийн болгож: zoom vгvй (vргэлж 100%, бvтэн өргөн),
  // зөвхөн дээшээ/доошоо чирж хvрээндээ харагдах хэсгээ сонгоно. Баталгаажуулах
  // (crop-ыг хадгалах) нь дээд/доод захын том тэмдгvvд биш, ЗvvН ДЭЭД буланд
  // байрлах НЭГ жижиг тэмдэг — vvн дээр дарахад л тэр зургийн crop хадгалагдана.
  const [chapterCropActive, setChapterCropActive] = useState(false);
  const [chapterCropPanY, setChapterCropPanY] = useState(0);
  // Эх зургийн бодит хэмжээг (img.decode()-ээр найдвартай авсан) + frame-ийн
  // бодит px өргөнийг ашиглаж, browser-ийн автомат тооцоонд vл найдаж өөрсдөө
  // тооцоолно (өмнөх код шинжилгээгээр батлагдсан найдвартай арга).
  const [chapterCropImgSize, setChapterCropImgSize] = useState({ w: 0, h: 0 });
  const [chapterCropFrameWidth, setChapterCropFrameWidth] = useState(0);
  const chapterCropFrameRef = useRef(null);
  // ЗАСВАР #118: URL.createObjectURL-ийг render болгонд шинээр vvсгэдэг байсан
  // memory leak-ийг засав — blob URL-уудыг файл өөрчлөгдөх vед л нэг удаа
  // vvсгэж, хуучныг нь revoke хийнэ.
  const [chapterFileUrls, setChapterFileUrls] = useState([]);
  useEffect(() => {
    const urls = chapterFiles.map(f => URL.createObjectURL(f));
    setChapterFileUrls(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [chapterFiles]);

  // ЗАСВАР #164: "БvТНЭЭР ХАРАХ" preview-с дарж нээгдэх per-image edit vйлдлvvд
  const closeChapterEdit = () => { setChapterEditIndex(null); setChapterCropActive(false); setChapterCropPanY(0); };

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
    // ЗАСВАР #211 (код шинжилгээ): зураг солиход crop горим ӨМНӨх зурган дээрээ
    // идэвхтэй хэвээр vлдэж, шинэ зурган дээр буруу төлөвтэй харагддаг байсан.
    setChapterCropActive(false);
    setChapterCropPanY(0);
  };

  const chapterReplaceInputRef = useRef(null);
  const handleChapterReplaceFile = async (e) => {
    const rawFile = e.target.files[0];
    e.target.value = '';
    if (!rawFile || chapterEditIndex === null) return;
    let file;
    try {
      file = await normalizeImageFile(rawFile);
    } catch (err) { notify(err.message); return; }
    const invalid = validateImageFile(file);
    if (invalid) { notify(invalid); return; }
    setChapterFiles(prev => prev.map((f, idx) => idx === chapterEditIndex ? file : f));
  };

  const openChapterCrop = () => {
    if (chapterEditIndex === null) return;
    const idx = chapterEditIndex;
    const url = chapterFileUrls[idx];
    if (!url) return;
    setChapterCropActive(true);
    setChapterCropPanY(0);
    setChapterCropImgSize({ w: 0, h: 0 });
    setChapterCropFrameWidth(0);
    // ЗАСВАР #212 (код шинжилгээ): харагдах <img>-ийн onLoad/complete-д vл
    // найдаж, декодчлол баталгаатай дуусахыг ЗАДГАЙ хvлээдэг img.decode()
    // ашиглан эх зургийн бодит хэмжээг тусад нь, найдвартай авна.
    const probe = new Image();
    probe.src = url;
    probe.decode().then(() => {
      setChapterCropImgSize({ w: probe.naturalWidth, h: probe.naturalHeight });
    }).catch(() => {
      notify('Зургийг унших vед алдаа гарлаа.');
      setChapterCropActive(false);
    });
  };
  const closeChapterCrop = () => {
    setChapterCropActive(false);
    setChapterCropPanY(0);
  };

  // Frame-ийн бодит px өргөнийг хэмжинэ (зурагнаас vл хамааран, зөвхөн эцэг
  // элементийн CSS-ээс тодорхойлогддог тул шууд, найдвартай хэмжиж болно).
  useEffect(() => {
    if (!chapterCropActive) return;
    const frameEl = chapterCropFrameRef.current;
    if (frameEl) setChapterCropFrameWidth(frameEl.clientWidth);
  }, [chapterCropActive, chapterEditIndex]);

  const getChapterCropFullHeight = () => (
    chapterCropFrameWidth && chapterCropImgSize.w && chapterCropImgSize.h
      ? chapterCropFrameWidth * (chapterCropImgSize.h / chapterCropImgSize.w)
      : 0
  );

  // Зургийг тогтмол (60vh) өндөртэй цонхны дотор дээшээ/доошоо чирнэ.
  const startChapterCropPanDrag = (e) => {
    e.preventDefault();
    const frameEl = chapterCropFrameRef.current;
    if (!frameEl) return;
    const fullHeight = getChapterCropFullHeight();
    const frameHeight = frameEl.clientHeight;
    if (fullHeight <= 0) return; // зураг decode хийгдэж дуусаагvй байна
    const minY = Math.min(0, frameHeight - fullHeight);
    const point = e.touches ? e.touches[0] : e;
    const startClientY = point.clientY;
    const startPanY = chapterCropPanY;

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
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  // ЗvvН ДЭЭД буланд байрлах жижиг тэмдэг дээр дарахад л тухайн зурагны crop
  // хадгалагдана.
  const confirmChapterCrop = async () => {
    if (chapterEditIndex === null || chapterCropBusy) return;
    const frameEl = chapterCropFrameRef.current;
    if (!frameEl) return;
    const fullHeight = getChapterCropFullHeight();
    const frameHeight = frameEl.clientHeight;
    if (fullHeight <= 0) { closeChapterCrop(); return; }
    const scaleY = chapterCropImgSize.h / fullHeight;
    const rect = {
      x: 0,
      y: Math.round(-chapterCropPanY * scaleY),
      width: chapterCropImgSize.w,
      height: Math.round(Math.min(frameHeight, fullHeight) * scaleY),
    };
    rect.height = Math.min(rect.height, chapterCropImgSize.h - rect.y);
    const targetIndex = chapterEditIndex;
    setChapterCropBusy(true);
    try {
      const newFile = await cropImageFile(chapterFiles[targetIndex], rect);
      setChapterFiles(prev => prev.map((f, idx) => idx === targetIndex ? newFile : f));
      notify('Зураг тайрагдлаа ✂️');
      closeChapterCrop();
    } catch (e) {
      notify('Алдаа: ' + e.message);
    }
    setChapterCropBusy(false);
  };

  // ШИНЭ: upload хийхийн өмнө сонгосон зургуудыг бvлэг уншиж байгаа мэт бvтнээр нь харах
  const [chapterPreviewOpen, setChapterPreviewOpen] = useState(false);
  // ШИНЭ: уншиж байгаа хуудасны дээд талд бvлгийн дугаар дарахад бусад бvлгvvд жагсаана
  const [chapterSwitcherOpen, setChapterSwitcherOpen] = useState(false);
  // ЗАСВАР #102: бvлэг уншихад zoom (томруулах/жижигрvvлэх) хэсэг, 100%-с эхэлнэ
  const [readerZoom, setReaderZoom] = useState(100);
  // ЗАСВАР #102: доошоо гvйлгэхэд толгой хэсгийг нуух, дээшээ гvйлгэхэд харуулах
  const [readerHeaderVisible, setReaderHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);
  // ШИНЭ: доод талын унших хяналтын мөрөнд харуулах явцын хувь (0-100)
  const [readerScrollPercent, setReaderScrollPercent] = useState(0);
  const readerProgressTrackRef = useRef(null);
  const seekReaderProgress = (clientX) => {
    const el = readerProgressTrackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: frac * scrollable });
  };
  const startReaderProgressDrag = (e) => {
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    seekReaderProgress(point.clientX);
    const onMove = (ev) => {
      if (ev.touches) ev.preventDefault();
      const p = ev.touches ? ev.touches[0] : ev;
      seekReaderProgress(p.clientX);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };
  const resumeReaderScroll = () => {
    if (!resumeBanner) return;
    window.scrollTo({ top: resumeBanner.y, behavior: 'smooth' });
    setResumeBanner(null);
  };
  const scrollReaderToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const scrollReaderToBottom = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  // ЗАСВАР #141: Safari (ялангуяа утсан дээр) удаан нуугдсан tab-ыг санамсаргvй
  // дахин ачаалахад унших байрлал алдагдаж, эхнээс эхэлдэг байсан асуудлыг
  // багасгах зорилгоор гvйлгэсэн байрлалыг тогтмол хугацаанд sessionStorage-д
  // хадгална (доор өөр effect-ээр буцааж сэргээнэ).
  const lastScrollSaveTime = useRef(0);
  // ШИНЭ (хэрэглэгчийн хvсэлт): өмнө уншиж байсан бvлгээ дахин нээхэд
  // "Vргэлжлvvлэн уншиx уу?" гэсэн санал (banner) харуулна — localStorage-д
  // хадгалсан байрлал ашиглана (өмнө нь sessionStorage-т чимээгvй сэргэдэг
  // байсныг илvv тодорхой, хэрэглэгчийн сонголттой болгов).
  const [resumeBanner, setResumeBanner] = useState(null);
  useEffect(() => {
    if (page !== 'reader' || !selectedChapter) return;
    lastScrollY.current = window.scrollY;
    const updatePercent = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setReaderScrollPercent(scrollable > 0 ? Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100))) : 0);
    };
    updatePercent();
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastScrollY.current && y > 80) setReaderHeaderVisible(false);
      else if (y < lastScrollY.current) setReaderHeaderVisible(true);
      lastScrollY.current = y;
      updatePercent();
      // ЗАСВАР: хэрэглэгч өөрөө гvйлгэж эхэлбэл "Vргэлжлvvлэх vv?" banner-ыг нуана.
      setResumeBanner(null);
      const now = Date.now();
      if (now - lastScrollSaveTime.current > 300) {
        lastScrollSaveTime.current = now;
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const percent = scrollable > 0 ? Math.min(100, Math.max(0, Math.round((y / scrollable) * 100))) : 0;
        try { localStorage.setItem(`reader_scroll_${selectedChapter.id}`, JSON.stringify({ y, percent })); } catch { /* Safari private mode гэх мэтэд localStorage хаалттай байж болно */ }
      }
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, [page, selectedChapter]);

  // ЗАСВАР #103: бvлэг уншиж байх vед гараар (pinch) zoom хийж болохоор
  // viewport хязгаарлалтыг тvр сулруулна; бусад хуудсанд буцаагаад хориглоно.
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
  // өмнө нь ганц утгатай string байсан тул хоёр эрхийг зэрэг олгох боломжгvй,
  // мөн SQL Editor-с "admin,vip" гэх мэт хуурамч утга зохиомол оруулахад
  // isStaff шалгалт "тэнцvv" харьцуулалтаас болж бvрмөсөн унтардаг эмзэг байсан.
  const [userRoles, setUserRoles] = useState([]);
  const [adminStats, setAdminStats] = useState({ mangas: 0, users: 0, chapters: 0 });
  // ШИНЭ: профайл (нэр, avatar), сэтгэгдэл, уншсан бvлгийн тэмдэглэгээ
  const [userProfile, setUserProfile] = useState(null);
  const [profileName, setProfileName] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  // ШИНЭ: мэдэгдлээс бvлэг/манга руу шилжихэд сэтгэгдлийн хэсэг рvv доош гvйлгэх (scroll)
  const chapterCommentsRef = useRef(null);
  const mangaCommentsRef = useRef(null);
  const [pendingScrollToComments, setPendingScrollToComments] = useState(false);
  // ЗАСВАР #203 (хэрэглэгчийн хvсэлт): мэдэгдлээс орж ирэхэд зурган хуудас/манганы
  // дэлгэрэнгvй агуулгыг харуулахгvй, зөвхөн сэтгэгдлийн хэсгийг харуулна.
  const [commentsOnlyView, setCommentsOnlyView] = useState(false);
  // ЗАСВАР #204 (код шинжилгээ): доорх "манга сольмогц detailTab-ыг 'chapters'
  // болгож дахин тохируулах" effect нь goToNotification-ийн setDetailTab('rating')-г
  // дараа нь дарж бичдэг (унтардаг) байсан тул манганы сэтгэгдлийн мэдэгдэл дээр
  // дарахад "vнэлгээ+сэтгэгдэл" биш "Бvлгvvд" tab руу л орчихдог байв.
  const skipDetailTabResetRef = useRef(false);
  // ЗАСВАР #108: сэтгэгдэлд хавсаргах сонгосон стикер, upload хийж буй slot
  const [selectedSticker, setSelectedSticker] = useState(null);
  const [stickerUploading, setStickerUploading] = useState(null);
  const [commentSending, setCommentSending] = useState(false);
  // { [mangaId]: [бvлгийн дугаарууд] } — уншсан бvлгvvд
  const [readChapters, setReadChapters] = useState({});
  // ШИНЭ: role систем, нийтлэх урсгал, report
  const [chapterIsVip, setChapterIsVip] = useState(false);
  // ШИНЭ: бvлэг нэмэхдээ (амжилттай upload дуусаад ч) зориудаар нуугдмал vлдээх сонголт
  const [chapterHidden, setChapterHidden] = useState(false);
  // ЗАСВАР #60: "VНЭГVЙ"/"VIP" бэлгэдлийн оронд admin өөрөө бичих дурын тэмдэглэгээ (жишээ нь S1 END)
  const [chapterLabel, setChapterLabel] = useState('');
  // ШИНЭ: admin/moderator шууд нэмэхдээ ч ирээдvйн гарах цаг товлож болно
  const [chapterPublishAt, setChapterPublishAt] = useState('');
  const [pendingChapters, setPendingChapters] = useState([]);
  const [reportsList, setReportsList] = useState([]);
  // ЗАСВАР #125: moderator/editor-ийн устгах хvсэлт илгээсэн бvлгvvд (зөвхөн admin баталгаажуулна)
  const [pendingDeleteChapters, setPendingDeleteChapters] = useState([]);

  // ШИНЭ: бvлгийн cover, эрэмбэ, хуваарь, like/reply, countdown
  const [chapterCover, setChapterCover] = useState(null);
  const [chapterSort, setChapterSort] = useState('asc');
  // ЗАСВАР #111: манга дэлгэрэнгvй хуудсанд бvлгийн дугаараар хайх
  const [chapterSearch, setChapterSearch] = useState('');
  const [pendingTimes, setPendingTimes] = useState({});
  const [myLikes, setMyLikes] = useState([]);
  // ШИНЭ: сэтгэгдэл бvрийн like-ийн тоо (comment_id -> тоо), aggregate embed-гvйгээр тооцно
  const [commentLikeCounts, setCommentLikeCounts] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [nowTs, setNowTs] = useState(Date.now());

  // ЗАСВАР #109: манга дэлгэрэнгvй хуудасны tab, vнэлгээ, манганы ерөнхий сэтгэгдэл
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
  // ШИНЭ (хэрэглэгчийн хvсэлт): видеоны оронд дээд тал нь 10 зурагтай "цуврал"
  // reel vvсгэх сонголт, мөн хоёуланд нь (видео/зурган цуврал) хавсаргаж болох
  // тусдаа дуу/хөгжим — хавсаргавал видеоны өөрийнх нь дууг нам болгож, зөвхөн
  // энэ тусгай дуу л сонсогдоно.
  const [reelType, setReelType] = useState('video');
  const [reelImageFiles, setReelImageFiles] = useState([]);
  const [reelAudioFile, setReelAudioFile] = useState(null);

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
  // admin     — бvх эрх
  // moderator — манга/бvлэг нэмэх, Editor-ийн хvсэлт батлах/татгалзах, сэтгэгдэл устгах, report шалгах (манга устгах эрхгvй)
  // editor    — манга/бvлэг нэмэх, бvлэг нь "Хvлээгдэж буй" төлөвтэй орно (өөрөө нийтлэх эрхгvй)
  // user      — унших, хадгалах, сэтгэгдэл бичих
  //
  // ЗАСВАР #20: VIP-ийг role-оос тусад нь (is_vip + vip_expires_at) болгосон —
  // ингэснээр нэг хэрэглэгч жишээ нь "moderator" ЗЭРЭГ "vip" байж болно (өмнө нь
  // role нэг л утгатай байсан тул staff эрх + төлбөртэй VIP хугацааг зэрэг барих
  // боломжгvй байсан), мөн VIP-д дуусах хугацаа (vip_expires_at) тавих боломжтой болсон.
  const isAdmin = userRoles.includes('admin');
  const isStaff = isAdmin || userRoles.includes('moderator') || userRoles.includes('editor');
  const canModerate = isAdmin || userRoles.includes('moderator');
  // editor эрхтэй ХАРИН moderator/admin биш vед л бvлэг нь "Хvлээгдэж буй" ордог
  // (moderator/admin аль хэдийн батлах эрхтэй тул өөрсдийн оруулснаа шууд нийтэлж болно)
  const editorOnly = userRoles.includes('editor') && !canModerate;
  const hasActiveVip = !!userProfile?.is_vip && (!userProfile?.vip_expires_at || new Date(userProfile.vip_expires_at).getTime() > nowTs);
  const isVip = isStaff || hasActiveVip;
  // ШИНЭ (хэрэглэгчийн хvсэлт): "Бvгдийн шаана" — зөвхөн admin-ий vvсгэдэг,
  // тодорхой эрхтэй хvмvvст л (админ ч хамт) харагддаг тусгай манга-эрх.
  const hasShaanaRole = userRoles.includes('shaana');
  // ШИНЭ (хэрэглэгчийн хvсэлт): "Бvгдийн шаана" эрхтэй ХАРИН staff БИШ хэрэглэгч —
  // editor-той адил зөвхөн "pending" статустайгаар (батлагдах хvртэл) бvлэг нэмнэ.
  const shaanaOnly = hasShaanaRole && !isStaff;
  const needsChapterApproval = editorOnly || shaanaOnly;
  const ROLE_LABELS = { admin: 'Админ', moderator: 'Модератор', editor: 'Эдитор', shaana: 'Бvгдийн шаана', user: 'Хэрэглэгч' };
  // ЗАСВАР #127: staff (admin/moderator/editor) 6 хvртэл, энгийн хэрэглэгч 3 хvртэл стикер хадгалж болно
  const stickerSlots = isStaff ? [1, 2, 3, 4, 5, 6] : [1, 2, 3];
  const myStickers = stickerSlots.map(n => userProfile?.[`sticker_${n}`]).filter(Boolean);

  // ШИНЭ: тодорхой цагт (publish_at) товлогдсон бvлгvvд — хуваарийн хуудсанд харуулна
  const [scheduledChapters, setScheduledChapters] = useState([]);
  // ЗАСВАР #147: Хуваарь хуудсыг comic app шиг өдөр тус бvрийн ТАБ (тухайн
  // vед зөвхөн 1 өдрийн агуулга харагдана) болгов — 7 хоногийн дараалал нь
  // Даваа-с (хэвийн долоо хоногийн дараалал) хэвээрээ, гэхдээ хуудас нээгдэх
  // бvрт ЭНЭ ӨДРИЙН таб автоматаар сонгогдоно.
  const [scheduleDay, setScheduleDay] = useState(() => new Date().getDay());
  useEffect(() => {
    if (page === 'schedule') setScheduleDay(new Date().getDay());
  }, [page]);
  // ЗАСВАР #44: нvvр хэсгийн "ШИНЭ БVЛЭГ" одоо мангаар биш, БVЛЭГ бvрээр (өөрийн
  // cover зурагтайгаа) харуулна — 1 манга 10 бvлэг гаргавал 10 тусдаа карт гарна
  const [recentChapters, setRecentChapters] = useState([]);
  // ШИНЭ: сvvлийн 30 хоногт хамгийн их vзэгдсэн 10 манга (нvvр хэсгийн "Санал болгох" мөр)
  const [topMangaIds, setTopMangaIds] = useState(null); // null = ачаалж дуусаагvй
  // ШИНЭ: Бvх гаргалт хуудсыг шинээр эсвэл vзэлтээр эрэмбэлэх
  // ЗАСВАР #81: нvvр хэсгийн мөр бvрийн "цааш vзэх" сум зөвхөн тухайн ангиллын
  // мангыг харуулдаг болгох (өмнө нь ямар ч категориос дарсан бай, "Бvх гаргалт"
  // хуудсанд БVХ манга гардаг байсан).
  const [allCategory, setAllCategory] = useState(null);

  // Countdown-ууд шинэчлэгдэж байхын тулд 30 сек тутам "одоо"-г сэргээнэ
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // ЗАСВАР #226 (код шинжилгээ): секунд тутмын countdown-г эндээс хассан —
  // одоо доорх 3 газарт module-level <LiveCountdown> компонент ашиглаж,
  // зөвхөн ТЭР жижиг компонент секунд тутам өөрийгөө сэргээнэ (App() бvхэлдээ
  // биш). Дэлгэрэнгvй: components.jsx-ийн LiveCountdown-ийн тайлбар.

  // ШИНЭ: цонхны хэмжээгээр утас/компьютер горимыг мэдэрнэ (hamburger цэс)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Хуудас солигдох бvрт утасны цэсийг автоматаар хаана
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

  // Товлосон цаг нь болоогvй бvлэг эсэх
  // ЗАСВАР #189 (код шинжилгээ): useCallback-гvй бол render бvр шинэ функц
  // vvсч, vvнийг dependency болгож ашигладаг restoreFromPath ч render бvр
  // дахин vvсэж, popstate listener render бvр дахин бvртгэгддэг байв.
  const chapterLocked = useCallback((ch) => ch.publish_at && new Date(ch.publish_at).getTime() > nowTs, [nowTs]);

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
  // гарахад (logout) локал state-ийг цэвэрлэнэ (DB-д хэвээрээ vлдэнэ).
  useEffect(() => {
    // ЗАСВАР #118: нэвтрээгvй (зочин) хэрэглэгчийн тvvх/уншсан бvлэг refresh
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

  // ЗАСВАР #61: манга дэлгэрэнгvй хуудас руу орохдоо одоогийн хуудсыг санана,
  // ингэснээр "Буцах" дарахад тухайн хуудас руу нь буцаж очно (vргэлж Нvvр биш)
  const goToDetail = (manga) => {
    setPreviousPage(page);
    setSelected(manga);
    setMangaNoteEditing(false);
    setPage('detail');
    // ЗАСВАР #203: энгийн (жирийн) навигацаар орж ирвэл vргэлж БvРЭН агуулгыг
    // (comments-only бус) харуулна — commentsOnlyView зөвхөн goToNotification-с
    // дараа нь тусад нь идэвхжvvлнэ.
    setCommentsOnlyView(false);
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
      [/rate limit/i, 'хэт олон удаа оролдлоо. Тvр хvлээгээд дахин оролдоно уу'],
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
  // мэдэгдлийн карт (toast). Мессежид "Алдаа" гэсэн vг байвал улаан, эс бол
  // ногоон хvрээтэй харагдана — ингэснээр 75 notify() дуудлагыг нэг нэгээр нь
  // төрөл ялгаж бичихийн оронд зvгээр л alert-ийг notify-гаар сольсон.
  // ЗАСВАР #189 (код шинжилгээ): useCallback-гvй бол render бvр шинэ функц
  // vvсч, vvнийг dependency болгож ашигладаг restoreFromPath ч render бvр
  // дахин vvсэж, popstate listener render бvр дахин бvртгэгддэг байв.
  const notify = useCallback((rawMessage) => {
    const message = translateErrorText(rawMessage);
    const type = /алдаа/i.test(message) ? 'error' : 'success';
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  // ШИНЭ (дизайн — сайжруулалт): гадны confetti library ашиглахгvйгээр, жижиг
  // өнгөт "particle" div-vvдийг document.body-д шууд нэмж, index.css-ийн
  // confetti-fall keyframe-ээр унагаад, анимэйшн дуусмагц устгана.
  const fireConfetti = useCallback(() => {
    const colors = ['#8B0000', '#ff5a5a', '#f5a623', '#ff8fa3', '#fff'];
    const count = 26;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.left = `${Math.random() * 100}vw`;
      el.style.background = colors[i % colors.length];
      el.style.animationDelay = `${Math.random() * 0.25}s`;
      el.style.animationDuration = `${1.1 + Math.random() * 0.9}s`;
      el.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2400);
    }
  }, []);

  // ШИНЭ: даалгавар биелvvлэх мэт "ёслолын" vед богинохон "чинь" гэсэн чимээ
  // (гадны аудио файлгvйгээр, Web Audio API-ээр шууд vvсгэнэ).
  const playChime = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [880, 1318.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + i * 0.09 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.09 + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.09);
        osc.stop(ctx.currentTime + i * 0.09 + 0.36);
      });
      setTimeout(() => ctx.close(), 700);
    } catch { /* аудио дэмжигдэхгvй орчинд чимээгvй алгасна */ }
  }, []);

  // Supabase-ээс манга татах — админ шинээр нэмсний дараа дахин дуудаж болохоор
  // тусдаа функц болгосон (ЗАСВАР: өмнө нь нэмсний дараа refresh хийх шаардлагатай байсан).
  const fetchMangas = useCallback(() => {
    // ЗАСВАР #159: select('*')-ийн оронд шаардлагатай баганаа зааж татна — egress багасна
    supabase.from('mangas')
      .select('id, title, description, genres, status, poster_url, banner_url, views, is_hidden, schedule_day, schedule_time, created_at, admin_note, is_recommended, restricted_role')
      .then(({ data, error }) => {
      if (error) console.error('Supabase манга алдаа:', error);
      if (data && data.length > 0) {
        setDbMangas(data.map(m => ({
          id: m.id,
          title: m.title,
          desc: m.description,
          // ЗАСВАР #56: хуучин ганц "genre" багана migration_5-аар бvх мөрөнд
          // "genres" рvv нэг удаа backfill хийгдсэн тул одоо зөвхөн vvнийг уншина
          genres: m.genres || [],
          status: m.status,
          poster: m.poster_url,
          banner_url: m.banner_url, // ШИНЭ: нvvр хэсгийн "Санал болгох" мөрөнд ашиглах урт нарийн зураг
          views: m.views || 0, // ШИНЭ: "Бvх гаргалт" хуудсыг vзэлтээр эрэмбэлэхэд ашиглана
          chapters: 0, // жинхэнэ тоог detail хуудсанд dbChapters-ээс харуулна (ЗАСВАР #6)
          is_hidden: m.is_hidden || false,
          schedule_day: m.schedule_day,
          schedule_time: m.schedule_time,
          created_at: m.created_at, // ШИНЭ: нvvр хэсгийн "Шинэ манга" мөрд ашиглана
          admin_note: m.admin_note, // ШИНЭ: манга хуудсанд admin бичдэг тэмдэглэл
          is_recommended: m.is_recommended || false, // ЗАСВАР #71: "Санал болгох" hero-д admin гараар сонгосон эсэх
          restricted_role: m.restricted_role || null, // ШИНЭ: тавигдсан бол зөвхөн тэр эрхтэй (мөн admin/moderator/editor)-д л харагдана
        })));
      }
      setMangasLoading(false);
    });
  }, []);

  // Нэвтрэх/эрх өөрчлөгдөхөд дахин татна (staff нуугдсан мангаг харна)
  useEffect(() => { fetchMangas(); }, [fetchMangas, isStaff]);

  // ЗАСВАР #15: гараар бичсэн демо жагсаалтыг (mangas) бvрэн хассан — манга
  // бvгд admin хуудаснаас DB-рvv орж ирдэг болсон тул зөвхөн dbMangas ашиглана.
  const allMangas = dbMangas;

  // ЗАСВАР #24: нvvр хэсгийн "Санал болгох" мөрийг сvvлийн 30 хоногт хамгийн их
  // vзэгдсэн 10 мангаар дvvргэнэ. Тоолол нь manga_view_events хvснэгт дэх
  // цаг тэмдэгтэй бодит vзэлтийн бvртгэлээс тооцогдоно (нийт views баганаас
  // ялгаатай нь — энэ зөвхөн сvvлийн 30 хоногийг харгалзана).
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

  // ЗАСВАР #71: "Санал болгох" hero-г автомат vзэлтийн тоогоор биш, admin-ийн
  // ГАРААР сонгосон 10 мангаар харуулна (шинэ сайтад vзэлтийн статистик бага/
  // найдваргvй байдаг тул admin-ийн шийдвэр илvv тохиромжтой). Хэрэв admin
  // хараахан юу ч сонгоогvй бол сvvлийн 30 хоногийн ТОП-руу, тэр ч байхгvй бол
  // эхний 10 манга руу нөөцөлнө.
  // ЗАСВАР #76: нvvр хэсгийн "САНАЛ БОЛГОХ" МӨР — зөвхөн admin-ийн гараар
  // сонгосон манга (30 хоногийн тренд рvv нөөцлөхгvй), тул hero-той давхцахгvй
  // тусдаа мөр болно.
  const curatedRecommended = allMangas.filter(m => m.is_recommended).slice(0, 10);

  // ЗАСВАР #87: hero-г дахин сvvлийн 30 хоногийн vзэлтээр тэргvvлэгчээр дvvргэнэ
  // (admin-ийн гараар сонгосон жагсаалт нь доор тусдаа "САНАЛ БОЛГОХ" мөрөнд
  // байгаа тул hero-той давхцах шаардлагагvй болсон).
  const recommendedMangas = (() => {
    if (topMangaIds && topMangaIds.length > 0) {
      const byId = topMangaIds.map(id => allMangas.find(m => m.id === id)).filter(Boolean);
      if (byId.length > 0) return byId;
    }
    return allMangas.slice(0, 10); // өгөгдөл дутуу/шинэ сайт vед нөөц жагсаалт
  })();

  // ШИНЭ (хэрэглэгчийн хvсэлт): нvvр хуудсанд сvvлийн 30 хоногийн ТОП
  // мангануудыг (hero-той адил topMangaIds өгөгдлөөр) дугаартай эрэмбийн
  // мөр болгож тусад нь харуулна — hero-гоос ялгаатай нь энд бодит vзэлтийн
  // ТОП байхгvй vед хоосон vлдэнэ (бvх мангаар "нөөцлөхгvй").
  const monthlyTopMangas = (topMangaIds || []).map(id => allMangas.find(m => m.id === id)).filter(Boolean);

  // ЗАСВАР #64: нvvр хэсгийн "Шинэ манга" мөр — саяхан нэмэгдсэн манганууд
  const newMangas = [...allMangas]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 10);

  // ЗАСВАР #57: full-width hero-г автоматаар эргvvлнэ (жижиг карт мөрийн scroll-ийн оронд)
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
  // ЗАСВАР #182 (код шинжилгээ): анхны deep-link сэргээлт (restoreFromPath)
  // profile ирэхийг хvлээхийн тулд энэ дуудлагын promise-ыг буцаах шаардлагатай
  // болсон (доор authReady-той хамт ашиглана) — өмнө нь юу ч буцаадаггvй байв.
  const fetchProfile = useCallback((userId) => {
    const applyData = (data) => {
      setUserRoles(data.roles || []);
      setUserProfile(data);
      setProfileName(data.name || '');
    };
    // ЗАСВАР (код шинжилгээ): flower_balance/loyalty_points багана DB дээр
    // (migration 35/38) vvсээгvй бол select бvхэлдээ алдаатай (data=null) болж,
    // роль/нэр/VIP мэт vндсэн мэдээлэл ч шинэчлэгдэхээ больж, admin товч бvр
    // алга болдог байсан. Иймд эхлээд бvтэн (шинэ 2 баганатай) select-ээр
    // оролдоод, тэр нь алдаатай бол ШИНЭ 2 баганагvйгээр дахин оролдож, ядаж
    // vндсэн профайл (роль/нэр/VIP)-ыг ямагт ачаалж чадахаар баталгаажуулна.
    return supabase.from('users').select('roles, name, avatar_url, is_vip, vip_expires_at, flower_balance, loyalty_points, sticker_1, sticker_2, sticker_3, sticker_4, sticker_5, sticker_6').eq('id', userId).single()
      .then(({ data, error }) => {
        if (data) { applyData(data); return; }
        console.error('fetchProfile алдаа (migration 35/38 ажиллуулсан эсэхээ шалгаарай), vндсэн баганаар дахин оролдож байна:', error);
        return supabase.from('users').select('roles, name, avatar_url, is_vip, vip_expires_at, sticker_1, sticker_2, sticker_3, sticker_4, sticker_5, sticker_6').eq('id', userId).single()
          .then(({ data: fallbackData, error: fallbackError }) => {
            if (fallbackError) { console.error('fetchProfile fallback алдаа:', fallbackError); return; }
            if (fallbackData) applyData(fallbackData);
          });
      });
  }, []);

  // ШИНЭ (хэрэглэгчийн хvсэлт): VIP хуудсанд орох бvрд цэцэг/од vлдэгдлийг
  // дахин татна — өмнө нь зөвхөн нэвтрэх vед/тодорхой vйлдлийн дараа л
  // шинэчлэгддэг байсан тул "Одоор VIP авах" хэсгийн од тоо хуучирсан
  // (буруу) хэвээр удаан харагддаг байсан.
  useEffect(() => {
    if (page === 'vip' && currentUser) fetchProfile(currentUser.id);
  }, [page, currentUser, fetchProfile]);

  // ШИНЭ: нууц vг сэргээх — имэйл рvv 8 оронтой код илгээнэ
  // (Supabase талд Authentication → Email Templates → Reset Password загварт
  // холбоос ({{ .ConfirmationURL }})-ны оронд {{ .Token }} гэж тавьсан байх ёстой,
  // эс тэгвэл имэйлд код биш холбоос ирнэ).
  const sendResetCode = async () => {
    // ЗАСВАР #156: маш хурдан давхар дарахад disabled attribute хараахан
    // идэвхжээгvй байж болзошгvй тул энд ч давхар шалгана
    if (resendCooldown > 0 || resetSending) return;
    if (!authForm.email.trim()) { notify('Имэйлээ оруулна уу!'); return; }
    setResetSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(authForm.email.trim());
      if (error) { notify('Алдаа: ' + error.message); return; }
      setResetCode('');
      setResetNewPassword('');
      setAuthPage('reset');
      setResendCooldown(30); // ЗАСВАР #40: дахин илгээхэд 30 секундын хvлээлт
      notify('Танд 8 оронтой баталгаажуулах код имэйлээр илгээгдлээ 📧');
    } catch (err) {
      notify('Алдаа: ' + err.message);
    } finally {
      setResetSending(false);
    }
  };

  // Дахин илгээх хvлээлтийн секундыг 1 секунд тутам бууруулна
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(prev => (prev <= 1 ? 0 : prev - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown > 0]);

  // ШИНЭ: илгээсэн кодыг шалгаад шинэ нууц vгийг хадгална
  const confirmResetCode = async () => {
    if (resetCode.trim().length !== 8) { notify('8 оронтой кодоо бvрэн оруулна уу!'); return; }
    if (resetNewPassword.length < 6) { notify('Шинэ нууц vг 6-с дээш тэмдэгттэй байх ёстой!'); return; }
    setResetSending(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: authForm.email.trim(),
        token: resetCode.trim(),
        type: 'recovery',
      });
      if (verifyError) { notify('Алдаа: ' + verifyError.message); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password: resetNewPassword });
      if (updateError) { notify('Алдаа: ' + updateError.message); return; }
      notify('Нууц vг амжилттай солигдлоо! Одоо шинэ нууц vгээрээ нэвтэрнэ vv 🎉');
      setResetCode('');
      setResetNewPassword('');
      setAuthPage('login');
    } catch (err) {
      notify('Алдаа: ' + err.message);
    } finally {
      setResetSending(false);
    }
  };

  // ШИНЭ: гарах (logout) — дэлгэрэнгvй профайл цонх болон утасны хурдан
  // цэс хоёулаа адилхан ашигладаг тул нэг газар гаргав (өмнө нь давхардсан байсан).
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setUserProfile(null);
    setProfileOpen(false);
    setProfileMenuOpen(false);
    setPage('home');
  };

  // ШИНЭ: Google-р нэвтрэх/бvртгvvлэх — Supabase Auth-ийн OAuth (PKCE) урсгал.
  // Supabase Dashboard → Authentication → Providers → Google дээр Google Client
  // ID/Secret-ээ тохируулж идэвхжvvлсэн байх ёстой (энд байхгvй бол "provider is
  // not enabled" алдаа буцна). Амжилттай бол Google өөрөө redirectTo хаяг руу
  // (?code=... query-той) буцаадаг тул vлдсэн хэсгийг доорх getSession/
  // onAuthStateChange effect-vvд аль хэдийн зохицуулна.
  const signInWithGoogle = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) { notify('Алдаа: ' + error.message); setGoogleLoading(false); }
      // Амжилттай бол browser даруй Google руу шилждэг тул энд setGoogleLoading(false)
      // дуудах шаардлагагvй (энэ component ч бас unmount болно).
    } catch (err) {
      notify('Алдаа: ' + err.message);
      setGoogleLoading(false);
    }
  };

  // ЗАСВАР #225 (код шинжилгээ): Нэвтрэх/Бvртгvvлэх гэх мэт модал цонх нээлттэй
  // vед Escape дарахад хаагдах болгов (өмнө нь зөвхөн ✕ дээр дарж л хаагддаг байсан).
  // ЗАСВАР #231 (код шинжилгээ): focus trap нэмэв — Tab дарахад модалын гадна
  // (жишээ нь арын sidebar/карт) руу фокус гарахгvй, зөвхөн модал дотор эргэнэ.
  const authDialogRef = useRef(null);
  useEffect(() => {
    if (!authPage) return;
    const onKey = e => {
      if (e.key === 'Escape') { setAuthPage(null); return; }
      if (e.key !== 'Tab' || !authDialogRef.current) return;
      const focusables = Array.from(
        authDialogRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter(el => !el.disabled && el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authPage]);

  // ЗАСВАР #182 (код шинжилгээ): анхны deep-link сэргээлт (доор, dbMangas
  // ирэнгvvт ажилладаг байсан) fetchProfile дуусахыг хvлээхгvйгээр isVip/isStaff-ыг
  // шалгадаг байсан тул VIP/staff хэрэглэгч шинээр (refresh/deep-link) орж
  // ирэхэд профайл хараахан ирээгvй байх vед "VIP биш" гэж буруу тодорхойлогдож
  // /vip рvv шидэгддэг race condition байв. authReady нь анхны session+profile
  // (аль аль нь байгаа тохиолдолд) шалгалт бvрэн дуусахыг илэрхийлнэ.
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // ЗАСВАР #55: имэйл баталгаажуулах холбоос дээр дараад сайт руу буцаж ирэхэд
    // (URL дээр code/access_token/type=signup гэх мэт vлдэгдэл байвал) хоосон/JSON
    // хуудас харагдахын оронд "Имэйл баталгаажлаа" гэсэн ойлгомжтой мэдэгдэл
    // харуулаад, URL-ыг цэвэрлэнэ.
    const url = window.location.href;
    // ЗАСВАР (Google нэвтрэлт): "type=signup/recovery/email" зөвхөн имэйл холбоос/
    // код баталгаажуулалтад хамаарна — Google OAuth редирект зөвхөн "code="-той
    // ирдэг тул type=... байхгvй vед "Имэйл баталгаажлаа" гэж буруу бичихгvйн тулд
    // хоёрыг тусад нь ялгав.
    const isEmailConfirmCallback = /type=(signup|recovery|email)/.test(url);
    const isAuthCallback = /[?&#](code|access_token)=/.test(url) || isEmailConfirmCallback;
    // ЗАСВАР (давхар "Амжилттай нэвтэрлээ" мэдэгдлийн алдаа): React.StrictMode
    // dev орчинд энэ effect-г 2 удаа дараалан ажиллуулдаг тул, URL цэвэрлэлтийг
    // өмнө нь async .then() дотор (session ирсний дараа) хийдэг байсан тул хоёр
    // дуудлага ХОЁУЛАА хараахан цэвэрлэгдээгvй "бохир" URL-ыг хараад мэдэгдлийг
    // 2 удаа гаргадаг байв. Одоо URL-ыг СИНХРООР шууд эндээс цэвэрлэснээр,
    // StrictMode-ийн 2 дахь дуудлага аль хэдийн цэвэр URL хардаг болж, давхардал арилна.
    if (isAuthCallback) window.history.replaceState(null, '', window.location.pathname);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setCurrentUser(session.user);
        // ЗАСВАР #182: анхны authReady-г зөвхөн profile татагдаж дуусахад тавина
        // (fetchProfile одоо promise буцаадаг болсон) — эс бол isVip/isStaff
        // хараахан шинэчлэгдээгvй vед deep-link сэргээлт хийгдэх эрсдэлтэй.
        fetchProfile(session.user.id).then(() => setAuthReady(true)).catch(() => setAuthReady(true));
        if (isAuthCallback) notify(isEmailConfirmCallback ? 'Имэйл баталгаажлаа! Тавтай морилно уу 🎉' : 'Амжилттай нэвтэрлээ! Тавтай морилно уу 🎉');
      } else {
        setAuthReady(true);
      }
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

  // ЗАСВАР #206 (хэрэглэгчийн хvсэлт): утасны browser (Safari/Chrome) tab-ыг
  // удаан хугацаагаар background-д байлгахад JS timer царцдаг тул supabase-js-ийн
  // автомат token-refresh цагтаа ажиллахгvй vлдэж, хэрэглэгч буцаж ороход session
  // хугацаа дууссан мэт (дахин нэвтрэх шаардлагатай мэт) харагддаг байв. Tab
  // дахин "visible" болох бvрт session-ийг шинээр шалгаж (шаардлагатай бол
  // supabase-js өөрөө автоматаар refresh хийдэг) currentUser/profile-г
  // тэрхvv жинхэнэ төлөвтэй нь синк хийнэ.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setCurrentUser(session.user);
          fetchProfile(session.user.id);
        } else {
          setCurrentUser(null);
          setUserRoles([]);
          setUserProfile(null);
        }
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchProfile]);

  // ЗАСВАР #99: URL routing — хуудас бvр өөрийн URL-тэй болгож, browser-ийн
  // native буцах/урагшаа товч (мөн refresh) зөв ажилладаг болгов. Өмнө нь
  // бvх навигац зөвхөн React state-ээр (URL хэзээ ч солигдохгvй) хийгддэг
  // байсан тул browser буцах товч дарахад сайтаас шууд гардаг байсан.
  const isPopStateNav = useRef(false);
  const didInitialRestore = useRef(false);
  const reelVideoRefs = useRef({});
  // ШИНЭ: тусдаа дуу (video эсвэл зурган цуврал reel-д) + хэрэглэгчийн гараар
  // хажуу тийш нь эргvvлдэг зурган цувралын идэвхтэй индексийг удирдах ref/state.
  const reelAudioRefs = useRef({});
  // ЗАСВАР (алдаа): <audio> элемент хэмжээгvй (0x0) тул IntersectionObserver
  // vvнийг шууд ажигласан vед хэзээ ч "харагдаж байна" гэж тооцдоггvй, тиймээс
  // тусдаа дуутай reel (ялангуяа зурган цуврал горим) дуугvй vлддэг байв —
  // оронд нь бvтэн өндөртэй reel-ийн КОНТЕЙНЕРийг ажиглана.
  const reelContainerRefs = useRef({});
  const [reelSlideshowIndex, setReelSlideshowIndex] = useState({});
  // ЗАСВАР #100: deep-link (жишээ нь /manga/2 руу шууд орох эсвэл refresh хийх)
  // vед dbMangas ирэхээс ӨМНӨ sync effect ажиллаж, URL-ыг '/' болгож дарж бичдэг
  // байсан bug-ыг засав — одоо анхны сэргээлт дуустал sync хийхгvй хvлээнэ.
  const [routeReady, setRouteReady] = useState(() => window.location.pathname === '/');

  const computePath = useCallback(() => {
    if (page === 'detail' && selected) return `/manga/${selected.id}`;
    if (page === 'reader' && selected && selectedChapter) return `/manga/${selected.id}/chapter/${selectedChapter.chapter_number}`;
    if (page === 'home') return '/';
    return `/${page}`;
  }, [page, selected, selectedChapter]);

  // ШИНЭ: манга хуваалцах цэс — Facebook/холбоос хуулах/системийн share sheet-ийн
  // хамт "Хувийн чат руу хуваалцах" сонголтыг ч багтаасан тул одоо (mobile ч
  // хамаагvй) vргэлж НЭГ dropdown цэс нээгдэнэ, native share нь дотор нь сонголт болно.
  const shareManga = () => {
    setShareMenuOpen(o => !o);
  };
  const shareMangaNative = (manga) => {
    const url = `${window.location.origin}/manga/${manga.id}`;
    navigator.share({ title: manga.title, url }).catch(() => {});
    setShareMenuOpen(false);
  };
  const shareToFacebook = (manga) => {
    const url = `${window.location.origin}/manga/${manga.id}`;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer,width=600,height=520');
    setShareMenuOpen(false);
  };
  const copyMangaLink = async (manga) => {
    const url = `${window.location.origin}/manga/${manga.id}`;
    try {
      await navigator.clipboard.writeText(url);
      notify('Холбоос хуулагдлаа 📋');
    } catch {
      notify('Холбоос хуулж чадсангvй');
    }
    setShareMenuOpen(false);
  };
  // ШИНЭ: сонгосон хvнд тухайн манганы карт бvхий DM мессеж шууд илгээнэ
  // (thread нээхгvйгээр, "хуваалцлаа" гэсэн товч мэдэгдлээр баталгаажуулна).
  const shareMangaToUser = async (manga, partner) => {
    if (mangaShareSendingId) return;
    setMangaShareSendingId(partner.id);
    try {
      const { error } = await supabase.from('direct_messages').insert({
        sender_id: currentUser.id, recipient_id: partner.id, message_type: 'manga_share', manga_id: manga.id,
      });
      if (error) {
        if (/blocked/.test(error.message || '')) notify('Энэ хэрэглэгчтэй харилцах боломжгvй байна.');
        else notify('Алдаа: ' + error.message);
        return;
      }
      notify(`${partner.name || 'Хэрэглэгч'}-д "${manga.title}" илгээгдлээ! 📖`);
      setMangaShareOpen(false);
      setMangaShareQuery('');
      setShareMenuOpen(false);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setMangaShareSendingId(null);
    }
  };
  useEffect(() => {
    const q = mangaShareQuery.trim();
    if (!q) { setMangaShareResults([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      supabase.rpc('search_users', { query_in: q }).then(({ data, error }) => {
        if (cancelled || error) return;
        setMangaShareResults(data || []);
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mangaShareQuery]);

  // ШИНЭ (SEO): SPA тул бvх хуудас index.html-ийн НЭГ ижил <title>/meta
  // description-той байсан — Google/browser tab хуудас бvрийг ялгаж чадахгvй
  // байв. Хуудас солигдох бvрт эдгээрийг тухайн агуулгад тохируулж шинэчилнэ.
  useEffect(() => {
    const SITE_NAME = 'Roselle Manga';
    const DEFAULT_TITLE = 'Roselle Manga — Монгол хэл дээрх манга, манхва унших сайт';
    const DEFAULT_DESC = 'Roselle Manga (rosellemanga.mn) — Монгол хэлээр орчуулсан манга, манхва, вэбтvvнийг vнэгvй унших цахим сайт. Шинэ бvлэг өдөр бvр нэмэгддэг.';
    let title = DEFAULT_TITLE;
    let description = DEFAULT_DESC;
    if (page === 'detail' && selected) {
      title = `${selected.title} — ${SITE_NAME}`;
      description = (selected.desc || '').trim().slice(0, 160) || DEFAULT_DESC;
    } else if (page === 'reader' && selected && selectedChapter) {
      title = `${selected.title} — Бvлэг ${selectedChapter.chapter_number} — ${SITE_NAME}`;
    } else if (page === 'all') {
      title = `Бvх манга, манхва — ${SITE_NAME}`;
    } else if (page === 'schedule') {
      title = `Гарах хуваарь — ${SITE_NAME}`;
    } else if (page === 'vip') {
      title = `VIP эрх авах — ${SITE_NAME}`;
    } else if (page === 'library') {
      title = `Миний сан — ${SITE_NAME}`;
    }
    document.title = title;
    const setMeta = (selector, attr, value) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
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
              // ЗАСВАР (хэрэглэгчийн хvсэлт — "цэцэг" систем): openReader-тэй ижил
              // идэвхтэй chapter_unlocks шалгалт хийнэ.
              (currentUser
                ? supabase.from('chapter_unlocks').select('expires_at').eq('user_id', currentUser.id).eq('chapter_id', data.id).gt('expires_at', new Date().toISOString()).maybeSingle()
                : Promise.resolve({ data: null })
              ).then(({ data: unlock }) => {
                if (unlock) { setSelectedChapter(data); setPage('reader'); return; }
                setVipGate({ manga, chapter: data });
              });
              return;
            }
            if (chapterLocked(data) && !isStaff) {
              notify(`⏳ Энэ бvлэг ${formatRemaining(new Date(data.publish_at).getTime() - nowTs)}-ийн дараа нээгдэнэ!`);
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
  // ЗАСВАР #182 (код шинжилгээ): authReady хvртэл хvлээнэ — эс бол VIP/staff
  // хэрэглэгчийн профайл (isVip/isStaff) хараахан ирээгvй vед deep-link
  // сэргээлт буруу (эрхгvй мэт) шийдэгдэх race condition vvсдэг байв.
  useEffect(() => {
    if (didInitialRestore.current || dbMangas.length === 0 || !authReady) return;
    didInitialRestore.current = true;
    const pathname = window.location.pathname;
    if (pathname && pathname !== '/') {
      isPopStateNav.current = true;
      restoreFromPath(pathname);
    }
    setRouteReady(true);
  }, [dbMangas, restoreFromPath, authReady]);

  // Browser-ийн буцах/урагшаа товч дарахад URL-аас дахин state сэргээнэ
  useEffect(() => {
    const onPopState = () => {
      isPopStateNav.current = true;
      restoreFromPath(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [restoreFromPath]);

  // Хуудас/манга/бvлэг солигдох бvрт URL-ыг синк хийнэ (popstate-с vvдсэн
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
    // ЗАСВАР #239 (код шинжилгээ): өмнө нь зөвхөн page === 'detail' vед л
    // dbChapters-ыг fetch хийдэг байсан тул, хэрэглэгч дэлгэрэнгvй хуудсаар
    // ДАМЖИЛГvйгээр шууд бvлэг унших руу орвол (жишээ нь нvvр хуудасны "Шинэ
    // бvлэг" карт эсвэл мэдэгдлээс openReader шууд дуудагдахад page нэг мөр
    // 'reader' болдог, 'detail' огт болдоггvй) dbChapters хоосон vлдэж,
    // унших дэлгэцийн Дараах/Өмнөх бvлэг товч (мөн доод хяналтын мөр) ажиллахгvй
    // болдог байв — 'reader' хуудсанд ч мөн адил хэрэгтэй тул нэмэв.
    if ((page !== 'detail' && page !== 'reader') || !selected) return;
    // ЗАСВАР #10: манга хурдан сольход хуучин хvсэлт хожуу ирж шинэ жагсаалтыг
    // дарж бичихээс сэргийлнэ (race condition).
    let cancelled = false;
    // Энгийн хэрэглэгч зөвхөн нийтлэгдсэн, нуугдаагvй бvлгийг харна; staff бvгдийг харна
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

  // ШИНЭ: манга дэлгэрэнгvй хуудсыг нээх бvрт vзэлтийг DB талд атомаар нэмэгдvvлнэ
  // ("Бvх гаргалт" хуудсанд vзэлтээр эрэмбэлэхэд ашиглана)
  useEffect(() => {
    if (page !== 'detail' || !selected) return;
    // ЗАСВАР #120: supabase-js-ийн query builder нь "lazy thenable" тул .then()
    // дуудаагvй бол бодит HTTP хvсэлт ОГТ явдаггvй (bare дуудлага чимээгvй
    // юу ч хийдэггvй байсан) — тиймээс vзэлт бодит DB-д хэзээ ч нэмэгдэхгvй,
    // харин client талд л тvр (session доторх) нэмэгдсэн мэт харагддаг байв.
    // ЗАСВАР #139: зочин (нэвтрээгvй) хэрэглэгчийг ялгах key дамжуулж, ижил
    // vзэгч давтан vзэхэд vзэлтийг дахин тоолохгvй байхаар server талд шvvнэ.
    // ЗАСВАР #190 (код шинжилгээ): RPC одоо ЖИНХЭНЭ шинэ тооллого хийсэн эсэхийг
    // (boolean) буцаадаг болсон тул зөвхөн тэр vед л client талын +1-ийг хийнэ —
    // өмнө нь vргэлж +1 хийдэг байсан тул нэг хэрэглэгч давтан орж ирэхэд
    // дэлгэц дээрх тоо DB-ийнхээс хэтэрдэг (давхар тоологддог) байв.
    supabase.rpc('increment_manga_views', { input_id: selected.id, viewer_key: getAnonViewerKey() })
      .then(({ data: wasCounted, error }) => {
        if (error) { console.error('Vзэлт нэмэгдvvлэх алдаа:', error); return; }
        if (!wasCounted) return;
        setDbMangas(prev => prev.map(m => m.id === selected.id ? { ...m, views: (m.views || 0) + 1 } : m));
        setSelected(prev => prev && prev.id === selected.id ? { ...prev, views: (prev.views || 0) + 1 } : prev);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selected?.id]);

  // ЗАСВАР #109: манга дэлгэрэнгvй хуудсанд орох бvрт vнэлгээ + манганы
  // ерөнхий сэтгэгдлийг татна (tab солиход дахин дуудахгvйгээр урьдчилж бэлдэнэ).
  useEffect(() => {
    if (page !== 'detail' || !selected) return;
    let cancelled = false;
    fetchMangaRatings(selected.id, () => cancelled);
    fetchMangaComments(selected.id, () => cancelled);
    if (skipDetailTabResetRef.current) {
      skipDetailTabResetRef.current = false;
    } else {
      setDetailTab('chapters');
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selected?.id]);

  useEffect(() => {
    if (page !== 'reader' || !selectedChapter) return;
    // ЗАСВАР #10: бvлэг хурдан сольход хуучин зураг/сэтгэгдлийн хvсэлт хожуу ирж
    // шинэ бvлгийн дээр буухаас сэргийлнэ.
    let cancelled = false;
    setChapterImages([]); // өмнөх бvлгийн зураг тvр харагдахаас сэргийлнэ
    setResumeBanner(null);
    supabase.from('chapter_images').select('id, chapter_id, image_url, page_number, width, height').eq('chapter_id', selectedChapter.id).order('page_number')
      .then(({ data }) => {
        if (cancelled || !data) return;
        setChapterImages(data);
        // ШИНЭ (хэрэглэгчийн хvсэлт): өмнө уншиж явсан байрлал хадгалагдсан бол
        // чимээгvй буцаж очихын оронд "Vргэлжлvvлэн уншиx уу?" banner харуулж,
        // хэрэглэгчид сонголт өгнө (3%-95% хооронд утга байвал л — эхлэл/төгсгөлд
        // ойрхон бол banner-ын хэрэггvй).
        try {
          const raw = localStorage.getItem(`reader_scroll_${selectedChapter.id}`);
          if (raw) {
            const saved = JSON.parse(raw);
            const percent = saved?.percent ?? 0;
            if (saved?.y > 0 && percent >= 3 && percent <= 95) {
              const totalPages = data.length;
              const pageNum = Math.max(1, Math.min(totalPages, Math.round((percent / 100) * totalPages)));
              setResumeBanner({ y: saved.y, percent, pageNum, totalPages });
            }
          }
        } catch { /* Safari private mode гэх мэтэд localStorage хаалттай байж болно */ }
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
    // ЗАСВАР (алдаа): өмнө нь video/audio элементvvдийг шууд ажигладаг байсан ч
    // <audio> нь хэмжээгvй (0x0) тул IntersectionObserver "харагдаж байна" гэж
    // хэзээ ч тэмдэглэдэггvй, тиймээс тусдаа дуутай reel (ялангуяа зурган
    // цуврал горимд, видеогvй) дуугvй vлддэг байв. Одоо бvтэн өндөртэй
    // reel-ийн КОНТЕЙНЕРийг ажиглаад, тухайн reel-ийн video/audio-г хамт
    // тоглуулж/зогсооно.
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const reelId = entry.target.dataset.reelId;
        const video = reelVideoRefs.current[reelId];
        const audio = reelAudioRefs.current[reelId];
        if (entry.isIntersecting) {
          video?.play().catch(() => {});
          audio?.play().catch(() => {});
        } else {
          video?.pause();
          audio?.pause();
        }
      });
    }, { threshold: 0.6 });
    Object.values(reelContainerRefs.current).forEach(el => observer.observe(el));

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

  // ШИНЭ: staff (admin/moderator/editor)-т зориулсан "шинэ сэтгэгдэл" мэдэгдлийн
  // хонх — сайт даяар (бvх манга/бvлэг) сvvлийн 30 сэтгэгдлийг 30 секунд тутам
  // татаж, хамгийн сvvлд харсан (localStorage-д хадгалсан) цагаас хойшхыг
  // "уншаагvй" гэж vзнэ. Comments select RLS policy бvгдэд нээлттэй тул нэмэлт
  // эрхийн шалгалт шаардлагагvй, харин UI-г зөвхөн isStaff vед л харуулна.
  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    const fetchActivity = () => {
      // ЗАСВАР #222 (код шинжилгээ): таб/апп ард нуугдсан vед (visibilityState
      // !== 'visible') 30 секунд тутам дэмий query явуулж дата/батарей
      // зарцуулахгvй байхын тулд алгасна — дэлгэц дээр буцаж ирэхэд дараагийн
      // 30 секундийн tick дээр л дахин татна.
      if (document.visibilityState !== 'visible') return;
      supabase.from('comments')
        .select('id, content, sticker_url, created_at, user_id, chapter_id, manga_id, chapters(chapter_number, manga_id, is_vip, status, is_hidden, pending_delete, publish_at, created_at, thumbnail_url, mangas(id, title)), mangas(id, title)')
        .order('created_at', { ascending: false })
        .limit(30)
        .then(async ({ data, error }) => {
          if (cancelled || error) return;
          const list = await attachAuthors(data || []);
          if (!cancelled) setRecentActivity(list);
        });
    };
    fetchActivity();
    // ЗАСВАР (хэрэглэгчийн хvсэлт — гvйцэтгэлийн сайжруулалт): олон хэрэглэгчид
    // зэрэг ажилладаг тул нийт ачааллыг багасгахын тулд 30с → 90с болгов
    // (энэ мэдэгдэл бага зэрэг хоцрох нь staff-д онц асуудалгvй).
    const interval = setInterval(fetchActivity, 90000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isStaff]);

  // ШИНЭ: энгийн/VIP (staff БИШ) хэрэглэгчид зөвхөн ӨӨРСДИЙНХ нь сэтгэгдэлд
  // ирсэн reply болон ❤️ like-ийг л мэдэгдэл болгож харуулна — staff-ийн дээрх
  // "сайт даяарх" мэдэгдлээс ялгаатай, зөвхөн хувийн idsv шvvгдсэн.
  useEffect(() => {
    if (!currentUser || isStaff) return;
    let cancelled = false;
    const fetchPersonal = async () => {
      // ЗАСВАР #222 (код шинжилгээ): дээрх fetchActivity-тэй адил, таб ард
      // нуугдсан vед дэмий query явуулахгvй.
      if (document.visibilityState !== 'visible') return;
      // 1) миний сvvлийн 50 сэтгэгдлийн id — reply/like-ийн эх (query-г хязгаарлана)
      const { data: ownComments } = await supabase.from('comments')
        .select('id').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(50);
      const ownIds = (ownComments || []).map(c => c.id);
      if (cancelled) return;

      // ШИНЭ: batlagдсан (admin "БАТЛАХ" дарсан) сvvлийн VIP хvсэлтvvд —
      // "VIP эрх сунгагдлаа" мэдэгдлийн эх vvсвэр.
      const vipReqPromise = supabase.from('payment_requests')
        .select('id, plan_key, status, reviewed_at')
        .eq('user_id', currentUser.id).eq('status', 'approved')
        .order('reviewed_at', { ascending: false }).limit(5);

      // ШИНЭ (хэрэглэгчийн хvсэлт): шинэ даалгавар нэмэгдэхэд бvх хэрэглэгчид
      // хонхон дээр мэдэгдэл харагдана — сvvлийн 5 идэвхтэй даалгаврыг татна.
      const newTasksPromise = supabase.from('tasks')
        .select('id, title, created_at')
        .eq('is_active', true).order('created_at', { ascending: false }).limit(5);

      // ШИНЭ (хэрэглэгчийн хvсэлт): admin миний санал хvсэлтэд хариу бичихэд
      // мэдэгдэл ирнэ — feedback_messages-ийн RLS аль хэдийн зөвхөн ӨӨРИЙН
      // санал хvсэлт рvv хязгаарласан тул нэмэлт шvvлт хэрэггvй.
      const feedbackRepliesPromise = supabase.from('feedback_messages')
        .select('id, message, created_at, feedback_id')
        .eq('is_staff', true).order('created_at', { ascending: false }).limit(5);

      // ШИНЭ (хэрэглэгчийн хvсэлт): миний хандивыг admin "шийдэгдсэн" гэж
      // тэмдэглэсэн (баталгаажуулсан) даруйд автоматаар "баярлалаа" мэдэгдэл очно.
      const donationThanksPromise = supabase.from('feedback')
        .select('id, resolved_at, resolver:users!resolved_by(name)')
        .eq('user_id', currentUser.id).eq('category', 'donation').eq('status', 'resolved')
        .order('resolved_at', { ascending: false }).limit(5);

      // ШИНЭ (хэрэглэгчийн хvсэлт): "Admin дэмжих" (урьд нь "Ажилтныг урамшуулах")-аар
      // надад ирсэн дэмжих vг+од — мэдэгдлийн хонхонд харагдах ёстой.
      const appreciationReceivedPromise = supabase.from('staff_appreciations')
        .select('id, amount, message, created_at, sender:users!sender_id(name, avatar_url)')
        .eq('staff_id', currentUser.id).order('created_at', { ascending: false }).limit(10);
      // ШИНЭ: admin бол БvХ staff-д илгээгдсэн дэмжих мэдэгдлийг ч (хяналтын
      // хувиар) хvлээж авна — staff_appreciations RLS admin-д бvгдийг унших
      // эрх өгсөн тул зvгээр л staff_id != өөрөө гэж шvvнэ.
      const appreciationOversightPromise = isAdmin
        ? supabase.from('staff_appreciations')
            .select('id, amount, message, created_at, sender:users!sender_id(name), recipient:users!staff_id(name)')
            .neq('staff_id', currentUser.id).order('created_at', { ascending: false }).limit(10)
        : Promise.resolve({ data: [] });

      // ШИНЭ (хэрэглэгчийн хvсэлт): admin/moderator/editor надад vнэгvй цэцэг
      // бэлэглэхэд (staff_flower_gifts) хонхон дээр мэдэгдэл харагдана.
      const staffGiftReceivedPromise = supabase.from('staff_flower_gifts')
        .select('id, amount, created_at, sender:users!staff_id(name, avatar_url)')
        .eq('recipient_id', currentUser.id).order('created_at', { ascending: false }).limit(10);

      // ЗАСВАР: өмнө нь ownIds хоосон vед funcion шууд return хийж, доорхи VIP
      // мэдэгдлийг ч алгасдаг байсан (сэтгэгдэл vvсгээгvй шинэ хэрэглэгч VIP
      // авсан ч мэдэгдэл огт харагдахгvй байх эрсдэлтэй) — одоо reply/like
      // хэсгийг л ownIds-с хамааруулж, VIP хэсгийг vvнээс vл хамааруулав.
      let replies = [], likes = [];
      if (ownIds.length > 0) {
        const [repliesRes, likesRes] = await Promise.all([
          supabase.from('comments')
            .select('id, content, sticker_url, created_at, user_id, chapter_id, manga_id, chapters(chapter_number, manga_id, is_vip, status, is_hidden, pending_delete, publish_at, created_at, thumbnail_url, mangas(id, title)), mangas(id, title)')
            .in('parent_id', ownIds).neq('user_id', currentUser.id)
            .order('created_at', { ascending: false }).limit(20),
          supabase.from('comment_likes')
            .select('comment_id, user_id, created_at, comments!comment_id(content, chapter_id, manga_id, chapters(chapter_number, manga_id, is_vip, status, is_hidden, pending_delete, publish_at, created_at, thumbnail_url, mangas(id, title)), mangas(id, title))')
            .in('comment_id', ownIds).neq('user_id', currentUser.id)
            .order('created_at', { ascending: false }).limit(20),
        ]);
        if (cancelled) return;
        replies = (repliesRes.data || []).map(r => ({
          id: `reply-${r.id}`, kind: 'reply', user_id: r.user_id, created_at: r.created_at,
          content: r.content, sticker_url: r.sticker_url,
          chapter_id: r.chapter_id, manga_id: r.manga_id, chapters: r.chapters, mangas: r.mangas,
        }));
        likes = (likesRes.data || []).map(l => ({
          id: `like-${l.comment_id}-${l.user_id}-${l.created_at}`, kind: 'like', user_id: l.user_id, created_at: l.created_at,
          content: l.comments?.content, sticker_url: null,
          chapter_id: l.comments?.chapter_id, manga_id: l.comments?.manga_id, chapters: l.comments?.chapters, mangas: l.comments?.mangas,
        }));
      }

      const [{ data: approvedVip }, { data: newTasks }, { data: newFeedbackReplies }, { data: donationThanks }, { data: appreciationsReceived }, { data: appreciationsOversight }, { data: staffGiftsReceived }] = await Promise.all([vipReqPromise, newTasksPromise, feedbackRepliesPromise, donationThanksPromise, appreciationReceivedPromise, appreciationOversightPromise, staffGiftReceivedPromise]);
      if (cancelled) return;
      const withAuthors = await attachAuthors([...replies, ...likes]);
      // ЗАСВАР: attachAuthors нь user_id-аар get_public_profiles дуудаж зохиогчийг
      // татдаг тул VIP мэдэгдлийг (currentUser.id-тай) хамт өнгөрvvлбэл өөрийнхөө
      // профайл руу attach хийгдэх тул эдгээрийг ТУСДАА, статик "Roselle Manga"
      // эзэмшигчтэйгээр (одоогийн хэрэглэгчийн profile биш) доор нэмнэ.
      const vipItems = (approvedVip || []).filter(r => r.reviewed_at).map(r => {
        const plan = PLANS.find(p => p.key === r.plan_key);
        const days = PLAN_DAYS[r.plan_key] || 30;
        return {
          id: `vip-${r.id}`, kind: 'vip_approved', user_id: currentUser.id, created_at: r.reviewed_at,
          content: `${plan ? plan.label : r.plan_key} багц · ${days} хоног`,
          sticker_url: null, chapter_id: null, manga_id: null, chapters: null, mangas: null,
          users: { name: 'Roselle Manga', avatar_url: null },
        };
      });
      // ШИНЭ: шинэ даалгавар + admin-ий санал хvсэлтэд өгсөн хариу — хоёулаа
      // статик "Roselle Manga" эзэмшигчтэй (vip мэдэгдэлтэй адил зарчим).
      const newTaskItems = (newTasks || []).map(t => ({
        id: `task-${t.id}`, kind: 'new_task', user_id: currentUser.id, created_at: t.created_at,
        content: t.title, sticker_url: null, chapter_id: null, manga_id: null, chapters: null, mangas: null,
        users: { name: 'Roselle Manga', avatar_url: null },
      }));
      const feedbackReplyItems = (newFeedbackReplies || []).map(m => ({
        id: `fbreply-${m.id}`, kind: 'feedback_reply', user_id: currentUser.id, created_at: m.created_at,
        content: m.message, sticker_url: null, chapter_id: null, manga_id: null, chapters: null, mangas: null,
        users: { name: 'Roselle Manga', avatar_url: null },
      }));
      // ЗАСВАР (хэрэглэгчийн хvсэлт): аль admin баталгаажуулсныг нэрээр нь дурдана.
      const donationThanksItems = (donationThanks || []).filter(d => d.resolved_at).map(d => ({
        id: `donation-${d.id}`, kind: 'donation_thanked', user_id: currentUser.id, created_at: d.resolved_at,
        content: `${d.resolver?.name || 'Admin'} танд баярлалаа!`, sticker_url: null, chapter_id: null, manga_id: null, chapters: null, mangas: null,
        users: { name: 'Roselle Manga', avatar_url: null },
      }));
      // ШИНЭ: надад ирсэн "Admin дэмжих" vг+од.
      const appreciationReceivedItems = (appreciationsReceived || []).map(a => ({
        id: `appr-${a.id}`, kind: 'appreciation_received', user_id: currentUser.id, created_at: a.created_at,
        content: `${a.sender?.name || 'Хэрэглэгч'}: ${a.message || `${a.amount} од илгээлээ`}`,
        sticker_url: null, chapter_id: null, manga_id: null, chapters: null, mangas: null,
        users: { name: a.sender?.name || 'Хэрэглэгч', avatar_url: a.sender?.avatar_url || null },
      }));
      // ШИНЭ: admin-д зориулсан бусад staff-д илгээгдсэн дэмжих vгсийн хяналтын хувь.
      const appreciationOversightItems = (appreciationsOversight || []).map(a => ({
        id: `appr-ov-${a.id}`, kind: 'appreciation_oversight', user_id: currentUser.id, created_at: a.created_at,
        content: `${a.sender?.name || 'Хэрэглэгч'} → ${a.recipient?.name || 'Ажилтан'}: ${a.message || `${a.amount} од`}`,
        sticker_url: null, chapter_id: null, manga_id: null, chapters: null, mangas: null,
        users: { name: 'Roselle Manga', avatar_url: null },
      }));
      // ШИНЭ (хэрэглэгчийн хvсэлт): admin/moderator/editor надад vнэгvй цэцэг
      // бэлэглэсэн бол хонхон дээр мэдэгдэнэ.
      const staffGiftReceivedItems = (staffGiftsReceived || []).map(g => ({
        id: `staffgift-${g.id}`, kind: 'staff_gift_received', user_id: currentUser.id, created_at: g.created_at,
        content: `${g.sender?.name || 'Ажилтан'} танд ${g.amount} цэцэг бэлэглэлээ`,
        sticker_url: null, chapter_id: null, manga_id: null, chapters: null, mangas: null,
        users: { name: g.sender?.name || 'Ажилтан', avatar_url: g.sender?.avatar_url || null },
      }));
      const merged = [...withAuthors, ...vipItems, ...newTaskItems, ...feedbackReplyItems, ...donationThanksItems, ...appreciationReceivedItems, ...appreciationOversightItems, ...staffGiftReceivedItems].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 30);
      if (!cancelled) setPersonalActivity(merged);
    };
    fetchPersonal();
    // ЗАСВАР (хэрэглэгчийн хvсэлт — гvйцэтгэлийн сайжруулалт): энэ query олон
    // хvснэгт (payment_requests, tasks, feedback, staff_appreciations г.м.)
    // хамруулдаг хамгийн "хvнд" polling тул хамгийн олон хэрэглэгчид зэрэг
    // ажилладаг — нийт ачааллыг багасгахын тулд 30с → 90с болгов.
    const interval = setInterval(fetchPersonal, 90000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [currentUser, isStaff]);

  // Хэрэглэгчийн role-оос хамааран аль мэдэгдлийн жагсаалтыг харуулахыг сонгоно
  const activeNotifFeed = isStaff ? recentActivity : personalActivity;
  const notifStorageKey = isStaff ? 'staff_notif_last_seen_at' : `personal_notif_last_seen_${currentUser?.id || ''}`;

  // "Сvvлд харсан" цагийг тухайн хэрэглэгч/feed-ийн localStorage key-ээс уншина
  useEffect(() => {
    if (!currentUser) { setNotifLastSeenAt(0); return; }
    try { setNotifLastSeenAt(Number(localStorage.getItem(notifStorageKey)) || 0); } catch { setNotifLastSeenAt(0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, isStaff]);

  const unreadNotifCount = activeNotifFeed.filter(c => new Date(c.created_at).getTime() > notifLastSeenAt).length;

  // Хонх дарахад цонх нээгдэх/хаагдах, НЭЭГДЭХ vед л "сvvлд харсан" цагийг шинэчилнэ
  const toggleNotif = () => {
    setNotifOpen(prev => {
      const next = !prev;
      if (next) {
        const now = Date.now();
        setNotifLastSeenAt(now);
        try { localStorage.setItem(notifStorageKey, String(now)); } catch { /* хор хөнөөлгvй */ }
      }
      return next;
    });
  };

  // ЗАСВАР #201 (хэрэглэгчийн хvсэлт): мэдэгдэл дээр дарахад зөвхөн манганы
  // дэлгэрэнгvй хуудас руу орчихдог байсныг засав — одоо бvлгийн сэтгэгдэл бол
  // ШУУД тухайн бvлгийг (унших хэсэгт) нээж, сэтгэгдлийн хэсэг рvv хvргэнэ;
  // манганы ерөнхий сэтгэгдэл бол дэлгэрэнгvй хуудасны "vнэлгээ+сэтгэгдэл" tab-ыг
  // шууд нээнэ.
  const goToNotification = (item) => {
    setNotifOpen(false);
    // ШИНЭ: "VIP эрх сунгагдлаа" мэдэгдэл — бvлэг/манга биш тул профайлын
    // (avatar дээр дарахад гардаг) VIP тэмдэг рvv шууд чиглvvлнэ.
    if (item.kind === 'vip_approved') { setProfileOpen(true); return; }
    // ШИНЭ: "шинэ даалгавар" / "санал хvсэлтэд хариу ирлээ" мэдэгдлvvд —
    // харгалзах хуудас руу шууд чиглvvлнэ.
    if (item.kind === 'new_task') { setPage('tasks'); return; }
    if (item.kind === 'feedback_reply') { setPage('feedback'); return; }
    if (item.kind === 'donation_thanked') { setPage('feedback'); return; }
    if (item.kind === 'appreciation_received' || item.kind === 'appreciation_oversight') { setPage('feedback'); return; }
    // ШИНЭ: staff-ийн бэлэглэсэн цэцэг DM мессеж хэлбэрээр ирдэг тул чат руу.
    if (item.kind === 'staff_gift_received') { setPreviousPage(page); setPage('chat'); setChatMode('inbox'); return; }
    if (item.chapter_id) {
      const mangaId = item.chapters?.manga_id;
      const manga = dbMangas.find(m => m.id === mangaId);
      if (!manga || !item.chapters) { notify('Бvлэг олдсонгvй (устсан байж магадгvй).'); return; }
      openReader(manga, {
        id: item.chapter_id,
        manga_id: item.chapters.manga_id,
        chapter_number: item.chapters.chapter_number,
        is_vip: item.chapters.is_vip,
        status: item.chapters.status,
        is_hidden: item.chapters.is_hidden,
        pending_delete: item.chapters.pending_delete,
        publish_at: item.chapters.publish_at,
        created_at: item.chapters.created_at,
        thumbnail_url: item.chapters.thumbnail_url,
      });
      // ЗАСВАР #203 (хэрэглэгчийн хvсэлт): openReader-ийн дараа тавина — openReader
      // өөрөө (энгийн навигацийн vед БvРЭН харагдахын тулд) vvнийг false болгодог.
      setCommentsOnlyView(true);
      setPendingScrollToComments(true);
    } else {
      const manga = dbMangas.find(m => m.id === item.manga_id);
      if (!manga) { notify('Манга олдсонгvй (устсан байж магадгvй).'); return; }
      // ЗАСВАР #204: "манга сольмогц detailTab-ыг 'chapters' болгоно" гэсэн effect
      // (доор, [page, selected?.id]-д хамаарсан) энэ доорх setDetailTab('rating')-ыг
      // дараа нь дарж бичихээс сэргийлнэ.
      skipDetailTabResetRef.current = true;
      goToDetail(manga);
      setDetailTab('rating');
      setCommentsOnlyView(true);
      setPendingScrollToComments(true);
    }
  };

  // ЗАСВАР #201/#202 (код шинжилгээ): pendingScrollToComments идэвхжсэн vед
  // сэтгэгдлийн хэсэг рvv гvйлгэнэ. ЗАСВАР #123-ийн window.scrollTo(0,0) effect
  // (дээш, page/selected/selectedChapter солигдох бvр дээшээ шилжvvлдэг) энэ
  // effect-ээс ӨМНӨ ажилладаг тул нэг л удаа шууд scrollIntoView хийвэл тэр
  // дараагаа гvйцэтгэгдэнэ гэдэг нь баталгаатай. Гэвч бvлгийн зургууд (ялангуяа
  // олон хэсэгт хуваагдсан урт зураг) АСИНХРОНААР ачаалагдсаар (progressive)
  // байх vед дээд талын зураг ачаалагдаж намхнаас vvдэн layout шилждэг тул НЭГ
  // удаагийн scrollIntoView хийсний дараа сэтгэгдлийн хэсэг дэлгэцнээс "гарч"
  // (доош шилжиж) хэрэглэгчид "яг очсонгvй" мэт санагддаг байв — тиймээс хэд
  // хэдэн удаа (progressively) дахин чиглvvлнэ.
  useEffect(() => {
    if (!pendingScrollToComments) return;
    const ref = page === 'reader' ? chapterCommentsRef : page === 'detail' ? mangaCommentsRef : null;
    if (!ref) { setPendingScrollToComments(false); return; }
    const delays = [250, 700, 1400, 2200];
    const timers = delays.map(ms => setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, ms));
    const cleanupTimer = setTimeout(() => setPendingScrollToComments(false), delays[delays.length - 1] + 100);
    return () => { timers.forEach(clearTimeout); clearTimeout(cleanupTimer); };
  }, [page, selectedChapter, pendingScrollToComments]);

  // ШИНЭ: сэтгэгдэл татах (нэр, avatar, like-ийн тоотой хамт)
  // isCancelled — өмнөх бvлгийн хvсэлт хожуу ирвэл state дарж бичихээс сэргийлэх (заавал биш)
  const fetchComments = (chapterId, isCancelled = () => false) => {
    // ЗАСВАР #41: comment_likes(count) aggregate embed-г хассан — энэ нь Supabase
    // төслийн "Aggregate functions" тохиргоо идэвхгvй vед (шинэ төсөлд анхны
    // тохиргоогоор идэвхгvй байдаг) query-г бvхэлд нь унагааж, "сэтгэгдэл татахад
    // алдаа гарлаа" гэсэн алдаа гаргадаг байсан. Одоо like-ийн тоог тусад нь
    // татаж, клиент талд өөрөө тоолдог болгосон — Supabase-ийн тохиргооноос vл хамаарна.
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
        // ЗАСВАР #118: өмнө нь хэрэглэгчийн САЙТ ДАЯАРХ бvх like-ийг татдаг
        // байсан — одоо зөвхөн энэ жагсаалтын сэтгэгдлvvдээр хязгаарлана.
        if (currentUser) {
          supabase.from('comment_likes').select('comment_id')
            .eq('user_id', currentUser.id)
            .in('comment_id', commentsList.map(c => c.id))
            .then(({ data: mine }) => { if (!isCancelled()) setMyLikes((mine || []).map(x => x.comment_id)); });
        }
      });
  };

  // ШИНЭ: like дарах/болих
  // ЗАСВАР #241 (код шинжилгээ): өмнө нь optimistic update хийдэггvй байсан тул
  // товч дарсны дараа тоо/өнгө шууд өөрчлөгдөхгvй (сvлжээний хариу ирэх хvртэл),
  // хэрэглэгч "ажиллахгvй байна" гэж бодоод дахин дарахад comment_likes хvснэгтийн
  // (comment_id, user_id) PRIMARY KEY зөрчигдөж "duplicate key" алдаа шидэгддэг
  // байв. Одоо (1) UI-г шууд (optimistic) шинэчилж алдаа/удаашрал мэдрэгдэхгvй
  // болгож, (2) давхар товшилтоос vvдэх duplicate-key алдааг (Postgres код
  // 23505) чимээгvй vл тоож зөвхөн жинхэнэ (сvлжээ/бусад) алдаанд л мессеж vзvvлнэ.
  const toggleLike = async (c) => {
    if (!currentUser) { setAuthPage('login'); return; }
    const alreadyLiked = myLikes.includes(c.id);
    setMyLikes(prev => alreadyLiked ? prev.filter(id => id !== c.id) : [...prev, c.id]);
    setCommentLikeCounts(prev => ({ ...prev, [c.id]: Math.max(0, (prev[c.id] || 0) + (alreadyLiked ? -1 : 1)) }));
    if (alreadyLiked) {
      const { error } = await supabase.from('comment_likes').delete().eq('comment_id', c.id).eq('user_id', currentUser.id);
      if (error) { notify('Алдаа: ' + error.message); fetchComments(selectedChapter.id); }
    } else {
      const { error } = await supabase.from('comment_likes').insert({ comment_id: c.id, user_id: currentUser.id });
      if (error && error.code !== '23505') { notify('Алдаа: ' + error.message); fetchComments(selectedChapter.id); }
    }
  };

  // ШИНЭ: сэтгэгдэл/хариулт илгээх (parentId байвал хариулт болно)
  const postComment = async (parentId = null, textOverride = null) => {
    if (!currentUser) { setAuthPage('login'); return; }
    const text = (textOverride !== null ? textOverride : commentText).trim();
    if (!text && !selectedSticker) return;
    setCommentSending(true);
    try {
      const { error } = await supabase.from('comments').insert({
        chapter_id: selectedChapter.id,
        user_id: currentUser.id,
        content: text,
        parent_id: parentId,
        sticker_url: parentId ? null : selectedSticker,
      });
      if (error) {
        // ЗАСВАР #185 (код шинжилгээ): сервер тал одоо rate-limit-ийг тусдаа
        // ('rate_limited') алдаагаар ялгаж буцаадаг болсон тул зөвхөн тэр
        // тохиолдолд л "хэт хурдан" гэж харуулна — бусад RLS/permission алдааг
        // (жишээ нь бусад шалтгаанаар блоклогдсон) буруу тайлбарлахгvй.
        if (/rate_limited/i.test(error.message)) {
          notify('⏳ Хэт хурдан байна — 5 секунд хvлээгээд дахин илгээнэ vv');
        } else {
          notify('Алдаа: ' + error.message);
        }
        return;
      }
      if (parentId) { setReplyText(''); setReplyTo(null); }
      else { setCommentText(''); setSelectedSticker(null); }
      fetchComments(selectedChapter.id);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setCommentSending(false);
    }
  };

  // ЗАСВАР #109: манганы ерөнхий (chapter-гvй) сэтгэгдэл — bvлгийн сэтгэгдэлтэй
  // адил логиктой, гэхдээ tусдаа state ашиглана (page тус бvр дээр зэрэг
  // ажиллах шаардлагагvй ч, chapter-comment feature-ийг эвдэхгvйгээр найдвартай байлгах vvднээс).
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
        // ЗАСВАР #118: миний like-ийг зөвхөн энэ жагсаалтын сэтгэгдлvvдээр хязгаарлана
        if (currentUser) {
          supabase.from('comment_likes').select('comment_id')
            .eq('user_id', currentUser.id)
            .in('comment_id', list.map(c => c.id))
            .then(({ data: mine }) => { if (!isCancelled()) setMyMangaLikes((mine || []).map(x => x.comment_id)); });
        }
      });
  };

  // ЗАСВАР #241 (код шинжилгээ): toggleLike-тэй адил шалтгаанаар — optimistic
  // update + давхар товшилтоос vvдэх duplicate-key (23505) алдааг чимээгvй vл тоох.
  const toggleMangaCommentLike = async (c) => {
    if (!currentUser) { setAuthPage('login'); return; }
    const alreadyLiked = myMangaLikes.includes(c.id);
    setMyMangaLikes(prev => alreadyLiked ? prev.filter(id => id !== c.id) : [...prev, c.id]);
    setMangaCommentLikeCounts(prev => ({ ...prev, [c.id]: Math.max(0, (prev[c.id] || 0) + (alreadyLiked ? -1 : 1)) }));
    if (alreadyLiked) {
      const { error } = await supabase.from('comment_likes').delete().eq('comment_id', c.id).eq('user_id', currentUser.id);
      if (error) { notify('Алдаа: ' + error.message); fetchMangaComments(selected.id); }
    } else {
      const { error } = await supabase.from('comment_likes').insert({ comment_id: c.id, user_id: currentUser.id });
      if (error && error.code !== '23505') { notify('Алдаа: ' + error.message); fetchMangaComments(selected.id); }
    }
  };

  const postMangaComment = async (parentId = null, textOverride = null) => {
    if (!currentUser) { setAuthPage('login'); return; }
    const text = (textOverride !== null ? textOverride : mangaCommentText).trim();
    if (!text && !mangaSelectedSticker) return;
    setMangaCommentSending(true);
    try {
      const { error } = await supabase.from('comments').insert({
        manga_id: selected.id,
        user_id: currentUser.id,
        content: text,
        parent_id: parentId,
        sticker_url: parentId ? null : mangaSelectedSticker,
      });
      if (error) {
        // ЗАСВАР #185: postComment-той адил — зөвхөн серверийн тусгай
        // 'rate_limited' алдааг л "хэт хурдан" гэж vзнэ, бусад RLS/permission
        // алдааг буруу тайлбарлахгvй.
        if (/rate_limited/i.test(error.message)) {
          notify('⏳ Хэт хурдан байна — 5 секунд хvлээгээд дахин илгээнэ vv');
        } else {
          notify('Алдаа: ' + error.message);
        }
        return;
      }
      if (parentId) { setMangaReplyText(''); setMangaReplyTo(null); }
      else { setMangaCommentText(''); setMangaSelectedSticker(null); }
      fetchMangaComments(selected.id);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setMangaCommentSending(false);
    }
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
    try {
      const { error } = await supabase.from('manga_ratings')
        .upsert({ user_id: currentUser.id, manga_id: selected.id, score, updated_at: new Date().toISOString() }, { onConflict: 'user_id,manga_id' });
      if (error) { notify('Алдаа: ' + error.message); return; }
      notify('Vнэлгээ хадгалагдлаа! 🎉');
      fetchMangaRatings(selected.id);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setRatingSending(false);
    }
  };

  // ЗАСВАР #113: reel-vvдийг манга мэдээлэл + like-ийн тоотой нь татна
  const fetchReels = (isCancelled = () => false) => {
    supabase.from('reels').select('id, manga_id, video_url, image_urls, audio_url, created_at').order('created_at', { ascending: false })
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
        // ЗАСВАР #118: миний like-ийг зөвхөн энэ жагсаалтын reel-vvдээр хязгаарлана
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
  const uploadSticker = async (slot, rawFile) => {
    if (!currentUser || !rawFile) return;
    let file;
    try {
      file = await normalizeImageFile(rawFile);
    } catch (err) { notify(err.message); return; }
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
  const uploadAvatar = async (rawFile) => {
    if (!rawFile || !currentUser) return;
    let file;
    try {
      file = await normalizeImageFile(rawFile);
    } catch (err) { notify(err.message); return; }
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
  // ЗАСВАР #179: Avatar/MangaCard/SectionHeader-ийг ./components.jsx-рvv
  // module тvвшинд гаргав (доор import хийсэн) — App() дотор дахин
  // тодорхойлогдвол render бvр component identity өөрчлөгдөж, бvх subtree
  // (жишээ нь nowTs шинэчлэгдэх бvр MangaCard-ууд) unmount→remount болдог байв.

  // ШИНЭ: батлах хvлээгдэж буй бvлгvvд (moderator/admin)
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

  // ЗАСВАР #91: "Төлбөр төлсөн" хvлээгдэж буй хvсэлтvvд (зөвхөн admin)
  const fetchPaymentRequests = useCallback(() => {
    supabase.from('payment_requests').select('*, users!user_id(name, email)').eq('status', 'pending').order('created_at')
      .then(({ data }) => setPaymentRequests(data || []));
  }, []);

  // ШИНЭ: admin-ий "Санал хvсэлт" таб — бvх (нээлттэй + шийдэгдсэн) мессежvvд
  const fetchFeedbackList = useCallback(() => {
    supabase.from('feedback').select('*, users!user_id(name, email)').order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) console.error('Санал хvсэлт татах алдаа:', error); else setFeedbackList(data || []); });
  }, []);

  // ШИНЭ (хэрэглэгчийн хvсэлт): admin-д зориулж сvvлийн 30 "Admin дэмжих"
  // (staff appreciation) мэдэгдлийг татна — хvн бvр (аль ч ажилтанд илгээсэн)
  // хамрагдана, RLS-ээр зөвхөн admin бvгдийг унших боломжтой.
  const fetchRecentAppreciations = useCallback(() => {
    supabase.from('staff_appreciations')
      .select('id, amount, message, created_at, sender:users!sender_id(name, avatar_url), recipient:users!staff_id(name)')
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data, error }) => { if (error) console.error('Дэмжих vг татах алдаа:', error); else setRecentAppreciations(data || []); });
  }, []);

  // ШИНЭ: admin-ий "Даалгавар" таб — vvсгэсэн бvх даалгавар (идэвхтэй/идэвхгvй хамт)
  const fetchTasksAdmin = useCallback(() => {
    supabase.from('tasks').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) console.error('Даалгавар татах алдаа:', error); else setTasksList(data || []); });
    // ШИНЭ: баталгаажуулалт хvлээж буй "манал" даалгаврын хvсэлтvvд
    supabase.from('task_claims').select('task_id, user_id, proof_image_urls, claimed_at, tasks(title, reward_flowers, reward_type, reward_vip_days), users!user_id(name, avatar_url)')
      .eq('status', 'pending').order('claimed_at', { ascending: true })
      .then(({ data, error }) => { if (error) console.error('Хvлээгдэж буй хvсэлт татах алдаа:', error); else setPendingTaskClaims(data || []); });
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
    // ШИНЭ (хэрэглэгчийн хvсэлт): энэ сарын (1-нээс өнөөдрийг хvртэл) батлагдсан
    // төлбөрийн хvсэлтvvдийн нийт орлого. paid_price нь текст (жишээ нь "13,500₮")
    // хадгалагддаг тул тоон бус тэмдэгтvvдийг арилгаад нэмнэ.
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    supabase.from('payment_requests').select('paid_price, plan_key')
      .eq('status', 'approved')
      .gte('reviewed_at', monthStart)
      .then(({ data, error }) => {
        if (error) { console.error('Сарын орлого татах алдаа:', error); return; }
        const total = (data || []).reduce((sum, r) => {
          const raw = r.paid_price || PLANS.find(p => p.key === r.plan_key)?.price || '0';
          return sum + Number(String(raw).replace(/[^0-9]/g, ''));
        }, 0);
        setMonthlyRevenue(total);
      });
  }, []);

  // ЗАСВАР #128: нэг товч дарахад moderator+editor хоёуланг зэрэг хураадаг
  // байсныг өөрчилж, эрх тус бvрийг (admin-г ч оролцуулаад) тусад нь сонгож
  // хураах боломжтой болгов.
  const revokeSingleRole = (user, role) => {
    if (user.id === currentUser?.id && role === 'admin') {
      notify('Алдаа: өөрийн Админ эрхийг өөрөө хураах боломжгvй.');
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
      fetchFeedbackList();
      fetchTasksAdmin();
      fetchRecentAppreciations();
    }
  }, [page, isStaff, canModerate, isAdmin, fetchPending, fetchReports, fetchPaymentRequests, fetchStaffUsers, fetchPendingDeleteChapters, fetchVipUsers, fetchAnalytics, fetchFeedbackList, fetchTasksAdmin, fetchRecentAppreciations]);

  // ШИНЭ: "Санал хvсэлт" хуудас нээгдэхэд өөрийн (сvvлийн) мессежvvдийг татна
  useEffect(() => {
    if (page !== 'feedback' || !currentUser) return;
    let cancelled = false;
    setFeedbackLoading(true);
    supabase.from('feedback').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('Миний санал хvсэлт татах алдаа:', error); setFeedbackLoading(false); return; }
        setMyFeedback(data || []);
        setFeedbackLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, currentUser]);

  // ШИНЭ: тухайн санал хvсэлт дээрх thread (хэрэглэгч/admin хариулт) мессежvvдийг татна
  const loadFeedbackThread = (feedbackId) => {
    setFeedbackThreadLoadingId(feedbackId);
    supabase.from('feedback_messages').select('*, users!user_id(name, avatar_url)').eq('feedback_id', feedbackId).order('created_at')
      .then(({ data, error }) => {
        setFeedbackThreadLoadingId(null);
        if (error) { console.error('Хариу татах алдаа:', error); return; }
        setFeedbackThreads(prev => ({ ...prev, [feedbackId]: data || [] }));
      });
  };

  const toggleFeedbackThread = (feedbackId) => {
    setFeedbackExpandedId(prev => {
      const next = prev === feedbackId ? null : feedbackId;
      if (next) loadFeedbackThread(feedbackId);
      return next;
    });
  };

  const sendFeedbackReply = async (feedbackId) => {
    const text = (feedbackReplyDrafts[feedbackId] || '').trim();
    if (!text || feedbackReplySendingId) return;
    setFeedbackReplySendingId(feedbackId);
    try {
      const { error } = await supabase.from('feedback_messages').insert({ feedback_id: feedbackId, user_id: currentUser.id, message: text });
      if (error) { notify('Алдаа: ' + error.message); return; }
      setFeedbackReplyDrafts(prev => ({ ...prev, [feedbackId]: '' }));
      loadFeedbackThread(feedbackId);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setFeedbackReplySendingId(null);
    }
  };

  // ШИНЭ (хэрэглэгчийн хvсэлт): "ЭРЭМБЭ" хуудас нээгдэхэд энэ сарын ТОП 20 +
  // өөрийн эрэмбийг татна.
  useEffect(() => {
    if (page !== 'rank' || !currentUser) return;
    let cancelled = false;
    setRankLoading(true);
    Promise.all([
      supabase.rpc('get_chapter_rank_leaderboard', { limit_in: 20 }),
      supabase.rpc('get_my_chapter_rank'),
    ]).then(([listRes, mineRes]) => {
      if (cancelled) return;
      setRankList(listRes.data || []);
      setMyRank((mineRes.data || [])[0] || null);
      setRankLoading(false);
    });
    return () => { cancelled = true; };
  }, [page, currentUser]);

  // ШИНЭ: "Даалгавар" хуудас нээгдэхэд идэвхтэй даалгаврууд + миний явц (нийт
  // сэтгэгдэл/уншсан бvлгийн тоо) + аль хэдийн авсан шагналуудаа татна.
  useEffect(() => {
    if (page !== 'tasks' || !currentUser) return;
    let cancelled = false;
    setTasksLoading(true);
    Promise.all([
      supabase.from('tasks').select('*').eq('is_active', true).order('reward_flowers'),
      supabase.from('task_claims').select('task_id, status').eq('user_id', currentUser.id),
      supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id),
      supabase.from('reading_progress').select('manga_id, read_chapters').eq('user_id', currentUser.id),
      supabase.rpc('get_task_leaderboard', { limit_in: 5 }),
    ]).then(([tasksRes, claimsRes, commentsCountRes, progressRes, leaderboardRes]) => {
      if (cancelled) return;
      setTasksList(tasksRes.data || []);
      setMyTaskClaims((claimsRes.data || []).map(c => c.task_id));
      setMyTaskClaimStatus(Object.fromEntries((claimsRes.data || []).map(c => [c.task_id, c.status])));
      const chaptersRead = (progressRes.data || []).reduce((sum, r) => sum + ((r.read_chapters || []).length), 0);
      setMyProgress({ comments: commentsCountRes.count ?? 0, chapters_read: chaptersRead });
      setMyMangaProgress(Object.fromEntries((progressRes.data || []).map(r => [r.manga_id, (r.read_chapters || []).length])));
      setTaskLeaderboard(leaderboardRes.data || []);
      setTasksLoading(false);
    });
    return () => { cancelled = true; };
  }, [page, currentUser]);

  // ЗАСВАР (хэрэглэгчийн хvсэлт — гvйцэтгэлийн сайжруулалт): 4 секундийн
  // polling-ийн оронд Supabase Realtime (WebSocket) ашиглаж, зөвхөн бодит
  // шинэ/устсан мессеж vед л шинэчилнэ. АНХААР: Supabase dashboard →
  // Database → Replication хэсэгт "chat_messages" хvснэгтийг идэвхжvvлсэн
  // байх ёстой, эс тэгвэл events ирэхгvй.
  useEffect(() => {
    if (page !== 'chat' || chatMode !== 'group' || !currentUser) return;
    let cancelled = false;
    setChatLoading(true);
    // ЗАСВАР: Нийтийн чатыг нээж vзсэн даруйд "сvvлд харсан" цагийг шинэчилж,
    // цаашид тоологдох уншаагvй мессежийн тоог 0 болгоно.
    if (chatRoom === 'public') {
      try { localStorage.setItem('public_chat_last_seen_at', String(Date.now())); } catch { /* хор хөнөөлгvй */ }
      setPublicChatUnreadCount(0);
    }
    // ШИНЭ: мессежvvдийн хамт тэдгээрийн ❤️ like-ыг татаж нэгтгэнэ (DM thread-тэй адил загвар).
    const loadChatMessages = async () => {
      const { data, error } = await supabase.from('chat_messages').select('*, users!user_id(name, avatar_url, is_vip, roles)').eq('room', chatRoom).order('created_at', { ascending: false }).limit(60);
      if (error) return null;
      const msgs = (data || []).slice().reverse();
      const ids = msgs.map(m => m.id);
      let likesByMsg = {};
      if (ids.length > 0) {
        const { data: likes } = await supabase.from('chat_message_likes').select('message_id, user_id').in('message_id', ids);
        (likes || []).forEach(l => { (likesByMsg[l.message_id] = likesByMsg[l.message_id] || []).push(l.user_id); });
      }
      return msgs.map(m => ({ ...m, likedBy: likesByMsg[m.id] || [] }));
    };
    loadChatMessages().then(msgs => {
      if (cancelled || !msgs) { if (!cancelled) setChatLoading(false); return; }
      setChatMessages(msgs);
      setChatLoading(false);
    });
    const channel = supabase.channel(`chat_room_${chatRoom}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room=eq.${chatRoom}` }, async payload => {
        const row = payload.new;
        const { data: author } = await supabase.from('users').select('name, avatar_url, is_vip, roles').eq('id', row.user_id).single();
        if (cancelled) return;
        setChatMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev, { ...row, users: author || null, likedBy: [] }]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `room=eq.${chatRoom}` }, payload => {
        setChatMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [page, chatMode, chatRoom, currentUser]);

  // ЗАСВАР (хэрэглэгчийн хvсэлт): текст мессежийн зэрэгцээ стикер ч илгээж
  // болохоор payload-той болгов (өмнө нь зөвхөн текст дэмждэг байсан).
  const sendChatMessage = async (payload) => {
    const insertRow = payload || { message_type: 'text', message: chatInput.trim() };
    if (insertRow.message_type === 'text' && !insertRow.message) return;
    if (chatSending) return;
    setChatSending(true);
    try {
      const { error } = await supabase.from('chat_messages').insert({ user_id: currentUser.id, room: chatRoom, reply_to_id: chatReplyTo?.id || null, ...insertRow });
      if (error) {
        if (/rate_limited/.test(error.message || '')) notify('Хэт хурдан бичиж байна — жоохон хvлээгээрэй.');
        else notify('Алдаа: ' + error.message);
        return;
      }
      setChatInput('');
      setGroupStickerPickerOpen(false);
      setChatReplyTo(null);
      // ЗАСВАР (гvйцэтгэлийн сайжруулалт): дахин бvтэн жагсаалт татахгvй —
      // дээрх Realtime INSERT subscription шинэ мессежийг (өөрийнхөө илгээснийг
      // ч оролцуулан) автоматаар нэмнэ.
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setChatSending(false);
    }
  };

  // ШИНЭ: "Зурвас" (DM) inbox — хvн бvртэй хийсэн сvvлийн мессеж + уншаагvй тоо
  const fetchDmInbox = useCallback(() => {
    setDmInboxLoading(true);
    supabase.rpc('get_dm_inbox').then(({ data, error }) => {
      setDmInboxLoading(false);
      if (error) { console.error('DM inbox алдаа:', error); return; }
      setDmInbox(data || []);
    });
  }, []);

  // ШИНЭ: чат хуудас нээгдэхэд admin/moderator-ийн нэмсэн нийтийн стикерvvдийг татна
  useEffect(() => {
    if (!currentUser || (page !== 'chat' && !(page === 'admin' && canModerate))) return;
    supabase.from('gift_stickers').select('id, url').eq('is_active', true).order('created_at', { ascending: false })
      .then(({ data, error }) => { if (!error) setGiftStickers(data || []); });
  }, [page, currentUser, canModerate]);

  // admin/moderator: шинэ нийтийн стикер нэмэх
  const uploadGiftSticker = async (file) => {
    const err = validateImageFile(file);
    if (err) { notify(err); return; }
    setAdminGiftStickerUploading(true);
    try {
      const normalized = await normalizeImageFile(file);
      const optimized = await optimizeImageFile(normalized, 400);
      const url = await uploadToR2(optimized.file, `gift-stickers/${Date.now()}-${optimized.file.name}`);
      const { error } = await supabase.from('gift_stickers').insert({ url, created_by: currentUser.id });
      if (error) { notify('Алдаа: ' + error.message); return; }
      notify('Стикер нэмэгдлээ! 🎉');
      const { data } = await supabase.from('gift_stickers').select('id, url').eq('is_active', true).order('created_at', { ascending: false });
      setGiftStickers(data || []);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setAdminGiftStickerUploading(false);
    }
  };

  const deleteGiftSticker = (sticker) => {
    askConfirm('Энэ нийтийн стикерийг устгах уу?', async () => {
      const { error } = await supabase.from('gift_stickers').delete().eq('id', sticker.id);
      if (error) { notify('Алдаа: ' + error.message); return; }
      setGiftStickers(prev => prev.filter(s => s.id !== sticker.id));
      notify('Стикер устгагдлаа.');
    });
  };

  useEffect(() => {
    if (page !== 'chat' || !currentUser) return;
    supabase.rpc('get_dm_unread_count').then(({ data }) => setDmUnreadTotal(data || 0));
  }, [page, currentUser, chatMode]);

  // ШИНЭ (хэрэглэгчийн хvсэлт): сайтад хаана ч байсан (Чат хуудсанд ороогvй ч)
  // мессежийн мэдэгдэл (DM + дуугvй болгоогvй бол Нийтийн чат) харагдаж байх
  // ёстой тул page-ээс vл хамааран тогтмол шалгана.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    const checkUnread = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.rpc('get_dm_unread_count').then(({ data, error }) => { if (!cancelled && !error) setDmUnreadTotal(data || 0); });
      let lastSeen = 0;
      try { lastSeen = Number(localStorage.getItem('public_chat_last_seen_at')) || 0; } catch { /* хор хөнөөлгvй */ }
      supabase.from('chat_messages').select('id', { count: 'exact', head: true })
        .eq('room', 'public').gt('created_at', new Date(lastSeen).toISOString())
        .then(({ count, error }) => { if (!cancelled && !error) setPublicChatUnreadCount(count || 0); });
    };
    checkUnread();
    const interval = setInterval(checkUnread, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [currentUser]);

  useEffect(() => {
    if (page !== 'chat' || chatMode !== 'inbox' || !currentUser) return;
    fetchDmInbox();
  }, [page, chatMode, currentUser, fetchDmInbox]);

  // ЗАСВАР (хэрэглэгчийн хvсэлт — гvйцэтгэлийн сайжруулалт): 4 секундийн
  // polling-ийн оронд Supabase Realtime ашиглана. АНХААР: Supabase dashboard
  // → Database → Replication хэсэгт "direct_messages" хvснэгтийг идэвхжvvлсэн
  // байх ёстой.
  useEffect(() => {
    if (page !== 'chat' || chatMode !== 'thread' || !dmPartner || !currentUser) return;
    let cancelled = false;
    supabase.from('blocked_users').select('blocked_id').eq('blocker_id', currentUser.id).eq('blocked_id', dmPartner.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setDmPartnerBlocked(!!data); });
    supabase.from('direct_messages')
      .select('*, mangas(id, title, poster_url)')
      .or(`and(sender_id.eq.${currentUser.id},recipient_id.eq.${dmPartner.id}),and(sender_id.eq.${dmPartner.id},recipient_id.eq.${currentUser.id})`)
      .order('created_at', { ascending: true }).limit(200)
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('DM thread алдаа:', error); setDmLoading(false); return; }
        const msgs = data || [];
        const ids = msgs.map(m => m.id);
        let likesByMsg = {};
        if (ids.length > 0) {
          const { data: likes } = await supabase.from('direct_message_likes').select('message_id, user_id').in('message_id', ids);
          (likes || []).forEach(l => { (likesByMsg[l.message_id] = likesByMsg[l.message_id] || []).push(l.user_id); });
        }
        if (cancelled) return;
        setDmMessages(msgs.map(m => ({ ...m, likedBy: likesByMsg[m.id] || [] })));
        setDmLoading(false);
      });
    supabase.rpc('mark_dm_read', { partner_id_in: dmPartner.id }).then(() => {
      supabase.rpc('get_dm_unread_count').then(({ data }) => setDmUnreadTotal(data || 0));
    });
    // ЗАСВАР: зөвхөн ХАРИЛЦАГЧААС over ирэх мессежийг барина (recipient_id
    // өөрийн uid-тай тохирсноор шvvж, sender_id нь яг энэ харилцагч мөн эсэхийг
    // callback дотор дахин баталгаажуулна — өөр хvнтэй харилцах DM танигдахгvй).
    // Өөрийн илгээсэн мессежийг sendDirectMessage функц шууд орон нvvдлээр нэмдэг.
    const channel = supabase.channel(`dm_thread_${[currentUser.id, dmPartner.id].sort().join('_')}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${currentUser.id}` }, async payload => {
        const row = payload.new;
        if (row.sender_id !== dmPartner.id) return;
        let full = row;
        if (row.manga_id) {
          const { data: manga } = await supabase.from('mangas').select('id, title, poster_url').eq('id', row.manga_id).maybeSingle();
          full = { ...row, mangas: manga || null };
        }
        if (cancelled) return;
        setDmMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev, { ...full, likedBy: [] }]);
        supabase.rpc('mark_dm_read', { partner_id_in: dmPartner.id }).then(() => {
          supabase.rpc('get_dm_unread_count').then(({ data }) => setDmUnreadTotal(data || 0));
        });
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [page, chatMode, dmPartner, currentUser]);

  const openDmThread = (partner) => {
    setDmPartner(partner);
    setDmMessages([]);
    setDmLoading(true);
    setDmReplyTo(null);
    setDmMenuOpen(false);
    setDmGiftFlowersOpen(false);
    setChatMode('thread');
  };

  // ШИНЭ (хэрэглэгчийн хvсэлт): сэтгэгдэл/нийтийн чат доtorх хvний avatar/нэр
  // дээр дарахад шууд тvvнтэй хувийн зурвас нээгддэг ганц товч цэг.
  const startDmWith = (userId, name, avatarUrl) => {
    if (!currentUser || !userId || userId === currentUser.id) return;
    setPreviousPage(page);
    setPage('chat');
    openDmThread({ id: userId, name, avatar_url: avatarUrl });
  };

  const sendDirectMessage = async (payload) => {
    if (dmSending || !dmPartner) return;
    setDmSending(true);
    try {
      const { data: inserted, error } = await supabase.from('direct_messages').insert({
        sender_id: currentUser.id, recipient_id: dmPartner.id,
        reply_to_id: dmReplyTo?.id || null,
        ...payload,
      }).select('*, mangas(id, title, poster_url)').single();
      if (error) {
        if (/rate_limited/.test(error.message || '')) notify('Хэт хурдан бичиж байна — жоохон хvлээгээрэй.');
        else notify('Алдаа: ' + error.message);
        return;
      }
      // ЗАСВАР (гvйцэтгэлийн сайжруулалт — Realtime рvv шилжсэн): доод Realtime
      // subscription зөвхөн ХАРИЛЦАГЧААС ирэх мессежийг барьдаг (recipient_id
      // өөрийн uid-тай тохирсноор шvvдэг) тул өөрийн илгээсэн мессежээ энд
      // шууд орон нvvдэл (optimistic) байдлаар нэмнэ.
      if (inserted) setDmMessages(prev => prev.some(m => m.id === inserted.id) ? prev : [...prev, { ...inserted, likedBy: [] }]);
      setDmInput('');
      setDmReplyTo(null);
      setDmStickerPickerOpen(false);
      setDmMangaShareOpen(false);
      setDmMangaShareQuery('');
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setDmSending(false);
    }
  };

  const toggleDmLike = async (msg) => {
    const iLiked = (msg.likedBy || []).includes(currentUser.id);
    setDmMessages(prev => prev.map(m => m.id !== msg.id ? m : {
      ...m, likedBy: iLiked ? m.likedBy.filter(id => id !== currentUser.id) : [...(m.likedBy || []), currentUser.id],
    }));
    if (iLiked) await supabase.from('direct_message_likes').delete().eq('message_id', msg.id).eq('user_id', currentUser.id);
    else await supabase.from('direct_message_likes').insert({ message_id: msg.id, user_id: currentUser.id });
  };

  // ШИНЭ (хэрэглэгчийн хvсэлт): группд (Roselle уншигчид, Админуудын чат) ч
  // DM-тэй адил ❤️ like хийх боломжтой.
  const toggleChatLike = async (msg) => {
    const iLiked = (msg.likedBy || []).includes(currentUser.id);
    setChatMessages(prev => prev.map(m => m.id !== msg.id ? m : {
      ...m, likedBy: iLiked ? m.likedBy.filter(id => id !== currentUser.id) : [...(m.likedBy || []), currentUser.id],
    }));
    if (iLiked) await supabase.from('chat_message_likes').delete().eq('message_id', msg.id).eq('user_id', currentUser.id);
    else await supabase.from('chat_message_likes').insert({ message_id: msg.id, user_id: currentUser.id });
  };

  // ШИНЭ: тухайн хvнтэй хийсэн харилцаагаа бvхэлд нь (хоёр талдаа) устгах
  const deleteDmConversation = () => {
    if (!dmPartner) return;
    askConfirm(`${dmPartner.name || 'Энэ хэрэглэгч'}-тэй хийсэн бvх харилцааг vvрд устгах уу?`, async () => {
      const { error } = await supabase.from('direct_messages').delete()
        .or(`and(sender_id.eq.${currentUser.id},recipient_id.eq.${dmPartner.id}),and(sender_id.eq.${dmPartner.id},recipient_id.eq.${currentUser.id})`);
      if (error) { notify('Алдаа: ' + error.message); return; }
      notify('Харилцаа устгагдлаа.');
      setDmMenuOpen(false);
      setChatMode('inbox');
      setDmPartner(null);
      fetchDmInbox();
    });
  };

  // ШИНЭ: inbox жагсаалтын мөр бvрийн "⋮" цэснээс, thread нээхгvйгээр шууд
  // блоклох/устгах — дээрхтэй адил vйлдэл ч, dmPartner state-ээс vл хамааран
  // жагсаалтад өгөгдсөн тухайн мөрийн хvнийг шууд параметрээр авна.
  // ШИНЭ (хэрэглэгчийн хvсэлт): Нийтийн чат "шуугиантай" байх тул хvссэн vедээ
  // дуугvй болгож, мэдэгдлийн тооноос хасаж болно (DM-vvд vvнд хамаарахгvй).
  const togglePublicChatMute = () => {
    setPublicChatMuted(prev => {
      const next = !prev;
      try { localStorage.setItem('public_chat_muted', next ? '1' : '0'); } catch { /* хор хөнөөлгvй */ }
      return next;
    });
  };

  const blockUserFromRow = (partner) => {
    askConfirm(`${partner.name || 'Энэ хэрэглэгч'}-ийг блоклох уу? Та хоёр цаашид бие биедээ мессеж бичих боломжгvй болно.`, async () => {
      const { error } = await supabase.from('blocked_users').insert({ blocker_id: currentUser.id, blocked_id: partner.id });
      if (error) { notify('Алдаа: ' + error.message); return; }
      notify('Блоклогдлоо.');
      setDmRowMenuOpenId(null);
    });
  };

  const deleteConversationFromRow = (partner) => {
    askConfirm(`${partner.name || 'Энэ хэрэглэгч'}-тэй хийсэн бvх харилцааг vvрд устгах уу?`, async () => {
      const { error } = await supabase.from('direct_messages').delete()
        .or(`and(sender_id.eq.${currentUser.id},recipient_id.eq.${partner.id}),and(sender_id.eq.${partner.id},recipient_id.eq.${currentUser.id})`);
      if (error) { notify('Алдаа: ' + error.message); return; }
      notify('Харилцаа устгагдлаа.');
      setDmRowMenuOpenId(null);
      fetchDmInbox();
    });
  };

  const toggleBlockDmPartner = () => {
    if (!dmPartner) return;
    if (dmPartnerBlocked) {
      supabase.from('blocked_users').delete().eq('blocker_id', currentUser.id).eq('blocked_id', dmPartner.id)
        .then(({ error }) => {
          if (error) { notify('Алдаа: ' + error.message); return; }
          setDmPartnerBlocked(false);
          notify('Блок цуцлагдлаа.');
        });
      return;
    }
    askConfirm(`${dmPartner.name || 'Энэ хэрэглэгч'}-ийг блоклох уу? Та хоёр цаашид бие биедээ мессеж бичих боломжгvй болно.`, async () => {
      const { error } = await supabase.from('blocked_users').insert({ blocker_id: currentUser.id, blocked_id: dmPartner.id });
      if (error) { notify('Алдаа: ' + error.message); return; }
      setDmPartnerBlocked(true);
      setDmMenuOpen(false);
      notify('Блоклогдлоо.');
    });
  };

  const giftFlowersToPartner = async () => {
    if (!dmPartner || dmGifting) return;
    const amount = Math.max(1, Math.floor(Number(dmGiftFlowersAmount) || 0));
    setDmGifting(true);
    try {
      const { error } = await supabase.rpc('gift_flowers', { recipient_id_in: dmPartner.id, amount_in: amount });
      if (error) {
        if (/not_enough_flowers/.test(error.message || '')) notify('Танд хvрэлцэхvйц цэцэг алга.');
        else if (/blocked/.test(error.message || '')) notify('Энэ хэрэглэгчтэй харилцах боломжгvй байна.');
        else notify('Алдаа: ' + error.message);
        return;
      }
      notify(`${amount} цэцэг бэлэглэлээ! 💐`);
      setDmGiftFlowersOpen(false);
      setDmGiftFlowersAmount(1);
      fetchProfile(currentUser.id);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setDmGifting(false);
    }
  };

  const giftVipToPartner = async () => {
    if (!dmPartner || dmGifting) return;
    setDmGifting(true);
    try {
      const { error } = await supabase.rpc('gift_vip_with_points', { recipient_id_in: dmPartner.id });
      if (error) {
        if (/not_enough_points/.test(error.message || '')) notify('Танд 5000 од хvрэхгvй байна.');
        else if (/blocked/.test(error.message || '')) notify('Энэ хэрэглэгчтэй харилцах боломжгvй байна.');
        else notify('Алдаа: ' + error.message);
        return;
      }
      notify(`${dmPartner.name || 'Хэрэглэгч'}-д 1 сарын VIP бэлэглэлээ! 👑`);
      setDmMenuOpen(false);
      fetchProfile(currentUser.id);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setDmGifting(false);
    }
  };

  // ШИНЭ: нэр хайж шинэ зурвас эхлvvлэх
  useEffect(() => {
    const q = dmSearchQuery.trim();
    if (!q) { setDmSearchResults([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      supabase.rpc('search_users', { query_in: q }).then(({ data, error }) => {
        if (cancelled || error) return;
        setDmSearchResults(data || []);
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [dmSearchQuery]);

  // ШИНЭ: admin-ий "ЦЭЦЭГ БЭЛЭГЛЭХ" хуудсанд хvлээн авагч хайх
  useEffect(() => {
    const q = staffGiftSearchQuery.trim();
    if (!q) { setStaffGiftSearchResults([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      supabase.rpc('search_users', { query_in: q }).then(({ data, error }) => {
        if (cancelled || error) return;
        setStaffGiftSearchResults((data || []).filter(u => u.id !== currentUser?.id));
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [staffGiftSearchQuery, currentUser]);

  // ШИНЭ: staff-гийн цэцэг бэлэглэх цонх нээгдэх бvрд vлдсэн сарын хязгаарыг татна.
  useEffect(() => {
    if (staffGiftTarget && isStaff) {
      supabase.rpc('get_staff_gift_quota_remaining').then(({ data }) => setStaffGiftQuotaRemaining(data ?? 0));
    }
  }, [staffGiftTarget, isStaff]);

  // ШИНЭ: admin/moderator/editor уншигчид vнэгvй цэцэг бэлэглэх (сард 10 хvртэл)
  const sendStaffGift = async () => {
    if (!staffGiftTarget || staffGiftSending) return;
    const amount = Math.max(1, Math.floor(Number(staffGiftAmount) || 0));
    setStaffGiftSending(true);
    try {
      const { error } = await supabase.rpc('gift_flowers_as_staff', {
        recipient_id_in: staffGiftTarget.id, amount_in: amount, message_in: staffGiftMessage.trim() || null,
      });
      if (error) {
        if (/quota_exceeded/.test(error.message || '')) notify('Энэ сарын vнэгvй цэцгийн хязгаарт хvрсэн байна (сард 10).');
        else if (/blocked/.test(error.message || '')) notify('Энэ хэрэглэгчтэй харилцах боломжгvй байна.');
        else if (/cannot_gift_self/.test(error.message || '')) notify('Өөртөө бэлэглэх боломжгvй.');
        else notify('Алдаа: ' + error.message);
        return;
      }
      notify(`${staffGiftTarget.name || 'Хэрэглэгч'}-д ${amount} цэцэг бэлэглэлээ! 💐`);
      setStaffGiftTarget(null);
      setStaffGiftAmount(1);
      setStaffGiftMessage('');
      setStaffGiftSearchQuery('');
      setStaffGiftQuotaRemaining(q => Math.max(0, q - amount));
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setStaffGiftSending(false);
    }
  };

  // ШИНЭ: "Санал хvсэлт" илгээх
  const submitFeedback = async () => {
    if (!feedbackMessage.trim()) { notify('Мессежээ бичнэ vv!'); return; }
    if (feedbackSending) return;
    setFeedbackSending(true);
    try {
      // ШИНЭ: "Манга санал болгох" (request) төрлийн vед зураг сонгосон бол
      // эхлээд R2-д (upload-to-r2 edge function-оор) байршуулаад, буцаж ирсэн
      // нийтийн URL-ыг мессежийн хамт хадгална.
      let imageUrl = null;
      if (feedbackCategory === 'request' && feedbackImageFile) {
        const normalized = await normalizeImageFile(feedbackImageFile);
        const optimized = await optimizeImageFile(normalized, 1000);
        imageUrl = await uploadToR2(optimized.file, `feedback/${Date.now()}-${optimized.file.name}`);
      }
      const { error } = await supabase.from('feedback').insert({
        user_id: currentUser.id,
        category: feedbackCategory,
        manga_title: feedbackMangaTitle.trim() || null,
        message: feedbackMessage.trim(),
        image_url: imageUrl,
        link_url: feedbackCategory === 'team' ? (feedbackLinkUrl.trim() || null) : null,
      });
      if (error) {
        if (/rate_limited/.test(error.message || '')) notify('Хэт хурдан байна — жоохон хvлээгээд дахин оролдоно уу.');
        else notify('Алдаа: ' + error.message);
        return;
      }
      notify(feedbackCategory === 'team' ? 'Хvсэлт илгээгдлээ! Баг тантай удахгvй холбогдоно 🤝' : 'Санал хvсэлт илгээгдлээ! Баярлалаа 🙏');
      fireConfetti();
      setFeedbackMessage('');
      setFeedbackMangaTitle('');
      setFeedbackImageFile(null);
      setFeedbackImagePreview('');
      setFeedbackLinkUrl('');
      const { data } = await supabase.from('feedback').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20);
      setMyFeedback(data || []);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setFeedbackSending(false);
    }
  };

  // ШИНЭ (хэрэглэгчийн хvсэлт): "Санал хvсэлт" хуудас нээгдэхэд ажилтны
  // (editor/moderator/admin) жагсаалтыг татна — урамшуулах хэсэгт ашиглана.
  useEffect(() => {
    if (page !== 'feedback' || !currentUser) return;
    supabase.rpc('get_staff_list').then(({ data, error }) => {
      // ЗАСВАР: migration_47.sql (get_staff_list RPC) хараахан ажиллуулаагvй бол
      // энд алдаа гарна — console-д тодорхой шалтгааныг харуулна.
      if (error) { console.error('Ажилтны жагсаалт татах алдаа (migration_47 ажиллуулсан эсэхээ шалгаарай):', error); return; }
      // ЗАСВАР (хэрэглэгчийн хvсэлт): өөрийгөө урамшуулах боломжгvй тул
      // жагсаалтаас өөрийгөө хасна.
      setStaffList((data || []).filter(s => s.id !== currentUser.id));
    });
  }, [page, currentUser]);

  // ЗАСВАР (хэрэглэгчийн хvсэлт): хэдэн од өгөхөө сонгодог тоон талбарыг
  // ("vнэлгээ" мэт санагдсан) хассан — одоо зvгээр л сэтгэгдэл бичээд илгээхэд
  // тогтмол хэмжээний од автоматаар шилжинэ.
  const APPRECIATE_FIXED_AMOUNT = 20;
  const appreciateStaff = async () => {
    if (!appreciateTarget || appreciateSending) return;
    setAppreciateSending(true);
    try {
      const { error } = await supabase.rpc('gift_points_to_staff', {
        staff_id_in: appreciateTarget.id, amount_in: APPRECIATE_FIXED_AMOUNT, message_in: appreciateMessage.trim() || null,
      });
      if (error) {
        if (/not_enough_points/.test(error.message || '')) notify('Танд хvрэлцэхvйц од алга.');
        else notify('Алдаа: ' + error.message);
        return;
      }
      notify(`${appreciateTarget.name || 'Ажилтан'}-д дэмжих vг илгээлээ! 🙏`);
      fireConfetti();
      setAppreciateTarget(null);
      setAppreciateMessage('');
      fetchProfile(currentUser.id);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setAppreciateSending(false);
    }
  };

  // ШИНЭ: "Admin дэмжих" — гvйлгээгээ (гараар, доорх дансаар) хийсний дараа
  // мэдэгдэх нь — feedback хvснэгтийг (category='donation') vргэлжлvvлэн ашиглана.
  const sendAdminDonation = async () => {
    if (!donationAmount.trim()) { notify('Хандивласан дvнгээ бичнэ vv!'); return; }
    if (donationSending) return;
    setDonationSending(true);
    try {
      // ЗАСВАР (хэрэглэгчийн хvсэлт): хандивын тусдаа "зурвас" талбарыг хассан —
      // "Урамшуулах" modal-ийн ерөнхий сэтгэгдлийн талбарыг (appreciateMessage)
      // байвал хандивын тэмдэглэлд хамт хавсаргана.
      const composedMessage = `Дvн: ${donationAmount.trim()}₮${appreciateMessage.trim() ? `\n\n${appreciateMessage.trim()}` : ''}`;
      const { error } = await supabase.from('feedback').insert({
        user_id: currentUser.id, category: 'donation', message: composedMessage,
      });
      if (error) {
        if (/rate_limited/.test(error.message || '')) notify('Хэт хурдан байна — жоохон хvлээгээд дахин оролдоно уу.');
        else notify('Алдаа: ' + error.message);
        return;
      }
      notify('Баярлалаа! Таны хандивын мэдэгдэл admin-д очлоо 💛');
      fireConfetti();
      setDonationAmount('');
      setDonationOpenInModal(false);
      setAppreciateTarget(null);
      setAppreciateMessage('');
      const { data } = await supabase.from('feedback').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20);
      setMyFeedback(data || []);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setDonationSending(false);
    }
  };

  // ШИНЭ: даалгаврын шагналыг нэхэх (RPC биелэлтийг серверт дахин шалгаж, цэцэг олгоно).
  // "manual" төрлийн даалгавар vед шагнал шууд биш, admin/moderator баталсны
  // дараа л олгогдоно — тул RPC амжилттай ч, "pending" төлөвтэй тэмдэглэнэ.
  const claimTask = async (task, proofUrls) => {
    if (taskClaimingId) return;
    const taskId = task.id;
    setTaskClaimingId(taskId);
    try {
      const { error } = await supabase.rpc('claim_task', { task_id_in: taskId, proof_image_urls_in: (proofUrls && proofUrls.length > 0) ? proofUrls : null });
      if (error) {
        if (/not_enough_progress/.test(error.message || '')) notify('Даалгаврыг хараахан гvйцэтгээгvй байна.');
        else if (/already_claimed/.test(error.message || '')) notify('Та энэ шагналыг аль хэдийн авсан байна.');
        else if (/proof_required/.test(error.message || '')) notify('Баталгаажуулах зураг хавсаргана уу.');
        else if (/too_many_proof_images/.test(error.message || '')) notify('Дээд тал нь 5 зураг хавсаргаж болно.');
        else notify('Алдаа: ' + error.message);
        return;
      }
      const isManual = task.requirement_type === 'manual';
      const rewardLabel = task.reward_type === 'vip_days' ? `${task.reward_vip_days || 1} хоногийн VIP` : `${task.reward_flowers} цэцэг`;
      notify(isManual ? `Илгээгдлээ! Admin/moderator баталгаажуулсны дараа ${rewardLabel} орно ⏳` : `Шагнал амжилттай авлаа! ${rewardLabel} 🎉`);
      if (!isManual) { fireConfetti(); playChime(); }
      setMyTaskClaims(prev => [...prev, taskId]);
      setMyTaskClaimStatus(prev => ({ ...prev, [taskId]: isManual ? 'pending' : 'approved' }));
      fetchProfile(currentUser.id);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setTaskClaimingId(null);
    }
  };

  // ШИНЭ: "requires_proof" даалгаврын vед сонгосон зургуудыг (дээд тал нь 5)
  // R2-д upload хийгээд, амжилттай бол л claimTask-ыг proof URL-vvдтэй нь дуудна.
  const handleTaskProofFiles = async (fileList) => {
    if (!pendingProofTask || !fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, 5);
    if (fileList.length > 5) notify('Дээд тал нь 5 зураг хавсаргаж болно — эхний 5-ыг ашиглав.');
    for (const file of files) {
      const err = validateImageFile(file);
      if (err) { notify(err); return; }
    }
    setProofUploading(true);
    try {
      const urls = [];
      for (const file of files) {
        const normalized = await normalizeImageFile(file);
        const optimized = await optimizeImageFile(normalized, 1200);
        const url = await uploadToR2(optimized.file, `task-proofs/${Date.now()}-${crypto.randomUUID()}-${optimized.file.name}`);
        urls.push(url);
      }
      await claimTask(pendingProofTask, urls);
    } catch (e) {
      notify('Зураг upload алдаа: ' + e.message);
    } finally {
      setProofUploading(false);
      setPendingProofTask(null);
    }
  };

  // ШИНЭ ("од" систем — цэцэгтэй огт хамааралгvй, тусдаа): хэрэглэгч VIP
  // худалдаж авах бvрт "од" (loyalty_points) цугладаг (1 сар→500, 3 сар→2000,
  // 6 сар→5000 — approve_payment_request RPC-д хийгдэнэ). 5000 одноос дээш
  // болмогц, admin-ий баталгаажуулалт шаардахгvйгээр шууд одоороо VIP солино.
  const [pointsRedeeming, setPointsRedeeming] = useState(false);
  const POINTS_TO_REDEEM_VIP = 5000;
  const redeemPointsForVip = async () => {
    if (pointsRedeeming) return;
    setPointsRedeeming(true);
    try {
      const { error } = await supabase.rpc('redeem_points_for_vip');
      if (error) {
        if (/not_enough_points/.test(error.message || '')) notify('Од хvрэлцэхгvй байна.');
        else notify('Алдаа: ' + error.message);
        return;
      }
      notify('VIP амжилттай идэвхжлээ! ⭐👑');
      fetchProfile(currentUser.id);
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setPointsRedeeming(false);
    }
  };

  // ШИНЭ ("цэцэг" систем): нэг цэцэг зарцуулж, тухайн VIP бvлгийг 3 хоногийн
  // турш нээнэ (unlock_chapter_with_flower RPC — vлдэгдэл шалгах+хасах+
  // chapter_unlocks мөр vvсгэхийг серверт transaction-той хийнэ).
  const unlockChapterWithFlower = async () => {
    if (!vipGate || vipGateUnlocking) return;
    setVipGateUnlocking(true);
    try {
      const { error } = await supabase.rpc('unlock_chapter_with_flower', { chapter_id_in: vipGate.chapter.id });
      if (error) {
        if (/not_enough_flowers/.test(error.message || '')) notify('Цэцэг хvрэлцэхгvй байна — Даалгавар биелvvлж цэцэг цуглуулаарай! 🌸');
        else if (/already_unlocked/.test(error.message || '')) notify('Та энэ бvлгийг аль хэдийн нээсэн байна.');
        else notify('Алдаа: ' + error.message);
        return;
      }
      notify('Бvлэг цэцгээр нээгдлээ! 💐');
      const { manga, chapter } = vipGate;
      setVipGate(null);
      fetchProfile(currentUser.id);
      setSelected(manga);
      setSelectedChapter(chapter);
      setPage('reader');
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setVipGateUnlocking(false);
    }
  };

  // admin: санал хvсэлтийг "шийдэгдсэн" гэж тэмдэглэх
  const resolveFeedback = async (id) => {
    const { error } = await supabase.from('feedback').update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: currentUser.id }).eq('id', id);
    if (error) { notify('Алдаа: ' + error.message); return; }
    notify('Шийдэгдсэн гэж тэмдэглэлээ.');
    fetchFeedbackList();
  };

  // admin: шинэ даалгавар vvсгэх
  const createTask = async () => {
    if (!newTaskForm.title.trim()) { notify('Гарчиг бичнэ vv!'); return; }
    if (taskSaving) return;
    setTaskSaving(true);
    try {
      const isManga = newTaskForm.requirement_type === 'manga_chapters';
      const isManual = newTaskForm.requirement_type === 'manual';
      const isVipReward = newTaskForm.reward_type === 'vip_days';
      if (isManga && !newTaskForm.target_manga_id) { notify('Манга сонгоно уу!'); return; }
      const { error } = await supabase.from('tasks').insert({
        title: newTaskForm.title.trim(),
        description: newTaskForm.description.trim() || null,
        requirement_type: newTaskForm.requirement_type,
        requirement_count: Number(newTaskForm.requirement_count),
        reward_flowers: isVipReward ? 0 : Number(newTaskForm.reward_flowers),
        expires_at: newTaskForm.expires_at ? new Date(newTaskForm.expires_at).toISOString() : null,
        created_by: currentUser.id,
        target_manga_id: isManga ? Number(newTaskForm.target_manga_id) : null,
        requires_proof: isManual, // ЗАСВАР: manual даалгавар БvГД заавал зурагтай (сонголт биш)
        reward_type: newTaskForm.reward_type,
        reward_vip_days: isVipReward ? Number(newTaskForm.reward_vip_days) : null,
      });
      if (error) { notify('Алдаа: ' + error.message); return; }
      notify('Даалгавар vvсгэгдлээ! 🎉');
      setNewTaskForm({ title: '', description: '', requirement_type: 'comments', requirement_count: 10, reward_flowers: 1, expires_at: '', target_manga_id: '', requires_proof: false, reward_type: 'flowers', reward_vip_days: 1 });
      fetchTasksAdmin();
    } catch (e) {
      notify('Алдаа: ' + e.message);
    } finally {
      setTaskSaving(false);
    }
  };

  // admin: даалгаврыг идэвхтэй/идэвхгvй болгох (устгахгvйгээр хэрэглэгчид харагдахаа болих)
  const toggleTaskActive = async (task) => {
    const { error } = await supabase.from('tasks').update({ is_active: !task.is_active }).eq('id', task.id);
    if (error) { notify('Алдаа: ' + error.message); return; }
    fetchTasksAdmin();
  };

  // admin: даалгавар бvрмөсөн устгах
  const deleteTask = (task) => {
    askConfirm(`"${task.title}" даалгаврыг vvрд устгах уу?`, async () => {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id);
      if (error) { notify('Алдаа: ' + error.message); return; }
      notify('Даалгавар устгагдлаа.');
      fetchTasksAdmin();
    });
  };

  // admin/moderator: "манал" даалгаврын хvсэлтийг батлах (шагнал олгоно)
  const approveTaskClaim = async (claim) => {
    const key = `${claim.user_id}-${claim.task_id}`;
    if (taskClaimActingId) return;
    setTaskClaimActingId(key);
    try {
      const { error } = await supabase.rpc('approve_task_claim', { user_id_in: claim.user_id, task_id_in: claim.task_id });
      if (error) { notify('Алдаа: ' + error.message); return; }
      notify('Хvсэлтийг баталж, шагнал олгов! 🎉');
      fetchTasksAdmin();
    } finally {
      setTaskClaimActingId(null);
    }
  };

  // admin/moderator: "манал" даалгаврын хvсэлтийг татгалзах (шагналгvйгээр цуцлана)
  const rejectTaskClaim = (claim) => {
    askConfirm(`${claim.users?.name || 'Хэрэглэгч'}-ийн "${claim.tasks?.title || ''}" хvсэлтийг татгалзах уу?`, async () => {
      const key = `${claim.user_id}-${claim.task_id}`;
      setTaskClaimActingId(key);
      try {
        const { error } = await supabase.rpc('reject_task_claim', { user_id_in: claim.user_id, task_id_in: claim.task_id });
        if (error) { notify('Алдаа: ' + error.message); return; }
        notify('Хvсэлтийг татгалзлаа.');
        fetchTasksAdmin();
      } finally {
        setTaskClaimActingId(null);
      }
    });
  };

  // ЗАСВАР #21: тодорхой цагт (publish_at) товлогдсон бvлгvvдийг татаж,
  // хуваарийн хуудсанд манга-тvвшний долоо хоногийн хуваариас гадна харуулна
  // (өмнө нь энэ хуудас зөвхөн mangas.schedule_day ашигладаг байсан тул нэг
  // өдөрт олон бvлэг товлогдсон ч харагддаггvй байсан).
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
    // ЗАСВАР #195 (код шинжилгээ): энэ query нь status/is_hidden/pending_delete-ээр
    // шvvдэггvй байсан тул editor-ийн "pending" (батлагдаагvй), staff-ийн
    // зориудаар нуусан, "rejected", устгах хvсэлт явуулсан бvлгvvд ЧУГД
    // Хуваарь хуудсанд зочдод (нэр/cover/гарах цагийн хамт) ил гардаг байв —
    // render дээрх шvvлт (line ~2520) зөвхөн МАНГЫН is_hidden-ийг шалгадаг,
    // БvЛГИЙН өөрийнх нь төлөвийг vл тооцдог байсан тул.
    (isStaff
      ? supabase.from('chapters').select('id, manga_id, chapter_number, title, label, status, is_vip, is_hidden, pending_delete, publish_at, created_at, thumbnail_url, mangas(title, poster_url, is_hidden)')
      : supabase.from('chapters').select('id, manga_id, chapter_number, title, label, status, is_vip, is_hidden, pending_delete, publish_at, created_at, thumbnail_url, mangas(title, poster_url, is_hidden)')
          .eq('status', 'published').eq('pending_delete', false).or('is_hidden.is.null,is_hidden.eq.false')
    )
      .not('publish_at', 'is', null)
      .gte('publish_at', threeDaysAgo)
      .lte('publish_at', threeDaysAhead)
      .order('publish_at')
      .then(({ data }) => { if (!cancelled) setScheduledChapters(data || []); });
    return () => { cancelled = true; };
  }, [page, isStaff]);

  // ЗАСВАР #44: нvvр хуудсанд харуулах хамгийн сvvлд нийтлэгдсэн бvлгvvд
  // (нэг манга дараалан хэдэн бvлэг гаргасан ч бvгд тусдаа карт болно)
  useEffect(() => {
    if (page !== 'home') return;
    let cancelled = false;
    // ЗАСВАР #186 (код шинжилгээ): genres-ийг ч сонгоно — эс бол доорх
    // openReader-ийн fallback объект genres-гvй vлдэж, Smut 18+ анхааруулга
    // (selected.genres.includes('Smut')) чимээгvй алгасагддаг байв.
    // ЗАСВАР (хэрэглэгчийн хvсэлт): "Бvх гаргалт → Шинэ бvлэг" grid дээр
    // vзэлтийн тоо + төлөвийн (ДУУССАН г.м.) badge vзvvлэхийн тулд status/views-г ч сонгоно.
    supabase.from('chapters').select('id, manga_id, chapter_number, title, label, status, is_vip, is_hidden, pending_delete, publish_at, created_at, thumbnail_url, mangas(id, title, poster_url, genres, is_hidden, status, views)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (!cancelled) setRecentChapters(data || []); });
    return () => { cancelled = true; };
  }, [page]);

  // ЗАСВАР #81: "Бvх гаргалт" хуудсанд орохоос өмнө аль ангиллын сумаар (ШИНЭ
  // МАНГА/ДУУССАН/САНАЛ БОЛГОХ/ТVVХ) орж ирснээс хамааран эх жагсаалтыг сонгоно.
  const allCategoryBase = (() => {
    if (allCategory === 'new') return newMangas;
    if (allCategory === 'finished') return allMangas.filter(m => m.status === 'Дууссан');
    if (allCategory === 'recommended') return curatedRecommended;
    if (allCategory === 'monthlyTop') return monthlyTopMangas;
    if (allCategory === 'history') return allMangas.filter(m => history.find(h => h.mangaId === m.id));
    if (allCategory === 'recentChapter') return allMangas.filter(m => recentChapters.find(ch => ch.mangas?.id === m.id));
    return allMangas;
  })();

  // ЗАСВАР #1: Хайлт/жанрын шvvлт одоо DB-гийн мангаг ч хамруулдаг болсон
  // (өмнө нь зөвхөн хатуу бичсэн `mangas` массивыг шvvдэг байсан).
  // ЗАСВАР #192 (код шинжилгээ): зөвхөн гарчгаар хайдаг байсныг тайлбар (desc)
  // талбарыг ч хамруулж өргөтгөв — олдоц сайжирна.
  // ЗАСВАР #232 (код шинжилгээ): энд өмнө нь толгой хэсгийн хайлтын цонхны
  // "search" state-ийг ч давхар шvvлтvvрлэдэг байсан (харагдах хайлтын талбар
  // байхгvй атлаа "Бvх гаргалт" grid чимээгvй шvvгддэг гэнэтийн зан төлөв vvсгэж
  // байсан) — хайлтыг бvрэн тусгаарласан тул энд зөвхөн жанраар шvvнэ.
  // ЗАСВАР (хэрэглэгчийн хvсэлт): "Бvх гаргалт" vзэлтээр биш, ШИНЭЭР нэмэгдсэн
  // дарааллаар (created_at буурахаар) харагдана — vзэлтээр эрэмблэх сонголтыг
  // (UI-аас нь) хассантай холбоотой, санамсаргvй биш тогтвортой дараалалтай байхын тулд.
  const filtered = allCategoryBase
    .filter(m => activeGenre === 'Бvгд' || (m.genres || []).includes(activeGenre))
    .slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  // ЗАСВАР #197 (код шинжилгээ): дэлгэц дvvрэн хайлтын цонх (searchOpen) нь
  // дээрх `filtered`-ийг ашигладаг байсан ч тэр нь "Бvх гаргалт" хуудасны
  // АНГИЛЛААР (allCategory, жишээ нь "ДУУССАН" гэж сумаар нэг орохоор persist
  // хэвээр vлддэг) хязгаарлагддаг байв — vvнээс vvдэж хэрэглэгч нэг удаа
  // ангиллын сумаар орсны дараа дараагийн БvХ хайлт зөвхөн тэр ангилалд
  // хязгаарлагдаж vлддэг байсан ("хайлт ажиллахгvй байна" мэт мэдрэгддэг байв).
  // Дэлгэц дvvрэн хайлт БvХ мангаас (ангилал vл харгалзан) хайх ёстой тул тусад нь тооцно.
  // Бvлэг нээхэд тvvхэнд бvртгэнэ (нэг мангад хамгийн сvvлийн бvлгийг л хадгална)
  const openReader = async (manga, chapter) => {
    // ЗАСВАР (хэрэглэгчийн хvсэлт — "цэцэг" систем): VIP бvлэг vзэхийг
    // оролдоход шууд /vip рvv шидэхийн оронд, эхлээд идэвхтэй (дуусаагvй)
    // chapter_unlocks мөр байгаа эсэхийг шалгана (цэцгээр өмнө нь нээсэн бол
    // шууд уншина). Байхгvй бол VIP авах/цэцгээр нээх сонголт бvхий gate харуулна.
    if (chapter.is_vip && !isVip) {
      if (currentUser) {
        const { data: unlock } = await supabase.from('chapter_unlocks')
          .select('expires_at').eq('user_id', currentUser.id).eq('chapter_id', chapter.id)
          .gt('expires_at', new Date().toISOString()).maybeSingle();
        if (unlock) {
          setSelected(manga);
          setSelectedChapter(chapter);
          setPage('reader');
          return;
        }
      }
      setVipGate({ manga, chapter });
      return;
    }
    // ШИНЭ: товлосон цаг болоогvй бvлэг
    if (chapterLocked(chapter) && !isStaff) {
      notify(`⏳ Энэ бvлэг ${formatRemaining(new Date(chapter.publish_at).getTime() - nowTs)}-ийн дараа нээгдэнэ!`);
      return;
    }
    setSelected(manga);
    setSelectedChapter(chapter);
    setPage('reader');
    // ЗАСВАР #203: энгийн навигацаар (chapter switcher, prev/next, MangaCard
    // гэх мэт) орж ирвэл vргэлж БvРЭН агуулгыг харуулна.
    setCommentsOnlyView(false);
    const nextHistory = [
      { mangaId: manga.id, chapter: chapter.chapter_number, date: Date.now() },
      ...history.filter(h => h.mangaId !== manga.id),
    ];
    setHistory(nextHistory);
    // ШИНЭ: энэ бvлгийг "уншсан" гэж тэмдэглэнэ (нэвтэрсэн бол Supabase-д,
    // ЗАСВАР #118: зочин бол localStorage-д — refresh хийхэд алга болохгvй)
    const existing = readChapters[manga.id] || [];
    const isNewChapter = !existing.includes(chapter.chapter_number);
    const nextRead = isNewChapter ? [...existing, chapter.chapter_number] : existing;
    setReadChapters(prev => ({ ...prev, [manga.id]: nextRead }));
    if (currentUser) {
      supabase.from('reading_progress').upsert({
        user_id: currentUser.id,
        manga_id: manga.id,
        last_chapter: chapter.chapter_number,
        read_chapters: nextRead,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,manga_id' }).then(({ error }) => { if (error) notify('Алдаа: ' + error.message); });
      // ШИНЭ (хэрэглэгчийн хvсэлт): сарын "ЭРЭМБЭ" (Rank) хуудсанд ашиглах
      // цаг-тэмдэглэгээтэй vйл явдал — зөвхөн ШИНЭЭР уншсан vед л (дахин
      // нээхэд давхар тоологдохгvй).
      if (isNewChapter) {
        supabase.from('chapter_read_events').insert({ user_id: currentUser.id, manga_id: manga.id, chapter_number: chapter.chapter_number })
          .then(({ error }) => { if (error) console.error('chapter_read_events алдаа (migration_54.sql ажиллуулсан эсэхээ шалгаарай):', error); });
      }
    } else {
      try {
        localStorage.setItem('guest_history', JSON.stringify(nextHistory));
        localStorage.setItem('guest_read_chapters', JSON.stringify({ ...readChapters, [manga.id]: nextRead }));
      } catch { /* localStorage боломжгvй vед чимээгvй өнгөрнө */ }
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
    { label: 'Нvvр', p: 'home', icon: <IconHome /> },
    { label: 'Бvх гаргалт', p: 'all', icon: <IconGrid /> },
    { label: 'Хуваарь', p: 'schedule', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  ];

  // ШИНЭ: нvvр хэсгийн ангилал тус бvрийн манга картын хэмжээ
  const scrollCardStyle = { width: 130, flexShrink: 0 };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: "'Noto Sans', Arial, 'Segoe UI', sans-serif" }}>

      {/* ШИНЭ: site-тэй өнгө нийцсэн мэдэгдлийн карт (toast) — browser alert()-ийг орлоно */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
          {toasts.map(t => (
            // ЗАСВАР (дизайн сайжруулалт #10): бvдэг хатуу хар дэвсгэрийн оронд
            // frosted-glass дэвсгэр + зөөлөн гарч ирэх (toast-glass) анимэйшн.
            <div key={t.id} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="toast-glass"
              style={{
                background: 'rgba(22,22,22,0.85)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                border: `1px solid ${t.type === 'error' ? 'rgba(139,0,0,0.5)' : 'rgba(46,125,50,0.5)'}`,
                borderLeft: `3px solid ${t.type === 'error' ? '#e0245e' : '#3ddc97'}`, borderRadius: 12, padding: '12px 16px',
                fontSize: 13, color: '#eee', boxShadow: `0 8px 28px rgba(0,0,0,0.5), 0 0 20px ${t.type === 'error' ? 'rgba(139,0,0,0.2)' : 'rgba(46,125,50,0.15)'}`,
                cursor: 'pointer', lineHeight: 1.5,
              }}>
              {t.message}
            </div>
          ))}
        </div>
      )}

      {/* ШИНЭ: утсанд цэс нээлттэй vед арын хар давхарга — дарахад цэс хаагдана */}
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

        <div style={{ fontSize: 11, color: '#444', letterSpacing: 1, marginBottom: '0.5rem', paddingLeft: 8 }}>VНДСЭН</div>
        {navItems.map(item => {
          const go = () => { setPreviousPage(page); setPage(item.p); if (item.p === 'all') setAllCategory(null); };
          return (
            <div key={item.p} onClick={go} role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
              style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 2, cursor: 'pointer', fontSize: 14, color: page === item.p ? '#fff' : '#888', background: page === item.p ? '#1a1a1a' : 'transparent', fontWeight: page === item.p ? 600 : 400, display: 'flex', alignItems: 'center', gap: 10 }}>
              {item.icon}
              {item.label}
            </div>
          );
        })}
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

        {/* ЗАСВАР #45: sidebar-ийн ёроолд site нэр + сошиал линкvvд
            (facebook/discord/instagram href-vvд тvр placeholder '#' — бодит
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

      {/* ШИНЭ ("цэцэг" систем): VIP бvлэг vзэхийг оролдоход гарч ирэх сонголт —
          бvтэн VIP авах, эсвэл 1 цэцгээр тухайн НЭГ бvлгийг 3 хоногийн турш нээх. */}
      {vipGate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{
            background: 'rgba(17,17,17,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)', borderRadius: 18, padding: '2rem', width: 380, maxWidth: '100%',
            boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', textAlign: 'center',
          }}>
            <button type="button" onClick={() => setVipGate(null)} aria-label="Хаах"
              style={{ position: 'absolute', marginTop: -28, marginLeft: 320, background: 'none', border: 'none', color: '#555', fontSize: 20, cursor: 'pointer' }}>✕</button>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👑</div>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>Энэ бvлэг VIP эрхтэй</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24, lineHeight: 1.5 }}>
              Бvтэн VIP эрх аваад бvх манга хязгааргvй уншина уу, эсвэл цэцгээ зарцуулж энэ ГАНЦ бvлгийг нээгээрэй.
            </div>
            <button onClick={() => { setPreviousPage(page); setPage('vip'); setVipGate(null); }}
              style={{ width: '100%', background: '#8B0000', color: '#fff', border: 'none', padding: '13px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10, boxShadow: '0 0 22px rgba(139,0,0,0.45)' }}>
              VIP ЭРХ АВАХ
            </button>
            <button disabled={vipGateUnlocking} onClick={unlockChapterWithFlower}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
                padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: vipGateUnlocking ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              💐 {vipGateUnlocking ? 'НЭЭЖ БАЙНА...' : `1 ЦЭЦГЭЭР НЭЭХ (${userProfile?.flower_balance || 0} vлдсэн)`}
            </button>
          </div>
        </div>
      )}

      {/* AUTH OVERLAY */}
      {authPage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div ref={authDialogRef} role="dialog" aria-modal="true" aria-label={
              authPage === 'login' ? 'Нэвтрэх' : authPage === 'register' ? 'Бvртгvvлэх' : authPage === 'forgot' ? 'Нууц vг сэргээх' : 'Код баталгаажуулах'
            } style={{ background: '#111', borderRadius: 16, padding: '2.5rem', width: 400, maxWidth: '100%', border: '1px solid #222', position: 'relative', boxSizing: 'border-box' }}>
            <button type="button" onClick={() => setAuthPage(null)} aria-label="Хаах"
              style={{ position: 'absolute', top: 16, right: 20, cursor: 'pointer', fontSize: 20, color: '#555', background: 'none', border: 'none', padding: 0, lineHeight: 1 }}>✕</button>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <img src="/logo.png" alt="logo" style={{ height: 60, width: 'auto', objectFit: 'contain', marginBottom: 12 }} />
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {authPage === 'login' && 'НЭВТРЭХ'}
                {authPage === 'register' && 'БVРТГVVЛЭХ'}
                {authPage === 'forgot' && 'НУУЦ VГ СЭРГЭЭХ'}
                {authPage === 'reset' && 'КОД БАТАЛГААЖУУЛАХ'}
              </div>
            </div>

            {/* НЭВТРЭХ / БVРТГVVЛЭХ */}
            {(authPage === 'login' || authPage === 'register') && (
              <form onSubmit={async e => {
                e.preventDefault();
                // ЗАСВАР #156: олон дарахад давхар хvсэлт (жишээ нь олон
                // бvртгvvлэх имэйл) явуулахаас сэргийлж, хамгийн эхэнд шалгана
                if (authSubmitting) return;
                setAuthSubmitting(true);
                try {
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
                      // ЗАСВАР #230 (код шинжилгээ): амжилттай орсны дараа нууц vг
                      // React state-д vлдэхгvйгээр цэвэрлэнэ.
                      setAuthForm({ email: '', password: '', name: '' });
                      notify('Бvртгэл амжилттай! Тавтай морил 🎉');
                    } else {
                      setAuthForm(f => ({ ...f, password: '' }));
                      notify('Бvртгэл амжилттай! Имэйлээ шалгана уу 📧');
                    }
                  } else {
                    const { error } = await supabase.auth.signInWithPassword({
                      email: authForm.email,
                      password: authForm.password,
                    });
                    if (error) notify('Алдаа: Нэвтрэх имэйл эсвэл нууц vг буруу байна');
                    else {
                      setAuthPage(null);
                      setAuthForm({ email: '', password: '', name: '' });
                      notify('Амжилттай нэвтэрлээ! 🎉');
                    }
                  }
                } catch (err) {
                  // ЗАСВАР #221 (код шинжилгээ): сvлжээ тасрах гэх мэт vед try/finally
                  // байхгvй бол "ХАДГАЛЖ БАЙНА..." товч vvрд гацдаг байсан
                  notify('Алдаа: ' + err.message);
                } finally {
                  setAuthSubmitting(false);
                }
              }}>
                {authPage === 'register' && (
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="auth-name" style={{ fontSize: 12, color: '#888', marginBottom: 6, display: 'block' }}>НЭР</label>
                    <input id="auth-name" name="name" autoComplete="name" required autoFocus={authPage === 'register'}
                      value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})}
                      placeholder="Нэрээ оруулна уу"
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                )}
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="auth-email" style={{ fontSize: 12, color: '#888', marginBottom: 6, display: 'block' }}>ИМЭЙЛ</label>
                  {/* ЗАСВАР (browser-ийн "нууц vг хадгалах?" санал): нэвтрэх маягт дээр
                      autoComplete="username" ашиглана (autoComplete="email" биш) —
                      Chrome/Edge зэрэг нь username+password хосыг таньж хадгалахдаа
                      яг "username" token хайдаг тул "email" хэвээр vлдвэл зарим vед
                      санал огт гардаггvй. Бvртгvvлэх маягтад бол шинэ данс vvсгэж буй
                      тул "email" token хэвээр vлдээнэ. */}
                  <input id="auth-email" name="email" type="email" autoComplete={authPage === 'register' ? 'email' : 'username'} required autoFocus={authPage === 'login'}
                    value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})}
                    placeholder="example@email.com"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label htmlFor="auth-password" style={{ fontSize: 12, color: '#888', marginBottom: 6, display: 'block' }}>НУУЦ VГ</label>
                  <PasswordField id="auth-password" name="password"
                    autoComplete={authPage === 'register' ? 'new-password' : 'current-password'} required
                    minLength={authPage === 'register' ? 6 : undefined}
                    value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})}
                    placeholder="••••••••" />
                </div>
                {authPage === 'login' && (
                  <div style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
                    <button type="button" onClick={() => { setResetCode(''); setResetNewPassword(''); setAuthPage('forgot'); }}
                      style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', color: '#8B0000', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                      Нууц vгээ мартсан уу?
                    </button>
                  </div>
                )}
                {authPage === 'register' && <div style={{ marginBottom: '1.5rem' }} />}
                <button type="submit" disabled={authSubmitting} style={{ width: '100%', background: authSubmitting ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontSize: 15, cursor: authSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 16 }}>
                  {authSubmitting ? 'ХАДГАЛЖ БАЙНА...' : (authPage === 'login' ? 'НЭВТРЭХ' : 'БVРТГVVЛЭХ')}
                </button>

                {/* ШИНЭ: Google-р нэвтрэх/бvртгvvлэх */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px' }}>
                  <div style={{ flex: 1, height: 1, background: '#222' }} />
                  <span style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>ЭСВЭЛ</span>
                  <div style={{ flex: 1, height: 1, background: '#222' }} />
                </div>
                <button type="button" onClick={signInWithGoogle} disabled={googleLoading}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#fff', color: '#1f1f1f', border: '1px solid #2a2a2a', padding: '11px', borderRadius: 8, fontSize: 14, cursor: googleLoading ? 'not-allowed' : 'pointer', fontWeight: 600, marginBottom: 16, opacity: googleLoading ? 0.7 : 1 }}>
                  <IconGoogle size={18} />
                  {googleLoading ? 'Уншиж байна...' : 'Google-р vргэлжлvvлэх'}
                </button>

                <div style={{ textAlign: 'center', fontSize: 13, color: '#555' }}>
                  {authPage === 'login' ? (
                    <span>Бvртгэл байхгvй юу? <button type="button" onClick={() => { setAuthForm(f => ({ ...f, password: '' })); setAuthPage('register'); }} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 'inherit', color: '#8B0000', cursor: 'pointer', fontWeight: 600 }}>Бvртгvvлэх</button></span>
                  ) : (
                    <span>Бvртгэл байна уу? <button type="button" onClick={() => { setAuthForm(f => ({ ...f, password: '' })); setAuthPage('login'); }} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 'inherit', color: '#8B0000', cursor: 'pointer', fontWeight: 600 }}>Нэвтрэх</button></span>
                  )}
                </div>
              </form>
            )}

            {/* НУУЦ VГ МАРТСАН — имэйл оруулаад код авах */}
            {authPage === 'forgot' && (
              <form onSubmit={e => { e.preventDefault(); sendResetCode(); }}>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
                  Бvртгэлтэй имэйлээ оруулна уу. Бид танд 8 оронтой баталгаажуулах код илгээх болно.
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label htmlFor="forgot-email" style={{ fontSize: 12, color: '#888', marginBottom: 6, display: 'block' }}>ИМЭЙЛ</label>
                  <input id="forgot-email" name="email" type="email" autoComplete="email" required
                    value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})}
                    placeholder="example@email.com"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <button type="submit" disabled={resetSending || resendCooldown > 0}
                  style={{ width: '100%', background: (resetSending || resendCooldown > 0) ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontSize: 15, cursor: (resetSending || resendCooldown > 0) ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 16 }}>
                  {resetSending ? 'ИЛГЭЭЖ БАЙНА...' : resendCooldown > 0 ? `ДАХИН ИЛГЭЭХ (${resendCooldown}с)` : 'КОД ИЛГЭЭХ'}
                </button>
                <div style={{ textAlign: 'center', fontSize: 13, color: '#555' }}>
                  <button type="button" onClick={() => setAuthPage('login')} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 'inherit', color: '#8B0000', cursor: 'pointer', fontWeight: 600 }}>← Нэвтрэх рvv буцах</button>
                </div>
              </form>
            )}

            {/* КОД БАТАЛГААЖУУЛАХ — код + шинэ нууц vг */}
            {authPage === 'reset' && (
              <form onSubmit={e => { e.preventDefault(); confirmResetCode(); }}>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
                  <strong style={{ color: '#fff' }}>{authForm.email}</strong> хаяг руу илгээсэн 8 оронтой кодыг оруулна уу.
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="reset-code" style={{ fontSize: 12, color: '#888', marginBottom: 6, display: 'block' }}>8 ОРОНТОЙ КОД</label>
                  <input id="reset-code" name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required
                    value={resetCode}
                    onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="00000000"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 20, letterSpacing: 8, textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label htmlFor="reset-new-password" style={{ fontSize: 12, color: '#888', marginBottom: 6, display: 'block' }}>ШИНЭ НУУЦ VГ</label>
                  <PasswordField id="reset-new-password" name="new-password" autoComplete="new-password" required
                    value={resetNewPassword} onChange={e => setResetNewPassword(e.target.value)}
                    placeholder="Дор хаяж 6 тэмдэгт" />
                </div>
                <button type="submit" disabled={resetSending}
                  style={{ width: '100%', background: resetSending ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontSize: 15, cursor: resetSending ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 16 }}>
                  {resetSending ? 'БАТАЛГААЖУУЛЖ БАЙНА...' : 'НУУЦ VГ СОЛИХ'}
                </button>
                <div style={{ textAlign: 'center', fontSize: 13, color: '#555' }}>
                  {/* ЗАСВАР #40: 30 секундын цэвэрхэн countdown — spam-ийг бэлхэнэ */}
                  {resendCooldown > 0 ? (
                    <span style={{ color: '#555' }}>Дахин илгээх ({resendCooldown}с)</span>
                  ) : (
                    <button type="button" onClick={sendResetCode} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 'inherit', color: '#8B0000', cursor: 'pointer', fontWeight: 600 }}>Код дахин илгээх</button>
                  )}
                  {' · '}
                  <button type="button" onClick={() => setAuthPage('login')} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 'inherit', color: '#888', cursor: 'pointer', fontWeight: 600 }}>Нэвтрэх рvv буцах</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Main */}
      {/* ШИНЭ: доод "pill" navigation bar-тай vед агуулга vvнд дарагдахгvйн тулд
          доод зайг нэмнэ (reader хуудсанд bottom nav ч, энэ зай ч хэрэггvй —
          бvтэн дэлгэцийн уншилтад саад болохгvйн тулд). */}
      <div style={{ marginLeft: isMobile ? 0 : 220, flex: 1, minWidth: 0, paddingBottom: (isMobile && page !== 'reader') ? 78 : 0 }}>

        {/* ЗАСВАР #105: Topbar-ыг chapter уншиж байх vед нуув (reader-ийн
            өөрийн компакт header-тэй давхцаж зай дэмий эзэлдэг байсан).
            ЗАСВАР #113: reels хуудсанд ч бас нуув — бvтэн дэлгэцийн видео feed. */}
        {/* ЗАСВАР (дизайн сайжруулалт — хэрэглэгчийн хvсэлт): бvтэн топбарыг
            хайлт/VIP карт/профайл дропдаунтай ижил "glass" (frosted, backdrop-blur)
            дэвсгэртэй болгож, апп даяар нэгдмэл харагдацтай болгов. */}
        {page !== 'reader' && page !== 'reels' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap', padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: 'rgba(10,10,10,0.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', zIndex: 50, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, minWidth: 0 }}>
            {/* ЗАСВАР: доод "pill" navigation bar vндсэн навигацийг хариуцдаг
                болсон тул утасны дэлгэцний 3-зураас (hamburger) товчийг хассан. */}
            {/* ЗАСВАР #161: топбар дахь логог жоохон томруулав (34/36 → 40/44) */}
            <img src="/logo.png" alt="logo" style={{ height: isMobile ? 40 : 44, width: 'auto', maxWidth: 150, objectFit: 'contain', flexShrink: 0 }} />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {/* ЗАСВАР (хэрэглэгчийн хvсэлт): бvтэн дэлгэцийн тусдаа хайлтын
                overlay-ийн оронд, энэ icon өөрөө хажуу тийшээ өргөжиж (inline)
                pill хэлбэрийн хайлтын талбар болдог загвар руу шилжив. */}
            <TopbarSearch allMangas={allMangas} onOpen={goToDetail} isOpen={searchOpen} onOpenChange={setSearchOpen} />

            {/* ШИНЭ: мэдэгдлийн хонх — staff-т сайт даяарх сэтгэгдэл, энгийн/VIP
                хэрэглэгчид зөвхөн өөрсдийнх нь сэтгэгдэлд ирсэн reply/like */}
            {currentUser && (
              <div style={{ position: 'relative' }}>
                <span onClick={toggleNotif} title="Мэдэгдэл" style={{ cursor: 'pointer', color: '#aaa', position: 'relative', display: 'flex' }}>
                  <IconBell />
                  {unreadNotifCount > 0 && (
                    <span style={{ position: 'absolute', top: -6, right: -6, background: '#8B0000', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 10, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                      {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                    </span>
                  )}
                </span>
                {notifOpen && (
                  <>
                    <div onClick={() => setNotifOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 290 }} />
                    {/* ЗАСВАР #215 (хэрэглэгчийн хvсэлт): утасны (ялангуяа staff-ийн
                        "АДМИН/УДИРДЛАГА" товчтой хамт шахагдсан) нарийн дэлгэцэнд хонхны
                        байрлалаас vндэслэсэн (position:absolute, right:0) цонх дэлгэцний
                        ирмэгээс гарч, "талан л" харагддаг байсан тул утсанд дэлгэцийн
                        голд (position:fixed) бvтнээр нь харагдахаар тусад нь байрлуулав. */}
                    <div style={isMobile ? {
                      position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', width: '92vw', maxWidth: 380, maxHeight: '70vh', overflowY: 'auto', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, zIndex: 291, boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                    } : {
                      position: 'absolute', top: '130%', right: 0, width: 320, maxWidth: '90vw', maxHeight: 420, overflowY: 'auto', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, zIndex: 291, boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                    }}>
                      <div style={{ padding: '12px 14px', borderBottom: '1px solid #222', fontWeight: 700, fontSize: 13 }}>
                        {isStaff ? 'ШИНЭ СЭТГЭГДЭЛ' : 'МИНИЙ МЭДЭГДЭЛ'}
                      </div>
                      {activeNotifFeed.length === 0 ? (
                        <div style={{ padding: '20px 14px', fontSize: 12, color: '#555', textAlign: 'center' }}>Мэдэгдэл алга</div>
                      ) : activeNotifFeed.map(item => {
                        const mangaTitle = item.chapter_id ? item.chapters?.mangas?.title : item.mangas?.title;
                        const chapterLabel = item.chapter_id && item.chapters ? ` · Бvлэг ${item.chapters.chapter_number}` : '';
                        const isUnread = new Date(item.created_at).getTime() > notifLastSeenAt;
                        // ШИНЭ: staff-ийн feed-т item.kind байхгvй (энгийн сэтгэгдэл);
                        // энгийн/VIP хэрэглэгчийн feed-т 'reply'/'like' гэж ялгарна.
                        // ЗАСВАР #204 (хэрэглэгчийн хvсэлт): reply/like мэдэгдэлд ч аль
                        // манга/бvлэгт хамаарахыг (бvлгийн дугаарын хамт) харуулна.
                        const contextLabel = mangaTitle ? ` (${mangaTitle}${chapterLabel})` : '';
                        const actionLabel = item.kind === 'reply' ? `таны сэтгэгдэлд хариулав${contextLabel}`
                          : item.kind === 'like' ? `таны сэтгэгдэлд ❤️ дарлаа${contextLabel}`
                          : item.kind === 'vip_approved' ? '👑 таны VIP эрх амжилттай сунгагдлаа!'
                          : item.kind === 'new_task' ? '🗒️ шинэ даалгавар нэмэгдлээ!'
                          : item.kind === 'feedback_reply' ? '💬 таны санал хvсэлтэд хариу бичлээ'
                          : item.kind === 'donation_thanked' ? '💛 таны хандивд баярлалаа!'
                          : item.kind === 'appreciation_received' ? '🙏 танд дэмжих vг илгээлээ'
                          : item.kind === 'appreciation_oversight' ? '👁️ дэмжих vг илгээгдлээ'
                          : item.kind === 'staff_gift_received' ? '💐 танд цэцэг бэлэглэлээ'
                          : (mangaTitle ? `→ ${mangaTitle}${chapterLabel}` : '');
                        return (
                          <div key={item.id} onClick={() => goToNotification(item)}
                            style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1c1c1c', cursor: 'pointer', background: isUnread ? 'rgba(139,0,0,0.08)' : 'transparent' }}>
                            <Avatar url={item.users?.avatar_url} letter={(item.users?.name || '?')[0]} size={30} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.users?.name || 'Хэрэглэгч'} <span style={{ fontWeight: 400, color: '#777' }}>{actionLabel}</span>
                              </div>
                              <div style={{ fontSize: 12, color: '#ccc', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginTop: 2 }}>
                                {item.content || (item.sticker_url ? '🖼️ Стикер' : '')}
                              </div>
                              <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>{formatMnDate(item.created_at)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {currentUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* ЗАСВАР #53: emoji stiker-vvдийг цэвэрхэн SVG дvрсээр сольж байгаагийн нэг хэсэг */}
                {isStaff && (
                  <button onClick={() => setPage('admin')}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(139,0,0,0.2)', color: '#8B0000', border: '1px solid #8B0000', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    {isAdmin ? 'АДМИН' : 'УДИРДЛАГА'}
                  </button>
                )}
                <div style={{ position: 'relative' }}>
                  <div onClick={() => setProfileOpen(o => !o)} title="Хувиар" style={{ cursor: 'pointer' }}>
                    <Avatar url={userProfile?.avatar_url} letter={currentUser.email[0]} size={34} isVip={hasActiveVip} />
                  </div>

                  {/* ЗАСВАР #30: "Хувиар" тусдаа хуудас байхгvй болсон — avatar дээр дарахад
                      буланд гарч ирдэг жижиг цонх (dropdown) болгосон */}
                  {/* ЗАСВАР (алдаа — код шинжилгээ): энэ панель ("position:fixed")
                      топбарын дотор байрладаг байсан бөгөөд топбар "backdropFilter"
                      (glass эффект) ашигладаг тул, CSS-ийн дvрмээр топбар ӨӨРӨӨ
                      панелийн "containing block" болж, "top:50%" нь БvТЭН дэлгэцийн
                      биш зөвхөн топбарын (~60px өндөртэй) хэмжээгээр тооцогдож,
                      панель дэлгэцний дээд ирмэгээс "цухуйж" (хагас цуцарч) харагддаг
                      байв. React portal ашиглаж document.body руу шууд гаргав. */}
                  {profileOpen && createPortal(
                    <>
                      <div onClick={() => setProfileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 290, background: 'rgba(0,0,0,0.6)', cursor: 'pointer' }} />
                      {/* ЗАСВАР: топбарын жижиг avatar-т "хамаарсан" (absolute, top:120%,
                          right:0) байрлал нь дэлгэцний дээд ирмэгт "наалдаж" хэт дээгvvр,
                          заримдаа хажуу тийш гулссан мэт харагддаг байсан (ялангуяа доод
                          pill nav-ийн Профайл цэснээс нээх vед). Одоо төхөөрөмж vл
                          харгалзан vргэлж дэлгэцийн голд (fixed, төвлөрсөн) нэг л
                          байдлаар харуулна — байрлал урьдчилан таамаглагдахуйц болов. */}
                      <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        width: 340, maxWidth: '92vw', maxHeight: 'min(82vh, 560px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
                        background: 'rgba(17,17,17,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16, padding: '1.5rem', zIndex: 291,
                        boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 24px rgba(139,0,0,0.12)',
                        // ЗАСВАР (алдаа): document.body руу portal хийсний дараа энэ панель
                        // апп-ийн vндсэн (fontFamily/color тохируулсан) wrapper div-ээс
                        // ГАДУУР болсон тул тэдгээрийг өвлөхөө больж, browser-ийн
                        // өгөгдмөл фонт/өнгөөр (жишээ нь Times New Roman, хар текст) орж,
                        // badge/статистик мөрvvд эмх замбараагvй харагдаж байв — эндээ
                        // тодорхой заав.
                        color: '#fff', fontFamily: "'Noto Sans', Arial, 'Segoe UI', sans-serif",
                      }}>
                        {/* ЗАСВАР (хэрэглэгчийн хvсэлт): гадна харанхуй дэвсгэр дээр дарж
                            хаах нь заримдаа тодорхойгvй/бэрх мэдрэгддэг байсан тул, бусад
                            цонхнуудын адил тодорхой ✕ хаах товч нэмэв. */}
                        <span onClick={() => setProfileOpen(false)} title="Хаах"
                          style={{ position: 'absolute', top: 14, right: 14, width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', color: '#aaa', fontSize: 14, cursor: 'pointer', zIndex: 1 }}>
                          ✕
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: '1.25rem' }}>
                          <div style={{ position: 'relative' }}>
                            <Avatar url={userProfile?.avatar_url} letter={currentUser.email[0]} size={56} isVip={hasActiveVip} />
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
                              {/* ЗАСВАР #39: дуусах огноо биш, vлдсэн хоногийн тоог харуулна (жишээ нь 28 хоног) */}
                              {hasActiveVip && (
                                <div style={{ display: 'inline-block', background: 'rgba(245,166,35,0.15)', border: '1px solid #f5a623', color: '#f5a623', fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10 }}>
                                  👑 VIP{userProfile?.vip_expires_at ? ` · ${Math.max(0, Math.ceil((new Date(userProfile.vip_expires_at).getTime() - nowTs) / 86400000))} хоног vлдсэн` : ''}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ШИНЭ: цэцэг (даалгавраар олддог, VIP бvлэг тvр нээхэд) болон
                            од (VIP худалдаж авах бvрт цугладаг, 5000-д VIP солиход)
                            хоёр тусдаа "мөнгөн тэмдэгт"-ийн vлдэгдлийг профайл дээр харуулна. */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12,
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))',
                            border: '1px solid rgba(255,255,255,0.08)',
                          }}>
                            <span style={{ fontSize: 20 }}>💐</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 800, color: '#ff8fa3', lineHeight: 1.1 }}>{userProfile?.flower_balance || 0}</div>
                              <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>Цэцэг</div>
                            </div>
                          </div>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12,
                            background: 'linear-gradient(135deg, rgba(245,166,35,0.12), rgba(255,255,255,0.01))',
                            border: '1px solid rgba(245,166,35,0.2)',
                          }}>
                            <span style={{ fontSize: 20 }}>⭐</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 800, color: '#f5a623', lineHeight: 1.1 }}>{userProfile?.loyalty_points || 0}</div>
                              <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>Од · 5000-д VIP</div>
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
                            { label: 'Уншсан бvлэг', value: Object.values(readChapters).reduce((s, a) => s + a.length, 0) },
                          ].map((s, i) => (
                            <div key={i} style={{ background: '#1a1a1a', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
                              <div style={{ fontSize: 17, fontWeight: 800 }}>{s.value}</div>
                              <div style={{ fontSize: 10, color: '#777', marginTop: 2 }}>{s.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* ЗАСВАР (хэрэглэгчийн хvсэлт): "ГАРАХ" товчийг хассанаа орлуулж
                            нэмсэн байсан цэцэг/од pill-ийг ч бас хассан — дээд талд
                            (avatar-ийн доор) аль хэдийн ижил тоо харагддаг тул давхардуулах
                            шаардлагагvй байв. */}
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              </div>
            ) : (
              /* ЗАСВАР (хэрэглэгчийн хvсэлт): утасны дэлгэцэд доод pill nav-ийн
                 "Профайл" tab дарахад шууд нэвтрэх хуудас руу ордог тул, энэ
                 давхардсан топбарын НЭВТРЭХ товчийг зөвхөн desktop дээр vзvvлнэ. */
              !isMobile && (
                <button onClick={() => setAuthPage('login')}
                  style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  НЭВТРЭХ
                </button>
              )
            )}
          </div>
        </div>
        )}

        {/* ШИНЭ (дизайн сайжруулалт #1): хуудас (page) солигдох бvрд DOM-ыг
            key-ээр дахин mount хийж, зөөлөн fade+дээшээ шилжих анимэйшн
            (page-fade-in, index.css) тоглуулна — хатуу тасалдаг байсныг зөөллөв. */}
        <div key={page} className="page-fade-in">

        {/* ШИНЭ (хэрэглэгчийн хvсэлт): анх ачаалж байх агшинд "манга байхгvй"
            гэсэн (буруу ойлголт vvсгэдэг) зурвасын оронд бодит карт хэлбэртэй
            (poster-skeleton, index.css-ийн shimmer) placeholder харуулна. */}
        {page === 'home' && mangasLoading && allMangas.length === 0 && (
          <div style={{ padding: '1.5rem 2rem' }}>
            <div style={{ height: 220, borderRadius: 16, marginBottom: '2rem' }} className="poster-skeleton" />
            <div style={{ display: 'flex', gap: 12, overflowX: 'hidden' }}>
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} style={{ ...scrollCardStyle }}>
                  <div className="poster-skeleton" style={{ borderRadius: 8, aspectRatio: '3/4' }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HOME PAGE — DB-д манга байхгvй бол (жишээ нь шинэ суулгасан vед) хоосон дэлгэц биш зурвас харуулна */}
        {page === 'home' && !mangasLoading && allMangas.length === 0 && (
          <div style={{ color: '#555', textAlign: 'center', marginTop: '6rem' }}>
            Одоогоор манга байхгvй байна. Admin хуудаснаас манга нэмнэ vv.
          </div>
        )}
        {page === 'home' && allMangas.length > 0 && (
          <div>
            {/* ЗАСВАР #62: hero-г арай богиносгож (460→320), "30 хоногийн ТОП" бичгийг
                хассан, гарчгийн фонтыг жижигрvvлж, БVХЭЛ slide-ыг дархад манга
                хуудас руу ордог болгосон (өмнө нь зөвхөн гарчиг л дархад ажилладаг,
                бусад хэсэгт дарахад юу ч болдоггvй байсан). */}
            {/* ЗАСВАР #101: hero-г бvтэн-хэмжээ (edge-to-edge) биш, хvрээтэй/
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
                  {/* ЗАСВАР (дизайн сайжруулалт #16): hero зурган дээр удаан, зөөлөн
                      "ken burns" (аажим томроод жижигрэх) хөдөлгөөн нэмж, статик
                      зурган оронд бага зэрэг "амьд" мэдрэмж vvсгэв. */}
                  {recommendedMangas.map((m, i) => (
                    <div key={m.id} style={{ position: 'absolute', inset: 0, opacity: heroIndex === i ? 1 : 0, transition: 'opacity 0.9s ease', overflow: 'hidden' }}>
                      <img src={m.banner_url || m.poster} alt="" className="hero-ken-burns" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
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

            {/* Sections — ЗАСВАР #79: захиалсан дараалал: ТVVХ → ШИНЭ БVЛЭГ → ШИНЭ МАНГА → САНАЛ БОЛГОХ → ДУУССАН */}
            <div style={{ padding: '1.5rem 2rem 0' }}>
              {allMangas.filter(m => history.find(h => h.mangaId === m.id)).length > 0 && (
                <div style={{ marginBottom: '2.5rem' }}>
                  <SectionHeader title="ТVVХ" count={allMangas.filter(m => history.find(h => h.mangaId === m.id)).length} onClick={() => { setPreviousPage('home'); setAllCategory('history'); setPage('all'); }} />
                  <div className="scroll-row" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                    {allMangas.filter(m => history.find(h => h.mangaId === m.id)).map((m, i) => <div key={m.id} style={scrollCardStyle}><MangaCard m={m} showChapter={true} history={history} onOpen={goToDetail} priority={i < 4} /></div>)}
                  </div>
                </div>
              )}

              {/* ШИНЭ (хэрэглэгчийн хvсэлт): сvvлийн 30 хоногийн хамгийн их
                  vзэгдсэн ТОП мангануудыг дугаартай эрэмбийн мөр болгож
                  харуулна (hero-д ашигладаг topMangaIds өгөгдлийг дахин ашиглав). */}
              {monthlyTopMangas.length > 0 && (
                <div style={{ marginBottom: '2.5rem' }}>
                  <SectionHeader title="САРЫН ТОП" count={monthlyTopMangas.slice(0, 10).length} onClick={() => { setPreviousPage('home'); setAllCategory('monthlyTop'); setPage('all'); }} />
                  <div className="scroll-row" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                    {monthlyTopMangas.slice(0, 10).map((m, i) => {
                      // ЗАСВАР (хэрэглэгчийн хvсэлт): бvдэг тоймтой тоог арай илvv
                      // тод/анзаарагдахуйц, бvтэн дэвсгэртэй badge болгов.
                      const rankGrad = i === 0 ? 'linear-gradient(135deg, #ffe27a, #d4af37)' : i === 1 ? 'linear-gradient(135deg, #eef1f5, #a9b0bb)' : i === 2 ? 'linear-gradient(135deg, #e3a172, #a45a2a)' : 'linear-gradient(135deg, #a30000, #5c0000)';
                      const rankTextColor = i < 3 ? '#0a0a0a' : '#fff';
                      return (
                        <div key={m.id} onClick={() => goToDetail(m)} style={{ ...scrollCardStyle, cursor: 'pointer', position: 'relative' }}>
                          <div className="poster-hover poster-skeleton" style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '3/4' }}>
                            <img src={m.poster} alt={m.title} loading={i < 4 ? 'eager' : 'lazy'} decoding="async"
                              onLoad={e => { e.currentTarget.style.opacity = 1; }}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: 'opacity 0.3s ease' }} />
                            <div style={{
                              position: 'absolute', top: 6, left: 6, minWidth: 22, height: 22, padding: '0 5px', borderRadius: 7,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: rankGrad, boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                              fontFamily: "'Noto Serif', serif", fontWeight: 800, fontSize: 13, lineHeight: 1, color: rankTextColor,
                            }}>{i + 1}</div>
                          </div>
                          <div style={{ padding: '6px 2px' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{m.title}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '2.5rem' }}>
                <SectionHeader title="ШИНЭ БVЛЭГ" count={recentChapters.filter(ch => (isStaff || (ch.mangas && !ch.mangas.is_hidden)) && (isStaff || !ch.is_hidden) && (isStaff || !ch.pending_delete) && (isStaff || !chapterLocked(ch))).length} onClick={() => { setPreviousPage('home'); setAllCategory('recentChapter'); setPage('all'); }} />
                <div className="scroll-row" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                  {recentChapters
                    .filter(ch => (isStaff || (ch.mangas && !ch.mangas.is_hidden)) && (isStaff || !ch.is_hidden) && (isStaff || !ch.pending_delete) && (isStaff || !chapterLocked(ch)))
                    .map((ch, i) => (
                      <div key={ch.id}
                        onClick={() => ch.mangas && openReader(dbMangas.find(m => m.id === ch.mangas.id) || { id: ch.mangas.id, title: ch.mangas.title, poster: ch.mangas.poster_url, genres: ch.mangas.genres || [] }, ch)}
                        style={{ ...scrollCardStyle, cursor: 'pointer' }}>
                        <div className="poster-hover poster-skeleton" style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '3/4' }}>
                          <img src={ch.mangas?.poster_url} alt="" loading={i < 4 ? 'eager' : 'lazy'} decoding="async"
                            onLoad={e => { e.currentTarget.style.opacity = 1; }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: 'opacity 0.3s ease' }} />
                          <div style={{ position: 'absolute', top: 6, left: 6, background: '#8B0000', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>Бvлэг {ch.chapter_number}</div>
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
                  <SectionHeader title="ШИНЭ МАНГА" count={newMangas.length} onClick={() => { setPreviousPage('home'); setAllCategory('new'); setPage('all'); }} />
                  <div className="scroll-row" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                    {newMangas.map((m, i) => <div key={m.id} style={scrollCardStyle}><MangaCard m={m} showChapter={false} history={history} onOpen={goToDetail} priority={i < 4} /></div>)}
                  </div>
                </div>
              )}

              {/* ЗАСВАР #76: САНАЛ БОЛГОХ — admin гараар сонгосон 10 манга */}
              {curatedRecommended.length > 0 && (
                <div style={{ marginBottom: '2.5rem' }}>
                  <SectionHeader title="САНАЛ БОЛГОХ" count={curatedRecommended.length} onClick={() => { setPreviousPage('home'); setAllCategory('recommended'); setPage('all'); }} />
                  <div className="scroll-row" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                    {curatedRecommended.map((m, i) => <div key={m.id} style={scrollCardStyle}><MangaCard m={m} showChapter={false} history={history} onOpen={goToDetail} priority={i < 4} /></div>)}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '2.5rem' }}>
                <SectionHeader title="ДУУССАН" count={allMangas.filter(m => m.status === 'Дууссан').length} onClick={() => { setPreviousPage('home'); setAllCategory('finished'); setPage('all'); }} />
                <div className="scroll-row" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                  {allMangas.filter(m => m.status === 'Дууссан').map((m, i) => <div key={m.id} style={scrollCardStyle}><MangaCard m={m} showChapter={false} history={history} onOpen={goToDetail} priority={i < 4} /></div>)}
                </div>
              </div>
            </div>

            {/* ЗАСВАР #178: нvvр хуудасны хамгийн доод хэсэгт "бидний тухай" маягийн
                footer нэмэв — сайтын нэр + гол хуудсууд руу шилжих холбоос +
                copyright. */}
            <div style={{ marginTop: '1rem', padding: '2rem 2rem 3rem', background: '#0a0e17', textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>Roselle Manga</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
                {navItems.concat([{ label: 'Миний сан', p: 'library' }, { label: 'Эрх авах', p: 'vip' }]).map(item => (
                  <span key={item.p} onClick={() => { setPreviousPage('home'); setPage(item.p); if (item.p === 'all') setAllCategory(null); }}
                    style={{ color: '#8a92a6', fontSize: 14, cursor: 'pointer' }}>
                    {item.label}
                  </span>
                ))}
              </div>
              {/* ЗАСВАР (хэрэглэгчийн хvсэлт): sidebar-т байдаг сошиал icon-уудыг
                  нvvр хуудасны доод footer-т ч давхар харуулав. */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: '1.75rem' }}>
                <a href="https://www.facebook.com/share/1EPQ7dvPse/?mibextid=wwXIfr" target="_blank" rel="noreferrer" title="Facebook"
                  style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#161616', color: '#888', textDecoration: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5h2.5l.5-3h-3V8.5c0-.9.25-1.5 1.5-1.5H16.6V4.3C16.3 4.25 15.4 4.17 14.3 4.17c-2.3 0-3.8 1.4-3.8 3.9V10.5H8v3h2.5V21h3z"/></svg>
                </a>
                <a href="https://discord.gg/zVqcGQPF8" target="_blank" rel="noreferrer" title="Discord"
                  style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#161616', color: '#888', textDecoration: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6.5a17 17 0 0 0-4.2-1.3l-.2.4a12 12 0 0 1 3.7 1.9 15 15 0 0 0-14.6 0 12 12 0 0 1 3.7-1.9l-.2-.4A17 17 0 0 0 4 6.5C2 9.6 1.4 12.6 1.6 15.6a17 17 0 0 0 5.1 2.6l.6-1a11 11 0 0 1-1.8-.9l.4-.3a12 12 0 0 0 10.2 0l.4.3a11 11 0 0 1-1.8.9l.6 1a17 17 0 0 0 5.1-2.6c.3-3.5-.5-6.5-2.4-9.1zM9 14c-.7 0-1.3-.7-1.3-1.5S8.3 11 9 11s1.3.7 1.3 1.5S9.7 14 9 14zm6 0c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.3.7 1.3 1.5-.6 1.5-1.3 1.5z"/></svg>
                </a>
                <a href="https://www.instagram.com/theroselle_?igsh=MXQ0d3ZjY3g5N3Zwag%3D%3D&utm_source=qr" target="_blank" rel="noreferrer" title="Instagram"
                  style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#161616', color: '#888', textDecoration: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>
                </a>
              </div>

              <div style={{ marginTop: '1.5rem', color: '#4a5164', fontSize: 12 }}>
                © {new Date().getFullYear()} Roselle Manga
              </div>
            </div>
          </div>
        )}

        {/* ALL PAGE */}
        {page === 'all' && (
          <div style={{ padding: '1.5rem 2rem' }}>
            {/* ЗАСВАР #82: категорийн сумаар орж ирсэн vед хайлт/төрөл/эрэмбэ
                хэсгvvд шаардлагагvй тул зөвхөн "Бvх гаргалт"-аар (allCategory
                хоосон) орж ирсэн vед л харуулна. */}
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
                        <div onClick={() => { setActiveGenre('Бvгд'); setGenreOpen(false); }}
                          style={{ padding: '10px 16px', fontSize: 13, cursor: 'pointer', color: activeGenre === 'Бvгд' ? '#8B0000' : '#aaa', fontWeight: activeGenre === 'Бvгд' ? 700 : 400 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>БVГД</div>
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
              </>
            )}

            <SectionHeader title={{
              new: 'ШИНЭ МАНГА',
              finished: 'ДУУССАН',
              recommended: 'САНАЛ БОЛГОХ',
              monthlyTop: 'САРЫН ТОП',
              history: 'ТVVХ',
              recentChapter: 'ШИНЭ БVЛЭГ',
            }[allCategory] || 'БVХ ГАРГАЛТ'} />

            {/* ЗАСВАР (хэрэглэгчийн хvсэлт): "Бvх гаргалт" хуудсыг vргэлж 3 баганатай
                (auto-fill биш, тогтмол 3) grid болгож, карт бvрийг зөвхөн poster +
                баруун доод буланд тоогоор vзэлт vзvvлэхээр цэвэрлэв — гарчиг, төрлийн
                (genre) тэмдэг, "ШИНЭЭР/VЗЭЛТЭЭР" ангилах сонголтыг арилгав. */}
            {allCategory === 'recentChapter' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {recentChapters
                    .filter(ch => (isStaff || (ch.mangas && !ch.mangas.is_hidden)) && (isStaff || !ch.is_hidden) && (isStaff || !ch.pending_delete) && (isStaff || !chapterLocked(ch)))
                    .map((ch, i) => (
                      <div key={ch.id}
                        onClick={() => ch.mangas && openReader(dbMangas.find(m => m.id === ch.mangas.id) || { id: ch.mangas.id, title: ch.mangas.title, poster: ch.mangas.poster_url, genres: ch.mangas.genres || [] }, ch)}
                        style={{ cursor: 'pointer' }}>
                        <div className="poster-hover poster-skeleton" style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '3/4' }}>
                          <img src={ch.mangas?.poster_url} alt="" loading={i < 8 ? 'eager' : 'lazy'} decoding="async"
                            onLoad={e => { e.currentTarget.style.opacity = 1; }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: 'opacity 0.3s ease' }} />
                          <div style={{ position: 'absolute', top: 6, left: 6, background: '#8B0000', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>Бvлэг {ch.chapter_number}</div>
                          <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 5 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>{(ch.mangas?.views || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
                {recentChapters.filter(ch => (isStaff || (ch.mangas && !ch.mangas.is_hidden)) && (isStaff || !ch.is_hidden) && (isStaff || !ch.pending_delete) && (isStaff || !chapterLocked(ch))).length === 0 && (
                  <div style={{ color: '#555', textAlign: 'center', marginTop: '4rem' }}>Илэрц олдсонгvй</div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {filtered.map((m, i) => (
                    <div key={m.id} onClick={() => goToDetail(m)} style={{ cursor: 'pointer' }}>
                      <div className="poster-hover poster-skeleton" style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '3/4' }}>
                        <img src={m.poster} alt={m.title} loading={i < 8 ? 'eager' : 'lazy'} decoding="async"
                          onLoad={e => { e.currentTarget.style.opacity = 1; }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: 'opacity 0.3s ease' }} />
                        {/* ЗАСВАР (хэрэглэгчийн хvсэлт): MangaCard-с өмнө нь харагддаг байсан
                            "ГАРЧ БАЙГАА/ДУУССАН" төлвийн badge-ыг буцаагаад нэмэв. */}
                        {!m.is_hidden && (STATUS_META[m.status] || DEFAULT_STATUS_META).badge && (
                          <div style={{ position: 'absolute', top: 5, left: 5, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase' }}>
                            {(STATUS_META[m.status] || DEFAULT_STATUS_META).badge}
                          </div>
                        )}
                        <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 5 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>{(m.views || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {filtered.length === 0 && <div style={{ color: '#555', textAlign: 'center', marginTop: '4rem' }}>Илэрц олдсонгvй</div>}
              </>
            )}
          </div>
        )}

        {/* ШИНЭ: ХУВААРЬ — 7 хоногийн гарагаар манга гарах цаг */}
        {page === 'schedule' && (
          <div style={{ padding: '1.5rem 2rem' }}>
            <SectionHeader title="ХУВААРЬ" />

            {/* ЗАСВАР #107: манга-т гараар хуваарь тавьдаг байсан admin форм-ыг
                хассан — одоо зөвхөн "БVЛЭГ НЭМЭХ" дэх "Гарах цаг товлох" талбараар
                л энэ хуудсанд автоматаар харагдана (dayChapters). */}

            {/* ЗАСВАР (дизайн сайжруулалт — хэрэглэгчийн хvсэлт): хvрээтэй pill
                товчнуудыг арилгаад, зvгээр текст жагсаалт болгов — идэвхтэй
                өдрийг зөвхөн улаан (bold) текст + доор нь бяцхан зураас
                (underline mark)-аар ялгана, цэвэрхэн бөгөөд жижиг. */}
            <div className="scroll-row" style={{ display: 'flex', gap: 18, marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: 4 }}>
              {[1, 2, 3, 4, 5, 6, 0].map(d => {
                const isToday = d === new Date().getDay();
                const isSelected = d === scheduleDay;
                return (
                  <div key={d} onClick={() => setScheduleDay(d)}
                    style={{
                      flexShrink: 0, cursor: 'pointer', padding: '2px 0 8px',
                      color: isSelected ? '#8B0000' : '#888', fontWeight: isSelected ? 800 : 600, fontSize: 13,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      borderBottom: isSelected ? '2px solid #ff4d4d' : '2px solid transparent',
                      transition: 'color 0.2s ease, border-color 0.2s ease',
                    }}>
                    {DAYS[d]}
                    {isToday && <span style={{ width: 4, height: 4, borderRadius: '50%', background: isSelected ? '#8B0000' : '#555', flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>

            {(() => {
                const d = scheduleDay;
                {/* ЗАСВАР #72: schedule_day нь NULL vед Number(null) === 0 болж, хуваарьгvй
                    манга бvгд "Ням" гарагт орж ирдэг байсан алдааг засав */}
                const dayMangas = dbMangas.filter(m => m.schedule_day != null && Number(m.schedule_day) === d);
                // ЗАСВАР #21: тухайн долоо хоногт унах тодорхой цагт товлогдсон бvлгvvд
                // (scheduledChapters аль хэдийн ±3 хоногийн цонхонд хязгаарлагдсан тул
                // getDay()-ээр хуваарилах нь давхцалгvй найдвартай)
                // ЗАСВАР #151: нуугдсан манганы бvлгийг (staff-аас бусдад) харуулахгvй —
                // эс тэгвэл ch.mangas RLS-ээр null болж, гарчиг/зураггvй "хоосон" мөр харагдана
                const dayChapters = scheduledChapters.filter(ch => new Date(ch.publish_at).getDay() === d && (isStaff || (ch.mangas && !ch.mangas.is_hidden)));
                // ЗАСВАР (дизайн сайжруулалт): dayMangas/dayChapters хоёр ялгаатай
                // хэлбэрийг НЭГ ижил "карт" бvтэц рvv (grid-т зурах зорилгоор) буулгав.
                const cards = [
                  ...dayMangas.map(m => ({
                    key: `m${m.id}`, poster: m.poster, title: m.title, chapterNum: null,
                    countdownTarget: (() => {
                      const next = m.schedule_time ? nextScheduleDate(m.schedule_day, m.schedule_time) : null;
                      return next ? next.getTime() : null;
                    })(),
                    onOpen: () => goToDetail(m),
                    onEdit: isAdmin ? () => editMangaSchedule(m) : null,
                    onRemove: isAdmin ? () => removeMangaSchedule(m) : null,
                  })),
                  ...dayChapters.map(ch => {
                    const hasCustomTitle = ch.title && ch.title.trim() && ch.title.trim() !== `Бvлэг ${ch.chapter_number}`;
                    return {
                      key: `c${ch.id}`, poster: ch.thumbnail_url || ch.mangas?.poster_url,
                      title: `${ch.mangas?.title || 'Манга'}${hasCustomTitle ? ` · ${ch.title}` : ''}`,
                      chapterNum: ch.chapter_number,
                      countdownTarget: new Date(ch.publish_at).getTime(),
                      onOpen: () => goToDetail({ id: ch.manga_id, title: ch.mangas?.title, poster: ch.mangas?.poster_url }),
                      onEdit: isAdmin ? () => openEditChapter(ch) : null,
                      onRemove: isAdmin ? () => removeChapterSchedule(ch) : null,
                    };
                  }),
                ];

                return (
                  // ЗАСВАР (хэрэглэгчийн хvсэлт): дээрх өдрийн сонголтын мөр аль
                  // хэдийн сонгогдсон өдрийг (улаан текстээр) харуулдаг тул, эндэх
                  // "Пvрэв" гэх мэт давхардсан гарчгийг (isToday цэгийн хамт) хассан.
                  <div>
                    {cards.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#444', textAlign: 'center', padding: '2rem 0' }}>Энэ өдөр хуваарьтай зvйл алга</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 16 }}>
                        {cards.map(card => (
                          <div key={card.key} style={{ position: 'relative' }}>
                            <div onClick={card.onOpen} style={{ cursor: 'pointer' }}>
                              <div className="poster-hover poster-skeleton" style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '3/4' }}>
                                <img src={card.poster} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                                {card.chapterNum != null && (
                                  <div style={{ position: 'absolute', top: 6, left: 6, background: '#8B0000', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5 }}>
                                    Бvлэг {card.chapterNum}
                                  </div>
                                )}
                                {/* ЗАСВАР (хэрэглэгчийн хvсэлт): баруун доод буланд "UP · vлдсэн
                                    хугацаа" (цаг/минутаар, цэвэрхэн цагаан текст) харуулна.
                                    Хугацаа дуусмагц (nowTs-ээр шалгаж, LiveCountdown-ыг ЭХЭЛЖ
                                    ашиглахгvйгээр) тэр даруй "ШИНЭ" гэсэн vгээр солигдоно —
                                    LiveCountdown өөрөө дуусмагц null буцаадаг тул тэрхvv
                                    "алга болох" зан төлөвийг vvнээс сэргийлж тусад нь шалгав. */}
                                {card.countdownTarget && (
                                  card.countdownTarget <= nowTs ? (
                                    <div style={{ position: 'absolute', bottom: 6, right: 6, color: '#fff', fontSize: 10, fontWeight: 800, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                                      ШИНЭ
                                    </div>
                                  ) : (
                                    <LiveCountdown target={card.countdownTarget} onExpire={() => setNowTs(Date.now())}>
                                      {remainingMs => (
                                        <div style={{ position: 'absolute', bottom: 6, right: 6, color: '#fff', fontSize: 10, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                                          UP · {formatRemaining(remainingMs)}
                                        </div>
                                      )}
                                    </LiveCountdown>
                                  )
                                )}
                              </div>
                              <div style={{ padding: '7px 2px 0', fontSize: 12, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                {card.title}
                              </div>
                            </div>
                            {isAdmin && (card.onEdit || card.onRemove) && (
                              <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 4 }}>
                                {card.onEdit && (
                                  <span onClick={card.onEdit} title="Засах"
                                    style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#ccc', cursor: 'pointer' }}>✎</span>
                                )}
                                {card.onRemove && (
                                  <span onClick={card.onRemove} title="Хуваариас хасах"
                                    style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#ff6b6b', cursor: 'pointer', fontWeight: 700 }}>✕</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
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
              const slideIndex = reelSlideshowIndex[reel.id] || 0;
              const hasImages = !reel.video_url && reel.image_urls && reel.image_urls.length > 0;
              return (
                <div key={reel.id} data-reel-id={reel.id}
                  ref={el => { if (el) reelContainerRefs.current[reel.id] = el; else delete reelContainerRefs.current[reel.id]; }}
                  className="reel-item" style={{ position: 'relative', scrollSnapAlign: 'start', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {hasImages ? (
                    // ЗАСВАР (хэрэглэгчийн хvсэлт): автомат slideshow-ын оронд хэрэглэгч
                    // өөрөө зураг хажуу тийш нь (баруун/зvvн тал дарж эсвэл сумаар)
                    // гараар эргvvлдэг болгов.
                    <div
                      data-reel-id={reel.id}
                      onClick={e => {
                        if (reelsMuted) setReelsMuted(false);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const goPrev = (e.clientX - rect.left) < rect.width / 2;
                        const len = reel.image_urls.length;
                        setReelSlideshowIndex(prev => {
                          const cur = prev[reel.id] || 0;
                          return { ...prev, [reel.id]: goPrev ? (cur - 1 + len) % len : (cur + 1) % len };
                        });
                      }}
                      style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}>
                      {reel.image_urls.map((url, i) => (
                        <img key={url} src={url} alt="" style={{
                          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000',
                          opacity: i === slideIndex ? 1 : 0, transition: 'opacity 0.25s ease',
                        }} />
                      ))}
                      {reel.image_urls.length > 1 && (
                        <>
                          <div style={{ position: 'absolute', top: 10, left: 14, right: 14, display: 'flex', gap: 4, zIndex: 2 }}>
                            {reel.image_urls.map((_, i) => (
                              <div key={i} style={{ flex: 1, height: 2.5, borderRadius: 2, background: i === slideIndex ? '#fff' : 'rgba(255,255,255,0.3)' }} />
                            ))}
                          </div>
                          {slideIndex > 0 && (
                            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, pointerEvents: 'none' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                            </span>
                          )}
                          {slideIndex < reel.image_urls.length - 1 && (
                            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, pointerEvents: 'none' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                            </span>
                          )}
                        </>
                      )}
                      {reel.audio_url && (
                        <audio
                          ref={el => { if (el) reelAudioRefs.current[reel.id] = el; else delete reelAudioRefs.current[reel.id]; }}
                          src={reel.audio_url} muted={reelsMuted} loop playsInline />
                      )}
                    </div>
                  ) : (
                    <video
                      ref={el => { if (el) reelVideoRefs.current[reel.id] = el; else delete reelVideoRefs.current[reel.id]; }}
                      src={reel.video_url} muted={reel.audio_url ? true : reelsMuted} loop playsInline
                      // ЗАСВАР #143: реел дээр дарахад тоглуулах/зогсоохоос гадна дуугvй
                      // (бvгд өгөгдмөлөөр дуугvй эхэлдэг, browser-ийн autoplay
                      // бодлогын улмаас) байвал дууг нь ч нээнэ — өмнө нь зөвхөн
                      // буланд байрлах жижиг дуут дvрс дарж л дуу нээгддэг байсан.
                      onClick={e => {
                        if (reelsMuted) setReelsMuted(false);
                        e.currentTarget.paused ? e.currentTarget.play().catch(() => {}) : e.currentTarget.pause();
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', cursor: 'pointer' }} />
                  )}

                  {/* ШИНЭ: видеонд хавсаргасан тусдаа дуу — видеоны өөрийнх нь дууг нам
                      болгож (дээрх muted={true}), зөвхөн энэ тусгай дуу тоглуулна. */}
                  {reel.video_url && reel.audio_url && (
                    <audio
                      ref={el => { if (el) reelAudioRefs.current[reel.id] = el; else delete reelAudioRefs.current[reel.id]; }}
                      src={reel.audio_url} muted={reelsMuted} loop playsInline />
                  )}

                  <button onClick={() => setPage('home')} title="Буцах"
                    style={{ position: 'absolute', top: 16, left: 16, width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', zIndex: 2 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>

                  {/* ЗАСВАР (хэрэглэгчийн хvсэлт): зvрх дарах хэсгийг дээшлvvлэв (110 → 130 → 175) */}
                  <div style={{ position: 'absolute', right: 14, bottom: 175, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 2 }}>
                    <span onClick={() => toggleReelLike(reel)} className={liked ? 'like-pop' : ''}
                      style={{ cursor: 'pointer', width: 46, height: 46, borderRadius: '50%', background: 'rgba(20,20,20,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: liked ? '0 0 20px rgba(224,36,94,0.55)' : 'none', transition: 'box-shadow 0.25s ease' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill={liked ? '#e0245e' : 'none'} stroke={liked ? '#e0245e' : '#fff'} strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
                    </span>
                    <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{likeCount}</span>
                  </div>

                  {manga && (
                    // ЗАСВАР (хэрэглэгчийн хvсэлт): доод "pill" navigation bar-тай vед
                    // "Унших" товч vvнд дарагдаж (харагдахгvй болж) байсан тул дээшээ
                    // (bottom:28 → 100 → 120) шилжvvлж, голлуулав.
                    <div style={{ position: 'absolute', left: 14, right: 74, bottom: 120, zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, marginBottom: 10, textShadow: '0 1px 4px rgba(0,0,0,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center', width: '100%' }}>{manga.title}</div>
                      <button onClick={() => goToDetail(manga)}
                        style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '11px 40px', borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', maxWidth: 280, boxShadow: '0 0 22px rgba(139,0,0,0.55)' }}>
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
            <SectionHeader title="МИНИЙ САН" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 16 }}>
              {allMangas.filter(m => library.includes(m.id)).map((m, i) => (
                <div key={m.id} style={{ position: 'relative' }}>
                  <MangaCard m={m} showChapter={false} history={history} onOpen={goToDetail} priority={i < 8} />
                  <button onClick={() => toggleLibrary(m.id)}
                    style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#f5a623', fontSize: 16, cursor: 'pointer', borderRadius: 4, padding: '2px 6px' }}>★</button>
                </div>
              ))}
            </div>
            {library.length === 0 && <div style={{ color: '#555', textAlign: 'center', marginTop: '4rem' }}>Хадгалсан манга байхгvй байна</div>}
          </div>
        )}

        {/* ШИНЭ: САНАЛ ХvСЭЛТ хуудас — доод pill nav-ийн Профайл цэснээс нээгдэнэ */}
        {page === 'feedback' && currentUser && (() => {
          const catInfo = {
            suggestion: { label: 'Санал / Асуудал', color: '#4dabf7' },
            complaint: { label: 'Санал / Асуудал', color: '#4dabf7' },
            request: { label: 'Манга санал болгох', color: '#f5a623' },
            team: { label: '🤝 Баг нэгдэх', color: '#4dabf7' },
            donation: { label: '💛 Хандив', color: '#f5c518' },
          };
          return (
          <div style={{ padding: '1.5rem 2rem', maxWidth: 560, margin: '0 auto' }}>
            {/* ЗАСВАР (дизайн — бvрэн шинэчлэл): icon+гарчигтай толгой хэсэг, бvтэн
                маягтыг НЭГ "glass" картанд багтаав, ангилал сонголт glow-той
                pill боллоо, jsx-ийн бусад хэсэгтэй (VIP хуудас) ижил "тансаг"
                харагдацад нийцvvлэв. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(circle at 32% 28%, rgba(255,90,90,0.4), rgba(139,0,0,0.15))',
                boxShadow: '0 0 20px rgba(139,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.1)',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff8080" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#888' }}>Таны санал бидэнд чухал — шууд бидэнд хvрнэ</div>
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, rgba(139,0,0,0.07), rgba(255,255,255,0.02))',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '1.5rem',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)', marginBottom: 28,
            }}>
              {/* ЗАСВАР (хэрэглэгчийн хvсэлт): 3 ангиллыг НЭГ мөрөнд, ижил хэмжээ/
                  дизайнтай (flex: 1 тул vргэлж багтдаг) pill болгож нэгтгэв —
                  нэр урт болохоор хоёр мөр болж хуваагдахгvй богиносгов. */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
                {[
                  {
                    key: 'suggestion', label: 'Санал',
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>,
                  },
                  {
                    key: 'request', label: 'Манга',
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4.5A2.5 2.5 0 0 1 4.5 2H12v18H4.5A2.5 2.5 0 0 0 2 22z"/><path d="M22 4.5A2.5 2.5 0 0 0 19.5 2H12v18h7.5a2.5 2.5 0 0 1 2.5 2z"/></svg>,
                  },
                  {
                    key: 'team', label: 'Баг',
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
                  },
                ].map(c => (
                  <div key={c.key} onClick={() => setFeedbackCategory(c.key)} className={feedbackCategory === c.key ? 'nav-item-glow' : ''}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '9px 4px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      background: feedbackCategory === c.key ? 'rgba(139,0,0,0.18)' : 'rgba(255,255,255,0.03)',
                      border: feedbackCategory === c.key ? '1px solid rgba(139,0,0,0.6)' : '1px solid rgba(255,255,255,0.08)',
                      color: feedbackCategory === c.key ? '#fff' : '#999', transition: 'background 0.2s ease, color 0.2s ease',
                      whiteSpace: 'nowrap',
                    }}>
                    {c.icon}{c.label}
                  </div>
                ))}
              </div>

              {/* ШИНЭ (хэрэглэгчийн хvсэлт): "Баг нэгдэх" ангилалд эелдэг,
                  уриалсан тайлбар нэмэв — юуны тухай хэсэг болохыг тодорхой
                  болгож, нэгдэхийг урамшуулна. */}
              {feedbackCategory === 'team' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, marginBottom: 14,
                  background: 'linear-gradient(135deg, rgba(77,171,247,0.12), rgba(255,255,255,0.02))',
                  border: '1px solid rgba(77,171,247,0.25)',
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>🤝</span>
                  <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.5 }}>
                    Орчуулга, эдитор, шvvгч хийж чаддаг уу? Бидэнтэй нэг баг болоод хамтдаа Roselle Manga-г цаашид хөгжvvлцгээе! ✨
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6, letterSpacing: 0.3 }}>
                  {feedbackCategory === 'request' ? 'НЭМvvЛЭХИЙГ ХvСЭЖ БУЙ МАНГА/МАНХВЫН НЭР'
                    : feedbackCategory === 'team' ? 'БАГИЙН НЭР'
                    : 'ХОЛБООТОЙ МАНГА (ЗААВАЛ БИШ)'}
                </div>
                <input value={feedbackMangaTitle} onChange={e => setFeedbackMangaTitle(e.target.value)}
                  placeholder={feedbackCategory === 'request' ? 'Жишээ нь: Solo Leveling' : feedbackCategory === 'team' ? 'Багийнхаа нэрийг бичнэ vv' : 'Манганы нэр'}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {feedbackCategory === 'team' && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6, letterSpacing: 0.3 }}>БАГИЙН ХУУДАС/ХОЛБООС (ЗААВАЛ БИШ)</div>
                  <input value={feedbackLinkUrl} onChange={e => setFeedbackLinkUrl(e.target.value)}
                    placeholder="Жишээ нь: Facebook/Discord хуудасны холбоос"
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              )}

              {feedbackCategory === 'request' && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6, letterSpacing: 0.3 }}>ЗУРАГ ХАВСАРГАХ (ЗААВАЛ БИШ)</div>
                  {feedbackImagePreview ? (
                    <div style={{ position: 'relative', width: 110 }}>
                      <img src={feedbackImagePreview} alt="" style={{ width: 110, height: 146, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }} />
                      <span onClick={() => { setFeedbackImageFile(null); setFeedbackImagePreview(''); }} title="Хасах"
                        style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%', background: '#8B0000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, fontWeight: 700, boxShadow: '0 0 12px rgba(139,0,0,0.6)' }}>✕</span>
                    </div>
                  ) : (
                    // ЗАСВАР (дизайн): зураг сонгох талбарт drag&drop дэмжлэг нэмэв —
                    // чирж авчраад тавихад ч, дарж сонгосонтой адил зураг орно.
                    <label
                      onDragOver={e => { e.preventDefault(); setFeedbackDragActive(true); }}
                      onDragLeave={() => setFeedbackDragActive(false)}
                      onDrop={e => {
                        e.preventDefault();
                        setFeedbackDragActive(false);
                        const file = e.dataTransfer.files && e.dataTransfer.files[0];
                        if (!file) return;
                        const err = validateImageFile(file);
                        if (err) { notify(err); return; }
                        setFeedbackImageFile(file);
                        setFeedbackImagePreview(URL.createObjectURL(file));
                      }}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 90,
                        background: feedbackDragActive ? 'rgba(139,0,0,0.1)' : 'rgba(255,255,255,0.02)',
                        border: feedbackDragActive ? '1.5px dashed #8B0000' : '1.5px dashed rgba(255,255,255,0.15)',
                        borderRadius: 12, color: '#888', fontSize: 12, cursor: 'pointer', boxSizing: 'border-box', transition: 'background 0.15s ease, border-color 0.15s ease',
                      }}>
                      <IconImage size={18} color="#8B0000" />
                      {feedbackDragActive ? 'Энд тавина уу' : 'Зураг сонгох эсвэл чирж тавих'}
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => {
                          const file = e.target.files[0];
                          e.target.value = '';
                          if (!file) return;
                          const err = validateImageFile(file);
                          if (err) { notify(err); return; }
                          setFeedbackImageFile(file);
                          setFeedbackImagePreview(URL.createObjectURL(file));
                        }} />
                    </label>
                  )}
                </div>
              )}

              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6, letterSpacing: 0.3 }}>{feedbackCategory === 'team' ? 'ӨӨРИЙГӨӨ/БАГАА ТАНИЛЦУУЛАХ' : 'МЕССЕЖ'}</div>
                <textarea value={feedbackMessage} onChange={e => setFeedbackMessage(e.target.value.slice(0, 2000))}
                  placeholder={feedbackCategory === 'team' ? 'Юу орчуулдаг, туршлага, яагаад нэгдмээр байгаагаа бичнэ vv...' : 'Санал хvсэлтээ энд бичнэ vv...'} rows={5}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 11, color: '#555', marginTop: 4, textAlign: 'right' }}>{feedbackMessage.length}/2000</div>
              </div>

              <button disabled={feedbackSending} onClick={submitFeedback}
                style={{ width: '100%', background: feedbackSending ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '13px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: feedbackSending ? 'not-allowed' : 'pointer', boxShadow: feedbackSending ? 'none' : '0 0 24px rgba(139,0,0,0.45)' }}>
                {feedbackSending ? 'ИЛГЭЭЖ БАЙНА...' : 'ИЛГЭЭХ'}
              </button>
            </div>

            {/* ЗАСВАР (хэрэглэгчийн хvсэлт): tab-vvдийг хассан — "Ажилтныг урамшуулах"
                НЭГ л жагсаалт, "⭐ Урамшуулах" дарахад нээгдэх modal дотор нь
                (VIP хэрэглэгчид) "💛 Хандив өгөх" сонголт нэмэлтээр гарч ирнэ. */}
            {staffList.length > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(245,166,35,0.06), rgba(255,255,255,0.02))',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(245,166,35,0.15)', borderRadius: 18, padding: '1.25rem',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)', marginBottom: 28,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 4, height: 16, background: '#f5c518', borderRadius: 2 }} />
                  <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.3 }}>ADMIN ДЭМЖИХ</span>
                </div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 14, lineHeight: 1.5 }}>
                  Хичээж ажилладаг эдитор/модератор/админ нартаа дэмжих vг vлдээгээрэй ✨
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {staffList.map(s => {
                    const roleKey = (s.roles || []).includes('admin') ? 'admin' : (s.roles || []).includes('moderator') ? 'moderator' : 'editor';
                    const roleMeta = {
                      admin: { label: 'Админ', color: '#f5c518' },
                      moderator: { label: 'Модератор', color: '#4dabf7' },
                      editor: { label: 'Эдитор', color: '#9aa0ab' },
                    }[roleKey];
                    return (
                      <div key={s.id} style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: roleMeta.color }} />
                        <Avatar url={s.avatar_url} letter={(s.name || '?')[0]} size={38} isVip={roleKey === 'admin'} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name || 'Ажилтан'}</div>
                          <div style={{ fontSize: 10, color: roleMeta.color, marginTop: 2, fontWeight: 700 }}>{roleMeta.label}</div>
                        </div>
                        <button onClick={() => { setAppreciateTarget(s); setAppreciateMessage(''); setDonationOpenInModal(false); setDonationAmount(''); setDonationMessage(''); }}
                          style={{ background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.35)', color: '#f5c518', padding: '7px 14px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                          ⭐ Дэмжих
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ШИНЭ: сонгосон ажилтанд урамшуулах vг илгээх modal — доторх нь
                (VIP хэрэглэгчид) сонголтоор "Хандив өгөх" дэд хэсэг нээгдэнэ. */}
            {appreciateTarget && (
              <>
                <div onClick={() => setAppreciateTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, cursor: 'pointer' }} />
                <div style={{
                  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: 320, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto', background: 'rgba(17,17,17,0.97)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '1.25rem', zIndex: 401,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.6)', textAlign: 'center',
                }}>
                  <Avatar url={appreciateTarget.avatar_url} letter={(appreciateTarget.name || '?')[0]} size={48} />
                  <div style={{ fontWeight: 800, fontSize: 14, marginTop: 8, marginBottom: 14 }}>{appreciateTarget.name || 'Ажилтан'}-г дэмжих</div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6, textAlign: 'left' }}>СЭТГЭГДЭЛ (заавал биш)</div>
                  <textarea value={appreciateMessage} onChange={e => setAppreciateMessage(e.target.value.slice(0, 500))} rows={3}
                    placeholder="Баярлалаа! Маш сайн ажилладаг юм аа..."
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: 14 }} />
                  <button disabled={appreciateSending} onClick={appreciateStaff}
                    style={{ width: '100%', background: 'linear-gradient(90deg, #8B0000, #f5a623)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                    {appreciateSending ? 'ИЛГЭЭЖ БАЙНА...' : 'ИЛГЭЭХ'}
                  </button>

                  {hasActiveVip && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <div onClick={() => setDonationOpenInModal(o => !o)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#f5c518' }}>
                        💛 Хандив өгөх (заавал биш) {donationOpenInModal ? '▲' : '▼'}
                      </div>
                      {donationOpenInModal && (
                        <div style={{ marginTop: 12, textAlign: 'left' }}>
                          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: '0.85rem', marginBottom: 12 }}>
                            <div style={{ fontSize: 10, color: '#555', marginBottom: '0.5rem', textAlign: 'center', letterSpacing: 1 }}>ДАРААХ ДАНСАНД ШИЛЖvvЛНЭ vv</div>
                            {[
                              { label: 'Банкны нэр', value: 'Хаан банк', copyable: false },
                              { label: 'Дансны дугаар', value: '350005005401075000', copyable: true },
                              { label: 'Хvлээн авагч', value: 'Хандсvрэн Энхнамуун', copyable: false },
                            ].map((item, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                                <span style={{ fontSize: 11, color: '#666' }}>{item.label}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                  {item.copyable && (
                                    <button onClick={() => navigator.clipboard.writeText(item.value).then(() => notify(item.label + ' хуулагдлаа!'))}
                                      title="Хуулах"
                                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', border: '1px solid #333', color: '#ccc', borderRadius: 6, width: 22, height: 22, cursor: 'pointer', flexShrink: 0 }}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="9" y="9" width="13" height="13" rx="2"/>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                      </svg>
                                    </button>
                                  )}
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', overflowWrap: 'anywhere', textAlign: 'right' }}>{item.value}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>ШИЛЖvvЛСЭН ДvН (₮)</div>
                          <input value={donationAmount} onChange={e => setDonationAmount(e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="Жишээ нь: 10000"
                            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '9px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
                          <button disabled={donationSending} onClick={sendAdminDonation}
                            style={{ width: '100%', background: donationSending ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: 11, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: donationSending ? 'not-allowed' : 'pointer' }}>
                            {donationSending ? 'ИЛГЭЭЖ БАЙНА...' : 'ХАНДИВ МЭДЭГДЭХ'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.3 }}>МИНИЙ ХvСЭЛТvvД</span>
              </div>
              {/* ЗАСВАР (дизайн): ачаалж байх vед skeleton карт, огт хоосон vед
                  hурхан empty-state, эс бол жагсаалт харуулна. */}
              {feedbackLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[0, 1, 2].map(i => <div key={i} className="poster-skeleton" style={{ height: 78, borderRadius: 12 }} />)}
                </div>
              ) : myFeedback.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#555' }}>
                  <div style={{ fontSize: 34, marginBottom: 10 }}>🌙</div>
                  <div style={{ fontSize: 13 }}>Одоогоор илгээсэн санал хvсэлт алга</div>
                  <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>Дээрх маягтаар анхныхаа саналыг илгээгээрэй!</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {myFeedback.map(f => {
                    const resolved = f.status === 'resolved';
                    const info = catInfo[f.category] || { label: f.category, color: '#4dabf7' };
                    const expanded = feedbackExpandedId === f.id;
                    return (
                      <div key={f.id} className="page-fade-in" style={{
                        position: 'relative', overflow: 'hidden',
                        background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '13px 16px 13px 18px',
                      }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: resolved ? 'linear-gradient(180deg, #6bd06b, #2e7d32)' : 'linear-gradient(180deg, #ffb84d, #f5a623)' }} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: info.color }}>{info.label}{f.manga_title ? ` · ${f.manga_title}` : ''}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 8, background: resolved ? 'rgba(76,175,80,0.15)' : 'rgba(245,166,35,0.15)', color: resolved ? '#4caf50' : '#f5a623', flexShrink: 0 }}>
                            {resolved ? 'ШИЙДЭГДСЭН' : 'ХvЛЭЭГДЭЖ БУЙ'}
                          </span>
                        </div>
                        {f.image_url && <img src={f.image_url} alt="" style={{ width: 76, height: 100, objectFit: 'cover', borderRadius: 8, marginBottom: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }} />}
                        <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>{f.message}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                          <div style={{ fontSize: 10, color: '#555' }}>{formatMnDate(f.created_at)}</div>
                          {/* ШИНЭ: thread маягийн хариу бичих/харах (admin-той харилцах) */}
                          <span onClick={() => toggleFeedbackThread(f.id)} style={{ fontSize: 11, fontWeight: 700, color: '#8B0000', cursor: 'pointer' }}>
                            💬 {expanded ? 'Хаах' : 'Хариу бичих'}
                          </span>
                        </div>
                        {expanded && (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                            {feedbackThreadLoadingId === f.id ? (
                              <div style={{ fontSize: 11, color: '#555' }}>Ачаалж байна...</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                                {(feedbackThreads[f.id] || []).length === 0 ? (
                                  <div style={{ fontSize: 11, color: '#555' }}>Хариу алга — эхний мессежээ бичээрэй.</div>
                                ) : (feedbackThreads[f.id] || []).map(m => (
                                  <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <Avatar url={m.users?.avatar_url} letter={(m.users?.name || '?')[0]} size={24} />
                                    <div style={{
                                      minWidth: 0, flex: 1, borderRadius: 10, padding: '7px 10px',
                                      background: m.is_staff ? 'rgba(139,0,0,0.14)' : 'rgba(255,255,255,0.03)',
                                      border: m.is_staff ? '1px solid rgba(139,0,0,0.3)' : '1px solid rgba(255,255,255,0.06)',
                                    }}>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: m.is_staff ? '#ff8080' : '#999' }}>
                                        {m.is_staff ? '👑 Roselle Manga' : (m.users?.name || 'Хэрэглэгч')}
                                      </div>
                                      <div style={{ fontSize: 12, color: '#ddd', marginTop: 2, lineHeight: 1.4 }}>{m.message}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input value={feedbackReplyDrafts[f.id] || ''} onChange={e => setFeedbackReplyDrafts(prev => ({ ...prev, [f.id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') sendFeedbackReply(f.id); }}
                                placeholder="Хариу бичих..."
                                style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: '7px 10px', color: '#fff', fontSize: 12, outline: 'none' }} />
                              <button disabled={feedbackReplySendingId === f.id} onClick={() => sendFeedbackReply(f.id)}
                                style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                                {feedbackReplySendingId === f.id ? '...' : 'ИЛГЭЭХ'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* ШИНЭ (хэрэглэгчийн хvсэлт): ЭРЭМБЭ хуудас — энэ сард хамгийн олон
            бvлэг уншсан хэрэглэгчдийн жагсаалт, сар бvр шинэчлэгдэнэ. Эхний 3
            байрыг medal-тай подиум байдлаар, 4-20-г энгийн жагсаалтаар,
            хэрэглэгчийн өөрийнх нь эрэмбэ доод талд vргэлж харагдана. */}
        {page === 'rank' && currentUser && (() => {
          const top3 = rankList.slice(0, 3);
          const rest = rankList.slice(3, 20);
          // ЗАСВАР (хэрэглэгчийн хvсэлт): emoji медалийн оронд сайтын бусад хэсэгтэй
          // ижил (stroke-based SVG) загвартай "цом" дvрс ашиглав.
          const medalMeta = [
            { grad: 'linear-gradient(135deg, #ffe27a, #d4af37)', ring: '#ffd700', size: 68, lift: -16, badgeSize: 26 },
            { grad: 'linear-gradient(135deg, #eef1f5, #a9b0bb)', ring: '#c8ccd2', size: 56, lift: 0, badgeSize: 22 },
            { grad: 'linear-gradient(135deg, #e3a172, #a45a2a)', ring: '#cd7f32', size: 56, lift: 0, badgeSize: 22 },
          ];
          const TrophyIcon = ({ size, color }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 21h8" fill="none"/><path d="M12 17v4" fill="none"/>
              <path d="M7 4h10v5a5 5 0 0 1-10 0z"/>
              <path d="M7 6H4a2 2 0 0 0 2 4" fill="none"/><path d="M17 6h3a2 2 0 0 1-2 4" fill="none"/>
            </svg>
          );
          // ШИНЭ (хэрэглэгчийн хvсэлт): "X оноо" гэсэн энгийн текстийг оронд нь
          // од-иконтой жижиг pill (badge) дизайнаар сайжруулав.
          const ScorePill = ({ score, tint, big }) => (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
              padding: big ? '4px 10px' : '3px 9px', borderRadius: 999,
              background: `${tint}22`, border: `1px solid ${tint}55`,
            }}>
              <svg width={big ? 12 : 10} height={big ? 12 : 10} viewBox="0 0 24 24" fill={tint} stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <span style={{ fontSize: big ? 13 : 11, fontWeight: 800, color: tint }}>{score} оноо</span>
            </div>
          );
          // Подиум дараалал: 2-р байр зvvн, 1-р байр гол (өндөр), 3-р байр баруун.
          const podiumSlots = [
            { entry: top3[1], medal: medalMeta[1] },
            { entry: top3[0], medal: medalMeta[0] },
            { entry: top3[2], medal: medalMeta[2] },
          ];
          return (
          <div style={{ padding: '1.5rem 2rem', maxWidth: 560, margin: '0 auto', paddingBottom: isMobile ? 130 : 90 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(circle at 32% 28%, rgba(255,215,0,0.4), rgba(139,0,0,0.15))',
                boxShadow: '0 0 20px rgba(255,215,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.1)',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffd700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a2 2 0 0 0 2 4"/><path d="M17 6h3a2 2 0 0 1-2 4"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>Энэ сард хамгийн олон оноо цуглуулсан хэрэглэгчид</div>
              </div>
            </div>

            {rankLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[0, 1, 2, 3].map(i => <div key={i} className="poster-skeleton" style={{ height: 56, borderRadius: 14 }} />)}
              </div>
            ) : rankList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#555' }}>
                <div style={{ fontSize: 34, marginBottom: 10 }}>🏆</div>
                <div style={{ fontSize: 13 }}>Энэ сар одоогоор хэн ч бvлэг уншаагvй байна</div>
                <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>Эхний уншигч та байж болно!</div>
              </div>
            ) : (
              <>
                {/* ПОДИУМ — эхний 3 байр */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 10, marginBottom: 24, padding: '0 4px' }}>
                  {podiumSlots.map((slot, i) => {
                    if (!slot.entry) return <div key={i} style={{ flex: 1, maxWidth: 150 }} />;
                    const e = slot.entry;
                    const m = slot.medal;
                    return (
                      <div key={e.user_id} style={{ flex: 1, maxWidth: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${m.lift}px)` }}>
                        <div style={{ position: 'relative', marginBottom: 8 }}>
                          <div style={{ width: m.size, height: m.size, borderRadius: '50%', padding: 3, background: m.grad, boxShadow: `0 0 22px ${m.ring}66` }}>
                            <Avatar url={e.avatar_url} letter={(e.name || '?')[0]} size={m.size - 6} />
                          </div>
                          <span style={{
                            position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
                            width: m.badgeSize + 10, height: m.badgeSize + 10, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: m.grad, border: '2px solid #0a0a0a', boxShadow: `0 2px 8px ${m.ring}88`,
                          }}>
                            <TrophyIcon size={m.badgeSize} color="#0a0a0a" />
                          </span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{e.name || 'Хэрэглэгч'}</div>
                        <div style={{ marginTop: 3 }}><ScorePill score={e.score} tint={m.ring} /></div>
                      </div>
                    );
                  })}
                </div>

                {/* 4-20-Р БАЙР */}
                {rest.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rest.map(e => {
                      const isMe = e.user_id === currentUser.id;
                      return (
                        <div key={e.user_id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 12,
                          background: isMe ? 'rgba(139,0,0,0.14)' : 'rgba(255,255,255,0.025)',
                          border: isMe ? '1px solid rgba(139,0,0,0.5)' : '1px solid rgba(255,255,255,0.06)',
                        }}>
                          <span style={{ width: 22, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#888', flexShrink: 0 }}>{e.rnk}</span>
                          <Avatar url={e.avatar_url} letter={(e.name || '?')[0]} size={30} />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name || 'Хэрэглэгч'}</span>
                          <ScorePill score={e.score} tint="#f5a623" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ШИНЭ: хэрэглэгчийн өөрийнх нь эрэмбэ vргэлж доод талд (ТОП 20-д
                ороогvй ч) харагдана. */}
            <div style={{
              position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: isMobile ? 92 : 20, zIndex: 230,
              width: 'calc(100% - 32px)', maxWidth: 496, boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderRadius: 16,
              background: 'rgba(20,20,25,0.94)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,215,0,0.25)', boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
            }}>
              <Avatar url={userProfile?.avatar_url} letter={currentUser.email[0]} size={32} isVip={hasActiveVip} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 3 }}>Таны байр</div>
                {myRank ? <ScorePill score={myRank.score} tint="#ffd700" big /> : <div style={{ fontSize: 10, color: '#888' }}>Энэ сар оноо алга</div>}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#ffd700', flexShrink: 0 }}>{myRank ? `#${myRank.rnk}` : '—'}</div>
            </div>
          </div>
          );
        })()}

        {/* ШИНЭ: ДААЛГАВАР хуудас — доод pill nav-ийн Профайл цэснээс нээгдэнэ */}
        {page === 'tasks' && currentUser && (() => {
          const claimedCount = tasksList.filter(t => myTaskClaims.includes(t.id)).length;
          // ЗАСВАР (хэрэглэгчийн хvсэлт — "цэцэг" систем): даалгавар биелvvлэхэд
          // шууд VIP хоног биш, "цэцэг" (💐) шагнадаг болов — цэцгээ дараа нь
          // дурын НЭГ VIP бvлгийг 3 хоногийн турш нээхэд зарцуулна (VIP gate modal).
          return (
          <div style={{ padding: '1.5rem 2rem', maxWidth: 560, margin: '0 auto' }}>
            {/* ЗАСВАР (дизайн — бvрэн шинэчлэл): icon+гарчигтай толгой хэсэг, миний
                нийт явцын (биелvvлсэн/нийт, олсон цэцэг) хураангуй карт нэмж,
                чеклистийн мөр бvрийг glass+glow загварт оруулав. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(circle at 32% 28%, rgba(255,90,90,0.4), rgba(139,0,0,0.15))',
                boxShadow: '0 0 20px rgba(139,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.1)',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff8080" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M9 12l2 2 4-4"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#888' }}>Даалгавар биелvvлээд цэцэг цуглуулж, VIP бvлэг нээгээрэй</div>
              </div>
            </div>

            {tasksList.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14, padding: '14px 18px',
                background: 'linear-gradient(135deg, rgba(139,0,0,0.1), rgba(255,255,255,0.02))',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
              }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{claimedCount}/{tasksList.length}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Биелvvлсэн</div>
                </div>
                <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.1)' }} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#f5a623' }}>💐 {userProfile?.flower_balance || 0}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Одоо байгаа цэцэг</div>
                </div>
              </div>
            )}

            {/* ШИНЭ: хамгийн олон даалгавар биелvvлсэн хэрэглэгчдийн leaderboard */}
            {taskLeaderboard.length > 0 && (
              <div className="scroll-row" style={{
                display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, padding: '12px 16px', borderRadius: 14, overflowX: 'auto',
                background: 'linear-gradient(135deg, rgba(245,166,35,0.08), rgba(255,255,255,0.02))',
                border: '1px solid rgba(245,166,35,0.18)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#f5a623', flexShrink: 0 }}>🏆 ТОП</div>
                {taskLeaderboard.map((u, i) => (
                  <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: '#666', fontWeight: 700 }}>{i + 1}.</span>
                    <Avatar url={u.avatar_url} letter={(u.name || '?')[0]} size={22} />
                    <span style={{ fontSize: 11, color: '#ccc', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || 'Хэрэглэгч'}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#f5a623' }}>{u.completed_count}</span>
                  </div>
                ))}
              </div>
            )}

            {tasksLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[0, 1, 2, 3].map(i => <div key={i} className="poster-skeleton" style={{ height: 62, borderRadius: 14 }} />)}
              </div>
            ) : tasksList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#555' }}>
                <div style={{ fontSize: 34, marginBottom: 10 }}>🗒️</div>
                <div style={{ fontSize: 13 }}>Одоогоор идэвхтэй даалгавар алга</div>
                <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>Удахгvй шинэ даалгавар нэмэгдэх болно, дахин эргэж vзээрэй!</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasksList
                  .slice()
                  .sort((a, b) => (myTaskClaims.includes(a.id) ? 1 : 0) - (myTaskClaims.includes(b.id) ? 1 : 0))
                  .map(t => {
                  // ШИНЭ (хэрэглэгчийн хvсэлт): "manual" төрлийн даалгавар — автомат
                  // явц тооцохгvй, хэрэглэгч шууд "БИЕЛvvЛЛЭЭ" дараад admin/moderator
                  // баталгаажуулах хvртэл "Шалгагдаж байна" төлөвтэй байна.
                  const isManual = t.requirement_type === 'manual';
                  const isMangaChapters = t.requirement_type === 'manga_chapters';
                  const progress = isMangaChapters ? (myMangaProgress[t.target_manga_id] || 0) : (myProgress[t.requirement_type] || 0);
                  const done = isManual || progress >= t.requirement_count;
                  const hasClaim = myTaskClaims.includes(t.id);
                  const claimStatus = myTaskClaimStatus[t.id];
                  const isPending = hasClaim && claimStatus === 'pending';
                  const claimed = hasClaim && claimStatus !== 'pending';
                  const targetMangaTitle = isMangaChapters ? (dbMangas.find(m => m.id === t.target_manga_id)?.title || '') : '';
                  const typeLabel = t.requirement_type === 'comments' ? 'сэтгэгдэл' : (t.requirement_type === 'chapters_read' || isMangaChapters) ? 'бvлэг' : '';
                  const pct = Math.min(100, Math.round((progress / (t.requirement_count || 1)) * 100));
                  const hasDeadline = !!t.expires_at && new Date(t.expires_at).getTime() > nowTs;
                  const remainingMs = hasDeadline ? new Date(t.expires_at).getTime() - nowTs : 0;
                  const rewardLabel = t.reward_type === 'vip_days' ? `👑 ${t.reward_vip_days || 1} хоног VIP` : `💐 ${t.reward_flowers} цэцэг`;
                  const handleClaimClick = () => {
                    if (!done || hasClaim) return;
                    // ЗАСВАР (хэрэглэгчийн хvсэлт): зурагтай баталгаажуулалтгvйгээр
                    // ганцхан товшилтоор бичvvлдэг байсныг арилгав — цаашид
                    // "manual" даалгавар БvГД (requires_proof-оос vл хамаарч)
                    // заавал баталгаажуулах зураг шаардана.
                    if (isManual) {
                      setPendingProofTask(t);
                      taskProofInputRef.current?.click();
                      return;
                    }
                    claimTask(t);
                  };
                  return (
                    <div key={t.id} onClick={handleClaimClick} className={`page-fade-in ${(done && !hasClaim) ? 'task-claimable-glow' : ''}`}
                      style={{
                        position: 'relative', overflow: 'hidden',
                        display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px 13px 18px',
                        background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14,
                        cursor: (done && !hasClaim) ? 'pointer' : 'default', opacity: claimed ? 0.55 : 1,
                      }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: claimed ? 'linear-gradient(180deg, #6bd06b, #2e7d32)' : isPending ? 'linear-gradient(180deg, #f5a623, #b8790a)' : done ? 'linear-gradient(180deg, #ff5a5a, #8B0000)' : 'rgba(255,255,255,0.08)' }} />
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: claimed ? '#4caf50' : isPending ? 'rgba(245,166,35,0.15)' : done ? 'radial-gradient(circle at 32% 28%, rgba(255,90,90,0.4), rgba(139,0,0,0.15))' : 'rgba(255,255,255,0.03)',
                        boxShadow: claimed ? '0 0 12px rgba(76,175,80,0.5)' : done ? '0 0 14px rgba(139,0,0,0.4)' : 'none',
                        border: (claimed || done) ? 'none' : '1.5px solid rgba(255,255,255,0.15)',
                      }}>
                        {isPending ? <span style={{ fontSize: 13 }}>⏳</span> : (claimed || done) && <IconCheck size={13} color={claimed ? '#fff' : '#ff8080'} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, textDecoration: claimed ? 'line-through' : 'none', color: claimed ? '#777' : '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {t.title}
                          {/* ШИНЭ: даалгаврын дэлгэрэнгvй тайлбарыг modal-аар харуулах товч */}
                          <span onClick={e => { e.stopPropagation(); setTaskDetailModal(t); }} title="Дэлгэрэнгvй"
                            style={{ fontSize: 11, color: '#666', cursor: 'pointer', flexShrink: 0 }}>ⓘ</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          {isPending ? 'Admin/moderator шалгаж байна...' : isManual ? `Гараар тэмдэглэнэ (зураг хавсаргана) · ${rewardLabel}` : `${targetMangaTitle ? targetMangaTitle + ': ' : ''}${Math.min(progress, t.requirement_count)}/${t.requirement_count} ${typeLabel} · ${rewardLabel}`}
                          {hasDeadline && <> · ⏳ {formatCountdownClock(remainingMs)}</>}
                        </div>
                        {/* ШИНЭ: явцын progress bar (manual төрөлд харуулахгvй) */}
                        {!claimed && !isPending && !isManual && (
                          <div style={{ height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginTop: 6, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: done ? 'linear-gradient(90deg, #8B0000, #ff5a5a)' : 'linear-gradient(90deg, #555, #888)', transition: 'width 0.4s ease' }} />
                          </div>
                        )}
                      </div>
                      {!hasClaim && (
                        done ? (
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#ff8080', flexShrink: 0 }}>
                            {(taskClaimingId === t.id || (proofUploading && pendingProofTask?.id === t.id)) ? '...' : isManual ? 'БИЕЛVVЛЛЭЭ' : 'АВАХ →'}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#555', flexShrink: 0 }}>ДУТУУ</span>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ШИНЭ: баталгаажуулах зураг(ууд) сонгуулах нуугдмал input (манал
                даалгаварт, дээд тал нь 5 зураг зэрэг сонгож болно) */}
            <input ref={taskProofInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => { const files = e.target.files; e.target.value = ''; if (files && files.length > 0) handleTaskProofFiles(files); }} />

            {/* ШИНЭ: даалгаврын дэлгэрэнгvй мэдээллийн modal */}
            {taskDetailModal && (
              <>
                <div onClick={() => setTaskDetailModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, cursor: 'pointer' }} />
                <div style={{
                  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: 320, maxWidth: '90vw', background: 'rgba(17,17,17,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: '1.5rem', zIndex: 401,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                }}>
                  <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{taskDetailModal.title}</div>
                  {taskDetailModal.description && <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.5, marginBottom: 14 }}>{taskDetailModal.description}</div>}
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                    Шаардлага: {taskDetailModal.requirement_type === 'manual'
                      ? 'Гараар тэмдэглэнэ (баталгаажуулах зураг шаардана)'
                      : `${taskDetailModal.requirement_count} ${taskDetailModal.requirement_type === 'comments' ? 'сэтгэгдэл' : taskDetailModal.requirement_type === 'manga_chapters' ? `бvлэг (${dbMangas.find(m => m.id === taskDetailModal.target_manga_id)?.title || '?'})` : 'уншсан бvлэг'}`}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: taskDetailModal.expires_at ? 4 : 14 }}>
                    Шагнал: {taskDetailModal.reward_type === 'vip_days' ? `👑 ${taskDetailModal.reward_vip_days || 1} хоног VIP` : `💐 ${taskDetailModal.reward_flowers} цэцэг`}
                  </div>
                  {taskDetailModal.expires_at && (
                    <div style={{ fontSize: 12, color: '#f5a623', marginBottom: 14 }}>Дуусах хугацаа: {formatMnDate(taskDetailModal.expires_at)}</div>
                  )}
                  <button onClick={() => setTaskDetailModal(null)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', padding: 11, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    ХААХ
                  </button>
                </div>
              </>
            )}
          </div>
          );
        })()}

        {/* ШИНЭ: НИЙТИЙН ЧАТ хуудас — сайт даяарх бvх нэвтэрсэн хэрэглэгчийн ярилцах хэсэг */}
        {page === 'chat' && currentUser && (() => {
          return (
          <div style={{ padding: '1.5rem 2rem 0', maxWidth: 560, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* ЗАСВАР (хэрэглэгчийн хvсэлт): "Нийтийн чат" дангаараа биш, бvрэн чат
                систем байх ёстой тул — нэмж "Зурвас" (1-1 хувийн DM: манга
                хуваалцах, стикер илгээх, reply, ❤️) горим оруулав. */}
            {chatMode === 'thread' && dmPartner ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button onClick={() => { setChatMode('inbox'); setDmPartner(null); setDmReplyTo(null); }} title="Буцах"
                  style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <Avatar url={dmPartner.avatar_url} letter={(dmPartner.name || '?')[0]} size={36} />
                <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dmPartner.name || 'Хэрэглэгч'}{dmPartnerBlocked ? ' 🚫' : ''}</div>
                {/* ЗАСВАР (хэрэглэгчийн хvсэлт): "⋯" dropdown цэсийг хассан (блоклох/
                    устгах vйлдлvvд одоо inbox жагсаалтын мөр бvрийн "⋮" цэсэнд
                    аль хэдийн байгаа тул давхардуулахгvй) — цэцэг/VIP бэлэглэх
                    хоёрыг шууд харагдахаар жижиг icon товч болгов. */}
                <span onClick={() => setDmGiftFlowersOpen(true)} title="Цэцэг бэлэглэх"
                  style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: 16 }}>
                  💐
                </span>
                <span onClick={giftVipToPartner} title="VIP бэлэглэх (5000 од)"
                  style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: 16 }}>
                  👑
                </span>
                <button onClick={() => setPage(previousPage)} title="Хаах"
                  style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 16 }}>
                  ✕
                </button>
              </div>
            ) : chatMode === 'group' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button onClick={() => setChatMode('inbox')} title="Буцах"
                  style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#1c2233',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5c0 4.42-4.03 8-9 8-1.06 0-2.08-.15-3.02-.44L4 21l1.15-3.65C4.16 15.94 3 13.84 3 11.5 3 7.08 7.03 3.5 12 3.5s9 3.58 9 8z"/>
                    <circle cx="8.3" cy="11.5" r="1" fill="#fff" stroke="none"/><circle cx="12" cy="11.5" r="1" fill="#fff" stroke="none"/><circle cx="15.7" cy="11.5" r="1" fill="#fff" stroke="none"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 15 }}>{chatRoom === 'staff' ? 'Админуудын чат' : 'Roselle уншигчид'}</div>
                <button onClick={() => setPage(previousPage)} title="Хаах"
                  style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 16 }}>
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                {/* ЗАСВАР (хэрэглэгчийн хvсэлт): "Санал хvсэлт" хуудасны icon badge-той
                    ижил (улаан speech-bubble) дvрсийг цэвэрхэн хос-бvбvvл (floating
                    чат товчтой ижил) дvрсээр сольж, доод тайлбар мөрийг хассан. */}
                <div style={{
                  width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#1c2233', boxShadow: '0 0 20px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.08)',
                }}>
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5c0 4.42-4.03 8-9 8-1.06 0-2.08-.15-3.02-.44L4 21l1.15-3.65C4.16 15.94 3 13.84 3 11.5 3 7.08 7.03 3.5 12 3.5s9 3.58 9 8z"/>
                    <circle cx="8.3" cy="11.5" r="1" fill="#fff" stroke="none"/><circle cx="12" cy="11.5" r="1" fill="#fff" stroke="none"/><circle cx="15.7" cy="11.5" r="1" fill="#fff" stroke="none"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }} />
                <button onClick={() => setPage(previousPage)} title="Хаах"
                  style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 16 }}>
                  ✕
                </button>
              </div>
            )}

            {chatMode === 'group' && (
              <>
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', paddingBottom: 14,
                  minHeight: 300, maxHeight: '58vh',
                }}>
                  {chatLoading ? (
                    [0, 1, 2, 3].map(i => <div key={i} className="poster-skeleton" style={{ height: 44, borderRadius: 12, width: i % 2 ? '70%' : '55%', alignSelf: i % 2 ? 'flex-end' : 'flex-start' }} />)
                  ) : chatMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#555' }}>
                      <div style={{ fontSize: 34, marginBottom: 10 }}>💬</div>
                      <div style={{ fontSize: 13 }}>Одоогоор мессеж алга — эхнийхийг бичээрэй!</div>
                    </div>
                  ) : chatMessages.map(m => {
                    const own = m.user_id === currentUser.id;
                    // ЗАСВАР (хэрэглэгчийн хvсэлт): бичиж буй хvний нэрийг vргэлж (өөрийн
                    // мессежийн дээр ч) харуулж, admin эрхтэй бол алтан шаргал өнгөтэй болгов.
                    // ЗАСВАР (хэрэглэгчийн хvсэлт): admin/moderator/editor (staff) бvгд алтан
                    // шаргал, энгийн уншигч бол цагаан өнгөтэй болгов.
                    const isStaffAuthor = (m.users?.roles || []).some(r => ['admin', 'moderator', 'editor'].includes(r));
                    // ЗАСВАР (хэрэглэгчийн хvсэлт): admin-ыг бусад staff-аас ялгаж
                    // 💎 тэмдгээр, moderator/editor-г 👑-ээр ялгав.
                    const isAdminAuthor = (m.users?.roles || []).includes('admin');
                    // ШИНЭ (хэрэглэгчийн хvсэлт): DM-тэй адил group чатанд ч ❤️/reply.
                    const liked = (m.likedBy || []).includes(currentUser.id);
                    const repliedTo = m.reply_to_id ? chatMessages.find(x => x.id === m.reply_to_id) : null;
                    return (
                      <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: own ? 'flex-end' : 'flex-start', gap: 3 }}>
                      {repliedTo && (
                        <div style={{ fontSize: 10, color: '#777', maxWidth: '70%', marginLeft: own ? 0 : 34, marginRight: own ? 0 : 0, padding: '3px 10px', borderLeft: '2px solid #8B0000', background: 'rgba(255,255,255,0.03)', borderRadius: '6px 6px 0 0' }}>
                          {repliedTo.users?.name ? `${repliedTo.users.name}: ` : ''}{repliedTo.message_type === 'sticker' ? 'Стикер илгээлээ' : (repliedTo.message || '').slice(0, 60)}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: own ? 'row-reverse' : 'row' }}>
                        <div onClick={() => own ? setProfileOpen(true) : startDmWith(m.user_id, m.users?.name, m.users?.avatar_url)} title={own ? 'Профайл' : 'Хувийн зурвас бичих'} style={{ cursor: 'pointer' }}>
                          <Avatar url={m.users?.avatar_url} letter={(m.users?.name || '?')[0]} size={26} isVip={!!m.users?.is_vip} />
                        </div>
                        <div style={{ maxWidth: '72%' }}>
                          {/* ЗАСВАР (хэрэглэгчийн хvсэлт): бусдын нэрийг дарж хувийн
                              зурвас бичиж болдгийг тодорхой харагдуулахын тулд, нэрний
                              ард жижиг "зурвас бичих" icon нэмж, tap хийх боломжтойг vзvvлэв.
                              Өөрийн нэр/зураг дээр дарвал профайл (нэр/зураг засах) нээгдэнэ. */}
                          <div onClick={() => own ? setProfileOpen(true) : startDmWith(m.user_id, m.users?.name, m.users?.avatar_url)}
                            style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: isStaffAuthor ? '#f5c518' : '#fff', fontWeight: isStaffAuthor ? 800 : 400, marginBottom: 2, marginLeft: own ? 0 : 4, marginRight: own ? 4 : 0, justifyContent: own ? 'flex-end' : 'flex-start', cursor: 'pointer' }}>
                            {isAdminAuthor ? '💎 ' : isStaffAuthor ? '👑 ' : ''}{m.users?.name || 'Хэрэглэгч'}
                            {!own ? (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                                <path d="M21 11.5c0 4.42-4.03 8-9 8-1.06 0-2.08-.15-3.02-.44L4 21l1.15-3.65C4.16 15.94 3 13.84 3 11.5 3 7.08 7.03 3.5 12 3.5s9 3.58 9 8z"/>
                              </svg>
                            ) : (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                                <path d="M12 20h9"/>
                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                              </svg>
                            )}
                          </div>
                          {m.message_type === 'sticker' ? (
                            <DmStickerBubble url={m.sticker_url} />
                          ) : (
                            <div style={{
                              padding: '8px 12px', borderRadius: 14,
                              borderBottomRightRadius: own ? 4 : 14, borderBottomLeftRadius: own ? 14 : 4,
                              background: own ? 'linear-gradient(135deg, #8B0000, #a30000)' : 'rgba(255,255,255,0.06)',
                              color: '#fff', fontSize: 13, lineHeight: 1.4, wordBreak: 'break-word',
                            }}>
                              {m.message}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 3, justifyContent: own ? 'flex-end' : 'flex-start' }}>
                            <span onClick={() => toggleChatLike(m)} style={{ fontSize: 11, cursor: 'pointer', color: liked ? '#ff5a5a' : '#555' }} className={liked ? 'like-pop' : ''}>
                              {liked ? '❤️' : '🤍'} {(m.likedBy || []).length > 0 ? m.likedBy.length : ''}
                            </span>
                            <span onClick={() => setChatReplyTo({ id: m.id, preview: `${m.users?.name ? m.users.name + ': ' : ''}${m.message_type === 'sticker' ? 'Стикер илгээлээ' : (m.message || '').slice(0, 60)}` })}
                              style={{ fontSize: 11, cursor: 'pointer', color: '#555' }}>
                              ↩ Хариулах
                            </span>
                          </div>
                        </div>
                      </div>
                      </div>
                    );
                  })}
                </div>

                {chatReplyTo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 10, background: 'rgba(139,0,0,0.12)', border: '1px solid rgba(139,0,0,0.3)', marginBottom: 6, fontSize: 11 }}>
                    <span style={{ flex: 1, minWidth: 0, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↩ {chatReplyTo.preview}</span>
                    <span onClick={() => setChatReplyTo(null)} style={{ cursor: 'pointer', color: '#888', fontWeight: 700 }}>✕</span>
                  </div>
                )}

                {/* ШИНЭ: admin/moderator-ийн нэмсэн нийтийн стикер + өөрийн стикерvvд */}
                {groupStickerPickerOpen && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0', maxHeight: 160, overflowY: 'auto' }}>
                    {giftStickers.map(s => (
                      <img key={`gift-${s.id}`} src={s.url} alt="" onClick={() => sendChatMessage({ message_type: 'sticker', sticker_url: s.url })}
                        style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(245,166,35,0.4)' }} />
                    ))}
                    {stickerSlots.map(slot => {
                      const url = userProfile?.[`sticker_${slot}`];
                      if (!url) return null;
                      return <img key={`own-${slot}`} src={url} alt="" onClick={() => sendChatMessage({ message_type: 'sticker', sticker_url: url })}
                        style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }} />;
                    })}
                    {giftStickers.length === 0 && stickerSlots.every(slot => !userProfile?.[`sticker_${slot}`]) && (
                      <div style={{ fontSize: 11, color: '#555' }}>Стикер алга — профайл дээрээ vvсгээрэй.</div>
                    )}
                  </div>
                )}

                <div style={{
                  position: 'sticky', bottom: 0, display: 'flex', gap: 6, padding: '12px 0 20px', alignItems: 'center',
                  background: 'linear-gradient(to top, #050505 60%, transparent)',
                }}>
                  <span onClick={() => setGroupStickerPickerOpen(o => !o)} title="Стикер"
                    style={{ fontSize: 20, cursor: 'pointer', flexShrink: 0, opacity: groupStickerPickerOpen ? 1 : 0.6 }}>😊</span>
                  <input value={chatInput} onChange={e => setChatInput(e.target.value.slice(0, 500))}
                    onKeyDown={e => { if (e.key === 'Enter') sendChatMessage(); }}
                    placeholder="Мессеж бичих..."
                    style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '11px 16px', color: '#fff', fontSize: 13, outline: 'none' }} />
                  <button disabled={chatSending || !chatInput.trim()} onClick={() => sendChatMessage()}
                    style={{
                      background: chatInput.trim() ? '#8B0000' : '#333', color: '#fff', border: 'none', width: 42, height: 42, borderRadius: '50%',
                      cursor: chatInput.trim() ? 'pointer' : 'not-allowed', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </div>
              </>
            )}

            {chatMode === 'inbox' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => setDmNewMsgOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginBottom: 14, padding: 12, borderRadius: 12, background: 'rgba(139,0,0,0.15)', border: '1px solid rgba(139,0,0,0.4)', color: '#ff8080', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  ✉️ Шинэ зурвас бичих
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* ЗАСВАР (хэрэглэгчийн хvсэлт): "Нийтийн чат" тусдаа tab биш, энэ
                      нэгдсэн жагсаалтын хамгийн эхний "групп" мөр болж, "Roselle
                      уншигчид" нэртэй боллоо. Зөвхөн идэвхтэй VIP (эсвэл staff)
                      хэрэглэгчид харагдана. Staff-д зориулсан тусдаа "Админуудын
                      чат" мөр доор нь нэмэгдэв. */}
                  {(hasActiveVip || isStaff) && (
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(28,34,51,0.55)', border: '1px solid rgba(255,255,255,0.09)' }}>
                      <div onClick={() => { setChatRoom('public'); setChatMode('group'); }} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1c2233' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 11.5c0 4.42-4.03 8-9 8-1.06 0-2.08-.15-3.02-.44L4 21l1.15-3.65C4.16 15.94 3 13.84 3 11.5 3 7.08 7.03 3.5 12 3.5s9 3.58 9 8z"/>
                            <circle cx="8.3" cy="11.5" r="1" fill="#fff" stroke="none"/><circle cx="12" cy="11.5" r="1" fill="#fff" stroke="none"/><circle cx="15.7" cy="11.5" r="1" fill="#fff" stroke="none"/>
                          </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                            Roselle уншигчид {publicChatMuted && <span title="Дуугvй" style={{ fontSize: 11, color: '#666' }}>🔇</span>}
                          </div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            VIP хэрэглэгчид ярилцдаг нээлттэй өрөө
                          </div>
                        </div>
                      </div>
                      {/* ШИНЭ: Нийтийн чатыг дуугvй/дуутай болгох "⋮" цэс */}
                      <span onClick={e => { e.stopPropagation(); setDmRowMenuOpenId(o => o === 'public-chat' ? null : 'public-chat'); }}
                        style={{ fontSize: 18, color: '#666', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>⋮</span>
                      {dmRowMenuOpenId === 'public-chat' && (
                        <>
                          <div onClick={() => setDmRowMenuOpenId(null)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                          <div style={{ position: 'absolute', top: '100%', right: 8, width: 180, background: '#161616', border: '1px solid #2a2a2a', borderRadius: 10, zIndex: 61, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                            <div onClick={() => { togglePublicChatMute(); setDmRowMenuOpenId(null); }}
                              style={{ padding: '11px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#1e2430'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              {publicChatMuted ? '🔊 Дуутай болгох' : '🔇 Дуугvй болгох'}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {isStaff && (
                    <div onClick={() => { setChatRoom('staff'); setChatMode('group'); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)', cursor: 'pointer' }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2a2210' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f5c518" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 6 7 1-5 5 1.5 7L12 18l-6.5 3L7 14 2 9l7-1z"/></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#f5c518' }}>👑 Админуудын чат</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Зөвхөн editor/moderator/admin эрхтэй хvмvvст
                        </div>
                      </div>
                    </div>
                  )}

                  {dmInboxLoading ? (
                    [0, 1, 2].map(i => <div key={i} className="poster-skeleton" style={{ height: 58, borderRadius: 12 }} />)
                  ) : dmInbox.length === 0 ? null : dmInbox.map(row => {
                    const partner = { id: row.partner_id, name: row.partner_name, avatar_url: row.partner_avatar_url };
                    return (
                      <div key={row.partner_id} onClick={() => openDmThread(partner)}
                        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}>
                        <Avatar url={row.partner_avatar_url} letter={(row.partner_name || '?')[0]} size={40} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{row.partner_name || 'Хэрэглэгч'}</div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.last_message_type === 'sticker' ? 'Стикер илгээлээ' : row.last_message_type === 'manga_share' ? '📖 Манга хуваалцлаа' : row.last_message_type === 'gift_flowers' ? '💐 Цэцэг бэлэглэлээ' : row.last_message_type === 'gift_vip' ? '👑 VIP бэлэглэлээ' : row.last_message}
                          </div>
                        </div>
                        {row.unread_count > 0 && (
                          <span style={{ background: '#8B0000', color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 10, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{row.unread_count}</span>
                        )}
                        {/* ШИНЭ: мөр бvрийн "⋮" цэс — thread нээхгvйгээр шууд блоклох/устгах */}
                        <span onClick={e => { e.stopPropagation(); setDmRowMenuOpenId(o => o === row.partner_id ? null : row.partner_id); }}
                          style={{ fontSize: 18, color: '#666', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>⋮</span>
                        {dmRowMenuOpenId === row.partner_id && (
                          <>
                            <div onClick={e => { e.stopPropagation(); setDmRowMenuOpenId(null); }} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                            <div onClick={e => e.stopPropagation()}
                              style={{ position: 'absolute', top: '100%', right: 8, width: 180, background: '#161616', border: '1px solid #2a2a2a', borderRadius: 10, zIndex: 61, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                              <div onClick={() => blockUserFromRow(partner)}
                                style={{ padding: '11px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#1e2430'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                🚫 Блоклох
                              </div>
                              <div onClick={() => deleteConversationFromRow(partner)}
                                style={{ padding: '11px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#ff6b6b', borderTop: '1px solid #222' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#1e2430'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                🗑 Устгах
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {chatMode === 'thread' && dmPartner && (() => {
              const findMsg = id => dmMessages.find(m => m.id === id);
              return (
              <>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', paddingBottom: 14, minHeight: 300, maxHeight: '52vh' }}>
                  {dmLoading ? (
                    [0, 1, 2].map(i => <div key={i} className="poster-skeleton" style={{ height: 44, borderRadius: 12, width: i % 2 ? '70%' : '55%', alignSelf: i % 2 ? 'flex-end' : 'flex-start' }} />)
                  ) : dmMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#555' }}>
                      <div style={{ fontSize: 34, marginBottom: 10 }}>👋</div>
                      <div style={{ fontSize: 13 }}>Мессежээ эхлvvлээрэй!</div>
                    </div>
                  ) : dmMessages.map(m => {
                    const own = m.sender_id === currentUser.id;
                    const liked = (m.likedBy || []).includes(currentUser.id);
                    const repliedTo = m.reply_to_id ? findMsg(m.reply_to_id) : null;
                    return (
                      <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: own ? 'flex-end' : 'flex-start', gap: 3 }}>
                        {repliedTo && (
                          <div style={{ fontSize: 10, color: '#777', maxWidth: '70%', padding: '3px 10px', borderLeft: '2px solid #8B0000', background: 'rgba(255,255,255,0.03)', borderRadius: '6px 6px 0 0' }}>
                            {repliedTo.message_type === 'sticker' ? 'Стикер илгээлээ' : repliedTo.message_type === 'manga_share' ? '📖 Манга' : (repliedTo.content || '').slice(0, 60)}
                          </div>
                        )}
                        <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: own ? 'flex-end' : 'flex-start' }}>
                          {m.message_type === 'sticker' ? (
                            <DmStickerBubble url={m.sticker_url} />
                          ) : m.message_type === 'manga_share' ? (
                            <div onClick={() => { const manga = dbMangas.find(x => x.id === m.manga_id); if (manga) { setSelected(manga); setPreviousPage('chat'); setPage('detail'); } }}
                              style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, borderRadius: 12, background: 'rgba(255,255,255,0.06)', cursor: 'pointer', width: 200 }}>
                              <img src={m.mangas?.poster_url} alt="" style={{ width: 40, height: 54, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 10, color: '#888' }}>📖 Манга хуваалцлаа</div>
                                <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.mangas?.title}</div>
                              </div>
                            </div>
                          ) : m.message_type === 'gift_flowers' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(255,90,140,0.18), rgba(255,255,255,0.03))', border: '1px solid rgba(255,90,140,0.3)', fontSize: 12, fontWeight: 700 }}>
                              💐 {own ? `Та ${m.gift_amount} цэцэг бэлэглэлээ` : `${m.gift_amount} цэцэг бэлэглэлээ`}
                            </div>
                          ) : m.message_type === 'gift_vip' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(245,166,35,0.18), rgba(255,255,255,0.03))', border: '1px solid rgba(245,166,35,0.35)', fontSize: 12, fontWeight: 700 }}>
                              👑 {own ? `Та VIP ${m.gift_amount} хоног бэлэглэлээ` : `VIP ${m.gift_amount} хоног бэлэглэлээ`}
                            </div>
                          ) : (
                            <div style={{
                              padding: '8px 12px', borderRadius: 14,
                              borderBottomRightRadius: own ? 4 : 14, borderBottomLeftRadius: own ? 14 : 4,
                              background: own ? 'linear-gradient(135deg, #8B0000, #a30000)' : 'rgba(255,255,255,0.06)',
                              color: '#fff', fontSize: 13, lineHeight: 1.4, wordBreak: 'break-word',
                            }}>
                              {m.content}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 3 }}>
                            <span onClick={() => toggleDmLike(m)} style={{ fontSize: 11, cursor: 'pointer', color: liked ? '#ff5a5a' : '#555' }} className={liked ? 'like-pop' : ''}>
                              {liked ? '❤️' : '🤍'} {(m.likedBy || []).length > 0 ? m.likedBy.length : ''}
                            </span>
                            <span onClick={() => setDmReplyTo({ id: m.id, preview: m.message_type === 'sticker' ? 'Стикер илгээлээ' : m.message_type === 'manga_share' ? '📖 Манга' : (m.content || '').slice(0, 60) })}
                              style={{ fontSize: 11, cursor: 'pointer', color: '#555' }}>
                              ↩ Хариулах
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {dmPartnerBlocked ? (
                  <div style={{ textAlign: 'center', padding: '14px', color: '#777', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    🚫 Та энэ хэрэглэгчийг блоклосон тул мессеж бичих боломжгvй.
                  </div>
                ) : (
                <>
                {dmReplyTo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 10, background: 'rgba(139,0,0,0.12)', border: '1px solid rgba(139,0,0,0.3)', marginBottom: 6, fontSize: 11 }}>
                    <span style={{ flex: 1, minWidth: 0, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↩ {dmReplyTo.preview}</span>
                    <span onClick={() => setDmReplyTo(null)} style={{ cursor: 'pointer', color: '#888', fontWeight: 700 }}>✕</span>
                  </div>
                )}

                {dmStickerPickerOpen && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0', maxHeight: 160, overflowY: 'auto' }}>
                    {giftStickers.map(s => (
                      <img key={`gift-${s.id}`} src={s.url} alt="" onClick={() => sendDirectMessage({ message_type: 'sticker', sticker_url: s.url })}
                        style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(245,166,35,0.4)' }} />
                    ))}
                    {stickerSlots.map(slot => {
                      const url = userProfile?.[`sticker_${slot}`];
                      if (!url) return null;
                      return <img key={`own-${slot}`} src={url} alt="" onClick={() => sendDirectMessage({ message_type: 'sticker', sticker_url: url })}
                        style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }} />;
                    })}
                    {giftStickers.length === 0 && stickerSlots.every(slot => !userProfile?.[`sticker_${slot}`]) && (
                      <div style={{ fontSize: 11, color: '#555' }}>Профайл дээрээ эхлээд стикер vvсгээрэй.</div>
                    )}
                  </div>
                )}

                {dmMangaShareOpen && (
                  <div style={{ padding: '8px 0' }}>
                    <input value={dmMangaShareQuery} onChange={e => setDmMangaShareQuery(e.target.value)}
                      placeholder="Манганы нэрээр хайх..." autoFocus
                      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box', marginBottom: 6 }} />
                    {dmMangaShareQuery.trim() && (
                      <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {dbMangas.filter(m => m.title.toLowerCase().includes(dmMangaShareQuery.trim().toLowerCase())).slice(0, 20).map(m => (
                          <div key={m.id} onClick={() => sendDirectMessage({ message_type: 'manga_share', manga_id: m.id })}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }}>
                            <img src={m.poster} alt="" style={{ width: 28, height: 38, objectFit: 'cover', borderRadius: 4 }} />
                            <span style={{ fontSize: 12 }}>{m.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div style={{
                  position: 'sticky', bottom: 0, display: 'flex', gap: 6, padding: '12px 0 20px', alignItems: 'center',
                  background: 'linear-gradient(to top, #050505 60%, transparent)',
                }}>
                  <span onClick={() => { setDmStickerPickerOpen(o => !o); setDmMangaShareOpen(false); }} title="Стикер"
                    style={{ fontSize: 20, cursor: 'pointer', flexShrink: 0, opacity: dmStickerPickerOpen ? 1 : 0.6 }}>😊</span>
                  <span onClick={() => { setDmMangaShareOpen(o => !o); setDmStickerPickerOpen(false); }} title="Манга хуваалцах"
                    style={{ fontSize: 18, cursor: 'pointer', flexShrink: 0, opacity: dmMangaShareOpen ? 1 : 0.6 }}>📖</span>
                  <input value={dmInput} onChange={e => setDmInput(e.target.value.slice(0, 1000))}
                    onKeyDown={e => { if (e.key === 'Enter' && dmInput.trim()) sendDirectMessage({ message_type: 'text', content: dmInput.trim() }); }}
                    placeholder="Мессеж бичих..."
                    style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '11px 16px', color: '#fff', fontSize: 13, outline: 'none' }} />
                  <button disabled={dmSending || !dmInput.trim()} onClick={() => sendDirectMessage({ message_type: 'text', content: dmInput.trim() })}
                    style={{
                      background: dmInput.trim() ? '#8B0000' : '#333', color: '#fff', border: 'none', width: 42, height: 42, borderRadius: '50%',
                      cursor: dmInput.trim() ? 'pointer' : 'not-allowed', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </div>
                </>
                )}
              </>
              );
            })()}

            {/* ШИНЭ: цэцэг бэлэглэх тоо хэмжээ сонгох modal */}
            {dmGiftFlowersOpen && dmPartner && (
              <>
                <div onClick={() => setDmGiftFlowersOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, cursor: 'pointer' }} />
                <div style={{
                  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: 280, maxWidth: '88vw', background: 'rgba(17,17,17,0.97)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '1.25rem', zIndex: 401,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.6)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>💐</div>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{dmPartner.name || 'Хэрэглэгч'}-д цэцэг бэлэглэх</div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 14 }}>
                    Танд {userProfile?.flower_balance || 0} цэцэг байна
                  </div>
                  <input type="number" min={1} max={userProfile?.flower_balance || 1} value={dmGiftFlowersAmount}
                    onChange={e => setDmGiftFlowersAmount(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box', textAlign: 'center', marginBottom: 12 }} />
                  <button disabled={dmGifting} onClick={giftFlowersToPartner}
                    style={{ width: '100%', background: '#8B0000', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    {dmGifting ? 'БЭЛЭГЛЭЖ БАЙНА...' : 'БЭЛЭГЛЭХ'}
                  </button>
                </div>
              </>
            )}

            {/* ШИНЭ: нэр хайж шинэ зурвас эхлvvлэх modal */}
            {dmNewMsgOpen && (
              <>
                <div onClick={() => { setDmNewMsgOpen(false); setDmSearchQuery(''); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, cursor: 'pointer' }} />
                <div style={{
                  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: 320, maxWidth: '90vw', maxHeight: '70vh', overflowY: 'auto', background: 'rgba(17,17,17,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: '1.25rem', zIndex: 401,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Хvнийг хайх</div>
                  <input value={dmSearchQuery} onChange={e => setDmSearchQuery(e.target.value)}
                    placeholder="Нэрээр хайх..." autoFocus
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dmSearchResults.map(u => (
                      <div key={u.id} onClick={() => { setDmNewMsgOpen(false); setDmSearchQuery(''); openDmThread(u); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, cursor: 'pointer' }}>
                        <Avatar url={u.avatar_url} letter={(u.name || '?')[0]} size={30} />
                        <span style={{ fontSize: 13 }}>{u.name || 'Хэрэглэгч'}</span>
                      </div>
                    ))}
                    {dmSearchQuery.trim() && dmSearchResults.length === 0 && (
                      <div style={{ fontSize: 12, color: '#555', textAlign: 'center', padding: '1rem 0' }}>Олдсонгvй</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          );
        })()}

        {/* DETAIL PAGE — ЗАСВАР #110: cover-с vvсгэсэн бvдэгрvvлсэн дэвсгэр, том
            голлосон cover, орчуулагчийн нэрийг энгийн (хvрээгvй) мөр болгож,
            3 tab-тай (Бvлгvvд / Мэдээлэл / Vнэлгээ+сэтгэгдэл) шинэ бvтэц. */}
        {page === 'detail' && selected && (
          <div>
            {/* ЗАСВАР #203 (хэрэглэгчийн хvсэлт): мэдэгдлээс орж ирэхэд манганы
                баннер/тайлбар/tab-г огт харуулахгvй, шууд сэтгэгдэлд хvргэх
                энгийн толгой хэсэг. */}
            {commentsOnlyView && (
              <div style={{ position: 'sticky', padding: '1rem', top: 0, zIndex: 60, background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <button onClick={() => setPage(previousPage)} title="Буцах"
                  style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div style={{ minWidth: 0, flex: 1, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.title}</div>
                <span onClick={() => setCommentsOnlyView(false)} style={{ cursor: 'pointer', fontSize: 11, color: '#8B0000', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  Бvтнээр харах
                </span>
              </div>
            )}
            {!commentsOnlyView && (
            <>
            <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
              {/* ЗАСВАР #114: дэвсгэрт cover биш, манганы panel/banner зургийг ашиглана
                  (banner байхгvй бол л cover-с нөөцлөнө) */}
              <img src={selected.banner_url || selected.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', transform: 'scale(1.1)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(10,10,10,0.95))' }} />

              <button onClick={() => setPage(previousPage)} title="Буцах"
                style={{ position: 'absolute', top: 16, left: 16, zIndex: 5, width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', cursor: 'pointer', backdropFilter: 'blur(6px)' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>

              <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative' }}>
                  <button onClick={() => shareManga(selected)} title="Хуваалцах"
                    style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', cursor: 'pointer', backdropFilter: 'blur(6px)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  </button>
                  {/* ЗАСВАР (хэрэглэгчийн хvсэлт): "Хувийн чат руу хуваалцах" сонголт
                      нэмэгдсэн тул mobile/desktop vл хамаарч vргэлж НЭГ dropdown цэс
                      нээгддэг болов (native share нь дотор нь нэг мөр болов). */}
                  {shareMenuOpen && (
                    <>
                      <div onClick={() => setShareMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                      <div style={{ position: 'absolute', top: '120%', right: 0, width: 210, background: '#161616', border: '1px solid #2a2a2a', borderRadius: 10, zIndex: 61, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                        {currentUser && (
                          <div onClick={() => setMangaShareOpen(true)}
                            style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#1e2430'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            💬 Хувийн чат руу хуваалцах
                          </div>
                        )}
                        {navigator.share && (
                          <div onClick={() => shareMangaNative(selected)}
                            style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff', borderTop: currentUser ? '1px solid #222' : 'none' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#1e2430'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            📤 Системийн цэсээр хуваалцах
                          </div>
                        )}
                        <div onClick={() => shareToFacebook(selected)}
                          style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff', borderTop: '1px solid #222' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#1e2430'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          📘 Facebook-д хуваалцах
                        </div>
                        <div onClick={() => copyMangaLink(selected)}
                          style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff', borderTop: '1px solid #222' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#1e2430'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          🔗 Холбоос хуулах
                        </div>
                      </div>
                    </>
                  )}
                  {/* ШИНЭ: "Хувийн чат руу хуваалцах" дарахад гарч ирэх хvн хайх modal */}
                  {mangaShareOpen && (
                    <>
                      <div onClick={() => { setMangaShareOpen(false); setMangaShareQuery(''); }} style={{ position: 'fixed', inset: 0, zIndex: 400 }} />
                      <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        width: 300, maxWidth: '88vw', maxHeight: '60vh', overflowY: 'auto', background: 'rgba(17,17,17,0.97)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '1.1rem', zIndex: 401,
                        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                      }}>
                        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Хэнд илгээх вэ?</div>
                        <input value={mangaShareQuery} onChange={e => setMangaShareQuery(e.target.value)}
                          placeholder="Нэрээр хайх..." autoFocus
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {mangaShareResults.map(u => (
                            <div key={u.id} onClick={() => shareMangaToUser(selected, u)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 7, borderRadius: 8, cursor: 'pointer', opacity: mangaShareSendingId === u.id ? 0.5 : 1 }}>
                              <Avatar url={u.avatar_url} letter={(u.name || '?')[0]} size={28} />
                              <span style={{ fontSize: 12 }}>{u.name || 'Хэрэглэгч'}</span>
                            </div>
                          ))}
                          {mangaShareQuery.trim() && mangaShareResults.length === 0 && (
                            <div style={{ fontSize: 11, color: '#555', textAlign: 'center', padding: '0.6rem 0' }}>Олдсонгvй</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <button onClick={() => toggleLibrary(selected.id)}
                  style={{ background: library.includes(selected.id) ? 'rgba(139,0,0,0.85)' : 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '8px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer', backdropFilter: 'blur(6px)', fontWeight: 700 }}>
                  {library.includes(selected.id) ? '★ Хадгалсан' : '☆ Хадгалах'}
                </button>
              </div>
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
                    setEditMangaForm({ title: selected.title, desc: selected.desc || '', genres: selected.genres || [], status: selected.status, restricted: !!selected.restricted_role });
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
            </>
            )}

            <div style={{ padding: '1.5rem 2rem' }}>
              {/* ЗАСВАР #110: "Бvлгvvд" tab — гарчиг + орчуулагчийн нэр (энгийн, хvрээгvй) + бvлгийн жагсаалт */}
              {detailTab === 'chapters' && (
                <>
                  {/* ЗАСВАР #112: бvлгийн тоог "БVЛГVVД" гарчигт нэмэв, "N/N" тоолуурыг
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
                      <span style={{ fontWeight: 800, fontSize: 18 }}>БVЛГVVД ({dbChapters.length > 0 ? dbChapters.length : selected.chapters})</span>
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
                                <span style={{ fontSize: 14, fontWeight: 500, color: '#dde1ea' }}>{ch.chapter_number}-р бvлэг</span>
                                {ch.label && (
                                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: '#f5a623', border: '1px solid rgba(245,166,35,0.4)', background: 'rgba(245,166,35,0.08)', padding: '3px 12px', borderRadius: 20 }}>{ch.label}</span>
                                )}
                                {isStaff && ch.status === 'pending' && <span style={{ fontSize: 10, color: '#f5a623', fontWeight: 700 }}>ХVЛЭЭГДЭЖ БУЙ</span>}
                                {isStaff && ch.status === 'rejected' && <span style={{ fontSize: 10, color: '#8B0000', fontWeight: 700 }}>ТАТГАЛЗСАН</span>}
                                {isStaff && ch.is_hidden && <span style={{ fontSize: 10, color: '#888', fontWeight: 700 }}>🥀 НУУГДСАН</span>}
                                {isStaff && ch.pending_delete && <span style={{ fontSize: 10, color: '#f5a623', fontWeight: 700 }}>⏳ УСТГАХ ХvЛЭЭГДЭЖ БУЙ</span>}
                              </div>
                              <div style={{ fontSize: 12, color: locked ? '#fff' : '#6b7385', marginTop: 5, display: 'flex', gap: 10, alignItems: 'center' }}>
                                {locked ? (
                                  <LiveCountdown target={new Date(ch.publish_at).getTime()} onExpire={() => setNowTs(Date.now())}>
                                    {remainingMs => <span style={{ fontVariantNumeric: 'tabular-nums' }}>⏳ {formatCountdownClock(remainingMs)}</span>}
                                  </LiveCountdown>
                                ) : (
                                  <span>{formatNumericDate(ch.created_at)}</span>
                                )}
                              </div>
                            </div>
                            {isLast && (
                              <div style={{ position: 'absolute', top: -8, left: 14, background: '#8B0000', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 10, letterSpacing: 0.5 }}>СVVЛД УНШСАН</div>
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
                                  askConfirm(`Бvлэг ${ch.chapter_number}-ийг бvрмөсөн устгах уу? Энэ vйлдлийг БУЦААХ БОЛОМЖГvЙ (зурагнууд R2-с ч устна).`, async () => {
                                    const { data: images } = await supabase.from('chapter_images').select('image_url').eq('chapter_id', ch.id);
                                    const urls = [...(images || []).map(i => i.image_url), ch.thumbnail_url].filter(Boolean);
                                    try { await deleteFromR2(urls); } catch (err) { notify('Анхаар: зарим файл R2-с устгагдсангvй (' + err.message + ').'); }
                                    await supabase.from('chapter_images').delete().eq('chapter_id', ch.id);
                                    const { error } = await supabase.from('chapters').delete().eq('id', ch.id);
                                    if (error) { notify('Алдаа: ' + error.message); return; }
                                    setDbChapters(prev => prev.filter(x => x.id !== ch.id));
                                    notify('Бvлэг бvрмөсөн устгагдлаа 🗑');
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
                      <div style={{ color: '#555', fontSize: 14 }}>Одоогоор бvлэг ороогvй байна.</div>
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
                  {/* ЗАСВАР #203: мэдэгдлээс орж ирэхэд (commentsOnlyView) vнэлгээний
                      картыг нуугаад шууд сэтгэгдлийг харуулна. */}
                  {!commentsOnlyView && (
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
                              {ratingSending ? '...' : (myScore ? 'ӨӨРЧЛӨХ' : 'VНЭЛЭХ')}
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  )}

                  <div ref={mangaCommentsRef} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
                    <div style={{ width: 4, height: 18, background: '#8B0000', borderRadius: 2 }} />
                    <span style={{ fontWeight: 800, fontSize: 15 }}>СЭТГЭГДЭЛ ({mangaComments.length})</span>
                  </div>

                  {currentUser ? (
                    <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', alignItems: 'flex-start' }}>
                      <Avatar url={userProfile?.avatar_url} letter={currentUser.email[0]} size={28} isVip={hasActiveVip} />
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
                          {/* ЗАСВАР (дизайн сайжруулалт #11,#17): цэнхэр өнгийн (#2a3142, бусад
                              хэсэгтэй нийцэхгvй байсан) хvрээг саарал болгож, VIP хэрэглэгчийн
                              avatar-д алт цагираг (vip-ring) нэмэв. */}
                          {c.users?.avatar_url ? (
                            <img src={c.users.avatar_url} alt="" onClick={() => startDmWith(c.user_id, c.users?.name, c.users?.avatar_url)} title="Хувийн зурвас бичих" className={c.users?.is_vip ? 'vip-ring' : ''} style={{ width: isReply ? 24 : 30, height: isReply ? 24 : 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: c.users?.is_vip ? undefined : '2px solid rgba(255,255,255,0.12)', boxSizing: 'border-box', cursor: 'pointer' }} />
                          ) : (
                            <div onClick={() => startDmWith(c.user_id, c.users?.name, c.users?.avatar_url)} title="Хувийн зурвас бичих" className={c.users?.is_vip ? 'vip-ring' : ''} style={{ width: isReply ? 24 : 30, height: isReply ? 24 : 30, borderRadius: '50%', background: '#1a1a1a', border: c.users?.is_vip ? undefined : '2px solid rgba(255,255,255,0.12)', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: isReply ? 11 : 13, color: '#fff', flexShrink: 0, cursor: 'pointer' }}>
                              {(c.users?.name || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                              <span onClick={() => startDmWith(c.user_id, c.users?.name, c.users?.avatar_url)} style={{ fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>{c.users?.name || 'Хэрэглэгч'}</span>
                              <span style={{ fontSize: 11, color: '#6b7385' }}>{formatMnDate(c.created_at)}</span>
                              <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                                {currentUser && (c.user_id === currentUser.id || canModerate) && (
                                  <span onClick={() => deleteMangaComment(c)} title="Устгах" style={{ cursor: 'pointer', fontSize: 11, color: '#8B0000' }}>🗑</span>
                                )}
                                {currentUser && c.user_id !== currentUser.id && (
                                  <span onClick={() => reportMangaComment(c)} title="Мэдэгдэх" style={{ cursor: 'pointer', fontSize: 11, color: '#555' }}>🚩</span>
                                )}
                                {/* ШИНЭ (хэрэглэгчийн хvсэлт): staff сэтгэгдэл бичсэн уншигчийг
                                    шууд энд дараад vнэгvй цэцгээр дэмжиж болно. */}
                                {isStaff && currentUser && c.user_id !== currentUser.id && (
                                  <span onClick={() => setStaffGiftTarget({ id: c.user_id, name: c.users?.name, avatar_url: c.users?.avatar_url })} title="Цэцэг бэлэглэх" style={{ cursor: 'pointer', fontSize: 11 }}>💐</span>
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

        {/* VIP PAGE — vнийг PLANS-аас уншина (ЗАСВАР #3). ЗАСВАР #176: хэрэглэгчийн
            өгсөн жишээ загвар (тод гарчиг + босоо жагссан радио-картууд +
            давуу тал жагсаалт + нэг "Vргэлжлvvлэх" товч)-ыг сайтын улаан
            (#8B0000) өнгийг ашиглаж дахин зохион байгуулав. */}
        {/* ШИНЭ: "Эрх авах" хуудсыг зөвхөн нэвтэрсэн хэрэглэгчид харуулна —
            нэвтрээгvй хэрэглэгч энд орж ирвэл vнэ/багцын оронд нэвтрэх урилга харна. */}
        {page === 'vip' && !currentUser && (
          <div style={{ minHeight: '100vh', background: '#050505', color: '#fff', padding: '2rem 1.25rem 3rem', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 16 }}>
            <button onClick={() => setPage(previousPage)} title="Хаах"
              style={{ position: 'fixed', top: 20, right: 20, width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 18 }}>
              ✕
            </button>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(139,0,0,0.15)', border: '1px solid #8B0000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8B0000" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, maxWidth: 320 }}>Эрх авах хэсгийг харахын тулд эхлээд нэвтэрнэ vv</div>
            <div style={{ fontSize: 13, color: '#888', maxWidth: 300 }}>VIP багц, vнэ болон давуу талуудыг харахын тулд бvртгэл vvсгэх эсвэл нэвтрэх шаардлагатай.</div>
            <button onClick={() => setAuthPage('login')}
              style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '12px 32px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 8 }}>
              НЭВТРЭХ
            </button>
          </div>
        )}
        {page === 'vip' && currentUser && (
          <div style={{ minHeight: '100vh', background: '#050505', color: '#fff', padding: '2rem 1.25rem 3rem', boxSizing: 'border-box' }}>
            <div style={{ maxWidth: 480, margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setPage(previousPage)} title="Хаах"
                  style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 18 }}>
                  ✕
                </button>
              </div>

              <div style={{ textAlign: 'center', marginTop: 4, marginBottom: hasActiveVip ? 20 : 28 }}>
                <div className="benefit-icon-glow" style={{
                  width: 60, height: 60, borderRadius: 18, margin: '0 auto 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'radial-gradient(circle at 32% 28%, rgba(245,166,35,0.45), rgba(139,0,0,0.15))',
                }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="#f5a623" stroke="none"><path d="M2 20h20l-2-9-5 4-3-8-3 8-5-4z"/></svg>
                </div>
                <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 32, fontWeight: 700, lineHeight: 1.3, color: '#fff' }}>
                  ЭРХ АВАХ
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 6 }}>Хязгааргvй унших, HD чанар, зар байхгvй</div>
              </div>

              {hasActiveVip && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 16, marginBottom: 24,
                  background: 'linear-gradient(135deg, rgba(245,166,35,0.16), rgba(255,255,255,0.02))',
                  border: '1px solid rgba(245,166,35,0.3)', boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
                }}>
                  <span style={{ fontSize: 24 }}>👑</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#f5a623' }}>Танд идэвхтэй VIP эрх бий</div>
                    {userProfile?.vip_expires_at && (
                      <div style={{ fontSize: 12, color: '#bbb', marginTop: 2 }}>
                        {Math.max(0, Math.ceil((new Date(userProfile.vip_expires_at).getTime() - nowTs) / 86400000))} хоногийн дараа дуусна · доороос сунгаж болно
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {PLANS.map(plan => {
                  // ЗАСВАР #163: тухайн багц тvр зуурын хямдралтай, хугацаа нь
                  // дуусаагvй бол хямдарсан vнийг vзvvлнэ (хугацаа дуусмагц
                  // автоматаар анхны vнэ рvv буцна, код дахин засах шаардлагагvй).
                  const salePrice = SALE.prices[plan.key];
                  const onSale = !!salePrice && nowTs < SALE_ENDS_AT_MS;
                  const toNum = s => Number(String(s).replace(/[^0-9]/g, ''));
                  const percentOff = onSale ? Math.round((1 - toNum(salePrice) / toNum(plan.price)) * 100) : 0;
                  const remainingMs = SALE_ENDS_AT_MS - nowTs;
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
                      style={{
                        position: 'relative',
                        border: isSelected ? '1px solid rgba(139,0,0,0.7)' : '1px solid rgba(255,255,255,0.08)',
                        background: isSelected ? 'rgba(139,0,0,0.14)' : 'rgba(255,255,255,0.03)',
                        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                        boxShadow: isSelected ? '0 0 28px rgba(139,0,0,0.4), 0 0 0 1px rgba(139,0,0,0.15) inset' : 'none',
                        borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer',
                        transition: 'background 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
                      }}>
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

              {/* ЗАСВАР (хэрэглэгчийн хvсэлт): "Хязгааргvй унших/Чанартай орчуулга/HD
                  чанар" гэсэн ерөнхий давуу талын жагсаалтын оронд, 💐 цэцэг ба
                  ⭐ од хэрхэн олдож, юунд хэрэглэгддэгийг хvvхэлдэйн аятай,
                  богинохон тайлбарласан 2 картаар сольсон. */}
              <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  {
                    icon: '💐', tint: 'rgba(255,90,140,0.4)',
                    title: 'Цэцэг яаж олох вэ?',
                    desc: 'Даалгавраа биелvvлэх бvрд цэцэг тvvж авна 🌱 — нэг цэцгээр дуртай нэгэн VIP бvлгээ тvр онгойлгож, амталж уншаад vз!',
                  },
                  {
                    icon: '⭐', tint: 'rgba(245,166,35,0.4)',
                    title: 'Од яаж цугларах вэ?',
                    desc: 'VIP багц авах бvрд од аяндаа нэмэгдэнэ (дээрх багц бvрийн хажууд хэд өгөхийг харна). 5000-д хvрвэл дараагийн VIP vнэгvй ✨',
                  },
                ].map((f, i) => (
                  <div key={i} style={{
                    position: 'relative', overflow: 'hidden',
                    display: 'flex', alignItems: 'center', gap: 14, padding: '15px 18px 15px 20px',
                    background: 'linear-gradient(135deg, rgba(139,0,0,0.1), rgba(255,255,255,0.02))',
                    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
                    boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
                  }}>
                    {/* ЗАСВАР (дизайн — дахин сайжруулалт): (1) карт бvрийн ард маш бvдэг,
                        том хэмжээтэй "чимэглэлийн" icon (гvнзгий давхарга/texture
                        мэдрэмж), (2) icon badge-ын glow-ыг статикаас аажим гэрэлтдэг
                        (benefit-icon-glow, index.css) болгов. */}
                    <div style={{ position: 'absolute', right: -2, top: '50%', transform: 'translateY(-50%) scale(2.6)', opacity: 0.08, pointerEvents: 'none', fontSize: 22 }}>
                      {f.icon}
                    </div>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${f.tint}, #8B0000)` }} />
                    <span className="benefit-icon-glow" style={{
                      width: 44, height: 44, borderRadius: 13, flexShrink: 0, fontSize: 20,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `radial-gradient(circle at 32% 28%, ${f.tint}, rgba(139,0,0,0.15))`,
                    }}>{f.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>{f.title}</div>
                      <div style={{ fontSize: 12, color: '#999', marginTop: 3, lineHeight: 1.4 }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button disabled={!selectedPlan} onClick={() => selectedPlan && setShowPopup(true)}
                style={{ width: '100%', marginTop: 32, padding: 16, border: 'none', borderRadius: 30, background: selectedPlan ? '#8B0000' : '#333', color: '#fff', fontWeight: 800, fontSize: 15, cursor: selectedPlan ? 'pointer' : 'not-allowed' }}>
                Vргэлжлvvлэх
              </button>

              {/* ШИНЭ (хэрэглэгчийн хvсэлт): цэцэгтэй огт хамааралгvй, тусдаа "од"
                  систем — VIP худалдаж авах бvрт од цугладаг, 5000 одноос дээш
                  болмогц admin-гvйгээр шууд одоороо VIP солих сонголт.
                  ЗАСВАР (дизайн): явцын progress bar + тайлбарыг богиносгосон карт. */}
              {currentUser && (() => {
                const have = userProfile?.loyalty_points || 0;
                const enough = have >= POINTS_TO_REDEEM_VIP;
                const pct = Math.min(100, Math.round((have / POINTS_TO_REDEEM_VIP) * 100));
                return (
                  <div style={{
                    marginTop: 24, padding: '16px 18px', borderRadius: 16,
                    background: 'linear-gradient(135deg, rgba(245,166,35,0.1), rgba(255,255,255,0.02))',
                    border: '1px solid rgba(245,166,35,0.22)', boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: '#f5a623' }}>
                        <span style={{ fontSize: 16 }}>⭐</span> Одоор VIP авах
                      </div>
                      <div style={{ fontSize: 12, color: '#999', fontWeight: 700 }}>{have}/{POINTS_TO_REDEEM_VIP}</div>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginTop: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: 'linear-gradient(90deg, #8B0000, #f5a623)', transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 8, lineHeight: 1.4 }}>
                      VIP авах бvрд од цугладаг. 5000-д хvрвэл vнэгvй VIP аваарай.
                    </div>
                    <button disabled={!enough || pointsRedeeming} onClick={() => redeemPointsForVip()}
                      style={{
                        width: '100%', marginTop: 12, padding: 13, border: 'none', borderRadius: 20, fontSize: 13, fontWeight: 800,
                        background: enough ? 'linear-gradient(90deg, #8B0000, #f5a623)' : 'rgba(255,255,255,0.05)',
                        color: enough ? '#fff' : '#666', cursor: (enough && !pointsRedeeming) ? 'pointer' : 'not-allowed',
                      }}>
                      {pointsRedeeming ? 'СОЛИЖ БАЙНА...' : enough ? 'ОДООР СОЛИХ' : `ДУТУУ БАЙНА (${POINTS_TO_REDEEM_VIP - have} vлдсэн)`}
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ЗАСВАР #93: iOS Safari-ийн native scroll indicator-той давхцаж "2 тэмдэг"
            шиг харагддаг байсан тул өөрийн улаан зураасыг бvрмөсөн хассан. */}

        {/* READER PAGE — ЗАСВАР #19: 100% өргөнөөр (edge-to-edge) харагдана, ойртуулах (pinch-zoom) хориглосон */}
        {page === 'reader' && selectedChapter && (
          <div style={{ touchAction: 'pan-y pinch-zoom' }}>
            {/* ЗАСВАР #203 (хэрэглэгчийн хvсэлт): мэдэгдлээс орж ирэхэд зурган
                хуудсыг огт харуулахгvй, шууд сэтгэгдлийн хэсэгт хvргэх энгийн
                толгой хэсэг. */}
            {commentsOnlyView && (
              <div style={{ position: 'sticky', padding: '1rem', top: 0, zIndex: 60, background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <button onClick={() => setPage('detail')} title="Буцах"
                  style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected?.title}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Бvлэг {selectedChapter.chapter_number}</div>
                </div>
                <span onClick={() => setCommentsOnlyView(false)} style={{ cursor: 'pointer', fontSize: 11, color: '#8B0000', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  Бvтнээр харах
                </span>
              </div>
            )}
            {!commentsOnlyView && (
            <>
            {/* ЗАСВАР #34: доошоо гvйлгэсэн ч буцах товч vргэлж хvрч болохоор
                sticky (шидэгдэж) байрлалтай болгосон — өмнө нь энгийн урсгалд
                байсан тул урт бvлгийг доош гvйлгэхэд буцах товч дэлгэцээс гарч
                дахин дээшлvvлж байж л дарж болдог байсан. */}
            {/* ЗАСВАР #70: гарчиг төвд биш, бvлгийн дугаарыг дан тоогоор баруун
                дээд буланд байрлуулав (буцах товч зvvн талдаа хэвээрээ) */}
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

            {/* ШИНЭ (хэрэглэгчийн хvсэлт): өмнө уншиж явсан газраасаа vргэлжлvvлэх
                эсэхийг асуух banner — өмнөх сессэд гvйлгэсэн байрлал хадгалагдсан бол
                бvлэг нээгдэх vед харагдана. */}
            {resumeBanner && (
              <div style={{ position: 'sticky', top: 64, zIndex: 59, margin: '0 12px 10px', padding: '14px 16px', borderRadius: 14, background: 'rgba(20,20,25,0.96)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 28px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: '#fff' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="#6fa8ff" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                    Vргэлжлvvлэн уншиx уу?
                  </div>
                  <span onClick={() => setResumeBanner(null)} style={{ cursor: 'pointer', color: '#888', fontSize: 16, padding: 2 }}>✕</span>
                </div>
                <div style={{ fontSize: 12, color: '#999', margin: '4px 0 12px' }}>
                  {resumeBanner.pageNum}-р хуудас / нийт {resumeBanner.totalPages} ({resumeBanner.percent}% дуусгасан)
                </div>
                <button onClick={resumeReaderScroll}
                  style={{ width: '100%', padding: '10px', border: 'none', borderRadius: 10, background: '#3b82f6', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                  Vргэлжлvvлэх
                </button>
                <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', marginTop: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${resumeBanner.percent}%`, borderRadius: 2, background: 'linear-gradient(to right, #6fa8ff, #3b82f6)' }} />
                </div>
              </div>
            )}

            {/* ШИНЭ: доод талын унших хяналтын мөр — толгой хэсэгтэй адил дэлгэцийг
                дээшлvvлэхэд гарч ирж, доошлуулахад нуугдана. ЗАСВАР: явцын мөрийг
                чирэхэд өөрөө scroll vvсгэж (seekReaderProgress → window.scrollTo)
                тэр нь мөрийг дундаас нь нуучихдаг тул "барьцгvй" мэдрэгддэг байсан —
                гэхдээ 100%-д (бvлгийн эцэст) хvрэхэд vргэлж харагдаж vлдэнэ. */}
            {(() => {
              const barVisible = readerHeaderVisible || readerScrollPercent >= 100;
              const idx = dbChapters.findIndex(c => c.id === selectedChapter.id);
              const prevCh = idx > 0 ? dbChapters[idx - 1] : null;
              const nextCh = idx >= 0 && idx < dbChapters.length - 1 ? dbChapters[idx + 1] : null;
              return (
                <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60, padding: '7px 10px', boxSizing: 'border-box', background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(6px)', borderTop: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transform: barVisible ? 'translateY(0)' : 'translateY(100%)', opacity: barVisible ? 1 : 0, transition: 'transform 0.25s ease, opacity 0.25s ease' }}>
                  <button disabled={!prevCh} onClick={() => prevCh && openReader(selected, prevCh)} title="Өмнөх бvлэг"
                    style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: prevCh ? '#fff' : '#444', cursor: prevCh ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>

                  <div ref={readerProgressTrackRef} onPointerDown={startReaderProgressDrag} onTouchStart={startReaderProgressDrag}
                    style={{ flex: '0 1 140px', maxWidth: 140, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)', position: 'relative', cursor: 'pointer' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${readerScrollPercent}%`, borderRadius: 2, background: 'linear-gradient(to right, #6fa8ff, #3b82f6)' }} />
                    <div style={{ position: 'absolute', top: '50%', left: `${readerScrollPercent}%`, transform: 'translate(-50%, -50%)', width: 11, height: 11, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 0 2px rgba(59,130,246,0.3)' }} />
                  </div>

                  <span style={{ fontSize: 11, color: '#ccc', minWidth: 28, textAlign: 'center', flexShrink: 0 }}>{readerScrollPercent}%</span>

                  <button disabled={!nextCh} onClick={() => nextCh && openReader(selected, nextCh)} title="Дараах бvлэг"
                    style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: nextCh ? '#fff' : '#444', cursor: nextCh ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>

                  <button onClick={scrollReaderToTop} title="Дээшээ"
                    style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                  </button>

                  <button onClick={scrollReaderToBottom} title="Доошоо"
                    style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                  </button>
                </div>
              );
            })()}

            {/* ЗАСВАР #85: бvлгийн зургийг татаж авахаас сэргийлэв (right-click
                context menu + drag хоёуланг нь хориглов). 100% хамгаалалт биш
                (screenshot-с сэргийлэх боломжгvй), гэвч энгийн татаж авахыг
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
                      // ЗАСВАР #223 (код шинжилгээ): хадгалсан width/height байвал
                      // aspect-ratio-гоор зайг нь урьдчилан зарлаж lazy зураг
                      // ачаалагдах vеийн "vсрэлт" (CLS)-ыг арилгана; хуучин
                      // (хэмжээгvй) зурган дээр өмнөх адил хэвээр vлдэнэ.
                      style={{ width: '100%', display: 'block', marginBottom: 0, verticalAlign: 'top', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', ...(img.width && img.height ? { aspectRatio: `${img.width} / ${img.height}` } : {}) }} />
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ color: '#555', textAlign: 'center', marginTop: '3rem' }}>Зураг ачааллаж байна эсвэл байхгvй байна...</div>
            )}

            {/* ЗАСВАР: Өмнөх/Дараах бvлэг рvv шилжих энгийн товчнууд эндээс хасав —
                доод талын байнгын хяналтын мөрөнд (‹ / ›) яг ижил vйлдэл давхардаж
                байгаа тул шаардлагагvй болсон. */}
            </>
            )}

            {/* ШИНЭ: СЭТГЭГДЛИЙН ХЭСЭГ — ЗАСВАР #88: гар утсан дэлгэц дээр 100%
                өргөнд зөв багтаах хажуугийн зай + арай эмхэтгэн жижигрvvлсэн хэмжээ */}
            <div ref={chapterCommentsRef} style={{ marginTop: '2.5rem', borderTop: '1px solid #1a1a1a', padding: '1.5rem 1rem 0', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
                <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                <span style={{ fontWeight: 800, fontSize: 13 }}>СЭТГЭГДЭЛ ({comments.length})</span>
              </div>

              {/* Сэтгэгдэл бичих */}
              {currentUser ? (
                <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', alignItems: 'flex-start' }}>
                  <Avatar url={userProfile?.avatar_url} letter={currentUser.email[0]} size={28} isVip={hasActiveVip} />
                  <div style={{ flex: 1 }}>
                    <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                      placeholder="Сэтгэгдлээ бичнэ vv..."
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
                  Сэтгэгдэл бичихийн тулд <span onClick={() => setAuthPage('login')} style={{ color: '#8B0000', cursor: 'pointer', fontWeight: 700 }}>нэвтэрнэ vv</span>
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
                      {/* Хvрээтэй дугуй avatar */}
                      {c.users?.avatar_url ? (
                        <img src={c.users.avatar_url} alt="" onClick={() => startDmWith(c.user_id, c.users?.name, c.users?.avatar_url)} title="Хувийн зурвас бичих" style={{ width: isReply ? 24 : 30, height: isReply ? 24 : 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #2a3142', cursor: 'pointer' }} />
                      ) : (
                        <div onClick={() => startDmWith(c.user_id, c.users?.name, c.users?.avatar_url)} title="Хувийн зурвас бичих" style={{ width: isReply ? 24 : 30, height: isReply ? 24 : 30, borderRadius: '50%', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: isReply ? 11 : 13, color: '#fff', flexShrink: 0, cursor: 'pointer' }}>
                          {(c.users?.name || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                          <span onClick={() => startDmWith(c.user_id, c.users?.name, c.users?.avatar_url)} style={{ fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>{c.users?.name || 'Хэрэглэгч'}</span>
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
                            {isStaff && currentUser && c.user_id !== currentUser.id && (
                              <span onClick={() => setStaffGiftTarget({ id: c.user_id, name: c.users?.name, avatar_url: c.users?.avatar_url })} title="Цэцэг бэлэглэх" style={{ cursor: 'pointer', fontSize: 11 }}>💐</span>
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
                          <span onClick={() => toggleLike(c)} className={liked ? 'like-pop' : ''} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: liked ? '#e0245e' : '#8a92a6', userSelect: 'none' }}>
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
                    Одоогоор сэтгэгдэл алга. Анхны сэтгэгдлийг vлдээгээрэй! 💬
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ADMIN / УДИРДЛАГЫН PAGE — staff бvгд орно, харагдах хэсэг нь эрхээс хамаарна */}
        {page === 'admin' && (isStaff || hasShaanaRole) && (
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
                { label: 'Нийт бvлэг', value: adminStats.chapters, icon: '📖' },
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
                { key: 'chapter', label: 'БVЛЭГ НЭМЭХ', show: isStaff || hasShaanaRole },
                { key: 'reels', label: 'REEL НЭМЭХ', show: canModerate },
                { key: 'roles', label: 'ЭРХ ОЛГОХ', show: isAdmin },
                { key: 'vip', label: 'VIP ОЛГОХ', show: isAdmin },
                { key: 'payments', label: `ТӨЛБӨРИЙН ХVСЭЛТ (${paymentRequests.length})`, show: isAdmin },
                { key: 'pending', label: `ХVЛЭЭГДЭЖ БУЙ (${pendingChapters.length})`, show: canModerate },
                { key: 'deleteRequests', label: `УСТГАХ ХVСЭЛТ (${pendingDeleteChapters.length})`, show: isAdmin },
                { key: 'reports', label: `МЭДЭГДЭЛ (${reportsList.length})`, show: canModerate },
                { key: 'feedback', label: `САНАЛ ХvСЭЛТ (${feedbackList.filter(f => f.status === 'open').length})`, show: canModerate },
                { key: 'tasks', label: 'ДААЛГАВАР', show: isAdmin },
                { key: 'stickers', label: `ЧАТНЫ СТИКЕР (${giftStickers.length})`, show: canModerate },
                { key: 'giftFlowers', label: '💐 ЦЭЦЭГ БЭЛЭГЛЭХ', show: isStaff },
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
                  <input type="file" accept="image/*" onChange={async e => {
                    const rawFile = e.target.files[0];
                    e.target.value = '';
                    if (!rawFile) { setPosterFile(null); return; }
                    try { setPosterFile(await normalizeImageFile(rawFile)); } catch (err) { notify(err.message); }
                  }}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БАННЕР ЗУРАГ (нvvр хэсгийн "Санал болгох" мөрөнд харагдах урт нарийн зураг)</div>
                  <input type="file" accept="image/*" onChange={async e => {
                    const rawFile = e.target.files[0];
                    e.target.value = '';
                    if (!rawFile) { setBannerFile(null); return; }
                    try { setBannerFile(await normalizeImageFile(rawFile)); } catch (err) { notify(err.message); }
                  }}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                  <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Оруулаагvй бол poster зураг ашиглагдана</div>
                </div>
                {/* ШИНЭ: манга нэмэхдээ шууд нуугдмал байдлаар vvсгэх сонголт */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, color: '#aaa' }}>
                  <input type="checkbox" checked={adminMangaHidden} onChange={e => setAdminMangaHidden(e.target.checked)}
                    style={{ accentColor: '#8B0000', width: 16, height: 16 }} />
                  🥀 Нуугдмал байдлаар нэмэх (зөвхөн ажилтан харна, дараа ил гаргаж болно)
                </label>
                {/* ШИНЭ (хэрэглэгчийн хvсэлт): зөвхөн admin-д л харагдах, "Бvгдийн шаана"
                    эрхтэй хэрэглэгчдэд хязгаарласан манга vvсгэх сонголт. */}
                {isAdmin && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, color: '#f5c518' }}>
                    <input type="checkbox" checked={adminMangaRestricted} onChange={e => setAdminMangaRestricted(e.target.checked)}
                      style={{ accentColor: '#8B0000', width: 16, height: 16 }} />
                    👑 Зөвхөн "Бvгдийн шаана" эрхтэй хvмvvст харуулах (дараа нь Нийтэд нээж болно)
                  </label>
                )}
                <button disabled={mangaSaving} onClick={async () => {
                  // ЗАСВАР #142: олон дарахад давхар vvсгэхээс сэргийлж, хамгийн эхэнд шалгана
                  // (disabled attribute React-ийн дараагийн render хvртэл хойшлогддог тул
                  // маш хурдан давхар дарахад тvvнийг ганцаараа найдаж болохгvй).
                  if (mangaSaving) return;
                  if (!adminManga.title) { notify('Гарчиг оруулна уу!'); return; }
                  // ЗАСВАР #118: төрлийн шалгалтыг upload-ын ӨМНӨ зөөв — өмнө нь
                  // зургууд R2 руу орсны ДАРАА шалгалт унаж, орфон файл vлддэг байсан.
                  if (adminManga.genres.length === 0) { notify('Дор хаяж 1 төрөл сонгоно уу!'); return; }
                  const badFile = [posterFile, bannerFile].filter(Boolean).map(validateImageFile).find(Boolean);
                  if (badFile) { notify(badFile); return; }
                  setMangaSaving(true);
                  try {
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
                    const { error } = await supabase.from('mangas').insert({
                      title: adminManga.title,
                      description: adminManga.desc,
                      genres: adminManga.genres,
                      status: adminManga.status,
                      poster_url: posterUrl,
                      banner_url: bannerUrl || null,
                      created_by: currentUser.id,
                      is_hidden: adminMangaHidden,
                      restricted_role: (isAdmin && adminMangaRestricted) ? 'shaana' : null,
                    });
                    if (error) notify('Алдаа: ' + error.message);
                    else {
                      notify('Манга амжилттай нэмэгдлээ! 🎉');
                      setAdminManga({ title: '', desc: '', genres: [], status: 'Гарч байгаа' });
                      setPosterFile(null);
                      setBannerFile(null);
                      setAdminMangaHidden(false);
                      setAdminMangaRestricted(false);
                      fetchMangas(); // ЗАСВАР: жагсаалтыг шууд шинэчилнэ (өмнө нь refresh хэрэгтэй байсан)
                    }
                  } catch (e) {
                    notify('Алдаа: ' + e.message);
                  } finally {
                    setMangaSaving(false);
                  }
                }} style={{ width: '100%', background: mangaSaving ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 700, cursor: mangaSaving ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                  {mangaSaving ? 'ХАДГАЛЖ БАЙНА...' : 'НЭМЭХ'}
                </button>
              </div>
              )}

              {/* Бvлэг нэмэх */}
              {adminTab === 'chapter' && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e', maxWidth: 480 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                  БVЛЭГ НЭМЭХ
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>МАНГА СОНГО</div>
                  {/* ЗАСВАР #163: "Дууссан" төлөвтэй мангад шинэ бvлэг нэмэх шаардлагагvй тул
                      жагсаалтаас хасаж, олдоцыг хялбарчилав (мангатай олон болсноор нэр олоход хэцvv болсон). */}
                  <select value={chapterManga} onChange={e => setChapterManga(e.target.value)}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }}>
                    <option value="">-- Манга сонгох --</option>
                    {/* ШИНЭ: жагсаалтыг нэрээр нь (Монгол vсгийн зvй дараалал) эрэмбэлж,
                        DB-с ирсэн санамсаргvй (жишээ нь vvсгэсэн огноогоор) дарааллын
                        оронд олдоцыг хялбарчилав. */}
                    {/* ЗАСВАР (хэрэглэгчийн хvсэлт): staff биш, зөвхөн "Бvгдийн шаана"
                        эрхтэй хэрэглэгчид ЗӨВХӨН өөрийн эрхэд тохирох хязгаарлагдсан
                        мангаг л сонгож болно (бусад staff бvгдийг сонгож болно). */}
                    {dbMangas.filter(m => m.status !== 'Дууссан' && (isStaff || m.restricted_role === 'shaana')).sort((a, b) => a.title.localeCompare(b.title, 'mn')).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БVЛГИЙН ДУГААР</div>
                    <input type="number" value={chapterNumber} onChange={e => setChapterNumber(e.target.value)}
                      placeholder="1"
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БVЛГИЙН НЭР (заавал биш)</div>
                    <input value={chapterTitle} onChange={e => setChapterTitle(e.target.value)}
                      placeholder="Жишээ: Эхлэл"
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {/* ШИНЭ: бvлгийн COVER зураг тусдаа оруулна */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БVЛГИЙН COVER ЗУРАГ (жагсаалтад харагдана)</div>
                  <input type="file" accept="image/*" onChange={async e => {
                    const rawFile = e.target.files[0];
                    e.target.value = '';
                    if (!rawFile) { setChapterCover(null); return; }
                    try { setChapterCover(await normalizeImageFile(rawFile)); } catch (err) { notify(err.message); }
                  }}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                  <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Оруулаагvй бол эхний хуудас автоматаар cover болно</div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БVЛГИЙН ЗУРАГНУУД (хуудас бvрээр, дараалсан)</div>

                  {/* ЗАСВАР #199 (хэрэглэгчийн хvсэлт): "Бvтнээр"/"Хуваах" гэсэн гараар
                      сонгох товчийг хассан — оронд нь 6000px-ээс УРТ ЗУРАГ бvгд
                      АВТОМАТААР хуваагдана. Учир нь маш урт (жишээ нь 60000px) зургийг
                      бvтнээр нь (1 файлаар) upload хийвэл уншигчид тэр их хэмжээний
                      зургийг НЭГ дор (дата ихээр зарцуулж, удаан ачаалж) татаж авах
                      шаардлагатай болдог байсан — хэсэг хэсгээр нь (6000px тус бvр)
                      progressively ачаалуулснаар унших туршлага/дата хэрэглээ хоёул сайжирна.
                  */}
                  <div style={{ fontSize: 10, color: '#555', marginBottom: 8 }}>6000px-ээс урт зураг унших vед хялбар болгохын тулд автоматаар олон хуудас болж хуваагдана (өргөн хэвээрээ vлдэнэ).</div>

                  {/* ЗАСВАР #23: сонгосон зургуудыг шууд upload хийдэггvй болгож, эхлээд
                      шалгах/устгах/дараалал сольж болдог preview vзvvлдэг болгосон.
                      Дахин файл сонговол ХУУЧНЫГ ДАРААГVЙ нэмэгдэнэ (өмнө нь бvхэлд нь орлуулдаг байсан). */}
                  <input type="file" accept="image/*" multiple
                    onChange={async e => {
                      const picked = Array.from(e.target.files);
                      e.target.value = '';
                      const normalized = [];
                      const badNames = [];
                      for (const f of picked) {
                        // eslint-disable-next-line no-await-in-loop
                        try {
                          const norm = await normalizeImageFile(f);
                          // ЗАСВАР #241 (хэрэглэгчийн хvсэлт — хуудас дундаасаа дутахгvй
                          // байх ёстой): decode шалгалт унасан ч файлыг ОРХИХГvй, зөвхөн
                          // урьдчилан анхааруулна — upload хийх vед боловсруулагдаагvй
                          // эх хэвээр нь орно (доорх ЗАСВАР #241-ийг vз).
                          if (!(await checkImageDecodable(norm))) badNames.push(f.name || 'нэргvй зураг');
                          normalized.push(norm);
                        } catch (err) { notify(err.message); }
                      }
                      if (badNames.length > 0) {
                        notify(`Анхаар: дараах зураг(ууд) энэ дэлгэцэн дээр урьдчилан харагдахгvй байж болзошгvй, гэхдээ upload хийхэд хуудас нь дутахгvй (эх хэвээрээ орно): ${badNames.join(', ')}`);
                      }
                      setChapterFiles(prev => [...prev, ...normalized]);
                    }}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                  <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Дахин сонговол нэмэгдэнэ. Доор гvйлгэж харж, устгаж, дараалал сольж болно.</div>

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
                              title="Зvvн тийш зөөх"
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
                      {/* ЗАСВАР #36: бvлэг уншиж байгаа юм шиг бvтнээр нь харах цонх */}
                      <button onClick={() => setChapterPreviewOpen(true)}
                        style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        🖼️ БVТНЭЭР ХАРАХ
                      </button>
                    </div>
                  )}
                </div>

                {/* ШИНЭ: VIP бvлэг checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, color: '#aaa' }}>
                  <input type="checkbox" checked={chapterIsVip} onChange={e => setChapterIsVip(e.target.checked)}
                    style={{ accentColor: '#8B0000', width: 16, height: 16 }} />
                  VIP бvлэг (зөвхөн эрхтэй хэрэглэгч уншина)
                </label>

                {/* ШИНЭ: upload амжилттай дуусаад ч зориудаар нуугдмал vлдээх сонголт */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, color: '#aaa' }}>
                  <input type="checkbox" checked={chapterHidden} onChange={e => setChapterHidden(e.target.checked)}
                    style={{ accentColor: '#8B0000', width: 16, height: 16 }} />
                  🥀 Нуугдмал байдлаар нэмэх (зөвхөн ажилтан харна, дараа ил гаргаж болно)
                </label>

                {/* ЗАСВАР #60: "VНЭГVЙ"/"VIP" бэлгэдлийн оронд бичдэг дурын тэмдэглэгээ */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ТЭМДЭГЛЭГЭЭ (заавал биш, жишээ нь: S1 END)</div>
                  <input value={chapterLabel} onChange={e => setChapterLabel(e.target.value)}
                    placeholder="S1 END"
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                {needsChapterApproval && (
                  <div style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: '#f5a623', lineHeight: 1.5 }}>
                    ℹ️ Таны оруулсан бvлэг Модератор баталсны дараа нийтлэгдэнэ.
                  </div>
                )}

                {/* ЗАСВАР #22: admin/moderator шууд нэмэхдээ ч ирээдvйн гарах цаг товлож болно
                    (editor-only/shaana-only-д харагдахгvй — тэдний бvлэг барьцаагаар аяндаа "Хvлээгдэж буй" ордог) */}
                {!needsChapterApproval && (
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
                    if (!chapterNumber) { notify('Бvлгийн дугаар оруулна уу!'); return; }
                    if (chapterFiles.length === 0) { notify('Зураг сонгоно уу!'); return; }
                    // ЗАСВАР #11: бvх зургийг (cover + хуудсууд) upload эхлэхээс өмнө шалгана
                    const badFile = [chapterCover, ...chapterFiles].filter(Boolean).map(validateImageFile).find(Boolean);
                    if (badFile) { notify(badFile); return; }

                    // ЗАСВАР (хэрэглэгчийн хvсэлт — алдаа): олон/том зураг upload хийхэд
                    // хэдэн минут vргэлжилж болдог тул эхлэхээс өмнө session/token-ыг
                    // урьдчилан сэргээнэ (шаардлагатай бол supabase-js автоматаар
                    // refresh хийдэг) — эс тэгвэл upload дунд token хугацаа дуусаж,
                    // хэрэглэгч гэнэт "гарсан" мэт болж, upload тасалдах эрсдэлтэй байв.
                    const { data: { session: freshSession } } = await supabase.auth.getSession();
                    if (!freshSession) { notify('Нэвтрэлтийн хугацаа дууссан байна — дахин нэвтрээд оролдоно уу.'); return; }

                    setChapterUploading(true);
                    setChapterUploadProgress(0);

                    // ЗАСВАР #199 (хэрэглэгчийн хvсэлт): гараар сонгодог "Хуваах" горимыг
                    // хассан — 6000px-ээс урт зургийг upload эхлэхээс өмнө vргэлж
                    // автоматаар хэсэг хэсэг болгож таслана (нэг нэгээр нь, зэрэг биш —
                    // олон том зургийг зэрэг декодлож санах ойг дvvргэхээс сэргийлнэ).
                    // ЗАСВАР #200 (хэрэглэгчийн хvсэлт — дата хэрэглээ багасгах): хуваахаас
                    // ӨМНӨ өргөнийг нь (1200px-ээс дээш бол л) багасгаж, WebP рvv хөрвvvлнэ —
                    // ингэснээр давхар (a) уншигчийн татах байт багасна, (б) хуваах vеийн
                    // pixel тоо цөөрч, MAX_SAFE_PIXELS-д хvрэх эрсдэл ч буурна.
                    let filesToUpload = chapterFiles;
                    {
                      const expanded = [];
                      // ЗАСВАР #241 (хэрэглэгчийн гомдол — Samsung S22 дээр зарим
                      // screenshot/өөр апп-аас хуулсан зураг "The source image could
                      // not be decoded" гэж browser-т decode хийгдэхгvй): өмнө нь ГАНЦ
                      // файл decode хийгдэхгvй бол БvХ бvлгийг (бусад хэвийн зурагтай
                      // нь хамт) upload хийхээс зогсоодог, мөн аль файл нь эвдэрсэн
                      // гэдгийг заадаггvй байв. Одоо файл бvрийг ТУСДАА (per-file)
                      // алдаанаас хамгаалж, эвдэрсэн файлыг нэрээр нь мэдэгдээд
                      // алгасаж, vлдсэн хэвийн зурагтай нь vргэлжлvvлнэ.
                      const failedNames = [];
                      const rawFallbackNames = [];
                      for (const f of chapterFiles) {
                        try {
                          // ЗАСВАР #238 (код шинжилгээ): ӨМНӨ нь эхлээд optimize (өргөнийг
                          // 1200px рvv багасгах), дараа нь split хийдэг байсан — НАРИЙХАН
                          // (1200px-с бага, тул optimize хэмжээг vл хөндөнө) БОЛОВЧ МАШ УРТ
                          // (жишээ нь 58000px) зурагт split хэзээ ч хvрдэггvй, харин
                          // optimize өөрөө бvтэн 58000px өндөртэй canvas зурахыг оролдож,
                          // iOS Safari-ийн canvas хэмжээний хязгаараас хэтэрч toBlob() null
                          // буцаадаг байв. Одоо ЭХЛЭЭД split хийж (6000px-с урт бол хэсэглэж),
                          // ДАРАА нь хэсэг бvрийг optimize хийнэ — ингэснээр аль ч функцэд
                          // нэг ч удаа бvтэн өндрөөрөө canvas vvсэхгvй.
                          // eslint-disable-next-line no-await-in-loop
                          const parts = await splitTallImageFile(f, 6000);
                          for (const part of parts) {
                            // eslint-disable-next-line no-await-in-loop
                            const optimized = await optimizeImageFile(part.file, 1200);
                            expanded.push(optimized);
                          }
                        } catch (e) {
                          // ЗАСВАР #241 (хэрэглэгчийн хvсэлт — манганы хуудас дундаасаа
                          // дутахгvй байх ёстой): хэт өндөр нягтралтай (MAX_SAFE_PIXELS,
                          // browser crash эрсдэлтэй) зургийг л алгасна — бусад ("could not
                          // be decoded" гэх мэт зөвхөн split/optimize decode хийж чадаагvй,
                          // жинхэнэ эвдрэлгvй магадгvй) зургийг БОЛОВСРУУЛАЛГvй эх хэвээр
                          // нь (split/webp хийхгvй, header аль хэдийн шалгагдсан) upload-д
                          // оруулна — ингэснээр хуудас дутахгvй, зөвхөн хэмжээ/формат
                          // оптимайз хийгдээгvй vлдэнэ.
                          if (/хэт өндөр нягтралтай/.test(e.message || '')) {
                            failedNames.push(f.name || 'нэргvй зураг');
                          } else {
                            expanded.push({ file: f, width: 0, height: 0 });
                            rawFallbackNames.push(f.name || 'нэргvй зураг');
                          }
                        }
                      }
                      if (failedNames.length > 0) {
                        notify(`Алдаа: дараах зураг(ууд) хэт өндөр нягтралтай тул орсонгvй (жижигрvvлж дахин оруулна уу): ${failedNames.join(', ')}`);
                      }
                      if (rawFallbackNames.length > 0) {
                        notify(`Анхаар: дараах зураг(ууд) энэ утсан дээр боловсруулагдаагvй ЭХ хэвээрээ орсон (хуудас дутахгvй, гэхдээ жижигрvvлэгдээгvй/webp болоогvй): ${rawFallbackNames.join(', ')}`);
                      }
                      if (expanded.length === 0) {
                        setChapterUploading(false);
                        return;
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
                        title: chapterTitle || `Бvлэг ${chapterNumber}`,
                        is_vip: chapterIsVip,
                        label: chapterLabel.trim() || null,
                        // Editor-only/shaana-only → 'pending' (батлагдах хvртэл харагдахгvй), бусад staff → шууд нийтлэгдэнэ.
                        // ЗАСВАР #126: chapters_insert_staff RLS policy (WITH CHECK) editor-only/
                        // shaana-only мөрийг status='pending' биш утгаар оруулахыг сервер талд
                        // хориглодог болсон тул энд хуурч (жишээ нь Network tab-аар мутлаж) болохгvй.
                        status: needsChapterApproval ? 'pending' : 'published',
                        publish_at: !needsChapterApproval && chapterPublishAt ? new Date(chapterPublishAt).toISOString() : null,
                        // ЗАСВАР #163: зургууд бvгд амжилттай орох хvртэл нуугдмал байлгана —
                        // эс бол эхний секундээс "published" болоод хагас хуудастай харагдана.
                        // Бvх зураг амжилттай орсны дараа доор is_hidden:false болгоно.
                        // needsChapterApproval-ийн хувьд status аль хэдийн 'pending' тул нэмж нуух
                        // шаардлагагvй — БОЛОХГvй ч, учир нь chapters_update_moderate RLS
                        // policy зөвхөн admin/moderator-т update зөвшөөрдөг тул editor/shaana
                        // доорх is_hidden:false update-ыг өөрөө хийж чадахгvй (чимээгvй RLS-д
                        // хориглогдож), бvлэг нь admin батласны дараа ч мөнхөд нуугдмал vлдэнэ.
                        is_hidden: needsChapterApproval ? false : true,
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
                      // ЗАСВАР #194 (код шинжилгээ): "chapters/{id}/cover.ext",
                      // "chapters/{id}/1.jpg", "2.jpg"... маягийн ДАРААЛСАН,
                      // ТААМАГЛАЖ БОЛОХУЙЦ нэрнvvд байсан тул R2 нь public storage
                      // байхад VIP/цаг товлогдоогvй бvлгийн зургийг chapter_images
                      // хvснэгтийн RLS-ийг тойрч, URL-ыг шууд таагаад vзэх боломжтой
                      // байв (chapter_id мэдэгдэж байгаа бол 1.jpg, 2.jpg... гэж
                      // дараалуулаад л шалгаж vзэх л хангалттай). crypto.randomUUID()
                      // ашигласнаар path-ыг таамаглах боломжгvй болно.
                      const cName = `chapters/${chapterData.id}/${crypto.randomUUID()}-cover.${cExt}`;
                      try {
                        thumbnailUrl = await uploadToR2(chapterCover, cName);
                      } catch (cErr) { notify('Cover upload алдаа: ' + cErr.message); uploadFailed = true; }
                      markUploadDone();
                    }

                    for (let i = 0; i < filesToUpload.length; i++) {
                      // ЗАСВАР #224 (код шинжилгээ): filesToUpload[i] нь одоо
                      // {file, width, height} хэлбэртэй (optimizeImageFile/
                      // splitTallImageFile-ээс шууд), дахин decode хийх шаардлагагvй.
                      const { file, width: imgWidth, height: imgHeight } = filesToUpload[i];
                      const fileExt = file.name.split('.').pop();
                      // ЗАСВАР #194: дарааллыг DB-ийн page_number баганаас (доор
                      // insert хийгдэнэ) уншина, файлын нэрэнд дугаар шаардлагагvй —
                      // random нэр ашигласнаар path таамаглагдахгvй.
                      const fileName = `chapters/${chapterData.id}/${crypto.randomUUID()}.${fileExt}`;

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
                      // хассан — тэр нь дурын (санамсаргvй харагдах) хуудасны зургийг "cover"
                      // мэт харуулдаг байсан. Одоо зөвхөн admin ЗОРИУДАА оруулсан cover л
                      // thumbnail болно; оруулаагvй бол харуулах хэсэгт манга poster ашиглана.
                      const { error: imgError } = await supabase.from('chapter_images').insert({
                        chapter_id: chapterData.id,
                        image_url: publicUrl,
                        page_number: i + 1,
                        width: imgWidth || null,
                        height: imgHeight || null,
                      });
                      if (imgError) { notify(`Зураг ${i + 1} хадгалах алдаа: ` + imgError.message); uploadFailed = true; }
                    }

                    // ЗАСВАР #163: бvх зураг амжилттай орсон vед л ил болгоно; аль нэг нь
                    // амжилтгvй болсон бол is_hidden:true хэвээр vлдээж, admin/moderator-т л
                    // (staff тул is_hidden vл харгалзан) харагдаж дутуу хуудсаа нөхөх боломжтой байна.
                    // ШИНЭ: upload бvгд амжилттай болсон ч, admin зориудаар "Нуугдмал" сонговол
                    // (chapterHidden) ил болгохгvй, тэр хэвээр нь vлдээнэ.
                    const chapterUpdates = {};
                    if (!uploadFailed) chapterUpdates.is_hidden = chapterHidden;
                    if (thumbnailUrl) chapterUpdates.thumbnail_url = thumbnailUrl;
                    if (Object.keys(chapterUpdates).length > 0) {
                      await supabase.from('chapters')
                        .update(chapterUpdates)
                        .eq('id', chapterData.id);
                    }

                    if (uploadFailed) {
                      notify('⚠️ Зарим зураг амжилтгvй боллоо — бvлгийг "нуугдсан" төлөвтэй vлдээлээ, дутуу хуудсаа chapter засварлах цэснээс нөхнө vv');
                    } else {
                      notify(needsChapterApproval
                        ? 'Бvлэг илгээгдлээ! Модератор баталсны дараа нийтлэгдэнэ ✅'
                        : 'Бvлэг амжилттай нэмэгдлээ! 🎉');
                    }
                    setChapterManga('');
                    setChapterNumber('');
                    setChapterTitle('');
                    setChapterFiles([]);
                    setChapterCover(null);
                    setChapterIsVip(false);
                    setChapterHidden(false);
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
                  {chapterUploading ? `УНШИЖ БАЙНА... ${chapterUploadProgress}%` : 'БVЛЭГ НЭМЭХ'}
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

                {/* ШИНЭ (хэрэглэгчийн хvсэлт): видео эсвэл дээд тал нь 10 зурагтай "цуврал" reel */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {[{ key: 'video', label: '🎬 Видео' }, { key: 'images', label: '🖼️ Зурган цуврал (10 хvртэл)' }].map(t => (
                    <div key={t.key} onClick={() => setReelType(t.key)}
                      style={{
                        flex: 1, textAlign: 'center', padding: '8px 6px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        background: reelType === t.key ? 'rgba(139,0,0,0.25)' : '#1a1a1a',
                        border: reelType === t.key ? '1px solid #8B0000' : '1px solid #2a2a2a',
                        color: reelType === t.key ? '#fff' : '#888',
                      }}>
                      {t.label}
                    </div>
                  ))}
                </div>

                {reelType === 'video' ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ВИДЕО ФАЙЛ</div>
                    <input type="file" accept="video/*" onChange={e => setReelVideoFile(e.target.files[0] || null)}
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>1 мангад олон reel нэмж болно</div>
                  </div>
                ) : (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ЗУРАГНУУД (дээд тал нь 10)</div>
                    <input type="file" accept="image/*" multiple onChange={e => setReelImageFiles(Array.from(e.target.files || []).slice(0, 10))}
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                    {reelImageFiles.length > 0 && (
                      <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>{reelImageFiles.length} зураг сонгосон</div>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ТУСДАА ДУУ/ХӨГЖИМ (заавал биш)</div>
                  <input type="file" accept="audio/*" onChange={e => setReelAudioFile(e.target.files[0] || null)}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                  <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>
                    {reelType === 'video' ? 'Хавсаргавал видеоны өөрийнх нь дууг нам болгож, зөвхөн энэ дуу сонсогдоно' : 'Зурган цувралд дуу оруулахгvй бол чимээгvй тоглоно'}
                  </div>
                </div>

                <button
                  disabled={reelUploading}
                  onClick={async () => {
                    if (!adminReelManga) { notify('Манга сонгоно уу!'); return; }
                    if (reelType === 'video' && !reelVideoFile) { notify('Видео файл сонгоно уу!'); return; }
                    if (reelType === 'video' && !reelVideoFile.type.startsWith('video/')) { notify('Алдаа: зөвхөн видео файл оруулна уу.'); return; }
                    if (reelType === 'images' && reelImageFiles.length === 0) { notify('Дор хаяж 1 зураг сонгоно уу!'); return; }
                    setReelUploading(true);
                    try {
                      let videoUrl = null;
                      let imageUrls = null;
                      let audioUrl = null;
                      if (reelType === 'video') {
                        const ext = reelVideoFile.name.split('.').pop();
                        videoUrl = await uploadToR2(reelVideoFile, `reels/${Date.now()}.${ext}`);
                      } else {
                        imageUrls = [];
                        for (const file of reelImageFiles) {
                          const ext = file.name.split('.').pop();
                          const url = await uploadToR2(file, `reels/${Date.now()}-${imageUrls.length}.${ext}`);
                          imageUrls.push(url);
                        }
                      }
                      if (reelAudioFile) {
                        const ext = reelAudioFile.name.split('.').pop();
                        audioUrl = await uploadToR2(reelAudioFile, `reels-audio/${Date.now()}.${ext}`);
                      }
                      const { error } = await supabase.from('reels').insert({
                        manga_id: adminReelManga,
                        video_url: videoUrl,
                        image_urls: imageUrls,
                        audio_url: audioUrl,
                        created_by: currentUser.id,
                      });
                      if (error) { notify('Алдаа: ' + error.message); return; }
                      notify('Reel амжилттай нэмэгдлээ! 🎉');
                      setAdminReelManga('');
                      setReelVideoFile(null);
                      setReelImageFiles([]);
                      setReelAudioFile(null);
                      fetchReels();
                    } catch (uploadError) {
                      notify('Upload алдаа: ' + uploadError.message);
                    } finally {
                      setReelUploading(false);
                    }
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
                            {reel.video_url ? (
                              <video src={reel.video_url} muted style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 6, background: '#000', flexShrink: 0 }} />
                            ) : (
                              <img src={reel.image_urls?.[0]} alt="" style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 6, background: '#000', flexShrink: 0 }} />
                            )}
                            {reel.audio_url && <span title="Тусдаа дуутай" style={{ fontSize: 11, flexShrink: 0 }}>🎵</span>}
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
                    { key: 'editor', desc: 'Эдитор — манга/бvлэг нэмэх (батлагдсаны дараа нийтлэгдэнэ)' },
                    { key: 'moderator', desc: 'Модератор — + батлах/татгалзах, сэтгэгдэл устгах, report' },
                    { key: 'admin', desc: 'Админ — бvх эрх' },
                    { key: 'shaana', desc: 'Бvгдийн шаана — зөвхөн admin-ий нэмсэн тусгай манга vзэх эрх' },
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
                  if (!userData) { notify('Тэр имэйлтэй хэрэглэгч олдсонгvй! Хэрэглэгч эхлээд сайтад бvртгvvлсэн байх ёстой. ' + adminWorkerEmail); return; }
                  // ЗАСВАР #187 (код шинжилгээ): Gmail давхцлын шалгалт (цэг/+alias)
                  // болон эрх олгох update-ыг НЭГ security definer RPC-ээр (сервер
                  // талд) хийнэ — өмнө нь клиентийн async staffUsers state дээр
                  // vндэслэдэг байсан тул хуудас нээгээд шууд ЭРХ ОЛГОХ дарвал
                  // staffUsers хараахан ирээгvй (хоосон) vед шалгалт алгасагддаг байв.
                  const { error } = await supabase.rpc('admin_grant_roles', {
                    target_user_id: userData.id,
                    new_roles: adminWorkerRoles,
                  });
                  if (error) {
                    if (error.message.startsWith('gmail_clash:')) {
                      notify(`Алдаа: энэ Gmail хаяг (өөр бичлэгээр: ${error.message.slice('gmail_clash:'.length)}) аль хэдийн staff эрхтэй байна.`);
                    } else {
                      notify('Алдаа: ' + error.message);
                    }
                  } else {
                    const label = adminWorkerRoles.length > 0 ? adminWorkerRoles.map(r => ROLE_LABELS[r]).join(' + ') : 'Хэрэглэгч (эрхгvй)';
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
                  💡 Мөн Supabase Dashboard → Table Editor → users хvснэгтээс role баганыг шууд засаж болно.
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
                    try {
                      // ЗАСВАР #133: public.users.email биш, auth.users (жинхэнэ имэйл)-ээр хайна
                      const { data: userData, error: userError } = await supabase
                        .rpc('admin_lookup_user_by_email', { lookup_email: vipEmail.trim() })
                        .maybeSingle();
                      if (userError) { notify('Алдаа: ' + userError.message); return; }
                      if (!userData) { notify('Тэр имэйлтэй хэрэглэгч олдсонгvй!'); return; }
                      // Идэвхтэй VIP-тэй бол одоо байгаа дуусах хугацаан дээр нь нэмнэ, эс бол өнөөдрөөс эхэлнэ
                      const base = (userData.is_vip && userData.vip_expires_at && new Date(userData.vip_expires_at).getTime() > Date.now())
                        ? new Date(userData.vip_expires_at)
                        : new Date();
                      base.setDate(base.getDate() + days);
                      const { error } = await supabase.from('users')
                        .update({ is_vip: true, vip_expires_at: base.toISOString() })
                        .eq('id', userData.id);
                      if (error) { notify('Алдаа: ' + error.message); return; }
                      notify(`VIP ${days} хоногоор олгогдлоо! 👑 (${formatMnDate(base.toISOString())} хvртэл)`);
                      setVipEmail('');
                    } catch (e) {
                      notify('Алдаа: ' + e.message);
                    } finally {
                      setVipSaving(false);
                    }
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
                    if (!userData) { notify('Тэр имэйлтэй хэрэглэгч олдсонгvй!'); return; }
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
                {vipUsers.length > 0 && (
                  <input value={vipUserSearch} onChange={e => setVipUserSearch(e.target.value)}
                    placeholder="Имэйлээр хайх (жишээ нь gmail)..."
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box', marginBottom: 10 }} />
                )}
                {(() => {
                  const q = vipUserSearch.trim().toLowerCase();
                  const filteredVipUsers = q ? vipUsers.filter(u => (u.email || '').toLowerCase().includes(q)) : vipUsers;
                  if (vipUsers.length === 0) return <div style={{ fontSize: 13, color: '#555' }}>Одоогоор VIP хэрэглэгч алга</div>;
                  if (filteredVipUsers.length === 0) return <div style={{ fontSize: 13, color: '#555' }}>Тохирох хэрэглэгч олдсонгvй</div>;
                  return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                    {filteredVipUsers.map(u => {
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
                  );
                })()}
              </div>
              </>
              )}

              {/* ЗАСВАР #91: "ТӨЛБӨР ТӨЛСӨН" хvсэлтvvд — admin шалгаад батлах/цуцлах */}
              {adminTab === 'payments' && isAdmin && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#f5a623', borderRadius: 2 }} />
                  ТӨЛБӨРИЙН ХVСЭЛТ ({paymentRequests.length})
                </div>
                {paymentRequests.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#555' }}>Хvлээгдэж буй хvсэлт алга ✓</div>
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
                          // нэмэгдэх эрсдэлтэй байсан (RPC мөрийг тvгжиж давхар батлахыг ч хориглоно).
                          const days = PLAN_DAYS[req.plan_key] || 30;
                          const { error: approveError } = await supabase.rpc('approve_payment_request', { request_id: req.id, vip_days: days });
                          if (approveError) { notify('Алдаа: ' + approveError.message); return; }
                          // ЗАСВАР (хэрэглэгчийн хvсэлт): багцаас хамааран бонус цэцэг БА одыг ч
                          // сервер (approve_payment_request RPC) автоматаар нэмдэг болсон тул
                          // мэдэгдэлд vvнийг ч дурдана.
                          const bonusFlowers = { '1sar': 3, '3sar': 10, '6sar': 30 }[req.plan_key] || 0;
                          const bonusPoints = { '1sar': 500, '3sar': 2000, '6sar': 5000 }[req.plan_key] || 0;
                          notify(`VIP ${days} хоногоор олгогдлоо! 👑${bonusFlowers ? ` + ${bonusFlowers} цэцэг 💐` : ''}${bonusPoints ? ` + ${bonusPoints} од ⭐` : ''}`);
                          fetchPaymentRequests();
                        }} style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                          БАТЛАХ
                        </button>
                        <button onClick={async () => {
                          const { error } = await supabase.from('payment_requests')
                            .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: currentUser.id }).eq('id', req.id);
                          if (error) { notify('Алдаа: ' + error.message); return; }
                          notify('Хvсэлт цуцлагдлаа');
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

            {/* ШИНЭ: БАТЛАХ ХVЛЭЭГДЭЖ БУЙ БVЛГvvД — moderator/admin */}
            {adminTab === 'pending' && canModerate && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#f5a623', borderRadius: 2 }} />
                  БАТЛАХ ХVЛЭЭГДЭЖ БУЙ БVЛГVVД ({pendingChapters.length})
                </div>
                {pendingChapters.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#555' }}>Хvлээгдэж буй бvлэг алга ✓</div>
                ) : pendingChapters.map(ch => (
                  <div key={ch.id} style={{ padding: '12px 14px', background: '#1a1a1a', borderRadius: 10, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {ch.thumbnail_url && <img src={ch.thumbnail_url} alt="" style={{ width: 60, height: 40, borderRadius: 8, objectFit: 'cover', objectPosition: 'top' }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ch.mangas?.title || 'Манга'} — Бvлэг {ch.chapter_number}
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
                          notify(t ? `Батлагдлаа! ${formatMnDate(t)}-нд нийтлэгдэнэ 🕐` : 'Бvлэг шууд нийтлэгдлээ! ✅');
                        }
                        fetchPending();
                      }} style={{ background: '#1e5c2e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                        ✓ БАТЛАХ
                      </button>
                      <button onClick={() => askConfirm('Энэ бvлгийг татгалзах уу?', async () => {
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
                  УСТГАХ ХVСЭЛТ ({pendingDeleteChapters.length})
                </div>
                {pendingDeleteChapters.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#555' }}>Устгах хvсэлт алга ✓</div>
                ) : pendingDeleteChapters.map(ch => (
                  <div key={ch.id} style={{ padding: '12px 14px', background: '#1a1a1a', borderRadius: 10, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {ch.thumbnail_url && <img src={ch.thumbnail_url} alt="" style={{ width: 60, height: 40, borderRadius: 8, objectFit: 'cover', objectPosition: 'top' }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ch.mangas?.title || 'Манга'} — Бvлэг {ch.chapter_number}
                        </div>
                        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                          Хvссэн: {ch.users?.name || ch.users?.email || 'Хэрэглэгч'}{ch.delete_requested_at ? ` — ${formatMnDate(ch.delete_requested_at)}` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      <button onClick={() => askConfirm(`Бvлэг ${ch.chapter_number}-ийг бvрмөсөн устгах уу? Энэ vйлдлийг БУЦААХ БОЛОМЖГvЙ (зурагнууд R2-с ч устна).`, async () => {
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
                        ЗVГЭЭР, ХААХ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ШИНЭ: хэрэглэгчдийн бичсэн санал/асуудал/гаргалт хvсэлтvvд */}
            {adminTab === 'feedback' && canModerate && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* ШИНЭ (хэрэглэгчийн хvсэлт): уншигчдын ажилтдад илгээсэн "Admin
                  дэмжих" (дэмжих vг + од) мэдэгдлvvдийг admin vvнд байнга харж
                  болно (хонхны мэдэгдэл түр зуурынхаас гадна). */}
              {isAdmin && (
                <div style={{ background: '#111', borderRadius: 12, padding: '1.25rem 1.5rem', border: '1px solid #1e1e1e' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 4, height: 14, background: '#f5c518', borderRadius: 2 }} />
                    🙏 СvvЛИЙН ДЭМЖИХ vГС ({recentAppreciations.length})
                  </div>
                  {recentAppreciations.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#555' }}>Одоогоор алга</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                      {recentAppreciations.map(a => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#1a1a1a', borderRadius: 8, fontSize: 12 }}>
                          <Avatar url={a.sender?.avatar_url} letter={(a.sender?.name || '?')[0]} size={24} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ color: '#fff', fontWeight: 600 }}>{a.sender?.name || 'Хэрэглэгч'}</span>
                            <span style={{ color: '#666' }}> → {a.recipient?.name || 'Ажилтан'}</span>
                            {a.message && <div style={{ color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</div>}
                          </div>
                          <span style={{ color: '#f5c518', fontWeight: 700, flexShrink: 0 }}>⭐{a.amount}</span>
                          <span style={{ color: '#555', flexShrink: 0, fontSize: 11 }}>{formatMnDate(a.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                  💬 САНАЛ ХvСЭЛТ ({feedbackList.filter(f => f.status === 'open').length} хvлээгдэж буй)
                </div>
                {feedbackList.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#555' }}>Санал хvсэлт алга</div>
                ) : feedbackList.map(f => {
                  const catLabel = { suggestion: 'Санал / Асуудал', complaint: 'Санал / Асуудал', request: 'Манга санал болгох', team: '🤝 Баг нэгдэх хvсэлт', donation: '💛 Хандив' }[f.category] || f.category;
                  return (
                    <div key={f.id} style={{ padding: '12px 14px', background: '#1a1a1a', borderRadius: 10, marginBottom: 10, opacity: f.status === 'resolved' ? 0.55 : 1 }}>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ color: '#fff', fontWeight: 600 }}>{f.users?.name || 'Хэрэглэгч'}</span>
                        <span style={{ color: '#666' }}>({f.users?.email})</span>
                        <span style={{ background: 'rgba(139,0,0,0.2)', color: '#8B0000', fontWeight: 700, padding: '1px 8px', borderRadius: 8, fontSize: 10 }}>{catLabel}</span>
                        {f.manga_title && <span style={{ color: '#666' }}>· {f.manga_title}</span>}
                        <span style={{ marginLeft: 'auto', color: '#555' }}>{formatMnDate(f.created_at)}</span>
                      </div>
                      {f.image_url && <img src={f.image_url} alt="" style={{ width: 70, height: 92, objectFit: 'cover', borderRadius: 6, marginBottom: 8 }} />}
                      {f.link_url && (
                        <a href={f.link_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 12, color: '#4dabf7', marginBottom: 8, wordBreak: 'break-all' }}>
                          🔗 {f.link_url}
                        </a>
                      )}
                      <div style={{ fontSize: 13, color: '#ccc', background: '#111', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                        {f.message}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: (feedbackExpandedId === f.id) ? 10 : 0 }}>
                        {f.status === 'open' && (
                          <button onClick={() => resolveFeedback(f.id)}
                            style={{ background: '#222', color: '#aaa', border: '1px solid #333', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                            ШИЙДЭГДСЭН ГЭЖ ТЭМДЭГЛЭХ
                          </button>
                        )}
                        {/* ЗАСВАР (хэрэглэгчийн хvсэлт): admin-ий thread маягийн хариу бичих —
                            хэрэглэгчид тухайн санал дээр нь хариу бичихэд мэдэгдэл очно. */}
                        <button onClick={() => toggleFeedbackThread(f.id)}
                          style={{ background: 'rgba(139,0,0,0.15)', color: '#ff8080', border: '1px solid rgba(139,0,0,0.4)', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                          💬 {feedbackExpandedId === f.id ? 'Хаах' : 'Хариу бичих'}
                        </button>
                      </div>
                      {feedbackExpandedId === f.id && (
                        <div style={{ paddingTop: 10, borderTop: '1px solid #222' }}>
                          {feedbackThreadLoadingId === f.id ? (
                            <div style={{ fontSize: 11, color: '#555' }}>Ачаалж байна...</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                              {(feedbackThreads[f.id] || []).length === 0 ? (
                                <div style={{ fontSize: 11, color: '#555' }}>Хариу алга.</div>
                              ) : (feedbackThreads[f.id] || []).map(m => (
                                <div key={m.id} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, background: m.is_staff ? 'rgba(139,0,0,0.15)' : '#1a1a1a' }}>
                                  <span style={{ fontWeight: 700, color: m.is_staff ? '#ff8080' : '#999' }}>{m.is_staff ? '👑 Staff' : (m.users?.name || 'Хэрэглэгч')}:</span>{' '}
                                  <span style={{ color: '#ddd' }}>{m.message}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input value={feedbackReplyDrafts[f.id] || ''} onChange={e => setFeedbackReplyDrafts(prev => ({ ...prev, [f.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') sendFeedbackReply(f.id); }}
                              placeholder="Хариу бичих..."
                              style={{ flex: 1, minWidth: 0, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '7px 10px', color: '#fff', fontSize: 12, outline: 'none' }} />
                            <button disabled={feedbackReplySendingId === f.id} onClick={() => sendFeedbackReply(f.id)}
                              style={{ background: '#8B0000', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                              {feedbackReplySendingId === f.id ? '...' : 'ИЛГЭЭХ'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            )}

            {/* ШИНЭ: admin-ий VIP хоногоор шагнадаг даалгаврыг vvсгэх/удирдах таб */}
            {adminTab === 'tasks' && isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e', maxWidth: 480 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                    ШИНЭ ДААЛГАВАР
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ГАРЧИГ</div>
                    <input value={newTaskForm.title} onChange={e => setNewTaskForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Жишээ нь: 10 сэтгэгдэл бичээд 1 цэцэг аваарай!"
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ТАЙЛБАР (заавал биш)</div>
                    <input value={newTaskForm.description} onChange={e => setNewTaskForm(f => ({ ...f, description: e.target.value }))}
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ШААРДЛАГЫН ТӨРӨЛ</div>
                      <select value={newTaskForm.requirement_type} onChange={e => setNewTaskForm(f => ({ ...f, requirement_type: e.target.value }))}
                        style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                        <option value="comments">Сэтгэгдлийн тоо</option>
                        <option value="chapters_read">Уншсан бvлгийн тоо (нийт)</option>
                        <option value="manga_chapters">Тодорхой манганаас бvлэг унших</option>
                        <option value="manual">Гараар тэмдэглэх (admin батална)</option>
                      </select>
                    </div>
                    {newTaskForm.requirement_type !== 'manual' && (
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ШААРДЛАГАТАЙ ТОО</div>
                        <input type="number" min={1} value={newTaskForm.requirement_count}
                          onChange={e => setNewTaskForm(f => ({ ...f, requirement_count: e.target.value }))}
                          style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    )}
                  </div>
                  {/* ШИНЭ: "manga_chapters" төрөлд зорилтот манга сонгоно */}
                  {newTaskForm.requirement_type === 'manga_chapters' && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ЗОРИЛТОТ МАНГА</div>
                      <select value={newTaskForm.target_manga_id} onChange={e => setNewTaskForm(f => ({ ...f, target_manga_id: e.target.value }))}
                        style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                        <option value="">— сонгох —</option>
                        {dbMangas.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                      </select>
                    </div>
                  )}
                  {/* ЗАСВАР (хэрэглэгчийн хvсэлт): "manual" даалгавар БvГД заавал
                      баталгаажуулах зурагтай байхаар болсон тул (шалгалтгvйгээр
                      амархан "биелvvлсэн" гэж хуурч болдог байсныг хаав) сонголт хассан. */}
                  {newTaskForm.requirement_type === 'manual' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: '#888' }}>
                      📷 Баталгаажуулах зураг ЗААВАЛ шаардана
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ШАГНАЛЫН ТӨРӨЛ</div>
                      <select value={newTaskForm.reward_type} onChange={e => setNewTaskForm(f => ({ ...f, reward_type: e.target.value }))}
                        style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                        <option value="flowers">💐 Цэцэг</option>
                        <option value="vip_days">👑 VIP хоног</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{newTaskForm.reward_type === 'vip_days' ? 'ШАГНАЛ (VIP ХОНОГ)' : 'ШАГНАЛ (ЦЭЦЭГ 💐)'}</div>
                      {newTaskForm.reward_type === 'vip_days' ? (
                        <input type="number" min={1} value={newTaskForm.reward_vip_days}
                          onChange={e => setNewTaskForm(f => ({ ...f, reward_vip_days: e.target.value }))}
                          style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                      ) : (
                        <input type="number" min={1} value={newTaskForm.reward_flowers}
                          onChange={e => setNewTaskForm(f => ({ ...f, reward_flowers: e.target.value }))}
                          style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                      )}
                    </div>
                  </div>
                  {/* ШИНЭ: сонголттой дуусах хугацаа — тавибал хэрэглэгчийн Даалгавар
                      хуудсанд тухайн даалгаврын ард countdown timer харагдана. */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ДУУСАХ ХУГАЦАА (заавал биш)</div>
                    <input type="datetime-local" value={newTaskForm.expires_at}
                      onChange={e => setNewTaskForm(f => ({ ...f, expires_at: e.target.value }))}
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }} />
                  </div>
                  <button disabled={taskSaving} onClick={createTask}
                    style={{ width: '100%', background: taskSaving ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, cursor: taskSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13 }}>
                    {taskSaving ? 'ХАДГАЛЖ БАЙНА...' : 'ДААЛГАВАР vvСГЭХ'}
                  </button>
                </div>

                <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                    БvХ ДААЛГАВАР ({tasksList.length})
                  </div>
                  {tasksList.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#555' }}>Даалгавар vvсгээгvй байна</div>
                  ) : tasksList.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: '#1a1a1a', borderRadius: 10, marginBottom: 10, opacity: t.is_active ? 1 : 0.5 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          {t.requirement_type === 'comments' ? `Сэтгэгдэл: ${t.requirement_count}`
                            : t.requirement_type === 'chapters_read' ? `Уншсан бvлэг: ${t.requirement_count}`
                            : t.requirement_type === 'manga_chapters' ? `${dbMangas.find(m => m.id === t.target_manga_id)?.title || '?'}: ${t.requirement_count} бvлэг`
                            : 'Гараар + зураг'}
                          {' · '}{t.reward_type === 'vip_days' ? `👑 ${t.reward_vip_days || 1} хоног VIP` : `💐 ${t.reward_flowers} цэцэг`}
                          {!t.is_active && ' · ИДЭВХГvЙ'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button onClick={() => toggleTaskActive(t)}
                          style={{ background: '#222', color: '#aaa', border: '1px solid #333', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>
                          {t.is_active ? 'ИДЭВХГvЙ БОЛГОХ' : 'ИДЭВХЖvvЛЭХ'}
                        </button>
                        <span onClick={() => deleteTask(t)} title="Устгах"
                          style={{ fontSize: 15, color: '#8B0000', cursor: 'pointer', fontWeight: 700 }}>✕</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ШИНЭ: "гараар тэмдэглэсэн" даалгаврын баталгаажуулалт хvлээж буй хvсэлтvvд */}
                <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 4, height: 16, background: '#f5a623', borderRadius: 2 }} />
                    ⏳ БАТАЛГААЖУУЛАХ ХvСЭЛТ ({pendingTaskClaims.length})
                  </div>
                  {pendingTaskClaims.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#555' }}>Хvлээгдэж буй хvсэлт алга</div>
                  ) : pendingTaskClaims.map(c => {
                    const key = `${c.user_id}-${c.task_id}`;
                    const acting = taskClaimActingId === key;
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#1a1a1a', borderRadius: 10, marginBottom: 10 }}>
                        <Avatar url={c.users?.avatar_url} letter={(c.users?.name || '?')[0]} size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{c.users?.name || 'Хэрэглэгч'}</div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                            {c.tasks?.title} · {c.tasks?.reward_type === 'vip_days' ? `👑 ${c.tasks?.reward_vip_days || 1} хоног VIP` : `💐 ${c.tasks?.reward_flowers} цэцэг`}
                          </div>
                          {c.proof_image_urls && c.proof_image_urls.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                              {c.proof_image_urls.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
                                  <img src={url} alt="Баталгаажуулах зураг" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #2a2a2a' }} />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          <button disabled={acting} onClick={() => approveTaskClaim(c)}
                            style={{ background: acting ? '#555' : '#2e7d32', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, cursor: acting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 11 }}>
                            {acting ? '...' : 'БАТЛАХ'}
                          </button>
                          <button disabled={acting} onClick={() => rejectTaskClaim(c)}
                            style={{ background: '#222', color: '#aaa', border: '1px solid #333', padding: '6px 12px', borderRadius: 8, cursor: acting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 11 }}>
                            ТАТГАЛЗАХ
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ШИНЭ (хэрэглэгчийн хvсэлт): admin/moderator чатанд БvХ хэрэглэгч
                ашиглаж болох нийтийн стикер нэмэх/устгах таб */}
            {adminTab === 'stickers' && canModerate && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                  ЧАТНЫ НИЙТИЙН СТИКЕР ({giftStickers.length})
                </div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
                  Энд нэмсэн стикерvvдийг БvХ хэрэглэгч Нийтийн чат, Админуудын чат, хувийн зурвасандаа ашиглаж болно.
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {giftStickers.map(s => (
                    <div key={s.id} style={{ position: 'relative', width: 72, height: 72 }}>
                      <img src={s.url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, border: '1px solid #2a2a2a' }} />
                      <span onClick={() => deleteGiftSticker(s)} title="Устгах"
                        style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#8B0000', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</span>
                    </div>
                  ))}
                  <label style={{ width: 72, height: 72, borderRadius: 10, border: '1px dashed #333', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#555', fontSize: 24 }}>
                    {adminGiftStickerUploading ? '…' : '+'}
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadGiftSticker(f); }} />
                  </label>
                </div>
              </div>
            )}

            {/* ШИНЭ (хэрэглэгчийн хvсэлт): admin/moderator/editor хvссэн уншигчдаа
                vнэгvй цэцгээр (сард 10 хvртэл) дэмжих — нэрээр хайж сонгоод бэлэглэнэ. */}
            {adminTab === 'giftFlowers' && isStaff && (
              <div style={{ background: '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid #1e1e1e', maxWidth: 420 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: '#8B0000', borderRadius: 2 }} />
                  💐 ЦЭЦЭГ БЭЛЭГЛЭХ
                </div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
                  Уншигчдаа vнэгvй цэцгээр дэмжинэ (өөрийн балансаас хасагдахгvй) — сард нийт 10 хvртэл.
                </div>
                <input value={staffGiftSearchQuery} onChange={e => setStaffGiftSearchQuery(e.target.value)}
                  placeholder="Уншигчийн нэрээр хайх..."
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {staffGiftSearchResults.map(u => (
                    <div key={u.id} onClick={() => { setStaffGiftTarget(u); setStaffGiftAmount(1); setStaffGiftMessage(''); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: '#1a1a1a' }}>
                      <Avatar url={u.avatar_url} letter={(u.name || '?')[0]} size={30} />
                      <span style={{ fontSize: 13 }}>{u.name || 'Хэрэглэгч'}</span>
                    </div>
                  ))}
                  {staffGiftSearchQuery.trim() && staffGiftSearchResults.length === 0 && (
                    <div style={{ fontSize: 12, color: '#555', textAlign: 'center', padding: '1rem 0' }}>Олдсонгvй</div>
                  )}
                </div>
              </div>
            )}

            {/* ЗАСВАР #163: admin-ий статистик таб — цагаар идэвхжил + сvvлийн 1 сарын топ манга */}
            {adminTab === 'analytics' && isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* ШИНЭ (хэрэглэгчийн хvсэлт): энэ сарын орлого — admin "БАТЛАХ" дарж
                    approved болгосон хvсэлтvvдийн нийт vнийн дvн (тухайн vеийн
                    хямдралтай/vгvй vнээр, paid_price-аас). */}
                <div style={{ background: 'linear-gradient(135deg, rgba(139,0,0,0.18), rgba(139,0,0,0.05))', borderRadius: 12, padding: '1.5rem', border: '1px solid rgba(139,0,0,0.35)', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 32 }}>💰</span>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>{monthlyRevenue.toLocaleString()}₮</div>
                    <div style={{ fontSize: 13, color: '#aaa' }}>Энэ сарын орлого</div>
                  </div>
                </div>
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

        {/* POPUP — vнийг PLANS-аас уншина (ЗАСВАР #3: 6 сар одоо 25,000₮ гэж зөв гарна) */}
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
                    // ЗАСВАР #163: тvр зуурын хямдралтай vед popup дээр ч хямдарсан vнийг харуулна
                    const salePrice = SALE.prices[p.key];
                    const onSale = !!salePrice && Date.now() < SALE_ENDS_AT_MS;
                    return `${p.label} — ${onSale ? salePrice : p.price}`;
                  })()}
                </div>
              </div>

              <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '1.1rem', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: '0.75rem', textAlign: 'center', letterSpacing: 1 }}>ДАРААХ ДАНСАНД ШИЛЖVVЛНЭ VV</div>

                {[
                  { label: 'Банкны нэр', value: 'Хаан банк', copyable: false },
                  { label: 'Дансны дугаар', value: '350005005401075000', copyable: true },
                  { label: 'Хvлээн авагч', value: 'Хандсvрэн Энхнамуун', copyable: false },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: i < 2 ? '1px solid #2a2a2a' : 'none' }}>
                    <span style={{ fontSize: 11, color: '#666' }}>{item.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      {/* ЗАСВАР #89: "Хуулах" товчийг дугаарын ард биш урд тал руу шилжvvлэв */}
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
                    <span>Гvйлгээний утга дээрээ <strong style={{ color: '#fff' }}>gmail хаяг, сарын дугаараа</strong> бичээрэй <span style={{ color: '#8a92a6' }}>(жишээ нь: dolgoon@gmail.com 3)</span></span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#ccc', lineHeight: 1.5 }}>
                    <span style={{ color: '#f5a623', flexShrink: 0 }}>•</span>
                    <span>Гvйлгээ хийсэн баримтаа манай page рvv явуулбал эрх илvv хурдан идэвхжинэ</span>
                  </div>
                </div>
              </div>

              {/* ЗАСВАР #91: дарахад admin-д "Төлбөр төлсөн" хvсэлт vvсгэж илгээнэ */}
              <button disabled={paymentRequestSending} onClick={async () => {
                if (!currentUser || !selectedPlan) { setShowPopup(false); return; }
                setPaymentRequestSending(true);
                try {
                // ЗАСВАР #163: хямдралын vед хvсэлт илгээхэд хэдэн төгрөгөөр төлөхийг
                // хvлээж байсныг хадгална (хямдрал дуусаад ч тvvхэнд мэдэгдэхээр)
                // ЗАСВАР (хэрэглэгчийн хvсэлт): 1 хэрэглэгч зэрэг олон "ТӨЛБӨР ТӨЛСӨН"
                // хvсэлт vvсгэж болдог байсан (олон дарах, олон tab-аар) — admin талд
                // ижил хэрэглэгчийн 2+ хvсэлт "давхарлан" харагдаж будилаантай байсан
                // тул, аль хэдийн "pending" хvсэлттэй бол шинийг vvсгvvлэхгvй. (Race
                // condition-оос бvрэн хамгаалахын тулд DB талд ч migration_33.sql-ээр
                // давхцахгvй index нэмсэн — доор import хийж ажиллуулна уу.)
                const { data: existingPending } = await supabase.from('payment_requests')
                  .select('id').eq('user_id', currentUser.id).eq('status', 'pending').limit(1);
                if (existingPending && existingPending.length > 0) {
                  notify('Та аль хэдийн шалгагдаж буй төлбөрийн хvсэлттэй байна — admin шалгаж дуустал хvлээнэ vv.');
                  return;
                }
                const planForPrice = PLANS.find(p => p.key === selectedPlan);
                const salePriceForReq = SALE.prices[selectedPlan];
                const paidPrice = (!!salePriceForReq && Date.now() < SALE_ENDS_AT_MS)
                  ? salePriceForReq
                  : planForPrice?.price;
                const { error } = await supabase.from('payment_requests').insert({ user_id: currentUser.id, plan_key: selectedPlan, paid_price: paidPrice });
                if (error) {
                  // ЗАСВАР: DB талын unique index-ийн зөрчлийг (race condition-оор
                  // дээрх шалгалтыг мултарсан ховор тохиолдол) ч ойлгомжтой мессежээр харуулна.
                  if (/duplicate key|payment_requests_one_pending/.test(error.message || '')) {
                    notify('Та аль хэдийн шалгагдаж буй төлбөрийн хvсэлттэй байна — admin шалгаж дуустал хvлээнэ vv.');
                  } else {
                    notify('Алдаа: ' + error.message);
                  }
                  return;
                }
                notify('Хvсэлт илгээгдлээ! Admin шалгаад баталгаажуулах болно 🎉');
                setShowPopup(false);
                } catch (e) {
                  notify('Алдаа: ' + e.message);
                } finally {
                  setPaymentRequestSending(false);
                }
              }}
                style={{ width: '100%', padding: 13, border: 'none', borderRadius: 12, background: paymentRequestSending ? '#555' : '#8B0000', color: '#fff', fontWeight: 700, cursor: paymentRequestSending ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                {paymentRequestSending ? 'ИЛГЭЭЖ БАЙНА...' : 'ТӨЛБӨР ТӨЛСӨН'}
              </button>

            </div>
          </div>
        )}

        {/* ШИНЭ: сонгосон бvлгийн зургуудыг бvлэг уншиж байгаа мэт бvтнээр нь харах цонх */}
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
                        style={{ position: 'relative', zIndex: 2, width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: '#000', touchAction: 'none', cursor: 'grab', border: '3px solid #f5a623', boxSizing: 'border-box' }}>
                        <img src={chapterFileUrls[i]} alt={`${i + 1}`} draggable={false}
                          style={{
                            position: 'absolute', left: 0, top: chapterCropPanY, opacity: chapterCropBusy ? 0.4 : 1,
                            ...(chapterCropFrameWidth && chapterCropImgSize.w && chapterCropImgSize.h ? {
                              width: `${chapterCropFrameWidth}px`,
                              height: `${chapterCropFrameWidth * (chapterCropImgSize.h / chapterCropImgSize.w)}px`,
                            } : { width: '100%' }),
                          }} />
                        {/* ЗvvН ДЭЭД буланд байрлах жижиг тэмдэг — vvн дээр дарахад л ЭНЭ
                            зурагны тайралт хадгалагдана (хэрэглэгчийн хvсэлтээр дээд/доод
                            захын том тэмдгvvдийг зvvн дээд буланд байрлах ганц тэмдгээр сольсон). */}
                        <span onPointerDown={e => e.stopPropagation()} onClick={confirmChapterCrop} title="Энэ тайралтыг хадгалах"
                          style={{ position: 'absolute', left: 8, top: 8, zIndex: 3, background: '#f5a623', color: '#000', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
                          <IconCheck size={16} color="#000" />
                        </span>
                      </div>
                    );
                  }
                  if (isSelected) {
                    return (
                      <div key={i} style={{ position: 'relative', zIndex: 2, border: '3px solid #f5a623', boxSizing: 'border-box' }}>
                        <img src={chapterFileUrls[i]} alt={`${i + 1}`} style={{ width: '100%', display: 'block', opacity: (chapterEditBusy || chapterCropBusy) ? 0.4 : 1 }} />
                      </div>
                    );
                  }
                  return (
                    <div key={i} onClick={() => {
                      setChapterEditIndex(i);
                      setChapterCropActive(false);
                      setChapterCropPanY(0);
                    }} style={{ position: 'relative', cursor: 'pointer' }}>
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
                  <button disabled={chapterCropBusy} onClick={chapterCropActive ? closeChapterCrop : openChapterCrop} title={chapterCropActive ? 'Цуцлах' : 'Тайрах'}
                    style={{ width: 38, height: 38, borderRadius: 8, border: chapterCropActive ? '1px solid #f5a623' : '1px solid #2a2a2a', background: chapterCropActive ? 'rgba(245,166,35,0.15)' : '#1a1a1a', color: chapterCropActive ? '#f5a623' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: chapterCropBusy ? 'wait' : 'pointer' }}>
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

        {/* ШИНЭ (хэрэглэгчийн хvсэлт): admin/moderator/editor хэрэглэгчид
            хvссэн уншигчдаа vнэгvй цэцгээр дэмжих — admin-ий тусгай хуудсанд
            хайж сонгосноор, эсвэл сэтгэгдэл бичсэн хvний профайл дээрх 💐
            дарж шууд ГЛОБАЛЬ (аль ч хуудаснаас) нээгддэг цонх. */}
        {staffGiftTarget && (
          <>
            <div onClick={() => setStaffGiftTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, cursor: 'pointer' }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: 300, maxWidth: '90vw', background: 'rgba(17,17,17,0.97)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '1.25rem', zIndex: 401,
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)', textAlign: 'center',
            }}>
              <Avatar url={staffGiftTarget.avatar_url} letter={(staffGiftTarget.name || '?')[0]} size={48} />
              <div style={{ fontWeight: 800, fontSize: 14, marginTop: 8, marginBottom: 4 }}>{staffGiftTarget.name || 'Хэрэглэгч'}-д цэцэг бэлэглэх</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 14 }}>Энэ сард vлдсэн vнэгvй хязгаар: {staffGiftQuotaRemaining}/10</div>
              <input type="number" min={1} max={staffGiftQuotaRemaining || 1} value={staffGiftAmount}
                onChange={e => setStaffGiftAmount(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box', textAlign: 'center', marginBottom: 10 }} />
              <textarea value={staffGiftMessage} onChange={e => setStaffGiftMessage(e.target.value.slice(0, 300))} rows={3}
                placeholder="Дэмжих vг (заавал биш)"
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }} />
              <button disabled={staffGiftSending || staffGiftQuotaRemaining <= 0} onClick={sendStaffGift}
                style={{ width: '100%', background: staffGiftQuotaRemaining > 0 ? '#8B0000' : '#555', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: (staffGiftSending || staffGiftQuotaRemaining <= 0) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13 }}>
                {staffGiftSending ? 'БЭЛЭГЛЭЖ БАЙНА...' : staffGiftQuotaRemaining <= 0 ? 'ЭНЭ САРЫН ХЯЗГААРТ ХVРСЭН' : 'БЭЛЭГЛЭХ'}
              </button>
            </div>
          </>
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
                Хэрэв насанд хvрээгvй бол цааш vзэхийг зөвлөхгvй. Vvнээс vvдэх
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
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>POSTER ЗУРАГ (заавал биш — солихгvй бол хуучнаараа vлдэнэ)</div>
                <input type="file" accept="image/*" onChange={async e => {
                  const rawFile = e.target.files[0];
                  e.target.value = '';
                  if (!rawFile) { setEditPosterFile(null); return; }
                  try { setEditPosterFile(await normalizeImageFile(rawFile)); } catch (err) { notify(err.message); }
                }}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БАННЕР ЗУРАГ (заавал биш — солихгvй бол хуучнаараа vлдэнэ)</div>
                <input type="file" accept="image/*" onChange={async e => {
                  const rawFile = e.target.files[0];
                  e.target.value = '';
                  if (!rawFile) { setEditBannerFile(null); return; }
                  try { setEditBannerFile(await normalizeImageFile(rawFile)); } catch (err) { notify(err.message); }
                }}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              {/* ШИНЭ (хэрэглэгчийн хvсэлт): зөвхөн admin "Бvгдийн шаана" хязгаарлалтыг
                  тавьж/цуцалж (Нийтэд нээж) болно. */}
              {isAdmin && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.5rem', cursor: 'pointer', fontSize: 13, color: '#f5c518' }}>
                  <input type="checkbox" checked={editMangaForm.restricted} onChange={e => setEditMangaForm({ ...editMangaForm, restricted: e.target.checked })}
                    style={{ accentColor: '#8B0000', width: 16, height: 16 }} />
                  👑 Зөвхөн "Бvгдийн шаана" эрхтэй хvмvvст харуулах {editMangaForm.restricted ? '(идэвхтэй — цуцлахад Нийтэд нээгдэнэ)' : '(Нийтэд нээлттэй)'}
                </label>
              )}

              <button disabled={editSaving} onClick={async () => {
                if (!editMangaForm.title.trim()) { notify('Гарчиг оруулна уу!'); return; }
                const badFile = [editPosterFile, editBannerFile].filter(Boolean).map(validateImageFile).find(Boolean);
                if (badFile) { notify(badFile); return; }
                // ЗАСВАР #118: төрлийн шалгалтыг setEditSaving(true)-ийн ӨМНӨ зөөв —
                // өмнө нь шалгалт унахад editSaving true хэвээр vлдэж, товч
                // "ХАДГАЛЖ БАЙНА..." дээр vvрд гацдаг байсан.
                if (editMangaForm.genres.length === 0) { notify('Дор хаяж 1 төрөл сонгоно уу!'); return; }
                setEditSaving(true);
                try {
                const updates = {
                  title: editMangaForm.title,
                  description: editMangaForm.desc,
                  genres: editMangaForm.genres,
                  status: editMangaForm.status,
                  ...(isAdmin ? { restricted_role: editMangaForm.restricted ? 'shaana' : null } : {}),
                };
                if (editPosterFile) {
                  const fileExt = editPosterFile.name.split('.').pop();
                  const fileName = `${Date.now()}.${fileExt}`;
                  const oldPosterUrl = editManga.poster;
                  try {
                    updates.poster_url = await uploadToR2(editPosterFile, `posters/${fileName}`);
                  } catch (upErr) { notify('Poster upload алдаа: ' + upErr.message); return; }
                  // ЗАСВАР #163: poster солиход хуучин файл R2-д мөнхөд орхигддог байсныг засав
                  if (oldPosterUrl) { try { await deleteFromR2([oldPosterUrl]); } catch { /* хор хөнөөлгvй */ } }
                }
                if (editBannerFile) {
                  const fileExt = editBannerFile.name.split('.').pop();
                  const fileName = `${Date.now()}-banner.${fileExt}`;
                  const oldBannerUrl = editManga.banner_url;
                  try {
                    updates.banner_url = await uploadToR2(editBannerFile, `banners/${fileName}`);
                  } catch (upErr) { notify('Баннер upload алдаа: ' + upErr.message); return; }
                  if (oldBannerUrl) { try { await deleteFromR2([oldBannerUrl]); } catch { /* хор хөнөөлгvй */ } }
                }
                const { error } = await supabase.from('mangas').update(updates).eq('id', editManga.id);
                if (error) { notify('Алдаа: ' + error.message); return; }
                setSelected(prev => prev && prev.id === editManga.id ? { ...prev, ...updates, desc: updates.description, poster: updates.poster_url || prev.poster, banner_url: updates.banner_url || prev.banner_url } : prev);
                fetchMangas();
                setEditManga(null);
                notify('Манга шинэчлэгдлээ! 🎉');
                } catch (e) {
                  notify('Алдаа: ' + e.message);
                } finally {
                  setEditSaving(false);
                }
              }} style={{ width: '100%', background: editSaving ? '#555' : '#8B0000', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer', fontSize: 15 }}>
                {editSaving ? 'ХАДГАЛЖ БАЙНА...' : 'ХАДГАЛАХ'}
              </button>
            </div>
          </div>
        )}

        {/* ЗАСВАР #124: БVЛЭГ ЗАСАХ цонх — cover зураг солих, хуудсын зураг нэмэх/хасах/дараалал солих */}
        {editChapter && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }}>
            <div style={{ width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#111', border: '1px solid #222', borderRadius: 20, padding: '2rem', position: 'relative', boxSizing: 'border-box' }}>
              <span onClick={() => setEditChapter(null)} style={{ position: 'absolute', top: 16, right: 20, cursor: 'pointer', fontSize: 20, color: '#555' }}>✕</span>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: '1.5rem' }}>БVЛЭГ ЗАСАХ</div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БVЛГИЙН ДУГААР</div>
                  <input type="number" value={editChapterForm.chapter_number} onChange={e => setEditChapterForm({ ...editChapterForm, chapter_number: e.target.value })}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>БVЛГИЙН НЭР</div>
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
                VIP бvлэг (зөвхөн эрхтэй хэрэглэгч уншина)
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
                <input type="file" accept="image/*" onChange={async e => {
                  const rawFile = e.target.files[0];
                  e.target.value = '';
                  if (!rawFile) { setEditChapterCoverFile(null); return; }
                  try { setEditChapterCoverFile(await normalizeImageFile(rawFile)); } catch (err) { notify(err.message); }
                }}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: '#888' }}>ОДОО БАЙГАА ЗУРАГНУУД ({editChapterExistingImages.length})</div>
                  {/* ЗАСВАР #161: нэмэх цонхны adил бvтэн харах (preview) товч */}
                  {(editChapterExistingImages.length > 0 || editChapterNewFiles.length > 0) && (
                    <button onClick={() => setEditChapterPreviewOpen(true)}
                      style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      🖼️ БVТЭН ХАРАХ
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
                  onChange={async e => {
                    const picked = Array.from(e.target.files);
                    e.target.value = '';
                    const normalized = [];
                    const badNames = [];
                    for (const f of picked) {
                      // eslint-disable-next-line no-await-in-loop
                      try {
                        const norm = await normalizeImageFile(f);
                        // ЗАСВАР #241: decode шалгалт унасан ч файлыг орхихгvй, зөвхөн
                        // урьдчилан анхааруулна (доорх upload гогцоо эх хэвээр оруулна).
                        if (!(await checkImageDecodable(norm))) badNames.push(f.name || 'нэргvй зураг');
                        normalized.push(norm);
                      } catch (err) { notify(err.message); }
                    }
                    if (badNames.length > 0) {
                      notify(`Анхаар: дараах зураг(ууд) энэ дэлгэцэн дээр урьдчилан харагдахгvй байж болзошгvй, гэхдээ upload хийхэд хуудас нь дутахгvй (эх хэвээрээ орно): ${badNames.join(', ')}`);
                    }
                    setEditChapterNewFiles(prev => [...prev, ...normalized]);
                  }}
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
                // ЗАСВАР (хэрэглэгчийн хvсэлт — алдаа): add-chapter урсгалтай адил,
                // эхлэхээс өмнө session/token-ыг урьдчилан сэргээнэ.
                const { data: { session: freshEditSession } } = await supabase.auth.getSession();
                if (!freshEditSession) { notify('Нэвтрэлтийн хугацаа дууссан байна — дахин нэвтрээд оролдоно уу.'); return; }
                setEditChapterSaving(true);
                setEditChapterSaveProgress(0);
                try {

                // ШИНЭ: upload эхлэхээс өмнө шинэ зургуудыг БvГДИЙГ нь split+optimize
                // хийж, нийт хэдэн upload хийгдэхийг (cover + хуудас бvр) урьдчилж
                // мэдэж авна — ингэснээр доор progress (хувь) тооцох боломжтой болно
                // (add-chapter урсгалтай адил хандлага).
                let expandedNewFiles = [];
                {
                  // ЗАСВАР #241 (хэрэглэгчийн гомдол — Samsung S22 дээр зарим
                  // screenshot/өөр апп-аас хуулсан зураг decode хийгдэхгvй): add-chapter
                  // урсгалтай адил, файл бvрийг ТУСДАА алдаанаас хамгаалж, эвдэрсэн
                  // файлыг нэрээр нь мэдэгдээд алгасаж, vлдсэн хэвийн зурагтай нь
                  // vргэлжлvvлнэ (нэг файл БvХ upload-ыг зогсоохгvй).
                  const failedNames = [];
                  const rawFallbackNames = [];
                  for (const file of editChapterNewFiles) {
                    try {
                      // ЗАСВАР #238 (код шинжилгээ): нэмэх (add-chapter) урсгалтай адил
                      // шалтгаанаар (нарийхан боловч маш урт зурагт optimize өөрөө бvтэн
                      // өндрөөрөө canvas зурахыг оролдож iOS Safari дээр toBlob() null
                      // буцаадаг байсан) — ЭХЛЭЭД split (6000px-с урт бол хэсэглэх), ДАРАА
                      // нь хэсэг бvрийг optimize (1200px рvv багасгаж WebP болгох) хийнэ.
                      // eslint-disable-next-line no-await-in-loop
                      const splitParts = await splitTallImageFile(file, 6000);
                      for (const p of splitParts) {
                        // eslint-disable-next-line no-await-in-loop
                        expandedNewFiles.push(await optimizeImageFile(p.file, 1200));
                      }
                    } catch (e) {
                      // ЗАСВАР #241 (хэрэглэгчийн хvсэлт — add-chapter урсгалтай адил):
                      // хэт өндөр нягтралтай зургийг л алгасна, бусад decode-ийн алдааг
                      // (жишээ нь тухайн утсан дээр л гарах "could not be decoded")
                      // БОЛОВСРУУЛАЛГvй эх хэвээр нь upload-д оруулна — хуудас дутахгvй.
                      if (/хэт өндөр нягтралтай/.test(e.message || '')) {
                        failedNames.push(file.name || 'нэргvй зураг');
                      } else {
                        expandedNewFiles.push({ file, width: 0, height: 0 });
                        rawFallbackNames.push(file.name || 'нэргvй зураг');
                      }
                    }
                  }
                  if (failedNames.length > 0) {
                    notify(`Алдаа: дараах зураг(ууд) хэт өндөр нягтралтай тул орсонгvй (жижигрvvлж дахин оруулна уу): ${failedNames.join(', ')}`);
                  }
                  if (rawFallbackNames.length > 0) {
                    notify(`Анхаар: дараах зураг(ууд) энэ утсан дээр боловсруулагдаагvй ЭХ хэвээрээ орсон (хуудас дутахгvй, гэхдээ жижигрvvлэгдээгvй/webp болоогvй): ${rawFallbackNames.join(', ')}`);
                  }
                  if (editChapterExistingImages.length === 0 && expandedNewFiles.length === 0) {
                    setEditChapterSaving(false);
                    return;
                  }
                }

                const totalUploads = (editChapterCoverFile ? 1 : 0) + expandedNewFiles.length;
                let doneUploads = 0;
                const markUploadDone = () => {
                  doneUploads += 1;
                  setEditChapterSaveProgress(totalUploads > 0 ? Math.round((doneUploads / totalUploads) * 100) : 0);
                };

                // ЗАСВАР #145: гарах цагийг өөрчилсөн эсэхийг анхны утгатай нь харьцуулна
                // ЗАСВАР #196 (код шинжилгээ): STRING-ээр (!==) харьцуулдаг байсан тул
                // DB-ээс ирсэн (Postgres, "+00:00" төгсгөлтэй) болон энд шинээр
                // vvсгэсэн (JS Date.toISOString(), "Z" төгсгөлтэй) хэлбэрvvд ЯГ НЭГ
                // мөчийг илэрхийлсэн ч текстээрээ өөр байдаг тул юу ч өөрчлөхгvй
                // хадгалахад ч publishAtChanged=true болж, бvлэг "ШИНЭ БvЛЭГ" мөрөнд
                // дахин гардаг байв. Одоо ЦАГИЙН УТГААР (getTime()) харьцуулна.
                const newPublishAtIso = editChapterForm.publish_at ? new Date(editChapterForm.publish_at).toISOString() : null;
                const oldPublishAtTime = editChapterInitialPublishAt.current ? new Date(editChapterInitialPublishAt.current).getTime() : null;
                const newPublishAtTime = newPublishAtIso ? new Date(newPublishAtIso).getTime() : null;
                const publishAtChanged = oldPublishAtTime !== newPublishAtTime;
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
                // ЗАСВАР #184 (код шинжилгээ): "ШИНЭ БvЛЭГ" нэмэх урсгал шинэ зураг бvгд
                // амжилттай орох хvртэл is_hidden:true болгодог байсан ч, БvЛЭГ ЗАСАХ
                // (энд) шинэ зураг upload хийхдээ бvлэг ил хэвээр vлдэж, хагас (дутуу)
                // хуудастай харагддаг цоорхой байв. Шинэ файл нэмж байгаа vед л
                // тvр нуугаад, upload бvгд амжилттай болсны дараа анхны төлөвт нь
                // (staff зориудаар нуусан бол нуугдмал хэвээр) буцаана.
                const originalIsHidden = editChapter.is_hidden || false;
                const isAddingNewFiles = editChapterNewFiles.length > 0;
                if (isAddingNewFiles) updates.is_hidden = true;
                if (editChapterCoverFile) {
                  const ext = editChapterCoverFile.name.split('.').pop();
                  const oldThumbnailUrl = editChapter.thumbnail_url;
                  try {
                    // ЗАСВАР #194: Date.now() таамаглаж болохуйц тул crypto.randomUUID()
                    updates.thumbnail_url = await uploadToR2(editChapterCoverFile, `chapters/${editChapter.id}/${crypto.randomUUID()}-cover.${ext}`);
                  } catch (e) { notify('Cover upload алдаа: ' + e.message); return; }
                  markUploadDone();
                  // ЗАСВАР #163: cover солиход хуучин файл R2-д мөнхөд орхигддог байсныг засав
                  if (oldThumbnailUrl) { try { await deleteFromR2([oldThumbnailUrl]); } catch { /* хор хөнөөлгvй, orphan хэвээр vлдэнэ */ } }
                }

                const { error: chError } = await supabase.from('chapters').update(updates).eq('id', editChapter.id);
                if (chError) { notify('Алдаа: ' + chError.message); return; }

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
                // (split+optimize нь дээр, upload эхлэхээс өмнө нэг мөр дор хийгдсэн —
                // expandedNewFiles-г ашиглана, энд дахин хийхгvй).
                let nextPage = editChapterExistingImages.length + 1;
                let uploadFailed = false;
                for (const { file: part, width: partWidth, height: partHeight } of expandedNewFiles) {
                  const ext = part.name.split('.').pop();
                  try {
                    // ЗАСВАР #194: Date.now()-${nextPage} дараалсан/таамаглаж болохуйц тул crypto.randomUUID()
                    const url = await uploadToR2(part, `chapters/${editChapter.id}/${crypto.randomUUID()}.${ext}`);
                    await supabase.from('chapter_images').insert({ chapter_id: editChapter.id, image_url: url, page_number: nextPage, width: partWidth || null, height: partHeight || null });
                    nextPage++;
                  } catch (e) { notify(`Зураг upload алдаа: ${e.message}`); uploadFailed = true; }
                  markUploadDone();
                }

                // ЗАСВАР #184: шинэ зураг нэмсэн бол л (эсрэг тохиолдолд is_hidden
                // хөндөөгvй тул шаардлагагvй) эцсийн is_hidden төлөвийг тогтооно —
                // бvгд амжилттай бол анхны төлөвт буцаана, аль нэг нь амжилтгvй
                // бол (дутуу хуудастайгаар ил гарахаас сэргийлж) нуугдмал vлдээнэ.
                if (isAddingNewFiles) {
                  const finalIsHidden = uploadFailed ? true : originalIsHidden;
                  await supabase.from('chapters').update({ is_hidden: finalIsHidden }).eq('id', editChapter.id);
                  updates.is_hidden = finalIsHidden;
                }

                setDbChapters(prev => prev.map(x => x.id === editChapter.id ? { ...x, ...updates } : x));
                setEditChapter(null);
                notify(uploadFailed
                  ? '⚠️ Зарим зураг амжилтгvй боллоо — бvлгийг "нуугдсан" төлөвтэй vлдээлээ, дутуу хуудсаа дахин ЗАСАХ-аар нөхнө vv'
                  : 'Бvлэг шинэчлэгдлээ! 🎉');
                } catch (e) {
                  notify('Алдаа: ' + e.message);
                } finally {
                  setEditChapterSaving(false);
                  setEditChapterSaveProgress(0);
                }
              }} style={{
                width: '100%', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 700,
                cursor: editChapterSaving ? 'not-allowed' : 'pointer', fontSize: 15,
                // ШИНЭ: бvлэг нэмэхтэй адил, upload хийж байх vед хэдэн хувь дуусснаа
                // товч дээр өнгөөр (progress bar шиг) болон тоогоор хамт харуулна.
                background: editChapterSaving
                  ? `linear-gradient(to right, #8B0000 ${editChapterSaveProgress}%, #555 ${editChapterSaveProgress}%)`
                  : '#8B0000',
              }}>
                {editChapterSaving ? `ХАДГАЛЖ БАЙНА... ${editChapterSaveProgress}%` : 'ХАДГАЛАХ'}
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
                  if (isSelected && editChapterCropActive) {
                    return (
                      <div key={img.id} ref={editChapterCropFrameRef} onPointerDown={startEditChapterCropPanDrag}
                        style={{ position: 'relative', zIndex: 2, width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: '#000', touchAction: 'none', cursor: 'grab', border: '3px solid #f5a623', boxSizing: 'border-box' }}>
                        <img src={img.image_url} alt={`${i + 1}`} draggable={false}
                          style={{
                            position: 'absolute', left: 0, top: editChapterCropPanY, opacity: editChapterEditBusy ? 0.4 : 1,
                            ...(editChapterCropFrameWidth && editChapterCropImgSize.w && editChapterCropImgSize.h ? {
                              width: `${editChapterCropFrameWidth}px`,
                              height: `${editChapterCropFrameWidth * (editChapterCropImgSize.h / editChapterCropImgSize.w)}px`,
                            } : { width: '100%' }),
                          }} />
                        <span onPointerDown={e => e.stopPropagation()} onClick={confirmEditChapterCrop} title="Энэ тайралтыг хадгалах"
                          style={{ position: 'absolute', left: 8, top: 8, zIndex: 3, background: '#f5a623', color: '#000', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
                          <IconCheck size={16} color="#000" />
                        </span>
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
                    <div key={img.id} onClick={() => {
                      setEditChapterEditTarget({ kind: 'existing', index: i });
                      setEditChapterCropActive(false);
                      setEditChapterCropPanY(0);
                    }} style={{ position: 'relative', cursor: 'pointer' }}>
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
                  if (isSelected && editChapterCropActive) {
                    return (
                      <div key={`new${i}`} ref={editChapterCropFrameRef} onPointerDown={startEditChapterCropPanDrag}
                        style={{ position: 'relative', zIndex: 2, width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: '#000', touchAction: 'none', cursor: 'grab', border: '3px solid #f5a623', boxSizing: 'border-box' }}>
                        <img src={editChapterNewFileUrls[i]} alt={`${editChapterExistingImages.length + i + 1}`} draggable={false}
                          style={{
                            position: 'absolute', left: 0, top: editChapterCropPanY, opacity: editChapterEditBusy ? 0.4 : 1,
                            ...(editChapterCropFrameWidth && editChapterCropImgSize.w && editChapterCropImgSize.h ? {
                              width: `${editChapterCropFrameWidth}px`,
                              height: `${editChapterCropFrameWidth * (editChapterCropImgSize.h / editChapterCropImgSize.w)}px`,
                            } : { width: '100%' }),
                          }} />
                        <span onPointerDown={e => e.stopPropagation()} onClick={confirmEditChapterCrop} title="Энэ тайралтыг хадгалах"
                          style={{ position: 'absolute', left: 8, top: 8, zIndex: 3, background: '#f5a623', color: '#000', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
                          <IconCheck size={16} color="#000" />
                        </span>
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
                    <div key={`new${i}`} onClick={() => {
                      setEditChapterEditTarget({ kind: 'new', index: i });
                      setEditChapterCropActive(false);
                      setEditChapterCropPanY(0);
                    }} style={{ position: 'relative', cursor: 'pointer' }}>
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
                  <button disabled={editChapterEditBusy} onClick={editChapterCropActive ? closeEditChapterCrop : openEditChapterCrop} title={editChapterCropActive ? 'Цуцлах' : 'Тайрах'}
                    style={{ width: 38, height: 38, borderRadius: 8, border: editChapterCropActive ? '1px solid #f5a623' : '1px solid #2a2a2a', background: editChapterCropActive ? 'rgba(245,166,35,0.15)' : '#1a1a1a', color: editChapterCropActive ? '#f5a623' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: editChapterEditBusy ? 'wait' : 'pointer' }}>
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

      {/* ШИНЭ: утасны доод "pill" navigation bar — тодорхой 6 хэсэг рvv шууд
          хандах бvдvvн (thumb-friendly) навигаци. Reader (бvтэн дэлгэцийн
          унших) хуудсанд саад болохгvйн тулд харагдахгvй. */}
      {/* ЗАСВАР: SearchOverlay-ийн zIndex (200) энэ bottom nav-ийн zIndex (250)-ээс
          бага тул хайлт нээлттэй vед bottom nav vvний дээгvvр "давхарлагдаж"
          харагдахаас сэргийлж, хайлт нээлттэй vед бvр мөсөн нуудаг болгов
          (хайлтад зориулсан tab-ыг эндээс хассан — топбарт хайлтын icon аль
          хэдийн байгаа тул давхардуулахгvй, оронд нь "Хуваарь"-ыг тавив). */}
      {isMobile && page !== 'reader' && !searchOpen && (() => {
        {/* ЗАСВАР: өмнө нь харгалзах tab-гvй ЯМАР Ч хуудсанд (жишээ нь Профайл
            цэснээс "Миний сан" сонгоход шилждэг 'library' хуудас) "0" (Нvvр)
            рvv буцаж, идэвхтэй хvрээ буруугаар Нvvр дээр vлддэг байсан — мөн
            цэс хаагдсаны дараа ч profileOpen/profileMenuOpen false болсон
            хойно шинэ хуудсыг тусгаагvй тул хvрээ хуучин байрандаа "царцдаг"
            мэт санагддаг байв. Одоо ЗӨВХӨН яг таарч буй tab-д л хvрээ
            харагдаж, харгалзах tab-гvй хуудсанд (жишээ нь library) ЯМАР Ч
            tab тодрохгvй (null) болгов. */}
        const activeIndex = (profileMenuOpen || profileOpen) ? 5
          : page === 'home' ? 0
          : page === 'schedule' ? 1
          : page === 'all' ? 2
          : page === 'vip' ? 3
          : page === 'reels' ? 4
          : null;
        // ЗАСВАР: идэвхтэй tab БvТЭН улаан дэвсгэртэй pill биш болов — зөвхөн
        // тухайн (сонгогдсон) нэг tab дээр л (бvгдэд биш) гялалзсан (амьсгалдаг)
        // улаан ХvРЭЭ (border/ring) харагдана, дэвсгэр нь бараг тунгалаг хэвээр.
        const navItemStyle = active => ({
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
          padding: '9px 2px', borderRadius: 14, cursor: 'pointer', color: active ? '#fff' : '#888',
          background: active ? 'rgba(139,0,0,0.12)' : 'transparent',
          border: active ? '1px solid rgba(139,0,0,0.6)' : '1px solid transparent',
          transition: 'background 0.25s ease, color 0.25s ease, border-color 0.25s ease',
        });
        // ЗАСВАР: өмнө нь Нvvр/Хуваарь/Гаргалт/Эрх авах/Reels tab бvр зөвхөн
        // setPage(...) дуудаад, profileOpen/profileMenuOpen-ыг хэвээр (жишээ
        // нь нээлттэй) vлдээдэг байсан тул — Профайл цэс/панель нээлттэй vед
        // өөр tab руу шилжвэл активIndex vргэлж 5 (Профайл) хэвнэвч, шинэ
        // хуудас руу орсон ч хvрээ "профайл дээрээ царцдаг" алдаа vvсгэж
        // байв. Одоо ЯМАР ч vндсэн tab руу шилжихэд эдгээрийг ЗААВАЛ хааж
        // (false болгож) орно.
        const navigateTo = p => { setPreviousPage(page); setPage(p); setProfileOpen(false); setProfileMenuOpen(false); };
        return (
          <div style={{
            position: 'fixed', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 250,
            width: 'calc(100vw - 16px)', maxWidth: 460, display: 'flex', gap: 2, padding: 6,
            background: 'rgba(15,15,15,0.78)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 22,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div onClick={() => navigateTo('home')} className={activeIndex === 0 ? 'nav-item-glow' : ''} style={navItemStyle(activeIndex === 0)}>
              <IconHome />
              <span style={{ fontSize: 9.5, fontWeight: 600 }}>Нvvр</span>
            </div>
            <div onClick={() => navigateTo('schedule')} className={activeIndex === 1 ? 'nav-item-glow' : ''} style={navItemStyle(activeIndex === 1)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span style={{ fontSize: 9.5, fontWeight: 600 }}>Хуваарь</span>
            </div>
            <div onClick={() => navigateTo('all')} className={activeIndex === 2 ? 'nav-item-glow' : ''} style={navItemStyle(activeIndex === 2)}>
              <IconGrid />
              <span style={{ fontSize: 9.5, fontWeight: 600 }}>Гаргалт</span>
            </div>
            <div onClick={() => navigateTo('vip')} className={activeIndex === 3 ? 'nav-item-glow' : ''} style={navItemStyle(activeIndex === 3)}>
              <IconCrown size={16} />
              <span style={{ fontSize: 9.5, fontWeight: 600 }}>Эрх авах</span>
            </div>
            <div onClick={() => navigateTo('reels')} className={activeIndex === 4 ? 'nav-item-glow' : ''} style={navItemStyle(activeIndex === 4)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>
              <span style={{ fontSize: 9.5, fontWeight: 600 }}>Reels</span>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <div onClick={() => currentUser ? setProfileMenuOpen(o => !o) : setAuthPage('login')} className={activeIndex === 5 ? 'nav-item-glow' : ''} style={navItemStyle(activeIndex === 5)}>
                {currentUser ? (
                  <Avatar url={userProfile?.avatar_url} letter={currentUser.email[0]} size={17} isVip={hasActiveVip} />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>
                )}
                <span style={{ fontSize: 9.5, fontWeight: 600 }}>{currentUser ? 'Профайл' : 'Нэвтрэх'}</span>
              </div>

              {/* ШИНЭ: "Профайл" tab дээр дарахад дээшээ нээгддэг богино цэс */}
              {profileMenuOpen && currentUser && (
                <>
                  {/* ЗАСВАР: "Профайл" wrapper нь position:relative тул (бусад tab
                      static) CSS stacking дvрмээр vvний доtorх энэ backdrop бусад
                      tab-уудын дээгvvр (Хуваарь г.м.) "давхарлагдаж" тэдгээрийг
                      дарахад зөвхөн цэсийг хаагаад, БОДИТООР тэр tab руу шилждэггvй
                      алдаа vvсгэж байсан. inset:0-ийн оронд зөвхөн навигацийн
                      самбараас дээших хэсгийг л (bottom:90) хамруулж, бусад tab-ын
                      талбайг огт дарахгvй болгов. */}
                  <div onClick={() => setProfileMenuOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 90, zIndex: 251 }} />
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 10px)', right: 0, width: 190, zIndex: 252,
                    background: 'rgba(17,17,17,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: 6,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 24px rgba(139,0,0,0.12)',
                  }}>
                    {[
                      {
                        label: 'Миний сан', onClick: () => navigateTo('library'),
                        icon: <IconBookmark />,
                      },
                      {
                        label: 'Даалгавар', onClick: () => navigateTo('tasks'),
                        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M9 12l2 2 4-4"/></svg>,
                      },
                      {
                        label: 'Санал хvсэлт', onClick: () => navigateTo('feedback'),
                        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/></svg>,
                      },
                      {
                        label: 'Ранк', onClick: () => navigateTo('rank'),
                        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a2 2 0 0 0 2 4"/><path d="M17 6h3a2 2 0 0 1-2 4"/></svg>,
                      },
                      {
                        label: 'Профайл', onClick: () => { setProfileOpen(true); setProfileMenuOpen(false); },
                        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>,
                      },
                      {
                        label: 'Гарах', onClick: handleLogout, danger: true,
                        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
                      },
                    ].map(item => (
                      <div key={item.label} onClick={item.onClick}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: item.danger ? '#ff6b6b' : '#eee' }}>
                        <span style={{ display: 'flex', color: item.danger ? '#ff6b6b' : '#aaa' }}>{item.icon}</span>
                        {item.label}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ШИНЭ (хэрэглэгчийн хvсэлт): "Нийтийн чат"-ыг профайл цэснээс хассан —
          оронд нь доод pill nav-ийн дээгvvр (тvvнтэй давхцалгvй), бие даасан
          дугуй чат-bubble товч болгож, chat/reader хуудаснаас бусад vед харуулна. */}
      {currentUser && page !== 'chat' && page !== 'reader' && (
        <div onClick={() => { setPreviousPage(page); setPage('chat'); setChatMode('inbox'); setDmPartner(null); }} title="Чат"
          style={{
            position: 'fixed', right: 16, bottom: isMobile ? 104 : 40, zIndex: 240,
            width: 52, height: 52, borderRadius: '50%', cursor: 'pointer',
            background: '#1c2233', border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5c0 4.42-4.03 8-9 8-1.06 0-2.08-.15-3.02-.44L4 21l1.15-3.65C4.16 15.94 3 13.84 3 11.5 3 7.08 7.03 3.5 12 3.5s9 3.58 9 8z"/>
            <circle cx="8.3" cy="11.5" r="1" fill="#fff" stroke="none"/>
            <circle cx="12" cy="11.5" r="1" fill="#fff" stroke="none"/>
            <circle cx="15.7" cy="11.5" r="1" fill="#fff" stroke="none"/>
          </svg>
          {/* ШИНЭ (хэрэглэгчийн хvсэлт): сайтад хаана ч байсан уншаагvй мессежийн
              (DM + дуугvй болгоогvй Нийтийн чат) тоог badge-аар харуулна. */}
          {(dmUnreadTotal + (publicChatMuted ? 0 : publicChatUnreadCount)) > 0 && (
            <span style={{
              position: 'absolute', top: -3, right: -3, background: '#8B0000', color: '#fff', fontSize: 10, fontWeight: 800,
              borderRadius: 10, minWidth: 19, height: 19, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 4px', border: '2px solid #050505',
            }}>
              {Math.min(99, dmUnreadTotal + (publicChatMuted ? 0 : publicChatUnreadCount))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}