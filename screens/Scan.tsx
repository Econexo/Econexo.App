import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useToast } from '../components/ui/Toast';
import { supabase } from '../services/supabase';
import { detectDocument, warpDocument, applyFilter, FilterMode } from '../services/docScanner';
import { buildScanPdf, ScanPage } from '../services/scanToPdf';
import { uploadScannedDocument } from '../services/documentUpload';
import type { Point } from '../services/scanGeometry';

type Stage = 'capture' | 'adjust' | 'review';

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

const Scan: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [stage, setStage] = useState<Stage>('capture');
  const [filter, setFilter] = useState<FilterMode>('bw');
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [saving, setSaving] = useState(false);
  const [showFinalize, setShowFinalize] = useState(false);
  const [title, setTitle] = useState('');

  // Client assignment (mirrors the admin "Subir Documento" modal)
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [clientId, setClientId] = useState('');
  const [source, setSource] = useState<'gestor' | 'econexo'>('gestor');
  const [docType, setDocType] = useState('declaration');
  const [docDate, setDocDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Source image + adjustable corners (natural-image coordinates)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [corners, setCorners] = useState<Point[]>([]);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('profiles').select('id, company_name').order('company_name')
      .then(({ data }) => setClients(data || []));
  }, []);

  const docTypes = source === 'econexo' ? ECONEXO_TYPES : GESTOR_TYPES;
  // Keep docType valid when the source toggles between the two type lists.
  useEffect(() => {
    if (!docTypes.some((t) => t.value === docType)) setDocType(docTypes[0].value);
  }, [source]);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      sourceCanvasRef.current = canvas;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImgUrl(url);

      const detected = detectDocument(canvas);
      setCorners(detected ?? [
        { x: img.naturalWidth * 0.1, y: img.naturalHeight * 0.1 },
        { x: img.naturalWidth * 0.9, y: img.naturalHeight * 0.1 },
        { x: img.naturalWidth * 0.9, y: img.naturalHeight * 0.9 },
        { x: img.naturalWidth * 0.1, y: img.naturalHeight * 0.9 },
      ]);
      setStage('adjust');
    };
    img.src = url;
  };

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

  const confirmCrop = () => {
    try {
      const warped = warpDocument(sourceCanvasRef.current!, corners);
      const filtered = applyFilter(warped, filter);
      const dataUrl = filtered.toDataURL('image/jpeg', 0.9);
      setPages((prev) => [...prev, { dataUrl, width: filtered.width, height: filtered.height }]);
      if (imgUrl) URL.revokeObjectURL(imgUrl);
      setImgUrl(null);
      setStage('review');
    } catch (err: any) {
      toast.error('Error al procesar la página: ' + (err.message || 'desconocido'));
    }
  };

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

  return (
    <div className="relative font-display bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-8 overflow-hidden">
      <div className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/40 dark:border-slate-700/40 p-4 flex items-center justify-between shadow-sm">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 dark:bg-slate-700/50 rounded-full border border-white/40 dark:border-slate-600/40 shadow-sm text-gray-700 dark:text-gray-300">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-black text-gray-900 dark:text-white">Escanear Documento</h2>
        <div className="size-10" />
      </div>

      <div className="p-4 space-y-6 relative z-10">
        {stage === 'capture' && (
          <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed border-white/80 dark:border-slate-600/80 rounded-[32px] bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl">
            <div className="size-20 rounded-3xl bg-primary/10 flex items-center justify-center text-primary mb-6 border border-primary/20">
              <span className="material-symbols-outlined text-4xl">document_scanner</span>
            </div>
            <h3 className="font-black text-lg text-center mb-2 text-gray-900 dark:text-white">Capturar página</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8 font-bold">Toma una foto al documento. Detectaremos los bordes automáticamente.</p>
            <button onClick={() => fileInputRef.current?.click()} className="w-full h-14 bg-primary text-background-dark rounded-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform text-xs">
              <span className="material-symbols-outlined">add_a_photo</span>
              {pages.length === 0 ? 'Capturar' : 'Añadir página'}
            </button>
            <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleCapture} />
            {pages.length > 0 && (
              <button onClick={() => setStage('review')} className="mt-3 text-primary text-[11px] font-black uppercase tracking-widest">
                Volver a las {pages.length} página(s)
              </button>
            )}
          </div>
        )}

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
              {(['bw', 'gray', 'color'] as FilterMode[]).map((m) => (
                <button key={m} onClick={() => setFilter(m)} className={`flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${filter === m ? 'bg-primary text-white border-primary' : 'bg-white/60 text-gray-500 border-white/60'}`}>
                  {m === 'bw' ? 'B/N' : m === 'gray' ? 'Gris' : 'Color'}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => { if (imgUrl) URL.revokeObjectURL(imgUrl); setImgUrl(null); setStage(pages.length ? 'review' : 'capture'); }} className="flex-1 h-12 bg-white/50 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/60 text-gray-600">
                Cancelar
              </button>
              <button onClick={confirmCrop} className="flex-1 h-12 bg-primary text-background-dark rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-base">check</span> Usar página
              </button>
            </div>
          </div>
        )}

        {stage === 'review' && (
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 px-1">{pages.length} página(s)</h3>
            <div className="grid grid-cols-3 gap-3">
              {pages.map((pg, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden border border-white/80 bg-white shadow-sm">
                  <img src={pg.dataUrl} alt={`pág ${i + 1}`} className="w-full aspect-[3/4] object-cover" />
                  <div className="absolute top-1 left-1 flex gap-1">
                    <button onClick={() => movePage(i, -1)} className="size-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center"><span className="material-symbols-outlined text-sm">arrow_back</span></button>
                    <button onClick={() => movePage(i, 1)} className="size-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center"><span className="material-symbols-outlined text-sm">arrow_forward</span></button>
                  </div>
                  <button onClick={() => removePage(i)} className="absolute top-1 right-1 size-6 bg-red-500 text-white rounded-full flex items-center justify-center"><span className="material-symbols-outlined text-sm">close</span></button>
                </div>
              ))}
            </div>

            <button onClick={() => setStage('capture')} className="w-full h-12 bg-white/60 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/60 text-gray-700 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-base">add_a_photo</span> Añadir página
            </button>
            <button onClick={() => setShowFinalize(true)} disabled={pages.length === 0} className="w-full h-14 bg-primary text-background-dark rounded-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 text-xs">
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

            <button onClick={handleSave} disabled={saving} className="w-full h-14 bg-primary text-background-dark rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
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
