// Panel administratora FieldCheck (prototyp, dane lokalne)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../assets/js/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help } from '../assets/js/ui.js';
import * as S from '../assets/js/store.js';

const $ = (sel, root = document) => root.querySelector(sel);
let admin = null;
const ROUTES = ['dashboard', 'properties', 'review', 'reps', 'reports', 'settings'];
const state = { period: 'week', rep: '', propFilter: 'all', propSearch: '', selected: new Set(), assignRep: '', reviewSel: null };

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
  render();
}

function currentRoute() {
  const r = location.hash.replace('#/', '');
  return ROUTES.includes(r) ? r : 'dashboard';
}

async function render() {
  admin = S.currentUser('admin');
  $('#login').classList.toggle('hidden', !!admin);
  $('#shell').classList.toggle('hidden', !admin);
  if (!admin) {
    $('#demoCreds').textContent = t('demo_creds', { creds: `${S.DEMO_ADMIN.email} / ${S.DEMO_ADMIN.password}` });
    applyDom($('#login'));
    return;
  }
  applyDom();
  $('#who').textContent = admin.name;
  const route = currentRoute();
  const assignments = await S.listAssignments();
  const toReview = assignments.filter(a => a.status === 'TO_REVIEW').length;
  $('#nav').innerHTML = ROUTES.map(r => `
    <a href="#/${r}" class="${r === route ? 'active' : ''}" ${tip('h_nav_' + r)}>
      <span>${t('nav_' + r)}</span>${r === 'review' && toReview ? `<span class="count">${toReview}</span>` : ''}
    </a>`).join('');
  const view = $('#view');
  ({ dashboard, properties, review, reps, reports, settings })[route](view);
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
  const [props, asg, visits, reps] = await Promise.all([S.listProperties(), S.listAssignments(), S.listVisits(), S.listReps()]);
  const latest = new Map();
  for (const v of visits) {
    const cur = latest.get(v.assignmentId);
    if (!cur || (v.startedAt || 0) > (cur.startedAt || 0)) latest.set(v.assignmentId, v);
  }
  return { props, asg, visits, reps, latest };
}

