import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useToast } from '../components/ui/Toast';
import { jsPDF } from 'jspdf';

// Emission factors — Chile MMA/MAPS 2024
// kgCO2e per unit
const FACTORS = {
  electricity:  0.299,   // kgCO2e/kWh (SEN grid factor Chile 2023)
  naturalGas:   2.04,    // kgCO2e/m³
  lpg:          1.51,    // kgCO2e/kg
  diesel:       2.68,    // kgCO2e/litre
  gasoline:     2.31,    // kgCO2e/litre
  carKm:        0.21,    // kgCO2e/km (avg car)
  truckKm:      0.62,    // kgCO2e/km (heavy truck)
  flightShort:  255,     // kgCO2e/flight (< 1000km, economy)
  flightLong:   995,     // kgCO2e/flight (> 1000km, economy)
  waste:        0.5,     // kgCO2e/kg residuos a vertedero
};

interface Inputs {
  electricity: string;
  naturalGas: string;
  lpg: string;
  diesel: string;
  gasoline: string;
  carKm: string;
  truckKm: string;
  flightShort: string;
  flightLong: string;
  waste: string;
}

const EMPTY: Inputs = {
  electricity: '', naturalGas: '', lpg: '', diesel: '', gasoline: '',
  carKm: '', truckKm: '', flightShort: '', flightLong: '', waste: '',
};

const CATEGORIES = [
  {
    id: 'energy',
    label: 'Energía',
    icon: 'bolt',
    color: 'bg-yellow-500',
    colorLight: 'bg-yellow-50 text-yellow-600 border-yellow-100',
    fields: [
      { key: 'electricity', label: 'Electricidad', unit: 'kWh/mes', placeholder: 'ej: 5000' },
      { key: 'naturalGas',  label: 'Gas natural',  unit: 'm³/mes', placeholder: 'ej: 200'  },
      { key: 'lpg',         label: 'Gas licuado (GLP)', unit: 'kg/mes', placeholder: 'ej: 50' },
    ],
  },
  {
    id: 'fuel',
    label: 'Combustibles',
    icon: 'local_gas_station',
    color: 'bg-orange-500',
    colorLight: 'bg-orange-50 text-orange-600 border-orange-100',
    fields: [
      { key: 'diesel',    label: 'Diésel',   unit: 'litros/mes', placeholder: 'ej: 300' },
      { key: 'gasoline',  label: 'Gasolina', unit: 'litros/mes', placeholder: 'ej: 100' },
    ],
  },
  {
    id: 'transport',
    label: 'Transporte',
    icon: 'commute',
    color: 'bg-blue-500',
    colorLight: 'bg-blue-50 text-blue-600 border-blue-100',
    fields: [
      { key: 'carKm',      label: 'Vehículos livianos', unit: 'km/mes',    placeholder: 'ej: 2000' },
      { key: 'truckKm',    label: 'Camiones / carga',   unit: 'km/mes',    placeholder: 'ej: 500'  },
      { key: 'flightShort',label: 'Vuelos cortos (<1000km)', unit: 'vuelos/mes', placeholder: 'ej: 2' },
      { key: 'flightLong', label: 'Vuelos largos (>1000km)', unit: 'vuelos/mes', placeholder: 'ej: 1' },
    ],
  },
  {
    id: 'waste',
    label: 'Residuos',
    icon: 'delete',
    color: 'bg-red-500',
    colorLight: 'bg-red-50 text-red-600 border-red-100',
    fields: [
      { key: 'waste', label: 'Residuos a vertedero', unit: 'kg/mes', placeholder: 'ej: 500' },
    ],
  },
];

