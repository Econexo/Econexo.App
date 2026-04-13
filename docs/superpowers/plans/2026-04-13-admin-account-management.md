# Admin Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins edit a company's name and suspend/reactivate accounts inside `ClientOverviewModal`, while blocking suspended users from accessing the app.

**Architecture:** Soft-delete pattern via a new `is_active` boolean column on `profiles`. All UI changes are local state inside `ClientOverviewModal`. App-level enforcement adds an `isSuspended` flag derived from the existing `checkAdmin` profiles query and renders a `Suspended` screen when true.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Supabase JS client (`@supabase/supabase-js`), `useConfirm` hook from `components/ui/ConfirmDialog.tsx`, `useToast` hook from `components/ui/Toast.tsx`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260413_add_is_active_to_profiles.sql` | Create | Adds `is_active boolean NOT NULL DEFAULT true` column |
| `components/admin/types.ts` | Modify | Add `is_active?: boolean` to `AdminUserProfile` |
| `components/ClientOverviewModal.tsx` | Modify | Add `is_active` to local type; edit-name UI; suspend/reactivate UI |
| `components/admin/UsersList.tsx` | Modify | "Suspendida" badge when `is_active === false` |
| `screens/Suspended.tsx` | Create | Full-page blocked-account screen with sign-out button |
| `App.tsx` | Modify | Add `isSuspended` state; extend `checkAdmin`; render `<Suspended />` when true |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260413_add_is_active_to_profiles.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260413_add_is_active_to_profiles.sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
```

- [ ] **Step 2: Apply in Supabase dashboard**

Open the Supabase project → SQL Editor → paste and run the query above. Verify: Table Editor → `profiles` → `is_active` column appears with default `true` for all rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260413_add_is_active_to_profiles.sql
git commit -m "feat: add is_active column to profiles for account suspension"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `components/admin/types.ts`

The `Admin.tsx` screen already queries `profiles.select('*')` (line 84), so `is_active` is automatically included in fetched data once the column exists. We only need to declare it in the TypeScript type.

- [ ] **Step 1: Add `is_active` to `AdminUserProfile`**

In `components/admin/types.ts`, find:

```ts
export interface AdminUserProfile {
    id: string;
    company_name: string;
    rut: string;
    address: string;
    is_admin?: boolean;
    company_email?: string;
    is_unregistered?: boolean;
}
```

Replace with:

```ts
export interface AdminUserProfile {
    id: string;
    company_name: string;
    rut: string;
    address: string;
    is_admin?: boolean;
    company_email?: string;
    is_unregistered?: boolean;
    is_active?: boolean;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/admin/types.ts
git commit -m "feat: add is_active field to AdminUserProfile type"
```

---

## Task 3: "Suspendida" Badge in UsersList

**Files:**
- Modify: `components/admin/UsersList.tsx`

- [ ] **Step 1: Add badge to company row**

In `components/admin/UsersList.tsx`, find the company name paragraph:

```tsx
<p className="font-bold text-sm truncate text-gray-900">{u.company_name}</p>
```

Replace with:

```tsx
<div className="flex items-center gap-2 min-w-0">
    <p className="font-bold text-sm truncate text-gray-900">{u.company_name}</p>
    {u.is_active === false && (
        <span className="shrink-0 bg-red-100 text-red-700 text-[9px] font-black uppercase tracking-widest rounded px-2 py-0.5">
            Suspendida
        </span>
    )}
</div>
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/admin/UsersList.tsx
git commit -m "feat: show Suspendida badge in UsersList for inactive companies"
```

---

## Task 4: Edit Company Name in ClientOverviewModal

**Files:**
- Modify: `components/ClientOverviewModal.tsx`

- [ ] **Step 1: Add `is_active` to the local `UserProfile` interface**

Find the local interface at the top of `components/ClientOverviewModal.tsx`:

```ts
interface UserProfile {
    id: string;
    company_name: string;
    rut: string;
    address: string;
    company_email?: string;
    eco_points?: number;
}
```

Replace with:

```ts
interface UserProfile {
    id: string;
    company_name: string;
    rut: string;
    address: string;
    company_email?: string;
    eco_points?: number;
    is_active?: boolean;
}
```

- [ ] **Step 2: Import `useConfirm`**

At the top of `components/ClientOverviewModal.tsx`, after the existing imports, add:

```ts
import { useConfirm } from '../components/ui/ConfirmDialog';
```

- [ ] **Step 3: Add edit-name state inside the component**

Inside `ClientOverviewModal`, after the existing `const toast = useToast();` line, add:

```ts
const confirm = useConfirm();

// Edit company name state
const [displayName, setDisplayName] = useState(user.company_name ?? '');
const [editingName, setEditingName] = useState(false);
const [nameInput, setNameInput] = useState(user.company_name ?? '');
const [nameSaving, setNameSaving] = useState(false);
const [nameError, setNameError] = useState<string | null>(null);
```

- [ ] **Step 4: Add `handleSaveName` function**

