# Cierre mensual por gestor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pestaña «Cierre mensual» en el Panel mensual donde el admin asigna un gestor a cada empresa con retiros del mes, guarda el cierre y descarga un Excel y un PDF por gestor.

**Architecture:** Lógica pura en `utils/monthlyClosure.ts` (agrupar retiros por empresa, asignación por defecto, huella de cambios, contenido del Excel). Acceso a Supabase en `services/monthlyClosureService.ts`. Exportes en `services/closureExport.ts`. UI en `components/admin/MonthlyClosure.tsx`, montada como pestaña de `screens/MonthlyPanel.tsx`. Tabla nueva `monthly_closures`, creada a mano en el SQL Editor.

**Tech Stack:** React 19 + TypeScript + Vite, Supabase JS, jsPDF + jspdf-autotable, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-cierre-mensual-design.md`

## Global Constraints

- Kilos: 1 decimal, **truncados** (`truncateTo`, `sumTruncated`, `formatKg` de `utils/formatKg.ts`); nunca redondear.
- Totales = suma de las filas ya truncadas (`sumTruncated`), para que cuadren con los CT.
- Fechas del mes: `monthRange(año, mesIndex)` + `isWithin` de `utils/dateRange.ts` (hora de Chile). Nunca `new Date('YYYY-MM-DD')`.
- Empresa de un retiro: `metadata.unregistered_client_id ?? user_id`.
- Números de CT pasan por `toTransportLabel` (nunca mostrar «CR»).
- Documentos de entrada: `type IN WASTE_DOC_TYPES` y `verified = true` (los que ya carga el panel).
- Gestores: tabla existente `cgm_destinations` con `active = true`.
- Sin dependencias nuevas. Excel = TSV con BOM y extensión `.xls`, igual que `screens/Documents.tsx`.
- Textos de UI en español de Chile. Todo solo visible para admin.
- Migraciones SQL se corren a mano en el SQL Editor (el MCP de Supabase apunta a otro proyecto).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Cliente manual cuya ficha `UNREGISTERED_CLIENT` fue borrada** → la empresa aparece como «Empresa sin ficha», no rompe la pantalla ni se atribuye al operario. (Test en Task 1.)
2. **Cantidad guardada como texto con coma («9,4»)** → suma 9,4 kg, no cero. (Test en Task 1.)
3. **Gestor desactivado que era el del mes anterior** → la empresa queda en «No incluir», no con un id inactivo que no aparece en el selector. (Test en Task 1.)
4. **Empresa que pasa de GCR a «No incluir» al re-cerrar** → el registro viejo de ese gestor para el mes se borra; la descarga ya no la incluye. (Cubierto por `staleDestinationIds`, test en Task 1.)
5. **Nombre de empresa con tabulación o salto de línea** → el Excel no se desordena. (Test en Task 1.)

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `utils/monthlyClosure.ts` (crear) | Tipos + funciones puras del cierre |
| `utils/monthlyClosure.test.ts` (crear) | Tests de lo anterior |
| `supabase/migrations/20260930_create_monthly_closures.sql` (crear) | Tabla + RLS |
| `services/monthlyClosureService.ts` (crear) | Lecturas/escrituras Supabase del cierre |
| `services/closureExport.ts` (crear) | Descarga Excel y PDF de un cierre guardado |
| `components/admin/MonthlyClosure.tsx` (crear) | UI de la pestaña |
| `screens/MonthlyPanel.tsx` (modificar) | Pestañas «Resumen / Cierre mensual» |

---

### Task 1: Lógica pura del cierre

**Files:**
- Create: `utils/monthlyClosure.ts`
- Test: `utils/monthlyClosure.test.ts`

**Interfaces:**
- Consumes: `monthRange`, `isWithin`, `localDayToISO` (`utils/dateRange.ts`); `wasteItemsOf`, `parseQuantity` (`utils/wasteClassification.ts`); `normalizeMaterialType` (`utils/materialCalculations.ts`); `sumTruncated`, `formatKg` (`utils/formatKg.ts`); `toTransportLabel` (`utils/documentTypes.ts`); `periodLabel` (`utils/monthlyBreakdown.ts`).
- Produces:
  - `interface ClosureDoc { user_id: string; created_at: string; metadata?: { waste_details?: unknown; cert_number?: string; unregistered_client_id?: string } | null }`
  - `interface CompanyInfo { name: string; rut: string; isManual: boolean }`
  - `interface ClosureMaterial { material: string; kg: number }`
  - `interface ClosureCompany { companyId: string; name: string; rut: string; isManual: boolean; materials: ClosureMaterial[]; totalKg: number; certNumbers: string[] }`
  - `interface StoredClosure { id: string; period: string; destination_id: string; destination_name: string; companies: ClosureCompany[]; total_kg: number; fingerprint: string; closed_by: string | null; closed_at: string }`
  - `type Assignment = Record<string, string | null>`
  - `UNKNOWN_COMPANY_NAME = 'Empresa sin ficha'`
  - `companyIdOf(doc: ClosureDoc): string`
  - `buildClosureCompanies(docs: ClosureDoc[], directory: Record<string, CompanyInfo>, periodKey: string): ClosureCompany[]`
  - `groupByDestination(companies: ClosureCompany[], assignment: Assignment): Map<string, ClosureCompany[]>`
  - `defaultAssignment(companies: ClosureCompany[], closures: StoredClosure[], activeDestinationIds: string[], periodKey: string): Assignment`
  - `staleDestinationIds(closures: StoredClosure[], periodKey: string, keepIds: string[]): string[]`
  - `snapshotFingerprint(companies: ClosureCompany[]): string`
  - `closureTotalKg(companies: ClosureCompany[]): number`
  - `closureToTsv(destinationName: string, periodKey: string, companies: ClosureCompany[]): string`

- [ ] **Step 1: Write the failing tests**

`utils/monthlyClosure.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildClosureCompanies,
  groupByDestination,
  defaultAssignment,
  staleDestinationIds,
  snapshotFingerprint,
  closureTotalKg,
  closureToTsv,
  UNKNOWN_COMPANY_NAME,
  type ClosureDoc,
  type CompanyInfo,
  type StoredClosure,
} from './monthlyClosure';
import { localDayToISO } from './dateRange';

