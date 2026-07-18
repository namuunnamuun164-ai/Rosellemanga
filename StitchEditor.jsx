import React, { useState, useEffect, useRef } from 'react';
import { IconCheck, IconChevronUp, IconChevronDown, IconPencil } from './icons';

// ЗАСВАР #171: StitchPics (iOS) шиг — олон зургийг ГАРААР (автомат
// тааруулгагvй) зэрэгцvvлэн харуулж, ирмэг (дээд/доод/зvvн/баруун) бvрийг нь
// CROP хийх editor.
//
// ЗАСВАР #170: өмнө нь бvх зургийг НЭГ канвас дээр буулгаж, ганц том зураг
// (merged file) болгодог байсныг өөрчилсөн — тэгвэл зурагнууд хэт том болж,
// дараа нь тэдгээрийг дахин "4000px хуваах" шаардлагатай болдог байв. Одоо
// зураг бvр (crop хийсний дараа) ТУСДАА, өөрийн хэмжээгээрээ vлдэнэ.
//
// props:
//   files       (File[])                  — зэрэгцvvлж/тайрах зургууд (дор хаяж 2)
//   onCancel    ()                        — болих
//   onExport    (croppedFiles: File[] => ...) — зураг бvрийг ТУСДАА тайрсан vр дvнг (files-тэй ижил урттай, дараалалтай) буцаана
//   exportType  ('image/jpeg'|'image/png', өгөгдмөл 'image/jpeg')
//   exportQuality (0-1, өгөгдмөл 0.92)
export default function StitchEditor({ files, onCancel, onExport, exportType = 'image/jpeg', exportQuality = 0.92 }) {
  const [naturalDims, setNaturalDims] = useState(null); // [{width,height}, ...]
  const [fileUrls, setFileUrls] = useState([]);
  const [crops, setCrops] = useState([]); // [{cropTop, cropBottom, cropLeft, cropRight}, ...] — natural (base-normalized) px
  const [zoom, setZoom] = useState(1);
  const [activeIndex, setActiveIndex] = useState(null);
  const [activeHandle, setActiveHandle] = useState('top'); // 'top'|'bottom'|'left'|'right' — nudge товч аль ирмэгт нөлөөлөхийг заана
  const [dragKind, setDragKind] = useState(null); // 'top'|'bottom'|'left'|'right'|null
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const AXIS = { top: 'y', bottom: 'y', left: 'x', right: 'x' };
  const KEY = { top: 'cropTop', bottom: 'cropBottom', left: 'cropLeft', right: 'cropRight' };
  const HANDLE_LABEL = { top: 'дээд', bottom: 'доод', left: 'зvvн', right: 'баруун' };

  // Blob URL-уудыг файл өөрчлөгдөх vед л нэг удаа vvсгэж, cleanup дээр revoke хийнэ
  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f));
    setFileUrls(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [files]);

  // Зураг бvрийн БОДИТ (natural) хэмжээг нэг удаа уншиж, crop утгуудыг 0-ээр эхлvvлнэ
  useEffect(() => {
    let cancelled = false;
    setNaturalDims(null);
    setError('');
    setActiveIndex(null);
    const urls = files.map(f => URL.createObjectURL(f));
    Promise.all(urls.map(u => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Зураг уншиж чадсангvй'));
      img.src = u;
    }))).then(dims => {
      urls.forEach(u => URL.revokeObjectURL(u));
      if (cancelled) return;
      setNaturalDims(dims);
      setCrops(dims.map(() => ({ cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 })));
    }).catch(e => {
      urls.forEach(u => URL.revokeObjectURL(u));
      if (!cancelled) setError(e.message);
    });
    return () => { cancelled = true; };
  }, [files]);

  // ЗАСВАР #172: Контейнерийн (дэлгэцийн) өргөнийг хэмжинэ. "Ачаалж байна..."
  // vеийн early-return-ий улмаас эхний mount-д containerRef.current vнэндээ
  // null байдаг (энэ ref-тэй div хараахан render хийгдээгvй) — naturalDims
  // ирж, жинхэнэ дэлгэц render хийгдэх vед дахин хэмжихийн тулд naturalDims-ыг
  // dependency-д нэмэв. Эс бол containerWidth мөнхөд 0 хэвээр vлдэж,
  // displayScale ч 0 болж, зурагнууд ЕР vзэгдэхгvй байх алдаа vvсдэг байв.
  useEffect(() => {
    const measure = () => setContainerWidth(containerRef.current?.clientWidth || 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [naturalDims]);

  if (files.length < 2) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: '#ccc', padding: 24, textAlign: 'center' }}>
        <div>Зэрэгцvvлэхийн тулд дор хаяж 2 зураг сонгоно уу.</div>
        <button onClick={onCancel} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#fff', cursor: 'pointer' }}>Буцах</button>
      </div>
    );
  }

  if (!naturalDims) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: '#ccc', padding: 24, textAlign: 'center' }}>
        <div>{error ? `Алдаа: ${error}` : 'Ачаалж байна...'}</div>
        {error && <button onClick={onCancel} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#fff', cursor: 'pointer' }}>Буцах</button>}
      </div>
    );
  }

  const baseWidth = naturalDims[0].width;
  // Бvх зургийг эхний зурагны (base) өргөнд proportional тааруулсан natural өндөр — зөвхөн ЗЭРЭГЦvvЛЖ ХАРУУЛАХ preview-д
  const scaledHeights = naturalDims.map(d => d.height * baseWidth / d.width);
  const visibleHeights = scaledHeights.map((h, i) => h - (crops[i]?.cropTop || 0) - (crops[i]?.cropBottom || 0));
  const visibleWidths = scaledHeights.map((h, i) => baseWidth - (crops[i]?.cropLeft || 0) - (crops[i]?.cropRight || 0));

  // top[i] (natural, base-normalized px) — cumulative, ЗАЙГvй шууд наалдана (preview-д зориулсан, export нь тус тусдаа)
  const tops = [0];
  for (let i = 1; i < files.length; i++) tops.push(tops[i - 1] + visibleHeights[i - 1]);
  const canvasHeightNatural = tops[tops.length - 1] + visibleHeights[visibleHeights.length - 1];

  const displayScale = containerWidth > 0 ? (containerWidth * zoom) / baseWidth : 0;

  // Тухайн зурагны crop-ийн дээд хязгаар (тэнхлэг бvрээр) — дор хаяж 1px vлдэнэ
  const maxCropFor = (i, handle) => {
    if (AXIS[handle] === 'y') {
      const other = handle === 'top' ? (crops[i]?.cropBottom || 0) : (crops[i]?.cropTop || 0);
      return Math.max(0, scaledHeights[i] - 1 - other);
    }
    const other = handle === 'left' ? (crops[i]?.cropRight || 0) : (crops[i]?.cropLeft || 0);
    return Math.max(0, baseWidth - 1 - other);
  };

  const startCropDrag = (e, i, handle) => {
    e.preventDefault();
    e.stopPropagation();
    if (displayScale <= 0) return;
    const point = e.touches ? e.touches[0] : e;
    const axis = AXIS[handle];
    const startCoord = axis === 'y' ? point.clientY : point.clientX;
    const key = KEY[handle];
    const startVal = crops[i][key] || 0;
    const maxVal = maxCropFor(i, handle);
    setActiveIndex(i);
    setActiveHandle(handle);
    setDragKind(handle);

    const onMove = (ev) => {
      if (ev.touches) ev.preventDefault();
      const p = ev.touches ? ev.touches[0] : ev;
      const coord = axis === 'y' ? p.clientY : p.clientX;
      const deltaNatural = (coord - startCoord) / displayScale;
      // Дээд/зvvн бариулыг "дотогш" (доош/баруун тийш) чирэхэд тухайн crop ихэснэ.
      // Доод/баруун бариулыг "дотогш" (дээш/зvvн тийш) чирэхэд тухайн crop ихэснэ.
      const raw = (handle === 'top' || handle === 'left') ? startVal + deltaNatural : startVal - deltaNatural;
      const clamped = Math.max(0, Math.min(maxVal, raw));
      setCrops(prev => {
        const arr = [...prev];
        arr[i] = { ...arr[i], [key]: clamped };
        return arr;
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      setDragKind(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  // Товч/сумаар 1px-ийн нарийн тохируулга (natural нэгжээр)
  const nudgeCrop = (delta) => {
    if (activeIndex === null) return;
    const i = activeIndex;
    const key = KEY[activeHandle];
    const maxVal = maxCropFor(i, activeHandle);
    setCrops(prev => {
      const arr = [...prev];
      arr[i] = { ...arr[i], [key]: Math.max(0, Math.min(maxVal, (arr[i][key] || 0) + delta)) };
      return arr;
    });
  };
  const resetActive = () => {
    if (activeIndex === null) return;
    setCrops(prev => {
      const arr = [...prev];
      arr[activeIndex] = { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 };
      return arr;
    });
  };

  // ЗАСВАР #170: зураг бvрийг ТУСДАА canvas дээр тайрч, files-тэй ижил
  // урттай File[] буцаана — НЭГ канвас дээр буулгаж нийлvvлдэггvй.
  const handleExport = async () => {
    setBusy(true);
    setError('');
    try {
      const results = [];
      // Зургуудыг НЭГ НЭГЭЭР нь (Promise.all биш) дараалуулж decode хийнэ —
      // олон том зургийг зэрэг санах ойд ачаалахаас сэргийлнэ.
      for (let i = 0; i < files.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        const bitmap = await createImageBitmap(files[i]);
        const scaleToNatural = naturalDims[i].height / scaledHeights[i]; // = naturalDims[i].width/baseWidth ч мөн
        const srcX = (crops[i].cropLeft || 0) * scaleToNatural;
        const srcY = (crops[i].cropTop || 0) * scaleToNatural;
        const srcW = visibleWidths[i] * scaleToNatural;
        const srcH = visibleHeights[i] * scaleToNatural;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(srcW));
        canvas.height = Math.max(1, Math.round(srcH));
        const ctx = canvas.getContext('2d');
        if (exportType === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        // eslint-disable-next-line no-await-in-loop
        const blob = await new Promise(resolve => canvas.toBlob(resolve, exportType, exportQuality));
        if (!blob) {
          throw new Error('Зураг хэт том байна — цөөн хуудсаар оролдоно уу.');
        }
        const ext = exportType === 'image/png' ? 'png' : 'jpg';
        results.push(new File([blob], `page-${i + 1}.${ext}`, { type: exportType }));
      }
      onExport(results);
    } catch (e) {
      setError(e.message || 'Тайрахад алдаа гарлаа');
    }
    setBusy(false);
  };

  const iconBtnStyle = { width: 32, height: 32, borderRadius: 8, border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
  const cornerBadge = (handle) => (
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f5a623', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
      {dragKind === handle ? <IconCheck size={14} color="#000" /> : <IconPencil size={13} color="#000" />}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <button onClick={onCancel} title="Болих"
          style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 16 }}>
          ✕
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(2)))} title="Жижигрvvлэх"
            style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>−</button>
          <span style={{ fontSize: 11, color: '#aaa', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(2)))} title="Томруулах"
            style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>+</button>
        </div>
        <button disabled={busy} onClick={handleExport}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#8B0000', color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          <IconCheck size={14} /> {busy ? 'Тайрж байна...' : 'Тайрах'}
        </button>
      </div>

      <div ref={containerRef} onClick={() => setActiveIndex(null)} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {displayScale > 0 && (
          <div style={{ position: 'relative', width: baseWidth * displayScale, height: canvasHeightNatural * displayScale, margin: '0 auto' }}>
            {files.map((f, i) => {
              const isActive = activeIndex === i;
              const boxTopPx = tops[i] * displayScale;
              const boxWidthPx = baseWidth * displayScale;

              if (!isActive) {
                return (
                  <div key={i} onClick={(e) => { e.stopPropagation(); setActiveIndex(i); }}
                    style={{ position: 'absolute', left: 0, top: boxTopPx, width: visibleWidths[i] * displayScale, height: visibleHeights[i] * displayScale, overflow: 'hidden', cursor: 'pointer' }}>
                    <img src={fileUrls[i]} alt={`${i + 1}`} draggable={false}
                      style={{ position: 'absolute', left: -(crops[i].cropLeft || 0) * displayScale, top: -(crops[i].cropTop || 0) * displayScale, width: boxWidthPx, height: scaledHeights[i] * displayScale, pointerEvents: 'none' }} />
                  </div>
                );
              }

              // Идэвхтэй зураг — БvТЭН (тайраагvй) хэмжээгээр харуулж, тайрагдах хэсгvvдийг
              // хагас тунгалаг улбар шар давхаргаар тэмдэглэнэ (StitchPics-ийн crop горим шиг).
              const boxHeightPx = scaledHeights[i] * displayScale;
              const cropTopPx = (crops[i].cropTop || 0) * displayScale;
              const cropBottomPx = (crops[i].cropBottom || 0) * displayScale;
              const cropLeftPx = (crops[i].cropLeft || 0) * displayScale;
              const cropRightPx = (crops[i].cropRight || 0) * displayScale;
              return (
                <div key={i} onClick={(e) => e.stopPropagation()}
                  style={{ position: 'absolute', left: 0, top: boxTopPx, width: boxWidthPx, height: boxHeightPx, zIndex: files.length + 10, border: '2px solid #f5a623', boxSizing: 'border-box' }}>
                  <img src={fileUrls[i]} alt={`${i + 1}`} draggable={false}
                    style={{ position: 'absolute', left: 0, top: 0, width: boxWidthPx, height: boxHeightPx, pointerEvents: 'none' }} />
                  {cropTopPx > 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: cropTopPx, background: 'rgba(245,166,35,0.35)', pointerEvents: 'none' }} />}
                  {cropBottomPx > 0 && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: cropBottomPx, background: 'rgba(245,166,35,0.35)', pointerEvents: 'none' }} />}
                  {cropLeftPx > 0 && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: cropLeftPx, background: 'rgba(245,166,35,0.35)', pointerEvents: 'none' }} />}
                  {cropRightPx > 0 && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: cropRightPx, background: 'rgba(245,166,35,0.35)', pointerEvents: 'none' }} />}

                  {/* Дээд/доод бариул — 4 буланд харандаа/зов тэмдэг */}
                  <div onPointerDown={(e) => startCropDrag(e, i, 'top')}
                    style={{ position: 'absolute', left: 0, right: 0, top: cropTopPx - 14, height: 28, cursor: 'ns-resize', touchAction: 'none', zIndex: 2 }}>
                    <div style={{ position: 'absolute', left: 8, top: 0 }}>{cornerBadge('top')}</div>
                    <div style={{ position: 'absolute', right: 8, top: 0 }}>{cornerBadge('top')}</div>
                  </div>
                  <div onPointerDown={(e) => startCropDrag(e, i, 'bottom')}
                    style={{ position: 'absolute', left: 0, right: 0, top: boxHeightPx - cropBottomPx - 14, height: 28, cursor: 'ns-resize', touchAction: 'none', zIndex: 2 }}>
                    <div style={{ position: 'absolute', left: 8, top: 0 }}>{cornerBadge('bottom')}</div>
                    <div style={{ position: 'absolute', right: 8, top: 0 }}>{cornerBadge('bottom')}</div>
                  </div>
                  {/* Зvvн/баруун бариул — ирмэгийн голд харандаа/зов тэмдэг */}
                  <div onPointerDown={(e) => startCropDrag(e, i, 'left')}
                    style={{ position: 'absolute', top: 0, bottom: 0, left: cropLeftPx - 14, width: 28, cursor: 'ew-resize', touchAction: 'none', zIndex: 2 }}>
                    <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)' }}>{cornerBadge('left')}</div>
                  </div>
                  <div onPointerDown={(e) => startCropDrag(e, i, 'right')}
                    style={{ position: 'absolute', top: 0, bottom: 0, left: boxWidthPx - cropRightPx - 14, width: 28, cursor: 'ew-resize', touchAction: 'none', zIndex: 2 }}>
                    <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)' }}>{cornerBadge('right')}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ padding: '1rem', borderTop: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        {activeIndex !== null && (
          <div style={{ display: 'flex', gap: 18, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: '#888' }}>Тайрах ({HANDLE_LABEL[activeHandle]})</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => nudgeCrop(1)} title="Ихэсгэх" style={iconBtnStyle}><IconChevronUp size={14} /></button>
                <button onClick={() => nudgeCrop(-1)} title="Багасгах" style={iconBtnStyle}><IconChevronDown size={14} /></button>
              </div>
            </div>
            <button onClick={resetActive} title="Тэглэх"
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#ccc', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              ⟲ Тэглэх
            </button>
          </div>
        )}
        {error && <div style={{ color: '#ff6b6b', fontSize: 12, textAlign: 'center' }}>{error}</div>}
      </div>
    </div>
  );
}
