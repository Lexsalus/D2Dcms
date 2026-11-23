// Import adresów: CSV / XLSX / JSON, geokodowanie
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, admin, setAdmin, flags, render, setRender, state, ROUTES, SECTION, GROUPS, groupOf, routesFor, canExport, repName, pct, periodStart, data, STATUS_FILTER, statusMatch, filters, wireFilters, localDay, reasonText, debounce } from '../core.js';

export const cleanStreet = s => String(s || '').trim().replace(/^(ul\.?|ulica|al\.?|aleja)\s+/i, '');

// ---------- import CSV / XLSX ----------
const HEAD = {
  street: ['ulica', 'street', 'вулиця', 'adres', 'address'],
  building: ['nr_budynku', 'nr budynku', 'budynek', 'building', 'building_no', 'numer', 'nr', 'номер будинку'],
  unit: ['nr_lokalu', 'nr lokalu', 'lokal', 'mieszkanie', 'unit', 'unit_no', 'flat', 'квартира', 'номер квартири'],
  zip: ['kod', 'kod_pocztowy', 'kod pocztowy', 'zip', 'postcode', 'postal_code', 'індекс'],
  city: ['miasto', 'miejscowosc', 'miejscowość', 'city', 'town', 'місто'],
  notes: ['uwagi', 'notes', 'note', 'opis', 'примітки'],
  lat: ['lat', 'latitude', 'szerokosc'],
  lng: ['lng', 'lon', 'long', 'longitude', 'dlugosc'],
  external_id: ['external_id', 'id_crm', 'crm_id', 'externalid'],
};
export function mapHeaders(headers) {
  const idx = {};
  headers.forEach((h, i) => {
    const k = String(h).trim().toLowerCase();
    for (const f in HEAD) if (HEAD[f].includes(k) && idx[f] === undefined) idx[f] = i;
  });
  return idx;
}
export function parseCSV(text) {
  const first = text.split(/\r?\n/)[0];
  const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim()));
}
export async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return window.XLSX;
}
export async function importFile(file) {
  if (!file) return;
  let table;
  if (/\.json$/i.test(file.name)) {
    // format wymiany CRM: tablica adresów albo obiekt { properties: [...] } (docs/INTEGRACJA.md)
    try {
      const j = JSON.parse(await file.text());
      const arr = Array.isArray(j) ? j : (j.properties || []);
      table = [Object.keys(arr[0] || {}), ...arr.map(o => Object.keys(arr[0] || {}).map(k => o[k]))];
    } catch { return toast(t('bad_json')); }
  } else if (/\.xlsx?$/i.test(file.name)) {
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer());
    table = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
  } else {
    table = parseCSV(await file.text());
  }
  if (!table.length) return toast(t('no_data'));
  const idx = mapHeaders(table[0]);
  const get = (r, f) => idx[f] === undefined ? '' : String(r[idx[f]] ?? '').trim();
  const rows = table.slice(1).map(r => ({
    street: cleanStreet(get(r, 'street')), building: get(r, 'building'), unit: get(r, 'unit'),
    zip: get(r, 'zip'), city: get(r, 'city'), notes: get(r, 'notes'), external_id: get(r, 'external_id') || null,
    lat: get(r, 'lat') ? parseFloat(get(r, 'lat').replace(',', '.')) : null,
    lng: get(r, 'lng') ? parseFloat(get(r, 'lng').replace(',', '.')) : null,
  }));
  const res = await S.importProperties(admin, rows);
  toast(t('import_result', { a: res.added, b: res.dup, c: res.err }));
  render();
  // geokodowanie brakujących
  const missing = (await S.listProperties()).filter(p => p.lat == null);
  if (missing.length && confirm(t('geocode_on_import') + ` (${missing.length})`)) {
    for (let i = 0; i < missing.length; i++) {
      toast(t('geocoding', { a: i + 1, b: missing.length }));
      const g = await geocode(missing[i]);
      if (g) await S.updateProperty(missing[i].id, g);
      await new Promise(r => setTimeout(r, 1100)); // limit Nominatim: 1 zapytanie/s
    }
    render();
  }
}
export async function geocode(p) {
  try {
    const q = new URLSearchParams({ format: 'json', limit: '1', street: `${p.building} ${p.street}`, city: p.city, postalcode: p.zip || '', country: 'Poland' });
    const r = await fetch('https://nominatim.openstreetmap.org/search?' + q, { headers: { 'Accept-Language': 'pl' } });
    const j = await r.json();
    return j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
  } catch { return null; }
}

