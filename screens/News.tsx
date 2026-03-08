
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { fetchNews, Article } from '../services/news';

const News: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [dynamicArticles, setDynamicArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  const staticResources: Article[] = [
    {
      id: 'res-1',
      title: 'Conoce todo sobre la Ley REP y sus metas',
      category: 'Educación',
      image: 'https://picsum.photos/seed/rep1/400/300',
      time: 'Recurso Oficial',
      featured: true,
      url: 'https://economiacircular.mma.gob.cl/ley-rep/'
    },
    {
      id: 'res-2',
      title: 'Acceso a Ventanilla Única (RETC)',
      category: 'Trámites',
      image: 'https://picsum.photos/seed/retc/400/300',
      time: 'Plataforma',
      featured: true,
      url: 'https://retc.mma.gob.cl/'
    },
    {
      id: 'res-3',
      title: 'Hoja de Ruta de Economía Circular al 2040',
      category: 'Visión',
      image: 'https://picsum.photos/seed/circular/400/300',
      time: 'Documento',
      featured: true,
      url: 'https://economiacircular.mma.gob.cl/hoja-de-ruta/'
    },
  ];

  useEffect(() => {
    const loadNews = async () => {
      setLoading(true);
      const news = await fetchNews();
      setDynamicArticles(news);
      setLoading(false);
    };
    loadNews();
  }, []);

  const allArticles = useMemo(() => {
    return [...staticResources, ...dynamicArticles];
  }, [dynamicArticles]);

  const filteredArticles = useMemo(() => {
    if (!search.trim()) return allArticles;
    const term = search.toLowerCase();
    return allArticles.filter(a =>
      a.title.toLowerCase().includes(term) ||
      a.category.toLowerCase().includes(term)
    );
  }, [search, allArticles]);

  return (
    <div className="relative font-sans bg-[#f0f4f0] min-h-screen text-slate-900 max-w-md md:max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-8 overflow-hidden">
      {/* Decorative Background Blobs */}
      <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

      <div className="sticky top-0 z-40 bg-white/70 backdrop-blur-md border-b border-white/40 shadow-sm p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 hover:bg-white/80 rounded-full border border-white/40 shadow-sm transition-all">
            <span className="material-symbols-outlined text-gray-700">arrow_back</span>
          </button>
          <h1 className="text-lg font-display font-black text-gray-900">Noticias</h1>
          <div className="size-10"></div>
        </div>

        <div className="relative group">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 bg-white/60 backdrop-blur-sm rounded-xl pl-12 pr-4 text-sm border border-white/60 focus:border-primary/50 transition-all outline-none font-bold text-gray-700 placeholder:text-gray-400 focus:bg-white/80"
            placeholder="Buscar noticias, guías o normativas..."
          />
        </div>
      </div>

      <div className="p-4 space-y-6 relative z-10">
        {!search && (
          <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x pb-2">
            {staticResources.map(a => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-[85%] snap-center relative h-48 rounded-[24px] overflow-hidden shadow-xl bg-gray-800 transform active:scale-[0.98] transition-all block group"
              >
                <img src={a.image} className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" alt={a.title} />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-5 flex flex-col justify-end text-white">
                  <span className="bg-primary/90 backdrop-blur-sm text-[10px] font-black text-white px-2 py-1 rounded-md w-fit mb-2 uppercase shadow-sm border border-white/10">{a.category}</span>
                  <h3 className="font-display font-black leading-tight drop-shadow-md text-lg">{a.title}</h3>
                </div>
              </a>
            ))}
          </div>
        )}

        <section>
          <h2 className="font-display font-black text-lg mb-4 px-1 text-gray-900 flex items-center gap-2">
            {search ? `Resultados (${filteredArticles.length})` : 'Lo más reciente'}
            {loading && !search && <span className="text-xs text-gray-500 font-normal animate-pulse">(Actualizando...)</span>}
          </h2>
          <div className="space-y-4">
            {loading && dynamicArticles.length === 0 ? (
              // Loading Skeletons
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="bg-white/40 rounded-[24px] p-4 h-28 animate-pulse flex gap-4">
                  <div className="size-20 bg-gray-200 rounded-xl"></div>
                  <div className="flex-1 space-y-2 py-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </div>
              ))
            ) : filteredArticles.length > 0 ? (
              filteredArticles.filter(a => search ? true : !a.featured).map((a, idx) => (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white/60 backdrop-blur-2xl rounded-[24px] p-4 border border-white/80 flex gap-4 hover:border-primary/30 hover:shadow-lg hover:scale-[1.01] transition-all cursor-pointer block shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <img src={a.image} className="size-20 rounded-xl object-cover shadow-sm" alt={a.title} onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100')} />
                  <div className="flex-1 flex flex-col justify-between py-1">
                    <div>
                      <span className="text-[10px] font-black text-primary uppercase tracking-wider">{a.category}</span>
                      <h4 className="font-display font-bold text-sm text-gray-900 leading-snug line-clamp-2 mt-1" dangerouslySetInnerHTML={{ __html: a.title }}></h4>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{a.time}</span>
                  </div>
                </a>
              ))
            ) : (
              <div className="py-12 text-center flex flex-col items-center gap-3 bg-white/40 backdrop-blur-sm rounded-[32px] border border-dashed border-gray-300">
                <span className="material-symbols-outlined text-5xl text-gray-400">sentiment_dissatisfied</span>
                <p className="text-gray-500 font-bold">No encontramos resultados.</p>
                <button onClick={() => setSearch('')} className="text-primary font-black text-xs uppercase tracking-widest underline">Limpiar filtros</button>
              </div>
            )}
          </div>
        </section>
      </div>

      <Navbar />
    </div>
  );
};

export default News;
