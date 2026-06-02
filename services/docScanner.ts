import type { Point } from './scanGeometry';
import { orderCorners, outputSize } from './scanGeometry';

export type FilterMode = 'bw' | 'gray' | 'color';

/** Detects the largest 4-point document contour. Returns null if none found. */
export function detectDocument(cv: any, srcCanvas: HTMLCanvasElement): Point[] | null {
  const src = cv.imread(srcCanvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 75, 200);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let best: Point[] | null = null;
    let bestArea = 0;
    const imgArea = src.rows * src.cols;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const approx = new cv.Mat();
      const peri = cv.arcLength(cnt, true);
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4) {
        const area = cv.contourArea(approx);
        if (area > bestArea && area > imgArea * 0.2) {
          bestArea = area;
          best = [];
          for (let j = 0; j < 4; j++) {
            best.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
          }
        }
      }
      approx.delete();
      cnt.delete();
    }
    return best;
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
}

/** Warps the quad defined by `corners` (source-image coords) into a flat rectangle. */
export function warpDocument(cv: any, srcCanvas: HTMLCanvasElement, corners: Point[]): HTMLCanvasElement {
  const o = orderCorners(corners);
  const { width, height } = outputSize(o);
  const src = cv.imread(srcCanvas);
  const dst = new cv.Mat();
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    o.tl.x, o.tl.y, o.tr.x, o.tr.y, o.br.x, o.br.y, o.bl.x, o.bl.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, width, 0, width, height, 0, height,
  ]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  try {
    cv.warpPerspective(
      src, dst, M, new cv.Size(width, height),
      cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(),
    );
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    cv.imshow(out, dst);
    return out;
  } finally {
    src.delete();
    dst.delete();
    srcTri.delete();
    dstTri.delete();
    M.delete();
  }
}

/** Applies a document filter. 'color' returns the input canvas unchanged. */
export function applyFilter(cv: any, canvas: HTMLCanvasElement, mode: FilterMode): HTMLCanvasElement {
  if (mode === 'color') return canvas;
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    if (mode === 'gray') {
      cv.imshow(out, gray);
    } else {
      const bw = new cv.Mat();
      cv.adaptiveThreshold(
        gray, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 15, 10,
      );
      cv.imshow(out, bw);
      bw.delete();
    }
    return out;
  } finally {
    src.delete();
    gray.delete();
  }
}
