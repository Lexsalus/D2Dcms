// Planowanie trasy przez adresy: najbliższy sąsiad + poprawa 2-opt (wystarcza dla kilkudziesięciu punktów).
import { haversine } from './verify.js';

const d = (a, b) => haversine(a.lat, a.lng, b.lat, b.lng);

// points: [{lat, lng, ...}], start: {lat, lng} | null → { order: [indeksy], meters }
export function planRoute(points, start = null) {
  const n = points.length;
  if (!n) return { order: [], meters: 0 };
  // najbliższy sąsiad
  const left = new Set(points.map((_, i) => i));
  const order = [];
  let cur = start;
  if (!cur) { order.push(0); left.delete(0); cur = points[0]; }
  while (left.size) {
    let best = -1, bd = Infinity;
    for (const i of left) { const x = d(cur, points[i]); if (x < bd) { bd = x; best = i; } }
    order.push(best); left.delete(best); cur = points[best];
  }
  // 2-opt (trasa otwarta, start stały)
  const P = i => points[order[i]];
  const S = start;
  const prev = i => (i === 0 ? S : P(i - 1));
  let improved = true, guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = start ? 0 : 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const a = prev(i); if (!a) continue;
        const b = P(i), c = P(k), e = k + 1 < n ? P(k + 1) : null;
        const before = d(a, b) + (e ? d(c, e) : 0);
        const after = d(a, c) + (e ? d(b, e) : 0);
        if (after + 1 < before) { order.splice(i, k - i + 1, ...order.slice(i, k + 1).reverse()); improved = true; }
      }
    }
  }
  return { order, meters: routeLength(order.map(i => points[i]), start) };
}

export function routeLength(seq, start = null) {
  let m = 0;
  const all = start ? [start, ...seq] : seq;
  for (let i = 1; i < all.length; i++) m += d(all[i - 1], all[i]);
  return m;
}

// Link nawigacji Google Maps (pieszo) — maks. 9 punktów pośrednich + cel
export function mapsLink(seq, mode = 'walking') {
  const stops = seq.slice(0, 10);
  if (!stops.length) return null;
  const dest = stops[stops.length - 1];
  const wp = stops.slice(0, -1).map(p => `${p.lat},${p.lng}`).join('|');
  return `https://www.google.com/maps/dir/?api=1&travelmode=${mode}&destination=${dest.lat},${dest.lng}${wp ? '&waypoints=' + encodeURIComponent(wp) : ''}`;
}

export const km = m => (m / 1000).toFixed(m < 10000 ? 1 : 0);

// Podział adresów na rejony (k-średnie po współrzędnych; bez współrzędnych — kod + ulica). Zwraca grupy id.
export function regionsOf(P, k) {
  P = P.filter(Boolean);
  const geo = P.filter(p => p.lat != null), noGeo = P.filter(p => p.lat == null);
  const groups = [];
  if (geo.length) {
    k = Math.max(1, Math.min(k, geo.length));
    const pt = p => [p.lat, p.lng * Math.cos(p.lat * Math.PI / 180)];
    const X = geo.map(pt);
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    // start: najdalsze punkty (deterministycznie)
    const C = [X[0]];
    while (C.length < k) {
      let best = 0, bd = -1;
      X.forEach((x, i) => { const d = Math.min(...C.map(c => d2(x, c))); if (d > bd) { bd = d; best = i; } });
      C.push(X[best]);
    }
    let lab = [];
    for (let it = 0; it < 25; it++) {
      lab = X.map(x => C.map(c => d2(x, c)).reduce((bi, d, i, arr) => d < arr[bi] ? i : bi, 0));
      for (let c = 0; c < k; c++) {
        const m = X.filter((_, i) => lab[i] === c);
        if (m.length) C[c] = [m.reduce((s, x) => s + x[0], 0) / m.length, m.reduce((s, x) => s + x[1], 0) / m.length];
      }
    }
    for (let c = 0; c < k; c++) { const g = geo.filter((_, i) => lab[i] === c); if (g.length) groups.push(g); }
  }
  const byKey = {};
  for (const p of noGeo) (byKey[`${p.zip}|${p.street}`.toLowerCase()] ??= []).push(p);
  groups.push(...Object.values(byKey));
  return groups.map(g => g.map(p => p.id));
}