const retiro = (
  fecha: string,
  owner: string,
  items: { waste_type: string; quantity: unknown }[],
  extra: Record<string, unknown> = {},
): ClosureDoc => ({
  user_id: owner,
  created_at: localDayToISO(fecha),
  metadata: { waste_details: items, ...extra },
});

const directory: Record<string, CompanyInfo> = {
  empA: { name: 'Alfa SpA', rut: '76.111.111-1', isManual: false },
  empB: { name: 'Beta Ltda', rut: '76.222.222-2', isManual: false },
  manual1: { name: 'Minimarket Gamma', rut: '12.345.678-9', isManual: true },
};

const stored = (over: Partial<StoredClosure>): StoredClosure => ({
  id: 'x', period: '2026-08', destination_id: 'gcr', destination_name: 'GCR',
  companies: [], total_kg: 0, fingerprint: '', closed_by: null,
  closed_at: '2026-09-01T12:00:00.000Z', ...over,
});

describe('buildClosureCompanies', () => {
  it('atribuye el retiro de un cliente manual al cliente, no al operario', () => {
    const docs = [retiro('2026-09-10', 'operario', [{ waste_type: 'Cartón', quantity: 10 }],
      { unregistered_client_id: 'manual1' })];
    const [c] = buildClosureCompanies(docs, directory, '2026-09');
    expect(c.companyId).toBe('manual1');
    expect(c.name).toBe('Minimarket Gamma');
    expect(c.isManual).toBe(true);
  });

  it('usa «Empresa sin ficha» si la empresa no está en el directorio', () => {
    const docs = [retiro('2026-09-10', 'operario', [{ waste_type: 'Cartón', quantity: 5 }],
      { unregistered_client_id: 'borrado' })];
    const [c] = buildClosureCompanies(docs, directory, '2026-09');
    expect(c.name).toBe(UNKNOWN_COMPANY_NAME);
    expect(c.isManual).toBe(true);
  });

  it('agrupa por material y trunca cada ítem antes de sumar, como en los CT', () => {
    const docs = [
      retiro('2026-09-02', 'empA', [{ waste_type: 'Vidrio', quantity: 1.19 }]),
      retiro('2026-09-03', 'empA', [{ waste_type: 'Vidrio', quantity: 1.19 }]),
    ];
    const [c] = buildClosureCompanies(docs, directory, '2026-09');
    expect(c.materials).toEqual([{ material: 'Vidrio', kg: 2.2 }]);
    expect(c.totalKg).toBe(2.2);
  });

  it('lee cantidades escritas con coma decimal', () => {
    const docs = [retiro('2026-09-02', 'empA', [{ waste_type: 'Vidrio', quantity: '9,4' }])];
    const [c] = buildClosureCompanies(docs, directory, '2026-09');
    expect(c.totalKg).toBe(9.4);
  });

  it('incluye el último día del mes y excluye el primero del siguiente', () => {
    const docs = [
      retiro('2026-09-30', 'empA', [{ waste_type: 'Vidrio', quantity: 3 }]),
      retiro('2026-10-01', 'empA', [{ waste_type: 'Vidrio', quantity: 7 }]),
    ];
    const [c] = buildClosureCompanies(docs, directory, '2026-09');
    expect(c.totalKg).toBe(3);
  });

  it('omite documentos sin residuos y no crea empresas vacías', () => {
    const docs = [retiro('2026-09-10', 'empB', [])];
    expect(buildClosureCompanies(docs, directory, '2026-09')).toEqual([]);
  });

  it('junta los N° de CT sin repetir, como CT y en orden', () => {
    const docs = [
      retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }], { cert_number: 'CR N°:010' }),
      retiro('2026-09-05', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }], { cert_number: 'CT N°:002' }),
    ];
    const [c] = buildClosureCompanies(docs, directory, '2026-09');
    expect(c.certNumbers).toEqual(['CT N°:002', 'CT N°:010']);
  });

  it('ordena las empresas por nombre', () => {
    const docs = [
      retiro('2026-09-10', 'empB', [{ waste_type: 'Vidrio', quantity: 1 }]),
      retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }]),
    ];
    expect(buildClosureCompanies(docs, directory, '2026-09').map(c => c.name))
      .toEqual(['Alfa SpA', 'Beta Ltda']);
  });
});

