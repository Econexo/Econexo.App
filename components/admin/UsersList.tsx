import React from 'react';
import { AdminUserProfile } from './types';

interface UsersListProps {
    users: AdminUserProfile[];
    onViewClient: (user: AdminUserProfile) => void;
    onShowUnregistered: () => void;
}

const UsersList: React.FC<UsersListProps> = ({ users, onViewClient, onShowUnregistered }) => {
    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Usuarios Registrados</h3>
                    <button
                        onClick={onShowUnregistered}
                        className="bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-1"
                    >
                        <span className="material-symbols-outlined text-[12px]">engineering</span>
                        Clientes Manuales
                    </button>
                </div>
                <span className="bg-white/50 text-gray-600 text-[10px] font-black px-2 py-0.5 rounded-full border border-gray-200">{users.length}</span>
            </div>

            <div className="space-y-3">
                {users.map(u => (
                    <div key={u.id} className="bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex items-center gap-4">
                        <div className="size-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center font-bold border border-blue-100 uppercase">
                            {u.company_name?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <p className="font-bold text-sm truncate text-gray-900">{u.company_name}</p>
                                {u.is_active === false && (
                                    <span className="shrink-0 bg-red-100 text-red-700 text-[9px] font-black uppercase tracking-widest rounded px-2 py-0.5">
                                        Suspendida
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{u.rut}</p>
                        </div>
                        <button
                            onClick={() => onViewClient(u)}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors text-[10px] font-black uppercase tracking-wide"
                        >
                            <span className="material-symbols-outlined text-base">manage_accounts</span>
                            <span className="hidden sm:inline">Ver Empresa</span>
                        </button>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default UsersList;
