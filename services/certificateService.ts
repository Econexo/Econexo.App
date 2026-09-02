// Emisión de Certificados de Recepción (CR).
//
// Existía duplicada en dos sitios —el botón del Dashboard y el panel Admin— y
// habían derivado: el Admin numeraba correlativo (CR N°:001) y el Dashboard
// usaba un número al azar (CR-4837) que además podía repetirse. Tampoco
// guardaban los mismos metadatos ni mandaban el mismo aviso.
//
// Ahora los dos llaman aquí. Cualquier cambio en la emisión se hace en un solo
// lugar y sale igual desde ambos botones.

import { supabase } from './supabase';
import { createNotification } from './notificationService';
import { summarizeByDestination } from '../utils/wasteClassification';

export interface CertificateWasteItem {
  waste_type: string;
  description: string;
  quantity: number;
  unit: string;
  /** 'valorizacion' | 'relleno_sanitario' | 'rescon'. Si falta se infiere del material. */
  destination?: string;
}

export interface CertificateClient {
  id: string;
  company_name: string;
  rut: string;
  address?: string;
  full_name?: string;
  company_email?: string;
  is_unregistered?: boolean;
}

export interface IssueCertificateParams {
  client: CertificateClient;
  items: CertificateWasteItem[];
  /** 'YYYY-MM-DD'. Vacío = hoy. */
  withdrawalDate?: string;
  /** De dónde salió la emisión. Solo para trazabilidad en los metadatos. */
  issuedFrom: 'dashboard' | 'admin';
  /** El Dashboard permite corregir los datos de la empresa al emitir. */
  updateClientProfile?: boolean;
}

export interface IssueCertificateResult {
  certNumber: string;
  pointsAwarded: number;
  totalKg: number;
}

/** Puntos por kilo. Solo se premia lo que efectivamente se valoriza. */
const POINTS_PER_KG = 2;

/**
 * Siguiente número correlativo de CR. Lee los existentes y toma el máximo + 1.
 *
 * No es a prueba de emisiones simultáneas: dos operarios emitiendo en el mismo
 * segundo pueden obtener el mismo número. Con un solo operario a la vez no pasa;
 * si algún día son varios, esto tiene que moverse a una secuencia de Postgres.
 */
export async function nextCertificateNumber(): Promise<string> {
  const { data } = await supabase.from('documents').select('metadata, title').eq('type', 'CR');

  let nextNum = 1;
  if (data && data.length > 0) {
    const nums = data
      .map((d: any) => {
        const match = (d.metadata?.cert_number || d.title || '').match(/CR N°:(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n: number) => n > 0);
    if (nums.length > 0) nextNum = Math.max(...nums) + 1;
  }

  return `CR N°:${String(nextNum).padStart(3, '0')}`;
}

/** Fecha del retiro como ISO. Se fija a mediodía local para que no se corra de día. */
function withdrawalToIso(withdrawalDate?: string): string {
  return withdrawalDate
    ? new Date(`${withdrawalDate}T12:00:00`).toISOString()
    : new Date().toISOString();
}

/**
 * Emite un CR: genera el PDF, guarda el documento, otorga Eco-Puntos y avisa
 * al cliente. Lanza si falla el guardado; el resto de pasos son best-effort y
 * no tumban la emisión.
 */
export async function issueReceptionCertificate(
  { client, items, withdrawalDate, issuedFrom, updateClientProfile }: IssueCertificateParams,
): Promise<IssueCertificateResult> {
  if (!client) throw new Error('Falta la empresa destino.');
  if (!items || items.length === 0) throw new Error('Debes agregar al menos un ítem.');

  const certNumber = await nextCertificateNumber();
  const docTitle = `Certificado de Recepción ${certNumber}`;

  // El Dashboard deja corregir los datos de la empresa en el mismo formulario.
  if (updateClientProfile && !client.is_unregistered) {
    await supabase.from('profiles').update({
      company_name: client.company_name,
      rut: client.rut,
      address: client.address,
    }).eq('id', client.id);
  }

  // PDF. Se importa aquí para no arrastrar el motor de PDF al bundle inicial.
  const { generateCR } = await import('./pdfGenerator');
  generateCR(
    {
      company_name: client.company_name,
      rut: client.rut,
      address: client.address || 'Chile',
      contact_name: client.full_name || '',
      contact_email: client.company_email || '',
    },
    items as any,
    certNumber,
    'save',
    withdrawalDate,
  );

  // Los clientes no registrados no tienen cuenta: el documento queda a nombre
  // del operario que lo emitió, con el id del cliente en los metadatos.
  const isUnregistered = client.is_unregistered === true;
  const ownerId = isUnregistered
    ? (await supabase.auth.getUser()).data.user?.id
    : client.id;

  const totals = summarizeByDestination(items);

  const { error } = await supabase.from('documents').insert([{
    user_id: ownerId,
    title: docTitle,
    type: 'CR',
    verified: true,
    created_at: withdrawalToIso(withdrawalDate),
    metadata: {
      cert_number: certNumber,
      generated_by: issuedFrom === 'admin' ? 'Admin Panel' : 'Dashboard Operator',
      waste_details: items,
      withdrawal_date: withdrawalDate,
      // Se guarda el resumen ya calculado para no tener que recorrer los ítems
      // cada vez que alguien abre el panel.
      totals: {
        total_kg: totals.total,
        valorizado_kg: totals.valorizacion,
        relleno_sanitario_kg: totals.relleno_sanitario,
        rescon_kg: totals.rescon,
      },
      unregistered_client_id: isUnregistered ? client.id : undefined,
      address: isUnregistered ? (client.address || '') : undefined,
    },
  }]);

  if (error) throw error;

  // Eco-Puntos solo por lo valorizado: enterrar basura no se premia.
  const pointsAwarded = Math.round(totals.valorizacion * POINTS_PER_KG);

  if (!isUnregistered && pointsAwarded > 0) {
    await supabase.rpc('increment_points', {
      user_id_param: client.id,
      amount_param: pointsAwarded,
    });
    await supabase.from('points_transactions').insert([{
      user_id: client.id,
      amount: pointsAwarded,
      reason: `Generación de Certificado ${certNumber}`,
    }]);
  }

  if (!isUnregistered) {
    await createNotification({
      userId: client.id,
      title: '🏆 Nuevo Certificado Emitido',
      message: `Se ha generado el ${certNumber} por ${totals.total.toLocaleString('es-CL')} kg` +
        (pointsAwarded > 0 ? `. Has recibido ${pointsAwarded} Eco-Puntos.` : '.'),
      type: 'certificate',
      metadata: {
        cert_number: certNumber,
        points: pointsAwarded,
        total_kg: totals.total,
        valorizado_kg: totals.valorizacion,
      },
    });
  }

  return { certNumber, pointsAwarded, totalKg: totals.total };
}
