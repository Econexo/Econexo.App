import React from 'react';
import { SupportTicket } from './types';

interface SupportTicketsListProps {
    tickets: SupportTicket[];
    onUpdateStatus: (ticketId: string, status: string) => void;
}

const SupportTicketsList: React.FC<SupportTicketsListProps> = ({ tickets, onUpdateStatus }) => {
    const pendingCount = tickets.filter(t => t.status === 'pending').length;

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Reportes de Soporte</h3>
                <span className="bg-orange-500/20 text-orange-500 text-[10px] font-black px-2 py-0.5 rounded-full">{pendingCount}</span>
            </div>

            {tickets.length === 0 ? (
                <div className="p-8 text-center bg-white/40 backdrop-blur-sm rounded-3xl border border-dashed border-gray-300">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Sin reportes</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {tickets.map(ticket => (
                        <div key={ticket.id} className="bg-white/60 backdrop-blur-2xl p-5 rounded-3xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)]">
                            <div className="flex justify-between items-start mb-3">
                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${ticket.status === 'pending' ? 'bg-orange-100 text-orange-500' : 'bg-green-100 text-green-500'}`}>
                                    {ticket.status}
                                </span>
                                <p className="text-[10px] font-bold text-gray-400">{new Date(ticket.created_at).toLocaleDateString()}</p>
                            </div>
                            <h4 className="font-bold text-sm text-gray-900">{ticket.subject}</h4>
                            <p className="text-xs text-gray-600 leading-relaxed my-3 font-medium">{ticket.description}</p>
                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                <p className="text-[10px] font-black text-primary uppercase">{ticket.profiles?.company_name}</p>
                                {ticket.status === 'pending' && (
                                    <button
                                        onClick={() => onUpdateStatus(ticket.id, 'resolved')}
                                        className="text-[10px] font-black uppercase text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100 hover:bg-green-100 transition-colors"
                                    >
                                        Resolver
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

export default SupportTicketsList;
