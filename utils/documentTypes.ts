// Códigos de la columna documents.type, en un solo sitio.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ CT Y NO CR
//
// EcoNexo retira los residuos y los traslada: su rol en la cadena es el de
// TRANSPORTISTA. El documento que emite es un Certificado de Transporte (CT).
//
// El Certificado de Recepción lo emite el centro de acopio y pretratamiento
// cuando recibe la carga, y el de Disposición Final lo emite quien la trata.
// Son tres documentos distintos, de tres actores distintos, y hasta ahora el
// primero se llamaba como el segundo. Con los tres conviviendo en la app, ese
// nombre habría hecho imposible distinguirlos.
//
// La cadena completa de trazabilidad:
//   CT  · EcoNexo transporta        → lo emite EcoNexo
//   CR  · el acopio recibe          → lo emite el centro de acopio
//   CDF · disposición final         → lo emite el destinatario final
// ─────────────────────────────────────────────────────────────────────────────

export const DOC_TYPE = {
  /** Certificado de Transporte. Lo emite EcoNexo al retirar. */
  TRANSPORTE: 'CT',
  /** Cómo se llamaba antes el MISMO documento. Se sigue leyendo por el histórico. */
  TRANSPORTE_LEGACY: 'CR',
  /** Retiro comunitario. Mismo rol de transporte, otro origen. */
  COMUNITARIO: 'COMMUNITY_CR',
  /** Certificado de Gestión Mensual. */
  MENSUAL: 'CGM',
  /** Certificado de Recepción del centro de acopio. Documento de un tercero. */
  RECEPCION_ACOPIO: 'CR_ACOPIO',
  /** Certificado de Disposición Final. Documento de un tercero. */
  DISPOSICION_FINAL: 'cdf',
} as const;

/**
 * Los dos códigos que designan un certificado de transporte.
 *
 * 'CR' sigue aquí a propósito: los certificados emitidos antes del cambio de
 * nombre conservan ese código hasta que se aplique la migración, y aun después
 * mantenerlo cuesta nada y evita que un solo registro rezagado desaparezca de
 * los totales sin que nadie lo note.
 */
export const TRANSPORTE_TYPES: string[] = [DOC_TYPE.TRANSPORTE, DOC_TYPE.TRANSPORTE_LEGACY];

/** Documentos que traen waste_details y por tanto suman kilos. */
export const WASTE_DOC_TYPES: string[] = [...TRANSPORTE_TYPES, DOC_TYPE.COMUNITARIO];

/** ¿Es un certificado de transporte, con cualquiera de sus dos códigos? */
export const isTransportDoc = (type?: string | null): boolean =>
  !!type && TRANSPORTE_TYPES.includes(type);

// ── Numeración correlativa ───────────────────────────────────────────────────

/** Prefijo de los certificados nuevos. */
export const CERT_PREFIX = 'CT N°:';

/**
 * Reconoce el correlativo con cualquiera de los dos prefijos, para que la
 * secuencia continúe donde la dejó el último CR en vez de empezar de cero.
 */
export const CERT_NUMBER_RE = /(?:CT|CR)\s*N°:\s*(\d+)/;

/** Nombre visible del documento. */
export const CERT_TITLE = 'Certificado de Transporte';

// ── Certificados emitidos con el nombre anterior ─────────────────────────────

/**
 * Reescribe a CT el nombre o el número de un certificado emitido antes del
 * cambio, para mostrarlo o para reimprimir su PDF.
 *
 * Hace falta por dos motivos. Uno, la migración de la base es opcional y puede
 * tardar: hasta que se aplique, la app mostraría "CR N°:007" junto a los CT
 * nuevos. Dos, la app permite volver a descargar un certificado antiguo; sin
 * esto el PDF saldría titulado "CERTIFICADO DE TRANSPORTE" pero numerado
 * "CR N°:007", que es justo la confusión que se quería evitar.
 *
 * El número NO cambia: el 007 sigue siendo el 007, solo cambia el prefijo.
 *
 * Se aplica únicamente a documentos de transporte —comprueba isTransportDoc()
 * antes de llamar—. El "Certificado de Recepción" del centro de acopio se llama
 * así de verdad y no debe tocarse.
 */
export function toTransportLabel(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/Certificado de Recepción/g, CERT_TITLE)
    // Solo donde CR actúa de prefijo de correlativo: 'CR N°:007' y el formato
    // antiguo del Dashboard, 'CR-4837'. Nunca dentro de otra palabra ni en
    // códigos como CR_ACOPIO.
    .replace(/\bCR(?=\s*N°:|-\d)/g, DOC_TYPE.TRANSPORTE);
}
