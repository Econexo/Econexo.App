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

type FilterType = 'all' | 'certificate' | 'withdrawal' | 'report' | 'document' | 'account';

const FILTERS: { key: FilterType; label: string; icon: string }[] = [
  { key: 'all',         label: 'Todas',        icon: 'notifications' },
  { key: 'certificate', label: 'Certificados', icon: 'verified' },
  { key: 'withdrawal',  label: 'Retiros',      icon: 'event_upcoming' },
  { key: 'report',      label: 'Reportes',     icon: 'analytics' },
  { key: 'document',    label: 'Documentos',   icon: 'description' },
  { key: 'account',     label: 'Cuenta',       icon: 'manage_accounts' },
];

function getIcon(type: string): string {
  switch (type) {
    case 'certificate': return 'verified';
    case 'withdrawal':  return 'event_upcoming';
    case 'report':      return 'analytics';
    case 'document':    return 'description';
    case 'account':     return 'manage_accounts';
    default:            return 'notifications';
  }
}

function getIconColor(type: string): string {
  switch (type) {
    case 'certificate': return 'bg-green-50 dark:bg-green-900/30 text-green-600';
    case 'withdrawal':  return 'bg-blue-50 dark:bg-blue-900/30 text-blue-600';
    case 'report':      return 'bg-purple-50 dark:bg-purple-900/30 text-purple-600';
    case 'document':    return 'bg-orange-50 dark:bg-orange-900/30 text-orange-600';
    case 'account':     return 'bg-red-50 dark:bg-red-900/30 text-red-600';
    default:            return 'bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300';
  }
}

function getRelativeTime(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins  = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins < 1)   return 'Ahora';
  if (mins < 60)  return `Hace ${mins} min`;
  if (hours < 24) return `Hace ${hours}h`;
  return `Hace ${days}d`;
}

const SkeletonCard = () => (
  <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl p-4 rounded-[24px] border border-white/80 dark:border-slate-600/50 flex gap-4 animate-pulse">
    <div className="size-12 rounded-xl bg-gray-200 dark:bg-slate-700 shrink-0" />
    <div className="flex-1 space-y-2 py-1">
      <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/3" />
      <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-full" />
      <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-2/3" />
    </div>
  </div>
);

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

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
    if (result.success) setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleMarkRead = async (id: string) => {
    const result = await markNotificationAsRead(id);
    if (result.success) setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.type === filter);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative font-sans bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-8 overflow-hidden">
      <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none" />
      <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none" />

      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/40 dark:border-slate-700/40 shadow-sm">
        <div className="p-4 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 rounded-full border border-white/40 dark:border-slate-600/40 shadow-sm transition-all">
            <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">arrow_back</span>
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-display font-black text-gray-900 dark:text-white">Notificaciones</h2>
            {unreadCount > 0 && (
              <span className="size-5 bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center leading-none">{unreadCount}</span>
            )}
          </div>
          <button onClick={handleMarkAllRead} className="text-primary text-[10px] font-black uppercase tracking-widest hover:text-green-600 transition-colors">
            Leer todo
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shrink-0 transition-all ${
                filter === f.key
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white/60 dark:bg-slate-800/60 text-gray-500 dark:text-gray-400 border-white/60 dark:border-slate-600/50 hover:border-primary/30'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3 relative z-10">
        {/* Skeleton loaders */}
        {loading && Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="size-20 rounded-3xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-gray-400 dark:text-gray-500">
                {filter === 'all' ? 'notifications_off' : getIcon(filter)}
              </span>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-black text-gray-700 dark:text-gray-300">
                {filter === 'all' ? 'Sin notificaciones aún' : `Sin notificaciones de ${FILTERS.find(f => f.key === filter)?.label.toLowerCase()}`}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">Te avisaremos cuando haya novedades</p>
            </div>
            {filter !== 'all' && (
              <button onClick={() => setFilter('all')} className="text-primary text-[10px] font-black uppercase tracking-widest">
                Ver todas
              </button>
            )}
          </div>
        )}

        {/* Notification cards */}
        {!loading && filtered.map((n, idx) => (
          <div
            key={n.id}
            onClick={() => !n.read && handleMarkRead(n.id)}
            className={`relative bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl p-4 rounded-[24px] border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] transition-all active:scale-[0.98] cursor-pointer animate-in fade-in slide-in-from-bottom-2 ${!n.read ? 'border-l-4 border-l-primary' : ''}`}
            style={{ animationDelay: `${idx * 40}ms` }}
          >
            {!n.read && <div className="absolute top-4 right-4 size-2.5 rounded-full bg-primary animate-pulse" />}
            <div className="flex gap-4">
              <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 border border-white/50 dark:border-slate-600/40 shadow-sm ${getIconColor(n.type)}`}>
                <span className="material-symbols-outlined text-2xl">{getIcon(n.type)}</span>
              </div>
              <div className="flex-1 space-y-1 min-w-0">
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