const CarbonCalculator: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [inputs, setInputs] = useState<Inputs>(EMPTY);
  const [calculated, setCalculated] = useState(false);
  const [activeCategory, setActiveCategory] = useState('energy');

  const n = (k: keyof Inputs) => Number(inputs[k]) || 0;

  const results = {
    electricity: n('electricity') * FACTORS.electricity / 1000,
    naturalGas:  n('naturalGas')  * FACTORS.naturalGas  / 1000,
    lpg:         n('lpg')         * FACTORS.lpg          / 1000,
    diesel:      n('diesel')      * FACTORS.diesel       / 1000,
    gasoline:    n('gasoline')    * FACTORS.gasoline     / 1000,
    carKm:       n('carKm')       * FACTORS.carKm        / 1000,
    truckKm:     n('truckKm')     * FACTORS.truckKm      / 1000,
    flightShort: n('flightShort') * FACTORS.flightShort  / 1000,
    flightLong:  n('flightLong')  * FACTORS.flightLong   / 1000,
    waste:       n('waste')       * FACTORS.waste        / 1000,
  };

  const categoryTotals = {
    energy:    results.electricity + results.naturalGas + results.lpg,
    fuel:      results.diesel + results.gasoline,
    transport: results.carKm + results.truckKm + results.flightShort + results.flightLong,
    waste:     results.waste,
  };

  const total = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  const handleCalculate = () => {
    const hasAny = Object.values(inputs).some(v => v !== '');
    if (!hasAny) { toast.warning('Ingresa al menos un valor para calcular.'); return; }
    setCalculated(true);
    setTimeout(() => document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const green: [number, number, number] = [50, 97, 5];
    doc.setFillColor(...green);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('EcoNexo — Calculadora de Huella de Carbono', 14, 11);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Generado el ${new Date().toLocaleDateString('es-CL')}`, 14, 22);

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(`Huella Total: ${total.toFixed(2)} ton CO₂e/mes`, 14, 40);

    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    const lines = [
      `Energía: ${categoryTotals.energy.toFixed(3)} ton CO₂e`,
      `Combustibles: ${categoryTotals.fuel.toFixed(3)} ton CO₂e`,
      `Transporte: ${categoryTotals.transport.toFixed(3)} ton CO₂e`,
      `Residuos: ${categoryTotals.waste.toFixed(3)} ton CO₂e`,
    ];
    lines.forEach((l, i) => doc.text(l, 14, 52 + i * 8));

    doc.setFillColor(...green);
    doc.rect(0, 282, 210, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text('EcoNexo SpA — econexo.cl', 14, 291);
    doc.save(`EcoNexo_HuellaCarbono_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF exportado');
  };

  const getBenchmark = () => {
    if (total === 0) return null;
    if (total < 1)  return { label: 'Muy baja', color: 'text-primary', icon: 'eco' };
    if (total < 5)  return { label: 'Baja',     color: 'text-green-500', icon: 'thumb_up' };
    if (total < 15) return { label: 'Media',    color: 'text-yellow-500', icon: 'warning' };
    if (total < 30) return { label: 'Alta',     color: 'text-orange-500', icon: 'priority_high' };
    return             { label: 'Muy alta',     color: 'text-red-500',    icon: 'dangerous' };
  };

  const benchmark = getBenchmark();

  return (
    <div className="relative font-display bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-8 overflow-hidden">
      {/* Blobs */}
      <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-[20%] right-[-15%] w-[350px] h-[350px] bg-yellow-400/10 rounded-full blur-[80px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-5 py-5 border-b border-white/40 dark:border-slate-700/40 shadow-sm">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center rounded-full bg-white/50 dark:bg-slate-700/50 border border-white/40 dark:border-slate-600/40 shadow-sm transition-all active:scale-90">
          <span className="material-symbols-outlined text-gray-700 dark:text-gray-300 text-[22px]">arrow_back</span>
        </button>
        <div className="text-center">
          <h1 className="text-lg font-display font-black text-gray-900 dark:text-white">Huella de Carbono</h1>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Calculadora mensual</p>
        </div>
        {calculated ? (
          <button onClick={handleExportPDF} className="size-10 flex items-center justify-center rounded-full bg-primary/10 border border-primary/20 shadow-sm active:scale-90">
            <span className="material-symbols-outlined text-primary text-[22px]">picture_as_pdf</span>
          </button>
        ) : <div className="size-10" />}
      </header>

      <main className="p-4 space-y-6 relative z-10">
        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                activeCategory === cat.id
                  ? `${cat.color} text-white border-transparent shadow-md`
                  : 'bg-white/60 dark:bg-slate-800/60 text-gray-500 dark:text-gray-400 border-white/60 dark:border-slate-600/50'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Active category inputs */}
        {CATEGORIES.map(cat => cat.id === activeCategory && (
          <section key={cat.id} className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[28px] border border-white/80 dark:border-slate-600/50 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className={`size-10 rounded-xl flex items-center justify-center border ${cat.colorLight}`}>
                <span className="material-symbols-outlined text-xl">{cat.icon}</span>
              </div>
              <h3 className="text-sm font-black text-gray-900 dark:text-white">{cat.label}</h3>
            </div>
            {cat.fields.map(field => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  {field.label}
                </label>
                <div className="flex items-center bg-white/50 dark:bg-slate-700/50 border border-white/60 dark:border-slate-600/50 rounded-2xl px-4 h-12 focus-within:border-primary/40 transition-all">
                  <input
                    type="number"
                    min="0"
                    value={inputs[field.key as keyof Inputs]}
                    onChange={e => setInputs(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-slate-600"
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-2">{field.unit}</span>
                </div>
              </div>
            ))}
          </section>
        ))}

        {/* Calculate button */}
        <button
          onClick={handleCalculate}
          className="w-full h-14 bg-primary text-white rounded-[22px] font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg shadow-primary/20"
        >
          <span className="material-symbols-outlined">calculate</span>
          Calcular huella
        </button>

        {/* Results */}
        {calculated && (
          <section id="results-section" className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em] px-2">Resultado</h3>

            {/* Total card */}
            <div className="bg-primary rounded-[28px] p-6 text-white space-y-2 shadow-lg shadow-primary/20">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70">Huella mensual total</p>
              <div className="flex items-baseline gap-2">
                <span className="text-6xl font-display font-black tracking-tighter">{total.toFixed(2)}</span>
                <span className="text-lg font-black text-white/70">ton CO₂e</span>
              </div>
              {benchmark && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="material-symbols-outlined text-white/80 text-lg">{benchmark.icon}</span>
                  <span className="text-sm font-black text-white/90">Nivel: {benchmark.label}</span>
                </div>
              )}
              <p className="text-xs text-white/60 font-bold">≈ {(total * 12).toFixed(1)} ton CO₂e/año</p>
            </div>

            {/* Category breakdown */}
            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[28px] border border-white/80 dark:border-slate-600/50 shadow-sm p-6 space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">Desglose por categoría</h4>
              {CATEGORIES.map(cat => {
                const val = categoryTotals[cat.id as keyof typeof categoryTotals];
                const pct = total > 0 ? (val / total) * 100 : 0;
                return (
                  <div key={cat.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] text-gray-500">{cat.icon}</span>
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{cat.label}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-gray-900 dark:text-white">{val.toFixed(3)}</span>
                        <span className="text-[10px] text-gray-400 ml-1">ton</span>
                        <span className="text-[10px] text-primary font-black ml-2">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/70 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recommendations */}
            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[28px] border border-white/80 dark:border-slate-600/50 shadow-sm p-6 space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">Recomendaciones</h4>
              {categoryTotals.energy > 1 && (
                <div className="flex gap-3 items-start">
                  <div className="size-8 rounded-xl bg-yellow-50 text-yellow-500 flex items-center justify-center border border-yellow-100 flex-shrink-0">
                    <span className="material-symbols-outlined text-sm">lightbulb</span>
                  </div>
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-400 leading-relaxed">Considera migrar a energía solar o tarifas verdes — la electricidad representa una parte significativa de tu huella.</p>
                </div>
              )}
              {categoryTotals.transport > 1 && (
                <div className="flex gap-3 items-start">
                  <div className="size-8 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-100 flex-shrink-0">
                    <span className="material-symbols-outlined text-sm">electric_car</span>
                  </div>
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-400 leading-relaxed">Evalúa electrificar tu flota o consolidar viajes. Los vuelos y camiones son las fuentes más intensivas.</p>
                </div>
              )}
              {categoryTotals.waste > 0.5 && (
                <div className="flex gap-3 items-start">
                  <div className="size-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center border border-red-100 flex-shrink-0">
                    <span className="material-symbols-outlined text-sm">recycling</span>
                  </div>
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-400 leading-relaxed">Aumentar el reciclaje y compostaje puede reducir significativamente las emisiones de residuos a vertedero.</p>
                </div>
              )}
              {total < 2 && (
                <div className="flex gap-3 items-start">
                  <div className="size-8 rounded-xl bg-green-50 text-primary flex items-center justify-center border border-green-100 flex-shrink-0">
                    <span className="material-symbols-outlined text-sm filled">verified</span>
                  </div>
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-400 leading-relaxed">¡Tu huella es muy baja! Sigue así y considera compensar el resto con proyectos de reforestación.</p>
                </div>
              )}
            </div>

            {/* Reset */}
            <button
              onClick={() => { setInputs(EMPTY); setCalculated(false); }}
              className="w-full h-12 bg-white/60 dark:bg-slate-800/60 border border-white/60 dark:border-slate-600/50 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition-all"
            >
              Nuevo cálculo
            </button>
          </section>
        )}
      </main>

      <Navbar />
    </div>
  );
};

export default CarbonCalculator;
