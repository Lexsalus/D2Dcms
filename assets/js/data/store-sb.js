// Warstwa danych na Supabase — to samo API co store.js (prototyp lokalny), więc ekrany się nie zmieniają.
// Dane (w zakresie dozwolonym przez RLS) trzymane są w pamięci podręcznej i odświeżane po każdej zmianie
// oraz co 20 s; odczyty są synchroniczne, zapisy idą do bazy / funkcji RPC.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from '../core/config.js';
import { DEFAULT_SETTINGS, perceptualHash } from '../domain/verify.js';
import { BIO_DEFAULTS, pinVector, pinScore, sigFeatures, sigScore, touchScore } from '../domain/biometrics.js';
import { visitRecord, SCHEMA_VERSION } from '../domain/integration.js';
import { regionsOf } from '../domain/route.js';

export const MODE = 'supabase';
export const OUTCOMES = ['talked', 'no_answer', 'refused', 'later'];
export const FINAL = ['AUTO_VERIFIED', 'APPROVED', 'REJECTED'];
export const SUBMITTED_SET = ['SUBMITTED', 'AUTO_VERIFIED', 'TO_REVIEW', 'APPROVED', 'REJECTED'];
export const DEMO_ADMIN = null, DEMO_MANAGER = null, DEMO_PIN = null;
const SETTINGS0 = { ...DEFAULT_SETTINGS, ...BIO_DEFAULTS, demoGps: false, require2fa: false, whEvents: ['visit.submitted', 'visit.decided'] };

// link z zaproszenia / resetu hasła — rozpoznajemy przed inicjalizacją klienta (klient czyści adres)
const hashParams = new URLSearchParams(location.hash.slice(1));
export const authLink = ['invite', 'recovery', 'signup', 'magiclink'].includes(hashParams.get('type')) ? hashParams.get('type') : null;
export const authLinkError = hashParams.get('error_description');

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } });

// ---------- pamięć podręczna ----------
let me = null;
const C = { users: [], properties: [], assignments: [], visits: [], photos: [], audit: [], bio: [], settings: {}, secrets: {}, deliveries: [] };
const ms = t => (t ? new Date(t).getTime() : null);
const mapUser = r => ({ id: r.id, role: r.role, name: r.name, email: r.email, active: r.active, deviceId: r.device_id, sv: r.session_version, team: r.team || [] });
const mapProp = r => ({ ...r });
const mapAsg = r => ({ id: r.id, propertyId: r.property_id, userId: r.user_id, due: r.due, status: r.status, assignedBy: r.assigned_by, createdAt: ms(r.created_at), updatedAt: ms(r.updated_at) });
const mapVisit = r => ({
  id: r.id, assignmentId: r.assignment_id, propertyId: r.property_id, userId: r.user_id, startedAt: ms(r.started_at), submittedAt: ms(r.submitted_at),
  gps: r.gps_lat != null ? { lat: r.gps_lat, lng: r.gps_lng, acc: r.gps_accuracy } : null, outcome: r.outcome, note: r.note, status: r.status,
  reasons: r.reasons || [], details: r.details || {}, bio: r.bio, signature: r.signature, decision: r.decision, decisionReason: r.decision_reason,
  decidedBy: r.decided_by, decidedAt: ms(r.decided_at),
});
const mapPhoto = r => ({ id: r.id, visitId: r.visit_id, type: r.type, storageKey: r.storage_key, ocrText: r.ocr_text, ocrConf: r.ocr_conf, hash: r.phash, takenAt: ms(r.taken_at), fileAge: r.file_age_ms, purged: r.purged });
const mapAudit = r => ({ id: r.id, userId: r.user_id, action: r.action, object: r.object, ip: r.ip, ts: ms(r.ts) });

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); }
const fire = () => listeners.forEach(fn => { try { fn(); } catch { /* ekran sam się odświeży */ } });

const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { me = null; return null; }
  const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  me = data ? mapUser(data) : null;
  return me;
}

