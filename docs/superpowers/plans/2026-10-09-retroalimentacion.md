# Retroalimentación Econexo → Empresas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Econexo publique informes de retroalimentación (hallazgos, sugerencias, logros) por empresa y período, y que la empresa los vea en su Dashboard con constancia de lectura.

**Architecture:** Tabla `feedback_reports` con RLS (admin todo; empresa solo lee sus publicados y marca lectura vía RPC). Reglas puras en `utils/feedback.ts` (testeadas con vitest), acceso a datos en `services/feedbackService.ts`, editor admin en `components/admin/FeedbackManager.tsx` abierto desde la ficha de empresa, y en el cliente una tarjeta autónoma `components/FeedbackCard.tsx` en el Dashboard más la pantalla `screens/Feedback.tsx` en `/retroalimentacion`.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind (clases utilitarias en JSX), Supabase JS v2, vitest, Material Symbols.

**Spec:** `docs/superpowers/specs/2026-10-09-retroalimentacion-design.md`

## Global Constraints

- Textos de interfaz en español de Chile, como el resto de la app.
- Fechas de período: columnas `date` con cadenas `'YYYY-MM-DD'` calculadas con constructores locales de `Date` (nunca `toISOString()` para un día; ver comentarios de `utils/dateRange.ts`).
- Aviso al publicar: `createNotification` con `type: 'report'`; no se redespliega ninguna Edge Function.
- La migración se corre a mano en el SQL Editor de Supabase (el MCP de Supabase apunta a otro proyecto).
- Componentes admin: estilo claro (sin `dark:`), como `ClientOverviewModal`. Componentes del cliente: con variantes `dark:` como `Dashboard`/`Notifications`.
- Ruta nueva protegida con el mismo patrón que las demás en `App.tsx`, cargada con `lazy`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Informe hecho en enero → el período por defecto es diciembre del año anterior, no «mes -1» del mismo año (test en Task 2).
2. Hallazgo guardado sin `priority` (datos viejos o JSON editado a mano) → se ordena como «media», no rompe el orden (test en Task 2).
3. Editar y volver a publicar un informe ya publicado → no reenvía aviso ni borra `read_at` (lógica en Task 3, verificación manual en Task 6).
4. Migración aún no aplicada o empresa sin informes → la tarjeta del Dashboard no aparece y `/retroalimentacion` muestra estado vacío; nada se cae (Task 5).
5. Punto con título de solo espacios, o período personalizado con fin antes que inicio → no se puede publicar (test en Task 2).

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261009_create_feedback_reports.sql` (nuevo) | Tabla, índice, RLS, RPC `mark_feedback_read` |
| `utils/feedback.ts` (nuevo) | Tipos y reglas puras: períodos, validación, orden, conteos, texto del aviso |
| `utils/feedback.test.ts` (nuevo) | Tests de lo anterior |
| `services/feedbackService.ts` (nuevo) | CRUD sobre `feedback_reports`, publicar + notificar, marcar leído |
| `components/admin/FeedbackManager.tsx` (nuevo) | Modal admin: lista de informes de una empresa + editor |
| `components/ClientOverviewModal.tsx` (modificar) | Botón «Retroalimentación» que abre `FeedbackManager` |
| `components/FeedbackItemList.tsx` (nuevo) | Render de puntos agrupados por tipo (lo usan la pantalla del cliente y la vista previa) |
| `components/FeedbackCard.tsx` (nuevo) | Tarjeta del Dashboard; se carga sola y no renderiza nada si no hay informes |
| `screens/Feedback.tsx` (nuevo) | Historial de la empresa en `/retroalimentacion` |
| `screens/Dashboard.tsx` (modificar) | Montar `<FeedbackCard />` |
| `App.tsx` (modificar) | Ruta `/retroalimentacion` |

---

### Task 1: Migración `feedback_reports`

**Files:**
- Create: `supabase/migrations/20261009_create_feedback_reports.sql`

**Interfaces:**
- Produces: tabla `public.feedback_reports` (columnas del spec) y función `public.mark_feedback_read(report_id uuid) returns void`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Retroalimentación de Econexo a cada empresa.
--
-- Un informe por empresa y período (mes, trimestre o rango libre) con un
-- resumen y una lista de puntos (hallazgo / sugerencia / logro) en JSON.
-- El admin lo redacta como borrador y lo publica; la empresa solo ve los
-- publicados y solo puede marcar la lectura, con mark_feedback_read.
--
-- Se corre a mano en el SQL Editor.

-- Misma definición que en 20260824_security_hardening.sql. Se repite aquí
-- porque esa migración puede no estar aplicada; CREATE OR REPLACE no cambia
-- nada si ya existe.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true);
$$;

CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  period_label  text NOT NULL,
  summary       text NOT NULL DEFAULT '',
  items         jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at  timestamptz,
  read_at       timestamptz,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_feedback_reports_company_period
  ON public.feedback_reports (company_id, period_start DESC);

ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage feedback" ON public.feedback_reports;
CREATE POLICY "Admins manage feedback" ON public.feedback_reports
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Companies read own published feedback" ON public.feedback_reports;
CREATE POLICY "Companies read own published feedback" ON public.feedback_reports
  FOR SELECT USING (company_id = auth.uid() AND status = 'published');

-- La empresa no tiene UPDATE: así no puede tocar el contenido. La lectura se
-- marca con esta función, que solo escribe read_at la primera vez.
CREATE OR REPLACE FUNCTION public.mark_feedback_read(report_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.feedback_reports
     SET read_at = now()
   WHERE id = report_id
     AND company_id = auth.uid()
     AND status = 'published'
     AND read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_feedback_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_feedback_read(uuid) TO authenticated;

-- Comprobación: deben salir las dos políticas.
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'feedback_reports';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20261009_create_feedback_reports.sql
git commit -m "feat(retroalimentacion): migración feedback_reports con RLS y mark_feedback_read

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Reglas puras `utils/feedback.ts`

**Files:**
- Create: `utils/feedback.ts`
- Test: `utils/feedback.test.ts`

**Interfaces:**
- Produces:
  - `type FeedbackItemType = 'hallazgo' | 'sugerencia' | 'logro'`
  - `type FeedbackPriority = 'alta' | 'media' | 'baja'`
  - `interface FeedbackItem { id: string; type: FeedbackItemType; title: string; detail: string; priority?: FeedbackPriority }`
  - `interface FeedbackPeriod { start: string; end: string; label: string }`
  - `interface FeedbackDraft { period_start: string; period_end: string; period_label: string; summary: string; items: FeedbackItem[] }`
  - `MONTH_NAMES: string[]`, `ITEM_TYPE_META: Record<FeedbackItemType, { label: string; plural: string; icon: string }>`, `PRIORITY_LABEL: Record<FeedbackPriority, string>`
  - `monthPeriod(year: number, monthIndex: number): FeedbackPeriod`
  - `quarterPeriod(year: number, quarter: 1 | 2 | 3 | 4): FeedbackPeriod`
  - `defaultPeriod(today?: Date): FeedbackPeriod`
  - `validateReport(draft: FeedbackDraft): string | null`
  - `sortItems(items: FeedbackItem[]): FeedbackItem[]`
  - `countByType(items: FeedbackItem[]): Record<FeedbackItemType, number>`
  - `countsText(items: FeedbackItem[]): string`
  - `notificationMessage(label: string, items: FeedbackItem[]): string`

- [ ] **Step 1: Escribir los tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  monthPeriod, quarterPeriod, defaultPeriod, validateReport, sortItems,
  countByType, countsText, notificationMessage, FeedbackDraft, FeedbackItem,
} from './feedback';

const item = (over: Partial<FeedbackItem>): FeedbackItem => ({
  id: Math.random().toString(36).slice(2), type: 'hallazgo', title: 'x', detail: '', ...over,
});

const draft = (over: Partial<FeedbackDraft> = {}): FeedbackDraft => ({
  period_start: '2026-09-01', period_end: '2026-09-30', period_label: 'Septiembre 2026',
  summary: '', items: [item({})], ...over,
});

describe('períodos', () => {
  it('mes completo con su último día y etiqueta', () => {
    expect(monthPeriod(2026, 8)).toEqual({ start: '2026-09-01', end: '2026-09-30', label: 'Septiembre 2026' });
    expect(monthPeriod(2028, 1)).toEqual({ start: '2028-02-01', end: '2028-02-29', label: 'Febrero 2028' });
  });

  it('el período por defecto es el mes anterior', () => {
    expect(defaultPeriod(new Date(2026, 9, 9))).toEqual(monthPeriod(2026, 8));
  });

  it('en enero el período por defecto es diciembre del año anterior', () => {
    expect(defaultPeriod(new Date(2027, 0, 15))).toEqual({ start: '2026-12-01', end: '2026-12-31', label: 'Diciembre 2026' });
  });

  it('trimestres', () => {
    expect(quarterPeriod(2026, 3)).toEqual({ start: '2026-07-01', end: '2026-09-30', label: 'T3 2026' });
    expect(quarterPeriod(2026, 1)).toEqual({ start: '2026-01-01', end: '2026-03-31', label: 'T1 2026' });
  });
});

describe('validateReport', () => {
  it('acepta un informe completo', () => {
    expect(validateReport(draft())).toBeNull();
  });
  it('exige al menos un punto', () => {
    expect(validateReport(draft({ items: [] }))).toMatch(/al menos un punto/);
  });
  it('rechaza títulos vacíos o de solo espacios', () => {
    expect(validateReport(draft({ items: [item({ title: '   ' })] }))).toMatch(/título/);
  });
  it('rechaza un rango con fin antes que inicio', () => {
    expect(validateReport(draft({ period_start: '2026-09-30', period_end: '2026-09-01' }))).toMatch(/anterior/);
  });
  it('exige etiqueta de período', () => {
    expect(validateReport(draft({ period_label: ' ' }))).toMatch(/etiqueta/);
  });
});

describe('sortItems', () => {
  it('hallazgos por prioridad, luego sugerencias, luego logros', () => {
    const items = [
      item({ id: 'logro', type: 'logro' }),
      item({ id: 'sug', type: 'sugerencia' }),
      item({ id: 'baja', priority: 'baja' }),
      item({ id: 'alta', priority: 'alta' }),
      item({ id: 'media', priority: 'media' }),
    ];
    expect(sortItems(items).map(i => i.id)).toEqual(['alta', 'media', 'baja', 'sug', 'logro']);
  });
  it('un hallazgo sin prioridad cuenta como media y conserva el orden de ingreso', () => {
    const items = [item({ id: 'a', priority: 'baja' }), item({ id: 'b' }), item({ id: 'c', priority: 'media' })];
    expect(sortItems(items).map(i => i.id)).toEqual(['b', 'c', 'a']);
  });
  it('no muta el arreglo original', () => {
    const items = [item({ id: '1', type: 'logro' }), item({ id: '2' })];
    sortItems(items);
    expect(items.map(i => i.id)).toEqual(['1', '2']);
  });
});

describe('conteos y texto del aviso', () => {
  const items = [item({}), item({}), item({ type: 'sugerencia' })];
  it('cuenta por tipo', () => {
    expect(countByType(items)).toEqual({ hallazgo: 2, sugerencia: 1, logro: 0 });
  });
  it('omite los tipos en cero y usa singular/plural', () => {
    expect(countsText(items)).toBe('2 hallazgos, 1 sugerencia');
    expect(countsText([item({ type: 'logro' })])).toBe('1 logro');
  });
  it('mensaje de notificación', () => {
    expect(notificationMessage('Septiembre 2026', items)).toBe('Septiembre 2026: 2 hallazgos, 1 sugerencia');
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run utils/feedback.test.ts`
Expected: FAIL — `Failed to resolve import "./feedback"`.

