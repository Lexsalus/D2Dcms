// Zdjęcie: aparat, zmniejszenie, GPS, OCR na urządzeniu (prototyp: Tesseract.js; Android: ML Kit)
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../../assets/js/core/ui.js';
import S from '../../../assets/js/data/data.js';
import { $, screen, user, setUser, nav, go, flow, ui, render, setRender, bar } from '../core.js';

export function capture(type) {
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
    flow[slot] = { url, type, ocr, gps, time: Date.now() };
    render();
  };
  input.click();
}

export function downscale(file, max) {
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

export async function getGps(p) {
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
export async function runOcr(dataUrl, type) {
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

