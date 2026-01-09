
import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';

const Notifications: React.FC = () => {
  const navigate = useNavigate();

  const notifications = [
    {
      id: '1',
      title: 'Certificado de Disposición Listo',
      message: 'Su certificado para Plásticos - Zona Norte está validado y listo para descarga.',
      time: 'Hace 2 horas',
      type: 'success',
      icon: 'verified',
      color: 'bg-primary/20 text-primary',
      unread: true
    },
    {
      id: '2',
      title: 'Nueva Normativa MMA',
      message: 'Se han actualizado los reglamentos para la gestión de residuos industriales.',
      time: 'Hace 5 horas',
      type: 'info',
      icon: 'info',
      color: 'bg-blue-500/20 text-blue-400',
      unread: false
    }
  ];

  return (
    <div className="font-spline bg-background-light dark:bg-background-dark min-h-screen text-slate-900 dark:text-white max-w-md mx-auto pb-28">
      <div className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5 p-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-bold">Notificaciones</h2>
        <div className="size-10"></div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between px-2 mb-2">
          <h3 className="font-bold">Recientes</h3>
          <button className="text-primary text-xs font-bold">Marcar todo como leído</button>
        </div>

        {notifications.map(n => (
          <div key={n.id} className="relative bg-white dark:bg-surface-dark p-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm space-y-3 transition-transform active:scale-[0.98]">
            {n.unread && <div className="absolute top-4 right-4 size-2.5 rounded-full bg-primary shadow-glow"></div>}
            <div className="flex gap-4">
              <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 ${n.color}`}>
                <span className="material-symbols-outlined text-2xl">{n.icon}</span>
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-bold text-sm">{n.title}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{n.message}</p>
                <p className="text-[10px] text-gray-400 pt-1 font-medium">{n.time}</p>
              </div>
            </div>
            {n.type === 'success' && (
              <button className="w-full h-10 bg-primary/10 text-primary rounded-lg text-xs font-bold flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-lg">download</span>
                Descargar PDF
              </button>
            )}
          </div>
        ))}
      </div>

      <Navbar />
    </div>
  );
};

export default Notifications;