- [ ] **Step 3: Implementar `utils/feedback.ts`**

```ts
// Retroalimentación de Econexo a una empresa: tipos y reglas puras, sin
// Supabase ni DOM.
//
// Los días del período se guardan como 'YYYY-MM-DD' calculados con
// constructores locales, igual que utils/dateRange.ts: nunca toISOString(),
// que en Chile desde las 20–21 h ya da el día siguiente.

import { lastDayOfMonth } from './dateRange';

export type FeedbackItemType = 'hallazgo' | 'sugerencia' | 'logro';
export type FeedbackPriority = 'alta' | 'media' | 'baja';

export interface FeedbackItem {
  id: string;
  type: FeedbackItemType;
  title: string;
  detail: string;
  /** Solo en hallazgos. Si falta se trata como 'media'. */
  priority?: FeedbackPriority;
}

export interface FeedbackPeriod {
  start: string;
  end: string;
  label: string;
}

export interface FeedbackDraft {
  period_start: string;
  period_end: string;
  period_label: string;
  summary: string;
  items: FeedbackItem[];
}

export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const ITEM_TYPE_META: Record<FeedbackItemType, { label: string; plural: string; icon: string }> = {
  hallazgo:   { label: 'Hallazgo',   plural: 'Hallazgos',   icon: 'search' },
  sugerencia: { label: 'Sugerencia', plural: 'Sugerencias', icon: 'lightbulb' },
  logro:      { label: 'Logro',      plural: 'Logros',      icon: 'check_circle' },
};

export const PRIORITY_LABEL: Record<FeedbackPriority, string> = {
  alta: 'Prioridad alta', media: 'Prioridad media', baja: 'Prioridad baja',
};

const TYPE_ORDER: Record<FeedbackItemType, number> = { hallazgo: 0, sugerencia: 1, logro: 2 };
const PRIORITY_ORDER: Record<FeedbackPriority, number> = { alta: 0, media: 1, baja: 2 };

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (year: number, monthIndex: number, day: number) => `${year}-${pad(monthIndex + 1)}-${pad(day)}`;

/** Mes completo. `monthIndex` es 0–11 y puede desbordar (-1 = diciembre del año anterior). */
export function monthPeriod(year: number, monthIndex: number): FeedbackPeriod {
  const first = new Date(year, monthIndex, 1);
  const y = first.getFullYear();
  const m = first.getMonth();
  return { start: ymd(y, m, 1), end: ymd(y, m, lastDayOfMonth(y, m)), label: `${MONTH_NAMES[m]} ${y}` };
}

export function quarterPeriod(year: number, quarter: 1 | 2 | 3 | 4): FeedbackPeriod {
  const firstMonth = (quarter - 1) * 3;
  const lastMonth = firstMonth + 2;
  return {
    start: ymd(year, firstMonth, 1),
    end: ymd(year, lastMonth, lastDayOfMonth(year, lastMonth)),
    label: `T${quarter} ${year}`,
  };
}

/** La revisión se hace sobre el mes que acaba de terminar. */
export function defaultPeriod(today: Date = new Date()): FeedbackPeriod {
  return monthPeriod(today.getFullYear(), today.getMonth() - 1);
}

/** Error legible si el informe no se puede publicar; null si está bien. */
export function validateReport(draft: FeedbackDraft): string | null {
  if (!draft.period_start || !draft.period_end) return 'Falta el período.';
  if (draft.period_end < draft.period_start) return 'La fecha de término es anterior a la de inicio.';
  if (!draft.period_label.trim()) return 'Falta la etiqueta del período.';
  if (draft.items.length === 0) return 'Agrega al menos un punto.';
  if (draft.items.some(i => !i.title.trim())) return 'Todos los puntos necesitan un título.';
  return null;
}

/** Hallazgos (alta → media → baja), luego sugerencias, luego logros. Estable. */
export function sortItems(items: FeedbackItem[]): FeedbackItem[] {
  return [...items].sort((a, b) => {
    const byType = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    if (byType !== 0 || a.type !== 'hallazgo') return byType;
    return PRIORITY_ORDER[a.priority ?? 'media'] - PRIORITY_ORDER[b.priority ?? 'media'];
  });
}

export function countByType(items: FeedbackItem[]): Record<FeedbackItemType, number> {
  const counts: Record<FeedbackItemType, number> = { hallazgo: 0, sugerencia: 0, logro: 0 };
  for (const i of items) counts[i.type] += 1;
  return counts;
}

/** «2 hallazgos, 1 sugerencia»: omite los tipos en cero. */
export function countsText(items: FeedbackItem[]): string {
  const counts = countByType(items);
  return (Object.keys(TYPE_ORDER) as FeedbackItemType[])
    .filter(t => counts[t] > 0)
    .map(t => `${counts[t]} ${(counts[t] === 1 ? ITEM_TYPE_META[t].label : ITEM_TYPE_META[t].plural).toLowerCase()}`)
    .join(', ');
}

export function notificationMessage(label: string, items: FeedbackItem[]): string {
  return `${label}: ${countsText(items)}`;
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npx vitest run utils/feedback.test.ts`
Expected: PASS (todos los `it`).

