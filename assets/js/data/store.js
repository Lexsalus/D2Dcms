// Warstwa danych prototypu: localStorage (tabele) + IndexedDB (zdjęcia).
// Wszystkie metody są async i odpowiadają przyszłym wywołaniom Supabase (patrz docs/ARCHITEKTURA.md),
// więc podmiana backendu nie wymaga zmian w ekranach.
import { DEFAULT_SETTINGS, evaluate, perceptualHash } from '../domain/verify.js';
import { deliver, visitRecord, SCHEMA_VERSION } from '../domain/integration.js';
import { regionsOf } from '../domain/route.js';
import { BIO_DEFAULTS, pinVector, pinScore, sigFeatures, sigScore, touchScore } from '../domain/biometrics.js';

const SETTINGS0 = { ...DEFAULT_SETTINGS, ...BIO_DEFAULTS, whUrl: '', whToken: '', whEvents: ['visit.submitted', 'visit.decided'] };

const DB_KEY = 'fc.db.v1';
const SESSION_KEY = { admin: 'fc.session.admin', rep: 'fc.session.rep' };
export const MODE = 'local';
export const authLink = null, authLinkError = null;
export async function refresh() {}
export const mfaStatus = async () => ({ enabled: false, unsupported: true });
export const lastLogin = () => null, forgetLogin = () => {};
export const OUTCOMES = ['talked', 'no_answer', 'refused', 'later'];
export const FINAL = ['AUTO_VERIFIED', 'APPROVED', 'REJECTED'];
export const SUBMITTED_SET = ['SUBMITTED', 'AUTO_VERIFIED', 'TO_REVIEW', 'APPROVED', 'REJECTED'];

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------- IndexedDB na pliki zdjęć ----------
let idbP;
function idb() {
  idbP ??= new Promise((res, rej) => {
    const r = indexedDB.open('fc-photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return idbP;
}
async function idbPut(key, val) {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((res, rej) => { const r = db.transaction('photos').objectStore('photos').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbClear() {
  const db = await idb();
  return new Promise(res => { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').clear(); tx.oncomplete = res; });
}

// ---------- tabele ----------
function empty() {
  return { users: [], properties: [], assignments: [], visits: [], photos: [], audit: [], settings: { ...SETTINGS0 } };
}
function load() {
  try {
    const db = JSON.parse(localStorage.getItem(DB_KEY));
    if (db && db.users) { db.settings = { ...SETTINGS0, ...db.settings }; return db; }
  } catch { /* uszkodzone dane → seed */ }
  return null;
}
let db = load();
function save() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

// Zmiany z innej karty (panel ↔ aplikacja w tej samej przeglądarce)
const changeListeners = new Set();
window.addEventListener('storage', e => {
  if (e.key === DB_KEY) { db = load() || empty(); changeListeners.forEach(fn => fn()); }
});
export function onChange(fn) { changeListeners.add(fn); }

export function deviceId() {
  let id = localStorage.getItem('fc.deviceId');
  if (!id) { id = 'DEV-' + Math.random().toString(36).slice(2, 8).toUpperCase(); localStorage.setItem('fc.deviceId', id); }
  return id;
}

function audit(userId, action, object) {
  db.audit.unshift({ id: uid(), userId, action, object, ts: Date.now() });
  if (db.audit.length > 2000) db.audit.length = 2000;
}

// ---------- auth (atrapa; docelowo Supabase Auth + 2FA) ----------
export const DEMO_ADMIN = { email: 'admin@fieldcheck.demo', password: 'demo1234' };
export const DEMO_PIN = '1234';

export const DEMO_MANAGER = { email: 'manager@fieldcheck.demo', password: 'demo1234' };
// Logowanie do panelu: admin lub manager (manager widzi tylko swój zespół)
export async function loginAdmin(email, password) {
  const u = db.users.find(x => ['admin', 'manager'].includes(x.role) && (x.email || '').toLowerCase() === email.trim().toLowerCase());
  if (!u || u.password !== password) throw new Error('bad_login');
  if (u.active === false) throw new Error('account_inactive');
  localStorage.setItem(SESSION_KEY.admin, JSON.stringify({ userId: u.id, sv: u.sv || 0, start: Date.now(), seen: Date.now() }));
  audit(u.id, 'login', 'panel'); save();
  return u;
}
export async function loginRep(userId, pin, pinTimes = []) {
  const u = db.users.find(x => x.id === userId && x.role === 'rep');
  if (!u || u.pin !== pin) throw new Error('bad_login');
  if (!u.active) throw new Error('account_inactive');
  const dev = deviceId();
  if (u.deviceId && u.deviceId !== dev) throw new Error('device_bound');
  u.deviceId = dev;
  const pinBio = pinCheck(u, pinTimes);
  localStorage.setItem(SESSION_KEY.rep, JSON.stringify({ userId: u.id, sv: u.sv || 0, pinBio, start: Date.now(), seen: Date.now() }));
  audit(u.id, 'login', 'app ' + dev);
  if (pinBio?.flag) audit(u.id, 'bio_pin_flag', `score ${pinBio.score}`);
  save();
  return u;
}
export function currentUser(kind) {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY[kind]));
    const u = s && db.users.find(x => x.id === s.userId);
    if (!u || (u.sv || 0) !== s.sv || u.active === false) return null;
    // wygasanie: admin po bezczynności, handlowiec po maks. długości sesji
    const now = Date.now();
    const expired = kind === 'admin'
      ? now - (s.seen || s.start || 0) > db.settings.sessionMin * 60000
      : now - (s.start || 0) > db.settings.repSessionH * 3600000;
    if (expired) { localStorage.removeItem(SESSION_KEY[kind]); sessionExpired[kind] = true; return null; }
    return u;
  } catch { return null; }
}
export const sessionExpired = { admin: false, rep: false };
// aktywność użytkownika przedłuża sesję admina (zapis co najwyżej raz na 20 s)
export function touchSession(kind) {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY[kind]));
    if (s && Date.now() - (s.seen || 0) > 20000) { s.seen = Date.now(); localStorage.setItem(SESSION_KEY[kind], JSON.stringify(s)); }
  } catch { /* brak sesji */ }
}
// Zakres danych: null = wszystko (admin), lista id handlowców = zespół managera
export function scope(u) { return u?.role === 'manager' ? (u.team || []) : null; }
export const inScope = (u, repId) => { const sc = scope(u); return !sc || sc.includes(repId); };
export const isAdmin = u => u?.role === 'admin';
function requireAdmin(u) { if (!isAdmin(u)) throw new Error('forbidden'); }

export const listManagers = async () => db.users.filter(u => u.role === 'manager');
export async function saveManager(admin, m) {
  requireAdmin(admin);
  if (m.id) { const u = db.users.find(x => x.id === m.id); if (!m.password) delete m.password; Object.assign(u, m); }
  else db.users.push({ id: uid(), role: 'manager', active: true, sv: 0, team: [], ...m });
  audit(admin.id, m.id ? 'manager_update' : 'manager_create', m.name); save();
}

export function sessionBio() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY.rep))?.pinBio || null; } catch { return null; }
}

