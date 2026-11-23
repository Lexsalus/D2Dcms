// Test biometrii: node tests/biometrics.test.mjs
import { pinVector, pinScore, sigFeatures, sigScore, touchScore } from '../assets/js/domain/biometrics.js';
const ok = (c, m) => console.log(c ? 'OK  ' : 'FAIL', m);
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// PIN: ten sam rytm ±10% vs zupełnie inny
const rhythm = (gaps, jit) => { let t = 0; return [0, ...gaps.map(g => (t += g * (1 + (rnd() - .5) * jit)))]; };
const mine = [180, 260, 150];
const prof = Array.from({ length: 5 }, () => pinVector(rhythm(mine, .2)));
const same = pinScore(prof, pinVector(rhythm(mine, .2)));
const other = pinScore(prof, pinVector(rhythm([600, 90, 420], .2)));
ok(same < 2.5, `PIN ten sam rytm → ${same}`);
ok(other > 2.5, `PIN obcy rytm → ${other}`);

// Podpis: sinusoida (wzorzec) vs inny kształt i tempo
const sig = (f, dur, jit) => [Array.from({ length: 60 }, (_, i) => ({ x: i * 4 + (rnd() - .5) * jit, y: 50 + f(i / 59) * 30 + (rnd() - .5) * jit, t: i / 59 * dur * (1 + (rnd() - .5) * .1) }))];
const wave = u => Math.sin(u * Math.PI * 4);
const T = [1, 2, 3].map(() => sigFeatures(sig(wave, 1200, 3)));
const sOk = sigScore(T, sigFeatures(sig(wave, 1250, 3)));
const sBad = sigScore(T, sigFeatures(sig(u => (u < .5 ? u : 1 - u) * 2, 500, 3)));
ok(sOk.score < 2, `podpis zgodny → ${sOk.score}`);
ok(sBad.score > 2, `podpis obcy → ${sBad.score}`);

// Dotyk
const tf = (hold, gap, area) => ({ hold: Math.log(hold * (1 + (rnd() - .5) * .2)), gap: Math.log(gap * (1 + (rnd() - .5) * .3)), area: Math.log(area), swipe: null });
const TP = Array.from({ length: 5 }, () => tf(90, 900, 120));
const tOk = touchScore(TP, tf(95, 950, 125)), tBad = touchScore(TP, tf(260, 300, 300));
ok(tOk < 3, `dotyk zgodny → ${tOk}`);
ok(tBad > 3, `dotyk obcy → ${tBad}`);
