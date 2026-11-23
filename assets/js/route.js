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
