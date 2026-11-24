// Rodzaje spraw (np. egzekucja, kredyt, ponaglenie, korespondencja) — przychodzą w imporcie z Excela,
// a w ustawieniach admin nadaje im kolor i wskazówki dla handlowca („co mówić”). Lista: settings.caseTypes = [{name, color, guide}].

export const CASE_PALETTE = ['#DC2626', '#2F6FED', '#F59E0B', '#0E9F8E', '#7C3AED', '#DB2777', '#0891B2', '#64748B', '#16A34A', '#9333EA'];

export const caseKey = s => String(s || '').trim().toLowerCase();

// Opis rodzaju sprawy z ustawień (albo domyślny kolor, gdy jeszcze go nie skonfigurowano)
export function caseInfo(name, list = []) {
  if (!caseKey(name)) return null;
  const hit = list.find(c => caseKey(c.name) === caseKey(name));
  if (hit) return hit;
  let h = 0; for (const ch of caseKey(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { name: String(name).trim(), color: CASE_PALETTE[h % CASE_PALETTE.length], guide: '' };
}

// Dopisuje do listy rodzaje spraw, których jeszcze nie ma (np. po imporcie); zwraca null, gdy nic nie doszło
export function mergeCaseTypes(list = [], names = []) {
  const out = list.slice();
  for (const n of names) {
    if (!caseKey(n) || out.some(c => caseKey(c.name) === caseKey(n))) continue;
    out.push({ name: String(n).trim(), color: CASE_PALETTE[out.length % CASE_PALETTE.length], guide: '' });
  }
  return out.length === list.length ? null : out;
}

// Kolorowa etykieta rodzaju sprawy (HTML); esc — funkcja escapująca z ui.js
export function caseChip(name, list, esc, extra = '') {
  const c = caseInfo(name, list);
  if (!c) return '';
  return `<span class="case-chip" style="--c:${c.color}" ${extra}>${esc(c.name)}</span>`;
}
