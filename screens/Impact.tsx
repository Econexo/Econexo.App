import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';

import { supabase } from '../services/supabase';
import { normalizeMaterialType, materialFactors, CO2_PER_TREE } from '../utils/materialCalculations';

interface ImpactProps {
  isLeyRep: boolean;
}

const Impact: React.FC<ImpactProps> = ({ isLeyRep }) => {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [stats, setStats] = useState({
    metaRep: 0,
    arbolesRescatados: 0,
    aguaAhorrada: 0,
    energiaAhorrada: 0,
    carbonFootprint: 0
  });

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

  useEffect(() => {
    const fetchImpactData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: docs } = await supabase
        .from('documents')
        .select('metadata, created_at')
        .eq('user_id', user.id)
        .eq('type', 'CR')
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

      setStats({
        metaRep: totalKg > 0 ? Math.min(Math.round((totalKg / 1000) * 100), 100) : 0,
        arbolesRescatados: Math.round(treesEquivalent),
        aguaAhorrada: Math.round(waterSaved),
        energiaAhorrada: Math.round(energySaved),
        carbonFootprint: co2AvoidedKg / 1000 // En Toneladas
      });
    };
    fetchImpactData();
  }, [selectedYear]);

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

  return (
    <div className="relative font-sans bg-[#f0f4f0] min-h-screen text-slate-900 max-w-md md:max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-8 animate-in fade-in slide-in-from-right-4 duration-500 overflow-hidden">
      {/* Decorative Background Blobs */}
      <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

      <header className="sticky top-0 z-20 flex items-center justify-between bg-white/70 backdrop-blur-md px-5 py-5 border-b border-white/40 shadow-sm">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center rounded-full bg-white/50 hover:bg-white/80 transition-all active:scale-90 border border-white/40 shadow-sm">
          <span className="material-symbols-outlined text-gray-700 text-[22px]">arrow_back</span>
        </button>
        <h1 className="text-xl font-display font-black tracking-tight text-gray-900">
          {isLeyRep ? 'Gestión REP' : 'Impacto Positivo'}
        </h1>
        <button
          onClick={() => setShowHelp(true)}
          className="size-10 flex items-center justify-center rounded-full bg-white/50 hover:bg-white/80 transition-all group active:scale-90 border border-white/40 shadow-sm"
        >
          <span className="material-symbols-outlined text-primary group-hover:rotate-12 transition-transform text-[22px]">help</span>
        </button>
      </header>

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
          <h2 className="mt-10 text-center text-3xl font-display font-black leading-[1.1] px-6 tracking-tighter text-gray-900">
            {stats.metaRep > 0
              ? (isLeyRep ? '¡Tu empresa cumple con la normativa!' : '¡Estás transformando el medio ambiente!')
              : (isLeyRep ? 'Inicia tu registro para ver progreso REP' : 'Comienza a reciclar para ver tu impacto')}
          </h2>
        </section>

        {/* Impact Cards */}
        <section className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.25em]">Detalle de Beneficios</h3>
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-gray-200">
              <button
                onClick={() => setSelectedYear(y => y - 1)}
                className="size-4 flex items-center justify-center text-gray-400 hover:text-primary transition-colors"
                aria-label="Año anterior"
              >
                <span className="material-symbols-outlined text-[14px]">chevron_left</span>
              </button>
              <span className="text-[10px] text-gray-500 font-bold mx-1">PERIODO {selectedYear}</span>
              <button
                onClick={() => setSelectedYear(y => y + 1)}
                className="size-4 flex items-center justify-center text-gray-400 hover:text-primary transition-colors"
                aria-label="Año siguiente"
              >
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              </button>
            </div>
          </div>

          {/* Forest Card */}
          <div className="relative rounded-[32px] bg-white/60 backdrop-blur-2xl overflow-hidden border border-white/80 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] group transition-all hover:scale-[1.02]">
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
                <span className="text-7xl font-display font-black text-gray-900 block tracking-tighter leading-none">{stats.arbolesRescatados}</span>
                <span className="text-[13px] text-green-600 font-black uppercase tracking-[0.3em] block ml-1">Árboles Rescatados</span>
              </div>
              <p className="text-[13px] text-gray-400 leading-relaxed font-bold tracking-tight">Equivale a la preservación efectiva de biodiversidad local frente a la deforestación industrial.</p>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden border border-gray-100">
                <div className="h-full bg-primary" style={{ width: `${Math.min(stats.arbolesRescatados, 100)}% ` }}></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="relative overflow-hidden bg-white/60 backdrop-blur-2xl rounded-[28px] border border-white/80 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] group h-[180px] transition-all hover:scale-[1.02]">
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
                  <p className="text-4xl font-display font-black text-gray-900 tracking-tighter">{stats.aguaAhorrada.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-400 font-black uppercase mt-1 tracking-widest leading-tight">Lts Agua</p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden bg-white/60 backdrop-blur-2xl rounded-[28px] border border-white/80 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] group h-[180px] transition-all hover:scale-[1.02]">
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
                  <p className="text-4xl font-display font-black text-gray-900 tracking-tighter">{stats.energiaAhorrada.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-400 font-black uppercase mt-1 tracking-widest leading-tight">kWh Energía</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <button
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: 'Mi Impacto Ambiental - Econexo',
                text: '¡Mira el impacto positivo que estamos generando con Econexo!',
                url: window.location.href,
              }).catch(console.error);
            } else {
              alert('¡Enlace copiado al portapapeles!');
            }
          }}
          className="w-full h-16 bg-primary text-background-dark rounded-[22px] font-display font-black text-sm uppercase tracking-[0.25em] flex items-center justify-center gap-3 transform active:scale-95 transition-all shadow-[0_15px_30px_rgba(15,240,146,0.25)]"
        >
          <span className="material-symbols-outlined font-black text-xl">ios_share</span>
          Compartir Informe
        </button>
      </main >

      <Navbar />
    </div >
  );
};

export default Impact;
