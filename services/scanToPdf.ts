import { jsPDF } from 'jspdf';
import { fitWithinA4 } from './pdfGeometry';

export interface ScanPage {
  dataUrl: string; // image/jpeg data URL
  width: number;   // natural pixel width
  height: number;  // natural pixel height
}

export function buildScanPdf(pages: ScanPage[]): Blob {
  if (pages.length === 0) {
    throw new Error('No hay páginas para generar el PDF');
  }
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  pages.forEach((page, i) => {
    if (i > 0) doc.addPage();
    const { width, height } = fitWithinA4(page.width, page.height);
    const x = (pageW - width) / 2;
    const y = (pageH - height) / 2;
    doc.addImage(page.dataUrl, 'JPEG', x, y, width, height);
  });

  return doc.output('blob');
}
