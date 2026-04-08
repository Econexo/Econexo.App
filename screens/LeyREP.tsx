// screens/LeyREP.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { supabase } from '../services/supabase';
import { useToast } from '../components/ui/Toast';
import { mapToRepCategory, REP_CATEGORY_LABELS, RepCategory } from '../utils/materialMapping';
import { getDS12Target, getDS8Target, getDS10Target, DS12Material } from '../utils/leyRepTargets';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComplianceStatus = 'cumpliendo' | 'en_riesgo' | 'incumpliendo' | 'sin_datos';

interface MaterialResult {
  category: NonNullable<RepCategory>;
  label: string;
  kgRecovered: number;
  targetPct: number;
  achievedPct: number | null;
  status: ComplianceStatus;
}

interface BaselineStore {
  ds12_papel: number;
  ds12_plastico: number;
  ds12_vidrio: number;
  ds12_metales: number;
  ds8_neumaticos: number;
  ds10_raee: number;
}

const EMPTY_BASELINE: BaselineStore = {
  ds12_papel: 0,
  ds12_plastico: 0,
  ds12_vidrio: 0,
  ds12_metales: 0,
  ds8_neumaticos: 0,
  ds10_raee: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTargetForCategory(cat: NonNullable<RepCategory>, year: number): number {
  if (cat === 'ds12_papel')     return getDS12Target('papel'    as DS12Material, year);
  if (cat === 'ds12_plastico')  return getDS12Target('plastico' as DS12Material, year);
  if (cat === 'ds12_vidrio')    return getDS12Target('vidrio'   as DS12Material, year);
  if (cat === 'ds12_metales')   return getDS12Target('metales'  as DS12Material, year);
  if (cat === 'ds8_neumaticos') return getDS8Target(year);
  if (cat === 'ds10_raee')      return getDS10Target(year);
  return 0;
}

function computeStatus(achievedPct: number | null, targetPct: number): ComplianceStatus {
  if (achievedPct === null) return 'sin_datos';
  if (achievedPct >= targetPct) return 'cumpliendo';
  if (achievedPct >= targetPct * 0.8) return 'en_riesgo';
  return 'incumpliendo';
}

function baselineKey(userId: string, year: number): string {
  return `eco_ley_rep_baseline_${userId}_${year}`;
}

function loadBaseline(userId: string, year: number): BaselineStore {
  try {
    const raw = localStorage.getItem(baselineKey(userId, year));
    return raw ? { ...EMPTY_BASELINE, ...JSON.parse(raw) } : { ...EMPTY_BASELINE };
  } catch {
    return { ...EMPTY_BASELINE };
  }
}

function saveBaseline(userId: string, year: number, data: BaselineStore): void {
  localStorage.setItem(baselineKey(userId, year), JSON.stringify(data));
}

// ─── Component ────────────────────────────────────────────────────────────────

const LeyREP: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [isLeyRep, setIsLeyRep] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [results, setResults] = useState<MaterialResult[]>([]);
  const [baseline, setBaseline] = useState<BaselineStore>(EMPTY_BASELINE);
  const [baselineDraft, setBaselineDraft] = useState<BaselineStore>(EMPTY_BASELINE);
  const [showBaselineInput, setShowBaselineInput] = useState(false);

  // Load user profile
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/'); return; }
      setUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_ley_rep')
        .eq('id', user.id)
        .single();

      setIsLeyRep(!!profile?.is_ley_rep);
    };
    init();
  }, [navigate]);

  // Load baseline from localStorage when userId or year changes
  useEffect(() => {
    if (!userId) return;
    const stored = loadBaseline(userId, selectedYear);
    setBaseline(stored);
    setBaselineDraft(stored);
  }, [userId, selectedYear]);

  // Fetch CRs and compute results
  const fetchAndCompute = useCallback(async () => {
    if (!userId || isLeyRep === null) return;
    setLoading(true);

    const yearStart = `${selectedYear}-01-01`;
    const yearEnd   = `${selectedYear}-12-31`;

    const { data: docs, error } = await supabase
      .from('documents')
      .select('metadata')
      .eq('user_id', userId)
      .eq('type', 'CR')
      .eq('verified', true)
      .gte('created_at', yearStart)
      .lte('created_at', yearEnd);

    if (error) {
      toast.error('Error al cargar documentos');
      setLoading(false);
      return;
    }

    // Accumulate kg per REP category
    const kgByCategory: Partial<Record<NonNullable<RepCategory>, number>> = {};

    for (const doc of docs ?? []) {
      const items: { waste_type: string; description?: string; quantity: number; unit: string }[] =
        doc.metadata?.waste_details ?? [];

      for (const item of items) {
        const cat = mapToRepCategory(item.waste_type, item.description ?? '');
        if (!cat) continue;
        // Normalize to kg (assume 'kg' unless 'ton' or 'g')
        let kg = Number(item.quantity) || 0;
        const unit = (item.unit ?? '').toLowerCase();
        if (unit === 'ton' || unit === 'tonelada' || unit === 't') kg *= 1000;
        if (unit === 'g' || unit === 'gramo') kg /= 1000;

        kgByCategory[cat] = (kgByCategory[cat] ?? 0) + kg;
      }
    }

    // Build results for all 6 categories
    const allCategories: NonNullable<RepCategory>[] = [
      'ds12_papel', 'ds12_plastico', 'ds12_vidrio', 'ds12_metales',
      'ds8_neumaticos', 'ds10_raee',
    ];

    const computedResults: MaterialResult[] = allCategories.map(cat => {
      const kgRecovered = kgByCategory[cat] ?? 0;
      const targetPct   = getTargetForCategory(cat, selectedYear);
      const baselineKg  = baseline[cat];
      const achievedPct = baselineKg > 0 ? (kgRecovered / baselineKg) * 100 : null;
      const status      = computeStatus(achievedPct, targetPct);

      return {
        category: cat,
        label: REP_CATEGORY_LABELS[cat],
        kgRecovered,
        targetPct,
        achievedPct,
        status,
      };
    });

    setResults(computedResults);
    setLoading(false);
  }, [userId, isLeyRep, selectedYear, baseline, toast]);

  useEffect(() => {
    fetchAndCompute();
  }, [fetchAndCompute]);

  const handleSaveBaseline = () => {
    if (!userId) return;
    saveBaseline(userId, selectedYear, baselineDraft);
    setBaseline(baselineDraft);
    setShowBaselineInput(false);
    toast.success('Baseline guardado');
  };

  // ─── Status config ────────────────────────────────────────────────────────
  const statusConfig: Record<ComplianceStatus, { color: string; icon: string; label: string }> = {
    cumpliendo:   { color: 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', icon: 'check_circle', label: 'Cumpliendo' },
    en_riesgo:    { color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800', icon: 'warning', label: 'En riesgo' },
    incumpliendo: { color: 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', icon: 'cancel', label: 'Incumpliendo' },
    sin_datos:    { color: 'text-gray-400 bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700', icon: 'help', label: 'Sin datos' },
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (isLeyRep === null || loading) {
    return (
      <div className="min-h-screen bg-[#f0f4f0] dark:bg-slate-950 flex items-center justify-center">
        <span className="animate-spin material-symbols-outlined text-primary text-5xl">progress_activity</span>
      </div>
    );
  }

  // ─── Gate: user not declared under Ley REP ────────────────────────────────
  if (!isLeyRep) {
    return (
      <div className="min-h-screen bg-[#f0f4f0] dark:bg-slate-950">
        <Navbar />
        <main className="p-4 md:p-8 max-w-2xl mx-auto pb-32 flex flex-col items-center justify-center min-h-[80vh]">
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/60 dark:border-white/10 rounded-3xl p-8 shadow-xl text-center flex flex-col items-center gap-6">
            <span className="material-symbols-outlined text-6xl text-amber-400">policy</span>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Ley REP</h1>
            <p className="text-gray-600 dark:text-gray-300 text-sm max-w-sm">
              Tu empresa no está declarada bajo la Ley de Responsabilidad Extendida del Productor (Ley 20.920).
              Esta ley aplica a productores e importadores de envases y embalajes, neumáticos y aparatos eléctricos/electrónicos
              que superen ciertos umbrales de volumen anual.
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-xs max-w-sm">
              Si tu empresa corresponde a esta categoría, activa la declaración en tu perfil para acceder
              al seguimiento de cumplimiento.
            </p>
            <button
              onClick={() => navigate('/profile')}
              className="bg-primary text-white font-bold px-6 py-3 rounded-2xl shadow-lg shadow-primary/25 hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">person</span>
              Ir a Perfil
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ─── Helpers for summary badges ───────────────────────────────────────────
  const ds12Results = results.filter(r => r.category.startsWith('ds12_'));
  const ds8Results  = results.filter(r => r.category === 'ds8_neumaticos');
  const ds10Results = results.filter(r => r.category === 'ds10_raee');

  function summaryCategoryStatus(items: MaterialResult[]): ComplianceStatus {
    if (items.every(r => r.status === 'sin_datos')) return 'sin_datos';
    if (items.some(r => r.status === 'incumpliendo')) return 'incumpliendo';
    if (items.some(r => r.status === 'en_riesgo')) return 'en_riesgo';
    if (items.every(r => r.status === 'cumpliendo')) return 'cumpliendo';
    return 'sin_datos';
  }

  // ─── MaterialCard sub-component ───────────────────────────────────────────
  const MaterialCard = ({ result }: { result: MaterialResult }) => {
    const cfg = statusConfig[result.status];
    const barPct = result.achievedPct !== null
      ? Math.min(Math.round(result.achievedPct), 100)
      : 0;
    const targetBarPct = Math.min(result.targetPct, 100);

    return (
      <div className="bg-white/60 dark:bg-slate-800/60 border border-white/60 dark:border-white/10 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="font-bold text-sm text-gray-800 dark:text-gray-100">{result.label}</p>
          <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-xl border ${cfg.color}`}>
            <span className="material-symbols-outlined text-sm filled">{cfg.icon}</span>
            {cfg.label}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Recuperado: <strong className="text-gray-800 dark:text-gray-100">{result.kgRecovered.toLocaleString('es-CL')} kg</strong></span>
          <span>Meta legal: <strong className="text-gray-800 dark:text-gray-100">{result.targetPct}%</strong></span>
        </div>

        {/* Progress bar */}
        <div className="relative h-2.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
          {/* Target marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-400 dark:bg-gray-500 z-10"
            style={{ left: `${targetBarPct}%` }}
          />
          {/* Achievement bar */}
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              result.status === 'cumpliendo'   ? 'bg-green-500' :
              result.status === 'en_riesgo'    ? 'bg-yellow-400' :
              result.status === 'incumpliendo' ? 'bg-red-400' :
              'bg-gray-300 dark:bg-slate-600'
            }`}
            style={{ width: `${barPct}%` }}
          />
        </div>

        {result.achievedPct !== null ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cumplimiento: <strong className={
              result.status === 'cumpliendo' ? 'text-green-600' :
              result.status === 'en_riesgo'  ? 'text-yellow-600' : 'text-red-500'
            }>{result.achievedPct.toFixed(1)}%</strong>
          </p>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">
            Ingresa tu volumen puesto en mercado para calcular el % de cumplimiento
          </p>
        )}
      </div>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="min-h-screen bg-[#f0f4f0] dark:bg-slate-950">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-blob" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-secondary/10 rounded-full blur-3xl animate-blob animation-delay-2000" />
      </div>

      <Navbar />

      <main className="p-4 md:p-8 max-w-3xl mx-auto pb-32">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/30">
              <span className="material-symbols-outlined text-white text-xl">policy</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 dark:text-white">Cumplimiento Ley REP</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">Ley 20.920 — DS 12, DS 8, DS 10</p>
            </div>
          </div>
          {/* Year selector */}
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-2 text-sm font-bold text-gray-700 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* ── Summary card ── */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/60 dark:border-white/10 rounded-3xl p-5 shadow-md mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Resumen General</p>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Envases y Embalajes', status: summaryCategoryStatus(ds12Results), ds: 'DS 12/2021' },
              { label: 'Neumáticos',           status: summaryCategoryStatus(ds8Results),  ds: 'DS 8/2021'  },
              { label: 'RAEE',                 status: summaryCategoryStatus(ds10Results), ds: 'DS 10/2021' },
            ].map(({ label, status, ds }) => {
              const cfg = statusConfig[status];
              return (
                <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${cfg.color}`}>
                  <span className="material-symbols-outlined text-base filled">{cfg.icon}</span>
                  <div>
                    <p>{label}</p>
                    <p className="font-normal opacity-70">{ds} · {cfg.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── DS 12/2021 — Envases y Embalajes ── */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-xl">inventory_2</span>
            <div>
              <h2 className="font-black text-gray-900 dark:text-white text-sm">Envases y Embalajes</h2>
              <p className="text-xs text-gray-400">DS 12/2021</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ds12Results.map(r => <MaterialCard key={r.category} result={r} />)}
          </div>
        </section>

        {/* ── DS 8/2021 — Neumáticos ── */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-xl">tire_repair</span>
            <div>
              <h2 className="font-black text-gray-900 dark:text-white text-sm">Neumáticos</h2>
              <p className="text-xs text-gray-400">DS 8/2021</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {ds8Results.map(r => <MaterialCard key={r.category} result={r} />)}
          </div>
        </section>

        {/* ── DS 10/2021 — RAEE ── */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-xl">devices</span>
            <div>
              <h2 className="font-black text-gray-900 dark:text-white text-sm">RAEE</h2>
              <p className="text-xs text-gray-400">DS 10/2021 — Aparatos Eléctricos y Electrónicos</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {ds10Results.map(r => <MaterialCard key={r.category} result={r} />)}
          </div>
        </section>

        {/* ── Baseline Input ── */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/60 dark:border-white/10 rounded-3xl p-5 shadow-md">
          <button
            onClick={() => setShowBaselineInput(prev => !prev)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">edit_note</span>
              <div className="text-left">
                <p className="font-bold text-sm text-gray-800 dark:text-gray-100">Volumen puesto en mercado</p>
                <p className="text-xs text-gray-400">Necesario para calcular % de cumplimiento</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-gray-400 text-xl">
              {showBaselineInput ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {showBaselineInput && (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Ingresa los kg anuales que tu empresa puso en el mercado en {selectedYear} por categoría.
                Este dato figura en tu declaración formal ante la SMA.
              </p>

              {/* DS 12 inputs */}
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Envases y Embalajes (DS 12)</p>
              {(['ds12_papel', 'ds12_plastico', 'ds12_vidrio', 'ds12_metales'] as const).map(cat => (
                <div key={cat} className="flex flex-col xs:flex-row xs:items-center gap-1 xs:gap-3">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 xs:text-sm xs:text-gray-600 xs:dark:text-gray-300 xs:w-28 xs:shrink-0">
                    {REP_CATEGORY_LABELS[cat]}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={baselineDraft[cat] || ''}
                    onChange={e => setBaselineDraft(prev => ({ ...prev, [cat]: Number(e.target.value) }))}
                    placeholder="0 kg"
                    className="flex-1 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-gray-800 dark:text-gray-100"
                  />
                </div>
              ))}

              {/* DS 8 input */}
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-1">Neumáticos (DS 8)</p>
              <div className="flex flex-col xs:flex-row xs:items-center gap-1 xs:gap-3">
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 xs:text-sm xs:text-gray-600 xs:dark:text-gray-300 xs:w-28 xs:shrink-0">Neumáticos</label>
                <input
                  type="number"
                  min="0"
                  value={baselineDraft.ds8_neumaticos || ''}
                  onChange={e => setBaselineDraft(prev => ({ ...prev, ds8_neumaticos: Number(e.target.value) }))}
                  placeholder="0 kg"
                  className="flex-1 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-gray-800 dark:text-gray-100"
                />
              </div>

              {/* DS 10 input */}
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-1">RAEE (DS 10)</p>
              <div className="flex flex-col xs:flex-row xs:items-center gap-1 xs:gap-3">
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 xs:text-sm xs:text-gray-600 xs:dark:text-gray-300 xs:w-28 xs:shrink-0">RAEE</label>
                <input
                  type="number"
                  min="0"
                  value={baselineDraft.ds10_raee || ''}
                  onChange={e => setBaselineDraft(prev => ({ ...prev, ds10_raee: Number(e.target.value) }))}
                  placeholder="0 kg"
                  className="flex-1 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-gray-800 dark:text-gray-100"
                />
              </div>

              <button
                onClick={handleSaveBaseline}
                className="self-end bg-primary text-white font-bold px-5 py-2.5 rounded-2xl shadow-md shadow-primary/25 hover:opacity-90 transition-opacity text-sm flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">save</span>
                Guardar baseline
              </button>
            </div>
          )}
        </div>

      </main>
    </div>
  );
};

export default LeyREP;
