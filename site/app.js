/* Cozy Mug · Painel — vanilla JS, sem dependências.
   Dados: localStorage (rápido, por aparelho) + sincronização opcional com um arquivo JSON
   num repositório PRIVADO do GitHub (compartilhado entre você e sua esposa). */
'use strict';

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const short = v => v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : String(Math.round(v));
const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = d => d ? d.split('-').reverse().join('/') : '—';
const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mShort = k => k === 'sem' ? 'sem data' : `${MES[+k.slice(5) - 1].slice(0, 3)}/${k.slice(2, 4)}`;
const mLong = k => k === 'all' ? 'Total geral' : `${MES[+k.slice(5) - 1]} de ${k.slice(0, 4)}`;
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* modo privado: segue só em memória */ } },
};
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400); };

/* ---------- dados ---------- */
const LS_DATA = 'cozymug.data.v1', LS_SYNC = 'cozymug.sync.v1';
const emptyDb = () => ({ version: 1, config: { meta: 0, u: 0 }, vendas: [], despesas: [], receber: [] });
const KINDS = ['vendas', 'despesas', 'receber'];

function normalize(x) {
  const db = emptyDb();
  if (!x || typeof x !== 'object') return db;
  for (const k of KINDS) db[k] = Array.isArray(x[k]) ? x[k].filter(r => r && r.id) : [];
  db.config = { meta: Number(x.config?.meta) || 0, u: Number(x.config?.u) || 0 };
  return db;
}
function loadLocal() { try { return normalize(JSON.parse(ls.get(LS_DATA))); } catch { return emptyDb(); } }
function saveLocal() { ls.set(LS_DATA, JSON.stringify(db)); }

function mergeDb(a, b) {
  const out = emptyDb();
  for (const k of KINDS) {
    const m = new Map();
    for (const r of [...a[k], ...b[k]]) {
      const o = m.get(r.id);
      if (!o || (r.u || 0) > (o.u || 0)) m.set(r.id, r);
    }
    out[k] = [...m.values()];
  }
  out.config = (b.config.u || 0) > (a.config.u || 0) ? b.config : a.config;
  return out;
}
const canon = d => JSON.stringify([KINDS.map(k => [...d[k]].sort((x, y) => x.id < y.id ? -1 : 1)), d.config]);

let db = loadLocal();
let rev = 0;
const live = k => db[k].filter(r => !r.deleted);

function upsert(kind, rec) {
  rec.u = Date.now();
  const i = db[kind].findIndex(x => x.id === rec.id);
  if (i >= 0) db[kind][i] = rec; else db[kind].push(rec);
  commit();
}
function remove(kind, id) {
  const r = db[kind].find(x => x.id === id);
  if (r) { r.deleted = true; r.u = Date.now(); commit(); }
}
function commit() { rev++; saveLocal(); render(); schedulePush(); }

/* ---------- sincronização com GitHub ---------- */
let sync = (() => { try { return JSON.parse(ls.get(LS_SYNC)) || {}; } catch { return {}; } })();
sync = { owner: '', repo: '', branch: 'main', path: 'data.json', token: '', enabled: false, ...sync };
let status = sync.enabled ? 'idle' : 'off', statusMsg = '';
let pushTimer = null, syncing = false;

