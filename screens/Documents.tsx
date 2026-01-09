import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { supabase } from '../services/supabase';
import { generateCR, generateEcoReport } from '../services/pdfGenerator';

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
  };
}

const Documents: React.FC = () => {
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [driveLinked, setDriveLinked] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  useEffect(() => {
    fetchDocuments();
    fetchUserProfile();
  }, []);

  const folders = [
    { id: 'reportes', name: 'Reportes de Impacto', icon: 'analytics', color: 'bg-blue-500', types: ['pdf', 'report'] },
    { id: 'certificados', name: 'Certificados de Recepción', icon: 'verified', color: 'bg-primary', types: ['CR'] },
    { id: 'declaraciones', name: 'Declaraciones Legales', icon: 'assignment', color: 'bg-purple-500', types: ['declaration', 'legal'] },
  ];

  // Logic to get available years for a folder
  const getYearsForFolder = () => {
    const folder = folders.find(f => f.id === selectedFolder);
    let typesToCheck = folder?.types || [];

    // If we are in Reportes, use CRs (Certificados) time-range as reference too, 
    // so users can generate reports for periods where they have certificates.
    if (selectedFolder === 'reportes') {
      typesToCheck = [...typesToCheck, 'CR'];
    }

    const folderDocs = documents.filter(doc => typesToCheck.includes(doc.type));
    const years = [...new Set(folderDocs.map(doc => new Date(doc.created_at).getFullYear()))];
    return years.sort((a, b) => b - a);
  };

  // Logic to get available months for a year in a folder
  const getMonthsForYear = () => {
    const folder = folders.find(f => f.id === selectedFolder);
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
      const folder = folders.find(f => f.id === selectedFolder);
      if (!folder?.types.includes(doc.type)) return false;

      const date = new Date(doc.created_at);
      const docYear = date.getFullYear();
      const docMonth = date.getMonth();

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

      // Fallback or for CRs: use creation date
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
            waste_details: reportItems
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

  const handleBack = () => {
    if (selectedMonth !== null) setSelectedMonth(null);
    else if (selectedYear !== null) setSelectedYear(null);
    else if (selectedFolder !== null) setSelectedFolder(null);
    else navigate(-1);
  };

  return (
    <div className="font-display bg-background-light dark:bg-background-dark min-h-screen text-slate-900 dark:text-white max-w-md mx-auto pb-28">
      <div className="flex items-center p-4 sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm justify-between">
        <button
          onClick={handleBack}
          className="size-10 flex items-center justify-center bg-white/5 rounded-full"
        >
          <span className="material-symbols-outlined">{(selectedFolder || selectedYear || selectedMonth) ? 'arrow_back' : 'close'}</span>
        </button>
        <h2 className="text-lg font-black uppercase tracking-tighter">
          {selectedMonth !== null ? monthNames[selectedMonth] :
            selectedYear !== null ? `Año ${selectedYear} ` :
              selectedFolder ? folders.find(f => f.id === selectedFolder)?.name : 'Documentación'}
        </h2>
        <button
          onClick={() => setShowSettings(true)}
          className="size-10 flex items-center justify-center rounded-full bg-white/5 active:scale-90 transition-all"
        >
          <span className="material-symbols-outlined">settings</span>
        </button>
      </div>

      <div className="p-4 space-y-6">
        {!selectedFolder ? (
          <>
            <div className="relative overflow-hidden rounded-[32px] bg-surface-dark p-6 border border-white/5 shadow-2xl group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-bl-full z-0 group-hover:scale-110 transition-transform duration-700"></div>
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`size-12 rounded-2xl flex items-center justify-center ${driveLinked ? 'bg-primary/20 text-primary' : 'bg-gray-500/20 text-gray-500'} `}>
                    <span className="material-symbols-outlined text-2xl font-bold">{driveLinked ? 'cloud_done' : 'cloud_off'}</span>
                  </div>
                  <div>
                    <h3 className="font-black text-sm">{driveLinked ? 'Respaldo Activo' : 'Sin Sincronización'}</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{driveLinked ? 'Google Drive conectado' : 'Respalda tus archivos'}</p>
                  </div>
                </div>
                {!driveLinked && (
                  <button
                    disabled={loading}
                    onClick={() => setDriveLinked(true)}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                  >
                    Vincular Cloud
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 pt-2">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 px-2 leading-none">Categorías</h3>
              {folders.map(folder => {
                const count = documents.filter(doc => folder.types.includes(doc.type)).length;
                return (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder.id)}
                    className="flex items-center gap-4 p-5 bg-surface-dark rounded-[24px] border border-white/5 hover:border-primary/30 transition-all text-left group"
                  >
                    <div className={`size-14 rounded-2xl ${folder.color}/20 text-white flex items-center justify-center shadow-inner border border-white/10 group-hover:scale-110 transition-transform`}>
                      <span className={`material-symbols-outlined text-3xl font-bold ${folder.id === 'certificados' ? 'filled' : ''}`} style={{ color: folder.id === 'certificados' ? '#0ff092' : undefined }}>{folder.icon}</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-display font-black text-sm text-white">{folder.name}</h4>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{count} documentos</p>
                    </div>
                    <span className="material-symbols-outlined text-gray-600 group-hover:translate-x-1 transition-transform">chevron_right</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : selectedYear === null ? (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 px-2 leading-none">Seleccionar Año</h3>
            <div className="grid grid-cols-1 gap-3">
              {getYearsForFolder().length === 0 ? (
                <div className="p-12 text-center bg-white/5 rounded-[32px] border border-dashed border-white/10">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">No hay registros</p>
                </div>
              ) : (
                getYearsForFolder().map(year => (
                  <div key={year} className="space-y-2">
                    <button
                      onClick={() => setSelectedYear(year)}
                      className="w-full flex items-center justify-between p-5 bg-surface-dark rounded-2xl border border-white/5 hover:border-primary/30 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-white/5 flex items-center justify-center text-primary">
                          <span className="material-symbols-outlined">calendar_today</span>
                        </div>
                        <span className="font-black text-lg">{year}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.1em]">Detalle mensual</span>
                        <span className="material-symbols-outlined text-gray-600">chevron_right</span>
                      </div>
                    </button>
                    {selectedFolder === 'reportes' && (
                      <button
                        onClick={() => {
                          setSelectedYear(year);
                          // We use a small timeout to ensure state is updated or just call a modified version
                          setTimeout(() => handleGenerateReport(year), 100);
                        }}
                        className="w-full py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                      >
                        <span className="material-symbols-outlined text-lg">summarize</span>
                        Reporte Anual {year}
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
                    className="flex flex-col items-center justify-center p-4 bg-surface-dark rounded-2xl border border-white/5 hover:border-primary/30 transition-all gap-1"
                  >
                    <span className="text-xs font-black">{monthNames[monthIdx]}</span>
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
                    <div key={doc.id} className="bg-surface-dark p-4 rounded-[24px] border border-primary/20 shadow-sm space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                          <span className="material-symbols-outlined text-2xl filled">analytics</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-black text-[13px] truncate text-white">{doc.title}</h4>
                          <p className="text-[9px] text-gray-500 mt-1 font-black uppercase tracking-widest">Consolidado Anual</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownload(doc, 'preview')}
                          className="flex-1 h-10 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
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
              <div className="relative flex-1 flex items-center bg-surface-input rounded-2xl h-14 border border-white/5 shadow-inner">
                <span className="material-symbols-outlined pl-4 text-gray-400">search</span>
                <input className="bg-transparent flex-1 border-none focus:ring-0 px-3 text-sm font-bold" placeholder="Buscar en este mes..." />
              </div>
              {selectedFolder === 'reportes' && (
                <button
                  onClick={handleGenerateReport}
                  className="h-14 px-4 bg-primary text-background-dark rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-transform flex flex-col items-center justify-center leading-none gap-1"
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
              <div className="p-12 text-center bg-white/5 rounded-[32px] border border-dashed border-white/10">
                <span className="material-symbols-outlined text-5xl text-gray-700 mb-4">
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
                  <div key={doc.id} className="bg-surface-dark p-4 rounded-[24px] border border-white/5 shadow-sm space-y-4 hover:border-primary/20 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="size-12 rounded-xl bg-white/5 flex items-center justify-center text-primary border border-white/10">
                        <span className={`material-symbols-outlined text-2xl ${(doc.type === 'CR' || doc.type === 'pdf' || doc.type === 'report') ? 'filled' : ''}`}>
                          {(doc.type === 'pdf' || doc.type === 'report') ? 'analytics' : (doc.type === 'CR' ? 'verified' : 'description')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-black text-[13px] truncate text-white">{doc.title}</h4>
                        <div className="flex items-center gap-2 text-[9px] text-gray-500 mt-1 font-black uppercase tracking-widest">
                          <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                          <span className="size-1 rounded-full bg-gray-700"></span>
                          <span>{doc.type}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownload(doc, 'preview')}
                        className="flex-1 h-10 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
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

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-background-dark/90 backdrop-blur-md" onClick={() => setShowSettings(false)}></div>
          <div className="relative bg-surface-dark w-full max-w-[340px] rounded-[32px] p-8 border border-white/10 shadow-2xl animate-in zoom-in duration-200">
            <div className="text-center space-y-6">
              <div className="size-20 rounded-3xl bg-primary/10 text-primary mx-auto flex items-center justify-center border border-primary/20">
                <span className="material-symbols-outlined text-4xl">add_to_drive</span>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-display font-black">Google Drive</h3>
                <p className="text-xs text-gray-500 font-bold leading-relaxed">Configura el respaldo automático de tus certificados y reportes en la nube.</p>
              </div>

              <div className="pt-2 space-y-3">
                <button
                  onClick={() => { alert('Redirigiendo a Google...'); setShowSettings(false); }}
                  className="w-full h-14 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-colors"
                >
                  <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" className="size-6" alt="Drive" />
                  Cambiar Cuenta
                </button>
                <button
                  onClick={() => { setDriveLinked(false); setShowSettings(false); }}
                  className="w-full h-14 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-colors"
                >
                  Desvincular
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-full h-10 text-gray-500 text-[10px] font-black uppercase tracking-widest"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Navbar />
    </div>
  );
};

export default Documents;
