// Formato de kilos, unificado para toda la app.
//
// Dos decisiones que vienen de cómo trabaja el gestor final:
//
//   1. UN decimal, no dos. Es la precisión con la que se pesa y se documenta.
//
//   2. Se TRUNCA, no se redondea. El gestor cierra hacia abajo, así que si
//      EcoNexo redondeara al alza sus cifras no cuadrarían con las del
//      comprobante de pesaje — y en una plataforma de trazabilidad esa
//      diferencia es justo la que alguien va a reclamar.
//
// El separador sigue la convención chilena: punto para miles, coma para
// decimales. Lo da `toLocaleString('es-CL')`.

/** Decimales con los que se muestra cualquier cantidad en kilos. */
export const KG_DECIMALS = 1;

/**
 * Trunca hacia abajo a `decimals` decimales.
 *
 * El paso por `toPrecision` no es adorno: `9.7 * 10` da 96.99999999999999 en
 * coma flotante, y un `Math.trunc` directo lo dejaría en 9,6. Redondear primero
 * a 12 cifras significativas absorbe ese error sin alterar el valor real.
 */
export function truncateTo(value: number, decimals = KG_DECIMALS): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  const scaled = Number((value * factor).toPrecision(12));
  return Math.trunc(scaled) / factor;
}

/**
 * Kilos como los ve el usuario: truncados a un decimal y con separadores
 * chilenos. No incluye la unidad.
 */
export function formatKg(value: number, decimals = KG_DECIMALS): string {
  return truncateTo(value, decimals).toLocaleString('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Igual que formatKg pero sin decimales, para cifras grandes de un vistazo. */
export function formatKgCompact(value: number): string {
  return Math.trunc(value).toLocaleString('es-CL');
}

/**
 * Suma una lista de cantidades como se van a MOSTRAR, no como están guardadas.
 *
 * Hace falta en las tablas: si cada fila se trunca por separado, el total real
 * puede quedar por encima de la suma de lo impreso, y una columna que no cuadra
 * es lo primero que salta al revisar un certificado.
 */
export function sumTruncated(values: number[], decimals = KG_DECIMALS): number {
  return truncateTo(
    values.reduce((acc, v) => acc + truncateTo(v, decimals), 0),
    decimals,
  );
}

/**
 * Cualquier número que no sean kilos: puntos, km, litros, unidades.
 *
 * Existe porque `toLocaleString()` SIN argumentos usa el idioma del navegador:
 * a un visitante con el navegador en inglés le mostraba 1,234.5 — separadores
 * invertidos respecto a la convención chilena. El idioma de las cifras lo fija
 * la app, no la configuración del computador de quien mira.
 */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
