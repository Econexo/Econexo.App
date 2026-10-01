// Descargas del cierre mensual. Siempre desde un cierre guardado, para que lo
// que recibe el gestor coincida con el registro.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { closureToSheet, closureTotalKg, type ClosureCompany } from '../utils/monthlyClosure';
import { downloadXlsx } from '../utils/xlsx';
import { periodLabel } from '../utils/monthlyBreakdown';
import { formatKg } from '../utils/formatKg';
import type { ClosureDestination } from './monthlyClosureService';

const fileSafe = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/_+$/, '');

export function downloadClosureXls(destinationName: string, periodKey: string, companies: ClosureCompany[]): void {
  downloadXlsx(
    `Cierre_${fileSafe(destinationName)}_${periodKey}.xlsx`,
    closureToSheet(destinationName, periodKey, companies),
  );
}

export function downloadClosurePdf(
  destination: Pick<ClosureDestination, 'name' | 'rut' | 'resolution'>,
  periodKey: string,
  companies: ClosureCompany[],
  closedAt: string,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const green: [number, number, number] = [50, 97, 5];
  const W = 210;

  doc.setFillColor(...green);
  doc.rect(0, 0, W, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Cierre Mensual de Residuos', 14, 15);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${periodLabel(periodKey)} · EcoNexo`, 14, 23);

  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Gestor: ${destination.name}`, 14, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let y = 50;
  if (destination.rut) { doc.text(`RUT: ${destination.rut}`, 14, y); y += 5; }
  if (destination.resolution) { doc.text(destination.resolution, 14, y); y += 5; }
  const cerrado = new Date(closedAt).toLocaleDateString('es-CL');
  doc.text(`Cerrado el ${cerrado} · ${companies.length} empresa(s)`, 14, y);
  y += 6;

  const body: string[][] = [];
  for (const c of companies) {
    c.materials.forEach((m, i) => {
      body.push([
        i === 0 ? c.name : '',
        i === 0 ? c.rut : '',
        m.material,
        formatKg(m.kg),
        i === 0 ? c.certNumbers.join(', ') : '',
      ]);
    });
    body.push(['', '', `Subtotal ${c.name}`, formatKg(c.totalKg), '']);
  }

  autoTable(doc, {
    startY: y + 2,
    head: [['Empresa', 'RUT', 'Residuo', 'Kg', 'N° CT']],
    body,
    foot: [['TOTAL', '', '', formatKg(closureTotalKg(companies)), '']],
    theme: 'grid',
    headStyles: { fillColor: green, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [235, 242, 230], textColor: 30, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 3: { halign: 'right' } },
    didParseCell: data => {
      if (data.section === 'body' && String(data.cell.raw).startsWith('Subtotal ')) {
        data.row.cells[2].styles.fontStyle = 'bold';
        data.row.cells[3].styles.fontStyle = 'bold';
      }
    },
  });

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text('Kilos truncados a un decimal, igual que en los certificados de transporte. econexo.cl', 14, 287);

  doc.save(`Cierre_${fileSafe(destination.name)}_${periodKey}.pdf`);
}
