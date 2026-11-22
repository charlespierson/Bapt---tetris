'use strict';
/* Monde 3D (Three.js) : sol, route, raccourcis, barrières, décor, voitures, particules, débris, caméras (poursuite ou dessus). */
let renderer = null, scene, sunLight, worldGroup = null, dynGroup = null, outsideMat, groundMat, roadMesh = null, maxAniso = 4;
let blockMesh = null, puffMesh = null, glowMesh = null, skidMesh = null, scorchMesh = null, bumperVis = [], gateVis = [], padTex = null, skidN = 0, scorchN = 0;
const puffs = [], debris = [], flashes = [], MAXP = 420, MAXSKID = 700, MAXSCORCH = 90, TOP_TILT = .62;
const IMG = { ground: [], road: [] }, groundTex = [];
const GLOW = new Set([0xff8a1f, 0xffd24a, 0xffcf5a, 0xff9a2a, 0xffffff, 0x9fe8ff, 0x35d873, 0xffc23d, 0x4fd8ff]);
const geoCache = {}, matCache = {};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler(), _lp = { x: 0, y: 0, z: 0 };

/* ---------- petits utilitaires ---------- */
function lam(hex) { return matCache[hex] || (matCache[hex] = new THREE.MeshLambertMaterial({ color: hex })); }
function basic(hex, opacity) { const k = 'b' + hex + '_' + opacity; return matCache[k] || (matCache[k] = new THREE.MeshBasicMaterial({ color: hex, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })); }
function boxMesh(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(geoCache.box || (geoCache.box = new THREE.BoxGeometry(1, 1, 1)), mat); m.scale.set(w, h, d); m.position.set(x, y, z); return m; }
function cylMesh(rt, rb, h, seg, mat, x, y, z) { const k = 'c' + rt + '_' + rb + '_' + h + '_' + seg, m = new THREE.Mesh(geoCache[k] || (geoCache[k] = new THREE.CylinderGeometry(rt, rb, h, seg)), mat); m.position.set(x, y, z); return m; }
function sphGeo() { return geoCache.sph || (geoCache.sph = new THREE.SphereGeometry(1, 14, 10)); }
function sphMesh(r, mat, x, y, z) { const m = new THREE.Mesh(sphGeo(), mat); m.scale.setScalar(r); m.position.set(x, y, z); return m; }
function icoMesh(r, mat, x, y, z) { const m = new THREE.Mesh(geoCache.ico || (geoCache.ico = new THREE.IcosahedronGeometry(1, 0)), mat); m.scale.setScalar(r); m.position.set(x, y, z); return m; }
function flatPlane() { return geoCache.fplane || (geoCache.fplane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)); }   // posé à plat : x = longueur, z = largeur
function flatCircle() { return geoCache.fcirc || (geoCache.fcirc = new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2)); }
function grp() { const g = new THREE.Group(); for (let i = 0; i < arguments.length; i++) g.add(arguments[i]); return g; }
function shadowed(o) { o.traverse(c => { if (c.isMesh) c.castShadow = true; }); return o; }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = maxAniso; return t; }
/* Fusionne tous les maillages d'un groupe en un seul, avec les couleurs portées par les sommets (un seul objet à dessiner). */
function mergeGeo(root) {
  root.updateMatrixWorld(true);
  const pos = [], nor = [], col = [], v = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, P = g.attributes.position, Nn = g.attributes.normal, C = g.attributes.color, mc = o.material.color;
    nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(Nn, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      if (C) col.push(C.getX(i) * mc.r, C.getY(i) * mc.g, C.getZ(i) * mc.b); else col.push(mc.r, mc.g, mc.b);
    }
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
function vcMat() { return matCache.vc || (matCache.vc = new THREE.MeshLambertMaterial({ vertexColors: true })); }
function merged(root, mat) { const m = new THREE.Mesh(mergeGeo(root), mat || vcMat()); m.castShadow = true; return m; }

/* ---------- initialisation ---------- */
function makeMarks(max, opacity) {
  const m = new THREE.InstancedMesh(flatCircle(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), max);
  m.frustumCulled = false; m.renderOrder = 3; m.setColorAt(0, _c.set(0x000000)); _m.makeScale(0, 0, 0); for (let i = 0; i < max; i++) m.setMatrixAt(i, _m); return m;
}
function initWorld(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.setScissorTest(true);
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fd4f5); scene.fog = new THREE.Fog(0x9fd4f5, 2400, 8200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a917f, .8));
  sunLight = new THREE.DirectionalLight(0xfff2dc, .62); sunLight.castShadow = true;
  const sh = sunLight.shadow; sh.mapSize.set(2048, 2048); sh.camera.near = 200; sh.camera.far = 3600; sh.bias = -.0006; sh.normalBias = 1.2;
  scene.add(sunLight, sunLight.target);

  groundMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), groundMat); ground.rotation.x = -Math.PI / 2; ground.position.set(WW / 2, 0, WH / 2); ground.receiveShadow = true; scene.add(ground);
  // grain fin répété par-dessus le sol : il donne du détail et une sensation de vitesse en vue poursuite
  const dt = canvasTex(256, 256, (c, W, H) => { const R = seeded(31); for (let k = 0; k < 520; k++) { c.fillStyle = R() < .55 ? 'rgba(0,0,0,.11)' : 'rgba(255,255,255,.13)'; const s = 2 + R() * 4; c.fillRect(R() * W, R() * H, s, s * (.6 + R() * .8)); } });
  dt.wrapS = dt.wrapT = THREE.RepeatWrapping; dt.repeat.set(WW / 120, WH / 120);
  const detail = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshBasicMaterial({ map: dt, transparent: true, depthWrite: false }));
  detail.rotation.x = -Math.PI / 2; detail.position.set(WW / 2, .12, WH / 2); detail.renderOrder = 1; scene.add(detail);
  outsideMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const out = new THREE.Mesh(new THREE.PlaneGeometry(50000, 50000), outsideMat); out.rotation.x = -Math.PI / 2; out.position.set(WW / 2, -3, WH / 2); out.receiveShadow = true; scene.add(out);

  puffMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXP);
  puffMesh.frustumCulled = false; puffMesh.setColorAt(0, _c.set(0xffffff)); puffMesh.count = 0; scene.add(puffMesh);
  glowMesh = new THREE.InstancedMesh(puffMesh.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXP);
  glowMesh.frustumCulled = false; glowMesh.setColorAt(0, _c.set(0xffffff)); glowMesh.count = 0; scene.add(glowMesh);
  skidMesh = makeMarks(MAXSKID, .3); scorchMesh = makeMarks(MAXSCORCH, .5); scene.add(skidMesh, scorchMesh);
}
function setShadows(on) { sunLight.castShadow = on; }
function setShadowSize(n) { const sh = sunLight.shadow; if (sh.mapSize.x === n) return; sh.mapSize.set(n, n); if (sh.map) { sh.map.dispose(); sh.map = null; } }
function resizeWorld(CW, CH, dpr) { renderer.setPixelRatio(dpr); renderer.setSize(CW, CH, false); }

