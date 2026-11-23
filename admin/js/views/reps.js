// Widok: Handlowcy i Managerowie
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, admin, setAdmin, flags, render, setRender, state, ROUTES, SECTION, GROUPS, groupOf, routesFor, canExport, repName, pct, periodStart, data, STATUS_FILTER, statusMatch, filters, wireFilters, localDay, reasonText, debounce } from '../core.js';

// ---------- HANDLOWCY ----------
export async function reps(view) {
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
          <td><b>${esc(m.name)}</b>${m.role === 'admin' ? ` <span class="role-badge">${t('role_admin')}</span>` : ''}</td><td>${esc(m.email || '')}</td>
          <td>${m.active !== false ? `<span class="ok">● ${t('yes')}</span>` : `<span class="bad">● ${t('no')}</span>`}</td>
          <td class="small">${(m.team || []).map(id => esc(S.getUser(id)?.name || '?')).join(', ') || `<span class="muted">—</span>`}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-ghost" data-medit="${m.id}" ${tip('h_edit_manager')}>${t('edit')}</button>
            ${m.id === admin.id ? '' : `<button class="btn btn-ghost" data-act="${m.active !== false ? 'deactivate' : 'activate'}" data-id="${m.id}" ${tip('h_activate')}>${t(m.active !== false ? 'deactivate' : 'activate')}</button>`}
            <button class="btn btn-ghost" data-act="remote_logout" data-id="${m.id}" ${tip('h_remote_logout')}>${t('remote_logout')}</button>
            ${S.MODE === 'supabase' ? `<button class="btn btn-ghost" data-reset="${m.id}" ${tip('h_send_reset')}>${t('send_reset')}</button>` : ''}
          </td>
        </tr>`).join('') || `<tr><td colspan="5" class="muted">${t('no_data')}</td></tr>`}</tbody></table></div>
    <p class="muted small">${t('manager_rights')}</p>`;
  wireSubtabs(view, id => { state.repsTab = id; render(); });
  $('#addMgr').onclick = () => managerModal(null, reps);
  view.querySelectorAll('[data-medit]').forEach(b => b.onclick = () => managerModal(S.getUser(b.dataset.medit), reps));
  view.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => {
    try { const link = await S.sendPasswordReset(admin, b.dataset.reset); if (link) linkModal(link, S.getUser(b.dataset.reset)?.email); else toast(t('reset_sent')); }
    catch (ex) { toast(t(ex.message)); }
  });
  view.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => { await S.repAction(admin, b.dataset.id, b.dataset.act); toast(t('saved')); render(); });
}
// Link zaproszenia / resetu do przekazania, gdy e-mail nie mógł zostać wysłany
function linkModal(link, email) {
  const m = modal(`<h2>${t('link_title')}</h2><p class="small">${t('link_info', { email: esc(email || '') })}</p>
    <textarea readonly rows="4" style="width:100%;font-size:12px">${esc(link)}</textarea>
    <div class="toolbar mt" style="justify-content:flex-end;margin-bottom:0"><button class="btn" id="cpLink">${t('copy')}</button><button class="btn btn-primary" data-x>${t('close')}</button></div>`);
  $('[data-x]', m.el).onclick = m.close;
  $('#cpLink', m.el).onclick = () => navigator.clipboard.writeText(link).then(() => toast(t('copied')));
}

function managerModal(m, reps) {
  const md = modal(`
    <h2>${m ? t('edit') : t('add_manager')}</h2>
    <form id="mgrForm">
      <div class="field"><label>${t('name')}</label><input name="name" required value="${esc(m?.name || '')}"></div>
      <div class="field"><label>${t('email')}</label><input name="email" type="email" required value="${esc(m?.email || '')}"></div>
      ${S.MODE === 'supabase' ? `<p class="muted small">${t(m ? 'mgr_reset_info' : 'mgr_invite_info')}</p>` : `<div class="field"><label>${t('password')}${help('h_mgr_password')}</label><input name="password" type="password" ${m ? '' : 'required'} autocomplete="new-password"></div>`}
      ${S.MODE === 'supabase' && !m ? `<div class="field"><label>${t('role')}${help('h_role_pick')}</label><select name="role"><option value="manager">${t('role_manager')}</option><option value="admin">${t('role_admin')}</option></select></div>` : ''}
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
    const rec = { name: f.get('name'), email: f.get('email'), team: f.getAll('team'), role: f.get('role') || 'manager' };
    if (f.get('password')) rec.password = f.get('password');
    if (m) rec.id = m.id;
    try { const link = await S.saveManager(admin, rec); md.close(); if (link) linkModal(link, rec.email); else toast(t(S.MODE === 'supabase' && !m ? 'invite_sent' : 'saved')); render(); }
    catch (ex) { toast(t(ex.message)); }
  };
}

function repModal(rep) {
  const m = modal(`
    <h2>${rep ? t('edit') : t('add_rep')}</h2>
    <form id="repForm">
      <div class="field"><label>${t('name')}</label><input name="name" required value="${esc(rep?.name || '')}"></div>
      ${S.MODE === 'supabase' ? `
      <div class="field"><label>${t('rep_login')}${help('h_rep_email')}</label><input name="email" type="email" ${rep ? 'disabled' : 'required'} value="${esc(rep?.email || '')}"></div>
      <div class="field"><label>${t(rep ? 'new_pin' : 'pin')}${help('h_rep_pin')}</label><input name="pin" inputmode="numeric" pattern="[0-9]{4,6}" ${rep ? '' : 'required'} autocomplete="off" placeholder="${rep ? t('leave_empty') : '4–6 cyfr'}"></div>` : `
      <div class="field"><label>${t('email')}</label><input name="email" type="email" value="${esc(rep?.email || '')}"></div>
      <div class="field"><label>${t('pin')}${help('h_pin')}</label><input name="pin" inputmode="numeric" pattern="[0-9]{4,6}" required value="${esc(rep?.pin || S.DEMO_PIN)}"></div>`}
      <div class="toolbar" style="justify-content:flex-end;margin:0">
        <button type="button" class="btn" data-x>${t('cancel')}</button><button class="btn btn-primary">${t('save')}</button>
      </div>
    </form>`);
  $('[data-x]', m.el).onclick = m.close;
  $('#repForm', m.el).onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (!f.password) delete f.password;
    if (!f.pin) delete f.pin;
    try { await S.saveRep(admin, rep ? { id: rep.id, ...f } : f); m.close(); toast(t('saved')); render(); }
    catch (ex) { toast(t(ex.message)); }
  };
}

