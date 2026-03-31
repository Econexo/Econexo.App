import React from 'react';
import { AdminDocument } from './types';

interface PendingDocsListProps {
    docs: AdminDocument[];
    onValidate: (docId: string) => void;
    onPreview: (doc: AdminDocument) => void;
    onDelete: (doc: AdminDocument) => void;
}

const PendingDocsList: React.FC<PendingDocsListProps> = ({ docs, onValidate, onPreview, onDelete }) => {
    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Documentos por Validar</h3>
                <span className="bg-primary/20 text-primary text-[10px] font-black px-2 py-0.5 rounded-full">{docs.length}</span>
            </div>

            {docs.length === 0 ? (
                <div className="p-8 text-center bg-white/40 backdrop-blur-sm rounded-3xl border border-dashed border-gray-300">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">No hay pendientes</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {docs.map(doc => (
                        <div key={doc.id} className="bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm truncate text-gray-900">{doc.title}</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">ID: {doc.user_id.slice(0, 8)}...</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onPreview(doc)}
                                    className="size-9 bg-blue-50 text-blue-500 hover:bg-blue-100 rounded-xl flex items-center justify-center border border-blue-100 transition-colors"
                                    title="Previsualizar"
                                >
                                    <span className="material-symbols-outlined text-lg">visibility</span>
                                </button>
                                <button
                                    onClick={() => onValidate(doc.id)}
                                    className="px-3 py-2 bg-primary text-background-dark rounded-xl text-[10px] font-black uppercase tracking-widest shadow-glow hover:brightness-110 transition-all"
                                >
                                    Validar
                                </button>
                                <button
                                    onClick={() => onDelete(doc)}
                                    className="size-9 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl flex items-center justify-center border border-red-100 transition-colors"
                                    title="Eliminar"
                                >
                                    <span className="material-symbols-outlined text-lg">delete</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

export default PendingDocsList;
