// Asistente de declaración: revisa lo gestionado en el año y dice qué
// declaraciones conviene revisar en RETC / Ventanilla Única, SINADER y SIDREP.
//
// ─────────────────────────────────────────────────────────────────────────────
// LO QUE ESTE MÓDULO SÍ PUEDE SABER Y LO QUE NO
//
// La app conoce los kilos que EcoNexo retiró y gestionó. La obligación REP, en
// cambio, se mide por los kilos que la empresa PONE EN EL MERCADO, que es un
// dato que la app no tiene. Lo gestionado es una aproximación por abajo: sirve
// para levantar la mano cuando se cruza un umbral, no para dar por cumplido ni
// por descartado nada.
//
// Por eso todos los veredictos están redactados como "corresponde revisar" y
// nunca como "usted debe declarar". Es orientación, no asesoría legal.
//
// Los umbrales son constantes con nombre justamente para poder corregirlos
// cuando cambie la norma o cuando se confirmen con la autoridad.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeMaterialType } from './materialCalculations';
import { mapToRepCategory } from './materialMapping';

/** Envases y embalajes: sobre este volumen anual corresponde declarar de forma
 *  voluntaria, sin obligación de cumplir metas de recuperación.
 *
 *  Origen: criterio operativo indicado por EcoNexo para DS 12/2021.
 *  PENDIENTE de confirmar contra el texto vigente antes de cada temporada. */
export const PACKAGING_VOLUNTARY_KG = 300;

/** A partir de qué fracción del umbral se avisa de que se está cerca. */
const NEAR_THRESHOLD_RATIO = 0.8;

export type DeclarationSystem = 'retc_vu' | 'sinader' | 'sidrep';

export type Verdict =
  | 'corresponde'      // se cruzó el umbral o hay material que declarar
  | 'cerca'            // se acerca al umbral dentro del mismo año
  | 'no_corresponde'   // por debajo del umbral con los datos disponibles
  | 'sin_datos';       // no hay movimientos de ese tipo

export interface DeclarationFinding {
  id: string;
  system: DeclarationSystem;
  systemLabel: string;
  title: string;
  verdict: Verdict;
  /** Kilos que gatillaron (o no) la regla. */
  measuredKg: number;
  /** Umbral aplicado, si la regla tiene uno. */
  thresholdKg: number | null;
  /** Avance sobre el umbral, 0–100+. 0 si la regla no tiene umbral. */
  progress: number;
  /** Qué se midió, en una frase. */
  summary: string;
  /** Qué hacer con eso. */
  action: string;
  /** En qué se apoya la regla. Se muestra para que sea auditable. */
  basis: string;
}

export const SYSTEM_LABELS: Record<DeclarationSystem, string> = {
  retc_vu: 'RETC · Ventanilla Única',
  sinader: 'SINADER',
  sidrep: 'SIDREP',
};

export interface DeclarationInput {
  /** Ítems de residuos del año, tal como vienen en waste_details. */
  items: any[];
  year: number;
}

