import React from 'react';
import { UserProfile } from '../../types';

interface UserDataSectionProps {
    userData: UserProfile;
    onUserDataChange: (data: UserProfile) => void;
    isEditing: boolean;
    onToggleEdit: () => void;
    onSave: () => void;
    onShowEmailModal: () => void;
}

const UserDataSection: React.FC<UserDataSectionProps> = ({
    userData,
    onUserDataChange,
    isEditing,
    onToggleEdit,
    onSave,
    onShowEmailModal,
}) => {
    return (
        <section>
            <div className="flex items-center justify-between mb-2 pl-2">
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Datos Personales</h4>
                <button
                    onClick={() => isEditing ? onSave() : onToggleEdit()}
                    className="text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-primary/10 rounded-lg border border-primary/20 hover:bg-primary/20 transition-all"
                >
                    {isEditing ? 'Guardar' : 'Editar'}
                </button>
            </div>

            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/80 dark:border-white/10 p-4 space-y-4 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] transition-all">
                {isEditing ? (
                    <div className="space-y-3">
                        <input
                            className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
                            value={userData.name}
                            onChange={e => onUserDataChange({ ...userData, name: e.target.value })}
                            placeholder="Nombre completo"
                        />
                        <div className="w-full bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 text-sm font-medium text-gray-500 flex items-center justify-between">
                            <span>{userData.email}</span>
                            <button onClick={onShowEmailModal} className="text-primary text-[10px] font-bold uppercase tracking-widest hover:underline">
                                Cambiar
                            </button>
                        </div>
                        <input
                            className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
                            value={userData.role}
                            onChange={e => onUserDataChange({ ...userData, role: e.target.value })}
                            placeholder="Cargo / Rol"
                        />
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-100"><span className="material-symbols-outlined font-bold">person</span></div>
                            <div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Nombre completo</p><p className="text-sm font-bold tracking-tight text-gray-900">{userData.name}</p></div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-green-50 text-green-500 flex items-center justify-center border border-green-100"><span className="material-symbols-outlined font-bold">alternate_email</span></div>
                            <div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Email Corporativo</p><p className="text-sm font-bold tracking-tight text-gray-900">{userData.email}</p></div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center border border-orange-100"><span className="material-symbols-outlined font-bold">badge</span></div>
                            <div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Cargo / Rol</p><p className="text-sm font-bold tracking-tight text-gray-900">{userData.role || 'No especificado'}</p></div>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
};

export default UserDataSection;
