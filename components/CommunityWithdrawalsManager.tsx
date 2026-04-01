import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { generateCommunityCR } from '../services/pdfGenerator';
import { WasteItem, WASTE_CATEGORIES } from './admin/types';

interface CommunityWithdrawal {
    id: string;
    community_name: string;
    sector: string;
    participants_count: number;
    withdrawal_date: string;
    waste_details: WasteItem[];
    cert_number: string;
    created_at: string;
    total_kg: number;
}

interface Props {
    onClose: () => void;
}

const CommunityWithdrawalsManager: React.FC<Props> = ({ onClose }) => {
    const toast = useToast();
    const confirm = useConfirm();
    const [withdrawals, setWithdrawals] = useState<CommunityWithdrawal[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);

    // Form state
    const [communityName, setCommunityName] = useState('');
    const [sector, setSector] = useState('');
    const [participantsCount, setParticipantsCount] = useState('');
    const [withdrawalDate, setWithdrawalDate] = useState(new Date().toISOString().split('T')[0]);
    const [wasteItems, setWasteItems] = useState<WasteItem[]>([]);
    const [currentWaste, setCurrentWaste] = useState({ waste_type: '', description: '', quantity: '', unit: 'Kg' });

    useEffect(() => {
        fetchWithdrawals();
    }, []);

    const fetchWithdrawals = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('documents')
                .select('*')
                .eq('type', 'COMMUNITY_CR')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mapped: CommunityWithdrawal[] = (data || []).map(doc => {
                const details: WasteItem[] = doc.metadata?.waste_details || [];
                const totalKg = details.reduce((sum: number, item: WasteItem) => sum + (Number(item.quantity) || 0), 0);
                return {
                    id: doc.id,
                    community_name: doc.metadata?.community_name || 'Sin Nombre',
                    sector: doc.metadata?.sector || '',
                    participants_count: doc.metadata?.participants_count || 0,
                    withdrawal_date: doc.metadata?.withdrawal_date || doc.created_at?.split('T')[0] || '',
                    waste_details: details,
                    cert_number: doc.metadata?.cert_number || doc.title || '',
                    created_at: doc.created_at,
                    total_kg: totalKg,
                };
            });

            setWithdrawals(mapped);
        } catch (err) {
            console.error('Error fetching community withdrawals:', err);
            toast.error('Error al cargar los retiros comunitarios.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddWasteItem = () => {
        if (!currentWaste.waste_type || !currentWaste.quantity) {
            toast.warning('Completa el tipo y cantidad del residuo.');
            return;
        }
        setWasteItems(prev => [...prev, { ...currentWaste, quantity: Number(currentWaste.quantity) }]);
        setCurrentWaste({ waste_type: '', description: '', quantity: '', unit: 'Kg' });
    };

    const handleRemoveWasteItem = (index: number) => {
        setWasteItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        if (!communityName.trim()) { toast.warning('Ingresa el nombre de la comunidad.'); return; }
        if (!sector.trim()) { toast.warning('Ingresa el sector o ubicación.'); return; }
        if (wasteItems.length === 0) { toast.warning('Agrega al menos un residuo.'); return; }

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No autenticado');

            // Generate certificate number
            const { data: allCRCs } = await supabase
                .from('documents')
                .select('metadata, title')
                .eq('type', 'COMMUNITY_CR');

            let nextNum = 1;
            if (allCRCs && allCRCs.length > 0) {
                const nums = allCRCs.map(d => {
                    const match = (d.metadata?.cert_number || d.title || '').match(/CRC N°:(\d+)/);
                    return match ? parseInt(match[1]) : 0;
                }).filter((n: number) => n > 0);
                if (nums.length > 0) nextNum = Math.max(...nums) + 1;
            }

            const certNumber = `CRC N°:${nextNum.toString().padStart(3, '0')}`;

            // Generate and download PDF
            generateCommunityCR(
                {
                    community_name: communityName.trim(),
                    sector: sector.trim(),
                    participants_count: participantsCount ? Number(participantsCount) : undefined,
                },
                wasteItems,
                certNumber,
                'save',
                withdrawalDate
            );

            // Save to database
            const { error } = await supabase.from('documents').insert([{
                user_id: user.id,
                title: `Retiro Comunitario ${certNumber} - ${communityName.trim()}`,
                type: 'COMMUNITY_CR',
                verified: true,
                created_at: withdrawalDate
                    ? new Date(withdrawalDate + 'T12:00:00').toISOString()
                    : new Date().toISOString(),
                metadata: {
                    cert_number: certNumber,
                    community_name: communityName.trim(),
                    sector: sector.trim(),
                    participants_count: participantsCount ? Number(participantsCount) : 0,
                    withdrawal_date: withdrawalDate,
                    waste_details: wasteItems,
                    generated_by: 'Admin Panel',
                },
            }]);

            if (error) throw error;

            toast.success(`Certificado ${certNumber} generado y guardado.`);
            resetForm();
            fetchWithdrawals();
        } catch (err: any) {
            console.error('Error saving community withdrawal:', err);
            toast.error('Error al guardar: ' + (err.message || 'Error desconocido'));
        } finally {
            setSaving(false);
        }
    };

    const handlePreview = (w: CommunityWithdrawal) => {
        generateCommunityCR(
            { community_name: w.community_name, sector: w.sector, participants_count: w.participants_count },
            w.waste_details,
            w.cert_number,
            'preview',
            w.withdrawal_date
        );
    };

    const handleDelete = async (w: CommunityWithdrawal) => {
        const ok = await confirm({
            title: 'Eliminar retiro comunitario',
            message: `¿Eliminar el retiro de "${w.community_name}"? Esta acción es irreversible.`,
            confirmLabel: 'Sí, eliminar',
            danger: true,
        });
        if (!ok) return;
        try {
            const { error } = await supabase.from('documents').delete().eq('id', w.id);
            if (error) throw error;
            fetchWithdrawals();
            toast.success('Retiro eliminado.');
        } catch (err: any) {
            toast.error('Error al eliminar: ' + err.message);
        }
    };

    const resetForm = () => {
        setCommunityName('');
        setSector('');
        setParticipantsCount('');
        setWithdrawalDate(new Date().toISOString().split('T')[0]);
        setWasteItems([]);
        setCurrentWaste({ waste_type: '', description: '', quantity: '', unit: 'Kg' });
        setShowForm(false);
    };

    const fmtDate = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const totalKgAll = withdrawals.reduce((sum, w) => sum + w.total_kg, 0);

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto">
            <div className="bg-white w-full max-w-2xl mx-auto my-4 rounded-2xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
                            <span className="material-symbols-outlined text-green-600">nature_people</span>
                        </div>
                        <div>
                            <h2 className="text-base font-black text-gray-900">Retiros Comunitarios</h2>
                            <p className="text-xs text-gray-500">Gestión de residuos de comunidades y barrios</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="size-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 space-y-6">

                    {/* Summary stats */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                            <p className="text-[10px] font-bold text-green-700 uppercase tracking-widest">Total Retiros</p>
                            <p className="text-2xl font-black text-green-800">{withdrawals.length}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Total Kg Gestionados</p>
                            <p className="text-2xl font-black text-emerald-800">
                                {totalKgAll % 1 === 0 ? totalKgAll : totalKgAll.toFixed(2)} Kg
                            </p>
                        </div>
                    </div>

                    {/* New withdrawal button */}
                    {!showForm && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            Registrar Nuevo Retiro Comunitario
                        </button>
                    )}

                    {/* New withdrawal form */}
                    {showForm && (
                        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5 space-y-4">
                            <h3 className="font-black text-gray-900 text-sm">Nuevo Retiro Comunitario</h3>

                            {/* Community info */}
                            <div className="grid grid-cols-1 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Comunidad / Barrio *</label>
                                    <input
                                        type="text"
                                        value={communityName}
                                        onChange={e => setCommunityName(e.target.value)}
                                        placeholder="Ej: Villa Las Flores, Junta de Vecinos N°12"
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Sector / Ubicación *</label>
                                    <input
                                        type="text"
                                        value={sector}
                                        onChange={e => setSector(e.target.value)}
                                        placeholder="Ej: Antofagasta Norte, Calama Sector B"
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">N° Participantes (opcional)</label>
                                        <input
                                            type="number"
                                            value={participantsCount}
                                            onChange={e => setParticipantsCount(e.target.value)}
                                            placeholder="Ej: 45"
                                            min="0"
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">Fecha del Retiro</label>
                                        <input
                                            type="date"
                                            value={withdrawalDate}
                                            onChange={e => setWithdrawalDate(e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Waste items */}
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-2">Residuos Recolectados</label>

                                {/* Items added */}
                                {wasteItems.length > 0 && (
                                    <div className="space-y-2 mb-3">
                                        {wasteItems.map((item, i) => (
                                            <div key={i} className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-3 py-2">
                                                <div>
                                                    <span className="text-sm font-bold text-gray-800">{item.waste_type}</span>
                                                    {item.description && <span className="text-xs text-gray-500 ml-1">— {item.description}</span>}
                                                    <span className="ml-2 text-xs font-bold text-green-700">{item.quantity} {item.unit}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveWasteItem(i)}
                                                    className="size-7 flex items-center justify-center rounded-full hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                                </button>
                                            </div>
                                        ))}
                                        <div className="text-right text-xs font-bold text-green-700">
                                            Total: {wasteItems.reduce((s, i) => s + Number(i.quantity), 0).toFixed(2)} Kg
                                        </div>
                                    </div>
                                )}

                                {/* Add item form */}
                                <div className="bg-white rounded-xl border border-dashed border-gray-300 p-3 space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <select
                                            value={currentWaste.waste_type}
                                            onChange={e => setCurrentWaste(p => ({ ...p, waste_type: e.target.value }))}
                                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
                                        >
                                            <option value="">Tipo de residuo</option>
                                            {WASTE_CATEGORIES.map(c => (
                                                <option key={c.value} value={c.value}>{c.label}</option>
                                            ))}
                                        </select>
                                        <input
                                            type="text"
                                            value={currentWaste.description}
                                            onChange={e => setCurrentWaste(p => ({ ...p, description: e.target.value }))}
                                            placeholder="Descripción (opcional)"
                                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <input
                                            type="number"
                                            value={currentWaste.quantity}
                                            onChange={e => setCurrentWaste(p => ({ ...p, quantity: e.target.value }))}
                                            placeholder="Cantidad"
                                            min="0"
                                            step="0.01"
                                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
                                        />
                                        <select
                                            value={currentWaste.unit}
                                            onChange={e => setCurrentWaste(p => ({ ...p, unit: e.target.value }))}
                                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
                                        >
                                            <option value="Kg">Kg</option>
                                            <option value="L">L</option>
                                            <option value="Unidades">Unidades</option>
                                        </select>
                                        <button
                                            onClick={handleAddWasteItem}
                                            className="px-2 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">add</span>
                                            Agregar
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-3 pt-1">
                                <button
                                    onClick={resetForm}
                                    className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-bold text-sm rounded-xl hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
                                >
                                    {saving ? (
                                        <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span> Generando...</>
                                    ) : (
                                        <><span className="material-symbols-outlined text-[16px]">picture_as_pdf</span> Generar Certificado</>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Withdrawals list */}
                    <div>
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Historial de Retiros</h3>
                        {loading ? (
                            <div className="flex items-center justify-center py-8 text-gray-400">
                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                                Cargando...
                            </div>
                        ) : withdrawals.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">
                                <span className="material-symbols-outlined text-4xl block mb-2 opacity-40">nature_people</span>
                                <p className="text-sm">No hay retiros comunitarios registrados aún.</p>
                                <p className="text-xs mt-1">Haz clic en "Registrar Nuevo Retiro" para comenzar.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {withdrawals.map(w => (
                                    <div key={w.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                                        <div className="flex items-start justify-between p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="size-9 rounded-full bg-green-50 border border-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <span className="material-symbols-outlined text-green-600 text-[18px]">nature_people</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-gray-900">{w.community_name}</p>
                                                    <p className="text-xs text-gray-500">{w.sector}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                                                            {w.total_kg % 1 === 0 ? w.total_kg : w.total_kg.toFixed(2)} Kg
                                                        </span>
                                                        {w.participants_count > 0 && (
                                                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                                                                {w.participants_count} participantes
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] text-gray-400">{fmtDate(w.withdrawal_date)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-1 flex-shrink-0">
                                                <button
                                                    onClick={() => handlePreview(w)}
                                                    title="Vista previa"
                                                    className="size-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-500 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">visibility</span>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(w)}
                                                    title="Eliminar"
                                                    className="size-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                        {/* Waste breakdown */}
                                        {w.waste_details.length > 0 && (
                                            <div className="border-t border-gray-50 px-4 py-2 flex flex-wrap gap-1.5 bg-gray-50/50">
                                                {w.waste_details.map((item, i) => (
                                                    <span key={i} className="text-[10px] text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                                        {item.waste_type}{item.description ? ` - ${item.description}` : ''}: <strong>{item.quantity} {item.unit}</strong>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommunityWithdrawalsManager;
