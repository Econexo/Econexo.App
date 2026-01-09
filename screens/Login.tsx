import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { supabase } from '../services/supabase';

interface LoginProps {
  onLogin: () => void;
  onLeyRepChange?: (status: boolean) => void;
  currentLeyRep?: boolean;
}

const Login: React.FC<LoginProps> = ({ onLogin, onLeyRepChange, currentLeyRep }) => {
  const navigate = useNavigate();
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationStep, setRegistrationStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Registration Data
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [rut, setRut] = useState('');
  const [address, setAddress] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companySize, setCompanySize] = useState<'Pequeña' | 'Mediana' | 'Grande' | 'Corporativa'>('Pequeña');
  const [workersCount, setWorkersCount] = useState('');
  const [wasteTypes, setWasteTypes] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [isLeyRep, setIsLeyRep] = useState(currentLeyRep ?? true);

  const wasteOptions = [
    { id: 'domiciliarios', label: 'Domiciliarios no peligrosos' },
    { id: 'industriales', label: 'Industriales' },
    { id: 'peligrosos', label: 'Peligrosos' },
    { id: 'otros', label: 'Otros' }
  ];

  const certificationOptions = ['ISO 14001', 'ISO 9001', 'Sello Verde', 'Huella de Carbono', 'Zero Waste'];

  const handleToggleWaste = (id: string) => {
    setWasteTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const handleToggleCert = (cert: string) => {
    setCertifications(prev => prev.includes(cert) ? prev.filter(c => c !== cert) : [...prev, cert]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isRegistering && registrationStep < 4) {
      setRegistrationStep(prev => prev + 1);
      return;
    }

    setLoading(true);
    setSuccess(null);

    try {
      if (isRegistering) {
        const { data: { user }, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              ley_rep_declared: isLeyRep,
              company_name: companyName,
              rut: rut,
              address: address,
              phone: phone,
              company_size: companySize,
              workers_count: workersCount,
              waste_types: wasteTypes,
              certifications: certifications,
            }
          }
        });
        if (signUpError) throw signUpError;

        if (user) {
          // Create profile in public.profiles
          const { error: profileError } = await supabase.from('profiles').insert({
            id: user.id,
            company_name: companyName,
            rut: rut,
            address: address,
            company_email: companyEmail,
            phone: phone,
            company_size: companySize,
            workers_count: workersCount ? parseInt(workersCount) : null,
            waste_types: wasteTypes,
            certifications: certifications,
            is_ley_rep: isLeyRep,
            is_admin: false,
            role: role,
            full_name: fullName,
          });

          if (profileError) {
            console.error("Profile creation error:", profileError);
          }

          await supabase.auth.updateUser({
            data: {
              full_name: fullName,
              role: role,
              ley_rep_declared: isLeyRep
            }
          });
        }

        setSuccess('¡Registro exitoso! Revisa tu email para confirmar tu cuenta.');
        setIsRegistering(false);
        setRegistrationStep(1);
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) throw authError;

        if (onLeyRepChange) onLeyRepChange(isLeyRep);
        onLogin();
        navigate('/dashboard');
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      let friendlyMessage = err.message || 'Error en la autenticación';

      if (err.message?.includes('confirmation email')) {
        friendlyMessage = '✅ Cuenta creada, pero el servicio de correos está saturado. Intenta iniciar sesión en unos minutos.';
      } else if (err.message?.includes('User already registered')) {
        friendlyMessage = 'Este correo ya tiene una cuenta activa.';
      } else if (err.message?.includes('Invalid login credentials')) {
        friendlyMessage = 'Email o contraseña incorrectos.';
      }

      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => {
    if (!isRegistering) return null;
    return (
      <div className="w-full flex gap-2 mb-8">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${s <= registrationStep ? 'bg-primary' : 'bg-white/10'}`} />
        ))}
      </div>
    );
  };

  return (
    <div className="relative font-sans text-slate-900 dark:text-white min-h-screen flex flex-col justify-between overflow-x-hidden antialiased selection:bg-primary/30">
      <style>{`
            @keyframes blob {
                0% { transform: translate(0px, 0px) scale(1); }
                33% { transform: translate(30px, -50px) scale(1.1); }
                66% { transform: translate(-20px, 20px) scale(0.9); }
                100% { transform: translate(0px, 0px) scale(1); }
            }
            .animate-blob { animation: blob 7s infinite; }
            .animation-delay-2000 { animation-delay: 2s; }
            .animation-delay-4000 { animation-delay: 4s; }
            .glass-panel {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
        `}</style>

      {/* Animated Background */}
      <div className="fixed inset-0 z-0 bg-background-dark">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-primary/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-500/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-500/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-dark/80 to-background-dark"></div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center w-full max-w-[480px] mx-auto px-6 py-8">
        <div className="mb-8 relative group cursor-default">
          <div className="absolute -inset-4 bg-primary/20 rounded-full blur-3xl opacity-50 group-hover:opacity-100 transition duration-1000"></div>
          <div className="relative size-24 bg-background-dark/80 backdrop-blur-xl rounded-[2rem] border border-white/10 flex items-center justify-center overflow-hidden shadow-2xl ring-1 ring-white/5 group-hover:scale-105 transition-transform duration-500">
            <img src="/logo_econexo_new.png" alt="Econexo" className="h-16 w-auto object-contain" />
          </div>
        </div>

        <div className="w-full text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="text-white tracking-tighter text-4xl font-display font-black leading-tight mb-2">Econexo</h1>
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-primary/50"></div>
            <p className="text-primary/80 text-[10px] font-bold uppercase tracking-[0.3em]">
              {isRegistering ? `Registro - Paso ${registrationStep} de 4` : 'Plataforma Ambiental'}
            </p>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-primary/50"></div>
          </div>
        </div>

        {renderStepIndicator()}

        {error && (
          <div className="w-full p-4 mb-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-[11px] font-bold uppercase tracking-tight text-center flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-4 backdrop-blur-sm">
            <span className="material-symbols-outlined text-sm">error</span>
            <span className="flex-1">{error}</span>
          </div>
        )}

        {success && (
          <div className="w-full p-4 mb-6 bg-green-500/10 border border-green-500/20 rounded-2xl text-green-400 text-[11px] font-bold uppercase tracking-tight text-center flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-4 backdrop-blur-sm">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span className="flex-1">{success}</span>
          </div>
        )}

        <form className="w-full flex flex-col gap-4" onSubmit={handleSubmit}>
          {isRegistering ? (
            <>
              {registrationStep === 1 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex flex-col group">
                    <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Nombre Completo</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">person</span>
                      <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-4 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-600 focus:bg-white/10" placeholder="Juan Pérez" required />
                    </div>
                  </div>
                  <div className="flex flex-col group">
                    <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Cargo / Rol</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">badge</span>
                      <input type="text" value={role} onChange={e => setRole(e.target.value)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-4 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-600 focus:bg-white/10" placeholder="Encargado de Medio Ambiente" required />
                    </div>
                  </div>
                  <div className="flex flex-col group">
                    <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Email Corporativo</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">mail</span>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-4 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-600 focus:bg-white/10" placeholder="usuario@empresa.cl" required />
                    </div>
                  </div>
                  <div className="flex flex-col group">
                    <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Contraseña</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">lock</span>
                      <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-4 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-600 focus:bg-white/10" placeholder="••••••••" required />
                    </div>
                  </div>
                </div>
              )}

              {registrationStep === 2 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex flex-col group">
                    <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Razón Social</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">domain</span>
                      <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-4 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-600 focus:bg-white/10" placeholder="EcoEmpresa S.A." required />
                    </div>
                  </div>
                  <div className="flex flex-col group">
                    <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">RUT Empresa</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">fingerprint</span>
                      <input type="text" value={rut} onChange={e => setRut(e.target.value)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-4 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-600 focus:bg-white/10" placeholder="12.345.678-9" required />
                    </div>
                  </div>
                  <div className="flex flex-col group">
                    <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Dirección Corporativa</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">location_on</span>
                      <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-4 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-600 focus:bg-white/10" placeholder="Av. Siempre Viva 123" required />
                    </div>
                  </div>
                  <div className="flex flex-col group">
                    <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Correo de Contacto</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">alternate_email</span>
                      <input type="email" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-4 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-600 focus:bg-white/10" placeholder="contacto@empresa.cl" required />
                    </div>
                  </div>
                  <div className="flex flex-col group">
                    <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Teléfono</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">call</span>
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-4 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-600 focus:bg-white/10" placeholder="+56 9 ..." required />
                    </div>
                  </div>
                </div>
              )}

              {registrationStep === 3 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex flex-col group">
                    <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Tamaño de Empresa</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">business</span>
                      <select value={companySize} onChange={e => setCompanySize(e.target.value as any)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-4 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium appearance-none cursor-pointer focus:bg-white/10">
                        <option value="Pequeña">Pequeña (1-10)</option>
                        <option value="Mediana">Mediana (11-50)</option>
                        <option value="Grande">Grande (51-200)</option>
                        <option value="Corporativa">Corporativa (+200)</option>
                      </select>
                      <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">expand_more</span>
                    </div>
                  </div>
                  <div className="flex flex-col group">
                    <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Número de Trabajadores</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">groups</span>
                      <input type="number" value={workersCount} onChange={e => setWorkersCount(e.target.value)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-4 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-600 focus:bg-white/10" placeholder="Ej: 25" />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Tipos de Residuos Generados</label>
                    <div className="grid grid-cols-2 gap-2">
                      {wasteOptions.map(opt => (
                        <button key={opt.id} type="button" onClick={() => handleToggleWaste(opt.id)} className={`p-3 rounded-xl border flex items-center justify-center text-[10px] font-black uppercase tracking-tight transition-all duration-300 ${wasteTypes.includes(opt.id) ? 'bg-primary border-primary text-background-dark shadow-glow' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {registrationStep === 4 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Certificaciones Vigentes</label>
                    <div className="flex flex-wrap gap-2">
                      {certificationOptions.map(cert => (
                        <button key={cert} type="button" onClick={() => handleToggleCert(cert)} className={`px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-tight transition-all duration-300 ${certifications.includes(cert) ? 'bg-primary border-primary text-background-dark shadow-glow transform scale-105' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}>
                          {cert}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 mt-2 backdrop-blur-sm">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input type="checkbox" checked={isLeyRep} onChange={(e) => setIsLeyRep(e.target.checked)} className="sr-only peer" />
                        <div className="w-12 h-7 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                      </div>
                      <div>
                        <span className="text-xs font-black uppercase tracking-tight text-white group-hover:text-primary transition-colors">Declaro bajo Ley REP</span>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Activa métricas legales</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                {registrationStep > 1 && (
                  <button type="button" onClick={() => setRegistrationStep(prev => prev - 1)} className="flex-1 h-14 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all">
                    Atrás
                  </button>
                )}
                <button type="submit" disabled={loading} className="flex-[2] h-14 bg-gradient-to-r from-primary to-primary-light text-background-dark text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/25 hover:shadow-primary/40 active:scale-[0.98] transition-all relative overflow-hidden">
                  <div className="absolute inset-0 bg-white/20 translate-y-full hover:translate-y-0 transition-transform duration-300"></div>
                  <span className="relative flex items-center justify-center gap-2">
                    {loading ? <span className="animate-spin material-symbols-outlined text-lg">progress_activity</span> : (registrationStep === 4 ? 'Finalizar Registro' : 'Siguiente')}
                    {!loading && registrationStep < 4 && <span className="material-symbols-outlined text-lg">arrow_forward</span>}
                  </span>
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex flex-col group">
                <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Email Corporativo</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">mail</span>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-4 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-600 focus:bg-white/10" placeholder="usuario@empresa.cl" required />
                </div>
              </div>
              <div className="flex flex-col group">
                <label className="text-gray-400 group-focus-within:text-primary transition-colors text-[10px] font-black uppercase tracking-widest pb-2 pl-1">Contraseña</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors text-[20px]">lock</span>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-xl bg-white/5 h-14 pl-12 pr-12 border border-white/10 focus:border-primary/50 text-white shadow-lg focus:shadow-primary/10 transition-all outline-none font-medium placeholder:text-gray-600 focus:bg-white/10" placeholder="••••••••" required />
                </div>
              </div>
              <button type="submit" disabled={loading} className="mt-4 w-full h-16 bg-gradient-to-r from-primary to-primary-light text-background-dark text-sm font-display font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98] transition-all relative overflow-hidden group">
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                <span className="relative flex items-center justify-center gap-2">
                  {loading ? <span className="animate-spin material-symbols-outlined">progress_activity</span> : 'Ingresar al Panel'}
                  {!loading && <span className="material-symbols-outlined">login</span>}
                </span>
              </button>
            </div>
          )}
        </form>

        <button onClick={() => { setIsRegistering(!isRegistering); setRegistrationStep(1); }} className="mt-8 text-gray-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 group">
          <span className="group-hover:-translate-x-1 transition-transform">{isRegistering ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}</span>
          <span className="text-primary group-hover:underline decoration-2 underline-offset-4">{isRegistering ? 'Inicia Sesión' : 'Regístrate aquí'}</span>
        </button>
      </div>

      <div className="relative z-10 w-full p-6 text-center">
        <p className="text-white/20 text-[9px] font-black uppercase tracking-[0.2em] hover:text-white/40 transition-colors cursor-default">Econexo © 2024 • Gestión Inteligente de Residuos</p>
      </div>
    </div>
  );
};

export default Login;
