import { describe, it, expect } from 'vitest';
import { monthRange, yearRange, isWithin, lastDayOfMonth } from './dateRange';

/** Cómo guarda la app un retiro con fecha elegida por el operario. */
const retiro = (fecha: string) => new Date(`${fecha}T12:00:00`).toISOString();

describe('monthRange', () => {
  it('incluye el último día del mes — la regresión del CGM de agosto', () => {
    // El bug original: `new Date(2026, 8, 0)` daba el 31 de agosto a las 00:00,
    // así que un retiro de ese mismo día quedaba fuera del certificado.
    expect(isWithin(retiro('2026-08-31'), monthRange(2026, 7))).toBe(true);
  });

  it('incluye el primer día del mes', () => {
    expect(isWithin(retiro('2026-08-01'), monthRange(2026, 7))).toBe(true);
  });

  it('excluye el día anterior y el siguiente', () => {
    expect(isWithin(retiro('2026-07-31'), monthRange(2026, 7))).toBe(false);
    expect(isWithin(retiro('2026-09-01'), monthRange(2026, 7))).toBe(false);
  });

  it('cruza el fin de año en diciembre', () => {
    const diciembre = monthRange(2026, 11);
    expect(isWithin(retiro('2026-12-31'), diciembre)).toBe(true);
    expect(isWithin(retiro('2027-01-01'), diciembre)).toBe(false);
  });

  it('respeta febrero en año bisiesto', () => {
    // 2028 es bisiesto: el 29 existe y debe entrar.
    const febrero = monthRange(2028, 1);
    expect(isWithin(retiro('2028-02-29'), febrero)).toBe(true);
    expect(isWithin(retiro('2028-03-01'), febrero)).toBe(false);
  });

  it('respeta febrero en año no bisiesto', () => {
    const febrero = monthRange(2027, 1);
    expect(isWithin(retiro('2027-02-28'), febrero)).toBe(true);
    expect(isWithin(retiro('2027-03-01'), febrero)).toBe(false);
  });

  it('cubre el último día de todos los meses de los próximos cinco años', () => {
    for (let year = 2026; year <= 2031; year++) {
      for (let m = 0; m < 12; m++) {
        const ultimo = lastDayOfMonth(year, m);
        const fecha = `${year}-${String(m + 1).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
        expect(isWithin(retiro(fecha), monthRange(year, m))).toBe(true);
      }
    }
  });

  it('el fin de un mes es exactamente el inicio del siguiente', () => {
    expect(monthRange(2026, 7).endExclusiveISO).toBe(monthRange(2026, 8).startISO);
  });

  it('también incluye un retiro registrado tarde en la noche del último día', () => {
    // Sin fecha elegida se guarda `new Date().toISOString()`, que a las 22:00
    // en Chile ya es del día siguiente en UTC.
    const tarde = new Date('2026-08-31T22:30:00').toISOString();
    expect(isWithin(tarde, monthRange(2026, 7))).toBe(true);
  });
});

describe('yearRange', () => {
  it('incluye el 31 de diciembre', () => {
    expect(isWithin(retiro('2026-12-31'), yearRange(2026))).toBe(true);
  });

  it('incluye el 1 de enero y excluye el año siguiente', () => {
    expect(isWithin(retiro('2026-01-01'), yearRange(2026))).toBe(true);
    expect(isWithin(retiro('2027-01-01'), yearRange(2026))).toBe(false);
  });
});

describe('isWithin', () => {
  it('devuelve false con fechas inválidas', () => {
    expect(isWithin('no-es-fecha', monthRange(2026, 7))).toBe(false);
  });

  it('acepta un Date igual que una cadena', () => {
    const r = monthRange(2026, 7);
    expect(isWithin(new Date(retiro('2026-08-15')), r)).toBe(true);
  });
});

describe('lastDayOfMonth', () => {
  it('devuelve la longitud real de cada mes', () => {
    expect(lastDayOfMonth(2026, 0)).toBe(31);  // enero
    expect(lastDayOfMonth(2026, 1)).toBe(28);  // febrero no bisiesto
    expect(lastDayOfMonth(2028, 1)).toBe(29);  // febrero bisiesto
    expect(lastDayOfMonth(2026, 3)).toBe(30);  // abril
    expect(lastDayOfMonth(2026, 11)).toBe(31); // diciembre
  });
});