const b64enc = s => { let bin = ''; new TextEncoder().encode(s).forEach(x => bin += String.fromCharCode(x)); return btoa(bin); };
const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));
const ghUrl = () => `https://api.github.com/repos/${encodeURIComponent(sync.owner)}/${encodeURIComponent(sync.repo)}/contents/${sync.path.split('/').map(encodeURIComponent).join('/')}`;
const ghHeaders = () => ({ Authorization: `Bearer ${sync.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });

async function ghGet() {
  const res = await fetch(`${ghUrl()}?ref=${encodeURIComponent(sync.branch)}`, { headers: ghHeaders(), cache: 'no-store' });
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) throw new Error('Token sem permissão (confira o token e o repositório)');
  if (!res.ok) throw new Error('GitHub respondeu ' + res.status);
  const j = await res.json();
  return { sha: j.sha, db: normalize(JSON.parse(b64dec(j.content))) };
}
async function ghPut(data, sha) {
  const body = { message: 'Atualiza dados do painel', content: b64enc(JSON.stringify(data, null, 1)), branch: sync.branch };
  if (sha) body.sha = sha;
  return fetch(ghUrl(), { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
function setStatus(s, msg = '') { status = s; statusMsg = msg; paintBadge(); }
function schedulePush() {
  if (!sync.enabled) return;
  setStatus('saving');
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 700);
}
async function syncNow() {
  if (!sync.enabled) return;
  if (syncing) { schedulePush(); return; }
  syncing = true; setStatus('saving');
  const startRev = rev;
  let changedLocal = false;
  try {
    for (let t = 0; t < 4; t++) {
      const remote = await ghGet();
      const merged = remote ? mergeDb(remote.db, db) : db;
      if (canon(merged) !== canon(db)) changedLocal = true;
      db = merged; saveLocal();
      if (remote && canon(merged) === canon(remote.db)) break;      // já está igual no GitHub
      const res = await ghPut(merged, remote?.sha);
      if (res.ok) break;
      if (res.status === 409 || res.status === 422) continue;       // alguém salvou ao mesmo tempo: tenta de novo
      if (res.status === 401 || res.status === 403 || res.status === 404) throw new Error('Sem permissão para gravar (token precisa de "Contents: Read and write")');
      throw new Error('GitHub respondeu ' + res.status);
    }
    setStatus('idle');
    if (changedLocal) { const a = document.activeElement; if (!a || !$('#view').contains(a) || !/INPUT|SELECT|TEXTAREA/.test(a.tagName)) render(); }
  } catch (e) {
    setStatus('error', e.message || 'Falha ao sincronizar');
  } finally {
    syncing = false;
    if (rev !== startRev) schedulePush();
  }
}
setInterval(() => { if (sync.enabled && !document.hidden) syncNow(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && sync.enabled) syncNow(); });

function paintBadge() {
  const b = $('#syncBadge');
  const map = { off: ['Só neste aparelho', ''], idle: ['● Sincronizado', 'ok'], saving: ['Salvando…', ''], error: ['⚠ Erro ao sincronizar', 'err'] };
  const [txt, cls] = map[status];
  b.textContent = txt; b.className = 'badge ' + cls; b.title = statusMsg || 'Abrir ajustes';
}

/* ---------- cálculos ---------- */
const inMonth = (d, m) => m === 'all' || (d && d.startsWith(m));
const parcelaValor = d => d.parcelas > 1 ? d.valor / d.parcelas : d.valor;
function stats(m) {
  const V = live('vendas').filter(v => inMonth(v.data, m));
  const D = live('despesas').filter(d => inMonth(d.data, m));
  const total = V.reduce((s, v) => s + v.valor, 0);
  const desp = D.reduce((s, d) => s + d.valor, 0);
  const R = live('receber');
  const ativas = live('despesas').filter(d => d.restantes > 0);
  return {
    V, D, total, desp, lucro: total - desp, count: V.length, ticket: V.length ? total / V.length : 0,
    receber: R.reduce((s, r) => s + r.valor, 0), nReceber: R.length,
    parcelasMes: ativas.reduce((s, d) => s + parcelaValor(d), 0) + live('despesas').filter(d => d.recorrente).reduce((s, d) => s + d.valor, 0),
    dividaRest: ativas.reduce((s, d) => s + parcelaValor(d) * d.restantes, 0),
  };
}
const months = () => {
  const s = new Set();
  live('vendas').forEach(v => v.data && s.add(v.data.slice(0, 7)));
  live('despesas').forEach(d => d.data && s.add(d.data.slice(0, 7)));
  return [...s].sort();
};
const rankBy = (arr, key) => {
  const m = new Map();
  arr.forEach(r => { const k = (r[key] || '').trim(); if (k) m.set(k, (m.get(k) || 0) + r.valor); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
};

/* ---------- interface ---------- */
const ui = { tab: 'painel', month: 'all', edit: null };
const TABS = [['painel', 'Painel'], ['vendas', 'Vendas'], ['despesas', 'Despesas'], ['receber', 'A receber'], ['ajustes', 'Ajustes']];
const kpi = (l, v, s, c = '') => `<div class="kpi ${c}"><div class="kpi-l">${l}</div><div class="kpi-v">${v}</div>${s ? `<div class="kpi-s">${s}</div>` : ''}</div>`;
const editing = kind => ui.edit && ui.edit.kind === kind ? db[kind].find(x => x.id === ui.edit.id) : null;

function viewPainel() {
  const s = stats(ui.month), all = stats('all'), meta = db.config.meta || 0;
  const semData = live('despesas').filter(d => !d.data).length;
  let h = `<h2>${mLong(ui.month)}</h2><div class="kpis">` +
    kpi('Vendas', brl(s.total), `${s.count} venda(s) · ticket médio ${brl(s.ticket)}`, 'good') +
    kpi('Despesas', brl(s.desp), ui.month === 'all' ? 'todas as compras e custos' : 'só as que têm data neste mês', 'bad') +
    kpi('Lucro', brl(s.lucro), s.total ? `margem ${(s.lucro / s.total * 100).toFixed(0)}%` : '', s.lucro >= 0 ? 'good' : 'bad') +
    kpi('A receber', brl(s.receber), `${s.nReceber} pendente(s)`) +
    kpi('Parcelas do mês', brl(s.parcelasMes), `ainda faltam ${brl(s.dividaRest)} no cartão`) + '</div>';

  if (ui.month !== 'all' && meta > 0) {
    const p = Math.min(100, s.total / meta * 100);
    h += `<div class="card"><h3>Meta do mês: ${brl(meta)}</h3><div class="bar"><i style="width:${p}%"></i></div>
      <div class="muted">${p.toFixed(0)}% — ${s.total >= meta ? 'meta batida! 🎉' : `faltam ${brl(meta - s.total)}`}</div></div>`;
  } else if (!meta) {
    h += `<div class="card muted">Dica: defina uma <b>meta mensal de vendas</b> em Ajustes para acompanhar o progresso aqui.</div>`;
  }

  // retorno do investimento (sempre geral)
  const pay = all.desp ? Math.min(100, all.total / all.desp * 100) : 0;
  h += `<div class="card"><h3>Retorno do investimento</h3><div class="bar ${all.lucro < 0 ? 'warn' : ''}"><i style="width:${pay}%"></i></div>
    <div class="muted">${all.lucro >= 0 ? `Tudo que gastou já voltou (+${brl(all.lucro)}).` : `Vendeu ${brl(all.total)} de ${brl(all.desp)} gastos — faltam ${brl(-all.lucro)} em vendas para empatar.`}</div></div>`;

  // gráfico por mês
  const ms = months(); const groups = [];
  if (semData) groups.push({ k: 'sem', v: 0, d: live('despesas').filter(d => !d.data).reduce((a, d) => a + d.valor, 0) });
  ms.forEach(k => groups.push({ k, v: stats(k).total, d: stats(k).desp }));
  const mx = Math.max(1, ...groups.flatMap(g => [g.v, g.d]));
  h += `<div class="card"><h3>Vendas × despesas por mês</h3><div class="chart">` + (groups.length ? groups.map(g => `
    <div class="grp"><div class="bars">
      ${g.k === 'sem' ? '' : `<div class="b v" style="height:${g.v / mx * 100}%" title="Vendas ${brl(g.v)}"><span>${short(g.v)}</span></div>`}
      <div class="b d" style="height:${g.d / mx * 100}%" title="Despesas ${brl(g.d)}"><span>${short(g.d)}</span></div>
    </div><label>${mShort(g.k)}</label></div>`).join('') : '<div class="empty">Sem dados ainda.</div>') +
    `</div><div class="legend"><span><i style="background:var(--good)"></i>Vendas</span><span><i style="background:var(--accent)"></i>Despesas</span></div></div>`;

  // dias da semana + rankings
  const wd = Array(7).fill(0), wdN = Array(7).fill(0);
  s.V.forEach(v => { const [y, m, d] = v.data.split('-').map(Number); const w = new Date(y, m - 1, d).getDay(); wd[w] += v.valor; wdN[w]++; });
  const wmx = Math.max(1, ...wd);
  const topP = rankBy(s.V, 'produto'), topC = rankBy(s.V, 'cliente');
  h += `<div class="grid2"><div class="card"><h3>Melhores dias da semana</h3><div class="chart" style="height:150px">` +
    wd.map((v, i) => `<div class="grp"><div class="bars"><div class="b v" style="height:${v / wmx * 100}%" title="${wdN[i]} venda(s) · ${brl(v)}"><span>${short(v)}</span></div></div><label>${DIAS[i]}</label></div>`).join('') +
    `</div></div><div class="card"><h3>Ranking</h3>` +
    ((topP.length || topC.length) ?
      (topP.length ? `<div class="muted">Produtos</div><ul class="rank">${topP.map(([n, v]) => `<li><span>${esc(n)}</span><b>${brl(v)}</b></li>`).join('')}</ul>` : '') +
      (topC.length ? `<div class="muted" style="margin-top:8px">Clientes</div><ul class="rank">${topC.map(([n, v]) => `<li><span>${esc(n)}</span><b>${brl(v)}</b></li>`).join('')}</ul>` : '')
      : `<div class="empty">Preencha <b>produto</b> e <b>cliente</b> nas próximas vendas para ver o ranking aqui.</div>`) +
    `</div></div>`;
  if (semData) h += `<div class="note">${semData} despesa(s) importada(s) da planilha estão <b>sem data</b>, então só entram no “Total geral”. Edite-as na aba Despesas para distribuí-las por mês.</div>`;
  return h;
}

function viewVendas() {
  const e = editing('vendas') || {};
  const rows = live('vendas').filter(v => inMonth(v.data, ui.month)).sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.u - a.u);
  const total = rows.reduce((s, r) => s + r.valor, 0);
  return `<h2>Vendas</h2>
  <form class="card form" data-form="vendas">
    <label>Data<input type="date" name="data" required value="${esc(e.data || today())}"></label>
    <label>Valor (R$)<input type="number" name="valor" step="0.01" min="0.01" required inputmode="decimal" value="${esc(e.valor ?? '')}"></label>
    <label>Cliente<input type="text" name="cliente" value="${esc(e.cliente || '')}" placeholder="opcional"></label>
    <label>Produto<input type="text" name="produto" list="produtos" value="${esc(e.produto || '')}" placeholder="ex.: caneca personalizada"></label>
    <label>Pagamento<select name="pagamento">${['', 'Pix', 'Dinheiro', 'Cartão', 'Transferência'].map(o => `<option ${e.pagamento === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
    <label class="wide">Observação<input type="text" name="obs" value="${esc(e.obs || '')}" placeholder="opcional"></label>
    <div class="row wide"><button class="btn" type="submit">${e.id ? 'Salvar alterações' : 'Adicionar venda'}</button>${e.id ? '<button type="button" class="btn ghost" data-act="cancel">Cancelar</button>' : ''}</div>
    <datalist id="produtos">${[...new Set(live('vendas').map(v => v.produto).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('')}</datalist>
  </form>
  <div class="card tablewrap">${rows.length ? `<table><thead><tr><th>Data</th><th>Cliente / produto</th><th>Pagamento</th><th class="num">Valor</th><th></th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${fmtDate(r.data)}</td><td>${esc([r.cliente, r.produto].filter(Boolean).join(' · ') || '—')}${r.obs ? `<div class="muted">${esc(r.obs)}</div>` : ''}</td><td>${r.pagamento ? `<span class="tag">${esc(r.pagamento)}</span>` : ''}</td><td class="num">${brl(r.valor)}</td>
  <td class="act"><button class="btn ghost small" data-act="edit" data-kind="vendas" data-id="${r.id}">Editar</button> <button class="btn danger small" data-act="del" data-kind="vendas" data-id="${r.id}">Excluir</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="3">${rows.length} venda(s)</td><td class="num">${brl(total)}</td><td></td></tr></tfoot></table>` : '<div class="empty">Nenhuma venda neste período.</div>'}</div>`;
}

const CATS = ['Caneca em branco', 'Tinta', 'Papel sublimático', 'Embalagem', 'Frete', 'Equipamento', 'Marketing', 'Taxas', 'MEI', 'Outros'];
function viewDespesas() {
  const e = editing('despesas') || {};
  const rows = live('despesas').filter(d => ui.month === 'all' ? true : (d.data && d.data.startsWith(ui.month)))
    .sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.u - a.u);
  const total = rows.reduce((s, r) => s + r.valor, 0);
  return `<h2>Despesas</h2>
  <form class="card form" data-form="despesas">
    <label>Data<input type="date" name="data" value="${esc(e.data || (e.id ? '' : today()))}"></label>
    <label>Descrição<input type="text" name="descricao" required value="${esc(e.descricao || '')}" placeholder="ex.: 50 canecas brancas"></label>
    <label>Categoria<input type="text" name="categoria" list="cats" value="${esc(e.categoria || '')}"></label>
    <label>Forma<select name="forma">${['Crédito', 'Débito', 'Pix', 'Dinheiro'].map(o => `<option ${e.forma === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
    <label>Valor total (R$)<input type="number" name="valor" step="0.01" min="0.01" required inputmode="decimal" value="${esc(e.valor ?? '')}"></label>
    <label>Nº de parcelas<input type="number" name="parcelas" min="1" step="1" value="${esc(e.parcelas || 1)}"></label>
    <label>Parcelas restantes<input type="number" name="restantes" min="0" step="1" value="${esc(e.restantes ?? '')}" placeholder="vazio = todas"></label>
    <label class="chk"><input type="checkbox" name="recorrente" ${e.recorrente ? 'checked' : ''}> Mensal (todo mês)</label>
    <div class="row wide"><button class="btn" type="submit">${e.id ? 'Salvar alterações' : 'Adicionar despesa'}</button>${e.id ? '<button type="button" class="btn ghost" data-act="cancel">Cancelar</button>' : ''}</div>
    <datalist id="cats">${CATS.map(c => `<option value="${c}">`).join('')}</datalist>
  </form>
  <div class="card tablewrap">${rows.length ? `<table><thead><tr><th>Data</th><th>Descrição</th><th>Forma</th><th class="num">Total</th><th>Parcelas</th><th></th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${fmtDate(r.data)}</td><td>${esc(r.descricao)}${r.categoria ? ` <span class="tag">${esc(r.categoria)}</span>` : ''}</td><td>${esc(r.forma)}</td><td class="num">${brl(r.valor)}</td>
  <td>${r.recorrente ? '<span class="tag bad">todo mês</span>' : r.restantes > 0 ? `<span class="tag bad">${r.restantes}/${r.parcelas} × ${brl(parcelaValor(r))}</span>` : (r.parcelas > 1 ? '<span class="tag good">quitado</span>' : '')}</td>
  <td class="act">${r.restantes > 0 ? `<button class="btn ghost small" data-act="parcela" data-id="${r.id}" title="Marcar 1 parcela como paga">−1 parcela</button> ` : ''}<button class="btn ghost small" data-act="edit" data-kind="despesas" data-id="${r.id}">Editar</button> <button class="btn danger small" data-act="del" data-kind="despesas" data-id="${r.id}">Excluir</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="3">${rows.length} despesa(s)</td><td class="num">${brl(total)}</td><td colspan="2"></td></tr></tfoot></table>` : '<div class="empty">Nenhuma despesa neste período.</div>'}</div>`;
}

function viewReceber() {
  const e = editing('receber') || {};
  const rows = live('receber').sort((a, b) => b.u - a.u);
  const total = rows.reduce((s, r) => s + r.valor, 0);
  return `<h2>A receber</h2>
  <form class="card form" data-form="receber">
    <label>Quem deve<input type="text" name="nome" required value="${esc(e.nome || '')}"></label>
    <label>Valor (R$)<input type="number" name="valor" step="0.01" min="0.01" required inputmode="decimal" value="${esc(e.valor ?? '')}"></label>
    <label>Observação<input type="text" name="obs" value="${esc(e.obs || '')}" placeholder="opcional"></label>
    <div class="row"><button class="btn" type="submit">${e.id ? 'Salvar' : 'Adicionar'}</button>${e.id ? '<button type="button" class="btn ghost" data-act="cancel">Cancelar</button>' : ''}</div>
  </form>
  <div class="card tablewrap">${rows.length ? `<table><thead><tr><th>Nome</th><th class="num">Valor</th><th></th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${esc(r.nome)}${r.obs ? `<div class="muted">${esc(r.obs)}</div>` : ''}</td><td class="num">${brl(r.valor)}</td>
  <td class="act"><button class="btn small" data-act="receive" data-id="${r.id}" title="Vira uma venda de hoje">Recebido ✓</button> <button class="btn ghost small" data-act="edit" data-kind="receber" data-id="${r.id}">Editar</button> <button class="btn danger small" data-act="del" data-kind="receber" data-id="${r.id}">Excluir</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td>Total pendente</td><td class="num">${brl(total)}</td><td></td></tr></tfoot></table>` : '<div class="empty">Ninguém devendo. 🎉</div>'}</div>`;
}

function viewAjustes() {
  return `<h2>Ajustes</h2>
  <form class="card form" data-form="meta"><label>Meta mensal de vendas (R$)<input type="number" name="meta" min="0" step="1" value="${db.config.meta || ''}"></label><div class="row"><button class="btn" type="submit">Salvar meta</button></div></form>
  <form class="card form" data-form="sync">
    <h3 class="wide">Sincronizar com a minha esposa (GitHub)</h3>
    <p class="muted wide" style="margin:0">Os dados ficam num arquivo JSON de um repositório <b>privado</b>. Cada pessoa informa o token uma vez, neste aparelho. Passo a passo no README.</p>
    <label>Usuário/organização<input type="text" name="owner" value="${esc(sync.owner)}" placeholder="seu-usuario" autocomplete="off"></label>
    <label>Repositório de dados<input type="text" name="repo" value="${esc(sync.repo)}" placeholder="cozy-mug-dados" autocomplete="off"></label>
    <label>Branch<input type="text" name="branch" value="${esc(sync.branch)}"></label>
    <label>Arquivo<input type="text" name="path" value="${esc(sync.path)}"></label>
    <label class="wide">Token (fine-grained, só neste repositório)<input type="password" name="token" value="${esc(sync.token)}" autocomplete="off"></label>
    <div class="row wide"><button class="btn" type="submit">${sync.enabled ? 'Atualizar e sincronizar' : 'Ativar sincronização'}</button>
    ${sync.enabled ? '<button type="button" class="btn ghost" data-act="syncnow">Sincronizar agora</button><button type="button" class="btn danger" data-act="syncoff">Desligar</button>' : ''}</div>
    ${statusMsg ? `<div class="note wide">${esc(statusMsg)}</div>` : ''}
  </form>
  <div class="card"><h3>Backup e importação</h3><div class="row">
    <button class="btn ghost" data-act="exportjson">Baixar backup (.json)</button>
    <button class="btn ghost" data-act="exportcsv">Baixar vendas e despesas (.csv)</button>
    <label class="btn ghost" style="display:inline-grid;place-items:center">Importar .json<input type="file" id="imp" accept="application/json,.json" hidden></label>
  </div><p class="muted">Importar <b>mescla</b> com o que já existe (não duplica registros com o mesmo código e nunca sobrescreve edições mais novas).</p></div>`;
}

const VIEWS = { painel: viewPainel, vendas: viewVendas, despesas: viewDespesas, receber: viewReceber, ajustes: viewAjustes };
function render() {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button data-act="tab" data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>${l}</button>`).join('');
  const ms = months().reverse();
  if (ui.month !== 'all' && !ms.includes(ui.month)) ui.month = 'all';
  $('#month').innerHTML = `<option value="all">Tudo</option>` + ms.map(k => `<option value="${k}" ${ui.month === k ? 'selected' : ''}>${MES[+k.slice(5) - 1]} ${k.slice(0, 4)}</option>`).join('');
  $('#month').hidden = ['ajustes', 'receber'].includes(ui.tab);
  $('#view').innerHTML = VIEWS[ui.tab]();
  paintBadge();
}

/* ---------- eventos ---------- */
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvNum = v => String(v ?? '').replace('.', ',');
const csvCell = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function exportCsv() {
  const L = [['Tipo', 'Data', 'Descrição/Cliente', 'Categoria/Produto', 'Forma/Pagamento', 'Valor', 'Parcelas', 'Restantes']];
  live('vendas').forEach(v => L.push(['Venda', v.data, v.cliente, v.produto, v.pagamento, csvNum(v.valor), '', '']));
  live('despesas').forEach(d => L.push(['Despesa', d.data || '', d.descricao, d.categoria, d.forma, csvNum(d.valor), d.parcelas, d.restantes]));
  download(`cozy-mug-${today()}.csv`, '﻿' + L.map(r => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const { act, kind, id, tab } = b.dataset;
  if (act === 'tab') { ui.tab = tab; ui.edit = null; render(); window.scrollTo(0, 0); }
  else if (act === 'edit') { ui.edit = { kind, id }; render(); window.scrollTo(0, 0); }
  else if (act === 'cancel') { ui.edit = null; render(); }
  else if (act === 'del') { if (confirm('Excluir este registro?')) { remove(kind, id); toast('Excluído'); } }
  else if (act === 'parcela') {
    const d = db.despesas.find(x => x.id === id);
    if (d && d.restantes > 0) { upsert('despesas', { ...d, restantes: d.restantes - 1 }); toast('Parcela marcada como paga'); }
  } else if (act === 'receive') {
    const r = db.receber.find(x => x.id === id); if (!r) return;
    upsert('vendas', { id: uid('v'), data: today(), valor: r.valor, cliente: r.nome, produto: '', pagamento: '', obs: r.obs || 'recebido de "a receber"' });
    remove('receber', id); toast('Virou venda de hoje');
  } else if (act === 'syncnow') syncNow();
  else if (act === 'syncoff') { sync.enabled = false; ls.set(LS_SYNC, JSON.stringify(sync)); setStatus('off'); render(); toast('Sincronização desligada'); }
  else if (act === 'exportjson') download(`cozy-mug-backup-${today()}.json`, JSON.stringify(db, null, 1), 'application/json');
  else if (act === 'exportcsv') exportCsv();
});

$('#month').addEventListener('change', e => { ui.month = e.target.value; render(); });

document.addEventListener('change', async e => {
  if (e.target.id !== 'imp' || !e.target.files[0]) return;
  try {
    const inc = normalize(JSON.parse(await e.target.files[0].text()));
    const n = inc.vendas.length + inc.despesas.length + inc.receber.length;
    if (!n) { toast('Arquivo sem registros'); return; }
    db = mergeDb(db, inc); commit(); toast(`${n} registros importados`);
  } catch { toast('Arquivo inválido'); }
});

document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const k = f.dataset.form, v = Object.fromEntries(new FormData(f));
  const cur = editing(k);
  const base = cur ? { ...cur } : { id: uid(k[0]) };
  const num = x => Math.round(Number(x) * 100) / 100;
  if (k === 'vendas') {
    upsert('vendas', { ...base, data: v.data, valor: num(v.valor), cliente: v.cliente.trim(), produto: v.produto.trim(), pagamento: v.pagamento, obs: v.obs.trim() });
    ui.edit = null; render(); toast('Venda salva');
  } else if (k === 'despesas') {
    const parcelas = Math.max(1, parseInt(v.parcelas, 10) || 1);
    const restantes = v.restantes === '' ? (parcelas > 1 ? parcelas : 0) : Math.min(parcelas, Math.max(0, parseInt(v.restantes, 10) || 0));
    upsert('despesas', { ...base, data: v.data || null, descricao: v.descricao.trim(), categoria: v.categoria.trim(), forma: v.forma, valor: num(v.valor), parcelas, restantes: parcelas > 1 ? restantes : 0, recorrente: !!v.recorrente });
    ui.edit = null; render(); toast('Despesa salva');
  } else if (k === 'receber') {
    upsert('receber', { ...base, nome: v.nome.trim(), valor: num(v.valor), obs: v.obs.trim() });
    ui.edit = null; render(); toast('Salvo');
  } else if (k === 'meta') {
    db.config = { meta: Math.max(0, Number(v.meta) || 0), u: Date.now() }; commit(); toast('Meta salva');
  } else if (k === 'sync') {
    sync = { ...sync, owner: v.owner.trim(), repo: v.repo.trim(), branch: v.branch.trim() || 'main', path: v.path.trim() || 'data.json', token: v.token.trim(), enabled: true };
    if (!sync.owner || !sync.repo || !sync.token) { sync.enabled = false; toast('Preencha usuário, repositório e token'); return; }
    ls.set(LS_SYNC, JSON.stringify(sync)); syncNow().then(() => { render(); toast(status === 'idle' ? 'Sincronizado!' : 'Veja o erro abaixo'); });
  }
});

render();
if (sync.enabled) syncNow();
