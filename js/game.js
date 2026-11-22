'use strict';
/* Règles du jeu : voitures, physique, jauge de boost, raccourcis, objets, dégâts, ordinateurs, déroulement de la course. */
let track = TRACKS[0], trackIdx = 0, gstate = 'menu', cars = [], raceTime = 0, countT = 0, goT = 0, doneT = 0, shake = 0, simTime = 0, firstFinT = -1;
let LAPS = 7, humanKey = null, lastBeep = 0, wrenchT = 6, onRaceEnd = null;
let missiles = [], mines = [], oils = [], boxes = [], wrenches = [], props = [], booms = [];
/* Commandes d'un joueur : kl/kr/kb = clavier, tl/tr/tb = boutons tactiles, fire = objet, boost = boost,
   sm/sa = joystick en direction absolue (vue de dessus), rel/sx = joystick en volant (vue poursuite). */
const input = [0, 1].map(() => ({ kl: false, kr: false, kb: false, tl: false, tr: false, tb: false, fire: false, boost: false, sa: 0, sm: 0, rel: false, sx: 0 }));
const carVis = [];
const stats = { wrecks: 0, items: 0, jumps: 0, loops: 0, booms: 0, parts: 0, cuts: 0, boosts: 0 };
const ITEMS = ['recharge', 'missile', 'oil', 'mine', 'shield', 'shock'];
const ITEM_W = [[2, 1, 3, 3, 2, 1], [3, 3, 2, 2, 1, 2], [3, 4, 2, 2, 1, 2], [4, 4, 1, 1, 1, 3]];   // selon la place : les derniers reçoivent les objets les plus forts
const PROP = { cone: { r: 11, slow: .02 }, tyre: { r: 19, slow: .12 }, crate: { r: 19, slow: .18 }, barrel: { r: 15, slow: .14 } };
const AIO = { steer: 0, throttle: 0, fire: false, boost: false };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapPi = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const rnd = k => (Math.random() - .5) * k;
function carKey(c) { return c.lap * track.N + c.prog; }
function trackLat(x, z) { nearestOn(track, x, z); const i = NEAR.i; return { i, lat: -(x - track.sx[i]) * track.tz[i] + (z - track.sz[i]) * track.tx[i] }; }
function say(c, k) { if (c.human && k) c.msg = { k, t: 1.7 }; }   // message affiché sur l'écran du joueur

/* ---------- départ ---------- */
function addProp(kind, x, z) { const vis = makePropVis(kind); vis.position.set(x, 0, z); vis.rotation.y = Math.random() * TAU; dynGroup.add(vis); props.push({ kind, x, z, y: 0, vx: 0, vz: 0, vy: 0, r: PROP[kind].r, vis, alive: true }); }
function startRace(nHumans, newState) {
  gstate = newState; raceTime = 0; countT = 3; goT = 0; doneT = 0; shake = 0; lastBeep = 0; humanKey = null; wrenchT = 6; firstFinT = -1;
  for (const i of input) { i.fire = false; i.boost = false; }
  for (const k in stats) stats[k] = 0;
  resetTrackWorld(track); missiles = []; mines = []; oils = []; boxes = []; wrenches = []; props = []; booms = [];
  for (const s of track.boxSpots) { const vis = makeBoxVis(); vis.position.set(s.x, 26, s.z); dynGroup.add(vis); boxes.push({ x: s.x, z: s.z, i: s.i, lat: s.lat, t: 0, vis }); }
  for (const s of track.propSpots) addProp(s.kind, s.x, s.z);
  const order = [0, 1, 2, 3].sort(() => Math.random() - .5), skills = [.99, .95, .91, .87].sort(() => Math.random() - .5);
  cars = [];
  for (let k = 0; k < 4; k++) {
    if (!carVis[k]) carVis[k] = makeCarVis(k);
    const vis = carVis[k], g = track.grid(order[k]), human = k < nHumans; resetCarVis(vis); dynGroup.add(vis.root, vis.ring);
    cars.push({ id: k, human, auto: !human, color: CAR_COLORS[k], vis,
      x: g.x, z: g.z, a: g.a, vx: 0, vz: 0, y: 0, vy: 0, spin: 0, air: false, ramp: null, loop: null, tumble: 0, tumbleRate: 0, sus: 0, susV: 0, pitchV: 0, rollV: 0, steerV: 0, steerH: 0, slip: 0,
      prog: g.i, lap: 0, hp: 100, stage: 0, wheelOff: -1, item: null, pending: null, roul: 0, itemT: 0, boost: 0, boostPow: 0, gauge: .3, cleanT: 0, cut: null,
      shield: 0, spinOut: 0, spinDir: 1, oilImm: 0, dead: 0, inv: 0, hitT: 0, wallCd: 0, msg: null, lastLapSaid: false,
      finished: false, time: 0, rank: k + 1, offT: 0, stuckT: 0, revN: 0, dustT: 0, smokeT: 0, skidT: 0,
      power: human ? 1 : skills[k], base: skills[k], aiOff: rnd(90), aiLat: 0, aiLook: 13 + Math.floor(Math.random() * 5), aiRev: 0, aiItemT: 1 + Math.random() * 3, aiSave: null, aiPlan: -1 });
  }
}

