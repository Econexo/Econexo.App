// Acceso a feedback_reports. Las reglas (validación, texto del aviso) viven en
// utils/feedback.ts; aquí solo se lee, se escribe y se avisa.

import { supabase } from './supabase';
import { createNotification } from './notificationService';
import { FeedbackDraft, validateReport, validateSave, notificationMessage } from '../utils/feedback';

export interface FeedbackReport extends FeedbackDraft {
  id: string;
  company_id: string;
  status: 'draft' | 'published';
  published_at: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, company_id, period_start, period_end, period_label, summary, items, status, published_at, read_at, created_at, updated_at';

export async function listCompanyReports(companyId: string, includeDrafts: boolean): Promise<FeedbackReport[]> {
  let query = supabase
    .from('feedback_reports')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .order('period_start', { ascending: false })
    .order('created_at', { ascending: false });
  if (!includeDrafts) query = query.eq('status', 'published');
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as FeedbackReport[];
}

/** La última publicada (no el período más reciente): un informe atrasado también aparece como nuevo. */
export async function latestPublished(companyId: string): Promise<FeedbackReport | null> {
  const { data, error } = await supabase
    .from('feedback_reports')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as FeedbackReport) || null;
}

async function upsert(
  companyId: string,
  draft: FeedbackDraft,
  current: FeedbackReport | null,
  extra: Partial<FeedbackReport>,
): Promise<FeedbackReport> {
  const payload = {
    company_id: companyId,
    period_start: draft.period_start,
    period_end: draft.period_end,
    period_label: draft.period_label.trim(),
    summary: draft.summary,
    items: draft.items,
    updated_at: new Date().toISOString(),
    ...extra,
  };

  if (current) {
    const { data, error } = await supabase
      .from('feedback_reports').update(payload).eq('id', current.id).select(COLUMNS).single();
    if (error) throw error;
    return data as FeedbackReport;
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('feedback_reports')
    .insert({ ...payload, created_by: user?.id ?? null })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as FeedbackReport;
}

/**
 * Guarda sin cambiar el estado: un informe nuevo queda en borrador, uno
 * publicado sigue publicado (y por eso se valida completo, igual que al publicar).
 */
export async function saveReport(companyId: string, draft: FeedbackDraft, current: FeedbackReport | null): Promise<FeedbackReport> {
  const status = current?.status ?? 'draft';
  const invalid = validateSave(draft, status);
  if (invalid) throw new Error(invalid);
  return upsert(companyId, draft, current, { status });
}

/**
 * Publica y avisa a la empresa. Si ya estaba publicado solo actualiza el
 * contenido: no reenvía el aviso ni toca read_at.
 * Lanza Error con el mensaje de validateReport si el informe está incompleto.
 */
export async function publishReport(
  companyId: string,
  companyName: string,
  draft: FeedbackDraft,
  current: FeedbackReport | null,
): Promise<{ report: FeedbackReport; notifyFailed: boolean }> {
  const invalid = validateReport(draft);
  if (invalid) throw new Error(invalid);

  const wasPublished = current?.status === 'published';
  const report = await upsert(companyId, draft, current, {
    status: 'published',
    published_at: current?.published_at ?? new Date().toISOString(),
  });

  if (wasPublished) return { report, notifyFailed: false };

  const result = await createNotification({
    userId: companyId,
    title: 'Nueva retroalimentación de Econexo',
    message: notificationMessage(report.period_label, report.items),
    type: 'report',
    metadata: { feedback_id: report.id, company_name: companyName },
  });
  return { report, notifyFailed: !result.success };
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from('feedback_reports').delete().eq('id', id);
  if (error) throw error;
}

export async function markRead(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_feedback_read', { report_id: id });
  if (error) throw error;
}
