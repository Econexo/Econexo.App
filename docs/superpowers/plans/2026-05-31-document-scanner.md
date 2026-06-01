# Document Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app Adobe Scan-style document scanner to the EcoNexo PWA that auto-detects a document, corrects perspective, applies a B/W filter, assembles a multi-page PDF, and saves it to the Documentos section.

**Architecture:** A new lazy-loaded `screens/Scan.tsx` orchestrates the flow. All computer-vision logic lives in isolated service modules (`opencvLoader`, `docScanner`) loaded on demand; pure geometry/PDF math is split into testable modules (`scanGeometry`, `pdfGeometry`). The PDF is uploaded to a new **private** Supabase Storage bucket `documents` with RLS, and a row is inserted into the existing `documents` table storing the storage **path** (not a public URL); downloads use signed URLs.

**Tech Stack:** React 19 + Vite + TypeScript, react-router-dom (HashRouter), Supabase JS, jspdf (already installed), OpenCV.js (loaded from CDN at runtime), Vitest (added by this plan).

---

## File Structure

- Create `services/scanGeometry.ts` — pure: `Point`, `OrderedCorners`, `orderCorners`, `outputSize`.
- Create `services/pdfGeometry.ts` — pure: `fitWithinA4`, A4 constants.
- Create `services/opencvLoader.ts` — lazy-loads OpenCV.js from CDN once.
- Create `services/docScanner.ts` — `detectDocument`, `warpDocument`, `applyFilter` (use `cv` passed in + `scanGeometry`).
- Create `services/scanToPdf.ts` — `buildScanPdf` (jspdf + `pdfGeometry`).
- Create `services/documentUpload.ts` — `uploadScannedDocument` (Storage upload + table insert).
- Create `screens/Scan.tsx` — UI orchestration.
- Create `supabase/migrations/20260531_create_documents_bucket.sql` — private bucket + RLS.
- Create `vitest.config.ts`, `services/scanGeometry.test.ts`, `services/pdfGeometry.test.ts`.
- Modify `package.json` — add Vitest devDep + `test` script.
- Modify `App.tsx` — register `/scan` route (lazy).
- Modify `screens/Documents.tsx` — add "Escanear" button; make `handleDownload` use signed URLs for storage paths.

---

## Task 1: Test setup + pure corner ordering (`scanGeometry`)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `services/scanGeometry.ts`
- Test: `services/scanGeometry.test.ts`

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`
Expected: `vitest` added under `devDependencies` in `package.json`.

- [ ] **Step 2: Add the test script**

Edit `package.json` `scripts` to add the `test` entry (keep existing scripts):

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `services/scanGeometry.test.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — cannot resolve `./scanGeometry` / `orderCorners` is not defined.

- [ ] **Step 6: Write minimal implementation**

Create `services/scanGeometry.ts`:

```ts
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
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts services/scanGeometry.ts services/scanGeometry.test.ts
git commit -m "feat: add Vitest + orderCorners geometry helper"
```

---

## Task 2: Output size helper (`scanGeometry`)

**Files:**
- Modify: `services/scanGeometry.ts`
- Test: `services/scanGeometry.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `services/scanGeometry.test.ts`:

```ts
import { outputSize } from './scanGeometry';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `outputSize` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `services/scanGeometry.ts`:

```ts
function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function outputSize(c: OrderedCorners): { width: number; height: number } {
  const width = Math.max(dist(c.tl, c.tr), dist(c.bl, c.br));
  const height = Math.max(dist(c.tl, c.bl), dist(c.tr, c.br));
  return { width: Math.round(width), height: Math.round(height) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add services/scanGeometry.ts services/scanGeometry.test.ts
git commit -m "feat: add outputSize geometry helper"
```

---

## Task 3: A4 fit helper (`pdfGeometry`)

**Files:**
- Create: `services/pdfGeometry.ts`
- Test: `services/pdfGeometry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `services/pdfGeometry.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — cannot resolve `./pdfGeometry`.

- [ ] **Step 3: Write minimal implementation**

Create `services/pdfGeometry.ts`:

```ts
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

export function fitWithinA4(imgWidth: number, imgHeight: number): { width: number; height: number } {
  const scale = Math.min(A4_WIDTH_PT / imgWidth, A4_HEIGHT_PT / imgHeight);
  return { width: imgWidth * scale, height: imgHeight * scale };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add services/pdfGeometry.ts services/pdfGeometry.test.ts
git commit -m "feat: add fitWithinA4 PDF geometry helper"
```

---

## Task 4: OpenCV.js lazy loader

**Files:**
- Create: `services/opencvLoader.ts`

> Not unit-tested: depends on injecting a `<script>` tag and the OpenCV WASM runtime. Verified manually in Task 9.

- [ ] **Step 1: Create the loader**

Create `services/opencvLoader.ts`:

```ts
declare global {
  interface Window {
    cv?: any;
  }
}

const OPENCV_CDN = 'https://docs.opencv.org/4.10.0/opencv.js';
let loadPromise: Promise<any> | null = null;

export function loadOpenCV(): Promise<any> {
  if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
    return Promise.resolve(window.cv);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = OPENCV_CDN;
    script.async = true;
    script.onload = () => {
      const cv = window.cv;
      if (!cv) {
        reject(new Error('OpenCV no se cargó'));
        return;
      }
      // OpenCV.js may need to finish initializing its WASM runtime.
      if (cv.Mat) {
        resolve(cv);
      } else {
        cv.onRuntimeInitialized = () => resolve(cv);
      }
    };
    script.onerror = () => reject(new Error('No se pudo descargar OpenCV.js'));
    document.body.appendChild(script);
  });
  return loadPromise;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors related to `services/opencvLoader.ts`.

- [ ] **Step 3: Commit**

```bash
git add services/opencvLoader.ts
git commit -m "feat: add lazy OpenCV.js loader"
```

---

## Task 5: Document scanner CV functions (`docScanner`)

**Files:**
- Create: `services/docScanner.ts`

> Not unit-tested: requires the OpenCV runtime + a real canvas. Verified manually in Task 9. Uses the tested `orderCorners`/`outputSize` for geometry.

- [ ] **Step 1: Create the module**

Create `services/docScanner.ts`:

```ts
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
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors related to `services/docScanner.ts`.

- [ ] **Step 3: Commit**

```bash
git add services/docScanner.ts
git commit -m "feat: add OpenCV document detection, warp, and filter"
```

---

## Task 6: PDF assembly (`scanToPdf`)

**Files:**
- Create: `services/scanToPdf.ts`

> Not unit-tested: jspdf `addImage` needs a real image decode (browser). Uses the tested `fitWithinA4`. Verified manually in Task 9.

- [ ] **Step 1: Create the module**

Create `services/scanToPdf.ts`:

```ts
import { jsPDF } from 'jspdf';
import { fitWithinA4 } from './pdfGeometry';

export interface ScanPage {
  dataUrl: string; // image/jpeg data URL
  width: number;   // natural pixel width
  height: number;  // natural pixel height
}

export function buildScanPdf(pages: ScanPage[]): Blob {
  if (pages.length === 0) {
    throw new Error('No hay páginas para generar el PDF');
  }
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  pages.forEach((page, i) => {
    if (i > 0) doc.addPage();
    const { width, height } = fitWithinA4(page.width, page.height);
    const x = (pageW - width) / 2;
    const y = (pageH - height) / 2;
    doc.addImage(page.dataUrl, 'JPEG', x, y, width, height);
  });

  return doc.output('blob');
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors related to `services/scanToPdf.ts`.

- [ ] **Step 3: Commit**

```bash
git add services/scanToPdf.ts
git commit -m "feat: add multi-page scan-to-PDF assembly"
```

---

## Task 7: Supabase private bucket migration

**Files:**
- Create: `supabase/migrations/20260531_create_documents_bucket.sql`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260531_create_documents_bucket.sql`:

```sql
-- Bucket privado para los PDFs escaneados por los usuarios
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Re-runnable: drop existing policy names first
DROP POLICY IF EXISTS "documents_user_read" ON storage.objects;
DROP POLICY IF EXISTS "documents_user_insert" ON storage.objects;
DROP POLICY IF EXISTS "documents_user_update" ON storage.objects;
DROP POLICY IF EXISTS "documents_user_delete" ON storage.objects;

-- Cada usuario solo accede a su propia carpeta: documents/{auth.uid()}/...
CREATE POLICY "documents_user_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "documents_user_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "documents_user_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "documents_user_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase Dashboard SQL editor (or `supabase db push` if the CLI is linked). After running, confirm in Dashboard > Storage that a **private** bucket named `documents` exists.
Expected: bucket `documents` present, `public = false`, 4 policies on `storage.objects`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260531_create_documents_bucket.sql
git commit -m "feat: add private documents storage bucket with RLS"
```

