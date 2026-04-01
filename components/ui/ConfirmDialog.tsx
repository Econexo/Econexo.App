import React, { createContext, useContext, useState, useCallback } from 'react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const handleResponse = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => handleResponse(false)}
          />
          <div className="relative bg-white dark:bg-slate-900 rounded-[28px] border border-white/80 dark:border-white/10 shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-200">
            <div className={`size-12 rounded-2xl flex items-center justify-center mb-4 ${state.danger ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
              <span className="material-symbols-outlined text-2xl">
                {state.danger ? 'delete_forever' : 'help'}
              </span>
            </div>
            <h3 className="text-base font-display font-black text-gray-900 dark:text-white mb-1">
              {state.title}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium leading-relaxed mb-6">
              {state.message}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleResponse(false)}
                className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 font-bold text-xs uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                {state.cancelLabel || 'Cancelar'}
              </button>
              <button
                onClick={() => handleResponse(true)}
                className={`flex-1 h-11 rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95 ${
                  state.danger
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
                    : 'bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20'
                }`}
              >
                {state.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