describe('groupByDestination', () => {
  it('deja fuera las empresas en «No incluir»', () => {
    const docs = [
      retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }]),
      retiro('2026-09-10', 'empB', [{ waste_type: 'Vidrio', quantity: 2 }]),
    ];
    const companies = buildClosureCompanies(docs, directory, '2026-09');
    const groups = groupByDestination(companies, { empA: 'gcr', empB: null });
    expect([...groups.keys()]).toEqual(['gcr']);
    expect(groups.get('gcr')!.map(c => c.companyId)).toEqual(['empA']);
  });
});

describe('defaultAssignment', () => {
  const companies = buildClosureCompanies([
    retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }]),
    retiro('2026-09-10', 'empB', [{ waste_type: 'Vidrio', quantity: 1 }]),
  ], directory, '2026-09');
  const withA = (dest: string, period: string) => stored({
    destination_id: dest, period, companies: [companies[0]],
  });

  it('toma el gestor del cierre más reciente en que aparece la empresa', () => {
    const closures = [withA('sorepa', '2026-07'), withA('gcr', '2026-08')];
    expect(defaultAssignment(companies, closures, ['gcr', 'sorepa'], '2026-09'))
      .toEqual({ empA: 'gcr', empB: null });
  });

  it('ignora cierres de meses posteriores al que se está cerrando', () => {
    const closures = [withA('gcr', '2026-08'), withA('sorepa', '2026-10')];
    expect(defaultAssignment(companies, closures, ['gcr', 'sorepa'], '2026-09').empA).toBe('gcr');
  });

  it('deja en «No incluir» si el gestor anterior está desactivado', () => {
    const closures = [withA('viejo', '2026-08')];
    expect(defaultAssignment(companies, closures, ['gcr'], '2026-09').empA).toBeNull();
  });
});

describe('staleDestinationIds', () => {
  it('devuelve los gestores del período que ya no tienen empresas', () => {
    const closures = [
      stored({ period: '2026-09', destination_id: 'gcr' }),
      stored({ period: '2026-09', destination_id: 'sorepa' }),
      stored({ period: '2026-08', destination_id: 'otro' }),
    ];
    expect(staleDestinationIds(closures, '2026-09', ['gcr'])).toEqual(['sorepa']);
  });
});

describe('snapshotFingerprint', () => {
  const docs = [
    retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }], { cert_number: 'CT N°:001' }),
    retiro('2026-09-11', 'empB', [{ waste_type: 'Vidrio', quantity: 2 }], { cert_number: 'CT N°:002' }),
  ];

  it('no cambia si solo cambia el orden de los documentos', () => {
    const a = snapshotFingerprint(buildClosureCompanies(docs, directory, '2026-09'));
    const b = snapshotFingerprint(buildClosureCompanies([...docs].reverse(), directory, '2026-09'));
    expect(a).toBe(b);
  });

  it('cambia si cambia un kilo o aparece un CT', () => {
    const base = snapshotFingerprint(buildClosureCompanies(docs, directory, '2026-09'));
    const otroKg = [docs[0], retiro('2026-09-11', 'empB', [{ waste_type: 'Vidrio', quantity: 3 }], { cert_number: 'CT N°:002' })];
    const otroCt = [...docs, retiro('2026-09-12', 'empB', [{ waste_type: 'Vidrio', quantity: 0.5 }], { cert_number: 'CT N°:003' })];
    expect(snapshotFingerprint(buildClosureCompanies(otroKg, directory, '2026-09'))).not.toBe(base);
    expect(snapshotFingerprint(buildClosureCompanies(otroCt, directory, '2026-09'))).not.toBe(base);
  });
});

describe('closureTotalKg y closureToTsv', () => {
  const companies = buildClosureCompanies([
    retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1.25 }, { waste_type: 'Cartón', quantity: 2 }], { cert_number: 'CT N°:001' }),
    retiro('2026-09-10', 'empB', [{ waste_type: 'Vidrio', quantity: 4 }], { cert_number: 'CT N°:002' }),
  ], { ...directory, empB: { name: 'Beta\tLtda\nSur', rut: '1-9', isManual: false } }, '2026-09');

  it('suma los totales ya truncados', () => {
    expect(closureTotalKg(companies)).toBe(7.2);
  });

  it('arma una fila por residuo, subtotal por empresa y total general', () => {
    const lines = closureToTsv('GCR', '2026-09', companies).split('\n');
    expect(lines[0]).toBe('Cierre Septiembre 2026 — GCR');
    expect(lines[2]).toBe('Empresa\tRUT\tResiduo\tKg\tN° CT');
    expect(lines).toContain('Alfa SpA\t76.111.111-1\tCartón\t2,0\tCT N°:001');
    expect(lines).toContain('\t\tSubtotal Alfa SpA\t3,2\t');
    expect(lines[lines.length - 1]).toBe('TOTAL\t\t\t7,2\t');
  });

  it('limpia tabulaciones y saltos de línea en los textos', () => {
    const tsv = closureToTsv('GCR', '2026-09', companies);
    expect(tsv).toContain('Beta Ltda Sur\t1-9\tVidrio\t4,0\tCT N°:002');
  });
});
```

Nota: `normalizeMaterialType({ waste_type: 'Cartón' })` y `({ waste_type: 'Vidrio' })` deben devolver `'Cartón'` y `'Vidrio'`. Si en el Step 2 algún test falla porque devuelve otro nombre (p. ej. `'Papel/Cartón'`), ajusta **solo el texto esperado** en los tests al nombre que devuelve la función, no la función.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run utils/monthlyClosure.test.ts`
Expected: FAIL — `Failed to resolve import "./monthlyClosure"`.