// ---------- biometria behawioralna (tylko flagi) ----------
const bioOf = u => (u.bio ??= { pin: [], sig: [], touch: [] });
function pinCheck(u, times) {
  const s = db.settings;
  if (!s.bioPin || times.length < 4) return null;
  const vec = pinVector(times), B = bioOf(u);
  const same = B.pin.filter(x => x.length === vec.length);
  if (same.length < s.bioPinEnroll) { B.pin.push(vec); return { state: 'enroll', n: same.length + 1, of: s.bioPinEnroll }; }
  const score = pinScore(same.slice(-10), vec);
  const flag = score > s.bioPinTh;
  if (!flag) { B.pin.push(vec); if (B.pin.length > 30) B.pin.shift(); } // profil uczy się na zgodnych próbach
  return { state: 'check', score, flag };
}
function sigCheck(u, strokes) {
  const s = db.settings;
  if (!s.bioSig || !strokes?.length) return null;
  const f = sigFeatures(strokes); if (!f) return null;
  const B = bioOf(u);
  if (B.sig.length < s.bioSigEnroll) { B.sig.push(f); return { state: 'enroll', n: B.sig.length, of: s.bioSigEnroll }; }
  const r = sigScore(B.sig, f);
  return { state: 'check', ...r, flag: r.score > s.bioSigTh };
}
function touchCheck(u, f) {
  const s = db.settings;
  if (!s.bioTouch || !f) return null;
  const B = bioOf(u);
  if (B.touch.length < s.bioTouchEnroll) { B.touch.push(f); return { state: 'enroll', n: B.touch.length, of: s.bioTouchEnroll }; }
  const score = touchScore(B.touch.slice(-20), f);
  const flag = score != null && score > s.bioTouchTh;
  if (!flag && score != null) { B.touch.push(f); if (B.touch.length > 40) B.touch.shift(); }
  return { state: 'check', score, flag };
}
export function bioStatus(u) {
  const B = u.bio || { pin: [], sig: [], touch: [] }, s = db.settings;
  const pinLens = B.pin.reduce((m, v) => (m[v.length] = (m[v.length] || 0) + 1, m), {});
  return {
    pin: Math.min(s.bioPinEnroll, Math.max(0, ...Object.values(pinLens))), pinOf: s.bioPinEnroll,
    sig: Math.min(s.bioSigEnroll, B.sig.length), sigOf: s.bioSigEnroll,
    touch: Math.min(s.bioTouchEnroll, B.touch.length), touchOf: s.bioTouchEnroll,
  };
}

