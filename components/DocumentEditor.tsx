import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { generateCustomDoc } from '../services/pdfGenerator';
import { CompanyProfile } from '../types';
import { ECONEXO_SIGNATURE } from '../services/constants';

interface DocumentEditorProps {
    users: any[];
    onClose: () => void;
    onSuccess: () => void;
}

// CR Base Template
const CR_TEMPLATE = `
<p><strong>Fecha:</strong> [FECHA_ACTUAL]</p>
<p><strong>Señor(es):</strong> [RAZON_SOCIAL]</p>
<p><strong>RUT:</strong> [RUT_CLIENTE]</p>
<p><strong>Dirección:</strong> [DIRECCION_CLIENTE]</p>
<br>
<h3 style="text-align: center;">CERTIFICADO DE RECEPCIÓN DE MATERIAL</h3>
<br>
<table style="width: 100%; border-collapse: collapse; border: 1px solid #ccc;">
  <thead>
    <tr style="background-color: #f0f0f0;">
      <th style="border: 1px solid #ccc; padding: 8px;">ITEM</th>
      <th style="border: 1px solid #ccc; padding: 8px;">MATERIAL</th>
      <th style="border: 1px solid #ccc; padding: 8px;">RECEPCIÓN</th>
      <th style="border: 1px solid #ccc; padding: 8px;">CANTIDAD (Kg)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">1</td>
      <td style="border: 1px solid #ccc; padding: 8px;">&nbsp;</td>
      <td style="border: 1px solid #ccc; padding: 8px;">&nbsp;</td>
      <td style="border: 1px solid #ccc; padding: 8px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">2</td>
      <td style="border: 1px solid #ccc; padding: 8px;">&nbsp;</td>
      <td style="border: 1px solid #ccc; padding: 8px;">&nbsp;</td>
      <td style="border: 1px solid #ccc; padding: 8px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="border: 1px solid #ccc; padding: 8px;" colspan="3" align="right"><strong>Total</strong></td>
      <td style="border: 1px solid #ccc; padding: 8px;">&nbsp;</td>
    </tr>
  </tbody>
</table>
<br>
<p><strong>Se establece que:</strong></p>
<p style="text-align: justify;">- El material recolectado por EcoNexo, abarcando tanto residuos de origen domiciliario como no domiciliario, es cuidadosamente entregado a puntos de acopio gestionados por operadores autorizados. Este proceso asegura un traslado responsable hacia Santiago, donde el material es sometido a procesos de tratamiento y reciclaje adecuados.</p>
<br>
<br>
<br>
<br>
<table style="width: 100%; border: none;">
  <tr>
    <td style="width: 45%; text-align: center; vertical-align: bottom; line-height: 0.7 !important;">
       <div style="margin: 0; padding: 0;">_________________________</div>
       <div style="margin: 0; padding: 0; margin-top: -10px;"><strong>Firma Cliente</strong></div>
       <div style="margin: 0; padding: 0;">[RAZON_SOCIAL]</div>
    </td>
    <td style="width: 10%;"></td>
    <td style="width: 45%; text-align: center; vertical-align: bottom; line-height: 0.7 !important;">
       [SIGNATURE_IMAGE_PLACEHOLDER]
       <div style="margin: 0; padding: 0;">_________________________</div>
       <div style="margin: 0; padding: 0; margin-top: -10px;"><strong>Sebastián Frías Thompson</strong></div>
       <div style="margin: 0; padding: 0;">CEO EcoNexo</div>
    </td>
  </tr>
</table>
`;

