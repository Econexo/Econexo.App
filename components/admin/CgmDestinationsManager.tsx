import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';

export interface CgmDestination {
    id: string;
    name: string;
    rut: string;
    resolution: string;
    active: boolean;
    created_at: string;
}

interface Props {
    onClose: () => void;
}

const emptyForm = { name: '', rut: '', resolution: '' };

const CgmDestinationsManager: React.FC<Props> = ({ onClose }) => {
    const toast = useToast();
    const confirm = useConfirm();
    const [destinations, setDestinations] = useState<CgmDestination[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);

    useEffect(() => {
        fetchDestinations();
    }, []);

    const fetchDestinations = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('cgm_destinations')
                .select('*')
                .order('created_at', { ascending: true });
            if (error) throw error;
            setDestinations(data || []);
        } catch (err: any) {
            toast.error('Error al cargar destinos: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (d: CgmDestination) => {
        setEditingId(d.id);
        setForm({ name: d.name, rut: d.rut, resolution: d.resolution });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(emptyForm);
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            toast.warning('El nombre del destino es obligatorio.');
            return;
        }
        setSaving(true);
        try {
            if (editingId) {
                const { error } = await supabase
                    .from('cgm_destinations')
                    .update({ name: form.name.trim(), rut: form.rut.trim(), resolution: form.resolution.trim() })
                    .eq('id', editingId);
                if (error) throw error;
                toast.success('Destino actualizado.');
            } else {
                const { error } = await supabase
                    .from('cgm_destinations')
                    .insert({ name: form.name.trim(), rut: form.rut.trim(), resolution: form.resolution.trim() });
                if (error) throw error;
                toast.success('Destino agregado.');
            }
            cancelEdit();
            fetchDestinations();
        } catch (err: any) {
            toast.error('Error al guardar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (d: CgmDestination) => {
        try {
            const { error } = await supabase
                .from('cgm_destinations')
                .update({ active: !d.active })
                .eq('id', d.id);
            if (error) throw error;
            fetchDestinations();
        } catch (err: any) {
            toast.error('Error: ' + err.message);
        }
    };

    const handleDelete = async (d: CgmDestination) => {
        const ok = await confirm({
            title: 'Eliminar destino',
            message: `¿Eliminar "${d.name}" de los destinos autorizados? Esta acción es irreversible.`,
            confirmLabel: 'Sí, eliminar',
            danger: true,
        });
        if (!ok) return;
        try {
            const { error } = await supabase.from('cgm_destinations').delete().eq('id', d.id);
            if (error) throw error;
            toast.success('Destino eliminado.');
            fetchDestinations();
        } catch (err: any) {
            toast.error('Error al eliminar: ' + err.message);
        }
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose}></div>

            <div className="relative bg-[#f0f4f0] w-full max-w-2xl rounded-[32px] border border-white/80 shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 bg-white/70 backdrop-blur-md border-b border-white/40 flex items-center justify-between shrink-0 shadow-sm z-10">
                    <div className="min-w-0">
                        <h2 className="text-xl font-display font-black text-gray-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-teal-600">pin_drop</span>
                            Destinos Autorizados
                        </h2>
                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mt-0.5">
                            Aparecen seleccionables al generar un CGM
                        </p>
                    </div>
                    <button onClick={onClose} className="size-10 bg-white hover:bg-gray-50 rounded-full flex items-center justify-center text-gray-500 shadow-sm transition-colors shrink-0">
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {/* Form */}
                <div className="px-6 py-4 bg-white/50 border-b border-white/40 shrink-0 space-y-3">
                    <p className="text-[10px] font-black uppercase text-primary tracking-widest">
                        {editingId ? 'Editar destino' : 'Nuevo destino'}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="Nombre (ej. SOREPA SPA.)"
                            className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-900 outline-none focus:border-primary/50"
                        />
                        <input
                            type="text"
                            value={form.rut}
                            onChange={(e) => setForm({ ...form, rut: e.target.value })}
                            placeholder="RUT (ej. 86.359.300-K)"
                            className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-900 outline-none focus:border-primary/50"
                        />
                    </div>
                    <input
                        type="text"
                        value={form.resolution}
                        onChange={(e) => setForm({ ...form, resolution: e.target.value })}
                        placeholder="Resolución (ej. Resolución N°7621 SEREMI DE SALUD ANTOFAGASTA)"
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-900 outline-none focus:border-primary/50"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-5 py-2.5 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-sm">{editingId ? 'save' : 'add'}</span>
                            {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar destino'}
                        </button>
                        {editingId && (
                            <button
                                onClick={cancelEdit}
                                className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                        )}
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3 relative z-0">
                    {loading ? (
                        <div className="text-center py-12 text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">
                            Cargando destinos...
                        </div>
                    ) : destinations.length === 0 ? (
                        <div className="p-12 text-center bg-white/40 backdrop-blur-sm rounded-3xl border border-dashed border-gray-300">
                            <span className="material-symbols-outlined text-4xl text-gray-300 mb-2 block">pin_drop</span>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                                Aún no hay destinos. Agrega uno arriba.
                            </p>
                        </div>
                    ) : (
                        destinations.map(d => (
                            <div
                                key={d.id}
                                className={`bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex items-start gap-3 ${d.active ? 'border-white/80' : 'border-gray-200 opacity-60'}`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-black text-sm text-gray-900 break-words">{d.name}</p>
                                        {d.rut && <span className="text-[10px] text-gray-500 font-bold">RUT: {d.rut}</span>}
                                        {!d.active && (
                                            <span className="text-[8px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-black uppercase shrink-0">Inactivo</span>
                                        )}
                                    </div>
                                    {d.resolution && <p className="text-[11px] text-gray-600 font-bold mt-1 break-words">{d.resolution}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <button
                                        onClick={() => toggleActive(d)}
                                        title={d.active ? 'Desactivar' : 'Activar'}
                                        className={`size-8 rounded-lg flex items-center justify-center transition-colors ${d.active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                    >
                                        <span className="material-symbols-outlined text-base">{d.active ? 'visibility' : 'visibility_off'}</span>
                                    </button>
                                    <button
                                        onClick={() => startEdit(d)}
                                        title="Editar"
                                        className="size-8 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center hover:bg-blue-100 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-base">edit</span>
                                    </button>
                                    <button
                                        onClick={() => handleDelete(d)}
                                        title="Eliminar"
                                        className="size-8 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-100 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-base">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default CgmDestinationsManager;
