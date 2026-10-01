// Cierre mensual: qué kilos y residuos de cada empresa se envían a cada gestor.
// Lógica pura y sin Supabase para poder testearla. Ver
// docs/superpowers/specs/2026-09-30-cierre-mensual-design.md.

import { monthRange, isWithin } from './dateRange';
import { wasteItemsOf, parseQuantity } from './wasteClassification';
import { normalizeMaterialType } from './materialCalculations';
import { sumTruncated, formatKg } from './formatKg';
import { toTransportLabel } from './documentTypes';
import { periodLabel } from './monthlyBreakdown';

/** Un retiro tal como lo carga el Panel mensual. */
export interface ClosureDoc {
  user_id: string;
  created_at: string;
  metadata?: {
    waste_details?: unknown;
    cert_number?: string;
    unregistered_client_id?: string;
  } | null;
}

export interface CompanyInfo {
  name: string;
  rut: string;
  isManual: boolean;
}

export interface ClosureMaterial {
  material: string;
  /** Truncado a 1 decimal. */
  kg: number;
}

export interface ClosureCompany {
  /** id del perfil, o id del documento UNREGISTERED_CLIENT si es manual. */
  companyId: string;
  name: string;
  rut: string;
  isManual: boolean;
  materials: ClosureMaterial[];
  /** Suma de las filas truncadas. */
  totalKg: number;
  certNumbers: string[];
}

/** Fila de `monthly_closures`. */
export interface StoredClosure {
  id: string;
  period: string;
  destination_id: string;
  destination_name: string;
  companies: ClosureCompany[];
  total_kg: number;
  fingerprint: string;
  closed_by: string | null;
  closed_at: string;
}

/** companyId → id del gestor, o null para «No incluir». */
export type Assignment = Record<string, string | null>;

export const UNKNOWN_COMPANY_NAME = 'Empresa sin ficha';

/**
 * Los retiros de clientes manuales quedan a nombre del operario que los emitió;
 * la empresa real está en `unregistered_client_id`.
 */
export const companyIdOf = (doc: ClosureDoc): string =>
  doc.metadata?.unregistered_client_id || doc.user_id;

const byText = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });

export function buildClosureCompanies(
  docs: ClosureDoc[],
  directory: Record<string, CompanyInfo>,
  periodKey: string,
): ClosureCompany[] {
  const [year, month] = periodKey.split('-').map(Number);
  const range = monthRange(year, month - 1);

  const buckets = new Map<string, {
    isManual: boolean;
    // Cantidades por material, sin sumar: se truncan una a una, como en el CT.
    quantities: Record<string, number[]>;
    certs: Set<string>;
  }>();

  for (const doc of docs) {
    if (!isWithin(doc.created_at, range)) continue;

    const lines = wasteItemsOf(doc)
      .map(item => ({ material: normalizeMaterialType(item), qty: parseQuantity(item?.quantity) }))
      .filter(l => l.qty > 0);
    if (lines.length === 0) continue;

    const id = companyIdOf(doc);
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = { isManual: !!doc.metadata?.unregistered_client_id, quantities: {}, certs: new Set() };
      buckets.set(id, bucket);
    }
    for (const { material, qty } of lines) {
      (bucket.quantities[material] ??= []).push(qty);
    }
    const cert = toTransportLabel(doc.metadata?.cert_number);
    if (cert) bucket.certs.add(cert);
  }

  const companies: ClosureCompany[] = [];
  for (const [companyId, bucket] of buckets) {
    const info = directory[companyId];
    const materials = Object.entries(bucket.quantities)
      .map(([material, qtys]) => ({ material, kg: sumTruncated(qtys) }))
      .filter(m => m.kg > 0)
      .sort((a, b) => b.kg - a.kg || byText(a.material, b.material));
    if (materials.length === 0) continue;

    companies.push({
      companyId,
      name: info?.name || UNKNOWN_COMPANY_NAME,
      rut: info?.rut || '',
      isManual: info?.isManual ?? bucket.isManual,
      materials,
      totalKg: sumTruncated(materials.map(m => m.kg)),
      certNumbers: [...bucket.certs].sort(byText),
    });
  }

  return companies.sort((a, b) => byText(a.name, b.name));
}

