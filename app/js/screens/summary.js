// Ekran: podsumowanie wizyty, wynik rozmowy, podpis, wysłanie
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, screen, user, setUser, nav, go, flow, ui, render, setRender, bar } from '../core.js';
import { bestStreetMatch, hasNumber, haversine, evaluate } from '../../../assets/js/domain/verify.js';
import { signaturePad } from '../lib/signature.js';

// ---------- podsumowanie ----------
export async function summaryScreen() {
  const a = (await S.myAssignments(user.id)).find(x => x.id === nav.assignmentId);
  const p = a.property;
  const v = S.getVisit(nav.visitId);
  bar(t('back'), { name: 'photo', step: p.unit ? 'unit' : 'building', assignmentId: a.id, visitId: v.id });
  const photos = S.visitPhotos(v.id);
  const pre = evaluate(p, a, v, photos, [], await S.getSettings()).details; // podgląd; decyzja zapada przy wysyłce
  const dist = v.gps && p.lat != null ? haversine(v.gps.lat, v.gps.lng, p.lat, p.lng) : null;
  const mk = ok => ok ? '<span class="ok">✓</span>' : '<span class="warn">✗</span>';
  const s = await S.getSettings();
  screen.innerHTML = `
    <h2>${t('summary')}${help('h_summary')}</h2>
    <div class="card">
      <div class="sum-row"><span>${t('building_addr')}</span><b>${esc(p.street)} ${esc(p.building)} ${mk(pre.streetScore >= s.streetMin && pre.buildingOk)}</b></div>
      ${p.unit ? `<div class="sum-row"><span>${t('unit_short')}</span><b>${esc(p.unit)} ${mk(pre.unitOk)}</b></div>` : ''}
      <div class="sum-row"><span>${t('location')}</span><b>${dist !== null ? t('m_from_addr', { n: dist }) + ' ' + mk(dist <= s.gpsMax) : t('r_no_gps') + ' ' + mk(false)}${v.gps?.demo ? ' <span class="muted small">(demo)</span>' : ''}</b></div>
      <div class="sum-row"><span>${t('time')}</span><b>${fmtTime(Date.now())}</b></div>
    </div>
    <h3 style="margin-top:16px">${t('outcome')}${help('h_outcome')}</h3>
    <div class="outcomes">${S.OUTCOMES.map(o => `<button class="outcome ${flow.outcome === o ? 'sel' : ''}" data-o="${o}">${t('out_' + o)}</button>`).join('')}</div>
    <div class="field" style="margin-top:14px"><label>${t('note_optional')}${help('h_note')}</label><textarea id="note" rows="3" maxlength="300">${esc(flow.note || '')}</textarea></div>
    ${s.bioSig ? `<div class="field">
      <label>${t('signature')}${help('h_signature')}</label>
      <div class="sig-wrap" data-nobio>
        <canvas id="sig" class="sig-pad"></canvas>
        <span class="sig-hint ${flow.sig?.length ? 'hidden' : ''}">${t('sig_hint')}</span>
        <button type="button" class="btn btn-ghost sig-clear" id="sigClear" ${tip('h_sig_clear')}>${t('clear')}</button>
      </div></div>` : ''}
    <button class="btn btn-primary btn-lg btn-block" id="send" ${tip('h_send')}>${t('send_visit')}</button>`;
  screen.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { flow.outcome = b.dataset.o; flow.note = $('#note').value; render(); });
  if (s.bioSig) signaturePad($('#sig'));
  $('#send').onclick = async () => {
    if (!flow.outcome) return toast(t('choose_outcome'));
    if (s.bioSig && !flow.sig?.length) { $('#sig').scrollIntoView({ block: 'center' }); return toast(t('sig_required')); }
    const touch = flow.touch?.features() || null;
    flow.touch?.stop();
    const res = await S.submitVisit(user, v.id, { outcome: flow.outcome, note: $('#note').value, signature: flow.sig || null, touch });
    for (const k in flow) delete flow[k]; // zdjęcia znikają z pamięci aplikacji po wysłaniu
    go({ name: 'result', visitId: res.id });
  };
}

// Podpis palcem: kreski [{x, y, t}] w układzie płótna; zachowane w flow.sig między przerysowaniami
