import React, { useState, useEffect } from 'react';
import { DOC_TYPE, TRANSPORTE_TYPES, isTransportDoc, toTransportLabel } from '../../utils/documentTypes';
import { supabase } from '../../services/supabase';
import { useToast } from '../ui/Toast';

interface CertToFix {
    id: string;
    title: string;
    type: string;
    created_at: string;
    metadata: any;
    _companyName: string;
    _isUnregistered: boolean;
    // Editable fields
    newDate: string;
    newAddress: string;
    originalDate: string;
    originalAddress: string;
    changed: boolean;
}

interface Props {
    onClose: () => void;
    onDataFixed: () => void;
}

const FixCertificatesModal: React.FC<Props> = ({ onClose, onDataFixed }) => {
    const toast = useToast();
    const [certs, setCerts] = useState<CertToFix[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [filterDate, setFilterDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        fetchCerts();
    }, [filterDate, showAll]);

    const fetchCerts = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('documents')
                .select('*')
                .in('type', [...TRANSPORTE_TYPES, 'report', 'pdf', 'CGM'])
                .order('created_at', { ascending: false });

            if (!showAll) {
                // Filter by the selected date (certificates created on that day)
                const startOfDay = new Date(filterDate + 'T00:00:00').toISOString();
                const endOfDay = new Date(filterDate + 'T23:59:59').toISOString();
                query = query.gte('created_at', startOfDay).lte('created_at', endOfDay);
            } else {
                // Show last 100 certificates
                query = query.limit(100);
            }

            const { data: docs, error } = await query;
            if (error) throw error;

            // Fetch profiles for company names
            const userIds = Array.from(new Set((docs || []).map(d => d.user_id)));
            const { data: profiles } = await supabase.from('profiles').select('id, company_name, address').in('id', userIds);
            const profileMap = new Map((profiles || []).map(p => [p.id, p]));

            // Fetch unregistered client docs for address lookup
            const { data: unregDocs } = await supabase.from('documents').select('id, metadata').eq('type', 'UNREGISTERED_CLIENT');
            const unregMap = new Map((unregDocs || []).map(d => [d.id, d.metadata]));

            const mapped: CertToFix[] = (docs || []).map(doc => {
                const isUnreg = !!doc.metadata?.unregistered_client_id;
                const unregId = doc.metadata?.unregistered_client_id;
                const unregMeta = isUnreg ? unregMap.get(unregId) : null;

                let companyName = '';
                let currentAddress = '';

                if (isUnreg) {
                    companyName = unregMeta?.company_name || doc.metadata?.company_name || 'Cliente Manual';
                    // Address priority: 1) CR metadata, 2) unregistered client doc
                    currentAddress = doc.metadata?.address || unregMeta?.address || '';
                } else {
                    const profile = profileMap.get(doc.user_id);
                    companyName = profile?.company_name || 'Desconocido';
                    currentAddress = profile?.address || '';
                }

                const dateStr = doc.metadata?.withdrawal_date || doc.created_at?.split('T')[0] || '';

                return {
                    id: doc.id,
                    title: doc.title,
                    type: doc.type,
                    created_at: doc.created_at,
                    metadata: doc.metadata,
                    _companyName: companyName,
                    _isUnregistered: isUnreg,
                    newDate: dateStr,
                    newAddress: currentAddress,
                    originalDate: dateStr,
                    originalAddress: currentAddress,
                    changed: false,
                };
            });

            setCerts(mapped);
        } catch (err: any) {
            console.error('Error fetching certs:', err);
            toast.error('Error al cargar certificados: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const updateCert = (id: string, field: 'newDate' | 'newAddress', value: string) => {
        setCerts(prev => prev.map(c => {
            if (c.id !== id) return c;
            const updated = { ...c, [field]: value };
            updated.changed = updated.newDate !== updated.originalDate || updated.newAddress !== updated.originalAddress;
            return updated;
        }));
    };

    const handleSaveAll = async () => {
        const changed = certs.filter(c => c.changed);
        if (changed.length === 0) {
            toast.warning('No hay cambios por guardar.');
            return;
        }

        setSaving(true);
        let successCount = 0;
        let errorCount = 0;

        for (const cert of changed) {
            try {
                const updates: any = {};

                // Update created_at if date changed
                if (cert.newDate !== cert.originalDate) {
                    updates.created_at = new Date(cert.newDate + 'T12:00:00').toISOString();
                }

                // Update metadata (always merge, don't replace)
                const newMetadata = { ...cert.metadata };
                if (cert.newDate !== cert.originalDate) {
                    newMetadata.withdrawal_date = cert.newDate;
                }
                if (cert.newAddress !== cert.originalAddress) {
                    newMetadata.address = cert.newAddress;
                }
                updates.metadata = newMetadata;

                const { error } = await supabase
                    .from('documents')
                    .update(updates)
                    .eq('id', cert.id);

                if (error) throw error;
                successCount++;
            } catch (err: any) {
                console.error(`Error updating cert ${cert.id}:`, err);
                errorCount++;
            }
        }

        setSaving(false);

        if (errorCount > 0) {
            toast.warning(`${successCount} actualizados, ${errorCount} errores.`);
        } else {
            toast.success(`${successCount} certificados corregidos exitosamente.`);
        }

        onDataFixed();
        fetchCerts(); // Refresh
    };

    const changedCount = certs.filter(c => c.changed).length;

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose}></div>

            <div className="relative bg-[#f0f4f0] w-full max-w-3xl rounded-[32px] border border-white/80 shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 bg-white/70 backdrop-blur-md border-b border-white/40 flex items-center justify-between shrink-0 shadow-sm z-10">
                    <div>
                        <h2 className="text-xl font-display font-black text-gray-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-orange-500">build</span>
                            Corregir Certificados
                        </h2>
                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mt-0.5">
                            Editar fechas y direcciones
                        </p>
                    </div>
                    <button onClick={onClose} className="size-10 bg-white hover:bg-gray-50 rounded-full flex items-center justify-center text-gray-500 shadow-sm transition-colors">
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {/* Filters */}
                <div className="px-6 py-4 bg-white/50 border-b border-white/40 flex items-center gap-4 flex-wrap shrink-0">
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black uppercase text-primary tracking-widest">Fecha:</label>
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => { setFilterDate(e.target.value); setShowAll(false); }}
                            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary/50"
                        />
                    </div>
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showAll ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                        {showAll ? 'Mostrando Todos' : 'Ver Últimos 100'}
                    </button>
                    <span className="text-[10px] font-bold text-gray-400">
                        {certs.length} certificados encontrados
                    </span>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3 relative z-0">
                    {loading ? (
                        <div className="text-center py-12 text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">
                            Cargando certificados...
                        </div>
                    ) : certs.length === 0 ? (
                        <div className="p-12 text-center bg-white/40 backdrop-blur-sm rounded-3xl border border-dashed border-gray-300">
                            <span className="material-symbols-outlined text-4xl text-gray-300 mb-2 block">search_off</span>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                                No se encontraron certificados para esta fecha
                            </p>
                        </div>
                    ) : (
                        certs.map(cert => (
                            <div
                                key={cert.id}
                                className={`bg-white/60 backdrop-blur-2xl p-5 rounded-2xl border shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] transition-all ${cert.changed ? 'border-orange-300 ring-2 ring-orange-200' : 'border-white/80'}`}
                            >
                                {/* Title Row */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase ${isTransportDoc(cert.type) ? 'bg-primary/10 text-primary' : cert.type === 'CGM' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                            {isTransportDoc(cert.type) ? DOC_TYPE.TRANSPORTE : cert.type}
                                        </span>
                                        <p className="font-bold text-sm text-gray-900 truncate">
                                            {isTransportDoc(cert.type) ? toTransportLabel(cert.title) : cert.title}
                                        </p>
                                        {cert._isUnregistered && (
                                            <span className="text-[8px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-black uppercase shrink-0">Manual</span>
                                        )}
                                    </div>
                                    {cert.changed && (
                                        <span className="text-[8px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-black uppercase animate-pulse shrink-0">
                                            Modificado
                                        </span>
                                    )}
                                </div>

                                <p className="text-[10px] text-primary font-black uppercase mb-3">{cert._companyName}</p>

                                {/* Editable Fields */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {/* Date Field */}
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                                            Fecha del Retiro
                                        </label>
                                        <input
                                            type="date"
                                            value={cert.newDate}
                                            onChange={(e) => updateCert(cert.id, 'newDate', e.target.value)}
                                            className={`w-full bg-white/80 border rounded-xl px-3 py-2.5 text-xs font-bold text-gray-900 outline-none transition-colors ${cert.newDate !== cert.originalDate ? 'border-orange-400 bg-orange-50/50' : 'border-gray-200 focus:border-primary/50'}`}
                                        />
                                        {cert.newDate !== cert.originalDate && (
                                            <p className="text-[9px] text-orange-600 font-bold">
                                                Antes: {new Date(cert.originalDate + 'T12:00:00').toLocaleDateString('es-CL')}
                                            </p>
                                        )}
                                    </div>

                                    {/* Address Field */}
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[12px]">location_on</span>
                                            Dirección
                                        </label>
                                        <input
                                            type="text"
                                            value={cert.newAddress}
                                            onChange={(e) => updateCert(cert.id, 'newAddress', e.target.value)}
                                            placeholder="Dirección de la empresa..."
                                            className={`w-full bg-white/80 border rounded-xl px-3 py-2.5 text-xs font-bold text-gray-900 outline-none transition-colors ${cert.newAddress !== cert.originalAddress ? 'border-orange-400 bg-orange-50/50' : 'border-gray-200 focus:border-primary/50'}`}
                                        />
                                        {cert.newAddress !== cert.originalAddress && cert.originalAddress && (
                                            <p className="text-[9px] text-orange-600 font-bold">
                                                Antes: {cert.originalAddress || '(vacío)'}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Current DB date (small info) */}
                                <p className="text-[8px] text-gray-400 font-bold mt-2">
                                    Registrado en BD: {new Date(cert.created_at).toLocaleString('es-CL')} • ID: {cert.id.slice(0, 8)}...
                                </p>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-white/70 backdrop-blur-md border-t border-white/40 flex items-center justify-between shrink-0 z-10">
                    <p className="text-xs text-gray-500 font-bold">
                        {changedCount > 0 ? (
                            <span className="text-orange-600">
                                <span className="material-symbols-outlined text-sm align-middle mr-1">edit</span>
                                {changedCount} certificado{changedCount !== 1 ? 's' : ''} con cambios
                            </span>
                        ) : (
                            'Sin cambios pendientes'
                        )}
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-5 py-3 bg-gray-100 text-gray-600 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-colors"
                        >
                            Cerrar
                        </button>
                        <button
                            onClick={handleSaveAll}
                            disabled={changedCount === 0 || saving}
                            className="px-6 py-3 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-sm">save</span>
                                    Guardar Cambios ({changedCount})
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FixCertificatesModal;
