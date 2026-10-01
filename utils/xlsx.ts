// Excel (.xlsx) real, sin dependencias.
//
// Antes se descargaba un TSV con extensión .xls: Excel avisaba que «el formato
// y la extensión no coinciden» y en Mac dejaba cada fila entera en la columna A.
// Un .xlsx es un ZIP con unos pocos XML; acá se arma sin comprimir (método
// «stored»), que Excel, Numbers y Google Sheets abren sin problema.
//
// Los textos van como «inlineStr»: Excel nunca los interpreta como fórmula, así
// que un nombre que empiece con «=» llega tal cual, sin riesgo.

export type XlsxValue = string | number | null | undefined;

export interface XlsxStyle {
  bold?: boolean;
  italic?: boolean;
  /** Tamaño de letra; 11 por defecto. */
  size?: number;
  /** Color del texto, hex sin «#». */
  color?: string;
  /** Color de fondo, hex sin «#». */
  fill?: string;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'center' | 'bottom';
  wrap?: boolean;
  /** Borde fino en los cuatro lados, de este color (hex sin «#»). */
  border?: string;
  /** Formato de número, como en Excel: '#,##0.0'. */
  numFmt?: string;
}

/** Celda: un valor suelto, o valor con estilo. Una celda vacía con estilo se dibuja igual (bordes, fondo). */
export type XlsxCell = XlsxValue | { v: XlsxValue; s?: XlsxStyle };

export interface XlsxSheet {
  name: string;
  rows: XlsxCell[][];
  /** Filas (índice desde 0) que van en negrita, para hojas sin estilos propios. */
  boldRows?: number[];
  /** Ancho de cada columna, en caracteres. */
  colWidths?: number[];
  /** Alto de filas puntuales (índice desde 0 → puntos). */
  rowHeights?: Record<number, number>;
  /** Rangos combinados, como 'A5:A8'. */
  merges?: string[];
  /** Filas fijas arriba al desplazarse (encabezados). */
  freezeRows?: number;
  /** Oculta la cuadrícula gris de fondo, para hojas con bordes propios. */
  hideGridLines?: boolean;
}

