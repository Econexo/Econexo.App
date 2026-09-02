import { describe, it, expect } from 'vitest';
import {
  destinationOf,
  defaultDestinationFor,
  isValorized,
  summarizeByDestination,
  wasteItemsOf,
} from './wasteClassification';
import { normalizeMaterialType, materialFactors } from './materialCalculations';

describe('normalizeMaterialType con las categorías nuevas', () => {
  it('reconoce los residuos domiciliarios y asimilables', () => {
    expect(normalizeMaterialType({ waste_type: 'Domiciliarios' })).toBe('Domiciliarios');
    expect(normalizeMaterialType({ waste_type: 'Residuos Sólidos Domiciliarios y Asimilables' })).toBe('Domiciliarios');
    expect(normalizeMaterialType({ waste_type: 'RSD' })).toBe('Domiciliarios');
  });

  it('reconoce RESCON por sus varios nombres', () => {
    expect(normalizeMaterialType({ waste_type: 'RESCON' })).toBe('RESCON');
    expect(normalizeMaterialType({ waste_type: 'Escombros' })).toBe('RESCON');
    expect(normalizeMaterialType({ waste_type: 'Residuos de construcción' })).toBe('RESCON');
    expect(normalizeMaterialType({ waste_type: 'Demolición' })).toBe('RESCON');
  });

  it('el destino manda sobre el material que menciona la descripción', () => {
    // Si el operario eligió "Domiciliarios", da igual que la bolsa traiga plástico.
    expect(normalizeMaterialType({
      waste_type: 'Domiciliarios',
      description: 'bolsas con plásticos y cartón',
    })).toBe('Domiciliarios');

    expect(normalizeMaterialType({
      waste_type: 'Escombros',
      description: 'hormigón con fierro',
    })).toBe('RESCON');
  });

  it('no se traga las categorías que ya existían', () => {
    expect(normalizeMaterialType({ waste_type: 'Cartón corrugado' })).toBe('Papel/Cartón');
    expect(normalizeMaterialType({ waste_type: 'PET' })).toBe('Plásticos');
    expect(normalizeMaterialType({ waste_type: 'Aluminio' })).toBe('Aluminio');
  });
});

describe('factores de impacto', () => {
  it('lo que va a destino final no genera impacto evitado', () => {
    expect(materialFactors['Domiciliarios']).toEqual({ co2: 0, water: 0, energy: 0 });
    expect(materialFactors['RESCON']).toEqual({ co2: 0, water: 0, energy: 0 });
  });
});

describe('defaultDestinationFor', () => {
  it('manda a relleno lo domiciliario y a RESCON los escombros', () => {
    expect(defaultDestinationFor('Domiciliarios')).toBe('relleno_sanitario');
    expect(defaultDestinationFor('RESCON')).toBe('rescon');
  });

  it('todo lo demás se considera valorizado, como siempre asumió la app', () => {
    for (const m of ['Plásticos', 'Papel/Cartón', 'Vidrio', 'Metales', 'Otros']) {
      expect(defaultDestinationFor(m)).toBe('valorizacion');
    }
  });
});

describe('destinationOf', () => {
  it('respeta el campo explícito cuando existe', () => {
    expect(destinationOf({ waste_type: 'Plásticos', destination: 'relleno_sanitario' }))
      .toBe('relleno_sanitario');
  });

  it('ignora un valor explícito inválido y cae al del material', () => {
    expect(destinationOf({ waste_type: 'Plásticos', destination: 'basura' })).toBe('valorizacion');
    expect(destinationOf({ waste_type: 'Domiciliarios', destination: '' })).toBe('relleno_sanitario');
  });

  it('clasifica los certificados antiguos sin cambiarles el total', () => {
    // Una fila histórica no tiene `destination`: sigue contando como valorizada.
    expect(isValorized({ waste_type: 'Papel/Cartón', quantity: 100 })).toBe(true);
  });
});

describe('summarizeByDestination', () => {
  const items = [
    { waste_type: 'Papel/Cartón', quantity: 300 },
    { waste_type: 'Plásticos', quantity: 200 },
    { waste_type: 'Domiciliarios', quantity: 400 },
    { waste_type: 'RESCON', quantity: 100 },
  ];

  it('separa los kilos por destino', () => {
    const t = summarizeByDestination(items);
    expect(t.total).toBe(1000);
    expect(t.valorizacion).toBe(500);
    expect(t.relleno_sanitario).toBe(400);
    expect(t.rescon).toBe(100);
  });

  it('el total valorizado NO incluye relleno ni RESCON', () => {
    const t = summarizeByDestination(items);
    expect(t.valorizacion).not.toBe(t.total);
    expect(t.valorizacion + t.relleno_sanitario + t.rescon).toBe(t.total);
  });

  it('calcula la tasa de valorización sobre el total gestionado', () => {
    expect(summarizeByDestination(items).tasaValorizacion).toBe(50);
  });

  it('devuelve ceros sin ítems, sin dividir por cero', () => {
    const t = summarizeByDestination([]);
    expect(t).toEqual({
      total: 0, valorizacion: 0, relleno_sanitario: 0, rescon: 0, tasaValorizacion: 0,
    });
  });

  it('ignora cantidades no positivas o ausentes', () => {
    const t = summarizeByDestination([
      { waste_type: 'Vidrio', quantity: 50 },
      { waste_type: 'Vidrio', quantity: 0 },
      { waste_type: 'Vidrio', quantity: -10 },
      { waste_type: 'Vidrio' },
    ]);
    expect(t.total).toBe(50);
  });

  it('un certificado solo de reciclaje da 100 % de valorización', () => {
    const t = summarizeByDestination([{ waste_type: 'Metales', quantity: 80 }]);
    expect(t.valorizacion).toBe(80);
    expect(t.relleno_sanitario).toBe(0);
    expect(t.tasaValorizacion).toBe(100);
  });
});

describe('wasteItemsOf', () => {
  it('acepta array, objeto suelto y ausencia', () => {
    expect(wasteItemsOf({ metadata: { waste_details: [{ quantity: 1 }] } })).toHaveLength(1);
    expect(wasteItemsOf({ metadata: { waste_details: { quantity: 1 } } })).toHaveLength(1);
    expect(wasteItemsOf({ metadata: {} })).toHaveLength(0);
    expect(wasteItemsOf(null)).toHaveLength(0);
  });
});
