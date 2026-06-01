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
