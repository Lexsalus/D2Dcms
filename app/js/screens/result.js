// Ekran: wynik kontroli po wysłaniu
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, screen, user, setUser, nav, go, flow, ui, render, setRender, bar } from '../core.js';

export async function resultScreen() {
  const v = S.getVisit(nav.visitId);
  const ok = v.status === 'AUTO_VERIFIED';
  screen.innerHTML = `
    <div class="card" style="text-align:center">
      <div class="result-icon">${ok ? '✅' : '🕵️'}</div>
      <h2>${t('visit_sent')}</h2>
      <p>${t('status_after', { s: '' })} ${badge(v.status)}</p>
      ${!ok && v.reasons?.length ? `<p class="muted small">${v.reasons.map(r => t(r.code, r.n !== undefined ? { n: r.n } : undefined)).join(' · ')}</p>` : ''}
    </div>
    <button class="btn btn-primary btn-lg btn-block" style="margin-top:14px" id="back">${t('back_to_list')}</button>`;
  $('#back').onclick = () => go({ name: 'list' });
}

