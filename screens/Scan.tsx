import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useToast } from '../components/ui/Toast';
import { supabase } from '../services/supabase';
import { detectDocument, warpDocument, applyFilter, FilterMode } from '../services/docScanner';
import { buildScanPdf, ScanPage } from '../services/scanToPdf';
import { uploadScannedDocument } from '../services/documentUpload';
import { useDocumentCamera, AUTO_CAPTURE_FRAMES } from '../hooks/useDocumentCamera';
import type { Point } from '../services/scanGeometry';

type Stage = 'capture' | 'adjust' | 'review';

/** Página escaneada: guardamos el recorte sin filtrar para poder recambiarlo después. */
interface EditablePage extends ScanPage {
  rawDataUrl: string;
  filter: FilterMode;
}

interface ClientProfile { id: string; company_name: string | null; }

const GESTOR_TYPES = [
  { value: 'declaration',   label: 'Declaración / Certificado' },
  { value: 'legal',         label: 'Documento Legal' },
  { value: 'guia',          label: 'Guía' },
  { value: 'oc',            label: 'Orden de Compra (OC)' },
  { value: 'ticket_pesaje', label: 'Ticket de Pesaje' },
  { value: 'cdf',           label: 'Certificado Disposición Final (CDF)' },
  { value: 'custom',        label: 'Otro' },
];

const ECONEXO_TYPES = [
  { value: 'CR',            label: 'Certificado de Recepción (CR)' },
  { value: 'CGM',           label: 'Certificado Gestión Mensual (CGM)' },
  { value: 'report',        label: 'Reporte Ambiental' },
  { value: 'guia',          label: 'Guía' },
  { value: 'oc',            label: 'Orden de Compra (OC)' },
  { value: 'ticket_pesaje', label: 'Ticket de Pesaje' },
  { value: 'cdf',           label: 'Certificado Disposición Final (CDF)' },
  { value: 'custom',        label: 'Otro' },
];

const FILTERS: { value: FilterMode; label: string; icon: string }[] = [
  { value: 'magic', label: 'Automático', icon: 'auto_fix_high' },
  { value: 'bw',    label: 'B/N',        icon: 'contrast' },
  { value: 'gray',  label: 'Gris',       icon: 'filter_b_and_w' },
  { value: 'color', label: 'Original',   icon: 'palette' },
];

const DEFAULT_CORNERS = (w: number, h: number): Point[] => ([
  { x: w * 0.08, y: h * 0.08 },
  { x: w * 0.92, y: h * 0.08 },
  { x: w * 0.92, y: h * 0.92 },
  { x: w * 0.08, y: h * 0.92 },
]);

