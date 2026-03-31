import React from 'react';
import { CompanyProfile } from '../../types';

const WASTE_OPTIONS = [
    { id: 'domiciliarios', label: 'Domiciliarios no peligrosos' },
    { id: 'industriales', label: 'Industriales' },
    { id: 'peligrosos', label: 'Peligrosos' },
    { id: 'otros', label: 'Otros' },
];

const CERTIFICATION_OPTIONS = ['ISO 14001', 'ISO 9001', 'Sello Verde', 'Huella de Carbono', 'Zero Waste'];

interface CompanyDataSectionProps {
    companyData: CompanyProfile;
    onCompanyDataChange: (data: CompanyProfile) => void;
    isEditing: boolean;
    onToggleEdit: () => void;
    onSave: () => void;
}

const CompanyDataSection: React.FC<CompanyDataSectionProps> = ({
    companyData,
    onCompanyDataChange,
    isEditing,
    onToggleEdit,
    onSave,
}) => {
    const handleToggleWaste = (id: string) => {
        onCompanyDataChange({
            ...companyData,
            wasteTypes: companyData.wasteTypes.includes(id)
                ? companyData.wasteTypes.filter(t => t !== id)
                : [...companyData.wasteTypes, id],
        });
    };

    const handleToggleCert = (cert: string) => {
        onCompanyDataChange({
            ...companyData,
            certifications: companyData.certifications.includes(cert)
                ? companyData.certifications.filter(c => c !== cert)
                : [...companyData.certifications, cert],
        });
    };

    return (
        <section>
            <div className="flex items-center justify-between mb-2 pl-2">
                <h4 className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] transition-colors">Información Legal</h4>
                <button
                    onClick={() => isEditing ? onSave() : onToggleEdit()}
                    className="text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-primary/10 rounded-lg border border-primary/20 hover:bg-primary/20 transition-all"
                >
                    {isEditing ? 'Guardar' : 'Editar'}
                </button>
            </div>

            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/80 dark:border-white/10 p-4 space-y-4 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] transition-all">
                {isEditing ? (
                    <div className="space-y-4">
                        <input
                            className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
                            value={companyData.name}
                            onChange={e => onCompanyDataChange({ ...companyData, name: e.target.value })}
                            placeholder="Razón Social"
                        />
                        <input
                            className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
                            value={companyData.rut}
                            onChange={e => onCompanyDataChange({ ...companyData, rut: e.target.value })}
                            placeholder="RUT Empresa"
                        />
                        <input
                            className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
                            value={companyData.address}
                            onChange={e => onCompanyDataChange({ ...companyData, address: e.target.value })}
                            placeholder="Dirección de la Empresa"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <select
                                value={companyData.size}
                                onChange={e => onCompanyDataChange({ ...companyData, size: e.target.value as any })}
                                className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white transition-colors appearance-none"
                            >
                                <option value="">Tamaño Empresa</option>
                                <option value="Pequeña">Pequeña (1-10)</option>
                                <option value="Mediana">Mediana (11-50)</option>
                                <option value="Grande">Grande (51-200)</option>
                                <option value="Corporativa">Corporativa (+200)</option>
                            </select>
                            <input
                                type="number"
                                className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
                                value={companyData.workersCount || ''}
                                onChange={e => onCompanyDataChange({ ...companyData, workersCount: parseInt(e.target.value) || 0 })}
                                placeholder="N° Trabajadores"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Tipos de Residuos</label>
                            <div className="grid grid-cols-2 gap-2">
                                {WASTE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => handleToggleWaste(opt.id)}
                                        className={`p-2 rounded-lg border text-[10px] font-bold uppercase transition-all ${companyData.wasteTypes.includes(opt.id) ? 'bg-primary/20 border-primary text-primary' : 'bg-white/50 border-gray-200 text-gray-500'}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Certificaciones</label>
                            <div className="flex flex-wrap gap-2">
                                {CERTIFICATION_OPTIONS.map(cert => (
                                    <button
                                        key={cert}
                                        onClick={() => handleToggleCert(cert)}
                                        className={`px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase transition-all ${companyData.certifications.includes(cert) ? 'bg-primary/20 border-primary text-primary' : 'bg-white/50 border-gray-200 text-gray-500'}`}
                                    >
                                        {cert}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-yellow-50 text-yellow-500 flex items-center justify-center border border-yellow-100"><span className="material-symbols-outlined font-bold">corporate_fare</span></div>
                            <div><p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">Razón Social</p><p className="text-sm font-bold tracking-tight text-gray-900 dark:text-white transition-colors">{companyData.name}</p></div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center border border-purple-100"><span className="material-symbols-outlined font-bold">fingerprint</span></div>
                            <div><p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">RUT Empresa</p><p className="text-sm font-bold tracking-tight text-gray-900 dark:text-white transition-colors">{companyData.rut}</p></div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center border border-red-100"><span className="material-symbols-outlined font-bold">location_on</span></div>
                            <div><p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">Dirección</p><p className="text-sm font-bold tracking-tight text-gray-900 dark:text-white transition-colors">{companyData.address || 'No especificada'}</p></div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-white/5">
                            <div>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">Tamaño</p>
                                <p className="text-xs font-bold text-gray-900 dark:text-white">{companyData.size || 'No definido'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">Trabajadores</p>
                                <p className="text-xs font-bold text-gray-900 dark:text-white">{companyData.workersCount || 0}</p>
                            </div>
                        </div>

                        {companyData.wasteTypes.length > 0 && (
                            <div className="pt-2">
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mb-2">Residuos Gestionados</p>
                                <div className="flex flex-wrap gap-2">
                                    {companyData.wasteTypes.map(type => (
                                        <span key={type} className="px-2 py-1 rounded-md bg-gray-100 dark:bg-white/10 text-[9px] font-black uppercase text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10">
                                            {WASTE_OPTIONS.find(o => o.id === type)?.label || type}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {companyData.certifications.length > 0 && (
                            <div className="pt-2">
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mb-2">Certificaciones</p>
                                <div className="flex flex-wrap gap-2">
                                    {companyData.certifications.map(cert => (
                                        <span key={cert} className="px-2 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-[9px] font-black uppercase text-green-600 dark:text-green-400 border border-green-100 dark:border-green-500/20 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[10px]">verified</span>
                                            {cert}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
};

export default CompanyDataSection;
