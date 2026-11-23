// Powiadomienia (dzwonek)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, admin, setAdmin, flags, render, setRender, state, ROUTES, SECTION, GROUPS, groupOf, routesFor, canExport, repName, pct, periodStart, data, STATUS_FILTER, statusMatch, filters, wireFilters, localDay, reasonText, debounce } from '../core.js';

// ---------- powiadomienia ----------
export function notifText(n) {
  switch (n.kind) {
    case 'queue': return t('n_queue', { n: n.n });
    case 'overdue': return t('n_overdue', { n: n.n });
    case 'soon': return t('n_soon', { n: n.n, h: n.h });
    case 'screenshot_attempt': return t('n_screenshot', { who: n.who });
    case 'bio_pin_flag': return t('n_bio_pin', { who: n.who });
    default: return t('n_bio', { who: n.who, what: n.obj.split(', ').map(c => t(c).replace(/\s*\(.*\)/, '')).join(', ') });
  }
}
const NOTIF_GO = { queue: '#/review', overdue: '#/properties', soon: '#/properties', screenshot_attempt: '#/reports', bio_flag: '#/review', bio_pin_flag: '#/review' };
const NOTIF_IC = { queue: '⚑', overdue: '⏰', soon: '⏳', screenshot_attempt: '📵', bio_flag: '🧬', bio_pin_flag: '🧬' };
export async function paintBell() {
  if (!admin) return;
  const list = S.notifications(admin);
  const cnt = $('#bellCount');
  cnt.textContent = list.length; cnt.classList.toggle('hidden', !list.length);
  $('#bellPanel').innerHTML = `
    <div class="section-title"><h3 style="margin:0">${t('notifications')}${help('h_bell')}</h3>
      ${list.some(n => !n.sticky) ? `<button class="btn btn-ghost small" id="markSeen">${t('mark_read')}</button>` : ''}</div>
    ${list.map(n => `<a class="notif" href="${NOTIF_GO[n.kind]}" data-kind="${n.kind}"><span class="ni">${NOTIF_IC[n.kind]}</span>
      <span>${esc(notifText(n))}<br><span class="muted small">${n.sticky ? t('n_now') : fmtDateTime(n.ts)}</span></span></a>`).join('')
      || `<p class="muted">${t('no_notifications')}</p>`}`;
  const ms = $('#markSeen');
  if (ms) ms.onclick = async e => { e.stopPropagation(); await S.markNotifSeen(admin); setAdmin(S.currentUser('admin')); paintBell(); };
  $('#bellPanel').querySelectorAll('.notif').forEach(a => a.onclick = () => {
    if (a.dataset.kind === 'overdue' || a.dataset.kind === 'soon') state.propFilter = 'assigned';
    if (a.dataset.kind === 'screenshot_attempt') state.reportTab = 'audit';
    $('#bellPanel').classList.add('hidden');
  });
  // powiadomienia przeglądarki (gdy panel jest otwarty)
  const s = await S.getSettings();
  if (s.notifyBrowser && 'Notification' in window && Notification.permission === 'granted') {
    const last = +(localStorage.getItem('fc.notified') || 0);
    const fresh = list.filter(n => !n.sticky && n.ts > last);
    const q = list.find(n => n.kind === 'queue');
    const lastQ = +(localStorage.getItem('fc.notifiedQueue') || 0);
    for (const n of fresh.slice(0, 3)) new Notification('FieldCheck', { body: notifText(n), tag: n.id });
    if (q && q.n > lastQ) new Notification('FieldCheck', { body: notifText(q), tag: 'queue' });
    localStorage.setItem('fc.notifiedQueue', q ? q.n : 0);
    if (fresh.length) localStorage.setItem('fc.notified', Math.max(...fresh.map(n => n.ts)));
  }
}