export async function refresh() {
  if (!me) return;
  const panel = me.role !== 'rep';
  const q = [
    sb.from('profiles').select('*'),
    sb.from('properties').select('*'),
    sb.from('assignments').select('*'),
    sb.from('visits').select('*').order('started_at', { ascending: false }).limit(5000),
    sb.from('photos').select('*').limit(10000),
    sb.from('settings').select('data').eq('id', 1).maybeSingle(),
    sb.from('bio_profiles').select('*'),
    panel ? sb.from('audit_log').select('*').order('ts', { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
    me.role === 'admin' ? sb.from('secrets').select('*') : Promise.resolve({ data: [] }),
    me.role === 'admin' ? sb.rpc('webhook_deliveries') : Promise.resolve({ data: [] }),
  ];
  const [pr, pp, as, vi, ph, st, bi, au, se, de] = await Promise.all(q);
  C.users = (pr.data || []).map(mapUser);
  C.properties = (pp.data || []).map(mapProp);
  C.assignments = (as.data || []).map(mapAsg);
  C.visits = (vi.data || []).map(mapVisit);
  C.photos = (ph.data || []).map(mapPhoto);
  C.settings = st.data?.data || {};
  C.bio = bi.data || [];
  C.users.forEach(u => { u.bio = C.bio.some(b => b.user_id === u.id); });
  C.audit = (au.data || []).map(mapAudit);
  C.secrets = Object.fromEntries((se.data || []).map(r => [r.key, r.value]));
  C.deliveries = (de.data || []).map(d => ({ ts: ms(d.ts), event: d.event, status: d.status, code: d.code, ms: d.ms }));
  const fresh = C.users.find(u => u.id === me.id);
  if (fresh) {
    // zdalne wylogowanie / dezaktywacja
    const sv = +localStorage.getItem('fc.sb.sv');
    if (!fresh.active || (Number.isFinite(sv) && localStorage.getItem('fc.sb.sv') !== null && fresh.sv !== sv)) { await signOutLocal(); fire(); return; }
    me = fresh;
  }
}
const changed = async () => { await refresh(); fire(); };

// odświeżanie w tle
setInterval(() => { if (me && document.visibilityState === 'visible') changed(); }, 20000);
document.addEventListener('visibilitychange', () => { if (me && document.visibilityState === 'visible') changed(); });

// start: przywrócenie sesji
await loadMe().catch(() => null);
if (me) await refresh().catch(() => null);

// ---------- sesje ----------
export const sessionExpired = { admin: false, rep: false };
const markLogin = () => { localStorage.setItem('fc.sb.start', Date.now()); localStorage.setItem('fc.sb.seen', Date.now()); localStorage.setItem('fc.sb.sv', me?.sv ?? 0); };
async function signOutLocal() {
  me = null;
  ['fc.sb.start', 'fc.sb.seen', 'fc.sb.sv', 'fc.sb.pinBio'].forEach(k => localStorage.removeItem(k));
  await sb.auth.signOut().catch(() => {});
}
export function currentUser(kind) {
  if (!me || !me.active) return null;
  const ok = kind === 'admin' ? ['admin', 'manager'].includes(me.role) : me.role === 'rep';
  if (!ok) return null;
  const s = C.settings, now = Date.now();
  const expired = kind === 'admin'
    ? now - (+localStorage.getItem('fc.sb.seen') || now) > (s.sessionMin ?? SETTINGS0.sessionMin) * 60000
    : now - (+localStorage.getItem('fc.sb.start') || now) > (s.repSessionH ?? SETTINGS0.repSessionH) * 3600000;
  if (expired) { sessionExpired[kind] = true; signOutLocal(); return null; }
  return me;
}
export function touchSession() {
  const seen = +localStorage.getItem('fc.sb.seen') || 0;
  if (me && Date.now() - seen > 20000) localStorage.setItem('fc.sb.seen', Date.now());
}
export function logout() { signOutLocal().then(fire); }

export function deviceId() {
  let id = localStorage.getItem('fc.deviceId');
  if (!id) { id = 'DEV-' + Math.random().toString(36).slice(2, 8).toUpperCase(); localStorage.setItem('fc.deviceId', id); }
  return id;
}

// ---------- logowanie, hasło, 2FA ----------
async function afterSignIn(kindRoles) {
  await loadMe();
  if (!me || !kindRoles.includes(me.role)) { await signOutLocal(); throw new Error('bad_login'); }
  if (!me.active) { await signOutLocal(); throw new Error('account_inactive'); }
}
export async function loginAdmin(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error('bad_login');
  await afterSignIn(['admin', 'manager']);
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') { const e = new Error('mfa_required'); throw e; }
  markLogin(); await refresh();
  await sb.rpc('log_event', { p_action: 'login', p_object: 'panel' });
  return me;
}
// kod z aplikacji uwierzytelniającej przy logowaniu
export async function mfaLogin(code) {
  const { data } = await sb.auth.mfa.listFactors();
  const f = (data?.totp || []).find(x => x.status === 'verified');
  if (!f) throw new Error('mfa_none');
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: String(code).trim() });
  if (error) throw new Error('mfa_bad_code');
  await loadMe(); markLogin(); await refresh();
  await sb.rpc('log_event', { p_action: 'login', p_object: 'panel (2FA)' });
  return me;
}
export async function mfaStatus() {
  const { data } = await sb.auth.mfa.listFactors();
  const f = (data?.totp || []).find(x => x.status === 'verified');
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  return { enabled: !!f, factorId: f?.id || null, level: aal?.currentLevel };
}
export async function mfaEnroll() {
  // usuń niedokończone próby
  const { data: list } = await sb.auth.mfa.listFactors();
  for (const f of (list?.all || []).filter(x => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'FieldCheck ' + new Date().toISOString().slice(0, 10) });
  if (error) throw new Error(error.message);
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}
export async function mfaConfirm(factorId, code) {
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: String(code).trim() });
  if (error) throw new Error('mfa_bad_code');
  await sb.rpc('log_event', { p_action: '2fa_on', p_object: me?.email || '' });
}
export async function mfaDisable() {
  const { data } = await sb.auth.mfa.listFactors();
  for (const f of data?.all || []) { const { error } = await sb.auth.mfa.unenroll({ factorId: f.id }); if (error) throw new Error(error.message); }
  await sb.auth.refreshSession();
  await sb.rpc('log_event', { p_action: '2fa_off', p_object: me?.email || '' });
}
export async function setPassword(pw) {
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) throw new Error(error.message);
  await loadMe(); if (me) { markLogin(); await refresh(); }
}
export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
  if (error) throw new Error(error.message);
}

