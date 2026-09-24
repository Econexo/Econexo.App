// Resolución sanitaria del transporte, la que va impresa en el CT.
//
// Vivía fija dentro del PDF: un solo número, el de EcoNexo. Desde que el retiro
// lo puede hacer un tercero, el número tiene que viajar con el certificado, no
// con el generador del PDF.
//
// Los transportistas se administran en la tabla `transportistas` (panel Admin →
// Transportistas) y el elegido se guarda en `metadata.transporter` al emitir,
// igual que los destinos del CGM: si mañana cambias la resolución de un
// transportista, los certificados ya entregados conservan la que llevaban.

export interface TransporterInfo {
  name?: string;
  rut?: string;
  resolution?: string | null;
}

/**
 * La resolución de EcoNexo. Era el valor fijo del PDF, y sigue siendo el
 * fallback: los certificados emitidos antes de que existiera el selector no
 * guardaron ninguna, y al volver a descargarlos tienen que salir idénticos.
 */
export const DEFAULT_TRANSPORT_RESOLUTION = '2402341155';

/**
 * Número de resolución listo para imprimir.
 *
 * El PDF ya pone el rótulo ("RESOLUCIÓN N° : "), así que si el operario escribió
 * el rótulo también en la ficha del transportista se le quita: de lo contrario
 * el certificado saldría con "RESOLUCIÓN N° : RESOLUCIÓN N° 2402341155".
 */
export function resolveTransportResolution(transporter?: TransporterInfo | null): string {
  const raw = (transporter?.resolution || '').trim();
  if (!raw) return DEFAULT_TRANSPORT_RESOLUTION;

  const cleaned = raw
    .replace(/^resoluci[oó]n\s*(sanitaria)?\s*/i, '')
    .replace(/^n\s*[°º]?\s*/i, '')
    .replace(/^[:.\-\s]+/, '')
    .trim();

  return cleaned || DEFAULT_TRANSPORT_RESOLUTION;
}
