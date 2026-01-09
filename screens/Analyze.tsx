
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeImage } from '../services/gemini';
import Navbar from '../components/Navbar';

const Analyze: React.FC = () => {
  const navigate = useNavigate();
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <div className="font-display bg-background-light dark:bg-background-dark min-h-screen text-slate-900 dark:text-white max-w-md mx-auto pb-28">
      <div className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5 p-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-bold">Escáner Inteligente</h2>
        <div className="size-10"></div>
      </div>

      <div className="p-4 space-y-6">
        {!image ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed border-gray-300 dark:border-white/10 rounded-3xl bg-white dark:bg-card-dark shadow-sm">
            <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-6">
              <span className="material-symbols-outlined text-4xl">photo_camera</span>
            </div>
            <h3 className="font-bold text-lg text-center mb-2">Capturar o Subir</h3>
            <p className="text-sm text-gray-500 text-center mb-8">Toma una foto a tus residuos o documentos para analizarlos con IA.</p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-14 bg-primary text-background-dark rounded-xl font-bold flex items-center justify-center gap-2 shadow-glow active:scale-95 transition-transform"
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
            <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-square bg-black">
              <img src={image} alt="Preview" className="w-full h-full object-contain" />
              <button 
                onClick={reset}
                className="absolute top-4 right-4 size-10 bg-black/50 backdrop-blur-md text-white rounded-full flex items-center justify-center"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {!result && (
              <button 
                onClick={handleAnalyze}
                disabled={loading}
                className={`w-full h-14 bg-primary text-background-dark rounded-xl font-bold flex items-center justify-center gap-2 transform active:scale-95 transition-all shadow-glow ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
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
              <div className="bg-white dark:bg-surface-dark rounded-2xl p-6 border border-gray-100 dark:border-white/5 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 text-primary">
                  <span className="material-symbols-outlined">analytics</span>
                  <h4 className="font-bold uppercase tracking-widest text-xs">Resultado del Análisis</h4>
                </div>
                <div className="prose prose-sm dark:prose-invert">
                  <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    {result}
                  </p>
                </div>
                <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-white/5">
                  <button className="flex-1 h-12 bg-gray-100 dark:bg-white/10 rounded-xl text-xs font-bold flex items-center justify-center gap-2" onClick={reset}>
                    Nueva Foto
                  </button>
                  <button className="flex-1 h-12 bg-primary/10 text-primary rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-lg">save</span>
                    Guardar Reporte
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10">
          <div className="flex gap-3">
             <span className="material-symbols-outlined text-primary">tips_and_updates</span>
             <p className="text-[10px] text-primary-dark dark:text-primary font-medium leading-relaxed">
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
