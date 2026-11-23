// Aplikacja handlowca FieldCheck — start, wersja, offline, przełączanie ekranów
import { t, applyDom, onLangChange, fmtDate, fmtTime, fmtDateTime } from '../../assets/js/core/i18n.js';
import { mountControls, versionLabel, esc, toast, badge, addrLine, tip, help, subtabs, wireSubtabs } from '../../assets/js/core/ui.js';
import S from '../../assets/js/data/data.js';
import { VERSION } from '../../assets/js/core/version.js';
import { $, screen, user, setUser, nav, go, flow, ui, setRender, bar } from './core.js';
import { paintWatermark, protectContent } from './lib/protect.js';
import { loginScreen } from './screens/login.js';
import { listScreen } from './screens/list.js';
import { mapScreen } from './screens/map.js';
import { detailScreen } from './screens/detail.js';
import { photoScreen } from './screens/photo.js';
import { summaryScreen } from './screens/summary.js';
import { resultScreen } from './screens/result.js';
import { profileScreen } from './screens/profile.js';

// ---------- start ----------
function boot() {
  applyDom();
  onLangChange(() => { applyDom(); render(); });
  S.onChange(() => { if (['list', 'detail'].includes(nav.name)) render(); });
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go({ name: b.dataset.tab }));
  protectContent();
  render();
  // sesja handlowca wygasa po ustalonym czasie
  setInterval(() => { if (user && !S.currentUser('rep')) render(); }, 60000);
  // wymuszanie aktualnej wersji: porównanie z wersją na serwerze
  checkVersion(); setInterval(checkVersion, 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
  // tryb offline: service worker trzyma ostatnią wersję aplikacji
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function checkVersion() {
  try {
    const txt = await (await fetch('../assets/js/core/version.js?ts=' + Date.now(), { cache: 'no-store' })).text();
    const remote = (txt.match(/VERSION\s*=\s*'([^']+)'/) || [])[1];
    if (remote && remote !== VERSION) {
      $('#updateMsg').textContent = t('update_needed', { v: remote, cur: VERSION });
      $('#update').classList.remove('hidden');
      $('#updateBtn').onclick = async () => {
        const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
        await Promise.all(regs.map(r => r.update().catch(() => {})));
        if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
        location.reload();
      };
    }
  } catch { /* offline — sprawdzimy później */ }
}



async function render() {
  setUser(S.currentUser('rep'));
  $('#tabs').classList.toggle('hidden', !user || !['list', 'map', 'profile'].includes(nav.name));
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === nav.name));
  $('#watermark').classList.toggle('hidden', !user);
  if (user) paintWatermark();
  bar();
  if (!user) return loginScreen();
  const fn = { list: listScreen, map: mapScreen, profile: profileScreen, detail: detailScreen, photo: photoScreen, summary: summaryScreen, result: resultScreen }[nav.name];
  await fn();
}


setRender(render);
boot();
