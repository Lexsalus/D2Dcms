// Widok: Do weryfikacji (zdjęcia, kontrole, biometria, decyzje)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { caseChip } from '../../../assets/js/domain/cases.js';
import { $, admin, setAdmin, flags, render, setRender, state, ROUTES, SECTION, GROUPS, groupOf, routesFor, canExport, repName, pct, periodStart, data, STATUS_FILTER, statusMatch, filters, wireFilters, localDay, reasonText, debounce } from '../core.js';
import { sigSvg } from '../../../assets/js/domain/biometrics.js';
import { zipPhotos } from '../lib/export.js';

// ---------- DO WERYFIKACJI ----------
let caseTypesCache = [];
export async function review(view) {
  caseTypesCache = (await S.getSettings()).caseTypes || [];
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


export async function renderVisitBody(el, v) {
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
export function bioBox(v) {
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

export function renderDecision(el, v) {
  const p = S.getProperty(v.propertyId);
  el.innerHTML = `
    <h3>${t('decision')}</h3>
    <dl class="kv">
      <dt>${t('col_address')}</dt><dd>${esc(addrLine(p))}</dd>
      ${p.case_type ? `<dt>${t('case_type')}</dt><dd>${caseChip(p.case_type, caseTypesCache, esc)}</dd>` : ''}
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

export async function visitModal(visitId) {
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

