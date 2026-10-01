import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { formatKg } from '../../utils/formatKg';
import { periodLabel } from '../../utils/monthlyBreakdown';
import { DESTINATION_LABELS } from '../../utils/wasteClassification';
import {
  buildClosureCompanies,
  closureTotalKg,
  defaultAssignment,
  groupByDestination,
  outsideClosureKg,
  snapshotFingerprint,
  type Assignment,
  type ClosureDoc,
  type CompanyInfo,
  type StoredClosure,
} from '../../utils/monthlyClosure';
import {
  fetchActiveDestinations,
  fetchClosures,
  fetchCompanyDirectory,
  saveClosure,
  type ClosureDestination,
} from '../../services/monthlyClosureService';
import { downloadClosurePdf, downloadClosureXls } from '../../services/closureExport';

const NONE = '';

const MonthlyClosure: React.FC<{ docs: ClosureDoc[]; period: string }> = ({ docs, period }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [directory, setDirectory] = useState<Record<string, CompanyInfo>>({});
  const [destinations, setDestinations] = useState<ClosureDestination[]>([]);
  const [closures, setClosures] = useState<StoredClosure[]>([]);
  const [assignment, setAssignment] = useState<Assignment>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [dir, dests, stored] = await Promise.all([
        fetchCompanyDirectory(), fetchActiveDestinations(), fetchClosures(),
      ]);
      setDirectory(dir);
      setDestinations(dests);
      setClosures(stored);
    } catch (err) {
      console.error('Error loading monthly closure:', err);
      setLoadError(true);
      toast.error('No se pudo cargar el cierre.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const companies = useMemo(
    () => buildClosureCompanies(docs, directory, period),
    [docs, directory, period],
  );
  const fingerprint = useMemo(() => snapshotFingerprint(companies), [companies]);
  const outside = useMemo(() => outsideClosureKg(docs, period), [docs, period]);
  const periodClosures = useMemo(
    () => closures.filter(c => c.period === period),
    [closures, period],
  );

  // Al cambiar de mes o terminar de cargar, precarga el gestor del último cierre.
  useEffect(() => {
    setAssignment(defaultAssignment(companies, closures, destinations.map(d => d.id), period));
  }, [companies, closures, destinations, period]);

  const groups = useMemo(() => groupByDestination(companies, assignment), [companies, assignment]);
  const excluded = companies.filter(c => !assignment[c.companyId]);

  const closedAt = periodClosures[0]?.closed_at;
  const changedSinceClose = periodClosures.length > 0 && periodClosures[0].fingerprint !== fingerprint;

  const handleClose = async () => {
    if (groups.size === 0) { toast.warning('Asigna al menos una empresa a un gestor.'); return; }
    if (excluded.length > 0) {
      const ok = await confirm({
        title: 'Empresas sin gestor',
        message: `${excluded.map(c => c.name).join(', ')} no se incluirán en el cierre de ${periodLabel(period)}. ¿Continuar?`,
        confirmLabel: 'Cerrar mes',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await saveClosure({ period, groups, destinations, fingerprint, existing: closures });
      setClosures(await fetchClosures());
      toast.success(`Cierre de ${periodLabel(period)} guardado.`);
    } catch (err: any) {
      toast.error('No se pudo guardar el cierre: ' + (err?.message || 'desconocido'));
    } finally {
      setSaving(false);
    }
  };

  const destinationFor = (c: StoredClosure) =>
    destinations.find(d => d.id === c.destination_id) ?? { name: c.destination_name, rut: '', resolution: '' };

  const card = 'bg-white/70 dark:bg-slate-800/70 border border-white/80 dark:border-white/10 rounded-3xl shadow-sm';

  if (loading) {
    return <div className={`${card} p-6 text-sm text-gray-500 text-center`}>Cargando cierre…</div>;
  }
  if (loadError) {
    return (
      <div className={`${card} p-6 text-sm text-center space-y-3`}>
        <p className="text-gray-600 dark:text-gray-300">No se pudo cargar el cierre.</p>
        <button onClick={load} className="px-4 h-10 rounded-2xl bg-primary text-white font-bold">Reintentar</button>
      </div>
    );
  }
  if (destinations.length === 0) {
    return (
      <div className={`${card} p-6 text-sm text-center space-y-3`}>
        <p className="text-gray-600 dark:text-gray-300">No hay gestores activos. Agrega uno en Administración → Destinos CGM.</p>
        <button onClick={() => navigate('/admin')} className="px-4 h-10 rounded-2xl bg-primary text-white font-bold">Ir a administración</button>
      </div>
    );
  }
  if (companies.length === 0) {
    return <div className={`${card} p-6 text-sm text-gray-500 text-center`}>No hay retiros en {periodLabel(period)}.</div>;
  }

  return (
    <div className="space-y-5">
      {/* ── Estado del mes ── */}
      <div className={`${card} p-5 flex items-center justify-between gap-3`}>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">Cierre {periodLabel(period)}</p>
          {periodClosures.length === 0 && <p className="text-base font-black text-gray-900 dark:text-white">Sin cerrar</p>}
          {periodClosures.length > 0 && !changedSinceClose && (
            <p className="text-base font-black text-primary">Cerrado el {new Date(closedAt!).toLocaleDateString('es-CL')}</p>
          )}
          {changedSinceClose && (
            <p className="text-base font-black text-amber-600">Cambió desde el cierre — revisa y vuelve a cerrar</p>
          )}
        </div>
        <button
          onClick={handleClose}
          disabled={saving || groups.size === 0}
          className="shrink-0 h-11 px-5 rounded-2xl bg-primary text-white text-sm font-black shadow-sm active:scale-95 transition-transform disabled:opacity-40"
        >
          {saving ? 'Guardando…' : periodClosures.length > 0 ? 'Volver a cerrar' : 'Cerrar mes'}
        </button>
      </div>

      {/* ── Empresas ── */}
      <div className={`${card} divide-y divide-gray-100 dark:divide-white/5`}>
        {companies.map(c => (
          <div key={c.companyId} className="p-4 space-y-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setExpanded(expanded === c.companyId ? null : c.companyId)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-sm font-black text-gray-900 dark:text-white truncate">
                  {c.name}{c.isManual && <span className="ml-1 text-[10px] font-bold text-gray-400">(Manual)</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {c.rut || 'Sin RUT'} · {formatKg(c.totalKg)} kg · {c.certNumbers.length} CT
                </p>
              </button>
              <select
                value={assignment[c.companyId] ?? NONE}
                onChange={e => setAssignment({ ...assignment, [c.companyId]: e.target.value || null })}
                aria-label={`Gestor de ${c.name}`}
                className="w-36 shrink-0 h-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-xl px-2 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-primary"
              >
                <option value={NONE}>No incluir</option>
                {destinations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {expanded === c.companyId && (
              <ul className="pl-1 space-y-1">
                {c.materials.map(m => (
                  <li key={m.material} className="flex justify-between text-xs text-gray-600 dark:text-gray-300">
                    <span>{m.material}</span><span className="font-bold">{formatKg(m.kg)} kg</span>
                  </li>
                ))}
                {c.outside?.map(o => (
                  <li key={`${o.destination}-${o.material}`} className="flex justify-between text-xs text-gray-400">
                    <span>{o.material} · {DESTINATION_LABELS[o.destination]} (no va al gestor)</span>
                    <span>{formatKg(o.kg)} kg</span>
                  </li>
                ))}
                {c.certNumbers.length > 0 && (
                  <li className="text-[11px] text-gray-400 pt-1">{c.certNumbers.join(', ')}</li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* ── Resumen por gestor (lo que se va a guardar) ── */}
      <div className={`${card} p-5 space-y-2`}>
        <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">Por gestor</p>
        {[...groups].map(([destId, list]) => (
          <div key={destId} className="flex justify-between text-sm">
            <span className="font-bold text-gray-900 dark:text-white">
              {destinations.find(d => d.id === destId)?.name ?? 'Gestor'} · {list.length} empresa(s)
            </span>
            <span className="font-black">{formatKg(closureTotalKg(list))} kg</span>
          </div>
        ))}
        {excluded.length > 0 && (
          <p className="text-xs text-gray-400">{excluded.length} empresa(s) sin incluir</p>
        )}
        {(outside.rescon > 0 || outside.relleno_sanitario > 0) && (
          <p className="text-xs text-gray-400">
            Solo se envía lo valorizado. Fuera del cierre:{' '}
            {[
              outside.rescon > 0 && `${formatKg(outside.rescon)} kg RESCON`,
              outside.relleno_sanitario > 0 && `${formatKg(outside.relleno_sanitario)} kg relleno sanitario`,
            ].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/* ── Descargas del cierre guardado ── */}
      {periodClosures.length > 0 && (
        <div className={`${card} p-5 space-y-3`}>
          <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">Descargar cierre guardado</p>
          {periodClosures.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {c.destination_name} · {formatKg(c.total_kg)} kg
              </span>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => downloadClosureXls(c.destination_name, c.period, c.companies)}
                  className="h-9 px-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 text-xs font-bold"
                >
                  Excel
                </button>
                <button
                  onClick={() => downloadClosurePdf(destinationFor(c), c.period, c.companies, c.closed_at)}
                  className="h-9 px-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold"
                >
                  PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MonthlyClosure;
