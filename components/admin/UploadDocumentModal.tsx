// Subida de documentos: varios archivos, varias empresas.
//
// Cada archivo seleccionado se carga en cada empresa seleccionada, así el mismo
// formulario cubre "este documento va a ocho empresas" y "estos ocho documentos
// van a esta empresa". El plan lo arma utils/bulkUpload.ts.

import React, { useMemo, useState } from 'react';
import { AdminUserProfile } from './types';

interface UploadDocumentModalProps {
    show: boolean;
    users: AdminUserProfile[];
    selectedIds: string[];
    onToggleUser: (id: string) => void;
    /** Marca o desmarca de golpe las empresas visibles (las que pasan el buscador). */
    onSetMany: (ids: string[], selected: boolean) => void;
    uploadDate: string;
    onDateChange: (date: string) => void;
    uploadType: string;
    onTypeChange: (type: string) => void;
    uploadSource: 'gestor' | 'econexo';
    onSourceChange: (source: 'gestor' | 'econexo') => void;
    files: File[];
    onFilesChange: (files: File[]) => void;
    loading: boolean;
    /** Progreso de la carga en curso, para que una carga larga no parezca colgada. */
    progress: { done: number; total: number } | null;
    onUpload: () => void;
    onClose: () => void;
}

const GESTOR_TYPES = [
    { value: 'declaration',   label: 'Declaración / Certificado' },
    { value: 'legal',         label: 'Documento Legal' },
    { value: 'guia',          label: 'Guía' },
    { value: 'oc',            label: 'Orden de Compra (OC)' },
    { value: 'ticket_pesaje', label: 'Ticket de Pesaje' },
    { value: 'CR_ACOPIO',     label: 'Certificado de Recepción (centro de acopio)' },
  { value: 'cdf',           label: 'Certificado Disposición Final (CDF)' },
    { value: 'custom',        label: 'Otro' },
];

const ECONEXO_TYPES = [
    { value: 'CT',            label: 'Certificado de Transporte (CT)' },
    { value: 'CGM',           label: 'Certificado Gestión Mensual (CGM)' },
    { value: 'report',        label: 'Reporte Ambiental' },
    { value: 'guia',          label: 'Guía' },
    { value: 'oc',            label: 'Orden de Compra (OC)' },
    { value: 'ticket_pesaje', label: 'Ticket de Pesaje' },
    { value: 'CR_ACOPIO',     label: 'Certificado de Recepción (centro de acopio)' },
  { value: 'cdf',           label: 'Certificado Disposición Final (CDF)' },
    { value: 'custom',        label: 'Otro' },
];

