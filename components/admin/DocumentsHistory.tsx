import React from 'react';
import { AdminDocument, AdminUserProfile, AdminPath, MONTH_NAMES, MONTH_SHORT } from './types';

interface DocumentsHistoryProps {
    certs: AdminDocument[];
    users: AdminUserProfile[];
    adminPath: AdminPath;
    onPathChange: (path: AdminPath) => void;
    onViewCert: (cert: AdminDocument, action: 'preview' | 'save') => void;
    onDeleteCert: (cert: AdminDocument) => void;
    onOpenCRModal: (user: AdminUserProfile) => void;
    onOpenMonthlyModal: (user: AdminUserProfile) => void;
}

const DocumentsHistory: React.FC<DocumentsHistoryProps> = ({
    certs,
    users,
    adminPath,
    onPathChange,
    onViewCert,
    onDeleteCert,
    onOpenCRModal,
    onOpenMonthlyModal,
}) => {
    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Documentos Emitidos</h3>
                <span className="bg-primary/20 text-primary text-[10px] font-black px-2 py-0.5 rounded-full">{certs.length}</span>
            </div>

            {/* Folder Navigation Header */}
            {adminPath.level !== 'home' && (
                <div className="flex items-center gap-2 px-2 pb-2">
                    <button
                        onClick={() => {
                            if (adminPath.level === 'history_files') onPathChange({ ...adminPath, level: 'history_months' });
                            else if (adminPath.level === 'history_months') onPathChange({ ...adminPath, level: 'history_years', month: undefined });
                            else if (adminPath.level === 'history_years') onPathChange({ ...adminPath, level: 'history_companies', year: undefined });
                            else if (adminPath.level === 'history_companies') onPathChange({ level: 'home' });
                            else if (adminPath.level === 'monthly_gen_users') onPathChange({ level: 'home' });
                        }}
                        className="size-8 bg-white/60 hover:bg-white rounded-full flex items-center justify-center shadow-sm transition-all"
                    >
                        <span className="material-symbols-outlined text-gray-600 text-sm">arrow_back</span>
                    </button>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Navegando</span>
                        <span className="text-xs font-black text-gray-900">
                            {adminPath.level === 'history_companies' && 'Historial por Empresa'}
                            {adminPath.level === 'history_years' && `${adminPath.companyName}`}
                            {adminPath.level === 'history_months' && `${adminPath.companyName} / ${adminPath.year}`}
                            {adminPath.level === 'history_files' && `${adminPath.companyName} / ${adminPath.year} / ${MONTH_SHORT[adminPath.month || 0]}`}
                            {adminPath.level === 'monthly_gen_users' && 'Certificados Mensuales'}
                        </span>
                    </div>
                </div>
            )}

            {certs.length === 0 && adminPath.level.startsWith('history') ? (
                <div className="p-8 text-center bg-white/40 backdrop-blur-sm rounded-3xl border border-dashed border-gray-300">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Sin certificados</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {/* LEVEL: HOME */}
                    {adminPath.level === 'home' && (
                        <div className="grid grid-cols-1 gap-4">
                            <button
                                onClick={() => onPathChange({ ...adminPath, level: 'history_companies' })}
                                className="bg-white/60 backdrop-blur-2xl p-5 rounded-3xl border border-white/80 shadow-sm flex items-center gap-4 hover:scale-[1.02] transition-transform group"
                            >
                                <div className="size-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 border border-blue-100 group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-3xl">folder_managed</span>
                                </div>
                                <div className="flex-1 text-left">
                                    <h4 className="font-black text-sm text-gray-900">Historial por Empresa</h4>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Ver todos los documentos emitidos</p>
                                </div>
                                <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                            </button>

                            <button
                                onClick={() => onPathChange({ ...adminPath, level: 'monthly_gen_users' })}
                                className="bg-white/60 backdrop-blur-2xl p-5 rounded-3xl border border-white/80 shadow-sm flex items-center gap-4 hover:scale-[1.02] transition-transform group"
                            >
                                <div className="size-14 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 border border-orange-100 group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-3xl">calendar_add_on</span>
                                </div>
                                <div className="flex-1 text-left">
                                    <h4 className="font-black text-sm text-gray-900">Certificados Mensuales</h4>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Generar nuevos certificados</p>
                                </div>
                                <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                            </button>
                        </div>
                    )}

                    {/* LEVEL: MONTHLY GEN USERS LIST */}
                    {adminPath.level === 'monthly_gen_users' && (
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 px-2">Empresas con Retiros (CR)</h3>
                            {users
                                .filter(u => certs.some(c => c.user_id === u.id && c.type === 'CR'))
                                .map(u => (
                                    <div key={u.id} className="bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border border-white/80 shadow-sm flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="size-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center font-bold border border-orange-100 uppercase">
                                                {u.company_name?.[0]}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-sm truncate text-gray-900">{u.company_name}</p>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{u.rut}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => onOpenMonthlyModal(u)}
                                            className="px-3 py-2 bg-orange-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-base">post_add</span>
                                            Generar CGM
                                        </button>
                                    </div>
                                ))}
                            {users.filter(u => certs.some(c => c.user_id === u.id && c.type === 'CR')).length === 0 && (
                                <div className="p-8 text-center">
                                    <p className="text-xs text-gray-500 font-bold">No hay empresas con certificados de recepción emitidos.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* LEVEL: HISTORY COMPANIES */}
                    {adminPath.level === 'history_companies' && (
                        <div className="grid grid-cols-1 gap-3">
                            {Array.from(new Map(certs.map(c => [c._clientId, c])).values()).map(first => {
                                const clientId = first._clientId;
                                const companyName = first._companyName;
                                const isUnreg = first._isUnregistered;
                                const count = certs.filter(c => c._clientId === clientId).length;
                                return (
                                    <button
                                        key={clientId}
                                        onClick={() => onPathChange({ ...adminPath, level: 'history_years', companyId: clientId, companyName })}
                                        className="bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border border-white/80 shadow-sm flex items-center gap-4 hover:scale-[1.01] transition-transform"
                                    >
                                        <div className={`size-10 rounded-xl flex items-center justify-center ${isUnreg ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'}`}>
                                            <span className="material-symbols-outlined">{isUnreg ? 'engineering' : 'domain'}</span>
                                        </div>
                                        <div className="flex-1 text-left">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-sm text-gray-900">{companyName}</p>
                                                {isUnreg && <span className="text-[8px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-black uppercase">Manual</span>}
                                            </div>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase">{count} documentos</p>
                                        </div>
                                        <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* LEVEL: HISTORY YEARS */}
                    {adminPath.level === 'history_years' && adminPath.companyId && (
                        <div className="grid grid-cols-1 gap-3">
                            {Array.from(new Set(
                                certs
                                    .filter(c => c._clientId === adminPath.companyId)
                                    .map(c => new Date(c.created_at).getFullYear())
                            )).sort((a, b) => b - a).map(year => (
                                <button
                                    key={year}
                                    onClick={() => onPathChange({ ...adminPath, level: 'history_months', year })}
                                    className="bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border border-white/80 shadow-sm flex items-center gap-4 hover:scale-[1.01] transition-transform"
                                >
                                    <div className="size-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                                        <span className="material-symbols-outlined">folder_open</span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="font-bold text-sm text-gray-900">{year}</p>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">Año Comercial</p>
                                    </div>
                                    <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* LEVEL: HISTORY MONTHS */}
                    {adminPath.level === 'history_months' && adminPath.year !== undefined && (
                        <div className="grid grid-cols-1 gap-3">
                            {Array.from(new Set(
                                certs
                                    .filter(c => c._clientId === adminPath.companyId && new Date(c.created_at).getFullYear() === adminPath.year)
                                    .map(c => new Date(c.created_at).getMonth())
                            )).sort((a, b) => b - a).map(month => (
                                <button
                                    key={month}
                                    onClick={() => onPathChange({ ...adminPath, level: 'history_files', month })}
                                    className="bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border border-white/80 shadow-sm flex items-center gap-4 hover:scale-[1.01] transition-transform"
                                >
                                    <div className="size-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
                                        <span className="material-symbols-outlined">calendar_month</span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="font-bold text-sm text-gray-900">{MONTH_NAMES[month]}</p>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">Mes</p>
                                    </div>
                                    <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* LEVEL: HISTORY FILES */}
                    {adminPath.level === 'history_files' && adminPath.month !== undefined && (
                        <div className="space-y-3">
                            {certs
                                .filter(c =>
                                    c._clientId === adminPath.companyId &&
                                    new Date(c.created_at).getFullYear() === adminPath.year &&
                                    new Date(c.created_at).getMonth() === adminPath.month
                                )
                                .map(cert => (
                                    <div key={cert.id} className="bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex items-center justify-between gap-4 text-xs">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-gray-900 truncate">{cert.title}</p>
                                                <span className="text-[8px] bg-gray-100 px-1.5 py-0.5 rounded-full font-black uppercase text-gray-400">{cert.type}</span>
                                            </div>
                                            <p className="text-[10px] text-primary font-black uppercase mt-1">{cert._companyName}</p>
                                            <p className="text-[8px] text-gray-400 font-bold mt-0.5">{new Date(cert.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => onViewCert(cert, 'preview')}
                                                className="size-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center hover:bg-primary/20 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-lg">visibility</span>
                                            </button>
                                            <button
                                                onClick={() => onViewCert(cert, 'save')}
                                                className="size-9 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-200 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-lg">download</span>
                                            </button>
                                            <button
                                                onClick={() => onDeleteCert(cert)}
                                                className="size-9 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-100 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete_forever</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

export default DocumentsHistory;
