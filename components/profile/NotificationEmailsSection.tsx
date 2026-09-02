import React, { useState } from 'react';
import { validateEmail } from '../../utils/validation';

export const MAX_EXTRA_EMAILS = 2;

interface NotificationEmailsSectionProps {
    emails: string[];
    ownerEmail: string;
    saving: boolean;
    onSave: (emails: string[]) => Promise<void> | void;
}

/**
 * Hasta 2 correos adicionales que reciben copia de los avisos de la empresa
 * (certificados, retiros, documentos, recordatorios). No dan acceso a la cuenta.
 */
const NotificationEmailsSection: React.FC<NotificationEmailsSectionProps> = ({
    emails,
    ownerEmail,
    saving,
    onSave,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const startEditing = () => {
        setDraft(emails.length ? [...emails] : ['']);
        setError(null);
        setIsEditing(true);
    };

    const cancel = () => {
        setIsEditing(false);
        setError(null);
    };

    const updateAt = (i: number, value: string) => {
        setDraft(prev => prev.map((e, idx) => (idx === i ? value : e)));
        setError(null);
    };

    const removeAt = (i: number) => {
        setDraft(prev => prev.filter((_, idx) => idx !== i));
        setError(null);
    };

    const addRow = () => {
        if (draft.length >= MAX_EXTRA_EMAILS) return;
        setDraft(prev => [...prev, '']);
    };

    const save = async () => {
        const cleaned = draft.map(e => e.trim().toLowerCase()).filter(Boolean);

        const invalid = cleaned.find(e => !validateEmail(e));
        if (invalid) { setError(`"${invalid}" no es un correo válido.`); return; }

        if (cleaned.some(e => e === ownerEmail.trim().toLowerCase())) {
            setError('Ese correo ya es el de la cuenta principal; siempre recibe los avisos.');
            return;
        }

        if (new Set(cleaned).size !== cleaned.length) {
            setError('Hay correos repetidos.');
            return;
        }

        if (cleaned.length > MAX_EXTRA_EMAILS) {
            setError(`Máximo ${MAX_EXTRA_EMAILS} correos adicionales.`);
            return;
        }

        await onSave(cleaned);
        setIsEditing(false);
    };

    return (
        <section>
            <div className="flex items-center justify-between mb-2 pl-2">
                <h4 className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">
                    Correos de Aviso
                </h4>
                {isEditing ? (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={cancel}
                            className="text-gray-400 text-[10px] font-black uppercase tracking-widest px-3 py-1"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={save}
                            disabled={saving}
                            className="text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-primary/10 rounded-lg border border-primary/20 hover:bg-primary/20 transition-all disabled:opacity-50"
                        >
                            {saving ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={startEditing}
                        className="text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-primary/10 rounded-lg border border-primary/20 hover:bg-primary/20 transition-all"
                    >
                        {emails.length ? 'Editar' : 'Agregar'}
                    </button>
                )}
            </div>

            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/80 dark:border-white/10 p-4 space-y-4 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] transition-all">
                <p className="text-[11px] text-gray-500 dark:text-gray-400 font-bold leading-relaxed">
                    Agrega hasta {MAX_EXTRA_EMAILS} correos que recibirán copia de certificados, retiros,
                    documentos y recordatorios. <span className="text-gray-400 dark:text-gray-500">No dan acceso a la cuenta.</span>
                </p>

                {/* Titular — siempre recibe */}
                <div className="flex items-center gap-4">
                    <div className="size-10 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                        <span className="material-symbols-outlined font-bold">verified_user</span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">Titular de la cuenta</p>
                        <p className="text-sm font-bold tracking-tight text-gray-900 dark:text-white truncate">{ownerEmail}</p>
                    </div>
                </div>

                <div className="h-px bg-gray-100 dark:bg-white/10" />

                {isEditing ? (
                    <div className="space-y-3">
                        {draft.map((email, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <input
                                    type="email"
                                    inputMode="email"
                                    autoComplete="off"
                                    className="flex-1 min-w-0 bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
                                    value={email}
                                    onChange={e => updateAt(i, e.target.value)}
                                    placeholder={`correo${i + 1}@empresa.cl`}
                                />
                                <button
                                    onClick={() => removeAt(i)}
                                    aria-label="Quitar correo"
                                    className="size-10 shrink-0 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 border border-red-100 dark:border-red-700/30 flex items-center justify-center active:scale-95 transition-transform"
                                >
                                    <span className="material-symbols-outlined text-lg">delete</span>
                                </button>
                            </div>
                        ))}

                        {draft.length < MAX_EXTRA_EMAILS && (
                            <button
                                onClick={addRow}
                                className="w-full py-3 rounded-lg border border-dashed border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors"
                            >
                                <span className="material-symbols-outlined text-base">add</span>
                                Agregar correo ({draft.length}/{MAX_EXTRA_EMAILS})
                            </button>
                        )}

                        {error && (
                            <p className="text-[11px] font-bold text-red-500 flex items-start gap-1.5">
                                <span className="material-symbols-outlined text-sm shrink-0">error</span>
                                {error}
                            </p>
                        )}
                    </div>
                ) : emails.length === 0 ? (
                    <div className="text-center py-4 border border-dashed border-gray-200 dark:border-white/10 rounded-xl">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            Sin correos adicionales
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {emails.map((email, i) => (
                            <div key={email} className="flex items-center gap-4">
                                <div className="size-10 shrink-0 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center border border-blue-100 dark:border-blue-700/30">
                                    <span className="material-symbols-outlined font-bold">mark_email_read</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">
                                        Copia {i + 1}
                                    </p>
                                    <p className="text-sm font-bold tracking-tight text-gray-900 dark:text-white truncate">{email}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

export default NotificationEmailsSection;
