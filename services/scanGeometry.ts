export interface Point {
  x: number;
  y: number;
}

export interface OrderedCorners {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export function orderCorners(points: Point[]): OrderedCorners {
  if (points.length !== 4) {
    throw new Error('orderCorners requires exactly 4 points');
  }
  const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => (a.x - a.y) - (b.x - b.y));
  return {
    tl: bySum[0],
    br: bySum[3],
    bl: byDiff[0],
    tr: byDiff[3],
  };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function outputSize(c: OrderedCorners): { width: number; height: number } {
  const width = Math.max(dist(c.tl, c.tr), dist(c.bl, c.br));
  const height = Math.max(dist(c.tl, c.bl), dist(c.tr, c.br));
  return { width: Math.round(width), height: Math.round(height) };
}
