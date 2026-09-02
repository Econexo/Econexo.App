import { describe, it, expect } from 'vitest';
import {
  evaluateDeclarations,
  SINADER_MANDATORY_KG,
  PACKAGING_PRODUCER_TARGET_EXEMPTION_KG,
  type DeclarationFinding,
  type DeclarationInput,
} from './declarationAdvisor';

const find = (findings: DeclarationFinding[], id: string) =>
  findings.find(f => f.id === id)!;

const evaluar = (items: any[], extra: Partial<DeclarationInput> = {}) =>
  evaluateDeclarations({ items, year: 2026, ...extra });

describe('SINADER · residuos no peligrosos', () => {
  it('no obliga a declarar por debajo de las 12 toneladas', () => {
    // El caso real: 300 kg anuales de cartón y plástico.
    const f = find(evaluar([
      { waste_type: 'Cartón', quantity: 200 },
      { waste_type: 'PET', quantity: 100 },
    ]).findings, 'sinader_no_peligrosos');

    expect(f.verdict).toBe('no_obligatorio');
    expect(f.action).toContain('no corresponde declarar');
    expect(f.trigger).toContain('12 t');
  });

  it('obliga al superar las 12 toneladas', () => {
    const f = find(
      evaluar([{ waste_type: 'Cartón', quantity: 12_500 }]).findings,
      'sinader_no_peligrosos',
    );
    expect(f.verdict).toBe('obligatorio');
    expect(f.action).toContain('SINADER');
  });

  it('justo en el umbral ya obliga', () => {
    const f = find(
      evaluar([{ waste_type: 'Cartón', quantity: SINADER_MANDATORY_KG }]).findings,
      'sinader_no_peligrosos',
    );
    expect(f.verdict).toBe('obligatorio');
  });

  it('avisa al acercarse, para no llegar tarde a fin de año', () => {
    const f = find(
      evaluar([{ waste_type: 'Cartón', quantity: 10_000 }]).findings, // 83 %
      'sinader_no_peligrosos',
    );
    expect(f.verdict).toBe('cerca');
    expect(f.action).toContain('2.000 kg');
  });

  it('descuenta los peligrosos del cómputo de no peligrosos', () => {
    const r = evaluar([
      { waste_type: 'Cartón', quantity: 300 },
      { waste_type: 'Peligrosos', quantity: 100 },
    ]);
    expect(r.totalKg).toBe(400);
    expect(r.nonHazardousKg).toBe(300);
  });
});

describe('Ley REP · generador que no es productor', () => {
  const soloGenerador = () => evaluar([
    { waste_type: 'Cartón', quantity: 200 },
    { waste_type: 'PET', quantity: 100 },
  ]);

  it('no aplica el régimen a quien solo genera residuos', () => {
    const f = find(soloGenerador().findings, 'ds12_envases');
    expect(f.verdict).toBe('no_aplica');
  });

  it('deja claro que los kilos gestionados no cuentan como puestos en el mercado', () => {
    const f = find(soloGenerador().findings, 'ds12_envases');
    expect(f.action).toContain('no cuentan para esta obligación');
    expect(f.basis).toContain('no es un umbral para generadores');
  });

  it('los 300 kg de residuos NO gatillan una obligación REP', () => {
    // Es el error que hay que evitar: confundir generador con productor.
    const f = find(
      evaluar([{ waste_type: 'Cartón', quantity: 5_000 }]).findings,
      'ds12_envases',
    );
    expect(f.verdict).toBe('no_aplica');
  });

  it('explica qué haría que pasara a aplicar', () => {
    const f = find(soloGenerador().findings, 'ds12_envases');
    expect(f.trigger).toContain('importar o fabricar');
    expect(f.trigger).toContain(String(PACKAGING_PRODUCER_TARGET_EXEMPTION_KG));
  });
});

describe('Ley REP · productor prioritario', () => {
  it('pide el dato que la app no puede conocer', () => {
    const f = find(
      evaluar([{ waste_type: 'Cartón', quantity: 500 }], { isPriorityProducer: true }).findings,
      'ds12_envases',
    );
    expect(f.verdict).toBe('faltan_datos');
    expect(f.action).toContain('pusiste en el mercado');
  });

  it('bajo el umbral: exento de metas, pero sigue siendo productor', () => {
    const f = find(
      evaluar([], { isPriorityProducer: true, packagingPlacedOnMarketKg: 250 }).findings,
      'ds12_envases',
    );
    expect(f.verdict).toBe('no_obligatorio');
    expect(f.action).toContain('exento de METAS');
    expect(f.action).toContain('obligación de registro');
  });

  it('sobre el umbral: quedan metas que cumplir', () => {
    const f = find(
      evaluar([], { isPriorityProducer: true, packagingPlacedOnMarketKg: 1_200 }).findings,
      'ds12_envases',
    );
    expect(f.verdict).toBe('obligatorio');
    expect(f.measuredKg).toBe(1_200);
    expect(f.action).toContain('metas de recuperación');
  });

  it('mide sobre lo puesto en el mercado, no sobre lo gestionado', () => {
    // Muchos residuos gestionados pero poco envase comercializado.
    const f = find(
      evaluar(
        [{ waste_type: 'Cartón', quantity: 9_000 }],
        { isPriorityProducer: true, packagingPlacedOnMarketKg: 100 },
      ).findings,
      'ds12_envases',
    );
    expect(f.verdict).toBe('no_obligatorio');
    expect(f.measuredKg).toBe(100);
  });
});

describe('SIDREP · residuos peligrosos', () => {
  it('aplica con cualquier cantidad', () => {
    const f = find(evaluar([{ waste_type: 'Peligrosos', quantity: 1 }]).findings, 'sidrep_peligrosos');
    expect(f.verdict).toBe('obligatorio');
  });

  it('no aplica si no se generan', () => {
    const f = find(evaluar([{ waste_type: 'Cartón', quantity: 100 }]).findings, 'sidrep_peligrosos');
    expect(f.verdict).toBe('no_aplica');
    expect(f.trigger).toContain('cualquier cantidad');
  });
});

describe('resumen', () => {
  it('el caso de la clienta no deja nada por hacer', () => {
    // 300 kg anuales, generadora, sin peligrosos.
    const r = evaluar([
      { waste_type: 'Cartón', quantity: 200 },
      { waste_type: 'PET', quantity: 100 },
    ]);
    expect(r.actionableCount).toBe(0);
    expect(r.findings.every(f => f.verdict === 'no_obligatorio' || f.verdict === 'no_aplica')).toBe(true);
  });

  it('ordena por urgencia, sin retroceder', () => {
    const orden = evaluar([
      { waste_type: 'Cartón', quantity: 13_000 },
      { waste_type: 'Peligrosos', quantity: 5 },
    ]).findings.map(f => f.verdict);

    const rango = {
      obligatorio: 0, cerca: 1, faltan_datos: 2, no_obligatorio: 3, no_aplica: 4,
    } as const;
    for (let i = 1; i < orden.length; i++) {
      expect(rango[orden[i]]).toBeGreaterThanOrEqual(rango[orden[i - 1]]);
    }
  });

  it('ignora cantidades inválidas sin romperse', () => {
    const r = evaluar([
      { waste_type: 'Cartón', quantity: 'mucho' },
      { waste_type: 'Cartón' },
      { waste_type: 'Cartón', quantity: 100 },
    ]);
    expect(r.totalKg).toBe(100);
  });

  it('sin movimientos no inventa obligaciones', () => {
    expect(evaluar([]).actionableCount).toBe(0);
  });
});
