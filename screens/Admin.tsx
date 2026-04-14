import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import Navbar from '../components/Navbar';
import { generateCR, generateEcoReport, generateCGM } from '../services/pdfGenerator';
import CommunityWithdrawalsManager from '../components/CommunityWithdrawalsManager';
import DocumentEditor from '../components/DocumentEditor';
import { createNotification } from '../services/notificationService';
import ClientOverviewModal from '../components/ClientOverviewModal';
import UnregisteredClientsManager, { UnregisteredClient } from '../components/UnregisteredClientsManager';

// Admin subcomponents
import MonthlyGenModal from '../components/admin/MonthlyGenModal';
import UploadDocumentModal from '../components/admin/UploadDocumentModal';
import GenerateCRModal from '../components/admin/GenerateCRModal';
import PendingDocsList from '../components/admin/PendingDocsList';
import SupportTicketsList from '../components/admin/SupportTicketsList';
import UsersList from '../components/admin/UsersList';
import DocumentsHistory from '../components/admin/DocumentsHistory';
import FixCertificatesModal from '../components/admin/FixCertificatesModal';
import { AdminUserProfile, AdminDocument, SupportTicket, WasteItem, AdminPath } from '../components/admin/types';

const Admin: React.FC = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const confirm = useConfirm();
    const [users, setUsers] = useState<AdminUserProfile[]>([]);
    const [pendingDocs, setPendingDocs] = useState<AdminDocument[]>([]);
    const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
    const [generatedCerts, setGeneratedCerts] = useState<AdminDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<AdminUserProfile | null>(null);

    // Modal visibility
    const [showCRModal, setShowCRModal] = useState(false);
    const [showDocEditor, setShowDocEditor] = useState(false);
    const [showMonthlyGenModal, setShowMonthlyGenModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showClientOverview, setShowClientOverview] = useState(false);
    const [showUnregisteredClients, setShowUnregisteredClients] = useState(false);
    const [showFixCerts, setShowFixCerts] = useState(false);
    const [showCommunityManager, setShowCommunityManager] = useState(false);
    const [clientOverviewUser, setClientOverviewUser] = useState<AdminUserProfile | null>(null);

    // CR modal state
    const [wasteItems, setWasteItems] = useState<WasteItem[]>([]);
    const [withdrawalDate, setWithdrawalDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [currentWaste, setCurrentWaste] = useState({ waste_type: '', description: '', quantity: '', unit: 'Kg' });

    // Monthly gen state
    const [selectedMonthGen, setSelectedMonthGen] = useState(new Date().getMonth());
    const [selectedYearGen, setSelectedYearGen] = useState(new Date().getFullYear());

    // Upload modal state
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadDate, setUploadDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [uploadType, setUploadType] = useState('declaration');
    const [uploadSource, setUploadSource] = useState<'gestor' | 'econexo'>('gestor');

    // Unregistered clients
    const [unregisteredClients, setUnregisteredClients] = useState<{ id: string; company_name: string; rut: string; address: string }[]>([]);

    // Folder navigation
    const [adminPath, setAdminPath] = useState<AdminPath>({ level: 'home' });

    useEffect(() => {
        checkAdmin();
        fetchAdminData();
    }, []);

    const checkAdmin = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigate('/'); return; }
        const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
        if (!profile?.is_admin) navigate('/dashboard');
    };

    const fetchAdminData = async () => {
        try {
            setLoading(true);

            const { data: profiles } = await supabase.from('profiles').select('*');
            const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

            const { data: docs } = await supabase.from('documents').select('*').eq('verified', false);
            const finalDocs = (docs || []).map((doc: any) => ({ ...doc, profiles: profileMap.get(doc.user_id) || null }));

            const { data: tickets } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
            const finalTickets = (tickets || []).map((t: any) => ({ ...t, profiles: profileMap.get(t.user_id) || null }));

            const { data: certs } = await supabase.from('documents').select('*').in('type', ['CR', 'report', 'pdf', 'custom', 'CGM']).order('created_at', { ascending: false });

            const { data: unregDocs } = await supabase.from('documents').select('id, metadata').eq('type', 'UNREGISTERED_CLIENT');
            const unregClients = (unregDocs || []).map((d: any) => ({
                id: d.id,
                company_name: d.metadata?.company_name || 'Sin Nombre',
                rut: d.metadata?.rut || '',
                address: d.metadata?.address || '',
            }));
            const unregClientMap = new Map(unregClients.map((c: any) => [c.id, c]));

            const finalCerts = (certs || []).map((cert: any) => {
                const isUnreg = !!cert.metadata?.unregistered_client_id;
                const clientId = isUnreg ? cert.metadata.unregistered_client_id : cert.user_id;
                const unregClient = isUnreg ? unregClientMap.get(clientId) : null;
                const companyName = isUnreg
                    ? (unregClient?.company_name || 'Cliente Manual')
                    : (profileMap.get(cert.user_id)?.company_name || 'Desconocido');
                return { ...cert, profiles: profileMap.get(cert.user_id) || null, _clientId: clientId, _companyName: companyName, _isUnregistered: isUnreg };
            });

            setUnregisteredClients(unregClients);
            setUsers(profiles || []);
            setPendingDocs(finalDocs);
            setSupportTickets(finalTickets);
            setGeneratedCerts(finalCerts);
        } catch (err) {
            console.error('fetchAdminData error:', err);
        } finally {
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
            toast.error(err.message);
        }
    };

    const validateDoc = async (docId: string) => {
        try {
            setPendingDocs(prev => prev.filter(d => d.id !== docId));
            const { error } = await supabase.from('documents').update({ verified: true }).eq('id', docId);
            if (error) { await fetchAdminData(); throw error; }
            fetchAdminData();
            toast.success('Documento validado y publicado exitosamente.');
        } catch (err: any) {
            console.error('Error validating document:', err);
            toast.error(err.message);
            fetchAdminData();
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
        if (!selectedUser || wasteItems.length === 0) { toast.warning('Debes agregar al menos un ítem.'); return; }

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
            {
                company_name: selectedUser.company_name,
                rut: selectedUser.rut,
                address: selectedUser.address || 'Chile',
                contact_name: (selectedUser as any).full_name || '',
                contact_email: (selectedUser as any).company_email || '',
            },
            wasteItems, certNumber, 'save', withdrawalDate
        );

        const isUnregistered = selectedUser.is_unregistered === true;
        const actualUserId = isUnregistered ? (await supabase.auth.getUser()).data.user?.id : selectedUser.id;

        const { error } = await supabase.from('documents').insert([{
            user_id: actualUserId,
            title: docTitle,
            type: 'CR',
            verified: true,
            created_at: withdrawalDate ? new Date(withdrawalDate + 'T12:00:00').toISOString() : new Date().toISOString(),
            metadata: {
                cert_number: certNumber,
                generated_by: 'Admin Panel',
                waste_details: wasteItems,
                withdrawal_date: withdrawalDate,
                unregistered_client_id: isUnregistered ? selectedUser.id : undefined,
                address: isUnregistered ? (selectedUser.address || '') : undefined
            }
        }]);

        if (!error) {
            const totalWeight = wasteItems.reduce((acc, item) => acc + (item.quantity || 0), 0);
            const pointsToAward = Math.round(totalWeight * 2);

            if (!isUnregistered) {
                await supabase.rpc('increment_points', { user_id_param: selectedUser.id, amount_param: pointsToAward });
                await supabase.from('points_transactions').insert([{ user_id: selectedUser.id, amount: pointsToAward, reason: `Generación de Certificado ${certNumber}` }]);
                await createNotification({ userId: selectedUser.id, title: '🏆 Nuevo Certificado Emitido', message: `Se ha generado el ${certNumber}. Has recibido ${pointsToAward} Eco-Puntos.`, type: 'certificate', metadata: { cert_number: certNumber, points: pointsToAward } });
            }
            setShowCRModal(false);
            setWasteItems([]);
            fetchAdminData();
            toast.success(`Certificado generado y ${pointsToAward} Eco-Puntos otorgados.`);
        }
    };

    const handleViewCertificate = async (doc: AdminDocument, action: 'preview' | 'save' = 'preview') => {
        if (!doc.metadata?.waste_details) return;

        let profileData: { company_name: string; rut: string; address: string };
        if (doc._isUnregistered || doc.metadata?.unregistered_client_id) {
            const unregId = doc.metadata.unregistered_client_id;
            const unregEntry = unregisteredClients.find(c => c.id === unregId);
            // Try getting address from: 1) CR metadata, 2) in-memory unregistered client map, 3) fetch from DB
            let clientAddress = doc.metadata?.address || '';
            if (!clientAddress && unregEntry?.address) {
                clientAddress = unregEntry.address;
            }
            if (!clientAddress && unregId) {
                const { data: unregDoc } = await supabase.from('documents').select('metadata').eq('id', unregId).single();
                clientAddress = unregDoc?.metadata?.address || '';
            }
            profileData = { company_name: doc._companyName || unregEntry?.company_name || 'Cliente Manual', rut: unregEntry?.rut || doc.metadata?.rut || '', address: clientAddress || 'Chile' };
        } else {
            profileData = doc.profiles as { company_name: string; rut: string; address: string };
            if (!profileData) {
                const { data: profile } = await supabase.from('profiles').select('company_name, rut, address').eq('id', doc.user_id).single();
                if (!profile) return;
                profileData = profile;
            }
        }

        if (doc.type === 'pdf' || doc.type === 'report') {
            generateEcoReport({ company_name: profileData.company_name, rut: profileData.rut, address: profileData.address || 'Chile' }, doc.metadata.waste_details, doc.metadata.periodo || 'Reporte Reciclaje', action);
        } else if (doc.type === 'CGM') {
            generateCGM({ company_name: profileData.company_name, rut: profileData.rut, address: profileData.address || 'Chile' }, doc.metadata.waste_details, doc.metadata?.month || 'Mes', doc.metadata?.year || 2024, action, doc.metadata?.cgm_number);
        } else {
            generateCR({ company_name: profileData.company_name, rut: profileData.rut, address: profileData.address || 'Chile' }, doc.metadata.waste_details, doc.metadata.cert_number || doc.title, action, doc.metadata.withdrawal_date || doc.created_at?.split('T')[0]);
        }
    };

    const handleDeleteDocument = async (doc: AdminDocument) => {
        const ok = await confirm({
            title: 'Eliminar documento',
            message: '¿Estás seguro de que deseas eliminar este documento? Esta acción es irreversible.',
            confirmLabel: 'Sí, eliminar',
            danger: true,
        });
        if (!ok) return;
        try {
            if (doc.type === 'CR' && doc.metadata?.waste_details) {
                const totalWeight = doc.metadata.waste_details.reduce((acc: number, item: any) => acc + (Number(item.quantity) || 0), 0);
                const pointsToRevert = Math.round(totalWeight * 2);
                await supabase.rpc('increment_points', { user_id_param: doc.user_id, amount_param: -pointsToRevert });
                await supabase.from('points_transactions').insert([{ user_id: doc.user_id, amount: -pointsToRevert, reason: `Eliminación de Certificado ${doc.metadata.cert_number || doc.title}` }]);
            }
            const { error } = await supabase.from('documents').delete().eq('id', doc.id);
            if (error) throw error;
            fetchAdminData();
        } catch (err: any) {
            console.error('Error deleting document:', err);
            toast.error('Error al eliminar: ' + err.message);
        }
    };

    const handleUploadDocument = async () => {
        if (!uploadFile || !selectedUser || !uploadDate) { toast.warning('Por favor completa todos los campos y selecciona un archivo.'); return; }
        setLoading(true);
        try {
            const timestamp = Date.now();
            const cleanFileName = uploadFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
            const fileName = `${selectedUser.id}/${timestamp}_${cleanFileName}`;

            const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, uploadFile);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName);

            const { error: dbError } = await supabase.rpc('create_admin_document', {
                _user_id: selectedUser.id,
                _title: uploadFile.name,
                _type: uploadType,
                _content_url: publicUrl,
                _created_at: new Date(uploadDate).toISOString(),
                _metadata: { original_name: uploadFile.name, size: uploadFile.size, mime_type: uploadFile.type, uploaded_by: 'admin', source: uploadSource }
            });
            if (dbError) throw dbError;

            await createNotification({ userId: selectedUser.id, title: '📄 Nuevo Documento Disponible', message: `El administrador ha subido un nuevo documento: "${uploadFile.name}".`, type: 'document', metadata: { file_name: uploadFile.name, document_type: uploadType } });

            toast.success('Documento subido exitosamente.');
            setShowUploadModal(false);
            setUploadFile(null);
            setUploadDate(new Date().toISOString().split('T')[0]);
            setUploadSource('gestor');
            setUploadType('declaration');
            setSelectedUser(null);
            fetchAdminData();
        } catch (err: any) {
            toast.error('Error al subir el documento: ' + (err.message || 'Error desconocido'));
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateMonthlyReports = async () => {
        setLoading(true);
        try {
            const startDate = new Date(selectedYearGen, selectedMonthGen, 1).toISOString();
            const endDate = new Date(selectedYearGen, selectedMonthGen + 1, 0).toISOString();

            const { data: crDocs, error } = await supabase.from('documents').select('*').eq('type', 'CR').gte('created_at', startDate).lte('created_at', endDate);
            if (error) throw error;
            if (!crDocs || crDocs.length === 0) { toast.warning('No se encontraron Certificados de Recepción (CR) para este período.'); setLoading(false); return; }

            const userIds = Array.from(new Set(crDocs.map(d => d.user_id)));
            const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds);
            const profileMap = new Map((profiles || []).map(p => [p.id, p]));
            crDocs.forEach(doc => { doc.profiles = profileMap.get(doc.user_id); });

            const userGroups: Record<string, { profile: any; items: any[]; isUnregistered: boolean }> = {};
            crDocs.forEach(doc => {
                const isUnreg = !!doc.metadata?.unregistered_client_id;
                const docClientId = isUnreg ? doc.metadata.unregistered_client_id : doc.user_id;
                if (selectedUser && docClientId !== selectedUser.id) return;
                const uid = docClientId;
                if (!userGroups[uid]) userGroups[uid] = { profile: (selectedUser?.id === uid) ? selectedUser : doc.profiles, items: [], isUnregistered: isUnreg };
                const details = doc.metadata?.waste_details;
                if (details) { if (Array.isArray(details)) userGroups[uid].items.push(...details); else userGroups[uid].items.push(details); }
            });

            const newDocs = [];
            const monthName = new Date(selectedYearGen, selectedMonthGen).toLocaleString('es-CL', { month: 'long' });

            // Fetch current CGM count to assign sequential numbers
            const { count: existingCGMCount } = await supabase.from('documents').select('*', { count: 'exact', head: true }).eq('type', 'CGM');
            const cgmBaseNum = existingCGMCount || 0;
            let cgmIndex = 0;

            for (const [uid, group] of Object.entries(userGroups)) {
                const isUnregistered = group.isUnregistered || group.profile?.is_unregistered === true;
                const actualUserId = isUnregistered ? (await supabase.auth.getUser()).data.user?.id : uid;
                newDocs.push({
                    user_id: actualUserId,
                    title: `Certificado Gestión Mensual - ${monthName} ${selectedYearGen}`,
                    type: 'CGM',
                    verified: false,
                    created_at: new Date(selectedYearGen, selectedMonthGen, 15).toISOString(),
                    metadata: { month: monthName, year: selectedYearGen, waste_details: group.items, generated_by: 'Admin Batch Process', cgm_number: cgmBaseNum + cgmIndex + 1, unregistered_client_id: isUnregistered ? uid : undefined }
                });
                cgmIndex++;
            }

            if (newDocs.length > 0) {
                const { error: insError } = await supabase.from('documents').insert(newDocs);
                if (insError) throw insError;
                toast.success(`Se han generado ${newDocs.length} borradores de certificados mensuales. Revísalos en "Pendientes".`);
            }

            setShowMonthlyGenModal(false);
            fetchAdminData();
        } catch (err: any) {
            console.error(err);
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative font-sans bg-[#f0f4f0] min-h-screen text-slate-900 max-w-md md:max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-8 overflow-hidden">
            {/* Decorative Background */}
            <div className="absolute top-[-5%] left-[-10%] w-40 h-40 sm:w-[400px] sm:h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
            <div className="absolute top-[30%] right-[-20%] w-36 h-36 sm:w-[350px] sm:h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute bottom-[20%] left-[-15%] w-36 h-36 sm:w-[380px] sm:h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

            {/* Header */}
            <div className="p-6 sticky top-0 z-10 bg-white/70 backdrop-blur-md border-b border-white/40 flex items-center justify-between shadow-sm">
                <div>
                    <h2 className="text-xl font-display font-black text-gray-900">Panel Administrador</h2>
                    <span className="text-[10px] font-bold text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full">v1.6.8 - Pixel Perfect Final v5</span>
                </div>
                <button onClick={fetchAdminData} className="size-10 flex items-center justify-center bg-primary/10 hover:bg-primary/20 rounded-full text-primary border border-primary/20 transition-all">
                    <span className="material-symbols-outlined">refresh</span>
                </button>
            </div>

            <main className="p-4 space-y-8 relative z-10">
                {/* Document Editor (full screen overlay) */}
                {showDocEditor && (
                    <DocumentEditor
                        users={users}
                        onClose={() => setShowDocEditor(false)}
                        onSuccess={() => { fetchAdminData(); setShowDocEditor(false); }}
                    />
                )}

                {/* Modals */}
                <MonthlyGenModal
                    show={showMonthlyGenModal}
                    selectedUser={selectedUser}
                    selectedMonth={selectedMonthGen}
                    onMonthChange={setSelectedMonthGen}
                    selectedYear={selectedYearGen}
                    onYearChange={setSelectedYearGen}
                    onGenerate={handleGenerateMonthlyReports}
                    onClose={() => { setShowMonthlyGenModal(false); setSelectedUser(null); }}
                />

                <UploadDocumentModal
                    show={showUploadModal}
                    users={users}
                    selectedUser={selectedUser}
                    onSelectUser={setSelectedUser}
                    uploadDate={uploadDate}
                    onDateChange={setUploadDate}
                    uploadType={uploadType}
                    onTypeChange={setUploadType}
                    uploadSource={uploadSource}
                    onSourceChange={(src) => { setUploadSource(src); setUploadType(src === 'econexo' ? 'CR' : 'declaration'); }}
                    onFileChange={setUploadFile}
                    loading={loading}
                    onUpload={handleUploadDocument}
                    onClose={() => setShowUploadModal(false)}
                />

                <GenerateCRModal
                    show={showCRModal}
                    selectedUser={selectedUser}
                    onUserChange={setSelectedUser}
                    withdrawalDate={withdrawalDate}
                    onDateChange={setWithdrawalDate}
                    wasteItems={wasteItems}
                    currentWaste={currentWaste}
                    onCurrentWasteChange={setCurrentWaste}
                    onAddItem={handleAddWasteItem}
                    onRemoveItem={handleRemoveWasteItem}
                    onGenerate={handleGenerateCR}
                    onClose={() => setShowCRModal(false)}
                />

                {/* Quick Actions */}
                <section className="grid grid-cols-2 gap-4">
                    <button onClick={() => setShowDocEditor(true)} className="p-4 bg-white/60 backdrop-blur-2xl hover:bg-white/80 rounded-2xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex flex-col items-center gap-2 transition-all group">
                        <div className="size-10 bg-primary/10 rounded-full flex items-center justify-center text-primary border border-primary/20 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined">edit_document</span></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-900 group-hover:text-primary transition-colors">Crear Doc. Especial</span>
                    </button>
                    <button onClick={() => setShowUploadModal(true)} className="p-4 bg-white/60 backdrop-blur-2xl hover:bg-white/80 rounded-2xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex flex-col items-center gap-2 transition-all group">
                        <div className="size-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 border border-blue-100 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined">cloud_upload</span></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-900 group-hover:text-blue-500 transition-colors">Subir Documento</span>
                    </button>
                    <button onClick={() => setShowCommunityManager(true)} className="p-4 bg-white/60 backdrop-blur-2xl hover:bg-white/80 rounded-2xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex flex-col items-center gap-2 transition-all group col-span-2">
                        <div className="size-10 bg-green-50 rounded-full flex items-center justify-center text-green-600 border border-green-100 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined">nature_people</span></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-900 group-hover:text-green-600 transition-colors">Retiros Comunitarios</span>
                    </button>
                    <button onClick={() => setShowFixCerts(true)} className="p-4 bg-white/60 backdrop-blur-2xl hover:bg-white/80 rounded-2xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex flex-col items-center gap-2 transition-all group col-span-2">
                        <div className="size-10 bg-orange-50 rounded-full flex items-center justify-center text-orange-500 border border-orange-100 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined">build</span></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-900 group-hover:text-orange-500 transition-colors">Corregir Fechas / Direcciones</span>
                    </button>
                </section>

                {/* Sections */}
                <PendingDocsList
                    docs={pendingDocs}
                    onValidate={validateDoc}
                    onPreview={(doc) => handleViewCertificate(doc, 'preview')}
                    onDelete={handleDeleteDocument}
                />

                <SupportTicketsList
                    tickets={supportTickets}
                    onUpdateStatus={updateTicketStatus}
                />

                <UsersList
                    users={users}
                    onViewClient={(u) => { setClientOverviewUser(u); setShowClientOverview(true); }}
                    onShowUnregistered={() => setShowUnregisteredClients(true)}
                />

                <DocumentsHistory
                    certs={generatedCerts}
                    users={users}
                    adminPath={adminPath}
                    onPathChange={setAdminPath}
                    onViewCert={handleViewCertificate}
                    onDeleteCert={handleDeleteDocument}
                    onOpenCRModal={(u) => { setSelectedUser(u); setWasteItems([]); setShowCRModal(true); }}
                    onOpenMonthlyModal={(u) => { setSelectedUser(u); setShowMonthlyGenModal(true); }}
                />
            </main>

            <div className="absolute bottom-2 right-4 text-[10px] text-gray-400 font-bold z-50">v1.4</div>
            <Navbar />

            {/* Unregistered Clients Modal */}
            {showUnregisteredClients && (
                <UnregisteredClientsManager
                    onClose={() => setShowUnregisteredClients(false)}
                    onGenerateCR={(client: UnregisteredClient) => {
                        setShowUnregisteredClients(false);
                        setSelectedUser({ id: client.id, company_name: client.company_name, rut: client.rut, address: client.address, is_unregistered: true });
                        setWasteItems([]);
                        setShowCRModal(true);
                    }}
                    onGenerateCGM={(client: UnregisteredClient) => {
                        setShowUnregisteredClients(false);
                        setSelectedUser({ id: client.id, company_name: client.company_name, rut: client.rut, address: client.address, is_unregistered: true });
                        setShowMonthlyGenModal(true);
                    }}
                />
            )}

            {/* Client Overview Modal */}
            {showClientOverview && clientOverviewUser && (
                <ClientOverviewModal
                    user={clientOverviewUser}
                    onClose={() => { setShowClientOverview(false); setClientOverviewUser(null); fetchAdminData(); }}
                    onGenerateCR={() => { setSelectedUser(clientOverviewUser); setWasteItems([]); setShowCRModal(true); }}
                    onGenerateCGM={() => { setSelectedUser(clientOverviewUser); setShowMonthlyGenModal(true); }}
                />
            )}

            {/* Fix Certificates Tool */}
            {showFixCerts && (
                <FixCertificatesModal
                    onClose={() => setShowFixCerts(false)}
                    onDataFixed={fetchAdminData}
                />
            )}

            {/* Community Withdrawals Manager */}
            {showCommunityManager && (
                <CommunityWithdrawalsManager
                    onClose={() => setShowCommunityManager(false)}
                />
            )}
        </div>
    );
};

export default Admin;
