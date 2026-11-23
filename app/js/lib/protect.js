// Ochrona treści w przeglądarce: znak wodny, zasłona, blokada kopiowania (pełna: FLAG_SECURE w Androidzie)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, screen, user, setUser, nav, go, flow, ui, render, setRender, bar } from '../core.js';

// ---------- ochrona treści (w przeglądarce tylko częściowa; pełna = FLAG_SECURE w Androidzie) ----------
export function paintWatermark() {
  const line = `${user.name} · ${S.deviceId()} · ${fmtDate(Date.now())}     `;
  $('#watermark').textContent = Array(60).fill(line.repeat(4)).join('\n');
}
export function protectContent() {
  const shield = $('#shield');
  document.addEventListener('visibilitychange', () => shield.classList.toggle('hidden', document.visibilityState === 'visible'));
  window.addEventListener('blur', () => { if (user) shield.classList.remove('hidden'); });
  window.addEventListener('focus', () => shield.classList.add('hidden'));
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('copy', e => e.preventDefault());
  document.addEventListener('keyup', e => {
    if (e.key === 'PrintScreen' && user) {
      shield.classList.remove('hidden');
      S.logEvent(user, 'screenshot_attempt', S.deviceId());
      setTimeout(() => shield.classList.add('hidden'), 1500);
    }
  });
}
