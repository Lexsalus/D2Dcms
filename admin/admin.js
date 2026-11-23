// Panel administratora FieldCheck (prototyp, dane lokalne)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../assets/js/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../assets/js/ui.js';
import * as S from '../assets/js/store.js';
import { sigSvg } from '../assets/js/biometrics.js';
import { routeLength, km } from '../assets/js/route.js';

const $ = (sel, root = document) => root.querySelector(sel);
let admin = null;
let purged = false;
const ROUTES = ['dashboard', 'properties', 'review', 'reps', 'reports', 'settings'];
const state = { period: 'week', rep: '', propFilter: 'all', propSearch: '', selected: new Set(), assignRep: '', reviewSel: null, status: '', reviewGroup: 'all', reportTab: 'perf', setTab: 'verify', repsTab: 'reps', routeDay: '' };

// Kolor i ikona każdej sekcji — pasek boczny, nagłówek strony i pod-zakładki
const SECTION = {
  dashboard: { c: '#2F6FED', i: '▦' }, properties: { c: '#0891B2', i: '⌂' }, review: { c: '#F59E0B', i: '⚑' },
  reps: { c: '#7C3AED', i: '☺' }, reports: { c: '#DB2777', i: '▤' }, settings: { c: '#64748B', i: '⚙' },
};
// Grupy powodów weryfikacji (pod-zakładki kolejki)
const GROUPS = {
  loc: { c: '#0891B2', codes: ['r_no_gps', 'r_gps_far', 'r_gps_inaccurate', 'r_no_geocode'] },
  addr: { c: '#2F6FED', codes: ['r_ocr_building_unreadable', 'r_street_mismatch', 'r_building_no_mismatch', 'r_ocr_unit_unreadable', 'r_unit_mismatch', 'r_no_unit_number'] },
  photo: { c: '#DB2777', codes: ['r_duplicate', 'r_not_camera', 'r_missing_photo'] },
  time: { c: '#64748B', codes: ['r_late', 'r_photo_gap'] },
  bio: { c: '#7C3AED', codes: ['r_bio_pin', 'r_bio_sig', 'r_bio_touch'] },
};
const groupOf = code => Object.keys(GROUPS).find(g => GROUPS[g].codes.includes(code)) || 'time';

// ---------- start ----------
function boot() {
  document.querySelectorAll('.version-text').forEach(el => el.textContent = versionLabel());
  mountControls($('.login-controls'));
  mountControls($('.side-controls'));
  applyDom();
  onLangChange(() => { document.querySelectorAll('.version-text').forEach(el => el.textContent = versionLabel()); render(); });
  document.addEventListener('fc-theme', () => { if (currentRoute() === 'dashboard') render(); });
  window.addEventListener('hashchange', render);
  S.onChange(render);
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { admin = await S.loginAdmin(f.get('email'), f.get('password')); render(); }
    catch (err) { const el = $('#loginErr'); el.textContent = t(err.message); el.classList.remove('hidden'); }
  };
  $('#logoutBtn').onclick = () => { S.logout('admin'); admin = null; render(); };
  // aktywność przedłuża sesję; co 30 s sprawdzamy, czy nie wygasła
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => S.touchSession('admin'), true));
  setInterval(() => { if (admin && !S.currentUser('admin')) render(); else if (admin) paintBell(); }, 30000);
  $('#bell').onclick = e => { e.stopPropagation(); $('#bellPanel').classList.toggle('hidden'); paintBell(); };
  document.addEventListener('click', e => { if (!e.target.closest('.bell-wrap')) $('#bellPanel').classList.add('hidden'); });
  render();
}

// Manager: tylko pulpit, weryfikacja i raporty swojego zespołu
const MANAGER_ROUTES = ['dashboard', 'review', 'reports'];
const routesFor = u => S.isAdmin(u) ? ROUTES : MANAGER_ROUTES;
function currentRoute() {
  const r = location.hash.replace('#/', '');
  return routesFor(admin).includes(r) ? r : 'dashboard';
}
const canExport = () => S.isAdmin(admin);

async function render() {
  admin = S.currentUser('admin');
  $('#login').classList.toggle('hidden', !!admin);
  $('#shell').classList.toggle('hidden', !admin);
  if (!admin) {
    $('#expiredMsg').classList.toggle('hidden', !S.sessionExpired.admin);
    $('#demoCreds').textContent = t('demo_creds', { creds: `admin: ${S.DEMO_ADMIN.email} · manager: ${S.DEMO_MANAGER.email} · ${S.DEMO_ADMIN.password}` });
    applyDom($('#login'));
    return;
  }
  applyDom();
  S.sessionExpired.admin = false;
  $('#who').innerHTML = `${esc(admin.name)}${S.isAdmin(admin) ? '' : ` <span class="role-badge" ${tip('h_manager_role')}>${t('role_manager')}</span>`}`;
  if (!purged) { purged = true; S.purgeOldPhotos(admin).then(n => n && toast(t('retention_done', { n }))); }
  paintBell();
  const route = currentRoute();
  const assignments = (await S.listAssignments()).filter(a => S.inScope(admin, a.userId));
  const toReview = assignments.filter(a => a.status === 'TO_REVIEW').length;
  $('#nav').innerHTML = routesFor(admin).map(r => `
    <a href="#/${r}" class="${r === route ? 'active' : ''}" style="--c:${SECTION[r].c}" ${tip('h_nav_' + r)}>
      <span><i class="nav-ic">${SECTION[r].i}</i>${t('nav_' + r)}</span>${r === 'review' && toReview ? `<span class="count">${toReview}</span>` : ''}
    </a>`).join('');
  $('#shell').style.setProperty('--accent', SECTION[route].c);
  $('#pageIc').textContent = SECTION[route].i;
  const view = $('#view');
  ({ dashboard, properties, review, reps, reports, settings })[route](view);
}

// ---------- powiadomienia ----------
function notifText(n) {
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
async function paintBell() {
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
  if (ms) ms.onclick = async e => { e.stopPropagation(); await S.markNotifSeen(admin); admin = S.currentUser('admin'); paintBell(); };
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

// ---------- pomocnicze ----------
const repName = id => S.getUser(id)?.name || '—';
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

function periodStart(p) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === 'week') { const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.getTime(); }
  if (p === 'month') { d.setDate(1); return d.getTime(); }
  return 0;
}

