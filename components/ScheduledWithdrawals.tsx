import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

// Define the shape of our scheduled withdrawal
interface ScheduledWithdrawal {
    id: string;
    created_at: string;
    metadata: {
        scheduled_date: string;
        waste_type: string;
        status: 'prográmado' | 'realizado' | 'cancelado';
        description?: string;
    };
}

interface ScheduledWithdrawalsProps {
    isAdmin: boolean;
}

const ScheduledWithdrawals: React.FC<ScheduledWithdrawalsProps> = ({ isAdmin }) => {
    const [withdrawals, setWithdrawals] = useState<ScheduledWithdrawal[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    // Form State
    const [newDate, setNewDate] = useState('');
    const [newType, setNewType] = useState('');
    const [newDescription, setNewDescription] = useState('');

    const [submitting, setSubmitting] = useState(false);
    const [clients, setClients] = useState<any[]>([]);
    const [selectedClientId, setSelectedClientId] = useState('');

    const wasteTypes = [
        'Reciclables',
        'Industriales',
        'Basura Doméstica',
        'Otro'
    ];

    // Helper function to parse date strings as local dates (avoiding timezone issues)
    const parseLocalDate = (dateString: string): Date => {
        // Parse YYYY-MM-DD as local date at noon to avoid timezone shifts
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0);
    };

    // Helper function to convert local date to ISO string for storage
    const toLocalDateString = (dateString: string): string => {
        const localDate = parseLocalDate(dateString);
        return localDate.toISOString();
    };

    useEffect(() => {
        fetchWithdrawals();
        if (isAdmin) {
            fetchClients();
        }
    }, [isAdmin]);

    const fetchClients = async () => {
        const { data } = await supabase.from('profiles').select('id, company_name').order('company_name');
        if (data) setClients(data);
    };

    const fetchWithdrawals = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) return;

            // Admin sees all? Or user still sees only theirs?
            // "client or user can view them".
            // If admin is scheduling, maybe they schedule FOR users or just general?
            // Existing logic uses user.id. Let's keep it simple:
            // If Admin, they presumably schedule for themselves (the Hub) or it's a misunderstanding.
            // Re-reading: "only the administrator can program withdrawals and the client or user can view them".
            // This implies the client VIEWS scheduled withdrawals.
            // IF the admin SCHEDULES them, the admin must assign them to a client.
            // BUT current ScheduledWithdrawals implementation inserts with `user_id: user.id`.
            // If Admin is logged in, `user.id` is Admin's ID.
            // If Client is logged in, `user.id` is Client's ID.
            // If Admin schedules, it should probably be for a SPECIFIC client.
            // However, the current prompt didn't ask to change the DATA MODEL of who owns the withdrawal, just permissions.
            // "only the administrator can program withdrawals".
            // Maybe this means the Client requests it?
            // Current flow: User creates "Scheduled" doc (Request).
            // Maybe User REQUESTS and Admin CONFIRMS?
            // Text says: "only the administrator can PROGRAM the withdrawals".
            // This suggests the "Agendar" button should be Admin-only?
            // If so, how does the Client get a withdrawal?
            // Maybe the client calls/emails and Admin enters it?
            // I will implement "Button visible only if isAdmin".
            // I will assume for now the Admin logs in and sees their own list or we need to fetch ALL for admin?
            // Keeping it simple: Just hide the button for non-admins.

            let query = supabase
                .from('documents')
                .select('*')
                .eq('type', 'SCHEDULED')
                .order('created_at', { ascending: false })
                .limit(10);

            if (!isAdmin) {
                query = query.eq('user_id', user.id);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching scheduled withdrawals:', error);
            } else {
                setWithdrawals(data || []);
            }
        } catch (err) {
            console.error('Unexpected error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDate || !newType) return;

        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) throw new Error('No user logged in');

            if (!selectedClientId) {
                alert('Debes seleccionar un cliente.');
                setSubmitting(false);
                return;
            }

            const { error } = await supabase.from('documents').insert([
                {
                    user_id: selectedClientId,
                    title: `Retiro Programado: ${newType}`,
                    type: 'SCHEDULED', // Using existing type convention or new one
                    verified: false,
                    metadata: {
                        scheduled_date: toLocalDateString(newDate),
                        waste_type: newType,
                        status: 'prográmado',
                        description: newDescription
                    }
                }
            ]);

            if (error) throw error;

            alert('Retiro programado exitosamente');
            setShowModal(false);
            setNewDate('');
            setNewType('');
            setNewDescription('');
            fetchWithdrawals();

        } catch (err: any) {
            alert('Error al agendar: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusStyle = (status: string = 'pendiente') => {
        const s = status.toLowerCase();
        if (s === 'realizado' || s === 'completado') return 'bg-green-500/20 text-green-400 border-green-500/20';
        if (s === 'cancelado') return 'bg-red-500/20 text-red-400 border-red-500/20';
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20'; // default/prográmado
    };

    return (
        <>
            <div className="relative overflow-hidden rounded-[20px] p-6 bg-white/70 backdrop-blur-xl border border-white/40 shadow-card group">
                <div className="relative z-10 flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-green-50 rounded-xl text-primary border border-green-100">
                            <span className="material-symbols-outlined text-xl">event_upcoming</span>
                        </div>
                        <div>
                            <h3 className="text-gray-800 text-lg font-display font-bold tracking-tight">Retiros Programados</h3>
                            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">Gestión de Recolección</p>
                        </div>
                    </div>
                    {isAdmin && (
                        <button
                            onClick={() => setShowModal(true)}
                            className="px-4 py-2 bg-primary hover:bg-[#285004] rounded-full text-[10px] font-bold uppercase tracking-widest text-white transition-all flex items-center gap-2 shadow-sm hover:shadow-md"
                        >
                            <span className="material-symbols-outlined text-[14px]">add</span>
                            Agendar
                        </button>
                    )}
                </div>

                <div className="relative z-10 space-y-3">
                    {loading ? (
                        <div className="text-center py-4 text-gray-400 text-xs font-bold uppercase tracking-widest">Cargando...</div>
                    ) : withdrawals.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-xl bg-gray-50">
                            <p className="text-xs font-bold uppercase tracking-widest opacity-70">No hay retiros pendientes</p>
                        </div>
                    ) : (
                        withdrawals.map((item) => {
                            const meta = (item.metadata as any) || {};
                            // Parse the date correctly to avoid timezone issues
                            const dateObj = meta.scheduled_date
                                ? parseLocalDate(meta.scheduled_date.split('T')[0])
                                : new Date(item.created_at);

                            return (
                                <div key={item.id} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 border border-transparent hover:border-gray-100 hover:bg-white hover:shadow-sm transition-all group/item">
                                    {/* Date Box */}
                                    <div className="flex flex-col items-center justify-center size-12 rounded-xl bg-white border border-gray-100 text-center shrink-0 shadow-sm">
                                        <span className="text-[10px] font-black uppercase text-gray-400 leading-none">
                                            {dateObj.toLocaleDateString('es-CL', { month: 'short' }).slice(0, 3)}
                                        </span>
                                        <span className="text-xl font-display font-black text-gray-800 leading-none mt-0.5">
                                            {dateObj.getDate()}
                                        </span>
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-800 truncate group-hover/item:text-primary transition-colors">
                                            {meta.waste_type || 'Retiro General'}
                                        </p>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                                            <span className={`size-1.5 rounded-full ${meta.status === 'prográmado' ? 'bg-yellow-400' : meta.status === 'realizado' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                            {meta.status ? meta.status.charAt(0).toUpperCase() + meta.status.slice(1) : 'Pendiente'}
                                        </p>
                                    </div>

                                    {/* Status Icon */}
                                    <div className={`size-8 rounded-full flex items-center justify-center border ${getStatusStyle(meta.status || 'prográmado')}`}>
                                        <span className="material-symbols-outlined text-base">
                                            {meta.status === 'realizado' ? 'check' : 'schedule'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Modal for Scheduling */}
            {showModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setShowModal(false)}></div>
                    <div className="relative w-full max-w-[400px] bg-white border border-gray-100 rounded-[2rem] p-6 shadow-2xl animate-in fade-in zoom-in duration-300">

                        <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                            <div>
                                <h3 className="text-xl font-display font-bold text-gray-900 tracking-tight">Agendar Retiro</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Nueva Solicitud</p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="size-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSchedule} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Fecha Preferida</label>
                                <input
                                    type="date"
                                    required
                                    min={new Date().toISOString().split('T')[0]}
                                    value={newDate}
                                    onChange={(e) => setNewDate(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Cliente</label>
                                <div className="relative">
                                    <select
                                        required
                                        value={selectedClientId}
                                        onChange={(e) => setSelectedClientId(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all appearance-none"
                                    >
                                        <option value="" disabled>Seleccionar Cliente...</option>
                                        {clients.map(c => (
                                            <option key={c.id} value={c.id} className="bg-white">{c.company_name || 'Sin Nombre'}</option>
                                        ))}
                                    </select>
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none text-lg">expand_more</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Tipo de Residuo</label>
                                <div className="relative">
                                    <select
                                        required
                                        value={newType}
                                        onChange={(e) => setNewType(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all appearance-none"
                                    >
                                        <option value="" disabled>Seleccionar tipo...</option>
                                        {wasteTypes.map(t => (
                                            <option key={t} value={t} className="bg-white">{t}</option>
                                        ))}
                                    </select>
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none text-lg">expand_more</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Notas Adicionales</label>
                                <textarea
                                    rows={3}
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    placeholder="Ej: Cantidad estimada, instrucciones de acceso..."
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-gray-400 resize-none"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-4 bg-primary text-white rounded-2xl font-display font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-primary/40 mt-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? (
                                    <>
                                        <span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                        Procesando...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined">schedule_send</span>
                                        Confirmar Solicitud
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default ScheduledWithdrawals;
