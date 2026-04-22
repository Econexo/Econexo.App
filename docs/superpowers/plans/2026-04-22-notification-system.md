# Notification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Notifications screen (currently shows hardcoded mockup), add email via Resend, and fire notifications on account suspend/reactivate.

**Architecture:** Extend `createNotification()` to invoke `send-email` Edge Function in parallel with the existing `send-push` via `Promise.allSettled`. The new `send-email` Edge Function fetches the recipient's email from `auth.users` (service role) and POSTs to the Resend API. `Notifications.tsx` is replaced with a real Supabase query.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Supabase JS v2, Supabase Edge Functions (Deno), Resend API

---

## File Map

| File | Action |
|------|--------|
| `services/notificationService.ts` | Modify — add `'account'` to type union, wire `send-email` in `Promise.allSettled` |
| `supabase/functions/send-email/index.ts` | Create — Resend email sender Edge Function |
| `screens/Notifications.tsx` | Modify — replace mockup with real Supabase query + mark-as-read |
| `components/ClientOverviewModal.tsx` | Modify — call `createNotification` after suspend/reactivate |

---

## Task 1: Extend `notificationService.ts` — add `'account'` type and `send-email` call

**Files:**
- Modify: `services/notificationService.ts`

- [ ] **Step 1: Open the file and locate the type union and `send-push` block**

  The type is on line 8. The `send-push` call is inside a try/catch starting around line 33.

- [ ] **Step 2: Replace the file content with the updated version**

  Full replacement of `services/notificationService.ts`:

  ```ts
  import { supabase } from './supabase';

  export interface NotificationData {
      userId: string;
      title: string;
      message: string;
      type: 'document' | 'certificate' | 'withdrawal' | 'report' | 'account';
      metadata?: any;
  }

  export const createNotification = async (data: NotificationData) => {
      try {
          const { error } = await supabase.from('notifications').insert([
              {
                  user_id: data.userId,
                  title: data.title,
                  message: data.message,
                  type: data.type,
                  metadata: data.metadata || {},
                  read: false,
              },
          ]);

          if (error) {
              console.error('Error creating notification:', error);
              return { success: false, error };
          }

          await Promise.allSettled([
              supabase.functions.invoke('send-push', {
                  body: {
                      userId: data.userId,
                      title: data.title,
                      body: data.message,
                      url: '/dashboard',
                      data: data.metadata || {},
                  },
              }),
              supabase.functions.invoke('send-email', {
                  body: {
                      userId: data.userId,
                      type: data.type,
                      title: data.title,
                      message: data.message,
                      metadata: data.metadata || {},
                  },
              }),
          ]);

          return { success: true };
      } catch (err) {
          console.error('Unexpected error creating notification:', err);
          return { success: false, error: err };
      }
  };

  export const markNotificationAsRead = async (notificationId: string) => {
      try {
          const { error } = await supabase
              .from('notifications')
              .update({ read: true })
              .eq('id', notificationId);

          if (error) {
              console.error('Error marking notification as read:', error);
              return { success: false, error };
          }

          return { success: true };
      } catch (err) {
          console.error('Unexpected error marking notification as read:', err);
          return { success: false, error: err };
      }
  };

  export const markAllNotificationsAsRead = async (userId: string) => {
      try {
          const { error } = await supabase
              .from('notifications')
              .update({ read: true })
              .eq('user_id', userId)
              .eq('read', false);

          if (error) {
              console.error('Error marking all notifications as read:', error);
              return { success: false, error };
          }

          return { success: true };
      } catch (err) {
          console.error('Unexpected error marking all notifications as read:', err);
          return { success: false, error: err };
      }
  };

  export const getNotifications = async (userId: string, limit = 20) => {
      try {
          const { data, error } = await supabase
              .from('notifications')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(limit);

          if (error) {
              console.error('Error fetching notifications:', error);
              return { success: false, error, data: [] };
          }

          return { success: true, data: data || [] };
      } catch (err) {
          console.error('Unexpected error fetching notifications:', err);
          return { success: false, error: err, data: [] };
      }
  };
  ```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

  ```bash
  cd "/Users/sebastian/Desktop/TALLER DOMINGO/Downloads/econexo---ai-environmental-management" && npx tsc --noEmit 2>&1 | grep notificationService
  ```

  Expected: no output (no errors in this file).

