import React, { useState, useMemo } from 'react';
import { AdminDocument, AdminUserProfile, AdminPath, MONTH_NAMES, MONTH_SHORT } from './types';

interface DocumentsHistoryProps {
    certs: AdminDocument[];
    users: AdminUserProfile[];
    adminPath: AdminPath;
    onPathChange: (path: AdminPath) => void;
    onViewCert: (cert: AdminDocument, action: 'preview' | 'save') => void;
    onDeleteCert: (cert: AdminDocument) => void;
    onOpenCRModal: (user: AdminUserProfile) => void;
    onOpenMonthlyModal: (user: AdminUserProfile) => void;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
    CR:      { label: 'CR',      color: 'bg-green-100 text-green-700' },
    CGM:     { label: 'CGM',     color: 'bg-orange-100 text-orange-700' },
    report:  { label: 'Reporte', color: 'bg-blue-100 text-blue-700' },
    pdf:     { label: 'PDF',     color: 'bg-purple-100 text-purple-700' },
    guia:          { label: 'Guía',   color: 'bg-teal-100 text-teal-700' },
    oc:            { label: 'OC',     color: 'bg-indigo-100 text-indigo-700' },
    ticket_pesaje: { label: 'Pesaje', color: 'bg-amber-100 text-amber-700' },
    cdf:           { label: 'CDF',    color: 'bg-rose-100 text-rose-700' },
    custom:  { label: 'Especial',color: 'bg-gray-100 text-gray-600' },
};

