import { describe, it, expect } from 'vitest';
import { truncateTo, formatKg, formatKgCompact, sumTruncated } from './formatKg';

describe('truncateTo', () => {
  it('corta hacia abajo, no redondea', () => {
    // El gestor final cierra hacia abajo: 9,49 son 9,4 y 9,99 son 9,9.
    expect(truncateTo(9.49)).toBe(9.4);
    expect(truncateTo(9.99)).toBe(9.9);
    expect(truncateTo(9.45)).toBe(9.4);
  });

  it('sobrevive al error de la coma flotante', () => {
    // 9.7 * 10 da 96.99999999999999: un trunc directo dejaría 9,6.
    expect(truncateTo(9.7)).toBe(9.7);
    expect(truncateTo(0.3)).toBe(0.3);
    expect(truncateTo(1.1)).toBe(1.1);
    expect(truncateTo(2.9)).toBe(2.9);
  });

  it('deja intactos los valores que ya caben', () => {
    expect(truncateTo(100)).toBe(100);
    expect(truncateTo(0)).toBe(0);
  });

  it('trunca hacia cero en negativos, sin sorpresas', () => {
    expect(truncateTo(-9.49)).toBe(-9.4);
  });

  it('no propaga valores inválidos', () => {
    expect(truncateTo(NaN)).toBe(0);
    expect(truncateTo(Infinity)).toBe(0);
  });
});

describe('formatKg', () => {
  it('usa punto para miles y coma para decimales', () => {
    expect(formatKg(1234.5)).toBe('1.234,5');
    expect(formatKg(1234567.8)).toBe('1.234.567,8');
  });

  it('muestra siempre un decimal', () => {
    expect(formatKg(100)).toBe('100,0');
    expect(formatKg(0)).toBe('0,0');
  });

  it('trunca antes de formatear', () => {
    expect(formatKg(9.49)).toBe('9,4');
    expect(formatKg(9.99)).toBe('9,9');
  });
});

describe('formatKgCompact', () => {
  it('descarta los decimales para las cifras grandes', () => {
    expect(formatKgCompact(1234.9)).toBe('1.234');
  });
});

describe('sumTruncated', () => {
  it('la suma cuadra con las filas que se imprimen', () => {
    // Tres filas de 9,99 se muestran como 9,9 cada una: el total tiene que
    // ser 29,7 y no 29,9, o la columna del certificado no cuadra.
    expect(sumTruncated([9.99, 9.99, 9.99])).toBe(29.7);
  });

  it('coincide con el total real cuando no hay que truncar', () => {
    expect(sumTruncated([10, 20.5, 3.2])).toBe(33.7);
  });

  it('devuelve 0 con la lista vacía', () => {
    expect(sumTruncated([])).toBe(0);
  });
});
