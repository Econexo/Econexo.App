import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ECONEXO_SIGNATURE, ECONEXO_LOGO, ECONEXO_WATERMARK, REPORT_HEADER_BG, ECONEXO_FULL_LOGO, ECONEXO_FULL_LOGO_V2, PHONE_ICON, PHONE_ICON_V2, ECONEXO_LOGO_CGM, CGM_FOOTER_BAR } from './constants';
import { materialFactors, normalizeMaterialType } from '../utils/materialCalculations';

/**
 * iOS Safari blocks doc.save() (programmatic anchor click).
 * For iOS we open the blob URL in a new tab instead, which works reliably.
 */
function savePdf(doc: jsPDF, filename: string): void {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (isIOS) {
        window.open(doc.output('bloburl'), '_blank');
    } else {
        doc.save(filename);
    }
}

interface CompanyData {
    company_name: string;
    rut: string;
    address: string;
    contact_name?: string;
    contact_email?: string;
}

interface WasteItem {
    waste_type: string;
    description: string;
    quantity: number;
    unit: string;
}

export const generateCR = (client: CompanyData, items: WasteItem[], certificateNumber: string, action: 'save' | 'preview' = 'save', customDate?: string) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const ml = 15;
    const mr = pageWidth - 15;

    // ── FECHA ──
    const emissionDate = customDate ? new Date(customDate + 'T12:00:00') : new Date();
    const dd = String(emissionDate.getDate()).padStart(2, '0');
    const mm = String(emissionDate.getMonth() + 1).padStart(2, '0');
    const yyyy = String(emissionDate.getFullYear());

    // ── WATERMARK (669×1024 → ratio 0.653) ──
    if (ECONEXO_WATERMARK) {
        try {
            doc.saveGraphicsState();
            doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
            const wmW = 85;
            const wmH = wmW / 0.653; // ~130mm - correct aspect ratio
            doc.addImage(ECONEXO_WATERMARK, 'PNG', (pageWidth - wmW) / 2, (pageHeight - wmH) / 2 + 10, wmW, wmH);
            doc.restoreGraphicsState();
        } catch (e) { /* watermark optional */ }
    }

    // ── LOGO top-left (978×200 → ratio 4.89) ──
    const logoToUse = ECONEXO_FULL_LOGO_V2 || ECONEXO_FULL_LOGO || ECONEXO_LOGO;
    if (logoToUse) {
        try {
            const logoW = 58;
            const logoH = logoW / 4.89; // ~11.9mm - correct aspect ratio
            doc.addImage(logoToUse, 'PNG', ml, 6, logoW, logoH);
        } catch (e) {
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(22, 163, 74);
            doc.text('EcoNexo', ml, 14);
        }
    }

    // ── DATE BOXES top-right ──
    const cellW = 15, cellH = 7;
    const dbX = mr - cellW * 3;
    const dbY = 8;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);

    ['Día', 'Mes', 'Año'].forEach((label, i) => {
        doc.rect(dbX + i * cellW, dbY, cellW, cellH);
        doc.text(label, dbX + i * cellW + cellW / 2, dbY + 4.5, { align: 'center' });
    });
    [dd, mm, yyyy].forEach((val, i) => {
        doc.rect(dbX + i * cellW, dbY + cellH, cellW, cellH);
        doc.setFont('helvetica', 'normal');
        doc.text(String(val), dbX + i * cellW + cellW / 2, dbY + cellH + 4.5, { align: 'center' });
        doc.setFont('helvetica', 'bold');
    });

    // ── ECONEXO INFO ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    const ecoLines = [
        'EcoNexo SpA',
        '77.855.394-5',
        'Servicios Ambientales, consultorías en gestión de residuos y capacitaciones',
        '14 de Febrero #2534',
        '+569 35626886',
    ];
    ecoLines.forEach((line, i) => doc.text(line, ml, 24 + i * 4.5));

    // ── Certificate Number ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(certificateNumber, mr, 28, { align: 'right' });

    // ── CLIENT TABLE ──
    const clientTableY = 50;
    const labelW = 28;
    const valueW = mr - ml - labelW;
    const rowH = 7;
    const clientRows: { label: string; value: string }[] = [
        { label: 'Señor(es):', value: client.company_name },
        { label: 'Rut:', value: client.rut },
        { label: 'Dirección:', value: client.address },
    ];
    if (client.contact_name) clientRows.push({ label: 'Contacto:', value: client.contact_name });
    if (client.contact_email) clientRows.push({ label: 'Correo:', value: client.contact_email });

    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 0, 0);
    clientRows.forEach((row, i) => {
        const y = clientTableY + i * rowH;
        doc.rect(ml, y, labelW, rowH);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(0, 0, 0);
        doc.text(row.label, ml + 2, y + 4.6);
        doc.rect(ml + labelW, y, valueW, rowH);
        doc.setFont('helvetica', 'normal');
        doc.text(String(row.value).substring(0, 55), ml + labelW + 3, y + 4.6);
    });

    // ── TITLE ──
    const titleY = clientTableY + clientRows.length * rowH + 12;
    const titleText = 'CERTIFICADO DE TRANSPORTE Y RECEPCION DE MATERIAL';
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(titleText, pageWidth / 2, titleY, { align: 'center' });
    const tw = doc.getTextWidth(titleText);
    doc.setLineWidth(0.4);
    doc.line((pageWidth - tw) / 2, titleY + 1, (pageWidth + tw) / 2, titleY + 1);

    // ── MATERIALS TABLE ──
    const tableStartY = titleY + 8;
    const fmtQty = (n: number) => Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const totalQty = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const receptionStr = `${dd}-${mm}-${yyyy}`;

    const tableBody: any[] = items.map((item, idx) => {
        const type = (item.waste_type || (item as any).type || '').trim();
        const desc = (item.description || '').trim();
        // Show type + description together, avoid duplicating if they're the same
        const materialText = (type && desc && type.toLowerCase() !== desc.toLowerCase())
            ? `${type} - ${desc}`
            : (type || desc);
        const row: any[] = [
            String(idx + 1),
            materialText.toUpperCase(),
        ];
        if (idx === 0) {
            // Span the date cell across all item rows, vertically centered
            row.push({ content: receptionStr, rowSpan: items.length, styles: { valign: 'middle', halign: 'center' } });
        }
        row.push(fmtQty(Number(item.quantity) || 0));
        return row;
    });
    tableBody.push(['', '', 'Total', fmtQty(totalQty)]);

    // Light green header: approximates EcoNexo logo green palette
    autoTable(doc, {
        startY: tableStartY,
        head: [['ITEM', 'MATERIAL', 'RECEPCIÓN', 'CANTIDAD (Kg)']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [180, 220, 185], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9, halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { fontSize: 9, textColor: [0, 0, 0], halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0], fillColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 72, halign: 'left' }, 2: { cellWidth: 38 }, 3: { cellWidth: 40 } },
        margin: { left: ml, right: 15 },
    });

    const finalY = (doc as any).lastAutoTable.finalY;

    // ── LEGAL TEXT ──
    const legalStartY = finalY + 10;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('Se establece que:', ml, legalStartY);

    const legalBody = '-El material recolectado por EcoNexo, abarcando tanto residuos de origen domiciliario como no domiciliario, es cuidadosamente entregado a puntos de acopio gestionados por operadores autorizados. Este proceso asegura un traslado responsable hacia Santiago, donde el material es sometido a procesos de tratamiento y reciclaje adecuados.';
    const splitLegal = doc.splitTextToSize(legalBody, mr - ml);
    doc.text(splitLegal, ml, legalStartY + 5.5);

    // ── TRANSPORT (close to legal text) ──
    const transportY = legalStartY + 5.5 + splitLegal.length * 4 + 3;
    doc.setFont('helvetica', 'normal');
    doc.text('Transporte Autorizado por Ministerio de Salud', ml, transportY);
    doc.setFont('helvetica', 'bold');
    doc.text('RESOLUCIÓN N° : 2402341155', ml, transportY + 5);

    // ── SIGNATURES ──
    const sigY = transportY + 68; // enough space so 54mm-tall signature sits fully above line

    // Signature image (376×341 → ratio 1.103) — larger, tight above line
    if (ECONEXO_SIGNATURE) {
        try {
            const sigW = 60; // doubled from 30mm
            const sigH = sigW / 1.103; // ~54mm
            // Position bottom edge touching the signature line
            doc.addImage(ECONEXO_SIGNATURE, 'PNG', ml + 35 - sigW / 2, sigY - sigH, sigW, sigH);
        } catch (e) { /* signature optional */ }
    }

    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 0, 0);
    doc.line(ml, sigY, ml + 70, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('SEBASTIAN FRIAS THOMPSON', ml + 35, sigY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text('GERENTE ECONEXO', ml + 35, sigY + 9, { align: 'center' });

    const sigRX = mr - 70;
    doc.line(sigRX, sigY, mr, sigY);
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMA CLIENTE', sigRX + 35, sigY + 5, { align: 'center' });

    // ── ACTION ──
    if (action === 'preview') {
        window.open(doc.output('bloburl'), '_blank');
    } else {
        savePdf(doc, `CR_${client.company_name.replace(/\s+/g, '_')}_${certificateNumber.replace(/[:\/]/g, '_')}.pdf`);
    }
};

export const generateEcoReport = (client: CompanyData, items: WasteItem[], periodo: string, action: 'save' | 'preview' = 'save', _monthsCount?: number) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // --- Data Processing & Calculation ---

    // Factors derived from User Image
    // Paper (Base: 1 Ton)
    // Equivalencies for display metrics (Non-CO2/Energy/Water)
    const EQUIVALENCIES = {
        treesPerTonPaper: 17,      // Conservatree / Standard
        peopleO2PerTree: 4,        // Oxygen generation
        bauxitePerKgAlu: 4.0,      // Mining avoidance
        rawMatPerTonGlass: 1.2     // 1.2 ton virgin raw material per 1 ton glass
    };

    // Processing data dynamically based on materialFactors
    const materialData: { [key: string]: { qty: number, water: number, energy: number, co2: number } } = {};

    // Initialize structure based on known factors
    Object.keys(materialFactors).forEach(cat => {
        materialData[cat] = { qty: 0, water: 0, energy: 0, co2: 0 };
    });

    items.forEach(item => {
        const qty = Number(item.quantity) || 0;
        const cat = normalizeMaterialType(item);
        const factors = materialFactors[cat] || materialFactors['Otros'];

        if (!materialData[cat]) {
            materialData[cat] = { qty: 0, water: 0, energy: 0, co2: 0 };
        }

        materialData[cat].qty += qty;
        materialData[cat].water += qty * factors.water;
        materialData[cat].energy += qty * factors.energy;
        materialData[cat].co2 += qty * factors.co2;
    });

    const totalKg = Object.values(materialData).reduce((sum, d) => sum + d.qty, 0);
    const totalWater = Object.values(materialData).reduce((sum, d) => sum + d.water, 0);
    const totalEnergy = Object.values(materialData).reduce((sum, d) => sum + d.energy, 0);
    const totalCO2 = Object.values(materialData).reduce((sum, d) => sum + d.co2, 0);

    // Specific metrics for summary
    const paperKg = materialData['Papel/Cartón']?.qty || 0;
    const paperTons = paperKg / 1000;
    const trees = paperTons * EQUIVALENCIES.treesPerTonPaper;
    const peopleO2 = trees * EQUIVALENCIES.peopleO2PerTree;

    const aluminumKg = materialData['Aluminio']?.qty || 0;
    const aluBauxite = aluminumKg * EQUIVALENCIES.bauxitePerKgAlu;

    const glassKg = materialData['Vidrio']?.qty || 0;
    const glassRawMaterial = (glassKg / 1000) * EQUIVALENCIES.rawMatPerTonGlass * 1000; // kg

    // Landfill trucks (Estimation: 1 truck ~ 1 ton)
    const trucks = totalKg / 1000;

    // --- Drawing Functions ---

    const drawHeader = () => {
        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(26);
        doc.setTextColor(50, 50, 50);
        doc.text('REPORTE ECO-EQUIVALENCIA', 14, 25);

        // Decorative Line (Green gradient simulation or just solid)
        doc.setDrawColor(76, 175, 80);
        doc.setLineWidth(1.5);
        doc.line(14, 32, pageWidth - 14, 32);

        // Period (Moved below line)
        doc.setFontSize(14);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'bolditalic');
        doc.text(`PERIODO: ${periodo.toUpperCase()}`, 14, 40);
    };

    const drawRow = (y: number, height: number, color: string, leftText: string[], centerLabels: string[], rightValues: string[]) => {
        // Background for the main row area
        // We simulate the table look: 
        // Col 1 (Blue/LightBlue), Col 2 (LightGray/White), Col 3 (White/Bordered)

        const col1W = 85;
        const col2W = 65;
        const col3W = 40;
        const x1 = 14;
        const x2 = x1 + col1W;
        const x3 = x2 + col2W;

        // Draw background for Col 1 box if provided
        if (color) {
            doc.setFillColor(color);
            // We might just color the header, but here it's per row. 
            // In the image, "Un arbol maduro..." box is blue-ish.
            doc.rect(x1, y, col1W, height, 'F');
        } else {
            doc.rect(x1, y, col1W, height, 'S'); // Outline
        }

        // Draw outlines
        doc.setDrawColor(0);
        doc.setLineWidth(0.2);
        doc.rect(x1, y, col1W + col2W + col3W, height); // Outer
        doc.line(x2, y, x2, y + height); // Vertical 1
        doc.line(x3, y, x3, y + height); // Vertical 2

        // Text Content
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0);

        // Left Column (Description)
        // White text if dark background, Black otherwise

        // Let's handle the specific rows manually in the main flow for better control of styling
        // This helper is getting too complex to be generic.
    };

    // --- Main Rendering ---

    drawHeader();
    let currentY = 50;

    // --- UNIFIED WASTE DETAILS TABLE ---
    const tableHeaders = [['Material Reciclado', 'Cantidad (Kg)', 'Agua Ahorrada (L)', 'Energía Ahorrada (Kw)', 'CO2 Evitado (Kg)']];
    const tableData: any[] = [];
    const tableStyles: any = {}; // To store row-specific styles if needed

    // Helper to format numbers
    const fmt = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    // Build Data Rows dynamically
    Object.entries(materialData).forEach(([material, data]) => {
        if (data.qty > 0) {
            tableData.push([
                material,
                fmt(data.qty),
                fmt(data.water),
                fmt(data.energy),
                fmt(data.co2)
            ]);
        }
    });

    // Add Totals Row
    tableData.push(['TOTAL', fmt(totalKg), fmt(totalWater), fmt(totalEnergy), fmt(totalCO2)]);

    // Draw Table
    autoTable(doc, {
        startY: currentY,
        head: tableHeaders,
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: [55, 87, 45], // Dark Green Header
            textColor: 255,
            fontSize: 10,
            fontStyle: 'bold',
            halign: 'center'
        },
        bodyStyles: {
            textColor: 50,
            fontSize: 9,
            halign: 'center'
        },
        columnStyles: {
            0: { halign: 'left', fontStyle: 'bold' } // Material Name
        },
        didParseCell: (data) => {
            // Apply colored backgrounds to the "Material" column cells based on type
            if (data.section === 'body' && data.column.index === 0) {
                const cellText = data.cell.raw as string;
                if (cellText.includes('Papel')) data.cell.styles.fillColor = [220, 230, 245]; // Light Blue
                if (cellText.includes('Plásticos')) data.cell.styles.fillColor = [255, 250, 220]; // Light Yellow
                if (cellText.includes('Vidrio')) data.cell.styles.fillColor = [220, 255, 245]; // Light Teal
                if (cellText.includes('Metales')) data.cell.styles.fillColor = [240, 240, 240]; // Light Gray
                if (cellText.includes('Otros')) data.cell.styles.fillColor = [250, 245, 235]; // Light/Tan
                if (cellText === 'TOTAL') {
                    data.cell.styles.fillColor = [230, 240, 230];
                    data.cell.styles.fontStyle = 'bold';
                }
            }
            // Bold the entire Total row
            if (data.section === 'body' && (data.row.raw as string[])[0] === 'TOTAL') {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 240, 230]; // Light Green background for total row
            }
        }
    });

    // Update currentY after table
    currentY = (doc as any).lastAutoTable.finalY + 15;


    // --- PROFESSIONAL SUMMARY SECTION ---
    // Check space
    if (currentY > pageHeight - 90) {
        doc.addPage();
        currentY = 40;
    }

    const summaryBoxHeight = 70; // Taller for more metrics

    // Main Container Border/Background
    doc.setDrawColor(55, 87, 45); // Econexo Green
    doc.setLineWidth(0.5);
    doc.setFillColor(252, 252, 252); // Very light grey/white
    doc.roundedRect(14, currentY, pageWidth - 28, summaryBoxHeight, 3, 3, 'FD');

    // Header Bar
    doc.setFillColor(55, 87, 45); // Dark Green
    doc.roundedRect(14, currentY, pageWidth - 28, 10, 3, 3, 'F');

    // Header Text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN DE ECO-EQUIVALENCIA', pageWidth / 2, currentY + 6.5, { align: 'center' });

    // Summary Content Grid
    const startContentY = currentY + 20;
    const col1X = 25;  // Labels
    const col2X = 140; // Values (aligned right of this point)
    const col3X = 145; // Units (aligned left of this point)

    // Helper to draw summary row
    const drawSummaryRow = (y: number, label: string, value: string, unit: string) => {
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        doc.setFont('helvetica', 'normal');
        doc.text(label, col1X, y);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0); // Black for numbers
        doc.text(value, col2X, y, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80); // Gray for units
        doc.text(unit, col3X, y);

        // Dotted line connector (optional, keeping it clean for now)
        doc.setDrawColor(200);
        doc.setLineWidth(0.1);
        doc.line(col1X + doc.getTextWidth(label) + 2, y + 1, col2X - doc.getTextWidth(value) - 2, y + 1);
    };

    drawSummaryRow(startContentY, 'Total Residuos Recuperados', fmt(totalKg), 'Kg');
    drawSummaryRow(startContentY + 8, 'Agua Ahorrada', fmt(totalWater), 'Litros');
    drawSummaryRow(startContentY + 16, 'Energía Ahorrada', fmt(totalEnergy), 'Kw');
    drawSummaryRow(startContentY + 24, 'CO2 Evitado a la Atmósfera', fmt(totalCO2), 'Kg');

    let dynamicRowY = startContentY + 32;
    if (paperKg > 0) {
        drawSummaryRow(dynamicRowY, 'Árboles Salvados', trees.toFixed(1), 'Unidades');
        dynamicRowY += 8;
        drawSummaryRow(dynamicRowY, 'Oxígeno para (personas/día)', peopleO2.toFixed(0), 'Personas');
        dynamicRowY += 8;
    }
    if (aluminumKg > 0) {
        drawSummaryRow(dynamicRowY, 'Bauxita Evitada', fmt(aluBauxite), 'Kg');
        dynamicRowY += 8;
    }
    if (glassKg > 0) {
        drawSummaryRow(dynamicRowY, 'Materia Prima Virgen Evitada', fmt(glassRawMaterial), 'Kg');
        dynamicRowY += 8;
    }

    // Footer Note (Trucks)
    if (trucks > 0.001) {
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'italic');
        doc.text(`* Esto equivale a evitar el envío de ${trucks.toFixed(2)} camiones de basura al relleno sanitario.`, 14 + 5, currentY + summaryBoxHeight - 5);
    }

    // --- SABÍAS QUE SECTION (Page 1) ---
    const didYouKnow: string[] = [];

    if (materialData['Papel/Cartón']?.qty > 0) {
        didYouKnow.push("Para fabricar una tonelada de papel celulosa se necesita talar 17 arboles. Reciclar una tonelada de papel evita la tala de estos y reduce significativamente las emisiones.");
        didYouKnow.push("Reciclar una tonelada de papel ahorra el consumo de 26.000 litros de agua y 4.000 Kw/hora de energía (Estándar EPA).");
    }
    if (materialData['Plásticos']?.qty > 0) {
        didYouKnow.push("Reciclar un kilo de plástico ahorra 15 litros de agua, evita emitir aprox. 1,5 Kg de CO2 a la atmósfera y el consumo de 5,0 Kw de energía.");
    }
    if (materialData['Aluminio']?.qty > 0) {
        didYouKnow.push("Reciclar un kilo de aluminio es altamente eficiente: ahorra 4 kilos de bauxita, evita emitir 9,13 kilos de CO2 y ahorra 14 Kw de energía.");
    }
    if (materialData['Vidrio']?.qty > 0) {
        didYouKnow.push("Reciclar 1 tonelada de vidrio evita emitir 280 kg de Co2, 500 kw de energia y 1,2 toneladas de materia prima virgen.");
    }
    if (materialData['Electrónicos']?.qty > 0) {
        didYouKnow.push("Reciclar electrónicos permite recuperar metales valiosos y evita que contaminantes peligrosos lleguen al suelo, ahorrando hasta un 80% de energía vs la minería tradicional.");
    }

    // Always add general facts
    didYouKnow.push("Un arbol maduro de 10 años de edad, produce el oxigeno que requieren 4 personas para respirar y consume 12 Kg de CO2 al año.");
    didYouKnow.push("Una planta de energía al producir 1 Kw/hora emite 0,5 kilos de CO2 de carbono a la atmosfera.");

    let factY = currentY + summaryBoxHeight + 10;
    if (didYouKnow.length > 0 && factY < pageHeight - 35) {
        doc.setFontSize(12);
        doc.setTextColor(55, 87, 45);
        doc.setFont('helvetica', 'bold');
        doc.text('¿SABÍAS QUE?', 14, factY);
        factY += 8;

        doc.setFontSize(10);
        doc.setTextColor(60);
        doc.setFont('helvetica', 'normal');

        didYouKnow.forEach(fact => {
            const splitText = doc.splitTextToSize(fact, pageWidth - 35);
            if (factY + splitText.length * 5 < pageHeight - 20) {
                doc.setFillColor(76, 175, 80);
                doc.circle(18, factY - 1.5, 0.8, 'F');
                doc.text(splitText, 22, factY);
                factY += (splitText.length * 4.5) + 2.5;
            }
        });
    }

    // Page 1 Footer (Green Bar with Number '1')
    doc.setFillColor(55, 87, 45); // Dark Green
    doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
    doc.setTextColor(255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('1', pageWidth / 2, pageHeight - 5, { align: 'center' });

    // --- PAGE 2 ---
    doc.addPage();

    // Page 2 Watermark (Faded/Opacity)
    try {
        if (ECONEXO_WATERMARK) {
            doc.saveGraphicsState();
            doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
            const wmSize = 150;
            doc.addImage(ECONEXO_WATERMARK, 'PNG', (pageWidth - wmSize) / 2, 80, wmSize, wmSize);
            doc.restoreGraphicsState();
        }
    } catch (e) { }

    currentY = 30; // Started higher up (was 40)

    // Sources Section
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Fuentes:', 20, currentY); // x=20

    const sources = [
        'https://www.residuosprofesional.com/industria-reciclaje-ahorro-recursos/',
        'https://www.ecologiaverde.com/el-proceso-de-reciclaje-del-papel-2872.html',
        'https://www.sgfertility.cl/blog-sgf/eco-equivalencia-el-impacto-positivo-asociado-al-reciclaje-en-sgf/',
        'INECC (2020). Metodología para la identificación y cuantificación de acciones de mitigación por el reciclaje de residuos sólidos urbanos.'
    ];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 100, 200); // Blue for links
    let srcY = currentY + 6;

    sources.forEach(src => {
        // More margin for sources too
        const splitSrc = doc.splitTextToSize(src, pageWidth - 40);
        if (src.startsWith('http')) {
            doc.setTextColor(0, 100, 200);
            doc.text(splitSrc, 26, srcY);
            doc.setFillColor(0, 0, 0);
            doc.circle(22, srcY - 1, 1, 'F');
        } else {
            doc.setTextColor(0);
            doc.text(splitSrc, 26, srcY);
            doc.setFillColor(0, 0, 0);
            doc.circle(22, srcY - 1, 1, 'F');
        }
        srcY += (splitSrc.length * 4) + 2;
    });

    currentY = srcY + 10;

    // Narrative Section
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Se establece que:', 20, currentY);
    currentY += 6;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    // Dynamic Paragraph 1
    const p1 = `Durante el periodo reportado (${periodo}), ${client.company_name} (RUT ${client.rut}), en alianza con EcoNexo (RUT 77.855.394-5), ha logrado recuperar y gestionar un total de ${totalKg.toFixed(2)} kg de residuos, los cuales fueron enviados a gestores locales autorizados para su valorización y tratamiento final.`;
    const splitP1 = doc.splitTextToSize(p1, pageWidth - 40);
    doc.text(splitP1, 20, currentY);
    currentY += (splitP1.length * 4.5) + 4;

    // Paragraph 2 (Static Context)
    const p2 = "Es importante señalar que las operaciones principales de la empresa se realizaron fuera de la ciudad durante este periodo, lo que influyó directamente en una menor generación de residuos en las instalaciones habituales.";
    const splitP2 = doc.splitTextToSize(p2, pageWidth - 40);
    doc.text(splitP2, 20, currentY);
    currentY += (splitP2.length * 4.5) + 4;

    // Paragraph 3 (Baseline Context) - EXCLUSIVE FOR ELECTRORAM
    if (client.company_name.toLowerCase().includes('electroram')) {
        const p3 = "Para dimensionar el alcance de la recuperación, consideramos la línea base de generación en condiciones operativas normales:";
        const splitP3 = doc.splitTextToSize(p3, pageWidth - 40);
        doc.text(splitP3, 20, currentY);
        currentY += (splitP3.length * 4.5) + 2;

        // Bullets (Baseline)
        const isRange = periodo.includes('-') || periodo.toLowerCase().includes('trimestre');
        const monthsCount = isRange ? 3 : 1;
        const baselineMin = 72 * monthsCount;
        const baselineMax = 80 * monthsCount;

        const b1 = `En las oficinas de ${client.company_name} se estima una generación típica de 4 bolsas de residuos por semana, con un peso entre 4,5 y 5 kg por bolsa.`;
        const splitB1 = doc.splitTextToSize(b1, pageWidth - 50);
        doc.circle(24, currentY + 1.5, 1, 'F');
        doc.text(splitB1, 28, currentY + 2);
        currentY += (splitB1.length * 4.5) + 2;

        let b2 = "";
        if (isRange) {
            b2 = `Esto equivale a un peso mensual entre 72 y 80 kg, y en un trimestre (3 meses) a un total estimado entre ${baselineMin} y ${baselineMax} kg.`;
        } else {
            b2 = `Esto equivale a un peso mensual estimado entre ${baselineMin} y ${baselineMax} kg.`;
        }

        const splitB2 = doc.splitTextToSize(b2, pageWidth - 50);
        doc.circle(24, currentY + 1.5, 1, 'F');
        doc.text(splitB2, 28, currentY + 2);
        currentY += (splitB2.length * 4.5) + 6;

        // Comparison Logic
        const pctMin = (totalKg / baselineMin * 100).toFixed(1);
        const pctMax = (totalKg / baselineMax * 100).toFixed(1);

        const p4 = `Frente a este escenario de referencia, los ${totalKg.toFixed(2)} kg recuperados representan:`;
        doc.text(p4, 20, currentY);
        currentY += 5;

        doc.setFont('helvetica', 'bold');
        doc.circle(24, currentY + 1.5, 1, 'F');
        doc.text(`${pctMin}%`, 28, currentY + 2);
        doc.setFont('helvetica', 'normal');
        doc.text(`respecto al escenario de menor generación (${baselineMin} kg).`, 40, currentY + 2);
        currentY += 5;

        doc.setFont('helvetica', 'bold');
        doc.circle(24, currentY + 1.5, 1, 'F');
        doc.text(`${pctMax}%`, 28, currentY + 2);
        doc.setFont('helvetica', 'normal');
        doc.text(`respecto al escenario de mayor generación (${baselineMax} kg).`, 40, currentY + 2);
        currentY += 8;

        // Analysis - Dependent on the percentages above
        const p5 = "Estos porcentajes reflejan un avance significativo en la gestión de residuos, especialmente considerando el contexto operativo atípico del período.";
        const splitP5 = doc.splitTextToSize(p5, pageWidth - 40);
        doc.text(splitP5, 20, currentY);
        currentY += (splitP5.length * 4.5) + 2;
    }

    const p6 = "Los resultados obtenidos demuestran un compromiso activo con la economía circular y la reducción del impacto ambiental, aún en condiciones de operación descentralizada.";
    const splitP6 = doc.splitTextToSize(p6, pageWidth - 40);
    doc.text(splitP6, 20, currentY);
    currentY += (splitP6.length * 4.5) + 6;

    // Commitments
    doc.text("Se mantendrán los esfuerzos para:", 20, currentY);
    currentY += 6;

    const goals = [
        "1. Incrementar progresivamente las tasas de recuperación.",
        "2. Fortalecer las estrategias de segregación y valorización.",
        "3. Alinear las operaciones externas con los protocolos de sostenibilidad de la empresa."
    ];

    goals.forEach(g => {
        const splitG = doc.splitTextToSize(g, pageWidth - 40);
        if (currentY + (splitG.length * 5) > pageHeight - 25) {
            // Footer for current page before adding a new one
            doc.setFillColor(55, 87, 45);
            doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
            doc.setTextColor(255);
            doc.setFontSize(14);
            doc.text('2', pageWidth / 2, pageHeight - 5, { align: 'center' });

            doc.addPage();
            currentY = 30;
            doc.setTextColor(0);
        }
        doc.text(splitG, 26, currentY);
        currentY += (splitG.length * 4.5) + 1;
    });

    currentY += 6;

    // Final Closing
    if (currentY > pageHeight - 40) {
        doc.setFillColor(55, 87, 45);
        doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
        doc.setTextColor(255);
        doc.setFontSize(14);
        doc.text('2', pageWidth / 2, pageHeight - 5, { align: 'center' });

        doc.addPage();
        currentY = 30;
        doc.setTextColor(0);
    }

    const footerText = `${client.company_name} mantiene su compromiso con la gestión ambiental responsable, promoviendo acciones concretas que fomenten la economía circular y contribuyan a minimizar el impacto ambiental de sus operaciones.`;
    const splitFooter = doc.splitTextToSize(footerText, pageWidth - 40);
    doc.setFont('helvetica', 'bold');
    doc.text(splitFooter, pageWidth / 2, currentY, { align: 'center' });


    // Footer Page 2 (Green Bar)
    doc.setFillColor(55, 87, 45); // Unified Dark Green
    doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
    doc.setTextColor(255);
    doc.setFontSize(14);
    doc.text('2', pageWidth / 2, pageHeight - 5, { align: 'center' });

    // --- PAGE 3 ---
    doc.addPage();

    // Header Image (Full Ratio)
    try {
        if (REPORT_HEADER_BG) {
            const imgHeight = pageWidth * 0.312; // Aspect ratio from 318/1018
            doc.addImage(REPORT_HEADER_BG, 'PNG', 0, 0, pageWidth, imgHeight);
        }
    } catch (e) { }

    // Watermark (Faded/Opacity)
    try {
        if (ECONEXO_WATERMARK) {
            doc.saveGraphicsState();
            doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
            const wmSize = 150; // Adjusted size (180 reduced by ~0.2)
            doc.addImage(ECONEXO_WATERMARK, 'PNG', (pageWidth - wmSize) / 2, 80, wmSize, wmSize);
            doc.restoreGraphicsState();
        }
    } catch (e) { }

    currentY = 100;

    // Certification Text (Rich Text)
    const certFontSize = 18;
    doc.setFontSize(certFontSize);

    // Define parts
    const parts = [
        { text: "Este reporte es emitido por ", bold: false },
        { text: "Sebastián Frías Thompson", bold: true },
        { text: ", representante legal de ", bold: false },
        { text: "EcoNexo", bold: true, color: [76, 175, 80] }, // Green
        { text: ", técnico en gestión de calidad y ambiente y reciclador de base, y representa un registro fiel y exacto de la gestión realizada durante este periodo.", bold: false }
    ];

    const maxWidth = pageWidth - 40;
    const lineHeight = 9;

    // Flatten into words with style info
    let words: { text: string, bold: boolean, color?: number[] }[] = [];
    parts.forEach(p => {
        const pWords = p.text.split(/(\s+)/); // Maintain spaces
        pWords.forEach(w => {
            if (w) words.push({ text: w, bold: p.bold, color: p.color });
        });
    });

    let line: typeof words = [];

    // Function to measure line width
    const getLineWidth = (l: typeof words) => {
        let width = 0;
        l.forEach(w => {
            doc.setFont('helvetica', w.bold ? 'bold' : 'normal');
            width += doc.getTextWidth(w.text);
        });
        return width;
    };

    // Build and render lines
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        let testLine = [...line, word];
        if (getLineWidth(testLine) > maxWidth && line.length > 0) {
            // Render current line
            const lineWidth = getLineWidth(line);
            let cursorX = (pageWidth - lineWidth) / 2;

            line.forEach(w => {
                doc.setFont('helvetica', w.bold ? 'bold' : 'normal');
                doc.setTextColor(w.color ? w.color[0] : 0, w.color ? w.color[1] : 0, w.color ? w.color[2] : 0);
                doc.text(w.text, cursorX, currentY);
                cursorX += doc.getTextWidth(w.text);
            });

            currentY += lineHeight;
            line = [word];
        } else {
            line.push(word);
        }
    }
    // Render last line
    if (line.length > 0) {
        const lineWidth = getLineWidth(line);
        let cursorX = (pageWidth - lineWidth) / 2;
        line.forEach(w => {
            doc.setFont('helvetica', w.bold ? 'bold' : 'normal');
            doc.setTextColor(w.color ? w.color[0] : 0, w.color ? w.color[1] : 0, w.color ? w.color[2] : 0);
            doc.text(w.text, cursorX, currentY);
            cursorX += doc.getTextWidth(w.text);
        });
        currentY += lineHeight;
    }

    currentY += 20;

    // Thank You Text
    const thanksText = "¡Gracias por la confianza depositada en nosotros para colaborar en la sostenibilidad empresarial!";
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bolditalic');
    doc.setTextColor(76, 175, 80); // Eco Green

    const splitThanks = doc.splitTextToSize(thanksText, pageWidth - 40);
    doc.text(splitThanks, pageWidth / 2, currentY, { align: 'center' });

    // Signatures
    const sigY = 220;

    // Left Signature (Sebastian)
    doc.setDrawColor(100);
    doc.setLineWidth(0.5);
    doc.line(30, sigY, 90, sigY); // Line

    try {
        if (ECONEXO_SIGNATURE) {
            doc.addImage(ECONEXO_SIGNATURE, 'PNG', 35, sigY - 35, 50, 40);
        }
    } catch (e) { }

    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text("Sebastián Frías Thompson", 60, sigY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text("CEO EcoNexo", 60, sigY + 10, { align: 'center' });

    // Right Signature (Client)
    doc.setDrawColor(100);
    doc.line(120, sigY, 180, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.setFontSize(10);

    let clientName = client.company_name.toUpperCase();
    if (clientName.length > 25) doc.setFontSize(8);

    doc.text(clientName, 150, sigY + 5, { align: 'center' });

    // Page 3 Footer (Green Bar with Number '3')
    doc.setFillColor(55, 87, 45); // Dark Green
    doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
    doc.setTextColor(255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('3', pageWidth / 2, pageHeight - 5, { align: 'center' });

    if (action === 'preview') {
        window.open(doc.output('bloburl'), '_blank');
    } else {
        savePdf(doc, `Reporte_EcoEq_${client.company_name.trim()}_${periodo}.pdf`);
    }
};

const addFooter = (doc: jsPDF, pageWidth: number, pageHeight: number) => {
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    const footerY = pageHeight - 20;

    doc.setFont('helvetica', 'bold');
    doc.text('EcoNexo SpA', pageWidth / 2, footerY, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.text('www.econexo.cl', pageWidth / 2, footerY + 4, { align: 'center' });
};
// Custom Document Generator
export const generateCustomDoc = (client: CompanyData, title: string, contentHtml: string, referenceNumber: string) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Use Header from CR but adapted
    // Header - Econexo Branding
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, pageWidth, 45, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');

    // Add Logo
    if (ECONEXO_LOGO) {
        try {
            doc.addImage(ECONEXO_LOGO, 'PNG', 14, 5, 48, 13);
        } catch (e) {
            console.error("Logo error:", e);
        }
    } else {
        doc.setFontSize(22);
        doc.text('ECONEXO', 14, 22);
    }

    doc.setFontSize(8);
    doc.text('EcoNexo SpA | RUT: 77.855.394-5', 14, 22);
    doc.text('Servicios Ambientales, consultorías en gestión de residuos y capacitaciones', 14, 27);
    doc.text('14 de Febrero #2534, Antofagasta | +569 35626886', 14, 32);
    doc.text('econexo.hub@gmail.com', 14, 37);

    doc.setFontSize(12);
    doc.text(referenceNumber, pageWidth - 14, 22, { align: 'right' });

    doc.setFontSize(9);
    doc.text(`Fecha Emisión: ${new Date().toLocaleDateString()}`, pageWidth - 14, 30, { align: 'right' });

    // Document Title
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), pageWidth / 2, 60, { align: 'center' });

    // Client Info
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    doc.text(`Empresa: ${client.company_name}`, 14, 75);
    doc.text(`RUT: ${client.rut}`, 14, 80);
    doc.text(`Dirección: ${client.address}`, 14, 85);

    doc.line(14, 90, pageWidth - 14, 90);

    // Parse simple HTML content to text (very basic for now as jsPDF HTML is complex)
    // For a robust solution in production we would benefit from html2canvas or pure text
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('times', 'normal');

    // Simple HTML stripper for the PDF preview (limitations of client-side jsPDF without heavy libs)
    // In a real generic editor we might want to just pass plain text or use the HTML method of jsPDF (experimental)

    // Attempt to use a basic flow for text
    const margins = { top: 100, bottom: 40, left: 14, width: pageWidth - 28 };

    // Use a temporary div to parse the content
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = contentHtml;

    let yPos = 100;

    // Iterate through children to handle text and tables separately
    Array.from(tempDiv.childNodes).forEach((node: any) => {
        if (yPos > pageHeight - 60) {
            doc.addPage();
            yPos = 20;
        }

        if (node.nodeName === 'TABLE') {
            // Enhanced table handling with autoTable
            (doc as any).autoTable({
                html: node,
                startY: yPos,
                theme: 'grid',
                headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 2 },
                columnStyles: {
                    0: { cellWidth: 15, halign: 'center' },
                    3: { halign: 'right' }
                },
                didDrawPage: (data: any) => {
                    yPos = data.cursor.y;
                }
            });
            yPos = (doc as any).lastAutoTable.finalY + 10;
        } else if (node.nodeName === 'DIV' || node.nodeName === 'P' || node.nodeName === '#text' || node.nodeName === 'BR') {
            const text = node.innerText || node.textContent || "";
            if (text.trim() === "" && node.nodeName !== 'BR') return;

            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');

            // Check if it should be bold (simple check for strong/b)
            if (node.querySelector && (node.querySelector('strong') || node.querySelector('b'))) {
                doc.setFont('helvetica', 'bold');
            }

            const splitText = doc.splitTextToSize(text, margins.width);
            doc.text(splitText, 14, yPos);
            yPos += (splitText.length * 5) + (node.nodeName === 'BR' ? 5 : 2);
        }
    });

    // Signature Area
    const docHeight = doc.internal.pageSize.getHeight();
    // Use smaller signature area and more grouped text to match editor
    const sigY = Math.max(yPos + 20, docHeight - 45);
    if (ECONEXO_SIGNATURE) {
        try {
            doc.addImage(ECONEXO_SIGNATURE, 'PNG', (pageWidth / 2) - 25, sigY - 20, 50, 25);
        } catch (e) {
            console.error("Signature error", e);
        }
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('_________________________', pageWidth / 2, sigY + 5, { align: 'center' });
    doc.text('Firma Autorizada', pageWidth / 2, sigY + 10, { align: 'center' });
    doc.text('EcoNexo SpA', pageWidth / 2, sigY + 15, { align: 'center' });

    savePdf(doc, `${title.replace(/\s+/g, '_')}_${referenceNumber}.pdf`);
};




