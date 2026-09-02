/**
 * Document scanner — pure Canvas 2D implementation.
 * No external dependencies, no WASM, works on all browsers including Safari iOS.
 */
import type { Point } from './scanGeometry';
import {
  orderCorners,
  outputSize,
  convexHull,
  simplifyHull,
  largestQuad,
  quadLooksLikeDocument,
  polygonArea,
} from './scanGeometry';

export type FilterMode = 'bw' | 'gray' | 'color' | 'magic';

// Cap the working resolution so the perspective warp stays fast on mobile.
const MAX_DIM = 1400;

function scaleDown(src: HTMLCanvasElement): { canvas: HTMLCanvasElement; scaleX: number; scaleY: number } {
  const s = Math.min(1, MAX_DIM / Math.max(src.width, src.height));
  if (s === 1) return { canvas: src, scaleX: 1, scaleY: 1 };
  const out = document.createElement('canvas');
  out.width = Math.round(src.width * s);
  out.height = Math.round(src.height * s);
  out.getContext('2d')!.drawImage(src, 0, 0, out.width, out.height);
  return { canvas: out, scaleX: s, scaleY: s };
}

// ── Homography via Gaussian elimination ──────────────────────────────────────

function gaussElim(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = M[row][n];
    for (let col = row + 1; col < n; col++) x[row] -= M[row][col] * x[col];
    x[row] /= M[row][row];
  }
  return x;
}

/**
 * Compute the 8-element inverse homography H such that for each destination
 * pixel (xd, yd) the corresponding source pixel is (xs, ys):
 *   w  = H[6]*xd + H[7]*yd + 1
 *   xs = (H[0]*xd + H[1]*yd + H[2]) / w
 *   ys = (H[3]*xd + H[4]*yd + H[5]) / w
 */
function buildInverseH(
  dstPts: [number, number][],
  srcPts: [number, number][],
): number[] {
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [xd, yd] = dstPts[i];
    const [xs, ys] = srcPts[i];
    rows.push([-xd, -yd, -1, 0, 0, 0, xs * xd, xs * yd]);
    rhs.push(-xs);
    rows.push([0, 0, 0, -xd, -yd, -1, ys * xd, ys * yd]);
    rhs.push(-ys);
  }
  return gaussElim(rows, rhs);
}

function mapDstToSrc(H: number[], xd: number, yd: number): [number, number] {
  const w = H[6] * xd + H[7] * yd + 1;
  return [(H[0] * xd + H[1] * yd + H[2]) / w, (H[3] * xd + H[4] * yd + H[5]) / w];
}

/** Bilinear sample from srcData at floating-point (x, y), channel c. */
function sample(data: Uint8ClampedArray, sw: number, sh: number, x: number, y: number, c: number): number {
  const x0 = Math.floor(x); const x1 = Math.min(x0 + 1, sw - 1);
  const y0 = Math.floor(y); const y1 = Math.min(y0 + 1, sh - 1);
  const fx = x - x0; const fy = y - y0;
  return (1 - fx) * (1 - fy) * data[(y0 * sw + x0) * 4 + c]
       + fx * (1 - fy) * data[(y0 * sw + x1) * 4 + c]
       + (1 - fx) * fy  * data[(y1 * sw + x0) * 4 + c]
       + fx * fy         * data[(y1 * sw + x1) * 4 + c];
}

// ── Public API ───────────────────────────────────────────────────────────────

// ── Detección automática de bordes ───────────────────────────────────────────
// Canalización: escala de grises → desenfoque → Sobel → umbral por percentil →
// dilatación → componente conexa mayor → envolvente convexa → cuadrilátero.
// Todo en JS puro: sin WASM ni OpenCV, funciona en Safari iOS y en cada frame
// de la vista previa de la cámara.

/** Resolución de trabajo de la detección. Suficiente para un folio, y rápida. */
const DETECT_DIM = 320;

function toGray(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return gray;
}

/** Desenfoque de caja 3×3 separable. Dos pasadas ≈ gaussiana. */
function boxBlur(src: Float32Array, w: number, h: number, passes = 2): Float32Array {
  let cur = src;
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1);
        tmp[y * w + x] = (cur[y * w + x0] + cur[y * w + x] + cur[y * w + x1]) / 3;
      }
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - 1), y1 = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x++) {
        out[y * w + x] = (tmp[y0 * w + x] + tmp[y * w + x] + tmp[y1 * w + x]) / 3;
      }
    }
    cur = out;
  }
  return cur;
}

/** Magnitud del gradiente de Sobel. */
function sobelMagnitude(gray: Float32Array, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1], t = gray[i - w], tr = gray[i - w + 1];
      const l = gray[i - 1], r = gray[i + 1];
      const bl = gray[i + w - 1], b = gray[i + w], br = gray[i + w + 1];
      const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      mag[i] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

/**
 * Binariza quedándose con el `ratio` superior de los gradientes. Un percentil
 * se adapta mejor que un umbral fijo a fotos oscuras o de bajo contraste.
 */
