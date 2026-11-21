// Aplikacja handlowca FieldCheck (prototyp przeglądarkowy; docelowo opakowana w Capacitor → Android)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../assets/js/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help } from '../assets/js/ui.js';
import { bestStreetMatch, hasNumber, haversine, evaluate } from '../assets/js/verify.js';
import * as S from '../assets/js/store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const screen = $('#screen');
let user = null;
// stan nawigacji: {name, assignmentId?, visitId?}
let nav = { name: 'list' };
const flow = {}; // dane bieżącej wizyty w UI: {building:{url,ocr,ok}, unit:{...}, outcome, note}

// ---------- start ----------
function boot() {
  applyDom();
  onLangChange(() => { applyDom(); render(); });
  S.onChange(() => { if (['list', 'detail'].includes(nav.name)) render(); });
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go({ name: b.dataset.tab }));
  protectContent();
  render();
}

function go(n) { nav = n; window.scrollTo(0, 0); render(); }

async function render() {
  user = S.currentUser('rep');
  $('#tabs').classList.toggle('hidden', !user || !['list', 'profile'].includes(nav.name));
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === nav.name));
  $('#watermark').classList.toggle('hidden', !user);
  if (user) paintWatermark();
  bar();
  if (!user) return loginScreen();
  const fn = { list: listScreen, profile: profileScreen, detail: detailScreen, photo: photoScreen, summary: summaryScreen, result: resultScreen }[nav.name];
  await fn();
}

function bar(title, backTo) {
  $('#barTitle').innerHTML = title ? `<button class="back">‹ ${esc(title)}</button>` : 'Field<b>Check</b>';
  if (title) $('#barTitle .back').onclick = () => go(backTo || { name: 'list' });
  $('#barRight').textContent = fmtTime(Date.now());
}

