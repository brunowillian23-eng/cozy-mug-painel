/* Interface: telas, filtros, abas, formulários e eventos. Dados e sincronização ficam em core.js. */
'use strict';

const ui = { tab: 'painel', month: 'all', edit: null, shareUrl: null, limit: 15, flash: null, ach: null };
const TABS = [['painel', 'Painel'], ['vendas', 'Vendas'], ['despesas', 'Despesas'], ['receber', 'A receber'], ['ajustes', 'Ajustes']];
const DIA_NOME = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const CATS = ['Caneca em branco', 'Tinta', 'Papel sublimático', 'Embalagem', 'Frete', 'Equipamento', 'Marketing', 'Taxas', 'MEI', 'Outros'];
let cardI = 0;
const ci = () => `style="--i:${Math.min(cardI++, 9)}"`;

/* ---------- datas ---------- */
const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fromDate = t => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
const addDays = (s, n) => { const t = toDate(s); t.setDate(t.getDate() + n); return fromDate(t); };
const lastDayOf = m => { const [y, mo] = m.split('-').map(Number); return `${m}-${pad(new Date(y, mo, 0).getDate())}`; };
const curMonth = () => today().slice(0, 7);
const prevMonthOf = k => { let [y, m] = k.split('-').map(Number); m--; if (!m) { m = 12; y--; } return `${y}-${pad(m)}`; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const mName = k => `${cap(MES[+k.slice(5) - 1])} ${k.slice(0, 4)}`;
const weekStart = s => { const t = toDate(s); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return fromDate(t); };
const sumBy = (arr, f) => arr.reduce((s, x) => s + (f(x) ? x.valor : 0), 0);

/* ---------- séries para sparklines, tendência e gráficos ---------- */
function series7(m) {
  const step = m === 'all' ? 7 : 1;
  const end = m === 'all' || m === curMonth() ? today() : lastDayOf(m);
  const V = new Map(), D = new Map();
  live('vendas').forEach(v => { const o = V.get(v.data) || { v: 0, n: 0 }; o.v += v.valor; o.n++; V.set(v.data, o); });
  live('despesas').filter(d => d.data).forEach(d => D.set(d.data, (D.get(d.data) || 0) + d.valor));
  const out = { v: [], n: [], t: [], d: [] };
  for (let i = 6; i >= 0; i--) {
    let v = 0, n = 0, d = 0;
    for (let j = 0; j < step; j++) { const k = addDays(end, -(i * step + j)); const o = V.get(k); if (o) { v += o.v; n += o.n; } d += D.get(k) || 0; }
    out.v.push(v); out.n.push(n); out.t.push(n ? v / n : 0); out.d.push(d);
  }
  return out;
}
function trendFor(kind) {
  const items = kind === 'vendas' ? live('vendas') : live('despesas').filter(d => d.data);
  let cur, prev, label;
  if (ui.month === 'all') {
    const t = today(), a = addDays(t, -29), b = addDays(t, -59);
    cur = sumBy(items, x => x.data >= a && x.data <= t); prev = sumBy(items, x => x.data >= b && x.data < a); label = 'vs 30 dias anteriores';
  } else {
    cur = sumBy(items, x => x.data.startsWith(ui.month)); prev = sumBy(items, x => x.data.startsWith(prevMonthOf(ui.month))); label = 'vs mês anterior';
  }
  return prev > 0 ? { pct: (cur - prev) / prev * 100, label } : { none: true, label };
}
function trendHtml(t, color) {
  if (t.none) return `<div class="trend" title="Sem dados no período anterior para comparar">— sem comparação</div>`;
  const up = t.pct >= 0, p = Math.abs(t.pct);
  return `<div class="trend ${color && up ? 'up' : ''}"><span class="arr" aria-hidden="true">${up ? '▲' : '▼'}</span><span>${up ? '+' : '−'}${p.toFixed(0)}% ${t.label}</span></div>`;
}
function lineSeries() {
  const V = live('vendas').filter(v => inMonth(v.data, ui.month)); if (!V.length) return null;
  const map = new Map(); V.forEach(v => map.set(v.data, (map.get(v.data) || 0) + v.valor));
  const pts = [];
  if (ui.month !== 'all') {
    const first = ui.month + '-01', last = ui.month === curMonth() ? today() : lastDayOf(ui.month);
    for (let k = first; k <= last; k = addDays(k, 1)) pts.push({ l: k.slice(8) + '/' + k.slice(5, 7), v: map.get(k) || 0 });
    return { pts, unit: 'Dia' };
  }
  const ds = [...map.keys()].sort(), end = today() > ds[ds.length - 1] ? today() : ds[ds.length - 1];
  for (let k = weekStart(ds[0]); k <= end; k = addDays(k, 7)) {
    let s = 0; for (let j = 0; j < 7; j++) s += map.get(addDays(k, j)) || 0;
    pts.push({ l: k.slice(8) + '/' + k.slice(5, 7), v: s });
  }
  return { pts, unit: 'Semana de' };
}

/* ---------- conquistas ---------- */
function achievements() {
  const a = stats('all'), n = a.count;
  return [
    { id: 'first', name: 'Primeira venda', desc: 'Registrou a primeira venda', ok: n >= 1, glyph: 'star', c: '--yellow' },
    { id: 'v10', name: '10 vendas', desc: 'Chegou a 10 vendas', ok: n >= 10, glyph: '10', c: '--pink' },
    { id: 'v50', name: '50 vendas', desc: 'Chegou a 50 vendas', ok: n >= 50, glyph: '50', c: '--lilac' },
    { id: 'r1k', name: 'R$ 1.000', desc: 'R$ 1.000 vendidos no total', ok: a.total >= 1000, glyph: '1k', c: '--yellow' },
    { id: 'r5k', name: 'R$ 5.000', desc: 'R$ 5.000 vendidos no total', ok: a.total >= 5000, glyph: '5k', c: '--pink' },
    { id: 'roi', name: 'Investimento de volta', desc: 'As vendas já cobrem tudo que foi gasto', ok: a.desp > 0 && a.total >= a.desp, glyph: 'check', c: '--mint' },
    { id: 'paid', name: 'Tudo recebido', desc: 'Ninguém devendo', ok: n > 0 && a.nReceber === 0, glyph: 'heart', c: '--lilac' },
  ];
}
const achievedIds = () => achievements().filter(a => a.ok).map(a => a.id);

/* ---------- peças de tela ---------- */
const mline = (label, key, val, fmt, o = {}) => `<div class="mline${o.main ? ' main' : ''}" style="--r:${o.r || 0}"><span class="ml">${label}</span><span class="mv">${o.spark || ''}<b data-key="${key}" data-count="${val}" data-fmt="${fmt}">${fmtVal(val, fmt)}</b></span></div>`;
const fld = (label, inner, cls = '') => `<label class="field ${cls}"><span>${label}</span>${inner}</label>`;
const inp = (name, type, val, extra = '') => `<input type="${type}" name="${name}" value="${esc(val ?? '')}" ${extra}>`;
const empty = (title, text, btn = '') => `<div class="empty">${emptyArt()}<b>${title}</b><span>${text}</span>${btn}</div>`;
const skeleton = () => `<div class="grid3">${[0, 1, 2].map(() => `<div class="card"><div class="sk" style="width:40%"></div><div class="sk big"></div><div class="sk"></div><div class="sk" style="width:80%"></div></div>`).join('')}</div><div class="card"><div class="sk" style="width:30%"></div><div class="sk tall"></div></div>`;

/* ---------- PAINEL ---------- */
function viewPainel() {
  const m = ui.month, s = stats(m), all = stats('all'), meta = db.config.meta || 0;
  const sp = series7(m), tV = trendFor('vendas'), tD = trendFor('despesas');
  const fullW = Math.max(300, ($('#view').clientWidth || 640) - 52);   // largura útil de um cartão de página inteira
  const margem = s.total > 0 ? s.lucro / s.total * 100 : 0;
  let h = `<div class="grid3">
  <article class="card lift" data-tilt ${ci()}><h3>Vendas</h3>${trendHtml(tV, true)}
    ${mline('Total vendido', 'v-total', s.total, 'brl', { main: 1, spark: spark(sp.v), r: 0 })}
    ${mline('Número de vendas', 'v-n', s.count, 'int', { spark: spark(sp.n), r: 1 })}
    ${mline('Ticket médio', 'v-tk', s.ticket, 'brl', { spark: spark(sp.t), r: 2 })}</article>
  <article class="card lift" data-tilt ${ci()}><h3>Despesas</h3>${trendHtml(tD, false)}
    ${mline('Total gasto', 'd-total', s.desp, 'brl', { main: 1, spark: spark(sp.d), r: 0 })}
    ${mline('Parcelas do mês', 'd-par', s.parcelasMes, 'brl', { r: 1 })}
    ${mline('Falta pagar no cartão', 'd-rest', s.dividaRest, 'brl', { r: 2 })}</article>
  <article class="card lift" data-tilt ${ci()}><h3>Resultado</h3><div class="trend">${s.lucro >= 0 ? 'Vendas acima das despesas' : 'Despesas acima das vendas'}</div>
    ${mline('Lucro', 'r-lucro', s.lucro, 'brl', { main: 1, r: 0 })}
    ${mline('Margem', 'r-marg', margem, 'pct', { r: 1 })}
    ${mline(`A receber <span class="sub">(${s.nReceber})</span>`, 'r-rec', s.receber, 'brl', { r: 2 })}</article></div>`;

  /* retorno do investimento + meta */
  const roi = all.desp ? all.total / all.desp * 100 : 0;
  const roiTxt = all.lucro >= 0 ? `Tudo que você gastou já voltou: <strong>+${money(all.lucro)}</strong> de sobra.` : `Você vendeu <strong>${money(all.total)}</strong> de <strong>${money(all.desp)}</strong> gastos. Faltam <strong>${money(-all.lucro)}</strong> para empatar.`;
  let metaBlock;
  if (m !== 'all' && meta > 0) {
    const p = s.total / meta * 100;
    metaBlock = `<div class="rings" style="margin-top:20px">${ring(p, Math.round(p) + '%', 'da meta')}<div class="ring-info"><strong>Meta de ${MES[+m.slice(5) - 1]}: ${money(meta)}</strong><p>${s.total >= meta ? 'Meta batida! Parabéns!' : `Faltam <strong>${money(meta - s.total)}</strong> para chegar lá.`}</p></div></div>`;
  } else if (!meta) {
    metaBlock = `<p class="note" style="margin-top:16px">Que tal definir uma meta mensal? Ela aparece aqui como um anel de progresso.</p><div class="row" style="margin-top:8px"><button class="btn small rip pressable" data-act="tab" data-tab="ajustes">Definir meta</button></div>`;
  } else metaBlock = `<p class="note" style="margin-top:16px">Escolha um mês no filtro para ver o progresso da meta de ${money(meta)}.</p>`;
  const wd = Array(7).fill(0), wn = Array(7).fill(0);
  s.V.forEach(v => { const w = toDate(v.data).getDay(); wd[w] += v.valor; wn[w]++; });
  const best = wd.indexOf(Math.max(...wd));
  const rows = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((l, i) => ({ l, v: wd[i], t: money(wd[i]) }));
  h += `<div class="grid2">
  <article class="card lift" ${ci()}><h3>Retorno do investimento</h3><div class="rings">${ring(roi, Math.round(roi) + '%', 'recuperado')}<div class="ring-info"><p>${roiTxt}</p></div></div>${metaBlock}</article>
  <article class="card lift" ${ci()}><h3>Melhores dias da semana</h3>${s.count ? hbars(rows) + `<p class="note">Seu dia mais forte: <strong>${DIA_NOME[best]}</strong>.</p>` : empty('Sem vendas neste período', 'Quando houver vendas, mostro aqui em quais dias elas acontecem.')}</article></div>`;

  /* barras por mês */
  const semData = live('despesas').filter(d => !d.data);
  const groups = [];
  if (semData.length) groups.push({ k: 'sem', a: 0, b: sumBy(semData, () => true), sem: true });
  months().forEach(k => { const x = stats(k); groups.push({ k, a: x.total, b: x.desp }); });
  h += `<article class="card lift" ${ci()}><h3>Vendas × despesas por mês <small>${semData.length ? 'barra “sem data” = despesas importadas' : ''}</small></h3>${groups.length ? barChart(groups, fullW) : empty('Ainda sem movimento', 'Registre a primeira venda na aba Vendas.')}<div class="legend"><span><i class="lv"></i>Vendas</span><span><i class="ld"></i>Despesas</span><span>Linha tracejada: média de vendas por mês</span></div></article>`;

  /* linha */
  const ls2 = lineSeries();
  h += `<article class="card lift" ${ci()}><h3>${m === 'all' ? 'Vendas por semana' : 'Vendas por dia'} <small>passe o mouse ou o dedo no gráfico</small></h3>${ls2 && ls2.pts.length > 1 ? lineChart(ls2.pts, ls2.unit, fullW) : empty('Poucos pontos para desenhar', 'Com mais dias de vendas, a linha aparece aqui.')}</article>`;

  /* ranking + mapa de calor */
  const topP = rankBy(s.V, 'produto'), topC = rankBy(s.V, 'cliente');
  const byDay = new Map(); live('vendas').forEach(v => { const o = byDay.get(v.data) || { v: 0, n: 0 }; o.v += v.valor; o.n++; byDay.set(v.data, o); });
  const ds = [...byDay.keys()].sort(), t0 = today(), startHm = ds.length ? (ds[0] < addDays(t0, -182) ? addDays(t0, -182) : ds[0]) : null;
  h += `<div class="grid2"><article class="card lift" ${ci()}><h3>Ranking</h3>${(topP.length || topC.length)
    ? (topP.length ? `<div class="rankh">Produtos</div>${hbars(topP.map(([l, v]) => ({ l, v })))}` : '') + (topC.length ? `<div class="rankh">Clientes</div>${hbars(topC.map(([l, v]) => ({ l, v })), { gray: false })}` : '')
    : empty('Nada para ranquear ainda', 'Preencha <b>produto</b> e <b>cliente</b> nas próximas vendas e o ranking aparece aqui.', '<button class="btn small rip pressable" data-act="tab" data-tab="vendas">Registrar venda</button>')}</article>
  <article class="card lift" ${ci()}><h3>Mapa de calor das vendas</h3>${startHm ? heatmap(byDay, startHm, t0) : empty('Sem vendas ainda', 'Cada quadradinho é um dia: quanto mais escuro, mais vendas.')}</article></div>`;

  /* conquistas */
  const ach = achievements();
  h += `<article class="card lift" ${ci()}><h3>Conquistas <small>${ach.filter(a => a.ok).length} de ${ach.length}</small></h3><div class="badges">${ach.map((a, i) => badge(a, i)).join('')}</div></article>`;

  if (semData.length) h += `<div class="alert" role="alert"><div><b>${semData.length} despesas importadas estão sem data.</b><div class="sub">Por isso só entram no “Total geral”. Abra a aba Despesas, toque em Editar e dê uma data a cada uma para vê-las nos gráficos por mês.</div></div></div>`;
  return h;
}

/* ---------- VENDAS ---------- */
function viewVendas() {
  const e = editing('vendas') || {};
  const rows = live('vendas').filter(v => inMonth(v.data, ui.month)).sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.u - a.u);
  const total = rows.reduce((s, r) => s + r.valor, 0), shown = rows.slice(0, ui.limit);
  const prods = [...new Set(live('vendas').map(v => v.produto).filter(Boolean))];
  return `<form class="card" data-form="vendas" ${ci()} novalidate>
    <h3>${e.id ? 'Editar venda' : 'Nova venda'}</h3>
    <div class="fgrid">
      ${fld('Data', inp('data', 'date', e.data || today(), 'required'))}
      ${fld('Valor (R$)', inp('valor', 'number', e.valor, 'step="0.01" min="0.01" inputmode="decimal" placeholder="0,00" required'))}
      <div class="fsec">Detalhes (opcionais)</div>
      ${fld('Cliente', inp('cliente', 'text', e.cliente, 'placeholder="Quem comprou?"'))}
      ${fld('Produto', inp('produto', 'text', e.produto, 'list="produtos" placeholder="ex.: Caneca branca 325ml"') + `<datalist id="produtos">${prods.map(p => `<option value="${esc(p)}">`).join('')}</datalist>`)}
      ${fld('Pagamento', `<select name="pagamento">${['', 'Pix', 'Dinheiro', 'Cartão', 'Transferência'].map(o => `<option value="${o}" ${e.pagamento === o ? 'selected' : ''}>${o || '—'}</option>`).join('')}</select>`)}
      ${fld('Observação', inp('obs', 'text', e.obs, 'placeholder="Alguma anotação?"'), 'wide')}
    </div>
    <div class="preview" aria-live="polite"><span>Digite o valor para ver o efeito no mês.</span></div>
    <div class="row"><button class="btn primary rip pressable" type="submit">${e.id ? 'Salvar alterações' : 'Adicionar venda'}</button>${e.id ? '<button type="button" class="btn rip pressable" data-act="cancel">Cancelar</button>' : ''}</div>
  </form>
  <section class="card" ${ci()}><h3>Vendas <small>${rows.length} no período</small></h3>${rows.length ? `<div class="tbl-wrap rows"><table><thead><tr><th>Data</th><th>Cliente / produto</th><th>Pagamento</th><th class="num">Valor</th><th></th></tr></thead><tbody>
  ${shown.map((r, i) => { const t = [r.cliente, r.produto].filter(Boolean).join(' · '); return `<tr style="--r:${Math.min(i, 14)}"><td>${fmtDate(r.data)}</td><td><div class="cut" title="${esc(t)}">${esc(t || '—')}</div>${r.obs ? `<div class="sub cut" title="${esc(r.obs)}">${esc(r.obs)}</div>` : ''}</td><td>${r.pagamento ? `<span class="tag">${esc(r.pagamento)}</span>` : ''}</td><td class="num">${money(r.valor)}</td>
  <td class="act"><button class="btn small rip pressable" data-act="edit" data-kind="vendas" data-id="${r.id}" aria-label="Editar venda">Editar</button><button class="btn small danger rip pressable" data-act="del" data-kind="vendas" data-id="${r.id}" aria-label="Excluir venda">Excluir</button></td></tr>`; }).join('')}
  </tbody><tfoot><tr><td colspan="3">Total do período</td><td class="num">${money(total)}</td><td></td></tr></tfoot></table></div>${rows.length > ui.limit ? `<div class="more"><button class="btn rip pressable" data-act="more">Mostrar mais (${rows.length - ui.limit})</button></div>` : ''}`
    : empty('Nenhuma venda neste período', 'Use o formulário acima para registrar a primeira. Leva só alguns segundos.')}</section>`;
}

