// Panel — wspólny stan i pomocnicze funkcje (używane przez widoki)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../assets/js/core/ui.js';
import S from '../../assets/js/data/data.js';

export const $ = (sel, root = document) => root.querySelector(sel);

// zalogowany użytkownik panelu (admin lub manager) — wiązanie „na żywo” dla wszystkich modułów
export let admin = null;
export function setAdmin(u) { admin = u; }
// przerysowanie aktualnego widoku (ustawiane przez main.js)
export let render = async () => {};
export function setRender(fn) { render = fn; }
// flagi sesji panelu
export const flags = { pwDone: false, purged: false, forcing2fa: false };

export const ROUTES = ['dashboard', 'properties', 'review', 'reps', 'reports', 'settings'];
export const state = { period: 'week', rep: '', propFilter: 'all', propSearch: '', selected: new Set(), assignRep: '', reviewSel: null, status: '', reviewGroup: 'all', reportTab: 'perf', setTab: 'verify', repsTab: 'reps', routeDay: '' };

// Kolor i ikona każdej sekcji — pasek boczny, nagłówek strony i pod-zakładki
export const SECTION = {
  dashboard: { c: '#2F6FED', i: '▦' }, properties: { c: '#0891B2', i: '⌂' }, review: { c: '#F59E0B', i: '⚑' },
  reps: { c: '#7C3AED', i: '☺' }, reports: { c: '#DB2777', i: '▤' }, settings: { c: '#64748B', i: '⚙' },
};
// Grupy powodów weryfikacji (pod-zakładki kolejki)
export const GROUPS = {
  loc: { c: '#0891B2', codes: ['r_no_gps', 'r_gps_far', 'r_gps_inaccurate', 'r_no_geocode'] },
  addr: { c: '#2F6FED', codes: ['r_ocr_building_unreadable', 'r_street_mismatch', 'r_building_no_mismatch', 'r_ocr_unit_unreadable', 'r_unit_mismatch', 'r_no_unit_number'] },
  photo: { c: '#DB2777', codes: ['r_duplicate', 'r_not_camera', 'r_missing_photo'] },
  time: { c: '#64748B', codes: ['r_late', 'r_photo_gap'] },
  bio: { c: '#7C3AED', codes: ['r_bio_pin', 'r_bio_sig', 'r_bio_touch'] },
};
export const groupOf = code => Object.keys(GROUPS).find(g => GROUPS[g].codes.includes(code)) || 'time';

export const MANAGER_ROUTES = ['dashboard', 'review', 'reports'];
export const routesFor = u => S.isAdmin(u) ? ROUTES : MANAGER_ROUTES;
export const canExport = () => S.isAdmin(admin);

// ---------- pomocnicze ----------
export const repName = id => S.getUser(id)?.name || '—';
export const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

export function periodStart(p) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === 'week') { const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.getTime(); }
  if (p === 'month') { d.setDate(1); return d.getTime(); }
  return 0;
}

// Aktualna (najnowsza) wizyta dla każdego przypisania
export async function data() {
  let [props, asg, visits, reps] = await Promise.all([S.listProperties(), S.listAssignments(), S.listVisits(), S.listReps()]);
  // manager widzi wyłącznie swój zespół
  const sc = S.scope(admin);
  if (sc) { asg = asg.filter(a => sc.includes(a.userId)); visits = visits.filter(v => sc.includes(v.userId)); reps = reps.filter(r => sc.includes(r.id)); }
  const latest = new Map();
  for (const v of visits) {
    const cur = latest.get(v.assignmentId);
    if (!cur || (v.startedAt || 0) > (cur.startedAt || 0)) latest.set(v.assignmentId, v);
  }
  return { props, asg, visits, reps, latest };
}

export const STATUS_FILTER = ['todo', 'AUTO_VERIFIED', 'APPROVED', 'TO_REVIEW', 'REJECTED'];
export const statusMatch = a => !state.status || (state.status === 'todo' ? ['ASSIGNED', 'IN_PROGRESS'].includes(a.status) : a.status === state.status);
export function filters(withPeriod = true, withStatus = false) {
  return `
    ${withPeriod ? `<select id="fPeriod" ${tip('h_period')}>
      ${['week', 'month', 'all'].map(p => `<option value="${p}" ${state.period === p ? 'selected' : ''}>${t('period_' + p)}</option>`).join('')}
    </select>` : ''}
    <select id="fRep" ${tip('h_rep_filter')}><option value="">${t('all_reps')}</option></select>
    ${withStatus ? `<select id="fStatus" ${tip('h_status_filter')}><option value="">${t('all_statuses')}</option>
      ${STATUS_FILTER.map(x => `<option value="${x}" ${state.status === x ? 'selected' : ''}>${x === 'todo' ? t('todo') : t('st_' + x)}</option>`).join('')}</select>` : ''}`;
}
export async function wireFilters(root) {
  const reps = (await S.listReps()).filter(r => S.inScope(admin, r.id));
  const sel = $('#fRep', root);
  sel.innerHTML += reps.map(r => `<option value="${r.id}" ${state.rep === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  sel.onchange = () => { state.rep = sel.value; render(); };
  const st = $('#fStatus', root);
  if (st) st.onchange = () => { state.status = st.value; render(); };
  const per = $('#fPeriod', root);
  if (per) per.onchange = () => { state.period = per.value; render(); };
}


export const localDay = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function reasonText(r) { return t(r.code, r.n !== undefined ? { n: r.n } : undefined); }
export function debounce(fn, ms) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }
