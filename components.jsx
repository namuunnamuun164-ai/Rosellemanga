import React, { useState, useEffect, useMemo } from 'react';
import { STATUS_META, DEFAULT_STATUS_META } from './constants';
import { IconSearch } from './icons';

// ЗАСВАР #179 (код шинжилгээ): Эдгээр 3 компонентыг App() функцийн БИЕИЙН
// дотор const-ээр тодорхойлдог байсан тул render бvр дээр ШИНЭ функц
// vvсгэгддэг байв — React vvнийг ӨӨР төрлийн component гэж vзээд, harin
// (mangaChechen, home hero гэх мэт) бvх subtree-г unmount→remount хийдэг байсан
// (жишээ нь nowTs 30 сек тутам шинэчлэгдэхэд бvх MangaCard дахин mount болно).
// Module тvвшинд (App-ийн гадна) шилжvvлснээр component identity vргэлж
// тогтвортой байж, зөвхөн шинэ props ирэхэд л дахин render хийгдэнэ (unmount vгvй).

// ЗАСВАР #226 (код шинжилгээ): өмнө нь App() дотор НЭГ л scheduleNowTs state
// секунд тутам шинэчлэгдэж, App() бvхэлдээг (5800+ мөр, 800+ inline style)
// дахин render хийлгэдэг байсан (detail/schedule хуудсанд байх vед) — vvнийг
// тусад нь module-level компонент болгож тусгаарлав: зөвхөн ЭНЭ жижиг
// компонент секунд тутам өөрийгөө сэргээнэ, App() эцэг компонентод нөлөөлөхгvй.
// remainingMs <= 0 болмогц өөрийгөө зогсооно (interval мөнхөд ажиллахгvй).
export const LiveCountdown = ({ target, onExpire, children }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (target - next <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [target]);
  const remainingMs = target - now;
  // ЗАСВАР #228 (код шинжилгээ): дуусмагц null буцаадаг тул дуудагч тал
  // (жишээ нь дараагийн долоо хоногийн хуваарь, эсвэл chapterLocked) 30 сек
  // тутмын nowTs тик хvлээгээгvйгээр шууд шинэчлэгдэж чадахын тулд мэдэгдэнэ.
  useEffect(() => {
    if (remainingMs <= 0) onExpire?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs <= 0]);
  if (remainingMs <= 0) return null;
  return children(remainingMs);
};

