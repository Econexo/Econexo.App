// Plan de una carga masiva: qué archivo va a qué empresa y con qué ruta.
//
// La regla es el producto cruzado: cada archivo seleccionado se carga en cada
// empresa seleccionada. Así el mismo formulario cubre los dos casos —un archivo
// para ocho empresas, u ocho archivos para una.
//
// El archivo se copia una vez por empresa y no se comparte: la política de
// lectura del bucket 'scanned-docs' exige que la primera carpeta de la ruta sea
// el id del cliente (ver 20260531_create_scanned_docs_bucket.sql), así que un
// archivo guardado en la carpeta de otro no lo podría abrir nadie.

export interface UploadTargetCompany {
  id: string;
  company_name: string;
}

/** Lo mínimo que necesitamos de un File; así los tests no dependen del DOM. */
export interface NamedFile {
  name: string;
}

export interface UploadPair<F extends NamedFile = NamedFile> {
  company: UploadTargetCompany;
  file: F;
  /** Ruta dentro del bucket 'scanned-docs'. */
  storagePath: string;
}

/**
 * Nombre de archivo apto para Storage: sin tildes ni caracteres raros.
 * Supabase rechaza buena parte de lo que un nombre de archivo chileno trae.
 */
export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Arma los pares archivo × empresa, agrupados por empresa.
 *
 * El orden importa: al terminar el bloque de una empresa se le manda un solo
 * aviso con todos sus documentos, en vez de uno por archivo.
 *
 * Cada ruta lleva un índice además del timestamp. Sin el índice, dos archivos
 * de la misma empresa cargados dentro del mismo milisegundo caerían en la misma
 * ruta y el segundo fallaría (se sube con upsert: false).
 */
export function buildUploadPlan<F extends NamedFile>(
  files: F[],
  companies: UploadTargetCompany[],
  timestamp: number = Date.now(),
): UploadPair<F>[] {
  const pairs: UploadPair<F>[] = [];
  let index = 0;

  for (const company of companies) {
    for (const file of files) {
      pairs.push({
        company,
        file,
        storagePath: `${company.id}/${timestamp}_${index}_${sanitizeFileName(file.name)}`,
      });
      index++;
    }
  }

  return pairs;
}
