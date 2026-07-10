// Who issued a document: EcoNexo (retiro guides, CR, CGM, reports) or a Gestor
// (weighing tickets, CDF, disposal certificates). The emisor is used to route
// documents into the client's "Econexo" vs "Gestores" sections.
//
// Signal priority:
//   1. metadata.emisor      — explicit value set by the admin editor (source of truth)
//   2. metadata.upload_source — the EcoNexo/Gestor choice made in the scanner
//   3. metadata.source       — the origin chosen in the admin upload modal
//      (ignored when it's the literal 'scanner', which is a channel, not an emisor)
//   4. document type         — sensible fallback for legacy docs with no signal

export type Emisor = 'econexo' | 'gestor';

export function getDocEmisor(doc: { type?: string; metadata?: any } | null | undefined): Emisor {
    const m = (doc && doc.metadata) || {};
    const raw = m.emisor
        || m.upload_source
        || (m.source && m.source !== 'scanner' ? m.source : undefined);
    if (raw === 'econexo' || raw === 'gestor') return raw;

    // Fallback by type: EcoNexo issues CR/CGM/reports and its own retiro guides.
    if (['CR', 'CGM', 'report', 'pdf', 'guia'].includes(doc?.type || '')) return 'econexo';
    // ticket_pesaje, cdf, declaration, legal, oc, custom, … → Gestor.
    return 'gestor';
}

// Maps the client-side section id to the emisor it should display.
export function sectionToEmisor(section: string): Emisor {
    return section === 'gestores' ? 'gestor' : 'econexo';
}
