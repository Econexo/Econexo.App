// utils/leyRepTargets.ts
// Legal recovery targets per Decreto Supremo.
// Source: DS 12/2021 (envases), DS 8/2021 (neumáticos), DS 10/2021 (RAEE)
// Note: verify against official SMA text before each annual update.

// DS 12/2021 — Envases y Embalajes
// Keys: 'papel' | 'plastico' | 'vidrio' | 'metales'
// Values: required recovery % of kg placed on market
const DS12_TARGETS: Record<number, Record<string, number>> = {
  2023: { papel: 10, plastico: 5,  vidrio: 10, metales: 10 },
  2024: { papel: 18, plastico: 12, vidrio: 15, metales: 18 },
  2025: { papel: 25, plastico: 20, vidrio: 20, metales: 25 },
  2030: { papel: 60, plastico: 55, vidrio: 50, metales: 60 },
};

// DS 8/2021 — Neumáticos
const DS8_TARGETS: Record<number, number> = {
  2022: 5,
  2023: 15,
  2024: 25,
  2025: 35,
  2030: 75,
};

// DS 10/2021 — RAEE (Aparatos Eléctricos y Electrónicos)
const DS10_TARGETS: Record<number, number> = {
  2023: 10,
  2025: 20,
  2030: 50,
};

/**
 * Returns the applicable target % for a given year using step-down interpolation:
 * finds the largest declared year <= requestedYear.
 * Returns 0 if the year is before the first declared year.
 */
function interpolate(targets: Record<number, number>, year: number): number {
  const years = Object.keys(targets).map(Number).sort((a, b) => a - b);
  let applicable = 0;
  for (const y of years) {
    if (y <= year) applicable = targets[y];
  }
  return applicable;
}

export type DS12Material = 'papel' | 'plastico' | 'vidrio' | 'metales';

/** Returns the DS 12 target % for a specific material and year. */
export function getDS12Target(material: DS12Material, year: number): number {
  const years = Object.keys(DS12_TARGETS).map(Number).sort((a, b) => a - b);
  let row: Record<string, number> = {};
  for (const y of years) {
    if (y <= year) row = DS12_TARGETS[y];
  }
  return row[material] ?? 0;
}

/** Returns the DS 8 (Neumáticos) target % for a given year. */
export function getDS8Target(year: number): number {
  return interpolate(DS8_TARGETS, year);
}

/** Returns the DS 10 (RAEE) target % for a given year. */
export function getDS10Target(year: number): number {
  return interpolate(DS10_TARGETS, year);
}
