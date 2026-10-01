// Cierre mensual: qué kilos y residuos de cada empresa se envían a cada gestor.
// Lógica pura y sin Supabase para poder testearla. Ver
// docs/superpowers/specs/2026-09-30-cierre-mensual-design.md.

import { monthRange, isWithin } from './dateRange';
import { wasteItemsOf, parseQuantity, destinationOf, type WasteDestination } from './wasteClassification';
import { normalizeMaterialType } from './materialCalculations';
import { sumTruncated, truncateTo, formatKg } from './formatKg';
import type { XlsxCell, XlsxSheet, XlsxStyle } from './xlsx';
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

// Colores del Excel, los mismos del PDF del cierre.
const GREEN = '326105';
const GREEN_SOFT = 'EBF2E6';
const COMPANY_BG = 'F7FAF5';
const LINE = 'C9D6C0';
const GREY = '6B7280';
const KG_FORMAT = '#,##0.0';

/**
 * Hoja del Excel (.xlsx) que se envía a un gestor.
 *
 * Empresa, RUT y N° CT van en una celda combinada por empresa, centrada a lo
 * alto de sus residuos, para no repetir el nombre en cada fila. Kilos como
 * número, truncados.
 */
export function closureToSheet(
  destinationName: string,
  periodKey: string,
  companies: ClosureCompany[],
): XlsxSheet {
  const box = { border: LINE, valign: 'center' as const };
  const cols = 5;
  const blank = (s: XlsxStyle): XlsxCell[] => Array.from({ length: cols }, () => ({ v: '', s }));
  const total = closureTotalKg(companies);

  const rows: XlsxCell[][] = [
    [{ v: `Cierre mensual de residuos valorizados — ${periodLabel(periodKey)}`, s: { bold: true, size: 16, color: GREEN, valign: 'center' } }],
    [{ v: `Gestor: ${cell(destinationName)}  ·  ${companies.length} empresa(s)  ·  ${formatKg(total)} kg`, s: { size: 11, color: GREY } }],
    [],
    ['Empresa', 'RUT', 'Residuo', 'Kg', 'N° CT'].map((v, i) => ({
      v, s: { bold: true, color: 'FFFFFF', fill: GREEN, border: GREEN, valign: 'center' as const, align: i === 3 ? 'right' as const : 'center' as const },
    })),
  ];
  const merges = ['A1:E1', 'A2:E2'];
  const rowHeights: Record<number, number> = { 0: 28, 3: 22 };

  for (const c of companies) {
    const first = rows.length;
    c.materials.forEach((m, i) => {
      rows.push([
        { v: i === 0 ? cell(c.name) : '', s: { ...box, bold: true, wrap: true, align: 'center', fill: COMPANY_BG } },
        { v: i === 0 ? cell(c.rut) : '', s: { ...box, align: 'center', fill: COMPANY_BG } },
        { v: cell(m.material), s: box },
        { v: truncateTo(m.kg), s: { ...box, numFmt: KG_FORMAT } },
        { v: i === 0 ? c.certNumbers.join('\n') : '', s: { ...box, align: 'center', wrap: true, color: GREY, size: 10 } },
      ]);
    });
    rows.push([
      { v: '', s: { ...box, fill: COMPANY_BG } },
      { v: '', s: { ...box, fill: COMPANY_BG } },
      { v: 'Subtotal', s: { ...box, bold: true, fill: GREEN_SOFT, align: 'right' } },
      { v: truncateTo(c.totalKg), s: { ...box, bold: true, fill: GREEN_SOFT, numFmt: KG_FORMAT } },
      { v: '', s: box },
    ]);
    // Empresa, RUT y CT ocupan todo el bloque: residuos + subtotal.
    const last = rows.length - 1;
    if (last > first) {
      for (const col of ['A', 'B', 'E']) merges.push(`${col}${first + 1}:${col}${last + 1}`);
    }
  }

  const totalStyle = { bold: true, size: 12, color: 'FFFFFF', fill: GREEN, border: GREEN, valign: 'center' as const };
  const totalRow = blank(totalStyle);
  totalRow[0] = { v: 'TOTAL', s: totalStyle };
  totalRow[3] = { v: total, s: { ...totalStyle, numFmt: KG_FORMAT } };
  rowHeights[rows.length] = 22;
  merges.push(`A${rows.length + 1}:C${rows.length + 1}`);
  rows.push(totalRow);

  rows.push([]);
  merges.push(`A${rows.length + 1}:E${rows.length + 1}`);
  rows.push([{
    v: 'Solo residuos con destino valorización. Kilos truncados a un decimal, igual que en los certificados de transporte. Generado por EcoNexo.',
    s: { italic: true, size: 9, color: GREY },
  }]);

  return {
    name: periodLabel(periodKey),
    rows,
    merges,
    rowHeights,
    freezeRows: 4,
    hideGridLines: true,
    colWidths: [38, 15, 24, 12, 16],
  };
}
