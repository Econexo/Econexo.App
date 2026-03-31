import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './screens/Login';
import ForgotPassword from './screens/ForgotPassword';
import ResetPassword from './screens/ResetPassword';
import Dashboard from './screens/Dashboard';
import Documents from './screens/Documents';
import News from './screens/News';
import Impact from './screens/Impact';
import Notifications from './screens/Notifications';
import Profile from './screens/Profile';
import Analyze from './screens/Analyze';
import Chat from './screens/Chat';
import Admin from './screens/Admin';
import Rewards from './screens/Rewards';
import { supabase } from './services/supabase';

const AppRoutes: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLeyRepUser, setIsLeyRepUser] = useState(true);
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  useEffect(() => {
    // Comprobar sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      if (session?.user) {
        checkAdmin(session.user.id);
      }
      if (session?.user.user_metadata.ley_rep_declared !== undefined) {
        setIsLeyRepUser(session.user.user_metadata.ley_rep_declared);
      }
    });

    // Check admin status
    const checkAdmin = async (userId: string) => {
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single();
      setIsAdmin(!!profile?.is_admin);
    };

    // Escuchar cambios en la autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setIsAuthenticated(!!session);
      if (session?.user) {
        checkAdmin(session.user.id);
      } else {
        setIsAdmin(false);
      }
      if (session?.user.user_metadata.ley_rep_declared !== undefined) {
        setIsLeyRepUser(session.user.user_metadata.ley_rep_declared);
      }

      // Si el evento es recuperación de contraseña, redirigimos ESPECÍFICAMENTE a reset-password
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleToggleLeyRep = (status: boolean) => {
    setIsLeyRepUser(status);
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <span className="animate-spin material-symbols-outlined text-primary text-5xl">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark overflow-x-hidden transition-colors duration-300">
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login onLogin={() => setIsAuthenticated(true)} onLeyRepChange={handleToggleLeyRep} currentLeyRep={isLeyRepUser} />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Authenticated routes — desktop shifts content to accommodate the xl sidebar */}
        <Route path="/dashboard" element={isAuthenticated ? <div className="lg:ml-64"><Dashboard isLeyRep={isLeyRepUser} /></div> : <Navigate to="/" />} />
        <Route path="/documents" element={isAuthenticated ? <div className="lg:ml-64"><Documents /></div> : <Navigate to="/" />} />
        <Route path="/news" element={isAuthenticated ? <div className="lg:ml-64"><News /></div> : <Navigate to="/" />} />
        <Route path="/impact" element={isAuthenticated ? <div className="lg:ml-64"><Impact isLeyRep={isLeyRepUser} /></div> : <Navigate to="/" />} />
        <Route path="/notifications" element={isAuthenticated ? <div className="lg:ml-64"><Notifications /></div> : <Navigate to="/" />} />
        <Route path="/profile" element={isAuthenticated ? <div className="lg:ml-64"><Profile isLeyRep={isLeyRepUser} onLeyRepChange={handleToggleLeyRep} isDarkMode={isDarkMode} toggleTheme={toggleTheme} /></div> : <Navigate to="/" />} />
        <Route path="/analyze" element={isAuthenticated ? <div className="lg:ml-64"><Analyze /></div> : <Navigate to="/" />} />
        <Route path="/chat" element={isAuthenticated ? <div className="lg:ml-64"><Chat /></div> : <Navigate to="/" />} />
        <Route path="/admin" element={isAuthenticated && isAdmin ? <div className="lg:ml-64"><Admin /></div> : <Navigate to={isAuthenticated ? "/dashboard" : "/"} />} />
        <Route path="/rewards" element={isAuthenticated ? <div className="lg:ml-64"><Rewards /></div> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
};

// Force Rebuild 2026-02-09

export default App;
