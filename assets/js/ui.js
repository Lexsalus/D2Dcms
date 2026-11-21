// Wspólne elementy UI: motyw dzień/noc, przełącznik języka, toast, modal, escapowanie.
import { LANGS, getLang, setLang, t, onLangChange } from './i18n.js';
import { VERSION } from './version.js';
import './help.js';

const THEME_KEY = 'fc.theme';

export function getTheme() {
  return localStorage.getItem(THEME_KEY) ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
export function setTheme(th) {
  localStorage.setItem(THEME_KEY, th);
  document.documentElement.dataset.theme = th;
  document.dispatchEvent(new CustomEvent('fc-theme', { detail: th }));
}
document.documentElement.dataset.theme = getTheme();

// Wstawia <select> języka i przycisk motywu do kontenera
export function mountControls(container) {
  container.classList.add('controls');
  container.innerHTML = `
    <select aria-label="Language" data-role="lang" data-tip="${esc(t('h_lang'))}">
      ${LANGS.map(l => `<option value="${l.code}">${l.label}</option>`).join('')}
    </select>
    <button type="button" data-role="theme"></button>`;
  const sel = container.querySelector('[data-role=lang]');
  const btn = container.querySelector('[data-role=theme]');
  sel.value = getLang();
  sel.onchange = () => setLang(sel.value);
  const paint = () => {
    const dark = getTheme() === 'dark';
    btn.textContent = dark ? '☀ ' + t('theme_day') : '☾ ' + t('theme_night');
    btn.dataset.tip = t('h_theme');
    container.querySelector('[data-role=lang]').dataset.tip = t('h_lang');
  };
  btn.onclick = () => { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); paint(); };
  onLangChange(() => { sel.value = getLang(); paint(); });
  paint();
}

export function versionLabel() { return `${t('version')} ${VERSION}`; }

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Prosty modal; zwraca element .modal i funkcję close
export function modal(html) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal card">${html}</div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });
  return { el: back.querySelector('.modal'), close };
}

export function badge(status) {
  return `<span class="badge st-${status}">${esc(t('st_' + status))}</span>`;
}

export function addrLine(p) {
  return `ul. ${p.street} ${p.building}${p.unit ? '/' + p.unit : ''}`;
}

export function download(filename, content, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- podpowiedzi ----------
// tip('h_key') → atrybut data-tip do wstawienia w znacznik; help('h_key') → ikonka [?]
export const tip = key => `data-tip="${esc(t(key))}"`;
export const help = key => `<span class="help" tabindex="0" role="button" aria-label="?" data-tip="${esc(t(key))}">?</span>`;

// Jeden pływający dymek dla wszystkich [data-tip]: hover/focus na desktopie, dotknięcie [?] na telefonie
(function initTooltips() {
  let box, cur;
  const show = el => {
    const txt = el.dataset.tip; if (!txt) return;
    box ??= Object.assign(document.createElement('div'), { id: 'tip', role: 'tooltip' });
    if (!box.isConnected) document.body.appendChild(box);
    box.textContent = txt; box.classList.add('show'); cur = el;
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    let x = r.left + r.width / 2 - b.width / 2;
    x = Math.max(8, Math.min(x, innerWidth - b.width - 8));
    let y = r.bottom + 8;
    if (y + b.height > innerHeight - 8) y = r.top - b.height - 8;
    box.style.left = x + 'px'; box.style.top = Math.max(8, y) + 'px';
  };
  const hide = () => { box?.classList.remove('show'); cur = null; };
  const target = e => e.target.closest?.('[data-tip]');
  document.addEventListener('mouseover', e => { const el = target(e); if (el && el !== cur) show(el); else if (!el && cur) hide(); });
  document.addEventListener('focusin', e => { const el = target(e); if (el) show(el); });
  document.addEventListener('focusout', hide);
  document.addEventListener('click', e => {
    const el = e.target.closest?.('.help');
    if (el) { e.preventDefault(); e.stopPropagation(); cur === el ? hide() : show(el); }
    else if (cur?.classList.contains('help')) hide();
  }, true);
  addEventListener('scroll', hide, true);
})();