- [ ] **Step 4: Commit**

  ```bash
  git add services/notificationService.ts
  git commit -m "feat: add 'account' type and send-email to createNotification"
  ```

---

## Task 2: Create `send-email` Edge Function

**Files:**
- Create: `supabase/functions/send-email/index.ts`

- [ ] **Step 1: Create the directory**

  ```bash
  mkdir -p "/Users/sebastian/Desktop/TALLER DOMINGO/Downloads/econexo---ai-environmental-management/supabase/functions/send-email"
  ```

- [ ] **Step 2: Create `supabase/functions/send-email/index.ts`**

  ```ts
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
        return new Response(JSON.stringify({ error: 'Resend API error', details: errText }), {
          status: 502,
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
      return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });
  ```

- [ ] **Step 3: Deploy the Edge Function via Supabase MCP**

  Use the Supabase MCP `deploy_edge_function` tool:
  - Function name: `send-email`
  - File path: `supabase/functions/send-email/index.ts`

  After deployment, verify it appears in the Supabase dashboard under Edge Functions.

- [ ] **Step 4: Commit**

  ```bash
  git add supabase/functions/send-email/index.ts
  git commit -m "feat: add send-email Edge Function via Resend"
  ```

---

## Task 3: Fix `screens/Notifications.tsx` to read real DB data

**Files:**
- Modify: `screens/Notifications.tsx`

- [ ] **Step 1: Replace `screens/Notifications.tsx` with real DB query version**

  ```tsx
  import React, { useEffect, useState } from 'react';
  import { useNavigate } from 'react-router-dom';
  import Navbar from '../components/Navbar';
  import { supabase } from '../services/supabase';
  import { markNotificationAsRead, markAllNotificationsAsRead } from '../services/notificationService';

  interface Notification {
    id: string;
    title: string;
    message: string;
    type: string;
    read: boolean;
    created_at: string;
  }

  function getIcon(type: string): string {
    switch (type) {
      case 'certificate': return 'verified';
      case 'withdrawal': return 'event_upcoming';
      case 'report': return 'analytics';
      case 'document': return 'description';
      case 'account': return 'manage_accounts';
      default: return 'notifications';
    }
  }

  function getIconColor(type: string): string {
    switch (type) {
      case 'certificate': return 'bg-green-50 text-green-600';
      case 'withdrawal': return 'bg-blue-50 text-blue-600';
      case 'report': return 'bg-purple-50 text-purple-600';
      case 'account': return 'bg-red-50 text-red-600';
      default: return 'bg-gray-50 text-gray-600';
    }
  }

  function getRelativeTime(ts: string): string {
    const diffMs = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins} min`;
    if (hours < 24) return `Hace ${hours}h`;
    return `Hace ${days}d`;
  }

  const Notifications: React.FC = () => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
      const fetchNotifications = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        setNotifications(data || []);
        setLoading(false);
      };

      fetchNotifications();
    }, []);

    const handleMarkAllRead = async () => {
      if (!userId) return;
      await markAllNotificationsAsRead(userId);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const handleMarkRead = async (id: string) => {
      await markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    return (
      <div className="relative font-sans bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-8 overflow-hidden">
        <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
        <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

        <div className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/40 dark:border-slate-700/40 p-4 flex items-center justify-between shadow-sm">
          <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-700/80 rounded-full border border-white/40 dark:border-slate-600/40 shadow-sm transition-all">
            <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">arrow_back</span>
          </button>
          <h2 className="text-lg font-display font-black text-gray-900 dark:text-white">Notificaciones</h2>
          <div className="size-10"></div>
        </div>

        <div className="p-4 space-y-4 relative z-10">
          <div className="flex items-center justify-between px-2 mb-2">
            <h3 className="font-bold text-gray-400 dark:text-gray-500 text-xs uppercase tracking-widest">Recientes</h3>
            <button
              onClick={handleMarkAllRead}
              className="text-primary text-[10px] font-black uppercase tracking-widest hover:text-green-600 transition-colors"
            >
              Marcar todo como leído
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16">
              <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
            </div>
          )}

          {!loading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <span className="material-symbols-outlined text-5xl text-gray-300">notifications_off</span>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sin notificaciones</p>
            </div>
          )}

          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => !n.read && handleMarkRead(n.id)}
              className={`relative bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl p-4 rounded-[24px] border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] space-y-3 transition-transform active:scale-[0.98] cursor-pointer ${!n.read ? 'border-l-4 border-l-primary' : ''}`}
            >
              {!n.read && <div className="absolute top-4 right-4 size-2.5 rounded-full bg-primary shadow-glow animate-pulse"></div>}
              <div className="flex gap-4">
                <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 border border-white/50 dark:border-slate-600/40 shadow-sm ${getIconColor(n.type)}`}>
                  <span className="material-symbols-outlined text-2xl">{getIcon(n.type)}</span>
                </div>
                <div className="flex-1 space-y-1">
                  <h4 className="font-display font-bold text-sm text-gray-900 dark:text-white leading-tight">{n.title}</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-medium">{n.message}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 pt-1 font-black uppercase tracking-widest">{getRelativeTime(n.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Navbar />
      </div>
    );
  };

  export default Notifications;
  ```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

  ```bash
  cd "/Users/sebastian/Desktop/TALLER DOMINGO/Downloads/econexo---ai-environmental-management" && npx tsc --noEmit 2>&1 | grep Notifications
  ```

  Expected: no output.

