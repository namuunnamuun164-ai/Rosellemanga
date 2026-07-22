import React, { useState, useEffect, useMemo } from 'react';
import { STATUS_META, DEFAULT_STATUS_META } from './constants';
import { IconSearch } from './icons';

// ЗАСВАР #179 (код шинжилгээ): Эдгээр 3 компонентыг App() функцийн БИЕИЙН
// дотор const-ээр тодорхойлдог байсан тул render бvр дээр ШИНЭ функц
// vvсгэгддэг байв — React vvнийг ӨӨР төрлийн component гэж vзээд, harin
// (mangaChechen, home hero гэх мэт) бvх subtree-г unmount→remount хийдэг байсан
// (жишээ нь nowTs 30 сек тутам шинэчлэгдэхэд бvх MangaCard дахин mount болно).
// Module түвшинд (App-ийн гадна) шилжvvлснээр component identity vргэлж
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
// талбар байхгvй атлаа) — үvнээс гадна vсэг бvр дарах бvр App() бvхэлдээ (5800+
// мөр, 812 inline style) дахин render хийгддэг байсан. Одоо энэ хайлт бvрэн
// тусгаарлагдсан: зөвхөн ЭНЭ overlay-д хамаарна, өөрийн state-тэй, зөвхөн
// ӨӨРИЙГӨӨ дахин render хийнэ.
export const SearchOverlay = ({ allMangas, onOpen, onClose }) => {
  const [search, setSearch] = useState('');
  const results = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return [];
    return allMangas.filter(m => m.title.toLowerCase().includes(q) || (m.desc || '').toLowerCase().includes(q));
  }, [search, allMangas]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10rem' }}>
      {/* ЗАСВАР #46: хайлт хэсэгт ✕-ээс гадна энгийн "← Буцах" товч нэмсэн */}
      <button onClick={onClose} title="Буцах"
        style={{ position: 'absolute', top: 24, left: 24, width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div style={{ width: '60%', display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid #333', paddingBottom: 16 }}>
        <span style={{ color: '#8B0000' }}><IconSearch /></span>
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Манга хайх..."
          style={{ background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 28, fontWeight: 700, flex: 1 }} />
        <span onClick={onClose} style={{ cursor: 'pointer', fontSize: 24, color: '#aaa' }}>✕</span>
      </div>
      {search && (
        <div style={{ width: '60%', marginTop: 24 }}>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>ХАЙЛТЫН ИЛЭРЦ ({results.length})</div>
          {results.map(m => (
            <div key={m.id} onClick={() => { onOpen(m); onClose(); }}
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
  );
};

export const Avatar = ({ url, letter, size = 34 }) => (
  url ? (
    <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#8B0000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.42, color: '#fff', flexShrink: 0 }}>
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
    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '3/4', background: '#141414' }}>
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

export const SectionHeader = ({ title, onClick }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 4, height: 20, background: '#8B0000', borderRadius: 2 }} />
      <span style={{ fontWeight: 800, fontSize: 16 }}>{title}</span>
    </div>
    <span onClick={onClick} title="Бүгдийг үзэх" role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', cursor: 'pointer', border: '1px solid #2a2a2a', background: '#141414' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
    </span>
  </div>
);
