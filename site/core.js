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
function setStatus(s, msg = '') { status = s; statusMsg = msg; paintBadge(); if (s === 'saving' && typeof topProgress === 'function') topProgress(); }
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
  const b = $('#syncBadge'); if (!b) return;
  const map = { off: ['Só neste aparelho', ''], idle: ['Sincronizado', 'ok'], saving: ['Salvando…', ''], error: ['Erro ao sincronizar', 'err'] };
  const [txt, cls] = map[status];
  const l = b.querySelector('.lbl'); (l || b).textContent = txt;
  b.className = 'badge rip pressable ' + cls; b.dataset.s = status; b.title = statusMsg || 'Abrir ajustes';
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

