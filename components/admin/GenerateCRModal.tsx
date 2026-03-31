import React from 'react';
import { AdminUserProfile, WasteItem, WASTE_CATEGORIES } from './types';

interface CurrentWaste {
    waste_type: string;
    description: string;
    quantity: string;
    unit: string;
}

interface GenerateCRModalProps {
    show: boolean;
    selectedUser: AdminUserProfile | null;
    onUserChange: (user: AdminUserProfile) => void;
    withdrawalDate: string;
    onDateChange: (date: string) => void;
    wasteItems: WasteItem[];
    currentWaste: CurrentWaste;
    onCurrentWasteChange: (waste: CurrentWaste) => void;
    onAddItem: () => void;
    onRemoveItem: (index: number) => void;
    onGenerate: () => void;
    onClose: () => void;
}

const GenerateCRModal: React.FC<GenerateCRModalProps> = ({
    show,
    selectedUser,
    onUserChange,
    withdrawalDate,
    onDateChange,
    wasteItems,
    currentWaste,
    onCurrentWasteChange,
    onAddItem,
    onRemoveItem,
    onGenerate,
    onClose,
}) => {
    if (!show || !selectedUser) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative bg-white/90 backdrop-blur-2xl w-full max-w-[380px] rounded-[32px] p-8 border border-white/80 shadow-2xl animate-in zoom-in duration-200 overflow-y-auto max-h-[90vh]">
                <h3 className="text-xl font-display font-black mb-6 text-gray-900">Generar Certificado</h3>
                <div className="space-y-6">
                    {/* Company Data */}
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Datos de la Empresa</h4>
                        <input
                            className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none font-bold text-gray-900"
                            value={selectedUser.company_name}
                            onChange={(e) => onUserChange({ ...selectedUser, company_name: e.target.value })}
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <input
                                className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none font-bold text-gray-900"
                                value={selectedUser.rut}
                                onChange={(e) => onUserChange({ ...selectedUser, rut: e.target.value })}
                            />
                            <input
                                className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none font-bold text-gray-900"
                                value={selectedUser.address}
                                onChange={(e) => onUserChange({ ...selectedUser, address: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Withdrawal Date */}
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Fecha del Retiro</h4>
                        <input
                            type="date"
                            className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none font-bold text-gray-900 shadow-inner"
                            value={withdrawalDate}
                            onChange={(e) => onDateChange(e.target.value)}
                        />
                    </div>

                    <div className="h-px bg-gray-200"></div>

                    {/* Waste Details */}
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Detalle de Residuos</h4>

                        {wasteItems.length > 0 && (
                            <div className="bg-white/50 rounded-xl overflow-hidden border border-white/60">
                                {wasteItems.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-3 border-b border-gray-100 last:border-0 text-xs">
                                        <div>
                                            <p className="font-bold text-gray-900">{item.quantity} {item.unit} - {item.waste_type}</p>
                                            <p className="text-gray-500 text-[10px]">{item.description}</p>
                                        </div>
                                        <button
                                            onClick={() => onRemoveItem(idx)}
                                            className="text-red-500 hover:bg-red-50 rounded-full p-1"
                                        >
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add Waste Form */}
                        <div className="p-3 bg-white/50 rounded-xl border border-white/60 border-dashed space-y-3 text-xs">
                            <select
                                className="w-full bg-transparent border border-gray-300 rounded-xl px-4 py-3 outline-none font-bold text-gray-900"
                                value={currentWaste.waste_type}
                                onChange={(e) => onCurrentWasteChange({ ...currentWaste, waste_type: e.target.value })}
                            >
                                <option value="">Seleccionar...</option>
                                {WASTE_CATEGORIES.map(cat => (
                                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                                ))}
                            </select>
                            <input
                                className="w-full bg-transparent border border-gray-300 rounded-xl px-4 py-3 outline-none font-bold text-gray-900"
                                placeholder="Descripción"
                                value={currentWaste.description}
                                onChange={(e) => onCurrentWasteChange({ ...currentWaste, description: e.target.value })}
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    type="number"
                                    className="w-full bg-transparent border border-gray-300 rounded-xl px-4 py-3 outline-none font-bold text-gray-900"
                                    placeholder="Cantidad"
                                    value={currentWaste.quantity}
                                    onChange={(e) => onCurrentWasteChange({ ...currentWaste, quantity: e.target.value })}
                                />
                                <input
                                    className="w-full bg-transparent border border-gray-300 rounded-xl px-4 py-3 outline-none font-bold text-gray-900"
                                    placeholder="Unidad"
                                    value={currentWaste.unit}
                                    onChange={(e) => onCurrentWasteChange({ ...currentWaste, unit: e.target.value })}
                                />
                            </div>
                            <button
                                onClick={onAddItem}
                                className="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold uppercase tracking-widest flex items-center justify-center gap-2 text-gray-600 transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">add</span>Agregar
                            </button>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-2">
                        <button
                            onClick={onGenerate}
                            className="w-full py-4 bg-primary text-background-dark rounded-2xl font-display font-black uppercase tracking-widest shadow-glow active:scale-95 transition-transform"
                        >
                            Emitir Certificado ({wasteItems.length})
                        </button>
                        <button
                            onClick={onClose}
                            className="w-full py-3 text-gray-500 hover:text-gray-900 text-[10px] font-black uppercase tracking-widest mt-2 transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GenerateCRModal;
