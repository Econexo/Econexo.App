import { describe, it, expect } from 'vitest';
import { orderCorners } from './scanGeometry';

describe('orderCorners', () => {
  it('orders scrambled points into tl, tr, br, bl', () => {
    const scrambled = [
      { x: 10, y: 12 }, // br
      { x: 0, y: 0 },   // tl
      { x: 0, y: 12 },  // bl
      { x: 10, y: 0 },  // tr
    ];
    const c = orderCorners(scrambled);
    expect(c.tl).toEqual({ x: 0, y: 0 });
    expect(c.tr).toEqual({ x: 10, y: 0 });
    expect(c.br).toEqual({ x: 10, y: 12 });
    expect(c.bl).toEqual({ x: 0, y: 12 });
  });

  it('throws when not given exactly 4 points', () => {
    expect(() => orderCorners([{ x: 0, y: 0 }])).toThrow();
  });
});