/* ---------- DESPESAS ---------- */
function viewDespesas() {
  const e = editing('despesas') || {};
  const rows = live('despesas').filter(d => ui.month === 'all' ? true : (d.data && d.data.startsWith(ui.month))).sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.u - a.u);
  const total = rows.reduce((s, r) => s + r.valor, 0), shown = rows.slice(0, ui.limit);
  return `<form class="card" data-form="despesas" ${ci()} novalidate>
    <h3>${e.id ? 'Editar despesa' : 'Nova despesa'}</h3>
    <div class="fgrid">
      ${fld('Data', inp('data', 'date', e.data || (e.id ? '' : today())))}
      ${fld('Descrição', inp('descricao', 'text', e.descricao, 'placeholder="ex.: 50 canecas brancas" required'))}
      ${fld('Categoria', inp('categoria', 'text', e.categoria, 'list="cats" placeholder="Escolha ou digite"') + `<datalist id="cats">${CATS.map(c => `<option value="${c}">`).join('')}</datalist>`)}
      ${fld('Forma de pagamento', `<select name="forma">${['Crédito', 'Débito', 'Pix', 'Dinheiro'].map(o => `<option ${e.forma === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`)}
      <div class="fsec">Valor e parcelas</div>
      ${fld('Valor total (R$)', inp('valor', 'number', e.valor, 'step="0.01" min="0.01" inputmode="decimal" placeholder="0,00" required'))}
      ${fld('Nº de parcelas', inp('parcelas', 'number', e.parcelas || 1, 'min="1" step="1" inputmode="numeric"'))}
      ${fld('Parcelas restantes', inp('restantes', 'number', e.restantes ?? '', 'min="0" step="1" inputmode="numeric" placeholder="vazio = todas"'))}
      <label class="field chk"><input type="checkbox" name="recorrente" ${e.recorrente ? 'checked' : ''}><span>Custo mensal (todo mês)</span></label>
    </div>
    <div class="preview" aria-live="polite"><span>Digite o valor para ver quanto pesa por mês.</span></div>
    <div class="row"><button class="btn primary rip pressable" type="submit">${e.id ? 'Salvar alterações' : 'Adicionar despesa'}</button>${e.id ? '<button type="button" class="btn rip pressable" data-act="cancel">Cancelar</button>' : ''}</div>
  </form>
  <section class="card" ${ci()}><h3>Despesas <small>${rows.length} no período</small></h3>${rows.length ? `<div class="tbl-wrap rows"><table><thead><tr><th>Data</th><th>Descrição</th><th>Forma</th><th class="num">Total</th><th>Parcelas</th><th></th></tr></thead><tbody>
  ${shown.map((r, i) => `<tr style="--r:${Math.min(i, 14)}"><td>${fmtDate(r.data)}</td><td><div class="cut" title="${esc(r.descricao)}">${esc(r.descricao)}</div>${r.categoria ? `<span class="tag">${esc(r.categoria)}</span>` : ''}</td><td>${esc(r.forma)}</td><td class="num">${money(r.valor)}</td>
  <td>${r.recorrente ? '<span class="tag brand">todo mês</span>' : r.restantes > 0 ? `<span class="tag brand">${r.restantes}/${r.parcelas} × ${money(parcelaValor(r))}</span>` : (r.parcelas > 1 ? '<span class="tag">quitado</span>' : '')}</td>
  <td class="act">${r.restantes > 0 ? `<button class="btn small rip pressable" data-act="parcela" data-id="${r.id}" title="Marcar uma parcela como paga">−1 parcela</button>` : ''}<button class="btn small rip pressable" data-act="edit" data-kind="despesas" data-id="${r.id}" aria-label="Editar despesa">Editar</button><button class="btn small danger rip pressable" data-act="del" data-kind="despesas" data-id="${r.id}" aria-label="Excluir despesa">Excluir</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="3">Total do período</td><td class="num">${money(total)}</td><td colspan="2"></td></tr></tfoot></table></div>${rows.length > ui.limit ? `<div class="more"><button class="btn rip pressable" data-act="more">Mostrar mais (${rows.length - ui.limit})</button></div>` : ''}`
    : empty('Nenhuma despesa neste período', 'Registre compras de material, embalagens e custos para ver o lucro de verdade.')}</section>`;
}