function thresholdByPercentile(mag: Float32Array, ratio: number): Uint8Array {
  const HIST = 256;
  let max = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > max) max = mag[i];
  if (max <= 0) return new Uint8Array(mag.length);

  const hist = new Int32Array(HIST);
  for (let i = 0; i < mag.length; i++) {
    hist[Math.min(HIST - 1, Math.floor((mag[i] / max) * (HIST - 1)))]++;
  }

  const target = Math.floor(mag.length * ratio);
  let acc = 0;
  let bin = HIST - 1;
  for (let b = HIST - 1; b >= 0; b--) {
    acc += hist[b];
    if (acc >= target) { bin = b; break; }
  }

  const threshold = (bin / (HIST - 1)) * max;
  const out = new Uint8Array(mag.length);
  for (let i = 0; i < mag.length; i++) out[i] = mag[i] >= threshold ? 1 : 0;
  return out;
}

/** Dilatación 3×3: cierra los huecos del borde para que forme una sola pieza. */
function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          out[ny * w + nx] = 1;
        }
      }
    }
  }
  return out;
}

/** Píxeles de la componente conexa (8-vecinos) con el mayor recuadro. */
function largestComponent(mask: Uint8Array, w: number, h: number): Point[] | null {
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);

  let bestPixels: Point[] | null = null;
  let bestScore = 0;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;

    let head = 0, tail = 0;
    queue[tail++] = start;
    seen[start] = 1;

    const pixels: Point[] = [];
    let minX = w, maxX = 0, minY = h, maxY = 0;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % w;
      const y = (idx / w) | 0;
      pixels.push({ x, y });
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const n = ny * w + nx;
          if (mask[n] && !seen[n]) { seen[n] = 1; queue[tail++] = n; }
        }
      }
    }

    // Puntuar por el área del recuadro: el marco de la hoja es la pieza que
    // más superficie abarca, aunque tenga menos píxeles que una zona de texto.
    const score = (maxX - minX + 1) * (maxY - minY + 1);
    if (score > bestScore) { bestScore = score; bestPixels = pixels; }
  }

  return bestPixels;
}

export interface DetectOptions {
  /** Fracción mínima del encuadre que debe ocupar la hoja. */
  minAreaRatio?: number;
}

/**
 * Detecta las cuatro esquinas del documento en la imagen. Devuelve los puntos
 * en coordenadas del canvas original, o null si no hay nada suficientemente
 * parecido a una hoja (la interfaz cae entonces al ajuste manual).
 */
export function detectDocument(
  srcCanvas: HTMLCanvasElement,
  options: DetectOptions = {},
): Point[] | null {
  const { minAreaRatio = 0.15 } = options;

  const scale = Math.min(1, DETECT_DIM / Math.max(srcCanvas.width, srcCanvas.height));
  const w = Math.max(1, Math.round(srcCanvas.width * scale));
  const h = Math.max(1, Math.round(srcCanvas.height * scale));
  if (w < 32 || h < 32) return null;

  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const ctx = work.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(srcCanvas, 0, 0, w, h);

  let pixels: ImageData;
  try {
    pixels = ctx.getImageData(0, 0, w, h);
  } catch {
    return null; // canvas contaminado (imagen de otro origen)
  }

  const gray = boxBlur(toGray(pixels.data, w, h), w, h);
  const mag = sobelMagnitude(gray, w, h);
  const mask = dilate(thresholdByPercentile(mag, 0.12), w, h);

  const component = largestComponent(mask, w, h);
  if (!component || component.length < 40) return null;

  const hull = simplifyHull(convexHull(component), 22);
  const quad = largestQuad(hull);
  if (!quad) return null;

  if (!quadLooksLikeDocument(quad, w, h, minAreaRatio)) return null;

  // Si el cuadrilátero es prácticamente todo el encuadre, lo detectado es el
  // borde de la propia foto y no una hoja: no aporta nada recortar por ahí.
  if (polygonArea(quad) > w * h * 0.985) return null;

  const inv = 1 / scale;
  return orderCornersToArray(quad.map(p => ({ x: p.x * inv, y: p.y * inv })));
}

/** Esquinas en orden tl → tr → br → bl, que es lo que espera la interfaz. */
function orderCornersToArray(points: Point[]): Point[] {
  const o = orderCorners(points);
  return [o.tl, o.tr, o.br, o.bl];
}

/**
 * Perspective-warp the quadrilateral defined by `corners` into a flat
 * rectangle using a homography. Bilinear sampling for smooth output.
 */
