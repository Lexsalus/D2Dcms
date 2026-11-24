// Ekran wizyty — wszystko na jednym ekranie: po kliknięciu adresu od razu zdjęcia, wynik, notatka i wysłanie.
// Zdjęcie 1 (klatka / budynek) i zdjęcie 2 (drzwi) można zrobić w dowolnym momencie; wizyta jest zapisywana na bieżąco,
// więc handlowiec może wyjść z aplikacji między zdjęciami (np. idąc na piętro) i wrócić do tego samego adresu.
import { t, fmtDate, fmtTime } from '../../../assets/js/core/i18n.js';
import { esc, toast, badge, addrLine, tip, help } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { caseChip, caseInfo } from '../../../assets/js/domain/cases.js';
import { $, screen, user, nav, go, flow, render, bar } from '../core.js';
import { bestStreetMatch, hasNumber } from '../../../assets/js/domain/verify.js';
import { touchRecorder } from '../../../assets/js/domain/biometrics.js';
import { capture } from '../lib/capture.js';
import { signaturePad } from '../lib/signature.js';
import { detailScreen } from './detail.js';

export async function visitScreen() {
  const a = (await S.myAssignments(user.id)).find(x => x.id === nav.assignmentId);
  if (!a) return go({ name: 'list' });
  // adres już wysłany → podgląd statusu
  if (!['ASSIGNED', 'IN_PROGRESS'].includes(a.status)) return detailScreen();
  const p = a.property;

  // start (albo kontynuacja) wizyty — bez osobnego przycisku
  if (!nav.visitId) {
    const v = await S.startVisit(user, a.id);
    nav.visitId = v.id;
    if (flow.visitId !== v.id) {
      flow.touch?.stop();
      for (const k in flow) delete flow[k];
      flow.visitId = v.id;
      flow.touch = touchRecorder();
      // zdjęcia zrobione wcześniej (np. przed wejściem na piętro)
      for (const ph of S.visitPhotos(v.id)) {
        flow[ph.type === 'building' ? 'building' : 'unit'] = { type: ph.type, ocr: ph.ocrText, time: ph.takenAt, url: await S.photoUrl(ph).catch(() => null) };
      }
    }
  }
  bar(t('tab_list'));
  const s = await S.getSettings();
  const needUnit = !!p.unit;
  const busy = ['building', 'unit'].some(k => flow[k]?.busy);
  const ready = flow.building && !flow.building.busy && (!needUnit || (flow.unit && !flow.unit.busy));

  screen.innerHTML = `
    <div class="visit-head">
      <div>
        <div class="big-addr">${esc(addrLine(p))}</div>
        <div class="muted">${esc(p.zip || '')} ${esc(p.city)}${a.due ? ' · ' + t('due', { d: fmtDate(a.due) }) : ''}</div>
      </div>
      ${p.lat != null ? `<a class="btn nav-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" ${tip('h_navigate')}>🧭</a>` : ''}
    </div>
    ${caseBox(p, s)}
    ${p.notes ? `<p class="small muted">${esc(p.notes)}</p>` : ''}

    <div class="shots">
      ${shot('building', '1', t('shot_building'), t('shot_building_hint'), p)}
      ${needUnit ? shot('unit', '2', t('shot_door'), t('shot_door_hint', { n: esc(p.unit) }), p) : ''}
    </div>
    ${needUnit && !flow.unit ? `<button class="linkbtn" id="door" ${tip('h_door')}>${t('no_number')}</button>` : ''}
    ${flow.building && needUnit && !flow.unit ? `<p class="hint-box">${t('visit_saved_hint')}</p>` : ''}

    <h3 class="sec-h">${t('outcome')}${help('h_outcome')}</h3>
    <div class="outcomes grid2">${S.OUTCOMES.map(o => `<button class="outcome ${flow.outcome === o ? 'sel' : ''}" data-o="${o}">${t('out_' + o)}</button>`).join('')}</div>

    <div class="field" style="margin-top:14px"><label>${t('note_optional')}${help('h_note')}</label>
      <textarea id="note" rows="2" maxlength="300" placeholder="${t('note_placeholder')}">${esc(flow.note || '')}</textarea></div>

    ${s.bioSig ? `<div class="field">
      <label>${t('signature')}${help('h_signature')}</label>
      <div class="sig-wrap" data-nobio>
        <canvas id="sig" class="sig-pad"></canvas>
        <span class="sig-hint ${flow.sig?.length ? 'hidden' : ''}">${t('sig_hint')}</span>
        <button type="button" class="btn btn-ghost sig-clear" id="sigClear" ${tip('h_sig_clear')}>${t('clear')}</button>
      </div></div>` : ''}

    <button class="btn btn-primary btn-lg btn-block send-btn" id="send" ${tip('h_send')} ${busy ? 'disabled' : ''}>
      ${busy ? '⏳ ' + t('photo_saving') : (ready ? '✓ ' : '') + t('send_visit')}</button>
    ${!ready && !busy ? `<p class="muted small center">${t(needUnit ? 'need_both_photos' : 'need_photo')}</p>` : ''}`;

  screen.querySelectorAll('[data-shot]').forEach(b => b.onclick = () => capture(b.dataset.shot));
  const door = $('#door'); if (door) door.onclick = () => capture('door');
  // wynik i notatka bez przerysowania ekranu (żeby nie zgubić wpisanego tekstu ani podpisu)
  screen.querySelectorAll('[data-o]').forEach(b => b.onclick = () => {
    flow.outcome = b.dataset.o;
    screen.querySelectorAll('[data-o]').forEach(x => x.classList.toggle('sel', x === b));
  });
  $('#note').oninput = e => { flow.note = e.target.value; };
  if (s.bioSig) signaturePad($('#sig'));

  $('#send').onclick = async () => {
    if (!flow.building) return toast(t('need_photo_building'));
    if (needUnit && !flow.unit) return toast(t('need_photo_door'));
    if (!flow.outcome) { $('.outcomes').scrollIntoView({ block: 'center' }); return toast(t('choose_outcome')); }
    if (s.bioSig && !flow.sig?.length) { $('#sig').scrollIntoView({ block: 'center' }); return toast(t('sig_required')); }
    const btn = $('#send'); btn.disabled = true; btn.textContent = '⏳ ' + t('sending');
    try {
      const touch = flow.touch?.features() || null;
      flow.touch?.stop();
      const res = await S.submitVisit(user, nav.visitId, { outcome: flow.outcome, note: flow.note || '', signature: flow.sig || null, touch });
      for (const k in flow) delete flow[k]; // zdjęcia znikają z pamięci aplikacji po wysłaniu
      go({ name: 'result', visitId: res.id });
    } catch (e) { btn.disabled = false; btn.textContent = t('send_visit'); toast(t(e.message)); }
  };
}