After `fetchClientData` and before `handleGenerateEcoReport`, add:

```ts
const handleSaveName = async () => {
    if (!nameInput.trim() || nameInput === displayName) return;
    setNameSaving(true);
    setNameError(null);
    const { error } = await supabase
        .from('profiles')
        .update({ company_name: nameInput.trim() })
        .eq('id', user.id);
    setNameSaving(false);
    if (error) {
        setNameError('No se pudo guardar. Intenta de nuevo.');
    } else {
        setDisplayName(nameInput.trim());
        setEditingName(false);
        toast.success('Nombre actualizado correctamente.');
    }
};
```

- [ ] **Step 5: Replace the static company name in the header**

In the modal header, find:

```tsx
<div className="flex-1 min-w-0">
    <h2 className="font-black text-gray-900 text-lg leading-tight truncate">{user.company_name}</h2>
    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{user.rut}</p>
</div>
```

Replace with:

```tsx
<div className="flex-1 min-w-0">
    {editingName ? (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <input
                    autoFocus
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditingName(false); setNameInput(displayName); setNameError(null); } }}
                    className="flex-1 border border-primary/40 rounded-xl px-3 py-1.5 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                    onClick={handleSaveName}
                    disabled={nameSaving || !nameInput.trim() || nameInput === displayName}
                    className="px-3 py-1.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40 transition-colors hover:bg-primary/90"
                >
                    {nameSaving ? '...' : 'Guardar'}
                </button>
                <button
                    onClick={() => { setEditingName(false); setNameInput(displayName); setNameError(null); }}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-colors"
                >
                    Cancelar
                </button>
            </div>
            {nameError && <p className="text-xs text-red-500 font-bold">{nameError}</p>}
        </div>
    ) : (
        <div className="flex items-center gap-2 group">
            <h2 className="font-black text-gray-900 text-lg leading-tight truncate">{displayName}</h2>
            <button
                onClick={() => { setNameInput(displayName); setEditingName(true); }}
                className="opacity-0 group-hover:opacity-100 size-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all shrink-0"
                title="Editar nombre"
            >
                <span className="material-symbols-outlined text-gray-500 text-sm">edit</span>
            </button>
        </div>
    )}
    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{user.rut}</p>
</div>
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/ClientOverviewModal.tsx
git commit -m "feat: add inline company name editing to ClientOverviewModal"
```

---

## Task 5: Suspend / Reactivate in ClientOverviewModal

**Files:**
- Modify: `components/ClientOverviewModal.tsx`

- [ ] **Step 1: Add suspend/reactivate state**

Inside `ClientOverviewModal`, after the edit-name state variables added in Task 4, add:

```ts
// Suspend / reactivate state
const [isActive, setIsActive] = useState(user.is_active !== false);
const [suspending, setSuspending] = useState(false);
const [suspendError, setSuspendError] = useState<string | null>(null);
```

- [ ] **Step 2: Add `handleToggleSuspend` function**

After `handleSaveName`, add:

```ts
const handleToggleSuspend = async () => {
    // Guard: admin cannot suspend their own account
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser?.id === user.id) {
        setSuspendError('No puedes suspender tu propia cuenta.');
        return;
    }

    if (isActive) {
        const ok = await confirm({
            title: `¿Suspender cuenta de ${displayName}?`,
            message: 'La empresa no podrá acceder a la plataforma hasta que reactives su cuenta.',
            confirmLabel: 'Suspender',
            cancelLabel: 'Cancelar',
            danger: true,
        });
        if (!ok) return;
    }
    setSuspending(true);
    setSuspendError(null);
    const newActive = !isActive;
    const { error } = await supabase
        .from('profiles')
        .update({ is_active: newActive })
        .eq('id', user.id);
    setSuspending(false);
    if (error) {
        setSuspendError('Error al actualizar la cuenta. Intenta de nuevo.');
    } else {
        setIsActive(newActive);
        toast.success(newActive ? 'Cuenta reactivada.' : 'Cuenta suspendida.');
    }
};
```

- [ ] **Step 3: Add the "Zona de peligro" section at the bottom of the scrollable body**

In `components/ClientOverviewModal.tsx`, find the closing of the non-loading content block (just before the `</>` that closes the `{!loading && <>...</>}` block). The last element before `</>` is the `Client Info footer` div. After that div, add:

```tsx
{/* ── Zona de peligro ── */}
<div className="border-t-2 border-red-100 pt-4">
    <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-3">Zona de peligro</p>
    {suspendError && (
        <p className="text-xs text-red-500 font-bold mb-2">{suspendError}</p>
    )}
    {isActive ? (
        <button
            onClick={handleToggleSuspend}
            disabled={suspending}
            className="w-full py-2.5 border-2 border-red-300 text-red-600 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-red-50 disabled:opacity-40 transition-colors"
        >
            {suspending ? 'Suspendiendo...' : 'Suspender cuenta'}
        </button>
    ) : (
        <div className="space-y-2">
            <div className="flex items-center gap-2 justify-center bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                <span className="material-symbols-outlined text-red-500 text-base">block</span>
                <span className="text-xs font-black text-red-600 uppercase tracking-widest">Cuenta suspendida</span>
            </div>
            <button
                onClick={handleToggleSuspend}
                disabled={suspending}
                className="w-full py-2.5 bg-green-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-green-700 disabled:opacity-40 transition-colors"
            >
                {suspending ? 'Reactivando...' : 'Reactivar cuenta'}
            </button>
        </div>
    )}
</div>
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/ClientOverviewModal.tsx
git commit -m "feat: add suspend/reactivate account to ClientOverviewModal"
```

