import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Orígenes autorizados a invocar esta función desde el navegador.
const ALLOWED_ORIGINS = [
  'https://econexo.cl',
  'https://www.econexo.cl',
  'http://localhost:3000',
];

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trigger-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const APP_URL = 'https://econexo.cl';
const TRIGGER_SECRET = Deno.env.get('TRIGGER_SECRET') ?? '';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildEmailHtml(
  type: string,
  title: string,
  message: string,
  metadata: Record<string, any>,
  isCopy: boolean,
): string {
  const ctaMap: Record<string, { label: string; url: string }> = {
    certificate: { label: 'Ver certificado →', url: `${APP_URL}/dashboard` },
    withdrawal: { label: 'Ver retiros →', url: `${APP_URL}/dashboard` },
    document: { label: 'Ver documentos →', url: `${APP_URL}/dashboard` },
    report: { label: 'Ver reporte →', url: `${APP_URL}/dashboard` },
    reminder: { label: 'Ver detalle →', url: `${APP_URL}/dashboard` },
    account: {
      label: metadata?.is_active ? 'Ingresar →' : 'Contactar soporte →',
      url: metadata?.is_active ? APP_URL : 'mailto:econexo.hub@gmail.com',
    },
  };

  const cta = ctaMap[type] ?? { label: 'Ir a Econexo →', url: APP_URL };

  // Aviso solo para los correos adicionales de la empresa (no para el titular).
  const copyNotice = isCopy
    ? `<tr><td style="padding:0 32px 20px;">
         <p style="margin:0;padding:12px 14px;background:#f7faf4;border-left:3px solid #b4d351;border-radius:6px;color:#6b7d5a;font-size:12px;line-height:1.5;">
           Recibes esta copia porque tu correo fue agregado como contacto de aviso de
           <strong>${escapeHtml(metadata?.company_name || 'tu empresa')}</strong> en Econexo.
           Para dejar de recibirlas, pide al titular de la cuenta que retire tu correo desde Perfil → Correos de aviso.
         </p>
       </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f0;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:#326105;padding:28px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">Econexo</h1>
          <p style="margin:4px 0 0;color:#a8d080;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Gestión Ambiental Inteligente</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#1a2e0a;font-size:18px;font-weight:900;">${escapeHtml(title)}</h2>
          <p style="margin:0 0 24px;color:#4a5568;font-size:15px;line-height:1.6;">${escapeHtml(message)}</p>
          <a href="${cta.url}" style="display:inline-block;background:#326105;color:#ffffff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:900;font-size:14px;letter-spacing:0.5px;">${cta.label}</a>
        </td></tr>
        ${copyNotice}
        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #e8f0e0;background:#f7faf4;">
          <p style="margin:0;color:#9aa89a;font-size:11px;text-align:center;">Este correo fue enviado automáticamente por Econexo · <a href="mailto:econexo.hub@gmail.com" style="color:#326105;text-decoration:none;">econexo.hub@gmail.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendViaResend(apiKey: string, to: string[], subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Econexo <notificaciones@econexo.cl>', to, subject, html }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('Resend error:', res.status, errText);
    return { ok: false as const };
  }
  const data = await res.json();
  return { ok: true as const, id: data.id as string };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { type, title, message, metadata } = body;
    // copyExtras=false permite a un emisor interno (recordatorios) omitir las copias.
    const copyExtras: boolean = body.copyExtras !== false;

    // ── Autorización: o bien un JWT de usuario, o bien el secreto interno ──
    // Con JWT   → el destinatario es SIEMPRE el usuario del token.
    // Con secreto → llamada interna (cron / otra Edge Function): el destinatario
    //               viene en el cuerpo. El secreto nunca sale del servidor.
    const triggerSecret = req.headers.get('x-trigger-secret') ?? '';
    const isInternal = TRIGGER_SECRET.length > 0 && triggerSecret === TRIGGER_SECRET;

    let userId: string;

    if (isInternal) {
      userId = body.userId;
      if (!userId) return json({ error: 'Missing userId' }, 400);
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'Unauthorized' }, 401);

      const callerClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
      if (authError || !caller) return json({ error: 'Unauthorized' }, 401);
      userId = caller.id; // siempre derivado del JWT verificado
    }

    if (!type || !title || !message) return json({ error: 'Missing required fields' }, 400);

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return json({ error: 'Email not configured' }, 500);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !user?.email) {
      console.error('Could not fetch user email:', userError);
      return json({ error: 'User email not found' }, 404);
    }

    // ── Correos adicionales de la empresa (máx. 2) ──
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('notification_emails, company_name')
      .eq('id', userId)
      .single();

    const extras: string[] = (copyExtras ? ((profile?.notification_emails ?? []) as string[]) : [])
      .map((e) => (e ?? '').trim().toLowerCase())
      .filter((e) => EMAIL_RE.test(e) && e !== user.email!.toLowerCase())
      .slice(0, 2);

    const meta = { ...(metadata ?? {}), company_name: profile?.company_name ?? '' };

    // Se envían como mensajes separados (no CC) para que ningún destinatario
    // vea las direcciones de los demás y para que la copia lleve su propio aviso.
    const primary = await sendViaResend(
      RESEND_API_KEY,
      [user.email],
      title,
      buildEmailHtml(type, title, message, meta, false),
    );

    let copies = 0;
    if (extras.length > 0) {
      const copyHtml = buildEmailHtml(type, title, message, meta, true);
      const results = await Promise.allSettled(
        [...new Set(extras)].map((to) => sendViaResend(RESEND_API_KEY, [to], title, copyHtml)),
      );
      copies = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
    }

    if (!primary.ok) return json({ sent: false, copies, error: 'Resend API error' });
    return json({ sent: true, id: primary.id, copies });
  } catch (err: any) {
    console.error('send-email error:', err);
    return json({ sent: false, error: err.message || 'Internal server error' });
  }
});
