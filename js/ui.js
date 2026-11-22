'use strict';
/* Interface : boutons et infos à l'écran, commandes tactiles et clavier, menu, résultats, boucle principale. */
const glCanvas = document.getElementById('gl'), hud = document.getElementById('hud'), hctx = hud.getContext('2d');
const FONT = '"Outfit",system-ui,sans-serif';
const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const ITEM_COL = { turbo: '#12b5f5', missile: '#e5383b', oil: '#30323c', mine: '#565c6b', shield: '#1fb7b0', shock: '#a04be0' };
const PV = { x: 0, y: 0 };
let CW = 1, CH = 1, VW = 1, VH = 1, dpr = 1, dprCap = 2, rot = false, safe = { t: 0, r: 0, b: 0, l: 0 };
let humans = 1, maxHumans = 4, camMode = 'close', buttons = [], miniCache = null, lowShadow = false, perfT = 0, perfN = 0;
let ctrlMode = coarse ? 'stick' : 'buttons';
const sticks = [null, null, null, null], stickPtr = new Map();
try { camMode = localStorage.getItem('mb-cam') === 'whole' ? 'whole' : 'close'; const cm = localStorage.getItem('mb-ctrl'); if (cm === 'stick' || cm === 'buttons') ctrlMode = cm; } catch (e) {}

function resize() {
  CW = hud.clientWidth || innerWidth; CH = hud.clientHeight || innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  rot = coarse && CH > CW;                     // téléphone tenu en portrait : on tourne le jeu, il suffit de pencher l'appareil
  VW = rot ? CH : CW; VH = rot ? CW : CH;
  hud.width = Math.round(CW * dpr); hud.height = Math.round(CH * dpr);
  const cs = getComputedStyle(document.getElementById('probe')), p = k => parseFloat(cs[k]) || 0;
  const s = { t: p('paddingTop'), r: p('paddingRight'), b: p('paddingBottom'), l: p('paddingLeft') };
  safe = rot ? { t: s.r, r: s.b, b: s.l, l: s.t } : s;
  resizeWorld(CW, CH, VW, VH, rot, dpr); updateCamera(0, null, true, 0); miniCache = null;
  refreshPlayers(); layoutButtons();
}

