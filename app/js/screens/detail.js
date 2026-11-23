// Ekran: szczegóły adresu, start wizyty
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, screen, user, setUser, nav, go, flow, ui, render, setRender, bar } from '../core.js';
import { touchRecorder } from '../../../assets/js/domain/biometrics.js';

// ---------- szczegóły adresu ----------
export async function detailScreen() {
  const a = (await S.myAssignments(user.id)).find(x => x.id === nav.assignmentId);
  if (!a) return go({ name: 'list' });
  bar(t('tab_list'));
  const p = a.property;
  const canVisit = ['ASSIGNED', 'IN_PROGRESS'].includes(a.status);
  const open = a.visit && !a.visit.submittedAt;
  screen.innerHTML = `
    <div class="card">
      <div class="big-addr">${esc(addrLine(p))}</div>
      <div class="muted">${esc(p.zip)} ${esc(p.city)}</div>
      <p>${badge(a.status)} ${a.due ? `<span class="muted"> · ${t('due', { d: fmtDate(a.due) })}</span>` : ''}</p>
      ${p.notes ? `<p class="small">${esc(p.notes)}</p>` : ''}
      ${a.visit?.submittedAt ? `<p class="muted small">${t('visit_sent')}: ${fmtDateTime(a.visit.submittedAt)}</p>` : ''}
    </div>
    <div class="stack" style="margin-top:14px">
      ${canVisit ? `<button class="btn btn-primary btn-lg" id="start" ${tip('h_start')}>${open ? t('continue_visit') : t('start_visit')}</button>` : ''}
      ${p.lat != null ? `<a class="btn btn-lg" ${tip('h_navigate')} target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}">🧭 ${t('navigate')}</a>` : ''}
    </div>`;
  const st = $('#start');
  if (st) st.onclick = async () => {
    const v = await S.startVisit(user, a.id);
    flow.touch?.stop();
    for (const k in flow) delete flow[k];
    flow.touch = touchRecorder(); // dynamika dotyku w trakcie wizyty
    // przy kontynuacji odtwórz zrobione zdjęcia
    for (const ph of S.visitPhotos(v.id)) {
      const slot = ph.type === 'building' ? 'building' : 'unit';
      flow[slot] = { url: await S.photoUrl(ph), ocr: ph.ocrText, type: ph.type };
    }
    go({ name: 'photo', step: flow.building && p.unit ? 'unit' : 'building', assignmentId: a.id, visitId: v.id });
  };
}

