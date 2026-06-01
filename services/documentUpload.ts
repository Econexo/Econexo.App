import { supabase } from './supabase';
import { createNotification } from './notificationService';

export interface UploadScanParams {
  pdf: Blob;
  title: string;
  type: string;
  clientId: string;
  createdAt: string; // ISO date string (document date chosen by admin)
  source: 'gestor' | 'econexo';
}

/** Uploads the scanned PDF to the private 'scanned-docs' bucket under the client's
 *  folder, creates the row via the create_admin_document RPC (assigning it to the
 *  client), and notifies the client. content_url stores the Storage PATH (not a
 *  public URL); downloads use signed URLs. Requires an admin session (enforced by RLS). */
export async function uploadScannedDocument(
  { pdf, title, type, clientId, createdAt, source }: UploadScanParams,
): Promise<void> {
  const timestamp = Date.now();
  const filePath = `${clientId}/${timestamp}_scan.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('scanned-docs')
    .upload(filePath, pdf, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;

  const { error: rpcError } = await supabase.rpc('create_admin_document', {
    _user_id: clientId,
    _title: title,
    _type: type,
    _content_url: filePath,
    _created_at: createdAt,
    _metadata: { source: 'scanner', uploaded_by: 'admin', upload_source: source, mime_type: 'application/pdf' },
  });
  if (rpcError) throw rpcError;

  await createNotification({
    userId: clientId,
    title: '📄 Nuevo Documento Disponible',
    message: `El administrador ha subido un nuevo documento escaneado: "${title}".`,
    type: 'document',
    metadata: { file_name: title, document_type: type },
  });
}