function filters(withPeriod = true) {
  return `
    ${withPeriod ? `<select id="fPeriod" ${tip('h_period')}>
      ${['week', 'month', 'all'].map(p => `<option value="${p}" ${state.period === p ? 'selected' : ''}>${t('period_' + p)}</option>`).join('')}
    </select>` : ''}
    <select id="fRep" ${tip('h_rep_filter')}><option value="">${t('all_reps')}</option></select>`;
}
async function wireFilters(root) {
  const reps = await S.listReps();
  const sel = $('#fRep', root);
  sel.innerHTML += reps.map(r => `<option value="${r.id}" ${state.rep === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  sel.onchange = () => { state.rep = sel.value; render(); };
  const per = $('#fPeriod', root);
  if (per) per.onchange = () => { state.period = per.value; render(); };
}

// ---------- PULPIT ----------
async function dashboard(view) {
  $('#pageTitle').textContent = `${t('dash_title')} — ${t('period_' + state.period).toLowerCase()}`;
  const { asg, reps, latest } = await data();
  const from = periodStart(state.period);
  const A = asg.filter(a => !state.rep || a.userId === state.rep);
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
    <div class="toolbar">${filters()}</div>
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
      <div class="card"><h3>${t('visits_map')}${help('h_map')}</h3><div id="map"></div></div>
    </div>`;
  await wireFilters(view);
  view.querySelectorAll('[data-visit]').forEach(tr => tr.onclick = () => visitModal(tr.dataset.visit));
  drawMap(A, latest);
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
  if (pts.length) map.fitBounds(pts, { padding: [20, 20] }); else map.setView([52.07, 19.48], 6);
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

  view.innerHTML = `
    <div class="toolbar">
      <label class="btn btn-primary" style="margin:0" ${tip('h_import')}>${t('import_file')}<input type="file" id="importFile" accept=".csv,.txt,.xlsx,.xls" hidden></label>
      <button class="btn" id="addAddr" ${tip('h_add_address')}>+ ${t('add_address')}</button>
      <select id="pFilter" ${tip('h_prop_filter')}>${['all', 'unassigned', 'assigned'].map(f => `<option value="${f}" ${state.propFilter === f ? 'selected' : ''}>${t('filter_' + f)}</option>`).join('')}</select>
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
          <button class="btn btn-ghost" id="unassignBtn" ${tip('h_unassign')}>${t('unassign')}</button>
        </div>
      </div>
    </div>`;

  await wireFilters(view);
  $('#pFilter').onchange = e => { state.propFilter = e.target.value; render(); };
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
  if (/\.xlsx?$/i.test(file.name)) {
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
    zip: get(r, 'zip'), city: get(r, 'city'), notes: get(r, 'notes'),
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
  const queue = asg.filter(a => a.status === 'TO_REVIEW').map(a => latest.get(a.id)).filter(Boolean)
    .sort((a, b) => a.submittedAt - b.submittedAt);
  $('#pageTitle').textContent = t('review_title', { n: queue.length });
  if (!queue.length) { view.innerHTML = `<div class="card"><p>${t('review_empty')}</p></div>`; return; }
  if (!queue.some(v => v.id === state.reviewSel)) state.reviewSel = queue[0].id;
  const v = S.getVisit(state.reviewSel);

  view.innerHTML = `
    <div class="review-layout">
      <div class="card" style="padding:8px">
        ${queue.map(q => {
          const p = S.getProperty(q.propertyId);
          return `<div class="q-item ${q.id === v.id ? 'sel' : ''}" data-v="${q.id}">
            <b>${esc(p.street)} ${esc(p.building)}${p.unit ? '/' + esc(p.unit) : ''}</b>
            <div class="muted small">${esc(repName(q.userId))} · ${fmtTime(q.submittedAt)}</div>
            <div class="r">${(q.reasons || []).map(reasonText).join(' · ')}</div></div>`;
        }).join('')}
      </div>
      <div class="card" id="visitBody"></div>
      <div class="card decision" id="decisionBox"></div>
    </div>`;
  view.querySelectorAll('[data-v]').forEach(el => el.onclick = () => { state.reviewSel = el.dataset.v; render(); });
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
        ${ph ? `<button class="btn btn-ghost small" data-dl="${ph.id}" style="margin-top:6px" ${tip('h_download')}>⬇ ${t('download')}</button>` : ''}
      </div>
    </div>`;
  const streetOk = d.streetScore !== undefined && !(v.reasons || []).some(r => r.code === 'r_street_mismatch');
  el.innerHTML = `
    <div class="photos">
      ${await box(pb, t('photo_building'), d.streetScore !== undefined ? `${t('addr_match')}: ${d.streetScore}% ${mark(streetOk && d.buildingOk)}` : '', 'h_photo_b')}
      ${await box(pu, pu?.type === 'door' ? t('photo_door') : t('photo_unit'), p.unit ? `${t('unit_match')}: ${d.unitOk ? t('match_ok') : t('match_bad')} ${mark(d.unitOk)}` : '', 'h_photo_u')}
    </div>
    <div class="checks">
      <span ${tip('h_gps')}>${d.distance !== undefined ? t('gps_from_addr', { n: d.distance }) + ' ' + mark(!(v.reasons || []).some(r => r.code === 'r_gps_far')) : t('r_no_gps') + ' ' + mark(false)}</span>
      ${d.gapMin !== undefined ? `<span ${tip('h_gap')}>${t('photo_gap', { n: d.gapMin })} ${mark(!(v.reasons || []).some(r => r.code === 'r_photo_gap'))}</span>` : ''}
      <span ${tip('h_dup')}>${t('dup_photo')}: ${d.duplicate ? t('yes') : t('no')} ${mark(!d.duplicate)}</span>
      <span ${tip('h_camera')}>${t('in_app_camera')} ${mark(d.cameraOk !== false)}</span>
    </div>
    ${(v.reasons || []).length ? `<p class="small"><b>${t('reasons')}</b>${help('h_reasons')}<b>:</b> <span class="warn">${v.reasons.map(reasonText).join(' · ')}</span></p>` : ''}`;
  el.querySelectorAll('[data-dl]').forEach(b => b.onclick = async () => {
    const ph = photos.find(x => x.id === b.dataset.dl);
    const url = await S.photoUrl(ph);
    const blob = await (await fetch(url)).blob();
    download(`fieldcheck_${p.street}_${p.building}_${p.unit || ''}_${ph.type}.jpg`.replace(/\s+/g, '_'), blob);
    await S.logPhotoDownload(admin, ph);
    toast(t('download_logged'));
  });
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
  const [list, asg] = await Promise.all([S.listReps(), S.listAssignments()]);
  view.innerHTML = `
    <div class="toolbar"><button class="btn btn-primary" id="addRep" ${tip('h_add_rep')}>+ ${t('add_rep')}</button></div>
    <div class="card" style="padding:0"><table>
      <thead><tr><th>${t('name')}</th><th>${t('email')}</th><th>${t('active')}</th><th>${t('device')}${help('h_device_col')}</th><th>${t('assigned_count')}</th><th></th></tr></thead>
      <tbody>${list.map(r => `
        <tr>
          <td><b>${esc(r.name)}</b></td><td>${esc(r.email || '')}</td>
          <td>${r.active ? `<span class="ok">● ${t('yes')}</span>` : `<span class="bad">● ${t('no')}</span>`}</td>
          <td>${r.deviceId ? esc(r.deviceId) : `<span class="muted">${t('device_none')}</span>`}</td>
          <td>${asg.filter(a => a.userId === r.id && !S.FINAL.includes(a.status)).length}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-ghost" data-edit="${r.id}" ${tip('h_edit')}>${t('edit')}</button>
            <button class="btn btn-ghost" data-act="${r.active ? 'deactivate' : 'activate'}" data-id="${r.id}" ${tip('h_activate')}>${t(r.active ? 'deactivate' : 'activate')}</button>
            <button class="btn btn-ghost" data-act="reset_device" data-id="${r.id}" ${tip('h_reset_device')} ${r.deviceId ? '' : 'disabled'}>${t('reset_device')}</button>
            <button class="btn btn-ghost" data-act="remote_logout" data-id="${r.id}" ${tip('h_remote_logout')}>${t('remote_logout')}</button>
          </td>
        </tr>`).join('')}</tbody></table></div>`;
  $('#addRep').onclick = () => repModal();
  view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => repModal(S.getUser(b.dataset.edit)));
  view.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => { await S.repAction(admin, b.dataset.id, b.dataset.act); toast(t('saved')); render(); });
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
  const audit = await S.listAudit();
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
    <div class="toolbar">${filters()}<span class="spacer"></span><button class="btn" id="expCsv" ${tip('h_export')}>⬇ ${t('export_csv')}</button></div>
    <div class="card" style="padding:0;overflow:auto">
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

    <div class="card mt">
      <h3>${t('rep_outcomes')}${help('h_outcomes')}</h3>
      <table><thead><tr><th>${t('col_rep')}</th>${S.OUTCOMES.map(o => `<th>${t('out_' + o)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td>${S.OUTCOMES.map(o => `<td>${r.out[o]}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </div>

    <div class="card mt">
      <div class="section-title"><h3 style="margin:0">${t('audit_log')}${help('h_audit')}</h3><button class="btn btn-ghost" id="expAudit" ${tip('h_export')}>⬇ CSV</button></div>
      <div class="table-wrap" style="max-height:360px">
      <table><thead><tr><th>${t('audit_when')}</th><th>${t('audit_who')}</th><th>${t('audit_action')}</th><th>${t('audit_object')}</th></tr></thead>
      <tbody>${audit.slice(0, 300).map(a => `<tr><td>${fmtDateTime(a.ts)}</td><td>${esc(repName(a.userId))}</td><td><code>${esc(a.action)}</code></td><td>${esc(a.object)}</td></tr>`).join('')}</tbody></table>
      </div>
    </div>`;
  await wireFilters(view);
  const csv = (head, data) => '﻿' + [head, ...data].map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  $('#expCsv').onclick = async () => {
    download(`fieldcheck_raport_${new Date().toISOString().slice(0, 10)}.csv`, csv(
      [t('col_rep'), t('kpi_assigned'), t('kpi_submitted'), t('rep_plan'), t('rep_auto'), t('rep_rejected'), t('rep_per_day'), t('rep_time_per'), ...S.OUTCOMES.map(o => t('out_' + o)), t('rep_review_time')],
      rows.map(r => [r.name, r.assigned, r.submitted, r.plan + '%', r.auto + '%', r.rejected + '%', r.perDay, r.timePer ?? '', ...S.OUTCOMES.map(o => r.out[o]), r.reviewH ?? ''])), 'text/csv');
    await S.logEvent(admin, 'export', 'raport CSV');
  };
  $('#expAudit').onclick = () => S.logEvent(admin, 'export', 'audyt CSV').then(() => download('fieldcheck_audyt.csv', csv(
    [t('audit_when'), t('audit_who'), t('audit_action'), t('audit_object')],
    audit.map(a => [new Date(a.ts).toISOString(), repName(a.userId), a.action, a.object])), 'text/csv'));
}

// ---------- USTAWIENIA ----------
async function settings(view) {
  $('#pageTitle').textContent = t('settings_title');
  const s = await S.getSettings();
  const num = (k, label) => `<div class="field"><label>${t(label)}${help('h_s_' + k)}</label><input type="number" name="${k}" value="${s[k]}" min="0"></div>`;
  view.innerHTML = `
    <div class="grid-2">
      <form class="card" id="setForm">
        <h3>${t('thresholds')}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px">
          ${num('streetMin', 's_street_min')}${num('gpsMax', 's_gps_max')}
          ${num('gpsAcc', 's_gps_acc')}${num('gapMax', 's_gap_max')}
          ${num('dueTol', 's_due_tol')}${num('phashMax', 's_phash')}
          ${num('cameraAge', 's_camera_age')}${num('retentionDays', 's_retention')}
        </div>
        <h3 class="mt">${t('targets')}${help('h_targets')}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px">
          ${num('targetPlan', 's_target_plan')}${num('targetAuto', 's_target_auto')}
          ${num('targetRejected', 's_target_rejected')}${num('targetReviewH', 's_target_review')}
        </div>
        <h3 class="mt">${t('demo_section')}</h3>
        <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" name="demoGps" ${s.demoGps ? 'checked' : ''}> ${t('s_demo_gps')}${help('h_s_demoGps')}</label>
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
  $('#setForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const out = {};
    for (const k of ['streetMin', 'gpsMax', 'gpsAcc', 'gapMax', 'dueTol', 'phashMax', 'cameraAge', 'retentionDays', 'targetPlan', 'targetAuto', 'targetRejected', 'targetReviewH']) out[k] = Number(f.get(k));
    out.demoGps = f.get('demoGps') === 'on';
    await S.saveSettings(admin, out); toast(t('saved'));
  };
  $('#resetDemo').onclick = async () => { if (confirm(t('reset_confirm'))) { await S.resetDemo(); S.logout('admin'); location.reload(); } };
  $('#clearAll').onclick = async () => { if (confirm(t('clear_confirm'))) { await S.clearAll(); toast(t('saved')); render(); } };
}

function debounce(fn, ms) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }

boot();
