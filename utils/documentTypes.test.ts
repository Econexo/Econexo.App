import { describe, it, expect } from 'vitest';
import {
  DOC_TYPE,
  TRANSPORTE_TYPES,
  WASTE_DOC_TYPES,
  isTransportDoc,
  CERT_PREFIX,
  CERT_NUMBER_RE,
  CERT_TITLE,
  toTransportLabel,
} from './documentTypes';

describe('isTransportDoc', () => {
  it('reconoce el código nuevo', () => {
    expect(isTransportDoc('CT')).toBe(true);
  });

  it('sigue reconociendo el código anterior', () => {
    // Los certificados emitidos antes del cambio de nombre no pueden
    // desaparecer de los totales mientras no se aplique la migración.
    expect(isTransportDoc('CR')).toBe(true);
  });

  it('no confunde otros documentos de la cadena', () => {
    expect(isTransportDoc('CR_ACOPIO')).toBe(false);  // lo emite el acopio
    expect(isTransportDoc('cdf')).toBe(false);        // disposición final
    expect(isTransportDoc('CGM')).toBe(false);
    expect(isTransportDoc('COMMUNITY_CR')).toBe(false);
  });

  it('tolera ausencia de tipo', () => {
    expect(isTransportDoc(undefined)).toBe(false);
    expect(isTransportDoc(null)).toBe(false);
    expect(isTransportDoc('')).toBe(false);
  });
});

describe('WASTE_DOC_TYPES', () => {
  it('cubre todo lo que aporta kilos', () => {
    expect(WASTE_DOC_TYPES).toContain('CT');
    expect(WASTE_DOC_TYPES).toContain('CR');
    expect(WASTE_DOC_TYPES).toContain('COMMUNITY_CR');
  });

  it('no incluye documentos de terceros ni resúmenes', () => {
    // El CGM agrega los mismos kilos: contarlo duplicaría los totales.
    expect(WASTE_DOC_TYPES).not.toContain('CGM');
    expect(WASTE_DOC_TYPES).not.toContain('CR_ACOPIO');
    expect(WASTE_DOC_TYPES).not.toContain('cdf');
  });
});

describe('numeración correlativa', () => {
  const numeroDe = (texto: string) => {
    const m = texto.match(CERT_NUMBER_RE);
    return m ? parseInt(m[1], 10) : 0;
  };

  it('lee el correlativo de un certificado nuevo', () => {
    expect(numeroDe('CT N°:007')).toBe(7);
  });

  it('lee el de uno antiguo, para que la secuencia continúe', () => {
    // Si no reconociera el prefijo viejo, el próximo certificado empezaría
    // de nuevo en 001 y chocaría con los ya entregados.
    expect(numeroDe('CR N°:012')).toBe(12);
    expect(numeroDe('Certificado de Recepción CR N°:012')).toBe(12);
  });

  it('tolera espacios alrededor del número', () => {
    expect(numeroDe('CT N°: 45')).toBe(45);
  });

  it('devuelve 0 con textos que no llevan correlativo', () => {
    expect(numeroDe('Certificado sin número')).toBe(0);
    expect(numeroDe('')).toBe(0);
  });

  it('el prefijo nuevo produce el formato esperado', () => {
    expect(`${CERT_PREFIX}${String(8).padStart(3, '0')}`).toBe('CT N°:008');
  });
});

describe('nombres visibles', () => {
  it('el título ya no dice recepción', () => {
    expect(CERT_TITLE).toBe('Certificado de Transporte');
    expect(CERT_TITLE).not.toContain('Recepción');
  });

  it('los tres eslabones de la cadena tienen códigos distintos', () => {
    const cadena = [
      DOC_TYPE.TRANSPORTE,        // EcoNexo transporta
      DOC_TYPE.RECEPCION_ACOPIO,  // el acopio recibe
      DOC_TYPE.DISPOSICION_FINAL, // disposición final
    ];
    expect(new Set(cadena).size).toBe(3);
  });

  it('el código anterior y el nuevo son distintos entre sí', () => {
    expect(DOC_TYPE.TRANSPORTE).not.toBe(DOC_TYPE.TRANSPORTE_LEGACY);
    expect(TRANSPORTE_TYPES).toHaveLength(2);
  });
});

describe('toTransportLabel', () => {
  it('reescribe el título guardado en la base', () => {
    expect(toTransportLabel('Certificado de Recepción CR N°:007'))
      .toBe('Certificado de Transporte CT N°:007');
  });

  it('conserva el número: el 007 sigue siendo el 007', () => {
    expect(toTransportLabel('CR N°:007')).toBe('CT N°:007');
    expect(toTransportLabel('CR N°:012')).toBe('CT N°:012');
  });

  it('cubre el formato antiguo del Dashboard', () => {
    // Antes de unificar la emisión, el botón del Dashboard numeraba al azar.
    expect(toTransportLabel('CR-4837')).toBe('CT-4837');
    expect(toTransportLabel('Certificado de Recepción CR-4837'))
      .toBe('Certificado de Transporte CT-4837');
  });

  it('no toca lo que ya está en CT', () => {
    expect(toTransportLabel('Certificado de Transporte CT N°:013'))
      .toBe('Certificado de Transporte CT N°:013');
  });

  it('no toca el código del centro de acopio', () => {
    expect(toTransportLabel('CR_ACOPIO')).toBe('CR_ACOPIO');
  });

  it('la función no distingue emisores: eso lo hace quien la llama', () => {
    // El certificado del centro de acopio SÍ es de recepción y no debe
    // renombrarse. Esta función solo reescribe texto, así que los sitios que
    // la usan comprueban isTransportDoc() antes de llamarla.
    expect(isTransportDoc(DOC_TYPE.RECEPCION_ACOPIO)).toBe(false);
  });

  it('no reemplaza CR dentro de otra palabra', () => {
    expect(toTransportLabel('CRC N°:004')).toBe('CRC N°:004');
    expect(toTransportLabel('SCRAP-12')).toBe('SCRAP-12');
  });

  it('tolera vacíos', () => {
    expect(toTransportLabel('')).toBe('');
    expect(toTransportLabel(null)).toBe('');
    expect(toTransportLabel(undefined)).toBe('');
  });
});
