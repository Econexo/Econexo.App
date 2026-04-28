import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

const DISMISSED_KEY = 'eco_pwa_banner_dismissed';

const PWAInstallBanner: React.FC = () => {
  const { canInstall, isIOS, isInstalled, isInStandaloneMode, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');
  const [showIOSModal, setShowIOSModal] = useState(false);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  if (isInstalled || isInStandaloneMode || dismissed) return null;
  if (!canInstall && !isIOS) return null;

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 bg-primary/10 border border-primary/20 rounded-2xl mx-0">
        <div className="size-9 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/30">
          <span className="material-symbols-outlined text-white text-lg">install_mobile</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-primary">Instala la app</p>
          <p className="text-[10px] text-gray-500 font-bold">Accede más rápido desde tu pantalla de inicio</p>
        </div>
        <button
          onClick={isIOS ? () => setShowIOSModal(true) : install}
          className="px-3 py-1.5 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest shrink-0 active:scale-95 transition-transform shadow-sm"
        >
          Instalar
        </button>
        <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 shrink-0">
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>

      {/* iOS instructions modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowIOSModal(false)} />
          <div className="relative bg-white rounded-[28px] p-6 w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 duration-300 border border-white/80">
            <div className="flex items-center gap-3 mb-5">
              <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-2xl">install_mobile</span>
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-sm">Instalar en iPhone</h3>
                <p className="text-[10px] text-gray-500 font-bold">Sigue estos pasos en Safari</p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { icon: 'ios_share', text: 'Toca el botón Compartir (cuadrado con flecha hacia arriba) en la barra inferior de Safari' },
                { icon: 'add_box', text: 'Desplázate hacia abajo y selecciona "Agregar a pantalla de inicio"' },
                { icon: 'check_circle', text: 'Toca "Agregar" en la esquina superior derecha' },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-black text-primary">{i + 1}</span>
                  </div>
                  <div className="flex items-start gap-2 flex-1">
                    <span className="material-symbols-outlined text-primary text-base mt-0.5 shrink-0">{step.icon}</span>
                    <p className="text-xs text-gray-700 font-medium leading-relaxed">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => { setShowIOSModal(false); handleDismiss(); }}
              className="w-full mt-6 h-12 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default PWAInstallBanner;