/* ---------- traces au sol : dérapages (elles s'effacent en étant recyclées) et brûlures (elles restent) ---------- */
function skidMark(x, z, r, hex) { const i = skidN++ % MAXSKID; skidMesh.setMatrixAt(i, _m.makeScale(r, 1, r).setPosition(x, 1.1, z)); skidMesh.setColorAt(i, _c.set(hex || 0x1e1610)); skidMesh.instanceMatrix.needsUpdate = true; skidMesh.instanceColor.needsUpdate = true; }
function scorchMark(x, z, r, hex) { const i = scorchN++ % MAXSCORCH; scorchMesh.setMatrixAt(i, _m.makeScale(r, 1, r).setPosition(x, 1.3, z)); scorchMesh.setColorAt(i, _c.set(hex || 0x0f0c0a)); scorchMesh.instanceMatrix.needsUpdate = true; scorchMesh.instanceColor.needsUpdate = true; }

/* ---------- voitures ---------- */
function wheelGeo() {
  if (geoCache.wheel) return geoCache.wheel;
  const tyre = cylMesh(14, 14, 13, 14, lam(0x1b1c21), 0, 0, 0); tyre.rotation.x = Math.PI / 2;
  tyre.add(cylMesh(7, 7, 13.8, 8, lam(0xd8dbe2), 0, 0, 0), boxMesh(20, 14.2, 3.5, lam(0x8b9099), 0, 0, 0));
  return geoCache.wheel = mergeGeo(grp(tyre));
}
function makeCarVis(ci) {
  const colr = CAR_COLORS[ci], root = new THREE.Group(); root.rotation.order = 'YZX';
  const body = lam(colr.hex), dark = lam(0x23262e), glass = lam(0x161b28), white = lam(0xf4f4f0), metal = lam(0x9aa0aa);
  const motor = cylMesh(6, 6, 14, 10, metal, -25, 19, 0); motor.rotation.x = Math.PI / 2;
  root.add(merged(grp(boxMesh(72, 6, 26, dark, 0, 13, 0), boxMesh(5, 7, 38, dark, 47, 12, 0),                       // châssis, pare-chocs
    boxMesh(24, 8, 14, lam(0xb7d43a), -8, 19, 0), boxMesh(10, 6, 10, lam(0x3a7bd5), 22, 18, 0), boxMesh(3, 15, 22, metal, 5, 23, 0), motor,   // batterie, servo, arceau, moteur
    cylMesh(.8, .8, 36, 5, dark, -30, 46, -9), sphMesh(3.6, body, -30, 65, -9))));                                 // antenne
  const wing = grp(boxMesh(10, 2.5, 48, body, 0, 9, 0), boxMesh(3, 14, 3, dark, 0, 2, 12), boxMesh(3, 14, 3, dark, 0, 2, -12), boxMesh(12, 9, 2, white, 0, 8, 24), boxMesh(12, 9, 2, white, 0, 8, -24));
  wing.position.set(-40, 34, 0);
  const shellMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const shell = merged(grp(boxMesh(70, 11, 30, body, 0, 22, 0), boxMesh(22, 7, 24, body, 40, 19.5, 0), boxMesh(26, 11, 22, glass, -6, 33, 0),
    boxMesh(72, 1, 8, white, 0, 28, 0), boxMesh(23, 1, 8, white, 40, 23.5, 0), boxMesh(30, 7, 5, body, 2, 19, 17), boxMesh(30, 7, 5, body, 2, 19, -17), wing), shellMat);
  root.add(shell);
  const wheels = [];
  for (const [x, z] of [[27, -25], [27, 25], [-27, -25], [-27, 25]]) {
    const g = new THREE.Group(); g.position.set(x, 14, z); const tyre = new THREE.Mesh(wheelGeo(), vcMat()); tyre.castShadow = true; g.add(tyre); root.add(g); wheels.push({ g, tyre });
  }
  const shield = new THREE.Mesh(sphGeo(), new THREE.MeshBasicMaterial({ color: 0x7fe6ff, transparent: true, opacity: .3, depthWrite: false }));
  shield.scale.setScalar(54); shield.position.y = 22; shield.visible = false; root.add(shield);
  // flamme du boost, à l'arrière
  const flame = grp(cylMesh(0, 9, 34, 8, basic(0xffcf5a, 1), 0, 0, 0), cylMesh(0, 5.5, 22, 8, basic(0xffffff, 1), 0, 4, 0)); flame.rotation.z = Math.PI / 2; flame.position.set(-58, 17, 0); flame.visible = false; root.add(flame);
  const ring = new THREE.Mesh(geoCache.ring || (geoCache.ring = new THREE.RingGeometry(40, 50, 30)), new THREE.MeshBasicMaterial({ color: colr.hex, transparent: true, opacity: .8, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 4;
  return { root, shell, shellMat, wheels, shield, flame, ring, hex: colr.hex };
}
function resetCarVis(v) { v.shell.visible = true; v.shell.rotation.set(0, 0, 0); v.shellMat.color.set(0xffffff); for (const w of v.wheels) w.g.visible = true; }
function syncCar(c, dt, time) {
  const v = c.vis, dead = c.dead > 0;
  v.root.visible = !dead && !(c.inv > 0 && Math.floor(time * 14) % 2 === 0); v.ring.visible = !dead;
  v.root.position.set(c.x, c.y + c.sus, c.z); v.ring.position.set(c.x, 1.6, c.z); v.ring.scale.setScalar(c.human ? 1.12 : .92);
  const sp = Math.hypot(c.vx, c.vz); let pitch, roll = 0;
  if (c.loop) pitch = c.loop.th;
  else if (c.air) pitch = Math.max(-.6, Math.min(.6, Math.atan2(c.vy, sp + 140) * .9));
  else if (c.ramp) pitch = Math.atan2(c.ramp.h, c.ramp.len);
  else { pitch = c.boost > 0 ? .08 : 0; roll = -c.steerV * Math.min(1, sp / 380) * .16; }
  if (c.wheelOff >= 0 && !c.air && !c.loop) { roll += c.wheelOff % 2 ? .17 : -.17; pitch += c.wheelOff < 2 ? -.1 : .1; }
  if (c.loop) c.pitchV = pitch; else c.pitchV += (pitch - c.pitchV) * Math.min(1, dt * 12);
  c.rollV += (roll - c.rollV) * Math.min(1, dt * 10);
  v.root.rotation.set(c.rollV + c.tumble, -c.a, c.pitchV);
  const spin = (c.vx * Math.cos(c.a) + c.vz * Math.sin(c.a)) * dt / 14;
  for (let i = 0; i < 4; i++) { const w = v.wheels[i]; w.tyre.rotation.z -= spin; if (i < 2) w.g.rotation.y = -c.steerV * .45; }
  v.shield.visible = c.shield > 0; if (c.shield > 0) v.shield.scale.setScalar(54 + Math.sin(time * 9) * 2.5);
  v.flame.visible = c.boost > 0 && !dead; if (v.flame.visible) { const k = .8 + Math.random() * .5; v.flame.scale.set(1, k * Math.min(1.5, .6 + (c.boostPow || 1.5) * .35), 1); }
}

/* ---------- particules (petits volumes facettés) ---------- */
function puff(x, y, z, hex, n, spd, r, life, vy, grav) {
  for (let k = 0; k < n; k++) {
    if (puffs.length >= MAXP) puffs.shift();
    const a = Math.random() * TAU, v = spd * (.3 + Math.random() * .7);
    puffs.push({ x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: (vy || 0) * (.5 + Math.random() * .8), g: grav === undefined ? -40 : grav, r: r * (.6 + Math.random() * .8), life, max: life, col: hex, rot: Math.random() * 6 });
  }
}
/* ---------- débris (pièces de voiture, blocs de barrière...) qui restent sur la piste ---------- */
function addDebris(o, x, y, z, vx, vy, vz, rest) {
  o.position.set(x, y, z); dynGroup.add(o);
  debris.push({ o, vx, vy, vz, rx: (Math.random() - .5) * 16, ry: (Math.random() - .5) * 10, rz: (Math.random() - .5) * 16, h: rest || 5, live: true });
  if (debris.length > 90) dynGroup.remove(debris.shift().o);
}
function flash(x, y, z, r, hex, dur, ring) {
  const m = ring ? new THREE.Mesh(geoCache.fring || (geoCache.fring = new THREE.RingGeometry(.82, 1, 40)), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }))
    : new THREE.Mesh(sphGeo(), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: .9, depthWrite: false }));
  if (ring) m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); dynGroup.add(m); flashes.push({ m, t: 0, dur, r });
}