/* ---------- dégâts ---------- */
function refreshVis(c) {
  const v = c.vis; resetCarVis(v);
  if (c.stage >= 1) { v.shell.rotation.set(.07, 0, -.06); v.shellMat.color.setScalar(.68); }
  if (c.stage >= 2) v.shell.visible = false;
  if (c.stage >= 3 && c.wheelOff >= 0) v.wheels[c.wheelOff].g.visible = false; else c.wheelOff = -1;
}
function throwWheel(c, w, spd) {
  const fx = Math.cos(c.a), fz = Math.sin(c.a), lx = w < 2 ? 27 : -27, lz = w % 2 ? 25 : -25, sgn = w % 2 ? 1 : -1;
  const wm = new THREE.Mesh(wheelGeo(), vcMat()); wm.castShadow = true; wm.rotation.x = Math.PI / 2; const m = grp(wm);
  addDebris(m, c.x + fx * lx - fz * lz, c.y + 14, c.z + fz * lx + fx * lz, c.vx * .6 - fz * sgn * spd + rnd(80), 260 + Math.random() * 160, c.vz * .6 + fx * sgn * spd + rnd(80), 6.5);
  debris[debris.length - 1].flat = true;
}
function applyStage(c, st) {
  const v = c.vis;
  if (st === 1) { puff(c.x, 26, c.z, 0xffd24a, 6, 150, 3, .35, 120, 600); if (c.human) sfx.part(); }
  else if (st === 2) {                           // la carrosserie s'envole
    const sh = v.shell.clone(); sh.material = v.shellMat.clone(); sh.position.y = -26; sh.rotation.set(0, 0, 0);
    const holder = grp(sh); holder.rotation.y = -c.a; addDebris(holder, c.x, c.y + 28, c.z, c.vx * .5 + rnd(160), 400 + Math.random() * 120, c.vz * .5 + rnd(160), 9); debris[debris.length - 1].flat = true;
    puff(c.x, 30, c.z, 0xffffff, 8, 170, 4, .4, 140, 600); sfx.part();
  } else if (st === 3) { c.wheelOff = Math.floor(Math.random() * 4); throwWheel(c, c.wheelOff, 170); puff(c.x, 14, c.z, 0xffd24a, 8, 190, 3, .4, 150, 700); sfx.part(); }
  stats.parts++; if (st < 4) refreshVis(c); else wreck(c);
}
/* Retourne true si le coup a porté (false : bouclier, invulnérabilité...). */
function damageCar(c, amt) {
  if (c.dead > 0 || c.inv > 0 || c.loop) return false;
  if (c.shield > 0) { if (amt >= 6) { c.shield = 0; sfx.shieldPop(); puff(c.x, 24, c.z, 0x9fe8ff, 10, 170, 6, .4, 80, 300); } return false; }
  c.hp -= amt; c.hitT = .3;
  const st = c.hp <= 0 ? 4 : c.hp < 24 ? 3 : c.hp < 48 ? 2 : c.hp < 72 ? 1 : 0;
  while (c.stage < st && c.dead <= 0) { c.stage++; applyStage(c, c.stage); }
  return true;
}
function wreck(c) {
  for (let w = 0; w < 4; w++) if (w !== c.wheelOff) throwWheel(c, w, 240);
  const ch = boxMesh(72, 6, 26, lam(0x23262e), 0, 0, 0); ch.castShadow = true; ch.rotation.y = -c.a; addDebris(ch, c.x, c.y + 14, c.z, c.vx * .4 + rnd(120), 330, c.vz * .4 + rnd(120), 3.5); debris[debris.length - 1].flat = true;
  flash(c.x, 20, c.z, 95, 0xffc23d, .3); puff(c.x, 18, c.z, 0xff8a1f, 12, 240, 14, .5, 170, 500); puff(c.x, 26, c.z, 0x5a5a62, 9, 110, 17, 1, 90, -60); scorchMark(c.x, c.z, 52);
  stats.wrecks++; sfx.wreck(); shake = Math.max(shake, .4); c.dead = 2.3; c.vx = c.vz = c.vy = 0; c.boost = 0; c.shield = 0; c.spinOut = 0; c.loop = null; c.cut = null;
  say(c, 'wreck');
}
function respawn(c, repaired) {
  const tr = track, j = c.prog; c.x = tr.sx[j]; c.z = tr.sz[j]; c.a = Math.atan2(tr.tz[j], tr.tx[j]); c.vx = c.vz = c.vy = 0; c.y = 0; c.spin = 0; c.tumble = 0; c.tumbleRate = 0; c.air = false; c.ramp = null; c.loop = null; c.cut = null;
  c.offT = c.stuckT = 0; c.revN = 0; c.aiRev = 0; c.dead = 0; c.inv = 2; c.steerH = 0; c.aiPlan = -1;
  if (repaired) { c.hp = 100; c.stage = 0; c.wheelOff = -1; refreshVis(c); if (c.human) sfx.repair(); }
}
function repairCar(c, amt) {
  c.hp = Math.min(100, c.hp + amt); const st = c.hp < 24 ? 3 : c.hp < 48 ? 2 : c.hp < 72 ? 1 : 0;
  if (st < c.stage) { c.stage = st; refreshVis(c); }
}
function toss(c, nx, nz, push, up) {
  c.vx += nx * push; c.vz += nz * push; c.vy = Math.max(c.vy, up); c.y = Math.max(c.y, 2); c.air = true;
  c.spin += rnd(10); c.tumbleRate = (Math.random() < .5 ? -1 : 1) * (7 + Math.random() * 5);
}
function breakCrate(p) {
  p.alive = false; dynGroup.remove(p.vis); puff(p.x, 16, p.z, 0xc08a4c, 8, 160, 5, .5, 150, 600);
  for (let i = 0; i < 4; i++) { const m = boxMesh(30, 4, 9, lam(i % 2 ? 0xc08a4c : 0x8e5f2c), 0, 0, 0); m.castShadow = true; addDebris(m, p.x, 14, p.z, rnd(360), 200 + Math.random() * 220, rnd(360), 2.5); debris[debris.length - 1].flat = true; }
}
function explode(x, z) {
  const R = 125; stats.booms++; sfx.explode(); shake = Math.max(shake, .35);
  flash(x, 22, z, R * .72, 0xffc23d, .28); flash(x, 3, z, R * 1.15, 0xfff1c0, .38, true);
  puff(x, 16, z, 0xff8a1f, 12, 260, 15, .5, 170, 500); puff(x, 20, z, 0xffd24a, 8, 190, 11, .4, 230, 500); puff(x, 26, z, 0x5a5a62, 9, 110, 17, 1, 90, -60);
  scorchMark(x, z, R * .46); scorchMark(x + rnd(30), z + rnd(30), R * .26); knockBlocks(track, x, z, R * .55, 0, 0, 320);
  for (const c of cars) {
    if (c.dead > 0 || c.loop) continue; const dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz); if (d > R) continue;
    const f = 1 - d / R; if (damageCar(c, 8 + 20 * f) && c.dead <= 0) toss(c, d > 1 ? dx / d : 1, d > 1 ? dz / d : 0, 120 + 420 * f, 250 + 270 * f);
  }
  for (const p of props) {
    if (!p.alive) continue; const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz); if (d > R) continue; const f = 1 - d / R;
    if (p.kind === 'barrel') { p.alive = false; dynGroup.remove(p.vis); booms.push({ x: p.x, z: p.z, t: .12 + Math.random() * .1 }); }
    else if (p.kind === 'crate' && f > .3) breakCrate(p);
    else { p.vx += (d > 1 ? dx / d : 1) * 460 * f; p.vz += (d > 1 ? dz / d : 0) * 460 * f; p.vy = 120 + 320 * f; }
  }
  for (const m of mines) if (!m.dead && Math.hypot(m.x - x, m.z - z) < R * .8) { m.dead = true; booms.push({ x: m.x, z: m.z, t: .1 }); }
}