export function logout(kind) { localStorage.removeItem(SESSION_KEY[kind]); }

// ---------- odczyty ----------
export const getSettings = async () => ({ ...db.settings });
export async function saveSettings(admin, s) { db.settings = { ...db.settings, ...s }; audit(admin.id, 'settings', 'progi'); save(); }

export const listReps = async () => db.users.filter(u => u.role === 'rep');
export const getUser = id => db.users.find(u => u.id === id);
export const listProperties = async () => db.properties.slice();
export const getProperty = id => db.properties.find(p => p.id === id);
export const listAssignments = async () => db.assignments.slice();
export const assignmentFor = propertyId => db.assignments.find(a => a.propertyId === propertyId);
export const listVisits = async () => db.visits.slice();
export const getVisit = id => db.visits.find(v => v.id === id);
export const visitPhotos = visitId => db.photos.filter(p => p.visitId === visitId);
export const listAudit = async () => db.audit.slice();
export const lastVisit = assignmentId =>
  db.visits.filter(v => v.assignmentId === assignmentId).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];

export async function myAssignments(userId) {
  return db.assignments.filter(a => a.userId === userId)
    .map(a => ({ ...a, property: getProperty(a.propertyId), visit: lastVisit(a.id) }));
}

// ---------- użytkownicy ----------
export async function saveRep(admin, rep) {
  if (rep.id) Object.assign(db.users.find(u => u.id === rep.id), rep);
  else db.users.push({ id: uid(), role: 'rep', active: true, deviceId: null, sv: 0, pin: DEMO_PIN, ...rep });
  audit(admin.id, rep.id ? 'rep_update' : 'rep_create', rep.name); save();
}
export async function repAction(admin, repId, action) {
  const u = db.users.find(x => x.id === repId);
  if (action === 'activate') u.active = true;
  if (action === 'deactivate') { u.active = false; u.sv = (u.sv || 0) + 1; }
  if (action === 'reset_device') u.deviceId = null;
  if (action === 'remote_logout') u.sv = (u.sv || 0) + 1;
  if (action === 'reset_bio') u.bio = null;
  audit(admin.id, 'rep_' + action, u.name); save();
}

// ---------- nieruchomości ----------
const keyOf = p => [p.street, p.building, p.unit, p.city].map(x => String(x || '').trim().toLowerCase()).join('|');

export async function addProperty(admin, p) {
  if (db.properties.some(x => keyOf(x) === keyOf(p))) throw new Error('duplicate_address');
  const rec = { id: uid(), createdAt: Date.now(), ...p };
  db.properties.push(rec);
  audit(admin.id, 'property_create', `${p.street} ${p.building}/${p.unit || ''}`); save();
  return rec;
}
export async function importProperties(admin, rows) {
  let added = 0, dup = 0, err = 0;
  const seen = new Set(db.properties.map(keyOf));
  for (const r of rows) {
    if (!r.street || !r.building || !r.city) { err++; continue; }
    const k = keyOf(r);
    if (seen.has(k)) { dup++; continue; }
    seen.add(k);
    db.properties.push({ id: uid(), createdAt: Date.now(), ...r });
    added++;
  }
  audit(admin.id, 'import', `${added} adresów`); save();
  return { added, dup, err };
}
export async function updateProperty(id, patch) { Object.assign(getProperty(id), patch); save(); }
export async function deleteProperties(admin, ids) {
  const blocked = ids.filter(id => { const a = assignmentFor(id); return a && SUBMITTED_SET.includes(a.status); });
  const ok = ids.filter(id => !blocked.includes(id));
  db.properties = db.properties.filter(p => !ok.includes(p.id));
  db.assignments = db.assignments.filter(a => !ok.includes(a.propertyId));
  audit(admin.id, 'property_delete', `${ok.length}`); save();
  return { deleted: ok.length, blocked: blocked.length };
}