/* ---------- A RECEBER ---------- */
function viewReceber() {
  const e = editing('receber') || {};
  const rows = live('receber').sort((a, b) => b.u - a.u), total = rows.reduce((s, r) => s + r.valor, 0);
  return `<form class="card" data-form="receber" ${ci()} novalidate>
    <h3>${e.id ? 'Editar valor a receber' : 'Novo valor a receber'}</h3>
    <div class="fgrid">${fld('Quem vai pagar', inp('nome', 'text', e.nome, 'placeholder="Nome do cliente" required'))}${fld('Valor (R$)', inp('valor', 'number', e.valor, 'step="0.01" min="0.01" inputmode="decimal" placeholder="0,00" required'))}${fld('Observação', inp('obs', 'text', e.obs, 'placeholder="opcional"'), 'wide')}</div>
    <div class="row"><button class="btn primary rip pressable" type="submit">${e.id ? 'Salvar' : 'Adicionar'}</button>${e.id ? '<button type="button" class="btn rip pressable" data-act="cancel">Cancelar</button>' : ''}</div>
  </form>
  <section class="card" ${ci()}><h3>Pendentes <small>${rows.length}</small></h3>${rows.length ? `<div class="tbl-wrap rows"><table><thead><tr><th>Nome</th><th class="num">Valor</th><th></th></tr></thead><tbody>
  ${rows.map((r, i) => `<tr style="--r:${Math.min(i, 14)}"><td><div class="cut" title="${esc(r.nome)}">${esc(r.nome)}</div>${r.obs ? `<div class="sub cut">${esc(r.obs)}</div>` : ''}</td><td class="num">${money(r.valor)}</td>
  <td class="act"><button class="btn small primary rip pressable" data-act="receive" data-id="${r.id}" title="Vira uma venda de hoje">Recebido ✓</button><button class="btn small rip pressable" data-act="edit" data-kind="receber" data-id="${r.id}">Editar</button><button class="btn small danger rip pressable" data-act="del" data-kind="receber" data-id="${r.id}">Excluir</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td>Total pendente</td><td class="num">${money(total)}</td><td></td></tr></tfoot></table></div>` : empty('Ninguém devendo', 'Quando alguém ficar de pagar depois, anote aqui. Ao receber, um toque vira venda.')}</section>`;
}

/* ---------- AJUSTES ---------- */
function viewAjustes() {
  const seg = (k, opts, cur) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" class="rip pressable" data-act="pref" data-k="${k}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  const dens = root.dataset.density === 'compact' ? 'compact' : 'comfy', fs = root.dataset.fs || 'md';
  return `<form class="card" data-form="meta" ${ci()} novalidate><h3>Meta mensal</h3><div class="fgrid">${fld('Meta de vendas por mês (R$)', inp('meta', 'number', db.config.meta || '', 'min="0" step="1" inputmode="numeric" placeholder="ex.: 1500"'))}</div><div class="row"><button class="btn primary rip pressable" type="submit">Salvar meta</button></div></form>
  <form class="card" data-form="sync" ${ci()} novalidate><h3>Sincronizar com a minha esposa</h3>
    <p class="note" style="margin:0 0 14px">Os dados ficam num arquivo de um repositório <b>privado</b> do GitHub. O token é guardado só neste aparelho.</p>
    <div class="fgrid">
      ${fld('Usuário ou organização', inp('owner', 'text', sync.owner, 'autocomplete="off" placeholder="seu-usuario"'))}
      ${fld('Repositório de dados', inp('repo', 'text', sync.repo, 'autocomplete="off" placeholder="cozy-mug-dados"'))}
      ${fld('Branch', inp('branch', 'text', sync.branch))}
      ${fld('Arquivo', inp('path', 'text', sync.path))}
      ${fld('Token (fine-grained, só neste repositório)', inp('token', 'password', sync.token, 'autocomplete="off"'), 'wide')}
    </div>
    <div class="row"><button class="btn primary rip pressable" type="submit">${sync.enabled ? 'Atualizar e sincronizar' : 'Ativar sincronização'}</button>
    ${sync.enabled ? '<button type="button" class="btn rip pressable" data-act="syncnow">Sincronizar agora</button><button type="button" class="btn rip pressable" data-act="sharelink">Gerar link para minha esposa</button><button type="button" class="btn danger rip pressable" data-act="syncoff">Desligar</button>' : ''}</div>
    ${statusMsg ? `<div class="alert err" role="alert" style="margin:14px 0 0"><div><b>Não consegui sincronizar.</b><div class="sub">${esc(statusMsg)}</div></div></div>` : ''}
  </form>
  ${ui.shareUrl ? `<div class="card"><h3>Link de acesso (sem conta no GitHub)</h3><p class="note" style="margin:0 0 12px">Mande este link só para ela (WhatsApp, por exemplo). Ao abrir, a sincronização liga sozinha. <b>O link contém o token</b>: não poste em grupo nem em lugar público. Se perder o aparelho, apague o token no GitHub e gere outro.</p><input class="sharebox" type="text" readonly value="${esc(ui.shareUrl)}" onfocus="this.select()" aria-label="Link de acesso"></div>` : ''}
  <section class="card" ${ci()}><h3>Aparência</h3><div class="fgrid">
    <div class="field"><span>Tema</span>${seg('theme', [['light', 'Claro'], ['dark', 'Escuro']], currentTheme())}</div>
    <div class="field"><span>Densidade</span>${seg('density', [['comfy', 'Confortável'], ['compact', 'Compacta']], dens)}</div>
    <div class="field"><span>Tamanho do texto</span>${seg('fs', [['sm', 'Pequeno'], ['md', 'Médio'], ['lg', 'Grande']], fs)}</div></div></section>
  <section class="card" ${ci()}><h3>Backup e importação</h3><div class="row" style="margin-top:0">
    <button class="btn rip pressable" data-act="exportjson">Baixar backup (.json)</button><button class="btn rip pressable" data-act="exportcsv">Baixar vendas e despesas (.csv)</button><button class="btn rip pressable" data-act="print">Salvar como PDF</button>
    <label class="btn rip pressable" tabindex="0">Importar .json<input type="file" id="imp" accept="application/json,.json" hidden></label></div>
    <p class="note">Importar <b>mescla</b> com o que já existe: não duplica registros iguais e nunca sobrescreve edições mais novas.</p>
    <div class="row"><button class="btn small rip pressable" data-act="help">Ver atalhos do teclado (?)</button></div></section>`;
}
const VIEWS = { painel: viewPainel, vendas: viewVendas, despesas: viewDespesas, receber: viewReceber, ajustes: viewAjustes };
const editing = kind => ui.edit && ui.edit.kind === kind ? db[kind].find(x => x.id === ui.edit.id) : null;

/* ---------- moldura: abas, hero, filtros ---------- */
function placePill(first) {
  const nav = $('#tabs'), b = nav.querySelector('[aria-selected="true"]'), p = nav.querySelector('.pill'); if (!b || !p) return;
  if (first) p.classList.add('no-anim');
  p.style.width = b.offsetWidth + 'px'; p.style.transform = `translateX(${b.offsetLeft}px)`;
  if (first) requestAnimationFrame(() => requestAnimationFrame(() => p.classList.remove('no-anim')));
  else b.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
}
function renderTabs() {
  const nav = $('#tabs'), first = !nav.dataset.ready;
  if (first) { nav.innerHTML = '<i class="pill" aria-hidden="true"></i>' + TABS.map(([k, l]) => `<button role="tab" class="rip pressable" data-act="tab" data-tab="${k}">${l}</button>`).join(''); nav.dataset.ready = 1; }
  nav.querySelectorAll('button').forEach(b => { const on = b.dataset.tab === ui.tab; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  placePill(first);
}
function renderHero() {
  const hr = new Date().getHours(), g = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
  const per = ui.month === 'all' ? 'desde o começo' : `em ${MES[+ui.month.slice(5) - 1]} de ${ui.month.slice(0, 4)}`;
  const T = { painel: [`${g}!`, `Aqui está o resumo da Cozy Mug ${per}.`], vendas: ['Vendas', 'Registre cada venda em poucos segundos.'], despesas: ['Despesas', 'Compras, parcelas do cartão e custos fixos.'], receber: ['A receber', 'Quem ainda vai pagar, num só lugar.'], ajustes: ['Ajustes', 'Meta, sincronização, aparência e backup.'] }[ui.tab];
  const h = $('#heroTitle'), p = $('#heroSub');
  if (h.textContent !== T[0] || p.textContent !== T[1]) {
    const tabChanged = h.textContent !== T[0];
    h.textContent = T[0]; p.textContent = T[1];
    if (tabChanged) { [h, p].forEach(el => { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }); }
  }
}
function renderFilters() {
  const f = $('#filters'), show = ['painel', 'vendas', 'despesas'].includes(ui.tab);
  f.hidden = !show; if (!show) return;
  const sig = ui.tab + '|' + ui.month + '|' + months().join(',');
  if (f.dataset.sig === sig) return;
  f.dataset.sig = sig;
  const cur = curMonth(), prev = prevMonthOf(cur), ms = [...new Set([...months(), cur, prev])].sort().reverse();
  f.innerHTML = `<div class="seg" role="group" aria-label="Período">${[['all', 'Tudo'], [cur, 'Mês atual'], [prev, 'Mês anterior']].map(([k, l]) => `<button type="button" class="rip pressable" data-act="filter" data-m="${k}" aria-pressed="${ui.month === k}">${l}</button>`).join('')}</div>
  <label class="sel">Mês<select id="fmonth" aria-label="Escolher outro mês"><option value="all">Todos os meses</option>${ms.map(k => `<option value="${k}" ${ui.month === k ? 'selected' : ''}>${mName(k)}</option>`).join('')}</select></label>`;
}

/* ---------- render ---------- */
function render(opts = {}) {
  const valid = new Set(['all', curMonth(), prevMonthOf(curMonth()), ...months()]);
  if (!valid.has(ui.month)) ui.month = 'all';
  cardI = 0;
  renderTabs(); renderHero(); renderFilters();
  const v = $('#view');
  v.classList.toggle('enter', !!opts.enter);
  v.innerHTML = VIEWS[ui.tab]();
  afterRender();
  paintBadge(); paintTheme();
}
function markFilled(el) {
  const i = el.querySelector('input:not([type=checkbox]),select');
  if (i) el.classList.toggle('filled', i.value !== '');
}
function afterRender() {
  const v = $('#view');
  runCounters(v);
  v.querySelectorAll('.lc').forEach(bindLine);
  v.querySelectorAll('.field').forEach(markFilled);
  v.querySelectorAll('form[data-form="vendas"],form[data-form="despesas"]').forEach(updatePreview);
  if (ui.flash) {
    const b = v.querySelector(`form[data-form="${ui.flash}"] [type=submit]`);
    saveFx(b); toast('Pronto! Salvo.'); ui.flash = null;
  }
  if (ui.ach) {
    const nw = achievements().filter(a => a.ok && !ui.ach.includes(a.id));
    if (nw.length) { confetti(v.querySelector('[type=submit]') || $('#heroTitle')); setTimeout(() => toast(`Conquista desbloqueada: ${nw[0].name}!`), 600); }
    ui.ach = null;
  }
}

/* ---------- gráfico de linha: marcador que segue o mouse ---------- */
function bindLine(el) {
  const m = JSON.parse(el.dataset.meta), svg = el.querySelector('svg'), dot = el.querySelector('.lc-dot'), gd = el.querySelector('.lc-guide'), tip = el.querySelector('.lc-tip');
  const n = m.pts.length, X = i => m.pl + (n === 1 ? 0 : i * (m.W - m.pl - m.pr) / (n - 1)), Y = v => m.base - (v / m.mx) * (m.base - m.top);
  const at = e => {
    const r = svg.getBoundingClientRect(), k = r.width / m.W, x = (e.clientX - r.left) / k;
    const i = Math.max(0, Math.min(n - 1, Math.round((x - m.pl) / ((m.W - m.pl - m.pr) / Math.max(1, n - 1)))));
    const [l, v] = m.pts[i], px = X(i), py = Y(v);
    dot.setAttribute('cx', px); dot.setAttribute('cy', py); gd.setAttribute('x1', px); gd.setAttribute('x2', px);
    tip.hidden = false; tip.innerHTML = `<b>${money(v)}</b><span>${esc(m.unit || 'Dia')} ${esc(l)}</span>`;
    tip.style.left = Math.max(48, Math.min(r.width - 48, px * k)) + 'px'; tip.style.top = py * k + 'px';
    el.classList.add('on');
  };
  svg.addEventListener('pointermove', at); svg.addEventListener('pointerdown', at);
  svg.addEventListener('pointerleave', () => { el.classList.remove('on'); tip.hidden = true; });
}

/* ---------- pré-visualização ao vivo nos formulários ---------- */
function updatePreview(form) {
  const pv = form.querySelector('.preview'); if (!pv) return;
  const f = Object.fromEntries(new FormData(form)), val = Number(f.valor) || 0; let txt;
  if (form.dataset.form === 'vendas') {
    if (val > 0 && f.data) {
      const k = f.data.slice(0, 7), cur = editing('vendas'), base = stats(k);
      const sameMonth = cur && cur.data && cur.data.startsWith(k);
      const novoTot = base.total - (sameMonth ? cur.valor : 0) + val, novoN = base.count - (sameMonth ? 1 : 0) + 1;
      txt = `Esta venda leva ${MES[+k.slice(5) - 1]} para <b>${money(novoTot)}</b> em ${novoN} venda${novoN > 1 ? 's' : ''}.`;
    } else txt = 'Digite o valor para ver o efeito no mês.';
  } else if (val > 0) {
    const par = Math.max(1, parseInt(f.parcelas, 10) || 1), rest = f.restantes === '' ? (par > 1 ? par : 0) : Math.min(par, Math.max(0, parseInt(f.restantes, 10) || 0));
    if (f.recorrente) txt = `Custo fixo de <b>${money(val)}</b> todo mês.`;
    else if (par > 1) txt = `Parcela de <b>${money(val / par)}</b> por mês${rest ? ` · faltam ${rest} (${money(val / par * rest)})` : ' · já quitado'}.`;
    else txt = `Pagamento único de <b>${money(val)}</b>.`;
  } else txt = 'Digite o valor para ver quanto pesa por mês.';
  if (pv.dataset.t !== txt) { pv.dataset.t = txt; pv.innerHTML = `<span>${txt}</span>`; pv.classList.remove('swap'); void pv.offsetWidth; pv.classList.add('swap'); }
}

/* ---------- navegação ---------- */
function navigate(tab) {
  if (ui.tab === tab) return;
  const go = () => { ui.tab = tab; ui.edit = null; ui.shareUrl = null; ui.limit = 15; render({ enter: true }); window.scrollTo(0, 0); };
  if (document.startViewTransition && !reduced()) {
    root.classList.add('vt-tab');
    const t = document.startViewTransition(go); t.finished.finally(() => root.classList.remove('vt-tab'));
  } else go();
}
function setFilter(m) {
  if (ui.month === m) return;
  ui.month = m; ui.limit = 15; ui.edit = null;
  if (reduced()) { render({ enter: true }); return; }
  $('#view').classList.remove('enter'); $('#view').innerHTML = skeleton();
  renderHero(); $('#filters').dataset.sig = ''; renderFilters();
  clearTimeout(setFilter.t); setFilter.t = setTimeout(() => render({ enter: true }), 260);
}
function openHelp() {
  openOverlay(`<h2>Atalhos do teclado</h2><div class="shr">
    <span><span class="kbd">g</span> depois <span class="kbd">p</span></span><span>Painel</span>
    <span><span class="kbd">g</span> depois <span class="kbd">v</span></span><span>Vendas</span>
    <span><span class="kbd">g</span> depois <span class="kbd">d</span></span><span>Despesas</span>
    <span><span class="kbd">g</span> depois <span class="kbd">r</span></span><span>A receber</span>
    <span><span class="kbd">g</span> depois <span class="kbd">a</span></span><span>Ajustes</span>
    <span><span class="kbd">n</span></span><span>Novo registro (vai para o formulário)</span>
    <span><span class="kbd">t</span></span><span>Trocar tema claro/escuro</span>
    <span><span class="kbd">?</span></span><span>Abrir esta ajuda</span>
    <span><span class="kbd">Esc</span></span><span>Fechar janelas</span></div>
    <div class="row"><button class="btn primary rip pressable" data-close>Entendi</button></div>`);
}

/* ---------- exportação ---------- */
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvNum = v => String(v ?? '').replace('.', ','), csvCell = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function exportCsv() {
  const L = [['Tipo', 'Data', 'Descrição/Cliente', 'Categoria/Produto', 'Forma/Pagamento', 'Valor', 'Parcelas', 'Restantes']];
  live('vendas').forEach(v => L.push(['Venda', v.data, v.cliente, v.produto, v.pagamento, csvNum(v.valor), '', '']));
  live('despesas').forEach(d => L.push(['Despesa', d.data || '', d.descricao, d.categoria, d.forma, csvNum(d.valor), d.parcelas, d.restantes]));
  download(`cozy-mug-${today()}.csv`, '﻿' + L.map(r => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const { act, kind, id, tab } = b.dataset;
  if (act === 'tab') navigate(tab);
  else if (act === 'filter') setFilter(b.dataset.m);
  else if (act === 'edit') { ui.edit = { kind, id }; render(); window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); }
  else if (act === 'cancel') { ui.edit = null; render(); }
  else if (act === 'more') { ui.limit += 15; render(); }
  else if (act === 'del') { if (confirm('Excluir este registro?')) { remove(kind, id); toast('Excluído'); } }
  else if (act === 'parcela') {
    const d = db.despesas.find(x => x.id === id);
    if (d && d.restantes > 0) { upsert('despesas', { ...d, restantes: d.restantes - 1 }); toast('Parcela marcada como paga'); }
  } else if (act === 'receive') {
    const r = db.receber.find(x => x.id === id); if (!r) return;
    ui.ach = achievedIds();
    upsert('vendas', { id: uid('v'), data: today(), valor: r.valor, cliente: r.nome, produto: '', pagamento: '', obs: r.obs || 'recebido de "a receber"' });
    remove('receber', id); toast('Pronto! Virou venda de hoje.');
  } else if (act === 'sharelink') {
    const j = { o: sync.owner, r: sync.repo, b: sync.branch, p: sync.path, t: sync.token };
    const enc = b64enc(JSON.stringify(j)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    ui.shareUrl = location.origin + location.pathname + '#cfg=' + enc; render();
    try { navigator.clipboard.writeText(ui.shareUrl).then(() => toast('Link copiado!'), () => toast('Copie o link abaixo')); } catch { toast('Copie o link abaixo'); }
  } else if (act === 'syncnow') { syncNow(); toast('Sincronizando…'); }
  else if (act === 'syncoff') { sync.enabled = false; ls.set(LS_SYNC, JSON.stringify(sync)); setStatus('off'); render(); toast('Sincronização desligada'); }
  else if (act === 'exportjson') download(`cozy-mug-backup-${today()}.json`, JSON.stringify(db, null, 1), 'application/json');
  else if (act === 'exportcsv') exportCsv();
  else if (act === 'print') window.print();
  else if (act === 'theme') toggleTheme();
  else if (act === 'help') openHelp();
  else if (act === 'pref') {
    const { k, v } = b.dataset;
    if (k === 'theme') { if (currentTheme() !== v) toggleTheme(); return; }
    if (k === 'density') { if (v === 'compact') root.dataset.density = 'compact'; else delete root.dataset.density; ls.set('cozymug.density', v); }
    if (k === 'fs') { if (v === 'md') delete root.dataset.fs; else root.dataset.fs = v; ls.set('cozymug.fs', v); }
    render(); requestAnimationFrame(placePill);
  }
});

$('#logo').addEventListener('click', e => { const l = e.currentTarget; l.classList.remove('hop'); void l.offsetWidth; l.classList.add('hop'); navigate('painel'); });
document.addEventListener('change', async e => {
  if (e.target.id === 'fmonth') { setFilter(e.target.value); return; }
  if (e.target.id === 'imp' && e.target.files[0]) {
    try {
      const inc = normalize(JSON.parse(await e.target.files[0].text()));
      const n = { vendas: inc.vendas.length, despesas: inc.despesas.length, receber: inc.receber.length };
      if (!(n.vendas + n.despesas + n.receber)) { toast('Esse arquivo não tem registros'); return; }
      const novos = ['vendas', 'despesas', 'receber'].reduce((s, k) => s + inc[k].filter(r => !db[k].some(x => x.id === r.id)).length, 0);
      topProgress(); db = mergeDb(db, inc); commit();
      const v = $('#view'); v.classList.remove('blurin'); void v.offsetWidth; v.classList.add('blurin'); setTimeout(() => v.classList.remove('blurin'), 900);
      openOverlay(`<h2>Pronto! Dados importados.</h2><div class="shr"><b>${n.vendas}</b><span>vendas no arquivo</span><b>${n.despesas}</b><span>despesas no arquivo</span><b>${n.receber}</b><span>valores a receber</span></div>
        <p class="note">${novos ? `<b>${novos}</b> registros novos entraram.` : 'Tudo isso já estava aqui, então nada foi duplicado.'}</p><div class="row"><button class="btn primary rip pressable" data-close>Fechar</button></div>`);
    } catch { toast('Não consegui ler esse arquivo'); }
    e.target.value = '';
    return;
  }
  const fld2 = e.target.closest('.field'); if (fld2) markFilled(fld2);
  const form = e.target.closest('form[data-form]'); if (form) updatePreview(form);
});
document.addEventListener('input', e => {
  const fl = e.target.closest('.field'); if (fl) markFilled(fl);
  if (e.target.type === 'number' && !reduced()) { e.target.classList.remove('pop'); void e.target.offsetWidth; e.target.classList.add('pop'); }
  const form = e.target.closest('form[data-form]'); if (form) updatePreview(form);
});

document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const k = f.dataset.form, v = Object.fromEntries(new FormData(f)), cur = editing(k);
  const base = cur ? { ...cur } : { id: uid(k[0]) }, num = x => Math.round(Number(x) * 100) / 100;
  const bad = (name, msg) => { const i = f.querySelector(`[name="${name}"]`); toast(msg); if (i) { i.focus(); i.closest('.field')?.classList.remove('filled'); } };
  if (k === 'vendas') {
    if (!(Number(v.valor) > 0)) return bad('valor', 'Informe um valor maior que zero.');
    if (!v.data) return bad('data', 'Escolha a data da venda.');
    ui.edit = null; ui.flash = 'vendas'; ui.ach = achievedIds();
    upsert('vendas', { ...base, data: v.data, valor: num(v.valor), cliente: v.cliente.trim(), produto: v.produto.trim(), pagamento: v.pagamento, obs: v.obs.trim() });
  } else if (k === 'despesas') {
    if (!v.descricao.trim()) return bad('descricao', 'Dê um nome para a despesa.');
    if (!(Number(v.valor) > 0)) return bad('valor', 'Informe um valor maior que zero.');
    const parcelas = Math.max(1, parseInt(v.parcelas, 10) || 1);
    const restantes = v.restantes === '' ? (parcelas > 1 ? parcelas : 0) : Math.min(parcelas, Math.max(0, parseInt(v.restantes, 10) || 0));
    ui.edit = null; ui.flash = 'despesas'; ui.ach = achievedIds();
    upsert('despesas', { ...base, data: v.data || null, descricao: v.descricao.trim(), categoria: v.categoria.trim(), forma: v.forma, valor: num(v.valor), parcelas, restantes: parcelas > 1 ? restantes : 0, recorrente: !!v.recorrente });
  } else if (k === 'receber') {
    if (!v.nome.trim()) return bad('nome', 'Quem vai pagar?');
    if (!(Number(v.valor) > 0)) return bad('valor', 'Informe um valor maior que zero.');
    ui.edit = null; ui.flash = 'receber';
    upsert('receber', { ...base, nome: v.nome.trim(), valor: num(v.valor), obs: v.obs.trim() });
  } else if (k === 'meta') {
    ui.flash = 'meta'; db.config = { meta: Math.max(0, Number(v.meta) || 0), u: Date.now() }; commit();
  } else if (k === 'sync') {
    sync = { ...sync, owner: v.owner.trim(), repo: v.repo.trim(), branch: v.branch.trim() || 'main', path: v.path.trim() || 'data.json', token: v.token.trim(), enabled: true };
    if (!sync.owner || !sync.repo || !sync.token) { sync.enabled = false; toast('Preencha usuário, repositório e token.'); return; }
    ls.set(LS_SYNC, JSON.stringify(sync)); topProgress();
    syncNow().then(() => { render(); toast(status === 'idle' ? 'Pronto! Sincronizado.' : 'Veja o aviso abaixo.'); });
  }
});

/* ---------- teclado ---------- */
let gPending = false, gTimer;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeOverlay(); return; }
  if (e.target.closest && e.target.closest('#tabs') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const i = TABS.findIndex(t => t[0] === ui.tab), j = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    navigate(TABS[j][0]); setTimeout(() => $(`#tabs [data-tab="${TABS[j][0]}"]`)?.focus(), 30); e.preventDefault(); return;
  }
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName || '') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (gPending) {
    gPending = false; const t = { p: 'painel', v: 'vendas', d: 'despesas', r: 'receber', a: 'ajustes' }[e.key];
    if (t) { navigate(t); return; }
  }
  if (e.key === '?') openHelp();
  else if (e.key === 't') toggleTheme();
  else if (e.key === 'g') { gPending = true; clearTimeout(gTimer); gTimer = setTimeout(() => gPending = false, 1000); }
  else if (e.key === 'n') {
    e.preventDefault();
    const go = () => $('#view form[data-form]')?.querySelector('input:not([type=checkbox]),select')?.focus();
    if (ui.tab === 'painel' || ui.tab === 'ajustes') { navigate('vendas'); setTimeout(go, 350); } else go();
  }
});

