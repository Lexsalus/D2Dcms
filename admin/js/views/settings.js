// Widok: Ustawienia (progi, biometria, cele, sesje, CRM, demo)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { CASE_PALETTE } from '../../../assets/js/domain/cases.js';
import { $, admin, setAdmin, flags, render, setRender, state, ROUTES, SECTION, GROUPS, groupOf, routesFor, canExport, repName, pct, periodStart, data, STATUS_FILTER, statusMatch, filters, wireFilters, localDay, reasonText, debounce } from '../core.js';

// ---------- USTAWIENIA ----------
export async function settings(view) {
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
      { id: 'cases', label: t('case_types'), color: '#DC2626', count: (s.caseTypes || []).length, tip: t('h_case_types') },
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
          ${chk('notifyBrowser')}
          ${S.MODE === 'supabase' ? chk('require2fa') : ''}`)}
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
        ${sec('cases', `<h3>${t('case_types')}${help('h_case_types')}</h3>
          <p class="muted small">${t('case_types_info')}</p>
          <div id="caseRows">${(s.caseTypes || []).map(caseRow).join('')}</div>
          <button type="button" class="btn" id="addCase" ${tip('h_add_case')}>+ ${t('add_case')}</button>`)}
        ${sec('demo', `<h3>${t('demo_section')}</h3>${chk('demoGps')}`)}
        <div class="toolbar mt" style="margin-bottom:0"><button class="btn btn-primary">${t('save')}</button></div>
      </form>
      <div class="card">
        <h3>${t('admin_account')}</h3>
        <dl class="kv"><dt>${t('email')}</dt><dd>${esc(admin.email)}</dd><dt>${t('version')}</dt><dd>${versionLabel()}</dd></dl>
        <p class="muted small">${S.MODE === 'supabase' ? t('mode_supabase') : t('prototype_note')}</p>
        ${S.MODE === 'supabase' ? '' : `<div class="toolbar mt">
          <button class="btn" id="resetDemo" ${tip('h_reset_demo')}>${t('reset_demo')}</button>
          <button class="btn btn-danger" id="clearAll" ${tip('h_clear_all')}>${t('clear_all')}</button>
        </div>`}
      </div>
    </div>`;
  const wireCaseRows = () => view.querySelectorAll('[data-delcase]').forEach(b => b.onclick = () => b.closest('.case-row').remove());
  wireCaseRows();
  $('#addCase').onclick = () => { $('#caseRows').insertAdjacentHTML('beforeend', caseRow({ name: '', color: CASE_PALETTE[$('#caseRows').children.length % CASE_PALETTE.length], guide: '' })); wireCaseRows(); $('#caseRows .case-row:last-child input[name=caseName]').focus(); };
  wireSubtabs(view, id => {
    state.setTab = id;
    view.querySelectorAll('.subtab').forEach(b => b.classList.toggle('active', b.dataset.sub === id));
    view.querySelectorAll('[data-sec]').forEach(el => el.classList.toggle('hidden', el.dataset.sec !== id));
  });
  $('#setForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const out = {};
    // rodzaje spraw: wiersze formularza → lista {name, color, guide}
    const names = f.getAll('caseName'), colors = f.getAll('caseColor'), guides = f.getAll('caseGuide');
    out.caseTypes = names.map((n, i) => ({ name: String(n).trim(), color: colors[i], guide: String(guides[i] || '').trim().slice(0, 1000) })).filter(c => c.name);
    for (const k of ['streetMin', 'gpsMax', 'gpsAcc', 'gapMax', 'dueTol', 'phashMax', 'cameraAge', 'retentionDays', 'targetPlan', 'targetAuto', 'targetRejected', 'targetReviewH']) out[k] = Number(f.get(k));
    out.demoGps = f.get('demoGps') === 'on';
    for (const k of ['sessionMin', 'repSessionH', 'notifyQueue', 'notifyDueH']) out[k] = Math.max(1, Number(f.get(k)));
    out.notifyBrowser = f.get('notifyBrowser') === 'on';
    if (S.MODE === 'supabase') out.require2fa = f.get('require2fa') === 'on';
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
  if ($('#resetDemo')) $('#resetDemo').onclick = async () => { if (confirm(t('reset_confirm'))) { await S.resetDemo(); S.logout('admin'); location.reload(); } };
  if ($('#clearAll')) $('#clearAll').onclick = async () => { if (confirm(t('clear_confirm'))) { await S.clearAll(); toast(t('saved')); render(); } };
}

// Wiersz rodzaju sprawy: nazwa (jak w pliku z Excela), kolor etykiety, wskazówki dla handlowca
function caseRow(c) {
  return `<div class="case-row">
    <div class="case-row-top">
      <input type="color" name="caseColor" value="${esc(c.color || '#64748B')}" ${tip('h_case_color')}>
      <input name="caseName" value="${esc(c.name)}" placeholder="${t('case_name_ph')}" ${tip('h_case_name')}>
      <button type="button" class="btn btn-ghost" data-delcase ${tip('h_del_case')}>✕</button>
    </div>
    <textarea name="caseGuide" rows="3" maxlength="1000" placeholder="${t('case_guide_ph')}" ${tip('h_case_guide')}>${esc(c.guide || '')}</textarea>
  </div>`;
}
