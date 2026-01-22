
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
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  React.useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);
  const [profileImage, setProfileImage] = useState<string>("https://picsum.photos/seed/profile99/200/200");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportTicket, setSupportTicket] = useState({ subject: '', description: '' });
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');

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
    // Logic to update Ley Rep status
    onLeyRepChange(status);
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

  const handleUpdateEmail = async () => {
    if (!newEmail) return;
    if (newEmail === userData.email) {
      alert('El nuevo correo es igual al actual.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;

      alert('Se ha enviado un correo de confirmación a tu nueva dirección. Por favor verifica para completar el cambio.');
      setShowEmailModal(false);
      setNewEmail('');
    } catch (err: any) {
      console.error('Error updating email:', err);
      alert('Error al actualizar correo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
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
    <div className="relative font-sans bg-[#f0f4f0] dark:bg-slate-950 min-h-screen text-slate-900 max-w-md mx-auto pb-28 overflow-hidden transition-colors duration-300">
      {/* Decorative Background Blobs */}
      <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

      <div className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/40 dark:border-white/10 p-4 flex items-center justify-between shadow-sm transition-colors">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 hover:bg-white/80 rounded-full border border-white/40 shadow-sm transition-all">
          <span className="material-symbols-outlined text-gray-700">arrow_back</span>
        </button>
        <h2 className="text-lg font-display font-bold text-gray-900 dark:text-white">Perfil Corporativo</h2>
        <button className="size-10 flex items-center justify-center bg-white/50 hover:bg-white/80 rounded-full border border-white/40 shadow-sm transition-all text-gray-700" onClick={() => setShowSettings(true)}>
          <span className="material-symbols-outlined">settings</span>
        </button>
      </div>

      {/* Profile Header with Dynamic Background */}
      <div className="relative pt-12 pb-8 flex flex-col items-center border-b border-white/40 dark:border-white/10 overflow-hidden bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm transition-colors">
        {/* Background Image Layer */}
        <div className="absolute inset-0 z-0 opacity-50">
          <img
            src="/assets/profile_eco_bg.png"
            className="w-full h-full object-cover scale-105"
            alt=""
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/80 to-[#f0f4f0] dark:from-slate-900/40 dark:via-slate-900/80 dark:to-slate-950 backdrop-blur-[1px]"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="relative mb-4 group">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl group-hover:bg-primary/30 transition-all"></div>
            <img src={profileImage} className="relative size-24 rounded-full border-4 border-white shadow-2xl object-cover" alt="Avatar" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 p-2 bg-primary rounded-full text-white border-2 border-white shadow-lg transform active:scale-90 transition-transform z-20"
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
          <h3 className="text-2xl font-display font-black tracking-tight text-gray-900 dark:text-white drop-shadow-sm transition-colors">{userData.name}</h3>
          <p className="text-[11px] text-gray-600 font-black uppercase tracking-[0.2em] mt-1 drop-shadow-sm bg-white/50 px-3 py-0.5 rounded-full backdrop-blur-sm border border-white/40">
            {userData.role}
          </p>

          {/* Ley REP Status Tag */}
          <div className={`mt-5 px-5 py-2 rounded-full border flex items-center gap-2 transition-all shadow-lg backdrop-blur-md ${isLeyRep ? 'bg-primary/20 border-primary/30 text-primary shadow-primary/10' : 'bg-blue-500/20 border-blue-500/30 text-blue-500 shadow-blue-500/10'}`}>
            <span className="material-symbols-outlined text-[18px] font-bold">{isLeyRep ? 'verified' : 'eco'}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              {isLeyRep ? 'EMPRESA LEY REP' : 'IMPACTO VOLUNTARIO'}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6 relative z-10">
        {/* Ley REP Configuration Toggle */}
        <section>
          <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/80 dark:border-white/10 p-5 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] relative overflow-hidden transition-all hover:scale-[1.01]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -z-10"></div>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest transition-colors">Estado Declarativo</h4>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-tighter transition-colors">¿Sujeto a obligaciones Ley REP?</p>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isLeyRep}
                  onChange={(e) => handleToggleLeyRep(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
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
              className="text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-primary/10 rounded-lg border border-primary/20 hover:bg-primary/20 transition-all"
            >
              {isEditingUser ? 'Guardar' : 'Editar'}
            </button>
          </div>

          <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/80 dark:border-white/10 p-4 space-y-4 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] transition-all">
            {isEditingUser ? (
              <div className="space-y-3">
                <input
                  className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
                  value={userData.name}
                  onChange={e => setUserData({ ...userData, name: e.target.value })}
                  placeholder="Nombre completo"
                />
                <div className="w-full bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 text-sm font-medium text-gray-500 flex items-center justify-between">
                  <span>{userData.email}</span>
                  <button onClick={() => setShowEmailModal(true)} className="text-primary text-[10px] font-bold uppercase tracking-widest hover:underline">
                    Cambiar
                  </button>
                </div>
                <input
                  className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
                  value={userData.role}
                  onChange={e => setUserData({ ...userData, role: e.target.value })}
                  placeholder="Cargo / Rol"
                />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-100"><span className="material-symbols-outlined font-bold">person</span></div>
                  <div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Nombre completo</p><p className="text-sm font-bold tracking-tight text-gray-900">{userData.name}</p></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-green-50 text-green-500 flex items-center justify-center border border-green-100"><span className="material-symbols-outlined font-bold">alternate_email</span></div>
                  <div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Email Corporativo</p><p className="text-sm font-bold tracking-tight text-gray-900">{userData.email}</p></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center border border-orange-100"><span className="material-symbols-outlined font-bold">badge</span></div>
                  <div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Cargo / Rol</p><p className="text-sm font-bold tracking-tight text-gray-900">{userData.role || 'No especificado'}</p></div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Company Section */}
        <section>
          <div className="flex items-center justify-between mb-2 pl-2">
            <h4 className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] transition-colors">Información Legal</h4>
            <button
              onClick={() => isEditingCompany ? saveCompany() : setIsEditingCompany(true)}
              className="text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-primary/10 rounded-lg border border-primary/20 hover:bg-primary/20 transition-all"
            >
              {isEditingCompany ? 'Guardar' : 'Editar'}
            </button>
          </div>

          <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/80 dark:border-white/10 p-4 space-y-4 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] transition-all">
            {isEditingCompany ? (
              <div className="space-y-3">
                <input
                  className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
                  value={companyData.name}
                  onChange={e => setCompanyData({ ...companyData, name: e.target.value })}
                  placeholder="Razón Social"
                />
                <input
                  className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
                  value={companyData.rut}
                  onChange={e => setCompanyData({ ...companyData, rut: e.target.value })}
                  placeholder="RUT Empresa"
                />
                <input
                  className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
                  value={companyData.address}
                  onChange={e => setCompanyData({ ...companyData, address: e.target.value })}
                  placeholder="Dirección de la Empresa"
                />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-yellow-50 text-yellow-500 flex items-center justify-center border border-yellow-100"><span className="material-symbols-outlined font-bold">corporate_fare</span></div>
                  <div><p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">Razón Social</p><p className="text-sm font-bold tracking-tight text-gray-900 dark:text-white transition-colors">{companyData.name}</p></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center border border-purple-100"><span className="material-symbols-outlined font-bold">fingerprint</span></div>
                  <div><p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">RUT Empresa</p><p className="text-sm font-bold tracking-tight text-gray-900 dark:text-white transition-colors">{companyData.rut}</p></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center border border-red-100"><span className="material-symbols-outlined font-bold">location_on</span></div>
                  <div><p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">Dirección</p><p className="text-sm font-bold tracking-tight text-gray-900 dark:text-white transition-colors">{companyData.address || 'No especificada'}</p></div>
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
          className="w-full py-4 rounded-2xl border border-red-900/10 text-red-500 font-display font-black text-xs uppercase tracking-[0.25em] bg-red-50 hover:bg-red-100 transition-all active:scale-[0.98] mt-4"
        >
          Cerrar Sesión Segura
        </button>

      </div>

      <Navbar />

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={() => setShowSettings(false)}></div>
          <div className="relative w-full max-w-md bg-white/90 backdrop-blur-2xl border-t border-x border-white/80 rounded-t-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-full duration-500">

            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-gray-300 rounded-full"></div>

            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-display font-black text-gray-900">Ajustes</h3>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Configuración General</p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="size-10 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <label className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-white/60 cursor-pointer hover:bg-white/80 transition-colors group shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center border border-purple-100">
                    <span className="material-symbols-outlined">dark_mode</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 group-hover:text-purple-600 transition-colors">Modo Oscuro</p>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Apariencia Visual</p>
                  </div>
                </div>
                <div className="relative">
                  <input type="checkbox" checked={isDarkMode} onChange={toggleDarkMode} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500 shadow-inner"></div>
                </div>
              </label>

              <label className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-white/60 cursor-pointer hover:bg-white/80 transition-colors group shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-100">
                    <span className="material-symbols-outlined">notifications</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Notificaciones</p>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Alertas y Avisos</p>
                  </div>
                </div>
                <div className="relative">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500 shadow-inner"></div>
                </div>
              </label>

              <div
                onClick={() => { setShowSettings(false); setShowSupportModal(true); }}
                className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10 cursor-pointer hover:bg-primary/10 active:scale-[0.98] transition-all group shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center border border-primary/20">
                    <span className="material-symbols-outlined">support_agent</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">Reportar Problema</p>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Soporte Técnico</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-primary/40 group-hover:text-primary group-hover:translate-x-1 transition-all">chevron_right</span>
              </div>

              <div
                onClick={handleDeleteAccount}
                className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100 cursor-pointer hover:bg-red-100 active:scale-[0.98] transition-all group shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-red-100 text-red-500 flex items-center justify-center border border-red-200">
                    <span className="material-symbols-outlined">delete_forever</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-red-600">Eliminar Cuenta</p>
                    <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Acción Irreversible</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-red-300 group-hover:text-red-500 transition-colors">chevron_right</span>
              </div>
            </div>

            <div className="mt-8">
              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-4 bg-gray-900 text-white font-display font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-lg shadow-gray-900/20 hover:shadow-gray-900/30 active:scale-[0.98] transition-all"
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={() => setShowSupportModal(false)}></div>
          <div className="relative w-full max-w-[340px] bg-white rounded-[2rem] p-6 shadow-2xl animate-in zoom-in duration-300 border border-white/80">

            <div className="text-center space-y-3 mb-8">
              <div className="size-16 bg-gradient-to-br from-primary/10 to-blue-500/10 rounded-2xl flex items-center justify-center text-primary mx-auto shadow-inner border border-primary/20">
                <span className="material-symbols-outlined text-3xl">bug_report</span>
              </div>
              <div>
                <h3 className="text-xl font-display font-black text-gray-900 tracking-tight">Reportar Problema</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-4 leading-relaxed mt-1">
                  Describe el inconveniente para recibir ayuda de nuestro equipo.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Asunto</label>
                <input
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-gray-400"
                  placeholder="Ej: Error al cargar documentos"
                  value={supportTicket.subject}
                  onChange={e => setSupportTicket({ ...supportTicket, subject: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Descripción</label>
                <textarea
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all min-h-[100px] resize-none placeholder:text-gray-400 custom-scrollbar"
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
                  className="w-full py-3 text-gray-500 hover:text-gray-900 font-display font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Email Update Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={() => setShowEmailModal(false)}></div>
          <div className="relative w-full max-w-[340px] bg-white rounded-[2rem] p-6 shadow-2xl animate-in zoom-in duration-300 border border-white/80">
            <div className="text-center mb-6">
              <div className="size-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-3 border border-blue-100">
                <span className="material-symbols-outlined text-2xl">mark_email_unread</span>
              </div>
              <h3 className="text-lg font-display font-black text-gray-900">Actualizar Correo</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-2 mt-1">
                Recibirás un enlace de confirmación en tu nueva dirección.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-gray-400">Correo Actual</label>
                <div className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-500">
                  {userData.email}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Nuevo Correo</label>
                <input
                  type="email"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-gray-300"
                  placeholder="ejemplo@nuevo.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                />
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={handleUpdateEmail}
                  disabled={loading || !newEmail}
                  className="w-full py-3 bg-primary text-background-dark font-display font-black text-xs uppercase tracking-[0.2em] rounded-xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Enviando...' : 'Confirmar Cambio'}
                </button>
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="w-full py-3 text-gray-500 hover:text-gray-900 font-display font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
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
