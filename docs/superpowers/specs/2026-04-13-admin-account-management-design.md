# Admin Account Management — Design Spec

**Date:** 2026-04-13  
**Status:** Approved  
**Scope:** Admin panel — edit company name + suspend/reactivate company accounts

---

## Overview

Admins need to correct company names and deactivate (suspend) or reactivate company accounts without deleting data. Both actions are surfaced inside the existing `ClientOverviewModal` in the Admin screen. Suspended companies are blocked from using the app until reactivated.

---

## 1. Data Model

### Migration: add `is_active` to `profiles`

```sql
ALTER TABLE profiles
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;
```

- All existing rows default to `true` (active).
- `company_name` already exists in `profiles`; no schema change needed for the rename feature.

**RLS / access:** Only the service-role or an authenticated admin can update these fields. No additional RLS policy is required beyond what already governs admin reads of `profiles`.

---

## 2. Edit Company Name

### UX flow (inside `ClientOverviewModal`)

1. Company name displayed as plain text next to a pencil icon (`edit` Material icon).
2. Admin clicks pencil → name text replaced by an `<input>` pre-filled with the current name, plus **Save** (primary) and **Cancel** (ghost) buttons inline.
3. **Save** is disabled while the input is empty or unchanged.
4. On Save:
   - Call `supabase.from('profiles').update({ company_name: newName }).eq('id', client.id)`
   - On success: update local state, exit edit mode, show a brief success toast.
   - On error: show inline error message, stay in edit mode.
5. **Cancel** discards changes and returns to display mode.

### State (local to modal)

```ts
const [editingName, setEditingName] = useState(false);
const [nameInput, setNameInput] = useState(client.company_name ?? '');
const [nameSaving, setNameSaving] = useState(false);
const [nameError, setNameError] = useState<string | null>(null);
```

### Component location

All changes inside `components/ClientOverviewModal.tsx`. No new files needed.

---

## 3. Suspend / Reactivate Account

### UX flow

#### Active account

- A **"Zona de peligro"** section appears at the bottom of `ClientOverviewModal`, separated by a red-tinted divider.
- Contains a **"Suspender cuenta"** button (red, outlined).
- Clicking it opens a `ConfirmDialog`:
  - Title: "¿Suspender cuenta de [company]?"
  - Body: "La empresa no podrá acceder a la plataforma hasta que reactives su cuenta."
  - Confirm button: "Suspender" (red, filled).
- On confirm:
  - `supabase.from('profiles').update({ is_active: false }).eq('id', client.id)`
  - On success: update local state; the modal button switches to **"Reactivar"**; the entry in `UsersList` gains a "Suspendida" badge.

#### Suspended account

- Same "Zona de peligro" section shows a **"Reactivar cuenta"** button (green, filled) — no confirmation dialog needed.
- On click:
  - `supabase.from('profiles').update({ is_active: true }).eq('id', client.id)`
  - On success: update local state; badge removed from `UsersList`.

### State (local to modal)

```ts
const [isActive, setIsActive] = useState(client.is_active ?? true);
const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
const [suspending, setSuspending] = useState(false);
```

### ConfirmDialog

Reuse the existing `ConfirmDialog` component if one exists, otherwise create a minimal inline modal with:
- Backdrop overlay
- Title + body text
- Cancel + Confirm buttons

---

## 4. UsersList Badge

In `components/UsersList.tsx` (or wherever the company list row is rendered):

- Read `is_active` from the profile row.
- If `false`, render a `<span>` badge: "Suspendida" in red (`bg-red-100 text-red-700 text-xs rounded px-2 py-0.5`).
- Badge appears next to the company name in the list row.

---

## 5. App-Level Access Block

In the main app routing/auth flow (likely `App.tsx` or an auth context):

- After the user's session is resolved, fetch or read `profiles.is_active` for the logged-in user.
- If `is_active === false`, redirect to a **"Cuenta suspendida"** screen instead of rendering the normal app.

### SuspendedScreen component (new, minimal)

```
┌────────────────────────────────┐
│  [Econexo logo]                │
│                                │
│  Tu cuenta ha sido suspendida  │
│  Contacta a soporte para más   │
│  información.                  │
│                                │
│  [Cerrar sesión]               │
└────────────────────────────────┘
```

- Path: `screens/Suspended.tsx`
- No navigation. Only a sign-out button.
- Check happens in `App.tsx` after `useAuth` resolves, before rendering protected routes.

---

## 6. Data Flow Summary

```
Admin clicks "Suspender"
  → ConfirmDialog
    → supabase UPDATE profiles SET is_active=false WHERE id=X
      → modal local state: isActive=false
      → UsersList row: badge "Suspendida"

Company user logs in (or app re-checks session)
  → auth context reads profiles.is_active
    → false → render <Suspended /> screen
    → true  → render normal app
```

---

## 7. Error Handling

- Network/DB errors on name save or suspension toggle: show inline error text below the action, do not close the modal.
- If the admin tries to suspend their own account: show an error ("No puedes suspender tu propia cuenta.") — check `client.id !== currentUser.id` before allowing the action.
- Loading states: spinner/disabled button while Supabase call is in flight.

---

## 8. Files to Create / Modify

| File | Action |
|------|--------|
| `supabase/migrations/YYYYMMDD_add_is_active_to_profiles.sql` | Create — add `is_active` column |
| `components/ClientOverviewModal.tsx` | Modify — edit name UI + suspend/reactivate UI |
| `components/UsersList.tsx` | Modify — "Suspendida" badge |
| `screens/Suspended.tsx` | Create — suspended account screen |
| `App.tsx` | Modify — `is_active` check + redirect |

---

## 9. Out of Scope

- Email notifications to the company when suspended (future).
- Admin audit log of who suspended / renamed (future).
- Bulk suspend/reactivate (future).
- Hard delete of company data (explicitly not part of this feature — soft-delete only).
