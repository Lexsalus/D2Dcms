// Aplikacja handlowca — wspólny stan, nawigacja i pasek górny
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../assets/js/core/ui.js';
import S from '../../assets/js/data/data.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const screen = $('#screen');
// zalogowany handlowiec (wiązanie „na żywo”)
export let user = null;
export function setUser(u) { user = u; }
// stan nawigacji: {name, assignmentId?, visitId?, step?}
export let nav = { name: 'list' };
// dane bieżącej wizyty w UI: {building:{url,ocr}, unit:{...}, outcome, note, sig, touch}
export const flow = {};
export const ui = { listTab: 'todo' };
export let render = async () => {};
export function setRender(fn) { render = fn; }
export function go(n) { nav = n; window.scrollTo(0, 0); render(); }

export function bar(title, backTo) {
  $('#barTitle').innerHTML = title ? `<button class="back">‹ ${esc(title)}</button>` : 'Field<b>Check</b>';
  if (title) $('#barTitle .back').onclick = () => go(backTo || { name: 'list' });
  $('#barRight').textContent = fmtTime(Date.now());
}