const DocumentEditor: React.FC<DocumentEditorProps> = ({ users, onClose, onSuccess }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [loading, setLoading] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // Initialize with Template
    useEffect(() => {
        if (!content) {
            const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
            let initialContent = CR_TEMPLATE.replace('[FECHA_ACTUAL]', today);

            // Inject Signature Image - Larger and lowered to center over the name "Frías"
            const sigImg = `<img src="${ECONEXO_SIGNATURE}" style="width: 190px; height: auto; margin: 0 auto -58px auto; display: block;" alt="Firma EcoNexo" />`;
            initialContent = initialContent.replace('[SIGNATURE_IMAGE_PLACEHOLDER]', sigImg);

            setContent(initialContent);
            if (contentRef.current) contentRef.current.innerHTML = initialContent;
        }
    }, []);

    // Update Template when User is Selected
    useEffect(() => {
        if (selectedUserId && contentRef.current) {
            const user = users.find(u => u.id === selectedUserId);
            if (user) {
                let currentHTML = contentRef.current.innerHTML;

                // Replace placeholders with specific user data
                // Sanitize user data before injecting into HTML to prevent XSS
                const escapeHtml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                currentHTML = currentHTML.replace(/\[RAZON_SOCIAL\]/g, escapeHtml(user.company_name || '_________'));
                currentHTML = currentHTML.replace(/\[RUT_CLIENTE\]/g, escapeHtml(user.rut || '_________'));
                currentHTML = currentHTML.replace(/\[DIRECCION_CLIENTE\]/g, escapeHtml(user.address || '_________'));

                // Update state and ref
                setContent(currentHTML);
                contentRef.current.innerHTML = currentHTML;
            }
        }
    }, [selectedUserId, users]);

    // Simple command to execute formatting
    const handleFormat = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        if (contentRef.current) setContent(contentRef.current.innerHTML);
    };

    const handleAddRow = () => {
        if (!contentRef.current) return;
        const tbody = contentRef.current.querySelector('tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const totalRowIndex = rows.findIndex(row => row.innerText.toLowerCase().includes('total'));

        // Rows before total are items
        const itemRows = totalRowIndex !== -1 ? rows.slice(0, totalRowIndex) : rows;
        const nextItemNumber = itemRows.length + 1;

        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${nextItemNumber}</td>
            <td style="border: 1px solid #ccc; padding: 8px;">&nbsp;</td>
            <td style="border: 1px solid #ccc; padding: 8px;">&nbsp;</td>
            <td style="border: 1px solid #ccc; padding: 8px;">&nbsp;</td>
        `;

        if (totalRowIndex !== -1) {
            tbody.insertBefore(newRow, rows[totalRowIndex]);
        } else {
            tbody.appendChild(newRow);
        }

        setContent(contentRef.current.innerHTML);
    };

    const handleRemoveRow = () => {
        if (!contentRef.current) return;
        const tbody = contentRef.current.querySelector('tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const totalRowIndex = rows.findIndex(row => row.innerText.toLowerCase().includes('total'));
        const itemRows = totalRowIndex !== -1 ? rows.slice(0, totalRowIndex) : rows;

        if (itemRows.length > 1) { // Keep at least one row
            tbody.removeChild(itemRows[itemRows.length - 1]);
            setContent(contentRef.current.innerHTML);
        }
    };

    const handleSave = async () => {
        if (!title || !selectedUserId) {
            alert('Por favor completa el título y selecciona un destinatario.');
            return;
        }

        setLoading(true);
        try {
            const selectedUser = users.find(u => u.id === selectedUserId);
            if (!selectedUser) throw new Error('Usuario no encontrado');

            // Generate "Reference" number
            const docRef = `DOC-${Date.now().toString().slice(-6)}`;

            // Use current content from ref to ensure latest edits
            const currentContent = contentRef.current?.innerHTML || content;

            // Generate PDF Blob
            generateCustomDoc(
                {
                    company_name: selectedUser.company_name,
                    rut: selectedUser.rut,
                    address: selectedUser.address || 'Chile'
                },
                title,
                currentContent, // HTML content
                docRef
            );

            // Save to Database
            const { error } = await supabase.from('documents').insert([{
                user_id: selectedUser.id,
                title: title,
                type: 'custom',
                verified: true,
                metadata: {
                    reference_number: docRef,
                    generated_by: 'Admin Custom Editor',
                    custom_content: currentContent, // Store raw HTML
                    original_title: title
                }
            }]);

            if (error) throw error;

            alert('Documento generado y guardado exitosamente.');
            onSuccess();
            onClose();

        } catch (err: any) {
            alert('Error al guardar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-background-dark/90 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative bg-white dark:bg-surface-dark w-full max-w-4xl h-[90vh] rounded-[32px] border border-white/10 shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-gray-50 dark:bg-white/5">
                    <div>
                        <h3 className="text-xl font-display font-black text-slate-900 dark:text-white">Editor de Documentos</h3>
                        <p className="text-xs text-slate-500 dark:text-gray-400 font-medium">Crea documentos oficiales personalizados</p>
                    </div>
                    <button onClick={onClose} className="size-10 flex items-center justify-center bg-gray-200 dark:bg-white/10 rounded-full hover:bg-gray-300 dark:hover:bg-white/20 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Toolbar & Meta */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-gray-100 dark:border-white/5">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Título del Documento</label>
                        <input
                            className="w-full bg-gray-100 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary font-bold transition-all"
                            placeholder="Ej: Carta de Compromiso Ambiental"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Destinatario (Cliente)</label>
                        <select
                            className="w-full bg-gray-100 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary font-bold transition-all appearance-none cursor-pointer"
                            value={selectedUserId}
                            onChange={e => setSelectedUserId(e.target.value)}
                        >
                            <option value="">Seleccionar Empresa...</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.company_name || 'Sin Nombre'} ({u.rut || 'N/A'})</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Editor Toolbar */}
                <div className="px-6 py-3 bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5 flex items-center gap-2 overflow-x-auto">
                    {[
                        { icon: 'format_bold', cmd: 'bold', title: 'Negrita' },
                        { icon: 'format_italic', cmd: 'italic', title: 'Cursiva' },
                        { icon: 'format_underlined', cmd: 'underline', title: 'Subrayado' },
                        { type: 'separator' },
                        { icon: 'format_list_bulleted', cmd: 'insertUnorderedList', title: 'Lista' },
                        { icon: 'format_list_numbered', cmd: 'insertOrderedList', title: 'Lista Numérica' },
                        { type: 'separator' },
                        { icon: 'format_align_left', cmd: 'justifyLeft', title: 'Izquierda' },
                        { icon: 'format_align_center', cmd: 'justifyCenter', title: 'Centro' },
                        { icon: 'format_align_right', cmd: 'justifyRight', title: 'Derecha' },
                        { type: 'separator' },
                        { icon: 'add_row', cmd: '', title: 'Agregar Fila', action: handleAddRow },
                        { icon: 'delete_sweep', cmd: '', title: 'Eliminar Fila', action: handleRemoveRow },
                    ].map((tool, idx) => (
                        tool.type === 'separator' ? (
                            <div key={idx} className="w-px h-6 bg-gray-300 dark:bg-white/10 mx-2"></div>
                        ) : (
                            <button
                                key={idx}
                                onClick={() => tool.action ? tool.action() : handleFormat(tool.cmd!)}
                                className="p-2 hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg text-slate-600 dark:text-gray-300 transition-colors"
                                title={tool.title}
                            >
                                <span className="material-symbols-outlined text-xl">{tool.icon}</span>
                            </button>
                        )
                    ))}
                </div>

                {/* Editor Content Area */}
                <div className="flex-1 p-6 bg-gray-50/50 dark:bg-black/20 overflow-y-auto">
                    <div className="max-w-[210mm] mx-auto bg-white min-h-[297mm] shadow-lg p-[25mm] text-slate-900 border border-gray-200">
                        {/* Visual Header Mockup */}
                        <div className="flex justify-between items-start border-b-2 border-primary pb-6 mb-8 opacity-50 pointer-events-none select-none grayscale">
                            <img src="/logo_econexo_new.png" className="h-12 w-auto object-contain" alt="Logo" />
                            <div className="text-right text-[10px] text-gray-500 leading-tight">
                                <p className="font-bold uppercase tracking-widest text-primary">Gestión Ambiental</p>
                                <p>Certificación y Trazabilidad</p>
                                <p>Antofagasta</p>
                            </div>
                        </div>

                        {/* Editable Area */}
                        <div
                            ref={contentRef}
                            className="outline-none min-h-[500px] prose prose-slate max-w-none text-justify font-serif"
                            contentEditable
                            onInput={e => setContent(e.currentTarget.innerHTML)}
                            style={{ whiteSpace: 'pre-wrap' }}
                            data-placeholder="El contenido se cargará aquí..."
                        >
                        </div>

                        {/* Visual Footer Mockup */}
                        <div className="mt-12 pt-8 border-t border-gray-100 text-center opacity-50 pointer-events-none select-none grayscale">
                            <p className="text-[10px] text-gray-400 font-medium">Documento generado oficialmente por plataforma Econexo.</p>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="p-6 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-white/5 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 rounded-xl border border-gray-200 dark:border-white/10 text-slate-600 dark:text-gray-400 font-bold text-xs uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-8 py-3 bg-primary text-background-dark rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
                    >
                        {loading ? (
                            <>
                                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                Generando...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-sm">save_as</span>
                                Generar Documento
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DocumentEditor;
