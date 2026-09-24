// Transportistas autorizados: los que pueden aparecer como responsables del
// traslado en un Certificado de Transporte, con su resolución sanitaria.
//
// Se administran en el panel Admin (TransportistasManager) y se eligen al emitir,
// tanto desde el Admin como desde el Dashboard.

import { supabase } from './supabase';

export interface TransportistaOption {
  id: string;
  name: string;
  rut: string;
  resolution: string;
}

/**
 * Transportistas activos, en el orden en que se crearon: el primero es el que
 * queda preseleccionado al emitir (la semilla de la migración es EcoNexo).
 *
 * Si la tabla todavía no existe —la migración se aplica a mano en el SQL Editor—
 * devuelve una lista vacía en vez de tumbar la pantalla. Sin transportistas el
 * certificado sigue imprimiendo la resolución de EcoNexo por defecto.
 */
export async function fetchActiveTransportistas(): Promise<TransportistaOption[]> {
  const { data, error } = await supabase
    .from('transportistas')
    .select('id, name, rut, resolution')
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('No se pudieron cargar los transportistas:', error.message);
    return [];
  }
  return data || [];
}