- [ ] **Step 3: Write the implementation**

`utils/monthlyClosure.ts`:

```ts
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
 * Gestor sugerido para cada empresa: el del cierre más reciente (hasta este
 * mes inclusive) en que aparece, siempre que ese gestor siga activo.
 */
export function defaultAssignment(
  companies: ClosureCompany[],
  closures: StoredClosure[],
  activeDestinationIds: string[],
  periodKey: string,
): Assignment {
  const active = new Set(activeDestinationIds);
  const ordered = closures
    .filter(c => c.period <= periodKey)
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

const cell = (value: string) => value.replace(/[\t\r\n]+/g, ' ').trim();

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run utils/monthlyClosure.test.ts`
Expected: PASS (todos). Luego `npx vitest run` — la suite completa sigue en verde.

- [ ] **Step 5: Commit**

```bash
git add utils/monthlyClosure.ts utils/monthlyClosure.test.ts
git commit -m "feat(cierre): lógica pura del cierre mensual por gestor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tabla `monthly_closures` y servicio Supabase

**Files:**
- Create: `supabase/migrations/20260930_create_monthly_closures.sql`
- Create: `services/monthlyClosureService.ts`

**Interfaces:**
- Consumes: tipos `CompanyInfo`, `ClosureCompany`, `StoredClosure`, función `staleDestinationIds`, `closureTotalKg` (Task 1); `supabase` de `services/supabase.ts`.
- Produces:
  - `interface ClosureDestination { id: string; name: string; rut: string; resolution: string }`
  - `fetchCompanyDirectory(): Promise<Record<string, CompanyInfo>>`
  - `fetchActiveDestinations(): Promise<ClosureDestination[]>`
  - `fetchClosures(): Promise<StoredClosure[]>`
  - `saveClosure(args: { period: string; groups: Map<string, ClosureCompany[]>; destinations: ClosureDestination[]; fingerprint: string; existing: StoredClosure[] }): Promise<void>`

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260930_create_monthly_closures.sql`:

```sql
-- Cierre mensual por gestor.
--
-- Cada fin de mes el admin asigna un gestor (cgm_destinations) a cada empresa
-- con retiros y guarda aquí una copia fija de lo enviado: un registro por mes y
-- gestor. Volver a cerrar el mes reemplaza el registro (upsert por
-- period + destination_id). Solo el admin lee y escribe.
--
-- Se corre a mano en el SQL Editor.

CREATE TABLE IF NOT EXISTS public.monthly_closures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period           text NOT NULL CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  destination_id   uuid NOT NULL REFERENCES public.cgm_destinations(id),
  destination_name text NOT NULL,
  companies        jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_kg         numeric NOT NULL DEFAULT 0,
  fingerprint      text NOT NULL DEFAULT '',
  closed_by        uuid REFERENCES auth.users(id),
  closed_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period, destination_id)
);

ALTER TABLE public.monthly_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read closures" ON public.monthly_closures;
CREATE POLICY "Admins read closures" ON public.monthly_closures
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert closures" ON public.monthly_closures;
CREATE POLICY "Admins insert closures" ON public.monthly_closures
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update closures" ON public.monthly_closures;
CREATE POLICY "Admins update closures" ON public.monthly_closures
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete closures" ON public.monthly_closures;
CREATE POLICY "Admins delete closures" ON public.monthly_closures
  FOR DELETE USING (public.is_admin());

-- Comprobación: deben salir las cuatro políticas.
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'monthly_closures';
```

- [ ] **Step 2: Write the service**

`services/monthlyClosureService.ts`:

