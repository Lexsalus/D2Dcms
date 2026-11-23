// Widok: Pulpit (KPI, wykresy, mapa, trasa handlowca)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, modal, badge, addrLine, download, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, admin, setAdmin, flags, render, setRender, state, ROUTES, SECTION, GROUPS, groupOf, routesFor, canExport, repName, pct, periodStart, data, STATUS_FILTER, statusMatch, filters, wireFilters, localDay, reasonText, debounce } from '../core.js';
import { routeLength, km } from '../../../assets/js/domain/route.js';
import { visitModal } from './review.js';

// ---------- PULPIT ----------
export async function dashboard(view) {
  $('#pageTitle').textContent = `${t('dash_title')} — ${t('period_' + state.period).toLowerCase()}`;
  const { asg, reps, latest } = await data();
  const from = periodStart(state.period);
  const A = asg.filter(a => (!state.rep || a.userId === state.rep) && statusMatch(a));
  const V = A.map(a => latest.get(a.id)).filter(v => v && v.submittedAt && v.submittedAt >= from);
  const submitted = V.length;
  const auto = V.filter(v => v.status === 'AUTO_VERIFIED').length;
  const review = A.filter(a => a.status === 'TO_REVIEW').length;
  const activeReps = reps.filter(r => r.active && (!state.rep || r.id === state.rep));

  const cat = { auto: 0, manual: 0, review: 0, rejected: 0, todo: 0 };
  for (const a of A) {
    if (a.status === 'AUTO_VERIFIED') cat.auto++;
    else if (a.status === 'APPROVED') cat.manual++;
    else if (a.status === 'TO_REVIEW' || a.status === 'SUBMITTED') cat.review++;
    else if (a.status === 'REJECTED') cat.rejected++;
    else cat.todo++;
  }
  const colors = { auto: 'var(--green)', manual: 'var(--teal)', review: 'var(--amber)', rejected: 'var(--red)', todo: 'var(--gray)' };
  const labels = { auto: t('st_AUTO_VERIFIED'), manual: t('st_APPROVED'), review: t('st_TO_REVIEW'), rejected: t('st_REJECTED'), todo: t('todo') };

  const byRep = activeReps.map(r => {
    const ra = A.filter(a => a.userId === r.id);
    const done = ra.filter(a => S.SUBMITTED_SET.includes(a.status)).length;
    return { name: r.name, p: pct(done, ra.length), n: ra.length };
  }).filter(x => x.n).sort((a, b) => b.p - a.p);

  const recent = A.map(a => ({ a, v: latest.get(a.id) })).filter(x => x.v?.submittedAt)
    .sort((x, y) => y.v.submittedAt - x.v.submittedAt).slice(0, 8);

  view.innerHTML = `
    <div class="toolbar">${filters(true, true)}</div>
    <div class="kpis">
      <div class="card kpi"><div class="label">${t('kpi_assigned')}${help('h_kpi_assigned')}</div><div class="val">${A.length}</div><div class="sub">${t('kpi_reps', { n: activeReps.length })}</div></div>
      <div class="card kpi"><div class="label">${t('kpi_submitted')}${help('h_kpi_submitted')}</div><div class="val">${submitted}</div><div class="sub">${t('kpi_plan', { n: pct(submitted, A.length) })}</div></div>
      <div class="card kpi teal"><div class="label">${t('kpi_auto')}${help('h_kpi_auto')}</div><div class="val">${pct(auto, submitted)}%</div><div class="sub">${t('kpi_auto_of', { a: auto, b: submitted })}</div></div>
      <div class="card kpi amber"><div class="label">${t('kpi_review')}${help('h_kpi_review')}</div><div class="val">${review}</div><div class="sub">${t('kpi_waiting')}</div></div>
    </div>
    <div class="grid-2">
      <div class="card bars">
        <h3>${t('plan_by_rep')}${help('h_plan_by_rep')}</h3>
        ${byRep.length ? byRep.map(r => `
          <div class="row"><span>${esc(r.name)}</span><div class="track"><div class="fill" style="width:${r.p}%"></div></div><span class="pct">${r.p}%</span></div>`).join('') : `<p class="muted">${t('no_data')}</p>`}
      </div>
      <div class="card">
        <h3>${t('status_mix')}${help('h_status_mix')}</h3>
        <div class="donut-wrap">
          ${donut(cat, colors, pct(A.length - cat.todo, A.length))}
          <ul class="legend">${Object.keys(cat).map(k => `<li><i style="background:${colors[k]}"></i>${labels[k]} <b>${cat[k]}</b></li>`).join('')}</ul>
        </div>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>${t('recent_visits')}${help('h_recent')}</h3>
        <table><thead><tr><th>${t('col_address')}</th><th>${t('col_rep')}</th><th>${t('col_status')}</th><th>${t('col_time')}</th></tr></thead>
        <tbody>${recent.map(({ a, v }) => `
          <tr data-visit="${v.id}" style="cursor:pointer"><td>${esc(addrLine(S.getProperty(a.propertyId)))}</td><td>${esc(repName(a.userId))}</td><td>${badge(v.status)}</td><td>${fmtTime(v.submittedAt)}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${t('no_data')}</td></tr>`}
        </tbody></table>
      </div>
      <div class="card">
        <div class="section-title"><h3 style="margin:0">${state.rep ? t('route_done') : t('visits_map')}${help(state.rep ? 'h_route_done' : 'h_map')}</h3>
          ${state.rep ? routeDaySelect(A, latest) : `<span class="muted small">${t('route_pick_rep')}</span>`}</div>
        <div id="map"></div><div id="routeStats" class="muted small" style="margin-top:6px"></div></div>
    </div>`;
  await wireFilters(view);
  view.querySelectorAll('[data-visit]').forEach(tr => tr.onclick = () => visitModal(tr.dataset.visit));
  drawMap(A, latest);
  const rd = $('#routeDay'); if (rd) rd.onchange = () => { state.routeDay = rd.value; render(); };
}

