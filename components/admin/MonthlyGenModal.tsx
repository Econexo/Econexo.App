import React from 'react';
import { AdminUserProfile, MONTH_NAMES } from './types';

interface MonthlyGenModalProps {
    show: boolean;
    selectedUser: AdminUserProfile | null;
    selectedMonth: number;
    onMonthChange: (month: number) => void;
    selectedYear: number;
    onYearChange: (year: number) => void;
    onGenerate: () => void;
    onClose: () => void;
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
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative bg-white/90 backdrop-blur-2xl w-full max-w-[340px] rounded-[32px] p-8 border border-white/80 shadow-2xl animate-in zoom-in duration-200">
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
