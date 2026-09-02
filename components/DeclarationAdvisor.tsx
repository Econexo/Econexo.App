import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { evaluateDeclarations, type Verdict } from '../utils/declarationAdvisor';
import { wasteItemsOf } from '../utils/wasteClassification';

interface DeclarationAdvisorProps {
  /** Año a evaluar. Por defecto, el actual. */
  year?: number;
}

const VERDICT_STYLE: Record<Verdict, {
  label: string; icon: string; chip: string; bar: string;
}> = {
  corresponde: {
    label: 'Corresponde revisar',
    icon: 'flag',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  cerca: {
    label: 'Cerca del umbral',
    icon: 'trending_up',
    chip: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    bar: 'bg-blue-500',
  },
  no_corresponde: {
    label: 'Bajo el umbral',
    icon: 'check_circle',
    chip: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    bar: 'bg-green-500',
  },
  sin_datos: {
    label: 'Sin movimientos',
    icon: 'remove',
    chip: 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-gray-400',
    bar: 'bg-gray-300',
  },
};

/**
 * Revisa los residuos del año y señala qué declaraciones conviene mirar en
 * RETC / Ventanilla Única, SINADER y SIDREP.
 *
 * Es orientación, no asesoría: la app solo conoce lo que EcoNexo gestionó, y la
 * obligación REP se mide sobre lo que la empresa pone en el mercado. Por eso
 * cada tarjeta muestra el umbral aplicado y en qué se apoya.
 */
const DeclarationAdvisor: React.FC<DeclarationAdvisorProps> = ({ year }) => {
  const targetYear = year ?? new Date().getFullYear();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: docs } = await supabase
          .from('documents')
          .select('created_at, metadata')
          .eq('user_id', user.id)
          .in('type', ['CR', 'COMMUNITY_CR'])
          .eq('verified', true);

        if (cancelled) return;

        const delAnio = (docs ?? []).filter(
          (d: any) => new Date(d.created_at).getFullYear() === targetYear,
        );
        setItems(delAnio.flatMap(wasteItemsOf));
      } catch (err) {
        console.error('Error cargando el asistente de declaración:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [targetYear]);

  const summary = useMemo(
    () => evaluateDeclarations({ items, year: targetYear }),
    [items, targetYear],
  );

  if (loading) {
    return (
      <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-[28px] border border-white/80 dark:border-white/10 p-8 flex items-center justify-center">
        <div className="size-8 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <section className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-[28px] border border-white/80 dark:border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] overflow-hidden">
      {/* Cabecera */}
      <div className="p-6 pb-4 flex items-start gap-4">
        <div className="size-11 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
          <span className="material-symbols-outlined">assignment_turned_in</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-display font-black text-gray-900 dark:text-white tracking-tight leading-tight">
            ¿Debo declarar este año?
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-bold mt-0.5">
            RETC · Ventanilla Única · SINADER · SIDREP — {targetYear}
          </p>
        </div>
        {summary.actionableCount > 0 && (
          <span className="shrink-0 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-black uppercase tracking-wider">
            {summary.actionableCount} por revisar
          </span>
        )}
      </div>

      {/* Hallazgos */}
      <div className="px-6 pb-2 space-y-2.5">
        {summary.findings.map(f => {
          const style = VERDICT_STYLE[f.verdict];
          const isOpen = expanded === f.id;
          const pct = f.thresholdKg ? Math.min(100, f.progress) : 0;

          return (
            <div
              key={f.id}
              className="rounded-2xl border border-white/70 dark:border-white/10 bg-white/60 dark:bg-slate-800/50 overflow-hidden"
            >
              <button
                onClick={() => setExpanded(isOpen ? null : f.id)}
                aria-expanded={isOpen}
                className="w-full text-left p-4 space-y-2"
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className={`material-symbols-outlined text-lg shrink-0 ${f.verdict === 'corresponde' ? 'text-amber-600' : f.verdict === 'cerca' ? 'text-blue-600' : 'text-gray-400'}`}>
                    {style.icon}
                  </span>
                  <span className="text-sm font-black text-gray-900 dark:text-white flex-1 min-w-0">
                    {f.title}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 ${style.chip}`}>
                    {style.label}
                  </span>
                  <span
                    className="material-symbols-outlined text-gray-300 text-lg shrink-0 transition-transform"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                  >
                    expand_more
                  </span>
                </div>

                <p className="text-[11px] text-gray-600 dark:text-gray-300 font-bold leading-snug">
                  {f.summary}
                </p>

                {/* Avance hacia el umbral, cuando la regla tiene uno */}
                {f.thresholdKg !== null && f.measuredKg > 0 && (
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-700 ease-out ${style.bar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-black tabular-nums text-gray-400 shrink-0">
                      {f.progress}% de {f.thresholdKg} kg
                    </span>
                  </div>
                )}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-3 animate-in fade-in duration-200">
                  <div className="rounded-xl bg-white/80 dark:bg-slate-900/60 border border-white/80 dark:border-white/10 p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">
                      Qué hacer
                    </p>
                    <p className="text-xs text-gray-700 dark:text-gray-200 font-medium leading-relaxed">
                      {f.action}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50/80 dark:bg-slate-900/40 border border-gray-100 dark:border-white/5 p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">
                      En qué se basa · {f.systemLabel}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
                      {f.basis}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Advertencia de alcance. Va siempre visible, no escondida en un modal. */}
      <div className="m-6 mt-3 p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-900/15 border border-amber-200/60 dark:border-amber-700/30 flex gap-2.5">
        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-base shrink-0">info</span>
        <p className="text-[11px] text-amber-900 dark:text-amber-200/90 font-medium leading-relaxed">
          Esto es <strong className="font-black">orientación, no asesoría legal</strong>. EcoNexo solo
          conoce los kilos que retiró y gestionó, mientras que la obligación REP se mide sobre lo que
          tu empresa <strong className="font-black">pone en el mercado</strong>. Trata estas cifras como
          un piso, no como el dato definitivo, y confirma los umbrales vigentes con la autoridad antes
          de declarar.
        </p>
      </div>
    </section>
  );
};

export default DeclarationAdvisor;
