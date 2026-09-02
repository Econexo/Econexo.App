import { describe, it, expect } from 'vitest';
import {
  buildMonthlyBreakdown,
  breakdownToCsv,
  monthOverMonth,
  previousPeriod,
  trailingPeriods,
  periodKeyOf,
  type CrDoc,
} from './monthlyBreakdown';

const doc = (date: string, details: unknown): CrDoc => ({
  created_at: date,
  metadata: { waste_details: details },
});

describe('periodKeyOf', () => {
  it('devuelve YYYY-MM', () => {
    expect(periodKeyOf('2026-07-15T10:00:00')).toBe('2026-07');
  });

  it('devuelve null con fechas inválidas', () => {
    expect(periodKeyOf('no-es-fecha')).toBeNull();
  });
});

describe('buildMonthlyBreakdown', () => {
  it('agrupa por mes y suma los kilos por material', () => {
    const result = buildMonthlyBreakdown([
      doc('2026-07-03T10:00:00', [
        { waste_type: 'Cartón corrugado', quantity: 100 },
        { waste_type: 'PET', quantity: 50 },
      ]),
      doc('2026-07-20T10:00:00', [{ waste_type: 'Papel blanco', quantity: 40 }]),
      doc('2026-08-01T10:00:00', [{ waste_type: 'Vidrio', quantity: 10 }]),
    ]);

    const julio = result.get('2026-07')!;
    expect(julio.totalKg).toBe(190);
    expect(julio.docCount).toBe(2);
    // Cartón y papel se contabilizan por separado, que es justo lo que la
    // clienta no podía ver cuando salían juntos.
    const porMaterial = Object.fromEntries(julio.materials.map(m => [m.material, m.kg]));
    expect(porMaterial['Cartón']).toBe(100);
    expect(porMaterial['Papel']).toBe(40);
    expect(porMaterial['PET']).toBe(50);

    expect(result.get('2026-08')!.totalKg).toBe(10);
  });

  it('calcula la participación de cada material sobre el total del mes', () => {
    const julio = buildMonthlyBreakdown([
      doc('2026-07-03T10:00:00', [
        { waste_type: 'Cartón', quantity: 75 },
        { waste_type: 'Vidrio', quantity: 25 },
      ]),
    ]).get('2026-07')!;

    expect(julio.materials.map(m => m.share)).toEqual([75, 25]);
  });

  it('aplica los factores de impacto por material', () => {
    // Aluminio: 9.13 kg CO2e/kg · 10 L/kg · 14 kWh/kg
    const mes = buildMonthlyBreakdown([
      doc('2026-07-03T10:00:00', [{ waste_type: 'Aluminio', quantity: 10 }]),
    ]).get('2026-07')!;

    expect(mes.impact.co2).toBeCloseTo(91.3, 2);
    expect(mes.impact.water).toBeCloseTo(100, 2);
    expect(mes.impact.energy).toBeCloseTo(140, 2);
    expect(mes.impact.trees).toBe(4); // 91.3 / 22
  });

  it('etiqueta la categoría Ley REP cuando corresponde', () => {
    const mes = buildMonthlyBreakdown([
      doc('2026-07-03T10:00:00', [
        { waste_type: 'Neumáticos fuera de uso', quantity: 5 },
        { waste_type: 'Aceite lubricante usado', quantity: 5 },
      ]),
    ]).get('2026-07')!;

    const byMaterial = Object.fromEntries(mes.materials.map(m => [m.material, m.repCategory]));
    expect(byMaterial['Neumáticos']).toBe('Neumáticos');
    expect(byMaterial['Aceites']).toBeNull();
  });

  it('acepta waste_details como objeto suelto, no solo array', () => {
    const mes = buildMonthlyBreakdown([
      doc('2026-07-03T10:00:00', { waste_type: 'Vidrio', quantity: 12 }),
    ]).get('2026-07')!;

    expect(mes.totalKg).toBe(12);
  });

  it('ignora documentos sin detalle y cantidades no positivas', () => {
    const result = buildMonthlyBreakdown([
      doc('2026-07-03T10:00:00', []),
      doc('2026-07-04T10:00:00', [{ waste_type: 'Vidrio', quantity: 0 }]),
      doc('2026-07-05T10:00:00', [{ waste_type: 'Vidrio', quantity: -5 }]),
      doc('2026-07-06T10:00:00', [{ waste_type: 'Vidrio', quantity: 8 }]),
    ]);

    const mes = result.get('2026-07')!;
    expect(mes.totalKg).toBe(8);
    // El doc vacío no cuenta; los otros tres sí llevan detalle.
    expect(mes.docCount).toBe(3);
  });
});

