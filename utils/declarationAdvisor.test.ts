import { describe, it, expect } from 'vitest';
import {
  evaluateDeclarations,
  PACKAGING_VOLUNTARY_KG,
  type DeclarationFinding,
} from './declarationAdvisor';

const find = (findings: DeclarationFinding[], id: string) =>
  findings.find(f => f.id === id)!;

const evaluar = (items: any[], year = 2026) =>
  evaluateDeclarations({ items, year });

describe('envases y embalajes', () => {
  it('levanta la mano al superar el umbral anual', () => {
    const r = evaluar([
      { waste_type: 'Cartón', quantity: 200 },
      { waste_type: 'PET', quantity: 150 },
    ]);

    expect(r.packagingKg).toBe(350);
    const f = find(r.findings, 'ds12_envases');
    expect(f.verdict).toBe('corresponde');
    expect(f.action).toContain('declaración voluntaria');
    expect(f.action).toContain('sin obligación de cumplir metas');
  });

  it('no la levanta por debajo del umbral', () => {
    const f = find(evaluar([{ waste_type: 'Cartón', quantity: 100 }]).findings, 'ds12_envases');
    expect(f.verdict).toBe('no_corresponde');
  });

  it('avisa cuando se está cerca, para no llegar tarde a fin de año', () => {
    // 80 % del umbral
    const f = find(evaluar([{ waste_type: 'Cartón', quantity: 240 }]).findings, 'ds12_envases');
    expect(f.verdict).toBe('cerca');
    expect(f.action).toContain('60 kg');
  });

  it('justo en el umbral ya corresponde', () => {
    const f = find(
      evaluar([{ waste_type: 'Vidrio', quantity: PACKAGING_VOLUNTARY_KG }]).findings,
      'ds12_envases',
    );
    expect(f.verdict).toBe('corresponde');
  });

  it('suma las cuatro familias de envases y solo esas', () => {
    const r = evaluar([
      { waste_type: 'Papel', quantity: 50 },
      { waste_type: 'Plástico Film', quantity: 50 },
      { waste_type: 'Vidrio', quantity: 50 },
      { waste_type: 'Aluminio', quantity: 50 },
      // Estos no son envases y embalajes:
      { waste_type: 'Madera', quantity: 500 },
      { waste_type: 'Aceites', quantity: 500 },
    ]);

    expect(r.packagingKg).toBe(200);
  });

  it('sin movimientos no inventa una obligación', () => {
    const f = find(evaluar([]).findings, 'ds12_envases');
    expect(f.verdict).toBe('sin_datos');
    expect(f.measuredKg).toBe(0);
  });

  it('deja a la vista el umbral que aplicó, para poder auditarlo', () => {
    const f = find(evaluar([{ waste_type: 'Cartón', quantity: 400 }]).findings, 'ds12_envases');
    expect(f.thresholdKg).toBe(PACKAGING_VOLUNTARY_KG);
    expect(f.basis).toContain('DS 12/2021');
    expect(f.progress).toBe(133);
  });
});

describe('residuos peligrosos', () => {
  it('se levanta con cualquier cantidad', () => {
    const f = find(evaluar([{ waste_type: 'Peligrosos', quantity: 1 }]).findings, 'sidrep_peligrosos');
    expect(f.verdict).toBe('corresponde');
    expect(f.action).toContain('SIDREP');
  });

  it('no se levanta si no hay', () => {
    const f = find(evaluar([{ waste_type: 'Cartón', quantity: 100 }]).findings, 'sidrep_peligrosos');
    expect(f.verdict).toBe('sin_datos');
  });
});

describe('residuos no peligrosos', () => {
  it('separa lo peligroso del resto', () => {
    const r = evaluar([
      { waste_type: 'Cartón', quantity: 300 },
      { waste_type: 'Peligrosos', quantity: 100 },
    ]);

    expect(r.totalKg).toBe(400);
    expect(r.hazardousKg).toBe(100);
    expect(r.nonHazardousKg).toBe(300);
  });

  it('se levanta apenas hay movimientos, sin umbral de kilos', () => {
    const f = find(evaluar([{ waste_type: 'Madera', quantity: 5 }]).findings, 'sinader_no_peligrosos');
    expect(f.verdict).toBe('corresponde');
    expect(f.thresholdKg).toBeNull();
  });
});

describe('otros decretos REP', () => {
  it('avisa de RAEE y neumáticos solo cuando aparecen', () => {
    const sin = evaluar([{ waste_type: 'Cartón', quantity: 10 }]).findings;
    expect(sin.some(f => f.id === 'ds10_raee')).toBe(false);
    expect(sin.some(f => f.id === 'ds8_neumaticos')).toBe(false);

    const con = evaluar([
      { waste_type: 'Electrónicos', quantity: 20 },
      { waste_type: 'Neumáticos', quantity: 30 },
    ]).findings;
    expect(find(con, 'ds10_raee').measuredKg).toBe(20);
    expect(find(con, 'ds8_neumaticos').measuredKg).toBe(30);
  });
});

describe('orden y resumen', () => {
  it('pone primero lo que requiere acción', () => {
    // Solo cartón: envases queda bajo el umbral y SIDREP sin datos, así que
    // el único accionable —SINADER— tiene que quedar arriba.
    const r = evaluar([{ waste_type: 'Cartón', quantity: 100 }]);

    const orden = r.findings.map(f => f.verdict);
    expect(orden[0]).toBe('corresponde');
    expect(orden[orden.length - 1]).toBe('sin_datos');

    // Y el orden nunca retrocede en urgencia.
    const rango = { corresponde: 0, cerca: 1, no_corresponde: 2, sin_datos: 3 } as const;
    for (let i = 1; i < orden.length; i++) {
      expect(rango[orden[i]]).toBeGreaterThanOrEqual(rango[orden[i - 1]]);
    }
  });

  it('cuenta cuántos hallazgos requieren acción', () => {
    const r = evaluar([
      { waste_type: 'Cartón', quantity: 500 },   // envases: corresponde
      { waste_type: 'Peligrosos', quantity: 10 }, // sidrep: corresponde
    ]);
    // envases + sinader (no peligrosos) + sidrep
    expect(r.actionableCount).toBe(3);
  });

  it('con la lista vacía no marca nada como accionable', () => {
    expect(evaluar([]).actionableCount).toBe(0);
  });

  it('ignora cantidades inválidas sin romperse', () => {
    const r = evaluar([
      { waste_type: 'Cartón', quantity: 'mucho' },
      { waste_type: 'Cartón' },
      { waste_type: 'Cartón', quantity: 100 },
    ]);
    expect(r.packagingKg).toBe(100);
  });
});
