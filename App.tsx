import React, { useState, useEffect, lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { supabase } from './services/supabase';

// Eager-loaded (needed immediately on first render)
import Login from './screens/Login';
import ForgotPassword from './screens/ForgotPassword';
import ResetPassword from './screens/ResetPassword';
import Onboarding from './screens/Onboarding';

// Lazy-loaded (only loaded when the user navigates to that route)
const Dashboard    = lazy(() => import('./screens/Dashboard'));
const Documents    = lazy(() => import('./screens/Documents'));
const News         = lazy(() => import('./screens/News'));
const Impact       = lazy(() => import('./screens/Impact'));
const Notifications = lazy(() => import('./screens/Notifications'));
const Profile      = lazy(() => import('./screens/Profile'));
const Analyze      = lazy(() => import('./screens/Analyze'));
const Chat         = lazy(() => import('./screens/Chat'));
const Admin        = lazy(() => import('./screens/Admin'));
const Rewards           = lazy(() => import('./screens/Rewards'));
const CarbonCalculator  = lazy(() => import('./screens/CarbonCalculator'));
const LeyREP            = lazy(() => import('./screens/LeyREP'));

const PageLoader = () => (
  <div className="min-h-screen bg-[#f0f4f0] dark:bg-slate-950 flex items-center justify-center">
    <span className="animate-spin material-symbols-outlined text-primary text-5xl">progress_activity</span>
  </div>
);

const ONBOARDING_KEY = 'eco_onboarding_done';

const AppRoutes: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLeyRepUser, setIsLeyRepUser] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      if (session?.user) {
        checkAdmin(session.user.id);
      }
      if (session?.user.user_metadata.ley_rep_declared !== undefined) {
        setIsLeyRepUser(session.user.user_metadata.ley_rep_declared);
      }
    });

    const checkAdmin = async (userId: string) => {
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single();
      setIsAdmin(!!profile?.is_admin);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setIsAuthenticated(!!session);
      if (session?.user) {
        checkAdmin(session.user.id);
        // Show onboarding on first sign-in ever
        if (event === 'SIGNED_IN' && !localStorage.getItem(ONBOARDING_KEY)) {
          setShowOnboarding(true);
        }
      } else {
        setIsAdmin(false);
      }
      if (session?.user.user_metadata.ley_rep_declared !== undefined) {
        setIsLeyRepUser(session.user.user_metadata.ley_rep_declared);
      }

      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleToggleLeyRep = (status: boolean) => {
    setIsLeyRepUser(status);
  };

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
  };

  if (isAuthenticated === null) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-[#f0f4f0] dark:bg-background-dark overflow-x-hidden transition-colors duration-300">
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login onLogin={() => setIsAuthenticated(true)} onLeyRepChange={handleToggleLeyRep} currentLeyRep={isLeyRepUser} />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dashboard"     element={isAuthenticated ? <div className="lg:ml-64"><Dashboard isLeyRep={isLeyRepUser} /></div> : <Navigate to="/" />} />
          <Route path="/documents"     element={isAuthenticated ? <div className="lg:ml-64"><Documents /></div> : <Navigate to="/" />} />
          <Route path="/news"          element={isAuthenticated ? <div className="lg:ml-64"><News /></div> : <Navigate to="/" />} />
          <Route path="/impact"        element={isAuthenticated ? <div className="lg:ml-64"><Impact isLeyRep={isLeyRepUser} /></div> : <Navigate to="/" />} />
          <Route path="/notifications" element={isAuthenticated ? <div className="lg:ml-64"><Notifications /></div> : <Navigate to="/" />} />
          <Route path="/profile"       element={isAuthenticated ? <div className="lg:ml-64"><Profile isLeyRep={isLeyRepUser} onLeyRepChange={handleToggleLeyRep} isDarkMode={isDarkMode} toggleTheme={toggleTheme} /></div> : <Navigate to="/" />} />
          <Route path="/analyze"       element={isAuthenticated ? <div className="lg:ml-64"><Analyze /></div> : <Navigate to="/" />} />
          <Route path="/chat"          element={isAuthenticated ? <div className="lg:ml-64 h-screen"><Chat /></div> : <Navigate to="/" />} />
          <Route path="/admin"         element={isAuthenticated && isAdmin ? <div className="lg:ml-64"><Admin /></div> : <Navigate to={isAuthenticated ? "/dashboard" : "/"} />} />
          <Route path="/rewards"            element={isAuthenticated ? <div className="lg:ml-64"><Rewards /></div> : <Navigate to="/" />} />
          <Route path="/carbon-calculator" element={isAuthenticated ? <div className="lg:ml-64"><CarbonCalculator /></div> : <Navigate to="/" />} />
          <Route path="/ley-rep" element={isAuthenticated ? <div className="lg:ml-64"><LeyREP /></div> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <ToastProvider>
        <ConfirmProvider>
          <AppRoutes />
        </ConfirmProvider>
      </ToastProvider>
    </Router>
  );
};

export default App;
