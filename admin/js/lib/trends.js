// Raporty zaawansowane: trendy dzienne, godziny, powody wg handlowca
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, admin, setAdmin, flags, render, setRender, state, ROUTES, SECTION, GROUPS, groupOf, routesFor, canExport, repName, pct, periodStart, data, STATUS_FILTER, statusMatch, filters, wireFilters, localDay, reasonText, debounce } from '../core.js';

// ---------- raporty zaawansowane: trendy, godziny, powody ----------
export const PALETTE = ['#2F6FED', '#0E9F8E', '#F59E0B', '#DB2777', '#7C3AED', '#0891B2', '#64748B', '#16A34A'];
export function trendsHtml(reps, asg, latest, from) {
  const V = asg.map(a => latest.get(a.id)).filter(v => v?.submittedAt && v.submittedAt >= from && reps.some(r => r.id === v.userId));
  if (!V.length) return `<div class="card"><p class="muted">${t('no_data')}</p></div>`;
  // dni: od pierwszej wizyty w okresie (maks. 30) do dziś
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const first = new Date(Math.max(Math.min(...V.map(v => v.submittedAt)), today.getTime() - 29 * 864e5)); first.setHours(0, 0, 0, 0);
  const days = []; for (let d = new Date(first); d <= today; d.setDate(d.getDate() + 1)) days.push(localDay(d.getTime()));
  const series = reps.map((r, i) => ({ name: r.name, c: PALETTE[i % PALETTE.length], vals: days.map(d => V.filter(v => v.userId === r.id && localDay(v.submittedAt) === d).length) }))
    .filter(x => x.vals.some(Boolean));
  const maxY = Math.max(1, ...series.flatMap(x => x.vals));
  const W = 1000, H = 240, L0 = 34, B0 = 26, T0 = 10, R0 = 10;
  const X = i => L0 + (days.length === 1 ? (W - L0 - R0) / 2 : i * (W - L0 - R0) / (days.length - 1));
  const Y = v => H - B0 - v / maxY * (H - B0 - T0);
  const ticks = [...new Set([0, Math.ceil(maxY / 2), maxY])];
  const step = Math.ceil(days.length / 8);
  const line = `<svg viewBox="0 0 ${W} ${H}" class="chart">
    ${ticks.map(v => `<line x1="${L0}" x2="${W - R0}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L0 - 6}" y="${Y(v) + 4}" text-anchor="end" class="ax">${v}</text>`).join('')}
    ${days.map((d, i) => i % step ? '' : `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="ax">${d.slice(8)}.${d.slice(5, 7)}</text>`).join('')}
    ${series.map(x => `<polyline fill="none" stroke="${x.c}" stroke-width="2.5" stroke-linejoin="round" points="${x.vals.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}"/>
      ${x.vals.map((v, i) => v ? `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="${x.c}"><title>${esc(x.name)} · ${days[i]}: ${v}</title></circle>` : '').join('')}`).join('')}
  </svg>
  <ul class="legend inline">${series.map(x => `<li><i style="background:${x.c}"></i>${esc(x.name)}</li>`).join('')}</ul>`;
  // godziny wysyłki wizyt
  const hours = Array.from({ length: 24 }, (_, h) => V.filter(v => new Date(v.submittedAt).getHours() === h).length);
  const h0 = Math.max(0, Math.min(6, hours.findIndex(Boolean))), h1 = Math.max(20, 23 - [...hours].reverse().findIndex(Boolean));
  const HH = hours.slice(h0, h1 + 1), maxH = Math.max(1, ...HH);
  const bw = (W - L0 - R0) / HH.length;
  const bars = `<svg viewBox="0 0 ${W} 180" class="chart">
    ${HH.map((v, i) => `<rect x="${L0 + i * bw + 3}" y="${154 - v / maxH * 140}" width="${bw - 6}" height="${v / maxH * 140}" rx="3" fill="#7C3AED" opacity="${v ? .85 : .15}"><title>${h0 + i}:00 — ${v}</title></rect>
      <text x="${L0 + i * bw + bw / 2}" y="172" text-anchor="middle" class="ax">${h0 + i}</text>${v ? `<text x="${L0 + i * bw + bw / 2}" y="${150 - v / maxH * 140}" text-anchor="middle" class="ax">${v}</text>` : ''}`).join('')}
  </svg>`;
  // powody oznaczeń wg handlowca (grupy)
  const gk = Object.keys(GROUPS);
  const flagged = reps.map(r => {
    const RV = V.filter(v => v.userId === r.id);
    const cnt = Object.fromEntries(gk.map(g => [g, RV.filter(v => (v.reasons || []).some(x => groupOf(x.code) === g)).length]));
    return { name: r.name, n: RV.length, cnt };
  });
  const table = `<table><thead><tr><th>${t('col_rep')}</th><th>${t('kpi_submitted')}</th>${gk.map(g => `<th><span class="chip" style="--c:${GROUPS[g].c}">${t('grp_' + g)}</span></th>`).join('')}</tr></thead>
    <tbody>${flagged.map(f => `<tr><td><b>${esc(f.name)}</b></td><td>${f.n}</td>${gk.map(g => `<td>${f.cnt[g] ? `<b style="color:${GROUPS[g].c}">${f.cnt[g]}</b> <span class="muted small">(${pct(f.cnt[g], f.n)}%)</span>` : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `
    <div class="card"><h3>${t('tr_daily')}${help('h_tr_daily')}</h3>${line}</div>
    <div class="grid-2 mt">
      <div class="card"><h3>${t('tr_hours')}${help('h_tr_hours')}</h3>${bars}</div>
      <div class="card" style="overflow:auto"><h3>${t('tr_reasons')}${help('h_tr_reasons')}</h3>${table}</div>
    </div>`;
}

