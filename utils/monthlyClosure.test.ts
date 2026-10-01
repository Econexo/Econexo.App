import { describe, it, expect } from 'vitest';
import {
  buildClosureCompanies,
  groupByDestination,
  defaultAssignment,
  staleDestinationIds,
  snapshotFingerprint,
  closureTotalKg,
  closureToTsv,
  UNKNOWN_COMPANY_NAME,
  type ClosureDoc,
  type CompanyInfo,
  type StoredClosure,
} from './monthlyClosure';
import { localDayToISO } from './dateRange';

const retiro = (
  fecha: string,
  owner: string,
  items: { waste_type: string; quantity: unknown }[],
  extra: Record<string, unknown> = {},
): ClosureDoc => ({
  user_id: owner,
  created_at: localDayToISO(fecha),
  metadata: { waste_details: items, ...extra },
});

const directory: Record<string, CompanyInfo> = {
  empA: { name: 'Alfa SpA', rut: '76.111.111-1', isManual: false },
  empB: { name: 'Beta Ltda', rut: '76.222.222-2', isManual: false },
  manual1: { name: 'Minimarket Gamma', rut: '12.345.678-9', isManual: true },
};

const stored = (over: Partial<StoredClosure>): StoredClosure => ({
  id: 'x', period: '2026-08', destination_id: 'gcr', destination_name: 'GCR',
  companies: [], total_kg: 0, fingerprint: '', closed_by: null,
  closed_at: '2026-09-01T12:00:00.000Z', ...over,
});

describe('buildClosureCompanies', () => {
  it('atribuye el retiro de un cliente manual al cliente, no al operario', () => {
    const docs = [retiro('2026-09-10', 'operario', [{ waste_type: 'Cartón', quantity: 10 }],
      { unregistered_client_id: 'manual1' })];
    const [c] = buildClosureCompanies(docs, directory, '2026-09');
    expect(c.companyId).toBe('manual1');
    expect(c.name).toBe('Minimarket Gamma');
    expect(c.isManual).toBe(true);
  });

  it('usa «Empresa sin ficha» si la empresa no está en el directorio', () => {
    const docs = [retiro('2026-09-10', 'operario', [{ waste_type: 'Cartón', quantity: 5 }],
      { unregistered_client_id: 'borrado' })];
    const [c] = buildClosureCompanies(docs, directory, '2026-09');
    expect(c.name).toBe(UNKNOWN_COMPANY_NAME);
    expect(c.isManual).toBe(true);
  });

  it('agrupa por material y trunca cada ítem antes de sumar, como en los CT', () => {
    const docs = [
      retiro('2026-09-02', 'empA', [{ waste_type: 'Vidrio', quantity: 1.19 }]),
      retiro('2026-09-03', 'empA', [{ waste_type: 'Vidrio', quantity: 1.19 }]),
    ];
    const [c] = buildClosureCompanies(docs, directory, '2026-09');
    expect(c.materials).toEqual([{ material: 'Vidrio', kg: 2.2 }]);
    expect(c.totalKg).toBe(2.2);
  });

  it('lee cantidades escritas con coma decimal', () => {
    const docs = [retiro('2026-09-02', 'empA', [{ waste_type: 'Vidrio', quantity: '9,4' }])];
    const [c] = buildClosureCompanies(docs, directory, '2026-09');
    expect(c.totalKg).toBe(9.4);
  });

  it('incluye el último día del mes y excluye el primero del siguiente', () => {
    const docs = [
      retiro('2026-09-30', 'empA', [{ waste_type: 'Vidrio', quantity: 3 }]),
      retiro('2026-10-01', 'empA', [{ waste_type: 'Vidrio', quantity: 7 }]),
    ];
    const [c] = buildClosureCompanies(docs, directory, '2026-09');
    expect(c.totalKg).toBe(3);
  });

  it('omite documentos sin residuos y no crea empresas vacías', () => {
    const docs = [retiro('2026-09-10', 'empB', [])];
    expect(buildClosureCompanies(docs, directory, '2026-09')).toEqual([]);
  });

  it('junta los N° de CT sin repetir, como CT y en orden', () => {
    const docs = [
      retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }], { cert_number: 'CR N°:010' }),
      retiro('2026-09-05', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }], { cert_number: 'CT N°:002' }),
    ];
    const [c] = buildClosureCompanies(docs, directory, '2026-09');
    expect(c.certNumbers).toEqual(['CT N°:002', 'CT N°:010']);
  });

  it('ordena las empresas por nombre', () => {
    const docs = [
      retiro('2026-09-10', 'empB', [{ waste_type: 'Vidrio', quantity: 1 }]),
      retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }]),
    ];
    expect(buildClosureCompanies(docs, directory, '2026-09').map(c => c.name))
      .toEqual(['Alfa SpA', 'Beta Ltda']);
  });
});

describe('groupByDestination', () => {
  it('deja fuera las empresas en «No incluir»', () => {
    const docs = [
      retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }]),
      retiro('2026-09-10', 'empB', [{ waste_type: 'Vidrio', quantity: 2 }]),
    ];
    const companies = buildClosureCompanies(docs, directory, '2026-09');
    const groups = groupByDestination(companies, { empA: 'gcr', empB: null });
    expect([...groups.keys()]).toEqual(['gcr']);
    expect(groups.get('gcr')!.map(c => c.companyId)).toEqual(['empA']);
  });
});

