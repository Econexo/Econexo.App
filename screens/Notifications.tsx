
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
      color: 'bg-primary/10 text-primary',
      unread: true
    },
    {
      id: '2',
      title: 'Nueva Normativa MMA',
      message: 'Se han actualizado los reglamentos para la gestión de residuos industriales.',
      time: 'Hace 5 horas',
      type: 'info',
      icon: 'info',
      color: 'bg-blue-500/10 text-blue-500',
      unread: false
    }
  ];

  return (
    <div className="relative font-sans bg-[#f0f4f0] min-h-screen text-slate-900 max-w-md md:max-w-2xl xl:max-w-5xl mx-auto pb-28 xl:pb-8 overflow-hidden">
      {/* Decorative Background Blobs */}
      <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

      <div className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-white/40 p-4 flex items-center justify-between shadow-sm">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 hover:bg-white/80 rounded-full border border-white/40 shadow-sm transition-all">
          <span className="material-symbols-outlined text-gray-700">arrow_back</span>
        </button>
        <h2 className="text-lg font-display font-black text-gray-900">Notificaciones</h2>
        <div className="size-10"></div>
      </div>

      <div className="p-4 space-y-4 relative z-10">
        <div className="flex items-center justify-between px-2 mb-2">
          <h3 className="font-bold text-gray-400 text-xs uppercase tracking-widest">Recientes</h3>
          <button className="text-primary text-[10px] font-black uppercase tracking-widest hover:text-green-600 transition-colors">Marcar todo como leído</button>
        </div>

        {notifications.map(n => (
          <div key={n.id} className={`relative bg-white/60 backdrop-blur-2xl p-4 rounded-[24px] border border-white/80 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] space-y-3 transition-transform active:scale-[0.98] ${n.unread ? 'border-l-4 border-l-primary' : ''}`}>
            {n.unread && <div className="absolute top-4 right-4 size-2.5 rounded-full bg-primary shadow-glow animate-pulse"></div>}
            <div className="flex gap-4">
              <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 ${n.color} border border-white/50 shadow-sm`}>
                <span className="material-symbols-outlined text-2xl filled">{n.icon}</span>
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-display font-bold text-sm text-gray-900 leading-tight">{n.title}</h4>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">{n.message}</p>
                <p className="text-[10px] text-gray-400 pt-1 font-black uppercase tracking-widest">{n.time}</p>
              </div>
            </div>
            {n.type === 'success' && (
              <button className="w-full h-10 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
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