```ts
// Lecturas y escrituras de Supabase para el cierre mensual.
// La lógica de qué va a cada gestor vive en utils/monthlyClosure.ts.

import { supabase } from './supabase';
import {
  closureTotalKg,
  staleDestinationIds,
  type ClosureCompany,
  type CompanyInfo,
  type StoredClosure,
} from '../utils/monthlyClosure';

export interface ClosureDestination {
  id: string;
  name: string;
  rut: string;
  resolution: string;
}

/** Nombre y RUT de cada empresa: registradas (profiles) y manuales. */
export async function fetchCompanyDirectory(): Promise<Record<string, CompanyInfo>> {
  const [perfiles, manuales] = await Promise.all([
    supabase.from('profiles').select('id, company_name, rut'),
    supabase.from('documents').select('id, metadata').eq('type', 'UNREGISTERED_CLIENT'),
  ]);
  if (perfiles.error) throw perfiles.error;
  if (manuales.error) throw manuales.error;

  const directory: Record<string, CompanyInfo> = {};
  for (const p of perfiles.data ?? []) {
    directory[p.id] = { name: p.company_name || 'Sin nombre', rut: p.rut || '', isManual: false };
  }
  for (const d of manuales.data ?? []) {
    directory[d.id] = {
      name: d.metadata?.company_name || 'Sin nombre',
      rut: d.metadata?.rut || '',
      isManual: true,
    };
  }
  return directory;
}

export async function fetchActiveDestinations(): Promise<ClosureDestination[]> {
  const { data, error } = await supabase
    .from('cgm_destinations')
    .select('id, name, rut, resolution')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as ClosureDestination[];
}

export async function fetchClosures(): Promise<StoredClosure[]> {
  const { data, error } = await supabase
    .from('monthly_closures')
    .select('*')
    .order('period', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, total_kg: Number(r.total_kg) })) as StoredClosure[];
}

/**
 * Guarda el cierre del mes: un registro por gestor con empresas asignadas.
 * Primero los upserts; solo si todos salen bien se borran los gestores que
 * ya no reciben nada, para no dejar el mes a medio cerrar.
 */
export async function saveClosure({ period, groups, destinations, fingerprint, existing }: {
  period: string;
  groups: Map<string, ClosureCompany[]>;
  destinations: ClosureDestination[];
  fingerprint: string;
  existing: StoredClosure[];
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const names = new Map(destinations.map(d => [d.id, d.name]));

  const rows = [...groups].map(([destinationId, companies]) => ({
    period,
    destination_id: destinationId,
    destination_name: names.get(destinationId) ?? 'Gestor',
    companies,
    total_kg: closureTotalKg(companies),
    fingerprint,
    closed_by: user?.id ?? null,
    closed_at: new Date().toISOString(),
  }));
  if (rows.length === 0) throw new Error('No hay empresas asignadas a ningún gestor.');

  const { error: upsertError } = await supabase
    .from('monthly_closures')
    .upsert(rows, { onConflict: 'period,destination_id' });
  if (upsertError) throw upsertError;

  const stale = staleDestinationIds(existing, period, [...groups.keys()]);
  if (stale.length > 0) {
    const { error: deleteError } = await supabase
      .from('monthly_closures')
      .delete()
      .eq('period', period)
      .in('destination_id', stale);
    if (deleteError) throw deleteError;
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "monthlyClosure" || echo OK`
Expected: `OK` (los errores de `supabase/functions/*` e `inspect_reports.ts` son preexistentes y se ignoran).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260930_create_monthly_closures.sql services/monthlyClosureService.ts
git commit -m "feat(cierre): tabla monthly_closures y servicio de guardado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Exportes Excel y PDF

**Files:**
- Create: `services/closureExport.ts`

**Interfaces:**
- Consumes: `closureToTsv`, `closureTotalKg`, `type ClosureCompany` (Task 1); `type ClosureDestination` (Task 2); `periodLabel` (`utils/monthlyBreakdown.ts`); `formatKg` (`utils/formatKg.ts`).
- Produces:
  - `downloadClosureXls(destinationName: string, periodKey: string, companies: ClosureCompany[]): void`
  - `downloadClosurePdf(destination: Pick<ClosureDestination, 'name' | 'rut' | 'resolution'>, periodKey: string, companies: ClosureCompany[], closedAt: string): void`

- [ ] **Step 1: Write the export module**

`services/closureExport.ts`:

```ts
// Descargas del cierre mensual. Siempre desde un cierre guardado, para que lo
// que recibe el gestor coincida con el registro.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { closureToTsv, closureTotalKg, type ClosureCompany } from '../utils/monthlyClosure';
import { periodLabel } from '../utils/monthlyBreakdown';
import { formatKg } from '../utils/formatKg';
import type { ClosureDestination } from './monthlyClosureService';

const fileSafe = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/_+$/, '');

export function downloadClosureXls(destinationName: string, periodKey: string, companies: ClosureCompany[]): void {
  // BOM para que Excel reconozca los acentos; TSV con extensión .xls, como en Documentos.
  const blob = new Blob(['﻿' + closureToTsv(destinationName, periodKey, companies)], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Cierre_${fileSafe(destinationName)}_${periodKey}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadClosurePdf(
  destination: Pick<ClosureDestination, 'name' | 'rut' | 'resolution'>,
  periodKey: string,
  companies: ClosureCompany[],
  closedAt: string,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const green: [number, number, number] = [50, 97, 5];
  const W = 210;

  doc.setFillColor(...green);
  doc.rect(0, 0, W, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Cierre Mensual de Residuos', 14, 15);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${periodLabel(periodKey)} · EcoNexo`, 14, 23);

  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Gestor: ${destination.name}`, 14, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let y = 50;
  if (destination.rut) { doc.text(`RUT: ${destination.rut}`, 14, y); y += 5; }
  if (destination.resolution) { doc.text(destination.resolution, 14, y); y += 5; }
  const cerrado = new Date(closedAt).toLocaleDateString('es-CL');
  doc.text(`Cerrado el ${cerrado} · ${companies.length} empresa(s)`, 14, y);
  y += 6;

  const body: string[][] = [];
  for (const c of companies) {
    c.materials.forEach((m, i) => {
      body.push([
        i === 0 ? c.name : '',
        i === 0 ? c.rut : '',
        m.material,
        formatKg(m.kg),
        i === 0 ? c.certNumbers.join(', ') : '',
      ]);
    });
    body.push(['', '', `Subtotal ${c.name}`, formatKg(c.totalKg), '']);
  }

  autoTable(doc, {
    startY: y + 2,
    head: [['Empresa', 'RUT', 'Residuo', 'Kg', 'N° CT']],
    body,
    foot: [['TOTAL', '', '', formatKg(closureTotalKg(companies)), '']],
    theme: 'grid',
    headStyles: { fillColor: green, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [235, 242, 230], textColor: 30, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 3: { halign: 'right' } },
    didParseCell: data => {
      if (data.section === 'body' && String(data.cell.raw).startsWith('Subtotal ')) {
        data.row.cells[2].styles.fontStyle = 'bold';
        data.row.cells[3].styles.fontStyle = 'bold';
      }
    },
  });

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text('Kilos truncados a un decimal, igual que en los certificados de transporte. econexo.cl', 14, 287);

  doc.save(`Cierre_${fileSafe(destination.name)}_${periodKey}.pdf`);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "closureExport" || echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add services/closureExport.ts
git commit -m "feat(cierre): descarga del cierre en Excel y PDF por gestor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pestaña «Cierre mensual»

**Files:**
- Create: `components/admin/MonthlyClosure.tsx`
- Modify: `screens/MonthlyPanel.tsx` (estado de pestaña; header y selector de empresa solo en «Resumen»; montar el componente)

**Interfaces:**
- Consumes: Task 1 (`buildClosureCompanies`, `groupByDestination`, `defaultAssignment`, `snapshotFingerprint`, `closureTotalKg`, tipos), Task 2 (`fetchCompanyDirectory`, `fetchActiveDestinations`, `fetchClosures`, `saveClosure`, `ClosureDestination`), Task 3 (`downloadClosureXls`, `downloadClosurePdf`); `useToast` (`components/ui/Toast`), `useConfirm` (`components/ui/ConfirmDialog`), `formatKg`, `periodLabel`.
- Produces: `export default MonthlyClosure: React.FC<{ docs: ClosureDoc[]; period: string }>`

- [ ] **Step 1: Write the component**

`components/admin/MonthlyClosure.tsx`:

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { formatKg } from '../../utils/formatKg';
import { periodLabel } from '../../utils/monthlyBreakdown';
import {
  buildClosureCompanies,
  closureTotalKg,
  defaultAssignment,
  groupByDestination,
  snapshotFingerprint,
  type Assignment,
  type ClosureDoc,
  type CompanyInfo,
  type StoredClosure,
} from '../../utils/monthlyClosure';
import {
  fetchActiveDestinations,
  fetchClosures,
  fetchCompanyDirectory,
  saveClosure,
  type ClosureDestination,
} from '../../services/monthlyClosureService';
import { downloadClosurePdf, downloadClosureXls } from '../../services/closureExport';

const NONE = '';

const MonthlyClosure: React.FC<{ docs: ClosureDoc[]; period: string }> = ({ docs, period }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [directory, setDirectory] = useState<Record<string, CompanyInfo>>({});
  const [destinations, setDestinations] = useState<ClosureDestination[]>([]);
  const [closures, setClosures] = useState<StoredClosure[]>([]);
  const [assignment, setAssignment] = useState<Assignment>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [dir, dests, stored] = await Promise.all([
        fetchCompanyDirectory(), fetchActiveDestinations(), fetchClosures(),
      ]);
      setDirectory(dir);
      setDestinations(dests);
      setClosures(stored);
    } catch (err) {
      console.error('Error loading monthly closure:', err);
      setLoadError(true);
      toast.error('No se pudo cargar el cierre.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const companies = useMemo(
    () => buildClosureCompanies(docs, directory, period),
    [docs, directory, period],
  );
  const fingerprint = useMemo(() => snapshotFingerprint(companies), [companies]);
  const periodClosures = useMemo(
    () => closures.filter(c => c.period === period),
    [closures, period],
  );

  // Al cambiar de mes o terminar de cargar, precarga el gestor del último cierre.
  useEffect(() => {
    setAssignment(defaultAssignment(companies, closures, destinations.map(d => d.id), period));
  }, [companies, closures, destinations, period]);

  const groups = useMemo(() => groupByDestination(companies, assignment), [companies, assignment]);
  const excluded = companies.filter(c => !assignment[c.companyId]);

  const closedAt = periodClosures[0]?.closed_at;
  const changedSinceClose = periodClosures.length > 0 && periodClosures[0].fingerprint !== fingerprint;

  const handleClose = async () => {
    if (groups.size === 0) { toast.warning('Asigna al menos una empresa a un gestor.'); return; }
    if (excluded.length > 0) {
      const ok = await confirm({
        title: 'Empresas sin gestor',
        message: `${excluded.map(c => c.name).join(', ')} no se incluirán en el cierre de ${periodLabel(period)}. ¿Continuar?`,
        confirmLabel: 'Cerrar mes',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await saveClosure({ period, groups, destinations, fingerprint, existing: closures });
      setClosures(await fetchClosures());
      toast.success(`Cierre de ${periodLabel(period)} guardado.`);
    } catch (err: any) {
      toast.error('No se pudo guardar el cierre: ' + (err?.message || 'desconocido'));
    } finally {
      setSaving(false);
    }
  };

  const destinationFor = (c: StoredClosure) =>
    destinations.find(d => d.id === c.destination_id) ?? { name: c.destination_name, rut: '', resolution: '' };

  const card = 'bg-white/70 dark:bg-slate-800/70 border border-white/80 dark:border-white/10 rounded-3xl shadow-sm';

  if (loading) {
    return <div className={`${card} p-6 text-sm text-gray-500 text-center`}>Cargando cierre…</div>;
  }
  if (loadError) {
    return (
      <div className={`${card} p-6 text-sm text-center space-y-3`}>
        <p className="text-gray-600 dark:text-gray-300">No se pudo cargar el cierre.</p>
        <button onClick={load} className="px-4 h-10 rounded-2xl bg-primary text-white font-bold">Reintentar</button>
      </div>
    );
  }
  if (destinations.length === 0) {
    return (
      <div className={`${card} p-6 text-sm text-center space-y-3`}>
        <p className="text-gray-600 dark:text-gray-300">No hay gestores activos. Agrega uno en Administración → Destinos CGM.</p>
        <button onClick={() => navigate('/admin')} className="px-4 h-10 rounded-2xl bg-primary text-white font-bold">Ir a administración</button>
      </div>
    );
  }
  if (companies.length === 0) {
    return <div className={`${card} p-6 text-sm text-gray-500 text-center`}>No hay retiros en {periodLabel(period)}.</div>;
  }

  return (
    <div className="space-y-5">
      {/* ── Estado del mes ── */}
      <div className={`${card} p-5 flex items-center justify-between gap-3`}>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">Cierre {periodLabel(period)}</p>
          {periodClosures.length === 0 && <p className="text-base font-black text-gray-900 dark:text-white">Sin cerrar</p>}
          {periodClosures.length > 0 && !changedSinceClose && (
            <p className="text-base font-black text-primary">Cerrado el {new Date(closedAt!).toLocaleDateString('es-CL')}</p>
          )}
          {changedSinceClose && (
            <p className="text-base font-black text-amber-600">Cambió desde el cierre — revisa y vuelve a cerrar</p>
          )}
        </div>
        <button
          onClick={handleClose}
          disabled={saving || groups.size === 0}
          className="shrink-0 h-11 px-5 rounded-2xl bg-primary text-white text-sm font-black shadow-sm active:scale-95 transition-transform disabled:opacity-40"
        >
          {saving ? 'Guardando…' : periodClosures.length > 0 ? 'Volver a cerrar' : 'Cerrar mes'}
        </button>
      </div>

      {/* ── Empresas ── */}
      <div className={`${card} divide-y divide-gray-100 dark:divide-white/5`}>
        {companies.map(c => (
          <div key={c.companyId} className="p-4 space-y-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setExpanded(expanded === c.companyId ? null : c.companyId)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-sm font-black text-gray-900 dark:text-white truncate">
                  {c.name}{c.isManual && <span className="ml-1 text-[10px] font-bold text-gray-400">(Manual)</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {c.rut || 'Sin RUT'} · {formatKg(c.totalKg)} kg · {c.certNumbers.length} CT
                </p>
              </button>
              <select
                value={assignment[c.companyId] ?? NONE}
                onChange={e => setAssignment({ ...assignment, [c.companyId]: e.target.value || null })}
                aria-label={`Gestor de ${c.name}`}
                className="w-36 shrink-0 h-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-xl px-2 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-primary"
              >
                <option value={NONE}>No incluir</option>
                {destinations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {expanded === c.companyId && (
              <ul className="pl-1 space-y-1">
                {c.materials.map(m => (
                  <li key={m.material} className="flex justify-between text-xs text-gray-600 dark:text-gray-300">
                    <span>{m.material}</span><span className="font-bold">{formatKg(m.kg)} kg</span>
                  </li>
                ))}
                {c.certNumbers.length > 0 && (
                  <li className="text-[11px] text-gray-400 pt-1">{c.certNumbers.join(', ')}</li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* ── Resumen por gestor (lo que se va a guardar) ── */}
      <div className={`${card} p-5 space-y-2`}>
        <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">Por gestor</p>
        {[...groups].map(([destId, list]) => (
          <div key={destId} className="flex justify-between text-sm">
            <span className="font-bold text-gray-900 dark:text-white">
              {destinations.find(d => d.id === destId)?.name ?? 'Gestor'} · {list.length} empresa(s)
            </span>
            <span className="font-black">{formatKg(closureTotalKg(list))} kg</span>
          </div>
        ))}
        {excluded.length > 0 && (
          <p className="text-xs text-gray-400">{excluded.length} empresa(s) sin incluir</p>
        )}
      </div>

      {/* ── Descargas del cierre guardado ── */}
      {periodClosures.length > 0 && (
        <div className={`${card} p-5 space-y-3`}>
          <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">Descargar cierre guardado</p>
          {periodClosures.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {c.destination_name} · {formatKg(c.total_kg)} kg
              </span>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => downloadClosureXls(c.destination_name, c.period, c.companies)}
                  className="h-9 px-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 text-xs font-bold"
                >
                  Excel
                </button>
                <button
                  onClick={() => downloadClosurePdf(destinationFor(c), c.period, c.companies, c.closed_at)}
                  className="h-9 px-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold"
                >
                  PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MonthlyClosure;
```