/* ---------- boost et objets ---------- */
/* Le boost vide la jauge : plus elle est pleine, plus l'accélération est forte et longue. */
function useBoost(c) {
  if (c.gauge < .12 || c.boost > 0 || c.loop || c.dead > 0 || c.cut) return false;
  const g = c.gauge; c.gauge = 0; c.boost = .4 + 1.5 * g; c.boostPow = 1.35 + .8 * g; stats.boosts++; sfx.nitro(c.human); return true;
}
function rollItem(rank) { const w = ITEM_W[clamp(rank - 1, 0, 3)]; let t = 0; for (const v of w) t += v; let r = Math.random() * t; for (let i = 0; i < w.length; i++) { if ((r -= w[i]) < 0) return ITEMS[i]; } return 'recharge'; }
function useItem(c) {
  const it = c.item, fx = Math.cos(c.a), fz = Math.sin(c.a); c.item = null; stats.items++;
  if (it === 'recharge') { c.gauge = 1; puff(c.x, 26, c.z, 0x4fd8ff, 10, 150, 5, .45, 140, 300); if (c.human) { sfx.full(); say(c, 'full'); } }
  else if (it === 'missile') { const vis = makeMissileVis(c.color.hex); dynGroup.add(vis); missiles.push({ x: c.x + fx * 52, z: c.z + fz * 52, y: c.y + 20, a: c.a, prog: c.prog, owner: c, life: 3.2, vis, smoke: 0 }); sfx.missile(); }
  else if (it === 'oil') { const x = c.x - fx * 66, z = c.z - fz * 66, vis = makeOilVis(44); vis.position.set(x, 1.5, z); dynGroup.add(vis); const q = trackLat(x, z); oils.push({ x, z, r: 44, life: 26, vis, i: q.i, lat: q.lat }); sfx.drop(); }
  else if (it === 'mine') { const x = c.x - fx * 66, z = c.z - fz * 66, vis = makeMineVis(); vis.position.set(x, 0, z); dynGroup.add(vis); const q = trackLat(x, z); mines.push({ x, z, arm: .7, vis, i: q.i, lat: q.lat, dead: false }); sfx.drop(); }
  else if (it === 'shield') { c.shield = 7; sfx.shield(); }
  else if (it === 'shock') {
    sfx.shock(); shake = Math.max(shake, .25); flash(c.x, 6, c.z, 300, 0x9fe8ff, .45, true); flash(c.x, 12, c.z, 200, 0xffffff, .3, true);
    knockBlocks(track, c.x, c.z, 130, 0, 0, 260);
    for (const o of cars) { if (o === c || o.dead > 0 || o.loop) continue; const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz); if (d > 300) continue; const f = 1 - d / 300; if (damageCar(o, 5 + 12 * f) && o.dead <= 0) toss(o, dx / (d || 1), dz / (d || 1), 200 + 420 * f, 160 + 240 * f); }
    for (const p of props) { if (!p.alive) continue; const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz); if (d < 260) { const f = 1 - d / 260; p.vx += dx / (d || 1) * 500 * f; p.vz += dz / (d || 1) * 500 * f; p.vy = 150 + 250 * f; } }
  }
}
function slipOut(c) { if (c.oilImm > 0 || c.shield > 0 || c.inv > 0) return; c.spinOut = 1; c.spinDir = Math.random() < .5 ? -1 : 1; c.oilImm = 2.2; if (c.human) sfx.spin(); }

