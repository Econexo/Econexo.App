
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
    <nav className="fixed bottom-0 left-0 w-full bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-lg border-t border-gray-200 dark:border-white/5 pb-6 pt-3 px-6 z-50 flex justify-between items-center max-w-md mx-auto left-1/2 -translate-x-1/2">
      <ul className="flex justify-between items-center w-full">
        {navItems.map((item) => (
          <li key={item.path} className="flex-1">
            <Link
              to={item.path}
              className={`flex flex-col items-center gap-1 transition-colors ${isActive(item.path)
                ? 'text-primary'
                : 'text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300'
                } ${item.primary ? 'relative -top-4' : ''}`}
            >
              <div className={`${item.primary ? 'size-14 bg-primary text-background-dark rounded-full flex items-center justify-center shadow-lg shadow-primary/30 border-4 border-background-light dark:border-background-dark transform active:scale-90 transition-transform' : ''}`}>
                <span className={`material-symbols-outlined ${isActive(item.path) ? 'filled' : ''} ${item.primary ? 'text-[28px]' : 'text-[24px]'}`}>
                  {item.icon}
                </span>
              </div>
              <span className={`text-[10px] font-medium ${item.primary ? 'mt-0' : ''}`}>
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

