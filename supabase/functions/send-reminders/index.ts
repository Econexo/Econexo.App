// Supabase Edge Function: send-reminders
// ─────────────────────────────────────────────────────────────────────────────
// Barrido diario (lo dispara pg_cron vía private.call_send_reminders):
//
//   1. Retiros programados que caen dentro de N días  → aviso al cliente.
//   2. Certificado de Gestión Mensual (CGM) del mes anterior:
//        · ya emitido        → "tu certificado está disponible"
//        · falta y hubo CR   → "certificado pendiente" + aviso a los admins
//
// Cada aviso se registra en reminder_log ANTES de enviarse. El UNIQUE de esa
// tabla es lo que impide duplicados: si la fila ya existía, no se envía nada.
// Por eso el job puede correr varias veces al día sin spamear a nadie.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TRIGGER_SECRET = Deno.env.get('TRIGGER_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const MONTHS = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

interface ReminderPrefs {
    enabled: boolean;
    withdrawal_days_before: number[];
    certificate_day: number;
    copy_extra_emails: boolean;
}

const DEFAULT_PREFS: ReminderPrefs = {
    enabled: true,
    withdrawal_days_before: [3, 1],
    certificate_day: 5,
    copy_extra_emails: true,
};

/** Fecha de hoy en horario de Chile, como 'YYYY-MM-DD'. */
function todayInChile(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
}

/** Días completos entre dos fechas 'YYYY-MM-DD' (b - a). */
function daysBetween(a: string, b: string): number {
    const MS = 86_400_000;
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS);
}

function addDays(iso: string, n: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

function parsePrefs(raw: unknown): ReminderPrefs {
    const p = (raw ?? {}) as Partial<ReminderPrefs>;
    const days = Array.isArray(p.withdrawal_days_before)
        ? p.withdrawal_days_before
            .map(Number)
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 30)
        : DEFAULT_PREFS.withdrawal_days_before;

    return {
        enabled: p.enabled !== false,
        withdrawal_days_before: days.length ? days : DEFAULT_PREFS.withdrawal_days_before,
        certificate_day:
            Number.isInteger(p.certificate_day) && p.certificate_day! >= 1 && p.certificate_day! <= 28
                ? p.certificate_day!
                : DEFAULT_PREFS.certificate_day,
        copy_extra_emails: p.copy_extra_emails !== false,
    };
}