/* ---------- ordinateurs ---------- */
function aiWantsFire(c) {
  const fx = Math.cos(c.a), fz = Math.sin(c.a); let ahead = false, behind = false, near = false;
  for (const o of cars) {
    if (o === c || o.dead > 0) continue; const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), al = dx * fx + dz * fz;
    if (d < 520 && al > d * .82) ahead = true; if (d < 270 && al < -d * .6) behind = true; if (d < 230) near = true;
  }
  const late = c.aiItemT < -4;
  switch (c.item) {
    case 'recharge': return c.gauge < .5;
    case 'missile': return ahead || late;
    case 'oil': case 'mine': return behind || late;
    case 'shield': return true;
    case 'shock': return near || c.aiItemT < -6;
  }
  return false;
}
function aiControl(c, dt, go) {
  const tr = track, N = tr.N; let throttle = go ? 1 : 0, want = c.aiOff, boost = false, tgx, tgz;
  // à partir de 60 % de jauge, l'ordinateur choisit : garder son boost pour un raccourci, ou s'en servir en ligne droite
  if (c.gauge >= .6) { if (c.aiSave === null) c.aiSave = Math.random() < .5; } else if (!c.cut) c.aiSave = null;
  let plan = null, j = -1;
  if (c.cut) { plan = tr.cuts[c.cut.k]; j = c.cut.j + c.aiLook; c.aiPlan = -1; }
  else {
    if (c.aiPlan < 0 && c.aiSave && c.gauge >= .995) for (const cu of tr.cuts) if ((cu.iA - c.prog + N) % N < 45) { c.aiPlan = cu.k; break; }
    if (c.aiPlan >= 0) {                          // il vise l'entrée du raccourci, et garde ce cap tant qu'il n'y est pas entré
      const cu = tr.cuts[c.aiPlan], d = (cu.iA - c.prog + N) % N, past = (c.prog - cu.iA + N) % N;
      if (d >= 45 && past > cu.g0 + 25) c.aiPlan = -1; else { plan = cu; j = c.aiLook + (d < 45 ? -d : past) + 4; }
    }
  }
  if (plan && j >= 0) {
    if (j < plan.M) { tgx = plan.sx[j]; tgz = plan.sz[j]; } else { const q = (plan.iB + (j - plan.M) + 2) % N; tgx = tr.sx[q]; tgz = tr.sz[q]; }
  } else {
    if (!c.item && c.roul <= 0) for (const b of boxes) { if (b.t > 0) continue; const d = (b.i - c.prog + N) % N; if (d > 3 && d < 45 && Math.abs(b.lat - c.aiLat) < 85) { want = b.lat; break; } }
    for (const list of [tr.obst, oils, mines]) for (const o of list) { const d = (o.i - c.prog + N) % N; if (d > 1 && d < 30 && Math.abs(o.lat - want) < 54) want = o.lat + (o.lat > 0 ? -80 : 80); }
    c.aiLat += (want - c.aiLat) * Math.min(1, dt * 4);
    const q = (c.prog + c.aiLook) % N, lim = tr.half[q] - 38, lat = clamp(c.aiLat, -lim, lim);
    tgx = tr.sx[q] - tr.tz[q] * lat; tgz = tr.sz[q] + tr.tx[q] * lat;
  }
  const diff = wrapPi(Math.atan2(tgz - c.z, tgx - c.x) - c.a);
  let steer = clamp(diff * 3, -1, 1); if (Math.abs(diff) > 1.1) throttle *= .5;
  if (c.aiRev > 0) { c.aiRev -= dt; throttle = -.65; steer = -steer; }
  else if (go && c.stuckT > .8 && !c.air) { c.aiRev = .75; c.stuckT = 0; c.revN++; }
  if (humanKey !== null) c.power = c.base * clamp(1 - (carKey(c) - humanKey) / N * .45, .84, 1.1);   // élastique : la course reste serrée
  if (go && !c.cut && c.boost <= 0 && !c.air && c.gauge >= .6 && c.aiSave === false) { const f = (c.prog + 45) % N; if (tr.tx[c.prog] * tr.tx[f] + tr.tz[c.prog] * tr.tz[f] > .97 && Math.random() < dt * 1.5) boost = true; }
  let fire = false; if (go && c.item) { c.aiItemT -= dt; if (c.aiItemT <= 0) fire = aiWantsFire(c); }
  AIO.steer = steer; AIO.throttle = throttle; AIO.fire = fire; AIO.boost = boost; return AIO;
}