/* ---------- barrières ---------- */
function setBlockMatrix(tr, i) {
  const b = tr.blocks[i];
  if (b.alive) { _e.set(0, -b.a, 0); _q.setFromEuler(_e); _p.set(b.x, 8.5, b.z); _s.set(b.len - 2, 17, 11); } else { _q.identity(); _p.set(0, -900, 0); _s.set(1, 1, 1); }
  blockMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
}
/* Arrache les blocs autour d'un point : ils deviennent des débris. Retourne le nombre de blocs arrachés. */
function knockBlocks(tr, x, z, rad, nx, nz, spd) {
  let n = 0;
  for (let i = 0; i < tr.blocks.length; i++) {
    const b = tr.blocks[i]; if (!b.alive) continue; const dx = b.x - x, dz = b.z - z; if (dx * dx + dz * dz > rad * rad) continue;
    b.alive = false; setBlockMatrix(tr, i); n++;
    const m = boxMesh(b.len - 2, 17, 11, lam(b.col), 0, 0, 0); m.rotation.y = -b.a; m.castShadow = true;
    addDebris(m, b.x, 9, b.z, nx * spd * (.4 + Math.random() * .5) + (Math.random() - .5) * 120, 160 + Math.random() * 260, nz * spd * (.4 + Math.random() * .5) + (Math.random() - .5) * 120, 6);
  }
  if (n) blockMesh.instanceMatrix.needsUpdate = true;
  return n;
}

