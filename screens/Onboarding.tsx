import React, { useState } from 'react';

interface OnboardingProps {
  onComplete: () => void;
}

const SLIDES = [
  {
    icon: 'verified',
    color: 'bg-primary',
    title: 'Registra tus retiros',
    description: 'Sube tus Certificados de Retiro (CR) y lleva un historial completo de todos los residuos que gestionas.',
  },
  {
    icon: 'analytics',
    color: 'bg-blue-500',
    title: 'Mide tu impacto real',
    description: 'Visualiza cuántos árboles, litros de agua y kWh de energía has salvado con tu gestión ambiental.',
  },
  {
    icon: 'smart_toy',
    color: 'bg-purple-500',
    title: 'Consulta a tu asistente IA',
    description: 'Pregunta sobre Ley REP, DS 148, normativas ambientales y gestión de residuos. Respuestas al instante.',
  },
  {
    icon: 'eco',
    color: 'bg-amber-500',
    title: 'Gana Eco-Puntos',
    description: 'Cada retiro registrado suma puntos que puedes canjear por descuentos en servicios y productos reciclados.',
  },
];

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [current, setCurrent] = useState(0);
  const isLast = current === SLIDES.length - 1;
  const slide = SLIDES[current];

  return (
    <div className="fixed inset-0 z-[200] bg-[#f0f4f0] dark:bg-slate-950 flex flex-col items-center justify-between p-8 font-display">
      {/* Skip */}
      <div className="w-full flex justify-end">
        <button
          onClick={onComplete}
          className="text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          Omitir
        </button>
      </div>

      {/* Slide content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center max-w-sm w-full">
        <div className={`size-28 rounded-[2.5rem] ${slide.color} flex items-center justify-center shadow-2xl shadow-black/10`}>
          <span className="material-symbols-outlined filled text-white text-6xl">{slide.icon}</span>
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white leading-tight">
            {slide.title}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-bold leading-relaxed">
            {slide.description}
          </p>
        </div>
      </div>

      {/* Dots + button */}
      <div className="w-full max-w-sm space-y-6">
        {/* Progress dots */}
        <div className="flex justify-center gap-2">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === current
                  ? 'w-6 h-2 bg-primary'
                  : 'w-2 h-2 bg-gray-300 dark:bg-slate-600'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => isLast ? onComplete() : setCurrent(c => c + 1)}
          className="w-full h-14 bg-primary text-white font-black text-sm uppercase tracking-[0.2em] rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all"
        >
          {isLast ? '¡Comenzar!' : 'Siguiente'}
        </button>
      </div>
    </div>
  );
};

export default Onboarding;
