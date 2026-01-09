import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './screens/Login';
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

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLeyRepUser, setIsLeyRepUser] = useState(true);

  useEffect(() => {
    document.documentElement.classList.add('dark');

    // Comprobar sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      if (session?.user.user_metadata.ley_rep_declared !== undefined) {
        setIsLeyRepUser(session.user.user_metadata.ley_rep_declared);
      }
    });

    // Escuchar cambios en la autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      if (session?.user.user_metadata.ley_rep_declared !== undefined) {
        setIsLeyRepUser(session.user.user_metadata.ley_rep_declared);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
    <Router>
      <div className="min-h-screen bg-background-light dark:bg-background-dark overflow-x-hidden transition-colors duration-300">
        <Routes>
          <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login onLogin={() => setIsAuthenticated(true)} onLeyRepChange={handleToggleLeyRep} currentLeyRep={isLeyRepUser} />} />
          <Route path="/dashboard" element={isAuthenticated ? <Dashboard isLeyRep={isLeyRepUser} /> : <Navigate to="/" />} />
          <Route path="/documents" element={isAuthenticated ? <Documents /> : <Navigate to="/" />} />
          <Route path="/news" element={isAuthenticated ? <News /> : <Navigate to="/" />} />
          <Route path="/impact" element={isAuthenticated ? <Impact isLeyRep={isLeyRepUser} /> : <Navigate to="/" />} />
          <Route path="/notifications" element={isAuthenticated ? <Notifications /> : <Navigate to="/" />} />
          <Route path="/profile" element={isAuthenticated ? <Profile isLeyRep={isLeyRepUser} onLeyRepChange={handleToggleLeyRep} /> : <Navigate to="/" />} />
          <Route path="/analyze" element={isAuthenticated ? <Analyze /> : <Navigate to="/" />} />
          <Route path="/chat" element={isAuthenticated ? <Chat /> : <Navigate to="/" />} />
          <Route path="/admin" element={isAuthenticated ? <Admin /> : <Navigate to="/" />} />
          <Route path="/rewards" element={isAuthenticated ? <Rewards /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
