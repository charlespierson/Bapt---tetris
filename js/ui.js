'use strict';
/* Interface : écrans des joueurs (un seul, ou deux face à face), commandes, affichage, réglages par joueur, langue, boucle principale. */
const glCanvas = document.getElementById('gl'), hud = document.getElementById('hud'), hctx = hud.getContext('2d');
const $ = id => document.getElementById(id);
const FONT = '"Outfit",system-ui,sans-serif';
const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const ITEM_COL = { recharge: '#12b5f5', missile: '#e5383b', oil: '#30323c', mine: '#565c6b', shield: '#1fb7b0', shock: '#a04be0' };
const MSG_COL = { full: '#4fd8ff', cutOk: '#4be08a', cutNo: '#ff5b5b', lastLap: '#ffd24a', wreck: '#ff8a5b' };
let CW = 1, CH = 1, dpr = 1, dprCap = 2, safe = { t: 0, r: 0, b: 0, l: 0 };
let lang = 'fr', humans = 1, lowShadow = false, perfT = 0, perfN = 0, lastSorted = null;
let views = [];                                  // un écran par joueur, ou la vue d'ensemble derrière le menu
const VIEW = { m: newView(), 0: newView(), 1: newView() }, miniCache = {};

/* ---------- langue ---------- */
const I18N = {
  fr: { sub: 'Buggies télécommandés : 4 voitures, 7 tours, tous les coups sont permis', players: 'Joueurs', p1: '1 joueur', p2: '2 joueurs, face à face', decor: 'Décor', language: 'Langue', next: 'Continuer',
    help: 'La jauge de boost se remplit toute seule, et deux fois plus vite si tu ne touches pas les murs. Plus elle est pleine, plus le boost est fort. Jauge pleine, tu peux prendre un raccourci : il coûte 50 %, 75 % ou 100 % de la jauge. Sans jauge pleine, le raccourci te freine. Les caisses « ? » donnent un objet, la croix verte répare la voiture.',
    keys: 'Clavier : J1 ← → tourner, ↑ boost, Espace objet, ↓ marche arrière · J2 A D, W, E, S (positions d\'un clavier QWERTY).',
    player: 'Joueur', cpu: 'Ordi', ctrl: 'Commandes', arrows: 'Flèches ◀ ▶', arrowsSub: 'débutant', stick: 'Joystick', stickSub: 'expert', side: 'Direction', left: 'À gauche', right: 'À droite', size: 'Taille', cam: 'Caméra', near: 'Proche', far: 'Lointaine', top: 'Dessus',
    ready: 'Prêt', readyOk: 'Prêt ✓', waiting: 'En attente de l\'autre joueur…', tall: 'Astuce : à deux, tiens le téléphone à la verticale pour avoir plus de place.', menu: 'Menu', lap: 'Tour', finished: 'Arrivé', start: 'Partez !',
    m_full: 'Boost plein !', m_cutOk: 'Raccourci !', m_cutNo: 'Boost insuffisant !', m_lastLap: 'Dernier tour !', m_wreck: 'En miettes !',
    i_recharge: 'Recharge', i_missile: 'Missile', i_oil: 'Huile', i_mine: 'Mine', i_shield: 'Bouclier', i_shock: 'Onde de choc',
    win: 'Victoire !', again: 'Rejouer', settings: 'Réglages', racing: 'en course', sndOn: 'Son : oui', sndOff: 'Son : non', nogl: 'Ce navigateur ne peut pas afficher la 3D (WebGL indisponible). Essaie avec une version récente de Chrome ou de Safari.' },
  en: { sub: 'Radio-controlled buggies: 4 cars, 7 laps, anything goes', players: 'Players', p1: '1 player', p2: '2 players, face to face', decor: 'Scenery', language: 'Language', next: 'Continue',
    help: 'The boost gauge fills by itself, and twice as fast if you stay off the walls. The fuller it is, the stronger the boost. With a full gauge you can take a shortcut: it costs 50%, 75% or 100% of the gauge. Without a full gauge, the shortcut slows you down. "?" crates give an item, the green cross repairs the car.',
    keys: 'Keyboard: P1 ← → steer, ↑ boost, Space item, ↓ reverse · P2 A D, W, E, S.',
    player: 'Player', cpu: 'CPU', ctrl: 'Controls', arrows: 'Arrows ◀ ▶', arrowsSub: 'beginner', stick: 'Joystick', stickSub: 'expert', side: 'Steering', left: 'Left side', right: 'Right side', size: 'Size', cam: 'Camera', near: 'Close', far: 'Far', top: 'Top',
    ready: 'Ready', readyOk: 'Ready ✓', waiting: 'Waiting for the other player…', tall: 'Tip: for two players, hold the phone upright to get more room.', menu: 'Menu', lap: 'Lap', finished: 'Finished', start: 'Go!',
    m_full: 'Boost full!', m_cutOk: 'Shortcut!', m_cutNo: 'Not enough boost!', m_lastLap: 'Final lap!', m_wreck: 'Wrecked!',
    i_recharge: 'Refill', i_missile: 'Missile', i_oil: 'Oil', i_mine: 'Mine', i_shield: 'Shield', i_shock: 'Shockwave',
    win: 'You win!', again: 'Play again', settings: 'Settings', racing: 'racing', sndOn: 'Sound: on', sndOff: 'Sound: off', nogl: 'This browser cannot display 3D (WebGL unavailable). Try a recent version of Chrome or Safari.' },
};
const T = k => I18N[lang][k] || k;
function ord(n) { return lang === 'fr' ? (n === 1 ? '1er' : n + 'e') : n + (['th', 'st', 'nd', 'rd'][n] || 'th'); }
function carName(c) { return c.human ? T('player') + ' ' + (c.id + 1) : T('cpu') + ' ' + c.color[lang]; }
try { const l = localStorage.getItem('mb-lang'); lang = l === 'fr' || l === 'en' ? l : ((navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en'); } catch (e) {}

/* ---------- réglages de chaque joueur (mémorisés sur l'appareil) ---------- */
const DEF_SET = { ctrl: 'arrows', side: 'left', size: 1, cam: 'near' };
function loadSet(p) { let s = null; try { s = JSON.parse(localStorage.getItem('mb-set' + p)); } catch (e) {} return Object.assign({}, DEF_SET, s || {}); }
const PSET = [loadSet(0), loadSet(1)], READY = [false, false];
function saveSet(p) { try { localStorage.setItem('mb-set' + p, JSON.stringify(PSET[p])); } catch (e) {} }

/* ---------- écrans ---------- */
function layoutViews() {
  views = [];
  if (gstate === 'menu') { const V = VIEW.m; V.p = -1; V.x = 0; V.y = 0; V.w = CW; V.h = CH; V.flip = false; views.push(V); }
  else if (humans === 1) { const V = VIEW[0]; V.p = 0; V.x = 0; V.y = 0; V.w = CW; V.h = CH; V.flip = false; V.ins = { l: safe.l, r: safe.r, b: safe.b, t: safe.t }; views.push(V); }
  else {                                         // deux joueurs face à face : l'écran du haut est retourné
    const h = Math.floor(CH / 2), A = VIEW[0], B = VIEW[1];
    A.p = 0; A.x = 0; A.y = CH - h; A.w = CW; A.h = h; A.flip = false; A.ins = { l: safe.l, r: safe.r, b: safe.b, t: 0 };
    B.p = 1; B.x = 0; B.y = 0; B.w = CW; B.h = h; B.flip = true; B.ins = { l: safe.r, r: safe.l, b: safe.t, t: 0 };
    views.push(A, B);
  }
  for (const V of views) layoutButtons(V);
  for (const p of [0, 1]) { const el = $('card' + p), V = views.find(v => v.p === p); el.hidden = !V || !el.innerHTML; if (V) { el.style.left = V.x + 'px'; el.style.top = V.y + 'px'; el.style.width = V.w + 'px'; el.style.height = V.h + 'px'; el.classList.toggle('flip', V.flip); } }
  $('topbar').classList.toggle('mid', humans === 2 && gstate !== 'menu');
}
function resize() {
  CW = hud.clientWidth || innerWidth; CH = hud.clientHeight || innerHeight; dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  hud.width = Math.round(CW * dpr); hud.height = Math.round(CH * dpr);
  const cs = getComputedStyle($('probe')), p = k => parseFloat(cs[k]) || 0; safe = { t: p('paddingTop'), r: p('paddingRight'), b: p('paddingBottom'), l: p('paddingLeft') };
  resizeWorld(CW, CH, dpr); layoutViews(); for (const V of views) V.snap = true;
}

/* ---------- boutons : placés dans le repère de l'écran du joueur (origine en haut à gauche de son point de vue) ---------- */
function layoutButtons(V) {
  V.buttons = []; if (V.p < 0) return;
  const s = PSET[V.p], ins = V.ins, k = s.size, r = clamp(Math.min(V.w, V.h * 1.8) * .072, 23, 44) * k, m = 10, g = 9, L = ins.l + m, R = V.w - ins.r - m, by = V.h - ins.b - m - r;
  const left = s.side === 'left', add = (act, x, y, rad) => V.buttons.push({ act, x, y, r: rad });
  if (s.ctrl === 'stick') { const rs = r * 1.5; add('stick', left ? L + rs : R - rs, V.h - ins.b - m - rs, rs); V.zone = { x0: left ? 0 : V.w * .5, x1: left ? V.w * .5 : V.w, y0: V.h * .3 }; }
  else if (left) { add('left', L + r, by, r); add('right', L + 3 * r + g, by, r); } else { add('left', R - 3 * r - g, by, r); add('right', R - r, by, r); }
  // actions du côté opposé à la direction : le boost dans le coin, l'objet et la marche arrière à côté
  const rb = r * 1.18, dir = left ? -1 : 1, bx = (left ? R : L) + dir * rb, byb = by - (rb - r); add('boost', bx, byb, rb);
  if (V.w < 600 * k) { add('item', bx, byb - rb - g - r, r); add('back', bx + dir * (rb + g + r * .78), by + r * .22, r * .78); }
  else { add('item', bx + dir * (rb + g + r), by, r); add('back', bx + dir * (rb + 2 * g + 2 * r + r * .78), by + r * .22, r * .78); }
}
const pointers = new Map();                      // doigt -> { V, b } (bouton) ou { V, stick: true }
function findView(X, Y) { return views.find(V => V.p >= 0 && X >= V.x && X < V.x + V.w && Y >= V.y && Y < V.y + V.h); }
function toLocal(V, e) { const b = hud.getBoundingClientRect(), X = e.clientX - b.left, Y = e.clientY - b.top; return V.flip ? [V.x + V.w - X, V.y + V.h - Y] : [X - V.x, Y - V.y]; }
function hitButton(V, x, y) { let best = null, bd = 1e9; for (const b of V.buttons) { if (b.act === 'stick') continue; const d = Math.hypot(b.x - x, b.y - y); if (d < b.r * 1.4 && d < bd) { bd = d; best = b; } } return best; }
function syncTouch() {
  for (const i of input) { i.tl = false; i.tr = false; i.tb = false; }
  for (const q of pointers.values()) { if (!q.b) continue; const i = input[q.V.p]; if (q.b.act === 'left') i.tl = true; if (q.b.act === 'right') i.tr = true; if (q.b.act === 'back') i.tb = true; }
}
function moveStick(V, x, y) {
  const s = V.stick, inp = input[V.p]; let dx = x - s.bx, dy = y - s.by, d = Math.hypot(dx, dy);
  if (d > s.r) { s.bx += dx * (1 - s.r / d); s.by += dy * (1 - s.r / d); dx = x - s.bx; dy = y - s.by; d = s.r; }   // le socle suit le doigt s'il va trop loin
  s.kx = x; s.ky = y;
  if (PSET[V.p].cam === 'top') {                 // vue de dessus : on pointe la direction voulue sur l'écran
    inp.rel = false; if (d < 7) { inp.sm = 0; return; } inp.sa = Math.atan2(dy / Math.cos(TOP_TILT), dx); inp.sm = Math.min(1, (d - 7) / 18);
  } else { inp.sm = 0; inp.rel = true; inp.sx = Math.abs(dx) < 5 ? 0 : clamp((dx - Math.sign(dx) * 5) / (s.r * .7), -1, 1); }   // vue poursuite : un volant, gauche / droite
}
function clearTouches() { pointers.clear(); for (const p of [0, 1]) { VIEW[p].stick = null; const i = input[p]; i.sm = 0; i.rel = false; i.sx = 0; i.tl = i.tr = i.tb = false; } }
hud.addEventListener('pointerdown', e => {
  if (gstate === 'menu' || gstate === 'done') return; e.preventDefault();
  const r = hud.getBoundingClientRect(), V = findView(e.clientX - r.left, e.clientY - r.top); if (!V) return;
  const [x, y] = toLocal(V, e), b = hitButton(V, x, y);
  if (b) { pointers.set(e.pointerId, { V, b }); if (b.act === 'boost') input[V.p].boost = true; if (b.act === 'item') input[V.p].fire = true; syncTouch(); return; }
  const sb = V.buttons.find(q => q.act === 'stick');
  if (sb && !V.stick && x >= V.zone.x0 && x <= V.zone.x1 && y >= V.zone.y0) { V.stick = { r: sb.r, bx: x, by: y, kx: x, ky: y }; pointers.set(e.pointerId, { V, stick: true }); try { hud.setPointerCapture(e.pointerId); } catch (er) {} }
});
hud.addEventListener('pointermove', e => {
  const q = pointers.get(e.pointerId); if (!q) return; const [x, y] = toLocal(q.V, e);
  if (q.stick) { if (q.V.stick) moveStick(q.V, x, y); return; }
  if (q.b.act !== 'left' && q.b.act !== 'right') return;
  const b = hitButton(q.V, x, y); if (b && (b.act === 'left' || b.act === 'right')) { q.b = b; syncTouch(); }
});
const releasePointer = e => { const q = pointers.get(e.pointerId); if (!q) return; pointers.delete(e.pointerId); if (q.stick) { q.V.stick = null; const i = input[q.V.p]; i.sm = 0; i.rel = false; i.sx = 0; } syncTouch(); };
hud.addEventListener('pointerup', releasePointer); hud.addEventListener('pointercancel', releasePointer);
hud.addEventListener('contextmenu', e => e.preventDefault());

const KEYS = { ArrowLeft: [0, 'kl'], ArrowRight: [0, 'kr'], ArrowDown: [0, 'kb'], ArrowUp: [0, 'boost'], Space: [0, 'fire'], KeyA: [1, 'kl'], KeyD: [1, 'kr'], KeyS: [1, 'kb'], KeyW: [1, 'boost'], KeyE: [1, 'fire'], KeyQ: [1, 'fire'] };
addEventListener('keydown', e => { const k = KEYS[e.code]; if (!k || gstate === 'menu' || gstate === 'done' || gstate === 'setup') return; e.preventDefault(); const i = input[humans === 1 ? 0 : k[0]]; if (k[1] === 'boost' || k[1] === 'fire') { if (!e.repeat) i[k[1]] = true; } else i[k[1]] = true; });
addEventListener('keyup', e => { const k = KEYS[e.code]; if (k && k[1][0] === 'k') { input[k[0]][k[1]] = false; if (humans === 1) input[0][k[1]] = false; } });

/* ---------- dessin de l'affichage ---------- */
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function bolt(c, s) { c.beginPath(); c.moveTo(2 * s, -9 * s); c.lineTo(-5 * s, 1 * s); c.lineTo(-.5 * s, 1 * s); c.lineTo(-2 * s, 9 * s); c.lineTo(5 * s, -1 * s); c.lineTo(.5 * s, -1 * s); c.closePath(); c.fill(); }
function itemIcon(c, it, s) {
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  if (it === 'recharge') { c.lineWidth = s * .15; c.beginPath(); c.arc(0, 0, s * .66, -.5, Math.PI * 1.5); c.stroke(); bolt(c, s / 17); }
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
function outlined(c, txt, x, y, size, col) { c.font = `800 ${Math.round(size)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = size * .11; c.lineJoin = 'round'; c.strokeStyle = 'rgba(15,18,30,.8)'; c.strokeText(txt, x, y); c.fillStyle = col; c.fillText(txt, x, y); }
/* Petit plan du circuit vu de dessus (sert aussi d'aperçu des décors dans le menu). */
function paintMini(x, tr, flat) {
  const th = tr.def.theme, line = (sx, sz, n, closed) => { x.beginPath(); x.moveTo(sx[0], sz[0]); for (let i = 1; i < n; i++) x.lineTo(sx[i], sz[i]); if (closed) x.closePath(); x.stroke(); };
  x.lineJoin = 'round'; x.lineCap = 'butt';
  if (flat) { x.fillStyle = 'rgba(15,18,30,.55)'; rr(x, 0, 0, WW, WH, 150); x.fill(); x.strokeStyle = '#ffb21f'; x.lineWidth = 60; for (const cu of tr.cuts) line(cu.sx, cu.sz, cu.M, false); x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 90; line(tr.sx, tr.sz, tr.N, true); return; }
  x.fillStyle = th.ground; x.fillRect(0, 0, WW, WH); const gi = IMG.ground[tr.index]; if (gi) for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) x.drawImage(gi, a * WW / 2, b * WH / 2, WW / 2, WH / 2);
  x.strokeStyle = '#ffb21f'; x.lineWidth = 150; for (const cu of tr.cuts) line(cu.sx, cu.sz, cu.M, false);
  x.strokeStyle = th.kerbDark; x.lineWidth = 236; line(tr.sx, tr.sz, tr.N, true); x.strokeStyle = th.road; x.lineWidth = 200; line(tr.sx, tr.sz, tr.N, true);
  x.fillStyle = '#fff'; x.fillRect(tr.sx[0] - 16, tr.sz[0] - 100, 32, 200);
}
function drawMini(c, V) {
  const w = clamp(V.w * .27, 84, 168), h = w * WH / WW, x0 = V.w - V.ins.r - 10 - w, y0 = V.ins.t + 10, k = w / WW, key = Math.round(w * dpr);
  let m = miniCache[key]; if (!m) { m = miniCache[key] = document.createElement('canvas'); m.width = key; m.height = Math.round(h * dpr); const x = m.getContext('2d'); x.scale(key / WW, key / WW); paintMini(x, track, true); }
  c.drawImage(m, x0, y0, w, h);
  for (const q of cars) { if (q.dead > 0) continue; c.fillStyle = q.color.css; c.beginPath(); c.arc(x0 + q.x * k, y0 + q.z * k, q.id === V.p ? 5 : 3.4, 0, TAU); c.fill(); if (q.id === V.p) { c.strokeStyle = '#fff'; c.lineWidth = 1.6; c.stroke(); } }
}
function drawButtons(c, V) {
  const car = cars[V.p], inp = input[V.p], col = car.color.css;
  for (const b of V.buttons) {
    if (b.act === 'stick') {
      const s = V.stick, bx = s ? s.bx : b.x, by = s ? s.by : b.y;
      c.globalAlpha = s ? .5 : .36; c.fillStyle = 'rgba(15,18,30,.6)'; c.beginPath(); c.arc(bx, by, b.r, 0, TAU); c.fill(); c.globalAlpha = s ? 1 : .6; c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.8)'; c.stroke();
      c.fillStyle = col; c.beginPath(); c.arc(s ? s.kx : bx, s ? s.ky : by, b.r * .44, 0, TAU); c.fill(); c.strokeStyle = '#fff'; c.stroke(); c.globalAlpha = 1; continue;
    }
    let it = car.item; if (car.roul > 0) it = ITEMS[Math.floor(simTime * 14) % ITEMS.length];
    const down = b.act === 'left' ? (inp.kl || inp.tl) : b.act === 'right' ? (inp.kr || inp.tr) : b.act === 'back' ? (inp.kb || inp.tb) : b.act === 'boost' ? car.boost > 0 : false, full = car.gauge >= .995;
    c.save(); c.translate(b.x, b.y);
    c.globalAlpha = down ? .95 : (b.act === 'item' && it) || (b.act === 'boost' && car.gauge >= .12) ? .9 : .6;
    c.fillStyle = b.act === 'item' ? (it ? ITEM_COL[it] : '#59607a') : b.act === 'back' ? '#2b3040' : b.act === 'boost' ? (full ? '#f2a516' : '#1f2a44') : col;
    c.beginPath(); c.arc(0, 0, b.r, 0, TAU); c.fill(); c.globalAlpha = 1; c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.9)'; c.stroke(); c.fillStyle = '#fff';
    if (b.act === 'boost') {                     // l'anneau montre le niveau de la jauge
      c.lineWidth = b.r * .2; c.strokeStyle = full ? '#fff3b0' : '#12b5f5'; c.beginPath(); c.arc(0, 0, b.r * .78, -Math.PI / 2, -Math.PI / 2 + TAU * car.gauge); c.stroke();
      c.fillStyle = car.gauge >= .12 ? '#fff' : 'rgba(255,255,255,.4)'; bolt(c, b.r / 19);
    } else if (b.act === 'item') { if (it) itemIcon(c, it, b.r * .82); else { c.globalAlpha = .5; c.font = `800 ${Math.round(b.r)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 0, 2); c.globalAlpha = 1; } }
    else if (b.act === 'back') { c.font = `800 ${Math.round(b.r * .95)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('R', 0, 2); }
    else { const s = b.act === 'left' ? -1 : 1, q = b.r * .38; c.beginPath(); c.moveTo(s * q, 0); c.lineTo(-s * q * .7, -q); c.lineTo(-s * q * .7, q); c.closePath(); c.fill(); }
    if (b.act === 'item' && car.item && car.itemT > 0) { const nm = T('i_' + car.item); c.globalAlpha = Math.min(1, car.itemT * 2.5); c.translate(0, -b.r - 15); c.font = `800 13px ${FONT}`; const tw = c.measureText(nm).width + 18; c.fillStyle = ITEM_COL[car.item]; rr(c, -tw / 2, -11, tw, 22, 11); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(nm, 0, 1); c.globalAlpha = 1; }
    c.restore();
  }
}
function drawViewHud(V) {
  const c = hctx, car = cars[V.p]; if (!car) return;
  c.save(); if (V.flip) { c.translate(V.x + V.w, V.y + V.h); c.rotate(Math.PI); } else c.translate(V.x, V.y);
  c.beginPath(); c.rect(0, 0, V.w, V.h); c.clip();
  drawButtons(c, V);
  if (gstate !== 'setup') {
    const ins = V.ins, u = clamp(Math.min(V.w, V.h * 1.6) / 420, .8, 1.25), x0 = ins.l + 10, fs = Math.round(14 * u), ch = fs * 1.8; let y = ins.t + 10;
    // en haut à gauche : place et tour, état de la voiture, jauge de boost avec les repères 50 % et 75 % (coût des raccourcis)
    const txt = car.finished ? ord(car.rank) + ' · ' + T('finished') : ord(car.rank) + ' · ' + T('lap') + ' ' + clamp(car.lap, 1, LAPS) + '/' + LAPS;
    c.font = `800 ${fs}px ${FONT}`; const cw = c.measureText(txt).width + fs * 2.2;
    c.fillStyle = 'rgba(15,18,30,.74)'; rr(c, x0, y, cw, ch, ch / 2); c.fill(); c.fillStyle = car.color.css; c.beginPath(); c.arc(x0 + fs * .85, y + ch / 2, fs * .33, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(txt, x0 + fs * 1.5, y + ch / 2 + 1); y += ch + 7;
    const bw = 150 * u, hp = Math.max(0, car.hp) / 100, hh = 7 * u, gh = 14 * u, g = car.gauge, full = g >= .995;
    c.fillStyle = 'rgba(15,18,30,.74)'; rr(c, x0 - 3, y - 3, bw + 6, hh + 6, (hh + 6) / 2); c.fill();
    c.fillStyle = car.hitT > 0 ? '#fff' : hp > .5 ? '#35d873' : hp > .25 ? '#ffc23d' : '#ff4b4b'; if (hp > 0) { rr(c, x0, y, Math.max(hh, bw * hp), hh, hh / 2); c.fill(); } y += hh + 8;
    c.fillStyle = 'rgba(15,18,30,.74)'; rr(c, x0 - 3, y - 3, bw + 6, gh + 6, (gh + 6) / 2); c.fill();
    c.fillStyle = full ? (Math.floor(simTime * 6) % 2 ? '#ffd24a' : '#fff3b0') : '#12b5f5'; if (g > .01) { rr(c, x0, y, Math.max(gh, bw * g), gh, gh / 2); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,.95)'; for (const q of [.5, .75]) c.fillRect(x0 + bw * q - 1, y - 2, 2, gh + 4);
    c.fillStyle = full ? '#7a4a00' : '#fff'; c.save(); c.translate(x0 + gh * .75, y + gh / 2); bolt(c, gh / 24); c.restore();
    if (car.cleanT > 5 && !full && car.boost <= 0) { c.font = `800 ${Math.round(12 * u)}px ${FONT}`; c.fillStyle = '#9fe8ff'; c.textAlign = 'left'; c.strokeStyle = 'rgba(15,18,30,.8)'; c.lineWidth = 3; c.strokeText('×2', x0 + bw + 9, y + gh / 2 + 1); c.fillText('×2', x0 + bw + 9, y + gh / 2 + 1); }
    drawMini(c, V);
    if (gstate === 'countdown') outlined(c, String(Math.ceil(countT)), V.w / 2, V.h * .36, Math.min(V.h * .3, V.w * .22), '#fff');
    else if (goT > 0) outlined(c, T('start'), V.w / 2, V.h * .36, Math.min(V.h * .18, V.w * .12), '#fff');
    else if (car.msg) { c.globalAlpha = Math.min(1, car.msg.t * 3); outlined(c, T('m_' + car.msg.k), V.w / 2, V.h * .3, Math.min(V.h * .11, V.w * .08), MSG_COL[car.msg.k] || '#fff'); c.globalAlpha = 1; }
  }
  c.restore();
}

/* ---------- menu, réglages par joueur, résultats ---------- */
const menu = $('menu'), topbar = $('topbar');
function setupCard(p) {
  const s = PSET[p], seg = (key, opts) => `<div class="seg">${opts.map(o => `<button type="button" data-p="${p}" data-k="${key}" data-v="${o[0]}" aria-pressed="${s[key] === o[0]}">${o[1]}${o[2] ? `<small>${o[2]}</small>` : ''}</button>`).join('')}</div>`;
  const small = humans === 2 && CH / 2 < 250;
  return `<div class="card"><div class="chead"><span class="dot" style="background:${CAR_COLORS[p].css}"></span><b>${T('player')} ${p + 1}</b><button type="button" class="link" data-act="menu">‹ ${T('menu')}</button></div>
    <div class="fields">
      <div class="field"><div class="label">${T('ctrl')}</div>${seg('ctrl', [['arrows', T('arrows'), T('arrowsSub')], ['stick', T('stick'), T('stickSub')]])}</div>
      <div class="field"><div class="label">${T('side')}</div>${seg('side', [['left', T('left')], ['right', T('right')]])}</div>
      <div class="field"><div class="label">${T('size')}</div><div class="seg"><button type="button" data-p="${p}" data-act="size-">−</button><span class="val">${Math.round(s.size * 100)} %</span><button type="button" data-p="${p}" data-act="size+">+</button></div></div>
      <div class="field"><div class="label">${T('cam')}</div>${seg('cam', [['near', T('near')], ['far', T('far')], ['top', T('top')]])}</div>
    </div>
    <button type="button" class="go${READY[p] ? ' on' : ''}" data-p="${p}" data-act="ready">${READY[p] ? T('readyOk') : T('ready')}</button>
    ${READY[p] && humans === 2 && !READY[1 - p] ? `<div class="wait">${T('waiting')}</div>` : small ? `<div class="wait">${T('tall')}</div>` : ''}</div>`;
}
function resultCard(p) {
  const me = cars[p], rows = lastSorted.map((c, i) => `<li${c === me ? ' class="me"' : ''}><span class="pos">${ord(i + 1)}</span><span class="chip" style="background:${c.color.css}"></span><span class="who">${carName(c)}</span><span class="time">${c.finished ? fmt(c.time) : T('racing')}</span></li>`).join('');
  return `<div class="card"><div class="chead"><span class="dot" style="background:${me.color.css}"></span><b>${me.rank === 1 ? T('win') : ord(me.rank)}</b></div><ol class="rank">${rows}</ol>
    <div class="row"><button type="button" class="go" data-act="again">${T('again')}</button><button type="button" class="ghost" data-act="setup">${T('settings')}</button><button type="button" class="ghost" data-act="menu">${T('menu')}</button></div></div>`;
}
function renderCards(kind) {
  for (const p of [0, 1]) $('card' + p).innerHTML = p < humans && kind ? (kind === 'setup' ? setupCard(p) : resultCard(p)) : '';
  layoutViews();
}
function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
function applyLang() {
  document.documentElement.lang = lang; document.querySelectorAll('[data-t]').forEach(el => { el.textContent = T(el.dataset.t); });
  $('lang-fr').setAttribute('aria-pressed', lang === 'fr'); $('lang-en').setAttribute('aria-pressed', lang === 'en');
  $('snd').textContent = soundOn ? T('sndOn') : T('sndOff'); TRACKS.forEach(tr => { if (tr.label) tr.label.textContent = tr.def.name[lang]; });
}
function refreshPlayers() { $('pl-1').setAttribute('aria-pressed', humans === 1); $('pl-2').setAttribute('aria-pressed', humans === 2); }
function paintThumb(tr) { if (!tr.thumb) return; const x = tr.thumb.getContext('2d'); x.setTransform(tr.thumb.width / WW, 0, 0, tr.thumb.height / WH, 0, 0); paintMini(x, tr, false); }
function buildTrackButtons() {
  const box = $('tracks');
  TRACKS.forEach((tr, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.id = 'track-' + i; b.setAttribute('aria-pressed', i === trackIdx);
    const cv = document.createElement('canvas'); cv.width = 324; cv.height = 180; tr.thumb = cv; paintThumb(tr);
    const s = document.createElement('span'); s.textContent = tr.def.name[lang]; tr.label = s; b.append(cv, s);
    b.onclick = () => { if (trackIdx === i) return; trackIdx = i; track = tr; [...box.children].forEach((el, k) => el.setAttribute('aria-pressed', k === i)); loadTrackWorld(tr); startRace(0, 'menu'); };
    box.appendChild(b);
  });
}
function toMenu() { clearTouches(); topbar.hidden = true; menu.hidden = false; startRace(0, 'menu'); renderCards(null); }
function toSetup() {
  clearTouches(); menu.hidden = true; topbar.hidden = true; READY[0] = READY[1] = false; setShadowSize(humans === 2 ? 1024 : 2048);
  startRace(humans, 'setup'); renderCards('setup'); for (const V of views) V.snap = true;
}
function go() {                                   // tous les joueurs sont prêts : compte à rebours
  initAudio(); topbar.hidden = false; perfT = perfN = 0; gstate = 'countdown'; countT = 3; renderCards(null);
  try { const el = document.documentElement; if (coarse && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {}); } catch (e) {}
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
}
function again() { clearTouches(); startRace(humans, 'setup'); for (const V of views) V.snap = true; go(); }
onRaceEnd = sorted => { lastSorted = sorted; topbar.hidden = true; clearTouches(); renderCards('results'); };
for (const p of [0, 1]) $('card' + p).addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset, q = +d.p;
  if (d.k) { PSET[q][d.k] = d.v; saveSet(q); renderCards('setup'); }
  else if (d.act === 'size-' || d.act === 'size+') { PSET[q].size = clamp(Math.round((PSET[q].size + (d.act === 'size+' ? .1 : -.1)) * 10) / 10, .7, 1.5); saveSet(q); renderCards('setup'); }
  else if (d.act === 'ready') { READY[q] = !READY[q]; if (READY.slice(0, humans).every(Boolean)) go(); else renderCards('setup'); }
  else if (d.act === 'menu') toMenu(); else if (d.act === 'setup') toSetup(); else if (d.act === 'again') again();
});
$('next').onclick = toSetup; $('quit').onclick = toMenu;
$('snd').onclick = () => { setSound(!soundOn); $('snd').textContent = soundOn ? T('sndOn') : T('sndOff'); };
$('pl-1').onclick = () => { humans = 1; refreshPlayers(); }; $('pl-2').onclick = () => { humans = 2; refreshPlayers(); };
for (const l of ['fr', 'en']) $('lang-' + l).onclick = () => { lang = l; try { localStorage.setItem('mb-lang', l); } catch (e) {} applyLang(); };

/* ---------- boucle principale ---------- */
let lastTs = 0, simAcc = 0;
function frame(ts) {
  const raw = (ts - lastTs) / 1000 || 0, dt = Math.min(.066, raw); lastTs = ts; simAcc += dt;
  let n = 0; while (simAcc >= STEP && n < 8) { update(STEP); simAcc -= STEP; n++; } if (n === 8) simAcc = 0;
  for (const c of cars) syncCar(c, dt, simTime);
  updateWorldFx(dt, simTime, track);
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0); hctx.clearRect(0, 0, CW, CH);
  for (const V of views) {
    const car = V.p >= 0 ? cars[V.p] : null;
    if (car) { placeCamera(V, car, PSET[V.p].cam, dt, V.snap); V.snap = false; if (shake > 0) { V.cam.position.x += rnd(9); V.cam.position.y += rnd(6); V.cam.position.z += rnd(9); } } else overviewCamera(V, simTime);
    renderView(V, CH, !!car && car.gauge >= .995);
    if (car) drawViewHud(V);
  }
  if (views.length === 2) { hctx.fillStyle = '#0d1020'; hctx.fillRect(0, views[0].y - 2, CW, 4); }
  engineSound(cars, gstate === 'race' || gstate === 'countdown');
  // si l'appareil peine, on allège : d'abord les ombres, puis la finesse de l'image
  if (gstate === 'race' && raw < .5 && !window.__noAdapt) { perfT += raw; perfN++; if (perfT > 3) { if (perfT / perfN > .027) { if (!lowShadow) { lowShadow = true; setShadows(false); } else if (dprCap > 1) { dprCap = 1; resize(); } } perfT = perfN = 0; } }
  requestAnimationFrame(frame);
}

/* ---------- démarrage ---------- */
function loadImages() {
  TRACKS.forEach((tr, i) => {
    for (const kind of ['ground', 'road']) { const im = new Image(); im.onload = () => { IMG[kind][i] = im; if (IMG.ground[i] && IMG.road[i]) { paintThumb(tr); if (tr === track) refreshTextures(tr); } }; im.src = 'assets/' + kind + i + '.jpg'; }
  });
}
let webglOk = true;
try { initWorld(glCanvas); } catch (e) { webglOk = false; }
if (webglOk) {
  buildTrackButtons(); loadTrackWorld(track); startRace(0, 'menu'); refreshPlayers(); applyLang(); resize(); loadImages();
  addEventListener('resize', resize); requestAnimationFrame(frame);
} else { applyLang(); $('next').disabled = true; document.querySelector('#menu .help').textContent = T('nogl'); }
window.__mb = { update, get cars() { return cars; }, get gstate() { return gstate; }, get debris() { return debris.length; }, get track() { return track; }, get views() { return views; }, stats, input, PSET, damageCar, explode, useItem, useBoost, TRACKS };
