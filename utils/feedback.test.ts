import { describe, it, expect } from 'vitest';
import {
  monthPeriod, quarterPeriod, defaultPeriod, validateReport, sortItems,
  countByType, countsText, notificationMessage, FeedbackDraft, FeedbackItem,
  validateSave, previousQuarter, detectPeriod,
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

describe('validateSave', () => {
  it('un borrador puede guardarse sin puntos, pero no sin período válido', () => {
    expect(validateSave(draft({ items: [] }), 'draft')).toBeNull();
    expect(validateSave(draft({ period_end: '' }), 'draft')).toMatch(/período/);
    expect(validateSave(draft({ period_start: '2026-09-30', period_end: '2026-09-01' }), 'draft')).toMatch(/anterior/);
    expect(validateSave(draft({ period_label: '  ' }), 'draft')).toMatch(/etiqueta/);
  });
  it('guardar cambios de un informe publicado exige el informe completo', () => {
    expect(validateSave(draft({ items: [] }), 'published')).toMatch(/al menos un punto/);
    expect(validateSave(draft({ items: [item({ title: ' ' })] }), 'published')).toMatch(/título/);
    expect(validateSave(draft(), 'published')).toBeNull();
  });
});

describe('selectores de período', () => {
  it('trimestre anterior: en febrero es T4 del año previo', () => {
    expect(previousQuarter(new Date(2027, 1, 10))).toEqual({ year: 2026, quarter: 4 });
    expect(previousQuarter(new Date(2026, 9, 9))).toEqual({ year: 2026, quarter: 3 });
  });
  it('reconoce si un rango guardado es un mes, un trimestre o personalizado', () => {
    expect(detectPeriod('2026-03-01', '2026-03-31')).toEqual({ mode: 'month', year: 2026, month: 2, quarter: 1 });
    expect(detectPeriod('2026-07-01', '2026-09-30')).toEqual({ mode: 'quarter', year: 2026, month: 6, quarter: 3 });
    expect(detectPeriod('2026-03-05', '2026-04-20')).toEqual({ mode: 'custom', year: 2026, month: 2, quarter: 1 });
  });
});