// Handlowiec: e-mail + hasło (raz na urządzeniu), rytm wpisywania hasła jako sygnał biometrii
export async function loginRep(email, password, pinTimes = []) {
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error('bad_login');
  await afterSignIn(['rep']);
  const { error: de } = await sb.rpc('bind_device', { p_device: deviceId() });
  if (de) { await signOutLocal(); throw new Error(/device_bound/.test(de.message) ? 'device_bound' : 'bad_login'); }
  markLogin(); await refresh();
  const pinBio = await pinCheck(pinTimes);
  if (pinBio) localStorage.setItem('fc.sb.pinBio', JSON.stringify(pinBio));
  await sb.rpc('log_event', { p_action: pinBio?.flag ? 'bio_pin_flag' : 'login', p_object: 'app ' + deviceId() + (pinBio?.flag ? ` score ${pinBio.score}` : '') });
  return me;
}
export function sessionBio() { try { return JSON.parse(localStorage.getItem('fc.sb.pinBio')); } catch { return null; } }

// ---------- uprawnienia ----------
export function scope(u) { return u?.role === 'manager' ? (u.team || []) : null; }
export const inScope = (u, repId) => { const s = scope(u); return !s || s.includes(repId); };
export const isAdmin = u => u?.role === 'admin';

// ---------- odczyty (synchroniczne z pamięci podręcznej) ----------
export const getSettings = async () => ({ ...SETTINGS0, ...C.settings, whUrl: C.secrets.whUrl || '', whToken: C.secrets.whToken || '' });
export const listReps = async () => C.users.filter(u => u.role === 'rep');
export const listManagers = async () => C.users.filter(u => u.role === 'manager' || u.role === 'admin');
export const getUser = id => C.users.find(u => u.id === id);
export const listProperties = async () => C.properties.slice();
export const getProperty = id => C.properties.find(p => p.id === id);
export const listAssignments = async () => C.assignments.slice();
export const assignmentFor = pid => C.assignments.find(a => a.propertyId === pid);
export const listVisits = async () => C.visits.slice();
export const getVisit = id => C.visits.find(v => v.id === id);
export const visitPhotos = vid => {
  // najnowsze zdjęcie w każdym slocie (budynek / lokal-drzwi)
  const all = C.photos.filter(p => p.visitId === vid).sort((a, b) => b.takenAt - a.takenAt);
  const b = all.find(p => p.type === 'building'), u = all.find(p => p.type !== 'building');
  return [b, u].filter(Boolean);
};
export const listAudit = async () => C.audit.slice();
export const lastVisit = aid => C.visits.filter(v => v.assignmentId === aid).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];
export async function myAssignments(uid) {
  return C.assignments.filter(a => a.userId === uid).map(a => ({ ...a, property: getProperty(a.propertyId), visit: lastVisit(a.id) })).filter(a => a.property);
}

