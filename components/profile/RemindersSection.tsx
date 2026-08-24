import React from 'react';
import { ReminderPrefs, DEFAULT_REMINDER_PREFS } from '../../types';

interface RemindersSectionProps {
    prefs: ReminderPrefs;
    saving: boolean;
    onChange: (prefs: ReminderPrefs) => void;
}

const DAY_OPTIONS = [7, 3, 2, 1, 0];

const dayLabel = (d: number) => (d === 0 ? 'El mismo día' : d === 1 ? '1 día antes' : `${d} días antes`);

/** Preferencias del barrido diario que avisa de retiros próximos y certificados mensuales. */
const RemindersSection: React.FC<RemindersSectionProps> = ({ prefs, saving, onChange }) => {
    const p = { ...DEFAULT_REMINDER_PREFS, ...prefs };

    const toggleDay = (d: number) => {
        const current = p.withdrawal_days_before;
        const next = current.includes(d)
            ? current.filter(x => x !== d)
            : [...current, d].sort((a, b) => b - a);
        // Al menos un aviso: si se desmarca el último, se conserva.
        onChange({ ...p, withdrawal_days_before: next.length ? next : current });
    };

    return (
        <section>
            <div className="flex items-center justify-between mb-2 pl-2">
                <h4 className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">
                    Recordatorios
                </h4>
                {saving && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Guardando…</span>
                )}
            </div>

            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/80 dark:border-white/10 p-5 space-y-5 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] transition-all">
                {/* Interruptor general */}
                <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                        <h5 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest">
                            Avisos automáticos
                        </h5>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold leading-snug">
                            Retiros próximos y certificado mensual, por app, push y correo.
                        </p>
                    </div>
                    <label className="inline-flex items-center cursor-pointer shrink-0">
                        <input
                            type="checkbox"
                            checked={p.enabled}
                            onChange={e => onChange({ ...p, enabled: e.target.checked })}
                            className="sr-only peer"
                        />
                        <div className="relative w-11 h-6 bg-gray-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                    </label>
                </div>

                <div className={`space-y-5 transition-opacity ${p.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
                    <div className="h-px bg-gray-100 dark:bg-white/10" />

                    {/* Antelación de retiros */}
                    <div className="space-y-2.5">
                        <div className="flex items-center gap-2.5">
                            <span className="material-symbols-outlined text-primary text-lg">local_shipping</span>
                            <p className="text-[10px] font-black text-gray-700 dark:text-gray-200 uppercase tracking-widest">
                                Avisarme de un retiro
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {DAY_OPTIONS.map(d => {
                                const on = p.withdrawal_days_before.includes(d);
                                return (
                                    <button
                                        key={d}
                                        onClick={() => toggleDay(d)}
                                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${on
                                            ? 'bg-primary text-white border-primary shadow-sm shadow-primary/25'
                                            : 'bg-white/50 dark:bg-slate-800/50 text-gray-500 dark:text-gray-400 border-white/60 dark:border-white/10'
                                            }`}
                                    >
                                        {dayLabel(d)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="h-px bg-gray-100 dark:bg-white/10" />

                    {/* Día del certificado mensual */}
                    <div className="space-y-2.5">
                        <div className="flex items-center gap-2.5">
                            <span className="material-symbols-outlined text-primary text-lg">workspace_premium</span>
                            <p className="text-[10px] font-black text-gray-700 dark:text-gray-200 uppercase tracking-widest">
                                Certificado mensual
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <select
                                value={p.certificate_day}
                                onChange={e => onChange({ ...p, certificate_day: Number(e.target.value) })}
                                className="bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary"
                            >
                                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                    <option key={d} value={d}>Día {d}</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold leading-snug flex-1">
                                de cada mes te avisamos si el certificado del mes anterior ya está disponible
                                o sigue pendiente.
                            </p>
                        </div>
                    </div>

                    <div className="h-px bg-gray-100 dark:bg-white/10" />

                    {/* Copia a correos adicionales */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                            <h5 className="text-[10px] font-black text-gray-700 dark:text-gray-200 uppercase tracking-widest">
                                Copiar a los correos de aviso
                            </h5>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold leading-snug">
                                Los recordatorios también llegan a los correos adicionales.
                            </p>
                        </div>
                        <label className="inline-flex items-center cursor-pointer shrink-0">
                            <input
                                type="checkbox"
                                checked={p.copy_extra_emails}
                                onChange={e => onChange({ ...p, copy_extra_emails: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="relative w-11 h-6 bg-gray-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                        </label>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default RemindersSection;
