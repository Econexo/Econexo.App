// Lo que tiene que cumplir la carga masiva:
//  · una copia del archivo en la carpeta de cada empresa,
//  · una empresa que falle no detiene a las demás,
//  · un solo aviso por empresa, aunque reciba diez archivos.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const uploads: { path: string }[] = [];
const rpcCalls: any[] = [];
const notifications: any[] = [];
/** Rutas que la simulación hace fallar al subir a Storage. */
let failingPaths: string[] = [];

vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          if (failingPaths.some(p => path.startsWith(p))) {
            return { error: { message: 'storage caído' } };
          }
          uploads.push({ path });
          return { error: null };
        },
      }),
    },
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return { error: null };
    },
  },
}));

vi.mock('./notificationService', () => ({
  createNotification: async (n: any) => { notifications.push(n); },
}));

const { bulkUploadDocuments } = await import('./bulkDocumentUpload');

const empresas = [
  { id: 'emp-1', company_name: 'Minera Norte' },
  { id: 'emp-2', company_name: 'Hotel Costanera' },
  { id: 'emp-3', company_name: 'Casino Antofagasta' },
];

const archivo = (name: string) => new File(['contenido'], name, { type: 'application/pdf' });

const params = {
  type: 'declaration',
  source: 'gestor' as const,
  documentDate: '2026-09-20',
};

beforeEach(() => {
  uploads.length = 0;
  rpcCalls.length = 0;
  notifications.length = 0;
  failingPaths = [];
});

describe('bulkUploadDocuments', () => {
  it('un mismo documento queda en la carpeta de cada empresa', async () => {
    const result = await bulkUploadDocuments({
      ...params,
      files: [archivo('normativa.pdf')],
      companies: empresas,
    });

    expect(result).toMatchObject({ uploaded: 3, total: 3, companiesReached: 3, failures: [] });
    expect(uploads.map(u => u.path.split('/')[0])).toEqual(['emp-1', 'emp-2', 'emp-3']);
    expect(rpcCalls).toHaveLength(3);
    expect(rpcCalls[0].name).toBe('create_admin_document');
    expect(rpcCalls.map(c => c.args._user_id)).toEqual(['emp-1', 'emp-2', 'emp-3']);
    expect(rpcCalls[0].args._content_url).toBe(uploads[0].path);
    expect(rpcCalls[0].args._type).toBe('declaration');
    expect(rpcCalls[0].args._metadata.source).toBe('gestor');
  });

  it('manda un solo aviso por empresa, no uno por archivo', async () => {
    await bulkUploadDocuments({
      ...params,
      files: [archivo('a.pdf'), archivo('b.pdf'), archivo('c.pdf')],
      companies: empresas,
    });

    expect(notifications).toHaveLength(3);
    expect(notifications.map(n => n.userId)).toEqual(['emp-1', 'emp-2', 'emp-3']);
    expect(notifications[0].message).toContain('3 documentos nuevos');
    expect(notifications[0].metadata.files_count).toBe(3);
  });

  it('con un solo archivo el aviso lo nombra', async () => {
    await bulkUploadDocuments({
      ...params,
      files: [archivo('declaración anual.pdf')],
      companies: [empresas[0]],
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain('"declaración anual.pdf"');
  });

  it('una empresa que falla no detiene a las demás', async () => {
    failingPaths = ['emp-2/'];

    const result = await bulkUploadDocuments({
      ...params,
      files: [archivo('normativa.pdf')],
      companies: empresas,
    });

    expect(result.uploaded).toBe(2);
    expect(result.total).toBe(3);
    expect(result.companiesReached).toBe(2);
    expect(result.failures).toEqual([
      { company: 'Hotel Costanera', file: 'normativa.pdf', message: 'storage caído' },
    ]);
    // A la empresa que falló no se le avisa de un documento que no tiene.
    expect(notifications.map(n => n.userId)).toEqual(['emp-1', 'emp-3']);
  });

  it('informa el progreso de cada carga', async () => {
    const progreso: string[] = [];
    await bulkUploadDocuments({
      ...params,
      files: [archivo('a.pdf'), archivo('b.pdf')],
      companies: [empresas[0], empresas[1]],
      onProgress: (done, total) => progreso.push(`${done}/${total}`),
    });

    expect(progreso).toEqual(['1/4', '2/4', '3/4', '4/4']);
  });

  it('exige archivos y empresas', async () => {
    await expect(bulkUploadDocuments({ ...params, files: [], companies: empresas }))
      .rejects.toThrow('archivo');
    await expect(bulkUploadDocuments({ ...params, files: [archivo('a.pdf')], companies: [] }))
      .rejects.toThrow('empresa');
  });
});
