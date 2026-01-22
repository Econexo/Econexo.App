
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';

const Navbar: React.FC = () => {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);

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

  const navItems = [
    { path: '/dashboard', label: 'Inicio', icon: 'home' },
    { path: '/documents', label: 'Documentación', icon: 'description' },
    { path: '/chat', label: 'Chat', icon: 'chat', primary: true },
    { path: '/news', label: 'Noticias', icon: 'newspaper' },
    { path: '/profile', label: 'Perfil', icon: 'person' },
  ];

  if (isAdmin) {
    navItems.splice(4, 0, { path: '/admin', label: 'Admin', icon: 'admin_panel_settings' });
  }

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-white/60 dark:border-white/10 pb-6 pt-3 px-6 z-50 flex justify-between items-center max-w-md mx-auto left-1/2 -translate-x-1/2 shadow-[0_-4px_20px_rgba(31,38,135,0.05)] transition-colors duration-300">
      <ul className="flex justify-between items-center w-full">
        {navItems.map((item) => (
          <li key={item.path} className="flex-1">
            <Link
              to={item.path}
              className={`flex flex-col items-center gap-1 transition-all ${isActive(item.path)
                ? 'text-primary font-bold'
                : 'text-gray-400 hover:text-gray-600'
                } ${item.primary ? 'relative -top-6' : ''}`}
            >
              <div className={`${item.primary ? 'size-14 bg-primary text-white rounded-full flex items-center justify-center shadow-lg shadow-primary/30 border-4 border-white transform active:scale-95 transition-transform' : ''}`}>
                <span className={`material-symbols-outlined ${isActive(item.path) ? 'filled' : ''} ${item.primary ? 'text-[28px]' : 'text-[26px]'}`}>
                  {item.icon}
                </span>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wide ${item.primary ? 'mt-1' : ''}`}>
                {item.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default Navbar;
