
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';

// Hardcoded unread count matching Notifications screen data.
// When notifications move to Supabase, replace this with a real query.
const TOTAL_UNREAD = 1;
const NOTIF_SEEN_KEY = 'eco_notif_seen';

const Navbar: React.FC = () => {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();
        setIsAdmin(!!profile?.is_admin);
      }
    };
    checkAdmin();
  }, []);

  // Compute unread badge
  useEffect(() => {
    const seen = localStorage.getItem(NOTIF_SEEN_KEY) === 'true';
    setUnreadCount(seen ? 0 : TOTAL_UNREAD);
  }, []);

  // Clear badge when user navigates to /notifications
  useEffect(() => {
    if (location.pathname === '/notifications') {
      localStorage.setItem(NOTIF_SEEN_KEY, 'true');
      setUnreadCount(0);
    }
  }, [location.pathname]);

  const adminItem = { path: '/admin', label: 'Admin', icon: 'admin_panel_settings' };

  // Desktop sidebar
  const navItems = [
    { path: '/dashboard', label: 'Inicio', icon: 'home' },
    { path: '/documents', label: 'Documentos', icon: 'description' },
    { path: '/chat', label: 'Chat', icon: 'chat', primary: true },
    { path: '/news', label: 'Noticias', icon: 'newspaper' },
    ...(isAdmin ? [adminItem] : []),
    { path: '/notifications', label: 'Alertas', icon: 'notifications' },
    { path: '/profile', label: 'Perfil', icon: 'person' },
  ];

  // Mobile bottom bar — includes Admin when user is admin
  const mobileItems = [
    { path: '/dashboard', label: 'Inicio', icon: 'home' },
    { path: '/documents', label: 'Documentos', icon: 'description' },
    { path: '/chat', label: 'Chat', icon: 'chat', primary: true },
    ...(isAdmin ? [adminItem] : [{ path: '/news', label: 'Noticias', icon: 'newspaper' }]),
    { path: '/profile', label: 'Perfil', icon: 'person' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* ─── MOBILE / TABLET: bottom bar ─── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-white/60 dark:border-white/10 pb-6 pt-3 px-4 z-50 shadow-[0_-4px_20px_rgba(31,38,135,0.05)] transition-colors duration-300">
        <ul className="flex justify-between items-center w-full">
          {mobileItems.map((item) => (
            <li key={item.path} className="flex-1">
              <Link
                to={item.path}
                className={`flex flex-col items-center gap-1 transition-all ${isActive(item.path)
                  ? 'text-primary font-bold'
                  : 'text-gray-400 hover:text-gray-600'
                  } ${item.primary ? 'relative -top-6' : ''}`}
              >
                <div className={`relative ${item.primary ? 'size-14 bg-primary text-white rounded-full flex items-center justify-center shadow-lg shadow-primary/30 border-4 border-white transform active:scale-95 transition-transform' : ''}`}>
                  <span className={`material-symbols-outlined ${isActive(item.path) ? 'filled' : ''} ${item.primary ? 'text-[28px]' : 'text-[26px]'}`}>
                    {item.icon}
                  </span>
                  {item.path === '/notifications' && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 size-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${item.primary ? 'mt-1' : ''}`}>
                  {item.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* ─── DESKTOP: left sidebar ─── */}
      <aside className="hidden lg:flex flex-col fixed top-0 left-0 h-full w-64 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-r border-white/60 dark:border-white/10 shadow-xl z-50 py-8 px-4 gap-1">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 mb-8">
          <div className="size-9 bg-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/30">
            <span className="material-symbols-outlined text-white text-xl">eco</span>
          </div>
          <div>
            <p className="font-black text-gray-900 dark:text-white text-sm leading-none">EcoNexo</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Panel</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm
                ${isActive(item.path)
                  ? 'bg-primary text-white shadow-lg shadow-primary/25'
                  : `text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white${item.primary ? ' bg-primary/10 text-primary' : ''}`
                }
              `}
            >
              <div className="relative">
                <span className={`material-symbols-outlined text-xl ${isActive(item.path) ? 'filled' : ''}`}>
                  {item.icon}
                </span>
                {item.path === '/notifications' && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 size-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
                    {unreadCount}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
              {item.primary && !isActive(item.path) && (
                <span className="ml-auto size-2 rounded-full bg-primary animate-pulse" />
              )}
            </Link>
          ))}
        </nav>

        {/* Footer info */}
        <div className="px-4 pt-4 border-t border-gray-100 dark:border-white/10">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">EcoNexo SpA</p>
          <p className="text-[10px] text-gray-300">v1.6.8</p>
        </div>
      </aside>
    </>
  );
};

export default Navbar;
