// Biometria behawioralna — trzy sygnały pomocnicze. Wynik to wyłącznie FLAGA do ręcznej weryfikacji,
// nigdy automatyczne odrzucenie. Metody wzorowane na projekcie behavioral-biometrics (rytm hasła, podpis DTW).
//
// Każdy wynik to „ile razy bardziej różni się od wzorca, niż wzorce różnią się między sobą” (≈1 = jak zwykle).

export const BIO_DEFAULTS = {
  bioPin: true, bioSig: true, bioTouch: true,
  bioToReview: true,          // flaga kieruje wizytę do weryfikacji
  bioPinEnroll: 5, bioPinTh: 2.5,
  bioSigEnroll: 3, bioSigTh: 2.0,
  bioTouchEnroll: 5, bioTouchTh: 3.0,
};

const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

// ---------------- 1. Rytm PIN-u ----------------
// Wejście: znaczniki czasu kolejnych cyfr (ms). Na telefonie klawiatura ekranowa nie daje czasu przytrzymania,
// więc porównujemy odstępy między cyframi (log, bo rozkład czasów jest prawoskośny).
export function pinVector(times) {
  const v = [];
  for (let i = 1; i < times.length; i++) v.push(Math.log(Math.max(30, times[i] - times[i - 1])));
  return v;
}
// samples: wcześniejsze wektory tej samej długości
export function pinScore(samples, vec) {
  const S = samples.filter(s => s.length === vec.length);
  if (S.length < 2 || !vec.length) return null;
  const z = vec.map((x, i) => {
    const col = S.map(s => s[i]);
    return Math.abs(x - mean(col)) / Math.max(0.12, std(col)); // min. rozrzut ≈ 12% (log)
  });
  return +mean(z).toFixed(2);
}

// ---------------- 2. Podpis ----------------
// strokes: [[{x,y,t}, ...], ...]
const RS = 64, BINS = 12;
function resample(pts, n) {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const L = d[d.length - 1] || 1, out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = L * k / (n - 1);
    while (j < d.length - 2 && d[j + 1] < s) j++;
    const seg = (d[j + 1] - d[j]) || 1, u = Math.min(1, Math.max(0, (s - d[j]) / seg));
    const a = pts[j], b = pts[Math.min(j + 1, pts.length - 1)];
    out.push([a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u]);
  }
  return out;
}
export function sigFeatures(strokes) {
  const pts = strokes.flat();
  if (pts.length < 8) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const cx = mean(xs), cy = mean(ys);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const norm = pts.map(p => ({ x: (p.x - cx) / size, y: (p.y - cy) / size, t: p.t }));
  const t0 = pts[0].t, dur = Math.max(50, pts[pts.length - 1].t - t0);
  // profil prędkości w BINS odcinkach czasu
  const prof = new Array(BINS).fill(0);
  for (let i = 1; i < norm.length; i++) {
    const b = Math.min(BINS - 1, Math.floor((norm[i].t - t0) / dur * BINS));
    prof[b] += Math.hypot(norm[i].x - norm[i - 1].x, norm[i].y - norm[i - 1].y);
  }
  return { res: resample(norm, RS), dur, prof, strokes: strokes.length };
}
function dtw(a, b) {
  const n = a.length, m = b.length, D = new Float64Array((n + 1) * (m + 1)).fill(Infinity);
  D[0] = 0;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const c = Math.hypot(a[i - 1][0] - b[j - 1][0], a[i - 1][1] - b[j - 1][1]);
    D[i * (m + 1) + j] = c + Math.min(D[(i - 1) * (m + 1) + j], D[i * (m + 1) + j - 1], D[(i - 1) * (m + 1) + j - 1]);
  }
  return D[n * (m + 1) + m] / (n + m);
}
function corrDist(a, b) {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return 1 - num / (Math.sqrt(da * db) || 1);
}
const pairs = a => a.flatMap((x, i) => a.slice(i + 1).map(y => [x, y]));
export function sigScore(templates, f) {
  if (!f || templates.length < 2) return null;
  const P = pairs(templates);
  const rS = Math.max(0.02, mean(P.map(([a, b]) => dtw(a.res, b.res))));
  const rR = Math.max(0.05, mean(P.map(([a, b]) => corrDist(a.prof, b.prof))));
  const logs = templates.map(e => Math.log(e.dur));
  const sT = Math.max(0.08, std(logs));
  const shape = mean(templates.map(e => dtw(f.res, e.res))) / rS;
  const tempo = Math.abs(Math.log(f.dur) - mean(logs)) / sT;
  const rhythm = mean(templates.map(e => corrDist(f.prof, e.prof))) / rR;
  return { score: +((shape + tempo + rhythm) / 3).toFixed(2), shape: +shape.toFixed(2), tempo: +tempo.toFixed(2), rhythm: +rhythm.toFixed(2) };
}