// ---------- przypisania ----------
export async function assign(admin, propertyIds, userId, due) {
  let n = 0, blocked = 0;
  for (const pid of propertyIds) {
    const a = assignmentFor(pid);
    if (a && !['ASSIGNED', 'IN_PROGRESS'].includes(a.status) && a.status !== 'REJECTED') { blocked++; continue; }
    if (a) Object.assign(a, { userId, due, status: 'ASSIGNED', assignedBy: admin.id, updatedAt: Date.now() });
    else db.assignments.push({ id: uid(), propertyId: pid, userId, due, status: 'ASSIGNED', assignedBy: admin.id, createdAt: Date.now(), updatedAt: Date.now() });
    n++;
  }
  audit(admin.id, 'assign', `${n} → ${getUser(userId)?.name}`); save();
  if (n) emit('assignment.created', { rep: { id: userId, name: getUser(userId)?.name }, due: due || null,
    properties: propertyIds.map(getProperty).filter(Boolean).map(p => ({ id: p.id, external_id: p.external_id || null, street: p.street, building: p.building, unit: p.unit || null, city: p.city })) });
  return { n, blocked };
}
export async function splitEvenly(admin, propertyIds, userIds, due) {
  // równy podział: zaczynamy od handlowca z najmniejszą liczbą aktywnych przypisań
  const load = Object.fromEntries(userIds.map(id => [id, db.assignments.filter(a => a.userId === id && !FINAL.includes(a.status)).length]));
  let n = 0, blocked = 0;
  for (const pid of propertyIds) {
    const uidMin = userIds.slice().sort((a, b) => load[a] - load[b])[0];
    const r = await assign(admin, [pid], uidMin, due);
    n += r.n; blocked += r.blocked;
    if (r.n) load[uidMin]++;
  }
  return { n, blocked };
}
// Podział wg rejonu: adresy blisko siebie trafiają do tego samego handlowca.
// Ze współrzędnymi — k-średnie (k = liczba handlowców), bez — grupy wg kodu pocztowego i ulicy.
// Rejony (największe najpierw) dostaje handlowiec z najmniejszym obciążeniem.
export function regions(propertyIds, k) { return regionsOf(propertyIds.map(getProperty), k); }
export async function splitByRegion(admin, propertyIds, userIds, due) {
  const load = Object.fromEntries(userIds.map(id => [id, db.assignments.filter(a => a.userId === id && !FINAL.includes(a.status)).length]));
  const groups = regions(propertyIds, userIds.length).sort((a, b) => b.length - a.length);
  let n = 0, blocked = 0;
  const used = new Set();
  for (const g of groups) {
    // jeden rejon na handlowca (dopóki starczy handlowców), najpierw najmniej obciążony
    const free = userIds.filter(id => !used.has(id));
    const u = (free.length ? free : userIds).slice().sort((a, b) => load[a] - load[b])[0];
    used.add(u);
    const r = await assign(admin, g, u, due);
    n += r.n; blocked += r.blocked; load[u] += r.n;
  }
  audit(admin.id, 'assign_region', `${groups.length} rejonów`); save();
  return { n, blocked, groups: groups.length };
}

export async function unassign(admin, propertyIds) {
  const before = db.assignments.length;
  db.assignments = db.assignments.filter(a => !(propertyIds.includes(a.propertyId) && ['ASSIGNED', 'IN_PROGRESS'].includes(a.status)));
  audit(admin.id, 'unassign', `${before - db.assignments.length}`); save();
}

// ---------- wizyty (aplikacja) ----------
export async function startVisit(user, assignmentId) {
  const a = db.assignments.find(x => x.id === assignmentId && x.userId === user.id);
  if (!a) throw new Error('not_found');
  let v = lastVisit(a.id);
  if (v && !v.submittedAt) return v; // kontynuacja
  v = { id: uid(), assignmentId: a.id, propertyId: a.propertyId, userId: user.id, startedAt: Date.now(), status: 'IN_PROGRESS', bio: { pin: sessionBio() } };
  db.visits.push(v);
  a.status = 'IN_PROGRESS'; a.updatedAt = Date.now();
  audit(user.id, 'visit_start', a.propertyId); save();
  return v;
}

// dataUrl — zmniejszone zdjęcie; meta: {ocrText, ocrConf, gps, fileAge}
export async function addPhoto(user, visitId, type, dataUrl, meta = {}) {
  const v = getVisit(visitId);
  if (!v || v.userId !== user.id || v.submittedAt) throw new Error('not_allowed');
  // jedno zdjęcie danego slotu (unit/door wymienne)
  const slot = type === 'building' ? ['building'] : ['unit', 'door'];
  db.photos = db.photos.filter(p => !(p.visitId === visitId && slot.includes(p.type)));
  const id = uid();
  const hash = await perceptualHash(dataUrl).catch(() => null);
  db.photos.push({ id, visitId, type, ocrText: meta.ocrText || '', ocrConf: meta.ocrConf ?? null, hash, takenAt: Date.now(), fileAge: meta.fileAge ?? 0 });
  if (meta.gps) v.gps = meta.gps; // GPS z chwili ostatniego zdjęcia
  v.noUnitNumber = type === 'door' ? true : (type === 'unit' ? false : v.noUnitNumber);
  await idbPut(id, dataUrl);
  save();
  return id;
}