/* ---------- une voiture, un pas de simulation ---------- */
function stepLoop(c, dt) {
  const l = c.loop, L = l.L; l.th += l.v / L.R * dt;
  if (l.th >= TAU) {
    loopPoint(L, TAU, 0, _lp); c.x = _lp.x; c.z = _lp.z; c.y = 0; c.vy = 0; c.a = L.a; c.vx = L.ca * l.v * 1.08; c.vz = L.sa * l.v * 1.08; c.boost = Math.max(c.boost, .8); c.boostPow = Math.max(c.boostPow, 1.9); c.loop = null; c.pitchV = 0; return;
  }
  loopPoint(L, l.th, l.w0 * Math.max(0, 1 - l.th / 1.2), _lp); c.x = _lp.x; c.y = _lp.y; c.z = _lp.z; c.a = L.a; c.vx = L.ca * l.v * Math.cos(l.th); c.vz = L.sa * l.v * Math.cos(l.th);
}
function land(c) {
  const v = -c.vy; c.vy = 0; c.air = false; c.tumbleRate = 0; c.spin *= .4;
  if (v > 150) { c.susV = -v * .45; puff(c.x, 4, c.z, track.def.theme.dust, 8, 120, 8, .5, 40, 100); if (c.human) { sfx.land(); shake = Math.max(shake, .14); } if (v > 430) damageCar(c, 2 + (v - 430) * .02); }
}
function wallCollide(c) {
  const tr = track; let hitV = 0, hx = 0, hz = 0, hnx = 0, hnz = 0;
  for (const off of [CAR_OFF, -CAR_OFF]) {
    const fx = Math.cos(c.a), fz = Math.sin(c.a), px = c.x + fx * off, pz = c.z + fz * off, h = trackHit(tr, px, pz);
    if (h.m <= -CAR_R || h.d < .01) continue;
    const nx = (px - h.x) / h.d, nz = (pz - h.z) / h.d, over = h.m + CAR_R, vn = c.vx * nx + c.vz * nz;
    c.x -= nx * over; c.z -= nz * over;
    if (vn > 0) {
      c.vx -= nx * vn * 1.35; c.vz -= nz * vn * 1.35; c.vx *= .97; c.vz *= .97;
      c.spin += (off > 0 ? -1 : 1) * (fx * nz - fz * nx) * Math.min(vn, 320) * .012;
      if (vn > hitV) { hitV = vn; hx = px + nx * CAR_R; hz = pz + nz * CAR_R; hnx = nx; hnz = nz; }
    }
  }
  if (hitV > 150 && c.y < 30 && c.wallCd <= 0) {
    c.wallCd = .18; c.cleanT = 0;                // on a touché un mur : la jauge de boost repasse à sa vitesse de recharge normale
    puff(hx, 12, hz, 0xffffff, 4, 120, 3, .3, 100, 500);
    if (hitV > 215) { damageCar(c, 1 + (hitV - 215) * .04); if (hitV > 285) knockBlocks(tr, hx, hz, 30, hnx, hnz, hitV); if (c.human) { sfx.crash(); shake = Math.max(shake, .16); } }
    else if (c.human) sfx.bump();
  }
}
function trackProgress(c, dt, go) {
  const tr = track, N = tr.N; let np = -1;
  if (c.cut) {                                   // sur un raccourci : la progression avance de l'entrée vers la sortie
    const cu = tr.cuts[c.cut.k]; let b = 1e18, bj = c.cut.j;
    for (let k = -5; k <= 14; k++) { const j = c.cut.j + k; if (j < 0 || j >= cu.M) continue; const dx = cu.sx[j] - c.x, dz = cu.sz[j] - c.z, d = dx * dx + dz * dz; if (d < b) { b = d; bj = j; } }
    c.cut.j = bj; np = (cu.iA + Math.round(bj / (cu.M - 1) * ((cu.iB - cu.iA + N) % N))) % N;
  } else {
    let b = 1e18, bj = 0;
    for (let k = -6; k <= 28; k++) { const j = ((c.prog + k) % N + N) % N, dx = tr.sx[j] - c.x, dz = tr.sz[j] - c.z, d = dx * dx + dz * dz; if (d < b) { b = d; bj = j; } }
    if (Math.sqrt(b) < tr.half[bj] + 30) np = bj; else if (!c.loop) c.offT += dt;
  }
  if (np >= 0) { if (np < c.prog - N / 2) c.lap++; else if (np > c.prog + N / 2) c.lap--; c.prog = np; c.offT = 0; }
  const sp = Math.hypot(c.vx, c.vz);
  if (go && sp < 25 && !c.loop) c.stuckT += dt; else c.stuckT = 0; if (sp > 220) c.revN = 0;
  if (c.offT > 2 || (c.auto && c.revN >= 3)) respawn(c, false);
  if (gstate === 'race' && !c.finished) {
    if (c.lap === LAPS && !c.lastLapSaid) { c.lastLapSaid = true; say(c, 'lastLap'); if (c.human) sfx.lastLap(); }
    if (c.lap > LAPS) { c.finished = true; c.time = raceTime; if (c.human) sfx.finish(); c.auto = true; c.power = c.base = Math.min(c.base, .8); }
  }
}
function stepCar(c, dt, go) {
  const tr = track;
  if (c.msg && (c.msg.t -= dt) <= 0) c.msg = null;
  if (c.dead > 0) { if ((c.dead -= dt) <= 0) respawn(c, true); return; }
  if (c.inv > 0) c.inv -= dt; if (c.shield > 0) c.shield -= dt; if (c.boost > 0) c.boost -= dt; if (c.spinOut > 0) c.spinOut -= dt; if (c.oilImm > 0) c.oilImm -= dt; if (c.hitT > 0) c.hitT -= dt; if (c.wallCd > 0) c.wallCd -= dt; if (c.itemT > 0) c.itemT -= dt;
  if (c.boost <= 0) c.boostPow = 0;
  if (c.roul > 0 && (c.roul -= dt) <= 0) { c.item = c.pending; c.pending = null; c.itemT = 1.8; c.aiItemT = .6 + Math.random() * 2.2; if (c.human) sfx.itemReady(); }
  c.susV += (-c.sus * 260 - c.susV * 14) * dt; c.sus += c.susV * dt;
  // jauge de boost : elle se remplit seule, et deux fois plus vite après 5 s sans toucher de mur
  c.cleanT += dt;
  if (go && c.boost <= 0 && c.gauge < 1) { c.gauge = Math.min(1, c.gauge + dt / 15 * (1 + Math.min(1, c.cleanT / 5))); if (c.gauge >= 1 && c.human) { sfx.full(); say(c, 'full'); } }

  let steer = 0, throttle = go ? 1 : 0, fire = false;
  if (c.auto) { const o = aiControl(c, dt, go); steer = o.steer; throttle = o.throttle; fire = o.fire; if (o.boost) useBoost(c); }
  else {
    const i = input[c.id]; if (i.fire) { fire = go; i.fire = false; } if (i.boost) { if (go) useBoost(c); i.boost = false; } if (go && (i.kb || i.tb)) throttle = -.65;
    if (i.sm > 0) {
      // joystick en vue de dessus : on pointe la direction voulue à l'écran, la voiture s'oriente d'elle-même vers elle
      const vf0 = c.vx * Math.cos(c.a) + c.vz * Math.sin(c.a), diff = wrapPi(i.sa - c.a);
      steer = clamp(diff * 2.6, -1, 1) * i.sm; if (vf0 < -20) steer = -steer;
      if (Math.abs(diff) > 1.5 && vf0 > 260 && throttle > 0) throttle = .35;
      c.steerH = steer;
    } else if (i.rel) { c.steerH += (i.sx - c.steerH) * Math.min(1, dt * 16); steer = c.steerH; }   // joystick en vue poursuite : un volant progressif
    else {
      // flèches et clavier : le braquage monte en 0,1 s environ, ce qui permet de petites corrections par petites touches
      const raw = ((i.kr || i.tr) ? 1 : 0) - ((i.kl || i.tl) ? 1 : 0), up = raw !== 0 && raw * c.steerH >= 0;
      c.steerH += (raw - c.steerH) * Math.min(1, dt * (up ? 10 : 20)); steer = c.steerH;
    }
  }
  if (c.spinOut > 0) steer = 0;
  c.steerV += (steer - c.steerV) * Math.min(1, dt * 10);
  if (fire && c.item && !c.loop) useItem(c);
  if (c.loop) { stepLoop(c, dt); trackProgress(c, dt, go); return; }

  const fx = Math.cos(c.a), fz = Math.sin(c.a), th = tr.def.theme, sp = Math.hypot(c.vx, c.vz);
  let gh = 0, ramp = null;
  for (const r of tr.ramps) { const dx = c.x - r.x, dz = c.z - r.z, u = dx * r.ca + dz * r.sa, w = -dx * r.sa + dz * r.ca; if (u >= 0 && u <= r.len && Math.abs(w) <= r.w / 2) { gh = r.h * u / r.len; ramp = r; } }
  if (c.ramp && !ramp && !c.air) {               // on quitte un tremplin par le haut : on décolle
    const r = c.ramp, va = c.vx * r.ca + c.vz * r.sa;
    if ((c.x - r.x) * r.ca + (c.z - r.z) * r.sa > r.len && va > 120) { c.vy = va * .42 + 30; stats.jumps++; if (c.human) sfx.jump(); }
  }
  c.ramp = ramp;
  if (c.y > gh + .5 || c.vy > 0) { c.vy -= GRAV * dt; c.y += c.vy * dt; c.air = true; if (c.y <= gh && c.vy <= 0) { c.y = gh; land(c); } }
  else { c.y = gh; c.vy = 0; c.air = false; }

  if (c.air) {
    c.a += (c.spin + steer * .7) * dt; c.spin *= Math.exp(-.5 * dt); c.tumble += c.tumbleRate * dt; c.vx *= 1 - .12 * dt; c.vz *= 1 - .12 * dt; c.slip = 0;
  } else {
    if (c.tumble) { c.tumble = wrapPi(c.tumble) * Math.exp(-14 * dt); if (Math.abs(c.tumble) < .01) c.tumble = 0; }
    let grip = tr.def.grip, drag = 1.1 + .4 * Math.abs(steer), accel = 500 * c.power * (1 - .05 * c.stage);
    // raccourcis : il faut la jauge pleine pour les traverser à fond ; sinon le terrain freine fortement
    const hit = trackHit(tr, c.x, c.z), hc = hit.cut, hj = hit.j, mainM = hit.mainM, mi = hit.mi;
    if (hc >= 0 && mainM > 4) {
      const cu = tr.cuts[hc];
      if (!c.cut || c.cut.k !== hc) {
        const fwd = c.vx * cu.tx[hj] + c.vz * cu.tz[hj] > 40 && hj < cu.M * .55, ok = fwd && c.gauge >= .995;
        c.cut = { k: hc, on: ok, j: hj };
        if (ok) { c.gauge = Math.max(0, c.gauge - cu.cost); stats.cuts++; say(c, 'cutOk'); if (c.human) sfx.cut(); } else if (fwd) { say(c, 'cutNo'); if (c.human) sfx.deny(); }
      }
      if (c.cut.on) { c.boost = Math.max(c.boost, .25); c.boostPow = Math.max(c.boostPow, 1.75); }
      else { drag += 7; if (sp > 40 && Math.random() < dt * 30) puff(c.x, 5, c.z, th.dust, 1, 80, 7, .45, 90, 300); }
    } else if (c.cut && mainM < -14) { c.cut = null; c.prog = mi; }   // revenu sur la piste : on se recale sur le point de piste le plus proche
    for (const h of tr.hazards) {
      const dx = c.x - h.x, dz = c.z - h.z; if (dx * dx + dz * dz > h.r * h.r) continue;
      if (h.kind === 'mud') drag += 2.3; else if (h.kind === 'water') { grip *= .2; drag += .4; } else if (sp > 130) slipOut(c);
      if (Math.random() < dt * 28 && sp > 70) puff(c.x, 5, c.z, h.kind === 'water' ? 0x8fd0f2 : h.kind === 'mud' ? 0x75502f : 0x2a2b33, 1, 90, 5, .4, 130, 600);
    }
    for (const o of oils) { const dx = c.x - o.x, dz = c.z - o.z; if (dx * dx + dz * dz < o.r * o.r && sp > 130) slipOut(c); }
    if (c.spinOut > 0) { grip *= .06; c.a += c.spinDir * 10 * dt; throttle *= .3; }
    if (c.boost > 0) accel *= c.boostPow || 1.9;
    let vf = c.vx * fx + c.vz * fz, vl = -c.vx * fz + c.vz * fx;
    if (c.boost <= 0 && vf > 470) drag += 1.6;                                     // après un boost, la vitesse retombe vite à la normale
    vf += (accel * throttle - drag * vf) * dt; vl *= Math.exp(-grip * dt); c.slip = Math.abs(vl);
    let st = steer; if (c.wheelOff >= 0) st += (c.wheelOff % 2 ? .25 : -.25) * Math.min(1, Math.abs(vf) / 200);
    const turn = 3 - 1.1 * clamp((Math.abs(vf) - 320) / 420, 0, 1);                 // direction un peu moins vive à pleine vitesse
    c.a += (st * turn * clamp(vf / 120, -1, 1) + c.spin) * dt; c.spin *= Math.exp(-5 * dt);
    c.vx = fx * vf - fz * vl; c.vz = fz * vf + fx * vl;
    for (const p of tr.pads) { const dx = c.x - p.x, dz = c.z - p.z; if (Math.abs(dx * p.ca + dz * p.sa) < p.len / 2 && Math.abs(-dx * p.sa + dz * p.ca) < p.w / 2 + 10) { if (c.boost < .4 && c.human) sfx.pad(); c.boost = Math.max(c.boost, .95); c.boostPow = Math.max(c.boostPow, 1.9); } }
    for (const L of tr.loops) {
      const dx = c.x - L.x, dz = c.z - L.z, u = dx * L.ca + dz * L.sa, w = -dx * L.sa + dz * L.ca, va = c.vx * L.ca + c.vz * L.sa;
      if (u >= 0 && u <= 30 && w > -100 && w < 200 && va > 20) { c.loop = { L, th: 0, v: Math.max(va, 430), w0: w }; c.spinOut = 0; c.spin = 0; stats.loops++; if (c.human) sfx.loop(); break; }
    }
    // poussière, traces de pneus, fumée et étincelles quand la voiture est abîmée
    if ((c.slip > 80 || c.boost > 0) && (c.dustT -= dt) <= 0) { c.dustT = .035; puff(c.x - fx * 38, 8, c.z - fz * 38, c.boost > 0 ? 0xffcf5a : th.dust, 1, 40, 8, .5, 30, -30); }
    if (c.slip > 75 && (c.skidT -= dt) <= 0) { c.skidT = .035; for (const s of [-1, 1]) skidMark(c.x - fx * 27 - fz * 25 * s, c.z - fz * 27 + fx * 25 * s, 5); }
    if (c.wheelOff >= 0 && Math.abs(vf) > 80 && Math.random() < dt * 30) puff(c.x + fx * (c.wheelOff < 2 ? 27 : -27) - fz * (c.wheelOff % 2 ? 25 : -25), 3, c.z + fz * (c.wheelOff < 2 ? 27 : -27) + fx * (c.wheelOff % 2 ? 25 : -25), 0xffd24a, 1, 90, 2.5, .3, 110, 700);
  }
  if (c.stage >= 1 && (c.smokeT -= dt) <= 0) { c.smokeT = .26 - .05 * c.stage; puff(c.x, 30 + c.y, c.z, c.stage >= 2 ? 0x55565e : 0xa9a9b2, 1, 20, 5 + 2 * c.stage, .8, 60, -70); }
  c.x += c.vx * dt; c.z += c.vz * dt;

  if (c.y < 30) for (const b of tr.bumpers) for (const off of [CAR_OFF, -CAR_OFF]) {
    const px = c.x + fx * off, pz = c.z + fz * off, dx = px - b.x, dz = pz - b.z, d = Math.hypot(dx, dz); if (d >= b.r + CAR_R || d < .01) continue;
    const nx = dx / d, nz = dz / d, over = b.r + CAR_R - d, vn = c.vx * nx + c.vz * nz; c.x += nx * over; c.z += nz * over;
    if (vn < 0) { c.vx -= 2 * vn * nx; c.vz -= 2 * vn * nz; } c.vx += nx * 360; c.vz += nz * 360; c.spin += (off > 0 ? 1 : -1) * (fx * nz - fz * nx) * 3;
    b.pulse = 1; puff(px - nx * CAR_R, 16, pz - nz * CAR_R, 0xffd24a, 5, 150, 4, .3, 120, 500); damageCar(c, 1.5); if (c.human) { sfx.boing(); shake = Math.max(shake, .1); } break;
  }
  wallCollide(c);
  trackProgress(c, dt, go);
}

