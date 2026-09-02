// Destino de cada residuo: a dónde fue a parar, que no es lo mismo que de qué
// material es. Una empresa que contrata a EcoNexo tanto para su reciclaje como
// para su basura necesita ver las tres cifras por separado, y el total reciclado
// NO puede incluir lo que fue a relleno sanitario ni los escombros.

import { normalizeMaterialType } from './materialCalculations';

export type WasteDestination = 'valorizacion' | 'relleno_sanitario' | 'rescon';

export const WASTE_DESTINATIONS: {
  value: WasteDestination;
  label: string;
  short: string;
  description: string;
  icon: string;
  color: string;
}[] = [
  {
    value: 'valorizacion',
    label: 'Reciclado / Valorizado',
    short: 'Valorizado',
    description: 'Vuelve a la cadena productiva. Es la cifra que cuenta para la Ley REP.',
    icon: 'recycling',
    color: '#326105',
  },
  {
    value: 'relleno_sanitario',
    label: 'Relleno Sanitario',
    short: 'Relleno',
    description: 'Disposición final. No genera impacto ambiental evitado.',
    icon: 'delete',
    color: '#78716c',
  },
  {
    value: 'rescon',
    label: 'RESCON',
    short: 'RESCON',
    description: 'Residuos de construcción y demolición, con su propia normativa.',
    icon: 'foundation',
    color: '#a16207',
  },
];

export const DESTINATION_LABELS: Record<WasteDestination, string> = Object.fromEntries(
  WASTE_DESTINATIONS.map(d => [d.value, d.label]),
) as Record<WasteDestination, string>;

const VALID: WasteDestination[] = ['valorizacion', 'relleno_sanitario', 'rescon'];

/**
 * Destino por defecto de un material, para los certificados antiguos que se
 * emitieron antes de que existiera el campo.
 *
 * Todo lo que no sea domiciliario ni escombro se considera valorizado, que es
 * lo que la app asumió siempre: así las cifras históricas no cambian de un día
 * para otro al desplegar esto.
 */
export function defaultDestinationFor(material: string): WasteDestination {
  if (material === 'Domiciliarios') return 'relleno_sanitario';
  if (material === 'RESCON') return 'rescon';
  return 'valorizacion';
}

/** Destino de un ítem: el campo explícito si es válido, si no el del material. */
export function destinationOf(item: any): WasteDestination {
  const explicit = item?.destination;
  if (typeof explicit === 'string' && VALID.includes(explicit as WasteDestination)) {
    return explicit as WasteDestination;
  }
  return defaultDestinationFor(normalizeMaterialType(item ?? {}));
}

/** ¿Este residuo cuenta como recuperado? Solo lo valorizado evita impacto. */
export function isValorized(item: any): boolean {
  return destinationOf(item) === 'valorizacion';
}

export interface DestinationTotals {
  /** Todo lo gestionado, sin importar el destino. */
  total: number;
  /** Reciclado o valorizado. La cifra principal. */
  valorizacion: number;
  relleno_sanitario: number;
  rescon: number;
  /** Porcentaje valorizado sobre el total gestionado. */
  tasaValorizacion: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Suma los kilos de una lista de residuos separándolos por destino. */
export function summarizeByDestination(items: any[]): DestinationTotals {
  const out: DestinationTotals = {
    total: 0,
    valorizacion: 0,
    relleno_sanitario: 0,
    rescon: 0,
    tasaValorizacion: 0,
  };

  for (const item of items ?? []) {
    const qty = parseQuantity(item?.quantity);
    if (qty <= 0) continue;
    out.total += qty;
    out[destinationOf(item)] += qty;
  }

  out.total = round2(out.total);
  out.valorizacion = round2(out.valorizacion);
  out.relleno_sanitario = round2(out.relleno_sanitario);
  out.rescon = round2(out.rescon);
  out.tasaValorizacion = out.total > 0 ? round2((out.valorizacion / out.total) * 100) : 0;

  return out;
}

/** Extrae los ítems de residuos de un documento CR, venga como array u objeto. */
export function wasteItemsOf(doc: any): any[] {
  const details = doc?.metadata?.waste_details;
  if (Array.isArray(details)) return details;
  if (details) return [details];
  return [];
}

/**
 * Lee la cantidad de un ítem tolerando que venga como texto.
 *
 * `Number("9,4")` es NaN, y en Chile la coma es el separador decimal: si un
 * dato entró como texto con coma, ese ítem sumaba cero y desaparecía del total
 * sin dejar rastro. También aguanta unidades pegadas ("9,4 kg").
 */
export function parseQuantity(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (typeof raw !== 'string') return 0;

  const limpio = raw.trim().replace(/[^\d.,-]/g, '');
  if (!limpio) return 0;

  const ultimaComa = limpio.lastIndexOf(',');
  const ultimoPunto = limpio.lastIndexOf('.');

  let normalizado: string;
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    // Con ambos, el que va último es el separador decimal.
    const decimal = ultimaComa > ultimoPunto ? ',' : '.';
    const miles = decimal === ',' ? '.' : ',';
    normalizado = limpio.split(miles).join('').replace(decimal, '.');
  } else if (ultimaComa >= 0) {
    normalizado = limpio.replace(',', '.');
  } else {
    normalizado = limpio;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}
