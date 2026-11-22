'use strict';
/* Sons synthétisés (aucun fichier audio). */
let actx = null, masterGain = null, noiseBuf = null, soundOn = true;
const engines = [];

function initAudio() {
  if (actx) { try { actx.resume(); } catch (e) {} return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    actx = new AC(); masterGain = actx.createGain(); masterGain.gain.value = soundOn ? .5 : 0; masterGain.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (let k = 0; k < 4; k++) { const o = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain(); o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(masterGain); o.start(); engines.push({ o, g }); }
  } catch (e) { actx = null; }
}
function setSound(on) { soundOn = on; if (masterGain) masterGain.gain.value = on ? .5 : 0; }
function audible() { return actx && typeof gstate !== 'undefined' && gstate !== 'menu'; }
function tone(f0, f1, dur, type, vol, delay) {
  if (!audible()) return;
  const t = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, f0, f1, vol, type, delay) {
  if (!audible()) return;
  const t = actx.currentTime + (delay || 0), n = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(); n.buffer = noiseBuf; f.type = type || 'bandpass';
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); n.connect(f); f.connect(g); g.connect(masterGain); n.start(t); n.stop(t + dur + .02);
}
const sfx = {
  beep: () => tone(440, 440, .14, 'square', .18), go: () => tone(880, 880, .4, 'square', .2),
  box: () => { tone(660, 990, .09, 'triangle', .25); tone(990, 1320, .09, 'triangle', .22, .08); },
  itemReady: () => { tone(880, 880, .07, 'square', .15); tone(1320, 1320, .12, 'square', .15, .07); },
  nitro: h => noise(.75, 500, 3200, h ? .4 : .12), pad: () => tone(300, 900, .25, 'sawtooth', .16),
  bump: () => tone(150, 50, .14, 'sine', .5), crash: () => { noise(.22, 1800, 200, .4); tone(120, 40, .2, 'sine', .5); },
  jump: () => tone(260, 640, .22, 'triangle', .22), land: () => { tone(110, 40, .18, 'sine', .55); noise(.15, 320, 150, .22); },
  finish: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, .18, 'square', .18, i * .12)),
  lastLap: () => { tone(988, 988, .1, 'square', .18); tone(988, 988, .1, 'square', .18, .16); },
  missile: () => { noise(.5, 2500, 600, .3); tone(900, 300, .45, 'sawtooth', .12); },
  explode: () => { noise(.7, 900, 60, .9, 'lowpass'); tone(90, 30, .5, 'sine', .8); },
  boing: () => { tone(220, 660, .08, 'sine', .4); tone(660, 330, .2, 'triangle', .3, .07); },
  drop: () => tone(500, 200, .15, 'triangle', .25), spin: () => noise(.5, 900, 2400, .25),
  shield: () => { tone(400, 1200, .3, 'sine', .25); tone(600, 1800, .3, 'sine', .15, .05); }, shieldPop: () => { tone(1400, 300, .2, 'sine', .3); noise(.15, 3000, 800, .2); },
  shock: () => { tone(80, 400, .35, 'sawtooth', .35); noise(.5, 200, 2400, .4); },
  loop: () => tone(200, 1100, .9, 'sine', .22), repair: () => [660, 880, 1100].forEach((f, i) => tone(f, f, .08, 'triangle', .25, i * .07)),
  full: () => { tone(660, 660, .09, 'triangle', .22); tone(990, 990, .09, 'triangle', .22, .09); tone(1320, 1320, .16, 'triangle', .22, .18); },
  cut: () => { tone(300, 1500, .5, 'sawtooth', .2); noise(.6, 600, 4000, .35); }, deny: () => { tone(220, 160, .18, 'square', .22); tone(160, 110, .25, 'square', .22, .16); },
  wreck: () => { noise(1, 1200, 50, .9, 'lowpass'); tone(200, 30, .8, 'sawtooth', .4); }, part: () => { noise(.18, 2500, 500, .35); tone(300, 90, .15, 'square', .2); },
};
function engineSound(list, live) {
  if (!actx) return; const t = actx.currentTime;
  for (let k = 0; k < engines.length; k++) {
    const c = list[k], e = engines[k]; if (!c) { e.g.gain.setTargetAtTime(0, t, .1); continue; }
    e.o.frequency.setTargetAtTime(70 + Math.hypot(c.vx, c.vz) * .42 + (c.boost > 0 ? 70 : 0) + k * 7, t, .05);
    e.g.gain.setTargetAtTime(live && c.dead <= 0 ? (c.human ? .045 : .01) : 0, t, .1);
  }
}
document.addEventListener('visibilitychange', () => { if (actx) try { document.hidden ? actx.suspend() : actx.resume(); } catch (e) {} });