// ---------- ustawienia ----------
export async function saveSettings(admin, s) {
  const { whUrl, whToken, ...rest } = s;
  must(await sb.from('settings').update({ data: { ...C.settings, ...rest } }).eq('id', 1));
  if (whUrl !== undefined) {
    must(await sb.from('secrets').upsert([{ key: 'whUrl', value: whUrl }, { key: 'whToken', value: whToken || '' }]));
  }
  await sb.rpc('log_event', { p_action: 'settings', p_object: Object.keys(s).join(',').slice(0, 200) });
  await changed();
}

// ---------- konta (Edge Function admin-users) ----------
async function adminFn(body) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'error');
  return j;
}
const panelUrl = () => new URL('../admin/', location.href).href;
export async function saveRep(admin, rep) {
  if (rep.id) {
    must(await sb.from('profiles').update({ name: rep.name }).eq('id', rep.id));
    if (rep.password) await adminFn({ action: 'set_password', user_id: rep.id, password: rep.password });
  } else {
    await adminFn({ action: 'create', role: 'rep', email: rep.email, name: rep.name, password: rep.password });
  }
  await changed();
}
export async function saveManager(admin, m) {
  if (m.id) must(await sb.from('profiles').update({ name: m.name, team: m.team || [] }).eq('id', m.id));
  let r = null;
  if (!m.id) r = await adminFn({ action: 'create', role: m.role || 'manager', email: m.email, name: m.name, team: m.team || [], redirectTo: panelUrl() });
  await changed();
  return r?.link || null;
}
export async function sendPasswordReset(admin, userId) { return (await adminFn({ action: 'reinvite', user_id: userId, redirectTo: panelUrl() })).link || null; }
export async function repAction(admin, id, action) {
  const u = getUser(id);
  const patch = {
    activate: { active: true }, deactivate: { active: false, session_version: (u.sv || 0) + 1 },
    reset_device: { device_id: null }, remote_logout: { session_version: (u.sv || 0) + 1 },
  }[action];
  if (patch) must(await sb.from('profiles').update(patch).eq('id', id));
  if (action === 'reset_bio') must(await sb.from('bio_profiles').delete().eq('user_id', id));
  await sb.rpc('log_event', { p_action: 'rep_' + action, p_object: u?.name || id });
  await changed();
}