/* ---------- boutons ---------- */
function layoutButtons() {
  buttons = []; if (gstate !== 'countdown' && gstate !== 'race') return;
  const r = Math.max(26, Math.min(44, VH * .085)), m = 12, g = 10, nH = cars.filter(c => c.human).length;
  const add = (p, act, lx, ly, rad, flip) => { const b = { p, act, r: rad, flip, x: flip ? VW - lx : lx, y: flip ? VH - ly : ly }; buttons.push(b); return b; };
  const rs = Math.max(48, Math.min(70, VH * .13));                                   // rayon du joystick
  // zone tactile du joystick : un rectangle donné côté joueur, retourné pour les joueurs assis en face
  const zone = (b, x0, y0, x1, y1) => { b.zone = b.flip ? { x0: VW - x1, y0: VH - y1, x1: VW - x0, y1: VH - y0 } : { x0, y0, x1, y1 }; };
  for (let p = 0; p < nH; p++) {
    const flip = p >= 2, sideRight = p % 2 === 1;
    const L = (flip ? safe.r : safe.l) + m, Rr = (flip ? safe.l : safe.r) + m, by = VH - (flip ? safe.t : safe.b) - m - r;
    if (ctrlMode === 'stick') {
      const sy = VH - (flip ? safe.t : safe.b) - m - rs, top = nH > 2 ? VH * .56 : VH * .34;
      if (nH === 1) {
        zone(add(p, 'stick', L + rs, sy, rs, false), 0, top, VW * .5, VH);
        add(p, 'fire', VW - Rr - r * 1.2, by - r * .2, r * 1.2, false); add(p, 'back', VW - Rr - r * 3.3 - g, by + r * .2, r * .8, false);
      } else if (!sideRight) {
        const f = add(p, 'fire', L + 2 * rs + g + r, by - r * .3, r, flip); add(p, 'back', L + 2 * rs + 2 * g + 2.6 * r, by + r * .25, r * .8, flip);
        zone(add(p, 'stick', L + rs, sy, rs, flip), 0, top, L + 2 * rs + g * .5, VH);
      } else {
        add(p, 'fire', VW - Rr - 2 * rs - g - r, by - r * .3, r, flip); add(p, 'back', VW - Rr - 2 * rs - 2 * g - 2.6 * r, by + r * .25, r * .8, flip);
        zone(add(p, 'stick', VW - Rr - rs, sy, rs, flip), VW - Rr - 2 * rs - g * .5, top, VW, VH);
      }
      continue;
    }
    if (nH === 1) {
      add(p, 'left', L + r, by, r, false); add(p, 'right', L + 3 * r + g, by, r, false);
      add(p, 'fire', VW - Rr - r * 1.2, by - r * .2, r * 1.2, false); add(p, 'back', VW - Rr - r * 3.3 - g, by + r * .2, r * .8, false);
    } else if (!sideRight) {
      add(p, 'left', L + r, by, r, flip); add(p, 'right', L + 3 * r + g, by, r, flip); add(p, 'fire', L + 5 * r + 2 * g, by, r, flip); add(p, 'back', L + 6.8 * r + 3 * g, by + r * .2, r * .8, flip);
    } else {
      add(p, 'back', VW - Rr - 6.8 * r - 3 * g, by + r * .2, r * .8, flip); add(p, 'fire', VW - Rr - 5 * r - 2 * g, by, r, flip); add(p, 'left', VW - Rr - 3 * r - g, by, r, flip); add(p, 'right', VW - Rr - r, by, r, flip);
    }
  }
}
const pointers = new Map();
function viewPos(e) { const b = hud.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; return rot ? [y, CW - x] : [x, y]; }
function hitButton(x, y) { let best = -1, bd = 1e9; buttons.forEach((b, i) => { if (b.act === 'stick') return; const d = Math.hypot(b.x - x, b.y - y); if (d < b.r * 1.4 && d < bd) { bd = d; best = i; } }); return best; }
function hitStick(x, y) { return buttons.find(b => b.act === 'stick' && !sticks[b.p] && x >= b.zone.x0 && x <= b.zone.x1 && y >= b.zone.y0 && y <= b.zone.y1); }
function moveStick(s, x, y) {
  let dx = x - s.bx, dy = y - s.by, d = Math.hypot(dx, dy);
  if (d > s.r) { s.bx += dx * (1 - s.r / d); s.by += dy * (1 - s.r / d); dx = x - s.bx; dy = y - s.by; d = s.r; }   // le socle suit le doigt s'il va trop loin
  s.kx = x; s.ky = y; const inp = input[s.p];
  if (d < 7) { inp.sm = 0; return; }                                                  // petite zone morte : rien ne bouge
  // le geste est pris tel qu'il est sur la vitre, même pour les joueurs assis en face : la voiture part là où va le doigt
  s.dx = dx / d; s.dy = dy / d;
  inp.sa = Math.atan2(dy / Math.cos(CAM.tilt), dx); inp.sm = Math.min(1, (d - 7) / 18);   // la vue est inclinée : on corrige la profondeur
}
function releaseStick(id) { const p = stickPtr.get(id); if (p === undefined) return; stickPtr.delete(id); sticks[p] = null; input[p].sm = 0; }
function clearSticks() { stickPtr.clear(); for (let p = 0; p < 4; p++) { sticks[p] = null; input[p].sm = 0; } }
function syncTouch() {
  for (const i of input) { i.tl = false; i.tr = false; i.tb = false; }
  for (const bi of pointers.values()) { const b = buttons[bi]; if (!b) continue; if (b.act === 'left') input[b.p].tl = true; if (b.act === 'right') input[b.p].tr = true; if (b.act === 'back') input[b.p].tb = true; }
}
hud.addEventListener('pointerdown', e => {
  if (gstate !== 'countdown' && gstate !== 'race') return; e.preventDefault();
  const [x, y] = viewPos(e), bi = hitButton(x, y);
  if (bi < 0) { const sb = hitStick(x, y); if (sb) { sticks[sb.p] = { p: sb.p, r: sb.r, flip: sb.flip, bx: x, by: y, kx: x, ky: y, dx: 0, dy: 0 }; stickPtr.set(e.pointerId, sb.p); input[sb.p].sm = 0; try { hud.setPointerCapture(e.pointerId); } catch (er) {} } return; }
  pointers.set(e.pointerId, bi); if (buttons[bi].act === 'fire') input[buttons[bi].p].fire = true; syncTouch();
});
hud.addEventListener('pointermove', e => {
  if (stickPtr.has(e.pointerId)) { const s = sticks[stickPtr.get(e.pointerId)]; if (s) { const [x, y] = viewPos(e); moveStick(s, x, y); } return; }
  if (!pointers.has(e.pointerId)) return; const old = buttons[pointers.get(e.pointerId)]; if (!old || (old.act !== 'left' && old.act !== 'right')) return;
  const [x, y] = viewPos(e), bi = hitButton(x, y);
  if (bi >= 0 && buttons[bi].p === old.p && (buttons[bi].act === 'left' || buttons[bi].act === 'right')) { pointers.set(e.pointerId, bi); syncTouch(); }
});
const releasePointer = e => { releaseStick(e.pointerId); if (pointers.delete(e.pointerId)) syncTouch(); };
hud.addEventListener('pointerup', releasePointer); hud.addEventListener('pointercancel', releasePointer);
hud.addEventListener('contextmenu', e => e.preventDefault());