describe('previousPeriod / trailingPeriods', () => {
  it('cruza el cambio de año hacia atrás', () => {
    expect(previousPeriod('2026-01')).toBe('2025-12');
  });

  it('devuelve N períodos terminando en el indicado', () => {
    expect(trailingPeriods('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('monthOverMonth', () => {
  it('calcula la variación porcentual', () => {
    expect(monthOverMonth(150, 100)).toBe(50);
    expect(monthOverMonth(80, 100)).toBe(-20);
  });

  it('devuelve null si el mes anterior fue cero', () => {
    expect(monthOverMonth(150, 0)).toBeNull();
  });
});

describe('breakdownToCsv', () => {
  it('incluye encabezado, filas y total', () => {
    const mes = buildMonthlyBreakdown([
      doc('2026-07-03T10:00:00', [{ waste_type: 'Vidrio', quantity: 20 }]),
    ]).get('2026-07')!;

    const csv = breakdownToCsv(mes);
    const lines = csv.split('\r\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Material');
    expect(lines[1]).toContain('Vidrio');
    expect(lines[2]).toContain('TOTAL');
  });

  it('escapa las comillas dobles del contenido', () => {
    const mes = buildMonthlyBreakdown([
      doc('2026-07-03T10:00:00', [{ waste_type: 'Vidrio', quantity: 1 }]),
    ]).get('2026-07')!;
    mes.materials[0].material = 'Vidrio "verde"';

    expect(breakdownToCsv(mes)).toContain('"Vidrio ""verde"""');
  });
});

describe('destinos dentro del mes', () => {
  it('separa los kilos por destino sin perder nada', () => {
    const mes = buildMonthlyBreakdown([
      doc('2026-08-10T10:00:00', [
        { waste_type: 'Cartón', quantity: 300 },
        { waste_type: 'Domiciliarios', quantity: 400 },
        { waste_type: 'RESCON', quantity: 100 },
      ]),
    ]).get('2026-08')!;

    expect(mes.totalKg).toBe(800);
    expect(mes.destinations.valorizacion).toBe(300);
    expect(mes.destinations.relleno_sanitario).toBe(400);
    expect(mes.destinations.rescon).toBe(100);
  });

  it('no acredita impacto a lo que va a relleno sanitario', () => {
    // Mismo material y misma cantidad; solo cambia el destino.
    const valorizado = buildMonthlyBreakdown([
      doc('2026-08-10T10:00:00', [{ waste_type: 'Aluminio', quantity: 10 }]),
    ]).get('2026-08')!;

    const enterrado = buildMonthlyBreakdown([
      doc('2026-08-10T10:00:00', [
        { waste_type: 'Aluminio', quantity: 10, destination: 'relleno_sanitario' },
      ]),
    ]).get('2026-08')!;

    expect(valorizado.impact.co2).toBeCloseTo(91.3, 2);
    expect(enterrado.impact.co2).toBe(0);
    // Los kilos sí se contabilizan en ambos casos: se gestionaron igual.
    expect(enterrado.totalKg).toBe(10);
  });

  it('acredita solo la parte valorizada cuando un material va a dos destinos', () => {
    const mes = buildMonthlyBreakdown([
      doc('2026-08-10T10:00:00', [
        { waste_type: 'Aluminio', quantity: 6 },
        { waste_type: 'Aluminio', quantity: 4, destination: 'relleno_sanitario' },
      ]),
    ]).get('2026-08')!;

    expect(mes.totalKg).toBe(10);
    expect(mes.materials[0].kg).toBe(10);            // el desglose muestra el total
    expect(mes.materials[0].co2).toBeCloseTo(54.78, 2); // 6 kg × 9.13, no 10
  });

  it('los residuos domiciliarios no inflan el impacto ambiental', () => {
    const mes = buildMonthlyBreakdown([
      doc('2026-08-10T10:00:00', [{ waste_type: 'Domiciliarios', quantity: 5000 }]),
    ]).get('2026-08')!;

    expect(mes.totalKg).toBe(5000);
    expect(mes.impact).toMatchObject({ co2: 0, water: 0, energy: 0, trees: 0 });
  });
});
