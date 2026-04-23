import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL = 'https://econexo.cl';

function buildEmailHtml(type: string, title: string, message: string, metadata: Record<string, any>): string {
  const ctaMap: Record<string, { label: string; url: string }> = {
    certificate: { label: 'Ver certificado →', url: `${APP_URL}/dashboard` },
    withdrawal: { label: 'Ver retiros →', url: `${APP_URL}/dashboard` },
    document: { label: 'Ver documentos →', url: `${APP_URL}/dashboard` },
    report: { label: 'Ver reporte →', url: `${APP_URL}/dashboard` },
    account: {
      label: metadata?.is_active ? 'Ingresar →' : 'Contactar soporte →',
      url: metadata?.is_active ? APP_URL : 'mailto:econexo.hub@gmail.com',
    },
  };

  const cta = ctaMap[type] ?? { label: 'Ir a Econexo →', url: APP_URL };

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
          <h2 style="margin:0 0 16px;color:#1a2e0a;font-size:18px;font-weight:900;">${title}</h2>
          <p style="margin:0 0 24px;color:#4a5568;font-size:15px;line-height:1.6;">${message}</p>
          <a href="${cta.url}" style="display:inline-block;background:#326105;color:#ffffff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:900;font-size:14px;letter-spacing:0.5px;">${cta.label}</a>
        </td></tr>
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, type, title, message, metadata } = await req.json();

    if (!userId || !type || !title || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (userError || !user?.email) {
      console.error('Could not fetch user email:', userError);
      return new Response(JSON.stringify({ error: 'User email not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = buildEmailHtml(type, title, message, metadata ?? {});

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Econexo <notificaciones@econexo.cl>',
        to: [user.email],
        subject: title,
        html,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error('Resend error:', resendResponse.status, errText);
      return new Response(JSON.stringify({ sent: false, error: 'Resend API error' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendData = await resendResponse.json();
    return new Response(JSON.stringify({ sent: true, id: resendData.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('send-email error:', err);
    return new Response(JSON.stringify({ sent: false, error: err.message || 'Internal server error' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