const DocumentsHistory: React.FC<DocumentsHistoryProps> = ({
    certs,
    users,
    adminPath,
    onPathChange,
    onViewCert,
    onDeleteCert,
    onOpenCRModal,
    onOpenMonthlyModal,
}) => {
    const currentYear = new Date().getFullYear();

    // ── Filter state ──
    const [filterYear, setFilterYear] = useState<number>(currentYear);
    const [filterMonth, setFilterMonth] = useState<number | null>(null);   // null = todos los meses
    const [filterCompany, setFilterCompany] = useState<string>('');         // '' = todas
    const [filterType, setFilterType] = useState<string>('');              // '' = todos
    const [showCGMPanel, setShowCGMPanel] = useState(false);
    const [expandedCert, setExpandedCert] = useState<string | null>(null);

    // ── Available years in dataset ──
    const availableYears = useMemo(() => {
        const years = Array.from(new Set(certs.map(c => new Date(c.created_at).getFullYear())));
        return years.sort((a, b) => b - a);
    }, [certs]);

    // ── Unique companies in dataset ──
    const availableCompanies = useMemo(() => {
        const seen = new Map<string, string>();
        certs.forEach(c => { if (c._clientId && !seen.has(c._clientId)) seen.set(c._clientId, c._companyName || 'Desconocido'); });
        return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [certs]);

    // ── Filtered certs ──
    const filtered = useMemo(() => {
        return certs.filter(c => {
            const d = new Date(c.created_at);
            if (d.getFullYear() !== filterYear) return false;
            if (filterMonth !== null && d.getMonth() !== filterMonth) return false;
            if (filterCompany && c._clientId !== filterCompany) return false;
            if (filterType && c.type !== filterType) return false;
            return true;
        }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [certs, filterYear, filterMonth, filterCompany, filterType]);

    // ── Stats for filtered set ──
    const stats = useMemo(() => {
        let totalKg = 0;
        let crCount = 0;
        filtered.forEach(c => {
            if (c.type === 'CR' || c.type === 'CGM') {
                const details = c.metadata?.waste_details || [];
                totalKg += details.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
            }
            if (c.type === 'CR') crCount++;
        });
        return { totalKg, crCount, total: filtered.length };
    }, [filtered]);

    // ── Group by month for summary view ──
    const byMonth = useMemo(() => {
        if (filterMonth !== null) return null; // don't group when a month is selected
        const groups: Record<number, AdminDocument[]> = {};
        filtered.forEach(c => {
            const m = new Date(c.created_at).getMonth();
            if (!groups[m]) groups[m] = [];
            groups[m].push(c);
        });
        return groups;
    }, [filtered, filterMonth]);

    const toggleMonth = (m: number) => setFilterMonth(prev => prev === m ? null : m);

    const fmtKg = (kg: number) => kg % 1 === 0 ? `${kg}` : kg.toFixed(2);

    const certUserId = (cert: AdminDocument) =>
        users.find(u => u.id === cert.user_id) || null;

    // ─────────────────────────────────────────────────────────────────────────
    // CGM Panel (generate monthly certs)
    // ─────────────────────────────────────────────────────────────────────────
    if (showCGMPanel) {
        const usersWithCR = users.filter(u => certs.some(c => c.user_id === u.id && c.type === 'CR'));
        return (
            <section className="space-y-4">
                <div className="flex items-center gap-3 px-1">
                    <button onClick={() => setShowCGMPanel(false)} className="size-8 bg-white/60 hover:bg-white rounded-full flex items-center justify-center shadow-sm transition-all">
                        <span className="material-symbols-outlined text-gray-600 text-sm">arrow_back</span>
                    </button>
                    <div>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Sección</p>
                        <p className="text-xs font-black text-gray-900">Generar Certificados Mensuales</p>
                    </div>
                </div>
                <div className="space-y-3">
                    {usersWithCR.length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-6">No hay empresas con CRs emitidos.</p>
                    )}
                    {usersWithCR.map(u => (
                        <div key={u.id} className="bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border border-white/80 shadow-sm flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="size-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center font-black border border-orange-100 uppercase text-sm">
                                    {u.company_name?.[0]}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-sm truncate text-gray-900">{u.company_name}</p>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{u.rut}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => onOpenMonthlyModal(u)}
                                className="px-3 py-2 bg-orange-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all flex items-center gap-1.5 shrink-0"
                            >
                                <span className="material-symbols-outlined text-base">post_add</span>
                                Generar CGM
                            </button>
                        </div>
                    ))}
                </div>
            </section>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Main view
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <section className="space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Documentos Emitidos</h3>
                <div className="flex items-center gap-2">
                    <span className="bg-primary/20 text-primary text-[10px] font-black px-2 py-0.5 rounded-full">{certs.length} total</span>
                    <button
                        onClick={() => setShowCGMPanel(true)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors"
                    >
                        <span className="material-symbols-outlined text-[12px]">calendar_add_on</span>
                        Generar CGM
                    </button>
                </div>
            </div>

            {/* ── Filter Panel ── */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/80 shadow-sm p-4 space-y-3">

                {/* Row 1: Year + Type + Company */}
                <div className="grid grid-cols-3 gap-2">
                    {/* Year */}
                    <select
                        value={filterYear}
                        onChange={e => { setFilterYear(Number(e.target.value)); setFilterMonth(null); }}
                        className="col-span-1 px-2 py-1.5 text-xs font-bold border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white text-gray-800"
                    >
                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>

                    {/* Type filter */}
                    <select
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        className="col-span-1 px-2 py-1.5 text-xs font-bold border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white text-gray-800"
                    >
                        <option value="">Todos los tipos</option>
                        <option value="CR">CR</option>
                        <option value="CGM">CGM</option>
                        <option value="report">Reporte</option>
                        <option value="pdf">PDF</option>
                        <option value="custom">Especial</option>
                    </select>

                    {/* Company filter */}
                    <select
                        value={filterCompany}
                        onChange={e => setFilterCompany(e.target.value)}
                        className="col-span-1 px-2 py-1.5 text-xs font-bold border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white text-gray-800"
                    >
                        <option value="">Todas las empresas</option>
                        {availableCompanies.map(([id, name]) => (
                            <option key={id} value={id}>{name}</option>
                        ))}
                    </select>
                </div>

                {/* Row 2: Month pills */}
                <div className="flex flex-wrap gap-1.5">
                    <button
                        onClick={() => setFilterMonth(null)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black transition-colors ${filterMonth === null ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                        Todo
                    </button>
                    {MONTH_SHORT.map((name, idx) => {
                        const hasData = certs.some(c => {
                            const d = new Date(c.created_at);
                            return d.getFullYear() === filterYear && d.getMonth() === idx;
                        });
                        const isSelected = filterMonth === idx;
                        return (
                            <button
                                key={idx}
                                onClick={() => hasData ? toggleMonth(idx) : undefined}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-black transition-colors ${
                                    isSelected
                                        ? 'bg-primary text-white'
                                        : hasData
                                            ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                            : 'bg-gray-50 text-gray-300 cursor-default'
                                }`}
                            >
                                {name}
                            </button>
                        );
                    })}
                </div>

                {/* Row 3: Stats for current filter */}
                <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600">
                        <span className="material-symbols-outlined text-[14px] text-primary">description</span>
                        <span><strong className="text-gray-900">{stats.total}</strong> docs</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600">
                        <span className="material-symbols-outlined text-[14px] text-green-600">scale</span>
                        <span><strong className="text-gray-900">{fmtKg(stats.totalKg)}</strong> Kg gestionados</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600">
                        <span className="material-symbols-outlined text-[14px] text-blue-500">verified</span>
                        <span><strong className="text-gray-900">{stats.crCount}</strong> CRs</span>
                    </div>
                    {(filterMonth !== null || filterCompany || filterType) && (
                        <button
                            onClick={() => { setFilterMonth(null); setFilterCompany(''); setFilterType(''); }}
                            className="ml-auto text-[10px] font-black text-red-400 hover:text-red-600 flex items-center gap-0.5"
                        >
                            <span className="material-symbols-outlined text-[12px]">close</span>
                            Limpiar filtros
                        </button>
                    )}
                </div>
            </div>

            {/* ── Documents list ── */}
            {filtered.length === 0 ? (
                <div className="p-10 text-center bg-white/40 backdrop-blur-sm rounded-3xl border border-dashed border-gray-200">
                    <span className="material-symbols-outlined text-4xl text-gray-300 block mb-2">search_off</span>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Sin resultados</p>
                    <p className="text-[10px] text-gray-400 mt-1">Prueba cambiando los filtros</p>
                </div>
            ) : filterMonth === null && byMonth ? (
                // ── GROUPED BY MONTH (when no month filter) ──
                <div className="space-y-5">
                    {Object.entries(byMonth)
                        .sort(([a], [b]) => Number(b) - Number(a))
                        .map(([monthIdx, monthCerts]) => {
                            const monthKg = monthCerts.reduce((s, c) => {
                                const details = c.metadata?.waste_details || [];
                                return s + details.reduce((ss: number, i: any) => ss + (Number(i.quantity) || 0), 0);
                            }, 0);
                            return (
                                <div key={monthIdx}>
                                    {/* Month header */}
                                    <div className="flex items-center gap-3 mb-2 px-1">
                                        <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-primary text-[14px]">calendar_month</span>
                                        </div>
                                        <div className="flex-1 flex items-baseline gap-2">
                                            <button
                                                onClick={() => toggleMonth(Number(monthIdx))}
                                                className="text-sm font-black text-gray-900 hover:text-primary transition-colors"
                                            >
                                                {MONTH_NAMES[Number(monthIdx)]} {filterYear}
                                            </button>
                                            <span className="text-[10px] text-gray-400 font-bold">{monthCerts.length} docs · {fmtKg(monthKg)} Kg</span>
                                        </div>
                                    </div>
                                    {/* Certs in this month */}
                                    <div className="space-y-2 pl-2 border-l-2 border-primary/10 ml-3">
                                        {monthCerts.map(cert => (
                                            <CertCard
                                                key={cert.id}
                                                cert={cert}
                                                expanded={expandedCert === cert.id}
                                                onToggle={() => setExpandedCert(prev => prev === cert.id ? null : cert.id)}
                                                onViewCert={onViewCert}
                                                onDeleteCert={onDeleteCert}
                                                onOpenCRModal={onOpenCRModal}
                                                certUser={certUserId(cert)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                </div>
            ) : (
                // ── FLAT LIST (when month is selected) ──
                <div className="space-y-2">
                    {filtered.map(cert => (
                        <CertCard
                            key={cert.id}
                            cert={cert}
                            expanded={expandedCert === cert.id}
                            onToggle={() => setExpandedCert(prev => prev === cert.id ? null : cert.id)}
                            onViewCert={onViewCert}
                            onDeleteCert={onDeleteCert}
                            onOpenCRModal={onOpenCRModal}
                            certUser={certUserId(cert)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// CertCard sub-component
// ─────────────────────────────────────────────────────────────────────────────
interface CertCardProps {
    cert: AdminDocument;
    expanded: boolean;
    onToggle: () => void;
    onViewCert: (cert: AdminDocument, action: 'preview' | 'save') => void;
    onDeleteCert: (cert: AdminDocument) => void;
    onOpenCRModal: (user: AdminUserProfile) => void;
    certUser: AdminUserProfile | null;
}

const CertCard: React.FC<CertCardProps> = ({ cert, expanded, onToggle, onViewCert, onDeleteCert, onOpenCRModal, certUser }) => {
    const typeInfo = TYPE_LABELS[cert.type || ''] || { label: cert.type || '?', color: 'bg-gray-100 text-gray-500' };
    const details: any[] = cert.metadata?.waste_details || [];
    const totalKg = details.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const certDate = new Date(cert.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return (
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-white/80 shadow-sm overflow-hidden">
            {/* Main row */}
            <div className="flex items-center gap-3 px-3 py-2.5">
                <button onClick={onToggle} className="flex-1 flex items-center gap-3 text-left min-w-0 overflow-hidden">
                    <div className="flex flex-col items-start gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${typeInfo.color}`}>{typeInfo.label}</span>
                            <p className="text-xs font-bold text-gray-900 truncate min-w-0">{cert._companyName || 'Sin nombre'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <p className="text-[10px] text-gray-500 truncate max-w-[160px]">{cert.metadata?.cert_number || cert.title}</p>
                            <span className="text-[9px] text-gray-400">{certDate}</span>
                        </div>
                    </div>
                    {totalKg > 0 && (
                        <span className="text-[10px] font-black text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-100 shrink-0">
                            {totalKg % 1 === 0 ? totalKg : totalKg.toFixed(2)} Kg
                        </span>
                    )}
                    <span className={`material-symbols-outlined text-gray-400 text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}>
                        expand_more
                    </span>
                </button>

                {/* Quick actions always visible */}
                <div className="flex gap-1 shrink-0">
                    <button
                        onClick={() => onViewCert(cert, 'preview')}
                        title="Vista previa"
                        className="size-7 bg-primary/10 text-primary rounded-lg flex items-center justify-center hover:bg-primary/20 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[14px]">visibility</span>
                    </button>
                    <button
                        onClick={() => onViewCert(cert, 'save')}
                        title="Descargar"
                        className="size-7 bg-gray-100 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[14px]">download</span>
                    </button>
                    <button
                        onClick={() => onDeleteCert(cert)}
                        title="Eliminar"
                        className="size-7 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-100 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[14px]">delete</span>
                    </button>
                </div>
            </div>

            {/* Expanded detail */}
            {expanded && (
                <div className="border-t border-gray-100 px-3 py-2.5 bg-gray-50/60 space-y-2">
                    {/* Waste breakdown */}
                    {details.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Residuos</p>
                            {details.map((item: any, i: number) => (
                                <div key={i} className="flex items-center justify-between text-[10px]">
                                    <span className="text-gray-700 font-bold">{item.waste_type}{item.description ? ` — ${item.description}` : ''}</span>
                                    <span className="font-black text-green-700">{item.quantity} {item.unit}</span>
                                </div>
                            ))}
                            <div className="flex justify-between text-[10px] font-black border-t border-gray-200 pt-1 mt-1">
                                <span className="text-gray-500">Total</span>
                                <span className="text-green-700">{totalKg % 1 === 0 ? totalKg : totalKg.toFixed(2)} Kg</span>
                            </div>
                        </div>
                    )}
                    {/* Nuevo CR for this company */}
                    {certUser && cert.type !== 'CGM' && (
                        <button
                            onClick={() => onOpenCRModal(certUser)}
                            className="w-full py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[10px] font-black flex items-center justify-center gap-1 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[12px]">add</span>
                            Nuevo CR para esta empresa
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default DocumentsHistory;
