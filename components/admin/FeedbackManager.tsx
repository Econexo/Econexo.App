import React, { useEffect, useState } from 'react';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import {
    FeedbackDraft, FeedbackItem, FeedbackItemType, FeedbackPriority, ITEM_TYPE_META, MONTH_NAMES,
    countsText, defaultPeriod, monthPeriod, quarterPeriod, validateReport, validateSave,
    previousQuarter, detectPeriod,
} from '../../utils/feedback';
import {
    FeedbackReport, listCompanyReports, saveReport, publishReport, deleteReport,
} from '../../services/feedbackService';

interface FeedbackManagerProps {
    companyId: string;
    companyName: string;
    onClose: () => void;
}

type PeriodMode = 'month' | 'quarter' | 'custom';

const emptyDraft = (): FeedbackDraft => {
    const p = defaultPeriod();
    return { period_start: p.start, period_end: p.end, period_label: p.label, summary: '', items: [] };
};

const newItem = (type: FeedbackItemType): FeedbackItem => ({
    id: crypto.randomUUID(), type, title: '', detail: '', ...(type === 'hallazgo' ? { priority: 'media' as FeedbackPriority } : {}),
});

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

const inputCls = 'w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:border-primary';
const labelCls = 'text-[10px] font-black uppercase text-gray-400';

