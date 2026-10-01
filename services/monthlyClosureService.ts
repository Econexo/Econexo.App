// Lecturas y escrituras de Supabase para el cierre mensual.
// La lógica de qué va a cada gestor vive en utils/monthlyClosure.ts.

import { supabase } from './supabase';
import {
  closureTotalKg,
  staleDestinationIds,
  type ClosureCompany,
  type CompanyInfo,
  type StoredClosure,
} from '../utils/monthlyClosure';

export interface ClosureDestination {
  id: string;
  name: string;
  rut: string;
  resolution: string;
}

/** Nombre y RUT de cada empresa: registradas (profiles) y manuales. */
export async function fetchCompanyDirectory(): Promise<Record<string, CompanyInfo>> {
  const [perfiles, manuales] = await Promise.all([
    supabase.from('profiles').select('id, company_name, rut'),
    supabase.from('documents').select('id, metadata').eq('type', 'UNREGISTERED_CLIENT'),
  ]);
  if (perfiles.error) throw perfiles.error;
  if (manuales.error) throw manuales.error;

  const directory: Record<string, CompanyInfo> = {};
  for (const p of perfiles.data ?? []) {
    directory[p.id] = { name: p.company_name || 'Sin nombre', rut: p.rut || '', isManual: false };
  }
  for (const d of manuales.data ?? []) {
    directory[d.id] = {
      name: d.metadata?.company_name || 'Sin nombre',
      rut: d.metadata?.rut || '',
      isManual: true,
    };
  }
  return directory;
}

export async function fetchActiveDestinations(): Promise<ClosureDestination[]> {
  const { data, error } = await supabase
    .from('cgm_destinations')
    .select('id, name, rut, resolution')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as ClosureDestination[];
}

export async function fetchClosures(): Promise<StoredClosure[]> {
  const { data, error } = await supabase
    .from('monthly_closures')
    .select('*')
    .order('period', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, total_kg: Number(r.total_kg) })) as StoredClosure[];
}

/**
 * Guarda el cierre del mes: un registro por gestor con empresas asignadas.
 * Primero los upserts; solo si todos salen bien se borran los gestores que
 * ya no reciben nada, para no dejar el mes a medio cerrar.
 */
export async function saveClosure({ period, groups, destinations, fingerprint, existing }: {
  period: string;
  groups: Map<string, ClosureCompany[]>;
  destinations: ClosureDestination[];
  fingerprint: string;
  existing: StoredClosure[];
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const names = new Map(destinations.map(d => [d.id, d.name]));

  const rows = [...groups].map(([destinationId, companies]) => ({
    period,
    destination_id: destinationId,
    destination_name: names.get(destinationId) ?? 'Gestor',
    companies,
    total_kg: closureTotalKg(companies),
    fingerprint,
    closed_by: user?.id ?? null,
    closed_at: new Date().toISOString(),
  }));
  if (rows.length === 0) throw new Error('No hay empresas asignadas a ningún gestor.');

  const { error: upsertError } = await supabase
    .from('monthly_closures')
    .upsert(rows, { onConflict: 'period,destination_id' });
  if (upsertError) throw upsertError;

  const stale = staleDestinationIds(existing, period, [...groups.keys()]);
  if (stale.length > 0) {
    const { error: deleteError } = await supabase
      .from('monthly_closures')
      .delete()
      .eq('period', period)
      .in('destination_id', stale);
    if (deleteError) throw deleteError;
  }
}
