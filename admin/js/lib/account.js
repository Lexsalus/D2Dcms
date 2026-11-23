// Moje konto: zmiana hasła i 2FA
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, admin, setAdmin, flags, render, setRender, state, ROUTES, SECTION, GROUPS, groupOf, routesFor, canExport, repName, pct, periodStart, data, STATUS_FILTER, statusMatch, filters, wireFilters, localDay, reasonText, debounce } from '../core.js';

// ---------- moje konto: hasło i 2FA ----------
export async function accountModal() {
  const sbMode = S.MODE === 'supabase';
  const mfa = sbMode ? await S.mfaStatus() : { enabled: false };
  const m = modal(`
    <h2>${t('my_account')}</h2>
    <dl class="kv"><dt>${t('name')}</dt><dd>${esc(admin.name)}</dd><dt>${t('email')}</dt><dd>${esc(admin.email || '')}</dd>
      <dt>${t('role')}</dt><dd>${t(S.isAdmin(admin) ? 'role_admin' : 'role_manager')}</dd></dl>
    ${sbMode ? `
      <h3 class="mt">${t('change_password')}</h3>
      <form id="cpForm" class="toolbar" style="margin:0">
        <input type="password" name="pw" minlength="8" required placeholder="${t('new_password')}" autocomplete="new-password" style="flex:1">
        <button class="btn">${t('save')}</button>
      </form>
      <h3 class="mt">${t('twofa')}${help('h_twofa')}</h3>
      <p>${mfa.enabled ? `<span class="ok">● ${t('twofa_on')}</span>` : `<span class="muted">● ${t('twofa_off')}</span>`}</p>
      <div class="toolbar" style="margin:0">
        ${mfa.enabled ? `<button class="btn btn-danger" id="mfaOff" ${tip('h_twofa_off')}>${t('twofa_disable')}</button>` : `<button class="btn btn-primary" id="mfaOn" ${tip('h_twofa_on')}>${t('twofa_enable')}</button>`}
      </div>` : `<p class="muted small">${t('demo_account_note')}</p>`}
    <div class="toolbar mt" style="justify-content:flex-end;margin-bottom:0"><button class="btn" data-x>${t('close')}</button></div>`);
  $('[data-x]', m.el).onclick = m.close;
  const cp = $('#cpForm', m.el);
  if (cp) cp.onsubmit = async e => { e.preventDefault(); try { await S.setPassword(new FormData(cp).get('pw')); toast(t('password_saved')); cp.reset(); } catch (ex) { toast(ex.message); } };
  const on = $('#mfaOn', m.el); if (on) on.onclick = () => { m.close(); mfaEnrollModal(false); };
  const off = $('#mfaOff', m.el);
  if (off) off.onclick = async () => {
    const st = await S.getSettings();
    if (st.require2fa) return toast(t('twofa_required_cant_off'));
    if (!confirm(t('twofa_off_confirm'))) return;
    try { await S.mfaDisable(); toast(t('twofa_off')); m.close(); } catch (ex) { toast(ex.message); }
  };
}
export async function mfaEnrollModal(forced) {
  let en;
  try { en = await S.mfaEnroll(); } catch (ex) { return toast(ex.message); }
  const m = modal(`
    <h2>${t('twofa_enable')}</h2>
    ${forced ? `<p class="warn small">${t('twofa_forced')}</p>` : ''}
    <ol class="small"><li>${t('twofa_step1')}</li><li>${t('twofa_step2')}</li></ol>
    <div style="text-align:center;background:#fff;border-radius:8px;padding:10px"><img src="${en.qr}" alt="QR" style="width:200px;height:200px"></div>
    <p class="small muted">${t('twofa_secret')}: <code>${esc(en.secret)}</code></p>
    <form id="mfaForm" class="toolbar" style="margin:0">
      <input name="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required placeholder="123456" autocomplete="one-time-code" style="flex:1">
      <button class="btn btn-primary">${t('twofa_confirm')}</button>
    </form>
    ${forced ? '' : `<div class="toolbar mt" style="justify-content:flex-end;margin-bottom:0"><button class="btn" data-x>${t('cancel')}</button></div>`}`, { sticky: forced });
  const x = $('[data-x]', m.el); if (x) x.onclick = m.close;
  $('#mfaForm', m.el).onsubmit = async e => {
    e.preventDefault();
    try { await S.mfaConfirm(en.factorId, new FormData(e.target).get('code')); toast(t('twofa_on')); m.close(); flags.forcing2fa = false; await S.refresh(); render(); }
    catch (ex) { toast(t(ex.message)); }
  };
}