---

## Task 8: Upload service (`documentUpload`)

**Files:**
- Create: `services/documentUpload.ts`

> Not unit-tested: requires an authenticated Supabase session + live Storage. Verified manually in Task 9.

- [ ] **Step 1: Create the module**

Create `services/documentUpload.ts`:

```ts
import { supabase } from './supabase';

export interface UploadScanParams {
  pdf: Blob;
  title: string;
  type: string;
}

/** Uploads the scanned PDF to the private 'documents' bucket and inserts a row.
 *  content_url stores the Storage PATH (not a public URL); downloads use signed URLs. */
export async function uploadScannedDocument({ pdf, title, type }: UploadScanParams): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión de usuario');

  const filePath = `${user.id}/scan-${Date.now()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, pdf, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('documents').insert([{
    user_id: user.id,
    title,
    type,
    content_url: filePath,
    verified: false,
    metadata: { source: 'scanner' },
  }]);
  if (insertError) throw insertError;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors related to `services/documentUpload.ts`.

- [ ] **Step 3: Commit**

```bash
git add services/documentUpload.ts
git commit -m "feat: add scanned-document upload service"
```

---

## Task 9: Scanner screen (`Scan.tsx`)

**Files:**
- Create: `screens/Scan.tsx`

> Verified manually in-browser (Step 3). This is the integration point for Tasks 4–8.

- [ ] **Step 1: Create the screen**

Create `screens/Scan.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useToast } from '../components/ui/Toast';
import { loadOpenCV } from '../services/opencvLoader';
import { detectDocument, warpDocument, applyFilter, FilterMode } from '../services/docScanner';
import { buildScanPdf, ScanPage } from '../services/scanToPdf';
import { uploadScannedDocument } from '../services/documentUpload';
import type { Point } from '../services/scanGeometry';

type Stage = 'capture' | 'adjust' | 'review';

const DESTINATIONS = [
  { label: 'Gestores · Certificados', type: 'declaration' },
  { label: 'Econexo · Recepción (CR)', type: 'CR' },
  { label: 'Econexo · Reportes', type: 'report' },
  { label: 'Otro', type: 'custom' },
];

const Scan: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [cvReady, setCvReady] = useState(false);
  const [cvError, setCvError] = useState(false);
  const [stage, setStage] = useState<Stage>('capture');
  const [filter, setFilter] = useState<FilterMode>('bw');
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [saving, setSaving] = useState(false);
  const [showFinalize, setShowFinalize] = useState(false);
  const [title, setTitle] = useState('');
  const [destIndex, setDestIndex] = useState(0);

  // Source image + adjustable corners (natural-image coordinates)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [corners, setCorners] = useState<Point[]>([]);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const cvRef = useRef<any>(null);

  useEffect(() => {
    loadOpenCV()
      .then((cv) => { cvRef.current = cv; setCvReady(true); })
      .catch(() => setCvError(true));
  }, []);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      sourceCanvasRef.current = canvas;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImgUrl(url);

      const detected = detectDocument(cvRef.current, canvas);
      setCorners(detected ?? [
        { x: img.naturalWidth * 0.1, y: img.naturalHeight * 0.1 },
        { x: img.naturalWidth * 0.9, y: img.naturalHeight * 0.1 },
        { x: img.naturalWidth * 0.9, y: img.naturalHeight * 0.9 },
        { x: img.naturalWidth * 0.1, y: img.naturalHeight * 0.9 },
      ]);
      setStage('adjust');
    };
    img.src = url;
  };

  const displayScale = () => {
    const el = imgElRef.current;
    if (!el || naturalSize.w === 0) return 1;
    return el.clientWidth / naturalSize.w;
  };

  const onHandlePointerDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragIndex(i);
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (dragIndex === null || !imgElRef.current) return;
    const rect = imgElRef.current.getBoundingClientRect();
    const scale = displayScale();
    const x = Math.max(0, Math.min(naturalSize.w, (e.clientX - rect.left) / scale));
    const y = Math.max(0, Math.min(naturalSize.h, (e.clientY - rect.top) / scale));
    setCorners((prev) => prev.map((p, idx) => (idx === dragIndex ? { x, y } : p)));
  };

  const onHandlePointerUp = () => setDragIndex(null);

  const confirmCrop = () => {
    try {
      const warped = warpDocument(cvRef.current, sourceCanvasRef.current!, corners);
      const filtered = applyFilter(cvRef.current, warped, filter);
      const dataUrl = filtered.toDataURL('image/jpeg', 0.9);
      setPages((prev) => [...prev, { dataUrl, width: filtered.width, height: filtered.height }]);
      if (imgUrl) URL.revokeObjectURL(imgUrl);
      setImgUrl(null);
      setStage('review');
    } catch (err: any) {
      toast.error('Error al procesar la página: ' + (err.message || 'desconocido'));
    }
  };

  const movePage = (i: number, dir: -1 | 1) => {
    setPages((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const removePage = (i: number) => setPages((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (pages.length === 0) return;
    setSaving(true);
    try {
      const pdf = buildScanPdf(pages);
      const finalTitle = title.trim() || `Documento escaneado ${new Date().toLocaleDateString()}`;
      await uploadScannedDocument({ pdf, title: finalTitle, type: DESTINATIONS[destIndex].type });
      toast.success('Documento guardado en Documentos.');
      navigate('/documents');
    } catch (err: any) {
      toast.error('Error al guardar: ' + (err.message || 'desconocido'));
    } finally {
      setSaving(false);
      setShowFinalize(false);
    }
  };

  return (
    <div className="relative font-display bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-8 overflow-hidden">
      <div className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/40 dark:border-slate-700/40 p-4 flex items-center justify-between shadow-sm">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 dark:bg-slate-700/50 rounded-full border border-white/40 dark:border-slate-600/40 shadow-sm text-gray-700 dark:text-gray-300">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-black text-gray-900 dark:text-white">Escanear Documento</h2>
        <div className="size-10" />
      </div>

      <div className="p-4 space-y-6 relative z-10">
        {cvError && (
          <div className="p-4 rounded-2xl bg-red-50 text-red-600 text-sm font-bold border border-red-100">
            No se pudo cargar el motor de escaneo. Revisa tu conexión e inténtalo de nuevo.
          </div>
        )}

        {!cvReady && !cvError && (
          <div className="p-12 text-center text-gray-500 font-bold">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
            <p className="mt-4 text-xs uppercase tracking-widest">Cargando motor de escaneo…</p>
          </div>
        )}

        {cvReady && stage === 'capture' && (
          <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed border-white/80 dark:border-slate-600/80 rounded-[32px] bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl">
            <div className="size-20 rounded-3xl bg-primary/10 flex items-center justify-center text-primary mb-6 border border-primary/20">
              <span className="material-symbols-outlined text-4xl">document_scanner</span>
            </div>
            <h3 className="font-black text-lg text-center mb-2 text-gray-900 dark:text-white">Capturar página</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8 font-bold">Toma una foto al documento. Detectaremos los bordes automáticamente.</p>
            <button onClick={() => fileInputRef.current?.click()} className="w-full h-14 bg-primary text-background-dark rounded-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform text-xs">
              <span className="material-symbols-outlined">add_a_photo</span>
              {pages.length === 0 ? 'Capturar' : 'Añadir página'}
            </button>
            <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleCapture} />
            {pages.length > 0 && (
              <button onClick={() => setStage('review')} className="mt-3 text-primary text-[11px] font-black uppercase tracking-widest">
                Volver a las {pages.length} página(s)
              </button>
            )}
          </div>
        )}

        {cvReady && stage === 'adjust' && imgUrl && (
          <div className="space-y-4">
            <div
              className="relative rounded-[24px] overflow-hidden bg-black select-none touch-none"
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
            >
              <img ref={imgElRef} src={imgUrl} alt="captura" className="w-full block" />
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <polygon
                  points={corners.map((p) => `${p.x * displayScale()},${p.y * displayScale()}`).join(' ')}
                  fill="rgba(50,97,5,0.15)" stroke="#326105" strokeWidth="2"
                />
              </svg>
              {corners.map((p, i) => (
                <div
                  key={i}
                  onPointerDown={onHandlePointerDown(i)}
                  className="absolute size-7 -ml-3.5 -mt-3.5 rounded-full bg-white border-4 border-primary shadow-md touch-none"
                  style={{ left: p.x * displayScale(), top: p.y * displayScale() }}
                />
              ))}
            </div>

            <div className="flex gap-2">
              {(['bw', 'gray', 'color'] as FilterMode[]).map((m) => (
                <button key={m} onClick={() => setFilter(m)} className={`flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${filter === m ? 'bg-primary text-white border-primary' : 'bg-white/60 text-gray-500 border-white/60'}`}>
                  {m === 'bw' ? 'B/N' : m === 'gray' ? 'Gris' : 'Color'}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => { if (imgUrl) URL.revokeObjectURL(imgUrl); setImgUrl(null); setStage(pages.length ? 'review' : 'capture'); }} className="flex-1 h-12 bg-white/50 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/60 text-gray-600">
                Cancelar
              </button>
              <button onClick={confirmCrop} className="flex-1 h-12 bg-primary text-background-dark rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-base">check</span> Usar página
              </button>
            </div>
          </div>
        )}

        {cvReady && stage === 'review' && (
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 px-1">{pages.length} página(s)</h3>
            <div className="grid grid-cols-3 gap-3">
              {pages.map((pg, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden border border-white/80 bg-white shadow-sm">
                  <img src={pg.dataUrl} alt={`pág ${i + 1}`} className="w-full aspect-[3/4] object-cover" />
                  <div className="absolute top-1 left-1 flex gap-1">
                    <button onClick={() => movePage(i, -1)} className="size-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center"><span className="material-symbols-outlined text-sm">arrow_back</span></button>
                    <button onClick={() => movePage(i, 1)} className="size-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center"><span className="material-symbols-outlined text-sm">arrow_forward</span></button>
                  </div>
                  <button onClick={() => removePage(i)} className="absolute top-1 right-1 size-6 bg-red-500 text-white rounded-full flex items-center justify-center"><span className="material-symbols-outlined text-sm">close</span></button>
                </div>
              ))}
            </div>

            <button onClick={() => setStage('capture')} className="w-full h-12 bg-white/60 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/60 text-gray-700 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-base">add_a_photo</span> Añadir página
            </button>
            <button onClick={() => setShowFinalize(true)} disabled={pages.length === 0} className="w-full h-14 bg-primary text-background-dark rounded-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 text-xs">
              <span className="material-symbols-outlined">save</span> Guardar PDF
            </button>
          </div>
        )}
      </div>

      {showFinalize && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowFinalize(false)} />
          <div className="relative bg-white/90 backdrop-blur-2xl w-full max-w-[340px] rounded-[32px] p-6 border border-white/80 shadow-xl space-y-4">
            <h3 className="text-lg font-display font-black text-gray-900 text-center">Guardar documento</h3>
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-1">Título</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Documento escaneado" className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 focus:ring-primary focus:border-primary" />
            </div>
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-1">Carpeta</label>
              <select value={destIndex} onChange={(e) => setDestIndex(Number(e.target.value))} className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 focus:ring-primary focus:border-primary">
                {DESTINATIONS.map((d, i) => <option key={i} value={i}>{d.label}</option>)}
              </select>
            </div>
            <button onClick={handleSave} disabled={saving} className="w-full h-14 bg-primary text-background-dark rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">save</span>}
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={() => setShowFinalize(false)} className="w-full h-10 text-gray-400 text-[10px] font-black uppercase tracking-widest">Cancelar</button>
          </div>
        </div>
      )}

      <Navbar />
    </div>
  );
};

export default Scan;
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (The route is wired in Task 10; the screen compiles standalone.)

- [ ] **Step 3: Manual browser verification**

Temporarily test by wiring the route (do Task 10 first if preferred), then:
Run: `npm run dev`
- Open the app, log in, navigate to `/#/scan`.
- Confirm "Cargando motor de escaneo…" appears then the capture UI.
- Capture/upload a photo of a document; confirm corners appear (auto-detected or default), drag a corner handle, switch B/N filter.
- "Usar página" → thumbnail appears in review; add a 2nd page; reorder and delete.
- "Guardar PDF" → fill title, pick "Gestores · Certificados" → Guardar.
- Confirm redirect to Documentos and a success toast.

- [ ] **Step 4: Commit**

```bash
git add screens/Scan.tsx
git commit -m "feat: add document scanner screen"
```

---

## Task 10: Wire route + entry button

**Files:**
- Modify: `App.tsx`
- Modify: `screens/Documents.tsx`

- [ ] **Step 1: Add the lazy import in `App.tsx`**

After the other lazy screen imports (near `App.tsx:26`), add:

```tsx
const Scan               = lazy(() => import('./screens/Scan'));
```

- [ ] **Step 2: Add the route in `App.tsx`**

After the `/analyze` route (`App.tsx:136`), add:

```tsx
          <Route path="/scan"          element={isAuthenticated ? <div className="lg:ml-64"><Scan /></div> : <Navigate to="/" />} />
```

- [ ] **Step 3: Add a scan button in `Documents.tsx` header**

In `screens/Documents.tsx`, add `useNavigate` usage is already present (`navigate`). Inside the header action group (the `<div className="flex items-center gap-2">` around `Documents.tsx:623`), add as the first child:

```tsx
          <button
            onClick={() => navigate('/scan')}
            title="Escanear documento"
            className="size-10 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 active:scale-90 transition-all border border-primary/20 shadow-sm text-primary"
          >
            <span className="material-symbols-outlined">document_scanner</span>
          </button>
```

- [ ] **Step 4: Verify it typechecks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add App.tsx screens/Documents.tsx
git commit -m "feat: wire /scan route and Documentos scan button"
```

---

## Task 11: Signed-URL downloads for stored documents

**Files:**
- Modify: `screens/Documents.tsx:147-152`

- [ ] **Step 1: Update `handleDownload`**

In `screens/Documents.tsx`, replace the opening of `handleDownload` (currently):

```tsx
    // Direct Download for Uploaded Documents (Gestores)
    if (doc.content_url) {
      window.open(doc.content_url, '_blank');
      return;
    }
```

with:

```tsx
    // Uploaded documents: legacy rows store an absolute URL; scanned rows store a Storage path.
    if (doc.content_url) {
      if (/^https?:\/\//i.test(doc.content_url)) {
        window.open(doc.content_url, '_blank');
      } else {
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.content_url, 60);
        if (error || !data) {
          toast.error('No se pudo abrir el documento: ' + (error?.message || 'error'));
          return;
        }
        window.open(data.signedUrl, '_blank');
      }
      return;
    }
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (`handleDownload` is already `async`.)