export function warpDocument(srcCanvas: HTMLCanvasElement, corners: Point[]): HTMLCanvasElement {
  const { canvas: src, scaleX, scaleY } = scaleDown(srcCanvas);
  const scaledCorners = corners.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));

  const o = orderCorners(scaledCorners);
  const { width, height } = outputSize(o);

  const H = buildInverseH(
    [[0, 0], [width, 0], [width, height], [0, height]],
    [[o.tl.x, o.tl.y], [o.tr.x, o.tr.y], [o.br.x, o.br.y], [o.bl.x, o.bl.y]],
  );

  const srcPx = src.getContext('2d')!.getImageData(0, 0, src.width, src.height);
  const sd = srcPx.data;
  const sw = src.width;
  const sh = src.height;

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outCtx = out.getContext('2d')!;
  const outPx = outCtx.createImageData(width, height);
  const od = outPx.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sx, sy] = mapDstToSrc(H, x, y);
      const di = (y * width + x) * 4;
      if (sx >= 0 && sx < sw && sy >= 0 && sy < sh) {
        od[di]     = sample(sd, sw, sh, sx, sy, 0);
        od[di + 1] = sample(sd, sw, sh, sx, sy, 1);
        od[di + 2] = sample(sd, sw, sh, sx, sy, 2);
        od[di + 3] = 255;
      }
    }
  }

  outCtx.putImageData(outPx, 0, 0);
  return out;
}

/**
 * Applies a document filter using Canvas 2D ImageData.
 * 'color' → unchanged;                'gray'  → luminance grayscale;
 * 'bw'    → adaptive threshold;       'magic' → blanquea el papel y realza la tinta.
 */
export function applyFilter(canvas: HTMLCanvasElement, mode: FilterMode): HTMLCanvasElement {
  if (mode === 'color') return canvas;
  if (mode === 'magic') return magicColor(canvas);

  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const W = out.width;
  const H = out.height;

  // Luminance grayscale
  const gray = new Uint8Array(W * H);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  }

  if (mode === 'gray') {
    for (let i = 0; i < gray.length; i++) {
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = gray[i];
    }
  } else {
    // Adaptive threshold using integral image (handles uneven lighting)
    const half = Math.max(7, (Math.round(Math.min(W, H) / 24) | 1) >> 1);
    const C = 8;

    const intg = new Float64Array((W + 1) * (H + 1));
    for (let y = 1; y <= H; y++) {
      for (let x = 1; x <= W; x++) {
        intg[y * (W + 1) + x] =
          gray[(y - 1) * W + (x - 1)]
          + intg[(y - 1) * (W + 1) + x]
          + intg[y * (W + 1) + (x - 1)]
          - intg[(y - 1) * (W + 1) + (x - 1)];
      }
    }

    for (let y = 0; y < H; y++) {
      const y1 = Math.max(0, y - half);
      const y2 = Math.min(H, y + half + 1);
      for (let x = 0; x < W; x++) {
        const x1 = Math.max(0, x - half);
        const x2 = Math.min(W, x + half + 1);
        const sum = intg[y2 * (W + 1) + x2]
          - intg[y1 * (W + 1) + x2]
          - intg[y2 * (W + 1) + x1]
          + intg[y1 * (W + 1) + x1];
        const mean = sum / ((x2 - x1) * (y2 - y1));
        const v = gray[y * W + x] < mean - C ? 0 : 255;
        const di = (y * W + x) * 4;
        d[di] = d[di + 1] = d[di + 2] = v;
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  return out;
}


/**
 * Filtro "Magic Color": deja el papel blanco y la tinta viva, sin perder los
 * sellos ni las firmas de color. Tres pasos: estirado de contraste por canal
 * (corrige la dominante amarilla de la luz artificial), realce de saturación
 * y una máscara de enfoque suave para recuperar el texto pequeño.
 */
function magicColor(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0);

  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const W = out.width;
  const H = out.height;
  const n = W * H;

  // 1 · Estirado de contraste por canal, recortando colas del 0,5 %.
  const CLIP = 0.005;
  for (let c = 0; c < 3; c++) {
    const hist = new Int32Array(256);
    for (let i = 0; i < n; i++) hist[d[i * 4 + c]]++;

    const cut = Math.floor(n * CLIP);
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > cut) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > cut) { hi = v; break; } }
    if (hi - lo < 16) continue; // canal plano: estirarlo solo añadiría ruido

    const lut = new Uint8ClampedArray(256);
    const span = hi - lo;
    for (let v = 0; v < 256; v++) {
      // Gamma < 1 aclara el papel sin quemar la tinta.
      const norm = Math.min(1, Math.max(0, (v - lo) / span));
      lut[v] = Math.round(Math.pow(norm, 0.85) * 255);
    }
    for (let i = 0; i < n; i++) d[i * 4 + c] = lut[d[i * 4 + c]];
  }

  // 2 · Realce de saturación en torno a la luminancia (sellos y firmas).
  const SAT = 1.25;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const lum = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
    d[o] = Math.max(0, Math.min(255, lum + (d[o] - lum) * SAT));
    d[o + 1] = Math.max(0, Math.min(255, lum + (d[o + 1] - lum) * SAT));
    d[o + 2] = Math.max(0, Math.min(255, lum + (d[o + 2] - lum) * SAT));
  }

  // 3 · Máscara de enfoque 3×3 (kernel laplaciano suave).
  const AMOUNT = 0.45;
  const copy = new Uint8ClampedArray(d);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const i = o + c;
        const around = (
          copy[i - W * 4] + copy[i + W * 4] + copy[i - 4] + copy[i + 4]
        ) / 4;
        d[i] = Math.max(0, Math.min(255, copy[i] + (copy[i] - around) * AMOUNT));
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  return out;
}
