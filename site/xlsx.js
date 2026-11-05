/* Exporta os dados para uma planilha .xlsx de verdade (OOXML dentro de um ZIP sem compressão).
   Sem bibliotecas: funciona offline e abre no Excel, Google Planilhas e LibreOffice. */
'use strict';

/* ---------- ZIP (método "store") ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], cd = [];
  const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data), size = data.length;
    const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)]);
    parts.push(local, name, data);
    cd.push({ name, crc, size, off });
    off += local.length + name.length + size;
  }
  let cdSize = 0;
  for (const e of cd) {
    const h = new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(e.crc), ...u32(e.size), ...u32(e.size), ...u16(e.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(e.off)]);
    parts.push(h, e.name); cdSize += h.length + e.name.length;
  }
  parts.push(new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(cd.length), ...u16(cd.length), ...u32(cdSize), ...u32(off), ...u16(0)]));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* ---------- células ---------- */
const xe = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const XS = { head: 1, money: 2, date: 3, bold: 4, pct: 5, title: 6, moneyBold: 7 };
const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const S = (v, s = 0) => ({ k: 's', v, s });
const N = (v, s = 0) => ({ k: 'n', v, s });
const F = (f, v, s = 0) => ({ k: 'f', f, v, s });
const D = (iso, s = XS.date) => iso ? { k: 'n', v: Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5), s } : S('');
function cellXml(c, ref) {
  if (!c || (c.k === 's' && c.v === '')) return '';
  const st = c.s ? ` s="${c.s}"` : '';
  if (c.k === 's') return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xe(c.v)}</t></is></c>`;
  if (c.k === 'n') return `<c r="${ref}"${st}><v>${Number(c.v)}</v></c>`;
  return `<c r="${ref}"${st}><f>${xe(c.f)}</f><v>${Number(c.v) || 0}</v></c>`;
}
function sheetXml(sh) {
  const rows = sh.rows.map((r, i) => `<row r="${i + 1}">${r.map((c, j) => cellXml(c, colName(j) + (i + 1))).join('')}</row>`).join('');
  const cols = `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const pane = sh.freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '';
  const filter = sh.filter && sh.rows.length > 1 ? `<autoFilter ref="A1:${colName(sh.widths.length - 1)}${sh.rows.length}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${sh.noGrid ? ' showGridLines="0"' : ''}>${pane}</sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData>${filter}</worksheet>`;
}
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00;\\-&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF32785C"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF32785C"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function buildXlsx(sheets) {
  const NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files = [
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS}"><sheets>${sheets.map((s, i) => `<sheet name="${xe(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${NS}/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', text: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) })),
  ];
  return zipStore(files);
}

/* ---------- monta as abas a partir dos dados do painel ---------- */
function exportXlsx() {
  const head = a => a.map(t => S(t, XS.head));
  const V = live('vendas').sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const Dp = live('despesas').sort((a, b) => (a.data || '￿').localeCompare(b.data || '￿'));
  const R = live('receber');
  const all = stats('all');

  const vendas = { name: 'Vendas', freeze: true, filter: true, widths: [12, 22, 26, 15, 14, 34], rows: [head(['Data', 'Cliente', 'Produto', 'Pagamento', 'Valor', 'Observação']),
    ...V.map(v => [D(v.data), S(v.cliente), S(v.produto), S(v.pagamento), N(v.valor, XS.money), S(v.obs)])] };
  const despesas = { name: 'Despesas', freeze: true, filter: true, widths: [12, 32, 20, 12, 15, 10, 11, 16, 10], rows: [head(['Data', 'Descrição', 'Categoria', 'Forma', 'Valor total', 'Parcelas', 'Restantes', 'Valor da parcela', 'Mensal']),
    ...Dp.map(d => [D(d.data), S(d.descricao), S(d.categoria), S(d.forma), N(d.valor, XS.money), N(d.parcelas), N(d.restantes), N(r2(parcelaValor(d)), XS.money), S(d.recorrente ? 'Sim' : '')])] };
  const receber = { name: 'A receber', freeze: true, widths: [26, 14, 34], rows: [head(['Nome', 'Valor', 'Observação']), ...R.map(r => [S(r.nome), N(r.valor, XS.money), S(r.obs)])] };

  const meses = months();
  const semData = Dp.filter(d => !d.data);
  const porMes = [head(['Mês', 'Vendas', 'Despesas', 'Lucro'])];
  if (semData.length) porMes.push([S('Sem data (importadas)'), N(0, XS.money), N(r2(semData.reduce((s, d) => s + d.valor, 0)), XS.money), null]);
  meses.forEach(k => { const x = stats(k); porMes.push([S(mName(k)), N(r2(x.total), XS.money), N(r2(x.desp), XS.money), null]); });
  const resumo = { name: 'Resumo', noGrid: true, widths: [30, 18, 16, 16], rows: [
    [S('Cozy Mug · Resumo', XS.title)],
    [S(`Gerado em ${fmtDate(today())} · todos os períodos`)],
    [],
    [S('Total vendido', XS.bold), F('SUM(Vendas!E:E)', r2(all.total), XS.moneyBold)],
    [S('Número de vendas', XS.bold), F('COUNT(Vendas!E:E)', all.count)],
    [S('Ticket médio', XS.bold), F('IFERROR(B4/B5,0)', r2(all.ticket), XS.money)],
    [S('Total gasto (despesas)', XS.bold), F('SUM(Despesas!E:E)', r2(all.desp), XS.moneyBold)],
    [S('Lucro', XS.bold), F('B4-B7', r2(all.lucro), XS.moneyBold)],
    [S('Margem', XS.bold), F('IFERROR(B8/B4,0)', all.total ? all.lucro / all.total : 0, XS.pct)],
    [S('A receber', XS.bold), F("SUM('A receber'!B:B)", r2(all.receber), XS.money)],
    [S('Parcelas do mês', XS.bold), N(r2(all.parcelasMes), XS.money)],
    [S('Falta pagar no cartão', XS.bold), N(r2(all.dividaRest), XS.money)],
    [],
    ...porMes.map((r, i) => i === 0 ? r : [r[0], r[1], r[2], F(`B${13 + i + 1}-C${13 + i + 1}`, r2((r[1].v || 0) - (r[2].v || 0)), XS.money)]),
  ] };
  // a tabela "por mês" começa na linha 14 (cabeçalho); as linhas de dados usam as linhas 15 em diante
  const bytes = buildXlsx([resumo, vendas, despesas, receber]);
  download(`cozy-mug-${today()}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return { vendas: V.length, despesas: Dp.length, receber: R.length };
}