export function groupByDestination(
  companies: ClosureCompany[],
  assignment: Assignment,
): Map<string, ClosureCompany[]> {
  const groups = new Map<string, ClosureCompany[]>();
  for (const company of companies) {
    const dest = assignment[company.companyId];
    if (!dest) continue;
    const list = groups.get(dest) ?? [];
    list.push(company);
    groups.set(dest, list);
  }
  return groups;
}

/**
 * Gestor sugerido para cada empresa. Si el mes ya se cerró, manda ese cierre:
 * lo que quedó fuera sigue fuera. Si no, el del cierre anterior más reciente en
 * que aparece la empresa, siempre que ese gestor siga activo.
 */
export function defaultAssignment(
  companies: ClosureCompany[],
  closures: StoredClosure[],
  activeDestinationIds: string[],
  periodKey: string,
): Assignment {
  const active = new Set(activeDestinationIds);
  const thisMonth = closures.filter(c => c.period === periodKey);
  const ordered = (thisMonth.length > 0 ? thisMonth : closures.filter(c => c.period < periodKey))
    .sort((a, b) => b.period.localeCompare(a.period) || b.closed_at.localeCompare(a.closed_at));

  const out: Assignment = {};
  for (const company of companies) {
    const last = ordered.find(c => c.companies.some(x => x.companyId === company.companyId));
    out[company.companyId] = last && active.has(last.destination_id) ? last.destination_id : null;
  }
  return out;
}

/** Gestores que tenían cierre en el período y ya no reciben ninguna empresa. */
export function staleDestinationIds(
  closures: StoredClosure[],
  periodKey: string,
  keepIds: string[],
): string[] {
  const keep = new Set(keepIds);
  return closures
    .filter(c => c.period === periodKey && !keep.has(c.destination_id))
    .map(c => c.destination_id);
}

/** Huella estable del mes: cambia si cambia un kilo, un residuo o un CT. */
export function snapshotFingerprint(companies: ClosureCompany[]): string {
  const canonical = [...companies]
    .sort((a, b) => a.companyId.localeCompare(b.companyId))
    .map(c => [
      c.companyId,
      [...c.materials].sort((a, b) => a.material.localeCompare(b.material)).map(m => [m.material, m.kg]),
      [...c.certNumbers].sort(),
    ]);
  return JSON.stringify(canonical);
}

export function closureTotalKg(companies: ClosureCompany[]): number {
  return sumTruncated(companies.map(c => c.totalKg));
}

// Los nombres los escribe cada cliente y el archivo lo abre el gestor en Excel:
// sin esto, un nombre que empiece con «=» se ejecuta como fórmula, y una
// comilla doble descuadra las columnas.
const cell = (value: string) => {
  const clean = value.replace(/[\t\r\n]+/g, ' ').replace(/"/g, "'").trim();
  return /^[=+\-@]/.test(clean) ? `'${clean}` : clean;
};

/** Contenido del Excel (TSV) que se envía a un gestor. */
export function closureToTsv(
  destinationName: string,
  periodKey: string,
  companies: ClosureCompany[],
): string {
  const rows: string[][] = [
    [`Cierre ${periodLabel(periodKey)} — ${destinationName}`],
    [],
    ['Empresa', 'RUT', 'Residuo', 'Kg', 'N° CT'],
  ];

  for (const c of companies) {
    c.materials.forEach((m, i) => {
      rows.push([c.name, c.rut, m.material, formatKg(m.kg), i === 0 ? c.certNumbers.join(', ') : '']);
    });
    rows.push(['', '', `Subtotal ${c.name}`, formatKg(c.totalKg), '']);
  }
  rows.push(['TOTAL', '', '', formatKg(closureTotalKg(companies)), '']);

  return rows.map(r => r.map(v => cell(String(v))).join('\t')).join('\n');
}
