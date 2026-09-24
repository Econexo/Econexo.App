import { describe, it, expect } from 'vitest';
import { resolveTransportResolution, DEFAULT_TRANSPORT_RESOLUTION } from './transportistas';

describe('resolveTransportResolution', () => {
  it('sin transportista imprime la resolución de EcoNexo', () => {
    // Certificados emitidos antes de que existiera el selector.
    expect(resolveTransportResolution()).toBe(DEFAULT_TRANSPORT_RESOLUTION);
    expect(resolveTransportResolution(null)).toBe(DEFAULT_TRANSPORT_RESOLUTION);
    expect(resolveTransportResolution({ name: 'EcoNexo SpA' })).toBe(DEFAULT_TRANSPORT_RESOLUTION);
  });

  it('una resolución vacía o en blanco también cae al fallback', () => {
    expect(resolveTransportResolution({ resolution: '' })).toBe(DEFAULT_TRANSPORT_RESOLUTION);
    expect(resolveTransportResolution({ resolution: '   ' })).toBe(DEFAULT_TRANSPORT_RESOLUTION);
    expect(resolveTransportResolution({ resolution: null })).toBe(DEFAULT_TRANSPORT_RESOLUTION);
  });

  it('usa el número del transportista elegido', () => {
    expect(resolveTransportResolution({ resolution: '9876543210' })).toBe('9876543210');
    expect(resolveTransportResolution({ resolution: '  9876543210  ' })).toBe('9876543210');
  });

  it('no repite el rótulo que el PDF ya imprime', () => {
    // El campo es libre: hay que tolerar que venga escrito de varias formas.
    expect(resolveTransportResolution({ resolution: 'RESOLUCIÓN N° : 2402341155' })).toBe('2402341155');
    expect(resolveTransportResolution({ resolution: 'Resolución N°7621' })).toBe('7621');
    expect(resolveTransportResolution({ resolution: 'resolucion sanitaria 1234' })).toBe('1234');
    expect(resolveTransportResolution({ resolution: 'N° 5566' })).toBe('5566');
  });

  it('conserva el texto que sigue al número', () => {
    expect(resolveTransportResolution({ resolution: 'Resolución N°7621 SEREMI DE SALUD ANTOFAGASTA' }))
      .toBe('7621 SEREMI DE SALUD ANTOFAGASTA');
  });
});
