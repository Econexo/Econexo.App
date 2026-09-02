
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { UserProfile, CompanyProfile, ReminderPrefs, DEFAULT_REMINDER_PREFS } from '../types';
import { supabase } from '../services/supabase';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';

// Profile subcomponents
import ProfileHeader from '../components/profile/ProfileHeader';
import { usePWAInstall } from '../hooks/usePWAInstall';
import UserDataSection from '../components/profile/UserDataSection';
import CompanyDataSection from '../components/profile/CompanyDataSection';
import NotificationEmailsSection from '../components/profile/NotificationEmailsSection';
import RemindersSection from '../components/profile/RemindersSection';
import RepProducerSection, { DEFAULT_REP_PRODUCER, type RepProducerData } from '../components/profile/RepProducerSection';
import SettingsModal from '../components/profile/SettingsModal';
import SupportTicketModal from '../components/profile/SupportTicketModal';
import EmailUpdateModal from '../components/profile/EmailUpdateModal';
import PasswordUpdateModal from '../components/profile/PasswordUpdateModal';

interface ProfileProps {
  isLeyRep: boolean;
  onLeyRepChange: (status: boolean) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const Profile: React.FC<ProfileProps> = ({ isLeyRep, onLeyRepChange, isDarkMode, toggleTheme }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { canInstall, isIOS, isInstalled, isInStandaloneMode, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [profileImage, setProfileImage] = useState<string>("https://picsum.photos/seed/profile99/200/200");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Modals
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportTicket, setSupportTicket] = useState({ subject: '', description: '' });
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Correos adicionales de aviso (máx. 2) y preferencias de recordatorios
  const [notificationEmails, setNotificationEmails] = useState<string[]>([]);
  const [reminderPrefs, setReminderPrefs] = useState<ReminderPrefs>(DEFAULT_REMINDER_PREFS);
  const [savingEmails, setSavingEmails] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [repProducer, setRepProducer] = useState<RepProducerData>(DEFAULT_REP_PRODUCER);
  const [savingRep, setSavingRep] = useState(false);

  const [userData, setUserData] = useState<UserProfile>({ name: '', email: '', role: '', phone: '' });
  const [companyData, setCompanyData] = useState<CompanyProfile>({
    name: '', rut: '', address: '', industry: 'General', declaroLeyRep: isLeyRep,
    companyEmail: '', wasteTypes: [], workersCount: 0, certifications: [],
  });

  React.useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

      setUserData({
        name: profile?.full_name || user.user_metadata?.full_name || 'Usuario Econexo',
        email: user.email || '',
        role: profile?.role || user.user_metadata?.role || 'Colaborador',
        phone: profile?.phone || '',
      });

      if (profile) {
        setCompanyData({
          name: profile.company_name || '', rut: profile.rut || '', address: profile.address || '',
          companyEmail: profile.company_email || '', industry: profile.industry || 'General',
          declaroLeyRep: profile.is_ley_rep ?? isLeyRep, size: profile.company_size || '',
          wasteTypes: profile.waste_types || [], workersCount: profile.workers_count || 0,
          certifications: profile.certifications || [],
        });
        if (profile.avatar_url) setProfileImage(profile.avatar_url);
        setIsAdmin(profile.is_admin || false);
        setNotificationEmails(profile.notification_emails || []);
        setReminderPrefs({ ...DEFAULT_REMINDER_PREFS, ...(profile.reminder_prefs || {}) });
        setRepProducer({ ...DEFAULT_REP_PRODUCER, ...(profile.rep_producer_data || {}) });
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  const saveUser = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.auth.updateUser({ data: { full_name: userData.name, role: userData.role } });
      const { error } = await supabase.from('profiles').upsert({
        id: user.id, full_name: userData.name, role: userData.role, phone: userData.phone,
        company_name: companyData.name, rut: companyData.rut, address: companyData.address,
        company_email: companyData.companyEmail, is_ley_rep: companyData.declaroLeyRep,
        company_size: companyData.size, workers_count: companyData.workersCount,
        waste_types: companyData.wasteTypes, certifications: companyData.certifications,
      });
      if (!error) setIsEditingUser(false);
      else { console.error("Error saving user:", error); toast.error('Error al guardar: ' + error.message); }
    }
    setLoading(false);
  };

