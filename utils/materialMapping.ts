// utils/materialMapping.ts
// Maps normalized material names (from CR waste_details) to Ley REP categories.
// Uses the same normalization logic as materialCalculations.ts (lowercase + NFD).

export type RepCategory =
  | 'ds12_papel'
  | 'ds12_plastico'
  | 'ds12_vidrio'
  | 'ds12_metales'
  | 'ds8_neumaticos'
  | 'ds10_raee'
  | null; // material does not fall under any covered REP category

/**
 * Given a waste_type string and optional description from a CR waste item,
 * returns the corresponding Ley REP category or null if not covered.
 */
export function mapToRepCategory(wasteType: string, description = ''): RepCategory {
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const combined = normalize(`${wasteType} ${description}`);

  // DS 10/2021 — RAEE (check before metales to avoid false positives)
  if (
    combined.includes('raee') ||
    combined.includes('electr') ||
    combined.includes('comput') ||
    combined.includes('aparato')
  ) return 'ds10_raee';

  // DS 8/2021 — Neumáticos
  if (
    combined.includes('neumat') ||
    combined.includes('cauch') ||
    combined.includes('goma')
  ) return 'ds8_neumaticos';

  // DS 12/2021 — Plástico. Cubre la categoría genérica y las resinas por
  // separado (PET, HDPE, Film, PP), que desde ahora se contabilizan aparte.
  if (
    combined.includes('plast') ||
    /(^|[^a-z0-9])pet([^a-z0-9]|$)/.test(combined) ||
    combined.includes('hdpe') ||
    combined.includes('pead') ||
    combined.includes('ldpe') ||
    combined.includes('pebd') ||
    combined.includes('film') ||
    combined.includes('poliet') ||
    combined.includes('poliprop') ||
    /(^|[^a-z0-9])pp([^a-z0-9]|$)/.test(combined) ||
    /(^|[^a-z0-9])ps([^a-z0-9]|$)/.test(combined)
  ) return 'ds12_plastico';

  // DS 12/2021 — Papel y cartón, juntos o por separado.
  if (combined.includes('papel') || combined.includes('cart') || combined.includes('corrugado')) return 'ds12_papel';

  // DS 12/2021 — Vidrio
  if (combined.includes('vidr') || combined.includes('cristal')) return 'ds12_vidrio';

  // DS 12/2021 — Metales (aluminio included)
  if (
    combined.includes('metal') ||
    combined.includes('alumin') ||
    combined.includes('acer') ||
    combined.includes('cobr') ||
    combined.includes('chatarra') ||
    combined.includes('lata')
  ) return 'ds12_metales';

  return null;
}

/** Human-readable label per REP category */
export const REP_CATEGORY_LABELS: Record<NonNullable<RepCategory>, string> = {
  ds12_papel:      'Papel/Cartón',
  ds12_plastico:   'Plástico',
  ds12_vidrio:     'Vidrio',
  ds12_metales:    'Metales',
  ds8_neumaticos:  'Neumáticos',
  ds10_raee:       'RAEE',
};