// ---------- adresy i przypisania ----------
const keyOf = p => [p.street, p.building, p.unit, p.city].map(x => String(x || '').trim().toLowerCase()).join('|');
const propRow = p => ({ street: p.street, building: p.building, unit: p.unit || null, zip: p.zip || null, city: p.city, notes: p.notes || null, lat: p.lat ?? null, lng: p.lng ?? null, external_id: p.external_id || null, created_by: me.id });
export async function addProperty(admin, p) {
  if (C.properties.some(x => keyOf(x) === keyOf(p))) throw new Error('duplicate_address');
  const rec = must(await sb.from('properties').insert(propRow(p)).select().single());
  await sb.rpc('log_event', { p_action: 'property_create', p_object: `${p.street} ${p.building}/${p.unit || ''}` });
  await changed();
  return rec;
}
export async function importProperties(admin, rows) {
  let dup = 0, err = 0;
  const seen = new Set(C.properties.map(keyOf)), ok = [];
  for (const r of rows) {
    if (!r.street || !r.building || !r.city) { err++; continue; }
    const k = keyOf(r); if (seen.has(k)) { dup++; continue; }
    seen.add(k); ok.push(propRow(r));
  }
  for (let i = 0; i < ok.length; i += 200) {
    const { error } = await sb.from('properties').insert(ok.slice(i, i + 200));
    if (error) err += Math.min(200, ok.length - i);
  }
  await sb.rpc('log_event', { p_action: 'import', p_object: `${ok.length} adresów` });
  await changed();
  return { added: ok.length, dup, err };
}
export async function updateProperty(id, patch) { must(await sb.from('properties').update(patch).eq('id', id)); await refresh(); }
export async function deleteProperties(admin, ids) {
  const blocked = ids.filter(id => { const a = assignmentFor(id); return a && SUBMITTED_SET.includes(a.status); });
  const ok = ids.filter(id => !blocked.includes(id));
  if (ok.length) must(await sb.from('properties').delete().in('id', ok));
  await sb.rpc('log_event', { p_action: 'property_delete', p_object: String(ok.length) });
  await changed();
  return { deleted: ok.length, blocked: blocked.length };
}
export async function assign(admin, propertyIds, userId, due) {
  let blocked = 0; const rows = [];
  for (const pid of propertyIds) {
    const a = assignmentFor(pid);
    if (a && !['ASSIGNED', 'IN_PROGRESS', 'REJECTED'].includes(a.status)) { blocked++; continue; }
    rows.push({ property_id: pid, user_id: userId, due: due || null, status: 'ASSIGNED', assigned_by: me.id, updated_at: new Date().toISOString() });
  }
  if (rows.length) must(await sb.from('assignments').upsert(rows, { onConflict: 'property_id' }));
  await sb.rpc('log_event', { p_action: 'assign', p_object: `${rows.length} → ${getUser(userId)?.name}` });
  await changed();
  return { n: rows.length, blocked };
}
export async function splitEvenly(admin, propertyIds, userIds, due) {
  const load = Object.fromEntries(userIds.map(id => [id, C.assignments.filter(a => a.userId === id && !FINAL.includes(a.status)).length]));
  const plan = {};
  for (const pid of propertyIds) { const u = userIds.slice().sort((a, b) => load[a] - load[b])[0]; (plan[u] ??= []).push(pid); load[u]++; }
  let n = 0, blocked = 0;
  for (const u in plan) { const r = await assign(admin, plan[u], u, due); n += r.n; blocked += r.blocked; }
  return { n, blocked };
}
export function regions(propertyIds, k) { return regionsOf(propertyIds.map(getProperty), k); }
export async function splitByRegion(admin, propertyIds, userIds, due) {
  const load = Object.fromEntries(userIds.map(id => [id, C.assignments.filter(a => a.userId === id && !FINAL.includes(a.status)).length]));
  const groups = regions(propertyIds, userIds.length).sort((a, b) => b.length - a.length);
  const used = new Set(); let n = 0, blocked = 0;
  for (const g of groups) {
    const free = userIds.filter(id => !used.has(id));
    const u = (free.length ? free : userIds).slice().sort((a, b) => load[a] - load[b])[0];
    used.add(u);
    const r = await assign(admin, g, u, due); n += r.n; blocked += r.blocked; load[u] += r.n;
  }
  return { n, blocked, groups: groups.length };
}
export async function unassign(admin, propertyIds) {
  must(await sb.from('assignments').delete().in('property_id', propertyIds).in('status', ['ASSIGNED', 'IN_PROGRESS']));
  await sb.rpc('log_event', { p_action: 'unassign', p_object: String(propertyIds.length) });
  await changed();
}

// ---------- wizyty (aplikacja) ----------
export async function startVisit(user, assignmentId) {
  const vid = must(await sb.rpc('start_visit', { p_assignment: assignmentId }));
  await refresh();
  return getVisit(vid) || { id: vid };
}
const dataUrlBlob = async url => (await fetch(url)).blob();
export async function addPhoto(user, visitId, type, dataUrl, meta = {}) {
  const key = `${user.id}/${visitId}/${type}-${Date.now()}.jpg`;
  must(await sb.storage.from('photos').upload(key, await dataUrlBlob(dataUrl), { contentType: 'image/jpeg', upsert: false }));
  const hash = await perceptualHash(dataUrl).catch(() => null);
  must(await sb.from('photos').insert({ visit_id: visitId, type, storage_key: key, ocr_text: meta.ocrText || '', ocr_conf: meta.ocrConf ?? null, phash: hash, file_age_ms: Math.round(meta.fileAge || 0) }));
  if (meta.gps) must(await sb.from('visits').update({ gps_lat: meta.gps.lat, gps_lng: meta.gps.lng, gps_accuracy: meta.gps.acc }).eq('id', visitId));
  photoCache.set(key, { url: dataUrl, ts: Date.now() + 864e5 });
  await refresh();
  return key;
}

