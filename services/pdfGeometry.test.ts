import { describe, it, expect } from 'vitest';
import { fitWithinA4, A4_WIDTH_PT, A4_HEIGHT_PT } from './pdfGeometry';

describe('fitWithinA4', () => {
  it('scales a tall image to fit the A4 height', () => {
    const { width, height } = fitWithinA4(1000, 2000);
    // height-bound: scale = 841.89/2000 = 0.420945
    expect(height).toBeCloseTo(A4_HEIGHT_PT, 1);
    expect(width).toBeCloseTo(420.945, 1);
  });

  it('scales a wide image to fit the A4 width', () => {
    const { width } = fitWithinA4(2000, 1000);
    expect(width).toBeCloseTo(A4_WIDTH_PT, 1);
  });
});
