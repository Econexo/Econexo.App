// Asistente de declaración: revisa lo gestionado en el año y dice si la empresa
// debe declarar en RETC / Ventanilla Única, SINADER o SIDREP.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA DISTINCIÓN QUE DECIDE TODO: PRODUCTOR vs GENERADOR
//
// La Ley 20.920 (REP) obliga a quien INTRODUCE productos prioritarios al
// mercado: importa, fabrica o vende bajo marca propia productos envasados. Una
// empresa que solo BOTA envases —un mero generador— no cae bajo ese régimen por
// mucho cartón que acumule.
//
// El umbral de 300 kg anuales de envases exime de METAS a las microempresas
// PRODUCTORAS. No es un umbral para generadores, y no convierte a nadie en
// productor. Confundir las dos figuras es el error fácil aquí, y llevaría a
// decirle a un cliente que debe declarar cuando no le corresponde.
//
// Los residuos no peligrosos son harina de otro costal: se declaran en SINADER
// por establecimiento generador, y ahí sí hay un umbral de kilos — 12 toneladas
// al año.
//
// ─────────────────────────────────────────────────────────────────────────────
// LO QUE ESTE MÓDULO PUEDE Y NO PUEDE SABER
//
// La app conoce los kilos que EcoNexo retiró. Eso alcanza para SINADER, que se
// mide justamente sobre residuos generados. NO alcanza para REP: los kilos
// puestos en el mercado son un dato que la empresa tiene y la app no, así que
// se piden aparte y, mientras no estén, no se afirma nada.
//
// Los umbrales son constantes con nombre para poder corregirlos cuando cambie
// la norma.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeMaterialType } from './materialCalculations';
import { mapToRepCategory } from './materialMapping';

/**
 * SINADER — declaración obligatoria de residuos no peligrosos.
 * Se declara por establecimiento generador que supere este volumen anual.
 */
export const SINADER_MANDATORY_KG = 12_000;

/**
 * DS 12/2021 — Envases y embalajes. Un productor que introduce al mercado
 * menos de esto queda exento de METAS de recuperación (sigue siendo productor).
 * Se mide sobre kilos PUESTOS EN EL MERCADO, no sobre residuos generados.
 */
export const PACKAGING_PRODUCER_TARGET_EXEMPTION_KG = 300;

/** A partir de qué fracción del umbral se avisa de que se está acercando. */
const NEAR_THRESHOLD_RATIO = 0.8;

export type DeclarationSystem = 'retc_vu' | 'sinader' | 'sidrep';

export type Verdict =
  | 'obligatorio'      // supera el umbral: hay que declarar
  | 'cerca'            // se acerca al umbral dentro del mismo año
  | 'no_obligatorio'   // bajo el umbral, con los datos disponibles
  | 'no_aplica'        // el régimen no alcanza a esta empresa
  | 'faltan_datos';    // hace falta un dato que la app no tiene

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
  /** Qué haría que esto cambiara en el futuro. */
  trigger?: string;
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
  /**
   * ¿La empresa importa, fabrica o vende bajo marca propia productos
   * envasados? Es lo que la convierte en productor prioritario bajo la Ley REP.
   */
  isPriorityProducer?: boolean;
  /**
   * Kilos de envases y embalajes que la empresa puso en el mercado en el año.
   * Solo la empresa lo sabe; la app no puede deducirlo de los retiros.
   */
  packagingPlacedOnMarketKg?: number | null;
}

export interface DeclarationSummary {
  year: number;
  findings: DeclarationFinding[];
  /** Envases y embalajes GESTIONADOS. Referencia, no base de la obligación REP. */
  packagingKg: number;
  hazardousKg: number;
  nonHazardousKg: number;
  totalKg: number;
  /** Cuántos hallazgos exigen declarar o están cerca de exigirlo. */
  actionableCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const qtyOf = (item: any) => Number(item?.quantity) || 0;

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
  if (measured >= threshold) return 'obligatorio';
  if (measured >= threshold * NEAR_THRESHOLD_RATIO) return 'cerca';
  return 'no_obligatorio';
}