export interface CgmDestination {
    name: string;
    rut?: string;
    resolution?: string;
}

export const generateCGM = (client: CompanyData, items: WasteItem[], month: string, year: number, action: 'save' | 'preview' = 'save', docNumber?: number | string, destinations?: CgmDestination[]) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // --- COLORS ---
    const HEADER_GREY = [40, 40, 40];
    const HEADER_GREEN = [45, 106, 79];
    const TABLE_YELLOW = [255, 225, 100];
    const TABLE_BLUE = [0, 85, 165];
    const TABLE_GREY = [160, 160, 160];
    const TABLE_LIGHT_GREY = [235, 235, 235];

    // --- 1. HEADER ---
    doc.setFillColor(HEADER_GREY[0], HEADER_GREY[1], HEADER_GREY[2]);
    doc.rect(0, 0, pageWidth, 35, 'F');

    // CGM uses the white/light logo version (designed for dark backgrounds)
    const cgmLogo = ECONEXO_LOGO_CGM || ECONEXO_FULL_LOGO_V2 || ECONEXO_FULL_LOGO || ECONEXO_LOGO;
    if (cgmLogo) {
        try {
            const logoH = 24;
            const logoW = 108;
            doc.addImage(cgmLogo, 'PNG', (pageWidth - logoW) / 2, (35 - logoH) / 2, logoW, logoH);
        } catch (e) {
            doc.setTextColor(255);
            doc.setFontSize(24);
            doc.setFont('helvetica', 'bold');
            doc.text("EcoNexo", pageWidth / 2, 23, { align: 'center' });
        }
    } else {
        doc.setTextColor(255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text("EcoNexo", pageWidth / 2, 23, { align: 'center' });
    }

    doc.setTextColor(255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    const numText = docNumber != null ? `Nº${docNumber}` : "Nº--";
    const numX = pageWidth - 20;
    const numY = 22;
    doc.text(numText, numX, numY, { align: 'right' });

    const textW = doc.getTextWidth(numText);
    doc.setDrawColor(255);
    doc.setLineWidth(0.5);
    doc.line(numX - textW, numY + 2, numX, numY + 2);

    doc.setFillColor(HEADER_GREEN[0], HEADER_GREEN[1], HEADER_GREEN[2]);
    doc.rect(0, 35, pageWidth, 18, 'F');
    doc.setTextColor(255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text("CERTIFICADO GESTION MENSUAL DE RESIDUOS", pageWidth / 2, 46, { align: 'center' });

    // --- 2. LEGAL TEXT (with bold date and inline rendering) ---
    let currentY = 65;
    doc.setTextColor(0);
    doc.setFontSize(12);
    const margin = 22;
    const textBoxWidth = pageWidth - (margin * 2);

    // Render paragraph: intro (normal) / bold date on its own line / continuation (normal)
    doc.setFont('helvetica', 'normal');
    const introText = `EcoNexo SpA, certificamos que, en el período comprendido entre el`;
    const introLines = doc.splitTextToSize(introText, textBoxWidth);
    introLines.forEach((line: string) => { doc.text(line, margin, currentY); currentY += 6; });

    doc.setFont('helvetica', 'bold');
    // Compute the real last day of the month so the certificate period matches the
    // actual calendar (e.g. June ends on 30, February on 28/29, not a hardcoded 31).
    const CGM_MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const monthIndex = CGM_MONTH_NAMES.indexOf(String(month).trim().toLowerCase());
    const lastDay = monthIndex >= 0 ? new Date(year, monthIndex + 1, 0).getDate() : 31;
    const lastDayStr = String(lastDay).padStart(2, '0');
    doc.text(`01 al ${lastDayStr} de ${month} de ${year},`, margin, currentY);
    currentY += 6;

    doc.setFont('helvetica', 'normal');
    const afterText = `hemos llevado a cabo el transporte y entrega de los residuos a gestores locales autorizados en la región de Antofagasta, donde se ha dispuesto de manera adecuada para su posterior reciclaje y/o disposición final, cumpliendo con la normativa legal vigente.`;
    const afterLines = doc.splitTextToSize(afterText, textBoxWidth);
    afterLines.forEach((line: string) => { doc.text(line, margin, currentY); currentY += 6; });
    currentY += 2;

    // --- 3. CLIENT INFO ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    // Underline helper
    const underlineText = (text: string, x: number, y: number) => {
        doc.text(text, x, y);
        const tw = doc.getTextWidth(text);
        doc.setLineWidth(0.3);
        doc.setDrawColor(0);
        doc.line(x, y + 1, x + tw, y + 1);
    };
    underlineText("Provenientes de la empresa:", margin, currentY);
    currentY += 5;

    const drawLabelVal = (lbl: string, val: string) => {
        doc.setFont('helvetica', 'bold');
        doc.text(lbl, margin, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(val, margin + 30, currentY);
        currentY += 5;
    };

    drawLabelVal("Razón Social:", client.company_name.toUpperCase());
    drawLabelVal("RUT:", client.rut);
    drawLabelVal("Dirección:", client.address);
    currentY += 8;

    // --- 4. DATA SECTION ---
    doc.setFont('helvetica', 'bold');
    underlineText("De los cuales, se gestionó un total de:", margin, currentY);
    currentY += 8;

    // ── Complete material catalogue: color + text contrast + display label ──
    // Order defines rendering priority in the table
    const MATERIAL_DEFS: { key: string; label: string; color: number[]; textMain: number[] }[] = [
        { key: 'PET',          label: 'PET',            color: [245, 158,  11], textMain: [0,   0,   0  ] }, // ámbar
        { key: 'Plástico HDPE',label: 'PLÁSTICO HDPE',  color: [251, 191,  36], textMain: [0,   0,   0  ] }, // ámbar claro
        { key: 'Plástico Film',label: 'PLÁSTICO FILM',  color: [253, 230, 138], textMain: [0,   0,   0  ] }, // ámbar pálido
        { key: 'Plástico PP',  label: 'PLÁSTICO PP',    color: [217, 119,   6], textMain: [255, 255, 255] }, // ámbar oscuro
        { key: 'Plásticos',    label: 'PLÁSTICOS',      color: [255, 225, 100], textMain: [0,   0,   0  ] }, // amarillo
        { key: 'Cartón',       label: 'CARTÓN',         color: [37,  99,  235], textMain: [255, 255, 255] }, // azul intenso
        { key: 'Papel',        label: 'PAPEL',          color: [147, 197, 253], textMain: [0,   0,   0  ] }, // azul claro
        { key: 'Papel/Cartón', label: 'PAPEL/CARTÓN',   color: [0,   85,  165], textMain: [255, 255, 255] }, // azul
        { key: 'Vidrio',       label: 'VIDRIO',         color: [56,  142,  60], textMain: [255, 255, 255] }, // verde
        { key: 'Metales',      label: 'METALES',        color: [120, 120, 120], textMain: [255, 255, 255] }, // gris
        { key: 'Aluminio',     label: 'ALUMINIO',       color: [190, 190, 190], textMain: [0,   0,   0  ] }, // gris claro
        { key: 'Madera',       label: 'MADERA',         color: [139,  90,  43], textMain: [255, 255, 255] }, // café
        { key: 'Orgánicos',    label: 'ORGÁNICOS',      color: [ 93,  64,  55], textMain: [255, 255, 255] }, // café oscuro
        { key: 'Neumáticos',   label: 'NEUMÁTICOS',     color: [ 33,  33,  33], textMain: [255, 255, 255] }, // negro
        { key: 'Electrónicos', label: 'ELECTRÓNICOS',   color: [ 21, 101, 192], textMain: [255, 255, 255] }, // azul tech
        { key: 'Peligrosos',   label: 'PELIGROSOS',     color: [198,  40,  40], textMain: [255, 255, 255] }, // rojo
        { key: 'Aceites',      label: 'ACEITES',        color: [245, 127,  23], textMain: [0,   0,   0  ] }, // ámbar
        { key: 'Textiles',     label: 'TEXTILES',       color: [106,  27, 154], textMain: [255, 255, 255] }, // morado
        // Estas dos no se valorizan. Necesitan fila propia: si caen en "OTROS"
        // la basura domiciliaria se mezcla con el reciclaje en el certificado.
        { key: 'Domiciliarios', label: 'RSD Y ASIMILABLES', color: [120, 113, 108], textMain: [255, 255, 255] }, // piedra
        { key: 'RESCON',       label: 'RESCON',         color: [161,  98,   7], textMain: [255, 255, 255] }, // tierra
        { key: 'Otros',        label: 'OTROS',          color: [200, 200, 200], textMain: [0,   0,   0  ] }, // gris claro
    ];

    // Build dynamic categories map
    const categories: any = {};
    MATERIAL_DEFS.forEach(d => { categories[d.key] = { ...d, qty: 0, pct: 0 }; });

    let totalKg = 0;
    items.forEach(i => {
        const cat = normalizeMaterialType(i);
        const q = Number(i.quantity) || 0;
        totalKg += q;
        if (categories[cat]) categories[cat].qty += q;
        else categories['Otros'].qty += q;
    });
    if (totalKg === 0) totalKg = 1;
    MATERIAL_DEFS.forEach(d => {
        categories[d.key].pct = (categories[d.key].qty / totalKg) * 100;
    });

    const tX = margin;
    const col1 = 60;
    const col2 = 30;
    const col3 = 30;
    const rowH = 10;
    const gap = 2;

    // Disable stroke for solid colors
    doc.setLineWidth(0);

    // Smart number formatter — removes unnecessary decimals (590,00 → 590, 12,60 → 12,6)
    const formatKg = (n: number): string => {
        const r = Math.round(n * 100) / 100;
        if (r % 1 === 0) return r.toFixed(0);
        return r.toFixed(2).replace('.', ',').replace(/0+$/, '');
    };

    // Table header
    doc.setFillColor(220, 220, 220);
    doc.rect(tX, currentY, col1, rowH, 'F');
    doc.rect(tX + col1 + gap, currentY, col2, rowH, 'F');
    doc.rect(tX + col1 + col2 + gap * 2, currentY, col3, rowH, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text("RESIDUOS", tX + col1 / 2, currentY + 7, { align: 'center' });
    doc.text("KG", tX + col1 + gap + col2 / 2, currentY + 7, { align: 'center' });
    doc.text("%", tX + col1 + col2 + gap * 2 + col3 / 2, currentY + 7, { align: 'center' });
    currentY += rowH + gap;

    const drawRow = (def: typeof MATERIAL_DEFS[0]) => {
        const d = categories[def.key];
        if (!d || d.qty <= 0) return;
        doc.setFillColor(d.color[0], d.color[1], d.color[2]);
        doc.setLineWidth(0);
        doc.rect(tX, currentY, col1, rowH, 'F');
        doc.rect(tX + col1 + gap, currentY, col2, rowH, 'F');
        doc.rect(tX + col1 + col2 + gap * 2, currentY, col3, rowH, 'F');
        doc.setTextColor(d.textMain[0], d.textMain[1], d.textMain[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(def.label, tX + col1 / 2, currentY + 7, { align: 'center' });
        doc.text(formatKg(d.qty), tX + col1 + gap + col2 / 2, currentY + 7, { align: 'center' });
        doc.text(d.pct.toFixed(1).replace('.', ','), tX + col1 + col2 + gap * 2 + col3 / 2, currentY + 7, { align: 'center' });
        currentY += rowH + gap;
    };

    // Render ALL materials that have qty > 0, in defined order
    MATERIAL_DEFS.forEach(def => drawRow(def));

    doc.setFillColor(TABLE_LIGHT_GREY[0], TABLE_LIGHT_GREY[1], TABLE_LIGHT_GREY[2]);
    doc.rect(tX, currentY, col1, rowH, 'F');
    doc.rect(tX + col1 + gap, currentY, col2, rowH, 'F');
    doc.rect(tX + col1 + col2 + gap * 2, currentY, col3, rowH, 'F');
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text("TOTAL", tX + col1 / 2, currentY + 7, { align: 'center' });
    doc.text(formatKg(totalKg), tX + col1 + gap + col2 / 2, currentY + 7, { align: 'center' });
    doc.text("100", tX + col1 + col2 + gap * 2 + col3 / 2, currentY + 7, { align: 'center' });

    const pieX = 175;
    const pieY = currentY - (rowH * 2) + 5;
    const radius = 18;
    let startAngle = -Math.PI / 2;
    // Pie uses MATERIAL_DEFS order for consistent segment layout
    const activeCats = MATERIAL_DEFS.map(d => d.key).filter(k => categories[k]?.pct > 0);
    if (activeCats.length === 0) {
        doc.setDrawColor(200);
        doc.circle(pieX, pieY, radius, 'S');
    } else if (activeCats.length === 1) {
        const c = categories[activeCats[0]];
        doc.setFillColor(c.color[0], c.color[1], c.color[2]);
        doc.circle(pieX, pieY, radius, 'F');
    } else {
        activeCats.forEach(k => {
            const cat = categories[k];
            const sliceAngle = (cat.pct / 100) * (2 * Math.PI);
            const endAngle = startAngle + sliceAngle;

            // Draw each segment as a single filled polygon (no gaps between triangles)
            const steps = Math.max(48, Math.ceil(Math.abs(sliceAngle) * radius * 1.5));
            const arcPts: [number, number][] = [];
            for (let s = 0; s <= steps; s++) {
                const angle = startAngle + (sliceAngle * s / steps);
                arcPts.push([
                    pieX + radius * Math.cos(angle),
                    pieY + radius * Math.sin(angle)
                ]);
            }
            // Build relative path: center → arc → close back to center
            const relLines: number[][] = [];
            relLines.push([arcPts[0][0] - pieX, arcPts[0][1] - pieY]);
            for (let i = 1; i < arcPts.length; i++) {
                relLines.push([arcPts[i][0] - arcPts[i - 1][0], arcPts[i][1] - arcPts[i - 1][1]]);
            }
            doc.setFillColor(cat.color[0], cat.color[1], cat.color[2]);
            doc.setDrawColor(cat.color[0], cat.color[1], cat.color[2]);
            doc.setLineWidth(0);
            (doc as any).lines(relLines, pieX, pieY, [1, 1], 'F', true);

            startAngle += sliceAngle;
        });
    }

    currentY += 25;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    underlineText("DESTINO AUTORIZADO:", margin, currentY);
    currentY += 6;
    doc.setFont('helvetica', 'normal');
    // Destinations are selected by the admin when generating the CGM and stored in
    // the document metadata. Fall back to the legacy fixed pair only when the
    // document predates this feature (no destinations passed at all).
    const fallbackDestinations: CgmDestination[] = [
        { name: 'SOREPA SPA.', rut: '86.359.300-K', resolution: 'Resolución N°7621 SEREMI DE SALUD ANTOFAGASTA' },
        { name: 'GCR', rut: '76.958.842-6', resolution: 'Resolución N°2248, SEREMI DE SALUD ANTOFAGASTA' },
    ];
    const destinationList = destinations === undefined ? fallbackDestinations : destinations;
    if (destinationList.length === 0) {
        doc.text('—', margin, currentY);
        currentY += 8;
    } else {
        destinationList.forEach(d => {
            const line1 = d.rut ? `${d.name}, RUT: ${d.rut}` : d.name;
            doc.text(line1, margin, currentY);
            currentY += 5;
            if (d.resolution) {
                doc.text(d.resolution, margin, currentY);
                currentY += 5;
            }
            currentY += 3;
        });
    }

    // --- TRANSPORTE AUTORIZADO (below destinos) ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    underlineText("Transporte Autorizado:", margin, currentY);
    currentY += 6;
    doc.setFont('helvetica', 'bold');
    doc.text("RESOLUCIÓN N° : 2402341155,  SEREMI DE SALUD ANTOFAGASTA", margin, currentY);
    currentY += 8;

    const sigY = pageHeight - 45;
    if (ECONEXO_SIGNATURE) {
        try {
            doc.addImage(ECONEXO_SIGNATURE, 'PNG', pageWidth - 70, sigY - 30, 40, 30);
        } catch (e) { }
    }
    doc.setLineWidth(0.5);
    doc.setDrawColor(0);
    doc.line(pageWidth - 80, sigY, pageWidth - 20, sigY);
    doc.setFont('helvetica', 'bold');
    doc.text("Sebastián Frías Thompson", pageWidth - 50, sigY + 5, { align: 'center' });
    doc.text("Gerente EcoNexo", pageWidth - 50, sigY + 10, { align: 'center' });

    // --- 7. FOOTER BAR (reference image — exact match) ---
    const footerH = 14;
    if (CGM_FOOTER_BAR) {
        try {
            // Image ratio: 1822×98 ≈ 18.59 — render full page width, proportional height
            const imgH = pageWidth / (1822 / 98); // ~11.3mm
            const imgY = pageHeight - imgH;
            doc.addImage(CGM_FOOTER_BAR, 'PNG', 0, imgY, pageWidth, imgH);
        } catch (e) {
            // Fallback: plain green bar
            doc.setFillColor(HEADER_GREEN[0], HEADER_GREEN[1], HEADER_GREEN[2]);
            doc.rect(0, pageHeight - footerH, pageWidth, footerH, 'F');
        }
    } else {
        doc.setFillColor(HEADER_GREEN[0], HEADER_GREEN[1], HEADER_GREEN[2]);
        doc.rect(0, pageHeight - footerH, pageWidth, footerH, 'F');
    }

    if (ECONEXO_WATERMARK) {
        try {
            doc.saveGraphicsState();
            doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
            const wmSize = 160;
            doc.addImage(ECONEXO_WATERMARK, 'PNG', (pageWidth - wmSize) / 2, 70, wmSize, wmSize);
            doc.restoreGraphicsState();
        } catch (e) { }
    }

    if (action === 'preview') {
        window.open(doc.output('bloburl'), '_blank');
    } else {
        savePdf(doc, `CGM_${client.company_name.replace(/\s+/g, '_')}_${month}_${year}.pdf`);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// generateCommunityCR — Certificado de Retiro Comunitario
// ─────────────────────────────────────────────────────────────────────────────
interface CommunityData {
    community_name: string;
    sector: string;
    participants_count?: number;
}

export const generateCommunityCR = (
    community: CommunityData,
    items: WasteItem[],
    certificateNumber: string,
    action: 'save' | 'preview' = 'save',
    customDate?: string
) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const ml = 15;
    const mr = pageWidth - 15;

    // ── FECHA ──
    const emissionDate = customDate ? new Date(customDate + 'T12:00:00') : new Date();
    const dd = String(emissionDate.getDate()).padStart(2, '0');
    const mm = String(emissionDate.getMonth() + 1).padStart(2, '0');
    const yyyy = String(emissionDate.getFullYear());

    // ── WATERMARK ──
    if (ECONEXO_WATERMARK) {
        try {
            doc.saveGraphicsState();
            doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
            const wmW = 85;
            const wmH = wmW / 0.653;
            doc.addImage(ECONEXO_WATERMARK, 'PNG', (pageWidth - wmW) / 2, (pageHeight - wmH) / 2 + 10, wmW, wmH);
            doc.restoreGraphicsState();
        } catch (e) { }
    }

    // ── LOGO top-left ──
    const logoToUse = ECONEXO_FULL_LOGO_V2 || ECONEXO_FULL_LOGO || ECONEXO_LOGO;
    if (logoToUse) {
        try {
            const logoW = 58;
            const logoH = logoW / 4.89;
            doc.addImage(logoToUse, 'PNG', ml, 6, logoW, logoH);
        } catch (e) {
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(22, 163, 74);
            doc.text('EcoNexo', ml, 14);
        }
    }

    // ── DATE BOXES top-right ──
    const cellW = 15, cellH = 7;
    const dbX = mr - cellW * 3;
    const dbY = 8;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);

    ['Día', 'Mes', 'Año'].forEach((label, i) => {
        doc.rect(dbX + i * cellW, dbY, cellW, cellH);
        doc.text(label, dbX + i * cellW + cellW / 2, dbY + 4.5, { align: 'center' });
    });
    [dd, mm, yyyy].forEach((val, i) => {
        doc.rect(dbX + i * cellW, dbY + cellH, cellW, cellH);
        doc.setFont('helvetica', 'normal');
        doc.text(String(val), dbX + i * cellW + cellW / 2, dbY + cellH + 4.5, { align: 'center' });
        doc.setFont('helvetica', 'bold');
    });

    // ── ECONEXO INFO ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    const ecoLines = [
        'EcoNexo SpA',
        '77.855.394-5',
        'Servicios Ambientales, consultorías en gestión de residuos y capacitaciones',
        '14 de Febrero #2534',
        '+569 35626886',
    ];
    ecoLines.forEach((line, i) => doc.text(line, ml, 24 + i * 4.5));

    // ── Certificate Number ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(certificateNumber, mr, 28, { align: 'right' });

    // ── COMMUNITY INFO TABLE ──
    const clientTableY = 50;
    const labelW = 35;
    const valueW = mr - ml - labelW;
    const rowH = 7;
    const communityRows: { label: string; value: string }[] = [
        { label: 'Comunidad/Barrio:', value: community.community_name },
        { label: 'Sector/Ubicación:', value: community.sector },
    ];
    if (community.participants_count && community.participants_count > 0) {
        communityRows.push({ label: 'N° Participantes:', value: String(community.participants_count) });
    }

    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 0, 0);
    communityRows.forEach((row, i) => {
        const y = clientTableY + i * rowH;
        doc.rect(ml, y, labelW, rowH);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(0, 0, 0);
        doc.text(row.label, ml + 2, y + 4.6);
        doc.rect(ml + labelW, y, valueW, rowH);
        doc.setFont('helvetica', 'normal');
        doc.text(String(row.value).substring(0, 55), ml + labelW + 3, y + 4.6);
    });

    // ── TITLE ──
    const titleY = clientTableY + communityRows.length * rowH + 12;
    const titleText = 'CERTIFICADO DE RETIRO COMUNITARIO';
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(titleText, pageWidth / 2, titleY, { align: 'center' });
    const tw = doc.getTextWidth(titleText);
    doc.setLineWidth(0.4);
    doc.line((pageWidth - tw) / 2, titleY + 1, (pageWidth + tw) / 2, titleY + 1);

    // ── MATERIALS TABLE ──
    const tableStartY = titleY + 8;
    const fmtQty = (n: number) => Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const totalQty = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const receptionStr = `${dd}-${mm}-${yyyy}`;

    const tableBody: any[] = items.map((item, idx) => {
        const type = (item.waste_type || (item as any).type || '').trim();
        const desc = (item.description || '').trim();
        const materialText = (type && desc && type.toLowerCase() !== desc.toLowerCase())
            ? `${type} - ${desc}`
            : (type || desc);
        const row: any[] = [
            String(idx + 1),
            materialText.toUpperCase(),
        ];
        if (idx === 0) {
            row.push({ content: receptionStr, rowSpan: items.length, styles: { valign: 'middle', halign: 'center' } });
        }
        row.push(fmtQty(Number(item.quantity) || 0));
        return row;
    });
    tableBody.push(['', '', 'Total', fmtQty(totalQty)]);

    autoTable(doc, {
        startY: tableStartY,
        head: [['ITEM', 'MATERIAL', 'RECEPCIÓN', 'CANTIDAD (Kg)']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [180, 220, 185], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9, halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { fontSize: 9, textColor: [0, 0, 0], halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0], fillColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 72, halign: 'left' }, 2: { cellWidth: 38 }, 3: { cellWidth: 40 } },
        margin: { left: ml, right: 15 },
    });

    const finalY = (doc as any).lastAutoTable.finalY;

    // ── LEGAL TEXT ──
    const legalStartY = finalY + 10;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('Se establece que:', ml, legalStartY);

    const legalBody = '-El material recolectado por EcoNexo, abarcando tanto residuos de origen domiciliario como no domiciliario, es cuidadosamente entregado a puntos de acopio gestionados por operadores autorizados. Este proceso asegura un traslado responsable hacia Santiago, donde el material es sometido a procesos de tratamiento y reciclaje adecuados.';
    const splitLegal = doc.splitTextToSize(legalBody, mr - ml);
    doc.text(splitLegal, ml, legalStartY + 5.5);

    // ── TRANSPORT ──
    const transportY = legalStartY + 5.5 + splitLegal.length * 4 + 3;
    doc.setFont('helvetica', 'normal');
    doc.text('Transporte Autorizado por Ministerio de Salud', ml, transportY);
    doc.setFont('helvetica', 'bold');
    doc.text('RESOLUCIÓN N° : 2402341155', ml, transportY + 5);

    // ── SIGNATURES ──
    const sigY = transportY + 68;

    if (ECONEXO_SIGNATURE) {
        try {
            const sigW = 60;
            const sigH = sigW / 1.103;
            doc.addImage(ECONEXO_SIGNATURE, 'PNG', ml + 35 - sigW / 2, sigY - sigH, sigW, sigH);
        } catch (e) { }
    }

    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 0, 0);
    doc.line(ml, sigY, ml + 70, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('SEBASTIAN FRIAS THOMPSON', ml + 35, sigY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text('GERENTE ECONEXO', ml + 35, sigY + 9, { align: 'center' });

    const sigRX = mr - 70;
    doc.line(sigRX, sigY, mr, sigY);
    doc.setFont('helvetica', 'bold');
    doc.text('REPRESENTANTE COMUNIDAD', sigRX + 35, sigY + 5, { align: 'center' });

    // ── ACTION ──
    if (action === 'preview') {
        window.open(doc.output('bloburl'), '_blank');
    } else {
        savePdf(doc, `CRC_${community.community_name.replace(/\s+/g, '_')}_${certificateNumber.replace(/[:\/]/g, '_')}.pdf`);
    }
};
