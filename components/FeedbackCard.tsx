import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { FeedbackReport, latestPublished } from '../services/feedbackService';
import { countByType, FeedbackItemType, ITEM_TYPE_META } from '../utils/feedback';

// Tarjeta del Dashboard con la última retroalimentación publicada. Se carga
// sola; si no hay informes (o la tabla aún no existe) no muestra nada.
const FeedbackCard: React.FC = () => {
    const navigate = useNavigate();
    const [report, setReport] = useState<FeedbackReport | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            try {
                const latest = await latestPublished(user.id);
                if (!cancelled) setReport(latest);
            } catch {
                // Sin tabla o sin permiso: la tarjeta simplemente no aparece.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (!report) return null;

    const counts = countByType(report.items);
    const unread = !report.read_at;

    return (
        <section
            onClick={() => navigate('/retroalimentacion')}
            className="relative overflow-hidden rounded-[20px] p-5 bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/80 dark:border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group"
        >
            <div className="flex items-center gap-4">
                <div className="relative size-12 shrink-0 rounded-2xl bg-sky-50 dark:bg-sky-900/30 text-sky-600 flex items-center justify-center border border-sky-100 dark:border-sky-800/40 group-hover:scale-110 transition-transform duration-500">
                    <span className="material-symbols-outlined text-2xl">rate_review</span>
                    {unread && <span className="absolute -top-1 -right-1 size-3 rounded-full bg-primary ring-2 ring-white dark:ring-slate-900" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-gray-900 dark:text-white truncate">Retroalimentación de Econexo</h3>
                        {unread && <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary text-white">Nuevo</span>}
                    </div>
                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">{report.period_label}</p>
                    <div className="flex flex-wrap gap-3 mt-1.5">
                        {(Object.keys(counts) as FeedbackItemType[]).filter(t => counts[t] > 0).map(t => (
                            <span key={t} className="flex items-center gap-1 text-[10px] font-black text-gray-600 dark:text-gray-300">
                                <span className="material-symbols-outlined text-sm">{ITEM_TYPE_META[t].icon}</span>
                                {counts[t]} {(counts[t] === 1 ? ITEM_TYPE_META[t].label : ITEM_TYPE_META[t].plural).toLowerCase()}
                            </span>
                        ))}
                    </div>
                </div>
                <span className="material-symbols-outlined text-gray-400 group-hover:text-primary transition-colors">arrow_forward</span>
            </div>
        </section>
    );
};

export default FeedbackCard;
