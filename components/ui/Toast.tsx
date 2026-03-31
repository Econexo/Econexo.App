import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
    exiting?: boolean;
}

interface ToastContextType {
    toast: {
        success: (message: string) => void;
        error: (message: string) => void;
        warning: (message: string) => void;
        info: (message: string) => void;
    };
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = (): ToastContextType['toast'] => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx.toast;
};

const ICONS: Record<ToastType, string> = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info',
};

const STYLES: Record<ToastType, string> = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const ICON_STYLES: Record<ToastType, string> = {
    success: 'text-green-500',
    error: 'text-red-500',
    warning: 'text-amber-500',
    info: 'text-blue-500',
};

const PROGRESS_STYLES: Record<ToastType, string> = {
    success: 'bg-green-400',
    error: 'bg-red-400',
    warning: 'bg-amber-400',
    info: 'bg-blue-400',
};

const DURATION = 4000;

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: number) => void }> = ({ toast, onDismiss }) => {
    return (
        <div
            className={`
                relative flex items-start gap-3 px-4 py-3 rounded-2xl border shadow-lg backdrop-blur-xl
                max-w-[340px] w-full overflow-hidden
                ${STYLES[toast.type]}
                ${toast.exiting
                    ? 'animate-[slideOut_0.3s_ease-in_forwards]'
                    : 'animate-[slideIn_0.3s_ease-out_forwards]'
                }
            `}
            role="alert"
        >
            <span className={`material-symbols-outlined text-xl mt-0.5 flex-shrink-0 ${ICON_STYLES[toast.type]}`}>
                {ICONS[toast.type]}
            </span>
            <p className="text-sm font-bold leading-snug flex-1 pr-6">{toast.message}</p>
            <button
                onClick={() => onDismiss(toast.id)}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/5 transition-colors"
            >
                <span className="material-symbols-outlined text-sm opacity-40 hover:opacity-80">close</span>
            </button>
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/5">
                <div
                    className={`h-full ${PROGRESS_STYLES[toast.type]} rounded-full`}
                    style={{
                        animation: `shrink ${DURATION}ms linear forwards`,
                    }}
                />
            </div>
        </div>
    );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const idRef = useRef(0);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 300);
    }, []);

    const addToast = useCallback((message: string, type: ToastType) => {
        const id = ++idRef.current;
        setToasts(prev => [...prev.slice(-4), { id, message, type }]); // Max 5 toasts
        setTimeout(() => dismiss(id), DURATION);
    }, [dismiss]);

    const toast = React.useMemo(() => ({
        success: (msg: string) => addToast(msg, 'success'),
        error: (msg: string) => addToast(msg, 'error'),
        warning: (msg: string) => addToast(msg, 'warning'),
        info: (msg: string) => addToast(msg, 'info'),
    }), [addToast]);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {/* Toast Container */}
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className="pointer-events-auto">
                        <ToastItem toast={t} onDismiss={dismiss} />
                    </div>
                ))}
            </div>

            {/* Keyframe styles */}
            <style>{`
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(-12px) scale(0.95); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes slideOut {
                    from { opacity: 1; transform: translateY(0) scale(1); }
                    to   { opacity: 0; transform: translateY(-12px) scale(0.95); }
                }
                @keyframes shrink {
                    from { width: 100%; }
                    to   { width: 0%; }
                }
            `}</style>
        </ToastContext.Provider>
    );
};
