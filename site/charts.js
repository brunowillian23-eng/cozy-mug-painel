/* Gráficos em SVG inline (sem bibliotecas). Cores vêm das variáveis CSS, então seguem o tema. */
'use strict';
let _gid = 0;
const gid = p => p + (++_gid);
const f1 = n => Number(n).toFixed(1);

/* linha de 7 pontos para dentro das métricas */
function spark(vals, w = 84, h = 26) {
  const n = vals.length, mx = Math.max(...vals), mn = Math.min(...vals), flat = mx === mn;
  const pts = vals.map((v, i) => [2 + i * ((w - 4) / (n - 1)), flat ? h / 2 : h - 3 - ((v - mn) / (mx - mn)) * (h - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + f1(p[0]) + ',' + f1(p[1])).join('');
  const l = pts[n - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path class="spark-l${flat ? ' flat' : ''}" pathLength="1" d="${d}"/><circle class="spark-d" cx="${f1(l[0])}" cy="${f1(l[1])}" r="2.6"/></svg>`;
}

const topRound = (x, y, w, h, r) => { r = Math.min(r, w / 2, h); return `M${f1(x)},${f1(y + h)}V${f1(y + r)}Q${f1(x)},${f1(y)} ${f1(x + r)},${f1(y)}H${f1(x + w - r)}Q${f1(x + w)},${f1(y)} ${f1(x + w)},${f1(y + r)}V${f1(y + h)}Z`; };

/* barras verticais duplas: vendas (verde) × despesas (cinza listrado, para daltônicos) */
function barChart(groups, W0) {
  if (!groups.length) return '';
  const n = groups.length, H = 220, pl = 38, pr = 8, pt = 24, pb = 28, base = H - pb, ch = base - pt;
  const W = Math.max(W0 || 0, n * 54 + pl + pr, 320), slot = (W - pl - pr) / n;
  const mx = Math.max(1, ...groups.flatMap(g => [g.a, g.b])) * 1.1;
  const Y = v => base - (v / mx) * ch;
  const bw = Math.min(30, slot / 3.2), gap = 6, showVals = n <= 8;
  const real = groups.filter(g => !g.sem), avg = real.reduce((s, g) => s + g.a, 0) / Math.max(1, real.length);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Vendas e despesas por mês"><defs><pattern id="stripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" style="fill:var(--gray)"/><rect width="2.4" height="6" style="fill:var(--gray-d)"/></pattern></defs>`;
  [0, .5, 1].forEach(t => { const v = mx / 1.1 * t, y = Y(v); s += `<line class="gridl" x1="${pl}" x2="${W - pr}" y1="${f1(y)}" y2="${f1(y)}"/><text class="ax" x="${pl - 6}" y="${f1(y + 4)}" text-anchor="end">${short(v)}</text>`; });
  let i = 0;
  groups.forEach((g, gi) => {
    const cx = pl + slot * (gi + .5);
    const bar = (cls, x, v, name) => {
      const h = v > 0 ? Math.max(3, (v / mx) * ch) : 0; if (!h) return '';
      const out = `<path class="bar ${cls}" style="--i:${i++}" d="${topRound(x, base - h, bw, h, 7)}"><title>${esc(mShort(g.k))} · ${name} ${money(v)}</title></path>`;
      return out + (showVals ? `<text class="vlab" x="${f1(x + bw / 2)}" y="${f1(base - h - 6)}">${short(v)}</text>` : '');
    };
    if (g.sem) s += bar('d', cx - bw / 2, g.b, 'Despesas');
    else s += bar('v', cx - bw - gap / 2, g.a, 'Vendas') + bar('d', cx + gap / 2, g.b, 'Despesas');
    s += `<text class="ax" x="${f1(cx)}" y="${H - 8}" text-anchor="middle">${esc(mShort(g.k))}</text>`;
  });
  if (real.length > 1 && avg > 0) s += `<line class="avgl" x1="${pl}" x2="${W - pr}" y1="${f1(Y(avg))}" y2="${f1(Y(avg))}"><title>Média de vendas por mês: ${money(avg)}</title></line>`;
  return `<div class="chart-scroll">${s}</svg></div>`;
}

/* linha suave */
function smooth(P, top, base) {
  const cl = y => Math.max(top, Math.min(base, y));
  if (P.length < 3) return P.map((p, i) => (i ? 'L' : 'M') + f1(p[0]) + ',' + f1(p[1])).join('');
  let d = `M${f1(P[0][0])},${f1(P[0][1])}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2, t = .17;
    d += `C${f1(p1[0] + (p2[0] - p0[0]) * t)},${f1(cl(p1[1] + (p2[1] - p0[1]) * t))} ${f1(p2[0] - (p3[0] - p1[0]) * t)},${f1(cl(p2[1] - (p3[1] - p1[1]) * t))} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d;
}

/* linha com área em degradê que "se desenha"; marcador e tooltip ficam em ui.js (bindLine) */
function lineChart(pts, unit = 'Dia', W0) {
  const n = pts.length, W = Math.max(W0 || 640, 320), H = 220, pl = 38, pr = 14, top = 16, base = H - 28;
  const mx = Math.max(1, ...pts.map(p => p.v)) * 1.12;
  const X = i => pl + (n === 1 ? 0 : i * (W - pl - pr) / (n - 1)), Y = v => base - (v / mx) * (base - top);
  const P = pts.map((p, i) => [X(i), Y(p.v)]), d = smooth(P, top, base), id = gid('lg');
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Vendas ao longo do tempo"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--brand);stop-opacity:.3"/><stop offset="1" style="stop-color:var(--brand);stop-opacity:0"/></linearGradient></defs>`;
  [0, .5, 1].forEach(t => { const v = mx / 1.12 * t, y = Y(v); s += `<line class="gridl" x1="${pl}" x2="${W - pr}" y1="${f1(y)}" y2="${f1(y)}"/><text class="ax" x="${pl - 6}" y="${f1(y + 4)}" text-anchor="end">${short(v)}</text>`; });
  const k = Math.min(6, n), idx = [...new Set(Array.from({ length: k }, (_, j) => Math.round(j * (n - 1) / Math.max(1, k - 1))))];
  idx.forEach(i => { s += `<text class="ax" x="${f1(X(i))}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(pts[i].l)}</text>`; });
  s += `<path class="lc-area" d="${d}L${f1(X(n - 1))},${base}L${f1(X(0))},${base}Z" fill="url(#${id})"/><path class="lc-line" pathLength="1" d="${d}"/>`;
  s += `<line class="lc-guide" x1="0" x2="0" y1="${top}" y2="${base}"/><circle class="lc-dot" r="5" cx="0" cy="0"/></svg><div class="lc-tip" hidden></div>`;
  const meta = { W, pl, pr, top, base, mx, unit, pts: pts.map(p => [p.l, p.v]) };
  return `<div class="chart-scroll"><div class="lc" style="width:${W}px" data-meta="${esc(JSON.stringify(meta))}">${s}</div></div>`;
}

/* barras horizontais finas, em pílula */
function hbars(items, { gray = false } = {}) {
  const mx = Math.max(1, ...items.map(i => i.v));
  return items.map((it, i) => `<div class="hrow"><span class="hl" title="${esc(it.l)}">${esc(it.l)}</span><div class="hb${gray ? ' gray' : ''}"><i style="--w:${Math.min(100, it.v / mx * 100).toFixed(1)}%;--i:${i}"></i></div><span class="hv">${esc(it.t ?? money(it.v))}</span></div>`).join('');
}

/* anel de progresso (pulsa ao chegar em 100%) */
function ring(pct, big, small) {
  const r = 44, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct / 100));
  return `<div class="ringbox${pct >= 100 ? ' full' : ''}" role="img" aria-label="${esc(big)} ${esc(small)}"><svg viewBox="0 0 100 100"><circle class="ring-bg" cx="50" cy="50" r="${r}"/><circle class="ring-fg" cx="50" cy="50" r="${r}" style="--c:${c.toFixed(2)};--o:${(c * (1 - p)).toFixed(2)}"/></svg><div class="ring-t"><b>${esc(big)}</b><span>${esc(small)}</span></div></div>`;
}

/* mapa de calor: semanas × dias da semana, em escala do verde da marca */
function heatmap(byDay, startStr, endStr) {
  const toD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmt = t => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  const s0 = toD(startStr); s0.setDate(s0.getDate() - s0.getDay());           // volta para o domingo
  const e0 = toD(endStr), weeks = Math.round((e0 - s0) / 864e5 / 7) + 1;
  const c = 14, g = 4, pl = 26, pt = 14, W = pl + weeks * (c + g), H = pt + 7 * (c + g);
  const mx = Math.max(1, ...[...byDay.values()].map(v => v.v));
  let s = `<svg class="hm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Mapa de calor das vendas">`;
  ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].forEach((n, i) => { if (i % 2) s += `<text x="0" y="${pt + i * (c + g) + c - 3}">${n}</text>`; });
  let i = 0, lastM = -1;
  for (let w = 0; w < weeks; w++) for (let d = 0; d < 7; d++) {
    const t = new Date(s0); t.setDate(s0.getDate() + w * 7 + d); if (t > e0 || t < toD(startStr)) continue;
    const k = fmt(t), v = byDay.get(k), lvl = v ? Math.max(1, Math.ceil(v.v / mx * 4)) : 0;
    if (d === 0 && t.getMonth() !== lastM) { lastM = t.getMonth(); s += `<text x="${pl + w * (c + g)}" y="9">${MES[t.getMonth()].slice(0, 3)}</text>`; }
    s += `<rect class="cell l${lvl}" style="--i:${i++}" x="${pl + w * (c + g)}" y="${pt + d * (c + g)}" width="${c}" height="${c}" rx="4"><title>${k.split('-').reverse().join('/')} · ${v ? money(v.v) + ' (' + v.n + ' venda' + (v.n > 1 ? 's' : '') + ')' : 'sem vendas'}</title></rect>`;
  }
  return `<div class="chart-scroll">${s}</svg></div><div class="hm-leg">menos ${[0, 1, 2, 3, 4].map(l => `<i class="hm l${l}" style="background:var(--${l ? 'brand' : 'line'});opacity:${l ? .25 + l * .1875 : 1}"></i>`).join('')} mais</div>`;
}