export async function submitVisit(user, visitId, { outcome, note, signature, touch }) {
  const v = getVisit(visitId);
  if (!v || v.userId !== user.id || v.submittedAt) throw new Error('not_allowed');
  v.outcome = outcome; v.note = (note || '').slice(0, 300);
  v.submittedAt = Date.now(); // docelowo znacznik czasu nadaje serwer
  const a = db.assignments.find(x => x.id === v.assignmentId);
  const p = getProperty(v.propertyId);
  const photos = visitPhotos(v.id);
  const otherHashes = db.photos.filter(x => x.visitId !== v.id && x.hash).map(x => x.hash);
  const res = evaluate(p, a, v, photos, otherHashes, db.settings);
  // biometria: flagi dokładane do powodów (gdy włączone „kieruj do weryfikacji”)
  const u = db.users.find(x => x.id === user.id);
  v.bio = { ...(v.bio || {}), sig: sigCheck(u, signature), touch: touchCheck(u, touch) };
  if (signature?.length) v.signature = signature;
  const bioFlags = [['pin', 'r_bio_pin'], ['sig', 'r_bio_sig'], ['touch', 'r_bio_touch']]
    .filter(([k]) => v.bio[k]?.flag).map(([k, code]) => ({ code, n: v.bio[k].score, bio: true }));
  if (bioFlags.length) {
    audit(user.id, 'bio_flag', bioFlags.map(f => f.code).join(', '));
    if (db.settings.bioToReview) { res.reasons.push(...bioFlags); res.status = 'TO_REVIEW'; }
  }
  v.reasons = res.reasons; v.details = res.details; v.status = res.status;
  a.status = res.status; a.updatedAt = Date.now();
  audit(user.id, 'visit_submit', `${p.street} ${p.building}/${p.unit || ''} → ${res.status}`); save();
  emit('visit.submitted', visitRecord(v, p, a, u));
  return v;
}

// ---------- decyzje admina ----------
export async function decide(admin, visitId, decision, reason) {
  const v = getVisit(visitId);
  if (!inScope(admin, v.userId)) throw new Error('forbidden');
  const a = db.assignments.find(x => x.id === v.assignmentId);
  v.decision = decision; v.decisionReason = reason || null; v.decidedBy = admin.id; v.decidedAt = Date.now();
  if (decision === 'approve') { v.status = a.status = 'APPROVED'; }
  if (decision === 'reject') { v.status = a.status = 'REJECTED'; }
  if (decision === 'revisit') { v.status = 'REJECTED'; a.status = 'ASSIGNED'; }
  if (decision === 'reopen') { v.status = a.status = 'TO_REVIEW'; v.decision = null; }
  a.updatedAt = Date.now();
  const p = getProperty(v.propertyId);
  audit(admin.id, 'decision_' + decision, `${p.street} ${p.building}/${p.unit || ''}${reason ? ' — ' + reason : ''}`); save();
  emit('visit.decided', { ...visitRecord(v, p, a, getUser(v.userId)), decided_by: { id: admin.id, name: admin.name } });
}

// ---------- zdjęcia ----------
export async function photoUrl(photo) {
  if (photo.purged) return null;
  if (photo.synthetic) return syntheticPhoto(photo.label, photo.type);
  return (await idbGet(photo.id)) || null;
}
export async function logEvent(user, action, object) { audit(user.id, action, object); save(); }
export async function logPhotoDownload(admin, photo) {
  requireAdmin(admin); audit(admin.id, 'photo_download', photo.id); save(); }

// Obrazek demo (tabliczka/drzwi) rysowany w locie dla danych przykładowych
const synthCache = new Map();
function syntheticPhoto(label, type) {
  const key = type + '|' + label;
  if (synthCache.has(key)) return synthCache.get(key);
  const c = document.createElement('canvas');
  c.width = 480; c.height = 360;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 360);
  if (type === 'building') { grad.addColorStop(0, '#9aa5b1'); grad.addColorStop(1, '#5d6b78'); }
  else { grad.addColorStop(0, '#7b5e45'); grad.addColorStop(1, '#4a3727'); }
  g.fillStyle = grad; g.fillRect(0, 0, 480, 360);
  // faktura
  g.globalAlpha = .08; g.fillStyle = '#000';
  for (let i = 0; i < 40; i++) g.fillRect(0, i * 9, 480, 1);
  g.globalAlpha = 1;
  if (type === 'building') {
    g.fillStyle = '#1f4fa3'; g.fillRect(70, 120, 340, 110);
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(80, 130, 320, 90);
    g.fillStyle = '#fff'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 240, 175);
  } else {
    g.fillStyle = '#c9a227'; g.beginPath(); g.ellipse(240, 150, 60, 42, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#222'; g.font = 'bold 48px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 240, 152);
    g.fillStyle = '#d9d9d9'; g.beginPath(); g.arc(400, 220, 10, 0, Math.PI * 2); g.fill();
  }
  const url = c.toDataURL('image/jpeg', .8);
  synthCache.set(key, url);
  return url;
}

