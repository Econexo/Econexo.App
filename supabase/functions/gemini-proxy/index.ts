// Supabase Edge Function: gemini-proxy
// Proxies requests to Google Gemini API, keeping the API key server-side only

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
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

    const { action, prompt, history, imageBase64 } = await req.json();

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY no configurada en los secretos de la Edge Function' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use latest stable model with fallback name
    const GEMINI_MODEL = 'gemini-1.5-flash';
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
