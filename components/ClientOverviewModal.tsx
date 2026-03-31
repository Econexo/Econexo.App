import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { generateCR, generateEcoReport, generateCGM } from '../services/pdfGenerator';
import { materialFactors, normalizeMaterialType } from '../utils/materialCalculations';
import { useToast } from '../components/ui/Toast';

interface UserProfile {
    id: string;
    company_name: string;
    rut: string;
    address: string;
    company_email?: string;
    eco_points?: number;
}

interface ClientOverviewModalProps {
    user: UserProfile;
    onClose: () => void;
    onGenerateCR: () => void;
    onGenerateCGM: () => void;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ClientOverviewModal: React.FC<ClientOverviewModalProps> = ({ user, onClose, onGenerateCR, onGenerateCGM }) => {
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [documents, setDocuments] = useState<any[]>([]);
    const [ecoPoints, setEcoPoints] = useState(0);

    // Computed stats
    const [stats, setStats] = useState({
        totalKg: 0,
        co2Evitado: 0,
        breakdown: [] as { label: string; kg: number; color: string }[],
    });

    // Eco-Report generation state
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportMonth, setReportMonth] = useState(new Date().getMonth());
    const [reportYear, setReportYear] = useState(new Date().getFullYear());
    const [reportPeriodType, setReportPeriodType] = useState<'month' | 'year'>('month');

    const MATERIAL_COLORS: Record<string, string> = {
        'Papel/Cartón': '#3B82F6',
        'Plásticos': '#F59E0B',
        'Vidrio': '#10B981',
        'Metales': '#6B7280',
        'Aluminio': '#8B5CF6',
        'Electrónicos': '#EC4899',
        'Orgánicos': '#84CC16',
        'Otros': '#9CA3AF',
    };

    useEffect(() => {
        fetchClientData();
    }, [user.id]);

