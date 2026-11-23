// Podpis palcem (kreski {x, y, t}) — wzór dla biometrii podpisu
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, screen, user, setUser, nav, go, flow, ui, render, setRender, bar } from '../core.js';

export function signaturePad(c) {
  const dpr = devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const paint = () => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = getComputedStyle(c).color; g.lineWidth = 2.4; g.lineCap = g.lineJoin = 'round';
    for (const st of flow.sig || []) { g.beginPath(); st.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); }
  };
  let drawing = false;
  const pos = e => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp }; };
  c.addEventListener('pointerdown', e => {
    e.preventDefault(); drawing = true; c.setPointerCapture?.(e.pointerId);
    (flow.sig ??= []).push([pos(e)]);
    $('.sig-hint')?.classList.add('hidden'); paint();
  });
  c.addEventListener('pointermove', e => {
    if (!drawing) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    flow.sig[flow.sig.length - 1].push(...evs.map(pos)); paint();
  });
  const end = () => { drawing = false; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  $('#sigClear').onclick = () => { flow.sig = []; $('.sig-hint')?.classList.remove('hidden'); paint(); };
  paint();
}

