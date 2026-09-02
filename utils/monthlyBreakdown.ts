// Agregación mensual de residuos recuperados.
// Lógica pura y sin dependencias del DOM para poder testearla.

import { normalizeMaterialType, materialFactors, CO2_PER_TREE } from './materialCalculations';
import { mapToRepCategory, REP_CATEGORY_LABELS } from './materialMapping';
import { isValorized, summarizeByDestination, parseQuantity, type DestinationTotals } from './wasteClassification';
import type { MonthlyMaterialRow } from '../types';

export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Un documento CR tal como llega de Supabase (solo lo que necesitamos). */
export interface CrDoc {
  created_at: string;
  metadata?: { waste_details?: unknown } | null;
}

export interface MonthlyImpact {
  co2: number;      // kg CO2e evitados
  water: number;    // litros ahorrados
  energy: number;   // kWh ahorrados
  trees: number;    // árboles equivalentes
}

export interface MonthlySummary {
  /** Clave 'YYYY-MM' del período. */
  periodKey: string;
  totalKg: number;
  /** Kilos separados por destino. `valorizacion` es la cifra principal. */
  destinations: DestinationTotals;
  materials: MonthlyMaterialRow[];
  impact: MonthlyImpact;
  /** Nº de certificados de recepción que componen el mes. */
  docCount: number;
}

/** Clave 'YYYY-MM' de una fecha ISO, en hora local. */
export function periodKeyOf(isoDate: string): string | null {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function periodLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** waste_details puede venir como array, objeto suelto o nada. */
function itemsOf(doc: CrDoc): any[] {
  const details = doc.metadata?.waste_details;
  if (Array.isArray(details)) return details;
  if (details) return [details];
  return [];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Agrupa los documentos por mes y devuelve, para cada material del mes,
 * los kilos, su participación y el impacto ambiental evitado.
 */
export function buildMonthlyBreakdown(docs: CrDoc[]): Map<string, MonthlySummary> {
  const byPeriod = new Map<string, {
    kg: Record<string, number>;
    // Kilos valorizados por material: solo estos generan impacto evitado.
    valorizedKg: Record<string, number>;
    items: any[];
    docs: Set<number>;
  }>();

  docs.forEach((doc, index) => {
    const key = periodKeyOf(doc.created_at);
    if (!key) return;

    let bucket = byPeriod.get(key);
    if (!bucket) {
      bucket = { kg: {}, valorizedKg: {}, items: [], docs: new Set() };
      byPeriod.set(key, bucket);
    }

    const items = itemsOf(doc);
    if (items.length === 0) return;
    bucket.docs.add(index);

    for (const item of items) {
      const qty = parseQuantity(item?.quantity);
      if (qty <= 0) continue;
      const material = normalizeMaterialType(item);
      bucket.kg[material] = round2((bucket.kg[material] ?? 0) + qty);
      if (isValorized(item)) {
        bucket.valorizedKg[material] = round2((bucket.valorizedKg[material] ?? 0) + qty);
      }
      bucket.items.push(item);
    }
  });

  const result = new Map<string, MonthlySummary>();

  for (const [periodKey, bucket] of byPeriod) {
    const totalKg = round2(Object.values(bucket.kg).reduce((a, b) => a + b, 0));

    const impact: MonthlyImpact = { co2: 0, water: 0, energy: 0, trees: 0 };

    const materials: MonthlyMaterialRow[] = Object.entries(bucket.kg)
      .filter(([, kg]) => kg > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([material, kg]) => {
        const f = materialFactors[material] ?? materialFactors['Otros'];
        // El impacto se acredita solo sobre los kilos valorizados de ese
        // material: lo que se enterró no ahorra agua, energía ni emisiones.
        const valorizado = bucket.valorizedKg[material] ?? 0;
        const co2 = round2(valorizado * f.co2);
        const water = round2(valorizado * f.water);
        const energy = round2(valorizado * f.energy);

        impact.co2 += co2;
        impact.water += water;
        impact.energy += energy;

        const rep = mapToRepCategory(material);

        return {
          material,
          kg,
          share: totalKg > 0 ? round2((kg / totalKg) * 100) : 0,
          co2,
          water,
          energy,
          repCategory: rep ? REP_CATEGORY_LABELS[rep] : null,
        };
      });

    impact.co2 = round2(impact.co2);
    impact.water = round2(impact.water);
    impact.energy = round2(impact.energy);
    impact.trees = Math.round(impact.co2 / CO2_PER_TREE);

    result.set(periodKey, {
      periodKey,
      totalKg,
      destinations: summarizeByDestination(bucket.items),
      materials,
      impact,
      docCount: bucket.docs.size,
    });
  }

  return result;
}

/** Resumen vacío, para meses sin movimientos. */
export function emptySummary(periodKey: string): MonthlySummary {
  return {
    periodKey,
    totalKg: 0,
    destinations: { total: 0, valorizacion: 0, relleno_sanitario: 0, rescon: 0, tasaValorizacion: 0 },
    materials: [],
    impact: { co2: 0, water: 0, energy: 0, trees: 0 },
    docCount: 0,
  };
}

/** Mes anterior a 'YYYY-MM'. */
export function previousPeriod(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Variación porcentual mes contra mes. null si el mes anterior fue 0. */
export function monthOverMonth(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Los `count` períodos que terminan en `periodKey`, del más antiguo al más reciente. */
export function trailingPeriods(periodKey: string, count: number): string[] {
  const out: string[] = [];
  let cursor = periodKey;
  for (let i = 0; i < count; i++) {
    out.unshift(cursor);
    cursor = previousPeriod(cursor);
  }
  return out;
}

/** Filas del desglose a CSV (separador ';' — Excel en es-CL lo abre en columnas). */
export function breakdownToCsv(summary: MonthlySummary): string {
  const head = ['Material', 'Kg recuperados', '% del mes', 'CO2e evitado (kg)', 'Agua ahorrada (L)', 'Energía ahorrada (kWh)', 'Categoría Ley REP'];
  const rows = summary.materials.map(r => [
    r.material,
    r.kg.toFixed(2),
    r.share.toFixed(1),
    r.co2.toFixed(2),
    r.water.toFixed(2),
    r.energy.toFixed(2),
    r.repCategory ?? 'No aplica',
  ]);
  const total = [
    'TOTAL',
    summary.totalKg.toFixed(2),
    '100.0',
    summary.impact.co2.toFixed(2),
    summary.impact.water.toFixed(2),
    summary.impact.energy.toFixed(2),
    '',
  ];
  return [head, ...rows, total]
    .map(cols => cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
}
