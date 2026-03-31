import React from 'react';

interface EmailUpdateModalProps {
    show: boolean;
    currentEmail: string;
    newEmail: string;
    onNewEmailChange: (email: string) => void;
    loading: boolean;
    onSubmit: () => void;
    onClose: () => void;
}

const EmailUpdateModal: React.FC<EmailUpdateModalProps> = ({
    show,
    currentEmail,
    newEmail,
    onNewEmailChange,
    loading,
    onSubmit,
    onClose,
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={onClose}></div>
            <div className="relative w-full max-w-[340px] bg-white rounded-[2rem] p-6 shadow-2xl animate-in zoom-in duration-300 border border-white/80">
                <div className="text-center mb-6">
                    <div className="size-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-3 border border-blue-100">
                        <span className="material-symbols-outlined text-2xl">mark_email_unread</span>
                    </div>
                    <h3 className="text-lg font-display font-black text-gray-900">Actualizar Correo</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-2 mt-1">
                        Recibirás un enlace de confirmación en tu nueva dirección.
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-gray-400">Correo Actual</label>
                        <div className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-500">
                            {currentEmail}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Nuevo Correo</label>
                        <input
                            type="email"
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-gray-300"
                            placeholder="ejemplo@nuevo.com"
                            value={newEmail}
                            onChange={e => onNewEmailChange(e.target.value)}
                        />
                    </div>

                    <div className="pt-2 flex flex-col gap-2">
                        <button
                            onClick={onSubmit}
                            disabled={loading || !newEmail}
                            className="w-full py-3 bg-primary text-background-dark font-display font-black text-xs uppercase tracking-[0.2em] rounded-xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Enviando...' : 'Confirmar Cambio'}
                        </button>
                        <button
                            onClick={onClose}
                            className="w-full py-3 text-gray-500 hover:text-gray-900 font-display font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmailUpdateModal;
