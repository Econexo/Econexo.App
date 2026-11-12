// Campos de un ticket de pesaje: los Kg y a dónde fue la carga.
// Lo usan el modal "Subir Documentos" y el editor de tipo de la ficha del
// cliente. Qué suma y qué no está en utils/weighTicket.ts.

import React from 'react';
import type { WasteDestination } from '../../utils/wasteClassification';
import { WEIGH_TICKET_DESTINATIONS } from '../../utils/weighTicket';

interface WeighTicketFieldsProps {
    kg: string;
    onKgChange: (kg: string) => void;
    destination: WasteDestination;
    onDestinationChange: (d: WasteDestination) => void;
    /** Versión compacta para el editor dentro de la lista de documentos. */
    compact?: boolean;
}

const WeighTicketFields: React.FC<WeighTicketFieldsProps> = ({
    kg, onKgChange, destination, onDestinationChange, compact = false,
}) => {
    const hint = WEIGH_TICKET_DESTINATIONS.find(d => d.value === destination)?.hint;
    const labelCls = compact
        ? 'text-[0.5625rem] font-black uppercase text-gray-400 tracking-widest'
        : 'text-[0.625rem] font-black uppercase text-gray-500';
    const inputCls = compact
        ? 'w-full mt-0.5 bg-white border border-gray-200 rounded-lg px-2 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary/50'
        : 'w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-primary/50';

    return (
        <div className={`grid grid-cols-2 ${compact ? 'gap-2' : 'gap-3'}`}>
            <div className="space-y-1">
                <label htmlFor="weigh-ticket-kg" className={labelCls}>Kg del ticket</label>
                <input
                    id="weigh-ticket-kg"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Ej: 1.250"
                    value={kg}
                    onChange={(e) => onKgChange(e.target.value)}
                    className={inputCls}
                />
            </div>
            <div className="space-y-1">
                <label htmlFor="weigh-ticket-dest" className={labelCls}>Destino</label>
                <select
                    id="weigh-ticket-dest"
                    value={destination}
                    onChange={(e) => onDestinationChange(e.target.value as WasteDestination)}
                    className={inputCls}
                >
                    {WEIGH_TICKET_DESTINATIONS.map(d => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                </select>
            </div>
            {hint && (
                <p className="col-span-2 text-[0.625rem] font-bold text-gray-500 leading-snug">{hint}</p>
            )}
        </div>
    );
};

export default WeighTicketFields;
