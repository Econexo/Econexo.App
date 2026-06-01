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
