/// <reference types="vite/client" />

import { supabase } from './supabase';
import { Message } from "../types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";

export const getGeminiResponse = async (prompt: string, history: Message[] = []) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return "Error: Sesión no válida. Inicia sesión nuevamente.";

    const response = await fetch(`${SUPABASE_URL}/functions/v1/gemini-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: 'chat',
        prompt,
        history: history.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: msg.parts.map(p => ({ text: p.text }))
        })),
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error del servidor');
    return data.text;
  } catch (e: any) {
    return `Error: ${e.message || "Problema de conexión con IA"}`;
  }
};

export const analyzeImage = async (base64Image: string, prompt: string) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return "Error: Sesión no válida. Inicia sesión nuevamente.";

    const response = await fetch(`${SUPABASE_URL}/functions/v1/gemini-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: 'analyze',
        prompt: prompt || "Analiza esta imagen y dime su impacto ambiental o cómo debería reciclarse según la normativa chilena.",
        imageBase64: base64Image,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error del servidor');
    return data.text;
  } catch (e: any) {
    return `Error al analizar imagen: ${e.message}`;
  }
};