// ЗАСВАР #232 (код шинжилгээ): "search" state өмнө нь App() дотор байсан бөгөөд
// "Бvх гаргалт" хуудасны grid-ийг ЧИМЭЭГvй давхар шvvдэг байв (харагдах хайлтын
// талбар байхгvй атлаа) — vvнээс гадна vсэг бvр дарах бvр App() бvхэлдээ (5800+
// мөр, 812 inline style) дахин render хийгддэг байсан. Одоо энэ хайлт бvрэн
// тусгаарлагдсан: зөвхөн ЭНЭ компонентод хамаарна, өөрийн state-тэй, зөвхөн
// ӨӨРИЙГӨӨ дахин render хийнэ.
//
// ЗАСВАР (хэрэглэгчийн хvсэлт): дэлгэц дvvрэн (өнгөрсөн "SearchOverlay") хайлтын
// цонхны оронд, топбарын хайлтын дvрс өөрөө ХАЖУУ ТИЙШЭЭ ТЭЛЖ (width transition)
// pill хэлбэрийн талбар болдог "inline" загвар руу шилжив — тусдаа бvтэн дэлгэцийн
// хэсэг (overlay/section) НЭЭГДЭХГvй, зөвхөн топбарын дотор өргөжинө.
export const TopbarSearch = ({ allMangas, onOpen, isOpen, onOpenChange }) => {
  const [search, setSearch] = useState('');
  const results = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return [];
    return allMangas.filter(m => m.title.toLowerCase().includes(q) || (m.desc || '').toLowerCase().includes(q)).slice(0, 8);
  }, [search, allMangas]);

  // Хаагдах бvрд дараагийн нээлтэд хуучин хайлтын vг vлдэхгvйгээр цэвэрлэнэ.
  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);

  return (
    <div style={{ position: 'relative' }}>
      {/* ШИНЭ: гадна дарахад хайлтыг хаах (бусад dropdown-уудтай ижил зарчим) */}
      {isOpen && (
        <div onClick={() => onOpenChange(false)} style={{ position: 'fixed', inset: 0, zIndex: 259 }} />
      )}
      {/* ЗАСВАР (дизайн сайжруулалт): бусад шинэ (VIP карт/профайл/доод nav)
          хэсэгтэй ижил "glass + glow" хэлбэрт нийцvvлэв — frosted-glass
          дэвсгэр, нээлттэй vед гялалзсан улаан хvрээ (nav-item-glow class,
          index.css). */}
      <div onClick={() => { if (!isOpen) onOpenChange(true); }} className={isOpen ? 'nav-item-glow' : ''}
        style={{
          position: 'relative', zIndex: 260,
          display: 'flex', alignItems: 'center', gap: isOpen ? 8 : 0,
          width: isOpen ? 'min(50vw, 220px)' : 34, height: 34,
          background: isOpen ? 'rgba(26,26,26,0.75)' : 'transparent',
          backdropFilter: isOpen ? 'blur(14px)' : 'none', WebkitBackdropFilter: isOpen ? 'blur(14px)' : 'none',
          border: isOpen ? '1px solid rgba(139,0,0,0.5)' : '1px solid transparent',
          borderRadius: 18, padding: isOpen ? '0 8px 0 12px' : 0,
          overflow: 'hidden', cursor: isOpen ? 'text' : 'pointer',
          transition: 'width 0.4s cubic-bezier(0.65,0,0.35,1), background 0.3s ease, border-color 0.3s ease',
        }}>
        <span style={{ color: isOpen ? '#8B0000' : '#aaa', display: 'flex', flexShrink: 0, transition: 'color 0.3s ease' }}><IconSearch /></span>
        {isOpen && (
          <>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Escape') onOpenChange(false); }}
              placeholder="Манга хайх..."
              style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 14 }} />
            <span onClick={e => { e.stopPropagation(); onOpenChange(false); }} title="Хаах"
              style={{ cursor: 'pointer', color: '#888', display: 'flex', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </span>
          </>
        )}
      </div>

      {isOpen && search && (
        <div className="dropdown-pop-in" style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 'min(84vw, 340px)', maxHeight: '60vh', overflowY: 'auto',
          background: 'rgba(20,20,20,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, zIndex: 260,
          boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 24px rgba(139,0,0,0.12)',
        }}>
          {results.length === 0 ? (
            <div style={{ padding: '18px 14px', fontSize: 12, color: '#555', textAlign: 'center' }}>Илэрц алга</div>
          ) : results.map(m => (
            <div key={m.id} onClick={() => { onOpen(m); onOpenChange(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,0,0,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <img src={m.poster} alt={m.title} style={{ width: 38, height: 50, objectFit: 'cover', borderRadius: 6, flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                <div style={{ fontSize: 10, color: '#8B0000', marginTop: 3 }}>{(m.genres || []).join(' / ').toUpperCase()}</div>
              </div>
              <span style={{ marginLeft: 'auto', color: '#555', flexShrink: 0 }}>›</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ЗАСВАР (дизайн сайжруулалт #11): VIP хэрэглэгчийн avatar-д алт өнгийн
// гэрэлтдэг (амьсгалдаг) цагираг (vip-ring, index.css) нэмж, сайтын хаана ч
// (сэтгэгдэл, профайл, доод nav) VIP статусыг нэг харцаар мэдэгдэхvvн болгов.
export const Avatar = ({ url, letter, size = 34, isVip = false }) => (
  url ? (
    <img src={url} alt="" className={isVip ? 'vip-ring' : ''} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxSizing: 'border-box' }} />
  ) : (
    <div className={isVip ? 'vip-ring' : ''} style={{ width: size, height: size, borderRadius: '50%', background: '#8B0000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.42, color: '#fff', flexShrink: 0, boxSizing: 'border-box' }}>
      {(letter || '?').toUpperCase()}
    </div>
  )
);

// history/onOpen нь өмнө нь App() дотроос шууд closure-оор (history state,
// goToDetail функц) уншигддаг байсан — одоо props болгож дамжуулна.
export const MangaCard = ({ m, showChapter, history, onOpen, priority = false }) => (
  <div onClick={() => onOpen(m)} role="button" tabIndex={0}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(m); } }}
    style={{ cursor: 'pointer', position: 'relative' }}>
    {/* ЗАСВАР (дизайн сайжруулалт #2,#5): poster-hover — desktop дээр hover
        vед бага зэрэг томорч сvvдэр гvнзгийрнэ. poster-skeleton — статик хар
        placeholder-ийн оронд ачааллаж буй мэдрэмж өгөх гэрэлтдэг shimmer. */}
    <div className="poster-hover poster-skeleton" style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '3/4' }}>
      {/* ЗАСВАР #205 (хэрэглэгчийн хvсэлт): олон poster зэрэг ачаалагдахад нэг нэгээрээ
          "цувран" гэнэт гарч ирдэг (pop-in) нь эмх замбараагvй харагддаг байсан —
          сааралхан placeholder дэвсгэр дээр зөөлөн opacity fade-ин хийж, илvv цэгцтэй болгов. */}
      {/* ЗАСВАР #223 (код шинжилгээ): зөвхөн эхний (шууд харагдах) картуудыг eager
          ачаална, vлдсэн олон posterыг lazy болгож анхны ачааллын vеийн зэрэг
          хvсэлтийн тоог багасгав. */}
      <img src={m.poster} alt={m.title} loading={priority ? 'eager' : 'lazy'} decoding="async"
        onLoad={e => { e.currentTarget.style.opacity = 1; }}
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: 'opacity 0.3s ease' }} />
      {showChapter && history.find(h => h.mangaId === m.id) && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.8)', padding: '6px 8px', fontSize: 11, color: '#aaa' }}>
          Бvлэг {history.find(h => h.mangaId === m.id).chapter}
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

// ЗАСВАР (хэрэглэгчийн хvсэлт): зарим хуудсанд (Бvх гаргалт, Хуваарь, Миний
// сан) энэ header-ийг зvгээр гарчгийн загварт зориулж onClick={() => {}}
// (no-op) дамжуулж ашигладаг байсан тул vvргvй сум товч харагддаг байв.
// Одоо onClick өгөгдөөгvй (falsy) vед энэ товчийг бvр мөсөн vзvvлэхгvй.
export const SectionHeader = ({ title, onClick, count }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 4, height: 20, background: '#8B0000', borderRadius: 2 }} />
      <span style={{ fontWeight: 800, fontSize: 16 }}>{title}</span>
      {/* ШИНЭ (хэрэглэгчийн хvсэлт): тухайн эгнээнд хэдэн зvйл байгааг жижиг тоогоор харуулна. */}
      {count > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>{count}</span>}
    </div>
    {onClick && (
    <span onClick={onClick} title="Бvгдийг vзэх" role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', cursor: 'pointer', border: '1px solid #2a2a2a', background: '#141414' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
    </span>
    )}
  </div>
);
