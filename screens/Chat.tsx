
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getGeminiResponse } from '../services/gemini';
import { Message } from '../types';

const Chat: React.FC = () => {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', parts: [{ text: '¡Hola! Soy tu asistente de Econexo. ¿En qué puedo ayudarte hoy con la gestión ambiental de tu empresa?' }] }
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: 'user', parts: [{ text: input }] };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const responseText = await getGeminiResponse(input, messages);
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: responseText || "No pude generar una respuesta." }] }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: "Lo siento, hubo un error de conexión." }] }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen font-display bg-[#f0f4f0] max-w-md mx-auto relative overflow-hidden text-slate-900">
      {/* Decorative Background Blobs */}
      <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-white/40 p-4 flex items-center gap-4 shadow-sm">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 hover:bg-white/80 rounded-full border border-white/40 shadow-sm transition-all text-gray-700">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary flex items-center justify-center text-background-dark shadow-md">
            <span className="material-symbols-outlined filled text-xl">smart_toy</span>
          </div>
          <div>
            <h2 className="text-sm font-black text-gray-900">Asistente Eco</h2>
            <div className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar relative z-10">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-4 rounded-[20px] text-sm leading-relaxed shadow-sm ${m.role === 'user'
              ? 'bg-primary text-background-dark font-medium rounded-tr-none shadow-primary/20'
              : 'bg-white/60 backdrop-blur-2xl text-gray-800 rounded-tl-none border border-white/80 font-medium'
              }`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h3: ({ node, ...props }) => <h3 className="text-base font-bold mb-2 mt-1" {...props} />,
                  p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                  ul: ({ node, ...props }) => <ul className="list-disc ml-4 mb-2" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal ml-4 mb-2" {...props} />,
                  li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                  strong: ({ node, ...props }) => <strong className="font-black" {...props} />,
                }}
              >
                {m.parts[0].text}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/60 backdrop-blur-2xl p-4 rounded-[20px] rounded-tl-none border border-white/80 flex gap-1">
              <div className="size-1.5 bg-primary/40 rounded-full animate-bounce"></div>
              <div className="size-1.5 bg-primary/60 rounded-full animate-bounce delay-75"></div>
              <div className="size-1.5 bg-primary/80 rounded-full animate-bounce delay-150"></div>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white/70 backdrop-blur-md border-t border-white/40 z-20">
        <div className="flex items-center gap-2 bg-white/50 border border-white/60 rounded-[24px] px-4 py-2 shadow-inner focus-within:bg-white focus-within:border-primary/30 transition-all">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pregunta sobre Ley REP, reciclaje..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 font-medium text-gray-900 placeholder:text-gray-400"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className={`size-10 rounded-full flex items-center justify-center transition-all ${input.trim() ? 'bg-primary text-background-dark shadow-lg shadow-primary/20 active:scale-90' : 'text-gray-400 bg-gray-100'
              }`}
          >
            <span className="material-symbols-outlined">send</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
