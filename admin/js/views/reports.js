// Widok: Raporty (skuteczność, wyniki, trendy, dziennik)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, admin, setAdmin, flags, render, setRender, state, ROUTES, SECTION, GROUPS, groupOf, routesFor, canExport, repName, pct, periodStart, data, STATUS_FILTER, statusMatch, filters, wireFilters, localDay, reasonText, debounce } from '../core.js';
import { trendsHtml } from '../lib/trends.js';
import { expButtons, wireExport, zipPhotos } from '../lib/export.js';

// ---------- RAPORTY ----------
export async function reports(view) {
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

