// Ekran: logowanie handlowca
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, screen, user, setUser, nav, go, flow, ui, render, setRender, bar } from '../core.js';

// ---------- logowanie ----------
export async function loginScreen() {
  const sbMode = S.MODE === 'supabase';
  const reps = sbMode ? [] : (await S.listReps()).filter(r => r.active);
  screen.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px"><div id="ctl"></div></div>
    ${S.sessionExpired.rep ? `<p class="warn small">${t('session_expired')}</p>` : ''}
    <div class="card">
      <h2>${t('login_rep_title')}</h2>
      <form id="lf">
        ${sbMode ? `
        <div class="field"><label>${t('email')}</label><input name="rep" type="email" required autocomplete="username" value="${esc(localStorage.getItem('fc.lastEmail') || '')}"></div>
        <div class="field"><label>${t('password')}${help('h_app_password')}</label><input name="pin" type="password" required autocomplete="current-password"></div>` : `
        <div class="field"><label>${t('choose_rep')}</label>
          <select name="rep" required>${reps.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>
        <div class="field"><label>${t('pin')}${help('h_app_pin')}</label><input name="pin" type="password" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></div>`}
        <p class="bad small hidden" id="err"></p>
        <button class="btn btn-primary btn-block btn-lg">${t('login')}</button>
      </form>
      ${sbMode ? '' : `<p class="muted small">${t('demo_creds', { creds: 'PIN ' + S.DEMO_PIN })}</p>`}
    </div>
    <p class="muted small" style="text-align:center;margin-top:14px">${sbMode ? '' : t('prototype_note') + '<br>'}${versionLabel()}</p>`;
  mountControls($('#ctl'));
  $('#ctl').style.color = 'var(--text)';
  // rytm PIN-u: czas pojawienia się każdej cyfry (klawiatura ekranowa nie daje czasu przytrzymania)
  let pinTimes = [];
  $('[name=pin]').addEventListener('input', e => {
    const n = e.target.value.length;
    if (n === pinTimes.length + 1) pinTimes.push(e.timeStamp);
    else pinTimes = pinTimes.slice(0, n); // kasowanie / wklejenie
    if (n === 0) pinTimes = [];
  });
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const times = pinTimes.length === String(f.get('pin')).length ? pinTimes : [];
    try {
      if (sbMode) localStorage.setItem('fc.lastEmail', f.get('rep'));
      await S.loginRep(f.get('rep'), f.get('pin'), times); go({ name: 'list' });
    }
    catch (err) { const el = $('#err'); el.textContent = t(err.message); el.classList.remove('hidden'); }
  };
}

