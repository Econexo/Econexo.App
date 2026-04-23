import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { supabase } from '../services/supabase';
import { markNotificationAsRead, markAllNotificationsAsRead } from '../services/notificationService';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

function getIcon(type: string): string {
  switch (type) {
    case 'certificate': return 'verified';
    case 'withdrawal': return 'event_upcoming';
    case 'report': return 'analytics';
    case 'document': return 'description';
    case 'account': return 'manage_accounts';
    default: return 'notifications';
  }
}

function getIconColor(type: string): string {
  switch (type) {
    case 'certificate': return 'bg-green-50 text-green-600';
    case 'withdrawal': return 'bg-blue-50 text-blue-600';
    case 'report': return 'bg-purple-50 text-purple-600';
    case 'document': return 'bg-orange-50 text-orange-600';
    case 'account': return 'bg-red-50 text-red-600';
    default: return 'bg-gray-50 text-gray-600';
  }
}

function getRelativeTime(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  if (hours < 24) return `Hace ${hours}h`;
  return `Hace ${days}d`;
}

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        setNotifications(data || []);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    if (!userId) return;
    const result = await markAllNotificationsAsRead(userId);
    if (result.success) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  };

  const handleMarkRead = async (id: string) => {
    const result = await markNotificationAsRead(id);
    if (result.success) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }
  };

  return (
    <div className="relative font-sans bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-8 overflow-hidden">
      <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

      <div className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/40 dark:border-slate-700/40 p-4 flex items-center justify-between shadow-sm">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-700/80 rounded-full border border-white/40 dark:border-slate-600/40 shadow-sm transition-all">
          <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">arrow_back</span>
        </button>
        <h2 className="text-lg font-display font-black text-gray-900 dark:text-white">Notificaciones</h2>
        <div className="size-10"></div>
      </div>

      <div className="p-4 space-y-4 relative z-10">
        <div className="flex items-center justify-between px-2 mb-2">
          <h3 className="font-bold text-gray-400 dark:text-gray-500 text-xs uppercase tracking-widest">Recientes</h3>
          <button
            onClick={handleMarkAllRead}
            className="text-primary text-[10px] font-black uppercase tracking-widest hover:text-green-600 transition-colors"
          >
            Marcar todo como leído
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="material-symbols-outlined text-5xl text-gray-300">notifications_off</span>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sin notificaciones</p>
          </div>
        )}

        {notifications.map(n => (
          <div
            key={n.id}
            onClick={() => !n.read && handleMarkRead(n.id)}
            className={`relative bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl p-4 rounded-[24px] border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] space-y-3 transition-transform active:scale-[0.98] cursor-pointer ${!n.read ? 'border-l-4 border-l-primary' : ''}`}
          >
            {!n.read && <div className="absolute top-4 right-4 size-2.5 rounded-full bg-primary shadow-glow animate-pulse"></div>}
            <div className="flex gap-4">
              <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 border border-white/50 dark:border-slate-600/40 shadow-sm ${getIconColor(n.type)}`}>
                <span className="material-symbols-outlined text-2xl">{getIcon(n.type)}</span>
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-display font-bold text-sm text-gray-900 dark:text-white leading-tight">{n.title}</h4>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-medium">{n.message}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 pt-1 font-black uppercase tracking-widest">{getRelativeTime(n.created_at)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Navbar />
    </div>
  );
};

export default Notifications;