Deno.serve(async (req: Request) => {
    // Solo se invoca desde dentro (cron). Fail-secure: sin secreto configurado, nadie entra.
    const secret = req.headers.get('x-trigger-secret') ?? '';
    if (!TRIGGER_SECRET || secret !== TRIGGER_SECRET) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const today = todayInChile();
    const dayOfMonth = Number(today.slice(8, 10));

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    /**
     * Registra el aviso y, solo si es nuevo, lo entrega por los tres canales.
     * Devuelve true si se envió, false si ya se había enviado antes.
     */
    async function deliver(opts: {
        userId: string;
        kind: 'withdrawal' | 'certificate';
        refKey: string;
        title: string;
        message: string;
        metadata?: Record<string, unknown>;
        copyExtras?: boolean;
    }): Promise<boolean> {
        const { error: logError } = await admin
            .from('reminder_log')
            .insert({ user_id: opts.userId, kind: opts.kind, ref_key: opts.refKey });

        // 23505 = ya existe → este recordatorio ya se envió.
        if (logError) {
            if (logError.code === '23505') { skipped++; return false; }
            errors.push(`reminder_log ${opts.refKey}: ${logError.message}`);
            return false;
        }

        const notifType = opts.kind === 'withdrawal' ? 'withdrawal' : 'certificate';

        // 1 · Campanita dentro de la app
        const { error: notifError } = await admin.from('notifications').insert({
            user_id: opts.userId,
            title: opts.title,
            message: opts.message,
            type: notifType,
            read: false,
            metadata: { ...(opts.metadata ?? {}), reminder: true, ref_key: opts.refKey },
        });
        if (notifError) errors.push(`notifications ${opts.refKey}: ${notifError.message}`);

        // 2 · Push al teléfono · 3 · Correo (titular + hasta 2 copias)
        const headers = { 'Content-Type': 'application/json', 'x-trigger-secret': TRIGGER_SECRET };
        await Promise.allSettled([
            fetch(`${FUNCTIONS_URL}/send-push`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    userId: opts.userId,
                    title: opts.title,
                    body: opts.message,
                    url: '/dashboard',
                    data: opts.metadata ?? {},
                }),
            }),
            fetch(`${FUNCTIONS_URL}/send-email`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    userId: opts.userId,
                    type: notifType,
                    title: opts.title,
                    message: opts.message,
                    metadata: opts.metadata ?? {},
                    copyExtras: opts.copyExtras !== false,
                }),
            }),
        ]);

        sent++;
        return true;
    }

    try {
        // ── Perfiles activos con sus preferencias ──
        const { data: profiles, error: profilesError } = await admin
            .from('profiles')
            .select('id, company_name, reminder_prefs, is_admin, is_active');
        if (profilesError) throw profilesError;

        const active = (profiles ?? []).filter((p: any) => p.is_active !== false);
        const prefsById = new Map<string, ReminderPrefs>(
            active.map((p: any) => [p.id, parsePrefs(p.reminder_prefs)]),
        );
        const nameById = new Map<string, string>(
            active.map((p: any) => [p.id, p.company_name || 'la empresa']),
        );
        const adminIds = active.filter((p: any) => p.is_admin).map((p: any) => p.id);

        // ═══════════════════════════════════════════════════════════════════
        // 1 · Retiros programados próximos
        // ═══════════════════════════════════════════════════════════════════
        const maxLookahead = Math.max(
            ...[...prefsById.values()].flatMap((p) => p.withdrawal_days_before),
            1,
        );
        const horizon = addDays(today, maxLookahead);

        const { data: scheduled, error: schedError } = await admin
            .from('documents')
            .select('id, user_id, metadata')
            .eq('type', 'SCHEDULED')
            .gte('metadata->>scheduled_date', today)
            .lte('metadata->>scheduled_date', `${horizon}T23:59:59Z`);
        if (schedError) throw schedError;

        for (const doc of scheduled ?? []) {
            const meta = (doc.metadata ?? {}) as Record<string, any>;
            const status = String(meta.status ?? '').toLowerCase();
            if (status === 'cancelado' || status === 'realizado' || status === 'completado') continue;

            const rawDate = String(meta.scheduled_date ?? '');
            const date = rawDate.slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

            const prefs = prefsById.get(doc.user_id);
            if (!prefs || !prefs.enabled) continue;

            const daysUntil = daysBetween(today, date);
            if (!prefs.withdrawal_days_before.includes(daysUntil)) continue;

            const wasteType = meta.waste_type || 'residuos';
            const when =
                daysUntil === 0 ? 'hoy'
                    : daysUntil === 1 ? 'mañana'
                        : `en ${daysUntil} días`;

            await deliver({
                userId: doc.user_id,
                kind: 'withdrawal',
                refKey: `doc:${doc.id}:d${daysUntil}`,
                title: daysUntil === 0 ? '🚛 Retiro programado para hoy' : '🚛 Recordatorio de retiro',
                message: `Tu retiro de ${wasteType} está programado para ${when} (${formatDate(date)}). ` +
                    `Deja el material acopiado y accesible antes de la hora de llegada.`,
                metadata: { waste_type: wasteType, scheduled_date: date, days_until: daysUntil },
                copyExtras: prefs.copy_extra_emails,
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // 2 · Certificado de Gestión Mensual del mes anterior
        // ═══════════════════════════════════════════════════════════════════
        const [ty, tm] = today.split('-').map(Number);
        const prevMonth = tm === 1 ? 12 : tm - 1;
        const prevYear = tm === 1 ? ty - 1 : ty;
        const periodKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
        const periodLabel = `${MONTHS[prevMonth - 1]} ${prevYear}`;
        const periodStart = `${periodKey}-01T00:00:00Z`;
        const periodEnd = `${ty}-${String(tm).padStart(2, '0')}-01T00:00:00Z`;

        const candidates = active.filter((p: any) => {
            const prefs = prefsById.get(p.id)!;
            return prefs.enabled && prefs.certificate_day === dayOfMonth;
        });

        if (candidates.length > 0) {
            const ids = candidates.map((p: any) => p.id);

            const { data: periodDocs, error: docsError } = await admin
                .from('documents')
                .select('user_id, type, verified, created_at')
                .in('user_id', ids)
                // 'CR' es el código anterior del certificado de transporte;
                // se lee por el histórico. Ver utils/documentTypes.ts.
                .in('type', ['CT', 'CR', 'COMMUNITY_CR', 'CGM'])
                .gte('created_at', periodStart)
                .lt('created_at', periodEnd);
            if (docsError) throw docsError;

            const hasCgm = new Set<string>();
            const hasCr = new Set<string>();
            for (const d of periodDocs ?? []) {
                if (d.type === 'CGM') hasCgm.add(d.user_id);
                else hasCr.add(d.user_id);
            }

            const pendingCompanies: string[] = [];

            for (const p of candidates) {
                const userId = p.id as string;

                if (hasCgm.has(userId)) {
                    await deliver({
                        userId,
                        kind: 'certificate',
                        refKey: `cgm:${periodKey}:ready`,
                        title: '📄 Certificado mensual disponible',
                        message: `Tu Certificado de Gestión Mensual de ${periodLabel} ya está disponible ` +
                            `en la sección Documentos. Descárgalo para tu respaldo de Ley REP.`,
                        metadata: { period: periodKey, period_label: periodLabel, status: 'ready' },
                        copyExtras: prefsById.get(userId)!.copy_extra_emails,
                    });
                } else if (hasCr.has(userId)) {
                    const wasSent = await deliver({
                        userId,
                        kind: 'certificate',
                        refKey: `cgm:${periodKey}:pending`,
                        title: '⏳ Certificado mensual en preparación',
                        message: `Registramos movimientos de residuos en ${periodLabel}, pero el Certificado ` +
                            `de Gestión Mensual todavía no está emitido. Lo estamos preparando; ` +
                            `si lo necesitas con urgencia, escríbenos desde Perfil → Soporte.`,
                        metadata: { period: periodKey, period_label: periodLabel, status: 'pending' },
                        copyExtras: prefsById.get(userId)!.copy_extra_emails,
                    });
                    if (wasSent) pendingCompanies.push(nameById.get(userId) ?? userId);
                }
            }

            // Aviso interno: qué CGM quedaron sin emitir.
            if (pendingCompanies.length > 0) {
                for (const adminId of adminIds) {
                    await deliver({
                        userId: adminId,
                        kind: 'certificate',
                        refKey: `cgm:${periodKey}:admin`,
                        title: `⚠️ ${pendingCompanies.length} CGM sin emitir · ${periodLabel}`,
                        message: `Faltan certificados de gestión mensual de ${periodLabel} para: ` +
                            `${pendingCompanies.slice(0, 10).join(', ')}` +
                            `${pendingCompanies.length > 10 ? ` y ${pendingCompanies.length - 10} más` : ''}.`,
                        metadata: { period: periodKey, pending: pendingCompanies.length, audience: 'admin' },
                        copyExtras: false,
                    });
                }
            }
        }

        return new Response(
            JSON.stringify({ ok: true, date: today, sent, skipped, errors }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
    } catch (err: any) {
        console.error('[send-reminders]', err);
        return new Response(
            JSON.stringify({ ok: false, error: err.message ?? 'error', sent, skipped, errors }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
});
