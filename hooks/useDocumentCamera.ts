import { useCallback, useEffect, useRef, useState } from 'react';
import { detectDocument } from '../services/docScanner';
import { cornersDrift, smoothCorners, type Point } from '../services/scanGeometry';

export type CameraStatus = 'idle' | 'starting' | 'ready' | 'denied' | 'unsupported' | 'error';

/** Cada cuánto se analiza un fotograma. 8 análisis/s bastan y no calientan el teléfono. */
const DETECT_INTERVAL_MS = 130;
/** Ancho al que se reduce el fotograma antes de detectar. */
const ANALYSIS_WIDTH = 480;
/** Movimiento máximo (fracción del ancho) para considerar el encuadre quieto. */
const STABLE_DRIFT = 0.015;
/** Detecciones quietas seguidas antes de disparar solo. */
const STABLE_FRAMES = 6;
/** Fotogramas sin hoja antes de borrar el marco (evita parpadeos). */
const MISS_TOLERANCE = 3;

interface UseDocumentCameraResult {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    status: CameraStatus;
    errorMessage: string | null;
    /** Esquinas normalizadas (0–1) sobre el fotograma, en orden tl, tr, br, bl. */
    corners: Point[] | null;
    /** Cuántos análisis seguidos lleva el encuadre quieto. */
    stableCount: number;
    torchOn: boolean;
    torchAvailable: boolean;
    toggleTorch: () => Promise<void>;
    /** Fotograma actual a resolución completa. */
    grabFrame: () => HTMLCanvasElement | null;
    retry: () => void;
}

/**
 * Cámara trasera en vivo con detección de bordes fotograma a fotograma.
 * Devuelve las esquinas normalizadas para dibujar el marco encima del vídeo
 * y una señal de estabilidad para el disparo automático.
 */
export function useDocumentCamera(active: boolean): UseDocumentCameraResult {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const smoothedRef = useRef<Point[] | null>(null);
    const missesRef = useRef(0);

    const [status, setStatus] = useState<CameraStatus>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [corners, setCorners] = useState<Point[] | null>(null);
    const [stableCount, setStableCount] = useState(0);
    const [torchOn, setTorchOn] = useState(false);
    const [torchAvailable, setTorchAvailable] = useState(false);
    const [attempt, setAttempt] = useState(0);

    const retry = useCallback(() => setAttempt(a => a + 1), []);

    // ── Encender / apagar la cámara ──
    useEffect(() => {
        if (!active) return;

        let cancelled = false;

        const start = async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                setStatus('unsupported');
                setErrorMessage('Este navegador no permite abrir la cámara.');
                return;
            }

            setStatus('starting');
            setErrorMessage(null);

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: false,
                });

                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

                streamRef.current = stream;
                const video = videoRef.current;
                if (video) {
                    video.srcObject = stream;
                    // Safari iOS exige playsInline + muted para no ir a pantalla completa.
                    video.setAttribute('playsinline', 'true');
                    video.muted = true;
                    await video.play().catch(() => { /* el usuario aún no ha interactuado */ });
                }

                const track = stream.getVideoTracks()[0];
                const capabilities = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
                setTorchAvailable(Boolean(capabilities.torch));

                setStatus('ready');
            } catch (err: any) {
                if (cancelled) return;
                const name = err?.name ?? '';
                if (name === 'NotAllowedError' || name === 'SecurityError') {
                    setStatus('denied');
                    setErrorMessage('Necesitamos permiso de cámara para escanear. Actívalo y vuelve a intentar.');
                } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
                    setStatus('unsupported');
                    setErrorMessage('No encontramos una cámara disponible en este dispositivo.');
                } else {
                    setStatus('error');
                    setErrorMessage(err?.message || 'No se pudo abrir la cámara.');
                }
            }
        };

        start();

        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
            if (videoRef.current) videoRef.current.srcObject = null;
            setStatus('idle');
            setTorchOn(false);
            setTorchAvailable(false);
            setCorners(null);
            setStableCount(0);
            smoothedRef.current = null;
            missesRef.current = 0;
        };
    }, [active, attempt]);

    // ── Bucle de detección ──
    useEffect(() => {
        if (!active || status !== 'ready') return;

        const timer = window.setInterval(() => {
            const video = videoRef.current;
            if (!video || video.readyState < 2 || video.videoWidth === 0) return;

            const scale = ANALYSIS_WIDTH / video.videoWidth;
            const w = ANALYSIS_WIDTH;
            const h = Math.round(video.videoHeight * scale);

            let canvas = analysisCanvasRef.current;
            if (!canvas) {
                canvas = document.createElement('canvas');
                analysisCanvasRef.current = canvas;
            }
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }

            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            ctx.drawImage(video, 0, 0, w, h);

            const detected = detectDocument(canvas);

            if (!detected) {
                missesRef.current++;
                if (missesRef.current >= MISS_TOLERANCE) {
                    smoothedRef.current = null;
                    setCorners(null);
                    setStableCount(0);
                }
                return;
            }

            missesRef.current = 0;

            const previous = smoothedRef.current;
            const smoothed = smoothCorners(previous, detected);
            smoothedRef.current = smoothed;

            // La deriva se mide en fracción del ancho para que el umbral no
            // dependa de la resolución de la cámara.
            const drift = previous ? cornersDrift(previous, detected) / w : Infinity;
            setStableCount(prev => (drift < STABLE_DRIFT ? prev + 1 : 0));

            setCorners(smoothed.map(p => ({ x: p.x / w, y: p.y / h })));
        }, DETECT_INTERVAL_MS);

        return () => window.clearInterval(timer);
    }, [active, status]);

    const toggleTorch = useCallback(async () => {
        const track = streamRef.current?.getVideoTracks()[0];
        if (!track) return;
        const next = !torchOn;
        try {
            // `torch` aún no está en los tipos estándar de MediaTrackConstraintSet.
            await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
            setTorchOn(next);
        } catch {
            setTorchAvailable(false);
        }
    }, [torchOn]);

    const grabFrame = useCallback((): HTMLCanvasElement | null => {
        const video = videoRef.current;
        if (!video || video.videoWidth === 0) return null;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        return canvas;
    }, []);

    return {
        videoRef,
        status,
        errorMessage,
        corners,
        stableCount,
        torchOn,
        torchAvailable,
        toggleTorch,
        grabFrame,
        retry,
    };
}

export const AUTO_CAPTURE_FRAMES = STABLE_FRAMES;
