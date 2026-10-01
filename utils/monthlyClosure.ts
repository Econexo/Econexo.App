// Cierre mensual: qué kilos y residuos de cada empresa se envían a cada gestor.
// Lógica pura y sin Supabase para poder testearla. Ver
// docs/superpowers/specs/2026-09-30-cierre-mensual-design.md.

import { monthRange, isWithin } from './dateRange';
import { wasteItemsOf, parseQuantity, destinationOf, type WasteDestination } from './wasteClassification';
import { normalizeMaterialType } from './materialCalculations';
import { sumTruncated, truncateTo } from './formatKg';
import type { XlsxSheet, XlsxValue } from './xlsx';
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

/** Residuo que no va al gestor porque en el CT su destino no es valorización. */
export interface ClosureOutside {
  material: string;
  destination: Exclude<WasteDestination, 'valorizacion'>;
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
  /**
   * Lo que la empresa retiró ese mes pero no se envía al gestor (RESCON,
   * relleno). Solo informativo; no suma en `totalKg`. Ausente en cierres viejos.
   */
  outside?: ClosureOutside[];
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

/**
 * Empresas del mes con lo que se envía al gestor.
 *
 * Solo entra lo VALORIZADO: el gestor (GCR) certifica valorización, y lo que el
 * CT marca como RESCON o relleno sanitario se va a otro lado. Si se sumara, el
 * cierre no cuadra con el que devuelve el gestor (pasó con la madera a RESCON).
 * Eso queda aparte en `outside`, para que se vea por qué no está.
 */
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
    outside: Record<string, { material: string; destination: ClosureOutside['destination']; qtys: number[] }>;
    certs: Set<string>;
  }>();

  for (const doc of docs) {
    if (!isWithin(doc.created_at, range)) continue;

    const lines = wasteItemsOf(doc)
      .map(item => ({
        material: normalizeMaterialType(item),
        qty: parseQuantity(item?.quantity),
        destination: destinationOf(item),
      }))
      .filter(l => l.qty > 0);
    if (lines.length === 0) continue;

    const id = companyIdOf(doc);
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = { isManual: !!doc.metadata?.unregistered_client_id, quantities: {}, outside: {}, certs: new Set() };
      buckets.set(id, bucket);
    }
    let sendsSomething = false;
    for (const { material, qty, destination } of lines) {
      if (destination === 'valorizacion') {
        (bucket.quantities[material] ??= []).push(qty);
        sendsSomething = true;
      } else {
        const key = `${destination}|${material}`;
        (bucket.outside[key] ??= { material, destination, qtys: [] }).qtys.push(qty);
      }
    }
    // El CT va al gestor solo si lleva algo valorizado.
    const cert = toTransportLabel(doc.metadata?.cert_number);
    if (cert && sendsSomething) bucket.certs.add(cert);
  }

  const companies: ClosureCompany[] = [];
  for (const [companyId, bucket] of buckets) {
    const info = directory[companyId];
    const materials = Object.entries(bucket.quantities)
      .map(([material, qtys]) => ({ material, kg: sumTruncated(qtys) }))
      .filter(m => m.kg > 0)
      .sort((a, b) => b.kg - a.kg || byText(a.material, b.material));
    const outside = Object.values(bucket.outside)
      .map(o => ({ material: o.material, destination: o.destination, kg: sumTruncated(o.qtys) }))
      .filter(o => o.kg > 0)
      .sort((a, b) => b.kg - a.kg || byText(a.material, b.material));
    // Sin nada valorizado, la empresa no tiene qué mandar al gestor.
    if (materials.length === 0) continue;

    companies.push({
      companyId,
      name: info?.name || UNKNOWN_COMPANY_NAME,
      rut: info?.rut || '',
      isManual: info?.isManual ?? bucket.isManual,
      materials,
      totalKg: sumTruncated(materials.map(m => m.kg)),
      certNumbers: [...bucket.certs].sort(byText),
      ...(outside.length > 0 ? { outside } : {}),
    });
  }

  return companies.sort((a, b) => byText(a.name, b.name));
}

/** Kilos del mes que NO van al gestor, por destino, de todas las empresas. */
export function outsideClosureKg(docs: ClosureDoc[], periodKey: string): Record<ClosureOutside['destination'], number> {
  const [year, month] = periodKey.split('-').map(Number);
  const range = monthRange(year, month - 1);
  const qtys: Record<ClosureOutside['destination'], number[]> = { rescon: [], relleno_sanitario: [] };
  for (const doc of docs) {
    if (!isWithin(doc.created_at, range)) continue;
    for (const item of wasteItemsOf(doc)) {
      const destination = destinationOf(item);
      const qty = parseQuantity(item?.quantity);
      if (destination !== 'valorizacion' && qty > 0) qtys[destination].push(qty);
    }
  }
  return { rescon: sumTruncated(qtys.rescon), relleno_sanitario: sumTruncated(qtys.relleno_sanitario) };
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

// Los nombres los escribe cada cliente: un salto de línea o tabulación dentro
// del nombre descuadra la fila al leerla en Excel.
const cell = (value: string) => value.replace(/[\t\r\n]+/g, ' ').trim();

/** Hoja del Excel (.xlsx) que se envía a un gestor. Kilos como número, truncados. */
export function closureToSheet(
  destinationName: string,
  periodKey: string,
  companies: ClosureCompany[],
): XlsxSheet {
  const rows: XlsxValue[][] = [
    [`Cierre ${periodLabel(periodKey)} — ${cell(destinationName)}`],
    [],
    ['Empresa', 'RUT', 'Residuo', 'Kg', 'N° CT'],
  ];
  const boldRows = [0, 2];

  for (const c of companies) {
    c.materials.forEach((m, i) => {
      rows.push([cell(c.name), cell(c.rut), cell(m.material), truncateTo(m.kg), i === 0 ? c.certNumbers.join(', ') : '']);
    });
    boldRows.push(rows.length);
    rows.push(['', '', `Subtotal ${cell(c.name)}`, truncateTo(c.totalKg), '']);
  }
  boldRows.push(rows.length);
  rows.push(['TOTAL', '', '', closureTotalKg(companies), '']);

  return { name: periodLabel(periodKey), rows, boldRows, colWidths: [42, 14, 30, 10, 40] };
}
