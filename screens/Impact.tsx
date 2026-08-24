import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { jsPDF } from 'jspdf';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

import { supabase } from '../services/supabase';
import { normalizeMaterialType, materialFactors, CO2_PER_TREE, MATERIAL_COLORS } from '../utils/materialCalculations';
import { useToast } from '../components/ui/Toast';
import { useCountUp } from '../hooks/useCountUp';

interface ImpactProps {
  isLeyRep: boolean;
}

const Impact: React.FC<ImpactProps> = ({ isLeyRep }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [stats, setStats] = useState({
    metaRep: 0,
    arbolesRescatados: 0,
    aguaAhorrada: 0,
    energiaAhorrada: 0,
    carbonFootprint: 0,
    kmEvitados: 0,
    hogaresAbastecidos: 0,
    duchasEquivalentes: 0,
    vuelosEvitados: 0,
  });
  const [totalKg, setTotalKg] = useState(0);
  const [materialBreakdown, setMaterialBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [annualGoalKg, setAnnualGoalKg] = useState<number | null>(null);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  // Animation States
  const [animatedMeta, setAnimatedMeta] = useState(0);
  const [animatedCarbon, setAnimatedCarbon] = useState(0);

  // Animation Effect
  useEffect(() => {
    const duration = 1500; // ms
    const steps = 60;
    const intervalTime = duration / steps;

    let currentStep = 0;

    const startMeta = animatedMeta;
    const targetMeta = stats.metaRep;
    const metaIncrement = (targetMeta - startMeta) / steps;

    const startCarbon = animatedCarbon;
    const targetCarbon = stats.carbonFootprint;
    const carbonIncrement = (targetCarbon - startCarbon) / steps;

    const timer = setInterval(() => {
      currentStep++;

      if (currentStep <= steps) {
        setAnimatedMeta(prev => {
          const next = startMeta + (metaIncrement * currentStep);
          return Math.abs(next - targetMeta) < Math.abs(metaIncrement) ? targetMeta : next;
        });
        setAnimatedCarbon(prev => {
          const next = startCarbon + (carbonIncrement * currentStep);
          return Math.abs(next - targetCarbon) < Math.abs(carbonIncrement) ? targetCarbon : next;
        });
      } else {
        setAnimatedMeta(targetMeta);
        setAnimatedCarbon(targetCarbon);
        clearInterval(timer);
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [stats]);

  // Load goal from localStorage when user or year changes
  useEffect(() => {
    if (!userId) return;
    const stored = localStorage.getItem(`eco_goal_${userId}_${selectedYear}`);
    setAnnualGoalKg(stored ? Number(stored) : null);
  }, [userId, selectedYear]);

  const handleSaveGoal = () => {
    const val = Number(goalInput);
    if (!val || val <= 0 || !userId) {
      toast.warning('Ingresa una meta válida mayor a 0 kg.');
      return;
    }
    localStorage.setItem(`eco_goal_${userId}_${selectedYear}`, String(val));
    setAnnualGoalKg(val);
    setShowGoalModal(false);
    setGoalInput('');
    toast.success(`Meta ${selectedYear} establecida: ${val.toLocaleString()} kg`);
  };

  const handleRemoveGoal = () => {
    if (!userId) return;
    localStorage.removeItem(`eco_goal_${userId}_${selectedYear}`);
    setAnnualGoalKg(null);
    toast.success('Meta eliminada.');
  };

  useEffect(() => {
    const fetchImpactData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: docs } = await supabase
        .from('documents')
        .select('metadata, created_at')
        .eq('user_id', user.id)
        .in('type', ['CR', 'COMMUNITY_CR'])
        .eq('verified', true);

      let totalKg = 0;
      const materialBreakdown: { [key: string]: number } = {};

      if (docs) {
        const yearDocs = docs.filter((doc: any) => {
          const date = new Date(doc.created_at);
          return !isNaN(date.getTime()) && date.getFullYear() === selectedYear;
        });

        yearDocs.forEach((doc: any) => {
          const details = doc.metadata?.waste_details;
          let items = [];
          if (Array.isArray(details)) {
            items = details;
          } else if (details) {
            items = [details];
          }

          items.forEach((item: any) => {
            const qty = Number(item.quantity) || 0;
            totalKg = Number((totalKg + qty).toFixed(2));

            // Usar función compartida de normalización
            const category = normalizeMaterialType(item);
            materialBreakdown[category] = Number(((materialBreakdown[category] || 0) + qty).toFixed(2));
          });
        });
      }

      // Calcular impactos totales usando factores compartidos
      let co2AvoidedKg = 0;
      let waterSaved = 0;
      let energySaved = 0;

      Object.keys(materialBreakdown).forEach(material => {
        const qty = materialBreakdown[material];
        const factors = materialFactors[material] || materialFactors['Otros'];

        co2AvoidedKg += qty * factors.co2;
        waterSaved += qty * factors.water;
        energySaved += qty * factors.energy;
      });

      const treesEquivalent = co2AvoidedKg / CO2_PER_TREE; // 1 árbol absorbe ~22kg CO2/año

      setTotalKg(totalKg);
      // Build donut data (only materials with actual kg)
      setMaterialBreakdown(
        Object.entries(materialBreakdown)
          .filter(([, kg]) => kg > 0)
          .sort(([, a], [, b]) => b - a)
          .map(([name, value]) => ({ name, value }))
      );
      setStats({
        metaRep: totalKg > 0 ? Math.min(Math.round((totalKg / 1000) * 100), 100) : 0,
        arbolesRescatados: Math.round(treesEquivalent),
        aguaAhorrada: Math.round(waterSaved),
        energiaAhorrada: Math.round(energySaved),
        carbonFootprint: co2AvoidedKg / 1000,
        // Auto promedio: 0.21 kg CO2/km
        kmEvitados: Math.round(co2AvoidedKg / 0.21),
        // Hogar promedio Chile: ~10 kWh/día
        hogaresAbastecidos: Math.round(energySaved / 10),
        // Ducha promedio: 50 litros
        duchasEquivalentes: Math.round(waterSaved / 50),
        // Vuelo SCL-CCP (Santiago-Concepción) ~ 85 kg CO2 ida
        vuelosEvitados: Math.round(co2AvoidedKg / 85),
      });
    };
    fetchImpactData();
  }, [selectedYear]);

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const green = [50, 97, 5] as [number, number, number];
    const gray = [100, 100, 100] as [number, number, number];
    const W = 210;

    // Header bar
    doc.setFillColor(...green);
    doc.rect(0, 0, W, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('EcoNexo — Informe de Impacto Ambiental', 14, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Período ${selectedYear}  |  Generado el ${new Date().toLocaleDateString('es-CL')}`, 14, 22);

    // Summary block
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen General', 14, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...gray);
    const summaryLines = [
      `Total reciclado: ${totalKg.toLocaleString('es-CL')} kg`,
      `CO₂ evitado: ${stats.carbonFootprint.toFixed(2)} toneladas`,
      `Agua ahorrada: ${stats.aguaAhorrada.toLocaleString('es-CL')} litros`,
      `Energía ahorrada: ${stats.energiaAhorrada.toLocaleString('es-CL')} kWh`,
    ];
    summaryLines.forEach((line, i) => doc.text(line, 14, 46 + i * 7));

    // Eco-equivalencies
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Equivalencias Ambientales', 14, 82);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...gray);
    const equivLines = [
      `🌳 ${stats.arbolesRescatados} árboles rescatados`,
      `🚗 ${stats.kmEvitados.toLocaleString('es-CL')} km en auto evitados`,
      `🏠 ${stats.hogaresAbastecidos.toLocaleString('es-CL')} hogares abastecidos por 1 día`,
      `🚿 ${stats.duchasEquivalentes.toLocaleString('es-CL')} duchas equivalentes ahorradas`,
      `✈️  ${stats.vuelosEvitados} vuelos cortos evitados (SCL-CCP)`,
    ];
    equivLines.forEach((line, i) => doc.text(line, 14, 90 + i * 7));

    // Footer
    doc.setFillColor(...green);
    doc.rect(0, 282, W, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text('EcoNexo SpA — Gestión Ambiental Inteligente — econexo.cl', 14, 291);

    doc.save(`EcoNexo_Impacto_${selectedYear}.pdf`);
    toast.success('PDF generado correctamente');
  };

  const handleShareCard = async () => {
    const W = 1080, H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#f0f4f0');
    grad.addColorStop(1, '#d4e8c2');
    ctx.fillStyle = grad;
    ctx.roundRect(0, 0, W, H, 40);
    ctx.fill();

    // Top green bar
    ctx.fillStyle = '#326105';
    ctx.fillRect(0, 0, W, 160);

    // Brand name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px system-ui, sans-serif';
    ctx.fillText('EcoNexo', 60, 100);
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`Impacto Ambiental ${selectedYear}`, 60, 140);

    // Leaf emoji area
    ctx.font = '80px serif';
    ctx.fillText('🌿', W - 120, 120);

    // Main metric — CO2
    ctx.fillStyle = '#326105';
    ctx.font = 'bold 120px system-ui, sans-serif';
    ctx.fillText(`${stats.carbonFootprint.toFixed(1)}`, 60, 330);
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.fillStyle = '#555';
    ctx.fillText('toneladas de CO₂ evitadas', 60, 390);

    // Divider
    ctx.strokeStyle = '#326105';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(60, 430);
    ctx.lineTo(W - 60, 430);
    ctx.stroke();

    // 3 metric blocks
    const metrics = [
      { emoji: '🌳', value: stats.arbolesRescatados.toLocaleString('es-CL'), label: 'árboles rescatados' },
      { emoji: '♻️', value: `${totalKg.toLocaleString('es-CL')} kg`, label: 'residuos reciclados' },
      { emoji: '⚡', value: stats.energiaAhorrada.toLocaleString('es-CL'), label: 'kWh ahorrados' },
    ];

    metrics.forEach((m, i) => {
      const x = 60 + i * 330;
      const y = 480;
      // Card bg
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.roundRect(x, y, 290, 240, 24);
      ctx.fill();
      // Emoji
      ctx.font = '52px serif';
      ctx.fillText(m.emoji, x + 20, y + 70);
      // Value
      ctx.fillStyle = '#326105';
      ctx.font = 'bold 44px system-ui, sans-serif';
      ctx.fillText(m.value, x + 20, y + 140);
      // Label
      ctx.fillStyle = '#666';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText(m.label, x + 20, y + 180);
    });

    // Extra equivalencies row
    const equivs = [
      { emoji: '🚗', value: stats.kmEvitados.toLocaleString('es-CL'), label: 'km evitados' },
      { emoji: '🚿', value: stats.duchasEquivalentes.toLocaleString('es-CL'), label: 'duchas ahorradas' },
      { emoji: '✈️', value: stats.vuelosEvitados.toLocaleString('es-CL'), label: 'vuelos evitados' },
    ];

    equivs.forEach((e, i) => {
      const x = 60 + i * 330;
      const y = 760;
      ctx.fillStyle = 'rgba(50,97,5,0.08)';
      ctx.beginPath();
      ctx.roundRect(x, y, 290, 110, 20);
      ctx.fill();
      ctx.font = '32px serif';
      ctx.fillText(e.emoji, x + 16, y + 50);
      ctx.fillStyle = '#326105';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText(e.value, x + 65, y + 52);
      ctx.fillStyle = '#888';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText(e.label, x + 16, y + 90);
    });

    // Footer
    ctx.fillStyle = '#326105';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('econexo.cl  ·  Gestión Ambiental Inteligente', 60, H - 40);

    // Export
    const dataUrl = canvas.toDataURL('image/png');
    if (navigator.share) {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `EcoNexo_Impacto_${selectedYear}.png`, { type: 'image/png' });
        await navigator.share({ files: [file], title: `Mi impacto ambiental ${selectedYear}` });
        return;
      } catch {
        // fallback to download
      }
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `EcoNexo_Impacto_${selectedYear}.png`;
    a.click();
    toast.success('Tarjeta descargada como PNG');
  };

  const glossary = isLeyRep ? [
    { title: 'Equivalencia', desc: 'Conversión de métricas técnicas (como kg de CO₂) a conceptos cotidianos.' },
    { title: 'Huella de Carbono', desc: 'Total de gases de efecto invernadero emitidos por la empresa.' },
    { title: 'Ley REP', desc: 'Responsabilidad Extendida del Productor. Obligación legal de gestión de residuos.' },
    { title: 'Metas Anuales', desc: 'Porcentajes de recuperación exigidos por el Ministerio del Medio Ambiente.' },
  ] : [
    { title: 'Impacto Positivo', desc: 'Beneficios tangibles para el ecosistema derivados de una gestión responsable.' },
    { title: 'Economía Circular', desc: 'Modelo que busca extender la vida útil de los recursos.' },
    { title: 'Valorización', desc: 'Transformar residuos en nuevos recursos o energía.' },
    { title: 'Sumideros de CO₂', desc: 'Elementos naturales que absorben carbono de la atmósfera.' },
  ];

  const goalProgress = annualGoalKg && annualGoalKg > 0
    ? Math.min(Math.round((totalKg / annualGoalKg) * 100), 100)
    : 0;
  const goalAchieved = annualGoalKg !== null && totalKg >= annualGoalKg;

  const animatedArboles = useCountUp(stats.arbolesRescatados);
  const animatedAgua = useCountUp(stats.aguaAhorrada);
  const animatedEnergia = useCountUp(stats.energiaAhorrada);

  return (
    <div className="relative font-sans bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-8 animate-in fade-in slide-in-from-right-4 duration-500 overflow-hidden">
      {/* Decorative Background Blobs */}
      <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

      <header className="sticky top-0 z-20 flex items-center justify-between bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-5 py-5 border-b border-white/40 dark:border-slate-700/40 shadow-sm">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center rounded-full bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-700/80 transition-all active:scale-90 border border-white/40 dark:border-slate-600/40 shadow-sm">
          <span className="material-symbols-outlined text-gray-700 dark:text-gray-300 text-[22px]">arrow_back</span>
        </button>
        <h1 className="text-xl font-display font-black tracking-tight text-gray-900 dark:text-white">
          {isLeyRep ? 'Gestión REP' : 'Impacto Positivo'}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPDF}
            title="Exportar PDF"
            className="size-10 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-all active:scale-90 border border-primary/20 shadow-sm"
          >
            <span className="material-symbols-outlined text-primary text-[22px]">picture_as_pdf</span>
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="size-10 flex items-center justify-center rounded-full bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-700/80 transition-all group active:scale-90 border border-white/40 dark:border-slate-600/40 shadow-sm"
          >
            <span className="material-symbols-outlined text-primary group-hover:rotate-12 transition-transform text-[22px]">help</span>
          </button>
        </div>
      </header>

      {/* Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowGoalModal(false)}></div>
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-[92vw] sm:max-w-[340px] rounded-[32px] p-5 sm:p-8 border border-white/80 dark:border-slate-700 shadow-2xl animate-in zoom-in duration-200">
            <div className="text-center space-y-5">
              <div className="size-14 rounded-3xl bg-primary/10 text-primary mx-auto flex items-center justify-center border border-primary/20">
                <span className="material-symbols-outlined text-3xl">flag</span>
              </div>
              <div>
                <h3 className="text-xl font-display font-black text-gray-900 dark:text-white">Meta {selectedYear}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-1">¿Cuántos kg quieres reciclar este año?</p>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={goalInput}
                  onChange={e => setGoalInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveGoal()}
                  placeholder="Ej: 500"
                  className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-2xl px-5 py-4 text-2xl font-black text-center text-gray-900 dark:text-white outline-none focus:border-primary transition-colors"
                  autoFocus
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 font-black text-sm">kg</span>
              </div>
              <div className="space-y-3 pt-2">
                <button
                  onClick={handleSaveGoal}
                  className="w-full h-14 bg-primary text-background-dark rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                >
                  Guardar Meta
                </button>
                <button
                  onClick={() => setShowGoalModal(false)}
                  className="w-full h-10 text-gray-400 dark:text-gray-500 text-xs font-bold uppercase tracking-widest"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-12 sm:pb-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => setShowHelp(false)}></div>
          <div className="relative bg-white/90 backdrop-blur-xl w-full max-w-md rounded-[32px] p-8 border border-white/60 shadow-[0_30px_60px_rgba(0,0,0,0.15)] animate-in slide-in-from-bottom-full duration-500">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-display font-black flex items-center gap-3 text-gray-900">
                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-2xl font-bold">info</span>
                </div>
                {isLeyRep ? 'Guía de Normativa' : 'Guía de Impacto'}
              </h2>
              <button onClick={() => setShowHelp(false)} className="size-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                <span className="material-symbols-outlined text-[20px] text-gray-500">close</span>
              </button>
            </div>
            <div className="space-y-5 overflow-y-auto max-h-[55vh] no-scrollbar pr-1">
              {glossary.map((item, i) => (
                <div key={i} className="p-5 bg-white/60 rounded-2xl border border-white/50 hover:border-primary/20 transition-colors shadow-sm">
                  <h3 className="font-black text-primary mb-2 text-xs uppercase tracking-[0.2em]">{item.title}</h3>
                  <p className="text-[13px] text-gray-600 leading-relaxed font-bold">{item.desc}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="w-full mt-8 py-4 bg-primary text-background-dark font-display font-black uppercase tracking-widest rounded-2xl shadow-glow active:scale-95 transition-transform"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      <main className="p-4 space-y-10 pt-6">
        {/* Progress Circle Section */}
        <section className="flex flex-col items-center justify-center">
          <div className="relative size-72 flex items-center justify-center group cursor-pointer">
            <div className="absolute inset-0 rounded-full bg-primary/5 blur-[60px] group-hover:bg-primary/15 transition-all duration-1000"></div>
            <div className="absolute inset-0 rounded-full shadow-inner border border-gray-100" style={{ background: `conic-gradient(#326105 ${animatedMeta}%, #f3f4f6 0)` }}></div>
            <div className="absolute inset-6 rounded-full bg-white flex flex-col items-center justify-center shadow-xl border border-gray-100 overflow-hidden">
              <div className="absolute top-0 w-full h-1/2 bg-gradient-to-b from-gray-50 to-transparent"></div>
              <span className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-400 relative z-10">
                {isLeyRep ? 'Meta Legal 2024' : 'Huella de Carbono'}
              </span>
              <div className="flex items-baseline relative z-10 mt-1">
                <span className="text-7xl font-display font-black text-gray-900 tracking-tighter">
                  {isLeyRep ? Math.round(animatedMeta) : Number(animatedCarbon.toFixed(2))}
                </span>
                <span className="text-xl text-gray-400 font-black ml-1">{isLeyRep ? '%' : 'ton'}</span>
              </div>
              <div className="mt-3 px-4 py-1.5 bg-green-50 text-primary text-[11px] font-black rounded-full border border-green-100 relative z-10 uppercase tracking-tight">
                {isLeyRep ? 'Cumplimiento REP' : 'Resumen del Año'}
              </div>
            </div>
          </div>
          <h2 className="mt-10 text-center text-3xl font-display font-black leading-[1.1] px-6 tracking-tighter text-gray-900 dark:text-white">
            {stats.metaRep > 0
              ? (isLeyRep ? '¡Tu empresa cumple con la normativa!' : '¡Estás transformando el medio ambiente!')
              : (isLeyRep ? 'Inicia tu registro para ver progreso REP' : 'Comienza a reciclar para ver tu impacto')}
          </h2>
        </section>

        {/* Annual Goal Section */}
        <section className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[28px] p-6 border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <span className="material-symbols-outlined text-primary text-lg">flag</span>
              </div>
              <div>
                <h3 className="text-sm font-display font-black text-gray-900 dark:text-white">Meta Anual {selectedYear}</h3>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">Objetivo de reciclaje</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {annualGoalKg !== null && (
                <button
                  onClick={handleRemoveGoal}
                  className="size-8 rounded-full flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  title="Eliminar meta"
                >
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              )}
              <button
                onClick={() => { setGoalInput(annualGoalKg?.toString() || ''); setShowGoalModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all bg-primary/5 border-primary/20 text-primary hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-sm">{annualGoalKg !== null ? 'edit' : 'add'}</span>
                {annualGoalKg !== null ? 'Editar' : 'Establecer'}
              </button>
            </div>
          </div>

          {annualGoalKg !== null ? (
            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-3xl font-display font-black text-gray-900 dark:text-white">{totalKg.toLocaleString()}</span>
                  <span className="text-sm text-gray-400 dark:text-gray-500 font-bold ml-1">/ {annualGoalKg.toLocaleString()} kg</span>
                </div>
                <span className={`text-lg font-display font-black ${goalAchieved ? 'text-primary' : 'text-gray-400 dark:text-gray-500'}`}>
                  {goalProgress}%
                </span>
              </div>
              <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${goalAchieved ? 'bg-primary shadow-[0_0_12px_rgba(50,97,5,0.4)]' : 'bg-gradient-to-r from-primary/60 to-primary'}`}
                  style={{ width: `${goalProgress}%` }}
                ></div>
              </div>
              {goalAchieved ? (
                <p className="text-xs text-primary font-black flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm filled">verified</span>
                  ¡Meta alcanzada! Has reciclado {(totalKg - annualGoalKg).toLocaleString()} kg extra.
                </p>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 font-bold">
                  Te faltan <span className="text-primary font-black">{(annualGoalKg - totalKg).toLocaleString()} kg</span> para alcanzar tu meta.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 gap-2 text-center">
              <span className="material-symbols-outlined text-4xl text-gray-200 dark:text-slate-700">flag</span>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-bold">Sin meta establecida para {selectedYear}.<br />Define un objetivo de reciclaje anual.</p>
            </div>
          )}
        </section>

        {/* Impact Cards */}
        <section className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em]">Detalle de Beneficios</h3>
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 px-2 py-1 rounded border border-gray-200 dark:border-slate-700">
              <button
                onClick={() => setSelectedYear(y => y - 1)}
                className="size-4 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-primary transition-colors"
                aria-label="Año anterior"
              >
                <span className="material-symbols-outlined text-[14px]">chevron_left</span>
              </button>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mx-1">PERIODO {selectedYear}</span>
              <button
                onClick={() => setSelectedYear(y => y + 1)}
                className="size-4 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-primary transition-colors"
                aria-label="Año siguiente"
              >
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              </button>
            </div>
          </div>

          {/* Forest Card */}
          <div className="relative rounded-[32px] bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl overflow-hidden border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] group transition-all hover:scale-[1.02]">
            <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-multiply">
              <img
                src="/assets/trees_rescued_bg.png"
                alt=""
                className="w-full h-full object-cover scale-105 filter grayscale contrast-125"
              />
            </div>
            <div className="relative z-10 p-8 space-y-6">
              <div className="flex justify-between items-start">
                <div className="size-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center border border-green-100">
                  <span className="material-symbols-outlined text-2xl font-bold">forest</span>
                </div>
                {stats.arbolesRescatados > 0 && (
                  <div className="flex items-center gap-1.5 text-primary text-[11px] font-black bg-white px-3 py-1.5 rounded-full uppercase tracking-tight border border-primary/20 shadow-sm">
                    <span className="material-symbols-outlined text-[16px] font-bold">verified</span>
                    Verificado
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-7xl font-display font-black text-gray-900 dark:text-white block tracking-tighter leading-none">{animatedArboles}</span>
                <span className="text-[13px] text-green-600 font-black uppercase tracking-[0.3em] block ml-1">Árboles Rescatados</span>
              </div>
              <p className="text-[13px] text-gray-400 dark:text-gray-500 leading-relaxed font-bold tracking-tight">Equivale a la preservación efectiva de biodiversidad local frente a la deforestación industrial.</p>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden border border-gray-100">
                <div className="h-full bg-primary" style={{ width: `${Math.min(stats.arbolesRescatados, 100)}% ` }}></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="relative overflow-hidden bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[28px] border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] group h-[180px] transition-all hover:scale-[1.02]">
              <div className="absolute inset-0 opacity-5 pointer-events-none mix-blend-multiply">
                <img
                  src="/assets/water_saved_bg.png"
                  alt=""
                  className="w-full h-full object-cover scale-125 transition-transform duration-700 group-hover:scale-150 grayscale"
                />
              </div>
              <div className="relative z-10 p-6 flex flex-col justify-between h-full">
                <div className="size-11 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-100">
                  <span className="material-symbols-outlined text-2xl font-bold">water_drop</span>
                </div>
                <div>
                  <p className="text-4xl font-display font-black text-gray-900 dark:text-white tracking-tighter">{animatedAgua.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 font-black uppercase mt-1 tracking-widest leading-tight">Lts Agua</p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[28px] border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] group h-[180px] transition-all hover:scale-[1.02]">
              <div className="absolute inset-0 opacity-5 pointer-events-none mix-blend-multiply">
                <img
                  src="/assets/energy_saved_bg.png"
                  alt=""
                  className="w-full h-full object-cover scale-125 transition-transform duration-700 group-hover:scale-150 grayscale"
                />
              </div>
              <div className="relative z-10 p-6 flex flex-col justify-between h-full">
                <div className="size-11 rounded-xl bg-yellow-50 text-yellow-500 flex items-center justify-center border border-yellow-100">
                  <span className="material-symbols-outlined text-2xl font-bold">bolt</span>
                </div>
                <div>
                  <p className="text-4xl font-display font-black text-gray-900 dark:text-white tracking-tighter">{animatedEnergia.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 font-black uppercase mt-1 tracking-widest leading-tight">kWh Energía</p>
                </div>
              </div>
            </div>
          </div>

          {/* Material Breakdown Donut */}
          {materialBreakdown.length > 0 && (() => {
            const totalDonut = materialBreakdown.reduce((s, d) => s + d.value, 0);
            return (
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[28px] border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] p-6 space-y-4">
                <h4 className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em]">Distribución por material</h4>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-48 h-48 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={materialBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius="60%"
                          outerRadius="85%"
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {materialBreakdown.map((entry) => (
                            <Cell key={entry.name} fill={MATERIAL_COLORS[entry.name] || '#94a3b8'} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [`${value.toLocaleString('es-CL')} kg`, '']}
                          contentStyle={{ borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 w-full space-y-2">
                    {materialBreakdown.map((entry) => {
                      const pct = Math.round((entry.value / totalDonut) * 100);
                      const color = MATERIAL_COLORS[entry.name] || '#94a3b8';
                      return (
                        <div key={entry.name} className="flex items-center gap-2">
                          <div className="size-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex-1">{entry.name}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500 font-bold">{entry.value.toLocaleString('es-CL')} kg</span>
                          <span className="text-xs font-black w-9 text-right" style={{ color }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Extra Equivalencies */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em] px-2">Más equivalencias</h4>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: 'directions_car', color: 'bg-orange-50 text-orange-500 border-orange-100', value: stats.kmEvitados.toLocaleString(), unit: 'km en auto', label: 'evitados' },
                { icon: 'home', color: 'bg-purple-50 text-purple-500 border-purple-100', value: stats.hogaresAbastecidos.toLocaleString(), unit: 'hogares', label: '1 día con energía' },
                { icon: 'shower', color: 'bg-cyan-50 text-cyan-500 border-cyan-100', value: stats.duchasEquivalentes.toLocaleString(), unit: 'duchas', label: 'de agua ahorrada' },
                { icon: 'flight', color: 'bg-rose-50 text-rose-500 border-rose-100', value: stats.vuelosEvitados.toLocaleString(), unit: 'vuelos', label: 'cortos evitados' },
              ].map((item) => (
                <div key={item.icon} className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[24px] border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] p-5 flex flex-col gap-3 transition-all hover:scale-[1.02]">
                  <div className={`size-10 rounded-xl flex items-center justify-center border ${item.color}`}>
                    <span className="material-symbols-outlined text-xl">{item.icon}</span>
                  </div>
                  <div>
                    <p className="text-2xl font-display font-black text-gray-900 dark:text-white tracking-tighter leading-none">{item.value}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mt-1">{item.unit}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold mt-0.5">{item.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <button
          onClick={handleShareCard}
          className="w-full h-16 bg-primary text-white rounded-[22px] font-display font-black text-sm uppercase tracking-[0.25em] flex items-center justify-center gap-3 transform active:scale-95 transition-all shadow-[0_15px_30px_rgba(50,97,5,0.25)]"
        >
          <span className="material-symbols-outlined font-black text-xl">share</span>
          Compartir Tarjeta de Impacto
        </button>
      </main >

      <Navbar />
    </div >
  );
};

export default Impact;