/* ---------- collisions entre voitures : on se pousse, on se fait tourner, on s'abîme ---------- */
function carCollisions() {
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const a = cars[i], b = cars[j]; if (a.dead > 0 || b.dead > 0 || a.loop || b.loop || Math.abs(a.y - b.y) > 32) continue;
    if (Math.hypot(a.x - b.x, a.z - b.z) > 2 * (CAR_OFF + CAR_R)) continue;
    const afx = Math.cos(a.a), afz = Math.sin(a.a), bfx = Math.cos(b.a), bfz = Math.sin(b.a);
    for (const ka of [CAR_OFF, -CAR_OFF]) for (const kb of [CAR_OFF, -CAR_OFF]) {
      const dx = b.x + bfx * kb - a.x - afx * ka, dz = b.z + bfz * kb - a.z - afz * ka, d = Math.hypot(dx, dz); if (d >= 2 * CAR_R || d < .01) continue;
      const nx = dx / d, nz = dz / d, push = (2 * CAR_R - d) / 2; a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz; if (rel >= 0) continue;
      const jv = rel * .9, ka2 = a.shield > 0 ? .3 : b.shield > 0 ? 1.7 : 1, kb2 = b.shield > 0 ? .3 : a.shield > 0 ? 1.7 : 1;
      a.vx += nx * jv * ka2; a.vz += nz * jv * ka2; b.vx -= nx * jv * kb2; b.vz -= nz * jv * kb2;
      a.spin += clamp((afx * nz - afz * nx) * ka * jv * .00035, -3, 3); b.spin -= clamp((bfx * nz - bfz * nx) * kb * jv * .00035, -3, 3);
      if (rel < -110) {
        puff((a.x + b.x) / 2, 16, (a.z + b.z) / 2, 0xffffff, 5, 130, 3, .3, 100, 500);
        if (rel < -210) { const dmg = Math.min(6, (-rel - 210) * .025 + 1); damageCar(a, dmg); damageCar(b, dmg); }
        if (a.human || b.human) { rel < -210 ? sfx.crash() : sfx.bump(); shake = Math.max(shake, .12); }
      }
    }
  }
}

