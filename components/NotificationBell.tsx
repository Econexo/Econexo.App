import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { markNotificationAsRead, markAllNotificationsAsRead, getNotifications } from '../services/notificationService';

interface Notification {
    id: string;
    title: string;
    message: string;
    type: string;
    read: boolean;
    created_at: string;
    metadata?: any;
}

const NotificationBell: React.FC = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [showPanel, setShowPanel] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [userId, setUserId] = useState<string | null>(null);
    const [animate, setAnimate] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        initializeNotifications();
        setupRealtimeSubscription();

        // Initialize audio
        audioRef.current = new Audio('/notification-sound.wav');
        audioRef.current.volume = 0.5;

        return () => {
            // Cleanup subscription on unmount
            supabase.channel('notifications').unsubscribe();
        };
    }, []);

    const initializeNotifications = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        setUserId(user.id);
        await fetchNotifications(user.id);
    };

    const fetchNotifications = async (uid: string) => {
        const { data } = await getNotifications(uid, 20);
        setNotifications(data);
        setUnreadCount(data.filter((n: Notification) => !n.read).length);
    };

    const setupRealtimeSubscription = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const channel = supabase
            .channel('notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const newNotification = payload.new as Notification;
                    setNotifications((prev) => [newNotification, ...prev]);
                    setUnreadCount((prev) => prev + 1);

                    // Play sound and animate
                    playNotificationSound();
                    triggerAnimation();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const updatedNotification = payload.new as Notification;
                    setNotifications((prev) =>
                        prev.map((n) => (n.id === updatedNotification.id ? updatedNotification : n))
                    );
                    setUnreadCount((prev) => {
                        const newCount = notifications.filter((n) => !n.read).length;
                        return newCount;
                    });
                }
            )
            .subscribe();
    };

    const playNotificationSound = () => {
        if (audioRef.current) {
            audioRef.current.play().catch((err) => console.log('Sound play failed:', err));
        }
    };

    const triggerAnimation = () => {
        setAnimate(true);
        setTimeout(() => setAnimate(false), 1000);
    };

    const handleMarkAsRead = async (notificationId: string) => {
        await markNotificationAsRead(notificationId);
        setNotifications((prev) =>
            prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
    };

    const handleMarkAllAsRead = async () => {
        if (!userId) return;
        await markAllNotificationsAsRead(userId);
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
    };

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case 'certificate':
                return 'verified';
            case 'withdrawal':
                return 'event_upcoming';
            case 'report':
                return 'analytics';
            case 'document':
                return 'description';
            default:
                return 'notifications';
        }
    };

    const getRelativeTime = (timestamp: string) => {
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now.getTime() - then.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Ahora';
        if (diffMins < 60) return `Hace ${diffMins} min`;
        if (diffHours < 24) return `Hace ${diffHours}h`;
        if (diffDays < 7) return `Hace ${diffDays}d`;
        return then.toLocaleDateString('es-CL');
    };

    // Close panel when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                setShowPanel(false);
            }
        };

        if (showPanel) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showPanel]);

    return (
        <div className="relative" ref={panelRef}>
            {/* Bell Button */}
            <button
                onClick={() => setShowPanel(!showPanel)}
                className={`relative size-10 flex items-center justify-center rounded-full bg-white/50 hover:bg-white/80 transition-all border border-white/40 shadow-sm ${animate ? 'animate-bounce' : ''
                    }`}
            >
                <span className="material-symbols-outlined text-gray-700">notifications</span>
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 size-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Notification Panel */}
            {showPanel && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-in slide-in-from-top-2 fade-in duration-200">
                    {/* Header */}
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                        <h3 className="font-display font-black text-gray-900 text-sm">Notificaciones</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllAsRead}
                                className="text-[10px] font-bold text-primary hover:underline uppercase tracking-widest"
                            >
                                Marcar todas
                            </button>
                        )}
                    </div>

                    {/* Notification List */}
                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">
                                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">notifications_off</span>
                                <p className="text-xs font-bold uppercase tracking-widest">No hay notificaciones</p>
                            </div>
                        ) : (
                            notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    onClick={() => handleMarkAsRead(notification.id)}
                                    className={`p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${!notification.read ? 'bg-primary/5' : ''
                                        }`}
                                >
                                    <div className="flex gap-3">
                                        <div
                                            className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${notification.type === 'certificate'
                                                ? 'bg-green-50 text-green-600'
                                                : notification.type === 'withdrawal'
                                                    ? 'bg-blue-50 text-blue-600'
                                                    : notification.type === 'report'
                                                        ? 'bg-purple-50 text-purple-600'
                                                        : 'bg-gray-50 text-gray-600'
                                                }`}
                                        >
                                            <span className="material-symbols-outlined text-xl">
                                                {getNotificationIcon(notification.type)}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <h4 className="font-bold text-sm text-gray-900 truncate">{notification.title}</h4>
                                                {!notification.read && (
                                                    <span className="size-2 rounded-full bg-primary shrink-0 mt-1.5"></span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                                {getRelativeTime(notification.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
