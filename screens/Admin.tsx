import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import Navbar from '../components/Navbar';
import { generateCR, generateEcoReport, generateCGM } from '../services/pdfGenerator';
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
    const [showMonthlyGenModal, setShowMonthlyGenModal] = useState(false);
    const [wasteItems, setWasteItems] = useState<any[]>([]);
    const [withdrawalDate, setWithdrawalDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [selectedMonthGen, setSelectedMonthGen] = useState(new Date().getMonth());
    const [selectedYearGen, setSelectedYearGen] = useState(new Date().getFullYear());

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

            // 4. Fetch Generated Certs (CR) and Reports
            const { data: certs, error: cError } = await supabase
                .from('documents')
                .select('*, profiles(company_name, rut, address)')
                .in('type', ['CR', 'report', 'pdf', 'custom', 'CGM'])
                .order('created_at', { ascending: false });

            let finalCerts = certs;
            if (cError) {
                console.error('Certs join experimental error:', cError);
                // Fallback to simple fetch
                const { data: simpleCerts } = await supabase
                    .from('documents')
                    .select('*')
                    .in('type', ['CR', 'report', 'pdf', 'custom', 'CGM'])
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
        try {
            const { error } = await supabase.from('support_tickets').update({ status: newStatus }).eq('id', ticketId);
            if (error) throw error;
            fetchAdminData();
        } catch (err: any) {
            console.error('Error updating ticket:', err);
            alert(`Error updating ticket: ${err.message || 'Unknown error'}`);
        }
    };

    const validateDoc = async (docId: string) => {
        try {
            const { error } = await supabase.from('documents').update({ verified: true }).eq('id', docId);
            if (error) throw error;
            fetchAdminData();
        } catch (err: any) {
            console.error('Error validating document:', err);
            alert(`Error validating document: ${err.message || 'Unknown error'}`);
        }
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
        } else if (doc.type === 'CGM') {
            const month = doc.metadata?.month || 'Mes';
            const year = doc.metadata?.year || 2024;
            // Aggregate if needed, but usually metadata has pre-aggregated or we use stored waste_details
            // If CGM stores aggregated details in waste_details, we pass them.
            generateCGM(
                { company_name: profileData.company_name, rut: profileData.rut, address: profileData.address || 'Chile' },
                doc.metadata.waste_details,
                month,
                year,
                action
            );
        } else {
            generateCR(
                { company_name: profileData.company_name, rut: profileData.rut, address: profileData.address || 'Chile' },
                doc.metadata.waste_details, doc.metadata.cert_number || doc.title, action
            );
        }
    };


    const handleDeleteDocument = async (doc: Document) => {
        if (!window.confirm("¿Estás seguro de que deseas eliminar este documento? Esta acción es irreversible.")) return;

        try {
            // 1. Revert points if it was a CR
            if (doc.type === 'CR' && doc.metadata?.waste_details) {
                const totalWeight = doc.metadata.waste_details.reduce((acc: number, item: any) => acc + (Number(item.quantity) || 0), 0);
                const pointsToRevert = Math.round(totalWeight * 2);

                await supabase.rpc('increment_points', { user_id_param: doc.user_id, amount_param: -pointsToRevert });
                await supabase.from('points_transactions').insert([{
                    user_id: doc.user_id,
                    amount: -pointsToRevert,
                    reason: `Eliminación de Certificado ${doc.metadata.cert_number || doc.title}`
                }]);
            }

            const { error } = await supabase.from('documents').delete().eq('id', doc.id);
            if (error) throw error;

            fetchAdminData();
        } catch (err: any) {
            console.error("Error deleting document:", err);
            alert("Error al eliminar: " + err.message);
        }
    };

    const handleGenerateMonthlyReports = async () => {
        // 1. Fetch all CRs for the selected month/year
        setLoading(true);
        try {
            const startDate = new Date(selectedYearGen, selectedMonthGen, 1).toISOString();
            const endDate = new Date(selectedYearGen, selectedMonthGen + 1, 0).toISOString();

            const { data: crDocs, error } = await supabase
                .from('documents')
                .select('*, profiles(*)')
                .eq('type', 'CR')
                .gte('created_at', startDate)
                .lte('created_at', endDate);

            if (error) throw error;
            if (!crDocs || crDocs.length === 0) {
                alert("No se encontraron Certificados de Recepción (CR) para este período.");
                setLoading(false);
                return;
            }

            // 2. Group by User
            const userGroups: Record<string, { profile: any, items: any[] }> = {};

            crDocs.forEach(doc => {
                const uid = doc.user_id;
                if (!userGroups[uid]) {
                    userGroups[uid] = {
                        profile: doc.profiles,
                        items: []
                    };
                }
                const details = doc.metadata?.waste_details;
                if (details) {
                    if (Array.isArray(details)) userGroups[uid].items.push(...details);
                    else userGroups[uid].items.push(details);
                }
            });

            // 3. Generate CGM Drafts
            const newDocs = [];
            const monthName = new Date(selectedYearGen, selectedMonthGen).toLocaleString('es-CL', { month: 'long' });

            for (const [uid, group] of Object.entries(userGroups)) {
                // Check if already exists? (Optional, skipping for now to allow re-gen)

                newDocs.push({
                    user_id: uid,
                    title: `Certificado Gestión Mensual - ${monthName} ${selectedYearGen}`,
                    type: 'CGM',
                    verified: false, // Requires admin approval
                    created_at: new Date().toISOString(),
                    metadata: {
                        month: monthName,
                        year: selectedYearGen,
                        waste_details: group.items, // Store all items, generator aggregates them
                        generated_by: 'Admin Batch Process'
                    }
                });
            }

            if (newDocs.length > 0) {
                const { error: insError } = await supabase.from('documents').insert(newDocs);
                if (insError) throw insError;
                alert(`Se han generado ${newDocs.length} borradores de certificados mensuales. Revísalos en "Pendientes".`);
            }

            setShowMonthlyGenModal(false);
            fetchAdminData();
        } catch (err: any) {
            console.error(err);
            alert("Error: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative font-sans bg-[#f0f4f0] min-h-screen text-slate-900 max-w-md mx-auto pb-28 overflow-hidden">
            {/* Decorative Background Blobs */}
            <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
            <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

            <div className="p-6 sticky top-0 z-10 bg-white/70 backdrop-blur-md border-b border-white/40 flex items-center justify-between shadow-sm">
                <h2 className="text-xl font-display font-black text-gray-900">Panel Administrador</h2>
                <button onClick={fetchAdminData} className="size-10 flex items-center justify-center bg-primary/10 hover:bg-primary/20 rounded-full text-primary border border-primary/20 transition-all">
                    <span className="material-symbols-outlined">refresh</span>
                </button>
            </div>

            <main className="p-4 space-y-8 relative z-10">
                {showDocEditor && (
                    <DocumentEditor users={users} onClose={() => setShowDocEditor(false)} onSuccess={() => { fetchAdminData(); setShowDocEditor(false); }} />
                )}

                {showMonthlyGenModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowMonthlyGenModal(false)}></div>
                        <div className="relative bg-white/90 backdrop-blur-2xl w-full max-w-[340px] rounded-[32px] p-8 border border-white/80 shadow-2xl animate-in zoom-in duration-200">
                            <h3 className="text-lg font-display font-black mb-4 text-gray-900">Generar Mensuales</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-gray-500">Mes</label>
                                    <select
                                        value={selectedMonthGen}
                                        onChange={(e) => setSelectedMonthGen(Number(e.target.value))}
                                        className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none"
                                    >
                                        {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                                            <option key={i} value={i}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-gray-500">Año</label>
                                    <input
                                        type="number"
                                        value={selectedYearGen}
                                        onChange={(e) => setSelectedYearGen(Number(e.target.value))}
                                        className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none"
                                    />
                                </div>
                                <button
                                    onClick={handleGenerateMonthlyReports}
                                    className="w-full py-3 bg-primary text-white rounded-xl font-black uppercase tracking-widest shadow-lg hover:shadow-xl transition-all"
                                >
                                    Generar Borradores
                                </button>
                                <button onClick={() => setShowMonthlyGenModal(false)} className="w-full text-center text-xs text-gray-500 font-bold uppercase">Cancelar</button>
                            </div>
                        </div>
                    </div>
                )}

                {showCRModal && selectedUser && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowCRModal(false)}></div>
                        <div className="relative bg-white/90 backdrop-blur-2xl w-full max-w-[380px] rounded-[32px] p-8 border border-white/80 shadow-2xl animate-in zoom-in duration-200 overflow-y-auto max-h-[90vh]">
                            <h3 className="text-xl font-display font-black mb-6 text-gray-900">Generar Certificado</h3>
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Datos de la Empresa</h4>
                                    <input className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none font-bold text-gray-900" value={selectedUser.company_name} onChange={(e) => setSelectedUser({ ...selectedUser, company_name: e.target.value })} />
                                    <div className="grid grid-cols-2 gap-3">
                                        <input className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none font-bold text-gray-900" value={selectedUser.rut} onChange={(e) => setSelectedUser({ ...selectedUser, rut: e.target.value })} />
                                        <input className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none font-bold text-gray-900" value={selectedUser.address} onChange={(e) => setSelectedUser({ ...selectedUser, address: e.target.value })} />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Fecha del Retiro</h4>
                                    <input type="date" className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none font-bold text-gray-900 shadow-inner" value={withdrawalDate} onChange={(e) => setWithdrawalDate(e.target.value)} />
                                </div>
                                <div className="h-px bg-gray-200"></div>
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Detalle de Residuos</h4>
                                    {wasteItems.length > 0 && (
                                        <div className="bg-white/50 rounded-xl overflow-hidden border border-white/60">
                                            {wasteItems.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center p-3 border-b border-gray-100 last:border-0 text-xs">
                                                    <div><p className="font-bold text-gray-900">{item.quantity} {item.unit} - {item.waste_type}</p><p className="text-gray-500 text-[10px]">{item.description}</p></div>
                                                    <button onClick={() => handleRemoveWasteItem(idx)} className="text-red-500 hover:bg-red-50 rounded-full p-1"><span className="material-symbols-outlined text-sm">delete</span></button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="p-3 bg-white/50 rounded-xl border border-white/60 border-dashed space-y-3 text-xs">
                                        <select className="w-full bg-transparent border border-gray-300 rounded-xl px-4 py-3 outline-none font-bold text-gray-900" value={currentWaste.waste_type} onChange={(e) => setCurrentWaste({ ...currentWaste, waste_type: e.target.value })}>
                                            <option value="">Seleccionar...</option>
                                            {categories.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                                        </select>
                                        <input className="w-full bg-transparent border border-gray-300 rounded-xl px-4 py-3 outline-none font-bold text-gray-900" placeholder="Descripción" value={currentWaste.description} onChange={(e) => setCurrentWaste({ ...currentWaste, description: e.target.value })} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <input type="number" className="w-full bg-transparent border border-gray-300 rounded-xl px-4 py-3 outline-none font-bold text-gray-900" value={currentWaste.quantity} onChange={(e) => setCurrentWaste({ ...currentWaste, quantity: e.target.value })} />
                                            <input className="w-full bg-transparent border border-gray-300 rounded-xl px-4 py-3 outline-none font-bold text-gray-900" value={currentWaste.unit} onChange={(e) => setCurrentWaste({ ...currentWaste, unit: e.target.value })} />
                                        </div>
                                        <button onClick={handleAddWasteItem} className="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold uppercase tracking-widest flex items-center justify-center gap-2 text-gray-600 transition-colors">
                                            <span className="material-symbols-outlined text-sm">add</span>Agregar
                                        </button>
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <button onClick={handleGenerateCR} className="w-full py-4 bg-primary text-background-dark rounded-2xl font-display font-black uppercase tracking-widest shadow-glow active:scale-95 transition-transform">
                                        Emitir Certificado ({wasteItems.length})
                                    </button>
                                    <button onClick={() => setShowCRModal(false)} className="w-full py-3 text-gray-500 hover:text-gray-900 text-[10px] font-black uppercase tracking-widest mt-2 transition-colors">Cancelar</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <section className="grid grid-cols-2 gap-4">
                    <button onClick={() => setShowDocEditor(true)} className="p-4 bg-white/60 backdrop-blur-2xl hover:bg-white/80 rounded-2xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex flex-col items-center gap-2 transition-all group">
                        <div className="size-10 bg-primary/10 rounded-full flex items-center justify-center text-primary border border-primary/20 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined">edit_document</span></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-900 group-hover:text-primary transition-colors">Crear Doc. Especial</span>
                    </button>
                    <button onClick={() => setShowMonthlyGenModal(true)} className="p-4 bg-orange-500 text-white hover:bg-orange-600 rounded-2xl shadow-lg shadow-orange-500/30 flex flex-col items-center gap-2 transition-all group active:scale-95">
                        <div className="size-10 bg-white/20 rounded-full flex items-center justify-center text-white border border-white/20 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined">calendar_month</span></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white">Generar Mensuales</span>
                    </button>
                </section>

                <section className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Documentos por Validar</h3>
                        <span className="bg-primary/20 text-primary text-[10px] font-black px-2 py-0.5 rounded-full">{pendingDocs.length}</span>
                    </div>
                    {pendingDocs.length === 0 ? (
                        <div className="p-8 text-center bg-white/40 backdrop-blur-sm rounded-3xl border border-dashed border-gray-300"><p className="text-xs text-gray-500 font-bold uppercase tracking-widest">No hay pendientes</p></div>
                    ) : (
                        <div className="space-y-3">
                            {pendingDocs.map(doc => (
                                <div key={doc.id} className="bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm truncate text-gray-900">{doc.title}</p>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">ID: {doc.user_id.slice(0, 8)}...</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => validateDoc(doc.id)} className="px-3 py-2 bg-primary text-background-dark rounded-xl text-[10px] font-black uppercase tracking-widest shadow-glow hover:brightness-110 transition-all">Validar</button>
                                        <button onClick={() => handleDeleteDocument(doc)} className="size-9 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl flex items-center justify-center border border-red-100 transition-colors"><span className="material-symbols-outlined text-lg">delete</span></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Reportes de Soporte</h3>
                        <span className="bg-orange-500/20 text-orange-500 text-[10px] font-black px-2 py-0.5 rounded-full">{supportTickets.filter(t => t.status === 'pending').length}</span>
                    </div>
                    {supportTickets.length === 0 ? (
                        <div className="p-8 text-center bg-white/40 backdrop-blur-sm rounded-3xl border border-dashed border-gray-300"><p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Sin reportes</p></div>
                    ) : (
                        <div className="space-y-3">
                            {supportTickets.map(ticket => (
                                <div key={ticket.id} className="bg-white/60 backdrop-blur-2xl p-5 rounded-3xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)]">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${ticket.status === 'pending' ? 'bg-orange-100 text-orange-500' : 'bg-green-100 text-green-500'}`}>{ticket.status}</span>
                                        <p className="text-[10px] font-bold text-gray-400">{new Date(ticket.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <h4 className="font-bold text-sm text-gray-900">{ticket.subject}</h4>
                                    <p className="text-xs text-gray-600 leading-relaxed my-3 font-medium">{ticket.description}</p>
                                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                        <p className="text-[10px] font-black text-primary uppercase">{ticket.profiles?.company_name}</p>
                                        {ticket.status === 'pending' && <button onClick={() => updateTicketStatus(ticket.id, 'resolved')} className="text-[10px] font-black uppercase text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100 hover:bg-green-100 transition-colors">Resolver</button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Usuarios Registrados</h3>
                        <span className="bg-white/50 text-gray-600 text-[10px] font-black px-2 py-0.5 rounded-full border border-gray-200">{users.length}</span>
                    </div>
                    <div className="space-y-3">
                        {users.map(u => (
                            <div key={u.id} className="bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex items-center gap-4">
                                <div className="size-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center font-bold border border-blue-100">{u.company_name?.[0]}</div>
                                <div className="flex-1 min-w-0"><p className="font-bold text-sm truncate text-gray-900">{u.company_name}</p><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{u.rut}</p></div>
                                <button onClick={() => { setSelectedUser(u); setShowCRModal(true); }} className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"><span className="material-symbols-outlined text-[20px]">description</span></button>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Documentos Emitidos</h3>
                        <span className="bg-primary/20 text-primary text-[10px] font-black px-2 py-0.5 rounded-full">{generatedCerts.length}</span>
                    </div>
                    {generatedCerts.length === 0 ? (
                        <div className="p-8 text-center bg-white/40 backdrop-blur-sm rounded-3xl border border-dashed border-gray-300"><p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Sin certificados</p></div>
                    ) : (
                        <div className="space-y-3">
                            {generatedCerts.map(cert => (
                                <div key={cert.id} className="bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex items-center justify-between gap-4 text-xs">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-gray-900 truncate">{cert.title}</p>
                                            <span className="text-[8px] bg-gray-100 px-1.5 py-0.5 rounded-full font-black uppercase text-gray-400">{cert.type}</span>
                                        </div>
                                        <p className="text-[10px] text-primary font-black uppercase mt-1">{cert.profiles?.company_name}</p>
                                        <p className="text-[8px] text-gray-400 font-bold mt-0.5">{new Date(cert.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleViewCertificate(cert, 'preview')} className="size-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center hover:bg-primary/20 transition-colors"><span className="material-symbols-outlined text-lg">visibility</span></button>
                                        <button onClick={() => handleViewCertificate(cert, 'save')} className="size-9 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-200 transition-colors"><span className="material-symbols-outlined text-lg">download</span></button>
                                        <button onClick={() => handleDeleteDocument(cert)} className="size-9 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-100 transition-colors"><span className="material-symbols-outlined text-lg">delete_forever</span></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>
            <div className="absolute bottom-2 right-4 text-[10px] text-gray-400 font-bold z-50">v1.2</div>
            <Navbar />
        </div>
    );
};

export default Admin;
