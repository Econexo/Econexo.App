
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { supabase } from '../services/supabase';
import { generateCR, generateEcoReport, generateCGM } from '../services/pdfGenerator';

interface Document {
  id: string;
  title: string;
  type: string;
  created_at: string;
  verified: boolean;
  content_url?: string;
  metadata?: {
    cert_number: string;
    waste_details: any;
    generated_by: string;
    periodo?: string;
    months_count?: number;
    month?: string;
    year?: number;
    source_document_ids?: string[];
  };
}

const Documents: React.FC = () => {
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [driveLinked, setDriveLinked] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [currentSection, setCurrentSection] = useState<'root' | 'econexo' | 'gestores'>('root');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [rangeStart, setRangeStart] = useState(0); // January
  const [rangeEnd, setRangeEnd] = useState(2); // March

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  useEffect(() => {
    fetchDocuments();
    fetchUserProfile();
  }, []);

  // Define folder structure constants
  const ROOT_SECTIONS = [
    { id: 'econexo', name: 'Econexo', icon: 'forest', color: 'bg-primary', description: 'Documentación Ambiental' },
    { id: 'gestores', name: 'Gestores', icon: 'local_shipping', color: 'bg-blue-600', description: 'Documentos de Terceros' }
  ];

  const ECONEXO_FOLDERS = [
    { id: 'recepcion', name: 'Recepción (CR)', icon: 'verified', color: 'bg-primary', types: ['CR'] },
    { id: 'mensual', name: 'Gestión Mensual', icon: 'calendar_month', color: 'bg-orange-500', types: ['CGM'] },
    { id: 'reportes', name: 'Reportes de Impacto', icon: 'analytics', color: 'bg-green-600', types: ['pdf', 'report'] }
  ];

  const GESTORES_FOLDERS = [
    { id: 'declaraciones', name: 'Certificados', icon: 'assignment', color: 'bg-purple-500', types: ['declaration', 'legal', 'custom'] }
  ];

  // Helper to get current folders list based on section
  const getCurrentFolders = () => {
    if (currentSection === 'econexo') return ECONEXO_FOLDERS;
    if (currentSection === 'gestores') return GESTORES_FOLDERS;
    return [];
  };

  // Helper to find folder config by id across all lists
  const getFolderConfig = (id: string | null) => {
    if (!id) return null;
    return [...ECONEXO_FOLDERS, ...GESTORES_FOLDERS].find(f => f.id === id);
  };

  // Logic to get available years for a folder
  const getYearsForFolder = () => {
    const folder = getFolderConfig(selectedFolder);
    let typesToCheck = folder?.types || [];

    // If we are in Reportes, use CRs time-range as reference optionally
    if (selectedFolder === 'reportes') {
      typesToCheck = [...typesToCheck, 'CR'];
    }

    const folderDocs = documents.filter(doc => typesToCheck.includes(doc.type));
    const years = [...new Set(folderDocs.map(doc => new Date(doc.created_at).getFullYear()))];
    return years.sort((a, b) => b - a);
  };

  // Logic to get available months for a year in a folder
  const getMonthsForYear = () => {
    const folder = getFolderConfig(selectedFolder);
    let typesToCheck = folder?.types || [];

    if (selectedFolder === 'reportes') {
      typesToCheck = [...typesToCheck, 'CR'];
    }

    const yearDocs = documents.filter(doc =>
      typesToCheck.includes(doc.type) &&
      new Date(doc.created_at).getFullYear() === selectedYear
    );
    const months = [...new Set(yearDocs.map(doc => new Date(doc.created_at).getMonth()))];
    return months.sort((a, b) => b - a);
  };

  const fetchUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) setUserProfile(data);
    }
  };

  const handleDownload = (doc: Document, action: 'save' | 'preview' = 'save') => {
    // Direct Download for Uploaded Documents (Gestores)
    if (doc.content_url) {
      window.open(doc.content_url, '_blank');
      return;
    }

    if (!doc.metadata || !userProfile) {
      alert("Este documento no tiene metadatos para regeneración o el perfil no ha cargado.");
      return;
    }

    try {
      const details = doc.metadata.waste_details;
      if (!details) {
        alert("El documento no contiene detalles de residuos.");
        return;
      }

      const items = Array.isArray(details) ? details : [details];

      // Clean up items to ensure they are valid WasteItem objects
      const validItems = items.filter(item => item && (item.quantity !== undefined || item.weight !== undefined));

      if (validItems.length === 0) {
        alert("No hay ítems válidos para procesar en este documento.");
        return;
      }

      const clientData = {
        company_name: userProfile.company_name,
        rut: userProfile.rut,
        address: userProfile.address || 'Chile'
      };



      if (doc.type === 'pdf' || doc.type === 'report') {
        generateEcoReport(
          clientData,
          validItems,
          doc.metadata.periodo || 'Reporte Reciclaje',
          action,
          doc.metadata.months_count // Pass custom months count for correct baseline calculation
        );
      } else if (doc.type === 'CGM') {
        const month = doc.metadata?.month || 'Mes';
        const year = doc.metadata?.year || 2024;
        generateCGM(
          clientData,
          Array.isArray(doc.metadata.waste_details) ? doc.metadata.waste_details : [],
          month,
          year,
          action
        );
      } else {
        generateCR(
          clientData,
          validItems,
          doc.metadata.cert_number || 'CR-000',
          action
        );
      }
    } catch (error: any) {
      console.error("Download error:", error);
      alert("Error al procesar el archivo: " + (error.message || "Error desconocido"));
    }
  };

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar "${doc.title}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const { error } = await supabase.from('documents').delete().eq('id', doc.id);
      if (error) throw error;

      // Update local state
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch (err: any) {
      console.error('Error deleting document:', err);
      alert('Error al eliminar el documento: ' + err.message);
    }
  };

  const addTestDocument = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      // Use current view as date reference
      const now = new Date();
      const testDate = new Date(
        selectedYear || now.getFullYear(),
        selectedMonth !== null ? selectedMonth : now.getMonth(),
        15 // Middle of the month
      );

      const { error } = await supabase.from('documents').insert([
        {
          user_id: userData.user.id,
          title: `Certificado de Prueba ${testDate.toLocaleDateString()} `,
          type: 'CR',
          verified: true,
          created_at: testDate.toISOString(),
          metadata: {
            cert_number: `CR-TEST-${Math.floor(100 + Math.random() * 900)}`,
            waste_details: [
              { waste_type: "Papel/Cartón", quantity: 150.5, unit: "Kg", description: "Cartón corrugado" },
              { waste_type: "Plásticos", quantity: 85.2, unit: "Kg", description: "Film stretch y PET" },
              { waste_type: "Vidrio", quantity: 40, unit: "Kg", description: "Botellas de vidrio" }
            ]
          }
        }
      ]);

      if (error) throw error;
      fetchDocuments();
      alert(`¡Certificado creado para ${testDate.toLocaleDateString()}! Ahora ya puedes generar el reporte.`);
    } catch (err) {
      console.error('Error adding document:', err);
    }
  };

  const filteredDocuments = (selectedFolder && selectedYear !== null)
    ? documents.filter(doc => {
      const folder = getFolderConfig(selectedFolder);
      if (!folder?.types.includes(doc.type)) return false;

      const date = new Date(doc.created_at);

      // For CGM and Reports, check metadata first
      if (doc.type === 'CGM' || doc.type === 'report' || doc.type === 'pdf') {
        // CGM special check? or just fallback to date creation for now
        // Ideally CGM has date in metadata, but usually creation date matches.
      }

      // For reports, prioritize metadata period, but fallback to creation date for legacy docs
      if (doc.type === 'report' || doc.type === 'pdf') {
        const period = (doc.metadata?.periodo || '').toUpperCase();

        if (period) {
          const isInYear = period.includes(selectedYear.toString());
          if (selectedMonth === null) {
            return isInYear && period.includes('AÑO');
          } else {
            const monthName = monthNames[selectedMonth].toUpperCase();
            return isInYear && period.includes(monthName);
          }
        }
      }

      // Fallback or for CRs/CGMs: use creation date
      if (selectedMonth === null) return false;
      return date.getFullYear() === selectedYear && date.getMonth() === selectedMonth;
    })
    : [];

  const handleGenerateReport = async (overrideYear?: any) => {
    if (!userProfile) return;

    // Safety check: ensure year is a number. 
    // Sometimes React events or objects can leak into arguments if not handled carefully.
    const yearVal = (typeof overrideYear === 'number') ? overrideYear : (selectedYear || new Date().getFullYear());
    const targetYear = Number(yearVal);
    const targetMonth = (typeof overrideYear === 'number') ? null : selectedMonth;

    // Determine period string for the report title and filtering
    let period = 'Histórico Global';
    if (targetYear !== null && targetYear !== undefined) {
      if (targetMonth !== null && targetMonth !== undefined) {
        period = `${monthNames[targetMonth].toUpperCase()} ${targetYear}`;
      } else {
        period = `AÑO ${targetYear}`;
      }
    }

    // Filter items based on criteria
    const docsToReport = documents.filter(doc => {
      const date = new Date(doc.created_at);
      const yearMatches = date.getFullYear() === targetYear;
      const monthMatches = targetMonth === null || date.getMonth() === targetMonth;

      const isSourceDoc = (doc.type === 'CR' || doc.type === 'verified');
      return yearMatches && monthMatches && isSourceDoc && doc.verified;
    });

    if (docsToReport.length === 0) {
      alert(`No hay documentos certificados (CR) válidos en ${period.toLowerCase()} para generar un reporte.`);
      return;
    }

    const reportItems: any[] = [];
    docsToReport.forEach(doc => {
      if (doc.metadata?.waste_details) {
        const details = Array.isArray(doc.metadata.waste_details)
          ? doc.metadata.waste_details
          : [doc.metadata.waste_details];
        reportItems.push(...details);
      }
    });

    if (reportItems.length === 0) {
      alert('No se encontraron detalles de residuos en los documentos seleccionados.');
      return;
    }

    try {
      setLoading(true);
      generateEcoReport(
        {
          company_name: userProfile.company_name,
          rut: userProfile.rut,
          address: userProfile.address || 'Chile'
        },
        reportItems,
        period
      );

      // Save record to DB
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('documents').insert([{
          user_id: user.id,
          title: `Reporte de Impacto - ${period}`,
          type: 'report',
          verified: true,
          metadata: {
            periodo: period,
            waste_details: reportItems,
            source_document_ids: docsToReport.map(d => d.id)
          }
        }]);
        fetchDocuments();
      }
    } catch (err: any) {
      console.error("Report generation error:", err);
      alert("Hubo un error al generar el reporte: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCustomRange = async () => {
    if (!userProfile || selectedYear === null) return;

    if (rangeEnd < rangeStart) {
      alert('El mes de término debe ser posterior o igual al mes de inicio.');
      return;
    }

    const startMonthName = monthNames[rangeStart];
    const endMonthName = monthNames[rangeEnd];
    const period = `${startMonthName.toUpperCase()} - ${endMonthName.toUpperCase()} ${selectedYear}`;

    // Calculate months count
    const monthsCount = rangeEnd - rangeStart + 1;

    // Filter documents
    const docsToReport = documents.filter(doc => {
      const date = new Date(doc.created_at);
      const yearMatches = date.getFullYear() === selectedYear;
      const month = date.getMonth();
      const monthMatches = month >= rangeStart && month <= rangeEnd;

      const isSourceDoc = (doc.type === 'CR' || doc.type === 'verified');
      return yearMatches && monthMatches && isSourceDoc && doc.verified;
    });

    if (docsToReport.length === 0) {
      alert(`No hay documentos certificados (CR) válidos en el periodo ${period} para generar un reporte.`);
      return;
    }

    const reportItems: any[] = [];
    docsToReport.forEach(doc => {
      if (doc.metadata?.waste_details) {
        const details = Array.isArray(doc.metadata.waste_details)
          ? doc.metadata.waste_details
          : [doc.metadata.waste_details];
        reportItems.push(...details);
      }
    });

    if (reportItems.length === 0) {
      alert('No se encontraron detalles de residuos en los documentos seleccionados.');
      return;
    }

    try {
      setLoading(true);
      generateEcoReport(
        {
          company_name: userProfile.company_name,
          rut: userProfile.rut,
          address: userProfile.address || 'Chile'
        },
        reportItems,
        period,
        'save',
        monthsCount
      );

      // Save record
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('documents').insert([{
          user_id: user.id,
          title: `Reporte Rango - ${period}`,
          type: 'report',
          verified: true,
          metadata: {
            periodo: period,
            waste_details: reportItems,
            source_document_ids: docsToReport.map(d => d.id),
            months_count: monthsCount
          }
        }]);
        fetchDocuments();
        setShowRangeModal(false);
      }
    } catch (err: any) {
      console.error("Report generation error:", err);
      alert("Hubo un error al generar el reporte: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (selectedMonth !== null) setSelectedMonth(null);
    else if (selectedYear !== null) setSelectedYear(null);
    else if (selectedFolder !== null) setSelectedFolder(null);
    else if (currentSection !== 'root') setCurrentSection('root');
    else navigate(-1);
  };

  return (
    <div className="relative font-display bg-[#f0f4f0] min-h-screen text-slate-900 max-w-md mx-auto pb-28 overflow-hidden">
      {/* Decorative Background Blobs */}
      <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] left-[-15%] w-[380px] h-[380px] bg-primary/10 rounded-full blur-[110px] animate-pulse pointer-events-none"></div>

      <div className="flex items-center p-4 sticky top-0 z-10 bg-white/70 backdrop-blur-md justify-between border-b border-white/40 shadow-sm">
        <button
          onClick={handleBack}
          className="size-10 flex items-center justify-center bg-white/50 hover:bg-white/80 rounded-full border border-white/40 shadow-sm transition-all"
        >
          <span className="material-symbols-outlined text-gray-900">{(selectedFolder || selectedYear || selectedMonth) ? 'arrow_back' : 'close'}</span>
        </button>
        <h2 className="text-lg font-black uppercase tracking-tighter text-gray-900">
          {selectedMonth !== null ? monthNames[selectedMonth] :
            selectedYear !== null ? `Año ${selectedYear} ` :
              selectedFolder ? getFolderConfig(selectedFolder)?.name :
                currentSection !== 'root' ? ROOT_SECTIONS.find(s => s.id === currentSection)?.name : 'Documentación'}
        </h2>
        <button
          onClick={() => setShowSettings(true)}
          className="size-10 flex items-center justify-center rounded-full bg-white/50 hover:bg-white/80 active:scale-90 transition-all border border-white/40 shadow-sm"
        >
          <span className="material-symbols-outlined text-gray-900">settings</span>
        </button>
      </div>

      <div className="p-4 space-y-6 relative z-10">
        {!selectedFolder ? (
          <>
            {currentSection === 'root' ? (
              // Root Menu: Econexo vs Gestores
              <div className="grid grid-cols-1 gap-4 pt-2">
                {ROOT_SECTIONS.map(section => (
                  <button
                    key={section.id}
                    onClick={() => setCurrentSection(section.id as any)}
                    className="relative overflow-hidden rounded-[32px] bg-white/60 backdrop-blur-2xl p-8 border border-white/80 shadow-lg group transition-all hover:scale-[1.02]"
                  >
                    <div className={`absolute top-0 right-0 w-32 h-32 ${section.color}/10 rounded-bl-full z-0 group-hover:scale-110 transition-transform duration-700`}></div>
                    <div className="relative z-10 flex items-center gap-6">
                      <div className={`size-16 rounded-2xl ${section.color} text-white flex items-center justify-center shadow-lg shadow-${section.color}/30`}>
                        <span className="material-symbols-outlined text-4xl">{section.icon}</span>
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-2xl font-display font-black text-gray-900">{section.name}</h3>
                        <p className="text-xs text-gray-500 font-bold mt-1">{section.description}</p>
                      </div>
                      <span className="material-symbols-outlined text-gray-300 group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              // Subfolders List
              <div className="grid grid-cols-1 gap-4 pt-2 animate-in slide-in-from-right-4 duration-300">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 px-2 leading-none">Carpetas</h3>
                {getCurrentFolders().map(folder => {
                  const count = documents.filter(doc => folder.types.includes(doc.type)).length;
                  return (
                    <button
                      key={folder.id}
                      onClick={() => setSelectedFolder(folder.id)}
                      className="flex items-center gap-4 p-5 bg-white/60 backdrop-blur-2xl rounded-[24px] border border-white/80 hover:border-primary/20 transition-all text-left group shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] hover:shadow-lg hover:scale-[1.01]"
                    >
                      <div className={`size-14 rounded-2xl ${folder.color}/10 flex items-center justify-center border border-white/50 group-hover:scale-110 transition-transform shadow-sm`}>
                        <span className={`material-symbols-outlined text-3xl font-bold ${folder.id === 'recepcion' ? 'filled' : ''}`} style={{ color: folder.color.replace('bg-', 'text-').replace('-500', '-600').replace('-600', '-600') }}>{folder.icon}</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-display font-black text-sm text-gray-900">{folder.name}</h4>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{count} documentos</p>
                      </div>
                      <span className="material-symbols-outlined text-gray-300 group-hover:translate-x-1 transition-transform group-hover:text-primary">chevron_right</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : selectedYear === null ? (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 px-2 leading-none">Seleccionar Año</h3>
            <div className="grid grid-cols-1 gap-3">
              {getYearsForFolder().length === 0 ? (
                <div className="p-12 text-center bg-white/40 backdrop-blur-sm rounded-[32px] border border-dashed border-gray-300">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">No hay registros</p>
                </div>
              ) : (
                getYearsForFolder().map(year => (
                  <div key={year} className="space-y-2">
                    <button
                      onClick={() => setSelectedYear(year)}
                      className="w-full flex items-center justify-between p-5 bg-white/60 backdrop-blur-2xl rounded-2xl border border-white/80 hover:border-primary/30 transition-all shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] hover:shadow-md"
                    >
                      <div className="flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-gray-50 flex items-center justify-center text-primary border border-gray-100">
                          <span className="material-symbols-outlined">calendar_today</span>
                        </div>
                        <span className="font-black text-lg text-gray-900">{year}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.1em]">Detalle mensual</span>
                        <span className="material-symbols-outlined text-gray-300">chevron_right</span>
                      </div>
                    </button>
                    {selectedFolder === 'reportes' && (
                      <button
                        onClick={() => {
                          setSelectedYear(year);
                          // We use a small timeout to ensure state is updated or just call a modified version
                          setTimeout(() => handleGenerateReport(year), 100);
                        }}
                        className="w-full py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all backdrop-blur-sm"
                      >
                        <span className="material-symbols-outlined text-lg">summarize</span>
                        Reporte Anual {year}
                      </button>
                    )}

                    {selectedFolder === 'reportes' && (
                      <button
                        onClick={() => setShowRangeModal(true)}
                        className="w-full mt-2 py-3 bg-white/40 hover:bg-white/60 text-gray-600 border border-gray-300 border-dashed rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all backdrop-blur-sm"
                      >
                        <span className="material-symbols-outlined text-lg">date_range</span>
                        Reporte por Rango Personalizado
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : selectedMonth === null ? (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 px-2 leading-none">Seleccionar Mes</h3>
              <div className="grid grid-cols-3 gap-2">
                {getMonthsForYear().map(monthIdx => (
                  <button
                    key={monthIdx}
                    onClick={() => setSelectedMonth(monthIdx)}
                    className="flex flex-col items-center justify-center p-4 bg-white/60 backdrop-blur-xl rounded-2xl border border-white/80 hover:border-primary/30 transition-all gap-1 shadow-sm hover:shadow-md"
                  >
                    <span className="text-xs font-black text-gray-900">{monthNames[monthIdx]}</span>
                    <span className="text-[8px] text-primary font-black uppercase tracking-widest">Ver</span>
                  </button>
                ))}
              </div>
            </div>

            {filteredDocuments.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary px-2 leading-none">Reportes Anuales Disponibles</h3>
                <div className="space-y-3">
                  {filteredDocuments.map(doc => (
                    <div key={doc.id} className="bg-white/60 backdrop-blur-2xl p-4 rounded-[24px] border border-white/80  shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="size-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
                          <span className="material-symbols-outlined text-2xl filled">analytics</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-black text-[13px] truncate text-gray-900">{doc.title}</h4>
                          <p className="text-[9px] text-gray-500 mt-1 font-black uppercase tracking-widest">Consolidado Anual</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownload(doc, 'preview')}
                          className="flex-1 h-10 bg-white/50 hover:bg-white/80 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors text-gray-600 border border-white/60"
                        >
                          <span className="material-symbols-outlined text-sm">visibility</span>
                          Ver
                        </button>
                        <button
                          onClick={() => handleDownload(doc)}
                          className="flex-1 h-10 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border border-primary/20"
                        >
                          <span className="material-symbols-outlined text-sm">download</span>
                          Bajar
                        </button>
                        <button
                          onClick={() => handleDelete(doc)}
                          className="size-10 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl flex items-center justify-center border border-red-100 transition-colors"
                          title="Eliminar Reporte"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
            <div className="flex gap-2">
              <div className="relative flex-1 flex items-center bg-white/60 backdrop-blur-xl rounded-2xl h-14 border border-white/80 shadow-sm">
                <span className="material-symbols-outlined pl-4 text-gray-400">search</span>
                <input className="bg-transparent flex-1 border-none focus:ring-0 px-3 text-sm font-bold text-gray-900 placeholder:text-gray-400" placeholder="Buscar en este mes..." />
              </div>
              {selectedFolder === 'reportes' && (
                <button
                  onClick={handleGenerateReport}
                  className="h-14 px-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-transform flex flex-col items-center justify-center leading-none gap-1"
                >
                  <span className="material-symbols-outlined text-xl">assignment_add</span>
                  <span>Generar</span>
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center p-12">
                <span className="animate-spin material-symbols-outlined text-primary text-4xl">progress_activity</span>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="p-12 text-center bg-white/40 rounded-[32px] border border-dashed border-gray-300 backdrop-blur-sm">
                <span className="material-symbols-outlined text-5xl text-gray-400 mb-4">
                  {selectedFolder === 'reportes' ? 'post_add' : 'folder_open'}
                </span>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest leading-relaxed">
                  {selectedFolder === 'reportes'
                    ? <>No hay reportes guardados.<br />¡Genera uno nuevo!</>
                    : <>No se encontraron<br />documentos</>
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDocuments.map(doc => (
                  <div key={doc.id} className="bg-white/60 backdrop-blur-2xl p-4 rounded-[24px] border border-white/80 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)] space-y-4 hover:border-primary/20 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="size-12 rounded-xl bg-gray-50 flex items-center justify-center text-primary border border-gray-100">
                        <span className={`material-symbols-outlined text-2xl ${(doc.type === 'CR' || doc.type === 'pdf' || doc.type === 'report' || doc.type === 'CGM') ? 'filled' : ''}`}>
                          {(doc.type === 'pdf' || doc.type === 'report') ? 'analytics' : (doc.type === 'CR' ? 'verified' : (doc.type === 'CGM' ? 'calendar_month' : 'description'))}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-black text-[13px] truncate text-gray-900">{doc.title}</h4>
                        <div className="flex items-center gap-2 text-[9px] text-gray-500 mt-1 font-black uppercase tracking-widest">
                          <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                          <span className="size-1 rounded-full bg-gray-200"></span>
                          <span>{doc.type}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownload(doc, 'preview')}
                        className="flex-1 h-10 bg-white/50 hover:bg-white/80 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors text-gray-600 border border-white/60"
                      >
                        <span className="material-symbols-outlined text-sm">visibility</span>
                        Ver
                      </button>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="flex-1 h-10 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border border-primary/20"
                      >
                        <span className="material-symbols-outlined text-sm">download</span>
                        Bajar
                      </button>
                      <button
                        onClick={() => handleDelete(doc)}
                        className="size-10 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl flex items-center justify-center border border-red-100 transition-colors"
                        title="Eliminar Documento"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={addTestDocument}
        className="fixed bottom-24 right-6 size-14 bg-primary text-background-dark rounded-full shadow-lg shadow-primary/30 flex items-center justify-center transform active:scale-90 transition-transform z-40"
      >
        <span className="material-symbols-outlined text-3xl">add</span>
      </button>



      {/* Range Selection Modal */}
      {
        showRangeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowRangeModal(false)}></div>
            <div className="relative bg-white/90 backdrop-blur-2xl w-full max-w-[340px] rounded-[32px] p-8 border border-white/80 shadow-[0_30px_60px_rgba(0,0,0,0.15)] animate-in zoom-in duration-200">
              <div className="text-center space-y-6">
                <div className="size-16 rounded-3xl bg-primary/5 text-primary mx-auto flex items-center justify-center border border-primary/10">
                  <span className="material-symbols-outlined text-3xl">date_range</span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-display font-black text-gray-900">Reporte Personalizado</h3>
                  <p className="text-xs text-gray-500 font-bold">Selecciona el rango de meses</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-1">Desde</label>
                    <select
                      value={rangeStart}
                      onChange={(e) => setRangeStart(Number(e.target.value))}
                      className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 focus:ring-primary focus:border-primary"
                    >
                      {monthNames.map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-1">Hasta</label>
                    <select
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(Number(e.target.value))}
                      className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 focus:ring-primary focus:border-primary"
                    >
                      {monthNames.map((m, i) => (
                        <option key={i} value={i} disabled={i < rangeStart}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <button
                    onClick={handleGenerateCustomRange}
                    className="w-full h-14 bg-primary text-background-dark rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                  >
                    <span className="material-symbols-outlined">assignment_add</span>
                    Generar Reporte
                  </button>
                  <button
                    onClick={() => setShowRangeModal(false)}
                    className="w-full h-10 text-gray-400 text-[10px] font-black uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowSettings(false)}></div>
            <div className="relative bg-white/90 backdrop-blur-2xl w-full max-w-[340px] rounded-[32px] p-8 border border-white/80 shadow-[0_30px_60px_rgba(0,0,0,0.15)] animate-in zoom-in duration-200">
              <div className="text-center space-y-6">
                <div className="size-20 rounded-3xl bg-primary/5 text-primary mx-auto flex items-center justify-center border border-primary/10">
                  <span className="material-symbols-outlined text-4xl">add_to_drive</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-display font-black text-gray-900">Google Drive</h3>
                  <p className="text-xs text-gray-500 font-bold leading-relaxed">Configura el respaldo automático de tus certificados y reportes en la nube.</p>
                </div>

                <div className="pt-2 space-y-3">
                  <button
                    onClick={() => { alert('Redirigiendo a Google...'); setShowSettings(false); }}
                    className="w-full h-14 bg-white/50 hover:bg-white/80 border border-white/60 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-colors text-gray-700"
                  >
                    <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" className="size-6" alt="Drive" />
                    Cambiar Cuenta
                  </button>
                  <button
                    onClick={() => { setDriveLinked(false); setShowSettings(false); }}
                    className="w-full h-14 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-colors"
                  >
                    Desvincular
                  </button>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="w-full h-10 text-gray-400 text-[10px] font-black uppercase tracking-widest"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>
  )
}

      <Navbar />
      <div className="absolute top-20 right-4 text-[10px] text-gray-400 font-bold z-0 pointer-events-none">v1.3</div>
    </div >
  );
};

export default Documents;
