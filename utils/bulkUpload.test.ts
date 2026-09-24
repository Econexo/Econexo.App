import { describe, it, expect } from 'vitest';
import { buildUploadPlan, sanitizeFileName, UploadTargetCompany } from './bulkUpload';

const empresas: UploadTargetCompany[] = [
  { id: 'emp-1', company_name: 'Minera Norte' },
  { id: 'emp-2', company_name: 'Hotel Costanera' },
  { id: 'emp-3', company_name: 'Casino Antofagasta' },
];

const archivos = [{ name: 'declaracion.pdf' }, { name: 'guía nº2.pdf' }];

describe('sanitizeFileName', () => {
  it('quita tildes y caracteres que Storage rechaza', () => {
    expect(sanitizeFileName('Declaración Anual (final).pdf')).toBe('Declaracion_Anual__final_.pdf');
    expect(sanitizeFileName('guía nº2.pdf')).toBe('guia_n_2.pdf');
  });

  it('deja intactos los nombres que ya son seguros', () => {
    expect(sanitizeFileName('ticket-pesaje_01.pdf')).toBe('ticket-pesaje_01.pdf');
  });
});

describe('buildUploadPlan', () => {
  it('cruza cada archivo con cada empresa', () => {
    const plan = buildUploadPlan(archivos, empresas, 1000);
    expect(plan).toHaveLength(6);
  });

  it('un mismo documento a varias empresas', () => {
    const plan = buildUploadPlan([{ name: 'normativa.pdf' }], empresas, 1000);
    expect(plan.map(p => p.company.id)).toEqual(['emp-1', 'emp-2', 'emp-3']);
    expect(plan.every(p => p.file.name === 'normativa.pdf')).toBe(true);
  });

  it('varios documentos a una empresa', () => {
    const plan = buildUploadPlan(archivos, [empresas[0]], 1000);
    expect(plan).toHaveLength(2);
    expect(plan.map(p => p.file.name)).toEqual(['declaracion.pdf', 'guía nº2.pdf']);
  });

  it('agrupa los pares por empresa, para avisar una sola vez a cada una', () => {
    const plan = buildUploadPlan(archivos, empresas, 1000);
    expect(plan.map(p => p.company.id)).toEqual(['emp-1', 'emp-1', 'emp-2', 'emp-2', 'emp-3', 'emp-3']);
  });

  it('cada ruta es única, aunque los nombres se repitan', () => {
    // Dos archivos con el mismo nombre en el mismo milisegundo: sin el índice
    // el segundo chocaría con el primero y la carga fallaría.
    const plan = buildUploadPlan([{ name: 'doc.pdf' }, { name: 'doc.pdf' }], empresas, 1000);
    const rutas = plan.map(p => p.storagePath);
    expect(new Set(rutas).size).toBe(rutas.length);
  });

  it('guarda cada copia en la carpeta de su empresa', () => {
    const plan = buildUploadPlan([{ name: 'doc.pdf' }], empresas, 1000);
    expect(plan.map(p => p.storagePath)).toEqual([
      'emp-1/1000_0_doc.pdf',
      'emp-2/1000_1_doc.pdf',
      'emp-3/1000_2_doc.pdf',
    ]);
  });

  it('sin archivos o sin empresas no hay nada que subir', () => {
    expect(buildUploadPlan([], empresas, 1000)).toEqual([]);
    expect(buildUploadPlan(archivos, [], 1000)).toEqual([]);
  });
});