const KEYS = { ArrowLeft: [0, 'kl'], ArrowRight: [0, 'kr'], ArrowUp: [0, 'n'], Space: [0, 'n'], ArrowDown: [0, 'kb'], KeyA: [1, 'kl'], KeyD: [1, 'kr'], KeyW: [1, 'n'], KeyS: [1, 'kb'],
  KeyJ: [2, 'kl'], KeyL: [2, 'kr'], KeyI: [2, 'n'], KeyK: [2, 'kb'], Numpad4: [3, 'kl'], Numpad6: [3, 'kr'], Numpad8: [3, 'n'], Numpad5: [3, 'kb'] };
addEventListener('keydown', e => { const k = KEYS[e.code]; if (!k || (gstate !== 'countdown' && gstate !== 'race')) return; e.preventDefault(); if (k[1] === 'n') { if (!e.repeat) input[k[0]].fire = true; } else input[k[0]][k[1]] = true; });
addEventListener('keyup', e => { const k = KEYS[e.code]; if (k && k[1] !== 'n') input[k[0]][k[1]] = false; });

/* ---------- dessin de l'affichage ---------- */
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function bolt(c, s) { c.beginPath(); c.moveTo(2 * s, -9 * s); c.lineTo(-5 * s, 1 * s); c.lineTo(-.5 * s, 1 * s); c.lineTo(-2 * s, 9 * s); c.lineTo(5 * s, -1 * s); c.lineTo(.5 * s, -1 * s); c.closePath(); c.fill(); }
function itemIcon(c, it, s) {
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  if (it === 'turbo') bolt(c, s / 11);
  else if (it === 'missile') {
    c.rotate(-Math.PI / 4); rr(c, -s * .5, -s * .2, s * .8, s * .4, s * .08); c.fill();
    c.beginPath(); c.moveTo(s * .3, -s * .2); c.lineTo(s * .74, 0); c.lineTo(s * .3, s * .2); c.closePath(); c.fill();
    for (const k of [-1, 1]) { c.beginPath(); c.moveTo(-s * .5, k * s * .2); c.lineTo(-s * .66, k * s * .46); c.lineTo(-s * .2, k * s * .2); c.closePath(); c.fill(); }
    c.fillStyle = '#ffd24a'; c.beginPath(); c.moveTo(-s * .54, -s * .13); c.lineTo(-s * .92, 0); c.lineTo(-s * .54, s * .13); c.closePath(); c.fill();
  } else if (it === 'oil') { c.beginPath(); c.moveTo(0, -s * .72); c.bezierCurveTo(s * .1, -s * .3, s * .5, 0, s * .5, s * .25); c.arc(0, s * .25, s * .5, 0, Math.PI); c.bezierCurveTo(-s * .5, 0, -s * .1, -s * .3, 0, -s * .72); c.fill(); }
  else if (it === 'mine') { c.beginPath(); c.arc(0, 0, s * .42, 0, TAU); c.fill(); c.lineWidth = s * .16; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.beginPath(); c.moveTo(Math.cos(a) * s * .4, Math.sin(a) * s * .4); c.lineTo(Math.cos(a) * s * .72, Math.sin(a) * s * .72); c.stroke(); } }
  else if (it === 'shield') { c.lineWidth = s * .16; c.beginPath(); c.moveTo(0, -s * .68); c.lineTo(s * .56, -s * .42); c.lineTo(s * .5, s * .15); c.quadraticCurveTo(s * .3, s * .6, 0, s * .74); c.quadraticCurveTo(-s * .3, s * .6, -s * .5, s * .15); c.lineTo(-s * .56, -s * .42); c.closePath(); c.stroke(); }
  else if (it === 'shock') { c.lineWidth = s * .13; for (const r of [.2, .47, .74]) { c.beginPath(); c.arc(0, 0, s * r, 0, TAU); c.stroke(); } }
  c.restore();
}
function ord(n) { return n === 1 ? '1er' : n + 'e'; }
function chip(c, txt, col, size) {
  c.font = `800 ${size}px ${FONT}`; const w = c.measureText(txt).width + size * 2.2, h = size * 1.75;
  c.fillStyle = 'rgba(15,18,30,.74)'; rr(c, -w / 2, -h / 2, w, h, h / 2); c.fill();
  c.fillStyle = col; c.beginPath(); c.arc(-w / 2 + size * .8, 0, size * .32, 0, TAU); c.fill();
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, size * .45, 1); return w;
}
function drawMini(c) {
  const w = Math.min(190, VW * .2), h = w / 2, corner = cars.filter(q => q.human).length <= 2, x0 = corner ? VW - safe.r - w - 10 : VW / 2 - w / 2, y0 = safe.t + (corner ? 10 : 48), k = w / WW;
  if (!miniCache || miniCache.tr !== track) {
    const m = document.createElement('canvas'); m.width = Math.round(w * dpr); m.height = Math.round(h * dpr); const x = m.getContext('2d'); x.scale(dpr * k, dpr * k);
    x.fillStyle = 'rgba(15,18,30,.55)'; rr(x, 0, 0, WW, WH, 90); x.fill(); x.lineJoin = 'round'; x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 60;
    x.beginPath(); x.moveTo(track.sx[0], track.sz[0]); for (let i = 1; i < track.N; i++) x.lineTo(track.sx[i], track.sz[i]); x.closePath(); x.stroke();
    miniCache = { tr: track, m };
  }
  c.drawImage(miniCache.m, x0, y0, w, h);
  for (const k2 of cars) { if (k2.dead > 0) continue; c.fillStyle = k2.color.css; c.beginPath(); c.arc(x0 + k2.x * k, y0 + k2.z * k, k2.human ? 5 : 3.6, 0, TAU); c.fill(); if (k2.human) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); } }
}
function drawHud() {
  const c = hctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, CW, CH);
  if (gstate !== 'countdown' && gstate !== 'race') return;
  if (rot) { c.translate(CW, 0); c.rotate(Math.PI / 2); }
  const nH = cars.filter(k => k.human).length;
  for (const k of cars) if (k.human && k.dead <= 0) { projectToView(k.x, k.y + 84, k.z, PV); c.save(); c.translate(PV.x, PV.y); chip(c, 'J' + (k.id + 1), k.color.css, 12); c.restore(); }
  if (camMode === 'close') drawMini(c);
  for (const b of buttons) {
    if (b.act !== 'stick') continue;
    const s = sticks[b.p], col = cars[b.p].color.css;
    if (!s) {                                                                          // au repos : un joystick discret montre où poser le pouce
      c.globalAlpha = .38; c.fillStyle = 'rgba(15,18,30,.55)'; c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.9)'; c.stroke(); c.fillStyle = col; c.beginPath(); c.arc(b.x, b.y, b.r * .42, 0, TAU); c.fill(); c.globalAlpha = 1; continue;
    }
    c.globalAlpha = .5; c.fillStyle = 'rgba(15,18,30,.6)'; c.beginPath(); c.arc(s.bx, s.by, s.r, 0, TAU); c.fill(); c.globalAlpha = 1;
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.75)'; c.stroke();
    c.fillStyle = col; c.beginPath(); c.arc(s.kx, s.ky, s.r * .45, 0, TAU); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke();
    // flèche autour de la voiture : la direction demandée, telle qu'on la voit à l'écran
    const car = cars[b.p]; if (input[b.p].sm > 0 && car.dead <= 0) {
      projectToView(car.x, car.y + 16, car.z, PV); const a = Math.atan2(s.dy, s.dx);
      c.save(); c.translate(PV.x, PV.y); c.rotate(a); c.globalAlpha = .9; c.fillStyle = col; c.strokeStyle = '#fff'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(78, 0); c.lineTo(56, -14); c.lineTo(61, 0); c.lineTo(56, 14); c.closePath(); c.fill(); c.stroke(); c.restore(); c.globalAlpha = 1;
    }
  }
  for (const b of buttons) {
    if (b.act === 'stick') continue;
    const car = cars[b.p], i = input[b.p]; let it = car.item; if (car.roul > 0) it = ITEMS[Math.floor(simTime * 14) % ITEMS.length];
    const down = b.act === 'left' ? (i.kl || i.tl) : b.act === 'right' ? (i.kr || i.tr) : b.act === 'back' ? (i.kb || i.tb) : false;
    c.save(); c.translate(b.x, b.y); if (b.flip) c.rotate(Math.PI);
    c.globalAlpha = down ? .95 : b.act === 'fire' && it ? .9 : .62;
    c.fillStyle = b.act === 'fire' ? (it ? ITEM_COL[it] : '#59607a') : b.act === 'back' ? '#2b3040' : car.color.css;
    c.beginPath(); c.arc(0, 0, b.r, 0, TAU); c.fill();
    c.globalAlpha = 1; c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.9)'; c.stroke(); c.fillStyle = '#fff';
    if (b.act === 'fire') { if (it) itemIcon(c, it, b.r * .82); else { c.globalAlpha = .5; c.font = `800 ${Math.round(b.r)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 0, 2); c.globalAlpha = 1; } }
    else if (b.act === 'back') { c.font = `800 ${Math.round(b.r * .95)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('R', 0, 2); }
    else { const s = b.act === 'left' ? -1 : 1, q = b.r * .38; c.beginPath(); c.moveTo(s * q, 0); c.lineTo(-s * q * .7, -q); c.lineTo(-s * q * .7, q); c.closePath(); c.fill(); }
    if (b.act === 'fire' && car.item && car.itemT > 0) { c.globalAlpha = Math.min(1, car.itemT * 2.5); c.translate(0, -b.r - 16); c.font = `800 14px ${FONT}`; const tw = c.measureText(ITEM_NAME[car.item]).width + 18; c.fillStyle = ITEM_COL[car.item]; rr(c, -tw / 2, -12, tw, 24, 12); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ITEM_NAME[car.item], 0, 1); c.globalAlpha = 1; }
    c.restore();
  }
  for (let p = 0; p < nH; p++) {
    const bs = buttons.filter(b => b.p === p && (nH > 1 ? b.act !== 'back' : (b.act === 'left' || b.act === 'right' || b.act === 'stick'))), car = cars[p]; if (!bs.length) continue;
    const flip = bs[0].flip, cx = bs.reduce((s, b) => s + b.x, 0) / bs.length;
    const cy = flip ? Math.max(...bs.map(b => b.y + b.r)) + 30 : Math.min(...bs.map(b => b.y - b.r)) - 30;
    const txt = car.finished ? ord(car.rank) + ' · Arrivé' : ord(car.rank) + ' · Tour ' + Math.max(1, Math.min(LAPS, car.lap)) + '/' + LAPS;
    c.save(); c.translate(cx, cy); if (flip) c.rotate(Math.PI);
    const w = chip(c, txt, car.color.css, 15), hp = Math.max(0, car.hp) / 100, bw = w - 26;
    c.fillStyle = 'rgba(15,18,30,.74)'; rr(c, -bw / 2 - 3, 15, bw + 6, 11, 5.5); c.fill();
    c.fillStyle = car.hitT > 0 ? '#ffffff' : hp > .5 ? '#35d873' : hp > .25 ? '#ffc23d' : '#ff4b4b'; if (hp > 0) { rr(c, -bw / 2, 18, Math.max(5, bw * hp), 5, 2.5); c.fill(); }
    c.restore();
  }
  if (gstate === 'countdown' || goT > 0) {
    const txt = gstate === 'countdown' ? String(Math.ceil(countT)) : 'Partez !', size = Math.round(VH * (gstate === 'countdown' ? .26 : .18));
    c.font = `800 ${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = size * .09; c.lineJoin = 'round'; c.strokeStyle = 'rgba(15,18,30,.75)'; c.strokeText(txt, VW / 2, VH * .3); c.fillStyle = '#fff'; c.fillText(txt, VW / 2, VH * .3);
  }
  if (banner) {
    const size = Math.round(VH * .11); c.globalAlpha = Math.min(1, banner.t * 3);
    c.font = `800 ${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = size * .12; c.lineJoin = 'round'; c.strokeStyle = 'rgba(15,18,30,.8)'; c.strokeText(banner.txt, VW / 2, VH * .24); c.fillStyle = banner.col; c.fillText(banner.txt, VW / 2, VH * .24); c.globalAlpha = 1;
  }
}

