// Ekran: lista adresów (Do zrobienia / Wysłane / Wszystkie)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, screen, user, setUser, nav, go, flow, ui, render, setRender, bar } from '../core.js';

// ---------- lista ----------
const ORDER = { IN_PROGRESS: 0, ASSIGNED: 1, TO_REVIEW: 2, SUBMITTED: 2, AUTO_VERIFIED: 3, APPROVED: 3, REJECTED: 4 };
export async function listScreen() {
  const items = (await S.myAssignments(user.id)).sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || String(a.due).localeCompare(String(b.due)));
  const done = items.filter(a => S.SUBMITTED_SET.includes(a.status)).length;
  const isTodo = a => ['ASSIGNED', 'IN_PROGRESS'].includes(a.status);
  const shown = items.filter(a => ui.listTab === 'all' || (ui.listTab === 'todo' ? isTodo(a) : !isTodo(a)));
  screen.innerHTML = `
    <div class="progress-head"><h2>${t('today_progress', { a: done, b: items.length })}${help('h_progress')}</h2></div>
    <div class="pbar"><i style="width:${items.length ? done / items.length * 100 : 0}%"></i></div>
    ${subtabs([
      { id: 'todo', label: t('sub_todo'), count: items.length - done, color: '#2F6FED', tip: t('h_sub_todo') },
      { id: 'sent', label: t('sub_sent'), count: done, color: '#0E9F8E', tip: t('h_sub_sent') },
      { id: 'all', label: t('filter_all'), count: items.length, color: '#64748B' },
    ], ui.listTab)}
    ${shown.map(a => `
      <button class="addr-card st-bl-${a.status}" data-a="${a.id}">
        <div class="a1">${esc(addrLine(a.property))}</div>
        <div class="a2"><span>${esc(a.property.zip)} ${esc(a.property.city)}${a.due ? ' · ' + t('due', { d: fmtDate(a.due) }) : ''}</span>${badge(a.status)}</div>
      </button>`).join('') || `<div class="card muted">${t('no_assignments')}</div>`}`;
  wireSubtabs(screen, id => { ui.listTab = id; render(); });
  screen.querySelectorAll('[data-a]').forEach(b => b.onclick = () => go({ name: 'visit', assignmentId: b.dataset.a }));
}