function donut(cat, colors, centerPct) {
  const total = Object.values(cat).reduce((a, b) => a + b, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  const segs = Object.keys(cat).map(k => {
    const len = cat[k] / total * C;
    const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${colors[k]}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`;
    off += len; return s;
  }).join('');
  return `<svg width="140" height="140" viewBox="0 0 140 140">
    <circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--surface-2)" stroke-width="18"/>${segs}
    <text x="70" y="68" text-anchor="middle" font-size="22" font-weight="700" fill="var(--text)">${centerPct}%</text>
    <text x="70" y="88" text-anchor="middle" font-size="11" fill="var(--muted)">${t('sent')}</text></svg>`;
}

let map;
function drawMap(A, latest) {
  if (!window.L) { setTimeout(() => drawMap(A, latest), 300); return; }
  const el = $('#map'); if (!el) return;
  if (map) { map.remove(); map = null; }
  map = L.map(el, { scrollWheelZoom: false });
  const dark = document.documentElement.dataset.theme === 'dark';
  L.tileLayer(dark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: dark ? '&copy; OpenStreetMap, &copy; CARTO' : '&copy; OpenStreetMap',
  }).addTo(map);
  const col = { AUTO_VERIFIED: '#16A34A', APPROVED: '#0E9F8E', TO_REVIEW: '#F59E0B', SUBMITTED: '#F59E0B', REJECTED: '#DC2626', ASSIGNED: '#64748B', IN_PROGRESS: '#2F6FED' };
  const pts = [];
  for (const a of A) {
    const p = S.getProperty(a.propertyId);
    if (!p || p.lat == null) continue;
    pts.push([p.lat, p.lng]);
    const v = latest.get(a.id);
    L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 1.5, fillColor: col[a.status] || '#64748B', fillOpacity: .95 })
      .bindPopup(`<b>${esc(addrLine(p))}</b><br>${esc(repName(a.userId))}<br>${t('st_' + a.status)}${v?.submittedAt ? ' · ' + fmtDateTime(v.submittedAt) : ''}`)
      .addTo(map);
  }
  // zrealizowana trasa wybranego handlowca w wybranym dniu: wizyty w kolejności wysłania, punkty GPS
  if (state.rep) {
    const day = state.routeDay;
    const seq = A.map(a => latest.get(a.id)).filter(v => v?.submittedAt && localDay(v.submittedAt) === day)
      .sort((a, b) => a.submittedAt - b.submittedAt)
      .map(v => ({ v, lat: v.gps?.lat ?? S.getProperty(v.propertyId).lat, lng: v.gps?.lng ?? S.getProperty(v.propertyId).lng }))
      .filter(x => x.lat != null);
    if (seq.length) {
      L.polyline(seq.map(x => [x.lat, x.lng]), { color: SECTION.dashboard.c, weight: 4, opacity: .85 }).addTo(map);
      seq.forEach((x, i) => L.marker([x.lat, x.lng], { icon: L.divIcon({ className: '', html: `<span class="route-pin">${i + 1}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) })
        .bindPopup(`<b>${i + 1}. ${esc(addrLine(S.getProperty(x.v.propertyId)))}</b><br>${fmtTime(x.v.submittedAt)} · ${t('st_' + x.v.status)}`).addTo(map));
      const span = (seq[seq.length - 1].v.submittedAt - seq[0].v.submittedAt) / 60000;
      $('#routeStats').textContent = t('route_stats', { n: seq.length, km: km(routeLength(seq)), from: fmtTime(seq[0].v.submittedAt), to: fmtTime(seq[seq.length - 1].v.submittedAt), h: (span / 60).toFixed(1) });
      map.fitBounds(seq.map(x => [x.lat, x.lng]), { padding: [30, 30] });
    } else $('#routeStats').textContent = t('no_data');
  }
}

// Dni, w których handlowiec wysyłał wizyty (wybór dnia trasy)
function routeDaySelect(A, latest) {
  const days = [...new Set(A.map(a => latest.get(a.id)).filter(v => v?.submittedAt).map(v => localDay(v.submittedAt)))].sort().reverse();
  if (!days.includes(state.routeDay)) state.routeDay = days[0] || '';
  return `<select id="routeDay" ${tip('h_route_day')}>${days.map(d => `<option value="${d}" ${d === state.routeDay ? 'selected' : ''}>${fmtDate(d + 'T12:00:00')}</option>`).join('')}</select>`;
}