/* ---------- menu et résultats ---------- */
const $ = id => document.getElementById(id);
const menu = $('menu'), results = $('results'), topbar = $('topbar');
function refreshPlayers() {
  maxHumans = (coarse && Math.min(CW, CH) < 600) ? 2 : 4; if (humans > maxHumans) humans = maxHumans;
  const box = $('players'); box.textContent = '';
  for (let n = 1; n <= maxHumans; n++) { const b = document.createElement('button'); b.type = 'button'; b.id = 'players-' + n; b.textContent = n; b.setAttribute('aria-pressed', n === humans); b.onclick = () => { humans = n; refreshPlayers(); }; box.appendChild(b); }
  $('playersHint').textContent = (humans < 4 ? `L'ordinateur pilote ${4 - humans} voiture${4 - humans > 1 ? 's' : ''}. ` : '') + (maxHumans === 2 ? 'Jusqu\'à 4 joueurs sur tablette.' : '');
}
function refreshCtrl() { $('ctrl-stick').setAttribute('aria-pressed', ctrlMode === 'stick'); $('ctrl-buttons').setAttribute('aria-pressed', ctrlMode === 'buttons'); }
function setCtrl(m) { ctrlMode = m; try { localStorage.setItem('mb-ctrl', m); } catch (e) {} refreshCtrl(); }
function refreshCam() { $('cam-close').setAttribute('aria-pressed', camMode === 'close'); $('cam-whole').setAttribute('aria-pressed', camMode === 'whole'); $('view').textContent = camMode === 'close' ? 'Vue : proche' : 'Vue : circuit'; }
function setCam(m) { camMode = m; try { localStorage.setItem('mb-cam', m); } catch (e) {} refreshCam(); }
function paintThumb(tr) { if (!tr.thumb) return; const x = tr.thumb.getContext('2d'); x.setTransform(tr.thumb.width / WW, 0, 0, tr.thumb.height / WH, 0, 0); paintGround(x, tr, tr.thumb.width, tr.thumb.height); }
function buildTrackButtons() {
  const box = $('tracks');
  TRACKS.forEach((tr, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.id = 'track-' + i; b.setAttribute('aria-pressed', i === trackIdx);
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 160; tr.thumb = cv; paintThumb(tr);
    const s = document.createElement('span'); s.textContent = tr.def.name; b.append(cv, s);
    b.onclick = () => { if (trackIdx === i) return; trackIdx = i; track = tr; [...box.children].forEach((el, k) => el.setAttribute('aria-pressed', k === i)); loadTrackWorld(tr); startRace(0, 'menu'); updateCamera(0, null, true, 0); miniCache = null; };
    box.appendChild(b);
  });
}
function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
onRaceEnd = sorted => {
  topbar.hidden = true; pointers.clear(); clearSticks(); syncTouch(); layoutButtons();
  const best = sorted.find(c => c.human);
  $('resTitle').textContent = sorted[0].human ? 'Victoire !' : 'Arrivée';
  $('resSub').textContent = track.def.name + (best ? ' · ' + best.name + ' termine ' + ord(sorted.indexOf(best) + 1) : '');
  const ol = $('rank'); ol.textContent = '';
  sorted.forEach((c, i) => {
    const li = document.createElement('li'), mk = (cls, txt) => { const s = document.createElement('span'); s.className = cls; s.textContent = txt; return s; };
    const ch = mk('chip', ''); ch.style.background = c.color.css;
    li.append(mk('pos', ord(i + 1)), ch, mk('who', c.name), mk('time', c.finished ? fmt(c.time) : 'en course')); ol.appendChild(li);
  });
  results.hidden = false;
};
function begin() {
  menu.hidden = true; results.hidden = true; topbar.hidden = false; initAudio();
  try { const el = document.documentElement; if (coarse && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {}); } catch (e) {}
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
  clearSticks(); startRace(humans, 'countdown'); layoutButtons(); perfT = perfN = 0;
  updateCamera(0, camMode === 'close' ? cars.filter(c => c.human) : null, true, 0);
}
function toMenu() { results.hidden = true; topbar.hidden = true; menu.hidden = false; clearSticks(); pointers.clear(); syncTouch(); startRace(0, 'menu'); layoutButtons(); }
$('start').onclick = begin; $('again').onclick = begin; $('toMenu').onclick = toMenu; $('quit').onclick = toMenu;
$('snd').onclick = () => { setSound(!soundOn); $('snd').textContent = soundOn ? 'Son : oui' : 'Son : non'; };
$('view').onclick = () => setCam(camMode === 'close' ? 'whole' : 'close');
$('ctrl-stick').onclick = () => setCtrl('stick'); $('ctrl-buttons').onclick = () => setCtrl('buttons');
$('cam-close').onclick = () => setCam('close'); $('cam-whole').onclick = () => setCam('whole');

