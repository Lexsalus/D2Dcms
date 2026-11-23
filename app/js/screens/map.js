// Ekran: mapa adresów i trasa na dziś
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, screen, user, setUser, nav, go, flow, ui, render, setRender, bar } from '../core.js';
import { planRoute, mapsLink, km } from '../../../assets/js/domain/route.js';

// ---------- mapa własnych adresów ----------
let lmap;
export async function mapScreen() {
  const items = await S.myAssignments(user.id);
  // trasa na dziś: nieodwiedzone adresy w kolejności najkrótszego przejścia (od bieżącej pozycji, jeśli jest)
  const todo = items.filter(a => ['ASSIGNED', 'IN_PROGRESS'].includes(a.status) && a.property.lat != null);
  const here = await quickPosition();
  const plan = planRoute(todo.map(a => a.property), here);
  const seq = plan.order.map(i => todo[i]);
  const link = mapsLink(seq.map(a => a.property));
  screen.innerHTML = `<div id="amap" class="amap"></div>
    <div class="map-legend small">${['ASSIGNED', 'IN_PROGRESS', 'TO_REVIEW', 'AUTO_VERIFIED', 'REJECTED'].map(st => `<span><i class="lg st-dot-${st}"></i>${t('st_' + st)}</span>`).join('')}</div>
    ${seq.length ? `<div class="card route-card">
      <div class="route-head"><b>${t('route_today')}${help('h_route')}</b><span class="muted">${t('route_sum', { n: seq.length, km: km(plan.meters) })}</span></div>
      <ol class="route-list">${seq.map(a => `<li data-a="${a.id}">${esc(addrLine(a.property))}</li>`).join('')}</ol>
      ${link ? `<a class="btn btn-primary btn-block" target="_blank" rel="noopener" href="${link}" ${tip('h_route_nav')}>🧭 ${t('route_nav')}</a>` : ''}
      ${seq.length > 10 ? `<p class="muted small">${t('route_limit')}</p>` : ''}
    </div>` : ''}`;
  screen.querySelectorAll('.route-list [data-a]').forEach(li => li.onclick = () => go({ name: 'detail', assignmentId: li.dataset.a }));
  if (!window.L) {
    try { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
    catch { $('#amap').innerHTML = `<div class="ph-empty" style="height:100%">${t('map_offline')}</div>`; return; }
  }
  if (lmap) { lmap.remove(); lmap = null; }
  lmap = L.map('amap', { zoomControl: true });
  const dark = document.documentElement.dataset.theme === 'dark';
  L.tileLayer(dark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: dark ? '&copy; OpenStreetMap, &copy; CARTO' : '&copy; OpenStreetMap' }).addTo(lmap);
  const col = { ASSIGNED: '#64748B', IN_PROGRESS: '#2F6FED', SUBMITTED: '#F59E0B', TO_REVIEW: '#F59E0B', AUTO_VERIFIED: '#16A34A', APPROVED: '#0E9F8E', REJECTED: '#DC2626' };
  const pts = [];
  const num = new Map(seq.map((a, i) => [a.id, i + 1]));
  if (seq.length) {
    const line = [...(here ? [[here.lat, here.lng]] : []), ...seq.map(a => [a.property.lat, a.property.lng])];
    L.polyline(line, { color: '#2F6FED', weight: 4, opacity: .8, dashArray: '8 8' }).addTo(lmap);
    if (here) { L.circleMarker([here.lat, here.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#2F6FED', fillOpacity: 1 }).addTo(lmap).bindPopup(t('you_are_here')); pts.push([here.lat, here.lng]); }
  }
  for (const a of items) {
    const p = a.property; if (p.lat == null) continue;
    pts.push([p.lat, p.lng]);
    const m = num.has(a.id)
      ? L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<span class="route-pin" style="background:${col[a.status]}">${num.get(a.id)}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(lmap)
      : L.circleMarker([p.lat, p.lng], { radius: 9, color: '#fff', weight: 2, fillColor: col[a.status], fillOpacity: .95 }).addTo(lmap);
    m.bindPopup(`<b>${esc(addrLine(p))}</b><br>${t('st_' + a.status)}<br><button class="btn btn-primary" data-open="${a.id}" style="margin-top:6px">${t('open')}</button>`);
    m.on('popupopen', e => e.popup.getElement().querySelector('[data-open]').onclick = () => go({ name: 'detail', assignmentId: a.id }));
  }
  if (pts.length) lmap.fitBounds(pts, { padding: [30, 30] }); else lmap.setView([52.07, 19.48], 6);
}

// Szybki odczyt pozycji do planowania trasy (nie blokuje mapy dłużej niż 4 s)
async function quickPosition() {
  if (!navigator.geolocation) return null;
  if ((await S.getSettings()).demoGps) return null; // w trybie demo trasa startuje od pierwszego adresu
  return new Promise(res => {
    const tm = setTimeout(() => res(null), 4000);
    navigator.geolocation.getCurrentPosition(p => { clearTimeout(tm); res({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { clearTimeout(tm); res(null); }, { enableHighAccuracy: false, timeout: 4000, maximumAge: 120000 });
  });
}

