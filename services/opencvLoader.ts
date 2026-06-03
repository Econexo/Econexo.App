declare global {
  interface Window {
    cv?: any;
  }
}

// Self-hosted from public/opencv/opencv.js (served at the site root by Vercel).
// Avoids depending on docs.opencv.org, whose connections frequently stall on
// mobile and never fire load/error — leaving the scanner stuck forever.
const OPENCV_URL = '/opencv/opencv.js';
// Overall cap covering BOTH the download and the WASM init. A real failure
// surfaces as an error instead of an infinite spinner.
const LOAD_TIMEOUT_MS = 45000;
let loadPromise: Promise<any> | null = null;

export function loadOpenCV(): Promise<any> {
  if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
    return Promise.resolve(window.cv);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    let settled = false;

    // Single timer governing the whole load, so even a stalled script request
    // (which fires neither onload nor onerror) cannot hang forever.
    const timer = setTimeout(() => {
      finishError(new Error('OpenCV tardó demasiado en cargar'));
    }, LOAD_TIMEOUT_MS);

    function finishOk(cv: any) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(cv);
    }
    function finishError(err: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    }

    // Poll for the WASM runtime being ready. `cv.Mat` is the reliable signal;
    // relying only on cv.onRuntimeInitialized is racy (it can fire before the
    // callback is attached).
    function pollForRuntime() {
      if (settled) return;
      const cv = window.cv;
      if (cv && cv.Mat) {
        finishOk(cv);
        return;
      }
      setTimeout(pollForRuntime, 100);
    }

    function handleScriptLoaded() {
      const cv = window.cv;
      if (!cv) {
        finishError(new Error('OpenCV no se cargó'));
        return;
      }
      // Some builds expose `cv` as a Promise/Module factory.
      if (typeof cv.then === 'function') {
        cv
          .then((mod: any) => {
            window.cv = mod;
            pollForRuntime();
          })
          .catch(() => finishError(new Error('OpenCV no se inicializó')));
        return;
      }
      try {
        cv.onRuntimeInitialized = () => finishOk(window.cv);
      } catch {
        /* read-only on some builds — polling covers it */
      }
      pollForRuntime();
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${OPENCV_URL}"]`);
    if (existing) {
      handleScriptLoaded();
      return;
    }

    const script = document.createElement('script');
    script.src = OPENCV_URL;
    script.async = true;
    script.onload = handleScriptLoaded;
    script.onerror = () => finishError(new Error('No se pudo descargar OpenCV.js'));
    document.body.appendChild(script);
  });

  // Allow a retry on the next call if this attempt failed.
  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
}
