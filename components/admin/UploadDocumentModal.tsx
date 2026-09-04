import React from 'react';
import { AdminUserProfile } from './types';

interface UploadDocumentModalProps {
    show: boolean;
    users: AdminUserProfile[];
    selectedUser: AdminUserProfile | null;
    onSelectUser: (user: AdminUserProfile | null) => void;
    uploadDate: string;
    onDateChange: (date: string) => void;
    uploadType: string;
    onTypeChange: (type: string) => void;
    uploadSource: 'gestor' | 'econexo';
    onSourceChange: (source: 'gestor' | 'econexo') => void;
    onFileChange: (file: File | null) => void;
    loading: boolean;
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
    selectedUser,
    onSelectUser,
    uploadDate,
    onDateChange,
    uploadType,
    onTypeChange,
    uploadSource,
    onSourceChange,
    onFileChange,
    loading,
    onUpload,
    onClose,
}) => {
    if (!show) return null;

    const types = uploadSource === 'econexo' ? ECONEXO_TYPES : GESTOR_TYPES;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative bg-white/90 backdrop-blur-2xl w-full max-w-[340px] rounded-[32px] p-8 border border-white/80 shadow-2xl animate-in zoom-in duration-200">
                <h3 className="text-xl font-display font-black mb-5 text-gray-900">Subir Documento</h3>

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
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-gray-500">Empresa Destino</label>
                        <select
                            className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none"
                            value={selectedUser?.id || ''}
                            onChange={(e) => onSelectUser(users.find(u => u.id === e.target.value) || null)}
                        >
                            <option value="">Seleccionar Empresa...</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.company_name}</option>
                            ))}
                        </select>
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
                        <label className="text-[10px] font-black uppercase text-gray-500">Archivo (PDF / Imagen)</label>
                        <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            className="w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                            onChange={(e) => onFileChange(e.target.files ? e.target.files[0] : null)}
                        />
                    </div>

                    <div className="pt-2 space-y-2">
                        <button
                            onClick={onUpload}
                            disabled={loading}
                            className={`w-full py-3 text-white rounded-xl font-black uppercase tracking-widest shadow-lg hover:shadow-xl transition-all disabled:opacity-50 ${
                                uploadSource === 'econexo' ? 'bg-primary' : 'bg-slate-700'
                            }`}
                        >
                            {loading ? 'Subiendo...' : 'Subir Documento'}
                        </button>
                        <button
                            onClick={onClose}
                            className="w-full text-center text-xs text-gray-500 font-bold uppercase"
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
