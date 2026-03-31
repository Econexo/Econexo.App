import React from 'react';

interface SettingsModalProps {
    show: boolean;
    isDarkMode: boolean;
    onToggleTheme: () => void;
    onClose: () => void;
    onOpenSupport: () => void;
    onOpenPasswordChange: () => void;
    onDeleteAccount: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
    show,
    isDarkMode,
    onToggleTheme,
    onClose,
    onOpenSupport,
    onOpenPasswordChange,
    onDeleteAccount,
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={onClose}></div>
            <div className="relative w-full max-w-md bg-white/90 backdrop-blur-2xl border-t border-x border-white/80 rounded-t-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-full duration-500">

                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-gray-300 rounded-full"></div>

                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-2xl font-display font-black text-gray-900">Ajustes</h3>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Configuración General</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="size-10 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Dark Mode */}
                    <label className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-white/60 cursor-pointer hover:bg-white/80 transition-colors group shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center border border-purple-100">
                                <span className="material-symbols-outlined">dark_mode</span>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900 group-hover:text-purple-600 transition-colors">Modo Oscuro</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Apariencia Visual</p>
                            </div>
                        </div>
                        <div className="relative">
                            <input type="checkbox" checked={isDarkMode} onChange={onToggleTheme} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500 shadow-inner"></div>
                        </div>
                    </label>

                    {/* Notifications */}
                    <label className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-white/60 cursor-pointer hover:bg-white/80 transition-colors group shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-100">
                                <span className="material-symbols-outlined">notifications</span>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Notificaciones</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Alertas y Avisos</p>
                            </div>
                        </div>
                        <div className="relative">
                            <input type="checkbox" defaultChecked className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500 shadow-inner"></div>
                        </div>
                    </label>

                    {/* Report Problem */}
                    <div
                        onClick={() => { onClose(); onOpenSupport(); }}
                        className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10 cursor-pointer hover:bg-primary/10 active:scale-[0.98] transition-all group shadow-sm"
                    >
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center border border-primary/20">
                                <span className="material-symbols-outlined">support_agent</span>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">Reportar Problema</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Soporte Técnico</p>
                            </div>
                        </div>
                        <span className="material-symbols-outlined text-primary/40 group-hover:text-primary group-hover:translate-x-1 transition-all">chevron_right</span>
                    </div>

                    {/* Change Password */}
                    <div
                        onClick={() => { onClose(); onOpenPasswordChange(); }}
                        className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-white/60 cursor-pointer hover:bg-white/80 transition-colors group shadow-sm"
                    >
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-green-50 text-green-500 flex items-center justify-center border border-green-100">
                                <span className="material-symbols-outlined">lock_reset</span>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900 group-hover:text-green-600 transition-colors">Cambiar Contraseña</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Seguridad</p>
                            </div>
                        </div>
                        <span className="material-symbols-outlined text-green-300 group-hover:text-green-500 transition-colors">chevron_right</span>
                    </div>

                    {/* Delete Account */}
                    <div
                        onClick={onDeleteAccount}
                        className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100 cursor-pointer hover:bg-red-100 active:scale-[0.98] transition-all group shadow-sm"
                    >
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-red-100 text-red-500 flex items-center justify-center border border-red-200">
                                <span className="material-symbols-outlined">delete_forever</span>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-red-600">Eliminar Cuenta</p>
                                <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Acción Irreversible</p>
                            </div>
                        </div>
                        <span className="material-symbols-outlined text-red-300 group-hover:text-red-500 transition-colors">chevron_right</span>
                    </div>
                </div>

                <div className="mt-8">
                    <button
                        onClick={onClose}
                        className="w-full py-4 bg-gray-900 text-white font-display font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-lg shadow-gray-900/20 hover:shadow-gray-900/30 active:scale-[0.98] transition-all"
                    >
                        Listo
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