- [ ] **Step 3: Commit**

  ```bash
  git add screens/Notifications.tsx
  git commit -m "feat: replace hardcoded Notifications mockup with real DB query"
  ```

---

## Task 4: Add `createNotification` to `ClientOverviewModal.tsx` on suspend/reactivate

**Files:**
- Modify: `components/ClientOverviewModal.tsx`

- [ ] **Step 1: Add import for `createNotification` at the top of `ClientOverviewModal.tsx`**

  Add after the existing imports (line 6, after `useConfirm`):

  ```ts
  import { createNotification } from '../services/notificationService';
  ```

  The full import block at the top should look like:
  ```ts
  import React, { useEffect, useState } from 'react';
  import { supabase } from '../services/supabase';
  import { materialFactors, normalizeMaterialType } from '../utils/materialCalculations';
  import { useToast } from '../components/ui/Toast';
  import { useConfirm } from '../components/ui/ConfirmDialog';
  import { createNotification } from '../services/notificationService';
  ```

- [ ] **Step 2: In `handleToggleSuspend`, add `createNotification` call after the successful DB update**

  Locate the `else` branch in `handleToggleSuspend` (around line 172–176) that currently does:
  ```ts
  } else {
      setIsActive(newActive);
      toast.success(newActive ? 'Cuenta reactivada.' : 'Cuenta suspendida.');
  }
  ```

  Replace with:
  ```ts
  } else {
      setIsActive(newActive);
      toast.success(newActive ? 'Cuenta reactivada.' : 'Cuenta suspendida.');
      await createNotification({
          userId: user.id,
          title: newActive ? 'Cuenta reactivada' : 'Cuenta suspendida',
          message: newActive
              ? 'Tu cuenta ha sido reactivada. Ya puedes acceder a la plataforma Econexo.'
              : 'Tu cuenta ha sido suspendida. Contacta a soporte en econexo.hub@gmail.com para más información.',
          type: 'account',
          metadata: { is_active: newActive },
      });
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

  ```bash
  cd "/Users/sebastian/Desktop/TALLER DOMINGO/Downloads/econexo---ai-environmental-management" && npx tsc --noEmit 2>&1 | grep ClientOverview
  ```

  Expected: no output.

- [ ] **Step 4: Commit**

  ```bash
  git add components/ClientOverviewModal.tsx
  git commit -m "feat: send notification on account suspend/reactivate"
  ```

---

## Manual Setup Reminder (before testing email delivery)

These are one-time steps the developer must do in external services — they are **not** code changes:

1. **Resend account:** Create at resend.com, verify sending domain or use `onboarding@resend.dev` for testing
2. **Resend API key:** Add to Supabase project secrets as `RESEND_API_KEY`
3. **VAPID keys** (if not already set): Generate with `npx web-push generate-vapid-keys`, add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` to Supabase secrets, and `VITE_VAPID_PUBLIC_KEY` to `.env`

The `send-email` function will return a 500 with `"Email not configured"` if `RESEND_API_KEY` is missing — this is expected until the key is added.
