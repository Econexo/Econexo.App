// Rangos de fechas para los períodos de certificados y reportes.
//
// Toda la app guarda `created_at` en UTC pero razona en hora de Chile: cuando el
// operario elige una fecha de retiro se guarda como mediodía local convertido a
// UTC (`new Date(fecha + 'T12:00:00').toISOString()`). Por eso los límites se
// calculan con constructores locales y no con cadenas UTC.
//
// La regla que importa: el límite superior es el PRIMER instante del período
// siguiente, y se compara con `<` (exclusivo). El error clásico —y el que dejó
// fuera del CGM los retiros del 31 de agosto— es usar `new Date(y, m + 1, 0)`,
// que devuelve el último día a las 00:00 y descarta ese día entero.

export interface DateRange {
  /** Primer instante del período, en ISO/UTC. Comparar con `>=`. */
  startISO: string;
  /** Primer instante del período SIGUIENTE, en ISO/UTC. Comparar con `<`. */
  endExclusiveISO: string;
}

/**
 * Rango de un mes completo. `monthIndex` es 0–11, como en `Date`.
 * Se apoya en el constructor de `Date` para el desborde de mes y año, así que
 * funciona igual en diciembre, en febrero y en los años bisiestos que vengan.
 */
export function monthRange(year: number, monthIndex: number): DateRange {
  return {
    startISO: new Date(year, monthIndex, 1, 0, 0, 0, 0).toISOString(),
    endExclusiveISO: new Date(year, monthIndex + 1, 1, 0, 0, 0, 0).toISOString(),
  };
}

/** Rango de un año completo. */
export function yearRange(year: number): DateRange {
  return {
    startISO: new Date(year, 0, 1, 0, 0, 0, 0).toISOString(),
    endExclusiveISO: new Date(year + 1, 0, 1, 0, 0, 0, 0).toISOString(),
  };
}

/** ¿Cae esta fecha dentro del rango? Límite inferior inclusivo, superior exclusivo. */
export function isWithin(date: Date | string, range: DateRange): boolean {
  const t = typeof date === 'string' ? Date.parse(date) : date.getTime();
  if (Number.isNaN(t)) return false;
  return t >= Date.parse(range.startISO) && t < Date.parse(range.endExclusiveISO);
}

/**
 * Último día del mes (28, 29, 30 o 31). Para los textos del certificado
 * («del 01 al 31 de agosto»), no para filtrar.
 */
export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}