/* ---------- objets et accessoires en mouvement ---------- */
function stepProps(dt) {
  for (const p of props) {
    if (!p.alive) continue;
    for (const c of cars) {
      if (c.dead > 0 || c.loop || c.y > 28) continue; const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz); if (d > p.r + 32 || p.y > 30) continue;
      const s = Math.hypot(c.vx, c.vz), nx = d > 1 ? dx / d : 1, nz = d > 1 ? dz / d : 0;
      if (p.kind === 'crate' && s > 230) { breakCrate(p); c.vx *= .85; c.vz *= .85; damageCar(c, 3); if (c.human) sfx.crash(); break; }
      if (p.kind === 'barrel' && s > 310) { p.alive = false; dynGroup.remove(p.vis); booms.push({ x: p.x, z: p.z, t: .01 }); break; }
      p.vx = c.vx * 1.05 + nx * 90; p.vz = c.vz * 1.05 + nz * 90; if (s > 150) p.vy = Math.min(360, s * .45); p.x = c.x + nx * (p.r + 33); p.z = c.z + nz * (p.r + 33);
      const k = 1 - PROP[p.kind].slow; c.vx *= k; c.vz *= k; if (s > 150 && c.human) sfx.bump();
    }
    if (!p.alive) continue;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 1 || p.y > 0 || p.vy > 0) {
      p.x += p.vx * dt; p.z += p.vz * dt; if (p.y > 0 || p.vy > 0) { p.vy -= GRAV * dt; p.y += p.vy * dt; p.vis.rotation.x += 9 * dt; p.vis.rotation.z += 6 * dt; if (p.y <= 0) { p.y = 0; p.vy = p.vy < -200 ? -p.vy * .35 : 0; if (!p.vy) { p.vis.rotation.x = 0; p.vis.rotation.z = 0; } } }
      else { const k = Math.exp(-3 * dt); p.vx *= k; p.vz *= k; }
      p.x = clamp(p.x, -200, WW + 200); p.z = clamp(p.z, -200, WH + 200); p.vis.position.set(p.x, p.y, p.z);
    }
  }
}
function stepMissiles(dt) {
  const tr = track, N = tr.N;
  for (let k = missiles.length - 1; k >= 0; k--) {
    const m = missiles[k]; m.life -= dt; let tgt = null, best = 540, hit = m.life <= 0;
    const fx = Math.cos(m.a), fz = Math.sin(m.a);
    for (const c of cars) { if (c === m.owner || c.dead > 0 || c.loop) continue; const dx = c.x - m.x, dz = c.z - m.z, d = Math.hypot(dx, dz); if (d < best && dx * fx + dz * fz > d * .3) { best = d; tgt = c; } }
    let ax, az; if (tgt) { ax = tgt.x; az = tgt.z; } else { const j = (m.prog + 14) % N; ax = tr.sx[j]; az = tr.sz[j]; }
    m.a += clamp(wrapPi(Math.atan2(az - m.z, ax - m.x) - m.a), -5.5 * dt, 5.5 * dt);
    m.x += Math.cos(m.a) * 900 * dt; m.z += Math.sin(m.a) * 900 * dt; m.y += (20 - m.y) * Math.min(1, dt * 6);
    let b = 1e18, bj = m.prog; for (let q = -2; q <= 22; q++) { const j = ((m.prog + q) % N + N) % N, dx = tr.sx[j] - m.x, dz = tr.sz[j] - m.z, d = dx * dx + dz * dz; if (d < b) { b = d; bj = j; } } m.prog = bj;
    for (const c of cars) if (c.dead <= 0 && !c.loop && (c !== m.owner || m.life < 2.6) && c.y < 70 && Math.hypot(c.x - m.x, c.z - m.z) < 42) hit = true;
    for (const p of props) if (p.alive && Math.hypot(p.x - m.x, p.z - m.z) < p.r + 8) hit = true;
    for (const bp of tr.bumpers) if (Math.hypot(bp.x - m.x, bp.z - m.z) < bp.r + 6) hit = true;
    if (trackHit(tr, m.x, m.z).m > 2) hit = true;
    if ((m.smoke -= dt) <= 0) { m.smoke = .025; puff(m.x - fx * 16, m.y, m.z - fz * 16, 0xe8e8ee, 1, 14, 6, .45, 10, -20); puff(m.x - fx * 12, m.y, m.z - fz * 12, 0xff9a2a, 1, 10, 4, .15, 0, 0); }
    m.vis.position.set(m.x, m.y, m.z); m.vis.rotation.y = -m.a;
    if (hit) { dynGroup.remove(m.vis); missiles.splice(k, 1); explode(m.x, m.z); }
  }
}
function stepItems(dt, go) {
  for (let k = mines.length - 1; k >= 0; k--) {
    const m = mines[k]; if (m.dead) { dynGroup.remove(m.vis); mines.splice(k, 1); continue; }
    m.arm -= dt; m.vis.userData.light.scale.setScalar(m.arm > 0 ? 3 : 5 + Math.sin(simTime * 14) * 2.2);
    if (m.arm <= 0) for (const c of cars) if (c.dead <= 0 && !c.loop && c.y < 26 && Math.hypot(c.x - m.x, c.z - m.z) < 44) { m.dead = true; booms.push({ x: m.x, z: m.z, t: 0 }); break; }
  }
  for (let k = oils.length - 1; k >= 0; k--) { const o = oils[k]; if ((o.life -= dt) <= 0) { dynGroup.remove(o.vis); scorchMark(o.x, o.z, o.r * .85, 0x1b1a1f); oils.splice(k, 1); } }
  for (const b of boxes) {
    if (b.t > 0) { b.t -= dt; b.vis.visible = false; continue; }
    b.vis.visible = true; b.vis.rotation.y = simTime * 2 + b.x; b.vis.rotation.x = .5; b.vis.position.y = 32 + Math.sin(simTime * 3 + b.x) * 5;
    for (const c of cars) if (c.dead <= 0 && !c.loop && c.y < 44 && Math.hypot(c.x - b.x, c.z - b.z) < 44) {
      b.t = 4; puff(b.x, 28, b.z, 0xffd24a, 6, 150, 5, .4, 150, 500); puff(b.x, 28, b.z, 0xffffff, 4, 120, 4, .4, 150, 500); if (c.human) sfx.box();
      if (!c.item && c.roul <= 0) { c.pending = rollItem(c.rank); c.roul = .8; } break;
    }
  }
  if (go && (wrenchT -= dt) <= 0 && wrenches.length < 3) {
    wrenchT = 6; const i = Math.floor(Math.random() * track.N), lat = rnd(track.half[i]), vis = makeWrenchVis(), x = track.sx[i] - track.tz[i] * lat, z = track.sz[i] + track.tx[i] * lat;
    if (!track.loops.some(L => Math.hypot(L.x - x, L.z - z) < 260)) { vis.position.set(x, 26, z); dynGroup.add(vis); wrenches.push({ x, z, vis }); } else wrenchT = .5;
  }
  for (let k = wrenches.length - 1; k >= 0; k--) {
    const w = wrenches[k]; w.vis.rotation.y = simTime * 2.5; w.vis.position.y = 28 + Math.sin(simTime * 3 + w.x) * 5;
    for (const c of cars) if (c.dead <= 0 && !c.loop && c.y < 44 && Math.hypot(c.x - w.x, c.z - w.z) < 44) { repairCar(c, 50); puff(w.x, 28, w.z, 0x35d873, 9, 150, 5, .5, 150, 400); if (c.human) sfx.repair(); dynGroup.remove(w.vis); wrenches.splice(k, 1); break; }
  }
  for (let k = booms.length - 1; k >= 0; k--) { const b = booms[k]; if ((b.t -= dt) <= 0) { booms.splice(k, 1); explode(b.x, b.z); } }
}

