import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';

import { supabase } from '../services/supabase';
import { normalizeMaterialType, materialFactors } from '../utils/materialCalculations';

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
            totalKg += qty;

            // Usar función compartida de normalización
            const category = normalizeMaterialType(item);
            materialBreakdown[category] = (materialBreakdown[category] || 0) + qty;
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

      const treesEquivalent = co2AvoidedKg / 22; // 1 árbol absorbe ~22kg CO2/año

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
    <div className="font-sans bg-background-light dark:bg-background-dark min-h-screen text-slate-900 dark:text-white max-w-md mx-auto pb-28 animate-in fade-in slide-in-from-right-4 duration-500">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-background-light/95 dark:bg-background-dark/95 px-5 py-5 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center rounded-full bg-surface-dark transition-all active:scale-90 border border-white/5 shadow-inner">
          <span className="material-symbols-outlined text-white text-[22px]">arrow_back</span>
        </button>
        <h1 className="text-xl font-display font-black tracking-tight">
          {isLeyRep ? 'Gestión REP' : 'Impacto Positivo'}
        </h1>
        <button
          onClick={() => setShowHelp(true)}
          className="size-10 flex items-center justify-center rounded-full bg-surface-dark transition-all group active:scale-90 border border-white/5 shadow-inner"
        >
          <span className="material-symbols-outlined text-primary group-hover:rotate-12 transition-transform text-[22px]">help</span>
        </button>
      </header>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-12 sm:pb-4">
          <div className="absolute inset-0 bg-background-dark/85 backdrop-blur-sm" onClick={() => setShowHelp(false)}></div>
          <div className="relative bg-surface-dark w-full max-w-md rounded-[32px] p-8 border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-full duration-500">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-display font-black flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-2xl font-bold">info</span>
                </div>
                {isLeyRep ? 'Guía de Normativa' : 'Guía de Impacto'}
              </h2>
              <button onClick={() => setShowHelp(false)} className="size-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="space-y-5 overflow-y-auto max-h-[55vh] no-scrollbar pr-1">
              {glossary.map((item, i) => (
                <div key={i} className="p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-primary/20 transition-colors">
                  <h3 className="font-black text-primary mb-2 text-xs uppercase tracking-[0.2em]">{item.title}</h3>
                  <p className="text-[13px] text-gray-400 leading-relaxed font-bold">{item.desc}</p>
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
            <div className="absolute inset-0 rounded-full bg-primary/15 blur-[60px] group-hover:bg-primary/25 transition-all duration-1000"></div>
            <div className="absolute inset-0 rounded-full shadow-inner" style={{ background: `conic-gradient(#0ff092 ${stats.metaRep}%, #192e25 0)` }}></div>
            <div className="absolute inset-6 rounded-full bg-background-dark flex flex-col items-center justify-center shadow-2xl border border-white/10 overflow-hidden">
              <div className="absolute top-0 w-full h-1/2 bg-gradient-to-b from-primary/5 to-transparent"></div>
              <span className="text-[11px] font-black uppercase tracking-[0.3em] text-primary/60 relative z-10">
                {isLeyRep ? 'Meta Legal 2024' : 'Huella de Carbono'}
              </span>
              <div className="flex items-baseline relative z-10 mt-1">
                <span className="text-7xl font-display font-black text-white tracking-tighter">
                  {isLeyRep ? stats.metaRep : stats.carbonFootprint.toFixed(2)}
                </span>
                <span className="text-xl text-primary font-black ml-1">{isLeyRep ? '%' : 'ton'}</span>
              </div>
              <div className="mt-3 px-4 py-1.5 bg-primary/10 text-primary text-[11px] font-black rounded-full border border-primary/30 relative z-10 shadow-glow uppercase tracking-tight">
                {isLeyRep ? 'Cumplimiento REP' : 'Evitada este mes'}
              </div>
            </div>
          </div>
          <h2 className="mt-10 text-center text-3xl font-display font-black leading-[1.1] px-6 tracking-tighter">
            {stats.metaRep > 0
              ? (isLeyRep ? '¡Tu empresa cumple con la normativa!' : '¡Estás transformando el medio ambiente!')
              : (isLeyRep ? 'Inicia tu registro para ver progreso REP' : 'Comienza a reciclar para ver tu impacto')}
          </h2>
        </section>

        {/* Impact Cards */}
        <section className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-[0.25em]">Detalle de Beneficios</h3>
            <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded border border-white/10">
              <button
                onClick={() => setSelectedYear(y => y - 1)}
                className="size-4 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                aria-label="Año anterior"
              >
                <span className="material-symbols-outlined text-[14px]">chevron_left</span>
              </button>
              <span className="text-[10px] text-gray-400 font-bold mx-1">PERIODO {selectedYear}</span>
              <button
                onClick={() => setSelectedYear(y => y + 1)}
                className="size-4 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                aria-label="Año siguiente"
              >
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              </button>
            </div>
          </div>

          {/* Forest Card */}
          <div className="relative rounded-[32px] bg-surface-dark overflow-hidden border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.4)] group">
            <div className="absolute inset-0 opacity-90 pointer-events-none">
              <img
                src="/assets/trees_rescued_bg.png"
                alt=""
                className="w-full h-full object-cover scale-105"
              />
              <div className="absolute inset-0 bg-black/30"></div>
            </div>
            <div className="relative z-10 p-8 space-y-6">
              <div className="flex justify-between items-start">
                <div className="size-12 rounded-2xl bg-green-500/20 text-green-400 flex items-center justify-center shadow-inner border border-green-500/20">
                  <span className="material-symbols-outlined text-2xl font-bold">forest</span>
                </div>
                {stats.arbolesRescatados > 0 && (
                  <div className="flex items-center gap-1.5 text-primary text-[11px] font-black bg-primary/15 px-3 py-1.5 rounded-full uppercase tracking-tight border border-primary/20 shadow-glow">
                    <span className="material-symbols-outlined text-[16px] font-bold">verified</span>
                    Verificado
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-7xl font-display font-black text-white block tracking-tighter leading-none">{stats.arbolesRescatados}</span>
                <span className="text-[13px] text-primary font-black uppercase tracking-[0.3em] block ml-1">Árboles Rescatados</span>
              </div>
              <p className="text-[13px] text-gray-200 leading-relaxed font-bold tracking-tight">Equivale a la preservación efectiva de biodiversidad local frente a la deforestación industrial.</p>
              <div className="h-2.5 bg-background-dark/80 rounded-full overflow-hidden border border-white/10 shadow-inner">
                <div className="h-full bg-primary shadow-[0_0_20px_#0ff092]" style={{ width: `${Math.min(stats.arbolesRescatados, 100)}% ` }}></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="relative overflow-hidden bg-surface-dark rounded-[28px] border border-white/10 shadow-xl group h-[180px]">
              <div className="absolute inset-0 opacity-90 pointer-events-none">
                <img
                  src="/assets/water_saved_bg.png"
                  alt=""
                  className="w-full h-full object-cover scale-125 transition-transform duration-700 group-hover:scale-150"
                />
                <div className="absolute inset-0 bg-black/30"></div>
              </div>
              <div className="relative z-10 p-6 flex flex-col justify-between h-full bg-black/20">
                <div className="size-11 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shadow-inner border border-blue-500/20">
                  <span className="material-symbols-outlined text-2xl font-bold">water_drop</span>
                </div>
                <div>
                  <p className="text-4xl font-display font-black text-white tracking-tighter">{stats.aguaAhorrada.toLocaleString()}</p>
                  <p className="text-[11px] text-blue-400 font-black uppercase mt-1 tracking-widest leading-tight">Lts Agua</p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden bg-surface-dark rounded-[28px] border border-white/10 shadow-xl group h-[180px]">
              <div className="absolute inset-0 opacity-90 pointer-events-none">
                <img
                  src="/assets/energy_saved_bg.png"
                  alt=""
                  className="w-full h-full object-cover scale-125 transition-transform duration-700 group-hover:scale-150"
                />
                <div className="absolute inset-0 bg-black/30"></div>
              </div>
              <div className="relative z-10 p-6 flex flex-col justify-between h-full bg-black/20">
                <div className="size-11 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center shadow-inner border border-yellow-500/20">
                  <span className="material-symbols-outlined text-2xl font-bold">bolt</span>
                </div>
                <div>
                  <p className="text-4xl font-display font-black text-white tracking-tighter">{stats.energiaAhorrada.toLocaleString()}</p>
                  <p className="text-[11px] text-yellow-500 font-black uppercase mt-1 tracking-widest leading-tight">kWh Energía</p>
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