// biometria: profil handlowca w bio_profiles
const myBio = () => C.bio.find(b => b.user_id === me?.id) || { user_id: me?.id, pin: [], sig: [], touch: [] };
async function saveBio(b) { await sb.from('bio_profiles').upsert({ user_id: me.id, pin: b.pin, sig: b.sig, touch: b.touch, updated_at: new Date().toISOString() }); }
async function pinCheck(times) {
  const s = await getSettings();
  if (!s.bioPin || times.length < 4) return null;
  const vec = pinVector(times), B = myBio();
  const same = B.pin.filter(x => x.length === vec.length);
  let res;
  if (same.length < s.bioPinEnroll) { B.pin.push(vec); res = { state: 'enroll', n: same.length + 1, of: s.bioPinEnroll }; }
  else {
    const score = pinScore(same.slice(-10), vec), flag = score > s.bioPinTh;
    if (!flag) { B.pin.push(vec); if (B.pin.length > 30) B.pin.shift(); }
    res = { state: 'check', score, flag };
  }
  await saveBio(B);
  return res;
}
export async function submitVisit(user, visitId, { outcome, note, signature, touch }) {
  const s = await getSettings(), B = myBio();
  const bio = { pin: sessionBio() };
  if (s.bioSig && signature?.length) {
    const f = sigFeatures(signature);
    if (f) {
      if (B.sig.length < s.bioSigEnroll) { B.sig.push(f); bio.sig = { state: 'enroll', n: B.sig.length, of: s.bioSigEnroll }; }
      else { const r = sigScore(B.sig, f); bio.sig = { state: 'check', ...r, flag: r.score > s.bioSigTh }; }
    }
  }
  if (s.bioTouch && touch) {
    if (B.touch.length < s.bioTouchEnroll) { B.touch.push(touch); bio.touch = { state: 'enroll', n: B.touch.length, of: s.bioTouchEnroll }; }
    else {
      const score = touchScore(B.touch.slice(-20), touch), flag = score != null && score > s.bioTouchTh;
      if (!flag && score != null) { B.touch.push(touch); if (B.touch.length > 40) B.touch.shift(); }
      bio.touch = { state: 'check', score, flag };
    }
  }
  await saveBio(B);
  const res = must(await sb.rpc('submit_visit', { p_visit: visitId, p_outcome: outcome, p_note: note || '', p_bio: bio, p_signature: signature || null }));
  await refresh();
  return { id: visitId, status: res.status, reasons: res.reasons };
}

// ---------- decyzje ----------
export async function decide(admin, visitId, decision, reason) {
  must(await sb.rpc('decide_visit', { p_visit: visitId, p_decision: decision, p_reason: reason || null }));
  await changed();
}

// ---------- zdjęcia ----------
const photoCache = new Map();
export async function photoUrl(photo) {
  if (!photo || photo.purged || !photo.storageKey) return null;
  const c = photoCache.get(photo.storageKey);
  if (c && c.ts > Date.now()) return c.url;
  const { data } = await sb.storage.from('photos').createSignedUrl(photo.storageKey, 600);
  if (!data?.signedUrl) return null;
  photoCache.set(photo.storageKey, { url: data.signedUrl, ts: Date.now() + 540000 });
  return data.signedUrl;
}
export async function logEvent(user, action, object) { await sb.rpc('log_event', { p_action: action, p_object: String(object || '') }); }
export async function logPhotoDownload(admin, photo) { if (!isAdmin(admin)) throw new Error('forbidden'); await logEvent(admin, 'photo_download', photo.id); }
export async function purgeOldPhotos(admin) {
  if (!isAdmin(admin)) return 0;
  const s = await getSettings(), limit = Date.now() - s.retentionDays * 864e5;
  const old = C.photos.filter(p => !p.purged && p.storageKey && p.takenAt < limit);
  if (!old.length) return 0;
  await sb.storage.from('photos').remove(old.map(p => p.storageKey));
  must(await sb.from('photos').update({ purged: true }).in('id', old.map(p => p.id)));
  await logEvent(admin, 'retention_purge', `${old.length} zdjęć > ${s.retentionDays} dni`);
  await refresh();
  return old.length;
}