// ---------- powiadomienia (w panelu; e-mail/push po stronie serwera w kolejnym etapie) ----------
export function notifications(admin) {
  const s = db.settings, now = Date.now(), out = [];
  const A = db.assignments.filter(a => inScope(admin, a.userId));
  const queue = A.filter(a => a.status === 'TO_REVIEW').length;
  if (queue >= s.notifyQueue) out.push({ id: 'queue', kind: 'queue', n: queue, ts: now, sticky: true });
  const open = A.filter(a => ['ASSIGNED', 'IN_PROGRESS'].includes(a.status) && a.due);
  const end = a => new Date(a.due + 'T23:59:59').getTime();
  const overdue = open.filter(a => end(a) < now).length;
  const soon = open.filter(a => end(a) >= now && end(a) - now <= s.notifyDueH * 3600000).length;
  if (overdue) out.push({ id: 'overdue', kind: 'overdue', n: overdue, ts: now, sticky: true });
  if (soon) out.push({ id: 'soon', kind: 'soon', n: soon, h: s.notifyDueH, ts: now, sticky: true });
  const seen = admin.notifSeen || 0;
  for (const e of db.audit) {
    if (e.ts <= seen) break; // audit posortowany od najnowszych
    if (['screenshot_attempt', 'bio_flag', 'bio_pin_flag'].includes(e.action) && inScope(admin, e.userId))
      out.push({ id: e.id, kind: e.action, who: getUser(e.userId)?.name || '—', obj: e.object, ts: e.ts });
  }
  return out;
}
export async function markNotifSeen(admin) {
  const u = db.users.find(x => x.id === admin.id); u.notifSeen = Date.now(); save();
}

// Retencja: zdjęcia starsze niż retentionDays są usuwane (zostaje opis wizyty i wynik kontroli)
export async function purgeOldPhotos(admin) {
  const limit = Date.now() - db.settings.retentionDays * 864e5;
  const old = db.photos.filter(p => !p.purged && p.takenAt < limit);
  if (!old.length) return 0;
  const idbDb = await idb();
  await new Promise(res => { const tx = idbDb.transaction('photos', 'readwrite'); old.forEach(p => tx.objectStore('photos').delete(p.id)); tx.oncomplete = res; tx.onerror = res; });
  old.forEach(p => { p.purged = true; p.synthetic = false; });
  audit(admin.id, 'retention_purge', `${old.length} zdjęć > ${db.settings.retentionDays} dni`); save();
  return old.length;
}

// ---------- integracja z CRM ----------
function emit(event, data) {
  const s = db.settings;
  if (!s.whUrl || !(s.whEvents || []).includes(event)) return;
  deliver(s.whUrl, s.whToken, event, data).then(r => logDelivery(event, r));
}
function logDelivery(event, r) {
  db = load() || db; // świeży stan (wysyłka jest asynchroniczna)
  (db.webhookLog ??= []).unshift({ ts: Date.now(), event, ...r });
  db.webhookLog.length = Math.min(db.webhookLog.length, 30);
  save();
  changeListeners.forEach(fn => fn());
}
export const webhookLog = () => (db.webhookLog || []).slice();
export async function testWebhook(admin) {
  if (!isAdmin(admin)) throw new Error('forbidden');
  const r = await deliver(db.settings.whUrl, db.settings.whToken, 'test', { message: 'FieldCheck — test połączenia', by: admin.name });
  logDelivery('test', r);
  return r;
}
// Eksport całości w formacie wymiany (schema 1) — tylko admin, z wpisem w audycie
export async function exportJson(admin) {
  if (!isAdmin(admin)) throw new Error('forbidden');
  audit(admin.id, 'export', 'JSON (CRM)'); save();
  return {
    schema: SCHEMA_VERSION, source: 'fieldcheck', exportedAt: new Date().toISOString(),
    properties: db.properties.map(p => ({ id: p.id, external_id: p.external_id || null, case_type: p.case_type || null, street: p.street, building: p.building, unit: p.unit || null, zip: p.zip, city: p.city, lat: p.lat, lng: p.lng, notes: p.notes || null })),
    reps: db.users.filter(u => u.role === 'rep').map(u => ({ id: u.id, name: u.name, email: u.email || null, active: u.active })),
    assignments: db.assignments.map(a => ({ id: a.id, property_id: a.propertyId, rep_id: a.userId, due: a.due || null, status: a.status })),
    visits: db.visits.filter(v => v.submittedAt).map(v => visitRecord(v, getProperty(v.propertyId), db.assignments.find(a => a.id === v.assignmentId), getUser(v.userId))),
  };
}

