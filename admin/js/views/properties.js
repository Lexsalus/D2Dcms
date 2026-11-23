// Widok: Nieruchomości (import, przypisywanie, rejony)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, admin, setAdmin, flags, render, setRender, state, ROUTES, SECTION, GROUPS, groupOf, routesFor, canExport, repName, pct, periodStart, data, STATUS_FILTER, statusMatch, filters, wireFilters, localDay, reasonText, debounce } from '../core.js';
import { importFile, geocode, cleanStreet } from '../lib/import.js';

// ---------- NIERUCHOMOŚCI ----------
export async function properties(view) {
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

