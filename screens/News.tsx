
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';

interface Article {
  id: string;
  title: string;
  category: string;
  image: string;
  time: string;
  featured?: boolean;
  url: string;
}

const News: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const articles: Article[] = [
    // Featured Resources (Pestañas Superiores)
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

    // Specific News Items (List below)
    {
      id: '1',
      title: 'Textiles: Nuevo producto prioritario oficializado bajo la Ley REP',
      category: 'Normativa',
      image: 'https://picsum.photos/seed/textil1/400/300',
      time: 'Hace 5 horas',
      url: 'https://economiacircular.mma.gob.cl/'
    },
    {
      id: '2',
      title: 'Publicación IEMA 2024: Radiografía ambiental completa de Chile',
      category: 'Reportes',
      image: 'https://picsum.photos/seed/iema/100/100',
      time: 'Hace 1 día',
      url: 'https://sinia.mma.gob.cl/'
    },
    {
      id: '3',
      title: 'Laguna de Aculeo declarada oficialmente Humedal Urbano protegido',
      category: 'Conservación',
      image: 'https://picsum.photos/seed/aculeo/100/100',
      time: 'Hace 1 día',
      url: 'https://humedaleschile.mma.gob.cl/'
    },
    {
      id: '4',
      title: 'Nueva norma de contaminación lumínica vigente en todo el territorio',
      category: 'Medio Ambiente',
      image: 'https://picsum.photos/seed/luz1/100/100',
      time: 'Hace 2 días',
      url: 'https://luminica.mma.gob.cl/'
    },
  ];

  const filteredArticles = useMemo(() => {
    if (!search.trim()) return articles;
    const term = search.toLowerCase();
    return articles.filter(a =>
      a.title.toLowerCase().includes(term) ||
      a.category.toLowerCase().includes(term)
    );
  }, [search]);

  return (
    <div className="font-public bg-background-light dark:bg-background-dark min-h-screen text-slate-900 dark:text-white max-w-md mx-auto pb-28">
      <div className="sticky top-0 z-40 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5 p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold">Noticias</h1>
          <div className="size-10"></div>
        </div>

        <div className="relative group">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 bg-white dark:bg-surface-input rounded-xl pl-12 pr-4 text-sm border border-transparent focus:border-primary/50 transition-all outline-none"
            placeholder="Buscar noticias, guías o normativas..."
          />
        </div>
      </div>

      <div className="p-4 space-y-6">
        {!search && (
          <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x">
            {articles.filter(a => a.featured).map(a => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-[85%] snap-center relative h-48 rounded-2xl overflow-hidden shadow-xl bg-gray-800 transform active:scale-[0.98] transition-all block"
              >
                <img src={a.image} className="w-full h-full object-cover opacity-60" alt={a.title} />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent p-4 flex flex-col justify-end">
                  <span className="bg-primary/90 text-[10px] font-bold text-background-dark px-2 py-0.5 rounded w-fit mb-2 uppercase">{a.category}</span>
                  <h3 className="font-bold leading-tight">{a.title}</h3>
                </div>
              </a>
            ))}
          </div>
        )}

        <section>
          <h2 className="font-bold text-xl mb-4 px-1">
            {search ? `Resultados (${filteredArticles.length})` : 'Lo más reciente'}
          </h2>
          <div className="space-y-4">
            {filteredArticles.length > 0 ? (
              filteredArticles.filter(a => search ? true : !a.featured).map(a => (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-100 dark:border-white/5 flex gap-4 hover:border-primary/30 transition-all cursor-pointer block"
                >
                  <img src={a.image} className="size-20 rounded-lg object-cover" alt={a.title} />
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider">{a.category}</span>
                      <h4 className="font-bold text-sm leading-snug line-clamp-2 mt-1">{a.title}</h4>
                    </div>
                    <span className="text-[10px] text-gray-500">{a.time}</span>
                  </div>
                </a>
              ))
            ) : (
              <div className="py-12 text-center flex flex-col items-center gap-3">
                <span className="material-symbols-outlined text-5xl text-gray-600">sentiment_dissatisfied</span>
                <p className="text-gray-500 font-medium">No encontramos resultados para tu búsqueda.</p>
                <button onClick={() => setSearch('')} className="text-primary font-bold text-sm">Limpiar filtros</button>
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
