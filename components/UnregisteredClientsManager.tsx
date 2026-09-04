import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';

export interface UnregisteredClient {
    id: string; // The ID of the document storing the metadata
    company_name: string;
    rut: string;
    address: string;
    email: string;
    linked_user_id: string | null;
    created_at: string;
}

interface Props {
    onClose: () => void;
    onGenerateCR?: (client: UnregisteredClient) => void;
    onGenerateCGM?: (client: UnregisteredClient) => void;
}

const UnregisteredClientsManager: React.FC<Props> = ({ onClose, onGenerateCR, onGenerateCGM }) => {
    const toast = useToast();
    const confirm = useConfirm();
    const [clients, setClients] = useState<UnregisteredClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    
    // Link functionality state
    const [linkingClient, setLinkingClient] = useState<UnregisteredClient | null>(null);
    const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);
    const [selectedUserIdToLink, setSelectedUserIdToLink] = useState<string>('');
    const [linking, setLinking] = useState(false);

    const [formData, setFormData] = useState({
        company_name: '',
        rut: '',
        address: '',
        email: ''
    });

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('documents')
                .select('*')
                .eq('type', 'UNREGISTERED_CLIENT')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mapped = (data || []).map(doc => ({
                id: doc.id,
                company_name: doc.metadata?.company_name || 'Sin Nombre',
                rut: doc.metadata?.rut || '',
                address: doc.metadata?.address || '',
                email: doc.metadata?.email || '',
                linked_user_id: doc.metadata?.linked_user_id || null,
                created_at: doc.created_at
            }));

            setClients(mapped);

            const { data: usersData } = await supabase.from('profiles').select('id, company_name, rut').order('company_name');
            if (usersData) setRegisteredUsers(usersData);

        } catch (err) {
            console.error('Error fetching unregistered clients:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveClient = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user found");

            const { error } = await supabase.from('documents').insert([{
                user_id: user.id, // Admin ID
                title: `Cliente Manual: ${formData.company_name}`,
                type: 'UNREGISTERED_CLIENT',
                verified: true,
                metadata: {
                    ...formData,
                    linked_user_id: null
                }
            }]);

            if (error) throw error;

            toast.success('Cliente guardado exitosamente');
            setFormData({ company_name: '', rut: '', address: '', email: '' });
            setShowForm(false);
            fetchClients();
        } catch (err: any) {
            toast.error('Error al guardar cliente: ' + err.message);
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Eliminar cliente manual',
            message: '¿Seguro que deseas eliminar este cliente? Se perderá el acceso rápido a la generación de sus documentos, pero los documentos ya emitidos no se eliminarán.',
            confirmLabel: 'Sí, eliminar',
            danger: true,
        });
        if (!ok) return;
        
        try {
            const { error } = await supabase.from('documents').delete().eq('id', id);
            if (error) throw error;
            fetchClients();
        } catch (err: any) {
            toast.error('Error eliminando: ' + err.message);
        }
    };

    const handleLinkAccount = async () => {
        if (!linkingClient || !selectedUserIdToLink) return;
        const ok2 = await confirm({
            title: 'Vincular historial',
            message: '¿Estás seguro de vincular todo el historial de este cliente manual a la cuenta registrada seleccionada? Esta acción no se puede deshacer.',
            confirmLabel: 'Sí, vincular',
        });
        if (!ok2) return;

        setLinking(true);
        try {
            // 1. Fetch all documents currently belonging to this manual client
            // We find them by metadata->unregistered_client_id
            const { data: docsLinked, error: searchError } = await supabase
                .from('documents')
                .select('id, metadata')
                .eq('metadata->>unregistered_client_id', linkingClient.id);

            if (searchError) throw searchError;

            // 2. Update each document to belong to the real user
            if (docsLinked && docsLinked.length > 0) {
                for (const doc of docsLinked) {
                    const newMetadata = { ...doc.metadata };
                    delete newMetadata.unregistered_client_id;
                    
                    await supabase.from('documents').update({
                        user_id: selectedUserIdToLink,
                        metadata: newMetadata
                    }).eq('id', doc.id);
                }
            }

            // 3. Delete the manual client document
            await supabase.from('documents').delete().eq('id', linkingClient.id);

            toast.success('Cuenta vinculada correctamente. El historial ha sido migrado.');
            setLinkingClient(null);
            setSelectedUserIdToLink('');
            fetchClients();

        } catch (err: any) {
            toast.error('Error al vincular: ' + err.message);
        } finally {
            setLinking(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose}></div>
            
            <div className="relative bg-[#f0f4f0] w-full max-w-2xl rounded-[32px] border border-white/80 shadow-2xl flex flex-col h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 bg-white/70 backdrop-blur-md border-b border-white/40 flex items-center justify-between shrink-0 shadow-sm z-10">
                    <div>
                        <h2 className="text-xl font-display font-black text-gray-900">Clientes Manuales</h2>
                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mt-0.5">Empresas no registradas</p>
                    </div>
                    <button onClick={onClose} className="size-10 bg-white hover:bg-gray-50 rounded-full flex items-center justify-center text-gray-500 shadow-sm transition-colors">
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 relative z-0">
                    {!showForm ? (
                        <>
                            <button 
                                onClick={() => setShowForm(true)}
                                className="w-full py-4 bg-white/60 hover:bg-white/80 border border-white/80 rounded-2xl flex items-center justify-center gap-2 text-primary shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] transition-all font-black uppercase tracking-widest text-xs"
                            >
                                <span className="material-symbols-outlined text-base">person_add</span>
                                Nuevo Cliente Manual
                            </button>

                            {loading ? (
                                <div className="text-center py-8 text-xs font-bold text-gray-400 uppercase tracking-widest">Cargando...</div>
                            ) : clients.length === 0 ? (
                                <div className="p-8 text-center bg-white/40 backdrop-blur-sm rounded-3xl border border-dashed border-gray-300">
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">No hay clientes manuales</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {clients.map(client => (
                                        <div key={client.id} className="bg-white/60 backdrop-blur-2xl p-5 rounded-3xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] flex items-center gap-4 group">
                                            <div className="size-12 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center font-bold border border-gray-200 uppercase text-lg shrink-0">
                                                {client.company_name[0] || '?'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm text-gray-900 truncate">{client.company_name}</p>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{client.rut} • {client.email}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {onGenerateCR && (
                                                    <button 
                                                        onClick={() => onGenerateCR(client)}
                                                        className="size-9 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl flex items-center justify-center border border-transparent transition-colors"
                                                        title="Generar Certificado (CT)"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">verified</span>
                                                    </button>
                                                )}
                                                {onGenerateCGM && (
                                                    <button 
                                                        onClick={() => onGenerateCGM(client)}
                                                        className="size-9 bg-orange-50 text-orange-500 hover:bg-orange-100 rounded-xl flex items-center justify-center border border-transparent transition-colors"
                                                        title="Generar CGM"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">calendar_add_on</span>
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => setLinkingClient(client)}
                                                    className="size-9 bg-blue-50 text-blue-500 hover:bg-blue-100 rounded-xl flex items-center justify-center border border-transparent transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Vincular a Cuenta Registrada"
                                                >
                                                    <span className="material-symbols-outlined text-lg">link</span>
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(client.id)}
                                                    className="size-9 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl flex items-center justify-center border border-transparent transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Eliminar Cliente"
                                                >
                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <form onSubmit={handleSaveClient} className="bg-white/60 backdrop-blur-2xl p-6 rounded-3xl border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] space-y-4">
                            <h3 className="text-sm font-black uppercase text-gray-900 mb-4">Registrar Cliente Manual</h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-primary ml-1">Razón Social</label>
                                    <input 
                                        required
                                        value={formData.company_name}
                                        onChange={e => setFormData(p => ({ ...p, company_name: e.target.value }))}
                                        className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-primary/50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-primary ml-1">RUT</label>
                                    <input 
                                        required
                                        value={formData.rut}
                                        onChange={e => setFormData(p => ({ ...p, rut: e.target.value }))}
                                        className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-primary/50"
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-primary ml-1">Dirección Completa</label>
                                <input 
                                    required
                                    value={formData.address}
                                    onChange={e => setFormData(p => ({ ...p, address: e.target.value }))}
                                    className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-primary/50"
                                />
                            </div>
                            
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-primary ml-1">Email de Contacto</label>
                                <input 
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                                    className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-primary/50"
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="submit" className="flex-1 py-3 bg-primary text-background-dark rounded-xl font-black uppercase tracking-widest text-xs hover:shadow-lg transition-all">
                                    Guardar Cliente
                                </button>
                                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-gray-200 transition-colors">
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {/* Modal de Vinculación */}
                {linkingClient && (
                    <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex items-center justify-center p-6">
                        <div className="bg-white border border-gray-100 shadow-2xl rounded-3xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-200">
                            <div className="text-center space-y-1 mb-6">
                                <div className="size-12 bg-blue-50 text-blue-500 rounded-2xl mx-auto flex items-center justify-center mb-3">
                                    <span className="material-symbols-outlined text-2xl">link</span>
                                </div>
                                <h3 className="text-lg font-black text-gray-900">Vincular Cuenta</h3>
                                <p className="text-xs font-bold text-gray-500">Migrar historial de <span className="text-gray-900 uppercase">{linkingClient.company_name}</span></p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-primary ml-1">Seleccionar Cuenta Registrada</label>
                                <select 
                                    value={selectedUserIdToLink}
                                    onChange={e => setSelectedUserIdToLink(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-primary/50"
                                >
                                    <option value="" disabled>Seleccione una empresa...</option>
                                    {registeredUsers.map(u => (
                                        <option key={u.id} value={u.id}>{u.company_name} ({u.rut})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button 
                                    onClick={handleLinkAccount}
                                    disabled={!selectedUserIdToLink || linking}
                                    className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {linking ? (
                                        <>Procesando...</>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[14px]">link</span>
                                            Vincular y Migrar
                                        </>
                                    )}
                                </button>
                                <button 
                                    onClick={() => { setLinkingClient(null); setSelectedUserIdToLink(''); }}
                                    disabled={linking}
                                    className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-gray-200 transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UnregisteredClientsManager;
