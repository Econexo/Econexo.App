import { describe, it, expect } from 'vitest';
import { orderCorners } from './scanGeometry';
import { outputSize } from './scanGeometry';

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

describe('outputSize', () => {
  it('returns the max width and height across opposite edges', () => {
    const corners = {
      tl: { x: 0, y: 0 },
      tr: { x: 100, y: 0 },
      br: { x: 90, y: 200 },
      bl: { x: 0, y: 200 },
    };
    const size = outputSize(corners);
    // width = max(dist(tl,tr)=100, dist(bl,br)=90) = 100
    // height = max(dist(tl,bl)=200, dist(tr,br)=~200.2) = 200
    expect(size.width).toBe(100);
    expect(size.height).toBe(200);
  });
});
