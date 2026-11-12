import { describe, it, expect } from 'vitest';
import {
  addTicketsToDestinations,
  parseTicketKg,
  weighTicketItems,
  weighTicketOf,
} from './weighTicket';
import { summarizeByDestination } from './wasteClassification';

const ticket = (kg: unknown, destination?: string) => ({
  type: 'ticket_pesaje',
  created_at: '2026-11-05T12:00:00Z',
  metadata: { pesaje: { kg, destination } },
});

describe('parseTicketKg', () => {
  it('lee el formato chileno', () => {
    expect(parseTicketKg('1.250')).toBe(1250);
    expect(parseTicketKg('9,4')).toBe(9.4);
    expect(parseTicketKg(' 320 kg ')).toBe(320);
  });

  it('rechaza vacío, cero y negativos', () => {
    expect(parseTicketKg('')).toBeNull();
    expect(parseTicketKg('0')).toBeNull();
    expect(parseTicketKg('abc')).toBeNull();
  });
});

describe('weighTicketOf', () => {
  it('ignora documentos que no son ticket', () => {
    expect(weighTicketOf({ type: 'guia', metadata: { pesaje: { kg: 10 } } })).toBeNull();
  });

  it('sin destino válido asume relleno sanitario', () => {
    expect(weighTicketOf(ticket(100, 'cualquiera'))).toEqual({ kg: 100, destination: 'relleno_sanitario' });
  });

  it('sin kilos no hay pesaje', () => {
    expect(weighTicketOf(ticket(0, 'relleno_sanitario'))).toBeNull();
    expect(weighTicketOf({ type: 'ticket_pesaje', metadata: {} })).toBeNull();
  });
});

describe('weighTicketItems', () => {
  it('relleno y RESCON suman con su destino', () => {
    const relleno = summarizeByDestination(weighTicketItems(ticket(1250, 'relleno_sanitario')));
    expect(relleno.relleno_sanitario).toBe(1250);
    expect(relleno.valorizacion).toBe(0);

    const rescon = summarizeByDestination(weighTicketItems(ticket('300', 'rescon')));
    expect(rescon.rescon).toBe(300);
  });

  it('un ticket de reciclaje no suma: esos kilos ya están en el CT', () => {
    expect(weighTicketItems(ticket(500, 'valorizacion'))).toEqual([]);
  });
});

describe('addTicketsToDestinations', () => {
  it('suma los tickets sin tocar el valorizado y recalcula la tasa', () => {
    const base = summarizeByDestination([{ waste_type: 'Cartón', quantity: 100 }]);
    const out = addTicketsToDestinations(base, [
      ticket(100, 'relleno_sanitario'),
      ticket(999, 'valorizacion'),
    ]);
    expect(out.valorizacion).toBe(100);
    expect(out.relleno_sanitario).toBe(100);
    expect(out.total).toBe(200);
    expect(out.tasaValorizacion).toBe(50);
  });

  it('sin tickets devuelve los totales tal cual', () => {
    const base = summarizeByDestination([{ waste_type: 'Cartón', quantity: 100 }]);
    expect(addTicketsToDestinations(base, [])).toBe(base);
  });
});
