
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getGeminiResponse } from '../services/gemini';
import { supabase } from '../services/supabase';
import { Message } from '../types';
import Navbar from '../components/Navbar';

const GREETING: Message = {
  role: 'model',
  parts: [{ text: '¡Hola! Soy tu asistente de Econexo. ¿En qué puedo ayudarte hoy con la gestión ambiental de tu empresa?' }],
};
const MAX_STORED_MESSAGES = 50;

const Chat: React.FC = () => {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [loading, setLoading] = useState(false);
  const [chatKey, setChatKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load user-specific chat history from localStorage
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const key = `eco_chat_${user.id}`;
      setChatKey(key);
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const parsed: Message[] = JSON.parse(stored);
          if (parsed.length > 0) setMessages(parsed);
        } catch {
          // ignore malformed data
        }
      }
    });
  }, []);

  // Persist messages whenever they change
  useEffect(() => {
    if (!chatKey || messages.length === 0) return;
    const toStore = messages.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(chatKey, JSON.stringify(toStore));
  }, [messages, chatKey]);

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

  const QUICK_SUGGESTIONS = [
    '¿Qué es la Ley REP?',
    '¿Qué exige el DS 148?',
    '¿Cómo gestionar residuos peligrosos?',
    '¿Qué es un gestor autorizado?',
    '¿Cómo calcular mi huella de carbono?',
  ];

  const handleQuickSend = async (text: string) => {
    if (loading) return;
    const userMsg: Message = { role: 'user', parts: [{ text }] };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const responseText = await getGeminiResponse(text, messages);
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: responseText || "No pude generar una respuesta." }] }]);
    } catch {
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: "Lo siento, hubo un error de conexión." }] }]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = useCallback(() => {
    setMessages([GREETING]);
    if (chatKey) localStorage.removeItem(chatKey);
  }, [chatKey]);

  return (
    <div className="flex flex-col h-full font-display bg-[#f0f4f0] dark:bg-background-dark w-full relative overflow-hidden text-slate-900 dark:text-slate-100">
      <Navbar />
      {/* Decorative Background Blobs */}
      <div className="absolute top-[-5%] left-[-10%] w-40 h-40 sm:w-[400px] sm:h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-20%] w-36 h-36 sm:w-[350px] sm:h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] left-[-15%] w-36 h-36 sm:w-[380px] sm:h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/40 dark:border-slate-700/40 p-4 flex items-center gap-4 shadow-sm">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-700/80 rounded-full border border-white/40 dark:border-slate-600/40 shadow-sm transition-all text-gray-700 dark:text-gray-300">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="size-10 rounded-full bg-primary flex items-center justify-center text-white shadow-md">
            <span className="material-symbols-outlined filled text-xl">smart_toy</span>
          </div>
          <div>
            <h2 className="text-sm font-black text-gray-900 dark:text-white">Asistente Eco</h2>
            <div className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">Online</span>
            </div>
          </div>
        </div>
        {/* New chat button */}
        <button
          onClick={handleNewChat}
          title="Nueva conversación"
          className="size-10 flex items-center justify-center bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-700/80 rounded-full border border-white/40 dark:border-slate-600/40 shadow-sm transition-all text-gray-700 dark:text-gray-300"
        >
          <span className="material-symbols-outlined text-xl">edit_square</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar relative z-10">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] break-words p-4 rounded-[20px] text-sm leading-relaxed shadow-sm ${m.role === 'user'
              ? 'bg-primary text-white font-medium rounded-tr-none shadow-primary/20'
              : 'bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl text-gray-800 dark:text-gray-200 rounded-tl-none border border-white/80 dark:border-slate-600/50 font-medium'
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
        {/* Quick suggestion chips — only visible on fresh/greeting-only chat */}
        {messages.length === 1 && !loading && (
          <div className="flex flex-wrap gap-2 px-1">
            {QUICK_SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleQuickSend(s)}
                className="text-xs font-bold px-4 py-2 rounded-full bg-white/70 dark:bg-slate-800/70 border border-primary/20 text-primary hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl p-4 rounded-[20px] rounded-tl-none border border-white/80 dark:border-slate-600/50 flex gap-1">
              <div className="size-1.5 bg-primary/40 rounded-full animate-bounce"></div>
              <div className="size-1.5 bg-primary/60 rounded-full animate-bounce delay-75"></div>
              <div className="size-1.5 bg-primary/80 rounded-full animate-bounce delay-150"></div>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-t border-white/40 dark:border-slate-700/40 z-20">
        <div className="flex items-center gap-2 bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-slate-600/40 rounded-[24px] px-4 py-2 shadow-inner focus-within:bg-white dark:focus-within:bg-slate-800 focus-within:border-primary/30 transition-all">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pregunta sobre Ley REP, reciclaje..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className={`size-10 rounded-full flex items-center justify-center transition-all ${input.trim() ? 'bg-primary text-white shadow-lg shadow-primary/20 active:scale-90' : 'text-gray-400 bg-gray-100 dark:bg-slate-700'
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
