import React from 'react';
import { STATUS_META, DEFAULT_STATUS_META } from './constants';

// ЗАСВАР #179 (код шинжилгээ): Эдгээр 3 компонентыг App() функцийн БИЕИЙН
// дотор const-ээр тодорхойлдог байсан тул render бvр дээр ШИНЭ функц
// vvсгэгддэг байв — React vvнийг ӨӨР төрлийн component гэж vзээд, harin
// (mangaChechen, home hero гэх мэт) бvх subtree-г unmount→remount хийдэг байсан
// (жишээ нь nowTs 30 сек тутам шинэчлэгдэхэд бvх MangaCard дахин mount болно).
// Module түвшинд (App-ийн гадна) шилжvvлснээр component identity vргэлж
// тогтвортой байж, зөвхөн шинэ props ирэхэд л дахин render хийгдэнэ (unmount vгvй).

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