    const fetchClientData = async () => {
        setLoading(true);
        try {
            // Fetch all docs
            const { data: docs } = await supabase
                .from('documents')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            // Fetch eco points from profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('eco_points')
                .eq('id', user.id)
                .single();
            setEcoPoints(profile?.eco_points || 0);

            // Compute stats from CR documents
            const crDocs = (docs || []).filter((d: any) => d.type === 'CR' && d.metadata?.waste_details);
            const materialData: Record<string, number> = {};
            let totalKg = 0;
            let totalCO2 = 0;

            crDocs.forEach((doc: any) => {
                const items: any[] = Array.isArray(doc.metadata.waste_details)
                    ? doc.metadata.waste_details : [doc.metadata.waste_details];
                items.forEach((item: any) => {
                    const qty = Number(item.quantity) || 0;
                    const cat = normalizeMaterialType(item);
                    const factors = materialFactors[cat] || materialFactors['Otros'];
                    materialData[cat] = (materialData[cat] || 0) + qty;
                    totalKg += qty;
                    totalCO2 += qty * factors.co2;
                });
            });

            const breakdown = Object.entries(materialData)
                .filter(([, kg]) => kg > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([label, kg]) => ({ label, kg, color: MATERIAL_COLORS[label] || '#9CA3AF' }));

            setStats({ totalKg, co2Evitado: totalCO2, breakdown });
            setDocuments(docs || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateEcoReport = async () => {
        // Gather items from CR docs in the selected period
        const startDate = reportPeriodType === 'month'
            ? new Date(reportYear, reportMonth, 1)
            : new Date(reportYear, 0, 1);
        const endDate = reportPeriodType === 'month'
            ? new Date(reportYear, reportMonth + 1, 0)
            : new Date(reportYear, 11, 31);

        const crDocs = documents.filter((d: any) =>
            d.type === 'CR' && d.metadata?.waste_details &&
            new Date(d.created_at) >= startDate &&
            new Date(d.created_at) <= endDate
        );

        if (crDocs.length === 0) {
            toast.warning('No hay CRs en el período seleccionado para generar el reporte.');
            return;
        }

        const allItems: any[] = [];
        crDocs.forEach((doc: any) => {
            const items = Array.isArray(doc.metadata.waste_details)
                ? doc.metadata.waste_details : [doc.metadata.waste_details];
            allItems.push(...items);
        });

        const periodoLabel = reportPeriodType === 'month'
            ? `${MONTH_NAMES[reportMonth]} ${reportYear}`
            : `Año ${reportYear}`;

        generateEcoReport(
            { company_name: user.company_name, rut: user.rut, address: user.address || 'Chile' },
            allItems,
            periodoLabel,
            'save',
            reportPeriodType === 'year' ? 12 : 1
        );
        setShowReportModal(false);
    };

    const handleViewDoc = (doc: any) => {
        const client = { company_name: user.company_name, rut: user.rut, address: user.address || 'Chile' };
        if (!doc.metadata?.waste_details) {
            toast.warning('Este documento no tiene detalles de residuos para previsualizar.');
            return;
        }
        if (doc.type === 'CGM') {
            generateCGM(client, doc.metadata.waste_details, doc.metadata.month || 'Mes', doc.metadata.year || new Date().getFullYear(), 'preview');
        } else if (doc.type === 'pdf' || doc.type === 'report') {
            generateEcoReport(client, doc.metadata.waste_details, doc.metadata.periodo || 'Reporte', 'preview');
        } else {
            generateCR(client, doc.metadata.waste_details, doc.metadata.cert_number || doc.title, 'preview');
        }
    };

    const fmtKg = (n: number) => {
        if (Number.isInteger(n)) return n.toLocaleString('es-CL');
        return (Math.round(n * 10) / 10).toLocaleString('es-CL', { maximumFractionDigits: 1 });
    };

    const recentDocs = documents.slice(0, 6);

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

            <div className="relative bg-white/95 backdrop-blur-2xl w-full max-w-lg xl:max-w-2xl rounded-[32px] border border-white/80 shadow-2xl max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
                {/* ── Header ── */}
                <div className="flex items-center gap-4 p-6 border-b border-gray-100 shrink-0">
                    <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-xl font-black uppercase border border-primary/20">
                        {user.company_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-black text-gray-900 text-lg leading-tight truncate">{user.company_name}</h2>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{user.rut}</p>
                    </div>
                    <button onClick={onClose} className="size-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-gray-500 text-lg">close</span>
                    </button>
                </div>

                {/* ── Scrollable body ── */}
                <div className="overflow-y-auto flex-1 p-6 space-y-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
                        </div>
                    ) : (
                        <>
                            {/* ── KPI Cards ── */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-center">
                                    <p className="text-2xl font-black text-green-700">{fmtKg(stats.totalKg)}</p>
                                    <p className="text-[9px] font-black text-green-500 uppercase tracking-widest mt-0.5">Kg Reciclados</p>
                                </div>
                                <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 text-center">
                                    <p className="text-2xl font-black text-sky-700">{fmtKg(stats.co2Evitado)}</p>
                                    <p className="text-[9px] font-black text-sky-500 uppercase tracking-widest mt-0.5">Kg CO₂ Evitado</p>
                                </div>
                                <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 text-center">
                                    <p className="text-2xl font-black text-yellow-700">{ecoPoints.toLocaleString()}</p>
                                    <p className="text-[9px] font-black text-yellow-500 uppercase tracking-widest mt-0.5">Eco-Puntos</p>
                                </div>
                            </div>

                            {/* ── Material Breakdown ── */}
                            {stats.breakdown.length > 0 && (
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Breakdown por Material</h3>
                                    <div className="space-y-2">
                                        {stats.breakdown.map(item => {
                                            const pct = stats.totalKg > 0 ? (item.kg / stats.totalKg) * 100 : 0;
                                            return (
                                                <div key={item.label} className="flex items-center gap-3">
                                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                                    <span className="text-xs font-bold text-gray-700 w-28 shrink-0">{item.label}</span>
                                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                                                    </div>
                                                    <span className="text-[10px] font-black text-gray-500 w-16 text-right shrink-0">{fmtKg(item.kg)} kg</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {stats.breakdown.length === 0 && (
                                <div className="text-center py-4 text-xs text-gray-400 font-bold">Sin retiros registrados todavía</div>
                            )}

                            {/* ── Actions ── */}
                            <div>
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Generar Documentos</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <button
                                        onClick={() => { onClose(); onGenerateCR(); }}
                                        className="flex flex-col items-center gap-2 p-4 bg-primary/5 border border-primary/20 rounded-2xl hover:bg-primary/10 transition-colors group"
                                    >
                                        <div className="size-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <span className="material-symbols-outlined">verified</span>
                                        </div>
                                        <span className="text-[10px] font-black uppercase text-primary leading-tight text-center">Cert. Recepción</span>
                                    </button>

                                    <button
                                        onClick={() => { onClose(); onGenerateCGM(); }}
                                        className="flex flex-col items-center gap-2 p-4 bg-orange-50 border border-orange-100 rounded-2xl hover:bg-orange-100 transition-colors group"
                                    >
                                        <div className="size-10 bg-orange-100 text-orange-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <span className="material-symbols-outlined">calendar_add_on</span>
                                        </div>
                                        <span className="text-[10px] font-black uppercase text-orange-600 leading-tight text-center">CGM Mensual</span>
                                    </button>

                                    <button
                                        onClick={() => setShowReportModal(true)}
                                        className="flex flex-col items-center gap-2 p-4 bg-green-50 border border-green-100 rounded-2xl hover:bg-green-100 transition-colors group"
                                    >
                                        <div className="size-10 bg-green-100 text-green-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <span className="material-symbols-outlined">bar_chart_4_bars</span>
                                        </div>
                                        <span className="text-[10px] font-black uppercase text-green-700 leading-tight text-center">Eco-Reporte</span>
                                    </button>
                                </div>
                            </div>

                            {/* ── Eco-Report Period Modal ── */}
                            {showReportModal && (
                                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-4">
                                    <h4 className="text-xs font-black uppercase text-gray-600">Configurar Eco-Reporte</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-black uppercase text-gray-400">Tipo</label>
                                            <select
                                                value={reportPeriodType}
                                                onChange={e => setReportPeriodType(e.target.value as any)}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 outline-none mt-1"
                                            >
                                                <option value="month">Mensual</option>
                                                <option value="year">Anual</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase text-gray-400">Año</label>
                                            <input
                                                type="number"
                                                value={reportYear}
                                                onChange={e => setReportYear(Number(e.target.value))}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 outline-none mt-1"
                                            />
                                        </div>
                                    </div>
                                    {reportPeriodType === 'month' && (
                                        <div>
                                            <label className="text-[10px] font-black uppercase text-gray-400">Mes</label>
                                            <select
                                                value={reportMonth}
                                                onChange={e => setReportMonth(Number(e.target.value))}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 outline-none mt-1"
                                            >
                                                {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleGenerateEcoReport}
                                            className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-green-700 transition-colors"
                                        >
                                            Generar PDF
                                        </button>
                                        <button
                                            onClick={() => setShowReportModal(false)}
                                            className="px-4 py-2.5 bg-gray-200 text-gray-600 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-gray-300 transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ── Recent Documents ── */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Documentos Recientes</h3>
                                    <span className="text-[10px] font-bold text-gray-400">{documents.length} total</span>
                                </div>
                                {recentDocs.length === 0 ? (
                                    <p className="text-xs text-gray-400 font-bold text-center py-4">Sin documentos</p>
                                ) : (
                                    <div className="space-y-2">
                                        {recentDocs.map(doc => (
                                            <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                                <div className="size-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 shrink-0">
                                                    <span className="material-symbols-outlined text-base">
                                                        {doc.type === 'CR' ? 'verified' : doc.type === 'CGM' ? 'calendar_today' : doc.type === 'pdf' || doc.type === 'report' ? 'bar_chart' : 'description'}
                                                    </span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-gray-900 truncate">{doc.title}</p>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase">{new Date(doc.created_at).toLocaleDateString()} · <span className="text-primary">{doc.type}</span></p>
                                                </div>
                                                {doc.metadata?.waste_details && (
                                                    <button
                                                        onClick={() => handleViewDoc(doc)}
                                                        className="size-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center hover:bg-primary/20 transition-colors shrink-0"
                                                    >
                                                        <span className="material-symbols-outlined text-base">visibility</span>
                                                    </button>
                                                )}
                                                {doc.file_url && (
                                                    <a
                                                        href={doc.file_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="size-8 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors shrink-0"
                                                    >
                                                        <span className="material-symbols-outlined text-base">download</span>
                                                    </a>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ── Client Info footer ── */}
                            <div className="bg-gray-50 rounded-2xl p-4 grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Dirección</p>
                                    <p className="font-bold text-gray-700 mt-0.5">{user.address || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Email</p>
                                    <p className="font-bold text-gray-700 mt-0.5 truncate">{user.company_email || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Documentos totales</p>
                                    <p className="font-bold text-gray-700 mt-0.5">{documents.length}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">CRs emitidos</p>
                                    <p className="font-bold text-gray-700 mt-0.5">{documents.filter(d => d.type === 'CR').length}</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClientOverviewModal;
