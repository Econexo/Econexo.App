declare global {
  interface Window {
    cv?: any;
  }
}

const OPENCV_CDN = 'https://docs.opencv.org/4.10.0/opencv.js';
// Generous cap so slow mobile connections still succeed, but a real failure
// surfaces as an error instead of an infinite spinner.
const LOAD_TIMEOUT_MS = 60000;
let loadPromise: Promise<any> | null = null;

/**
 * Polls until OpenCV's WASM runtime is ready (`cv.Mat` exists). This is the
 * reliable readiness signal: relying solely on `cv.onRuntimeInitialized` is
 * racy because the runtime can finish initializing before the callback is
 * attached, leaving the promise pending forever.
 */
function waitForRuntime(resolve: (cv: any) => void, reject: (e: Error) => void): void {
  const start = Date.now();
  const poll = () => {
    const cv = window.cv;
    if (cv && cv.Mat) {
      resolve(cv);
      return;
    }
    if (Date.now() - start > LOAD_TIMEOUT_MS) {
      reject(new Error('OpenCV tardó demasiado en inicializar'));
      return;
    }
    setTimeout(poll, 100);
  };
  poll();
}

export function loadOpenCV(): Promise<any> {
  if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
    return Promise.resolve(window.cv);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const handleScriptLoaded = () => {
      const cv = window.cv;
      if (!cv) {
        reject(new Error('OpenCV no se cargó'));
        return;
      }
      // Some OpenCV.js builds expose `cv` as a Promise/Module factory.
      if (typeof cv.then === 'function') {
        cv
          .then((mod: any) => {
            window.cv = mod;
            waitForRuntime(resolve, reject);
          })
          .catch(() => reject(new Error('OpenCV no se inicializó')));
        return;
      }
      // Attach the official hook AND poll: whichever fires first wins, which
      // closes the race where the runtime initializes before the callback.
      try {
        cv.onRuntimeInitialized = () => resolve(window.cv);
      } catch {
        /* read-only on some builds — polling covers it */
      }
      waitForRuntime(resolve, reject);
    };

    // Reuse an already-injected script tag (e.g. after a remount) instead of
    // adding a duplicate.
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${OPENCV_CDN}"]`);
    if (existing) {
      handleScriptLoaded();
      return;
    }

    const script = document.createElement('script');
    script.src = OPENCV_CDN;
    script.async = true;
    script.onload = handleScriptLoaded;
    script.onerror = () => reject(new Error('No se pudo descargar OpenCV.js'));
    document.body.appendChild(script);
  });

  // Allow a retry on the next call if this attempt failed.
  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
}
