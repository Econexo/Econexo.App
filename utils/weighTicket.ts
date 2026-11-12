// Ticket de pesaje: los kilos que trae y a dónde fueron.
//
// La mayoría de los tickets los entrega el relleno sanitario al recibir la
// basura del cliente. Esos kilos no aparecen en ningún CT, así que sin ellos el
// cliente vería solo lo que recicla y no lo que bota: su "total gestionado" y
// su tasa de valorización saldrían mal, y el asesor de SINADER contaría menos
// residuos de los que generó.
//
// El ticket también puede ser de una carga que fue a reciclaje. En ese caso los
// kilos ya están en el CT del retiro, y sumarlos de nuevo los contaría dos
// veces: se guardan en el documento como respaldo, pero no suman.
//
// Los kilos viven en metadata.pesaje y NO en metadata.waste_details a
// propósito: waste_details es la marca de "certificado generado por EcoNexo"
// (ver ClientOverviewModal y el CGM), y un ticket es un documento de un tercero.

import type { DestinationTotals, WasteDestination } from './wasteClassification';
import { parseQuantity, summarizeByDestination } from './wasteClassification';

export const WEIGH_TICKET_TYPE = 'ticket_pesaje';

export interface WeighTicket {
  kg: number;
  destination: WasteDestination;
}

/** Destinos que se ofrecen al cargar un ticket, en orden de frecuencia. */
export const WEIGH_TICKET_DESTINATIONS: { value: WasteDestination; label: string; hint: string }[] = [
  { value: 'relleno_sanitario', label: 'Relleno Sanitario', hint: 'Suma a tus residuos como relleno sanitario.' },
  { value: 'rescon', label: 'RESCON', hint: 'Suma a tus residuos como RESCON.' },
  { value: 'valorizacion', label: 'Reciclaje', hint: 'Solo se guarda en el documento: esos kilos ya están en el CT.' },
];

const VALID: WasteDestination[] = ['relleno_sanitario', 'rescon', 'valorizacion'];

/** Material con que se contabilizan los kilos según el destino. */
const MATERIAL_FOR: Record<'relleno_sanitario' | 'rescon', string> = {
  relleno_sanitario: 'Domiciliarios',
  rescon: 'RESCON',
};

/**
 * Lee el texto del campo Kg. Devuelve null si está vacío o no es un número
 * positivo, para que el formulario pueda avisar en vez de guardar un cero.
 */
export function parseTicketKg(raw: string): number | null {
  const kg = parseQuantity(raw);
  return kg > 0 ? Math.round(kg * 100) / 100 : null;
}

/** Arma el objeto que se guarda en metadata.pesaje. */
export function buildWeighTicket(kg: number, destination: WasteDestination): WeighTicket {
  return { kg, destination };
}

/** El pesaje de un documento, si es un ticket y trae kilos válidos. */
export function weighTicketOf(doc: any): WeighTicket | null {
  if (doc?.type && doc.type !== WEIGH_TICKET_TYPE) return null;
  const raw = doc?.metadata?.pesaje;
  if (!raw) return null;
  const kg = parseQuantity(raw.kg);
  if (kg <= 0) return null;
  const destination = VALID.includes(raw.destination) ? raw.destination : 'relleno_sanitario';
  return { kg, destination };
}

/**
 * Los kilos del ticket como ítems de residuo, con la misma forma que los de un
 * CT, para sumarlos con summarizeByDestination y compañía.
 *
 * Un ticket de reciclaje devuelve []: esos kilos ya los trae el CT.
 */
export function weighTicketItems(doc: any): any[] {
  const ticket = weighTicketOf(doc);
  if (!ticket || ticket.destination === 'valorizacion') return [];
  return [{
    waste_type: MATERIAL_FOR[ticket.destination],
    quantity: ticket.kg,
    destination: ticket.destination,
    source: WEIGH_TICKET_TYPE,
  }];
}

/**
 * Suma a unos totales por destino los kilos de los tickets, recalculando la
 * tasa de valorización sobre el nuevo total.
 */
export function addTicketsToDestinations(base: DestinationTotals, tickets: any[]): DestinationTotals {
  const extra = summarizeByDestination((tickets ?? []).flatMap(weighTicketItems));
  if (extra.total === 0) return base;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const total = r2(base.total + extra.total);
  const valorizacion = r2(base.valorizacion + extra.valorizacion);
  return {
    total,
    valorizacion,
    relleno_sanitario: r2(base.relleno_sanitario + extra.relleno_sanitario),
    rescon: r2(base.rescon + extra.rescon),
    tasaValorizacion: total > 0 ? r2((valorizacion / total) * 100) : 0,
  };
}
