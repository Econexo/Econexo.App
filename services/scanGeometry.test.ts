import { describe, it, expect } from 'vitest';
import {
  orderCorners,
  outputSize,
  polygonArea,
  convexHull,
  simplifyHull,
  largestQuad,
  quadLooksLikeDocument,
  cornersDrift,
  smoothCorners,
} from './scanGeometry';

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

describe('polygonArea', () => {
  it('computes the area of a rectangle', () => {
    expect(polygonArea([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 0, y: 4 },
    ])).toBe(40);
  });

  it('is orientation-independent', () => {
    const cw = [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 10, y: 4 }, { x: 10, y: 0 }];
    expect(polygonArea(cw)).toBe(40);
  });

  it('returns 0 for degenerate input', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });
});

describe('convexHull', () => {
  it('drops interior points', () => {
    const hull = convexHull([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      { x: 5, y: 5 }, // interior
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 5, y: 5 });
  });

  it('survives duplicated points', () => {
    const hull = convexHull([
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 10 },
    ]);
    expect(hull).toHaveLength(4);
  });

  it('returns the input when there are fewer than 3 points', () => {
    expect(convexHull([{ x: 1, y: 1 }])).toHaveLength(1);
  });
});

describe('simplifyHull', () => {
  it('trims to the requested vertex count', () => {
    const octagon = [
      { x: 2, y: 0 }, { x: 8, y: 0 }, { x: 10, y: 2 }, { x: 10, y: 8 },
      { x: 8, y: 10 }, { x: 2, y: 10 }, { x: 0, y: 8 }, { x: 0, y: 2 },
    ];
    expect(simplifyHull(octagon, 4)).toHaveLength(4);
  });

  it('leaves smaller polygons untouched', () => {
    const quad = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
    expect(simplifyHull(quad, 8)).toHaveLength(4);
  });
});

describe('largestQuad', () => {
  it('picks the four extreme corners of a hull', () => {
    const hull = [
      { x: 0, y: 0 }, { x: 50, y: 1 }, { x: 100, y: 0 },
      { x: 100, y: 100 }, { x: 50, y: 99 }, { x: 0, y: 100 },
    ];
    const quad = largestQuad(hull)!;
    expect(quad).toHaveLength(4);
    expect(polygonArea(quad)).toBeGreaterThan(9000);
  });

  it('returns the hull unchanged when it already has 4 vertices', () => {
    const quad = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }];
    expect(largestQuad(quad)).toEqual(quad);
  });

  it('returns null with fewer than 4 vertices', () => {
    expect(largestQuad([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBeNull();
  });
});

describe('quadLooksLikeDocument', () => {
  const page = [
    { x: 10, y: 10 }, { x: 190, y: 12 }, { x: 188, y: 240 }, { x: 12, y: 238 },
  ];

  it('accepts a plausible page', () => {
    expect(quadLooksLikeDocument(page, 200, 250)).toBe(true);
  });

  it('rejects a quad that covers too little of the frame', () => {
    const tiny = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
    expect(quadLooksLikeDocument(tiny, 200, 250)).toBe(false);
  });

  it('rejects an extreme sliver', () => {
    const sliver = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 8 }, { x: 0, y: 8 }];
    expect(quadLooksLikeDocument(sliver, 200, 250, 0)).toBe(false);
  });

  it('rejects a quad with a collapsed corner', () => {
    const spike = [
      { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 250 }, { x: 99, y: 249 },
    ];
    expect(quadLooksLikeDocument(spike, 200, 250)).toBe(false);
  });
});

describe('cornersDrift', () => {
  it('is zero for identical corners', () => {
    const c = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(cornersDrift(c, c)).toBe(0);
  });

  it('averages the per-corner displacement', () => {
    const a = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const b = a.map(p => ({ x: p.x + 3, y: p.y + 4 })); // 5 px cada una
    expect(cornersDrift(a, b)).toBeCloseTo(5, 5);
  });

  it('is Infinity when the sets do not match in size', () => {
    expect(cornersDrift([{ x: 0, y: 0 }], [])).toBe(Infinity);
  });
});

describe('smoothCorners', () => {
  it('returns the new corners when there is no history', () => {
    const next = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(smoothCorners(null, next)).toEqual(next);
  });

  it('moves partway towards the new corners', () => {
    const prev = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const next = [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }];
    const out = orderCorners(smoothCorners(prev, next, 0.5));
    expect(out.tl).toEqual({ x: 5, y: 5 });
  });
});
