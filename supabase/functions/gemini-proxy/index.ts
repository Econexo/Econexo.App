// Supabase Edge Function: gemini-proxy
// Proxies requests to Google Gemini API, keeping the API key server-side only

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Sesión inválida' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse the request body
    const { action, prompt, history, imageBase64 } = await req.json();

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'Gemini API key no configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const GEMINI_MODEL = 'gemini-1.5-flash';
    const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`;

    let responseText = '';

    if (action === 'chat') {
      // Chat completion
      const systemInstruction = "Eres el asistente de IA experto de Econexo. Ayudas a empresas a gestionar residuos industriales, cumplir con normativas ambientales (como la Ley REP en Chile y normas internacionales) y optimizar métricas de sustentabilidad. Tus respuestas deben ser profesionales, técnicamente precisas, bien estructuradas (usa markdown si es necesario) y completas. Responde siempre en español.";

      const contents = (history || [])
        .map((msg: { role: string; parts: { text: string }[] }) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: msg.parts.map((p: { text: string }) => ({ text: p.text })),
        }))
        .filter((msg: { role: string }, index: number) => msg.role === 'user' || index > 0);

      // Add the current prompt
      contents.push({ role: 'user', parts: [{ text: prompt }] });

      const geminiRes = await fetch(`${GEMINI_BASE_URL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.7,
          },
        }),
      });

      const geminiData = await geminiRes.json();

      if (geminiData.error) {
        throw new Error(geminiData.error.message || 'Error de Gemini API');
      }

      responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta';

    } else if (action === 'analyze') {
      // Image analysis
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

      if (geminiData.error) {
        throw new Error(geminiData.error.message || 'Error de Gemini Vision');
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

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno del servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
