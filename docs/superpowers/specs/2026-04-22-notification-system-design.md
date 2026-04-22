# Notification System — Design Spec

**Date:** 2026-04-22  
**Status:** Approved  
**Scope:** Fix in-app notifications + add email via Resend + add suspend/reactivate triggers

---

## Overview

The notification infrastructure (DB table, Web Push Edge Function, NotificationBell, service worker) already exists but has two problems: (1) the Notifications screen shows hardcoded mockup data instead of real DB rows, and (2) there is no email channel. This spec fixes both while keeping changes minimal — extending `notificationService.ts` to fire email in parallel with push, and replacing the mockup screen with a real query.

---

## 1. Channels

### 1a. In-app (already working)
- `NotificationBell` reads from `notifications` table via Supabase Realtime — already functional.
- `Notifications.tsx` screen — **broken** (hardcoded mockup, not reading DB). Will be fixed.

### 1b. Web Push (infrastructure exists, may need VAPID config)
- Edge Function `send-push` already built and deployed.
- Requires VAPID keys in Supabase Secrets (see Section 5).
- No code changes needed to the Edge Function itself.

### 1c. Email — NEW
- New Edge Function `send-email` using Resend API.
- Called in parallel with `send-push` inside `createNotification()`.
- Fire-and-forget: email failure does not block the DB insert or push.
- Sender: `notificaciones@econexo.cl` (or `onboarding@resend.dev` during Resend domain verification).
- Recipient email fetched inside Edge Function from `auth.users` using service role.

---

## 2. Trigger Events

All six events call `createNotification()` which fans out to DB + push + email:

| Event | Triggered from | `type` | Subject line |
|-------|---------------|--------|-------------|
| Certificado de Recepción generado | `Dashboard.tsx`, `Admin.tsx` | `certificate` | "Nuevo certificado disponible" |
| Retiro programado | `ScheduledWithdrawals.tsx` | `withdrawal` | "Retiro agendado" |
| Documento subido | `Admin.tsx` | `document` | "Nuevo documento en tu cuenta" |
| Eco-reporte generado | `Documents.tsx` | `report` | "Tu eco-reporte está listo" |
| Cuenta suspendida | `ClientOverviewModal.tsx` | `account` | "Cuenta suspendida" |
| Cuenta reactivada | `ClientOverviewModal.tsx` | `account` | "Cuenta reactivada" |

The first four events already call `createNotification()`. The suspend/reactivate calls are new (added to `ClientOverviewModal.tsx`).

---

## 3. Email Templates

All emails share the same HTML wrapper: Econexo logo, green header (`#326105`), body content, CTA button linking to the app, and a footer. No external template library — plain HTML string in the Edge Function.

### Per-event body:

**certificate**
> Se ha generado el certificado **{cert_number}** para tu empresa. Has recibido **{points}** Eco-Puntos por este retiro.
> [Ver certificado →]

**withdrawal**
> Se ha agendado un retiro de **{waste_type}** para el **{scheduled_date}**.
> [Ver retiros →]

**document**
> El administrador ha subido un nuevo documento a tu cuenta: **"{file_name}"**.
> [Ver documentos →]

**report**
> Tu eco-reporte para el período **{periodo}** está listo para descargar.
> [Ver reporte →]

**account (suspendida)**
> Tu cuenta ha sido suspendida. Para más información contacta a soporte en econexo.hub@gmail.com.
> [Contactar soporte →]

**account (reactivada)**
> Tu cuenta ha sido reactivada. Ya puedes acceder a la plataforma Econexo nuevamente.
> [Ingresar →]

The CTA button URL points to `https://econexo.cl` (or `https://app.econexo.cl` — whatever the production URL is).

---

## 4. Architecture

### `notificationService.ts` changes

Add `send-email` invocation in parallel with existing `send-push`:

```ts
// After inserting the DB row:
await Promise.allSettled([
  supabase.functions.invoke('send-push', { body: { userId, title, body: message } }),
  supabase.functions.invoke('send-email', { body: { userId, type, title, message, metadata } }),
]);
```

`Promise.allSettled` ensures both are attempted and neither failure surfaces to the caller.

### `send-email` Edge Function (new)

```
supabase/functions/send-email/index.ts
```

1. Receive `{ userId, type, title, message, metadata }` via POST
2. Fetch recipient email: `supabase.auth.admin.getUserById(userId)` → `user.email`
3. Build HTML string based on `type` + `metadata`
4. POST to `https://api.resend.com/emails` with `Authorization: Bearer {RESEND_API_KEY}`
5. Return 200 on success, log errors without throwing (fire-and-forget contract)

### `Notifications.tsx` changes

Replace hardcoded array with real Supabase query:

```ts
const { data: notifications } = await supabase
  .from('notifications')
  .select('*')
  .eq('user_id', currentUserId)
  .order('created_at', { ascending: false })
  .limit(50);
```

- Render each notification with icon by `type` (matching `NotificationBell` icons).
- "Marcar todas como leídas" button calls `markAllNotificationsAsRead(userId)`.
- Click on individual notification calls `markNotificationAsRead(id)`.
- Empty state when no notifications.

### `ClientOverviewModal.tsx` changes

After a successful suspend toggle, call `createNotification`:

```ts
await createNotification({
  userId: user.id,
  title: newActive ? 'Cuenta reactivada' : 'Cuenta suspendida',
  message: newActive
    ? 'Tu cuenta ha sido reactivada. Ya puedes acceder a la plataforma.'
    : 'Tu cuenta ha sido suspendida. Contacta a soporte para más información.',
  type: 'account',
  metadata: { is_active: newActive },
});
```

---

## 5. Required Manual Setup (one-time)

Before deploying, the following must be configured:

### Resend
1. Create account at resend.com
2. Verify sending domain (or use `onboarding@resend.dev` for testing)
3. Generate API key
4. Add to Supabase Secrets: `RESEND_API_KEY`

### VAPID (Web Push)
Verify these are set in Supabase Secrets:
- `VAPID_PUBLIC_KEY` — base64url EC P-256 public key
- `VAPID_PRIVATE_KEY` — base64url EC P-256 private key
- `VAPID_SUBJECT` — `mailto:econexo.hub@gmail.com`

And in the frontend `.env`:
- `VITE_VAPID_PUBLIC_KEY` — same as above public key

If keys don't exist yet, generate with:
```bash
npx web-push generate-vapid-keys
```

---

## 6. Files to Create / Modify

| File | Action |
|------|--------|
| `supabase/functions/send-email/index.ts` | Create — Resend email sender |
| `services/notificationService.ts` | Modify — add `send-email` call in `createNotification` |
| `screens/Notifications.tsx` | Modify — replace mockup with real DB query |
| `components/ClientOverviewModal.tsx` | Modify — call `createNotification` on suspend/reactivate |

---

## 7. Out of Scope

- Email unsubscribe link / preferences (future)
- Email open tracking (future)
- Notification preferences per user (future)
- SMS notifications (future)
