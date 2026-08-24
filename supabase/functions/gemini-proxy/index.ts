// Supabase Edge Function: gemini-proxy
// Proxies requests to Google Gemini API, keeping the API key server-side only.
//
// La clave anónima de Supabase viaja en el bundle del cliente, así que basta con
// que el encabezado empiece por "Bearer " para que cualquiera pudiera quemar la
// cuota de Gemini. Aquí se verifica el JWT contra Supabase: el llamante tiene
// que ser un usuario con sesión iniciada, y además se acotan los tamaños.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://econexo.cl',
  'https://www.econexo.cl',
  'http://localhost:3000',
];

// Topes de entrada: sin ellos, una sola petición puede costar una fortuna en tokens.
const MAX_PROMPT_CHARS = 8_000;
const MAX_HISTORY_TURNS = 24;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;   // ~6 MB de imagen decodificada
const MAX_BODY_BYTES = 10 * 1024 * 1024;

// Límite de uso por usuario y ventana. Es por isolate (best-effort): frena el
// abuso desde un cliente sin necesitar estado compartido.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const recentCalls = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const calls = (recentCalls.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  calls.push(now);
  recentCalls.set(userId, calls);
  if (recentCalls.size > 5_000) recentCalls.clear(); // no dejar crecer el mapa sin fin
  return calls.length > RATE_LIMIT;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') ?? '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificación real del token: no basta con que exista el encabezado.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (rateLimited(caller.id)) {
      return new Response(JSON.stringify({ error: 'Demasiadas consultas seguidas. Espera un momento.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: 'La petición es demasiado grande.' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = JSON.parse(rawBody);
    const action = parsed.action;
    const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.slice(0, MAX_PROMPT_CHARS) : '';
    const history = Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY_TURNS) : [];
    const imageBase64 = typeof parsed.imageBase64 === 'string' ? parsed.imageBase64 : '';

    if (imageBase64 && imageBase64.length * 0.75 > MAX_IMAGE_BYTES) {
      return new Response(JSON.stringify({ error: 'La imagen supera el tamaño permitido (6 MB).' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY no configurada en los secretos de la Edge Function' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use latest stable model with fallback name
    const GEMINI_MODEL = 'gemini-2.5-flash';
    const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`;

    let responseText = '';

    if (action === 'chat') {
      const systemInstruction = "Eres el asistente de IA experto de Econexo. Ayudas a empresas a gestionar residuos industriales, cumplir con normativas ambientales (como la Ley REP en Chile y normas internacionales) y optimizar métricas de sustentabilidad. Tus respuestas deben ser profesionales, técnicamente precisas, bien estructuradas (usa markdown si es necesario) y completas. Responde siempre en español.";

      // Filter history: only include user/model turns, skip the initial greeting model message,
      // and ensure the conversation always starts with a user message
      const filteredHistory = (history || [])
        .filter((msg: { role: string }) => msg.role === 'user' || msg.role === 'model')
        .map((msg: { role: string; parts: { text: string }[] }) => ({
          role: msg.role,
          parts: msg.parts.map((p: { text: string }) => ({ text: p.text })),
        }));

      // Drop leading model messages — Gemini requires first turn to be user
      while (filteredHistory.length > 0 && filteredHistory[0].role === 'model') {
        filteredHistory.shift();
      }

      // Add the current user prompt
      filteredHistory.push({ role: 'user', parts: [{ text: prompt }] });

      const geminiRes = await fetch(`${GEMINI_BASE_URL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: filteredHistory,
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.7,
          },
        }),
      });

      const geminiData = await geminiRes.json();

      if (!geminiRes.ok || geminiData.error) {
        const errMsg = geminiData.error?.message || `HTTP ${geminiRes.status}`;
        throw new Error(`Gemini API: ${errMsg}`);
      }

      responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta';

    } else if (action === 'analyze') {
      const analysisPrompt = prompt || "Analiza esta imagen y dime su impacto ambiental o cómo debería reciclarse según la normativa chilena.";
      const imageData = imageBase64?.includes(',') ? imageBase64.split(',')[1] : imageBase64;

      const geminiRes = await fetch(`${GEMINI_BASE_URL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: analysisPrompt },
              { inline_data: { mime_type: 'image/jpeg', data: imageData } },
            ],
          }],
        }),
      });

      const geminiData = await geminiRes.json();

      if (!geminiRes.ok || geminiData.error) {
        const errMsg = geminiData.error?.message || `HTTP ${geminiRes.status}`;
        throw new Error(`Gemini Vision: ${errMsg}`);
      }

      responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta';

    } else {
      return new Response(JSON.stringify({ error: 'Acción no válida. Use "chat" o "analyze".' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ text: responseText }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno del servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