// Aktualna (najnowsza) wizyta dla każdego przypisania
async function data() {
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

const STATUS_FILTER = ['todo', 'AUTO_VERIFIED', 'APPROVED', 'TO_REVIEW', 'REJECTED'];
const statusMatch = a => !state.status || (state.status === 'todo' ? ['ASSIGNED', 'IN_PROGRESS'].includes(a.status) : a.status === state.status);
function filters(withPeriod = true, withStatus = false) {
  return `
    ${withPeriod ? `<select id="fPeriod" ${tip('h_period')}>
      ${['week', 'month', 'all'].map(p => `<option value="${p}" ${state.period === p ? 'selected' : ''}>${t('period_' + p)}</option>`).join('')}
    </select>` : ''}
    <select id="fRep" ${tip('h_rep_filter')}><option value="">${t('all_reps')}</option></select>
    ${withStatus ? `<select id="fStatus" ${tip('h_status_filter')}><option value="">${t('all_statuses')}</option>
      ${STATUS_FILTER.map(x => `<option value="${x}" ${state.status === x ? 'selected' : ''}>${x === 'todo' ? t('todo') : t('st_' + x)}</option>`).join('')}</select>` : ''}`;
}
async function wireFilters(root) {
  const reps = (await S.listReps()).filter(r => S.inScope(admin, r.id));
  const sel = $('#fRep', root);
  sel.innerHTML += reps.map(r => `<option value="${r.id}" ${state.rep === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  sel.onchange = () => { state.rep = sel.value; render(); };
  const st = $('#fStatus', root);
  if (st) st.onchange = () => { state.status = st.value; render(); };
  const per = $('#fPeriod', root);
  if (per) per.onchange = () => { state.period = per.value; render(); };
}

// ---------- PULPIT ----------
async function dashboard(view) {
  $('#pageTitle').textContent = `${t('dash_title')} — ${t('period_' + state.period).toLowerCase()}`;
  const { asg, reps, latest } = await data();
  const from = periodStart(state.period);
  const A = asg.filter(a => (!state.rep || a.userId === state.rep) && statusMatch(a));
  const V = A.map(a => latest.get(a.id)).filter(v => v && v.submittedAt && v.submittedAt >= from);
  const submitted = V.length;
  const auto = V.filter(v => v.status === 'AUTO_VERIFIED').length;
  const review = A.filter(a => a.status === 'TO_REVIEW').length;
  const activeReps = reps.filter(r => r.active && (!state.rep || r.id === state.rep));

  const cat = { auto: 0, manual: 0, review: 0, rejected: 0, todo: 0 };
  for (const a of A) {
    if (a.status === 'AUTO_VERIFIED') cat.auto++;
    else if (a.status === 'APPROVED') cat.manual++;
    else if (a.status === 'TO_REVIEW' || a.status === 'SUBMITTED') cat.review++;
    else if (a.status === 'REJECTED') cat.rejected++;
    else cat.todo++;
  }
  const colors = { auto: 'var(--green)', manual: 'var(--teal)', review: 'var(--amber)', rejected: 'var(--red)', todo: 'var(--gray)' };
  const labels = { auto: t('st_AUTO_VERIFIED'), manual: t('st_APPROVED'), review: t('st_TO_REVIEW'), rejected: t('st_REJECTED'), todo: t('todo') };

  const byRep = activeReps.map(r => {
    const ra = A.filter(a => a.userId === r.id);
    const done = ra.filter(a => S.SUBMITTED_SET.includes(a.status)).length;
    return { name: r.name, p: pct(done, ra.length), n: ra.length };
  }).filter(x => x.n).sort((a, b) => b.p - a.p);

  const recent = A.map(a => ({ a, v: latest.get(a.id) })).filter(x => x.v?.submittedAt)
    .sort((x, y) => y.v.submittedAt - x.v.submittedAt).slice(0, 8);

  view.innerHTML = `
    <div class="toolbar">${filters(true, true)}</div>
    <div class="kpis">
      <div class="card kpi"><div class="label">${t('kpi_assigned')}${help('h_kpi_assigned')}</div><div class="val">${A.length}</div><div class="sub">${t('kpi_reps', { n: activeReps.length })}</div></div>
      <div class="card kpi"><div class="label">${t('kpi_submitted')}${help('h_kpi_submitted')}</div><div class="val">${submitted}</div><div class="sub">${t('kpi_plan', { n: pct(submitted, A.length) })}</div></div>
      <div class="card kpi teal"><div class="label">${t('kpi_auto')}${help('h_kpi_auto')}</div><div class="val">${pct(auto, submitted)}%</div><div class="sub">${t('kpi_auto_of', { a: auto, b: submitted })}</div></div>
      <div class="card kpi amber"><div class="label">${t('kpi_review')}${help('h_kpi_review')}</div><div class="val">${review}</div><div class="sub">${t('kpi_waiting')}</div></div>
    </div>
    <div class="grid-2">
      <div class="card bars">
        <h3>${t('plan_by_rep')}${help('h_plan_by_rep')}</h3>
        ${byRep.length ? byRep.map(r => `
          <div class="row"><span>${esc(r.name)}</span><div class="track"><div class="fill" style="width:${r.p}%"></div></div><span class="pct">${r.p}%</span></div>`).join('') : `<p class="muted">${t('no_data')}</p>`}
      </div>
      <div class="card">
        <h3>${t('status_mix')}${help('h_status_mix')}</h3>
        <div class="donut-wrap">
          ${donut(cat, colors, pct(A.length - cat.todo, A.length))}
          <ul class="legend">${Object.keys(cat).map(k => `<li><i style="background:${colors[k]}"></i>${labels[k]} <b>${cat[k]}</b></li>`).join('')}</ul>
        </div>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>${t('recent_visits')}${help('h_recent')}</h3>
        <table><thead><tr><th>${t('col_address')}</th><th>${t('col_rep')}</th><th>${t('col_status')}</th><th>${t('col_time')}</th></tr></thead>
        <tbody>${recent.map(({ a, v }) => `
          <tr data-visit="${v.id}" style="cursor:pointer"><td>${esc(addrLine(S.getProperty(a.propertyId)))}</td><td>${esc(repName(a.userId))}</td><td>${badge(v.status)}</td><td>${fmtTime(v.submittedAt)}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${t('no_data')}</td></tr>`}
        </tbody></table>
      </div>
      <div class="card">
        <div class="section-title"><h3 style="margin:0">${state.rep ? t('route_done') : t('visits_map')}${help(state.rep ? 'h_route_done' : 'h_map')}</h3>
          ${state.rep ? routeDaySelect(A, latest) : `<span class="muted small">${t('route_pick_rep')}</span>`}</div>
        <div id="map"></div><div id="routeStats" class="muted small" style="margin-top:6px"></div></div>
    </div>`;
  await wireFilters(view);
  view.querySelectorAll('[data-visit]').forEach(tr => tr.onclick = () => visitModal(tr.dataset.visit));
  drawMap(A, latest);
  const rd = $('#routeDay'); if (rd) rd.onchange = () => { state.routeDay = rd.value; render(); };
}

function donut(cat, colors, centerPct) {
  const total = Object.values(cat).reduce((a, b) => a + b, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  const segs = Object.keys(cat).map(k => {
    const len = cat[k] / total * C;
    const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${colors[k]}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`;
    off += len; return s;
  }).join('');
  return `<svg width="140" height="140" viewBox="0 0 140 140">
    <circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--surface-2)" stroke-width="18"/>${segs}
    <text x="70" y="68" text-anchor="middle" font-size="22" font-weight="700" fill="var(--text)">${centerPct}%</text>
    <text x="70" y="88" text-anchor="middle" font-size="11" fill="var(--muted)">${t('sent')}</text></svg>`;
}

let map;
function drawMap(A, latest) {
  if (!window.L) { setTimeout(() => drawMap(A, latest), 300); return; }
  const el = $('#map'); if (!el) return;
  if (map) { map.remove(); map = null; }
  map = L.map(el, { scrollWheelZoom: false });
  const dark = document.documentElement.dataset.theme === 'dark';
  L.tileLayer(dark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: dark ? '&copy; OpenStreetMap, &copy; CARTO' : '&copy; OpenStreetMap',
  }).addTo(map);
  const col = { AUTO_VERIFIED: '#16A34A', APPROVED: '#0E9F8E', TO_REVIEW: '#F59E0B', SUBMITTED: '#F59E0B', REJECTED: '#DC2626', ASSIGNED: '#64748B', IN_PROGRESS: '#2F6FED' };
  const pts = [];
  for (const a of A) {
    const p = S.getProperty(a.propertyId);
    if (!p || p.lat == null) continue;
    pts.push([p.lat, p.lng]);
    const v = latest.get(a.id);
    L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 1.5, fillColor: col[a.status] || '#64748B', fillOpacity: .95 })
      .bindPopup(`<b>${esc(addrLine(p))}</b><br>${esc(repName(a.userId))}<br>${t('st_' + a.status)}${v?.submittedAt ? ' · ' + fmtDateTime(v.submittedAt) : ''}`)
      .addTo(map);
  }
  // zrealizowana trasa wybranego handlowca w wybranym dniu: wizyty w kolejności wysłania, punkty GPS
  if (state.rep) {
    const day = state.routeDay;
    const seq = A.map(a => latest.get(a.id)).filter(v => v?.submittedAt && localDay(v.submittedAt) === day)
      .sort((a, b) => a.submittedAt - b.submittedAt)
      .map(v => ({ v, lat: v.gps?.lat ?? S.getProperty(v.propertyId).lat, lng: v.gps?.lng ?? S.getProperty(v.propertyId).lng }))
      .filter(x => x.lat != null);
    if (seq.length) {
      L.polyline(seq.map(x => [x.lat, x.lng]), { color: SECTION.dashboard.c, weight: 4, opacity: .85 }).addTo(map);
      seq.forEach((x, i) => L.marker([x.lat, x.lng], { icon: L.divIcon({ className: '', html: `<span class="route-pin">${i + 1}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) })
        .bindPopup(`<b>${i + 1}. ${esc(addrLine(S.getProperty(x.v.propertyId)))}</b><br>${fmtTime(x.v.submittedAt)} · ${t('st_' + x.v.status)}`).addTo(map));
      const span = (seq[seq.length - 1].v.submittedAt - seq[0].v.submittedAt) / 60000;
      $('#routeStats').textContent = t('route_stats', { n: seq.length, km: km(routeLength(seq)), from: fmtTime(seq[0].v.submittedAt), to: fmtTime(seq[seq.length - 1].v.submittedAt), h: (span / 60).toFixed(1) });
      map.fitBounds(seq.map(x => [x.lat, x.lng]), { padding: [30, 30] });
    } else $('#routeStats').textContent = t('no_data');
  }
}

const localDay = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Dni, w których handlowiec wysyłał wizyty (wybór dnia trasy)
function routeDaySelect(A, latest) {
  const days = [...new Set(A.map(a => latest.get(a.id)).filter(v => v?.submittedAt).map(v => localDay(v.submittedAt)))].sort().reverse();
  if (!days.includes(state.routeDay)) state.routeDay = days[0] || '';
  return `<select id="routeDay" ${tip('h_route_day')}>${days.map(d => `<option value="${d}" ${d === state.routeDay ? 'selected' : ''}>${fmtDate(d + 'T12:00:00')}</option>`).join('')}</select>`;
}

// ---------- NIERUCHOMOŚCI ----------
async function properties(view) {
  $('#pageTitle').textContent = t('props_title');
  const { props, reps } = await data();
  const rows = props.map(p => ({ p, a: S.assignmentFor(p.id) })).filter(({ p, a }) => {
    if (state.propFilter === 'unassigned' && a) return false;
    if (state.propFilter === 'assigned' && !a) return false;
    if (state.rep && a?.userId !== state.rep) return false;
    if (state.propSearch) {
      const q = state.propSearch.toLowerCase();
      if (!`${p.street} ${p.building} ${p.unit} ${p.city} ${p.zip}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  // usuń z zaznaczenia nieistniejące
  for (const id of [...state.selected]) if (!props.some(p => p.id === id)) state.selected.delete(id);
  const activeReps = reps.filter(r => r.active);
  const asg = await S.listAssignments();
  const today = new Date(); today.setDate(today.getDate() + ((7 - today.getDay()) % 7 || 7));
  const defDue = state.due || today.toISOString().slice(0, 10);

  const nAssigned = props.filter(p => S.assignmentFor(p.id)).length;
  view.innerHTML = `
    ${subtabs([
      { id: 'all', label: t('filter_all'), count: props.length, color: '#64748B', tip: t('h_prop_filter') },
      { id: 'unassigned', label: t('filter_unassigned'), count: props.length - nAssigned, color: '#F59E0B', tip: t('h_prop_filter') },
      { id: 'assigned', label: t('filter_assigned'), count: nAssigned, color: '#0891B2', tip: t('h_prop_filter') },
    ], state.propFilter)}
    <div class="toolbar">
      <label class="btn btn-primary" style="margin:0" ${tip('h_import')}>${t('import_file')}<input type="file" id="importFile" accept=".csv,.txt,.xlsx,.xls,.json" hidden></label>
      <button class="btn" id="addAddr" ${tip('h_add_address')}>+ ${t('add_address')}</button>
      ${filters(false)}
      <input id="pSearch" ${tip('h_search')} placeholder="${t('search')}" value="${esc(state.propSearch)}">
      <span class="spacer"></span>
      <button class="btn btn-ghost" id="delSel" ${tip('h_delete')} ${state.selected.size ? '' : 'disabled'}>${t('delete')}</button>
    </div>
    <div class="props-layout">
      <div class="card" style="padding:0">
        <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="width:34px"><input type="checkbox" id="selAll" ${tip('h_select_all')}></th>
            <th>${t('col_address')}</th><th>${t('col_unit')}</th><th>${t('col_city')}</th><th>${t('col_rep')}</th><th>${t('col_due')}</th><th>${t('col_status')}</th>
          </tr></thead>
          <tbody>${rows.map(({ p, a }) => `
            <tr>
              <td><input type="checkbox" data-id="${p.id}" ${state.selected.has(p.id) ? 'checked' : ''}></td>
              <td>ul. ${esc(p.street)} ${esc(p.building)}${p.lat == null ? ` <span class="warn" ${tip('h_no_geo')}>⚠</span>` : ''}</td>
              <td>${esc(p.unit || '—')}</td><td>${esc(p.zip)} ${esc(p.city)}</td>
              <td>${a ? esc(repName(a.userId)) : `<span class="muted">${t('st_UNASSIGNED').toLowerCase()}</span>`}</td>
              <td>${a?.due ? fmtDate(a.due) : '—'}</td>
              <td>${a ? badge(a.status) : ''}</td>
            </tr>`).join('') || `<tr><td colspan="7" class="muted">${t('no_data')}</td></tr>`}
          </tbody>
        </table>
        </div>
        <div class="muted small" style="padding:10px 14px">${t('selected_of', { a: state.selected.size, b: props.length })} · ${t('import_help')}</div>
      </div>
      <div class="card assign-panel">
        <div class="section-title"><h3 style="margin:0">${t('assign_to')}${help('h_assign_panel')}</h3></div>
        ${activeReps.map(r => {
          const n = asg.filter(a => a.userId === r.id && !S.FINAL.includes(a.status)).length;
          return `<div class="rep-row ${state.assignRep === r.id ? 'sel' : ''}" data-rep="${r.id}"><span>${esc(r.name)}</span><span class="muted">${n}</span></div>`;
        }).join('')}
        <div class="stack">
          <div><label>${t('due_date')}${help('h_due')}</label><input type="date" id="dueDate" value="${defDue}" style="width:100%"></div>
          <button class="btn btn-primary" id="assignBtn" ${tip('h_assign')}>${t('assign_btn', { n: state.selected.size })}</button>
          <button class="btn" id="splitBtn" ${tip('h_split')}>${t('split_even')}</button>
          <button class="btn" id="regionBtn" ${tip('h_split_region')}>⌖ ${t('split_region')}</button>
          <button class="btn btn-ghost" id="unassignBtn" ${tip('h_unassign')}>${t('unassign')}</button>
        </div>
      </div>
    </div>`;

  await wireFilters(view);
  wireSubtabs(view, id => { state.propFilter = id; render(); });
  $('#pSearch').oninput = debounce(e => { state.propSearch = e.target.value; render().then(() => { const s = $('#pSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }); }, 250);
  $('#dueDate').onchange = e => { state.due = e.target.value; };
  view.querySelectorAll('tbody input[type=checkbox]').forEach(cb => cb.onchange = () => {
    cb.checked ? state.selected.add(cb.dataset.id) : state.selected.delete(cb.dataset.id); render();
  });
  $('#selAll').checked = rows.length > 0 && rows.every(r => state.selected.has(r.p.id));
  $('#selAll').onchange = e => { rows.forEach(r => e.target.checked ? state.selected.add(r.p.id) : state.selected.delete(r.p.id)); render(); };
  view.querySelectorAll('[data-rep]').forEach(el => el.onclick = () => { state.assignRep = state.assignRep === el.dataset.rep ? '' : el.dataset.rep; render(); });

  const due = () => $('#dueDate').value;
  $('#assignBtn').onclick = async () => {
    if (!state.selected.size) return toast(t('select_props_first'));
    if (!state.assignRep) return toast(t('select_rep_first'));
    const r = await S.assign(admin, [...state.selected], state.assignRep, due());
    state.selected.clear(); toast(t('assigned_ok', { n: r.n }) + (r.blocked ? ' · ' + t('cant_reassign') : '')); render();
  };
  $('#splitBtn').onclick = async () => {
    if (!state.selected.size) return toast(t('select_props_first'));
    const r = await S.splitEvenly(admin, [...state.selected], activeReps.map(x => x.id), due());
    state.selected.clear(); toast(t('assigned_ok', { n: r.n }) + (r.blocked ? ' · ' + t('cant_reassign') : '')); render();
  };
  $('#regionBtn').onclick = async () => {
    if (!state.selected.size) return toast(t('select_props_first'));
    const r = await S.splitByRegion(admin, [...state.selected], activeReps.map(x => x.id), due());
    state.selected.clear(); toast(t('region_ok', { n: r.n, g: r.groups }) + (r.blocked ? ' · ' + t('cant_reassign') : '')); render();
  };
  $('#unassignBtn').onclick = async () => {
    if (!state.selected.size) return toast(t('select_props_first'));
    await S.unassign(admin, [...state.selected]); state.selected.clear(); render();
  };
  $('#delSel').onclick = async () => {
    const r = await S.deleteProperties(admin, [...state.selected]); state.selected.clear();
    if (r.blocked) toast(t('cant_reassign')); render();
  };
  $('#addAddr').onclick = addAddressModal;
  $('#importFile').onchange = e => importFile(e.target.files[0]);
}

function addAddressModal() {
  const m = modal(`
    <h2>${t('add_address')}</h2>
    <form id="addrForm">
      <div class="field"><label>${t('street')}</label><input name="street" required></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field"><label>${t('building_no')}</label><input name="building" required></div>
        <div class="field"><label>${t('unit_no')}</label><input name="unit"></div>
        <div class="field"><label>${t('zip')}</label><input name="zip"></div>
        <div class="field"><label>${t('city')}</label><input name="city" required></div>
      </div>
      <div class="field"><label>${t('notes')}</label><input name="notes"></div>
      <div class="toolbar" style="justify-content:flex-end;margin:0">
        <button type="button" class="btn" data-x>${t('cancel')}</button><button class="btn btn-primary">${t('save')}</button>
      </div>
    </form>`);
  $('[data-x]', m.el).onclick = m.close;
  $('#addrForm', m.el).onsubmit = async e => {
    e.preventDefault();
    const p = Object.fromEntries(new FormData(e.target));
    p.street = cleanStreet(p.street);
    try {
      const rec = await S.addProperty(admin, { ...p, lat: null, lng: null });
      m.close(); render();
      const g = await geocode(rec);
      if (g) { await S.updateProperty(rec.id, g); render(); }
    } catch (err) { toast(t(err.message)); }
  };
}

const cleanStreet = s => String(s || '').trim().replace(/^(ul\.?|ulica|al\.?|aleja)\s+/i, '');

// ---------- import CSV / XLSX ----------
const HEAD = {
  street: ['ulica', 'street', 'вулиця', 'adres', 'address'],
  building: ['nr_budynku', 'nr budynku', 'budynek', 'building', 'building_no', 'numer', 'nr', 'номер будинку'],
  unit: ['nr_lokalu', 'nr lokalu', 'lokal', 'mieszkanie', 'unit', 'unit_no', 'flat', 'квартира', 'номер квартири'],
  zip: ['kod', 'kod_pocztowy', 'kod pocztowy', 'zip', 'postcode', 'postal_code', 'індекс'],
  city: ['miasto', 'miejscowosc', 'miejscowość', 'city', 'town', 'місто'],
  notes: ['uwagi', 'notes', 'note', 'opis', 'примітки'],
  lat: ['lat', 'latitude', 'szerokosc'],
  lng: ['lng', 'lon', 'long', 'longitude', 'dlugosc'],
  external_id: ['external_id', 'id_crm', 'crm_id', 'externalid'],
};
function mapHeaders(headers) {
  const idx = {};
  headers.forEach((h, i) => {
    const k = String(h).trim().toLowerCase();
    for (const f in HEAD) if (HEAD[f].includes(k) && idx[f] === undefined) idx[f] = i;
  });
  return idx;
}
function parseCSV(text) {
  const first = text.split(/\r?\n/)[0];
  const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim()));
}
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return window.XLSX;
}
async function importFile(file) {
  if (!file) return;
  let table;
  if (/\.json$/i.test(file.name)) {
    // format wymiany CRM: tablica adresów albo obiekt { properties: [...] } (docs/INTEGRACJA.md)
    try {
      const j = JSON.parse(await file.text());
      const arr = Array.isArray(j) ? j : (j.properties || []);
      table = [Object.keys(arr[0] || {}), ...arr.map(o => Object.keys(arr[0] || {}).map(k => o[k]))];
    } catch { return toast(t('bad_json')); }
  } else if (/\.xlsx?$/i.test(file.name)) {
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer());
    table = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
  } else {
    table = parseCSV(await file.text());
  }
  if (!table.length) return toast(t('no_data'));
  const idx = mapHeaders(table[0]);
  const get = (r, f) => idx[f] === undefined ? '' : String(r[idx[f]] ?? '').trim();
  const rows = table.slice(1).map(r => ({
    street: cleanStreet(get(r, 'street')), building: get(r, 'building'), unit: get(r, 'unit'),
    zip: get(r, 'zip'), city: get(r, 'city'), notes: get(r, 'notes'), external_id: get(r, 'external_id') || null,
    lat: get(r, 'lat') ? parseFloat(get(r, 'lat').replace(',', '.')) : null,
    lng: get(r, 'lng') ? parseFloat(get(r, 'lng').replace(',', '.')) : null,
  }));
  const res = await S.importProperties(admin, rows);
  toast(t('import_result', { a: res.added, b: res.dup, c: res.err }));
  render();
  // geokodowanie brakujących
  const missing = (await S.listProperties()).filter(p => p.lat == null);
  if (missing.length && confirm(t('geocode_on_import') + ` (${missing.length})`)) {
    for (let i = 0; i < missing.length; i++) {
      toast(t('geocoding', { a: i + 1, b: missing.length }));
      const g = await geocode(missing[i]);
      if (g) await S.updateProperty(missing[i].id, g);
      await new Promise(r => setTimeout(r, 1100)); // limit Nominatim: 1 zapytanie/s
    }
    render();
  }
}
async function geocode(p) {
  try {
    const q = new URLSearchParams({ format: 'json', limit: '1', street: `${p.building} ${p.street}`, city: p.city, postalcode: p.zip || '', country: 'Poland' });
    const r = await fetch('https://nominatim.openstreetmap.org/search?' + q, { headers: { 'Accept-Language': 'pl' } });
    const j = await r.json();
    return j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
  } catch { return null; }
}

// ---------- DO WERYFIKACJI ----------
async function review(view) {
  const { asg, latest } = await data();
  const all = asg.filter(a => a.status === 'TO_REVIEW').map(a => latest.get(a.id)).filter(Boolean)
    .sort((a, b) => a.submittedAt - b.submittedAt);
  $('#pageTitle').textContent = t('review_title', { n: all.length });
  if (!all.length) { view.innerHTML = `<div class="card"><p>${t('review_empty')}</p></div>`; return; }
  const inGroup = (v, g) => g === 'all' || (v.reasons || []).some(r => groupOf(r.code) === g);
  const tabs = [{ id: 'all', label: t('filter_all'), count: all.length, color: SECTION.review.c, tip: t('h_grp_all') },
    ...Object.keys(GROUPS).map(g => ({ id: g, label: t('grp_' + g), count: all.filter(v => inGroup(v, g)).length, color: GROUPS[g].c, tip: t('h_grp_' + g) }))
      .filter(x => x.count)];
  if (!tabs.some(x => x.id === state.reviewGroup)) state.reviewGroup = 'all';
  const queue = all.filter(v => inGroup(v, state.reviewGroup));
  if (!queue.some(v => v.id === state.reviewSel)) state.reviewSel = queue[0].id;
  const v = S.getVisit(state.reviewSel);

  view.innerHTML = `
    ${subtabs(tabs, state.reviewGroup)}
    <div class="review-layout">
      <div class="card" style="padding:8px">
        ${queue.map(q => {
          const p = S.getProperty(q.propertyId);
          return `<div class="q-item ${q.id === v.id ? 'sel' : ''}" data-v="${q.id}">
            <b>${esc(p.street)} ${esc(p.building)}${p.unit ? '/' + esc(p.unit) : ''}</b>
            <div class="muted small">${esc(repName(q.userId))} · ${fmtTime(q.submittedAt)}</div>
            <div class="chips">${(q.reasons || []).map(r => `<span class="chip" style="--c:${GROUPS[groupOf(r.code)].c}">${esc(reasonText(r))}</span>`).join('')}</div></div>`;
        }).join('')}
      </div>
      <div class="card" id="visitBody"></div>
      <div class="card decision" id="decisionBox"></div>
    </div>`;
  view.querySelectorAll('[data-v]').forEach(el => el.onclick = () => { state.reviewSel = el.dataset.v; render(); });
  wireSubtabs(view, id => { state.reviewGroup = id; state.reviewSel = null; render(); });
  await renderVisitBody($('#visitBody'), v);
  renderDecision($('#decisionBox'), v);
}

function reasonText(r) { return t(r.code, r.n !== undefined ? { n: r.n } : undefined); }

async function renderVisitBody(el, v) {
  const p = S.getProperty(v.propertyId);
  const photos = S.visitPhotos(v.id);
  const pb = photos.find(x => x.type === 'building');
  const pu = photos.find(x => x.type !== 'building');
  const d = v.details || {};
  const mark = ok => ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>';
  const box = async (ph, title, checkHtml, hk) => `
    <div class="photo-box">
      <h3>${title}${help(hk)}</h3>
      ${ph ? `<img src="${(await S.photoUrl(ph)) || ''}" alt="">` : `<div class="ph-empty">—</div>`}
      <div class="meta">
        <div><b>${t('ocr')}</b>${help('h_ocr')}<b>:</b> ${ph?.ocrText ? esc(ph.ocrText.slice(0, 80)) : '<span class="muted">—</span>'}</div>
        <div>${checkHtml}</div>
        ${ph && canExport() ? `<button class="btn btn-ghost small" data-dl="${ph.id}" style="margin-top:6px" ${tip('h_download')}>⬇ ${t('download')}</button>` : ''}
      </div>
    </div>`;
  const streetOk = d.streetScore !== undefined && !(v.reasons || []).some(r => r.code === 'r_street_mismatch');
  el.innerHTML = `
    <div class="photos">
      ${await box(pb, t('photo_building'), d.streetScore !== undefined ? `${t('addr_match')}: ${d.streetScore}% ${mark(streetOk && d.buildingOk)}` : '', 'h_photo_b')}
      ${await box(pu, pu?.type === 'door' ? t('photo_door') : t('photo_unit'), pu?.type === 'door' ? `<span class="warn">🚪 ${t('r_no_unit_number')}</span>` : p.unit ? `${t('unit_match')}: ${d.unitOk ? t('match_ok') : t('match_bad')} ${mark(d.unitOk)}` : '', 'h_photo_u')}
    </div>
    <div class="checks">
      <span ${tip('h_gps')}>${d.distance !== undefined ? t('gps_from_addr', { n: d.distance }) + ' ' + mark(!(v.reasons || []).some(r => r.code === 'r_gps_far')) : t('r_no_gps') + ' ' + mark(false)}</span>
      ${d.gapMin !== undefined ? `<span ${tip('h_gap')}>${t('photo_gap', { n: d.gapMin })} ${mark(!(v.reasons || []).some(r => r.code === 'r_photo_gap'))}</span>` : ''}
      <span ${tip('h_dup')}>${t('dup_photo')}: ${d.duplicate ? t('yes') : t('no')} ${mark(!d.duplicate)}</span>
      <span ${tip('h_camera')}>${t('in_app_camera')} ${mark(d.cameraOk !== false)}</span>
    </div>
    ${canExport() ? `<div class="toolbar" style="margin:10px 0 0"><button class="btn btn-ghost" data-zip="${v.id}" ${tip('h_zip_visit')}>🗂 ${t('zip_visit')}</button></div>` : ''}
    ${bioBox(v)}
    ${(v.reasons || []).length ? `<p class="small"><b>${t('reasons')}</b>${help('h_reasons')}<b>:</b> ${v.reasons.map(r => `<span class="chip" style="--c:${GROUPS[groupOf(r.code)].c}">${esc(reasonText(r))}</span>`).join(' ')}</p>` : ''}`;
  if (el.querySelector('[data-zip]')) el.querySelector('[data-zip]').onclick = () => zipPhotos([v], `${p.street}_${p.building}`.replace(/\s+/g, '_'));
  el.querySelectorAll('[data-dl]').forEach(b => b.onclick = async () => {
    const ph = photos.find(x => x.id === b.dataset.dl);
    const url = await S.photoUrl(ph);
    const blob = await (await fetch(url)).blob();
    download(`fieldcheck_${p.street}_${p.building}_${p.unit || ''}_${ph.type}.jpg`.replace(/\s+/g, '_'), blob);
    await S.logPhotoDownload(admin, ph);
    toast(t('download_logged'));
  });
}

// Wyniki biometrii wizyty: stan nauki / wynik / flaga + miniatura podpisu
function bioBox(v) {
  const b = v.bio || {};
  if (!b.pin && !b.sig && !b.touch && !v.signature) return '';
  const cell = r => {
    if (!r) return `<span class="muted">${t('bio_off')}</span>`;
    if (r.state === 'enroll') return `<span class="muted">${t('bio_enroll', { n: r.n, of: r.of })}</span>`;
    if (r.score == null) return '<span class="muted">—</span>';
    return r.flag ? `<span class="bad">⚑ ${r.score}× · ${t('bio_flag')}</span>` : `<span class="ok">${r.score}× · ${t('bio_ok')}</span>`;
  };
  return `<div class="bio-box">
    <h3>${t('bio_title')}${help('h_bio_box')}</h3>
    <div class="bio-grid">
      <div><div class="muted small">${t('bio_pin')}</div>${cell(b.pin)}</div>
      <div><div class="muted small">${t('bio_sig')}</div>${cell(b.sig)}</div>
      <div><div class="muted small">${t('bio_touch')}</div>${cell(b.touch)}</div>
    </div>
    ${v.signature ? `<div class="sig-thumb">${sigSvg(v.signature)}</div>` : ''}
    <p class="muted small">${t('bio_note')}</p>
  </div>`;
}

function renderDecision(el, v) {
  const p = S.getProperty(v.propertyId);
  el.innerHTML = `
    <h3>${t('decision')}</h3>
    <dl class="kv">
      <dt>${t('col_address')}</dt><dd>${esc(addrLine(p))}</dd>
      <dt>${t('col_rep')}</dt><dd>${esc(repName(v.userId))}</dd>
      <dt>${t('visit')}</dt><dd>${fmtDateTime(v.submittedAt)}</dd>
      <dt>${t('outcome')}</dt><dd>${v.outcome ? t('out_' + v.outcome) : '—'}</dd>
      ${v.note ? `<dt>${t('note')}</dt><dd>${esc(v.note)}</dd>` : ''}
    </dl>
    <div class="stack">
      <select id="rejReason" ${tip('h_reject_reason')}>
        <option value="">${t('reject_reason')} ▾</option>
        ${['rr_wrong_address', 'rr_wrong_location', 'rr_bad_photo', 'rr_duplicate', 'rr_other'].map(r => `<option value="${r}">${t(r)}</option>`).join('')}
      </select>
      <button class="btn btn-success" data-d="approve" ${tip('h_approve')}>${t('approve')}</button>
      <button class="btn btn-danger" data-d="reject" ${tip('h_reject')}>${t('reject')}</button>
      <button class="btn" data-d="revisit" ${tip('h_revisit')}>${t('revisit')}</button>
    </div>`;
  el.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => {
    const reason = $('#rejReason', el).value;
    if (b.dataset.d === 'reject' && !reason) { $('#rejReason', el).focus(); return toast(t('reject_reason')); }
    await S.decide(admin, v.id, b.dataset.d, reason);
    toast(t('decided')); render();
  });
}

async function visitModal(visitId) {
  const v = S.getVisit(visitId);
  const m = modal(`<div id="vmBody"></div><div id="vmDec" class="mt"></div>
    <div class="toolbar mt" style="justify-content:flex-end;margin-bottom:0">
      ${v.status === 'AUTO_VERIFIED' || v.status === 'APPROVED' ? `<button class="btn" id="reopen" ${tip('h_reopen')}>↺ ${t('st_TO_REVIEW')}</button>` : ''}
      <button class="btn btn-primary" id="vmClose">${t('close')}</button></div>`);
  m.el.style.width = 'min(860px, 100%)';
  $('#vmClose', m.el).onclick = m.close;
  await renderVisitBody($('#vmBody', m.el), v);
  const p = S.getProperty(v.propertyId);
  $('#vmDec', m.el).innerHTML = `<dl class="kv">
    <dt>${t('col_address')}</dt><dd>${esc(addrLine(p))}</dd><dt>${t('col_rep')}</dt><dd>${esc(repName(v.userId))}</dd>
    <dt>${t('visit')}</dt><dd>${fmtDateTime(v.submittedAt)}</dd><dt>${t('col_status')}</dt><dd>${badge(v.status)}</dd>
    <dt>${t('outcome')}</dt><dd>${v.outcome ? t('out_' + v.outcome) : '—'}</dd>
    ${v.decisionReason ? `<dt>${t('reject_reason')}</dt><dd>${t(v.decisionReason)}</dd>` : ''}</dl>`;
  const ro = $('#reopen', m.el);
  if (ro) ro.onclick = async () => { await S.decide(admin, v.id, 'reopen'); m.close(); render(); };
}

// ---------- HANDLOWCY ----------
async function reps(view) {
  $('#pageTitle').textContent = t('reps_title');
  const [list, asg, mgrs] = await Promise.all([S.listReps(), S.listAssignments(), S.listManagers()]);
  const tabs = subtabs([
    { id: 'reps', label: t('reps_title'), count: list.length, color: SECTION.reps.c, tip: t('h_nav_reps') },
    { id: 'managers', label: t('managers'), count: mgrs.length, color: '#0891B2', tip: t('h_managers') },
  ], state.repsTab);
  if (state.repsTab === 'managers') return managers(view, tabs, mgrs, list);
  view.innerHTML = `
    ${tabs}
    <div class="toolbar"><button class="btn btn-primary" id="addRep" ${tip('h_add_rep')}>+ ${t('add_rep')}</button></div>
    <div class="card" style="padding:0"><table>
      <thead><tr><th>${t('name')}</th><th>${t('email')}</th><th>${t('active')}</th><th>${t('device')}${help('h_device_col')}</th><th>${t('assigned_count')}</th><th>${t('bio_profile')}${help('h_bio_col')}</th><th></th></tr></thead>
      <tbody>${list.map(r => `
        <tr>
          <td><b>${esc(r.name)}</b></td><td>${esc(r.email || '')}</td>
          <td>${r.active ? `<span class="ok">● ${t('yes')}</span>` : `<span class="bad">● ${t('no')}</span>`}</td>
          <td>${r.deviceId ? esc(r.deviceId) : `<span class="muted">${t('device_none')}</span>`}</td>
          <td>${asg.filter(a => a.userId === r.id && !S.FINAL.includes(a.status)).length}</td>
          <td class="small">${(b => `${t('bio_pin')} ${b.pin}/${b.pinOf}<br>${t('bio_sig')} ${b.sig}/${b.sigOf}<br>${t('bio_touch')} ${b.touch}/${b.touchOf}`)(S.bioStatus(r))}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-ghost" data-edit="${r.id}" ${tip('h_edit')}>${t('edit')}</button>
            <button class="btn btn-ghost" data-act="${r.active ? 'deactivate' : 'activate'}" data-id="${r.id}" ${tip('h_activate')}>${t(r.active ? 'deactivate' : 'activate')}</button>
            <button class="btn btn-ghost" data-act="reset_device" data-id="${r.id}" ${tip('h_reset_device')} ${r.deviceId ? '' : 'disabled'}>${t('reset_device')}</button>
            <button class="btn btn-ghost" data-act="remote_logout" data-id="${r.id}" ${tip('h_remote_logout')}>${t('remote_logout')}</button>
            <button class="btn btn-ghost" data-act="reset_bio" data-id="${r.id}" ${tip('h_reset_bio')} ${r.bio ? '' : 'disabled'}>${t('reset_bio')}</button>
          </td>
        </tr>`).join('')}</tbody></table></div>`;
  wireSubtabs(view, id => { state.repsTab = id; render(); });
  $('#addRep').onclick = () => repModal();
  view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => repModal(S.getUser(b.dataset.edit)));
  view.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => { await S.repAction(admin, b.dataset.id, b.dataset.act); toast(t('saved')); render(); });
}
function managers(view, tabs, mgrs, reps) {
  view.innerHTML = `
    ${tabs}
    <div class="toolbar"><button class="btn btn-primary" id="addMgr" ${tip('h_add_manager')}>+ ${t('add_manager')}</button></div>
    <div class="card" style="padding:0"><table>
      <thead><tr><th>${t('name')}</th><th>${t('email')}</th><th>${t('active')}</th><th>${t('team')}${help('h_team')}</th><th></th></tr></thead>
      <tbody>${mgrs.map(m => `
        <tr>
          <td><b>${esc(m.name)}</b></td><td>${esc(m.email || '')}</td>
          <td>${m.active !== false ? `<span class="ok">● ${t('yes')}</span>` : `<span class="bad">● ${t('no')}</span>`}</td>
          <td class="small">${(m.team || []).map(id => esc(S.getUser(id)?.name || '?')).join(', ') || `<span class="muted">—</span>`}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-ghost" data-medit="${m.id}" ${tip('h_edit_manager')}>${t('edit')}</button>
            <button class="btn btn-ghost" data-act="${m.active !== false ? 'deactivate' : 'activate'}" data-id="${m.id}" ${tip('h_activate')}>${t(m.active !== false ? 'deactivate' : 'activate')}</button>
            <button class="btn btn-ghost" data-act="remote_logout" data-id="${m.id}" ${tip('h_remote_logout')}>${t('remote_logout')}</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="5" class="muted">${t('no_data')}</td></tr>`}</tbody></table></div>
    <p class="muted small">${t('manager_rights')}</p>`;
  wireSubtabs(view, id => { state.repsTab = id; render(); });
  $('#addMgr').onclick = () => managerModal(null, reps);
  view.querySelectorAll('[data-medit]').forEach(b => b.onclick = () => managerModal(S.getUser(b.dataset.medit), reps));
  view.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => { await S.repAction(admin, b.dataset.id, b.dataset.act); toast(t('saved')); render(); });
}
function managerModal(m, reps) {
  const md = modal(`
    <h2>${m ? t('edit') : t('add_manager')}</h2>
    <form id="mgrForm">
      <div class="field"><label>${t('name')}</label><input name="name" required value="${esc(m?.name || '')}"></div>
      <div class="field"><label>${t('email')}</label><input name="email" type="email" required value="${esc(m?.email || '')}"></div>
      <div class="field"><label>${t('password')}${help('h_mgr_password')}</label><input name="password" type="password" ${m ? '' : 'required'} autocomplete="new-password"></div>
      <div class="field"><label>${t('team')}${help('h_team')}</label>
        ${reps.map(r => `<label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" name="team" value="${r.id}" ${(m?.team || []).includes(r.id) ? 'checked' : ''}> ${esc(r.name)}</label>`).join('')}
      </div>
      <div class="toolbar" style="justify-content:flex-end;margin:0">
        <button type="button" class="btn" data-x>${t('cancel')}</button><button class="btn btn-primary">${t('save')}</button>
      </div>
    </form>`);
  $('[data-x]', md.el).onclick = md.close;
  $('#mgrForm', md.el).onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const rec = { name: f.get('name'), email: f.get('email'), team: f.getAll('team') };
    if (f.get('password')) rec.password = f.get('password');
    if (m) rec.id = m.id;
    await S.saveManager(admin, rec);
    md.close(); toast(t('saved')); render();
  };
}

function repModal(rep) {
  const m = modal(`
    <h2>${rep ? t('edit') : t('add_rep')}</h2>
    <form id="repForm">
      <div class="field"><label>${t('name')}</label><input name="name" required value="${esc(rep?.name || '')}"></div>
      <div class="field"><label>${t('email')}</label><input name="email" type="email" value="${esc(rep?.email || '')}"></div>
      <div class="field"><label>${t('pin')}${help('h_pin')}</label><input name="pin" inputmode="numeric" pattern="[0-9]{4,6}" required value="${esc(rep?.pin || S.DEMO_PIN)}"></div>
      <div class="toolbar" style="justify-content:flex-end;margin:0">
        <button type="button" class="btn" data-x>${t('cancel')}</button><button class="btn btn-primary">${t('save')}</button>
      </div>
    </form>`);
  $('[data-x]', m.el).onclick = m.close;
  $('#repForm', m.el).onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await S.saveRep(admin, rep ? { id: rep.id, ...f } : f);
    m.close(); toast(t('saved')); render();
  };
}

// ---------- RAPORTY ----------
async function reports(view) {
  $('#pageTitle').textContent = t('reports_title');
  const { asg, reps: repList, latest } = await data();
  const from = periodStart(state.period);
  const audit = (await S.listAudit()).filter(e => S.isAdmin(admin) || S.inScope(admin, e.userId) || e.userId === admin.id);
  const cfg = await S.getSettings();
  const rows = repList.filter(r => !state.rep || r.id === state.rep).map(r => {
    const A = asg.filter(a => a.userId === r.id);
    const V = A.map(a => latest.get(a.id)).filter(v => v?.submittedAt && v.submittedAt >= from);
    const auto = V.filter(v => v.status === 'AUTO_VERIFIED').length;
    const rej = V.filter(v => v.status === 'REJECTED').length;
    const days = new Set(V.map(v => new Date(v.submittedAt).toDateString())).size;
    const times = V.filter(v => v.startedAt).map(v => (v.submittedAt - v.startedAt) / 60000);
    const manual = V.filter(v => v.decidedAt && v.decision !== 'reopen');
    const out = Object.fromEntries(S.OUTCOMES.map(o => [o, V.filter(v => v.outcome === o).length]));
    return {
      name: r.name, assigned: A.length, submitted: V.length,
      plan: pct(V.length, A.length), auto: pct(auto, V.length), rejected: pct(rej, V.length),
      perDay: days ? (V.length / days).toFixed(1) : '0',
      timePer: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      reviewH: manual.length ? (manual.reduce((s, v) => s + (v.decidedAt - v.submittedAt), 0) / manual.length / 3600e3).toFixed(1) : null,
      talked: pct(out.talked, V.length), out,
    };
  });
  const cls = (v, goodMin, badMax) => v >= goodMin ? 'ok' : (badMax !== undefined && v < badMax ? 'bad' : 'warn');

  view.innerHTML = `
    ${subtabs([
      { id: 'perf', label: t('rt_perf'), color: '#DB2777', tip: t('h_rt_perf') },
      { id: 'out', label: t('rep_outcomes'), color: '#0891B2', tip: t('h_outcomes') },
      { id: 'trends', label: t('rt_trends'), color: '#7C3AED', tip: t('h_rt_trends') },
      { id: 'audit', label: t('audit_log'), count: audit.length, color: '#64748B', tip: t('h_audit') },
    ], state.reportTab)}
    <div class="toolbar">${filters()}<span class="spacer"></span>${canExport() ? `<button class="btn" id="zipPeriod" ${tip('h_zip_period')}>🗂 ${t('zip_period')}</button>${expButtons('expRep')}` : `<span class="muted small">${t('manager_no_export')}</span>`}</div>
    <div class="card ${state.reportTab === 'perf' ? '' : 'hidden'}" data-sec="perf" style="padding:0;overflow:auto">
      <table>
        <thead><tr>
          <th>${t('col_rep')}</th><th>${t('kpi_assigned')}</th><th>${t('kpi_submitted')}</th>
          <th>${t('rep_plan')}${help('h_rep_plan')}<div class="target">${t('target')} ≥ ${cfg.targetPlan}%</div></th>
          <th>${t('rep_auto')}${help('h_rep_auto')}<div class="target">${t('target')} ≥ ${cfg.targetAuto}%</div></th>
          <th>${t('rep_rejected')}${help('h_rep_rejected')}<div class="target">${t('target')} &lt; ${cfg.targetRejected}%</div></th>
          <th>${t('rep_per_day')}${help('h_rep_per_day')}</th><th>${t('rep_time_per')}${help('h_rep_time_per')}</th>
          <th>${t('out_talked')}${help('h_rep_talked')}</th>
          <th>${t('rep_review_time')}${help('h_rep_review_time')}<div class="target">${t('target')} &lt; ${cfg.targetReviewH} ${t('h')}</div></th>
        </tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td><b>${esc(r.name)}</b></td><td>${r.assigned}</td><td>${r.submitted}</td>
            <td class="${cls(r.plan, cfg.targetPlan, cfg.targetPlan - 20)}">${r.plan}%</td>
            <td class="${cls(r.auto, cfg.targetAuto, cfg.targetAuto - 25)}">${r.auto}%</td>
            <td class="${r.rejected < cfg.targetRejected ? 'ok' : 'bad'}">${r.rejected}%</td>
            <td>${r.perDay}</td><td>${r.timePer !== null ? r.timePer + ' ' + t('min') : '—'}</td>
            <td>${r.talked}%</td>
            <td class="${r.reviewH === null ? '' : (+r.reviewH < cfg.targetReviewH ? 'ok' : 'bad')}">${r.reviewH !== null ? r.reviewH + ' ' + t('h') : '—'}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="card ${state.reportTab === 'out' ? '' : 'hidden'}" data-sec="out">
      <h3>${t('rep_outcomes')}${help('h_outcomes')}</h3>
      <table><thead><tr><th>${t('col_rep')}</th>${S.OUTCOMES.map(o => `<th>${t('out_' + o)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td>${S.OUTCOMES.map(o => `<td>${r.out[o]}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </div>

    <div class="${state.reportTab === 'trends' ? '' : 'hidden'}" data-sec="trends">${trendsHtml(repList.filter(r => !state.rep || r.id === state.rep), asg, latest, from)}</div>
    <div class="card ${state.reportTab === 'audit' ? '' : 'hidden'}" data-sec="audit">
      <div class="section-title"><h3 style="margin:0">${t('audit_log')}${help('h_audit')}</h3>${canExport() ? expButtons('expAudit') : ''}</div>
      <div class="table-wrap" style="max-height:calc(100vh - 260px)">
      <table><thead><tr><th>${t('audit_when')}</th><th>${t('audit_who')}</th><th>${t('audit_action')}</th><th>${t('audit_object')}</th></tr></thead>
      <tbody>${audit.slice(0, 300).map(a => `<tr><td>${fmtDateTime(a.ts)}</td><td>${esc(repName(a.userId))}</td><td><code>${esc(a.action)}</code></td><td>${esc(a.object)}</td></tr>`).join('')}</tbody></table>
      </div>
    </div>`;
  await wireFilters(view);
  wireSubtabs(view, id => { state.reportTab = id; render(); });
  wireExport('expRep', 'raport', t('reports_title'), () => ({
    head: [t('col_rep'), t('kpi_assigned'), t('kpi_submitted'), t('rep_plan'), t('rep_auto'), t('rep_rejected'), t('rep_per_day'), t('rep_time_per'), ...S.OUTCOMES.map(o => t('out_' + o)), t('rep_review_time')],
    rows: rows.map(r => [r.name, r.assigned, r.submitted, r.plan + '%', r.auto + '%', r.rejected + '%', r.perDay, r.timePer ?? '', ...S.OUTCOMES.map(o => r.out[o]), r.reviewH ?? '']),
  }));
  wireExport('expAudit', 'audyt', t('audit_log'), () => ({
    head: [t('audit_when'), t('audit_who'), t('audit_action'), t('audit_object')],
    rows: audit.map(a => [fmtDateTime(a.ts), repName(a.userId), a.action, a.object]),
  }));
  if ($('#zipPeriod')) $('#zipPeriod').onclick = () => zipPhotos(
    asg.filter(a => !state.rep || a.userId === state.rep).map(a => latest.get(a.id)).filter(v => v?.submittedAt && v.submittedAt >= from),
    state.period);
}

// ---------- raporty zaawansowane: trendy, godziny, powody ----------
const PALETTE = ['#2F6FED', '#0E9F8E', '#F59E0B', '#DB2777', '#7C3AED', '#0891B2', '#64748B', '#16A34A'];
function trendsHtml(reps, asg, latest, from) {
  const V = asg.map(a => latest.get(a.id)).filter(v => v?.submittedAt && v.submittedAt >= from && reps.some(r => r.id === v.userId));
  if (!V.length) return `<div class="card"><p class="muted">${t('no_data')}</p></div>`;
  // dni: od pierwszej wizyty w okresie (maks. 30) do dziś
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const first = new Date(Math.max(Math.min(...V.map(v => v.submittedAt)), today.getTime() - 29 * 864e5)); first.setHours(0, 0, 0, 0);
  const days = []; for (let d = new Date(first); d <= today; d.setDate(d.getDate() + 1)) days.push(localDay(d.getTime()));
  const series = reps.map((r, i) => ({ name: r.name, c: PALETTE[i % PALETTE.length], vals: days.map(d => V.filter(v => v.userId === r.id && localDay(v.submittedAt) === d).length) }))
    .filter(x => x.vals.some(Boolean));
  const maxY = Math.max(1, ...series.flatMap(x => x.vals));
  const W = 1000, H = 240, L0 = 34, B0 = 26, T0 = 10, R0 = 10;
  const X = i => L0 + (days.length === 1 ? (W - L0 - R0) / 2 : i * (W - L0 - R0) / (days.length - 1));
  const Y = v => H - B0 - v / maxY * (H - B0 - T0);
  const ticks = [...new Set([0, Math.ceil(maxY / 2), maxY])];
  const step = Math.ceil(days.length / 8);
  const line = `<svg viewBox="0 0 ${W} ${H}" class="chart">
    ${ticks.map(v => `<line x1="${L0}" x2="${W - R0}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L0 - 6}" y="${Y(v) + 4}" text-anchor="end" class="ax">${v}</text>`).join('')}
    ${days.map((d, i) => i % step ? '' : `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="ax">${d.slice(8)}.${d.slice(5, 7)}</text>`).join('')}
    ${series.map(x => `<polyline fill="none" stroke="${x.c}" stroke-width="2.5" stroke-linejoin="round" points="${x.vals.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}"/>
      ${x.vals.map((v, i) => v ? `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="${x.c}"><title>${esc(x.name)} · ${days[i]}: ${v}</title></circle>` : '').join('')}`).join('')}
  </svg>
  <ul class="legend inline">${series.map(x => `<li><i style="background:${x.c}"></i>${esc(x.name)}</li>`).join('')}</ul>`;
  // godziny wysyłki wizyt
  const hours = Array.from({ length: 24 }, (_, h) => V.filter(v => new Date(v.submittedAt).getHours() === h).length);
  const h0 = Math.max(0, Math.min(6, hours.findIndex(Boolean))), h1 = Math.max(20, 23 - [...hours].reverse().findIndex(Boolean));
  const HH = hours.slice(h0, h1 + 1), maxH = Math.max(1, ...HH);
  const bw = (W - L0 - R0) / HH.length;
  const bars = `<svg viewBox="0 0 ${W} 180" class="chart">
    ${HH.map((v, i) => `<rect x="${L0 + i * bw + 3}" y="${154 - v / maxH * 140}" width="${bw - 6}" height="${v / maxH * 140}" rx="3" fill="#7C3AED" opacity="${v ? .85 : .15}"><title>${h0 + i}:00 — ${v}</title></rect>
      <text x="${L0 + i * bw + bw / 2}" y="172" text-anchor="middle" class="ax">${h0 + i}</text>${v ? `<text x="${L0 + i * bw + bw / 2}" y="${150 - v / maxH * 140}" text-anchor="middle" class="ax">${v}</text>` : ''}`).join('')}
  </svg>`;
  // powody oznaczeń wg handlowca (grupy)
  const gk = Object.keys(GROUPS);
  const flagged = reps.map(r => {
    const RV = V.filter(v => v.userId === r.id);
    const cnt = Object.fromEntries(gk.map(g => [g, RV.filter(v => (v.reasons || []).some(x => groupOf(x.code) === g)).length]));
    return { name: r.name, n: RV.length, cnt };
  });
  const table = `<table><thead><tr><th>${t('col_rep')}</th><th>${t('kpi_submitted')}</th>${gk.map(g => `<th><span class="chip" style="--c:${GROUPS[g].c}">${t('grp_' + g)}</span></th>`).join('')}</tr></thead>
    <tbody>${flagged.map(f => `<tr><td><b>${esc(f.name)}</b></td><td>${f.n}</td>${gk.map(g => `<td>${f.cnt[g] ? `<b style="color:${GROUPS[g].c}">${f.cnt[g]}</b> <span class="muted small">(${pct(f.cnt[g], f.n)}%)</span>` : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `
    <div class="card"><h3>${t('tr_daily')}${help('h_tr_daily')}</h3>${line}</div>
    <div class="grid-2 mt">
      <div class="card"><h3>${t('tr_hours')}${help('h_tr_hours')}</h3>${bars}</div>
      <div class="card" style="overflow:auto"><h3>${t('tr_reasons')}${help('h_tr_reasons')}</h3>${table}</div>
    </div>`;
}

// ---------- eksport CSV / XLSX / PDF i ZIP zdjęć ----------
const expButtons = id => `<span class="exp" id="${id}" ${tip('h_export')}>⬇ <button type="button" data-fmt="csv">CSV</button><button type="button" data-fmt="xlsx">XLSX</button><button type="button" data-fmt="pdf">PDF</button></span>`;
function wireExport(id, name, title, getData) {
  document.getElementById(id)?.querySelectorAll('[data-fmt]').forEach(b => b.onclick = async () => {
    const { head, rows } = getData();
    await exportTable(name, title, head, rows, b.dataset.fmt);
  });
}
async function exportTable(name, title, head, rows, fmt) {
  const file = `fieldcheck_${name}_${new Date().toISOString().slice(0, 10)}`;
  if (fmt === 'csv') {
    download(file + '.csv', '\uFEFF' + [head, ...rows].map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv');
  } else if (fmt === 'xlsx') {
    const X = await loadXLSX();
    const ws = X.utils.aoa_to_sheet([head, ...rows]);
    ws['!cols'] = head.map((h, i) => ({ wch: Math.min(40, Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length)) + 2) }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, title.slice(0, 31));
    X.writeFile(wb, file + '.xlsx');
  } else {
    // PDF: widok do druku — w oknie drukowania wybierz „Zapisz jako PDF”
    const w = window.open('', '_blank');
    if (!w) return toast(t('popup_blocked'));
    w.document.write(`<!DOCTYPE html><html lang="${document.documentElement.lang}"><head><meta charset="utf-8"><title>${esc(file)}</title>
      <style>body{font:12px Inter,Arial,sans-serif;color:#0F172A;margin:24px}h1{font-size:18px;margin:0 0 4px}p{color:#64748B;margin:0 0 14px}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #CBD5E1;padding:5px 7px;text-align:left}th{background:#12263F;color:#fff}
      tr:nth-child(even) td{background:#F3F5F9}@page{size:A4 landscape;margin:12mm}</style></head><body>
      <h1>FieldCheck — ${esc(title)}</h1><p>${esc(fmtDateTime(Date.now()))} · ${esc(versionLabel())}</p>
      <table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }
  await S.logEvent(admin, 'export', `${name} ${fmt.toUpperCase()}`);
}

async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return window.JSZip;
}
// ZIP zdjęć wybranych wizyt + plik wizyty.csv z opisem; zapis w audycie
async function zipPhotos(visits, name) {
  if (!visits.length) return toast(t('no_data'));
  let Z;
  try { Z = await loadJSZip(); } catch { return toast(t('lib_failed')); }
  const zip = new Z();
  const safe = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^\w.-]+/g, '_');
  const manifest = [['plik', t('col_address'), t('col_rep'), t('visit'), t('col_status'), t('outcome'), 'OCR', 'GPS m']];
  let n = 0;
  for (const v of visits) {
    const p = S.getProperty(v.propertyId);
    for (const ph of S.visitPhotos(v.id)) {
      const url = await S.photoUrl(ph); if (!url) continue;
      const fname = `${safe(p.street)}_${safe(p.building)}${p.unit ? '-' + safe(p.unit) : ''}_${safe(repName(v.userId))}_${ph.type}.jpg`;
      zip.file(fname, url.split(',')[1], { base64: true });
      manifest.push([fname, addrLine(p), repName(v.userId), new Date(v.submittedAt).toISOString(), t('st_' + v.status), v.outcome ? t('out_' + v.outcome) : '', ph.ocrText || '', v.details?.distance ?? '']);
      n++;
    }
  }
  zip.file('wizyty.csv', '\uFEFF' + manifest.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  download(`fieldcheck_zdjecia_${name}_${new Date().toISOString().slice(0, 10)}.zip`, await zip.generateAsync({ type: 'blob' }));
  await S.logEvent(admin, 'photo_zip', `${name}: ${n} zdjęć / ${visits.length} wizyt`);
  toast(t('download_logged'));
}

// ---------- USTAWIENIA ----------
async function settings(view) {
  $('#pageTitle').textContent = t('settings_title');
  const s = await S.getSettings();
  const numB = k => `<div class="field"><label>${t('s_' + k)}${help('h_s_' + k)}</label><input type="number" name="${k}" value="${s[k]}" min="0" step="${k.endsWith('Th') ? '0.1' : '1'}"></div>`;
  const num = (k, label) => `<div class="field"><label>${t(label)}${help('h_s_' + k)}</label><input type="number" name="${k}" value="${s[k]}" min="0"></div>`;
  const sec = (id, html) => `<div data-sec="${id}" class="${state.setTab === id ? '' : 'hidden'}">${html}</div>`;
  const chk = k => `<label style="display:flex;gap:8px;align-items:center;font-weight:400;margin:8px 0 6px"><input type="checkbox" name="${k}" ${s[k] ? 'checked' : ''}> ${t(k === 'demoGps' ? 's_demo_gps' : 's_' + k)}${help('h_s_' + k)}</label>`;
  const grid = html => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px">${html}</div>`;
  view.innerHTML = `
    ${subtabs([
      { id: 'verify', label: t('thresholds'), color: '#F59E0B', tip: t('h_st_verify') },
      { id: 'bio', label: t('bio_title'), color: '#7C3AED', tip: t('h_bio_section') },
      { id: 'targets', label: t('targets'), color: '#DB2777', tip: t('h_targets') },
      { id: 'notify', label: t('st_notify'), color: '#0891B2', tip: t('h_st_notify') },
      { id: 'crm', label: t('st_crm'), color: '#16A34A', tip: t('h_st_crm') },
      { id: 'demo', label: t('demo_section'), color: '#64748B', tip: t('h_st_demo') },
    ], state.setTab)}
    <div class="grid-2">
      <form class="card" id="setForm">
        ${sec('verify', `<h3>${t('thresholds')}</h3>${grid(`
          ${num('streetMin', 's_street_min')}${num('gpsMax', 's_gps_max')}
          ${num('gpsAcc', 's_gps_acc')}${num('gapMax', 's_gap_max')}
          ${num('dueTol', 's_due_tol')}${num('phashMax', 's_phash')}
          ${num('cameraAge', 's_camera_age')}${num('retentionDays', 's_retention')}`)}`)}
        ${sec('bio', `<h3>${t('bio_title')}${help('h_bio_section')}</h3>
          ${['bioPin', 'bioSig', 'bioTouch', 'bioToReview'].map(chk).join('')}
          <div style="margin-top:8px">${grid(`${numB('bioPinTh')}${numB('bioPinEnroll')}${numB('bioSigTh')}${numB('bioSigEnroll')}${numB('bioTouchTh')}${numB('bioTouchEnroll')}`)}</div>
          <p class="muted small">${t('bio_note')}</p>`)}
        ${sec('targets', `<h3>${t('targets')}${help('h_targets')}</h3>${grid(`
          ${num('targetPlan', 's_target_plan')}${num('targetAuto', 's_target_auto')}
          ${num('targetRejected', 's_target_rejected')}${num('targetReviewH', 's_target_review')}`)}`)}
        ${sec('notify', `<h3>${t('st_notify')}</h3>${grid(`
          ${num('sessionMin', 's_sessionMin')}${num('repSessionH', 's_repSessionH')}
          ${num('notifyQueue', 's_notifyQueue')}${num('notifyDueH', 's_notifyDueH')}`)}
          ${chk('notifyBrowser')}`)}
        ${sec('crm', `<h3>${t('st_crm')}${help('h_st_crm')}</h3>
          <div class="field"><label>${t('wh_url')}${help('h_wh_url')}</label><input name="whUrl" type="url" placeholder="https://…" value="${esc(s.whUrl || '')}"></div>
          <div class="field"><label>${t('wh_token')}${help('h_wh_token')}</label><input name="whToken" type="password" autocomplete="off" value="${esc(s.whToken || '')}"></div>
          <label>${t('wh_events')}${help('h_wh_events')}</label>
          ${['visit.submitted', 'visit.decided', 'assignment.created'].map(ev => `<label style="display:flex;gap:8px;align-items:center;font-weight:400;margin:4px 0"><input type="checkbox" name="whEvents" value="${ev}" ${(s.whEvents || []).includes(ev) ? 'checked' : ''}> <code>${ev}</code> — ${t('ev_' + ev.replace('.', '_'))}</label>`).join('')}
          <div class="toolbar mt">
            <button type="button" class="btn" id="whTest" ${tip('h_wh_test')}>${t('wh_test')}</button>
            <button type="button" class="btn" id="jsonExport" ${tip('h_json_export')}>⬇ ${t('json_export')}</button>
          </div>
          <div id="whLog"></div>
          <p class="muted small">${t('crm_note')}</p>`)}
        ${sec('demo', `<h3>${t('demo_section')}</h3>${chk('demoGps')}`)}
        <div class="toolbar mt" style="margin-bottom:0"><button class="btn btn-primary">${t('save')}</button></div>
      </form>
      <div class="card">
        <h3>${t('admin_account')}</h3>
        <dl class="kv"><dt>${t('email')}</dt><dd>${esc(admin.email)}</dd><dt>${t('version')}</dt><dd>${versionLabel()}</dd></dl>
        <p class="muted small">${t('prototype_note')}</p>
        <div class="toolbar mt">
          <button class="btn" id="resetDemo" ${tip('h_reset_demo')}>${t('reset_demo')}</button>
          <button class="btn btn-danger" id="clearAll" ${tip('h_clear_all')}>${t('clear_all')}</button>
        </div>
      </div>
    </div>`;
  wireSubtabs(view, id => {
    state.setTab = id;
    view.querySelectorAll('.subtab').forEach(b => b.classList.toggle('active', b.dataset.sub === id));
    view.querySelectorAll('[data-sec]').forEach(el => el.classList.toggle('hidden', el.dataset.sec !== id));
  });
  $('#setForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const out = {};
    for (const k of ['streetMin', 'gpsMax', 'gpsAcc', 'gapMax', 'dueTol', 'phashMax', 'cameraAge', 'retentionDays', 'targetPlan', 'targetAuto', 'targetRejected', 'targetReviewH']) out[k] = Number(f.get(k));
    out.demoGps = f.get('demoGps') === 'on';
    for (const k of ['sessionMin', 'repSessionH', 'notifyQueue', 'notifyDueH']) out[k] = Math.max(1, Number(f.get(k)));
    out.notifyBrowser = f.get('notifyBrowser') === 'on';
    out.whUrl = String(f.get('whUrl') || '').trim(); out.whToken = String(f.get('whToken') || ''); out.whEvents = f.getAll('whEvents');
    if (out.notifyBrowser && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    for (const k of ['bioPin', 'bioSig', 'bioTouch', 'bioToReview']) out[k] = f.get(k) === 'on';
    for (const k of ['bioPinTh', 'bioSigTh', 'bioTouchTh', 'bioPinEnroll', 'bioSigEnroll', 'bioTouchEnroll']) out[k] = Math.max(k.endsWith('Th') ? 0.5 : 2, Number(f.get(k)));
    await S.saveSettings(admin, out); toast(t('saved'));
  };
  const paintLog = () => {
    const log = S.webhookLog();
    $('#whLog').innerHTML = log.length ? `<table class="small mt"><thead><tr><th>${t('audit_when')}</th><th>${t('wh_event')}</th><th>${t('col_status')}</th><th>ms</th></tr></thead>
      <tbody>${log.slice(0, 10).map(l => `<tr><td>${fmtDateTime(l.ts)}</td><td><code>${esc(l.event)}</code></td>
        <td class="${l.status === 'ok' ? 'ok' : l.status === 'sent' ? 'warn' : 'bad'}" ${tip('h_wh_status_' + l.status)}>${t('wh_st_' + l.status)}${l.code ? ' ' + l.code : ''}</td><td>${l.ms}</td></tr>`).join('')}</tbody></table>` : '';
  };
  paintLog();
  $('#whTest').onclick = async () => {
    $('#setForm').requestSubmit();
    setTimeout(async () => {
      if (!(await S.getSettings()).whUrl) return toast(t('wh_no_url'));
      const r = await S.testWebhook(admin); toast(t('wh_st_' + r.status)); paintLog();
    }, 100);
  };
  $('#jsonExport').onclick = async () => download(`fieldcheck_export_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await S.exportJson(admin), null, 2), 'application/json');
  $('#resetDemo').onclick = async () => { if (confirm(t('reset_confirm'))) { await S.resetDemo(); S.logout('admin'); location.reload(); } };
  $('#clearAll').onclick = async () => { if (confirm(t('clear_confirm'))) { await S.clearAll(); toast(t('saved')); render(); } };
}

function debounce(fn, ms) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }

boot();
