import React from 'react';

interface SupportTicketModalProps {
    show: boolean;
    ticket: { subject: string; description: string };
    onTicketChange: (ticket: { subject: string; description: string }) => void;
    submitting: boolean;
    onSubmit: () => void;
    onClose: () => void;
}

const SupportTicketModal: React.FC<SupportTicketModalProps> = ({
    show,
    ticket,
    onTicketChange,
    submitting,
    onSubmit,
    onClose,
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={onClose}></div>
            <div className="relative w-full max-w-[340px] bg-white rounded-[2rem] p-6 shadow-2xl animate-in zoom-in duration-300 border border-white/80">

                <div className="text-center space-y-3 mb-8">
                    <div className="size-16 bg-gradient-to-br from-primary/10 to-blue-500/10 rounded-2xl flex items-center justify-center text-primary mx-auto shadow-inner border border-primary/20">
                        <span className="material-symbols-outlined text-3xl">bug_report</span>
                    </div>
                    <div>
                        <h3 className="text-xl font-display font-black text-gray-900 tracking-tight">Reportar Problema</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-4 leading-relaxed mt-1">
                            Describe el inconveniente para recibir ayuda de nuestro equipo.
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Asunto</label>
                        <input
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-gray-400"
                            placeholder="Ej: Error al cargar documentos"
                            value={ticket.subject}
                            onChange={e => onTicketChange({ ...ticket, subject: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Descripción</label>
                        <textarea
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all min-h-[100px] resize-none placeholder:text-gray-400 custom-scrollbar"
                            placeholder="Cuéntanos qué pasó..."
                            value={ticket.description}
                            onChange={e => onTicketChange({ ...ticket, description: e.target.value })}
                        />
                    </div>

                    <div className="pt-4 flex flex-col gap-3">
                        <button
                            disabled={submitting}
                            onClick={onSubmit}
                            className="w-full py-4 bg-primary text-background-dark font-display font-black text-xs uppercase tracking-[0.2em] rounded-xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 hover:brightness-110"
                        >
                            {submitting ? (
                                <>
                                    <span className="animate-spin material-symbols-outlined text-sm">progress_activity</span>
                                    Enviando...
                                </>
                            ) : (
                                'Enviar Reporte'
                            )}
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

export default SupportTicketModal;
