// Panel administratora FieldCheck — start, logowanie i nawigacja
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../assets/js/core/ui.js';
import S from '../../assets/js/data/data.js';
import { $, admin, setAdmin, flags, setRender, state, SECTION, routesFor } from './core.js';
import { accountModal, mfaEnrollModal } from './lib/account.js';
import { paintBell } from './lib/notifications.js';
import { dashboard } from './views/dashboard.js';
import { properties } from './views/properties.js';
import { review } from './views/review.js';
import { reps } from './views/reps.js';
import { reports } from './views/reports.js';
import { settings } from './views/settings.js';

// ---------- start ----------
function boot() {
  document.querySelectorAll('.version-text').forEach(el => el.textContent = versionLabel());
  mountControls($('.login-controls'));
  mountControls($('.side-controls'));
  applyDom();
  onLangChange(() => { document.querySelectorAll('.version-text').forEach(el => el.textContent = versionLabel()); render(); });
  document.addEventListener('fc-theme', () => { if (currentRoute() === 'dashboard') render(); });
  window.addEventListener('hashchange', render);
  S.onChange(render);
  let mfaPending = false;
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const err = $('#loginErr'); err.classList.add('hidden');
    try {
      setAdmin(mfaPending ? await S.mfaLogin(f.get('code')) : await S.loginAdmin(f.get('email'), f.get('password')));
      mfaPending = false; $('#mfaStep').classList.add('hidden');
      render();
    } catch (ex) {
      if (ex.message === 'mfa_required') { mfaPending = true; $('#mfaStep').classList.remove('hidden'); $('[name=code]').required = true; $('[name=code]').focus(); return; }
      err.textContent = t(ex.message); err.classList.remove('hidden');
    }
  };
  $('#forgotLink').onclick = async e => {
    e.preventDefault();
    const email = $('#loginForm [name=email]').value.trim();
    if (!email) return toast(t('enter_email_first'));
    try { await S.resetPassword(email); toast(t('reset_sent')); } catch (ex) { toast(ex.message); }
  };
  $('#pwForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target), err = $('#pwErr');
    if (f.get('pw') !== f.get('pw2')) { err.textContent = t('passwords_differ'); err.classList.remove('hidden'); return; }
    try { await S.setPassword(f.get('pw')); flags.pwDone = true; toast(t('password_saved')); render(); }
    catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
  };
  $('#who').onclick = accountModal;
  $('#logoutBtn').onclick = () => { S.logout('admin'); setAdmin(null); render(); };
  // aktywność przedłuża sesję; co 30 s sprawdzamy, czy nie wygasła
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => S.touchSession('admin'), true));
  setInterval(() => { if (admin && !S.currentUser('admin')) render(); else if (admin) paintBell(); }, 30000);
  $('#bell').onclick = e => { e.stopPropagation(); $('#bellPanel').classList.toggle('hidden'); paintBell(); };
  document.addEventListener('click', e => { if (!e.target.closest('.bell-wrap')) $('#bellPanel').classList.add('hidden'); });
  render();
}

// Manager: tylko pulpit, weryfikacja i raporty swojego zespołu
function currentRoute() {
  const r = location.hash.replace('#/', '');
  return routesFor(admin).includes(r) ? r : 'dashboard';
}

async function render() {
  // link z zaproszenia lub resetu hasła → najpierw ustawienie hasła
  const needPw = S.authLink && !flags.pwDone;
  $('#pwSet').classList.toggle('hidden', !needPw);
  if (needPw) { $('#login').classList.add('hidden'); $('#shell').classList.add('hidden'); applyDom($('#pwSet')); return; }
  setAdmin(S.currentUser('admin'));
  $('#login').classList.toggle('hidden', !!admin);
  $('#shell').classList.toggle('hidden', !admin);
  if (!admin) {
    $('#expiredMsg').classList.toggle('hidden', !S.sessionExpired.admin);
    $('#demoCreds').textContent = S.DEMO_ADMIN ? t('demo_creds', { creds: `admin: ${S.DEMO_ADMIN.email} · manager: ${S.DEMO_MANAGER.email} · ${S.DEMO_ADMIN.password}` }) : '';
    $('#forgotLink').classList.toggle('hidden', S.MODE !== 'supabase');
    if (S.authLinkError) { $('#loginErr').textContent = S.authLinkError; $('#loginErr').classList.remove('hidden'); }
    applyDom($('#login'));
    return;
  }
  applyDom();
  S.sessionExpired.admin = false;
  $('#who').innerHTML = `👤 ${esc(admin.name)}${S.isAdmin(admin) ? '' : ` <span class="role-badge" ${tip('h_manager_role')}>${t('role_manager')}</span>`}`;
  // wymagane 2FA, a konto go nie ma → obowiązkowe włączenie
  if (S.MODE === 'supabase' && !flags.forcing2fa) {
    const st = await S.getSettings();
    if (st.require2fa) { const m = await S.mfaStatus(); if (!m.enabled) { flags.forcing2fa = true; mfaEnrollModal(true); } }
  }
  if (!flags.purged) { flags.purged = true; S.purgeOldPhotos(admin).then(n => n && toast(t('retention_done', { n }))); }
  paintBell();
  const route = currentRoute();
  const assignments = (await S.listAssignments()).filter(a => S.inScope(admin, a.userId));
  const toReview = assignments.filter(a => a.status === 'TO_REVIEW').length;
  $('#nav').innerHTML = routesFor(admin).map(r => `
    <a href="#/${r}" class="${r === route ? 'active' : ''}" style="--c:${SECTION[r].c}" ${tip('h_nav_' + r)}>
      <span><i class="nav-ic">${SECTION[r].i}</i>${t('nav_' + r)}</span>${r === 'review' && toReview ? `<span class="count">${toReview}</span>` : ''}
    </a>`).join('');
  $('#shell').style.setProperty('--accent', SECTION[route].c);
  $('#pageIc').textContent = SECTION[route].i;
  const view = $('#view');
  ({ dashboard, properties, review, reps, reports, settings })[route](view);
}


setRender(render);
boot();