const FeedbackManager: React.FC<FeedbackManagerProps> = ({ companyId, companyName, onClose }) => {
    const toast = useToast();
    const confirm = useConfirm();

    const [reports, setReports] = useState<FeedbackReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<FeedbackReport | null>(null);
    const [draft, setDraft] = useState<FeedbackDraft | null>(null);
    const [saving, setSaving] = useState(false);

    // Selectores de período del editor. Mes y trimestre llevan cada uno su año:
    // en febrero el mes anterior es de este año y el trimestre anterior del pasado.
    const now = new Date();
    const [mode, setMode] = useState<PeriodMode>('month');
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [quarterYear, setQuarterYear] = useState(now.getFullYear());
    const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(1);

    const load = async () => {
        setLoading(true);
        try {
            setReports(await listCompanyReports(companyId, true));
        } catch (err: any) {
            toast.error(`No se pudieron cargar los informes: ${err.message ?? err}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [companyId]);

    const openNew = () => {
        const d = emptyDraft();
        const start = new Date(`${d.period_start}T12:00:00`);
        const pq = previousQuarter();
        setMode('month');
        setYear(start.getFullYear());
        setMonth(start.getMonth());
        setQuarterYear(pq.year);
        setQuarter(pq.quarter);
        setEditing(null);
        setDraft({ ...d, items: [newItem('hallazgo')] });
    };

    // Los selectores parten del período guardado, para que cambiar de modo no
    // lo reemplace por lo que haya quedado del informe anterior.
    const openExisting = (r: FeedbackReport) => {
        const p = detectPeriod(r.period_start, r.period_end);
        setMode(p.mode);
        setYear(p.year);
        setMonth(p.month);
        setQuarterYear(p.year);
        setQuarter(p.quarter);
        setEditing(r);
        setDraft({
            period_start: r.period_start, period_end: r.period_end, period_label: r.period_label,
            summary: r.summary, items: r.items,
        });
    };

    const closeEditor = () => { setEditing(null); setDraft(null); };

    const applyPeriod = (m: PeriodMode, y: number, mo: number, q: 1 | 2 | 3 | 4) => {
        if (m === 'custom') return;
        const p = m === 'month' ? monthPeriod(y, mo) : quarterPeriod(y, q);
        setDraft(d => d && ({ ...d, period_start: p.start, period_end: p.end, period_label: p.label }));
    };

    const patchItem = (id: string, patch: Partial<FeedbackItem>) =>
        setDraft(d => d && ({ ...d, items: d.items.map(i => i.id === id ? { ...i, ...patch } : i) }));

    const changeType = (id: string, type: FeedbackItemType) =>
        patchItem(id, type === 'hallazgo' ? { type, priority: 'media' } : { type, priority: undefined });

    const handleSave = async () => {
        if (!draft) return;
        const invalid = validateSave(draft, editing?.status ?? 'draft');
        if (invalid) { toast.warning(invalid); return; }
        setSaving(true);
        try {
            const saved = await saveReport(companyId, draft, editing);
            toast.success(saved.status === 'published' ? 'Cambios guardados.' : 'Borrador guardado.');
            closeEditor();
            load();
        } catch (err: any) {
            toast.error(`No se pudo guardar: ${err.message ?? err}`);
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        if (!draft) return;
        const invalid = validateReport(draft);
        if (invalid) { toast.warning(invalid); return; }
        const republish = editing?.status === 'published';
        const ok = await confirm({
            title: republish ? 'Actualizar informe publicado' : 'Publicar retroalimentación',
            message: republish
                ? `Se actualizará el informe de ${draft.period_label} que ${companyName} ya puede ver. No se enviará un nuevo aviso.`
                : `${companyName} verá este informe de ${draft.period_label} y recibirá un aviso por notificación y correo.`,
            confirmLabel: republish ? 'Actualizar' : 'Publicar',
        });
        if (!ok) return;
        setSaving(true);
        try {
            const { notifyFailed } = await publishReport(companyId, companyName, draft, editing);
            if (notifyFailed) toast.warning('Informe publicado, pero el aviso a la empresa falló.');
            else toast.success(republish ? 'Informe actualizado.' : 'Informe publicado y empresa avisada.');
            closeEditor();
            load();
        } catch (err: any) {
            toast.error(`No se pudo publicar: ${err.message ?? err}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!editing) { closeEditor(); return; }
        const ok = await confirm({
            title: 'Eliminar informe',
            message: editing.status === 'published'
                ? `La empresa dejará de ver el informe de ${editing.period_label}. Esto no se puede deshacer.`
                : `Se eliminará el borrador de ${editing.period_label}.`,
            confirmLabel: 'Eliminar',
            danger: true,
        });
        if (!ok) return;
        setSaving(true);
        try {
            await deleteReport(editing.id);
            toast.success('Informe eliminado.');
            closeEditor();
            load();
        } catch (err: any) {
            toast.error(`No se pudo eliminar: ${err.message ?? err}`);
        } finally {
            setSaving(false);
        }
    };

    const statusBadge = (r: FeedbackReport) => {
        if (r.status === 'draft') return <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Borrador</span>;
        if (r.read_at) return <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700">Leído el {fmtDate(r.read_at)}</span>;
        return <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">Publicado · sin leer</span>;
    };

    const years = [...new Set([now.getFullYear() - 1, now.getFullYear(), year, quarterYear])].sort();

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
            <div className="relative bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 p-5 border-b border-gray-100">
                    {draft && (
                        <button onClick={closeEditor} disabled={saving} className="size-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                            <span className="material-symbols-outlined text-gray-500 text-lg">arrow_back</span>
                        </button>
                    )}
                    <div className="flex-1 min-w-0">
                        <h2 className="font-black text-gray-900 text-lg leading-tight truncate">Retroalimentación</h2>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate">{companyName}</p>
                    </div>
                    <button onClick={onClose} disabled={saving} className="size-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                        <span className="material-symbols-outlined text-gray-500 text-lg">close</span>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-5 space-y-5">
                    {!draft ? (
                        /* ── Lista ── */
                        <>
                            <button onClick={openNew} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-white font-black text-sm hover:bg-primary/90 transition-colors">
                                <span className="material-symbols-outlined text-lg">add</span>
                                Nueva retroalimentación
                            </button>
                            {loading ? (
                                <div className="flex justify-center py-10">
                                    <div className="size-8 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
                                </div>
                            ) : reports.length === 0 ? (
                                <p className="text-center text-xs text-gray-400 font-bold py-8">Todavía no hay informes para esta empresa.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {reports.map(r => (
                                        <li key={r.id}>
                                            <button onClick={() => openExisting(r)} className="w-full text-left p-4 rounded-2xl border border-gray-100 hover:border-primary/30 hover:bg-primary/5 transition-colors">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="font-black text-gray-900 text-sm">{r.period_label}</p>
                                                    {statusBadge(r)}
                                                </div>
                                                <p className="text-xs text-gray-500 font-bold mt-1">{countsText(r.items) || 'Sin puntos'}</p>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    ) : (
                        /* ── Editor ── */
                        <>
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    {(['month', 'quarter', 'custom'] as PeriodMode[]).map(m => (
                                        <button
                                            key={m}
                                            onClick={() => { setMode(m); applyPeriod(m, m === 'quarter' ? quarterYear : year, month, quarter); }}
                                            className={`flex-1 py-2 rounded-xl text-xs font-black border transition-colors ${mode === m ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200'}`}
                                        >
                                            {m === 'month' ? 'Mes' : m === 'quarter' ? 'Trimestre' : 'Personalizado'}
                                        </button>
                                    ))}
                                </div>

                                {mode === 'month' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <select className={inputCls} value={month} onChange={e => { const v = +e.target.value; setMonth(v); applyPeriod('month', year, v, quarter); }}>
                                            {MONTH_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
                                        </select>
                                        <select className={inputCls} value={year} onChange={e => { const v = +e.target.value; setYear(v); applyPeriod('month', v, month, quarter); }}>
                                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                    </div>
                                )}

                                {mode === 'quarter' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <select className={inputCls} value={quarter} onChange={e => { const v = +e.target.value as 1 | 2 | 3 | 4; setQuarter(v); applyPeriod('quarter', quarterYear, month, v); }}>
                                            {[1, 2, 3, 4].map(q => <option key={q} value={q}>T{q}</option>)}
                                        </select>
                                        <select className={inputCls} value={quarterYear} onChange={e => { const v = +e.target.value; setQuarterYear(v); applyPeriod('quarter', v, month, quarter); }}>
                                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                    </div>
                                )}

                                {mode === 'custom' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelCls}>Desde</label>
                                            <input type="date" className={inputCls} value={draft.period_start} onChange={e => setDraft({ ...draft, period_start: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Hasta</label>
                                            <input type="date" className={inputCls} value={draft.period_end} onChange={e => setDraft({ ...draft, period_end: e.target.value })} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className={labelCls}>Etiqueta que ve la empresa</label>
                                            <input className={inputCls} value={draft.period_label} placeholder="Ej: Temporada alta 2026" onChange={e => setDraft({ ...draft, period_label: e.target.value })} />
                                        </div>
                                    </div>
                                )}
                                {mode !== 'custom' && (
                                    <p className="text-xs text-gray-500 font-bold">Período: {draft.period_label}</p>
                                )}
                            </div>

                            <div>
                                <label className={labelCls}>Resumen general</label>
                                <textarea
                                    className={`${inputCls} min-h-[80px] font-medium`}
                                    value={draft.summary}
                                    placeholder="Visión general del período…"
                                    onChange={e => setDraft({ ...draft, summary: e.target.value })}
                                />
                            </div>

                            <div className="space-y-3">
                                <h3 className={labelCls}>Puntos</h3>
                                {draft.items.map(item => (
                                    <div key={item.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50 space-y-2">
                                        <div className="flex items-center gap-2">
                                            {(['hallazgo', 'sugerencia', 'logro'] as FeedbackItemType[]).map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => changeType(item.id, t)}
                                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase border transition-colors ${item.type === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'}`}
                                                >
                                                    <span className="material-symbols-outlined text-sm">{ITEM_TYPE_META[t].icon}</span>
                                                    {ITEM_TYPE_META[t].label}
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => setDraft({ ...draft, items: draft.items.filter(i => i.id !== item.id) })}
                                                className="ml-auto size-8 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 flex items-center justify-center"
                                                title="Quitar punto"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                        <input className={inputCls} value={item.title} placeholder="Título" onChange={e => patchItem(item.id, { title: e.target.value })} />
                                        <textarea className={`${inputCls} min-h-[60px] font-medium`} value={item.detail} placeholder="Detalle (opcional)" onChange={e => patchItem(item.id, { detail: e.target.value })} />
                                        {item.type === 'hallazgo' && (
                                            <select className={inputCls} value={item.priority ?? 'media'} onChange={e => patchItem(item.id, { priority: e.target.value as FeedbackPriority })}>
                                                <option value="alta">Prioridad alta</option>
                                                <option value="media">Prioridad media</option>
                                                <option value="baja">Prioridad baja</option>
                                            </select>
                                        )}
                                    </div>
                                ))}
                                <div className="grid grid-cols-3 gap-2">
                                    {(['hallazgo', 'sugerencia', 'logro'] as FeedbackItemType[]).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setDraft({ ...draft, items: [...draft.items, newItem(t)] })}
                                            className="flex items-center justify-center gap-1 py-2 rounded-xl border border-dashed border-gray-300 text-[10px] font-black uppercase text-gray-500 hover:border-primary hover:text-primary"
                                        >
                                            <span className="material-symbols-outlined text-sm">add</span>
                                            {ITEM_TYPE_META[t].label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {draft && (
                    <div className="p-4 border-t border-gray-100 flex gap-2">
                        <button onClick={handleDelete} disabled={saving} className="size-11 shrink-0 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center" title="Eliminar">
                            <span className="material-symbols-outlined">delete</span>
                        </button>
                        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-black text-sm hover:bg-gray-50 disabled:opacity-50">
                            {editing?.status === 'published' ? 'Guardar cambios' : 'Guardar borrador'}
                        </button>
                        <button onClick={handlePublish} disabled={saving} className="flex-1 py-3 rounded-xl bg-primary text-white font-black text-sm hover:bg-primary/90 disabled:opacity-50">
                            {editing?.status === 'published' ? 'Actualizar' : 'Publicar'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FeedbackManager;