const kg = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} kg`;
const ton = (n: number) => `${(n / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} t`;

/**
 * Evalúa las reglas de declaración sobre los residuos de un año.
 * Devuelve un hallazgo por régimen, ordenado por urgencia.
 */
export function evaluateDeclarations(
  { items, year, isPriorityProducer = false, packagingPlacedOnMarketKg = null }: DeclarationInput,
): DeclarationSummary {
  const all = items ?? [];

  const packagingKg = sumBy(all, isPackaging);
  const hazardousKg = sumBy(all, i => normalizeMaterialType(i) === 'Peligrosos');
  const totalKg = sumBy(all, () => true);
  const nonHazardousKg = round2(totalKg - hazardousKg);

  const findings: DeclarationFinding[] = [];

  // ── 1 · SINADER — residuos no peligrosos ───────────────────────────────
  // El único régimen que se puede evaluar con lo que la app sabe, porque se
  // mide justamente sobre residuos generados.
  const sinaderVerdict = verdictFor(nonHazardousKg, SINADER_MANDATORY_KG);
  const faltante = round2(SINADER_MANDATORY_KG - nonHazardousKg);

  findings.push({
    id: 'sinader_no_peligrosos',
    system: 'sinader',
    systemLabel: SYSTEM_LABELS.sinader,
    title: 'Residuos no peligrosos',
    verdict: sinaderVerdict,
    measuredKg: nonHazardousKg,
    thresholdKg: SINADER_MANDATORY_KG,
    progress: Math.round((nonHazardousKg / SINADER_MANDATORY_KG) * 100),
    summary:
      nonHazardousKg > 0
        ? `Generaste ${kg(nonHazardousKg)} de residuos no peligrosos en ${year}. El umbral de declaración obligatoria son ${ton(SINADER_MANDATORY_KG)} al año.`
        : `Sin residuos no peligrosos registrados en ${year}.`,
    action:
      sinaderVerdict === 'obligatorio'
        ? `Superaste las ${ton(SINADER_MANDATORY_KG)} anuales: corresponde declarar en el módulo SINADER de Ventanilla Única RETC. Tus certificados de transporte son el respaldo de las cantidades.`
        : sinaderVerdict === 'cerca'
          ? `Te faltan ${kg(faltante)} para las ${ton(SINADER_MANDATORY_KG)} anuales. Conviene ir dejando los antecedentes ordenados por si cierras el año por encima.`
          : `Estás muy por debajo de las ${ton(SINADER_MANDATORY_KG)} anuales: no corresponde declarar de forma obligatoria. Puedes hacerlo de manera voluntaria si te sirve como respaldo comercial.`,
    basis:
      `SINADER (Sistema Nacional de Declaración de Residuos), módulo de Ventanilla Única RETC. ` +
      `Se declara por establecimiento generador que supere ${ton(SINADER_MANDATORY_KG)} anuales de residuos no peligrosos.`,
    trigger:
      sinaderVerdict === 'obligatorio'
        ? undefined
        : `Pasaría a ser obligatorio si tu generación anual supera las ${ton(SINADER_MANDATORY_KG)}.`,
  });

  // ── 2 · Ley REP — envases y embalajes ──────────────────────────────────
  // Solo alcanza a los productores prioritarios. Un generador no entra, por
  // muchos kilos de cartón que bote.
  if (!isPriorityProducer) {
    findings.push({
      id: 'ds12_envases',
      system: 'retc_vu',
      systemLabel: SYSTEM_LABELS.retc_vu,
      title: 'Envases y embalajes · Ley REP',
      verdict: 'no_aplica',
      measuredKg: packagingKg,
      thresholdKg: null,
      progress: 0,
      summary:
        `La Ley REP obliga a quien introduce productos prioritarios al mercado. ` +
        `Tu empresa figura como generadora, no como productora, así que este régimen no la alcanza.`,
      action:
        `No corresponde declarar por Ley REP. Los ${kg(packagingKg)} de envases que gestionaste en ${year} ` +
        `son residuos generados, no productos puestos en el mercado: no cuentan para esta obligación.`,
      basis:
        'Ley 20.920 y DS 12/2021. La obligación recae sobre quien importa, fabrica o vende bajo marca ' +
        `propia productos envasados. El umbral de ${PACKAGING_PRODUCER_TARGET_EXEMPTION_KG} kg anuales exime de METAS ` +
        'a las microempresas productoras: no es un umbral para generadores ni convierte a nadie en productor.',
      trigger:
        'Pasaría a aplicar si tu empresa empieza a importar o fabricar bienes envasados. En ese caso, ' +
        `sobre ${PACKAGING_PRODUCER_TARGET_EXEMPTION_KG} kg anuales de envases puestos en el mercado quedarías sujeto a metas de recuperación.`,
    });
  } else if (packagingPlacedOnMarketKg === null || packagingPlacedOnMarketKg === undefined) {
    findings.push({
      id: 'ds12_envases',
      system: 'retc_vu',
      systemLabel: SYSTEM_LABELS.retc_vu,
      title: 'Envases y embalajes · Ley REP',
      verdict: 'faltan_datos',
      measuredKg: packagingKg,
      thresholdKg: PACKAGING_PRODUCER_TARGET_EXEMPTION_KG,
      progress: 0,
      summary:
        'Tu empresa figura como productora de productos prioritarios, así que la Ley REP sí la alcanza. ' +
        'Falta el dato que decide si además hay metas que cumplir.',
      action:
        `Registra cuántos kilos de envases y embalajes pusiste en el mercado en ${year}. ` +
        'Ese dato lo tiene tu empresa; EcoNexo solo conoce lo que retiró, que es otra cosa.',
      basis:
        `DS 12/2021. Bajo ${PACKAGING_PRODUCER_TARGET_EXEMPTION_KG} kg anuales puestos en el mercado, un productor ` +
        'queda exento de metas de recuperación, pero sigue teniendo obligación de registro.',
    });
  } else {
    const overTarget = packagingPlacedOnMarketKg >= PACKAGING_PRODUCER_TARGET_EXEMPTION_KG;
    findings.push({
      id: 'ds12_envases',
      system: 'retc_vu',
      systemLabel: SYSTEM_LABELS.retc_vu,
      title: 'Envases y embalajes · Ley REP',
      verdict: overTarget ? 'obligatorio' : 'no_obligatorio',
      measuredKg: packagingPlacedOnMarketKg,
      thresholdKg: PACKAGING_PRODUCER_TARGET_EXEMPTION_KG,
      progress: Math.round((packagingPlacedOnMarketKg / PACKAGING_PRODUCER_TARGET_EXEMPTION_KG) * 100),
      summary:
        `Pusiste ${kg(packagingPlacedOnMarketKg)} de envases en el mercado en ${year}. ` +
        `El umbral de exención de metas son ${PACKAGING_PRODUCER_TARGET_EXEMPTION_KG} kg anuales.`,
      action: overTarget
        ? 'Como productor sobre el umbral, quedas sujeto a metas de recuperación además del registro. ' +
          'Revisa tu inscripción y tu sistema de gestión en Ventanilla Única RETC.'
        : `Bajo los ${PACKAGING_PRODUCER_TARGET_EXEMPTION_KG} kg quedas exento de METAS de recuperación, ` +
          'pero mantienes la obligación de registro como productor.',
      basis:
        `DS 12/2021 — Envases y Embalajes. El umbral de ${PACKAGING_PRODUCER_TARGET_EXEMPTION_KG} kg anuales ` +
        'se mide sobre kilos puestos en el mercado, no sobre residuos generados.',
    });
  }

  // ── 3 · SIDREP — residuos peligrosos ───────────────────────────────────
  // Sin umbral: el régimen no depende del volumen.
  findings.push({
    id: 'sidrep_peligrosos',
    system: 'sidrep',
    systemLabel: SYSTEM_LABELS.sidrep,
    title: 'Residuos peligrosos',
    verdict: hazardousKg > 0 ? 'obligatorio' : 'no_aplica',
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
        : 'No generas residuos peligrosos: este régimen no te alcanza.',
    basis:
      'SIDREP (Sistema de Declaración de Residuos Peligrosos), DS 148/2003. ' +
      'Se aplica con cualquier cantidad, porque el régimen no depende del volumen.',
    trigger:
      hazardousKg > 0
        ? undefined
        : 'Pasaría a aplicar en cuanto generes cualquier cantidad de residuo peligroso.',
  });

  // Lo que exige acción primero.
  const orden: Record<Verdict, number> = {
    obligatorio: 0, cerca: 1, faltan_datos: 2, no_obligatorio: 3, no_aplica: 4,
  };
  findings.sort((a, b) => orden[a.verdict] - orden[b.verdict]);

  return {
    year,
    findings,
    packagingKg,
    hazardousKg,
    nonHazardousKg,
    totalKg,
    actionableCount: findings.filter(
      f => f.verdict === 'obligatorio' || f.verdict === 'cerca' || f.verdict === 'faltan_datos',
    ).length,
  };
}