/* ---------- boucle principale ---------- */
let lastTs = 0, simAcc = 0;
function frame(ts) {
  const raw = (ts - lastTs) / 1000 || 0, dt = Math.min(.066, raw); lastTs = ts; simAcc += dt;
  let n = 0; while (simAcc >= STEP && n < 8) { update(STEP); simAcc -= STEP; n++; } if (n === 8) simAcc = 0;
  for (const c of cars) syncCar(c, dt, simTime);
  updateWorldFx(dt, simTime, track);
  let list = null;
  if (camMode === 'close' && (gstate === 'countdown' || gstate === 'race')) { list = cars.filter(c => c.human && !c.finished); if (!list.length) list = cars.filter(c => c.human); }
  updateCamera(dt, list, false, shake > 0 && gstate !== 'menu' ? 16 : 0);
  renderer.render(scene, camera); drawHud(); engineSound(cars, gstate === 'race' || gstate === 'countdown');
  // si l'appareil peine, on allège : d'abord les ombres, puis la finesse de l'image
  if (gstate === 'race' && raw < .5 && !window.__noAdapt) { perfT += raw; perfN++; if (perfT > 3) { if (perfT / perfN > .027) { if (!lowShadow) { lowShadow = true; setShadows(false); } else if (dprCap > 1) { dprCap = 1; resize(); } } perfT = perfN = 0; } }
  requestAnimationFrame(frame);
}

/* ---------- démarrage ---------- */
function loadImages() {
  TRACKS.forEach((tr, i) => {
    for (const kind of ['ground', 'road']) { const im = new Image(); im.onload = () => { IMG[kind][i] = im; if (IMG.ground[i] && IMG.road[i]) { paintThumb(tr); if (tr === track) repaintGround(tr); } }; im.src = 'assets/' + kind + i + '.jpg'; }
  });
}
let webglOk = true;
try { initWorld(glCanvas); } catch (e) { webglOk = false; }
if (webglOk) {
  buildTrackButtons(); loadTrackWorld(track); startRace(0, 'menu'); refreshCam(); refreshCtrl(); resize(); loadImages();
  addEventListener('resize', resize); requestAnimationFrame(frame);
} else { $('start').disabled = true; document.querySelector('#menu .help').textContent = 'Ce navigateur ne peut pas afficher la 3D (WebGL indisponible). Essaie avec une version récente de Chrome ou de Safari.'; }
window.__mb = { update, get cars() { return cars; }, get gstate() { return gstate; }, get debris() { return debris.length; }, get track() { return track; }, stats, input, sticks, damageCar, explode, useItem, CAM, TRACKS };