/* ---------- route, raccourcis et marquages ---------- */
function stripGeo(cnt, closed, sx, sz, tx, tz, hw, y, step, vLen) {
  const pos = [], uv = [], nor = [], idx = [], n = closed ? cnt + 1 : cnt;
  for (let k = 0; k < n; k++) {
    const i = k % cnt, w = typeof hw === 'number' ? hw : hw[i], nx = -tz[i], nz = tx[i], v = k * step / vLen;
    pos.push(sx[i] - nx * w, y, sz[i] - nz * w, sx[i] + nx * w, y, sz[i] + nz * w); uv.push(0, v, 1, v); nor.push(0, 1, 0, 0, 1, 0);
    if (k < n - 1) { const a = k * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
function makeRoadTex(tr) {
  const th = tr.def.theme, ri = IMG.road[tr.index];
  const t = canvasTex(256, 256, (c, W, H) => {
    c.fillStyle = th.road; c.fillRect(0, 0, W, H); if (ri) c.drawImage(ri, 240, 80, 560, 560, 0, 0, W, H);
    const R = seeded(77); for (let k = 0; k < 900; k++) { c.fillStyle = R() < .5 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.08)'; c.fillRect(R() * W, R() * H, 1 + R() * 2.5, 1 + R() * 2.5); }
    if (tr.def.style === 'asphalt') {             // vibreurs rouges et blancs, lignes de rive, pointillés au centre
      for (const x0 of [0, W - 14]) { c.fillStyle = '#e23b3b'; c.fillRect(x0, 0, 14, H / 2); c.fillStyle = '#f6f4ee'; c.fillRect(x0, H / 2, 14, H / 2); }
      c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(18, 0, 4, H); c.fillRect(W - 22, 0, 4, H); c.fillRect(W / 2 - 2.5, H * .1, 5, H * .4);
    } else {                                       // piste en terre : ornières plus sombres, bords tassés
      for (const u of [.3, .7]) { const g = c.createLinearGradient((u - .09) * W, 0, (u + .09) * W, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.5, 'rgba(0,0,0,.17)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect((u - .09) * W, 0, .18 * W, H); }
      c.fillStyle = th.kerb; c.fillRect(0, 0, 11, H); c.fillRect(W - 11, 0, 11, H); c.fillStyle = th.kerbDark; c.fillRect(11, 0, 3, H); c.fillRect(W - 14, 0, 3, H);
      c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(W / 2 - 2, H * .1, 4, H * .3);
    }
  });
  t.wrapT = THREE.MirroredRepeatWrapping; return t;
}
function makeCutTex(tr) {
  const t = canvasTex(128, 128, (c, W, H) => {
    c.fillStyle = tr.def.theme.cut; c.fillRect(0, 0, W, H);
    const R = seeded(5); for (let k = 0; k < 260; k++) { c.fillStyle = R() < .6 ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.1)'; c.fillRect(R() * W, R() * H, 2 + R() * 4, 2 + R() * 4); }
    c.fillStyle = '#ffb21f'; for (const y0 of [8, 72]) { c.beginPath(); c.moveTo(W * .2, y0 + 44); c.lineTo(W * .5, y0); c.lineTo(W * .8, y0 + 44); c.lineTo(W * .68, y0 + 44); c.lineTo(W * .5, y0 + 18); c.lineTo(W * .32, y0 + 44); c.closePath(); c.fill(); }
    for (const x0 of [0, W - 9]) for (let y = 0; y < H; y += 32) { c.fillStyle = '#ffd24a'; c.fillRect(x0, y, 9, 16); c.fillStyle = '#23262e'; c.fillRect(x0, y + 16, 9, 16); }
  });
  t.wrapT = THREE.RepeatWrapping; return t;
}
function makeGate(cu) {
  const j = Math.min(cu.M - 1, cu.g0 + 2), a = Math.atan2(cu.tz[j], cu.tx[j]), W2 = cu.half + 6;
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xff4b4b }), post = lam(0x2b3040);
  const tex = canvasTex(256, 96, (c, W, H) => {
    c.fillStyle = '#141a2c'; c.fillRect(0, 0, W, H); c.strokeStyle = '#ffd24a'; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
    c.fillStyle = '#ffd24a'; c.save(); c.translate(44, H / 2); const s = 3.6; c.beginPath(); c.moveTo(2 * s, -9 * s); c.lineTo(-5 * s, 1 * s); c.lineTo(-.5 * s, 1 * s); c.lineTo(-2 * s, 9 * s); c.lineTo(5 * s, -1 * s); c.lineTo(.5 * s, -1 * s); c.closePath(); c.fill(); c.restore();
    c.fillStyle = '#fff'; c.font = '800 62px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(Math.round(cu.cost * 100) + '%', W / 2 + 26, H / 2 + 4);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2 * W2 - 14, 46), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); sign.position.set(0, 226, 0); sign.rotation.y = -Math.PI / 2; sign.scale.set(1.25, 1.5, 1);
  const g = grp(boxMesh(10, 270, 10, post, 0, 135, -W2), boxMesh(10, 270, 10, post, 0, 135, W2), boxMesh(12, 14, 2 * W2 + 10, lightMat, 0, 268, 0), boxMesh(12, 8, 2 * W2 + 10, lightMat, 0, 186, 0), sign);
  g.position.set(cu.sx[j], 0, cu.sz[j]); g.rotation.y = -a; shadowed(g); sign.castShadow = false; sign.userData.own = true;
  return { g, lightMat };
}
/* Les portiques des raccourcis passent au vert pour le joueur dont la jauge de boost est pleine. */
function setGates(full) { for (const g of gateVis) g.lightMat.color.set(full ? 0x35d873 : 0xff4b4b); }
const HAZ_COL = { water: [0x4fa9e2, 0x8fd0f2], mud: [0x57391f, 0x75502f], oil: [0x17181d, 0x3b3352] };
function makeHazard(h) {
  const col = HAZ_COL[h.kind], g = new THREE.Group();
  for (const [ox, oz, k, ci] of [[0, 0, 1, 0], [.5, .35, .6, 0], [-.45, .3, .5, 0], [.1, -.5, .55, 0], [-.25, -.2, .4, 1]]) { const m = new THREE.Mesh(flatCircle(), lam(col[ci])); m.scale.setScalar(h.r * k); m.position.set(h.x + ox * h.r, .9 + ci * .2, h.z + oz * h.r); g.add(m); }
  const m = merged(g); m.castShadow = false; m.receiveShadow = true; m.userData.own = true; return m;
}

/* ---------- éléments de piste ---------- */
function makeRamp(r) {
  const L = r.len, H = r.h, w = r.w / 2, A0 = [0, 0, -w], A1 = [0, 0, w], B0 = [L, 0, -w], B1 = [L, 0, w], C0 = [L, H, -w], C1 = [L, H, w];
  const pos = [].concat(A0, A1, C1, A0, C1, C0, B0, C0, C1, B0, C1, B1, A0, C0, B0, A1, B1, C1);
  const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  g.addGroup(0, 6, 0); g.addGroup(6, 12, 1);
  const tex = matCache.rampTex || (matCache.rampTex = canvasTex(128, 64, (c, W, Hh) => { c.fillStyle = '#f2a93b'; c.fillRect(0, 0, W, Hh); c.fillStyle = '#fff6df'; for (let x = 8; x < W; x += 30) { c.beginPath(); c.moveTo(x, 54); c.lineTo(x + 11, 14); c.lineTo(x + 22, 54); c.lineTo(x + 15, 54); c.lineTo(x + 11, 34); c.lineTo(x + 7, 54); c.closePath(); c.fill(); } c.fillStyle = '#c9781a'; c.fillRect(0, 0, W, 5); }));
  const m = new THREE.Mesh(g, [new THREE.MeshLambertMaterial({ map: tex }), lam(0xb96f1c)]); m.position.set(r.x, 0, r.z); m.rotation.y = -r.a; m.castShadow = true; m.receiveShadow = true; m.userData.own = true; return m;
}
function makeLoop(L) {
  const S = 64, hw = 34, pos = [], uv = [], idx = [], lp = [], rp = [];
  for (let k = 0; k <= S; k++) {
    const th = k / S * TAU; loopPoint(L, th, -hw, _lp); pos.push(_lp.x, _lp.y, _lp.z); lp.push(new THREE.Vector3(_lp.x, _lp.y, _lp.z));
    loopPoint(L, th, hw, _lp); pos.push(_lp.x, _lp.y, _lp.z); rp.push(new THREE.Vector3(_lp.x, _lp.y, _lp.z));
    uv.push(0, k / 4, 1, k / 4); if (k < S) { const a = k * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const tex = matCache.loopTex || (matCache.loopTex = canvasTex(64, 64, (c, W, H) => { c.fillStyle = '#ff8a1f'; c.fillRect(0, 0, W, H); c.fillStyle = '#ffd24a'; c.fillRect(0, 0, W, H / 2); c.fillStyle = '#ffffff'; c.fillRect(W / 2 - 3, 0, 6, H); }));
  tex.wrapT = THREE.RepeatWrapping;
  const strip = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })); strip.castShadow = true; strip.userData.own = true;
  const out = grp(strip);
  for (const pts of [lp, rp]) { const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 3.2, 5, false), lam(0x2a4bd0)); t.castShadow = true; t.userData.own = true; out.add(t); }
  return out;
}
function makeBumper(b) {
  const ring = new THREE.Mesh(geoCache.bring || (geoCache.bring = new THREE.TorusGeometry(24, 5.5, 8, 20)), lam(0xe5383b)); ring.rotation.x = Math.PI / 2; ring.position.y = 13;
  const cap = cylMesh(17, 17, 8, 16, new THREE.MeshLambertMaterial({ color: 0xffd24a, emissive: 0x000000 }), 0, 25, 0);
  const g = grp(cylMesh(21, 23, 21, 16, lam(0xf4f4f0), 0, 10.5, 0), ring, cap); g.position.set(b.x, 0, b.z); shadowed(g); return { g, ring, cap };
}
function makeBoxVis() {
  const tex = matCache.qTex || (matCache.qTex = canvasTex(64, 64, (c, W, H) => { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#ffcf3d'); g.addColorStop(1, '#ff7a1a'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.strokeStyle = '#fff'; c.lineWidth = 5; c.strokeRect(3, 3, W - 6, H - 6); c.fillStyle = '#fff'; c.font = '800 46px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', W / 2, H / 2 + 3); }));
  const m = new THREE.Mesh(geoCache.box, matCache.qMat || (matCache.qMat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x4a2a00 }))); m.scale.setScalar(32); m.castShadow = true; return m;
}
function makeWrenchVis() { const mt = new THREE.MeshLambertMaterial({ color: 0x35d873, emissive: 0x0b4a22 }); return shadowed(grp(boxMesh(32, 10, 10, mt, 0, 0, 0), boxMesh(10, 32, 10, mt, 0, 0, 0), boxMesh(10, 10, 14, lam(0xffffff), 0, 0, 0))); }
function makeMineVis() { const light = sphMesh(5, basic(0xff2a2a, 1), 0, 11, 0); const g = shadowed(grp(cylMesh(15, 18, 9, 12, lam(0x2a2d35), 0, 4.5, 0), light)); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.add(boxMesh(5, 4, 5, lam(0x8b9099), Math.cos(a) * 17, 4, Math.sin(a) * 17)); } g.userData.light = light; return g; }
function makeMissileVis(hex) {
  const body = cylMesh(4.5, 4.5, 24, 8, lam(0xf4f4f0), 0, 0, 0); body.rotation.z = -Math.PI / 2;
  const nose = cylMesh(.5, 4.5, 10, 8, lam(hex), 17, 0, 0); nose.rotation.z = -Math.PI / 2;
  return shadowed(grp(body, nose, boxMesh(8, 14, 1.5, lam(hex), -10, 0, 0), boxMesh(8, 1.5, 14, lam(hex), -10, 0, 0)));
}
function makeOilVis(r) { const m = new THREE.Mesh(flatCircle(), basic(0x121318, .92)); m.scale.setScalar(r); m.renderOrder = 2; return m; }
function makePropVis(kind) { const m = new THREE.Mesh(geoCache['prop' + kind] || (geoCache['prop' + kind] = mergeGeo(propParts(kind))), vcMat()); m.castShadow = true; return m; }
function propParts(kind) {
  if (kind === 'cone') return grp(cylMesh(2.5, 11, 28, 10, lam(0xff7a1a), 0, 15, 0), cylMesh(6.3, 8, 6, 10, lam(0xffffff), 0, 14, 0), boxMesh(26, 3, 26, lam(0xff7a1a), 0, 1.5, 0));
  if (kind === 'tyre') { const g = new THREE.Group(); for (let i = 0; i < 3; i++) g.add(cylMesh(19, 19, 10, 14, lam(i === 1 ? 0x2c2e35 : 0x1d1e24), (i - 1) * 1.5, 5 + i * 10.5, 0)); g.add(cylMesh(9, 9, 1, 12, lam(0x0d0d10), 3, 31.6, 0)); return g; }
  if (kind === 'crate') return grp(boxMesh(32, 32, 32, lam(0xc08a4c), 0, 16, 0), boxMesh(33, 5, 33, lam(0x8e5f2c), 0, 4, 0), boxMesh(33, 5, 33, lam(0x8e5f2c), 0, 28, 0));
  return grp(cylMesh(14, 14, 32, 14, lam(0xd92b2b), 0, 16, 0), cylMesh(14.6, 14.6, 4, 14, lam(0x2a2d35), 0, 9, 0), cylMesh(14.6, 14.6, 4, 14, lam(0x2a2d35), 0, 23, 0), cylMesh(8, 8, 1, 10, lam(0xffd24a), 0, 32.3, 0));   // baril explosif
}

/* ---------- décor ---------- */
const DECO = {
  sand: [
    () => grp(cylMesh(30, 22, 44, 16, lam(0x2a8de0), 0, 22, 0), cylMesh(31, 31, 4, 16, lam(0xffd24a), 0, 44, 0)),
    () => { const t = new THREE.Mesh(geoCache.tor || (geoCache.tor = new THREE.TorusGeometry(1, .16, 6, 20)), lam(0xffffff)); t.scale.setScalar(25.5); t.position.y = 26; t.rotation.x = Math.PI / 2; return grp(sphMesh(26, lam(0xff5a7a), 0, 26, 0), t); },
    () => grp(cylMesh(30, 36, 26, 14, lam(0xdcbd7c), 0, 13, 0), cylMesh(13, 15, 24, 10, lam(0xd3b170), 0, 38, 0), cylMesh(1, 12, 14, 10, lam(0xe5383b), 0, 57, 0), cylMesh(8, 9, 14, 8, lam(0xd3b170), 26, 30, 0), cylMesh(8, 9, 14, 8, lam(0xd3b170), -26, 30, 0)),
    () => grp(boxMesh(60, 6, 6, lam(0xe5383b), 0, 4, 0), boxMesh(24, 4, 22, lam(0xe5383b), 40, 3, 0)),
  ],
  garden: [
    () => grp(sphMesh(30, lam(0x3f8f3c), 0, 22, 0), sphMesh(22, lam(0x4ea548), 22, 20, 10), sphMesh(20, lam(0x367f35), -18, 18, -12)),
    () => { const col = [0xffffff, 0xffd166, 0xff8fab, 0xb388ff][Math.floor(Math.random() * 4)], g = grp(cylMesh(1.6, 1.6, 26, 5, lam(0x3f8f3c), 0, 13, 0), sphMesh(5, lam(0xf4a11a), 0, 28, 0)); for (let i = 0; i < 5; i++) g.add(sphMesh(5.5, lam(col), Math.cos(i * TAU / 5) * 8, 27, Math.sin(i * TAU / 5) * 8)); return g; },
    () => { const cap = sphMesh(18, lam(0xd93a3a), 0, 22, 0); cap.scale.y = 11; return grp(cylMesh(6, 8, 22, 8, lam(0xf2ead8), 0, 11, 0), cap, sphMesh(3.5, lam(0xffffff), 8, 29, 4), sphMesh(3, lam(0xffffff), -7, 29, -6)); },
    () => { const s = icoMesh(22, lam(0x9a9c98), 0, 10, 0); s.scale.set(26, 14, 20); return grp(s); },
  ],
  dirt: [
    () => grp(boxMesh(52, 30, 34, lam(0xd9b24c), 0, 15, 0), boxMesh(53, 3, 35, lam(0xb8902f), 0, 10, 0), boxMesh(53, 3, 35, lam(0xb8902f), 0, 21, 0)),
    () => makePropVis('tyre'),
    () => { const s = icoMesh(20, lam(0x8a7460), 0, 9, 0); s.scale.set(24, 15, 19); return grp(s); },
    () => grp(cylMesh(2, 2, 84, 6, lam(0xf4f4f0), 0, 42, 0), boxMesh(30, 18, 1.5, lam([0xe5383b, 0x2f6fed, 0xf6b40e][Math.floor(Math.random() * 3)]), 16, 74, 0)),
  ],
  parking: [
    () => makePropVis('cone'),
    () => grp(cylMesh(7, 7, 36, 10, lam(0xf2c230), 0, 18, 0), cylMesh(7.4, 7.4, 6, 10, lam(0x23262e), 0, 30, 0)),
    () => grp(cylMesh(3.5, 4.5, 150, 8, lam(0x8b9099), 0, 75, 0), boxMesh(34, 6, 12, lam(0x6b7079), 14, 150, 0), boxMesh(22, 2, 8, basic(0xfff3b0, 1), 16, 146.5, 0)),
    () => grp(cylMesh(16, 16, 34, 14, lam(0x2f6fed), 0, 17, 0), cylMesh(16.5, 16.5, 3, 14, lam(0x1e4bb0), 0, 11, 0), cylMesh(16.5, 16.5, 3, 14, lam(0x1e4bb0), 0, 24, 0)),
  ],
};

/* ---------- construction du monde d'un décor ---------- */
function disposeGroup(g) { g.traverse(o => { if (o.isMesh && (o.userData.own || o.isInstancedMesh)) o.geometry.dispose(); }); }
function groundTexture(i) {
  if (groundTex[i]) return groundTex[i]; const im = IMG.ground[i]; if (!im) return null;
  const t = new THREE.Texture(im); t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.repeat.set(2, 2); t.anisotropy = maxAniso; t.needsUpdate = true; return groundTex[i] = t;
}
/* À rappeler quand les images du décor ont fini de charger. */
function refreshTextures(tr) {
  const gt = groundTexture(tr.index); groundMat.map = gt; groundMat.color.set(gt ? 0xffffff : tr.def.theme.ground); groundMat.needsUpdate = true;
  if (roadMesh) { if (roadMesh.material.map) roadMesh.material.map.dispose(); roadMesh.material.map = makeRoadTex(tr); roadMesh.material.needsUpdate = true; }
}
function flatMesh(tex, len, w, x, z, a, y) { const m = new THREE.Mesh(flatPlane(), new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); m.scale.set(len, 1, w); m.position.set(x, y, z); m.rotation.y = -a; return m; }
function loadTrackWorld(tr) {
  if (worldGroup) { scene.remove(worldGroup); disposeGroup(worldGroup); }
  worldGroup = new THREE.Group(); scene.add(worldGroup);
  const th = tr.def.theme; outsideMat.color.set(th.outside); scene.background.set(th.sky); scene.fog.color.set(th.sky);
  // route et raccourcis : des rubans posés sur le sol
  const step = tr.L / tr.N, vLen = tr.L / (2 * Math.round(tr.L / 520));
  roadMesh = new THREE.Mesh(stripGeo(tr.N, true, tr.sx, tr.sz, tr.tx, tr.tz, tr.half, .7, step, vLen), new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  roadMesh.receiveShadow = true; roadMesh.userData.own = true; worldGroup.add(roadMesh); refreshTextures(tr);
  const cutMat = new THREE.MeshLambertMaterial({ map: makeCutTex(tr), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  gateVis = [];
  for (const cu of tr.cuts) {
    const m = new THREE.Mesh(stripGeo(cu.M, false, cu.sx, cu.sz, cu.tx, cu.tz, cu.half, .35, 8, 110), cutMat); m.receiveShadow = true; m.userData.own = true; worldGroup.add(m);
    const g = makeGate(cu); gateVis.push(g); worldGroup.add(g.g);
  }
  const chk = matCache.chk || (matCache.chk = canvasTex(32, 160, (c, W, H) => { for (let r = 0; r < 10; r++) for (let k = 0; k < 2; k++) { c.fillStyle = (r + k) % 2 ? '#1c1c22' : '#f7f7f2'; c.fillRect(k * 16, r * 16, 16, 16); } }));
  chk.magFilter = THREE.NearestFilter;
  worldGroup.add(flatMesh(chk, 32, tr.half[0] * 2, tr.sx[0], tr.sz[0], Math.atan2(tr.tz[0], tr.tx[0]), 1));
  padTex = matCache.padTex || (matCache.padTex = canvasTex(128, 64, (c, W, H) => { c.fillStyle = '#10b6f2'; c.fillRect(0, 0, W, H); c.fillStyle = '#fffbe0'; for (let x = 6; x < W; x += 43) { c.beginPath(); c.moveTo(x, 6); c.lineTo(x + 20, H / 2); c.lineTo(x, H - 6); c.lineTo(x + 11, H - 6); c.lineTo(x + 31, H / 2); c.lineTo(x + 11, 6); c.closePath(); c.fill(); } }));
  padTex.wrapS = THREE.RepeatWrapping;
  for (const p of tr.pads) worldGroup.add(flatMesh(padTex, p.len, p.w, p.x, p.z, p.a, 1));
  for (const h of tr.hazards) worldGroup.add(makeHazard(h));

  const fm = lam(th.frame), T = 30;
  for (const f of [boxMesh(WW + 2 * T, T, T, fm, WW / 2, T / 2 - 2, -T / 2), boxMesh(WW + 2 * T, T, T, fm, WW / 2, T / 2 - 2, WH + T / 2), boxMesh(T, T, WH, fm, -T / 2, T / 2 - 2, WH / 2), boxMesh(T, T, WH, fm, WW + T / 2, T / 2 - 2, WH / 2)]) { f.castShadow = true; f.receiveShadow = true; worldGroup.add(f); }
  blockMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), tr.blocks.length);
  blockMesh.frustumCulled = false; blockMesh.castShadow = true; blockMesh.receiveShadow = true;
  tr.blocks.forEach((b, i) => { b.col = th.blocks[i % th.blocks.length]; b.alive = true; setBlockMatrix(tr, i); blockMesh.setColorAt(i, _c.set(b.col)); });
  worldGroup.add(blockMesh);
  for (const r of tr.ramps) worldGroup.add(makeRamp(r));
  for (const L of tr.loops) worldGroup.add(makeLoop(L));
  bumperVis = tr.bumpers.map(b => { const v = makeBumper(b); worldGroup.add(v.g); return v; });
  const R = seeded(4321 + tr.index * 97), list = DECO[tr.def.deco], placed = [], decoRoot = new THREE.Group();
  for (let k = 0; k < 2400 && placed.length < 70; k++) {
    const x = 50 + R() * (WW - 100), z = 50 + R() * (WH - 100);
    if (trackHit(tr, x, z).m < 80 || placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 120) || tr.loops.some(L => Math.hypot(L.x - x, L.z - z) < 240)) continue;
    const o = list[Math.floor(R() * list.length)](); o.position.set(x, 0, z); o.rotation.y = R() * TAU; o.scale.setScalar(.85 + R() * .6); decoRoot.add(o); placed.push([x, z]);
  }
  for (const [x, z, s] of [[-230, 300, 2.6], [WW + 250, 1300, 2.8], [900, -240, 2.4], [2600, WH + 270, 2.7], [WW + 210, 300, 2.2], [-210, 1500, 2.4], [1900, -270, 2.6], [400, WH + 250, 2.3], [3100, -230, 2.2], [1500, WH + 260, 2.5]]) {
    const o = list[Math.floor(R() * list.length)](); o.position.set(x, 0, z); o.rotation.y = R() * TAU; o.scale.setScalar(s); decoRoot.add(o);
  }
  const dm = merged(decoRoot); dm.userData.own = true; dm.receiveShadow = true; worldGroup.add(dm);
  resetTrackWorld(tr);
}
/* Remet le circuit à neuf avant chaque course. */
function resetTrackWorld(tr) {
  if (dynGroup) scene.remove(dynGroup);
  dynGroup = new THREE.Group(); scene.add(dynGroup);
  puffs.length = 0; debris.length = 0; flashes.length = 0; skidN = scorchN = 0;
  _m.makeScale(0, 0, 0); for (let i = 0; i < MAXSKID; i++) skidMesh.setMatrixAt(i, _m); for (let i = 0; i < MAXSCORCH; i++) scorchMesh.setMatrixAt(i, _m); skidMesh.instanceMatrix.needsUpdate = true; scorchMesh.instanceMatrix.needsUpdate = true;
  tr.blocks.forEach((b, i) => { b.alive = true; setBlockMatrix(tr, i); }); blockMesh.instanceMatrix.needsUpdate = true; if (blockMesh.instanceColor) blockMesh.instanceColor.needsUpdate = true;
}

/* ---------- mise à jour des effets ---------- */
function updateWorldFx(dt, time, tr) {
  let n = 0, ng = 0;
  for (let k = puffs.length - 1; k >= 0; k--) { const p = puffs[k]; p.life -= dt; if (p.life <= 0) { puffs.splice(k, 1); continue; } p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 2) { p.y = 2; p.vy *= -.3; } const d = 1 - 2.5 * dt; p.vx *= d; p.vz *= d; }
  for (const p of puffs) {
    const f = p.life / p.max, s = p.r * Math.min(1, (1 - f) * 7 + .25) * Math.min(1, f * 2.2);
    _e.set(p.rot, p.rot * 1.7, 0); _q.setFromEuler(_e); _p.set(p.x, p.y, p.z); _s.set(s, s, s); _m.compose(_p, _q, _s); _c.set(p.col);
    if (GLOW.has(p.col)) { glowMesh.setMatrixAt(ng, _m); glowMesh.setColorAt(ng, _c); ng++; } else { puffMesh.setMatrixAt(n, _m); puffMesh.setColorAt(n, _c); n++; }
  }
  puffMesh.count = n; puffMesh.instanceMatrix.needsUpdate = true; puffMesh.instanceColor.needsUpdate = true;
  glowMesh.count = ng; glowMesh.instanceMatrix.needsUpdate = true; glowMesh.instanceColor.needsUpdate = true;
  for (const d of debris) {
    if (!d.live) continue; const o = d.o;
    d.vy -= GRAV * dt; o.position.x += d.vx * dt; o.position.y += d.vy * dt; o.position.z += d.vz * dt;
    o.rotation.x += d.rx * dt; o.rotation.y += d.ry * dt; o.rotation.z += d.rz * dt;
    if (o.position.y < d.h) {
      o.position.y = d.h;
      if (Math.abs(d.vy) > 130) { d.vy = -d.vy * .42; d.vx *= .7; d.vz *= .7; d.rx *= .6; d.rz *= .6; }
      else {
        d.vy = 0; const k = Math.exp(-5 * dt); d.vx *= k; d.vz *= k; d.rx *= k; d.ry *= k; d.rz *= k;
        if (d.flat) { d.rx = d.rz = 0; const q = Math.min(1, dt * 12); o.rotation.x += (Math.round(o.rotation.x / Math.PI) * Math.PI - o.rotation.x) * q; o.rotation.z += (Math.round(o.rotation.z / Math.PI) * Math.PI - o.rotation.z) * q; }
        if (Math.hypot(d.vx, d.vz) < 10) { d.live = false; if (d.flat) { o.rotation.x = Math.round(o.rotation.x / Math.PI) * Math.PI; o.rotation.z = Math.round(o.rotation.z / Math.PI) * Math.PI; } }
      }
    }
  }
  for (let k = flashes.length - 1; k >= 0; k--) { const f = flashes[k]; f.t += dt; const u = f.t / f.dur; if (u >= 1) { dynGroup.remove(f.m); f.m.material.dispose(); flashes.splice(k, 1); continue; } f.m.scale.setScalar(f.r * (.25 + .75 * Math.sqrt(u))); f.m.material.opacity = .9 * (1 - u); }
  tr.bumpers.forEach((b, i) => { if (b.pulse > 0) b.pulse = Math.max(0, b.pulse - dt * 4); const v = bumperVis[i]; if (!v) return; v.ring.scale.setScalar(1 + b.pulse * .35); v.cap.material.emissive.setScalar(b.pulse * .9); });
  if (padTex) padTex.offset.x = -(time * 1.6 % 1);
}

/* ---------- caméras : une par joueur ----------
   V = { cam, st: {a, x, z}, x, y, w, h (zone à l'écran, en pixels CSS), flip (écran retourné pour le joueur d'en face) } */
function newView() { return { cam: new THREE.PerspectiveCamera(58, 1, 20, 14000), st: { a: 0, x: WW / 2, z: WH / 2 }, x: 0, y: 0, w: 1, h: 1, flip: false, p: -1 }; }
function setFov(cam, base, loDeg, aspect) {
  let th = Math.tan(base * Math.PI / 360) * aspect; const lo = Math.tan(loDeg * Math.PI / 360), hi = Math.tan(100 * Math.PI / 360);
  th = Math.max(lo, Math.min(hi, th)); cam.fov = 2 * Math.atan(th / aspect) * 180 / Math.PI; cam.aspect = aspect; cam.updateProjectionMatrix();
}
/* mode : 'near' ou 'far' (poursuite derrière la voiture, comme dans un jeu de kart), 'top' (vue de dessus inclinée, le nord en haut). */
function placeCamera(V, c, mode, dt, snap) {
  const cam = V.cam, st = V.st, asp = V.w / V.h, sp = Math.hypot(c.vx, c.vz), k = snap ? 1 : 1 - Math.exp(-dt * 16);
  st.x += (c.x - st.x) * k; st.z += (c.z - st.z) * k;
  if (mode === 'top') {
    setFov(cam, 36, 30, asp);
    const tH = Math.tan(cam.fov * Math.PI / 360) * asp, D = 560 / tH, lx = st.x + c.vx * .35, lz = st.z + c.vz * .35;
    cam.position.set(lx, D * Math.cos(TOP_TILT), lz + D * Math.sin(TOP_TILT)); cam.up.set(0, 1, 0); cam.lookAt(lx, 0, lz);
  } else {
    setFov(cam, 58, 54, asp);
    const fwd = c.vx * Math.cos(c.a) + c.vz * Math.sin(c.a);
    let want = c.loop ? c.loop.L.a : (sp > 110 && fwd > 0) ? Math.atan2(c.vz, c.vx) : c.a;   // la caméra suit la trajectoire : elle reste calme pendant un tête-à-queue
    let d = want - st.a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    st.a = snap ? want : st.a + d * (1 - Math.exp(-dt * 5.5));
    const near = mode === 'near', dist = near ? 235 : 390, h = near ? 104 : 190, ahead = near ? 140 : 170, ca = Math.cos(st.a), sa = Math.sin(st.a), cy = Math.min(c.y, 220) * .55;
    cam.position.set(st.x - ca * dist, h + cy, st.z - sa * dist); cam.up.set(0, 1, 0); cam.lookAt(st.x + ca * ahead, 18 + cy, st.z + sa * ahead);
  }
  if (V.flip) cam.rotateZ(Math.PI);
  V.fx = st.x; V.fz = st.z; V.sb = 720;
}
/* Vue d'ensemble qui tourne lentement autour du circuit (derrière le menu). */
function overviewCamera(V, time) {
  const cam = V.cam; setFov(cam, 50, 40, V.w / V.h); const a = time * .06 + 1.2;
  cam.position.set(WW / 2 + Math.cos(a) * 2500, 1500, WH / 2 + Math.sin(a) * 1900); cam.up.set(0, 1, 0); cam.lookAt(WW / 2, 0, WH / 2);
  V.fx = WW / 2; V.fz = WH / 2; V.sb = 2300;
}
function renderView(V, CH, gaugeFull) {
  renderer.setViewport(V.x, CH - V.y - V.h, V.w, V.h); renderer.setScissor(V.x, CH - V.y - V.h, V.w, V.h);
  // les ombres sont calculées autour de ce que regarde cette caméra
  const sh = sunLight.shadow, B = V.sb; sunLight.target.position.set(V.fx, 0, V.fz); sunLight.position.set(V.fx - 650, 1500, V.fz - 560); sunLight.target.updateMatrixWorld();
  if (sh.camera.right !== B) { sh.camera.left = -B; sh.camera.right = B; sh.camera.top = B; sh.camera.bottom = -B; sh.camera.updateProjectionMatrix(); }
  setGates(gaugeFull); renderer.render(scene, V.cam);
}