/* ---------- un pas de jeu ----------
   gstate : 'menu' (démonstration), 'setup' (réglages des joueurs, voitures sur la grille), 'countdown', 'race', 'done'. */
function update(dt) {
  simTime += dt;
  if (gstate === 'countdown') {
    countT -= dt; const n = Math.ceil(countT);
    if (n !== lastBeep) { lastBeep = n; if (n > 0) sfx.beep(); }
    if (countT <= 0) { gstate = 'race'; goT = .9; sfx.go(); }
  }
  const go = gstate !== 'countdown' && gstate !== 'setup';
  if (gstate === 'race') raceTime += dt;
  if (goT > 0) goT -= dt; if (shake > 0) shake -= dt;
  const hs = cars.filter(c => c.human && !c.finished);
  humanKey = hs.length ? hs.reduce((s, c) => s + carKey(c), 0) / hs.length : null;
  for (const c of cars) stepCar(c, dt, go);
  carCollisions(); stepProps(dt); stepMissiles(dt); stepItems(dt, go);
  const sorted = cars.slice().sort((a, b) => (a.finished && b.finished) ? a.time - b.time : a.finished ? -1 : b.finished ? 1 : carKey(b) - carKey(a));
  sorted.forEach((c, i) => c.rank = i + 1);
  if (gstate === 'race') {
    // la course s'arrête quand tous les joueurs ont fini, ou 25 s après l'arrivée du premier joueur
    const hum = cars.filter(c => c.human), fin = hum.filter(c => c.finished).length;
    if (fin && firstFinT < 0) firstFinT = raceTime;
    if (hum.length && (fin === hum.length || (firstFinT >= 0 && raceTime - firstFinT > 25))) { doneT += dt; if (doneT > 1.3) { gstate = 'done'; if (onRaceEnd) onRaceEnd(sorted); } }
  }
}
