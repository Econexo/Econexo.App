import React from 'react';

export interface RepProducerData {
  /** ¿Importa, fabrica o vende bajo marca propia productos envasados? */
  is_priority_producer: boolean;
  /** Kilos de envases puestos en el mercado, por año. */
  market_kg_by_year: Record<string, number>;
}

export const DEFAULT_REP_PRODUCER: RepProducerData = {
  is_priority_producer: false,
  market_kg_by_year: {},
};

interface RepProducerSectionProps {
  data: RepProducerData;
  saving: boolean;
  onChange: (data: RepProducerData) => void;
}

/**
 * Perfil Ley REP de la empresa.
 *
 * Es la respuesta que decide si la Ley REP la alcanza: obliga a quien INTRODUCE
 * productos prioritarios al mercado, no a quien genera residuos. Sin este dato
 * el asistente de declaración no puede pronunciarse sobre REP, y por eso se
 * pregunta aquí en vez de intentar deducirlo de los retiros.
 */
const RepProducerSection: React.FC<RepProducerSectionProps> = ({ data, saving, onChange }) => {
  const year = String(new Date().getFullYear());
  const marketKg = data.market_kg_by_year?.[year];

  const setMarketKg = (raw: string) => {
    const next = { ...(data.market_kg_by_year ?? {}) };
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value) || value < 0) delete next[year];
    else next[year] = value;
    onChange({ ...data, market_kg_by_year: next });
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2 pl-2">
        <h4 className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">
          Perfil Ley REP
        </h4>
        {saving && (
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Guardando…</span>
        )}
      </div>

      <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/80 dark:border-white/10 p-5 space-y-4 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h5 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest">
              ¿Eres productor de productos prioritarios?
            </h5>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-bold leading-snug">
              Marca esto solo si tu empresa <strong>importa, fabrica o vende bajo marca propia</strong>{' '}
              productos envasados. Botar envases no te convierte en productor.
            </p>
          </div>
          <label className="inline-flex items-center cursor-pointer shrink-0 mt-1">
            <input
              type="checkbox"
              checked={data.is_priority_producer}
              onChange={e => onChange({ ...data, is_priority_producer: e.target.checked })}
              className="sr-only peer"
            />
            <div className="relative w-11 h-6 bg-gray-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
          </label>
        </div>

        {data.is_priority_producer ? (
          <>
            <div className="h-px bg-gray-100 dark:bg-white/10" />
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Envases puestos en el mercado en {year}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  placeholder="0"
                  value={marketKg ?? ''}
                  onChange={e => setMarketKg(e.target.value)}
                  className="flex-1 min-w-0 bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-bold text-gray-900 dark:text-white tabular-nums"
                />
                <span className="text-sm font-black text-gray-400 shrink-0">kg</span>
              </div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold leading-relaxed">
                Este dato lo tiene tu empresa: son los kilos de envase que comercializaste, no los
                que retiramos. Bajo 300 kg anuales quedas exento de metas de recuperación, aunque
                mantienes la obligación de registro.
              </p>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-green-50/70 dark:bg-green-900/15 border border-green-200/60 dark:border-green-700/30">
            <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-base shrink-0">
              check_circle
            </span>
            <p className="text-[11px] text-green-900 dark:text-green-200/90 font-medium leading-relaxed">
              Como generadora, la Ley REP no te alcanza. Tus obligaciones se miden por lo que
              generas, en SINADER, y las revisa el asistente de la pantalla Ley REP.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default RepProducerSection;