- [ ] **Step 2: Mount it in `screens/MonthlyPanel.tsx`**

2a. Importar el componente junto a los demás imports:

```tsx
import MonthlyClosure from '../components/admin/MonthlyClosure';
```

2b. Junto a `const [expanded, setExpanded] = ...`, agregar:

```tsx
    // «Cierre mensual» es solo para el admin.
    const [view, setView] = useState<'resumen' | 'cierre'>('resumen');
```

2c. En el header, envolver el `<div className="flex items-center gap-2">` de los botones CSV/PDF para que solo se muestre en el resumen, dejando un espaciador del mismo ancho para no mover el título:

```tsx
                {view === 'resumen' ? (
                    <div className="flex items-center gap-2">
                        {/* …botones CSV y PDF existentes, sin cambios… */}
                    </div>
                ) : (
                    <div className="w-[88px]" />
                )}
```

2d. Al inicio de `<div className="px-4 py-6 space-y-5 relative z-10">`, antes del selector de empresa, agregar las pestañas:

```tsx
                {isAdmin && (
                    <div className="grid grid-cols-2 gap-1 p-1 bg-white/70 dark:bg-slate-800/70 border border-white/80 dark:border-white/10 rounded-2xl shadow-sm">
                        {(['resumen', 'cierre'] as const).map(v => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={`h-10 rounded-xl text-sm font-black transition-colors ${view === v ? 'bg-primary text-white' : 'text-gray-600 dark:text-gray-300'}`}
                            >
                                {v === 'resumen' ? 'Resumen' : 'Cierre mensual'}
                            </button>
                        ))}
                    </div>
                )}
```

