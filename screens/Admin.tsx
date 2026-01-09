import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import Navbar from '../components/Navbar';
import { generateCR, generateEcoReport } from '../services/pdfGenerator';
import DocumentEditor from '../components/DocumentEditor';

interface UserProfile {
    id: string;
    company_name: string;
    rut: string;
    address: string;
    is_admin: boolean;
    company_email: string;
}

interface Document {
    id: string;
    title: string;
    user_id: string;
    verified: boolean;
    created_at: string;
    type?: string;
    metadata?: any;
    profiles?: {
        company_name: string;
        rut: string;
        address: string;
    }
}

interface SupportTicket {
    id: string;
    user_id: string;
    subject: string;
    description: string;
    status: string;
    created_at: string;
    profiles?: {
        company_name: string;
        rut?: string;
    };
}

const Admin: React.FC = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [pendingDocs, setPendingDocs] = useState<Document[]>([]);
    const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
    const [generatedCerts, setGeneratedCerts] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [showCRModal, setShowCRModal] = useState(false);
    const [showDocEditor, setShowDocEditor] = useState(false);
    const [wasteItems, setWasteItems] = useState<any[]>([]);
    const [withdrawalDate, setWithdrawalDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [currentWaste, setCurrentWaste] = useState({
        waste_type: '',
        description: '',
        quantity: '',
        unit: 'Kg'
    });

    const categories = [
        { label: 'Plásticos', value: 'Plásticos' },
        { label: 'Papel/Cartón', value: 'Papel/Cartón' },
        { label: 'Vidrio', value: 'Vidrio' },
        { label: 'Metales', value: 'Metales' },
        { label: 'Electrónicos (RAEE)', value: 'Electrónicos' },
        { label: 'Peligrosos', value: 'Peligrosos' },
        { label: 'Orgánicos', value: 'Orgánicos' },
        { label: 'Aceites', value: 'Aceites' },
        { label: 'Madera', value: 'Madera' },
        { label: 'Textiles', value: 'Textiles' },
        { label: 'Neumáticos/Caucho', value: 'Neumáticos' },
        { label: 'Otros', value: 'Otros' }
    ];

    useEffect(() => {
        checkAdmin();
        fetchAdminData();
    }, []);

    const checkAdmin = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            navigate('/');
            return;
        }

        if (user.email === 'econexo.hub@gmail.com') {
            const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
            if (!profile?.is_admin) {
                await supabase.from('profiles').update({ is_admin: true }).eq('id', user.id);
            }
            return;
        }

        const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
        if (!profile?.is_admin) {
            navigate('/dashboard');
        }
    };

    const fetchAdminData = async () => {
        try {
            setLoading(true);

            // 1. Fetch Profiles
            const { data: profiles, error: pError } = await supabase.from('profiles').select('*');
            if (pError) console.error('Profiles fetch error:', pError);

            // 2. Fetch Pending Docs (unverified)
            // Attempt join for better info, fallback if it fails
            const { data: docs, error: dError } = await supabase
                .from('documents')
                .select('*, profiles(company_name)')
                .eq('verified', false);

            let finalDocs = docs;
            if (dError) {
                console.error('Pending docs join error:', dError);
                const { data: simpleDocs } = await supabase.from('documents').select('*').eq('verified', false);
                finalDocs = simpleDocs;
            }

            // 3. Fetch Support Tickets
            const { data: tickets, error: tError } = await supabase
                .from('support_tickets')
                .select('*, profiles(company_name)')
                .order('created_at', { ascending: false });
            if (tError) console.error('Tickets fetch error:', tError);

            // 4. Fetch Generated Certs (CR)
            const { data: certs, error: cError } = await supabase
                .from('documents')
                .select('*, profiles(company_name, rut, address)')
                .eq('type', 'CR')
                .order('created_at', { ascending: false });

            let finalCerts = certs;
            if (cError) {
                console.error('Certs join experimental error:', cError);
                // Fallback to simple fetch
                const { data: simpleCerts } = await supabase
                    .from('documents')
                    .select('*')
                    .eq('type', 'CR')
                    .order('created_at', { ascending: false });
                finalCerts = simpleCerts;
            }

            setUsers(profiles || []);
            setPendingDocs(finalDocs || []);
            setSupportTickets(tickets || []);
            setGeneratedCerts(finalCerts || []);
            setLoading(false);
        } catch (err) {
            console.error('Global fetch error:', err);
            setLoading(false);
        }
    };

    const updateTicketStatus = async (ticketId: string, newStatus: string) => {
        const { error } = await supabase.from('support_tickets').update({ status: newStatus }).eq('id', ticketId);
        if (!error) fetchAdminData();
    };

    const validateDoc = async (docId: string) => {
        const { error } = await supabase.from('documents').update({ verified: true }).eq('id', docId);
        if (!error) fetchAdminData();
    };

    const handleAddWasteItem = () => {
        if (!currentWaste.waste_type || !currentWaste.quantity) return;
        setWasteItems([...wasteItems, { ...currentWaste, quantity: Number(currentWaste.quantity) }]);
        setCurrentWaste({ waste_type: '', description: '', quantity: '', unit: 'Kg' });
    };

    const handleRemoveWasteItem = (index: number) => {
        setWasteItems(wasteItems.filter((_, i) => i !== index));
    };

    const handleGenerateCR = async () => {
        if (!selectedUser || wasteItems.length === 0) {
            alert("Debes agregar al menos un ítem.");
            return;
        }

        const { data: allCRs } = await supabase.from('documents').select('metadata, title').eq('type', 'CR');
        let nextNum = 1;
        if (allCRs && allCRs.length > 0) {
            const nums = allCRs.map(d => {
                const match = (d.metadata?.cert_number || d.title || '').match(/CR N°:(\d+)/);
                return match ? parseInt(match[1]) : 0;
            }).filter(n => n > 0);
            if (nums.length > 0) nextNum = Math.max(...nums) + 1;
        }

        const certNumber = `CR N°:${nextNum.toString().padStart(3, '0')}`;
        const docTitle = `Certificado de Recepción ${certNumber}`;

        generateCR(
            { company_name: selectedUser.company_name, rut: selectedUser.rut, address: selectedUser.address || 'Chile' },
            wasteItems, certNumber, 'save', withdrawalDate
        );

        const { error } = await supabase.from('documents').insert([{
            user_id: selectedUser.id,
            title: docTitle,
            type: 'CR',
            verified: true,
            created_at: withdrawalDate ? new Date(withdrawalDate).toISOString() : new Date().toISOString(),
            metadata: { cert_number: certNumber, generated_by: 'Admin Panel', waste_details: wasteItems }
        }]);

        if (!error) {
            const totalWeight = wasteItems.reduce((acc, item) => acc + (item.quantity || 0), 0);
            const pointsToAward = Math.round(totalWeight * 2);
            await supabase.rpc('increment_points', { user_id_param: selectedUser.id, amount_param: pointsToAward });
            await supabase.from('points_transactions').insert([{
                user_id: selectedUser.id,
                amount: pointsToAward,
                reason: `Generación de Certificado ${certNumber}`
            }]);
            setShowCRModal(false);
            setWasteItems([]);
            fetchAdminData();
            alert(`Certificado generado y ${pointsToAward} Eco-Puntos otorgados.`);
        }
    };

    const handleViewCertificate = async (doc: Document, action: 'preview' | 'save' = 'preview') => {
        let profileData = doc.profiles;
        if (!profileData) {
            const { data: profile } = await supabase.from('profiles').select('company_name, rut, address').eq('id', doc.user_id).single();
            if (!profile) return;
            profileData = profile;
        }
        if (!doc.metadata?.waste_details) return;

        if (doc.type === 'pdf' || doc.type === 'report') {
            generateEcoReport(
                { company_name: profileData.company_name, rut: profileData.rut, address: profileData.address || 'Chile' },
                doc.metadata.waste_details, doc.metadata.periodo || 'Reporte Reciclaje', action
            );
        } else {
            generateCR(
                { company_name: profileData.company_name, rut: profileData.rut, address: profileData.address || 'Chile' },
                doc.metadata.waste_details, doc.metadata.cert_number || doc.title, action
            );
        }
    };

    const handleDeleteDocument = async (doc: Document) => {
        if (!window.confirm(`¿Estás seguro de eliminar "${doc.title}"? Se revertirán los Eco-Puntos.`)) return;
        try {
            if (doc.type === 'CR' && doc.metadata?.waste_details) {
                const weight = doc.metadata.waste_details.reduce((acc: number, item: any) => acc + (item.quantity || 0), 0);
                const points = Math.round(weight * 2);
                if (points > 0) {
                    await supabase.rpc('increment_points', { user_id_param: doc.user_id, amount_param: -points });
                    await supabase.from('points_transactions').insert([{
                        user_id: doc.user_id, amount: -points, reason: `Anulación de Certificado: ${doc.metadata?.cert_number || doc.title}`
                    }]);
                }
            }
            await supabase.from('documents').delete().eq('id', doc.id);
            fetchAdminData();
            alert('Documento eliminado.');
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="font-sans bg-background-light dark:bg-background-dark min-h-screen text-slate-900 dark:text-white max-w-md mx-auto pb-28">
            <div className="p-6 sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm border-b border-white/5 flex items-center justify-between">
                <h2 className="text-xl font-display font-black">Panel Administrador</h2>
                <button onClick={fetchAdminData} className="size-10 flex items-center justify-center bg-primary/10 rounded-full text-primary">
                    <span className="material-symbols-outlined">refresh</span>
                </button>
            </div>

            <main className="p-4 space-y-8">
                {showDocEditor && (
                    <DocumentEditor users={users} onClose={() => setShowDocEditor(false)} onSuccess={() => { fetchAdminData(); setShowDocEditor(false); }} />
                )}

                {showCRModal && selectedUser && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                        <div className="absolute inset-0 bg-background-dark/90 backdrop-blur-md" onClick={() => setShowCRModal(false)}></div>
                        <div className="relative bg-surface-dark w-full max-w-[380px] rounded-[32px] p-8 border border-white/10 shadow-2xl animate-in zoom-in duration-200 overflow-y-auto max-h-[90vh]">
                            <h3 className="text-xl font-display font-black mb-6">Generar Certificado</h3>
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Datos de la Empresa</h4>
                                    <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none font-bold" value={selectedUser.company_name} onChange={(e) => setSelectedUser({ ...selectedUser, company_name: e.target.value })} />
                                    <div className="grid grid-cols-2 gap-3">
                                        <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none font-bold" value={selectedUser.rut} onChange={(e) => setSelectedUser({ ...selectedUser, rut: e.target.value })} />
                                        <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none font-bold" value={selectedUser.address} onChange={(e) => setSelectedUser({ ...selectedUser, address: e.target.value })} />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Fecha del Retiro</h4>
                                    <input type="date" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none font-bold text-white shadow-inner" value={withdrawalDate} onChange={(e) => setWithdrawalDate(e.target.value)} />
                                </div>
                                <div className="h-px bg-white/10"></div>
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Detalle de Residuos</h4>
                                    {wasteItems.length > 0 && (
                                        <div className="bg-white/5 rounded-xl overflow-hidden border border-white/10">
                                            {wasteItems.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center p-3 border-b border-white/5 last:border-0 text-xs">
                                                    <div><p className="font-bold text-white">{item.quantity} {item.unit} - {item.waste_type}</p><p className="text-gray-400 text-[10px]">{item.description}</p></div>
                                                    <button onClick={() => handleRemoveWasteItem(idx)} className="text-red-400"><span className="material-symbols-outlined text-sm">delete</span></button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/10 border-dashed space-y-3 text-xs">
                                        <select className="w-full bg-surface-dark border border-white/10 rounded-xl px-4 py-3 outline-none font-bold" value={currentWaste.waste_type} onChange={(e) => setCurrentWaste({ ...currentWaste, waste_type: e.target.value })}>
                                            <option value="">Seleccionar...</option>
                                            {categories.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                                        </select>
                                        <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none font-bold" placeholder="Descripción" value={currentWaste.description} onChange={(e) => setCurrentWaste({ ...currentWaste, description: e.target.value })} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <input type="number" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none font-bold" value={currentWaste.quantity} onChange={(e) => setCurrentWaste({ ...currentWaste, quantity: e.target.value })} />
                                            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none font-bold" value={currentWaste.unit} onChange={(e) => setCurrentWaste({ ...currentWaste, unit: e.target.value })} />
                                        </div>
                                        <button onClick={handleAddWasteItem} className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                                            <span className="material-symbols-outlined text-sm">add</span>Agregar
                                        </button>
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <button onClick={handleGenerateCR} className="w-full py-4 bg-primary text-background-dark rounded-2xl font-display font-black uppercase tracking-widest shadow-glow active:scale-95 transition-transform">
                                        Emitir Certificado ({wasteItems.length})
                                    </button>
                                    <button onClick={() => setShowCRModal(false)} className="w-full py-3 text-gray-500 text-[10px] font-black uppercase tracking-widest mt-2">Cancelar</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <section className="grid grid-cols-2 gap-4">
                    <button onClick={() => setShowDocEditor(true)} className="p-4 bg-primary/10 hover:bg-primary/20 rounded-2xl border border-primary/20 flex flex-col items-center gap-2 transition-all">
                        <div className="size-10 bg-primary rounded-full flex items-center justify-center text-background-dark shadow-primary/30"><span className="material-symbols-outlined">edit_document</span></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">Crear Doc. Especial</span>
                    </button>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center gap-2 opacity-50 cursor-not-allowed">
                        <div className="size-10 bg-white/10 rounded-full flex items-center justify-center text-white"><span className="material-symbols-outlined">query_stats</span></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Estadísticas</span>
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Documentos por Validar</h3>
                        <span className="bg-primary/20 text-primary text-[10px] font-black px-2 py-0.5 rounded-full">{pendingDocs.length}</span>
                    </div>
                    {pendingDocs.length === 0 ? (
                        <div className="p-8 text-center bg-white/5 rounded-3xl border border-dashed border-white/10"><p className="text-xs text-gray-500 font-bold uppercase tracking-widest">No hay pendientes</p></div>
                    ) : (
                        <div className="space-y-3">
                            {pendingDocs.map(doc => (
                                <div key={doc.id} className="bg-surface-dark p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm truncate">{doc.title}</p>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">ID: {doc.user_id.slice(0, 8)}...</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => validateDoc(doc.id)} className="px-3 py-2 bg-primary text-background-dark rounded-xl text-[10px] font-black uppercase tracking-widest shadow-glow">Validar</button>
                                        <button onClick={() => handleDeleteDocument(doc)} className="size-9 bg-red-500/10 text-red-500 rounded-xl flex items-center justify-center"><span className="material-symbols-outlined text-lg">delete</span></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Reportes de Soporte</h3>
                        <span className="bg-orange-500/20 text-orange-400 text-[10px] font-black px-2 py-0.5 rounded-full">{supportTickets.filter(t => t.status === 'pending').length}</span>
                    </div>
                    {supportTickets.length === 0 ? (
                        <div className="p-8 text-center bg-white/5 rounded-3xl border border-dashed border-white/10"><p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Sin reportes</p></div>
                    ) : (
                        <div className="space-y-3">
                            {supportTickets.map(ticket => (
                                <div key={ticket.id} className="bg-surface-dark p-5 rounded-3xl border border-white/5">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${ticket.status === 'pending' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>{ticket.status}</span>
                                        <p className="text-[10px] font-bold text-gray-500">{new Date(ticket.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <h4 className="font-bold text-sm">{ticket.subject}</h4>
                                    <p className="text-xs text-gray-400 leading-relaxed my-3">{ticket.description}</p>
                                    <div className="flex items-center justify-between pt-3 border-t border-white/5">
                                        <p className="text-[10px] font-black text-primary uppercase">{ticket.profiles?.company_name}</p>
                                        {ticket.status === 'pending' && <button onClick={() => updateTicketStatus(ticket.id, 'resolved')} className="text-[10px] font-black uppercase text-green-400 bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/10">Resolver</button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Usuarios Registrados</h3>
                        <span className="bg-white/10 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{users.length}</span>
                    </div>
                    <div className="space-y-3">
                        {users.map(u => (
                            <div key={u.id} className="bg-white dark:bg-card-dark p-4 rounded-2xl border border-white/5 flex items-center gap-4">
                                <div className="size-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold">{u.company_name?.[0]}</div>
                                <div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{u.company_name}</p><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{u.rut}</p></div>
                                <button onClick={() => { setSelectedUser(u); setShowCRModal(true); }} className="p-2 bg-primary/10 text-primary rounded-lg transition-colors"><span className="material-symbols-outlined text-[20px]">description</span></button>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Certificados Emitidos</h3>
                        <span className="bg-primary/20 text-primary text-[10px] font-black px-2 py-0.5 rounded-full">{generatedCerts.length}</span>
                    </div>
                    {generatedCerts.length === 0 ? (
                        <div className="p-8 text-center bg-white/5 rounded-3xl border border-dashed border-white/10"><p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Sin certificados</p></div>
                    ) : (
                        <div className="space-y-3">
                            {generatedCerts.map(cert => (
                                <div key={cert.id} className="bg-surface-dark p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-4 text-xs">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-white truncate">{cert.title}</p>
                                        <p className="text-[10px] text-primary font-black uppercase mt-1">{cert.profiles?.company_name}</p>
                                        <p className="text-[8px] text-gray-500 font-bold mt-0.5">{new Date(cert.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleViewCertificate(cert, 'preview')} className="size-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center"><span className="material-symbols-outlined text-lg">visibility</span></button>
                                        <button onClick={() => handleViewCertificate(cert, 'save')} className="size-9 bg-white/5 text-gray-400 rounded-xl flex items-center justify-center"><span className="material-symbols-outlined text-lg">download</span></button>
                                        <button onClick={() => handleDeleteDocument(cert)} className="size-9 bg-red-500/10 text-red-500 rounded-xl flex items-center justify-center"><span className="material-symbols-outlined text-lg">delete_forever</span></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>
            <Navbar />
        </div>
    );
};

export default Admin;