// ---------------- 3. Dynamika dotyku ----------------
// Zbiera w tle: czas przytrzymania stuknięcia, odstęp między stuknięciami, wielkość kontaktu (jeśli dostępna),
// prędkość przesunięć. Niczego nie zapisuje poza zagregowanymi cechami wizyty.
export function touchRecorder(root = document) {
  const taps = [], swipes = [];
  const down = new Map();
  const onDown = e => { if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest?.('[data-nobio]')) return; down.set(e.pointerId, { t: e.timeStamp, x: e.clientX, y: e.clientY, w: e.width || 0, h: e.height || 0 }); };
  const onUp = e => {
    const d = down.get(e.pointerId); if (!d) return;
    down.delete(e.pointerId);
    const dt = e.timeStamp - d.t, dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (dist < 12 && dt < 1200) taps.push({ t: d.t, hold: dt, area: d.w * d.h });
    else if (dist >= 30 && dt > 0) swipes.push(dist / dt);
  };
  root.addEventListener('pointerdown', onDown, true);
  root.addEventListener('pointerup', onUp, true);
  return {
    features() {
      if (taps.length < 5) return null;
      const holds = taps.map(x => x.hold);
      const gaps = taps.slice(1).map((x, i) => x.t - taps[i].t).filter(g => g > 80 && g < 5000);
      const areas = taps.map(x => x.area).filter(a => a > 1);
      return {
        hold: Math.log(median(holds)),
        gap: gaps.length >= 3 ? Math.log(median(gaps)) : null,
        area: areas.length >= 3 ? Math.log(median(areas)) : null,
        swipe: swipes.length >= 2 ? Math.log(median(swipes)) : null,
        n: taps.length,
      };
    },
    stop() { root.removeEventListener('pointerdown', onDown, true); root.removeEventListener('pointerup', onUp, true); },
  };
}
const TOUCH_KEYS = ['hold', 'gap', 'area', 'swipe'];
const TOUCH_MIN_SD = { hold: 0.15, gap: 0.2, area: 0.15, swipe: 0.25 };
export function touchScore(samples, f) {
  if (!f || samples.length < 2) return null;
  const z = [];
  for (const k of TOUCH_KEYS) {
    if (f[k] == null) continue;
    const col = samples.map(s => s[k]).filter(x => x != null);
    if (col.length < 2) continue;
    z.push(Math.abs(f[k] - mean(col)) / Math.max(TOUCH_MIN_SD[k], std(col)));
  }
  return z.length ? +mean(z).toFixed(2) : null;
}

// ---------------- rysowanie podpisu (miniatura SVG) ----------------
export function sigSvg(strokes, w = 240, h = 90) {
  const pts = strokes.flat();
  if (!pts.length) return '';
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const k = Math.min((w - 10) / ((Math.max(...xs) - minX) || 1), (h - 10) / ((Math.max(...ys) - minY) || 1));
  const path = strokes.map(s => s.map((p, i) => `${i ? 'L' : 'M'}${(5 + (p.x - minX) * k).toFixed(1)} ${(5 + (p.y - minY) * k).toFixed(1)}`).join(' ')).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="sig-svg"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