---

## Task 6: Suspended Screen

**Files:**
- Create: `screens/Suspended.tsx`

- [ ] **Step 1: Create the screen**

```tsx
// screens/Suspended.tsx
import React from 'react';
import { supabase } from '../services/supabase';

const Suspended: React.FC = () => {
    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <div className="min-h-screen bg-[#f0f4f0] flex flex-col items-center justify-center p-8">
            <div className="bg-white rounded-[32px] border border-white/80 shadow-2xl p-10 max-w-sm w-full text-center space-y-6">
                <div className="size-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-4xl">block</span>
                </div>
                <div>
                    <h1 className="text-xl font-black text-gray-900 mb-2">Cuenta suspendida</h1>
                    <p className="text-sm text-gray-500 font-medium leading-relaxed">
                        Tu cuenta ha sido suspendida. Contacta a soporte para más información.
                    </p>
                </div>
                <button
                    onClick={handleSignOut}
                    className="w-full py-3 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-700 transition-colors"
                >
                    Cerrar sesión
                </button>
            </div>
        </div>
    );
};

export default Suspended;
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add screens/Suspended.tsx
git commit -m "feat: add Suspended screen for blocked company accounts"
```

---

## Task 7: App-Level Suspension Enforcement

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Import Suspended screen**

In `App.tsx`, after the other eager-loaded imports (Login, ForgotPassword, etc.), add:

```ts
import Suspended from './screens/Suspended';
```

- [ ] **Step 2: Add `isSuspended` state**

In `AppRoutes`, after `const [isAdmin, setIsAdmin] = useState(false);`, add:

```ts
const [isSuspended, setIsSuspended] = useState(false);
```

- [ ] **Step 3: Extend `checkAdmin` to also read `is_active`**

Find `checkAdmin` (inside the `useEffect` at line ~73):

```ts
const checkAdmin = async (userId: string) => {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single();
  setIsAdmin(!!profile?.is_admin);
};
```

Replace with:

```ts
const checkAdmin = async (userId: string) => {
  const { data: profile } = await supabase.from('profiles').select('is_admin, is_active').eq('id', userId).single();
  setIsAdmin(!!profile?.is_admin);
  setIsSuspended(profile?.is_active === false);
};
```

- [ ] **Step 4: Also clear `isSuspended` on sign-out**

In the `onAuthStateChange` callback, find where `setIsAdmin(false)` is called when `session` is null:

```ts
} else {
  setIsAdmin(false);
}
```

Replace with:

```ts
} else {
  setIsAdmin(false);
  setIsSuspended(false);
}
```

- [ ] **Step 5: Render `<Suspended />` when account is suspended**

In `AppRoutes`, find the early return guard:

```tsx
if (isAuthenticated === null) {
  return <PageLoader />;
}
```

Add a check immediately after:

```tsx
if (isAuthenticated && isSuspended) {
  return <Suspended />;
}
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add App.tsx
git commit -m "feat: block suspended accounts at app level, redirect to Suspended screen"
```

---

## Manual QA Checklist

After all tasks are complete, verify the full flow:

**Edit name:**
- [ ] Open ClientOverviewModal for any company → hover company name → pencil icon appears
- [ ] Click pencil → input appears pre-filled with current name
- [ ] Clear input → Save button disabled
- [ ] Type same name → Save button disabled
- [ ] Type new name → Save enabled → click Save → name updates in header and brief toast appears
- [ ] Press Escape → edit mode cancelled, original name restored
- [ ] Click Cancel → same as Escape

**Suspend:**
- [ ] Open modal → "Zona de peligro" visible at bottom
- [ ] Click "Suspender cuenta" → ConfirmDialog opens with correct title + body
- [ ] Click "Cancelar" in dialog → nothing happens
- [ ] Click "Suspender" → modal switches to green "Reactivar" button + red "Cuenta suspendida" badge
- [ ] Close modal → UsersList shows "Suspendida" badge next to company name

**Reactivate:**
- [ ] Open modal for suspended company → green "Reactivar cuenta" button visible
- [ ] Click → no dialog → button switches back to red "Suspender cuenta"
- [ ] UsersList badge disappears

**App block:**
- [ ] Log in as a suspended company → instead of Dashboard, see "Cuenta suspendida" screen
- [ ] Click "Cerrar sesión" → redirected to Login screen
- [ ] Reactivate company via Admin panel → company can log in normally again