export const cellValue = (cell: XlsxCell): XlsxValue =>
  cell !== null && typeof cell === 'object' ? cell.v : (cell as XlsxValue);

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const escapeXml = (text: string) =>
  text
    // Caracteres de control que el XML no admite (salvo tab y salto de línea).
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const columnLetter = (index: number) => {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

// ── Estilos ─────────────────────────────────────────────────────────────────
// Excel guarda fuentes, fondos, bordes y formatos en listas, y cada celda apunta
// a una combinación (cellXfs). Se registran a medida que aparecen, sin repetir.

class StyleRegistry {
  private fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
  private fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  private numFmts: string[] = [];
  private xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private byKey = new Map<string, number>();

  private add(list: string[], xml: string): number {
    const i = list.indexOf(xml);
    if (i >= 0) return i;
    list.push(xml);
    return list.length - 1;
  }

  /** Índice de estilo para el atributo s="…" de la celda (0 = sin estilo). */
  id(style?: XlsxStyle): number {
    if (!style || Object.keys(style).length === 0) return 0;
    const key = JSON.stringify(style);
    const known = this.byKey.get(key);
    if (known !== undefined) return known;

    const font = this.add(this.fonts, '<font>'
      + (style.bold ? '<b/>' : '') + (style.italic ? '<i/>' : '')
      + `<sz val="${style.size ?? 11}"/>`
      + (style.color ? `<color rgb="FF${style.color}"/>` : '')
      + '<name val="Calibri"/></font>');
    const fill = style.fill
      ? this.add(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${style.fill}"/><bgColor indexed="64"/></patternFill></fill>`)
      : 0;
    const side = (tag: string) => `<${tag} style="thin"><color rgb="FF${style.border}"/></${tag}>`;
    const border = style.border
      ? this.add(this.borders, `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`)
      : 0;
    const numFmt = style.numFmt ? 164 + this.add(this.numFmts, style.numFmt) : 0;
    const alignment = style.align || style.valign || style.wrap
      ? '<alignment'
        + (style.align ? ` horizontal="${style.align}"` : '')
        + (style.valign ? ` vertical="${style.valign}"` : '')
        + (style.wrap ? ' wrapText="1"' : '')
        + '/>'
      : '';

    const xf = `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"`
      + (font ? ' applyFont="1"' : '') + (fill ? ' applyFill="1"' : '') + (border ? ' applyBorder="1"' : '')
      + (numFmt ? ' applyNumberFormat="1"' : '') + (alignment ? ` applyAlignment="1">${alignment}</xf>` : '/>');
    const id = this.add(this.xfs, xf);
    this.byKey.set(key, id);
    return id;
  }

  xml(): string {
    const numFmts = this.numFmts.length
      ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${escapeXml(f)}"/>`).join('')}</numFmts>`
      : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + numFmts
      + `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>`
      + `<fills count="${this.fills.length}">${this.fills.join('')}</fills>`
      + `<borders count="${this.borders.length}">${this.borders.join('')}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>';
  }
}

function sheetXml(sheet: XlsxSheet, styles: StyleRegistry): string {
  const bold = new Set(sheet.boldRows ?? []);
  const cols = sheet.colWidths?.length
    ? `<cols>${sheet.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((cell, c) => {
      const value = cellValue(cell);
      const own = cell !== null && typeof cell === 'object' ? cell.s : undefined;
      const style = styles.id(own ?? (bold.has(r) ? { bold: true } : undefined));
      const s = style ? ` s="${style}"` : '';
      const ref = `${columnLetter(c)}${r + 1}`;
      if (value === null || value === undefined || value === '') return style ? `<c r="${ref}"${s}/>` : '';
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${ref}"${s}><v>${value}</v></c>`;
      }
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
    }).join('');
    const height = sheet.rowHeights?.[r];
    return `<row r="${r + 1}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells}</row>`;
  }).join('');

  const pane = sheet.freezeRows
    ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  const freeze = pane || sheet.hideGridLines
    ? `<sheetViews><sheetView${sheet.hideGridLines ? ' showGridLines="0"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews>`
    : '';
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    // Al imprimir, todo el ancho en una hoja.
    + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    + `${freeze}${cols}<sheetData>${rows}</sheetData>${merges}`
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>'
    + '</worksheet>';
}

function workbookFiles(sheet: XlsxSheet): Record<string, string> {
  const styles = new StyleRegistry();
  const worksheet = sheetXml(sheet, styles);
  // Excel limita el nombre de la hoja a 31 caracteres y prohíbe : \ / ? * [ ]
  const sheetName = escapeXml(sheet.name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Hoja1');
  return {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>',
    'xl/styles.xml': styles.xml(),
    'xl/worksheets/sheet1.xml': worksheet,
  };
}

// ── ZIP sin compresión ──────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // Fecha fija (1-ene-2020): da lo mismo para Excel y deja el archivo reproducible.
  const dosTime = 0;
  const dosDate = ((2020 - 1980) << 9) | (1 << 5) | 1;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(content);
    const crc = crc32(data);

    const header = new Uint8Array(30 + nameBytes.length);
    const h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true); // nombres en UTF-8
    h.setUint16(8, 0, true); // stored
    h.setUint16(10, dosTime, true);
    h.setUint16(12, dosDate, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    local.push(header, data);

    const entry = new Uint8Array(46 + nameBytes.length);
    const e = new DataView(entry.buffer);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint16(8, 0x0800, true);
    e.setUint16(10, 0, true);
    e.setUint16(12, dosTime, true);
    e.setUint16(14, dosDate, true);
    e.setUint32(16, crc, true);
    e.setUint32(20, data.length, true);
    e.setUint32(24, data.length, true);
    e.setUint16(28, nameBytes.length, true);
    e.setUint32(42, offset, true);
    entry.set(nameBytes, 46);
    central.push(entry);

    offset += header.length + data.length;
  }

  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array(22);
  const d = new DataView(end.buffer);
  d.setUint32(0, 0x06054b50, true);
  d.setUint16(8, central.length, true);
  d.setUint16(10, central.length, true);
  d.setUint32(12, centralSize, true);
  d.setUint32(16, offset, true);

  const parts = [...local, ...central, end];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

/** Bytes del .xlsx con una sola hoja. */
export function buildXlsx(sheet: XlsxSheet): Uint8Array {
  return zipStored(workbookFiles(sheet));
}

/** Descarga el .xlsx en el navegador. `filename` debe terminar en .xlsx. */
export function downloadXlsx(filename: string, sheet: XlsxSheet): void {
  const blob = new Blob([buildXlsx(sheet)], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
