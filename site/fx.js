/* Efeitos e microinterações: toast, ripple, contadores, confete, tilt, tema, overlays */
'use strict';
const root = document.documentElement;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const money = v => brl(v).replace('-', '−');
const fmtVal = (v, f) => f === 'brl' ? money(v) : f === 'pct' ? Math.round(v) + '%' : f === 'dec' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : Math.round(v).toLocaleString('pt-BR');

/* toast centralizado no topo */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}

/* barra fina de progresso no topo */
function topProgress() {
  const p = $('#progress'); if (!p) return;
  p.classList.remove('run'); void p.offsetWidth; p.classList.add('run');
}

/* ondulação (ripple) a partir do ponto clicado */
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.rip'); if (!el || el.disabled || reduced()) return;
  const r = el.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
  const s = document.createElement('span'); s.className = 'ripple';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  el.appendChild(s); setTimeout(() => s.remove(), 650);
}, { passive: true });

/* contadores: do valor anterior até o novo, ease-out cúbico, até 900ms */
const counterPrev = new Map();
function runCounters(scope = document) {
  scope.querySelectorAll('[data-count]').forEach(el => {
    const to = Number(el.dataset.count) || 0, f = el.dataset.fmt || 'int', key = el.dataset.key;
    const from = key && counterPrev.has(key) ? counterPrev.get(key) : 0;
    if (key) counterPrev.set(key, to);
    if (reduced() || from === to) { el.textContent = fmtVal(to, f); return; }
    const t0 = performance.now(), dur = Math.min(900, 400 + Math.min(1, Math.abs(to - from) / (Math.abs(to) || 1)) * 500);
    el.textContent = fmtVal(from, f);
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtVal(from + (to - from) * e, f);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* salvar: anel que se expande a partir do botão + "✓ Salvo!" por 1,3s */
function saveFx(btn) {
  if (!btn) return;
  const old = btn.textContent;
  btn.textContent = '✓ Salvo!';
  setTimeout(() => { if (btn.isConnected) btn.textContent = old; }, 1300);
  if (reduced()) return;
  const r = btn.getBoundingClientRect(), ring = document.createElement('i');
  ring.className = 'save-ring';
  ring.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${getComputedStyle(btn).borderRadius}`;
  document.body.appendChild(ring); setTimeout(() => ring.remove(), 650);
}

/* conquistas: confete (20 partículas) saindo do botão, 800ms */
function confetti(el) {
  if (reduced() || !el) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const cols = ['var(--brand)', 'var(--pink)', 'var(--yellow)', 'var(--lilac)'];
  for (let i = 0; i < 20; i++) {
    const s = document.createElement('i'), a = Math.PI * 2 * i / 20 + Math.random() * .4, d = 70 + Math.random() * 90;
    s.className = 'confetti';
    s.style.cssText = `left:${cx}px;top:${cy}px;background:${cols[i % 4]};--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d - 30).toFixed(0)}px;--rot:${(Math.random() * 540 - 270).toFixed(0)}deg`;
    document.body.appendChild(s); setTimeout(() => s.remove(), 850);
  }
}

/* tilt 3D leve (máx. 4°), só com mouse */
(function () {
  if (matchMedia('(pointer: coarse)').matches) return;
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || reduced()) return;
    const el = e.target.closest && e.target.closest('[data-tilt]'); if (!el) return;
    const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
    el.style.transform = `perspective(800px) rotateX(${(-py * 8).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg) translateY(-2px)`;
  });
  document.addEventListener('pointerout', e => {
    const el = e.target.closest && e.target.closest('[data-tilt]');
    if (el && !el.contains(e.relatedTarget)) el.style.transform = '';
  });
})();

/* tema: [data-theme] + prefers-color-scheme; troca com revelação circular */
const ICON_SUN = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const currentTheme = () => root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function paintTheme() {
  const b = $('#themeBtn'); if (!b) return;
  const dark = currentTheme() === 'dark';
  b.innerHTML = (dark ? ICON_SUN : ICON_MOON) + `<span class="lbl">${dark ? 'Claro' : 'Escuro'}</span>`;
  b.setAttribute('aria-label', dark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro');
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#1b1917' : '#32785c';
}
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark', btn = $('#themeBtn');
  const rc = btn.getBoundingClientRect(), x = rc.left + rc.width / 2, y = rc.top + rc.height / 2;
  const apply = () => {
    root.dataset.theme = next; ls.set('cozymug.theme', next); paintTheme();
    const ic = $('#themeBtn .ico'); if (ic) ic.classList.add('spin');
  };
  if (document.startViewTransition && !reduced()) {
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add('vt-theme');
    const vt = document.startViewTransition(apply);
    vt.ready.then(() => root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
      { duration: 600, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
    vt.finished.finally(() => root.classList.remove('vt-theme'));
  } else apply();
}

/* overlays: fade + scale, Esc fecha, foco devolvido */
let lastFocus = null;
function openOverlay(html) {
  const o = $('#overlay'), s = $('#sheet');
  s.innerHTML = html; lastFocus = document.activeElement;
  o.classList.add('open'); document.body.style.overflow = 'hidden';
  (s.querySelector('[data-close]') || s).focus();
}
function closeOverlay() {
  const o = $('#overlay'); if (!o.classList.contains('open')) return;
  o.classList.remove('open'); document.body.style.overflow = '';
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
$('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay' || e.target.closest('[data-close]')) closeOverlay(); });
