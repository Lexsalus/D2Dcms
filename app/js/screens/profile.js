// Ekran: profil (urządzenie, wersja, język, motyw, wylogowanie)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, screen, user, setUser, nav, go, flow, ui, render, setRender, bar } from '../core.js';

// ---------- profil ----------
export async function profileScreen() {
  screen.innerHTML = `
    <div class="card">
      <h2>${esc(user.name)}</h2>
      <dl class="kv" style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px">
        <dt class="muted">${t('device_id')}${help('h_device_id')}</dt><dd style="margin:0">${esc(S.deviceId())}</dd>
        <dt class="muted">${t('version')}</dt><dd style="margin:0">${versionLabel()}</dd>
      </dl>
      <div style="margin-top:14px;color:var(--text)" id="ctl"></div>
    </div>
    <button class="btn btn-lg btn-block" style="margin-top:14px" id="lo" ${tip('h_logout')}>${t('logout')}</button>`;
  mountControls($('#ctl'));
  $('#lo').onclick = () => { S.logout('rep'); go({ name: 'list' }); };
}

