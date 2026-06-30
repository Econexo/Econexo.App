import React from 'react';
import { AdminUserProfile, MONTH_NAMES } from './types';

export interface CgmDestinationOption {
    id: string;
    name: string;
    rut: string;
    resolution: string;
}

interface MonthlyGenModalProps {
    show: boolean;
    selectedUser: AdminUserProfile | null;
    selectedMonth: number;
    onMonthChange: (month: number) => void;
    selectedYear: number;
    onYearChange: (year: number) => void;
    onGenerate: () => void;
    onClose: () => void;
    destinations: CgmDestinationOption[];
    selectedDestinationIds: string[];
    onToggleDestination: (id: string) => void;
}

const MonthlyGenModal: React.FC<MonthlyGenModalProps> = ({
    show,
    selectedUser,
    selectedMonth,
    onMonthChange,
    selectedYear,
    onYearChange,
    onGenerate,
    onClose,
    destinations,
    selectedDestinationIds,
    onToggleDestination,
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative bg-white/90 backdrop-blur-2xl w-full max-w-[360px] max-h-[88vh] overflow-y-auto rounded-[32px] p-8 border border-white/80 shadow-2xl animate-in zoom-in duration-200">
                <h3 className="text-lg font-display font-black mb-4 text-gray-900">
                    {selectedUser ? `Generar CGM: ${selectedUser.company_name}` : 'Generar Mensuales (Lote)'}
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-gray-500">Mes</label>
                        <select
                            value={selectedMonth}
                            onChange={(e) => onMonthChange(Number(e.target.value))}
                            className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none"
                        >
                            {MONTH_NAMES.map((m, i) => (
                                <option key={i} value={i}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-gray-500">Año</label>
                        <input
                            type="number"
                            value={selectedYear}
                            onChange={(e) => onYearChange(Number(e.target.value))}
                            className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-gray-500 block mb-2">Destinos Autorizados</label>
                        {destinations.length === 0 ? (
                            <p className="text-[11px] text-gray-400 font-bold bg-white/40 border border-white/60 rounded-xl px-3 py-2.5">
                                No hay destinos. Agrégalos en "Destinos CGM" del panel.
                            </p>
                        ) : (
                            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                {destinations.map(d => {
                                    const checked = selectedDestinationIds.includes(d.id);
                                    return (
                                        <button
                                            key={d.id}
                                            type="button"
                                            onClick={() => onToggleDestination(d.id)}
                                            className={`w-full flex items-start gap-2.5 text-left px-3 py-2.5 rounded-xl border transition-all ${checked ? 'bg-primary/10 border-primary/40' : 'bg-white/50 border-white/60 hover:bg-white/80'}`}
                                        >
                                            <span className={`material-symbols-outlined text-base shrink-0 mt-0.5 ${checked ? 'text-primary' : 'text-gray-300'}`}>
                                                {checked ? 'check_box' : 'check_box_outline_blank'}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-xs font-black text-gray-900 break-words">{d.name}{d.rut ? ` · ${d.rut}` : ''}</span>
                                                {d.resolution && <span className="block text-[10px] text-gray-500 font-bold break-words">{d.resolution}</span>}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <p className="text-[9px] text-gray-400 font-bold mt-1.5">Marca solo los destinos que correspondan a este certificado.</p>
                    </div>

                    <button
                        onClick={onGenerate}
                        className="w-full py-3 bg-primary text-white rounded-xl font-black uppercase tracking-widest shadow-lg hover:shadow-xl transition-all"
                    >
                        Generar Borradores
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
    );
};

export default MonthlyGenModal;
