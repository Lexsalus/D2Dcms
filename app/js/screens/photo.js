// Ekran: zdjęcie budynku / lokalu z podglądem OCR
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, screen, user, setUser, nav, go, flow, ui, render, setRender, bar } from '../core.js';
import { bestStreetMatch, hasNumber, haversine, evaluate } from '../../../assets/js/domain/verify.js';
import { capture } from '../lib/capture.js';

// ---------- zdjęcia ----------
export async function photoScreen() {
  const a = (await S.myAssignments(user.id)).find(x => x.id === nav.assignmentId);
  const p = a.property;
  const step = nav.step; // 'building' | 'unit'
  const f = flow[step];
  bar(t('back'), step === 'unit' ? { ...nav, step: 'building' } : { name: 'detail', assignmentId: a.id });
  const isB = step === 'building';
  screen.innerHTML = `
    <div class="step-head">${t(isB ? 'step_building' : 'step_unit')}${help(isB ? 'h_photo_b' : 'h_photo_u')}</div>
    <div class="muted small" style="margin-bottom:8px">${esc(addrLine(p))}</div>
    <div class="viewfinder" id="vf">
      ${f?.url ? `<img src="${f.url}" alt="">` : `<div><div style="font-size:42px">📷</div>${t(isB ? 'hint_building' : 'hint_unit')}</div><div class="frame"></div>`}
    </div>
    <div id="det" ${tip('h_detect')}>${f ? detectHtml(step, f, p) : ''}</div>
    <div class="stack" style="margin-top:10px">
      <button class="btn ${f ? '' : 'btn-primary'} btn-lg" id="shoot" ${tip(f ? 'h_retake' : 'h_take_photo')} ${f?.busy ? 'disabled' : ''}>📷 ${f ? t('retake') : t('take_photo')}</button>
      ${f && !f.busy ? `<button class="btn btn-primary btn-lg" id="next">${t('next')} ›</button>` : ''}
      ${!isB && !f?.busy ? `<button class="linkbtn" id="door" ${tip('h_door')}>${t('no_number')}</button>${help('h_door')}` : ''}
    </div>
    <p class="muted small" style="margin-top:12px">${t('camera_note')}</p>`;
  $('#shoot').onclick = () => capture(step === 'unit' ? 'unit' : 'building');
  const door = $('#door'); if (door) door.onclick = () => capture('door');
  const nx = $('#next');
  if (nx) nx.onclick = () => go(isB && p.unit ? { ...nav, step: 'unit' } : { name: 'summary', assignmentId: a.id, visitId: nav.visitId });
}

function detectHtml(step, f, p) {
  if (f.busy) return `<div class="detect">${esc(f.busy)}</div>`;
  if (f.type === 'door') return `<div class="detect bad">🚪 ${t('r_no_unit_number')}</div>`;
  if (!f.ocr) return `<div class="detect bad">${t('not_detected')}</div>`;
  if (step === 'building') {
    const ok = bestStreetMatch(f.ocr, p.street) >= 90 && hasNumber(f.ocr, p.building);
    return `<div class="detect ${ok ? 'ok' : 'bad'}">${t('detected', { s: esc(shortOcr(f.ocr)) })} ${ok ? '✓' : '✗'}</div>`;
  }
  const ok = hasNumber(f.ocr, p.unit);
  return `<div class="detect ${ok ? 'ok' : 'bad'}">${t('detected', { s: 'nr ' + esc(shortOcr(f.ocr)) })} ${ok ? '✓' : '✗'}</div>`;
}
const shortOcr = s => s.replace(/\s+/g, ' ').trim().slice(0, 40);

