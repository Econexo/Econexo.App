import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Navbar from '../components/Navbar';

import { supabase } from '../services/supabase';
import { normalizeMaterialType, materialFactors } from '../utils/materialCalculations';

interface DashboardProps {
  isLeyRep: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ isLeyRep }) => {
  const [showDetail, setShowDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRecuperado: 0,
    co2Evitado: 0,
    metaRep: 0,
    ecoPoints: 0,
    tendencia: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map(m => ({ name: m, value: 0 })),
    breakdown: []
  });

  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  // State for multiple items
  const [wasteItems, setWasteItems] = useState<any[]>([]);
  const [currentWaste, setCurrentWaste] = useState({
    waste_type: '',
    description: '',
    quantity: '',
    unit: 'Kg'
  });
  const [avatarUrl, setAvatarUrl] = useState<string>("https://picsum.photos/seed/user123/100/100");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);
  const [withdrawalDate, setWithdrawalDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const categories = [
    { label: 'Plásticos', value: 'Plásticos' },
    { label: 'Papel/Cartón', value: 'Papel/Cartón' },
    { label: 'Vidrio', value: 'Vidrio' },
    { label: 'Metales', value: 'Metales' },
    { label: 'Electrónicos (RAEE)', value: 'Electrónicos' },
    { label: 'Peligrosos', value: 'Peligrosos' },
    { label: 'Orgánicos', value: 'Orgánicos' },
    { label: 'Aceites', value: 'Aceites' },
    { label: 'Madera', value: 'Madera' },
    { label: 'Textiles', value: 'Textiles' },
    { label: 'Neumáticos/Caucho', value: 'Neumáticos' },
    { label: 'Otros', value: 'Otros' }
  ];

  useEffect(() => {
    const checkUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fetch profile data for all users, including super admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin, avatar_url, eco_points')
          .eq('id', user.id)
          .single();

        if (profile) {
          setStats(prev => ({ ...prev, ecoPoints: profile.eco_points || 0 }));
        }

        // Set avatar if available
        if (profile?.avatar_url) {
          setAvatarUrl(profile.avatar_url);
        }

        // Handle super admin
        if (user.email === 'econexo.hub@gmail.com') {
          if (!profile?.is_admin) {
            await supabase.from('profiles').update({ is_admin: true }).eq('id', user.id);
          }
          setIsAdmin(true);
          return;
        }

        // Handle regular users
        setIsAdmin(!!profile?.is_admin);
      }
    };
    checkUserRole();
    loadStats();
    fetchClients();
  }, [selectedYear]);

  const fetchClients = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check if user is admin again just to be safe for this request
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    const isActuallyAdmin = user.email === 'econexo.hub@gmail.com' || !!profile?.is_admin;

    if (isActuallyAdmin) {
      const { data } = await supabase.from('profiles').select('*').order('company_name');
      if (data) setClients(data);
    }
  };

  const handleAddWasteItem = () => {
    if (!currentWaste.waste_type || !currentWaste.quantity) return;
    setWasteItems([...wasteItems, { ...currentWaste, quantity: Number(currentWaste.quantity) }]);
    // Reset fields for next item
    setCurrentWaste({
      waste_type: '',
      description: '',
      quantity: '',
      unit: 'Kg'
    });
  };

  const handleRemoveWasteItem = (index: number) => {
    setWasteItems(wasteItems.filter((_, i) => i !== index));
  };

  const handleGenerateCR = async () => {
    if (!selectedClient || wasteItems.length === 0) {
      alert("Debes agregar al menos un ítem a la lista.");
      return;
    }

    const certNumber = `CR-${Math.floor(1000 + Math.random() * 9000)}`;
    const docTitle = `Certificado de Recepción ${certNumber}`;

    // Update client data first if changed in modal
    await supabase.from('profiles').update({
      company_name: selectedClient.company_name,
      rut: selectedClient.rut,
      address: selectedClient.address
    }).eq('id', selectedClient.id);

    // Generate PDF
    import('../services/pdfGenerator').then(({ generateCR }) => {
      generateCR(
        {
          company_name: selectedClient.company_name,
          rut: selectedClient.rut,
          address: selectedClient.address || 'Chile'
        },
        wasteItems, // Pass the array of items
        certNumber,
        'save',
        withdrawalDate // Pass custom date
      );
    });

    // Save Record
    const { error } = await supabase.from('documents').insert([{
      user_id: selectedClient.id,
      title: docTitle,
      type: 'CR',
      verified: true,
      created_at: withdrawalDate ? new Date(withdrawalDate).toISOString() : new Date().toISOString(), // Use custom date for DB
      metadata: {
        cert_number: certNumber,
        generated_by: 'Dashboard Operator',
        waste_details: wasteItems
      }
    }]);

    if (!error) {
      // Award Eco-Puntos: 2 points per 1kg
      const totalWeight = wasteItems.reduce((acc, item) => acc + (item.quantity || 0), 0);
      const pointsToAward = Math.round(totalWeight * 2);

      await supabase.rpc('increment_points', {
        user_id_param: selectedClient.id,
        amount_param: pointsToAward
      });

      await supabase.from('points_transactions').insert([{
        user_id: selectedClient.id,
        amount: pointsToAward,
        reason: `Generación de Certificado ${certNumber} (Operario)`
      }]);

      alert(`Retiro registrado exitosamente. Certificado ${certNumber} generado. ¡Se han otorgado ${pointsToAward} Eco-Puntos (2 pts por kg)!`);
      setShowWithdrawalModal(false);
      setWasteItems([]);
      setSelectedClient(null);
      loadStats();
    } else {
      alert('Error al guardar registro: ' + error.message);
    }
  };

  const getWasteStyle = (type: string) => {
    const lower = type.toLowerCase();
    if (lower.includes('plást') || lower.includes('plast') || lower.includes('pet')) return { color: '#eab308', icon: 'layers' }; // Yellow
    if (lower.includes('papel') || lower.includes('cart')) return { color: '#3b82f6', icon: 'description' }; // Blue
    if (lower.includes('vidr')) return { color: '#22c55e', icon: 'wine_bar' }; // Green
    if (lower.includes('metal') || lower.includes('lata') || lower.includes('acer') || lower.includes('chatarra')) return { color: '#94a3b8', icon: 'inventory' }; // Gray
    if (lower.includes('peligros') && !lower.includes('no peligros')) return { color: '#ef4444', icon: 'warning' }; // Red
    if (lower.includes('electr') || lower.includes('raee')) return { color: '#8b5cf6', icon: 'devices' }; // Purple
    if (lower.includes('organ')) return { color: '#84cc16', icon: 'eco' }; // Lime
    if (lower.includes('aceit')) return { color: '#f97316', icon: 'oil_barrel' }; // Orange
    if (lower.includes('mader')) return { color: '#78350f', icon: 'forest' }; // Brown
    if (lower.includes('textil')) return { color: '#ec4899', icon: 'apparel' }; // Pink
    if (lower.includes('neumat')) return { color: '#4b5563', icon: 'reusable_packing' }; // Dark Gray
    return { color: '#6366f1', icon: 'recycling' }; // Indigo (Others)
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: docs } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'CR')
        .eq('verified', true);

      // Fetch user profile for points and other data
      const { data: profile } = await supabase
        .from('profiles')
        .select('eco_points')
        .eq('id', user.id)
        .single();

      const currentPoints = profile?.eco_points || 0;

      let total = 0;
      const monthlyData: Record<string, number> = {};
      const wasteByType: Record<string, number> = {};
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      const uniqueYears = new Set<number>([new Date().getFullYear()]);

      if (docs && docs.length > 0) {
        docs.forEach((doc: any) => {
          const date = new Date(doc.created_at);
          if (!isNaN(date.getTime())) {
            const docYear = date.getFullYear();
            uniqueYears.add(docYear);

            // Only aggregate if it matches selected year
            if (docYear === selectedYear) {
              const details = doc.metadata?.waste_details;
              let items = [];

              if (Array.isArray(details)) {
                items = details;
              } else if (details) {
                items = [details];
              }

              let docTotal = 0;
              items.forEach((item: any) => {
                const qty = Number(item.quantity) || 0;
                docTotal += qty;

                // Usar función compartida de normalización
                const finalType = normalizeMaterialType(item);
                wasteByType[finalType] = (wasteByType[finalType] || 0) + qty;
              });

              total += docTotal;

              const mName = monthNames[date.getMonth()];
              monthlyData[mName] = (monthlyData[mName] || 0) + docTotal;
            }
          }
        });
      }

      setAvailableYears(Array.from(uniqueYears).sort((a, b) => b - a));

      // Calcular CO₂ usando factores específicos por material
      let totalCO2 = 0;
      Object.entries(wasteByType).forEach(([material, qty]) => {
        const factor = materialFactors[material] || materialFactors['Otros'];
        totalCO2 += qty * factor.co2;
      });

      // Sort Breakdown
      const breakdown = Object.entries(wasteByType).map(([label, value]) => ({
        label,
        value,
        ...getWasteStyle(label)
      })).sort((a, b) => b.value - a.value);

      // Update Chart Data
      // Update Chart Data (Full Year)
      const chartData = monthNames.map(name => ({
        name,
        value: monthlyData[name] || 0
      }));

      setStats({
        totalRecuperado: total,
        co2Evitado: Number(totalCO2.toFixed(1)),
        metaRep: Math.min(Math.round((total / 1000) * 100), 100),
        ecoPoints: currentPoints,
        tendencia: chartData,
        breakdown: breakdown
      });

    } catch (err) {
      console.error("Error loading dashboard stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background-dark/95 backdrop-blur-md border border-primary/40 p-3 rounded-xl shadow-2xl animate-in fade-in zoom-in duration-200 ring-1 ring-white/10">
          <p className="text-primary font-display font-black text-sm">{`${payload[0].value} Kg`}</p>
          <p className="text-white/40 text-[9px] uppercase tracking-widest font-bold">Residuos Recuperados</p>
        </div>
      );
    }
    return null;
  };

  // ... (existing helper functions)

  return (
    <div className="font-sans flex min-h-screen w-full flex-col pb-28 max-w-md mx-auto bg-background-light dark:bg-background-dark animate-in fade-in duration-500">
      {/* Withdrawal Modal */}
      {showWithdrawalModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={() => setShowWithdrawalModal(false)}></div>
          <div className="relative w-full max-w-[400px] bg-gradient-to-b from-gray-900 to-black border border-white/10 rounded-[2rem] p-6 shadow-2xl animate-in fade-in zoom-in slide-in-from-bottom-5 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">

            <div className="flex items-center justify-between mb-8 sticky top-0 bg-inherit z-20 pb-2 border-b border-white/5">
              <div>
                <h3 className="text-xl font-display font-black text-white tracking-tight">Registrar Retiro</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Gestión de Residuos</p>
              </div>
              <button
                onClick={() => setShowWithdrawalModal(false)}
                className="size-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-6 relative z-10">
              {/* Client Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[14px]">domain</span>
                  Seleccionar Cliente
                </label>
                {!selectedClient ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                    {clients.map(client => (
                      <button
                        key={client.id}
                        onClick={() => setSelectedClient(client)}
                        className="w-full p-3 bg-white/5 hover:bg-white/10 rounded-xl flex items-center gap-3 border border-white/5 hover:border-primary/30 transition-all text-left group"
                      >
                        <div className="size-10 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 group-hover:scale-110 transition-transform">
                          {client.company_name?.[0] || 'C'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate text-white group-hover:text-primary transition-colors">{client.company_name}</p>
                          <p className="text-[10px] text-gray-500 font-bold">{client.rut}</p>
                        </div>
                        <span className="material-symbols-outlined text-gray-600 group-hover:text-primary ml-auto text-sm">chevron_right</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl relative group">
                    <button
                      onClick={() => setSelectedClient(null)}
                      className="absolute top-2 right-2 text-primary/40 hover:text-primary transition-colors hover:bg-primary/10 rounded-full p-1"
                    >
                      <span className="material-symbols-outlined text-lg">change_circle</span>
                    </button>

                    <div className="flex items-center gap-3 mb-4">
                      <div className="size-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                        {selectedClient.company_name?.[0] || 'C'}
                      </div>
                      <div>
                        <p className="text-[10px] text-primary font-black uppercase tracking-widest">Cliente Activo</p>
                        <p className="text-white font-bold text-sm truncate max-w-[180px]">{selectedClient.company_name}</p>
                      </div>
                    </div>

                    {/* Editable Fields */}
                    <div className="space-y-3 pl-1">
                      <div>
                        <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Razón Social</label>
                        <input
                          className="w-full bg-white/5 rounded-lg px-3 py-2 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-primary/50 transition-all border border-transparent focus:border-primary/20"
                          value={selectedClient.company_name}
                          onChange={(e) => setSelectedClient({ ...selectedClient, company_name: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">RUT</label>
                          <input
                            className="w-full bg-white/5 rounded-lg px-3 py-2 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-primary/50 transition-all border border-transparent focus:border-primary/20"
                            value={selectedClient.rut}
                            onChange={(e) => setSelectedClient({ ...selectedClient, rut: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Dirección</label>
                          <input
                            className="w-full bg-white/5 rounded-lg px-3 py-2 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-primary/50 transition-all border border-transparent focus:border-primary/20"
                            value={selectedClient.address}
                            onChange={(e) => setSelectedClient({ ...selectedClient, address: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Date Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                  Fecha del Retiro
                </label>
                <input
                  type="date"
                  value={withdrawalDate}
                  onChange={(e) => setWithdrawalDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
                />
              </div>

              {selectedClient && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Detalle de Carga</h4>
                    <div className="h-px flex-1 bg-white/5 ml-4"></div>
                  </div>

                  {/* Items List */}
                  {wasteItems.length > 0 && (
                    <div className="bg-white/5 rounded-2xl overflow-hidden border border-white/5">
                      {wasteItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                          <div className="text-xs">
                            <p className="font-bold text-white flex items-center gap-2">
                              <span className="size-2 rounded-full bg-primary/50"></span>
                              {item.quantity} {item.unit} <span className="text-white/40">•</span> {item.waste_type || item.type}
                            </p>
                            <p className="text-gray-500 text-[10px] pl-4">{item.description}</p>
                          </div>
                          <button onClick={() => handleRemoveWasteItem(idx)} className="size-8 flex items-center justify-center rounded-full text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-all">
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Item Form */}
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 border-dashed space-y-4 hover:border-primary/30 transition-colors">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Tipo de Residuo</label>
                        <div className="relative">
                          <select
                            className="w-full bg-surface-dark border border-white/10 rounded-lg py-2 pl-3 pr-8 text-xs font-bold text-white outline-none focus:border-primary appearance-none"
                            value={currentWaste.waste_type}
                            onChange={(e) => setCurrentWaste({ ...currentWaste, waste_type: e.target.value })}
                          >
                            <option value="" disabled>Seleccionar...</option>
                            {categories.map(cat => (
                              <option key={cat.value} value={cat.value}>{cat.label}</option>
                            ))}
                          </select>
                          <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none text-sm">expand_more</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Descripción</label>
                        <input
                          type="text"
                          className="w-full bg-surface-dark border border-white/10 rounded-lg py-2 px-3 text-xs font-bold text-white outline-none focus:border-primary placeholder:text-gray-700"
                          value={currentWaste.description}
                          onChange={(e) => setCurrentWaste({ ...currentWaste, description: e.target.value })}
                          placeholder="Ej: Botellas"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Cantidad</label>
                        <input
                          type="number"
                          className="w-full bg-surface-dark border border-white/10 rounded-lg py-2 px-3 text-xs font-bold text-white outline-none focus:border-primary placeholder:text-gray-700"
                          value={currentWaste.quantity}
                          onChange={(e) => setCurrentWaste({ ...currentWaste, quantity: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Unidad</label>
                        <input
                          type="text"
                          className="w-full bg-surface-dark border border-white/10 rounded-lg py-2 px-3 text-xs font-bold text-white outline-none focus:border-primary placeholder:text-gray-700"
                          value={currentWaste.unit}
                          onChange={(e) => setCurrentWaste({ ...currentWaste, unit: e.target.value })}
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleAddWasteItem}
                      className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-white/5 hover:border-white/20"
                    >
                      <span className="material-symbols-outlined text-sm">add_circle</span>
                      Agregar Item
                    </button>
                  </div>

                  <button
                    onClick={handleGenerateCR}
                    className="w-full py-4 bg-gradient-to-r from-primary to-primary-light text-background-dark rounded-2xl font-display font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-primary/40 mt-2 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                  >
                    <span className="material-symbols-outlined">print</span>
                    Emitir Certificado ({wasteItems.length})
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Operator FAB */}
      {isAdmin && (
        <button
          onClick={() => setShowWithdrawalModal(true)}
          className="fixed bottom-24 right-5 size-16 bg-primary text-background-dark rounded-full shadow-[0_0_30px_rgba(16,185,129,0.4)] flex items-center justify-center z-40 border-4 border-background-dark dark:border-background-light active:scale-90 transition-transform animate-in zoom-in duration-300"
        >
          <span className="material-symbols-outlined text-3xl">add_task</span>
        </button>
      )}

      <div className="sticky top-0 z-30 flex items-center bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md p-5 justify-between border-b border-gray-200 dark:border-white/5">
        <div className="flex items-center gap-4">
          <div className="p-1">
            <img
              src="/logo_econexo_new.png"
              alt="Logo Econexo"
              className="h-11 w-auto object-contain"
            />
          </div>
          <div className="flex flex-col">
            <h2 className="text-slate-900 dark:text-white text-xl font-display font-black tracking-tighter leading-none">Econexo</h2>
            <span className="text-[10px] text-primary font-bold uppercase tracking-widest mt-0.5">
              {isLeyRep ? 'Gestión Ley REP' : 'Impacto Ambiental'}
            </span>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <Link to="/chat" className="flex items-center justify-center size-10 rounded-full bg-primary/10 hover:bg-primary/20 transition-all active:scale-90 shadow-sm border border-primary/10">
            <span className="material-symbols-outlined text-primary text-[22px]">chat</span>
          </Link>
          <Link to="/profile" className="size-10 rounded-full overflow-hidden border-2 border-primary/30 shadow-glow">
            <img src={avatarUrl} className="w-full h-full object-cover" alt="Perfil" />
          </Link>
        </div>
      </div>

      <main className="flex flex-col gap-6 p-4">
        <section className="grid grid-cols-2 gap-4">
          {/* Total Recuperado Card */}
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="group relative overflow-hidden flex flex-col justify-between rounded-[2rem] p-6 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border border-white/10 shadow-xl transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-500 pointer-events-none mix-blend-overlay">
              <img
                src="https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?q=80&w=800"
                alt=""
                className="w-full h-full object-cover grayscale"
              />
            </div>
            <div className="absolute -right-12 -top-12 size-40 bg-purple-500/20 rounded-full blur-3xl group-hover:bg-purple-500/30 transition-all duration-500 z-0"></div>

            <div className="flex items-start justify-between relative z-10 w-full mb-4">
              <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-400 border border-purple-500/20 shadow-lg shadow-purple-500/5 group-hover:scale-110 transition-transform duration-500">
                <span className="material-symbols-outlined text-2xl">recycling</span>
              </div>
              <span className="material-symbols-outlined text-purple-400/50 group-hover:text-purple-400 transition-colors">{showDetail ? 'expand_less' : 'expand_more'}</span>
            </div>

            <div className="relative z-10 text-left w-full">
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.25em] mb-1 pl-1">Total Recuperado</p>
              <div className="flex items-baseline gap-2">
                <p className="text-4xl font-display font-black text-white tracking-tight drop-shadow-sm">{stats.totalRecuperado.toLocaleString()}</p>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">KG</span>
              </div>

              {/* Breakdown List */}
              {showDetail && stats.breakdown && (
                <div className="mt-6 pt-4 border-t border-white/10 space-y-3 w-full animate-in slide-in-from-top-4 fade-in duration-300">
                  {stats.breakdown.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-xs font-bold group/item">
                      <div className="flex items-center gap-2 text-gray-400 group-hover/item:text-white transition-colors">
                        <div className="size-2 rounded-full ring-2 ring-white/10" style={{ backgroundColor: item.color }}></div>
                        {item.label}
                      </div>
                      <span className="text-white bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">{item.value} kg</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </button>

          {/* CO2 Evitado Card */}
          <div className="col-span-1 relative overflow-hidden rounded-[2rem] p-6 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border border-white/10 shadow-xl group">
            <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-500 pointer-events-none mix-blend-overlay">
              <img
                src="https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=800"
                alt=""
                className="w-full h-full object-cover grayscale"
              />
            </div>
            <div className="absolute -right-12 -bottom-12 size-40 bg-teal-500/20 rounded-full blur-3xl group-hover:bg-teal-500/30 transition-all duration-500 z-0"></div>

            <div className="flex items-start justify-between relative z-10 mb-4">
              <div className="p-3 bg-teal-500/10 rounded-2xl text-teal-400 border border-teal-500/20 shadow-lg shadow-teal-500/5 group-hover:scale-110 transition-transform duration-500">
                <span className="material-symbols-outlined text-2xl">co2</span>
              </div>
            </div>

            <div className="relative z-10">
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.25em] mb-1 pl-1">Huella Evitada</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-display font-black text-white tracking-tight">{stats.co2Evitado.toLocaleString()}</p>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">KG</span>
              </div>
              <div className="mt-3 flex items-center gap-2 p-2 rounded-xl bg-teal-500/10 border border-teal-500/10 backdrop-blur-md">
                <span className="material-symbols-outlined text-teal-400 text-sm">forest</span>
                <p className="text-[9px] font-bold text-teal-300 leading-tight">Equivale a {(stats.co2Evitado / 20).toFixed(1)} árboles</p>
              </div>
            </div>
          </div>
        </section>

        {/* Eco-Puntos Rewards Card */}
        <section
          onClick={() => navigate('/rewards')}
          className="relative overflow-hidden rounded-[32px] p-6 border border-white/5 shadow-2xl group cursor-pointer active:scale-[0.98] transition-all bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl"
        >
          {/* Background Image - Eco Points */}
          <div className="absolute inset-0 opacity-40 pointer-events-none group-hover:scale-110 group-hover:opacity-60 transition-all duration-1000">
            <img
              src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?q=80&w=800"
              alt=""
              className="w-full h-full object-cover grayscale mix-blend-overlay"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background-dark via-background-dark/80 to-transparent"></div>
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="size-16 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-yellow-500/30 group-hover:scale-110 transition-transform duration-500">
                <span className="material-symbols-outlined text-3xl font-black">stars</span>
              </div>
              <div className="space-y-0.5">
                <h3 className="text-white text-2xl font-display font-black tracking-tight flex items-center gap-2 group-hover:text-yellow-400 transition-colors">
                  {stats.ecoPoints.toLocaleString()} <span className="text-gray-500 text-[10px] mt-2 uppercase tracking-widest font-bold">Pts</span>
                </h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight group-hover:text-white transition-colors">¡{1000 - (stats.ecoPoints % 1000)} pts para tu próximo nivel!</p>
              </div>
            </div>
            <button className="size-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white group-hover:bg-yellow-500 group-hover:text-background-dark transition-all duration-300">
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
          <div className="relative z-10 mt-6">
            <div className="flex justify-between text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">
              <span>Nivel Actual {Math.floor(stats.ecoPoints / 1000) + 1}</span>
              <span>Siguiente Nivel</span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5 backdrop-blur-sm">
              <div
                className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full shadow-[0_0_20px_rgba(234,179,8,0.5)] transition-all duration-1000 relative"
                style={{ width: `${(stats.ecoPoints % 1000) / 10}%` }}
              >
                <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50"></div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden flex flex-col gap-5 rounded-[2rem] bg-gradient-to-b from-white/5 to-transparent p-6 shadow-xl border border-white/5 backdrop-blur-md group">
          <div className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-1000 pointer-events-none mix-blend-screen">
            <img
              src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800"
              alt=""
              className="w-full h-full object-cover"
            />
          </div>

          {/* Chart Header */}
          <div className="flex items-center justify-between z-10 relative">
            <div className="space-y-1">
              <h3 className="text-white text-lg font-display font-black tracking-tight flex items-center gap-2">
                Tendencia Mensual
              </h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{loading ? 'Cargando datos...' : 'Recuperación de Residuos'}</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl outline-none focus:ring-1 focus:ring-primary/40 appearance-none cursor-pointer hover:bg-white/10 transition-all text-center"
              >
                {availableYears.map(year => (
                  <option key={year} value={year} className="text-black bg-white">{year}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="h-64 w-full relative z-10">
            {stats.tendencia.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.tendencia}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }}
                  />
                  <XAxis dataKey="name" stroke="#525252" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                  <YAxis hide domain={[0, 'auto']} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#10B981"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorValue)"
                    animationDuration={2000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-2 border-2 border-dashed border-white/5 rounded-2xl bg-white/5">
                <span className="material-symbols-outlined text-4xl opacity-50">bar_chart_off</span>
                <p className="text-xs font-bold uppercase tracking-widest opacity-70">Sin datos este año</p>
              </div>
            )}
          </div>
        </section>

        <section
          onClick={() => navigate('/impact')}
          className="relative overflow-hidden rounded-[2rem] p-6 border border-white/5 shadow-xl group cursor-pointer active:scale-[0.98] transition-all bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl"
        >
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=600')] bg-cover bg-center opacity-10 group-hover:opacity-25 transition-opacity duration-700 mix-blend-overlay"></div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-primary/10 rounded-lg text-primary border border-primary/20">
                  <span className="material-symbols-outlined text-xl font-bold">{isLeyRep ? 'fact_check' : 'eco'}</span>
                </div>
                <h3 className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em]">{isLeyRep ? 'Cumplimiento Legal' : 'Impacto Ambiental'}</h3>
              </div>

              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-display font-black text-white tracking-tight">
                  {isLeyRep ? `${stats.metaRep}%` : stats.co2Evitado.toLocaleString()}
                </p>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{isLeyRep ? 'Meta REP' : 'Kg CO₂'}</span>
              </div>
            </div>

            <button className="size-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white group-hover:bg-primary group-hover:text-background-dark transition-all duration-300">
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>

          <div className="relative z-10 mt-6">
            <div className="flex justify-between text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">
              <span>Progresión Anual</span>
              <span>{stats.metaRep}% Completado</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div className="h-full bg-primary shadow-[0_0_15px_#0ff092] transition-all duration-1000" style={{ width: `${stats.metaRep}%` }}></div>
            </div>
          </div>
        </section>
      </main>

      <Navbar />
    </div>
  );
};

export default Dashboard;
