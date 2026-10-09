import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import FeedbackItemList from '../components/FeedbackItemList';
import { supabase } from '../services/supabase';
import { FeedbackReport, listCompanyReports, markRead } from '../services/feedbackService';
import { countsText } from '../utils/feedback';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

const Feedback: React.FC = () => {
    const navigate = useNavigate();
    const [reports, setReports] = useState<FeedbackReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [openId, setOpenId] = useState<string | null>(null);

    // Marca leído en la base y en pantalla; si falla no molesta a la empresa.
    const open = (r: FeedbackReport) => {
        setOpenId(prev => prev === r.id ? null : r.id);
        if (!r.read_at) {
            markRead(r.id).catch(() => {});
            setReports(prev => prev.map(x => x.id === r.id ? { ...x, read_at: new Date().toISOString() } : x));
        }
    };

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }
            try {
                const list = await listCompanyReports(user.id, false);
                setReports(list);
                if (list[0]) open(list[0]);
            } catch {
                setReports([]);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    return (
        <div className="relative font-sans bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-3xl lg:max-w-5xl mx-auto pb-28 md:pb-8 overflow-hidden">
            <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/40 dark:border-slate-700/40 shadow-sm">
                <div className="p-4 flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 rounded-full border border-white/40 dark:border-slate-600/40 shadow-sm transition-all">
                        <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">arrow_back</span>
                    </button>
                    <h2 className="text-lg font-display font-black text-gray-900 dark:text-white">Retroalimentación</h2>
                </div>
            </div>

            <main className="relative p-5 space-y-3">
                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="size-10 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
                    </div>
                ) : reports.length === 0 ? (
                    <div className="text-center py-16 space-y-2">
                        <span className="material-symbols-outlined text-5xl text-gray-300 dark:text-gray-600">rate_review</span>
                        <p className="text-sm font-black text-gray-500 dark:text-gray-400">Aún no tienes retroalimentación</p>
                        <p className="text-xs font-bold text-gray-400 dark:text-gray-500">Cuando Econexo publique un informe de tu gestión, aparecerá aquí.</p>
                    </div>
                ) : (
                    reports.map(r => {
                        const isOpen = openId === r.id;
                        return (
                            <article key={r.id} className="rounded-[20px] bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/80 dark:border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] overflow-hidden">
                                <button onClick={() => open(r)} className="w-full text-left p-5 flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-base font-display font-black text-gray-900 dark:text-white">{r.period_label}</p>
                                        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                                            {r.published_at ? `Publicado el ${fmtDate(r.published_at)} · ` : ''}{countsText(r.items)}
                                        </p>
                                    </div>
                                    <span className={`material-symbols-outlined text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                </button>
                                {isOpen && (
                                    <div className="px-5 pb-5 space-y-5">
                                        {r.summary.trim() && (
                                            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-line">{r.summary}</p>
                                        )}
                                        <FeedbackItemList items={r.items} dark />
                                    </div>
                                )}
                            </article>
                        );
                    })
                )}
            </main>

            <Navbar />
        </div>
    );
};

export default Feedback;