const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
    show,
    users,
    selectedIds,
    onToggleUser,
    onSetMany,
    uploadDate,
    onDateChange,
    uploadType,
    onTypeChange,
    uploadSource,
    onSourceChange,
    files,
    onFilesChange,
    loading,
    progress,
    onUpload,
    onClose,
}) => {
    const [search, setSearch] = useState('');

    const visibleUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return users;
        return users.filter(u =>
            (u.company_name || '').toLowerCase().includes(q)
            || (u.rut || '').toLowerCase().includes(q)
        );
    }, [users, search]);

    if (!show) return null;

    const types = uploadSource === 'econexo' ? ECONEXO_TYPES : GESTOR_TYPES;
    const visibleIds = visibleUsers.map(u => u.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
    const totalUploads = files.length * selectedIds.length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative bg-white/90 backdrop-blur-2xl w-full max-w-[420px] max-h-[90vh] overflow-y-auto rounded-[32px] p-8 border border-white/80 shadow-2xl animate-in zoom-in duration-200">
                <h3 className="text-xl font-display font-black mb-5 text-gray-900">Subir Documentos</h3>

                {/* Source selector */}
                <div className="mb-5">
                    <label className="text-[10px] font-black uppercase text-gray-500 block mb-2">Origen del Documento</label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => onSourceChange('gestor')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
                                uploadSource === 'gestor'
                                    ? 'bg-slate-700 text-white border-slate-700 shadow'
                                    : 'bg-white/50 text-gray-500 border-white/60 hover:bg-white/80'
                            }`}
                        >
                            Gestor
                        </button>
                        <button
                            onClick={() => onSourceChange('econexo')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
                                uploadSource === 'econexo'
                                    ? 'bg-primary text-white border-primary shadow'
                                    : 'bg-white/50 text-gray-500 border-white/60 hover:bg-white/80'
                            }`}
                        >
                            EcoNexo
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Empresas destino: varias */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <label className="text-[10px] font-black uppercase text-gray-500">
                                Empresas Destino
                            </label>
                            <span className={`text-[10px] font-black uppercase tracking-wider ${selectedIds.length > 0 ? 'text-primary' : 'text-gray-400'}`}>
                                {selectedIds.length} seleccionada{selectedIds.length === 1 ? '' : 's'}
                            </span>
                        </div>

                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar empresa o RUT..."
                            className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-900 outline-none focus:border-primary/50"
                        />

                        <div className="border border-white/60 rounded-xl bg-white/50 max-h-48 overflow-y-auto divide-y divide-gray-100">
                            {visibleUsers.length === 0 ? (
                                <p className="px-4 py-6 text-center text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                    Sin resultados
                                </p>
                            ) : (
                                visibleUsers.map(u => {
                                    const checked = selectedIds.includes(u.id);
                                    return (
                                        <label
                                            key={u.id}
                                            className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/70 transition-colors"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => onToggleUser(u.id)}
                                                className="size-4 accent-primary shrink-0"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-xs font-bold text-gray-900 truncate">{u.company_name}</span>
                                                {u.rut && <span className="block text-[9px] font-bold text-gray-400">{u.rut}</span>}
                                            </span>
                                        </label>
                                    );
                                })
                            )}
                        </div>

                        {visibleIds.length > 0 && (
                            <button
                                onClick={() => onSetMany(visibleIds, !allVisibleSelected)}
                                className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
                            >
                                {allVisibleSelected
                                    ? `Quitar las ${visibleIds.length} visibles`
                                    : `Seleccionar las ${visibleIds.length} visibles`}
                            </button>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-gray-500">Tipo de Documento</label>
                        <select
                            className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none"
                            value={uploadType}
                            onChange={(e) => onTypeChange(e.target.value)}
                        >
                            {types.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-gray-500">Fecha del Documento</label>
                        <input
                            type="date"
                            className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none"
                            value={uploadDate}
                            onChange={(e) => onDateChange(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-gray-500">
                            Archivos (PDF / Imagen)
                        </label>
                        <input
                            type="file"
                            multiple
                            accept=".pdf,.png,.jpg,.jpeg"
                            className="w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                            onChange={(e) => onFilesChange(e.target.files ? Array.from(e.target.files) : [])}
                        />
                        {files.length > 0 && (
                            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 pt-1">
                                {files.length} archivo{files.length === 1 ? '' : 's'}: {files.map(f => f.name).join(', ')}
                            </p>
                        )}
                    </div>

                    {totalUploads > 1 && (
                        <p className="text-[10px] font-bold text-gray-500 bg-white/60 border border-white/70 rounded-xl px-3 py-2">
                            Se crearán <span className="font-black text-gray-900">{totalUploads}</span> documentos:
                            cada archivo queda en cada empresa seleccionada.
                        </p>
                    )}

                    <div className="pt-2 space-y-2">
                        <button
                            onClick={onUpload}
                            disabled={loading}
                            className={`w-full py-3 text-white rounded-xl font-black uppercase tracking-widest shadow-lg hover:shadow-xl transition-all disabled:opacity-50 ${
                                uploadSource === 'econexo' ? 'bg-primary' : 'bg-slate-700'
                            }`}
                        >
                            {loading
                                ? progress
                                    ? `Subiendo ${progress.done} de ${progress.total}...`
                                    : 'Subiendo...'
                                : totalUploads > 1
                                    ? `Subir ${totalUploads} documentos`
                                    : 'Subir Documento'}
                        </button>
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="w-full text-center text-xs text-gray-500 font-bold uppercase disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UploadDocumentModal;