describe('defaultAssignment', () => {
  const companies = buildClosureCompanies([
    retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }]),
    retiro('2026-09-10', 'empB', [{ waste_type: 'Vidrio', quantity: 1 }]),
  ], directory, '2026-09');
  const withA = (dest: string, period: string) => stored({
    destination_id: dest, period, companies: [companies[0]],
  });

  it('toma el gestor del cierre más reciente en que aparece la empresa', () => {
    const closures = [withA('sorepa', '2026-07'), withA('gcr', '2026-08')];
    expect(defaultAssignment(companies, closures, ['gcr', 'sorepa'], '2026-09'))
      .toEqual({ empA: 'gcr', empB: null });
  });

  it('ignora cierres de meses posteriores al que se está cerrando', () => {
    const closures = [withA('gcr', '2026-08'), withA('sorepa', '2026-10')];
    expect(defaultAssignment(companies, closures, ['gcr', 'sorepa'], '2026-09').empA).toBe('gcr');
  });

  it('si el mes ya está cerrado, usa solo ese cierre: lo excluido sigue excluido', () => {
    const closures = [
      withA('gcr', '2026-08'),
      stored({ destination_id: 'gcr', period: '2026-09', companies: [companies[1]] }),
    ];
    expect(defaultAssignment(companies, closures, ['gcr'], '2026-09'))
      .toEqual({ empA: null, empB: 'gcr' });
  });

  it('deja en «No incluir» si el gestor anterior está desactivado', () => {
    const closures = [withA('viejo', '2026-08')];
    expect(defaultAssignment(companies, closures, ['gcr'], '2026-09').empA).toBeNull();
  });
});

describe('staleDestinationIds', () => {
  it('devuelve los gestores del período que ya no tienen empresas', () => {
    const closures = [
      stored({ period: '2026-09', destination_id: 'gcr' }),
      stored({ period: '2026-09', destination_id: 'sorepa' }),
      stored({ period: '2026-08', destination_id: 'otro' }),
    ];
    expect(staleDestinationIds(closures, '2026-09', ['gcr'])).toEqual(['sorepa']);
  });
});

describe('snapshotFingerprint', () => {
  const docs = [
    retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }], { cert_number: 'CT N°:001' }),
    retiro('2026-09-11', 'empB', [{ waste_type: 'Vidrio', quantity: 2 }], { cert_number: 'CT N°:002' }),
  ];

  it('no cambia si solo cambia el orden de los documentos', () => {
    const a = snapshotFingerprint(buildClosureCompanies(docs, directory, '2026-09'));
    const b = snapshotFingerprint(buildClosureCompanies([...docs].reverse(), directory, '2026-09'));
    expect(a).toBe(b);
  });

  it('cambia si cambia un kilo o aparece un CT', () => {
    const base = snapshotFingerprint(buildClosureCompanies(docs, directory, '2026-09'));
    const otroKg = [docs[0], retiro('2026-09-11', 'empB', [{ waste_type: 'Vidrio', quantity: 3 }], { cert_number: 'CT N°:002' })];
    const otroCt = [...docs, retiro('2026-09-12', 'empB', [{ waste_type: 'Vidrio', quantity: 0.5 }], { cert_number: 'CT N°:003' })];
    expect(snapshotFingerprint(buildClosureCompanies(otroKg, directory, '2026-09'))).not.toBe(base);
    expect(snapshotFingerprint(buildClosureCompanies(otroCt, directory, '2026-09'))).not.toBe(base);
  });
});

describe('closureTotalKg y closureToTsv', () => {
  const companies = buildClosureCompanies([
    retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1.25 }, { waste_type: 'Cartón', quantity: 2 }], { cert_number: 'CT N°:001' }),
    retiro('2026-09-10', 'empB', [{ waste_type: 'Vidrio', quantity: 4 }], { cert_number: 'CT N°:002' }),
  ], { ...directory, empB: { name: 'Beta\tLtda\nSur', rut: '1-9', isManual: false } }, '2026-09');

  it('suma los totales ya truncados', () => {
    expect(closureTotalKg(companies)).toBe(7.2);
  });

  it('arma una fila por residuo, subtotal por empresa y total general', () => {
    const lines = closureToTsv('GCR', '2026-09', companies).split('\n');
    expect(lines[0]).toBe('Cierre Septiembre 2026 — GCR');
    expect(lines[2]).toBe('Empresa\tRUT\tResiduo\tKg\tN° CT');
    expect(lines).toContain('Alfa SpA\t76.111.111-1\tCartón\t2,0\tCT N°:001');
    expect(lines).toContain('\t\tSubtotal Alfa SpA\t3,2\t');
    expect(lines[lines.length - 1]).toBe('TOTAL\t\t\t7,2\t');
  });

  it('neutraliza fórmulas y comillas en los textos', () => {
    const peligrosas = buildClosureCompanies([
      retiro('2026-09-10', 'empA', [{ waste_type: 'Vidrio', quantity: 1 }]),
    ], { empA: { name: '=HYPERLINK("http://x")', rut: '+1', isManual: false } }, '2026-09');
    const tsv = closureToTsv('GCR', '2026-09', peligrosas);
    expect(tsv).toContain("'=HYPERLINK('http://x')\t'+1\tVidrio");
    expect(tsv).not.toContain('"');
  });

  it('limpia tabulaciones y saltos de línea en los textos', () => {
    const tsv = closureToTsv('GCR', '2026-09', companies);
    expect(tsv).toContain('Beta Ltda Sur\t1-9\tVidrio\t4,0\tCT N°:002');
  });
});