// Duży kafel zdjęcia: przed — ikona aparatu i podpowiedź, po — miniatura, godzina i wstępny odczyt
function shot(slot, num, title, hint, p) {
  const f = flow[slot];
  let status = '';
  if (f?.busy) status = `<span class="chip-s">⏳ ${esc(f.busy)}</span>`;
  else if (f) {
    let ocr = '';
    if (f.type === 'door') ocr = `<span class="chip-s warn">🚪 ${t('r_no_unit_number')}</span>`;
    else if (f.ocr) {
      const ok = slot === 'building' ? bestStreetMatch(f.ocr, p.street) >= 90 && hasNumber(f.ocr, p.building) : hasNumber(f.ocr, p.unit);
      ocr = `<span class="chip-s ${ok ? 'ok' : 'warn'}" ${tip('h_detect')}>${ok ? '✓' : '?'} ${esc(f.ocr.replace(/\s+/g, ' ').slice(0, 24))}</span>`;
    }
    status = `<span class="chip-s ok">✓ ${t('shot_done', { t: fmtTime(f.time || Date.now()) })}</span>${ocr}`;
  }
  return `
    <button class="shot ${f ? 'done' : ''}" data-shot="${slot}" ${f?.busy ? 'disabled' : ''} ${tip(slot === 'building' ? 'h_photo_b' : 'h_photo_u')}>
      <span class="shot-num">${f && !f.busy ? '✓' : num}</span>
      ${f?.url ? `<img src="${f.url}" alt="">` : `<span class="shot-ic">📷</span>`}
      <span class="shot-txt"><b>${title}</b><small>${f ? t('shot_retake') : hint}</small></span>
      <span class="shot-status">${status}</span>
    </button>`;
}

// Rodzaj sprawy z wskazówkami „co mówić” (z ustawień admina) — widoczny od razu po wejściu w adres
function caseBox(p, s) {
  const c = caseInfo(p.case_type, s.caseTypes || []);
  if (!c) return '';
  return `<details class="case-box" style="--c:${c.color}" ${c.guide ? 'open' : ''}>
    <summary><span class="case-chip" style="--c:${c.color}">${esc(c.name)}</span> <span class="small">${c.guide ? t('case_what_to_say') : ''}</span>${help('h_case_box')}</summary>
    ${c.guide ? `<div class="case-guide">${esc(c.guide).replace(/\n/g, '<br>')}</div>` : ''}
  </details>`;
}
