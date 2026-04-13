import React from 'react';
import { supabase } from '../services/supabase';

const Suspended: React.FC = () => {
    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <div className="min-h-screen bg-[#f0f4f0] flex flex-col items-center justify-center p-8">
            <div className="bg-white rounded-[32px] border border-white/80 shadow-2xl p-10 max-w-sm w-full text-center space-y-6">
                <div className="size-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-4xl">block</span>
                </div>
                <div>
                    <h1 className="text-xl font-black text-gray-900 mb-2">Cuenta suspendida</h1>
                    <p className="text-sm text-gray-500 font-medium leading-relaxed">
                        Tu cuenta ha sido suspendida. Contacta a soporte para más información.
                    </p>
                </div>
                <button
                    onClick={handleSignOut}
                    className="w-full py-3 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-700 transition-colors"
                >
                    Cerrar sesión
                </button>
            </div>
        </div>
    );
};

export default Suspended;