export interface DeclarationSummary {
  year: number;
  findings: DeclarationFinding[];
  /** Kilos de envases y embalajes gestionados (papel, plástico, vidrio, metales). */
  packagingKg: number;
  hazardousKg: number;
  nonHazardousKg: number;
  totalKg: number;
  /** Cuántos hallazgos requieren acción. */
  actionableCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const qtyOf = (item: any) => Number(item?.quantity) || 0;

/** Suma los kilos de los ítems que cumplen el predicado. */
function sumBy(items: any[], pred: (item: any) => boolean): number {
  return round2(items.reduce((acc, i) => acc + (pred(i) ? qtyOf(i) : 0), 0));
}

/** ¿Cae este residuo bajo DS 12 (envases y embalajes)? */
function isPackaging(item: any): boolean {
  const cat = mapToRepCategory(item?.waste_type ?? '', item?.description ?? '');
  return cat === 'ds12_papel' || cat === 'ds12_plastico'
    || cat === 'ds12_vidrio' || cat === 'ds12_metales';
}

function verdictFor(measured: number, threshold: number): Verdict {
  if (measured <= 0) return 'sin_datos';
  if (measured >= threshold) return 'corresponde';
  if (measured >= threshold * NEAR_THRESHOLD_RATIO) return 'cerca';
  return 'no_corresponde';
}

const kg = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} kg`;

/**
 * Evalúa las reglas de declaración sobre los residuos de un año.
 * Devuelve un hallazgo por sistema, ordenado por urgencia.
 */
export function evaluateDeclarations({ items, year }: DeclarationInput): DeclarationSummary {
  const all = items ?? [];

  const packagingKg = sumBy(all, isPackaging);
  const hazardousKg = sumBy(all, i => normalizeMaterialType(i) === 'Peligrosos');
  const totalKg = sumBy(all, () => true);
  const nonHazardousKg = round2(totalKg - hazardousKg);

  const raeeKg = sumBy(all, i => normalizeMaterialType(i) === 'Electrónicos');
  const neumaticosKg = sumBy(all, i => normalizeMaterialType(i) === 'Neumáticos');

  const findings: DeclarationFinding[] = [];

  // ── 1 · Envases y embalajes ────────────────────────────────────────────
  const packagingVerdict = verdictFor(packagingKg, PACKAGING_VOLUNTARY_KG);
  findings.push({
    id: 'ds12_envases',
    system: 'retc_vu',
    systemLabel: SYSTEM_LABELS.retc_vu,
    title: 'Envases y embalajes',
    verdict: packagingVerdict,
    measuredKg: packagingKg,
    thresholdKg: PACKAGING_VOLUNTARY_KG,
    progress: Math.round((packagingKg / PACKAGING_VOLUNTARY_KG) * 100),
    summary:
      packagingKg > 0
        ? `Gestionaste ${kg(packagingKg)} de envases y embalajes en ${year} — papel, cartón, plástico, vidrio y metales.`
        : `No hay envases ni embalajes registrados en ${year}.`,
    action:
      packagingVerdict === 'corresponde'
        ? `Superaste los ${PACKAGING_VOLUNTARY_KG} kg. Corresponde revisar la declaración voluntaria en Ventanilla Única RETC. Es declaración sin obligación de cumplir metas de recuperación.`
        : packagingVerdict === 'cerca'
          ? `Te faltan ${kg(PACKAGING_VOLUNTARY_KG - packagingKg)} para el umbral de ${PACKAGING_VOLUNTARY_KG} kg. Conviene tener los antecedentes listos por si lo cruzas antes de que cierre el año.`
          : packagingVerdict === 'sin_datos'
            ? 'Sin movimientos de envases este año: nada que declarar por esta vía todavía.'
            : `Estás bajo el umbral de ${PACKAGING_VOLUNTARY_KG} kg anuales. No corresponde declarar por este concepto con los datos que tenemos.`,
    basis:
      `Regla aplicada: ${PACKAGING_VOLUNTARY_KG} kg anuales de envases y embalajes (DS 12/2021). ` +
      'Se mide sobre lo gestionado por EcoNexo, que es una cota inferior de lo que la empresa pone en el mercado.',
  });

  // ── 2 · Residuos no peligrosos ─────────────────────────────────────────
  findings.push({
    id: 'sinader_no_peligrosos',
    system: 'sinader',
    systemLabel: SYSTEM_LABELS.sinader,
    title: 'Residuos no peligrosos',
    verdict: nonHazardousKg > 0 ? 'corresponde' : 'sin_datos',
    measuredKg: nonHazardousKg,
    thresholdKg: null,
    progress: 0,
    summary:
      nonHazardousKg > 0
        ? `${kg(nonHazardousKg)} de residuos no peligrosos gestionados en ${year}.`
        : `Sin residuos no peligrosos registrados en ${year}.`,
    action:
      nonHazardousKg > 0
        ? 'SINADER se declara una vez al año por establecimiento generador. Tus certificados de recepción son el respaldo de las cantidades.'
        : 'Nada que declarar por esta vía todavía.',
    basis:
      'SINADER (Sistema Nacional de Declaración de Residuos), módulo de Ventanilla Única RETC. ' +
      'La obligación depende del establecimiento generador, no de un umbral de kilos: por eso se levanta apenas hay movimientos.',
  });

  // ── 3 · Residuos peligrosos ────────────────────────────────────────────
  findings.push({
    id: 'sidrep_peligrosos',
    system: 'sidrep',
    systemLabel: SYSTEM_LABELS.sidrep,
    title: 'Residuos peligrosos',
    verdict: hazardousKg > 0 ? 'corresponde' : 'sin_datos',
    measuredKg: hazardousKg,
    thresholdKg: null,
    progress: 0,
    summary:
      hazardousKg > 0
        ? `${kg(hazardousKg)} de residuos peligrosos gestionados en ${year}.`
        : `Sin residuos peligrosos registrados en ${year}.`,
    action:
      hazardousKg > 0
        ? 'Los residuos peligrosos se declaran en SIDREP con su propio expediente y guías de despacho. Revisa que cada retiro tenga su documentación.'
        : 'Nada que declarar por esta vía.',
    basis:
      'SIDREP (Sistema de Declaración de Residuos Peligrosos), DS 148/2003. ' +
      'Se levanta con cualquier cantidad, porque el régimen no depende del volumen.',
  });

  // ── 4 · Otros decretos REP, informativos ───────────────────────────────
  if (raeeKg > 0) {
    findings.push({
      id: 'ds10_raee',
      system: 'retc_vu',
      systemLabel: SYSTEM_LABELS.retc_vu,
      title: 'RAEE — aparatos eléctricos y electrónicos',
      verdict: 'corresponde',
      measuredKg: raeeKg,
      thresholdKg: null,
      progress: 0,
      summary: `${kg(raeeKg)} de RAEE gestionados en ${year}.`,
      action: 'Los RAEE tienen su propio decreto (DS 10/2021) con metas y trazabilidad. Revisa si tu empresa figura como productor de estos aparatos.',
      basis: 'DS 10/2021 — Aparatos Eléctricos y Electrónicos. Se levanta al detectar movimientos de esta categoría.',
    });
  }

  if (neumaticosKg > 0) {
    findings.push({
      id: 'ds8_neumaticos',
      system: 'retc_vu',
      systemLabel: SYSTEM_LABELS.retc_vu,
      title: 'Neumáticos fuera de uso',
      verdict: 'corresponde',
      measuredKg: neumaticosKg,
      thresholdKg: null,
      progress: 0,
      summary: `${kg(neumaticosKg)} de neumáticos gestionados en ${year}.`,
      action: 'Los neumáticos se rigen por el DS 8/2021, con metas propias. Revisa si corresponde inscribirte como productor.',
      basis: 'DS 8/2021 — Neumáticos. Se levanta al detectar movimientos de esta categoría.',
    });
  }

  // Lo que requiere acción primero.
  const orden: Record<Verdict, number> = {
    corresponde: 0, cerca: 1, no_corresponde: 2, sin_datos: 3,
  };
  findings.sort((a, b) => orden[a.verdict] - orden[b.verdict]);

  return {
    year,
    findings,
    packagingKg,
    hazardousKg,
    nonHazardousKg,
    totalKg,
    actionableCount: findings.filter(f => f.verdict === 'corresponde' || f.verdict === 'cerca').length,
  };
}
