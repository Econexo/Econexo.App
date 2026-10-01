import { describe, it, expect } from 'vitest';
import { buildXlsx } from './xlsx';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('buildXlsx', () => {
  const bytes = buildXlsx({
    name: 'Septiembre 2026',
    rows: [['Empresa', 'Kg'], ['=HYPERLINK("x") & <Co>', 12.5], ['Ñuñoa', 0]],
    boldRows: [0],
  });

  it('es un ZIP (firma PK) con las partes de un libro de Excel', () => {
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    const raw = text(bytes);
    for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) {
      expect(raw).toContain(part);
    }
  });

  it('guarda los números como número y los textos escapados, nunca como fórmula', () => {
    const raw = text(bytes);
    expect(raw).toContain('<c r="B2"><v>12.5</v></c>');
    expect(raw).toContain('=HYPERLINK(&quot;x&quot;) &amp; &lt;Co&gt;');
    expect(raw).not.toContain('<f>');
    expect(raw).toContain('Ñuñoa');
    expect(raw).toContain('<c r="A1" s="1" t="inlineStr">');
  });
});