const Scan: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [stage, setStage] = useState<Stage>('capture');
  const [filter, setFilter] = useState<FilterMode>('magic');
  const [pages, setPages] = useState<EditablePage[]>([]);
  const [saving, setSaving] = useState(false);
  const [refiltering, setRefiltering] = useState(false);
  const [showFinalize, setShowFinalize] = useState(false);
  const [title, setTitle] = useState('');
  const [autoCapture, setAutoCapture] = useState(true);
  const [flash, setFlash] = useState(false);

  // Asignación al cliente (igual que el modal "Subir Documento" del admin)
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [clientId, setClientId] = useState('');
  const [source, setSource] = useState<'gestor' | 'econexo'>('gestor');
  const [docType, setDocType] = useState('declaration');
  const [docDate, setDocDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Imagen capturada + esquinas ajustables (en coordenadas naturales de la imagen)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [corners, setCorners] = useState<Point[]>([]);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const camera = useDocumentCamera(stage === 'capture');
  const autoShotLockRef = useRef(false);

  useEffect(() => {
    supabase.from('profiles').select('id, company_name').order('company_name')
      .then(({ data }) => setClients(data || []));
  }, []);

  const docTypes = source === 'econexo' ? ECONEXO_TYPES : GESTOR_TYPES;
  // Mantiene docType válido cuando el origen cambia entre las dos listas.
  useEffect(() => {
    if (!docTypes.some((t) => t.value === docType)) setDocType(docTypes[0].value);
  }, [source]);

  // ── Captura ────────────────────────────────────────────────────────────────

  /** Pasa de un canvas capturado a la etapa de ajuste, con los bordes ya detectados. */
  const acceptCapture = (canvas: HTMLCanvasElement, presetCorners?: Point[]) => {
    sourceCanvasRef.current = canvas;
    setNaturalSize({ w: canvas.width, h: canvas.height });
    setImgUrl(canvas.toDataURL('image/jpeg', 0.92));
    setCorners(
      presetCorners
      ?? detectDocument(canvas)
      ?? DEFAULT_CORNERS(canvas.width, canvas.height),
    );
    setStage('adjust');
  };

  const shoot = (fromAuto: boolean) => {
    const canvas = camera.grabFrame();
    if (!canvas) { toast.warning('La cámara aún no está lista.'); return; }

    // El marco en pantalla viene normalizado: se reescala al fotograma completo.
    const preset = camera.corners
      ? camera.corners.map(p => ({ x: p.x * canvas.width, y: p.y * canvas.height }))
      : undefined;

    setFlash(true);
    window.setTimeout(() => setFlash(false), 160);
    if (fromAuto && 'vibrate' in navigator) navigator.vibrate?.(30);

    acceptCapture(canvas, preset);
  };

  // Disparo automático al estabilizarse el encuadre.
  useEffect(() => {
    if (stage !== 'capture' || !autoCapture) { autoShotLockRef.current = false; return; }
    if (!camera.corners || camera.stableCount < AUTO_CAPTURE_FRAMES) return;
    if (autoShotLockRef.current) return;

    autoShotLockRef.current = true;
    shoot(true);
  }, [stage, autoCapture, camera.corners, camera.stableCount]);

  useEffect(() => {
    if (stage === 'capture') autoShotLockRef.current = false;
  }, [stage]);

  /** Fallback: elegir una foto ya existente cuando no hay cámara disponible. */
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      acceptCapture(canvas);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast.error('No se pudo leer la imagen.'); };
    img.src = url;
    e.target.value = '';
  };

  // ── Ajuste ─────────────────────────────────────────────────────────────────

  const displayScale = () => {
    const el = imgElRef.current;
    if (!el || naturalSize.w === 0) return 1;
    return el.clientWidth / naturalSize.w;
  };

  const onHandlePointerDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragIndex(i);
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (dragIndex === null || !imgElRef.current) return;
    const rect = imgElRef.current.getBoundingClientRect();
    const scale = displayScale();
    const x = Math.max(0, Math.min(naturalSize.w, (e.clientX - rect.left) / scale));
    const y = Math.max(0, Math.min(naturalSize.h, (e.clientY - rect.top) / scale));
    setCorners((prev) => prev.map((p, idx) => (idx === dragIndex ? { x, y } : p)));
  };

  const onHandlePointerUp = () => setDragIndex(null);

  const resetCornersToFullFrame = () =>
    setCorners(DEFAULT_CORNERS(naturalSize.w, naturalSize.h));

  const redetectCorners = () => {
    const found = sourceCanvasRef.current && detectDocument(sourceCanvasRef.current);
    if (found) { setCorners(found); toast.success('Bordes detectados.'); }
    else toast.warning('No encontramos los bordes. Ajústalos a mano.');
  };

  const confirmCrop = () => {
    try {
      const warped = warpDocument(sourceCanvasRef.current!, corners);
      const rawDataUrl = warped.toDataURL('image/jpeg', 0.92);
      const filtered = applyFilter(warped, filter);
      setPages((prev) => [...prev, {
        dataUrl: filtered.toDataURL('image/jpeg', 0.9),
        width: filtered.width,
        height: filtered.height,
        rawDataUrl,
        filter,
      }]);
      setImgUrl(null);
      sourceCanvasRef.current = null;
      setStage('review');
    } catch (err: any) {
      toast.error('Error al procesar la página: ' + (err.message || 'desconocido'));
    }
  };

  const discardCapture = () => {
    setImgUrl(null);
    sourceCanvasRef.current = null;
    setStage(pages.length ? 'review' : 'capture');
  };

  // ── Revisión ───────────────────────────────────────────────────────────────

  const movePage = (i: number, dir: -1 | 1) => {
    setPages((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const removePage = (i: number) => setPages((prev) => prev.filter((_, idx) => idx !== i));

  /** Reaplica un filtro a todas las páginas partiendo del recorte sin filtrar. */
  const applyFilterToAll = async (mode: FilterMode) => {
    if (pages.length === 0) return;
    setRefiltering(true);
    try {
      const next = await Promise.all(pages.map(async (page) => {
        if (page.filter === mode) return page;

        const canvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext('2d')!.drawImage(img, 0, 0);
            resolve(c);
          };
          img.onerror = () => reject(new Error('No se pudo releer la página'));
          img.src = page.rawDataUrl;
        });

        const filtered = applyFilter(canvas, mode);
        return {
          ...page,
          dataUrl: filtered.toDataURL('image/jpeg', 0.9),
          width: filtered.width,
          height: filtered.height,
          filter: mode,
        };
      }));
      setPages(next);
      setFilter(mode);
    } catch (err: any) {
      toast.error('No se pudo aplicar el filtro: ' + (err.message || 'desconocido'));
    } finally {
      setRefiltering(false);
    }
  };

  const handleSave = async () => {
    if (pages.length === 0) return;
    if (!clientId) { toast.warning('Selecciona una empresa destino.'); return; }
    setSaving(true);
    try {
      const pdf = buildScanPdf(pages);
      const finalTitle = title.trim() || `Documento escaneado ${new Date().toLocaleDateString()}`;
      await uploadScannedDocument({
        pdf,
        title: finalTitle,
        type: docType,
        clientId,
        createdAt: new Date(docDate).toISOString(),
        source,
      });
      toast.success('Documento escaneado y asignado al cliente.');
      navigate('/admin');
    } catch (err: any) {
      toast.error('Error al guardar: ' + (err.message || 'desconocido'));
    } finally {
      setSaving(false);
      setShowFinalize(false);
    }
  };

  // ── Vista previa de la cámara ──────────────────────────────────────────────

  const detectionProgress = camera.corners
    ? Math.min(1, camera.stableCount / AUTO_CAPTURE_FRAMES)
    : 0;

  const hintText = (() => {
    if (camera.status === 'starting') return 'Abriendo la cámara…';
    if (camera.status !== 'ready') return camera.errorMessage ?? 'Cámara no disponible';
    if (!camera.corners) return 'Encuadra el documento sobre un fondo contrastado';
    if (!autoCapture) return 'Documento detectado · pulsa para capturar';
    if (detectionProgress < 1) return 'Mantén el pulso…';
    return 'Capturando';
  })();

  const renderCameraStage = () => {
    const cameraFailed = camera.status === 'denied' || camera.status === 'unsupported' || camera.status === 'error';

    return (
      <div className="space-y-4">
        <div className="relative rounded-[28px] overflow-hidden bg-black aspect-[3/4] shadow-xl">
          <video
            ref={camera.videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Marco detectado */}
          {camera.corners && camera.status === 'ready' && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon
                points={camera.corners.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
                fill="rgba(180,211,81,0.18)"
                stroke="#b4d351"
                strokeWidth="0.6"
                vectorEffect="non-scaling-stroke"
                style={{ transition: 'all 90ms linear' }}
              />
            </svg>
          )}

          {/* Guías de encuadre cuando aún no hay nada detectado */}
          {!camera.corners && camera.status === 'ready' && (
            <div className="absolute inset-6 border-2 border-dashed border-white/30 rounded-2xl pointer-events-none" />
          )}

          {/* Estado de la cámara */}
          {camera.status !== 'ready' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center bg-slate-900">
              {camera.status === 'starting' ? (
                <div className="size-10 rounded-full border-[3px] border-white/20 border-t-white animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-5xl text-white/40">no_photography</span>
              )}
              <p className="text-sm font-bold text-white/80 leading-relaxed">{hintText}</p>
              {cameraFailed && (
                <div className="flex flex-col gap-2 w-full max-w-[220px]">
                  <button
                    onClick={camera.retry}
                    className="h-11 rounded-xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest border border-white/20"
                  >
                    Reintentar
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="h-11 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest"
                  >
                    Usar una foto
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Destello del obturador */}
          {flash && <div className="absolute inset-0 bg-white animate-in fade-in duration-100" />}

          {/* Linterna */}
          {camera.torchAvailable && camera.status === 'ready' && (
            <button
              onClick={camera.toggleTorch}
              aria-label="Linterna"
              className={`absolute top-4 right-4 size-11 rounded-full backdrop-blur-md border flex items-center justify-center transition-colors ${camera.torchOn
                ? 'bg-amber-400 border-amber-300 text-slate-900'
                : 'bg-black/40 border-white/20 text-white'
                }`}
            >
              <span className="material-symbols-outlined">flashlight_on</span>
            </button>
          )}

          {/* Pista inferior */}
          {camera.status === 'ready' && (
            <div className="absolute bottom-4 left-4 right-4 flex justify-center pointer-events-none">
              <p className="px-3.5 py-2 rounded-full bg-black/50 backdrop-blur-md text-white text-[11px] font-bold text-center leading-tight">
                {hintText}
              </p>
            </div>
          )}
        </div>

        {/* Controles */}
        <div className="flex items-center justify-between gap-4 px-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Elegir de la galería"
            className="size-12 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-white/80 dark:border-white/10 flex items-center justify-center text-gray-600 dark:text-gray-300 shadow-sm active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined">image</span>
          </button>

          {/* Obturador con anillo de progreso del disparo automático */}
          <button
            onClick={() => shoot(false)}
            disabled={camera.status !== 'ready'}
            aria-label="Capturar"
            className="relative size-[74px] rounded-full flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
          >
            <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(50,97,5,0.15)" strokeWidth="6" />
              <circle
                cx="50" cy="50" r="45" fill="none"
                stroke="#326105" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 45}
                strokeDashoffset={2 * Math.PI * 45 * (1 - (autoCapture ? detectionProgress : 0))}
                style={{ transition: 'stroke-dashoffset 120ms linear' }}
              />
            </svg>
            <span className="size-[52px] rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[28px]">photo_camera</span>
            </span>
          </button>

          {pages.length > 0 ? (
            <button
              onClick={() => setStage('review')}
              aria-label={`Ver ${pages.length} páginas`}
              className="relative size-12 rounded-2xl overflow-hidden border-2 border-primary shadow-sm active:scale-95 transition-transform"
            >
              <img src={pages[pages.length - 1].dataUrl} alt="" className="size-full object-cover" />
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center border-2 border-white">
                {pages.length}
              </span>
            </button>
          ) : (
            <div className="size-12" />
          )}
        </div>

        {/* Disparo automático */}
        <button
          onClick={() => setAutoCapture(v => !v)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${autoCapture
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-white/60 dark:bg-slate-800/60 border-white/70 dark:border-white/10 text-gray-500 dark:text-gray-400'
            }`}
        >
          <span className="material-symbols-outlined text-xl">
            {autoCapture ? 'motion_photos_auto' : 'photo_camera'}
          </span>
          <span className="flex-1 text-left">
            <span className="block text-[11px] font-black uppercase tracking-widest">
              Captura automática {autoCapture ? 'activada' : 'desactivada'}
            </span>
            <span className="block text-[10px] font-bold opacity-70">
              {autoCapture ? 'Dispara solo al estabilizar el encuadre' : 'Solo captura al pulsar el botón'}
            </span>
          </span>
        </button>

        <input
          type="file"
          accept="image/*"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFilePick}
        />
      </div>
    );
  };

  return (
    <div className="relative font-display bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-2xl lg:max-w-3xl mx-auto pb-28 lg:pb-8 overflow-hidden">
      <div className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/40 dark:border-slate-700/40 p-4 flex items-center justify-between shadow-sm">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 dark:bg-slate-700/50 rounded-full border border-white/40 dark:border-slate-600/40 shadow-sm text-gray-700 dark:text-gray-300">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-black text-gray-900 dark:text-white">
          {stage === 'capture' ? 'Escanear' : stage === 'adjust' ? 'Ajustar bordes' : 'Revisar páginas'}
        </h2>
        <div className="size-10" />
      </div>

      <div className="p-4 space-y-6 relative z-10">
        {stage === 'capture' && renderCameraStage()}

        {stage === 'adjust' && imgUrl && (
          <div className="space-y-4">
            <div
              className="relative rounded-[24px] overflow-hidden bg-black select-none touch-none"
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
            >
              <img ref={imgElRef} src={imgUrl} alt="captura" className="w-full block" />
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <polygon
                  points={corners.map((p) => `${p.x * displayScale()},${p.y * displayScale()}`).join(' ')}
                  fill="rgba(50,97,5,0.15)" stroke="#326105" strokeWidth="2"
                />
              </svg>
              {corners.map((p, i) => (
                <div
                  key={i}
                  onPointerDown={onHandlePointerDown(i)}
                  className="absolute size-7 -ml-3.5 -mt-3.5 rounded-full bg-white border-4 border-primary shadow-md touch-none"
                  style={{ left: p.x * displayScale(), top: p.y * displayScale() }}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={redetectCorners}
                className="flex-1 h-10 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-white/60 dark:border-white/10 text-gray-600 dark:text-gray-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">auto_fix_high</span> Detectar
              </button>
              <button
                onClick={resetCornersToFullFrame}
                className="flex-1 h-10 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-white/60 dark:border-white/10 text-gray-600 dark:text-gray-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">crop_free</span> Toda la foto
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`h-16 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 ${filter === f.value
                    ? 'bg-primary text-white border-primary shadow-sm shadow-primary/25'
                    : 'bg-white/60 dark:bg-slate-800/60 text-gray-500 dark:text-gray-400 border-white/60 dark:border-white/10'
                    }`}
                >
                  <span className="material-symbols-outlined text-lg">{f.icon}</span>
                  <span className="text-[9px] font-black uppercase tracking-wider">{f.label}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={discardCapture} className="flex-1 h-12 bg-white/50 dark:bg-slate-800/50 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/60 dark:border-white/10 text-gray-600 dark:text-gray-300">
                Descartar
              </button>
              <button onClick={confirmCrop} className="flex-1 h-12 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-base">check</span> Usar página
              </button>
            </div>
          </div>
        )}

        {stage === 'review' && (
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 px-1">
              {pages.length} página{pages.length === 1 ? '' : 's'}
            </h3>

            <div className="grid grid-cols-3 gap-3">
              {pages.map((pg, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden border border-white/80 dark:border-white/10 bg-white shadow-sm">
                  <img src={pg.dataUrl} alt={`página ${i + 1}`} className="w-full aspect-[3/4] object-cover" />
                  <div className="absolute top-1 left-1 flex gap-1">
                    <button onClick={() => movePage(i, -1)} aria-label="Mover antes" className="size-6 bg-black/50 text-white rounded-full flex items-center justify-center"><span className="material-symbols-outlined text-sm">arrow_back</span></button>
                    <button onClick={() => movePage(i, 1)} aria-label="Mover después" className="size-6 bg-black/50 text-white rounded-full flex items-center justify-center"><span className="material-symbols-outlined text-sm">arrow_forward</span></button>
                  </div>
                  <button onClick={() => removePage(i)} aria-label="Eliminar página" className="absolute top-1 right-1 size-6 bg-red-500 text-white rounded-full flex items-center justify-center"><span className="material-symbols-outlined text-sm">close</span></button>
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[9px] font-black">{i + 1}</span>
                </div>
              ))}
            </div>

            {/* Recambio de filtro sobre el recorte original */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 px-1">
                Filtro de todas las páginas
              </p>
              <div className="grid grid-cols-4 gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => applyFilterToAll(f.value)}
                    disabled={refiltering}
                    className={`h-14 rounded-xl border transition-all flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 ${filter === f.value
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white/60 dark:bg-slate-800/60 text-gray-500 dark:text-gray-400 border-white/60 dark:border-white/10'
                      }`}
                  >
                    <span className="material-symbols-outlined text-base">{f.icon}</span>
                    <span className="text-[9px] font-black uppercase tracking-wider">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={() => setStage('capture')} className="w-full h-12 bg-white/60 dark:bg-slate-800/60 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/60 dark:border-white/10 text-gray-700 dark:text-gray-300 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-base">add_a_photo</span> Añadir página
            </button>
            <button onClick={() => setShowFinalize(true)} disabled={pages.length === 0} className="w-full h-14 bg-primary text-white rounded-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 text-xs">
              <span className="material-symbols-outlined">save</span> Guardar PDF
            </button>
          </div>
        )}
      </div>

      {showFinalize && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowFinalize(false)} />
          <div className="relative bg-white/90 backdrop-blur-2xl w-full max-w-[340px] rounded-[32px] p-6 border border-white/80 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-display font-black text-gray-900 text-center">Asignar a cliente</h3>

            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-1">Origen del Documento</label>
              <div className="flex gap-2">
                <button onClick={() => setSource('gestor')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${source === 'gestor' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white/50 text-gray-500 border-white/60'}`}>Gestor</button>
                <button onClick={() => setSource('econexo')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${source === 'econexo' ? 'bg-primary text-white border-primary' : 'bg-white/50 text-gray-500 border-white/60'}`}>EcoNexo</button>
              </div>
            </div>

            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-1">Empresa Destino</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 focus:ring-primary focus:border-primary">
                <option value="">Seleccionar Empresa...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name || c.id}</option>)}
              </select>
            </div>

            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-1">Tipo de Documento</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 focus:ring-primary focus:border-primary">
                {docTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-1">Fecha del Documento</label>
              <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 focus:ring-primary focus:border-primary" />
            </div>

            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-1">Título</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Documento escaneado" className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 focus:ring-primary focus:border-primary" />
            </div>

            <button onClick={handleSave} disabled={saving} className="w-full h-14 bg-primary text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">save</span>}
              {saving ? 'Guardando…' : 'Guardar y asignar'}
            </button>
            <button onClick={() => setShowFinalize(false)} className="w-full h-10 text-gray-400 text-[10px] font-black uppercase tracking-widest">Cancelar</button>
          </div>
        </div>
      )}

      <Navbar />
    </div>
  );
};

export default Scan;