- [ ] **Step 5: Commit**

```bash
git add utils/feedback.ts utils/feedback.test.ts
git commit -m "feat(retroalimentacion): reglas puras de períodos, validación y orden

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Servicio `services/feedbackService.ts`

**Files:**
- Create: `services/feedbackService.ts`

**Interfaces:**
- Consumes: `FeedbackDraft`, `validateReport`, `notificationMessage` (Task 2); `createNotification` (`services/notificationService.ts`); tabla y RPC (Task 1).
- Produces:
  - `interface FeedbackReport extends FeedbackDraft { id: string; company_id: string; status: 'draft' | 'published'; published_at: string | null; read_at: string | null; created_at: string; updated_at: string }`
  - `listCompanyReports(companyId: string, includeDrafts: boolean): Promise<FeedbackReport[]>`
  - `latestPublished(companyId: string): Promise<FeedbackReport | null>`
  - `saveReport(companyId: string, draft: FeedbackDraft, current: FeedbackReport | null): Promise<FeedbackReport>` — conserva el estado de `current` (nuevo = borrador)
  - `publishReport(companyId: string, companyName: string, draft: FeedbackDraft, current: FeedbackReport | null): Promise<{ report: FeedbackReport; notifyFailed: boolean }>`
  - `deleteReport(id: string): Promise<void>`
  - `markRead(id: string): Promise<void>`

Sin test unitario: es una capa delgada sobre Supabase (el repo no mockea Supabase en ningún test); la lógica que decide va en Task 2 y se verifica a mano en Task 6.

- [ ] **Step 1: Implementar el servicio**

```ts
// Acceso a feedback_reports. Las reglas (validación, texto del aviso) viven en
// utils/feedback.ts; aquí solo se lee, se escribe y se avisa.

import { supabase } from './supabase';
import { createNotification } from './notificationService';
import { FeedbackDraft, validateReport, notificationMessage } from '../utils/feedback';