- [ ] **Step 3: Manual verification**

Run: `npm run dev`
- Open a previously scanned document from Documentos (folder "Gestores · Certificados", filter "Pendientes" since `verified=false`).
- Confirm it opens the PDF via a signed URL (URL contains `token=`), and that the PDF shows the scanned pages.

- [ ] **Step 4: Commit**

```bash
git add screens/Documents.tsx
git commit -m "feat: open stored documents via signed URLs"
```

---

## Self-Review Notes

- **Spec coverage:** auto-detect + perspective correction (Tasks 4–5), B/N filter (Task 5), multi-page list with reorder/delete (Task 9), multi-page PDF (Task 6), save to Documentos via private bucket + RLS (Tasks 7–8), signed-URL download (Task 11), lazy OpenCV load (Task 4, used in Task 9). OCR and live auto-capture are explicitly out of scope per the spec.
- **Type consistency:** `Point`/`OrderedCorners` defined in `scanGeometry.ts` and reused by `docScanner.ts` and `Scan.tsx`; `FilterMode` defined in `docScanner.ts`; `ScanPage` defined in `scanToPdf.ts` and consumed in `Scan.tsx`; `content_url` stores a Storage path consistently in `documentUpload.ts` and is read accordingly in Task 11.
- **Note on `verified`:** scanned docs are inserted with `verified: false`, so they appear under the "Pendientes" filter in Documentos until an admin/flow verifies them. This matches the existing data model.
