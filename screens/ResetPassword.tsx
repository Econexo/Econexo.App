
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';

const ResetPassword: React.FC = () => {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        // Check if we have a session (meaning the magic link worked)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                // If no session, it might be expired or invalid link
                setError('Enlace inválido o expirado. Por favor solicita uno nuevo.');
            }
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            setLoading(false);
            return;
        }

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            setLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) throw error;

            setSuccess('¡Contraseña actualizada correctamente!');
            setTimeout(() => {
                navigate('/');
            }, 3000);
        } catch (err: any) {
            console.error("Reset error:", err);
            setError(err.message || 'Error al actualizar la contraseña.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative font-sans text-slate-900 min-h-screen flex flex-col justify-between overflow-x-hidden antialiased selection:bg-primary/30 bg-[#f0f4f0]">
            <style>{`
            @keyframes blob {
                0% { transform: translate(0px, 0px) scale(1); }
                33% { transform: translate(30px, -50px) scale(1.1); }
                66% { transform: translate(-20px, 20px) scale(0.9); }
                100% { transform: translate(0px, 0px) scale(1); }
            }
            .animate-blob { animation: blob 7s infinite; }
            .animation-delay-2000 { animation-delay: 2s; }
            .animation-delay-4000 { animation-delay: 4s; }
        `}</style>

            {/* Animated Background */}
            <div className="fixed inset-0 z-0 bg-[#f0f4f0]">
                <div className="absolute top-0 -left-4 w-72 h-72 bg-primary/20 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
                <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-500/20 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-500/20 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
            </div>

            <div className="relative z-10 flex-1 flex flex-col items-center justify-center w-full max-w-[480px] mx-auto px-6 py-8">
                <div className="mb-8 relative group cursor-default">
                    <div className="absolute -inset-4 bg-primary/30 rounded-full blur-3xl opacity-50 group-hover:opacity-100 transition duration-1000"></div>
                    <div className="relative size-24 bg-white/60 backdrop-blur-xl rounded-[2rem] border border-white/60 flex items-center justify-center overflow-hidden shadow-2xl ring-1 ring-white/50 group-hover:scale-105 transition-transform duration-500">
                        <img src="/logo_econexo_new.png" alt="Econexo" className="h-16 w-auto object-contain" />
                    </div>
                </div>

                <div className="w-full text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <h1 className="text-gray-900 tracking-tighter text-3xl font-display font-black leading-tight mb-2">Restablecer Contraseña</h1>
                    <p className="text-gray-500 text-sm font-medium">Ingresa tu nueva contraseña</p>
                </div>

                {error && (
                    <div className="w-full p-4 mb-6 bg-red-100 border border-red-200 rounded-2xl text-red-500 text-[11px] font-bold uppercase tracking-tight text-center flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-4 backdrop-blur-sm">
                        <span className="material-symbols-outlined text-sm">error</span>
                        <span className="flex-1">{error}</span>
                    </div>
                )}

                {success && (
                    <div className="w-full p-4 mb-6 bg-green-100 border border-green-200 rounded-2xl text-green-500 text-[11px] font-bold uppercase tracking-tight text-center flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-4 backdrop-blur-sm">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        <span className="flex-1">{success}</span>
                    </div>
                )}

                <form className="w-full flex flex-col gap-4 bg-white/60 backdrop-blur-2xl rounded-[32px] p-6 border border-white/80 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]" onSubmit={handleSubmit}>
                    <div className="flex flex-col group">
                        <label className="text-gray-500 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Nueva Contraseña</label>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors text-[20px]">lock</span>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-xl bg-white/50 h-14 pl-12 pr-4 border border-white/60 focus:border-primary/50 text-gray-900 shadow-sm focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-400 focus:bg-white/80" placeholder="••••••••" required />
                        </div>
                    </div>

                    <div className="flex flex-col group">
                        <label className="text-gray-500 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Confirmar Contraseña</label>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors text-[20px]">lock_reset</span>
                            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full rounded-xl bg-white/50 h-14 pl-12 pr-4 border border-white/60 focus:border-primary/50 text-gray-900 shadow-sm focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-400 focus:bg-white/80" placeholder="••••••••" required />
                        </div>
                    </div>

                    <button type="submit" disabled={loading} className="mt-4 w-full h-16 bg-gradient-to-r from-primary to-primary-light text-background-dark text-sm font-display font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98] transition-all relative overflow-hidden group">
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                        <span className="relative flex items-center justify-center gap-2">
                            {loading ? <span className="animate-spin material-symbols-outlined">progress_activity</span> : 'Actualizar Contraseña'}
                            {!loading && <span className="material-symbols-outlined">save</span>}
                        </span>
                    </button>
                </form>

                <button onClick={() => navigate('/')} className="mt-8 text-gray-500 hover:text-gray-900 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 group">
                    <span className="material-symbols-outlined text-base group-hover:-translate-x-1 transition-transform">arrow_back</span>
                    <span>Volver al inicio</span>
                </button>
            </div>

            <div className="relative z-10 w-full p-6 text-center">
                <p className="text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] hover:text-gray-600 transition-colors cursor-default">Econexo © 2024 • Gestión Inteligente de Residuos</p>
            </div>
        </div>
    );
};

export default ResetPassword;