  const saveCompany = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id, company_name: companyData.name, rut: companyData.rut, address: companyData.address,
        company_email: companyData.companyEmail, full_name: userData.name, role: userData.role,
        phone: userData.phone, is_ley_rep: companyData.declaroLeyRep, company_size: companyData.size,
        workers_count: companyData.workersCount, waste_types: companyData.wasteTypes,
        certifications: companyData.certifications,
      });
      if (!error) setIsEditingCompany(false);
      else { console.error("Error saving company:", error); toast.error('Error al guardar datos de empresa: ' + error.message); }
    }
    setLoading(false);
  };

  const saveNotificationEmails = async (emails: string[]) => {
    setSavingEmails(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesión no válida.');
      const { error } = await supabase
        .from('profiles')
        .update({ notification_emails: emails })
        .eq('id', user.id);
      if (error) throw error;
      setNotificationEmails(emails);
      toast.success(
        emails.length
          ? `Guardado. ${emails.length === 1 ? 'Ese correo recibirá' : 'Esos correos recibirán'} copia de los avisos.`
          : 'Correos de aviso eliminados.'
      );
    } catch (err: any) {
      console.error('Error saving notification emails:', err);
      toast.error('Error al guardar los correos: ' + err.message);
    } finally {
      setSavingEmails(false);
    }
  };

  // Se guarda al vuelo: el usuario no debería tener que pulsar "guardar" para un toggle.
  const saveReminderPrefs = async (prefs: ReminderPrefs) => {
    const previous = reminderPrefs;
    setReminderPrefs(prefs);
    setSavingPrefs(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesión no válida.');
      const { error } = await supabase
        .from('profiles')
        .update({ reminder_prefs: prefs })
        .eq('id', user.id);
      if (error) throw error;
    } catch (err: any) {
      console.error('Error saving reminder prefs:', err);
      setReminderPrefs(previous);
      toast.error('No se pudieron guardar los recordatorios: ' + err.message);
    } finally {
      setSavingPrefs(false);
    }
  };

  // Se guarda al vuelo, igual que las preferencias de recordatorios.
  const saveRepProducer = async (data: RepProducerData) => {
    const previous = repProducer;
    setRepProducer(data);
    setSavingRep(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesión no válida.');
      const { error } = await supabase
        .from('profiles')
        .update({ rep_producer_data: data })
        .eq('id', user.id);
      if (error) throw error;
    } catch (err: any) {
      console.error('Error saving REP producer data:', err);
      setRepProducer(previous);
      toast.error('No se pudo guardar el perfil REP: ' + err.message);
    } finally {
      setSavingRep(false);
    }
  };

  const handleLeyRepToggle = async (checked: boolean) => {
    onLeyRepChange(checked);
    setCompanyData(prev => ({ ...prev, declaroLeyRep: checked }));
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ is_ley_rep: checked }).eq('id', user.id);
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

        const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true, contentType: file.type });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
        const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
        if (updateError) throw updateError;

        setProfileImage(publicUrl);
        toast.success('Imagen de perfil actualizada con éxito.');
        window.location.reload();
      } catch (err: any) {
        console.error('Error uploading image:', err);
        if (err.message?.includes('Bucket not found')) {
          toast.error('No se encontró el bucket "avatars". Crea un bucket público llamado "avatars" en Supabase Dashboard > Storage.');
        } else {
          toast.error('Error al subir imagen: ' + err.message);
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSubmitTicket = async () => {
    if (!supportTicket.subject || !supportTicket.description) { toast.warning('Por favor completa todos los campos.'); return; }
    setSubmittingTicket(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No session');
      const { error } = await supabase.from('support_tickets').insert([{ user_id: user.id, subject: supportTicket.subject, description: supportTicket.description }]);
      if (error) throw error;
      toast.success('Tu reporte ha sido enviado al administrador. Nos contactaremos pronto.');
      setSupportTicket({ subject: '', description: '' });
      setShowSupportModal(false);
    } catch (err: any) {
      console.error('Error submitting ticket:', err);
      toast.error('Error al enviar el reporte: ' + err.message);
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail) return;
    if (newEmail === userData.email) { toast.warning('El nuevo correo es igual al actual.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast.success('Se ha enviado un correo de confirmación a tu nueva dirección.');
      setShowEmailModal(false);
      setNewEmail('');
    } catch (err: any) {
      console.error('Error updating email:', err);
      toast.error('Error al actualizar correo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) { toast.warning('Por favor ingresa la nueva contraseña y confírmala.'); return; }
    if (newPassword.length < 6) { toast.warning('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (newPassword !== confirmPassword) { toast.warning('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Contraseña actualizada correctamente.');
      setShowPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Error updating password:', err);
      toast.error('Error al actualizar contraseña: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const ok = await confirm({
      title: 'Eliminar cuenta',
      message: '¿Estás seguro de que deseas eliminar permanentemente tu cuenta? Esta acción no se puede deshacer.',
      confirmLabel: 'Sí, eliminar',
      danger: true,
    });
    if (!ok) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').delete().eq('id', user.id);
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        toast.success('Cuenta eliminada con éxito.');
        navigate('/');
      }
    } catch (err: any) {
      toast.error('Error al eliminar la cuenta: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative font-sans bg-[#f0f4f0] dark:bg-slate-950 min-h-screen text-slate-900 max-w-md md:max-w-3xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto pb-28 md:pb-8 overflow-hidden transition-colors duration-300">
      {/* Decorative Background Blobs */}
      <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/40 dark:border-white/10 p-4 flex items-center justify-between shadow-sm transition-colors">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 hover:bg-white/80 rounded-full border border-white/40 shadow-sm transition-all">
          <span className="material-symbols-outlined text-gray-700">arrow_back</span>
        </button>
        <h2 className="text-lg font-display font-bold text-gray-900 dark:text-white">Perfil Corporativo</h2>
        <button className="size-10 flex items-center justify-center bg-white/50 hover:bg-white/80 rounded-full border border-white/40 shadow-sm transition-all text-gray-700" onClick={() => setShowSettings(true)}>
          <span className="material-symbols-outlined">settings</span>
        </button>
      </div>

      <ProfileHeader
        profileImage={profileImage}
        userName={userData.name}
        userRole={userData.role}
        isLeyRep={isLeyRep}
        fileInputRef={fileInputRef}
        onImageChange={handleImageChange}
      />

      <div className="px-4 py-6 space-y-6 relative z-10">
        {/* Ley REP Toggle */}
        <section>
          <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/80 dark:border-white/10 p-5 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] relative overflow-hidden transition-all hover:scale-[1.01]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -z-10"></div>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest transition-colors">Estado Declarativo</h4>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-tighter transition-colors">¿Sujeto a obligaciones Ley REP?</p>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={isLeyRep} onChange={(e) => handleLeyRepToggle(e.target.checked)} className="sr-only peer" />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
              </label>
            </div>
          </div>
        </section>

        <UserDataSection
          userData={userData}
          onUserDataChange={setUserData}
          isEditing={isEditingUser}
          onToggleEdit={() => setIsEditingUser(true)}
          onSave={saveUser}
          onShowEmailModal={() => setShowEmailModal(true)}
        />

        <CompanyDataSection
          companyData={companyData}
          onCompanyDataChange={setCompanyData}
          isEditing={isEditingCompany}
          onToggleEdit={() => setIsEditingCompany(true)}
          onSave={saveCompany}
        />

        <RepProducerSection
          data={repProducer}
          saving={savingRep}
          onChange={saveRepProducer}
        />

        <NotificationEmailsSection
          emails={notificationEmails}
          ownerEmail={userData.email}
          saving={savingEmails}
          onSave={saveNotificationEmails}
        />

        <RemindersSection
          prefs={reminderPrefs}
          saving={savingPrefs}
          onChange={saveReminderPrefs}
        />

        {/* Install App Card */}
        {!isInstalled && !isInStandaloneMode && (canInstall || isIOS) && (
          <section>
            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/80 dark:border-white/10 p-5 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]">
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-2xl bg-primary flex items-center justify-center shadow-md shadow-primary/30 shrink-0">
                  <span className="material-symbols-outlined text-white text-2xl">install_mobile</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest">Instalar App</h4>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mt-0.5">
                    {isInstalled ? 'Ya instalada en tu dispositivo' : 'Agrega Econexo a tu pantalla de inicio'}
                  </p>
                </div>
                <button
                  onClick={isIOS ? () => setShowIOSModal(true) : install}
                  disabled={isInstalled}
                  className="px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm active:scale-95 transition-transform disabled:opacity-50 shrink-0"
                >
                  {isInstalled ? 'Instalada' : 'Instalar'}
                </button>
              </div>
            </div>
          </section>
        )}

        {isInstalled || isInStandaloneMode ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/30 rounded-2xl">
            <span className="material-symbols-outlined text-green-600 text-xl">check_circle</span>
            <div>
              <p className="text-xs font-black text-green-800 dark:text-green-300">App instalada</p>
              <p className="text-[10px] text-green-600 dark:text-green-400 font-bold">Estás usando Econexo como app nativa</p>
            </div>
          </div>
        ) : null}

        <button
          onClick={async () => { await supabase.auth.signOut(); navigate('/'); }}
          className="w-full py-4 rounded-2xl border border-red-900/10 text-red-500 font-display font-black text-xs uppercase tracking-[0.25em] bg-red-50 hover:bg-red-100 transition-all active:scale-[0.98] mt-4"
        >
          Cerrar Sesión Segura
        </button>
      </div>

      {/* iOS Install Instructions Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowIOSModal(false)} />
          <div className="relative bg-white rounded-[28px] p-6 w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 duration-300 border border-white/80">
            <div className="flex items-center gap-3 mb-5">
              <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-2xl">install_mobile</span>
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-sm">Instalar en iPhone</h3>
                <p className="text-[10px] text-gray-500 font-bold">Sigue estos pasos en Safari</p>
              </div>
            </div>
            <div className="space-y-4">
              {[
                { icon: 'ios_share', text: 'Toca el botón Compartir (cuadrado con flecha) en la barra inferior de Safari' },
                { icon: 'add_box', text: 'Desplázate y selecciona "Agregar a pantalla de inicio"' },
                { icon: 'check_circle', text: 'Toca "Agregar" en la esquina superior derecha' },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-black text-primary">{i + 1}</span>
                  </div>
                  <div className="flex items-start gap-2 flex-1">
                    <span className="material-symbols-outlined text-primary text-base mt-0.5 shrink-0">{step.icon}</span>
                    <p className="text-xs text-gray-700 font-medium leading-relaxed">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full mt-6 h-12 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      <Navbar />

      {/* Modals */}
      <SettingsModal
        show={showSettings}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        onClose={() => setShowSettings(false)}
        onOpenSupport={() => setShowSupportModal(true)}
        onOpenPasswordChange={() => setShowPasswordModal(true)}
        onDeleteAccount={handleDeleteAccount}
      />

      <SupportTicketModal
        show={showSupportModal}
        ticket={supportTicket}
        onTicketChange={setSupportTicket}
        submitting={submittingTicket}
        onSubmit={handleSubmitTicket}
        onClose={() => setShowSupportModal(false)}
      />

      <EmailUpdateModal
        show={showEmailModal}
        currentEmail={userData.email}
        newEmail={newEmail}
        onNewEmailChange={setNewEmail}
        loading={loading}
        onSubmit={handleUpdateEmail}
        onClose={() => setShowEmailModal(false)}
      />

      <PasswordUpdateModal
        show={showPasswordModal}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        onNewPasswordChange={setNewPassword}
        onConfirmPasswordChange={setConfirmPassword}
        loading={loading}
        onSubmit={handleChangePassword}
        onClose={() => setShowPasswordModal(false)}
      />
    </div>
  );
};

export default Profile;
