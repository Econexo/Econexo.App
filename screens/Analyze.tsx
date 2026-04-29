
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeImage } from '../services/gemini';
import Navbar from '../components/Navbar';
import { useToast } from '../components/ui/Toast';

const Analyze: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleShare = async () => {
    if (!result) return;
    const text = `Análisis Econexo:\n\n${result}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Análisis Ambiental Econexo', text });
        return;
      } catch { /* user cancelled */ }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Resultado copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setResult(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!image) return;
    setLoading(true);
    try {
      const analysis = await analyzeImage(image, "Analyze this environmental item or document. Provide a classification (e.g., Plastic type, Paper, Hazardous) and disposal instructions based on Chilean environmental law (Ley REP). Be concise and professional.");
      setResult(analysis);
    } catch (error) {
      console.error("Analysis failed:", error);
      setResult("Error al analizar la imagen. Por favor intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
  };

  return (
    <div className="relative font-display bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-8 overflow-hidden">
      {/* Decorative Background Blobs */}
      <div className="absolute top-[-5%] left-[-10%] w-40 h-40 sm:w-[400px] sm:h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-20%] w-36 h-36 sm:w-[350px] sm:h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] left-[-15%] w-36 h-36 sm:w-[380px] sm:h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

      <div className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/40 dark:border-slate-700/40 p-4 flex items-center justify-between shadow-sm">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-700/80 rounded-full border border-white/40 dark:border-slate-600/40 shadow-sm transition-all text-gray-700 dark:text-gray-300">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-black text-gray-900 dark:text-white">Escáner Inteligente</h2>
        <div className="size-10"></div>
      </div>

      <div className="p-4 space-y-6 relative z-10">
        {!image ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed border-white/80 dark:border-slate-600/80 rounded-[32px] bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]">
            <div className="size-20 rounded-3xl bg-primary/10 flex items-center justify-center text-primary mb-6 border border-primary/20 shadow-sm">
              <span className="material-symbols-outlined text-4xl">photo_camera</span>
            </div>
            <h3 className="font-black text-lg text-center mb-2 text-gray-900 dark:text-white">Capturar o Subir</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8 font-bold">Toma una foto a tus residuos o documentos para analizarlos con IA.</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-14 bg-primary text-background-dark rounded-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform text-xs"
            >
              <span className="material-symbols-outlined">add_a_photo</span>
              Seleccionar Imagen
            </button>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-[32px] overflow-hidden shadow-2xl aspect-square bg-black group border border-white/20">
              <img src={image} alt="Preview" className="w-full h-full object-contain" />
              <button
                onClick={reset}
                className="absolute top-4 right-4 size-10 bg-black/50 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-black/70 transition-colors border border-white/10"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {!result && (
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className={`w-full h-14 bg-primary text-background-dark rounded-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transform active:scale-95 transition-all shadow-glow text-xs ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin">autorenew</span>
                    Analizando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">smart_toy</span>
                    Analizar con IA
                  </>
                )}
              </button>
            )}

            {result && (
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[32px] p-6 border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 text-primary">
                  <span className="material-symbols-outlined filled">analytics</span>
                  <h4 className="font-black uppercase tracking-[0.2em] text-xs">Resultado del Análisis</h4>
                </div>
                <div className="prose prose-sm font-medium">
                  <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    {result}
                  </p>
                </div>
                <div className="flex gap-2 pt-4 border-t border-white/40 dark:border-slate-600/40">
                  <button className="flex-1 h-12 bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-700/80 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-white/60 dark:border-slate-600/40 text-gray-600 dark:text-gray-400 transition-colors" onClick={reset}>
                    Nueva Foto
                  </button>
                  <button onClick={handleShare} className="flex-1 h-12 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-primary/20 transition-colors">
                    <span className="material-symbols-outlined text-lg">{copied ? 'check' : navigator.share ? 'share' : 'content_copy'}</span>
                    {copied ? 'Copiado' : navigator.share ? 'Compartir' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-primary/5 rounded-[24px] p-5 border border-primary/10 backdrop-blur-sm">
          <div className="flex gap-3">
            <span className="material-symbols-outlined text-primary">tips_and_updates</span>
            <p className="text-[11px] text-gray-600 dark:text-gray-400 font-bold leading-relaxed">
              Tip: Para mejores resultados, asegúrate de que el objeto esté bien iluminado y sea el centro de la imagen.
            </p>
          </div>
        </div>
      </div>

      <Navbar />
    </div>
  );
};

export default Analyze;
