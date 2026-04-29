
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import Navbar from '../components/Navbar';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { useCountUp } from '../hooks/useCountUp';

interface Transaction {
    id: string;
    amount: number;
    reason: string;
    created_at: string;
}

interface Reward {
    id: number;
    title: string;
    description: string;
    cost: number;
    icon: string;
    color: string;
    image: string;
}

const RewardSkeleton = () => (
    <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-3xl p-5 border border-white/80 dark:border-slate-600/50 flex items-center gap-4 animate-pulse">
        <div className="size-14 rounded-2xl bg-gray-200 dark:bg-slate-700 shrink-0" />
        <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-2/3" />
            <div className="h-2.5 bg-gray-200 dark:bg-slate-700 rounded w-full" />
            <div className="h-5 bg-gray-200 dark:bg-slate-700 rounded w-1/4 mt-2" />
        </div>
        <div className="w-16 h-8 bg-gray-200 dark:bg-slate-700 rounded-xl shrink-0" />
    </div>
);

const Rewards: React.FC = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const confirm = useConfirm();
    const [points, setPoints] = useState(0);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [redeeming, setRedeeming] = useState(false);
    const animatedPoints = useCountUp(points);

    const rewards: Reward[] = [
        {
            id: 1,
            title: '15% Descuento Retiro',
            description: 'En el próximo retiro de residuos no peligrosos.',
            cost: 2000,
            icon: 'local_shipping',
            color: 'bg-blue-500',
            image: '/assets/recycled_materials_bg.png'
        },
        {
            id: 2,
            title: '20% Descuento Productos',
            description: 'Válido para esculturas, set de vasos o velas de material reciclado.',
            cost: 2000,
            icon: 'redeem',
            color: 'bg-pink-500',
            image: '/assets/products_discount.png'
        },
        {
            id: 3,
            title: '10% Descuento Talleres',
            description: 'Válido para capacitaciones ambientales o talleres sustentables.',
            cost: 3000,
            icon: 'school',
            color: 'bg-yellow-500',
            image: '/assets/workshops_discount.png'
        }
    ];

    const levels = [
        { title: 'Semilla', min: 0, icon: 'eco', color: 'from-green-500/50 to-emerald-500/50', iconColor: 'text-green-400' },
        { title: 'Brote', min: 1000, icon: 'psychology_alt', color: 'from-emerald-400/50 to-teal-400/50', iconColor: 'text-emerald-400' },
        { title: 'Planta', min: 3000, icon: 'potted_plant', color: 'from-primary/50 to-green-400/50', iconColor: 'text-primary' },
        { title: 'Árbol', min: 6000, icon: 'forest', color: 'from-teal-400/50 to-sky-400/50', iconColor: 'text-teal-300' },
        { title: 'Bosque', min: 10000, icon: 'nature_people', color: 'from-blue-500/50 to-indigo-500/50', iconColor: 'text-indigo-300' },
    ];

    const currentLevelIdx = [...levels].reverse().findIndex(l => points >= l.min);
    const currentLevel = levels[levels.length - 1 - currentLevelIdx] || levels[0];
    const nextLevel = levels[levels.indexOf(currentLevel) + 1];
    const progress = nextLevel
        ? Math.min(Math.max(((points - currentLevel.min) / (nextLevel.min - currentLevel.min)) * 100, 0), 100)
        : 100;

    useEffect(() => {
        fetchPointsAndHistory();
    }, []);

    const fetchPointsAndHistory = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('eco_points')
                .eq('id', user.id)
                .single();

            if (profile) setPoints(profile.eco_points || 0);

            const { data: history } = await supabase
                .from('points_transactions')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (history) setTransactions(history);
        } catch (err) {
            console.error('Error fetching rewards data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRedeem = async (reward: Reward) => {
        if (points < reward.cost) {
            toast.warning(`Te faltan ${(reward.cost - points).toLocaleString()} puntos para canjear esta recompensa.`);
            return;
        }

        const ok = await confirm({
            title: 'Confirmar canje',
            message: `¿Canjear "${reward.title}" por ${reward.cost.toLocaleString()} puntos? Quedarás con ${(points - reward.cost).toLocaleString()} pts.`,
            confirmLabel: 'Sí, canjear',
        });
        if (!ok) return;

        try {
            setRedeeming(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Sin sesión');

            // Deduct points
            const { error: pointsError } = await supabase
                .from('profiles')
                .update({ eco_points: points - reward.cost })
                .eq('id', user.id);
            if (pointsError) throw pointsError;

            // Record transaction
            const { error: txError } = await supabase
                .from('points_transactions')
                .insert([{
                    user_id: user.id,
                    amount: -reward.cost,
                    reason: `Canje: ${reward.title}`,
                }]);
            if (txError) throw txError;

            setPoints(prev => prev - reward.cost);
            toast.success(`¡Canjeaste "${reward.title}"! Nos contactaremos contigo pronto.`);
            fetchPointsAndHistory();
        } catch (err: any) {
            toast.error('Error al canjear: ' + err.message);
        } finally {
            setRedeeming(false);
        }
    };

    return (
        <div className="relative font-sans bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-8 overflow-hidden">
            {/* Decorative Background Blobs */}
            <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
            <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

            <div className="p-6 sticky top-0 z-10 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md flex items-center justify-between border-b border-white/40 dark:border-slate-700/40 shadow-sm">
                <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-700/80 rounded-full border border-white/40 dark:border-slate-600/40 shadow-sm transition-all">
                    <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">arrow_back</span>
                </button>
                <h2 className="text-xl font-display font-black text-gray-900 dark:text-white">Eco-Puntos</h2>
                <div className="size-10"></div>
            </div>

            <main className="p-4 space-y-8 relative z-10">
                {/* Level and Points Summary Header */}
                <section className="relative overflow-hidden rounded-[32px] bg-primary p-8 shadow-2xl group">
                    <div className="absolute inset-0 opacity-20 pointer-events-none group-hover:scale-105 transition-transform duration-1000 mix-blend-overlay">
                        <img
                            src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?q=80&w=800"
                            alt=""
                            className="w-full h-full object-cover grayscale"
                        />
                        <div className="absolute inset-0 bg-primary/40"></div>
                        <div className="absolute inset-0 bg-gradient-to-br from-primary via-transparent to-primary/30 backdrop-blur-[1px]"></div>
                    </div>

                    <div className="relative z-10 space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em]">Rango Actual</p>
                                <div className="flex items-center gap-2">
                                    <span className={`material-symbols-outlined font-bold text-2xl ${currentLevel.iconColor} drop-shadow-glow`}>{currentLevel.icon}</span>
                                    <h3 className="text-2xl font-display font-black text-white tracking-tight uppercase italic">{currentLevel.title}</h3>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-white/70 text-[10px] font-black uppercase tracking-[0.2em]">Impacto</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-display font-black text-white">{animatedPoints.toLocaleString()}</span>
                                    <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">pts</span>
                                </div>
                            </div>
                        </div>

                        {/* Progress Bar Container */}
                        <div className="space-y-3">
                            <div className="h-4 w-full bg-white/10 rounded-full overflow-hidden border border-white/5 p-1 backdrop-blur-sm">
                                <div
                                    className={`h-full rounded-full bg-gradient-to-r ${currentLevel.color} shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all duration-1000 ease-out relative`}
                                    style={{ width: `${progress}%` }}
                                >
                                    <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-shimmer"></div>
                                </div>
                            </div>
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                <span className="text-white/50">{points} pts</span>
                                {nextLevel ? (
                                    <span className="text-white drop-shadow-md">Próximo nivel: {nextLevel.title} ({nextLevel.min} pts)</span>
                                ) : (
                                    <span className="text-white drop-shadow-md underline decoration-2">¡Máximo nivel alcanzado!</span>
                                )}
                            </div>
                        </div>

                        <p className="text-white/80 text-[11px] font-bold leading-relaxed">
                            {nextLevel
                                ? `Te faltan ${(nextLevel.min - points).toLocaleString()} puntos para convertirte en ${nextLevel.title}. ¡Sigue recuperando residuos!`
                                : "Has alcanzado la cima de la sostenibilidad forestal. Eres un guardián de la economía circular."}
                        </p>
                    </div>
                </section>

                {/* Available Rewards */}
                <section className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 px-2">Canjear Recompensas</h3>
                    <div className="space-y-4">
                        {loading ? Array(3).fill(0).map((_, i) => <RewardSkeleton key={i} />) : rewards.map(reward => (
                            <div key={reward.id} className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-3xl p-5 border border-white/80 dark:border-slate-600/50 flex items-center gap-4 group relative overflow-hidden transition-all hover:border-primary/30 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] hover:shadow-lg hover:scale-[1.02] cursor-pointer">
                                {/* Subtle Icon Watermark */}
                                <div className="absolute top-0 right-0 opacity-[0.03] pointer-events-none transform translate-x-1/4 -translate-y-1/4">
                                    <span className="material-symbols-outlined text-[120px]">{reward.icon}</span>
                                </div>

                                <div className={`relative z-10 size-14 rounded-2xl ${reward.color}/10 text-${reward.color.replace('bg-', '')} flex items-center justify-center border border-${reward.color.replace('bg-', '')}/20 group-hover:scale-110 transition-transform shadow-sm`}>
                                    <span className={`material-symbols-outlined text-3xl font-bold`}>{reward.icon}</span>
                                </div>
                                <div className="relative z-10 flex-1 space-y-1">
                                    <div className="flex flex-col">
                                        {reward.title.includes('%') ? (
                                            <>
                                                <span className="bg-primary text-white text-[10px] font-black px-2 py-0.5 rounded-md w-fit mb-1 shadow-sm">
                                                    {reward.title.split(' ')[0]}
                                                </span>
                                                <h4 className="font-display font-black text-sm text-gray-900 dark:text-white leading-tight">
                                                    {reward.title.split(' ').slice(1).join(' ')}
                                                </h4>
                                            </>
                                        ) : (
                                            <h4 className="font-display font-black text-sm text-gray-900 dark:text-white leading-tight">{reward.title}</h4>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-gray-600 dark:text-gray-400 font-bold leading-tight line-clamp-2">{reward.description}</p>
                                    <div className="pt-2 flex items-center gap-2">
                                        <span className="text-xs font-black text-primary bg-green-50/50 px-2 py-0.5 rounded-md border border-green-100 backdrop-blur-sm">{reward.cost.toLocaleString()} pts</span>
                                    </div>
                                </div>
                                <button
                                    disabled={points < reward.cost || redeeming}
                                    onClick={() => handleRedeem(reward)}
                                    className={`relative z-10 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${points >= reward.cost
                                        ? 'bg-primary text-white shadow-glow active:scale-95 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                                        : 'bg-white/20 text-gray-400 border border-white/10 cursor-not-allowed'
                                        }`}
                                >
                                    {redeeming ? '...' : points >= reward.cost ? 'Canjear' : `${(reward.cost - points).toLocaleString()} pts`}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                {/* History */}
                <section className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 px-2">Historial de Puntos</h3>
                    {loading ? (
                        <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[32px] overflow-hidden border border-white/80 dark:border-slate-600/50 animate-pulse">
                            {Array(3).fill(0).map((_, i) => (
                                <div key={i} className={`p-4 flex items-center justify-between ${i < 2 ? 'border-b border-gray-100 dark:border-slate-700' : ''}`}>
                                    <div className="space-y-2">
                                        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-40" />
                                        <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded w-20" />
                                    </div>
                                    <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-12" />
                                </div>
                            ))}
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="p-10 text-center bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm rounded-3xl border border-dashed border-gray-300 dark:border-slate-600 flex flex-col items-center gap-3">
                            <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-slate-600">receipt_long</span>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">Aún no tienes movimientos</p>
                        </div>
                    ) : (
                        <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[32px] overflow-hidden border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]">
                            {transactions.map((t, idx) => (
                                <div key={t.id} className={`p-4 flex items-center justify-between ${idx !== transactions.length - 1 ? 'border-b border-white/40 dark:border-slate-700/40' : ''} hover:bg-white/40 dark:hover:bg-slate-700/40 transition-colors`}>
                                    <div className="space-y-1">
                                        <p className="text-[13px] font-bold text-gray-900 dark:text-white">{t.reason}</p>
                                        <p className="text-[9px] text-gray-500 dark:text-gray-400 font-black uppercase">{new Date(t.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <span className={`font-display font-black text-sm ${t.amount > 0 ? 'text-primary' : 'text-red-400'}`}>
                                        {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>

            <Navbar />
        </div>
    );
};

export default Rewards;
