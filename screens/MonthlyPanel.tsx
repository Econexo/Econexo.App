import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import Navbar from '../components/Navbar';
import { supabase } from '../services/supabase';
import { useToast } from '../components/ui/Toast';
import { materialColor } from '../utils/materialCalculations';
import { WASTE_DESTINATIONS } from '../utils/wasteClassification';
import { formatKg, truncateTo, sumTruncated } from '../utils/formatKg';
import {
    buildMonthlyBreakdown,
    breakdownToCsv,
    emptySummary,
    monthOverMonth,
    periodLabel,
    previousPeriod,
    trailingPeriods,
    MONTH_NAMES,
    type CrDoc,
    type MonthlySummary,
} from '../utils/monthlyBreakdown';

const currentPeriodKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const nextPeriod = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

// Un decimal y truncado, igual que el comprobante del gestor. Ver utils/formatKg.
const fmt = (n: number, decimals = 1) => formatKg(n, decimals);

const MonthlyPanel: React.FC = () => {
    const navigate = useNavigate();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [companyName, setCompanyName] = useState('');
    // Un admin ve todas las empresas, igual que en el Dashboard, y puede
    // filtrar por una. Un cliente solo ve la suya.
    const [isAdmin, setIsAdmin] = useState(false);
    const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
    const [companyFilter, setCompanyFilter] = useState<string>('all');
    const [allDocs, setAllDocs] = useState<any[]>([]);
    const [period, setPeriod] = useState(currentPeriodKey);
    const [expanded, setExpanded] = useState<string | null>(null);

    const thisMonth = currentPeriodKey();

    useEffect(() => {
        const load = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('company_name, is_admin')
                    .eq('id', user.id)
                    .single();

                const admin = !!profile?.is_admin;
                setIsAdmin(admin);
                setCompanyName(profile?.company_name || '');

                let query = supabase
                    .from('documents')
                    .select('user_id, created_at, metadata')
                    .in('type', ['CR', 'COMMUNITY_CR'])
                    .eq('verified', true)
                    .order('created_at', { ascending: false });

                // Mismo criterio que el Dashboard: el admin ve todo.
                if (!admin) query = query.eq('user_id', user.id);

                const { data: docs } = await query;
                setAllDocs((docs ?? []) as any[]);

                if (admin) {
                    const { data: perfiles } = await supabase
                        .from('profiles')
                        .select('id, company_name')
                        .order('company_name');
                    setCompanies(
                        (perfiles ?? []).map((p: any) => ({
                            id: p.id,
                            name: p.company_name || 'Sin nombre',
                        })),
                    );
                }
            } catch (err) {
                console.error('Error loading monthly panel:', err);
                toast.error('No se pudo cargar el panel mensual.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const byPeriod = useMemo(() => {
        const visibles = companyFilter === 'all'
            ? allDocs
            : allDocs.filter(d => d.user_id === companyFilter);
        return buildMonthlyBreakdown(visibles as CrDoc[]);
    }, [allDocs, companyFilter]);

    const summary = byPeriod.get(period) ?? emptySummary(period);
    const previous = byPeriod.get(previousPeriod(period)) ?? emptySummary(previousPeriod(period));
    const delta = monthOverMonth(summary.totalKg, previous.totalKg);

    // Últimos 12 meses para la tendencia.
    const trend = useMemo(
        () => trailingPeriods(period, 12).map(key => ({
            key,
            label: MONTH_NAMES[Number(key.split('-')[1]) - 1].slice(0, 3),
            kg: byPeriod.get(key)?.totalKg ?? 0,
        })),
        [period, byPeriod],
    );

    // Meses con movimientos, para el selector rápido.
    const activePeriods = useMemo(
        () => [...byPeriod.keys()].sort().reverse(),
        [byPeriod],
    );

    const canGoForward = period < thisMonth;

    const handleExportCsv = () => {
        if (summary.materials.length === 0) { toast.warning('No hay datos para exportar en este mes.'); return; }
        // BOM para que Excel reconozca los acentos.
        const blob = new Blob(['﻿' + breakdownToCsv(summary)], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EcoNexo_Panel_${period}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('CSV descargado.');
    };

    const handleExportPdf = () => {
        if (summary.materials.length === 0) { toast.warning('No hay datos para exportar en este mes.'); return; }

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const green: [number, number, number] = [50, 97, 5];
        const W = 210;

        doc.setFillColor(...green);
        doc.rect(0, 0, W, 32, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Panel Mensual de Residuos', 14, 15);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const etiqueta = isAdmin
            ? (companyFilter === 'all'
                ? 'Todas las empresas'
                : companies.find(c => c.id === companyFilter)?.name ?? '')
            : companyName;
        doc.text(`${periodLabel(period)}${etiqueta ? ` · ${etiqueta}` : ''}`, 14, 23);

        doc.setTextColor(30, 30, 30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(28);
        doc.text(`${fmt(summary.totalKg)} kg`, 14, 50);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(110, 110, 110);
        doc.text(
            `recuperados en ${summary.docCount} certificado(s) de recepción` +
            (delta !== null ? `  ·  ${delta > 0 ? '+' : ''}${delta}% vs. ${periodLabel(previousPeriod(period))}` : ''),
            14, 57,
        );

        autoTable(doc, {
            startY: 66,
            head: [['Material', 'Kg', '%', 'CO2e (kg)', 'Agua (L)', 'Energía (kWh)', 'Ley REP']],
            body: summary.materials.map(m => [
                m.material,
                fmt(m.kg, 1),
                `${fmt(m.share)}%`,
                fmt(m.co2),
                fmt(m.water),
                fmt(m.energy),
                m.repCategory ?? '—',
            ]),
            foot: [[
                'TOTAL',
                // Suma de las filas ya truncadas: si se imprimiera el total real
                // la columna no cuadraría con lo que el gestor va a sumar a mano.
                fmt(sumTruncated(summary.materials.map(m => m.kg))),
                '100%',
                fmt(summary.impact.co2),
                fmt(summary.impact.water),
                fmt(summary.impact.energy),
                '',
            ]],
            theme: 'striped',
            headStyles: { fillColor: green, fontStyle: 'bold', fontSize: 8 },
            footStyles: { fillColor: [232, 240, 224], textColor: green, fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            margin: { left: 14, right: 14 },
        });

        const afterTable = (doc as any).lastAutoTable?.finalY ?? 120;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...green);
        doc.text('Impacto ambiental evitado', 14, afterTable + 14);

        const impacts = [
            [`${fmt(summary.impact.co2)} kg`, 'CO2e evitado'],
            [`${fmt(summary.impact.water)} L`, 'agua ahorrada'],
            [`${fmt(summary.impact.energy)} kWh`, 'energía ahorrada'],
            [`${String(Math.trunc(summary.impact.trees))}`, 'árboles equivalentes'],
        ];
        impacts.forEach(([value, label], i) => {
            const x = 14 + (i % 2) * 92;
            const y = afterTable + 24 + Math.floor(i / 2) * 18;
            doc.setFillColor(247, 250, 244);
            doc.roundedRect(x, y, 88, 14, 3, 3, 'F');
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...green);
            doc.text(value, x + 4, y + 9);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(120, 120, 120);
            doc.text(label, x + 4 + doc.getTextWidth(value) + 3, y + 9);
        });

        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(
            'Factores de impacto: EPA WARM v16 y Water Footprint Network. econexo.cl',
            14, 287,
        );

        doc.save(`EcoNexo_Panel_${period}${companyFilter !== 'all' ? '_' + companyFilter.slice(0, 8) : ''}.pdf`);
        toast.success('PDF descargado.');
    };

    return (
        <div className="relative font-sans bg-[#f0f4f0] dark:bg-background-dark min-h-screen text-slate-900 dark:text-slate-100 max-w-md md:max-w-3xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto pb-28 md:pb-8 animate-in fade-in duration-500 overflow-hidden">
            {/* Fondos decorativos */}
            <div className="absolute top-[-5%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute top-[35%] right-[-20%] w-[350px] h-[350px] bg-secondary/20 rounded-full blur-[80px] pointer-events-none" />

            <header className="sticky top-0 z-20 flex items-center justify-between bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-5 py-5 border-b border-white/40 dark:border-slate-700/40 shadow-sm">
                <button
                    onClick={() => navigate(-1)}
                    className="size-10 flex items-center justify-center rounded-full bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 transition-all active:scale-90 border border-white/40 dark:border-slate-600/40 shadow-sm"
                >
                    <span className="material-symbols-outlined text-gray-700 dark:text-gray-300 text-[22px]">arrow_back</span>
                </button>
                <h1 className="text-xl font-display font-black tracking-tight text-gray-900 dark:text-white">Panel Mensual</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportCsv}
                        title="Exportar CSV"
                        className="size-10 flex items-center justify-center rounded-full bg-white/50 dark:bg-slate-700/50 hover:bg-white/80 transition-all active:scale-90 border border-white/40 dark:border-slate-600/40 shadow-sm"
                    >
                        <span className="material-symbols-outlined text-gray-700 dark:text-gray-300 text-[20px]">table_view</span>
                    </button>
                    <button
                        onClick={handleExportPdf}
                        title="Exportar PDF"
                        className="size-10 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-all active:scale-90 border border-primary/20 shadow-sm"
                    >
                        <span className="material-symbols-outlined text-primary text-[20px]">picture_as_pdf</span>
                    </button>
                </div>
            </header>

            <div className="px-4 py-6 space-y-5 relative z-10">
                {/* Selector de empresa — solo para el admin */}
                {isAdmin && companies.length > 0 && (
                    <select
                        value={companyFilter}
                        onChange={e => setCompanyFilter(e.target.value)}
                        className="w-full h-11 bg-white/70 dark:bg-slate-800/70 border border-white/80 dark:border-white/10 rounded-2xl px-4 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary shadow-sm"
                    >
                        <option value="all">Todas las empresas</option>
                        {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                )}

                {/* ── Selector de mes ── */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPeriod(previousPeriod(period))}
                        aria-label="Mes anterior"
                        className="size-11 shrink-0 flex items-center justify-center rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-white/80 dark:border-white/10 shadow-sm active:scale-95 transition-transform"
                    >
                        <span className="material-symbols-outlined text-gray-600 dark:text-gray-300">chevron_left</span>
                    </button>

                    <select
                        value={period}
                        onChange={e => setPeriod(e.target.value)}
                        className="flex-1 min-w-0 h-11 bg-white/70 dark:bg-slate-800/70 border border-white/80 dark:border-white/10 rounded-2xl px-4 text-sm font-black text-center text-gray-900 dark:text-white outline-none focus:border-primary shadow-sm appearance-none"
                    >
                        {/* El mes visible siempre está en la lista, tenga o no movimientos. */}
                        {[...new Set([period, ...activePeriods])]
                            .sort()
                            .reverse()
                            .map(key => (
                                <option key={key} value={key}>{periodLabel(key)}</option>
                            ))}
                    </select>

                    <button
                        onClick={() => canGoForward && setPeriod(nextPeriod(period))}
                        disabled={!canGoForward}
                        aria-label="Mes siguiente"
                        className="size-11 shrink-0 flex items-center justify-center rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-white/80 dark:border-white/10 shadow-sm active:scale-95 transition-transform disabled:opacity-30 disabled:active:scale-100"
                    >
                        <span className="material-symbols-outlined text-gray-600 dark:text-gray-300">chevron_right</span>
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="size-9 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* ── Total del mes ── */}
                        <div className="relative overflow-hidden bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[28px] border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] p-6">
                            <div className="absolute top-0 right-0 size-32 bg-primary/5 rounded-bl-[64px] pointer-events-none" />
                            <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em]">
                                Recuperado en {periodLabel(period)}
                            </p>
                            <div className="flex items-end gap-3 mt-2 flex-wrap">
                                <p className="text-5xl font-display font-black text-primary leading-none tracking-tighter">
                                    {fmt(summary.totalKg)}
                                </p>
                                <p className="text-lg font-black text-gray-400 dark:text-gray-500 mb-0.5">kg</p>
                                {delta !== null && (
                                    <span
                                        className={`mb-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-0.5 ${delta >= 0
                                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                            : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                            }`}
                                    >
                                        <span className="material-symbols-outlined text-[14px]">
                                            {delta >= 0 ? 'trending_up' : 'trending_down'}
                                        </span>
                                        {delta > 0 ? '+' : ''}{delta}%
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-bold mt-2">
                                {summary.docCount} certificado{summary.docCount === 1 ? '' : 's'} de recepción
                                {delta !== null && ` · mes anterior: ${fmt(previous.totalKg)} kg`}
                            </p>
                        </div>

                        {/* Destino de los residuos del mes. El valorizado no
                            incluye relleno sanitario ni RESCON. */}
                        {summary.totalKg > 0 && (
                            <div className="grid grid-cols-3 gap-3">
                                {WASTE_DESTINATIONS.map(d => {
                                    const kg = summary.destinations[d.value];
                                    const principal = d.value === 'valorizacion';
                                    const share = summary.totalKg > 0 ? Math.round((kg / summary.totalKg) * 100) : 0;
                                    return (
                                        <div
                                            key={d.value}
                                            title={d.description}
                                            className={`rounded-[22px] p-4 border backdrop-blur-2xl transition-all ${principal
                                                ? 'bg-white/80 dark:bg-slate-800/80 border-primary/30 shadow-md shadow-primary/10'
                                                : 'bg-white/50 dark:bg-slate-800/50 border-white/70 dark:border-slate-600/40'}`}
                                        >
                                            <span className="material-symbols-outlined text-lg" style={{ color: d.color }}>
                                                {d.icon}
                                            </span>
                                            <p
                                                className={`font-display font-black leading-none tracking-tight tabular-nums mt-1.5 ${principal ? 'text-2xl' : 'text-xl'}`}
                                                style={{ color: principal ? d.color : undefined }}
                                            >
                                                {fmt(kg)}
                                            </p>
                                            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 mt-0.5">
                                                kg · {share}%
                                            </p>
                                            <p className="text-[10px] font-bold text-gray-600 dark:text-gray-300 leading-tight mt-1">
                                                {d.label}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {summary.materials.length === 0 ? (
                            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[28px] border border-dashed border-gray-200 dark:border-white/10 p-10 text-center space-y-3">
                                <span className="material-symbols-outlined text-4xl text-gray-300">recycling</span>
                                <p className="text-sm font-black text-gray-500 dark:text-gray-400">
                                    Sin movimientos en {periodLabel(period)}
                                </p>
                                <p className="text-[11px] text-gray-400 font-bold max-w-xs mx-auto leading-relaxed">
                                    Aquí verás el desglose por material apenas se emita un Certificado de Recepción de este mes.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* ── Desglose por material ── */}
                                <section className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[28px] border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] p-6 space-y-4">
                                    <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em]">
                                        Desglose por material
                                    </h4>

                                    <div className="space-y-2">
                                        {summary.materials.map(m => {
                                            const color = materialColor(m.material);
                                            const isOpen = expanded === m.material;
                                            return (
                                                <div
                                                    key={m.material}
                                                    className="rounded-2xl border border-white/70 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 overflow-hidden transition-all"
                                                >
                                                    <button
                                                        onClick={() => setExpanded(isOpen ? null : m.material)}
                                                        className="w-full text-left p-3.5 space-y-2.5"
                                                        aria-expanded={isOpen}
                                                    >
                                                        <div className="flex items-center gap-2.5">
                                                            <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                                            <span className="text-sm font-black text-gray-800 dark:text-gray-100 flex-1 min-w-0 truncate">
                                                                {m.material}
                                                            </span>
                                                            {m.repCategory && (
                                                                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider shrink-0">
                                                                    REP
                                                                </span>
                                                            )}
                                                            <span className="text-sm font-black text-gray-900 dark:text-white shrink-0 tabular-nums">
                                                                {fmt(m.kg)} kg
                                                            </span>
                                                            <span
                                                                className="material-symbols-outlined text-gray-300 text-lg shrink-0 transition-transform"
                                                                style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                                                            >
                                                                expand_more
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center gap-2.5">
                                                            <div className="h-1.5 flex-1 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                                                                <div
                                                                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                                                                    style={{ width: `${m.share}%`, backgroundColor: color }}
                                                                />
                                                            </div>
                                                            <span className="text-[11px] font-black tabular-nums w-11 text-right" style={{ color }}>
                                                                {fmt(m.share)}%
                                                            </span>
                                                        </div>
                                                    </button>

                                                    {isOpen && (
                                                        <div className="px-3.5 pb-3.5 grid grid-cols-3 gap-2 animate-in fade-in duration-200">
                                                            {[
                                                                { icon: 'cloud', value: `${fmt(m.co2)} kg`, label: 'CO₂e evitado', tint: 'text-slate-600 dark:text-slate-300' },
                                                                { icon: 'water_drop', value: `${fmt(m.water)} L`, label: 'agua', tint: 'text-blue-600 dark:text-blue-400' },
                                                                { icon: 'bolt', value: `${fmt(m.energy)} kWh`, label: 'energía', tint: 'text-amber-600 dark:text-amber-400' },
                                                            ].map(cell => (
                                                                <div key={cell.label} className="rounded-xl bg-white/70 dark:bg-slate-800/70 border border-white/80 dark:border-white/10 p-2.5">
                                                                    <span className={`material-symbols-outlined text-base ${cell.tint}`}>{cell.icon}</span>
                                                                    <p className="text-[13px] font-black text-gray-900 dark:text-white leading-tight mt-0.5 tabular-nums">
                                                                        {cell.value}
                                                                    </p>
                                                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">{cell.label}</p>
                                                                </div>
                                                            ))}
                                                            {m.repCategory && (
                                                                <p className="col-span-3 text-[10px] text-gray-400 font-bold pt-0.5">
                                                                    Categoría Ley REP: {m.repCategory}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>

                                {/* ── Impacto del mes ── */}
                                <section className="grid grid-cols-2 gap-3">
                                    {[
                                        { icon: 'cloud', value: fmt(summary.impact.co2), unit: 'kg CO₂e', label: 'Emisiones evitadas', ring: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
                                        { icon: 'water_drop', value: fmt(summary.impact.water), unit: 'litros', label: 'Agua ahorrada', ring: 'bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400' },
                                        { icon: 'bolt', value: fmt(summary.impact.energy), unit: 'kWh', label: 'Energía ahorrada', ring: 'bg-amber-50 text-amber-500 dark:bg-amber-900/30 dark:text-amber-400' },
                                        { icon: 'park', value: String(Math.trunc(summary.impact.trees)), unit: 'árboles', label: 'Equivalente anual', ring: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
                                    ].map(card => (
                                        <div
                                            key={card.label}
                                            className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[22px] border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] p-4 space-y-2"
                                        >
                                            <div className={`size-9 rounded-xl flex items-center justify-center ${card.ring}`}>
                                                <span className="material-symbols-outlined text-lg">{card.icon}</span>
                                            </div>
                                            <div>
                                                <p className="text-xl font-display font-black text-gray-900 dark:text-white leading-none tracking-tight tabular-nums">
                                                    {card.value}
                                                </p>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mt-0.5">{card.unit}</p>
                                            </div>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold leading-tight">{card.label}</p>
                                        </div>
                                    ))}
                                </section>
                            </>
                        )}

                        {/* ── Tendencia 12 meses ── */}
                        <section className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-[28px] border border-white/80 dark:border-slate-600/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] p-6 space-y-4">
                            <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em]">
                                Últimos 12 meses
                            </h4>
                            <div className="h-40 -mx-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                                            axisLine={false}
                                            tickLine={false}
                                            interval={0}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(50,97,5,0.06)' }}
                                            formatter={(value: number) => [`${fmt(value)} kg`, '']}
                                            labelFormatter={(_, payload) =>
                                                payload?.[0] ? periodLabel((payload[0].payload as { key: string }).key) : ''
                                            }
                                            contentStyle={{ borderRadius: 12, fontSize: 12, fontWeight: 700, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                                        />
                                        <Bar dataKey="kg" radius={[6, 6, 0, 0]}>
                                            {trend.map(d => (
                                                <Cell
                                                    key={d.key}
                                                    fill={d.key === period ? '#326105' : '#c8ddb0'}
                                                    cursor="pointer"
                                                    onClick={() => setPeriod(d.key)}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-[10px] text-gray-400 font-bold text-center">
                                Toca una barra para ver ese mes
                            </p>
                        </section>

                        <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold text-center leading-relaxed px-4">
                            Basado en los Certificados de Recepción verificados de tu empresa.<br />
                            Factores de impacto: EPA WARM v16 · Water Footprint Network.
                        </p>
                    </>
                )}
            </div>

            <Navbar />
        </div>
    );
};

export default MonthlyPanel;