// ---------- logowanie ----------
async function loginScreen() {
  const reps = (await S.listReps()).filter(r => r.active);
  screen.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px"><div id="ctl"></div></div>
    <div class="card">
      <h2>${t('login_rep_title')}</h2>
      <form id="lf">
        <div class="field"><label>${t('choose_rep')}</label>
          <select name="rep" required>${reps.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>
        <div class="field"><label>${t('pin')}${help('h_app_pin')}</label><input name="pin" type="password" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></div>
        <p class="bad small hidden" id="err"></p>
        <button class="btn btn-primary btn-block btn-lg">${t('login')}</button>
      </form>
      <p class="muted small">${t('demo_creds', { creds: 'PIN ' + S.DEMO_PIN })}</p>
    </div>
    <p class="muted small" style="text-align:center;margin-top:14px">${t('prototype_note')}<br>${versionLabel()}</p>`;
  mountControls($('#ctl'));
  $('#ctl').style.color = 'var(--text)';
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await S.loginRep(f.get('rep'), f.get('pin')); go({ name: 'list' }); }
    catch (err) { const el = $('#err'); el.textContent = t(err.message); el.classList.remove('hidden'); }
  };
}

// ---------- lista ----------
const ORDER = { IN_PROGRESS: 0, ASSIGNED: 1, TO_REVIEW: 2, SUBMITTED: 2, AUTO_VERIFIED: 3, APPROVED: 3, REJECTED: 4 };
async function listScreen() {
  const items = (await S.myAssignments(user.id)).sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || String(a.due).localeCompare(String(b.due)));
  const done = items.filter(a => S.SUBMITTED_SET.includes(a.status)).length;
  screen.innerHTML = `
    <div class="progress-head"><h2>${t('today_progress', { a: done, b: items.length })}${help('h_progress')}</h2></div>
    <div class="pbar"><i style="width:${items.length ? done / items.length * 100 : 0}%"></i></div>
    ${items.map(a => `
      <button class="addr-card" data-a="${a.id}">
        <div class="a1">${esc(addrLine(a.property))}</div>
        <div class="a2"><span>${esc(a.property.zip)} ${esc(a.property.city)}${a.due ? ' · ' + t('due', { d: fmtDate(a.due) }) : ''}</span>${badge(a.status)}</div>
      </button>`).join('') || `<div class="card muted">${t('no_assignments')}</div>`}`;
  screen.querySelectorAll('[data-a]').forEach(b => b.onclick = () => go({ name: 'detail', assignmentId: b.dataset.a }));
}

// ---------- szczegóły adresu ----------
async function detailScreen() {
  const a = (await S.myAssignments(user.id)).find(x => x.id === nav.assignmentId);
  if (!a) return go({ name: 'list' });
  bar(t('tab_list'));
  const p = a.property;
  const canVisit = ['ASSIGNED', 'IN_PROGRESS'].includes(a.status);
  const open = a.visit && !a.visit.submittedAt;
  screen.innerHTML = `
    <div class="card">
      <div class="big-addr">${esc(addrLine(p))}</div>
      <div class="muted">${esc(p.zip)} ${esc(p.city)}</div>
      <p>${badge(a.status)} ${a.due ? `<span class="muted"> · ${t('due', { d: fmtDate(a.due) })}</span>` : ''}</p>
      ${p.notes ? `<p class="small">${esc(p.notes)}</p>` : ''}
      ${a.visit?.submittedAt ? `<p class="muted small">${t('visit_sent')}: ${fmtDateTime(a.visit.submittedAt)}</p>` : ''}
    </div>
    <div class="stack" style="margin-top:14px">
      ${canVisit ? `<button class="btn btn-primary btn-lg" id="start" ${tip('h_start')}>${open ? t('continue_visit') : t('start_visit')}</button>` : ''}
      ${p.lat != null ? `<a class="btn btn-lg" ${tip('h_navigate')} target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}">🧭 ${t('navigate')}</a>` : ''}
    </div>`;
  const st = $('#start');
  if (st) st.onclick = async () => {
    const v = await S.startVisit(user, a.id);
    for (const k in flow) delete flow[k];
    // przy kontynuacji odtwórz zrobione zdjęcia
    for (const ph of S.visitPhotos(v.id)) {
      const slot = ph.type === 'building' ? 'building' : 'unit';
      flow[slot] = { url: await S.photoUrl(ph), ocr: ph.ocrText, type: ph.type };
    }
    go({ name: 'photo', step: flow.building && p.unit ? 'unit' : 'building', assignmentId: a.id, visitId: v.id });
  };
}

// ---------- zdjęcia ----------
async function photoScreen() {
  const a = (await S.myAssignments(user.id)).find(x => x.id === nav.assignmentId);
  const p = a.property;
  const step = nav.step; // 'building' | 'unit'
  const f = flow[step];
  bar(t('back'), step === 'unit' ? { ...nav, step: 'building' } : { name: 'detail', assignmentId: a.id });
  const isB = step === 'building';
  screen.innerHTML = `
    <div class="step-head">${t(isB ? 'step_building' : 'step_unit')}${help(isB ? 'h_photo_b' : 'h_photo_u')}</div>
    <div class="muted small" style="margin-bottom:8px">${esc(addrLine(p))}</div>
    <div class="viewfinder" id="vf">
      ${f?.url ? `<img src="${f.url}" alt="">` : `<div><div style="font-size:42px">📷</div>${t(isB ? 'hint_building' : 'hint_unit')}</div><div class="frame"></div>`}
    </div>
    <div id="det" ${tip('h_detect')}>${f ? detectHtml(step, f, p) : ''}</div>
    <div class="stack" style="margin-top:10px">
      <button class="btn ${f ? '' : 'btn-primary'} btn-lg" id="shoot" ${tip(f ? 'h_retake' : 'h_take_photo')} ${f?.busy ? 'disabled' : ''}>📷 ${f ? t('retake') : t('take_photo')}</button>
      ${f && !f.busy ? `<button class="btn btn-primary btn-lg" id="next">${t('next')} ›</button>` : ''}
      ${!isB && !f?.busy ? `<button class="linkbtn" id="door" ${tip('h_door')}>${t('no_number')}</button>${help('h_door')}` : ''}
    </div>
    <p class="muted small" style="margin-top:12px">${t('camera_note')}</p>`;
  $('#shoot').onclick = () => capture(step === 'unit' ? 'unit' : 'building');
  const door = $('#door'); if (door) door.onclick = () => capture('door');
  const nx = $('#next');
  if (nx) nx.onclick = () => go(isB && p.unit ? { ...nav, step: 'unit' } : { name: 'summary', assignmentId: a.id, visitId: nav.visitId });
}

function detectHtml(step, f, p) {
  if (f.busy) return `<div class="detect">${esc(f.busy)}</div>`;
  if (f.type === 'door') return `<div class="detect bad">🚪 ${t('r_no_unit_number')}</div>`;
  if (!f.ocr) return `<div class="detect bad">${t('not_detected')}</div>`;
  if (step === 'building') {
    const ok = bestStreetMatch(f.ocr, p.street) >= 90 && hasNumber(f.ocr, p.building);
    return `<div class="detect ${ok ? 'ok' : 'bad'}">${t('detected', { s: esc(shortOcr(f.ocr)) })} ${ok ? '✓' : '✗'}</div>`;
  }
  const ok = hasNumber(f.ocr, p.unit);
  return `<div class="detect ${ok ? 'ok' : 'bad'}">${t('detected', { s: 'nr ' + esc(shortOcr(f.ocr)) })} ${ok ? '✓' : '✗'}</div>`;
}
const shortOcr = s => s.replace(/\s+/g, ' ').trim().slice(0, 40);

function capture(type) {
  const input = $('#cam');
  input.value = '';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const slot = type === 'building' ? 'building' : 'unit';
    const fileAge = Math.max(0, Date.now() - (file.lastModified || Date.now()));
    const url = await downscale(file, 1600);
    flow[slot] = { url, type, busy: t('gps_getting') };
    render();
    const a = (await S.myAssignments(user.id)).find(x => x.id === nav.assignmentId);
    const gps = await getGps(a.property);
    let ocr = '', conf = null;
    if (type !== 'door') {
      flow[slot].busy = window.Tesseract ? t('recognizing') : t('ocr_loading'); render();
      try { ({ text: ocr, conf } = await runOcr(url, type)); } catch { ocr = ''; }
    }
    await S.addPhoto(user, nav.visitId, type, url, { ocrText: ocr, ocrConf: conf, gps, fileAge });
    flow[slot] = { url, type, ocr, gps };
    render();
  };
  input.click();
}

function downscale(file, max) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', .82));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

async function getGps(p) {
  const s = await S.getSettings();
  if (s.demoGps && p.lat != null) {
    // tryb demo: punkt 5–40 m od adresu
    const d = (5 + Math.random() * 35) / 111000, ang = Math.random() * Math.PI * 2;
    return { lat: p.lat + d * Math.sin(ang), lng: p.lng + d * Math.cos(ang) / Math.cos(p.lat * Math.PI / 180), acc: 12, demo: true };
  }
  if (!navigator.geolocation) return null;
  return new Promise(res => navigator.geolocation.getCurrentPosition(
    pos => res({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
    () => { toast(t('gps_denied')); res(null); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
}

// OCR na urządzeniu — w prototypie Tesseract.js (w aplikacji Android: ML Kit)
let ocrWorker; // Promise workera (współdzielony)
async function runOcr(dataUrl, type) {
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 45000));
  return Promise.race([ocrJob(dataUrl, type), timeout]);
}
async function ocrJob(dataUrl, type) {
  if (!window.Tesseract) {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  ocrWorker ??= window.Tesseract.createWorker('pol');
  const w = await ocrWorker;
  await w.setParameters({ tessedit_pageseg_mode: type === 'unit' ? '11' : '3' });
  const r = await w.recognize(dataUrl);
  return { text: (r.data.text || '').trim(), conf: Math.round(r.data.confidence || 0) };
}

// ---------- podsumowanie ----------
async function summaryScreen() {
  const a = (await S.myAssignments(user.id)).find(x => x.id === nav.assignmentId);
  const p = a.property;
  const v = S.getVisit(nav.visitId);
  bar(t('back'), { name: 'photo', step: p.unit ? 'unit' : 'building', assignmentId: a.id, visitId: v.id });
  const photos = S.visitPhotos(v.id);
  const pre = evaluate(p, a, v, photos, [], await S.getSettings()).details; // podgląd; decyzja zapada przy wysyłce
  const dist = v.gps && p.lat != null ? haversine(v.gps.lat, v.gps.lng, p.lat, p.lng) : null;
  const mk = ok => ok ? '<span class="ok">✓</span>' : '<span class="warn">✗</span>';
  const s = await S.getSettings();
  screen.innerHTML = `
    <h2>${t('summary')}${help('h_summary')}</h2>
    <div class="card">
      <div class="sum-row"><span>${t('building_addr')}</span><b>${esc(p.street)} ${esc(p.building)} ${mk(pre.streetScore >= s.streetMin && pre.buildingOk)}</b></div>
      ${p.unit ? `<div class="sum-row"><span>${t('unit_short')}</span><b>${esc(p.unit)} ${mk(pre.unitOk)}</b></div>` : ''}
      <div class="sum-row"><span>${t('location')}</span><b>${dist !== null ? t('m_from_addr', { n: dist }) + ' ' + mk(dist <= s.gpsMax) : t('r_no_gps') + ' ' + mk(false)}${v.gps?.demo ? ' <span class="muted small">(demo)</span>' : ''}</b></div>
      <div class="sum-row"><span>${t('time')}</span><b>${fmtTime(Date.now())}</b></div>
    </div>
    <h3 style="margin-top:16px">${t('outcome')}${help('h_outcome')}</h3>
    <div class="outcomes">${S.OUTCOMES.map(o => `<button class="outcome ${flow.outcome === o ? 'sel' : ''}" data-o="${o}">${t('out_' + o)}</button>`).join('')}</div>
    <div class="field" style="margin-top:14px"><label>${t('note_optional')}${help('h_note')}</label><textarea id="note" rows="3" maxlength="300">${esc(flow.note || '')}</textarea></div>
    <button class="btn btn-primary btn-lg btn-block" id="send" ${tip('h_send')}>${t('send_visit')}</button>`;
  screen.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { flow.outcome = b.dataset.o; flow.note = $('#note').value; render(); });
  $('#send').onclick = async () => {
    if (!flow.outcome) return toast(t('choose_outcome'));
    const res = await S.submitVisit(user, v.id, { outcome: flow.outcome, note: $('#note').value });
    for (const k in flow) delete flow[k]; // zdjęcia znikają z pamięci aplikacji po wysłaniu
    go({ name: 'result', visitId: res.id });
  };
}

async function resultScreen() {
  const v = S.getVisit(nav.visitId);
  const ok = v.status === 'AUTO_VERIFIED';
  screen.innerHTML = `
    <div class="card" style="text-align:center">
      <div class="result-icon">${ok ? '✅' : '🕵️'}</div>
      <h2>${t('visit_sent')}</h2>
      <p>${t('status_after', { s: '' })} ${badge(v.status)}</p>
      ${!ok && v.reasons?.length ? `<p class="muted small">${v.reasons.map(r => t(r.code, r.n !== undefined ? { n: r.n } : undefined)).join(' · ')}</p>` : ''}
    </div>
    <button class="btn btn-primary btn-lg btn-block" style="margin-top:14px" id="back">${t('back_to_list')}</button>`;
  $('#back').onclick = () => go({ name: 'list' });
}

// ---------- profil ----------
async function profileScreen() {
  screen.innerHTML = `
    <div class="card">
      <h2>${esc(user.name)}</h2>
      <dl class="kv" style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px">
        <dt class="muted">${t('device_id')}${help('h_device_id')}</dt><dd style="margin:0">${esc(S.deviceId())}</dd>
        <dt class="muted">${t('version')}</dt><dd style="margin:0">${versionLabel()}</dd>
      </dl>
      <div style="margin-top:14px;color:var(--text)" id="ctl"></div>
    </div>
    <button class="btn btn-lg btn-block" style="margin-top:14px" id="lo" ${tip('h_logout')}>${t('logout')}</button>`;
  mountControls($('#ctl'));
  $('#lo').onclick = () => { S.logout('rep'); go({ name: 'list' }); };
}

// ---------- ochrona treści (w przeglądarce tylko częściowa; pełna = FLAG_SECURE w Androidzie) ----------
function paintWatermark() {
  const line = `${user.name} · ${S.deviceId()} · ${fmtDate(Date.now())}     `;
  $('#watermark').textContent = Array(60).fill(line.repeat(4)).join('\n');
}
function protectContent() {
  const shield = $('#shield');
  document.addEventListener('visibilitychange', () => shield.classList.toggle('hidden', document.visibilityState === 'visible'));
  window.addEventListener('blur', () => { if (user) shield.classList.remove('hidden'); });
  window.addEventListener('focus', () => shield.classList.add('hidden'));
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('copy', e => e.preventDefault());
  document.addEventListener('keyup', e => {
    if (e.key === 'PrintScreen' && user) {
      shield.classList.remove('hidden');
      S.logEvent(user, 'screenshot_attempt', S.deviceId());
      setTimeout(() => shield.classList.add('hidden'), 1500);
    }
  });
}

boot();