// ---------- powiadomienia ----------
const seenKey = u => 'fc.notifSeen.' + u.id;
export function notifications(admin) {
  const s = { ...SETTINGS0, ...C.settings }, now = Date.now(), out = [];
  const A = C.assignments.filter(a => inScope(admin, a.userId));
  const queue = A.filter(a => a.status === 'TO_REVIEW').length;
  if (queue >= s.notifyQueue) out.push({ id: 'queue', kind: 'queue', n: queue, ts: now, sticky: true });
  const open = A.filter(a => ['ASSIGNED', 'IN_PROGRESS'].includes(a.status) && a.due);
  const end = a => new Date(a.due + 'T23:59:59').getTime();
  const overdue = open.filter(a => end(a) < now).length;
  const soon = open.filter(a => end(a) >= now && end(a) - now <= s.notifyDueH * 3600000).length;
  if (overdue) out.push({ id: 'overdue', kind: 'overdue', n: overdue, ts: now, sticky: true });
  if (soon) out.push({ id: 'soon', kind: 'soon', n: soon, h: s.notifyDueH, ts: now, sticky: true });
  const seen = +localStorage.getItem(seenKey(admin)) || 0;
  for (const e of C.audit) {
    if (e.ts <= seen) break;
    if (['screenshot_attempt', 'bio_pin_flag'].includes(e.action) && inScope(admin, e.userId))
      out.push({ id: e.id, kind: e.action, who: getUser(e.userId)?.name || '—', obj: e.object, ts: e.ts });
    if (e.action === 'visit_submit' && /TO_REVIEW/.test(e.object || '')) {
      const v = getVisit((e.object || '').split(' ')[0]);
      const flags = (v?.reasons || []).filter(r => r.bio).map(r => r.code);
      if (flags.length && inScope(admin, e.userId)) out.push({ id: e.id, kind: 'bio_flag', who: getUser(e.userId)?.name || '—', obj: flags.join(', '), ts: e.ts });
    }
  }
  return out;
}
export async function markNotifSeen(admin) { localStorage.setItem(seenKey(admin), Date.now()); }

// ---------- integracja ----------
export const webhookLog = () => C.deliveries.slice();
export async function testWebhook(admin) {
  if (!isAdmin(admin)) throw new Error('forbidden');
  const rid = must(await sb.rpc('test_webhook'));
  await new Promise(r => setTimeout(r, 2500));
  await refresh();
  const d = C.deliveries[0];
  return { ok: d?.status === 'ok', status: rid == null ? 'error' : (d?.status || 'queued') };
}
export async function exportJson(admin) {
  if (!isAdmin(admin)) throw new Error('forbidden');
  await logEvent(admin, 'export', 'JSON (CRM)');
  return {
    schema: SCHEMA_VERSION, source: 'fieldcheck', exportedAt: new Date().toISOString(),
    properties: C.properties.map(p => ({ id: p.id, external_id: p.external_id || null, street: p.street, building: p.building, unit: p.unit || null, zip: p.zip, city: p.city, lat: p.lat, lng: p.lng, notes: p.notes || null })),
    reps: C.users.filter(u => u.role === 'rep').map(u => ({ id: u.id, name: u.name, email: u.email || null, active: u.active })),
    assignments: C.assignments.map(a => ({ id: a.id, property_id: a.propertyId, rep_id: a.userId, due: a.due || null, status: a.status })),
    visits: C.visits.filter(v => v.submittedAt).map(v => visitRecord(v, getProperty(v.propertyId), C.assignments.find(a => a.id === v.assignmentId), getUser(v.userId))),
  };
}

// ---------- biometria: stan profilu ----------
export function bioStatus(u) {
  const B = C.bio.find(b => b.user_id === u.id) || { pin: [], sig: [], touch: [] }, s = { ...SETTINGS0, ...C.settings };
  const lens = (B.pin || []).reduce((m, v) => (m[v.length] = (m[v.length] || 0) + 1, m), {});
  return {
    pin: Math.min(s.bioPinEnroll, Math.max(0, ...Object.values(lens))), pinOf: s.bioPinEnroll,
    sig: Math.min(s.bioSigEnroll, (B.sig || []).length), sigOf: s.bioSigEnroll,
    touch: Math.min(s.bioTouchEnroll, (B.touch || []).length), touchOf: s.bioTouchEnroll,
  };
}

// funkcje tylko dla trybu demo
export async function resetDemo() { throw new Error('not_available'); }
export async function clearAll() { throw new Error('not_available'); }