/* ---------- moldura reativa ---------- */
window.addEventListener('scroll', () => $('#topbar').classList.toggle('scrolled', scrollY > 4), { passive: true });
let lastVW = 0, rzT;
window.addEventListener('resize', () => {
  placePill(); clearTimeout(rzT);
  rzT = setTimeout(() => { const w = $('#view').clientWidth; if (ui.tab === 'painel' && lastVW && Math.abs(w - lastVW) > 40) render(); lastVW = w; }, 300);
});
requestAnimationFrame(() => { lastVW = $('#view').clientWidth; });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placePill());

/* ---------- link de acesso: #cfg=... (o que vem depois do # nunca vai para servidores) ---------- */
(function applyShared() {
  try {
    const m = location.hash.match(/^#cfg=([A-Za-z0-9_-]+)$/); if (!m) return;
    const j = JSON.parse(b64dec(m[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (![j.o, j.r, j.t].every(x => typeof x === 'string' && x)) return;
    sync = { ...sync, owner: j.o, repo: j.r, branch: j.b || 'main', path: j.p || 'data.json', token: j.t, enabled: true };
    ls.set(LS_SYNC, JSON.stringify(sync)); status = 'idle';
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => toast('Pronto! Sincronização ativada neste aparelho.'), 400);
  } catch { /* link inválido: ignora */ }
})();

render({ enter: true });
if (sync.enabled) syncNow();
