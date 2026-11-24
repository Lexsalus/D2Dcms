// Test end-to-end na prawdziwym projekcie Supabase (przeglądarka Edge/Chrome przez playwright-core).
// Uruchomienie: SB_SERVICE=<klucz serwisowy> node tests/e2e-supabase.mjs  (z katalogu repo, po `npm i playwright-core`)
// Zakłada konta testowe (e2e-*@fieldcheck.test), wykonuje przepływ admin → handlowiec → weryfikacja i na końcu wszystko usuwa.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const URL_ = 'https://qbtbquzylmgheaqlljhg.supabase.co';
const SERVICE = process.env.SB_SERVICE;
if (!SERVICE) { console.error('Brak SB_SERVICE'); process.exit(1); }
const ROOT = process.cwd(), PORT = 8765, BASE = `http://localhost:${PORT}`;
const log = (...a) => console.log('•', ...a);

// --- serwer statyczny
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT);

// --- Auth admin API (klucz serwisowy tylko w tym procesie)
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const api = async (method, p, body) => {
  const r = await fetch(URL_ + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${t}`);
  return j;
};
const rest = (method, p, body) => api(method, '/rest/v1/' + p, body);

const stamp = Date.now();
const ADMIN = { email: `e2e-admin-${stamp}@fieldcheck.test`, password: 'Test-' + stamp + '!a' };
const REP = { email: `e2e-rep-${stamp}@fieldcheck.test`, pin: String(1000 + stamp % 9000), name: 'E2E Handlowiec' };
const created = [];
let ok = true;
const check = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗', msg); if (!cond) ok = false; };

// tabliczka z adresem jako JPEG (rysowana w przeglądarce)
async function plate(page, text) {
  const b64 = await page.evaluate(t => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
    const g = c.getContext('2d'); g.fillStyle = '#788'; g.fillRect(0, 0, 1200, 900);
    g.fillStyle = '#1f4fa3'; g.fillRect(100, 330, 1000, 240); g.fillStyle = '#fff'; g.font = 'bold 90px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, 600, 450); return c.toDataURL('image/jpeg', .9).split(',')[1];
  }, text);
  const f = path.join(ROOT, `e2e-${text.replace(/\W+/g, '_')}.jpg`); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}

const browser = await chromium.launch({ channel: process.env.BROWSER || 'msedge', headless: true });
try {
  // 1. konto admina testowego
  const a = await api('POST', '/auth/v1/admin/users', { email: ADMIN.email, password: ADMIN.password, email_confirm: true, user_metadata: { name: 'E2E Admin' } });
  created.push(a.id);
  await rest('PATCH', `profiles?id=eq.${a.id}`, { role: 'admin', active: true, name: 'E2E Admin' });
  log('admin testowy założony');

  // 2. panel: logowanie
  const ctx = await browser.newContext({ locale: 'pl-PL', viewport: { width: 1400, height: 900 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(BASE + '/admin/');
  await pg.fill('[name=email]', ADMIN.email); await pg.fill('[name=password]', ADMIN.password);
  await pg.click('#loginForm button.btn-primary');
  await pg.waitForSelector('#shell:not(.hidden)', { timeout: 20000 });
  check(await pg.locator('#pageTitle').innerText().then(x => x.startsWith('Pulpit')), 'logowanie admina → pulpit');

  // 3. handlowiec przez panel (Edge Function)
  await pg.goto(BASE + '/admin/#/reps'); await pg.waitForTimeout(800);
  await pg.click('#addRep');
  await pg.fill('#repForm [name=name]', REP.name); await pg.fill('#repForm [name=email]', REP.email); await pg.fill('#repForm [name=pin]', REP.pin);
  await pg.click('#repForm .btn-primary');
  await pg.waitForFunction(n => document.body.innerText.includes(n), REP.name, { timeout: 20000 });
  const rep = (await rest('GET', `profiles?email=eq.${encodeURIComponent(REP.email)}&select=id,role,active`))[0];
  if (rep) created.push(rep.id);
  check(rep?.role === 'rep' && rep.active, 'handlowiec założony przez funkcję serwerową');

  // 4. adres przez import CSV + przypisanie
  const csv = path.join(ROOT, 'e2e-import.csv');
  fs.writeFileSync(csv, `ulica;nr_budynku;nr_lokalu;kod;miasto;lat;lng\nE2E Testowa;${stamp % 1000};7;62-800;Kalisz;51.7612;18.0868\n`);
  await pg.goto(BASE + '/admin/#/properties'); await pg.waitForTimeout(800);
  pg.once('dialog', d => d.dismiss());
  await pg.setInputFiles('#importFile', csv);
  await pg.waitForTimeout(2500);
  await pg.fill('#pSearch', 'E2E Testowa'); await pg.waitForTimeout(1200);
  await pg.check('tbody input[type=checkbox]');
  await pg.click(`.rep-row:has-text("${REP.name}")`);
  await pg.click('#assignBtn'); await pg.waitForTimeout(2000);
  const prop = (await rest('GET', `properties?street=eq.E2E%20Testowa&select=id`))[0];
  const asg = prop && (await rest('GET', `assignments?property_id=eq.${prop.id}&select=id,status,user_id`))[0];
  check(asg?.user_id === rep?.id && asg.status === 'ASSIGNED', 'import CSV + przypisanie');

  // 5. aplikacja handlowca
  const actx = await browser.newContext({ locale: 'pl-PL', viewport: { width: 390, height: 844 }, permissions: ['geolocation'], geolocation: { latitude: 51.7613, longitude: 18.0869, accuracy: 10 } });
  const m = await actx.newPage(); m.on('pageerror', e => errs.push('APP ' + e));
  await m.goto(BASE + '/app/');
  // zły PIN → odmowa, potem poprawny
  await m.fill('[name=rep]', REP.email); await m.fill('[name=pin]', '0000');
  await m.click('#lf button.btn-primary'); await m.waitForTimeout(2500);
  check(await m.locator('#err').isVisible(), 'zły PIN odrzucony');
  await m.fill('[name=pin]', ''); await m.type('[name=pin]', REP.pin, { delay: 150 });
  await m.click('#lf button.btn-primary');
  await m.waitForSelector('.addr-card', { timeout: 20000 });
  check(await m.locator('.addr-card').count() === 1, 'handlowiec widzi tylko swój 1 adres');
  await m.click('.addr-card'); await m.waitForSelector('[data-shot=building]', { timeout: 20000 });
  const shoot = async (sel, file, n) => { const [fc] = await Promise.all([m.waitForEvent('filechooser'), m.click(sel)]); await fc.setFiles(file); await m.waitForFunction(k => document.querySelectorAll('.shot.done').length >= k && !document.querySelector('.shot:disabled'), n, { timeout: 90000 }); };
  await shoot('[data-shot=building]', await plate(m, `E2E TESTOWA ${stamp % 1000}`), 1);
  // wyjście z aplikacji i powrót do adresu (jak przy wchodzeniu na piętro)
  await m.goto(BASE + '/app/'); await m.waitForSelector('.addr-card', { timeout: 20000 }); await m.click('.addr-card');
  await m.waitForSelector('.shot.done', { timeout: 20000 });
  check(await m.locator('.shot.done').count() === 1, 'po powrocie zdjęcie klatki jest zapisane');
  await shoot('[data-shot=unit]', await plate(m, '7'), 2);
  await m.click('[data-o=talked]');
  const sig = await m.locator('#sig').boundingBox();
  await m.mouse.move(sig.x + 20, sig.y + 80); await m.mouse.down();
  for (let i = 0; i < 30; i++) { await m.mouse.move(sig.x + 20 + i * 9, sig.y + 80 + 30 * Math.sin(i / 4)); }
  await m.mouse.up();
  await m.click('#send');
  await m.waitForSelector('.result-icon', { timeout: 30000 });
  const vis = (await rest('GET', `visits?assignment_id=eq.${asg?.id}&select=id,status,submitted_at,reasons,details`))[0];
  check(!!vis?.submitted_at && ['AUTO_VERIFIED', 'TO_REVIEW'].includes(vis.status), `wizyta wysłana, serwer ocenił: ${vis?.status} ${JSON.stringify(vis?.reasons || [])}`);
  const photos = await rest('GET', `photos?visit_id=eq.${vis?.id}&select=storage_key`);
  check(photos.length === 2 && photos.every(p => p.storage_key), 'oba zdjęcia w prywatnym magazynie');

  // 6. panel: zdjęcie przez podpisany link + decyzja
  await pg.goto(BASE + '/admin/#/dashboard'); await pg.waitForTimeout(1500);
  await pg.click(`tr[data-visit="${vis?.id}"]`).catch(() => {});
  await pg.waitForTimeout(2000);
  const imgOk = await pg.evaluate(() => [...document.querySelectorAll('.photo-box img')].some(i => i.naturalWidth > 0));
  check(imgOk, 'admin widzi zdjęcie (podpisany URL)');
  const audit = await rest('GET', `audit_log?user_id=eq.${rep?.id}&action=eq.visit_submit&select=ip`);
  check(audit.length && audit[0].ip, `dziennik z IP (${audit[0]?.ip})`);
  check(errs.length === 0, 'brak błędów JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
} catch (e) {
  ok = false; console.error('BŁĄD', e.message);
} finally {
  // sprzątanie: dane testowe i konta
  try {
    const props = await rest('GET', `properties?street=eq.E2E%20Testowa&select=id`);
    const keys = [];
    for (const p of props) for (const v of await rest('GET', `visits?property_id=eq.${p.id}&select=id`)) keys.push(...(await rest('GET', `photos?visit_id=eq.${v.id}&select=storage_key`)).map(x => x.storage_key));
    if (keys.length) await api('DELETE', '/storage/v1/object/photos', { prefixes: keys });
    for (const p of props) await rest('DELETE', `properties?id=eq.${p.id}`);
    for (const id of created) { await rest('DELETE', `audit_log?user_id=eq.${id}`).catch(() => {}); await rest('DELETE', `bio_profiles?user_id=eq.${id}`).catch(() => {}); }
    for (const id of created) await api('DELETE', `/auth/v1/admin/users/${id}`);
    for (const f of fs.readdirSync(ROOT).filter(f => f.startsWith('e2e-'))) fs.unlinkSync(path.join(ROOT, f));
    log('sprzątanie: usunięto konta testowe i dane');
  } catch (e) { console.error('sprzątanie', e.message); }
  await browser.close(); srv.close();
  console.log(ok ? 'WYNIK: OK' : 'WYNIK: BŁĘDY');
}
