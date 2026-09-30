// Carga de documentos a varias empresas de una vez.
//
// Reemplaza al bucle de una sola empresa que vivía dentro de Admin.tsx. La regla
// y el porqué de una copia por empresa están en utils/bulkUpload.ts.
//
// Una empresa que falle no detiene a las demás: se registra y se sigue. Al final
// el panel muestra qué se subió y qué no, para poder reintentar solo eso.

import { supabase } from './supabase';
import { createNotification } from './notificationService';
import { buildUploadPlan, UploadTargetCompany } from '../utils/bulkUpload';

import { localDayToISO } from '../utils/dateRange';
export interface BulkUploadParams {
  files: File[];
  companies: UploadTargetCompany[];
  /** Tipo de documento elegido en el modal (declaration, cdf, guia, …). */
  type: string;
  /** Origen: lo usa getDocEmisor para archivar el documento en su sección. */
  source: 'gestor' | 'econexo';
  /** Fecha del documento, 'YYYY-MM-DD'. */
  documentDate: string;
  onProgress?: (done: number, total: number) => void;
}

export interface BulkUploadFailure {
  company: string;
  file: string;
  message: string;
}

export interface BulkUploadResult {
  uploaded: number;
  total: number;
  failures: BulkUploadFailure[];
  /** Cuántas empresas recibieron al menos un documento. */
  companiesReached: number;
}

export async function bulkUploadDocuments(
  { files, companies, type, source, documentDate, onProgress }: BulkUploadParams,
): Promise<BulkUploadResult> {
  if (files.length === 0) throw new Error('Selecciona al menos un archivo.');
  if (companies.length === 0) throw new Error('Selecciona al menos una empresa.');

  const plan = buildUploadPlan(files, companies);
  const createdAt = localDayToISO(documentDate);
  const failures: BulkUploadFailure[] = [];
  // Nombres subidos por empresa: sirven para mandar un solo aviso por empresa.
  const uploadedByCompany = new Map<string, { company: UploadTargetCompany; titles: string[] }>();
  let done = 0;

  for (const { company, file, storagePath } of plan) {
    try {
      const { error: uploadError } = await supabase.storage
        .from('scanned-docs')
        .upload(storagePath, file, { contentType: file.type || 'application/octet-stream' });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.rpc('create_admin_document', {
        _user_id: company.id,
        _title: file.name,
        _type: type,
        _content_url: storagePath,
        _created_at: createdAt,
        _metadata: {
          original_name: file.name,
          size: file.size,
          mime_type: file.type,
          uploaded_by: 'admin',
          source,
          // Marca de que vino de una carga masiva, con cuántas empresas la
          // recibieron: útil para entender después por qué el mismo documento
          // aparece en varias cuentas.
          bulk_upload: plan.length > 1 ? { companies: companies.length, files: files.length } : undefined,
        },
      });
      if (dbError) throw dbError;

      const entry = uploadedByCompany.get(company.id) || { company, titles: [] };
      entry.titles.push(file.name);
      uploadedByCompany.set(company.id, entry);
    } catch (err: any) {
      failures.push({
        company: company.company_name,
        file: file.name,
        message: err?.message || 'Error desconocido',
      });
    }
    done++;
    onProgress?.(done, plan.length);
  }

  // Un aviso por empresa, no uno por archivo: subir doce documentos no debe
  // dejarle doce notificaciones al cliente.
  for (const { company, titles } of uploadedByCompany.values()) {
    const message = titles.length === 1
      ? `El administrador ha subido un nuevo documento: "${titles[0]}".`
      : `El administrador ha subido ${titles.length} documentos nuevos.`;
    await createNotification({
      userId: company.id,
      title: '📄 Nuevo Documento Disponible',
      message,
      type: 'document',
      metadata: { file_name: titles[0], document_type: type, files_count: titles.length },
    }).catch(() => { /* el aviso es best-effort: el documento ya está guardado */ });
  }

  return {
    uploaded: plan.length - failures.length,
    total: plan.length,
    failures,
    companiesReached: uploadedByCompany.size,
  };
}
