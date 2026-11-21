// Reguły automatycznej weryfikacji wizyty (spec C3).
// W prototypie liczone w przeglądarce; docelowo ten sam kod w Supabase Edge Function (wynik wiążący po stronie serwera).

export const DEFAULT_SETTINGS = {
  streetMin: 90,      // % zgodności nazwy ulicy (Levenshtein)
  gpsMax: 100,        // m od geokodowanego adresu
  gpsAcc: 50,         // m — maks. dokładność odczytu GPS
  gapMax: 30,         // min — odstęp między zdjęciem 1 i 2
  dueTol: 24,         // godz. tolerancji po terminie
  phashMax: 6,        // bity różnicy hasha = duplikat
  cameraAge: 5,       // min — plik zdjęcia starszy niż to = nie z aparatu
  retentionDays: 365,
  demoGps: true,
  // progi kolorowania raportów
  targetPlan: 90,     // % realizacji planu
  targetAuto: 85,     // % auto-weryfikacji
  targetRejected: 5,  // % odrzuconych (maks.)
  targetReviewH: 24,  // godz. na decyzję ręczną (maks.)
};

// Normalizacja: małe litery, bez diakrytyków, bez „ul.”, „ulica”, „al.” itd.
const PREFIXES = ['ulica', 'ul', 'aleja', 'aleje', 'al', 'osiedle', 'os', 'plac', 'pl'];
export function normalize(s) {
  let x = String(s || '').toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return x.split(' ').filter(w => w && !PREFIXES.includes(w)).join(' ');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
export function similarity(a, b) {
  const L = Math.max(a.length, b.length);
  return L ? Math.round((1 - levenshtein(a, b) / L) * 100) : 0;
}

// Najlepsze dopasowanie nazwy ulicy w tekście OCR (okno słów tej samej długości co nazwa)
export function bestStreetMatch(ocrText, street) {
  const target = normalize(street);
  const words = normalize(ocrText).split(' ').filter(Boolean);
  const k = Math.max(1, target.split(' ').length);
  let best = 0;
  for (let i = 0; i < words.length; i++) {
    for (let len = Math.max(1, k - 1); len <= k + 1; len++) {
      if (i + len > words.length) continue;
      best = Math.max(best, similarity(words.slice(i, i + len).join(' '), target));
    }
  }
  return best;
}

// Numer budynku / lokalu — dokładne dopasowanie tokenu (np. „20”, „20a”)
export function hasNumber(ocrText, num) {
  const n = normalize(num).replace(/ /g, '');
  if (!n) return false;
  const tokens = normalize(ocrText).split(' ');
  // sklejenie „20 a” → „20a”
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === n) return true;
    if (tokens[i] + (tokens[i + 1] || '') === n) return true;
  }
  return false;
}

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function hamming(h1, h2) {
  if (!h1 || !h2 || h1.length !== h2.length) return 64;
  let d = 0;
  for (let i = 0; i < h1.length; i++) {
    let x = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

// dHash 64-bit (hash percepcyjny) z obrazka; zwraca 16 znaków hex
export async function perceptualHash(dataUrl) {
  const img = await loadImage(dataUrl);
  const c = document.createElement('canvas');
  c.width = 9; c.height = 8;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 9, 8);
  const d = g.getImageData(0, 0, 9, 8).data;
  const gray = [];
  for (let i = 0; i < d.length; i += 4) gray.push(d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114);
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

/**
 * Ocena wizyty.
 * @param {object} p  nieruchomość {street, building, unit, lat, lng}
 * @param {object} a  przypisanie {due}
 * @param {object} v  wizyta {gps:{lat,lng,acc}, noUnitNumber}
 * @param {object[]} photos  [{type:'building'|'unit'|'door', ocrText, hash, takenAt, fileAge}]
 * @param {string[]} otherHashes  hashe zdjęć z innych wizyt
 * @returns {{status, reasons:[{code,n?}], details}}
 */
export function evaluate(p, a, v, photos, otherHashes, s = DEFAULT_SETTINGS) {
  const reasons = [];
  const add = (code, n) => reasons.push(n === undefined ? { code } : { code, n });
  const pb = photos.find(x => x.type === 'building');
  const pu = photos.find(x => x.type === 'unit' || x.type === 'door');
  const details = {};

  // Zdjęcie 1 — budynek
  if (!pb) add('r_missing_photo');
  else if (!normalize(pb.ocrText)) add('r_ocr_building_unreadable');
  else {
    details.streetScore = bestStreetMatch(pb.ocrText, p.street);
    details.buildingOk = hasNumber(pb.ocrText, p.building);
    if (details.streetScore < s.streetMin) add('r_street_mismatch', details.streetScore);
    if (!details.buildingOk) add('r_building_no_mismatch');
  }

  // Zdjęcie 2 — lokal / drzwi
  if (p.unit) {
    if (!pu) add('r_missing_photo');
    else if (pu.type === 'door' || v.noUnitNumber) add('r_no_unit_number');
    else if (!normalize(pu.ocrText)) add('r_ocr_unit_unreadable');
    else {
      details.unitOk = hasNumber(pu.ocrText, p.unit);
      if (!details.unitOk) add('r_unit_mismatch');
    }
  }

  // GPS
  if (!v.gps) add('r_no_gps');
  else if (p.lat == null || p.lng == null) add('r_no_geocode');
  else {
    details.distance = haversine(v.gps.lat, v.gps.lng, p.lat, p.lng);
    details.accuracy = Math.round(v.gps.acc ?? 0);
    if (details.accuracy > s.gpsAcc) add('r_gps_inaccurate', details.accuracy);
    if (details.distance > s.gpsMax) add('r_gps_far', details.distance);
  }

  // Czas
  if (pb && pu) {
    details.gapMin = Math.round(Math.abs(pu.takenAt - pb.takenAt) / 60000);
    if (details.gapMin > s.gapMax) add('r_photo_gap', details.gapMin);
  }
  if (a.due) {
    const dueEnd = new Date(a.due + 'T23:59:59').getTime() + s.dueTol * 3600000;
    if ((v.submittedAt || Date.now()) > dueEnd) { add('r_late'); details.late = true; }
  }

  // Anty-duplikat + zdjęcie z aparatu
  details.duplicate = photos.some(ph => otherHashes.some(h => hamming(ph.hash, h) <= s.phashMax));
  if (details.duplicate) add('r_duplicate');
  details.cameraOk = photos.every(ph => (ph.fileAge ?? 0) <= s.cameraAge * 60000);
  if (!details.cameraOk) add('r_not_camera');

  return { status: reasons.length ? 'TO_REVIEW' : 'AUTO_VERIFIED', reasons, details };
}