/* selos de conquista (animação de carimbo) */
function badge(a, i) {
  const glyph = { star: '<path d="M32 20l3.4 7 7.6 1-5.5 5.3 1.4 7.6L32 37.200l-6.900 3.700 1.400-7.600L21 28l7.600-1z" style="fill:var(--brand)"/>', check: '<path d="M23 33l6 6 13-14" fill="none" style="stroke:var(--brand)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>', heart: '<path d="M32 42s-11-6.500-11-14a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 7.500-11 14-11 14z" style="fill:var(--brand)"/>' }[a.glyph];
  const mark = glyph || `<text class="stamp-g" x="32" y="39">${esc(a.glyph)}</text>`;
  const acc = a.ok ? `<circle cx="52" cy="12" r="5" style="fill:var(${a.c})"/>` : '';
  return `<div class="bdg ${a.ok ? 'on' : 'off'}" style="--i:${i}" title="${esc(a.desc)}"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="stamp-bg" cx="32" cy="32" r="27"/><circle class="stamp-in" cx="32" cy="32" r="21"/>${mark}${acc}</svg><b>${esc(a.name)}</b>${a.ok ? '' : '<span>em andamento</span>'}</div>`;
}

/* ilustração leve para estados vazios (caneca com vapor) */
function emptyArt() {
  return `<svg viewBox="0 0 96 96" aria-hidden="true"><path class="mugs" d="M24 40h38v18a16 16 0 0 1-16 16h-6a16 16 0 0 1-16-16z" style="fill:var(--brand-wash)"/><path class="mugs" d="M62 46h4a8 8 0 0 1 0 16h-4"/><path class="steam" pathLength="1" d="M36 30c-4-5 4-7 0-13M50 30c-4-5 4-7 0-13"/><path d="M30 80h26" class="mugs" style="stroke:var(--line)"/></svg>`;
}
