/**
 * Document scanner — pure Canvas 2D implementation.
 * No external dependencies, no WASM, works on all browsers including Safari iOS.
 */
import type { Point } from './scanGeometry';
import { orderCorners, outputSize } from './scanGeometry';

export type FilterMode = 'bw' | 'gray' | 'color';

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

/**
 * Auto-detect document edges — returns null (pure-JS Canny is out of scope;
 * the UI always falls back to manual corner adjustment).
 */
export function detectDocument(_srcCanvas: HTMLCanvasElement): Point[] | null {
  return null;
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
 * 'color' → unchanged; 'gray' → luminance grayscale;
 * 'bw'    → adaptive threshold (integral-image block-mean − C).
 */
export function applyFilter(canvas: HTMLCanvasElement, mode: FilterMode): HTMLCanvasElement {
  if (mode === 'color') return canvas;

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
