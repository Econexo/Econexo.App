import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { UserProfile, CompanyProfile } from '../types';
import { supabase } from '../services/supabase';

interface ProfileProps {
  isLeyRep: boolean;
  onLeyRepChange: (status: boolean) => void;
}

const Profile: React.FC<ProfileProps> = ({ isLeyRep, onLeyRepChange }) => {
  const navigate = useNavigate();
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));
  const [profileImage, setProfileImage] = useState<string>("https://picsum.photos/seed/profile99/200/200");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportTicket, setSupportTicket] = useState({ subject: '', description: '' });
  const [submittingTicket, setSubmittingTicket] = useState(false);

  React.useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      // Siempre poblamos al menos con lo que haya en Auth Metadata
      setUserData({
        name: profile?.full_name || user.user_metadata?.full_name || 'Usuario Econexo',
        email: user.email || '',
        role: profile?.role || user.user_metadata?.role || 'Colaborador',
        phone: profile?.phone || ''
      });

      if (profile) {
        setCompanyData({
          name: profile.company_name || '',
          rut: profile.rut || '',
          address: profile.address || '',
          companyEmail: profile.company_email || '',
          industry: profile.industry || 'General',
          declaroLeyRep: profile.is_ley_rep ?? isLeyRep,
          size: profile.company_size || '',
          wasteTypes: profile.waste_types || [],
          workersCount: profile.workers_count || 0,
          certifications: profile.certifications || []
        });
        if (profile.avatar_url) {
          setProfileImage(profile.avatar_url);
        }
        setIsAdmin(profile.is_admin || false);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  const [userData, setUserData] = useState<UserProfile>({
    name: '',
    email: '',
    role: '',
    phone: ''
  });

  const [companyData, setCompanyData] = useState<CompanyProfile>({
    name: '',
    rut: '',
    address: '',
    industry: 'General',
    declaroLeyRep: isLeyRep,
    companyEmail: '',
    wasteTypes: [],
    workersCount: 0,
    certifications: []
  });

  const saveUser = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.auth.updateUser({
        data: { full_name: userData.name, role: userData.role }
      });

      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: userData.name,
        role: userData.role,
        phone: userData.phone,
        company_name: companyData.name,
        rut: companyData.rut,
        address: companyData.address,
        company_email: companyData.companyEmail,
        is_ley_rep: companyData.declaroLeyRep,
        company_size: companyData.size,
        workers_count: companyData.workersCount,
        waste_types: companyData.wasteTypes,
        certifications: companyData.certifications
      });

      if (!error) {
        setIsEditingUser(false);
      } else {
        console.error("Error saving user:", error);
        alert('Error al guardar: ' + error.message);
      }
    }
    setLoading(false);
  };

  const saveCompany = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        company_name: companyData.name,
        rut: companyData.rut,
        address: companyData.address,
        company_email: companyData.companyEmail,
        full_name: userData.name,
        role: userData.role,
        phone: userData.phone, // Requerido por la DB
        is_ley_rep: companyData.declaroLeyRep,
        company_size: companyData.size,
        workers_count: companyData.workersCount,
        waste_types: companyData.wasteTypes,
        certifications: companyData.certifications
      });

      if (!error) {
        setIsEditingCompany(false);
      } else {
        console.error("Error saving company:", error);
        alert('Error al guardar datos de empresa: ' + error.message);
      }
    }
    setLoading(false);
  };

  const handleToggleLeyRep = async (status: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ is_admin: true }).eq('id', user.id);
    }
  };

  const handleSubmitTicket = async () => {
    if (!supportTicket.subject || !supportTicket.description) {
      alert('Por favor completa todos los campos.');
      return;
    }

    setSubmittingTicket(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No session');

      const { error } = await supabase.from('support_tickets').insert([
        {
          user_id: user.id,
          subject: supportTicket.subject,
          description: supportTicket.description
        }
      ]);

      if (error) throw error;

      alert('Tu reporte ha sido enviado al administrador. Nos contactaremos pronto.');
      setSupportTicket({ subject: '', description: '' });
      setShowSupportModal(false);
    } catch (err: any) {
      console.error('Error submitting ticket:', err);
      alert('Error al enviar el reporte: ' + err.message);
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (window.confirm('¿Estás seguro de que deseas eliminar permanentemente tu cuenta? Esta acción no se puede deshacer.')) {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // RLS ensures users can only delete their own data
          await supabase.from('profiles').delete().eq('id', user.id);
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
          alert('Cuenta eliminada con éxito.');
          navigate('/');
        }
      } catch (err: any) {
        console.error('Error deleting account:', err);
        alert('Error al eliminar la cuenta: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No user session');

        const fileExt = file.name.split('.').pop();
        const fileName = `avatar-${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        // Intentar la subida directamente (el chequeo de listBuckets suele fallar por permisos de API)
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, file, {
            upsert: true,
            contentType: file.type
          });

        if (uploadError) {
          console.error('Upload Error Details:', uploadError);
          throw uploadError;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        // Update profile
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ avatar_url: publicUrl })
          .eq('id', user.id);

        if (updateError) throw updateError;

        setProfileImage(publicUrl);
        alert('Imagen de perfil actualizada con éxito.');
        // Recargar la página para actualizar la imagen en todas las pantallas
        window.location.reload();
      } catch (err: any) {
        console.error('Error uploading image:', err);
        if (err.message?.includes('Bucket not found')) {
          alert('Error: No se encontró el bucket "avatars".\n\nPor favor, ve a tu Dashboard de Supabase -> Storage y crea un bucket público llamado "avatars".');
        } else {
          alert('Error al subir imagen: ' + err.message);
        }
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="font-sans bg-background-light dark:bg-background-dark min-h-screen text-slate-900 dark:text-white max-w-md mx-auto pb-28">
      <div className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5 p-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-display font-bold">Perfil Corporativo</h2>
        <button className="size-10 flex items-center justify-center" onClick={() => setShowSettings(true)}>
          <span className="material-symbols-outlined">settings</span>
        </button>
      </div>

      {/* Profile Header with Dynamic Background */}
      <div className="relative pt-12 pb-8 flex flex-col items-center border-b border-gray-100 dark:border-white/5 overflow-hidden">
        {/* Background Image Layer */}
        <div className="absolute inset-0 z-0">
          <img
            src="/assets/profile_eco_bg.png"
            className="w-full h-full object-cover scale-105"
            alt=""
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background-light/40 via-background-light/80 to-background-light dark:from-background-dark/40 dark:via-background-dark/80 dark:to-background-dark backdrop-blur-[2px]"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="relative mb-4 group">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl group-hover:bg-primary/30 transition-all"></div>
            <img src={profileImage} className="relative size-24 rounded-full border-4 border-white dark:border-surface-dark shadow-2xl object-cover" alt="Avatar" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 p-2 bg-primary rounded-full text-background-dark border-2 border-background-dark shadow-lg transform active:scale-90 transition-transform z-20"
            >
              <span className="material-symbols-outlined text-sm font-bold">photo_camera</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageChange}
              accept="image/*"
              className="hidden"
            />
          </div>
          <h3 className="text-2xl font-display font-black tracking-tight text-slate-900 dark:text-white drop-shadow-sm">{userData.name}</h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-black uppercase tracking-[0.2em] mt-1 drop-shadow-sm bg-background-light/50 dark:bg-background-dark/50 px-3 py-0.5 rounded-full backdrop-blur-sm border border-gray-200 dark:border-white/5">
            {userData.role}
          </p>

          {/* Ley REP Status Tag */}
          <div className={`mt-5 px-5 py-2 rounded-full border flex items-center gap-2 transition-all shadow-lg backdrop-blur-md ${isLeyRep ? 'bg-primary/20 border-primary/30 text-primary shadow-primary/10' : 'bg-blue-500/20 border-blue-500/30 text-blue-400 shadow-blue-500/10'}`}>
            <span className="material-symbols-outlined text-[18px] font-bold">{isLeyRep ? 'verified' : 'eco'}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              {isLeyRep ? 'EMPRESA LEY REP' : 'IMPACTO VOLUNTARIO'}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Ley REP Configuration Toggle */}
        <section>
          <div className="bg-surface-dark rounded-2xl border border-white/5 p-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -z-10"></div>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="text-xs font-black text-white uppercase tracking-widest">Estado Declarativo</h4>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">¿Sujeto a obligaciones Ley REP?</p>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isLeyRep}
                  onChange={(e) => handleToggleLeyRep(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="relative w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
              </label>
            </div>
          </div>
        </section>

        {/* User Data Section */}
        <section>
          <div className="flex items-center justify-between mb-2 pl-2">
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Datos Personales</h4>
            <button
              onClick={() => isEditingUser ? saveUser() : setIsEditingUser(true)}
              className="text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-primary/10 rounded-lg border border-primary/20"
            >
              {isEditingUser ? 'Guardar' : 'Editar'}
            </button>
          </div>

          <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-white/5 p-4 space-y-4 shadow-sm">
            {isEditingUser ? (
              <div className="space-y-3">
                <input
                  className="w-full bg-background-dark/20 border border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium"
                  value={userData.name}
                  onChange={e => setUserData({ ...userData, name: e.target.value })}
                />
                <input
                  className="w-full bg-background-dark/10 border border-white/5 rounded-lg px-4 py-3 text-sm outline-none font-medium text-gray-500 cursor-not-allowed hidden"
                  value={userData.email}
                  disabled
                />
                <div className="w-full bg-background-dark/10 border border-white/5 rounded-lg px-4 py-3 text-sm font-medium text-gray-500 flex items-center justify-between">
                  <span>{userData.email}</span>
                  <span className="material-symbols-outlined text-xs">lock</span>
                </div>
                <input
                  className="w-full bg-background-dark/20 border border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium"
                  value={userData.role}
                  onChange={e => setUserData({ ...userData, role: e.target.value })}
                  placeholder="Cargo / Rol"
                />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/10"><span className="material-symbols-outlined font-bold">person</span></div>
                  <div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Nombre completo</p><p className="text-sm font-bold tracking-tight">{userData.name}</p></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-green-500/10 text-green-400 flex items-center justify-center border border-green-500/10"><span className="material-symbols-outlined font-bold">alternate_email</span></div>
                  <div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Email Corporativo</p><p className="text-sm font-bold tracking-tight">{userData.email}</p></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center border border-orange-500/10"><span className="material-symbols-outlined font-bold">badge</span></div>
                  <div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Cargo / Rol</p><p className="text-sm font-bold tracking-tight">{userData.role || 'No especificado'}</p></div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Company Section */}
        <section>
          <div className="flex items-center justify-between mb-2 pl-2">
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Información Legal</h4>
            <button
              onClick={() => isEditingCompany ? saveCompany() : setIsEditingCompany(true)}
              className="text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-primary/10 rounded-lg border border-primary/20"
            >
              {isEditingCompany ? 'Guardar' : 'Editar'}
            </button>
          </div>

          <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-white/5 p-4 space-y-4 shadow-sm">
            {isEditingCompany ? (
              <div className="space-y-3">
                <input
                  className="w-full bg-background-dark/20 border border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium"
                  value={companyData.name}
                  onChange={e => setCompanyData({ ...companyData, name: e.target.value })}
                  placeholder="Razón Social"
                />
                <input
                  className="w-full bg-background-dark/20 border border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium"
                  value={companyData.rut}
                  onChange={e => setCompanyData({ ...companyData, rut: e.target.value })}
                  placeholder="RUT Empresa"
                />
                <input
                  className="w-full bg-background-dark/20 border border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium"
                  value={companyData.address}
                  onChange={e => setCompanyData({ ...companyData, address: e.target.value })}
                  placeholder="Dirección de la Empresa"
                />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center border border-yellow-500/10"><span className="material-symbols-outlined font-bold">corporate_fare</span></div>
                  <div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Razón Social</p><p className="text-sm font-bold tracking-tight">{companyData.name}</p></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/10"><span className="material-symbols-outlined font-bold">fingerprint</span></div>
                  <div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">RUT Empresa</p><p className="text-sm font-bold tracking-tight">{companyData.rut}</p></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/10"><span className="material-symbols-outlined font-bold">location_on</span></div>
                  <div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Dirección</p><p className="text-sm font-bold tracking-tight">{companyData.address || 'No especificada'}</p></div>
                </div>
              </>
            )}
          </div>
        </section>

        {userData.email === 'econexo.hub@gmail.com' && (
          <button
            onClick={async () => {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { error } = await supabase.from('profiles').update({ is_admin: true }).eq('id', user.id);
                if (!error) {
                  setIsAdmin(true);
                  alert('¡Modo Administrador Activado! Ahora verás el panel en el menú.');
                  window.location.reload();
                } else {
                  alert('Error al activar: ' + error.message);
                }
              }
            }}
            className="w-full py-4 rounded-2xl border border-primary/30 text-primary font-display font-black text-xs uppercase tracking-[0.25em] bg-primary/10 hover:bg-primary/20 transition-all active:scale-[0.98] mt-4"
          >
            Activar Modo Administrador (SuperAdmin Only)
          </button>
        )}

        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate('/');
          }}
          className="w-full py-4 rounded-2xl border border-red-900/30 text-red-400 font-display font-black text-xs uppercase tracking-[0.25em] bg-red-900/10 hover:bg-red-900/20 transition-all active:scale-[0.98] mt-4"
        >
          Cerrar Sesión Segura
        </button>

      </div>

      <Navbar />

      {/* Settings Modal */}
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={() => setShowSettings(false)}></div>
          <div className="relative w-full max-w-md bg-gradient-to-b from-gray-900 to-black border-t border-x border-white/10 rounded-t-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-full duration-500">

            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/20 rounded-full"></div>

            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-display font-black text-white">Ajustes</h3>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Configuración General</p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="size-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <span className="material-symbols-outlined">dark_mode</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white group-hover:text-purple-400 transition-colors">Modo Oscuro</p>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Apariencia Visual</p>
                  </div>
                </div>
                <div className="relative">
                  <input type="checkbox" checked={isDarkMode} onChange={toggleDarkMode} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500 shadow-inner"></div>
                </div>
              </label>

              <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <span className="material-symbols-outlined">notifications</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">Notificaciones</p>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Alertas y Avisos</p>
                  </div>
                </div>
                <div className="relative">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500 shadow-inner"></div>
                </div>
              </label>

              <div
                onClick={() => { setShowSettings(false); setShowSupportModal(true); }}
                className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10 cursor-pointer hover:bg-primary/10 active:scale-[0.98] transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined">support_agent</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white group-hover:text-primary transition-colors">Reportar Problema</p>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Soporte Técnico</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-primary/40 group-hover:text-primary group-hover:translate-x-1 transition-all">chevron_right</span>
              </div>

              <div
                onClick={handleDeleteAccount}
                className="flex items-center justify-between p-4 bg-red-500/5 rounded-2xl border border-red-500/10 cursor-pointer hover:bg-red-500/10 active:scale-[0.98] transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center">
                    <span className="material-symbols-outlined">delete_forever</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-red-500">Eliminar Cuenta</p>
                    <p className="text-[10px] text-red-500/60 font-bold uppercase tracking-wider">Acción Irreversible</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-red-500/40 group-hover:text-red-500 transition-colors">chevron_right</span>
              </div>
            </div>

            <div className="mt-8">
              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-4 bg-white text-black font-display font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-lg shadow-white/10 hover:shadow-white/20 active:scale-[0.98] transition-all"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support Ticket Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity" onClick={() => setShowSupportModal(false)}></div>
          <div className="relative w-full max-w-[340px] bg-gradient-to-b from-gray-900 to-black rounded-[2rem] p-6 shadow-2xl animate-in zoom-in duration-300 border border-white/10">

            <div className="text-center space-y-3 mb-8">
              <div className="size-16 bg-gradient-to-br from-primary/20 to-blue-500/20 rounded-2xl flex items-center justify-center text-primary mx-auto shadow-inner border border-white/5">
                <span className="material-symbols-outlined text-3xl">bug_report</span>
              </div>
              <div>
                <h3 className="text-xl font-display font-black text-white tracking-tight">Reportar Problema</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-4 leading-relaxed mt-1">
                  Describe el inconveniente para recibir ayuda de nuestro equipo.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Asunto</label>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-gray-700"
                  placeholder="Ej: Error al cargar documentos"
                  value={supportTicket.subject}
                  onChange={e => setSupportTicket({ ...supportTicket, subject: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Descripción</label>
                <textarea
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all min-h-[100px] resize-none placeholder:text-gray-700 custom-scrollbar"
                  placeholder="Cuéntanos qué pasó..."
                  value={supportTicket.description}
                  onChange={e => setSupportTicket({ ...supportTicket, description: e.target.value })}
                />
              </div>

              <div className="pt-4 flex flex-col gap-3">
                <button
                  disabled={submittingTicket}
                  onClick={handleSubmitTicket}
                  className="w-full py-4 bg-primary text-background-dark font-display font-black text-xs uppercase tracking-[0.2em] rounded-xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 hover:brightness-110"
                >
                  {submittingTicket ? (
                    <>
                      <span className="animate-spin material-symbols-outlined text-sm">progress_activity</span>
                      Enviando...
                    </>
                  ) : (
                    'Enviar Reporte'
                  )}
                </button>
                <button
                  onClick={() => setShowSupportModal(false)}
                  className="w-full py-3 text-gray-500 hover:text-white font-display font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
