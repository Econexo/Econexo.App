// Lo que importa del CT: que el número de resolución impreso sea el del
// transportista con que se emitió, y que un certificado sin transportista —los
// emitidos antes de que fuera seleccionable— siga saliendo con el de EcoNexo.
//
// Se captura el PDF interceptando URL.createObjectURL, que es lo que usa
// doc.output('bloburl') en la rama 'preview'. El PDF se genera sin compresión,
// así que el texto se puede leer directo del contenido.

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { DEFAULT_TRANSPORT_RESOLUTION } from '../utils/transportistas';

let captured: Blob | null = null;

beforeAll(() => {
    // jsPDF resuelve atob/btoa contra el objeto global que encuentre: si hay
    // window, tiene que traerlos.
    (globalThis as any).window = {
        open: vi.fn(),
        atob: globalThis.atob,
        btoa: globalThis.btoa,
        URL: globalThis.URL,
    };
    if (!(globalThis as any).navigator) {
        Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true });
    }
    (globalThis as any).URL.createObjectURL = (blob: Blob) => {
        captured = blob;
        return 'blob:test';
    };
});

const client = { company_name: 'Minera Norte', rut: '76.111.222-3', address: 'Antofagasta' };
const items = [{ waste_type: 'Cartón', description: 'Compactado', quantity: 120, unit: 'Kg' }];

async function renderCT(transporter?: { name: string; resolution: string } | null): Promise<string> {
    const { generateCT } = await import('./pdfGenerator');
    captured = null;
    generateCT(client, items, 'CT N°:042', 'preview', '2026-09-20', transporter);
    expect(captured).not.toBeNull();
    return await (captured as unknown as Blob).text();
}

describe('generateCT · resolución sanitaria del transporte', () => {
    it('imprime la resolución del transportista elegido', async () => {
        const pdf = await renderCT({ name: 'Transportes del Norte', resolution: '9988776655' });
        expect(pdf).toContain('9988776655');
        expect(pdf).not.toContain(DEFAULT_TRANSPORT_RESOLUTION);
    });

    it('sin transportista imprime la de EcoNexo', async () => {
        // Certificados emitidos antes del selector: al re-descargarlos tienen que
        // salir idénticos a como se entregaron.
        const pdf = await renderCT();
        expect(pdf).toContain(DEFAULT_TRANSPORT_RESOLUTION);
    });

    it('no repite el rótulo si la ficha lo trae escrito', async () => {
        const pdf = await renderCT({ name: 'Transportes del Norte', resolution: 'RESOLUCIÓN N° : 4455' });
        expect(pdf).not.toContain('N° : RESOLUCI');
        expect(pdf).toContain('4455');
    });
});