2e. Cambiar la condición del selector de empresa de `{isAdmin && companies.length > 0 && (` a:

```tsx
                {isAdmin && view === 'resumen' && companies.length > 0 && (
```

2f. Todo lo que va **después** del selector de mes (el bloque de carga/resumen, desglose, impacto y tendencia) se muestra solo en el resumen. Justo después del cierre del `<div className="flex items-center gap-2">` del selector de mes, envolver ese contenido:

```tsx
                {view === 'cierre' && isAdmin ? (
                    <MonthlyClosure docs={allDocs} period={period} />
                ) : (
                    <>
                        {/* …contenido existente del resumen, sin cambios… */}
                    </>
                )}
```

(`allDocs` ya viene con `user_id, created_at, metadata` desde la consulta existente, que es exactamente `ClosureDoc`.)

- [ ] **Step 3: Typecheck, tests y build**

Run:
```bash
npx tsc --noEmit -p . 2>&1 | grep -E "MonthlyClosure|MonthlyPanel|monthlyClosure|closureExport" || echo OK
npx vitest run
npm run build
```
Expected: `OK`, suite en verde, `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add components/admin/MonthlyClosure.tsx screens/MonthlyPanel.tsx
git commit -m "feat(cierre): pestaña Cierre mensual en el Panel mensual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verificación en la app y deploy

- [ ] **Step 1: Correr la migración**

Pedirle al usuario que corra `supabase/migrations/20260930_create_monthly_closures.sql` en el SQL Editor y la consulta de comprobación (4 políticas). Sin esto, guardar falla con «relation monthly_closures does not exist».

- [ ] **Step 2: Probar en local con un mes real** (`npm run dev`, entrar como admin → Panel mensual → Cierre mensual, septiembre 2026):
  - Aparecen las empresas con retiros, incluidas las manuales con «(Manual)».
  - Total por gestor = suma de los totales por empresa.
  - Cerrar mes → estado «Cerrado el …»; aparecen Excel y PDF por gestor; abrirlos y comprobar subtotales y total.
  - Cambiar una empresa a «No incluir» y volver a cerrar → el gestor que quedó sin empresas desaparece de las descargas.
  - Cambiar a agosto y volver: los gestores precargados se mantienen.

- [ ] **Step 3: PR, merge y deploy** — push de `feat/cierre-mensual`, PR a `main` con cuerpo terminado en `🤖 Generated with [Claude Code](https://claude.com/claude-code)`, merge, y esperar el estado `success` de Vercel en el commit de merge.