// ---------- reset / seed ----------
export async function resetDemo() { db = seedData(); save(); await idbClear(); }
export async function clearAll() {
  const admin = db.users.find(u => u.role === 'admin');
  db = empty(); db.users.push(admin); save(); await idbClear();
}

function seedData() {
  const d = empty();
  const now = Date.now();
  d.settings.caseTypes = ['Egzekucja', 'Kredyt', 'Ponaglenie', 'Korespondencja'].map((name, i) => ({ name, color: ['#DC2626', '#2F6FED', '#F59E0B', '#0E9F8E'][i], guide: `Przykładowe wskazówki dla rodzaju „${name}” — treść ustala administrator w Ustawieniach → Rodzaje spraw.` }));
  const admin = { id: uid(), role: 'admin', name: 'Admin', email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, active: true, sv: 0 };
  d.users.push(admin);
  const repNames = ['Anna K.', 'Piotr N.', 'Marta S.', 'Tomasz W.', 'Karol B.'];
  const reps = repNames.map((name, i) => ({
    id: uid(), role: 'rep', name, email: `handlowiec${i + 1}@fieldcheck.demo`, pin: DEMO_PIN, active: true,
    deviceId: null, sv: 0,
  }));
  d.users.push(...reps);

  // 50 adresów w Kaliszu (współrzędne przybliżone — dane demo)
  const streets = [
    ['Poznańska', 51.7680, 18.0865], ['Górnośląska', 51.7535, 18.0985], ['Śródmiejska', 51.7618, 18.0905],
    ['Wrocławska', 51.7520, 18.0790], ['Zamkowa', 51.7628, 18.0880], ['Częstochowska', 51.7560, 18.1010],
    ['Babina', 51.7605, 18.0870], ['Złota', 51.7640, 18.0915], ['Majkowska', 51.7700, 18.1040], ['Kościuszki', 51.7590, 18.0930],
  ];
  let r = 7;
  const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
  for (let i = 0; i < 50; i++) {
    const [street, lat, lng] = streets[i % streets.length];
    const building = String(2 + Math.floor(i / streets.length) * 4 + Math.floor(rnd() * 3));
    const unit = String(1 + Math.floor(rnd() * 30));
    d.properties.push({
      id: uid(), street, building, unit, zip: '62-800', city: 'Kalisz', case_type: ['Egzekucja', 'Kredyt', 'Ponaglenie', 'Korespondencja'][Math.floor(rnd() * 4)],
      lat: +(lat + (rnd() - .5) * .004).toFixed(6), lng: +(lng + (rnd() - .5) * .006).toFixed(6),
      notes: '', createdAt: now - 7 * 864e5,
    });
  }

  // termin: najbliższa niedziela
  const due = new Date(now); due.setDate(due.getDate() + ((7 - due.getDay()) % 7));
  const dueStr = due.toISOString().slice(0, 10);

  // przypisanie po 10, a wizyty wg scenariusza z dokumentacji (31 auto, 3 ręcznie, 7 do weryfikacji, 2 odrzucone, 7 do zrobienia)
  const plan = [
    ...Array(31).fill('AUTO_VERIFIED'), ...Array(3).fill('APPROVED'),
    ...Array(7).fill('TO_REVIEW'), ...Array(2).fill('REJECTED'), ...Array(7).fill('ASSIGNED'),
  ];
  // rozkład „do zrobienia”, żeby realizacja wyszła 100/90/90/80/70%
  const todoPerRep = [0, 1, 1, 2, 3];
  const order = [];
  reps.forEach((rep, ri) => {
    const props = d.properties.slice(ri * 10, ri * 10 + 10);
    props.forEach((p, k) => order.push({ rep, p, todo: k >= 10 - todoPerRep[ri] }));
  });
  const doneStatuses = plan.filter(s => s !== 'ASSIGNED');
  for (let i = doneStatuses.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [doneStatuses[i], doneStatuses[j]] = [doneStatuses[j], doneStatuses[i]]; }
  const reviewReasons = [
    [{ code: 'r_ocr_unit_unreadable' }], [{ code: 'r_gps_far', n: 240 }], [{ code: 'r_street_mismatch', n: 71 }],
    [{ code: 'r_duplicate' }], [{ code: 'r_no_unit_number' }], [{ code: 'r_unit_mismatch' }], [{ code: 'r_late' }],
  ];
  let di = 0, ri2 = 0;
  for (const { rep, p, todo } of order) {
    const a = { id: uid(), propertyId: p.id, userId: rep.id, due: dueStr, status: 'ASSIGNED', assignedBy: admin.id, createdAt: now - 6 * 864e5, updatedAt: now };
    d.assignments.push(a);
    if (todo) continue;
    const status = doneStatuses[di++ % doneStatuses.length];
    const dayAgo = Math.floor(rnd() * 5);
    const start = new Date(now - dayAgo * 864e5); start.setHours(9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60), 0, 0);
    const startedAt = Math.min(start.getTime(), now - 3600e3);
    const submittedAt = startedAt + (4 + Math.floor(rnd() * 12)) * 60000;
    let reasons = [], dist = 5 + Math.floor(rnd() * 50);
    if (status === 'TO_REVIEW' || status === 'APPROVED' || status === 'REJECTED') {
      reasons = reviewReasons[ri2++ % reviewReasons.length];
      const far = reasons.find(x => x.code === 'r_gps_far'); if (far) dist = far.n;
    }
    const off = dist / 111000;
    const v = {
      id: uid(), assignmentId: a.id, propertyId: p.id, userId: rep.id, startedAt, submittedAt,
      gps: { lat: p.lat + off * .7, lng: p.lng + off * .7 / Math.cos(p.lat * Math.PI / 180), acc: 8 + Math.floor(rnd() * 15) },
      outcome: OUTCOMES[Math.floor(rnd() ** 1.6 * 4)], note: '', status, reasons,
      details: { distance: dist, gapMin: 1 + Math.floor(rnd() * 4), streetScore: reasons[0]?.code === 'r_street_mismatch' ? 71 : 96 + Math.floor(rnd() * 5), buildingOk: true, unitOk: !reasons.some(x => ['r_unit_mismatch', 'r_ocr_unit_unreadable'].includes(x.code)), duplicate: reasons.some(x => x.code === 'r_duplicate'), cameraOk: true },
    };
    if (status === 'APPROVED' || status === 'REJECTED') {
      v.decision = status === 'APPROVED' ? 'approve' : 'reject';
      v.decidedBy = admin.id; v.decidedAt = submittedAt + (2 + Math.floor(rnd() * 20)) * 3600e3;
      if (v.decidedAt > now) v.decidedAt = now - 600e3;
      if (status === 'REJECTED') v.decisionReason = 'rr_duplicate';
    }
    a.status = status;
    d.visits.push(v);
    const unitLabel = reasons.some(x => x.code === 'r_ocr_unit_unreadable') ? p.unit + '?' :
      reasons.some(x => x.code === 'r_unit_mismatch') ? String(+p.unit + 1) : p.unit;
    const streetLabel = reasons.some(x => x.code === 'r_street_mismatch') ? 'POZNAŃSKA' : p.street.toUpperCase();
    d.photos.push({ id: uid(), visitId: v.id, type: 'building', synthetic: true, label: `${streetLabel} ${p.building}`, ocrText: `${streetLabel} ${p.building}`, ocrConf: 90, hash: null, takenAt: startedAt + 120e3, fileAge: 0 });
    const door = reasons.some(x => x.code === 'r_no_unit_number');
    d.photos.push({ id: uid(), visitId: v.id, type: door ? 'door' : 'unit', synthetic: true, label: door ? '' : unitLabel, ocrText: door ? '' : unitLabel.replace('?', ''), ocrConf: unitLabel.includes('?') ? 30 : 88, hash: null, takenAt: startedAt + 120e3 + v.details.gapMin * 60e3, fileAge: 0 });
    if (reasons.some(x => x.code === 'r_ocr_unit_unreadable')) d.photos[d.photos.length - 1].ocrText = '';
  }
  d.users.push({ id: uid(), role: 'manager', name: 'Kierownik Zespołu', email: DEMO_MANAGER.email, password: DEMO_MANAGER.password, active: true, sv: 0, team: reps.slice(0, 3).map(r => r.id) });
  d.audit.push({ id: uid(), userId: admin.id, action: 'seed', object: 'dane demo', ts: now });
  return d;
}

if (!db) { db = seedData(); save(); }
// migracja danych demo sprzed 0.5: dodaj przykładowego managera
if (!db.users.some(u => u.role === 'manager') && db.users.some(u => u.email === DEMO_ADMIN.email)) {
  db.users.push({ id: uid(), role: 'manager', name: 'Kierownik Zespołu', email: DEMO_MANAGER.email, password: DEMO_MANAGER.password, active: true, sv: 0, team: db.users.filter(u => u.role === 'rep').slice(0, 3).map(r => r.id) });
  save();
}