export interface FeedbackReport extends FeedbackDraft {
  id: string;
  company_id: string;
  status: 'draft' | 'published';
  published_at: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, company_id, period_start, period_end, period_label, summary, items, status, published_at, read_at, created_at, updated_at';

export async function listCompanyReports(companyId: string, includeDrafts: boolean): Promise<FeedbackReport[]> {
  let query = supabase
    .from('feedback_reports')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .order('period_start', { ascending: false })
    .order('created_at', { ascending: false });
  if (!includeDrafts) query = query.eq('status', 'published');
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as FeedbackReport[];
}

export async function latestPublished(companyId: string): Promise<FeedbackReport | null> {
  const { data, error } = await supabase
    .from('feedback_reports')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('status', 'published')
    .order('period_start', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as FeedbackReport) || null;
}

async function upsert(
  companyId: string,
  draft: FeedbackDraft,
  current: FeedbackReport | null,
  extra: Partial<FeedbackReport>,
): Promise<FeedbackReport> {
  const payload = {
    company_id: companyId,
    period_start: draft.period_start,
    period_end: draft.period_end,
    period_label: draft.period_label.trim(),
    summary: draft.summary,
    items: draft.items,
    updated_at: new Date().toISOString(),
    ...extra,
  };

  if (current) {
    const { data, error } = await supabase
      .from('feedback_reports').update(payload).eq('id', current.id).select(COLUMNS).single();
    if (error) throw error;
    return data as FeedbackReport;
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('feedback_reports')
    .insert({ ...payload, created_by: user?.id ?? null })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as FeedbackReport;
}

/** Guarda sin cambiar el estado: un informe nuevo queda en borrador, uno publicado sigue publicado. */
export function saveReport(companyId: string, draft: FeedbackDraft, current: FeedbackReport | null): Promise<FeedbackReport> {
  return upsert(companyId, draft, current, { status: current?.status ?? 'draft' });
}

/**
 * Publica y avisa a la empresa. Si ya estaba publicado solo actualiza el
 * contenido: no reenvía el aviso ni toca read_at.
 * Lanza Error con el mensaje de validateReport si el informe está incompleto.
 */
export async function publishReport(
  companyId: string,
  companyName: string,
  draft: FeedbackDraft,
  current: FeedbackReport | null,
): Promise<{ report: FeedbackReport; notifyFailed: boolean }> {
  const invalid = validateReport(draft);
  if (invalid) throw new Error(invalid);

  const wasPublished = current?.status === 'published';
  const report = await upsert(companyId, draft, current, {
    status: 'published',
    published_at: current?.published_at ?? new Date().toISOString(),
  });

  if (wasPublished) return { report, notifyFailed: false };

  const result = await createNotification({
    userId: companyId,
    title: 'Nueva retroalimentación de Econexo',
    message: notificationMessage(report.period_label, report.items),
    type: 'report',
    metadata: { feedback_id: report.id, company_name: companyName },
  });
  return { report, notifyFailed: !result.success };
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from('feedback_reports').delete().eq('id', id);
  if (error) throw error;
}

export async function markRead(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_feedback_read', { report_id: id });
  if (error) throw error;
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "feedback" || echo "sin errores en feedback"`
Expected: `sin errores en feedback`. (El repo puede tener errores de tipos previos en otros archivos; solo importan los nuevos.)

- [ ] **Step 3: Commit**

```bash
git add services/feedbackService.ts
git commit -m "feat(retroalimentacion): servicio de informes con publicación y aviso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Editor admin `FeedbackManager` + botón en la ficha

**Files:**
- Create: `components/FeedbackItemList.tsx`
- Create: `components/admin/FeedbackManager.tsx`
- Modify: `components/ClientOverviewModal.tsx` (estado + botón después del bloque «Generar Documentos», y render del modal al final del componente)

**Interfaces:**
- Consumes: todo lo de Task 2 y Task 3; `useToast` (`success|error|warning|info(message)`), `useConfirm` (`(opts: { title, message, confirmLabel?, cancelLabel?, danger? }) => Promise<boolean>`).
- Produces:
  - `FeedbackItemList: React.FC<{ items: FeedbackItem[]; dark?: boolean }>` — puntos agrupados por tipo, ordenados con `sortItems`.
  - `FeedbackManager: React.FC<{ companyId: string; companyName: string; onClose: () => void }>`

- [ ] **Step 1: Crear `components/FeedbackItemList.tsx`**

Lo usa la pantalla del cliente (con `dark`) y la vista previa del admin (sin `dark`).

```tsx
import React from 'react';
import { FeedbackItem, FeedbackItemType, ITEM_TYPE_META, PRIORITY_LABEL, sortItems } from '../utils/feedback';

const TYPE_STYLE: Record<FeedbackItemType, { icon: string; chip: string }> = {
    hallazgo:   { icon: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30',  chip: 'text-amber-700' },
    sugerencia: { icon: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30',        chip: 'text-sky-700' },
    logro:      { icon: 'text-primary bg-green-50 dark:bg-green-900/30',    chip: 'text-green-700' },
};

const PRIORITY_STYLE = {
    alta:  'bg-red-50 text-red-600 border-red-100',
    media: 'bg-amber-50 text-amber-700 border-amber-100',
    baja:  'bg-gray-50 text-gray-500 border-gray-200',
};

const FeedbackItemList: React.FC<{ items: FeedbackItem[]; dark?: boolean }> = ({ items, dark }) => {
    const sorted = sortItems(items);
    const groups = (['hallazgo', 'sugerencia', 'logro'] as FeedbackItemType[])
        .map(type => ({ type, items: sorted.filter(i => i.type === type) }))
        .filter(g => g.items.length > 0);

    const title = dark ? 'text-gray-900 dark:text-white' : 'text-gray-900';
    const body = dark ? 'text-gray-600 dark:text-gray-300' : 'text-gray-600';
    const card = dark ? 'bg-white/70 dark:bg-slate-800/60 border-white/80 dark:border-white/10' : 'bg-white border-gray-100';

    return (
        <div className="space-y-5">
            {groups.map(group => (
                <div key={group.type}>
                    <h4 className={`text-[10px] font-black uppercase tracking-widest mb-2 ${TYPE_STYLE[group.type].chip}`}>
                        {ITEM_TYPE_META[group.type].plural} · {group.items.length}
                    </h4>
                    <ul className="space-y-2">
                        {group.items.map(item => (
                            <li key={item.id} className={`flex gap-3 p-3 rounded-2xl border ${card}`}>
                                <div className={`size-9 shrink-0 rounded-xl flex items-center justify-center ${TYPE_STYLE[item.type].icon}`}>
                                    <span className="material-symbols-outlined text-lg">{ITEM_TYPE_META[item.type].icon}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className={`text-sm font-black leading-snug ${title}`}>{item.title}</p>
                                        {item.type === 'hallazgo' && (
                                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[item.priority ?? 'media']}`}>
                                                {PRIORITY_LABEL[item.priority ?? 'media']}
                                            </span>
                                        )}
                                    </div>
                                    {item.detail.trim() && (
                                        <p className={`text-xs mt-1 leading-relaxed whitespace-pre-line ${body}`}>{item.detail}</p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
};

export default FeedbackItemList;
```

- [ ] **Step 2: Crear `components/admin/FeedbackManager.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import {
    FeedbackDraft, FeedbackItem, FeedbackItemType, FeedbackPriority, ITEM_TYPE_META, MONTH_NAMES,
    countsText, defaultPeriod, monthPeriod, quarterPeriod, validateReport,
} from '../../utils/feedback';
import {
    FeedbackReport, listCompanyReports, saveReport, publishReport, deleteReport,
} from '../../services/feedbackService';

interface FeedbackManagerProps {
    companyId: string;
    companyName: string;
    onClose: () => void;
}

type PeriodMode = 'month' | 'quarter' | 'custom';

const emptyDraft = (): FeedbackDraft => {
    const p = defaultPeriod();
    return { period_start: p.start, period_end: p.end, period_label: p.label, summary: '', items: [] };
};

const newItem = (type: FeedbackItemType): FeedbackItem => ({
    id: crypto.randomUUID(), type, title: '', detail: '', ...(type === 'hallazgo' ? { priority: 'media' as FeedbackPriority } : {}),
});

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

const inputCls = 'w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:border-primary';
const labelCls = 'text-[10px] font-black uppercase text-gray-400';

const FeedbackManager: React.FC<FeedbackManagerProps> = ({ companyId, companyName, onClose }) => {
    const toast = useToast();
    const confirm = useConfirm();

    const [reports, setReports] = useState<FeedbackReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<FeedbackReport | null>(null);
    const [draft, setDraft] = useState<FeedbackDraft | null>(null);
    const [saving, setSaving] = useState(false);

    // Selectores de período del editor
    const now = new Date();
    const [mode, setMode] = useState<PeriodMode>('month');
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() === 0 ? 11 : now.getMonth() - 1);
    const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>((Math.floor(now.getMonth() / 3) || 4) as 1 | 2 | 3 | 4);

    const load = async () => {
        setLoading(true);
        try {
            setReports(await listCompanyReports(companyId, true));
        } catch (err: any) {
            toast.error(`No se pudieron cargar los informes: ${err.message ?? err}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [companyId]);

    const openNew = () => {
        const d = emptyDraft();
        const start = new Date(`${d.period_start}T12:00:00`);
        setMode('month');
        setYear(start.getFullYear());
        setMonth(start.getMonth());
        setEditing(null);
        setDraft({ ...d, items: [newItem('hallazgo')] });
    };

    const openExisting = (r: FeedbackReport) => {
        setMode('custom');
        setEditing(r);
        setDraft({
            period_start: r.period_start, period_end: r.period_end, period_label: r.period_label,
            summary: r.summary, items: r.items,
        });
    };

    const closeEditor = () => { setEditing(null); setDraft(null); };

    const applyPeriod = (m: PeriodMode, y: number, mo: number, q: 1 | 2 | 3 | 4) => {
        if (m === 'custom') return;
        const p = m === 'month' ? monthPeriod(y, mo) : quarterPeriod(y, q);
        setDraft(d => d && ({ ...d, period_start: p.start, period_end: p.end, period_label: p.label }));
    };

    const patchItem = (id: string, patch: Partial<FeedbackItem>) =>
        setDraft(d => d && ({ ...d, items: d.items.map(i => i.id === id ? { ...i, ...patch } : i) }));

    const changeType = (id: string, type: FeedbackItemType) =>
        patchItem(id, type === 'hallazgo' ? { type, priority: 'media' } : { type, priority: undefined });

    const handleSave = async () => {
        if (!draft) return;
        setSaving(true);
        try {
            const saved = await saveReport(companyId, draft, editing);
            toast.success(saved.status === 'published' ? 'Cambios guardados.' : 'Borrador guardado.');
            closeEditor();
            load();
        } catch (err: any) {
            toast.error(`No se pudo guardar: ${err.message ?? err}`);
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        if (!draft) return;
        const invalid = validateReport(draft);
        if (invalid) { toast.warning(invalid); return; }
        const republish = editing?.status === 'published';
        const ok = await confirm({
            title: republish ? 'Actualizar informe publicado' : 'Publicar retroalimentación',
            message: republish
                ? `Se actualizará el informe de ${draft.period_label} que ${companyName} ya puede ver. No se enviará un nuevo aviso.`
                : `${companyName} verá este informe de ${draft.period_label} y recibirá un aviso por notificación y correo.`,
            confirmLabel: republish ? 'Actualizar' : 'Publicar',
        });
        if (!ok) return;
        setSaving(true);
        try {
            const { notifyFailed } = await publishReport(companyId, companyName, draft, editing);
            if (notifyFailed) toast.warning('Informe publicado, pero el aviso a la empresa falló.');
            else toast.success(republish ? 'Informe actualizado.' : 'Informe publicado y empresa avisada.');
            closeEditor();
            load();
        } catch (err: any) {
            toast.error(`No se pudo publicar: ${err.message ?? err}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!editing) { closeEditor(); return; }
        const ok = await confirm({
            title: 'Eliminar informe',
            message: editing.status === 'published'
                ? `La empresa dejará de ver el informe de ${editing.period_label}. Esto no se puede deshacer.`
                : `Se eliminará el borrador de ${editing.period_label}.`,
            confirmLabel: 'Eliminar',
            danger: true,
        });
        if (!ok) return;
        setSaving(true);
        try {
            await deleteReport(editing.id);
            toast.success('Informe eliminado.');
            closeEditor();
            load();
        } catch (err: any) {
            toast.error(`No se pudo eliminar: ${err.message ?? err}`);
        } finally {
            setSaving(false);
        }
    };

    const statusBadge = (r: FeedbackReport) => {
        if (r.status === 'draft') return <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Borrador</span>;
        if (r.read_at) return <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700">Leído el {fmtDate(r.read_at)}</span>;
        return <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">Publicado · sin leer</span>;
    };

    const years = [now.getFullYear() - 1, now.getFullYear()];

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
            <div className="relative bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 p-5 border-b border-gray-100">
                    {draft && (
                        <button onClick={closeEditor} disabled={saving} className="size-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                            <span className="material-symbols-outlined text-gray-500 text-lg">arrow_back</span>
                        </button>
                    )}
                    <div className="flex-1 min-w-0">
                        <h2 className="font-black text-gray-900 text-lg leading-tight truncate">Retroalimentación</h2>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate">{companyName}</p>
                    </div>
                    <button onClick={onClose} disabled={saving} className="size-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                        <span className="material-symbols-outlined text-gray-500 text-lg">close</span>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-5 space-y-5">
                    {!draft ? (
                        /* ── Lista ── */
                        <>
                            <button onClick={openNew} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-white font-black text-sm hover:bg-primary/90 transition-colors">
                                <span className="material-symbols-outlined text-lg">add</span>
                                Nueva retroalimentación
                            </button>
                            {loading ? (
                                <div className="flex justify-center py-10">
                                    <div className="size-8 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
                                </div>
                            ) : reports.length === 0 ? (
                                <p className="text-center text-xs text-gray-400 font-bold py-8">Todavía no hay informes para esta empresa.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {reports.map(r => (
                                        <li key={r.id}>
                                            <button onClick={() => openExisting(r)} className="w-full text-left p-4 rounded-2xl border border-gray-100 hover:border-primary/30 hover:bg-primary/5 transition-colors">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="font-black text-gray-900 text-sm">{r.period_label}</p>
                                                    {statusBadge(r)}
                                                </div>
                                                <p className="text-xs text-gray-500 font-bold mt-1">{countsText(r.items) || 'Sin puntos'}</p>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    ) : (
                        /* ── Editor ── */
                        <>
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    {(['month', 'quarter', 'custom'] as PeriodMode[]).map(m => (
                                        <button
                                            key={m}
                                            onClick={() => { setMode(m); applyPeriod(m, year, month, quarter); }}
                                            className={`flex-1 py-2 rounded-xl text-xs font-black border transition-colors ${mode === m ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200'}`}
                                        >
                                            {m === 'month' ? 'Mes' : m === 'quarter' ? 'Trimestre' : 'Personalizado'}
                                        </button>
                                    ))}
                                </div>

                                {mode === 'month' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <select className={inputCls} value={month} onChange={e => { const v = +e.target.value; setMonth(v); applyPeriod('month', year, v, quarter); }}>
                                            {MONTH_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
                                        </select>
                                        <select className={inputCls} value={year} onChange={e => { const v = +e.target.value; setYear(v); applyPeriod('month', v, month, quarter); }}>
                                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                    </div>
                                )}

                                {mode === 'quarter' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <select className={inputCls} value={quarter} onChange={e => { const v = +e.target.value as 1 | 2 | 3 | 4; setQuarter(v); applyPeriod('quarter', year, month, v); }}>
                                            {[1, 2, 3, 4].map(q => <option key={q} value={q}>T{q}</option>)}
                                        </select>
                                        <select className={inputCls} value={year} onChange={e => { const v = +e.target.value; setYear(v); applyPeriod('quarter', v, month, quarter); }}>
                                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                    </div>
                                )}

                                {mode === 'custom' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelCls}>Desde</label>
                                            <input type="date" className={inputCls} value={draft.period_start} onChange={e => setDraft({ ...draft, period_start: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Hasta</label>
                                            <input type="date" className={inputCls} value={draft.period_end} onChange={e => setDraft({ ...draft, period_end: e.target.value })} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className={labelCls}>Etiqueta que ve la empresa</label>
                                            <input className={inputCls} value={draft.period_label} placeholder="Ej: Temporada alta 2026" onChange={e => setDraft({ ...draft, period_label: e.target.value })} />
                                        </div>
                                    </div>
                                )}
                                {mode !== 'custom' && (
                                    <p className="text-xs text-gray-500 font-bold">Período: {draft.period_label}</p>
                                )}
                            </div>

                            <div>
                                <label className={labelCls}>Resumen general</label>
                                <textarea
                                    className={`${inputCls} min-h-[80px] font-medium`}
                                    value={draft.summary}
                                    placeholder="Visión general del período…"
                                    onChange={e => setDraft({ ...draft, summary: e.target.value })}
                                />
                            </div>

                            <div className="space-y-3">
                                <h3 className={labelCls}>Puntos</h3>
                                {draft.items.map(item => (
                                    <div key={item.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50 space-y-2">
                                        <div className="flex items-center gap-2">
                                            {(['hallazgo', 'sugerencia', 'logro'] as FeedbackItemType[]).map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => changeType(item.id, t)}
                                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase border transition-colors ${item.type === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'}`}
                                                >
                                                    <span className="material-symbols-outlined text-sm">{ITEM_TYPE_META[t].icon}</span>
                                                    {ITEM_TYPE_META[t].label}
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => setDraft({ ...draft, items: draft.items.filter(i => i.id !== item.id) })}
                                                className="ml-auto size-8 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 flex items-center justify-center"
                                                title="Quitar punto"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                        <input className={inputCls} value={item.title} placeholder="Título" onChange={e => patchItem(item.id, { title: e.target.value })} />
                                        <textarea className={`${inputCls} min-h-[60px] font-medium`} value={item.detail} placeholder="Detalle (opcional)" onChange={e => patchItem(item.id, { detail: e.target.value })} />
                                        {item.type === 'hallazgo' && (
                                            <select className={inputCls} value={item.priority ?? 'media'} onChange={e => patchItem(item.id, { priority: e.target.value as FeedbackPriority })}>
                                                <option value="alta">Prioridad alta</option>
                                                <option value="media">Prioridad media</option>
                                                <option value="baja">Prioridad baja</option>
                                            </select>
                                        )}
                                    </div>
                                ))}
                                <div className="grid grid-cols-3 gap-2">
                                    {(['hallazgo', 'sugerencia', 'logro'] as FeedbackItemType[]).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setDraft({ ...draft, items: [...draft.items, newItem(t)] })}
                                            className="flex items-center justify-center gap-1 py-2 rounded-xl border border-dashed border-gray-300 text-[10px] font-black uppercase text-gray-500 hover:border-primary hover:text-primary"
                                        >
                                            <span className="material-symbols-outlined text-sm">add</span>
                                            {ITEM_TYPE_META[t].label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {draft && (
                    <div className="p-4 border-t border-gray-100 flex gap-2">
                        <button onClick={handleDelete} disabled={saving} className="size-11 shrink-0 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center" title="Eliminar">
                            <span className="material-symbols-outlined">delete</span>
                        </button>
                        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-black text-sm hover:bg-gray-50 disabled:opacity-50">
                            {editing?.status === 'published' ? 'Guardar cambios' : 'Guardar borrador'}
                        </button>
                        <button onClick={handlePublish} disabled={saving} className="flex-1 py-3 rounded-xl bg-primary text-white font-black text-sm hover:bg-primary/90 disabled:opacity-50">
                            {editing?.status === 'published' ? 'Actualizar' : 'Publicar'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FeedbackManager;
```

Nota: «Guardar cambios» en un informe publicado usa `saveReport`, que conserva `status: 'published'` sin avisar; «Actualizar» pasa por `publishReport`, que además valida. Ambos dejan `read_at` intacto porque ninguno lo incluye en el payload.

- [ ] **Step 3: Conectar en `components/ClientOverviewModal.tsx`**

Agregar el import junto a los demás:

```tsx
import FeedbackManager from './admin/FeedbackManager';
```

Agregar estado junto a `showReportModal` (línea ~82):

```tsx
    const [showFeedback, setShowFeedback] = useState(false);
```

Inmediatamente después del `</div>` que cierra el bloque «Generar Documentos» (antes de `{/* ── Eco-Report Period Modal ── */}`), agregar:

```tsx
                            {/* ── Retroalimentación ── */}
                            <button
                                onClick={() => setShowFeedback(true)}
                                className="w-full flex items-center gap-3 p-4 bg-sky-50 border border-sky-100 rounded-2xl hover:bg-sky-100 transition-colors group"
                            >
                                <div className="size-10 bg-sky-100 text-sky-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined">rate_review</span>
                                </div>
                                <div className="text-left flex-1">
                                    <p className="text-xs font-black uppercase text-sky-700">Retroalimentación</p>
                                    <p className="text-[10px] font-bold text-sky-600/70">Hallazgos, sugerencias y logros del período</p>
                                </div>
                                <span className="material-symbols-outlined text-sky-400">chevron_right</span>
                            </button>
```

Y como último hijo del elemento raíz `fixed inset-0 z-[70]` (justo antes de su `</div>` de cierre), agregar:

```tsx
            {showFeedback && (
                <FeedbackManager companyId={user.id} companyName={displayName} onClose={() => setShowFeedback(false)} />
            )}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: termina con `✓ built in …` sin errores.

- [ ] **Step 5: Commit**

```bash
git add components/FeedbackItemList.tsx components/admin/FeedbackManager.tsx components/ClientOverviewModal.tsx
git commit -m "feat(retroalimentacion): editor admin desde la ficha de empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Lado empresa — tarjeta del Dashboard y `/retroalimentacion`

**Files:**
- Create: `components/FeedbackCard.tsx`
- Create: `screens/Feedback.tsx`
- Modify: `screens/Dashboard.tsx` (import + montar antes de `{/* Eco-Puntos Card - RESTORED */}`)
- Modify: `App.tsx` (lazy import + ruta)

**Interfaces:**
- Consumes: `latestPublished`, `listCompanyReports`, `markRead`, `FeedbackReport` (Task 3); `countByType`, `ITEM_TYPE_META` (Task 2); `FeedbackItemList` (Task 4).
- Produces: `FeedbackCard: React.FC` (sin props), `Feedback` (pantalla default export).

- [ ] **Step 1: Crear `components/FeedbackCard.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { FeedbackReport, latestPublished } from '../services/feedbackService';
import { countByType, FeedbackItemType, ITEM_TYPE_META } from '../utils/feedback';

// Tarjeta del Dashboard con la última retroalimentación publicada. Se carga
// sola; si no hay informes (o la tabla aún no existe) no muestra nada.
const FeedbackCard: React.FC = () => {
    const navigate = useNavigate();
    const [report, setReport] = useState<FeedbackReport | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            try {
                const latest = await latestPublished(user.id);
                if (!cancelled) setReport(latest);
            } catch {
                // Sin tabla o sin permiso: la tarjeta simplemente no aparece.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (!report) return null;

    const counts = countByType(report.items);
    const unread = !report.read_at;

    return (
        <section
            onClick={() => navigate('/retroalimentacion')}
            className="relative overflow-hidden rounded-[20px] p-5 bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/80 dark:border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group"
        >
            <div className="flex items-center gap-4">
                <div className="relative size-12 shrink-0 rounded-2xl bg-sky-50 dark:bg-sky-900/30 text-sky-600 flex items-center justify-center border border-sky-100 dark:border-sky-800/40 group-hover:scale-110 transition-transform duration-500">
                    <span className="material-symbols-outlined text-2xl">rate_review</span>
                    {unread && <span className="absolute -top-1 -right-1 size-3 rounded-full bg-primary ring-2 ring-white dark:ring-slate-900" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-gray-900 dark:text-white truncate">Retroalimentación de Econexo</h3>
                        {unread && <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary text-white">Nuevo</span>}
                    </div>
                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">{report.period_label}</p>
                    <div className="flex flex-wrap gap-3 mt-1.5">
                        {(Object.keys(counts) as FeedbackItemType[]).filter(t => counts[t] > 0).map(t => (
                            <span key={t} className="flex items-center gap-1 text-[10px] font-black text-gray-600 dark:text-gray-300">
                                <span className="material-symbols-outlined text-sm">{ITEM_TYPE_META[t].icon}</span>
                                {counts[t]} {(counts[t] === 1 ? ITEM_TYPE_META[t].label : ITEM_TYPE_META[t].plural).toLowerCase()}
                            </span>
                        ))}
                    </div>
                </div>
                <span className="material-symbols-outlined text-gray-400 group-hover:text-primary transition-colors">arrow_forward</span>
            </div>
        </section>
    );
};

export default FeedbackCard;
```

- [ ] **Step 2: Crear `screens/Feedback.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import FeedbackItemList from '../components/FeedbackItemList';
import { supabase } from '../services/supabase';
import { FeedbackReport, listCompanyReports, markRead } from '../services/feedbackService';
import { countsText } from '../utils/feedback';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

const Feedback: React.FC = () => {
    const navigate = useNavigate();
    const [reports, setReports] = useState<FeedbackReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [openId, setOpenId] = useState<string | null>(null);

    // Marca leído en la base y en pantalla; si falla no molesta a la empresa.
    const open = (r: FeedbackReport) => {
        setOpenId(prev => prev === r.id ? null : r.id);
        if (!r.read_at) {
            markRead(r.id).catch(() => {});
            setReports(prev => prev.map(x => x.id === r.id ? { ...x, read_at: new Date().toISOString() } : x));
        }
    };

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }
            try {
                const list = await listCompanyReports(user.id, false);
                setReports(list);
                if (list[0]) open(list[0]);
            } catch {
                setReports([]);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    return (
        <div className="relative font-sans bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-3xl lg:max-w-5xl mx-auto pb-28 md:pb-8 overflow-hidden">
            <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/40 dark:border-slate-700/40 shadow-sm">
                <div className="p-4 flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 rounded-full border border-white/40 dark:border-slate-600/40 shadow-sm transition-all">
                        <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">arrow_back</span>
                    </button>
                    <h2 className="text-lg font-display font-black text-gray-900 dark:text-white">Retroalimentación</h2>
                </div>
            </div>

            <main className="relative p-5 space-y-3">
                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="size-10 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
                    </div>
                ) : reports.length === 0 ? (
                    <div className="text-center py-16 space-y-2">
                        <span className="material-symbols-outlined text-5xl text-gray-300 dark:text-gray-600">rate_review</span>
                        <p className="text-sm font-black text-gray-500 dark:text-gray-400">Aún no tienes retroalimentación</p>
                        <p className="text-xs font-bold text-gray-400 dark:text-gray-500">Cuando Econexo publique un informe de tu gestión, aparecerá aquí.</p>
                    </div>
                ) : (
                    reports.map(r => {
                        const isOpen = openId === r.id;
                        return (
                            <article key={r.id} className="rounded-[20px] bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/80 dark:border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] overflow-hidden">
                                <button onClick={() => open(r)} className="w-full text-left p-5 flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-base font-display font-black text-gray-900 dark:text-white">{r.period_label}</p>
                                        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                                            {r.published_at ? `Publicado el ${fmtDate(r.published_at)} · ` : ''}{countsText(r.items)}
                                        </p>
                                    </div>
                                    <span className={`material-symbols-outlined text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                </button>
                                {isOpen && (
                                    <div className="px-5 pb-5 space-y-5">
                                        {r.summary.trim() && (
                                            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-line">{r.summary}</p>
                                        )}
                                        <FeedbackItemList items={r.items} dark />
                                    </div>
                                )}
                            </article>
                        );
                    })
                )}
            </main>

            <Navbar />
        </div>
    );
};

export default Feedback;
```

- [ ] **Step 3: Montar la tarjeta en `screens/Dashboard.tsx`**

Agregar el import con los demás componentes:

```tsx
import FeedbackCard from '../components/FeedbackCard';
```

Justo antes de `{/* Eco-Puntos Card - RESTORED */}`:

```tsx
        <FeedbackCard />

```

- [ ] **Step 4: Agregar la ruta en `App.tsx`**

Junto a los demás `lazy`:

```tsx
const Feedback          = lazy(() => import('./screens/Feedback'));
```

Junto a la ruta `/ley-rep`:

```tsx
          <Route path="/retroalimentacion" element={isAuthenticated ? <div className="md:ml-20 xl:ml-64"><Feedback /></div> : <Navigate to="/" />} />
```

- [ ] **Step 5: Build y tests**

Run: `npm run build && npm test`
Expected: build `✓ built in …`; vitest todos en verde (incluye `utils/feedback.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add components/FeedbackCard.tsx screens/Feedback.tsx screens/Dashboard.tsx App.tsx
git commit -m "feat(retroalimentacion): tarjeta en el Dashboard y pantalla /retroalimentacion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: PR, deploy y verificación

**Files:** ninguno nuevo.

- [ ] **Step 1: Push y PR**

```bash
git push -u origin feat/retroalimentacion
gh pr create --title "feat: retroalimentación Econexo → empresas" --body "$(cat <<'EOF'
Informes de retroalimentación (hallazgos, sugerencias, logros) por empresa y período.

- Admin: botón «Retroalimentación» en la ficha de empresa; borrador → publicar (avisa por push + correo).
- Empresa: tarjeta en el Dashboard y pantalla /retroalimentacion; marca de lectura visible para el admin.
- Migración `supabase/migrations/20261009_create_feedback_reports.sql` (correr a mano en el SQL Editor).

Spec: docs/superpowers/specs/2026-10-09-retroalimentacion-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Esperar CI en verde y mergear**

Run: `gh pr checks --watch && gh pr merge --merge --delete-branch`
Expected: checks `pass`; PR mergeado.

- [ ] **Step 3: Verificar deploy en Vercel**

Comprobar con las herramientas de Vercel (o `gh api` sobre el commit de merge) que el deploy de producción de `main` quedó en `READY`.

- [ ] **Step 4: Migración (la corre el usuario)**

Pedir al usuario que pegue `supabase/migrations/20261009_create_feedback_reports.sql` en el SQL Editor y confirme que la consulta de comprobación devuelve las dos políticas.

- [ ] **Step 5: Verificación manual en producción**

1. Admin → ficha de una empresa de prueba → Retroalimentación → nuevo con 1 hallazgo, 1 sugerencia, 1 logro → «Guardar borrador». Aparece como «Borrador».
2. La empresa no ve la tarjeta mientras sea borrador.
3. Publicar → toast «Informe publicado y empresa avisada»; la empresa recibe notificación.
4. Como empresa: tarjeta con «Nuevo» en el Dashboard → `/retroalimentacion` → informe abierto; la tarjeta ya no muestra «Nuevo» al volver.
5. Admin: el informe dice «Leído el dd-mm-aaaa».
6. Admin edita el informe publicado → «Actualizar» → la empresa no recibe un segundo aviso y el estado sigue «Leído».
7. Con otra cuenta de empresa: no ve informes ajenos.
