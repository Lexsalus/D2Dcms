// Eksport CSV / XLSX / PDF i ZIP zdjęć (tylko admin, z audytem)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, admin, setAdmin, flags, render, setRender, state, ROUTES, SECTION, GROUPS, groupOf, routesFor, canExport, repName, pct, periodStart, data, STATUS_FILTER, statusMatch, filters, wireFilters, localDay, reasonText, debounce } from '../core.js';
import { loadXLSX } from './import.js';

// ---------- eksport CSV / XLSX / PDF i ZIP zdjęć ----------
export const expButtons = id => `<span class="exp" id="${id}" ${tip('h_export')}>⬇ <button type="button" data-fmt="csv">CSV</button><button type="button" data-fmt="xlsx">XLSX</button><button type="button" data-fmt="pdf">PDF</button></span>`;
export function wireExport(id, name, title, getData) {
  document.getElementById(id)?.querySelectorAll('[data-fmt]').forEach(b => b.onclick = async () => {
    const { head, rows } = getData();
    await exportTable(name, title, head, rows, b.dataset.fmt);
  });
}
export async function exportTable(name, title, head, rows, fmt) {
  const file = `fieldcheck_${name}_${new Date().toISOString().slice(0, 10)}`;
  if (fmt === 'csv') {
    download(file + '.csv', '\uFEFF' + [head, ...rows].map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv');
  } else if (fmt === 'xlsx') {
    const X = await loadXLSX();
    const ws = X.utils.aoa_to_sheet([head, ...rows]);
    ws['!cols'] = head.map((h, i) => ({ wch: Math.min(40, Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length)) + 2) }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, title.slice(0, 31));
    X.writeFile(wb, file + '.xlsx');
  } else {
    // PDF: widok do druku — w oknie drukowania wybierz „Zapisz jako PDF”
    const w = window.open('', '_blank');
    if (!w) return toast(t('popup_blocked'));
    w.document.write(`<!DOCTYPE html><html lang="${document.documentElement.lang}"><head><meta charset="utf-8"><title>${esc(file)}</title>
      <style>body{font:12px Inter,Arial,sans-serif;color:#0F172A;margin:24px}h1{font-size:18px;margin:0 0 4px}p{color:#64748B;margin:0 0 14px}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #CBD5E1;padding:5px 7px;text-align:left}th{background:#12263F;color:#fff}
      tr:nth-child(even) td{background:#F3F5F9}@page{size:A4 landscape;margin:12mm}</style></head><body>
      <h1>FieldCheck — ${esc(title)}</h1><p>${esc(fmtDateTime(Date.now()))} · ${esc(versionLabel())}</p>
      <table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }
  await S.logEvent(admin, 'export', `${name} ${fmt.toUpperCase()}`);
}

export async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return window.JSZip;
}
// ZIP zdjęć wybranych wizyt + plik wizyty.csv z opisem; zapis w audycie
export async function zipPhotos(visits, name) {
  if (!visits.length) return toast(t('no_data'));
  let Z;
  try { Z = await loadJSZip(); } catch { return toast(t('lib_failed')); }
  const zip = new Z();
  const safe = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^\w.-]+/g, '_');
  const manifest = [['plik', t('col_address'), t('col_rep'), t('visit'), t('col_status'), t('outcome'), 'OCR', 'GPS m']];
  let n = 0;
  for (const v of visits) {
    const p = S.getProperty(v.propertyId);
    for (const ph of S.visitPhotos(v.id)) {
      const url = await S.photoUrl(ph); if (!url) continue;
      const fname = `${safe(p.street)}_${safe(p.building)}${p.unit ? '-' + safe(p.unit) : ''}_${safe(repName(v.userId))}_${ph.type}.jpg`;
      zip.file(fname, url.split(',')[1], { base64: true });
      manifest.push([fname, addrLine(p), repName(v.userId), new Date(v.submittedAt).toISOString(), t('st_' + v.status), v.outcome ? t('out_' + v.outcome) : '', ph.ocrText || '', v.details?.distance ?? '']);
      n++;
    }
  }
  zip.file('wizyty.csv', '\uFEFF' + manifest.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  download(`fieldcheck_zdjecia_${name}_${new Date().toISOString().slice(0, 10)}.zip`, await zip.generateAsync({ type: 'blob' }));
  await S.logEvent(admin, 'photo_zip', `${name}: ${n} zdjęć / ${visits.length} wizyt`);
  toast(t('download_logged'));
}

