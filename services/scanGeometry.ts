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

// ── Utilidades para la detección automática de bordes ────────────────────────

/** Área de un polígono por la fórmula del cordón (shoelace). Siempre positiva. */
export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Producto cruz de (o→a) × (o→b). Signo = orientación del giro. */
function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Envolvente convexa (monotone chain). Devuelve los vértices en sentido
 * antihorario, sin repetir el primero al final.
 */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return [...points];

  const sorted = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));

  // Puntos duplicados hunden el algoritmo: se descartan de entrada.
  const unique: Point[] = [];
  for (const p of sorted) {
    const last = unique[unique.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) unique.push(p);
  }
  if (unique.length < 3) return unique;

  const build = (pts: Point[]): Point[] => {
    const chain: Point[] = [];
    for (const p of pts) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) {
        chain.pop();
      }
      chain.push(p);
    }
    chain.pop();
    return chain;
  };

  return [...build(unique), ...build([...unique].reverse())];
}

/**
 * Reduce un polígono convexo a `max` vértices quitando repetidamente el que
 * menos área aporta. Acota el coste de la búsqueda del cuadrilátero.
 */
export function simplifyHull(hull: Point[], max: number): Point[] {
  const pts = [...hull];
  while (pts.length > max) {
    let worstIndex = 0;
    let worstLoss = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const loss = Math.abs(cross(prev, pts[i], next)) / 2;
      if (loss < worstLoss) { worstLoss = loss; worstIndex = i; }
    }
    pts.splice(worstIndex, 1);
  }
  return pts;
}

/**
 * Elige, entre los vértices de una envolvente convexa, los 4 que encierran
 * la mayor área. Como el polígono es convexo, basta con recorrer índices
 * crecientes: el cuadrilátero resultante conserva el orden del contorno.
 */
export function largestQuad(hull: Point[]): Point[] | null {
  const n = hull.length;
  if (n < 4) return null;
  if (n === 4) return [...hull];

  let best: Point[] | null = null;
  let bestArea = 0;

  for (let a = 0; a < n - 3; a++) {
    for (let b = a + 1; b < n - 2; b++) {
      for (let c = b + 1; c < n - 1; c++) {
        for (let d = c + 1; d < n; d++) {
          const quad = [hull[a], hull[b], hull[c], hull[d]];
          const area = polygonArea(quad);
          if (area > bestArea) { bestArea = area; best = quad; }
        }
      }
    }
  }

  return best;
}

/**
 * Descarta cuadriláteros que no pueden ser una hoja: demasiado pequeños,
 * demasiado degenerados o con esquinas casi encimadas.
 */
export function quadLooksLikeDocument(
  quad: Point[],
  imageWidth: number,
  imageHeight: number,
  minAreaRatio = 0.15,
): boolean {
  if (quad.length !== 4) return false;

  const imageArea = imageWidth * imageHeight;
  if (imageArea <= 0) return false;

  const area = polygonArea(quad);
  if (area < imageArea * minAreaRatio) return false;

  const o = orderCorners(quad);
  const sides = [
    dist(o.tl, o.tr), dist(o.tr, o.br),
    dist(o.br, o.bl), dist(o.bl, o.tl),
  ];

  const minSide = Math.min(...sides);
  const maxSide = Math.max(...sides);
  // Un lado casi nulo, o un rectángulo diez veces más largo que ancho,
  // es casi siempre un reflejo o el borde de la mesa, no una hoja.
  if (minSide < Math.min(imageWidth, imageHeight) * 0.15) return false;
  if (maxSide / minSide > 6) return false;

  // Los ángulos internos de una hoja fotografiada no bajan de ~45°.
  const corners = [o.tl, o.tr, o.br, o.bl];
  for (let i = 0; i < 4; i++) {
    const prev = corners[(i + 3) % 4];
    const curr = corners[i];
    const next = corners[(i + 1) % 4];
    const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const len = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
    if (len === 0) return false;
    const cosA = (v1.x * v2.x + v1.y * v2.y) / len;
    if (Math.abs(cosA) > 0.72) return false; // fuera del rango 44°–136°
  }

  return true;
}

/** Desplazamiento medio entre dos conjuntos de esquinas ya ordenados. */
export function cornersDrift(a: Point[], b: Point[]): number {
  if (a.length !== b.length || a.length === 0) return Infinity;
  const oa = orderCorners(a);
  const ob = orderCorners(b);
  const pairs: [Point, Point][] = [
    [oa.tl, ob.tl], [oa.tr, ob.tr], [oa.br, ob.br], [oa.bl, ob.bl],
  ];
  return pairs.reduce((sum, [p, q]) => sum + dist(p, q), 0) / 4;
}

/** Media exponencial entre las esquinas previas y las nuevas (suaviza el marco). */
export function smoothCorners(previous: Point[] | null, next: Point[], alpha = 0.45): Point[] {
  if (!previous || previous.length !== 4) return next;
  const op = orderCorners(previous);
  const on = orderCorners(next);
  const blend = (p: Point, q: Point): Point => ({
    x: p.x + (q.x - p.x) * alpha,
    y: p.y + (q.y - p.y) * alpha,
  });
  return [blend(op.tl, on.tl), blend(op.tr, on.tr), blend(op.br, on.br), blend(op.bl, on.bl)];
}
