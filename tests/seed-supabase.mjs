// Dane testowe w projekcie Supabase (jak w trybie demo): 5 handlowców z PIN-ami, manager z zespołem, 50 adresów w Kaliszu,
// przypisania i 43 wizyty z tego tygodnia (ze zdjęciami tabliczek). Wszystko oznaczone jako testowe:
// konta @fieldcheck.test, adresy z external_id „TEST-…”.
//   Założenie:  SB_SERVICE=<klucz serwisowy> node tests/seed-supabase.mjs [plik_wyjściowy_z_danymi_logowania]
//   Usunięcie:  SB_SERVICE=<klucz serwisowy> node tests/seed-supabase.mjs --remove
import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';

const URL_ = 'https://qbtbquzylmgheaqlljhg.supabase.co';
const SERVICE = process.env.SB_SERVICE;
if (!SERVICE) { console.error('Brak SB_SERVICE'); process.exit(1); }
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const api = async (method, p, body, extra = {}) => {
  const r = await fetch(URL_ + p, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : (body instanceof Uint8Array ? body : JSON.stringify(body)) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${t.slice(0, 300)}`);
  return j;
};
const rest = (m, p, b, h) => api(m, '/rest/v1/' + p, b, h);
const DOMAIN = 'fieldcheck.test';

async function remove() {
  const props = await rest('GET', `properties?external_id=like.TEST-*&select=id`);
  const keys = [];
  for (let i = 0; i < props.length; i += 50) {
    const ids = props.slice(i, i + 50).map(p => p.id).join(',');
    const vis = await rest('GET', `visits?property_id=in.(${ids})&select=id`);
    if (vis.length) keys.push(...(await rest('GET', `photos?visit_id=in.(${vis.map(v => v.id).join(',')})&select=storage_key`)).map(x => x.storage_key).filter(Boolean));
  }
  for (let i = 0; i < keys.length; i += 100) await api('DELETE', '/storage/v1/object/photos', { prefixes: keys.slice(i, i + 100) });
  if (props.length) await rest('DELETE', `properties?external_id=like.TEST-*`);
  const users = await rest('GET', `profiles?email=like.*@${DOMAIN}&select=id`);
  for (const u of users) {
    await rest('DELETE', `audit_log?user_id=eq.${u.id}`); await rest('DELETE', `bio_profiles?user_id=eq.${u.id}`);
    await api('DELETE', `/auth/v1/admin/users/${u.id}`);
  }
  console.log(`usunięto: ${props.length} adresów, ${keys.length} zdjęć, ${users.length} kont`);
}

if (process.argv.includes('--remove')) { await remove(); process.exit(0); }

// ---------- zakładanie ----------
const out = process.argv[2] || 'fieldcheck-konta-testowe.txt';
const pin = () => String(crypto.randomInt(1000, 10000));
const pw = () => crypto.randomBytes(9).toString('base64url');
let r = 7; const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };

await remove(); // od zera
const admins = await rest('GET', 'profiles?role=eq.admin&active=eq.true&select=id&order=created_at');
const adminId = admins[0]?.id;

async function user(email, name, role, extra = {}) {
  const password = role === 'rep' ? pw() + pw() : pw();
  const u = await api('POST', '/auth/v1/admin/users', { email, password, email_confirm: true, user_metadata: { name } });
  await rest('PATCH', `profiles?id=eq.${u.id}`, { role, active: true, name, ...extra }, { Prefer: 'return=minimal' });
  return { id: u.id, email, name, password };
}
const lines = ['FieldCheck — konta testowe (dane testowe w bazie produkcyjnej)', `Aplikacja: https://lexsalus.github.io/D2Dcms/app/`, `Panel: https://lexsalus.github.io/D2Dcms/admin/`, ''];
const repNames = ['Anna K.', 'Piotr N.', 'Marta S.', 'Tomasz W.', 'Karol B.'];
const logins = ['anna.k', 'piotr.n', 'marta.s', 'tomasz.w', 'karol.b'];
const reps = [];
lines.push('HANDLOWCY (aplikacja: login + PIN):');
for (let i = 0; i < 5; i++) {
  const u = await user(`${logins[i]}@${DOMAIN}`, `${repNames[i]} (test)`, 'rep');
  u.pin = pin(); await rest('POST', 'rpc/fc_set_pin', { p_user: u.id, p_pin: u.pin });
  reps.push(u); lines.push(`  ${u.name.padEnd(18)} login: ${u.email.padEnd(28)} PIN: ${u.pin}`);
}
const mgr = await user(`kierownik@${DOMAIN}`, 'Kierownik Zespołu (test)', 'manager', { team: reps.slice(0, 3).map(x => x.id) });
lines.push('', 'MANAGER (panel: e-mail + hasło; zespół: Anna, Piotr, Marta):', `  login: ${mgr.email}   hasło: ${mgr.password}`);

// istniejące konto testowe właściciela: PIN + kilka adresów
const own = (await rest('GET', `profiles?email=eq.${encodeURIComponent('michalstankiewicz4+handlowiec@gmail.com')}&select=id,name`))[0];
if (own) { own.pin = pin(); await rest('POST', 'rpc/fc_set_pin', { p_user: own.id, p_pin: own.pin }); lines.push('', `TWOJE KONTO TESTOWE: login michalstankiewicz4+handlowiec@gmail.com   PIN: ${own.pin}`); }

// ---------- adresy ----------
const streets = [['Poznańska', 51.7680, 18.0865], ['Górnośląska', 51.7535, 18.0985], ['Śródmiejska', 51.7618, 18.0905], ['Wrocławska', 51.7520, 18.0790], ['Zamkowa', 51.7628, 18.0880],
  ['Częstochowska', 51.7560, 18.1010], ['Babina', 51.7605, 18.0870], ['Złota', 51.7640, 18.0915], ['Majkowska', 51.7700, 18.1040], ['Kościuszki', 51.7590, 18.0930]];
const props = [];
const CASES = [{ name: 'Egzekucja', color: '#DC2626' }, { name: 'Kredyt', color: '#2F6FED' }, { name: 'Ponaglenie', color: '#F59E0B' }, { name: 'Korespondencja', color: '#0E9F8E' }]
  .map(c => ({ ...c, guide: `Przykładowe wskazówki (dane testowe) dla: ${c.name}.` }));
for (let i = 0; i < 53; i++) {
  const [street, lat, lng] = streets[i % streets.length];
  props.push({ external_id: `TEST-${String(i + 1).padStart(3, '0')}`, street, building: String(2 + Math.floor(i / 10) * 4 + Math.floor(rnd() * 3)), unit: String(1 + Math.floor(rnd() * 30)),
    zip: '62-800', city: 'Kalisz', lat: +(lat + (rnd() - .5) * .004).toFixed(6), lng: +(lng + (rnd() - .5) * .006).toFixed(6), notes: 'dane testowe', case_type: CASES[i % CASES.length].name, created_by: adminId });
}
const P = await rest('POST', 'properties', props, { Prefer: 'return=representation' });
{ // przykładowe rodzaje spraw w ustawieniach (bez nadpisywania istniejących)
  const [st] = await rest('GET', 'settings?id=eq.1&select=data');
  const have = new Set((st?.data?.caseTypes || []).map(c => c.name.toLowerCase()));
  const caseTypes = [...(st?.data?.caseTypes || []), ...CASES.filter(c => !have.has(c.name.toLowerCase()))];
  await rest('PATCH', 'settings?id=eq.1', { data: { ...(st?.data || {}), caseTypes } });
}

// ---------- przypisania i wizyty ----------
const now = Date.now();
const due = new Date(); due.setDate(due.getDate() + ((7 - due.getDay()) % 7 || 7));
const dueStr = due.toISOString().slice(0, 10);
const plan = [...Array(31).fill('AUTO_VERIFIED'), ...Array(3).fill('APPROVED'), ...Array(7).fill('TO_REVIEW'), ...Array(2).fill('REJECTED')];
for (let i = plan.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [plan[i], plan[j]] = [plan[j], plan[i]]; }
const todoPerRep = [0, 1, 1, 2, 3];
const reviewReasons = [[{ code: 'r_ocr_unit_unreadable' }], [{ code: 'r_gps_far', n: 240 }], [{ code: 'r_street_mismatch', n: 71 }], [{ code: 'r_duplicate' }], [{ code: 'r_no_unit_number' }], [{ code: 'r_unit_mismatch' }], [{ code: 'r_late' }]];
const visits = []; let di = 0, ri = 0;
const asgRows = [];
reps.forEach((rep, k) => P.slice(k * 10, k * 10 + 10).forEach((p, j) => asgRows.push({ property_id: p.id, user_id: rep.id, due: dueStr, status: 'ASSIGNED', assigned_by: adminId, _todo: j >= 10 - todoPerRep[k], _p: p, _rep: rep })));
if (own) P.slice(50, 53).forEach(p => asgRows.push({ property_id: p.id, user_id: own.id, due: dueStr, status: 'ASSIGNED', assigned_by: adminId, _todo: true, _p: p }));
const A = await rest('POST', 'assignments', asgRows.map(({ _todo, _p, _rep, ...x }) => x), { Prefer: 'return=representation' });

const browser = await chromium.launch({ channel: process.env.BROWSER || 'msedge', headless: true });
const page = await browser.newPage();
const plate = (text, kind) => page.evaluate(([t, k]) => {
  const c = document.createElement('canvas'); c.width = 480; c.height = 360; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 360);
  if (k === 'building') { gr.addColorStop(0, '#9aa5b1'); gr.addColorStop(1, '#5d6b78'); } else { gr.addColorStop(0, '#7b5e45'); gr.addColorStop(1, '#4a3727'); }
  g.fillStyle = gr; g.fillRect(0, 0, 480, 360);
  if (k === 'building') { g.fillStyle = '#1f4fa3'; g.fillRect(50, 120, 380, 110); g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(60, 130, 360, 90); g.fillStyle = '#fff'; g.font = 'bold 32px Arial'; }
  else { g.fillStyle = '#c9a227'; g.beginPath(); g.ellipse(240, 150, 60, 42, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#222'; g.font = 'bold 46px Arial'; }
  g.textAlign = 'center'; g.textBaseline = 'middle'; if (t) g.fillText(t, 240, k === 'building' ? 175 : 152);
  return c.toDataURL('image/jpeg', .8).split(',')[1];
}, [text, kind]);

for (let i = 0; i < A.length; i++) {
  const row = asgRows[i], a = A[i];
  if (row._todo) continue;
  const status = plan[di++ % plan.length];
  const p = row._p, rep = row._rep;
  const start = new Date(now - Math.floor(rnd() * 5) * 864e5); start.setHours(9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60), 0, 0);
  const startedAt = Math.min(start.getTime(), now - 3600e3), submittedAt = startedAt + (4 + Math.floor(rnd() * 12)) * 60000;
  let reasons = [], dist = 5 + Math.floor(rnd() * 50);
  if (status !== 'AUTO_VERIFIED') { reasons = reviewReasons[ri++ % reviewReasons.length]; const far = reasons.find(x => x.code === 'r_gps_far'); if (far) dist = far.n; }
  const off = dist / 111000, gap = 1 + Math.floor(rnd() * 4);
  const has = c => reasons.some(x => x.code === c);
  const v = (await rest('POST', 'visits', {
    assignment_id: a.id, property_id: p.id, user_id: rep.id, started_at: new Date(startedAt).toISOString(), submitted_at: new Date(submittedAt).toISOString(),
    gps_lat: p.lat + off * .7, gps_lng: p.lng + off * .7 / Math.cos(p.lat * Math.PI / 180), gps_accuracy: 8 + Math.floor(rnd() * 15),
    outcome: ['talked', 'no_answer', 'refused', 'later'][Math.floor(rnd() ** 1.6 * 4)], note: '', status, reasons,
    details: { distance: dist, gapMin: gap, streetScore: has('r_street_mismatch') ? 71 : 96 + Math.floor(rnd() * 5), buildingOk: true, unitOk: !has('r_unit_mismatch') && !has('r_ocr_unit_unreadable'), duplicate: has('r_duplicate'), cameraOk: true },
    ...(status === 'APPROVED' || status === 'REJECTED' ? { decision: status === 'APPROVED' ? 'approve' : 'reject', decision_reason: status === 'REJECTED' ? 'rr_duplicate' : null, decided_by: adminId, decided_at: new Date(Math.min(now - 600e3, submittedAt + 3 * 3600e3)).toISOString() } : {}),
  }, { Prefer: 'return=representation' }))[0];
  await rest('PATCH', `assignments?id=eq.${a.id}`, { status }, { Prefer: 'return=minimal' });
  const streetLabel = has('r_street_mismatch') ? 'POZNAŃSKA' : p.street.toUpperCase();
  const door = has('r_no_unit_number');
  const unitLabel = has('r_unit_mismatch') ? String(+p.unit + 1) : p.unit;
  const shots = [['building', `${streetLabel} ${p.building}`, `${streetLabel} ${p.building}`, 0], [door ? 'door' : 'unit', door ? '' : unitLabel, has('r_ocr_unit_unreadable') || door ? '' : unitLabel, gap]];
  for (const [type, label, ocr, mins] of shots) {
    const key = `${rep.id}/${v.id}/${type}-seed.jpg`;
    await api('POST', `/storage/v1/object/photos/${key}`, new Uint8Array(Buffer.from(await plate(label, type === 'building' ? 'building' : 'door'), 'base64')), { 'Content-Type': 'image/jpeg' });
    await rest('POST', 'photos', { visit_id: v.id, type, storage_key: key, ocr_text: ocr, ocr_conf: ocr ? 90 : 20, taken_at: new Date(startedAt + 120e3 + mins * 60e3).toISOString() }, { Prefer: 'return=minimal' });
  }
  visits.push(v.id);
}
await browser.close();
fs.writeFileSync(out, lines.join('\r\n') + '\r\n\r\nUsunięcie danych testowych: node tests/seed-supabase.mjs --remove\r\nUsuń ten plik po zapisaniu danych.\r\n', 'utf8');
console.log(`założono: 5 handlowców, 1 manager, ${P.length} adresów, ${A.length} przypisań, ${visits.length} wizyt → ${out}`);
