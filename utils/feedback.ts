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
