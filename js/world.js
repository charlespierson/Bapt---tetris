'use strict';
/* Monde 3D (Three.js) : sol, barrières, décor, voitures, particules, débris, caméra inclinée. */
let renderer = null, scene, camera, sunLight, worldGroup = null, dynGroup = null, outsideMat, groundTex, groundCanvas, decalCanvas, decalCtx, decalTex, decalDirty = false, decalClock = 0;
let blockMesh = null, puffMesh = null, glowMesh = null, bumperVis = [];
const GLOW = new Set([0xff8a1f, 0xffd24a, 0xffcf5a, 0xff9a2a, 0xffffff, 0x9fe8ff, 0x35d873, 0xffc23d]);
const puffs = [], debris = [], flashes = [], MAXP = 420;
const IMG = { ground: [], road: [] };
const geoCache = {}, matCache = {};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler(), _lp = { x: 0, y: 0, z: 0 };
const CAM = { tilt: .64, tH: .364, tV: .2, VW: 2, VH: 1, rot: false, cx: WW / 2, cz: WH / 2, D: 3000, whole: { cx: WW / 2, cz: WH / 2, D: 3000 } };

/* ---------- petits utilitaires ---------- */
function lam(hex) { return matCache[hex] || (matCache[hex] = new THREE.MeshLambertMaterial({ color: hex })); }
function basic(hex, opacity) { const k = 'b' + hex + '_' + opacity; return matCache[k] || (matCache[k] = new THREE.MeshBasicMaterial({ color: hex, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })); }
function boxMesh(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(geoCache.box || (geoCache.box = new THREE.BoxGeometry(1, 1, 1)), mat); m.scale.set(w, h, d); m.position.set(x, y, z); return m; }
function cylMesh(rt, rb, h, seg, mat, x, y, z) { const k = 'c' + rt + '_' + rb + '_' + h + '_' + seg, m = new THREE.Mesh(geoCache[k] || (geoCache[k] = new THREE.CylinderGeometry(rt, rb, h, seg)), mat); m.position.set(x, y, z); return m; }
function sphMesh(r, mat, x, y, z) { const m = new THREE.Mesh(geoCache.sph || (geoCache.sph = new THREE.SphereGeometry(1, 14, 10)), mat); m.scale.setScalar(r); m.position.set(x, y, z); return m; }
function icoMesh(r, mat, x, y, z) { const m = new THREE.Mesh(geoCache.ico || (geoCache.ico = new THREE.IcosahedronGeometry(1, 0)), mat); m.scale.setScalar(r); m.position.set(x, y, z); return m; }
function grp() { const g = new THREE.Group(); for (let i = 0; i < arguments.length; i++) g.add(arguments[i]); return g; }
function shadowed(o) { o.traverse(c => { if (c.isMesh) c.castShadow = true; }); return o; }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; }

/* Fusionne tous les maillages d'un groupe en un seul, avec les couleurs portées par les sommets. */
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
function initWorld(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x20242c);
  camera = new THREE.PerspectiveCamera(30, 2, 150, 16000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a917f, .8));
  sunLight = new THREE.DirectionalLight(0xfff2dc, .62); sunLight.position.set(WW / 2 - 650, 1500, WH / 2 - 560); sunLight.target.position.set(WW / 2, 0, WH / 2);
  sunLight.castShadow = true; const sh = sunLight.shadow; sh.mapSize.set(2048, 2048); sh.camera.left = -1200; sh.camera.right = 1200; sh.camera.top = 1000; sh.camera.bottom = -1000; sh.camera.near = 300; sh.camera.far = 3600; sh.bias = -.0006; sh.normalBias = 1.2;
  scene.add(sunLight, sunLight.target);

  groundCanvas = document.createElement('canvas'); groundCanvas.width = 2048; groundCanvas.height = 1024;
  groundTex = new THREE.CanvasTexture(groundCanvas); groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshLambertMaterial({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(WW / 2, 0, WH / 2); ground.receiveShadow = true; scene.add(ground);
  decalCanvas = document.createElement('canvas'); decalCanvas.width = 1024; decalCanvas.height = 512; decalCtx = decalCanvas.getContext('2d');
  decalTex = new THREE.CanvasTexture(decalCanvas);
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false }));
  decal.rotation.x = -Math.PI / 2; decal.position.set(WW / 2, .5, WH / 2); decal.renderOrder = 1; scene.add(decal);
  outsideMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const out = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), outsideMat); out.rotation.x = -Math.PI / 2; out.position.set(WW / 2, -3, WH / 2); out.receiveShadow = true; scene.add(out);

  puffMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXP);
  puffMesh.frustumCulled = false; puffMesh.setColorAt(0, _c.set(0xffffff)); puffMesh.count = 0; scene.add(puffMesh);
  glowMesh = new THREE.InstancedMesh(puffMesh.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXP);
  glowMesh.frustumCulled = false; glowMesh.setColorAt(0, _c.set(0xffffff)); glowMesh.count = 0; scene.add(glowMesh);
}
function setShadows(on) { sunLight.castShadow = on; }

/* ---------- sol peint (texture) ---------- */
function strokeTrack(ctx, tr, extra, style) {
  ctx.strokeStyle = style; ctx.lineCap = 'round';
  for (let i = 0; i < tr.N; i++) { const j = (i + 1) % tr.N; ctx.lineWidth = 2 * (tr.half[i] + extra); ctx.beginPath(); ctx.moveTo(tr.sx[i], tr.sz[i]); ctx.lineTo(tr.sx[j], tr.sz[j]); ctx.stroke(); }
}
const HAZ_COL = { water: ['#4fa9e2', '#8fd0f2'], mud: ['#57391f', '#75502f'], oil: ['#17181d', '#3b3352'] };
/* Dessine le circuit vu de dessus dans un contexte 2D déjà mis à l'échelle (unités du monde). pw/ph = taille en pixels. */
function paintGround(ctx, tr, pw, ph) {
  const th = tr.def.theme, gi = IMG.ground[tr.index], ri = IMG.road[tr.index];
  ctx.fillStyle = th.ground; ctx.fillRect(0, 0, WW, WH);
  if (gi) ctx.drawImage(gi, 0, 0, WW, WH);
  strokeTrack(ctx, tr, 16, th.kerbDark); strokeTrack(ctx, tr, 11, th.kerb);
  if (ri) {
    const l = document.createElement('canvas'); l.width = pw; l.height = ph; const c = l.getContext('2d'); c.scale(pw / WW, ph / WH);
    strokeTrack(c, tr, 0, '#000'); c.globalCompositeOperation = 'source-in'; c.drawImage(ri, 0, 0, WW, WH); ctx.drawImage(l, 0, 0, WW, WH);
  } else strokeTrack(ctx, tr, 0, th.road);
  // ligne de départ
  ctx.save(); ctx.translate(tr.sx[0], tr.sz[0]); ctx.rotate(Math.atan2(tr.tz[0], tr.tx[0]));
  const W = tr.half[0] * 2, q = W / 10; for (let r = 0; r < 10; r++) for (let k = 0; k < 2; k++) { ctx.fillStyle = (r + k) % 2 ? '#1c1c22' : '#f7f7f2'; ctx.fillRect(-q + k * q, -W / 2 + r * q, q + .5, q + .5); }
  ctx.restore();
  for (const L of tr.loops) { ctx.save(); ctx.translate(L.x, L.z); ctx.rotate(L.a); ctx.fillStyle = 'rgba(20,24,40,.28)'; ctx.fillRect(-L.R - 14, -44, 2 * L.R + L.adv + 28, L.shift + 88); ctx.restore(); }
  for (const p of tr.pads) {
    ctx.save(); ctx.translate(p.x, p.z); ctx.rotate(p.a);
    ctx.fillStyle = '#10b6f2'; ctx.fillRect(-p.len / 2, -p.w / 2, p.len, p.w); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.strokeRect(-p.len / 2, -p.w / 2, p.len, p.w);
    ctx.fillStyle = '#fffbe0'; for (let k = -1; k <= 1; k++) { const x = k * 26; ctx.beginPath(); ctx.moveTo(x - 12, -24); ctx.lineTo(x + 6, 0); ctx.lineTo(x - 12, 24); ctx.lineTo(x - 2, 24); ctx.lineTo(x + 16, 0); ctx.lineTo(x - 2, -24); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  for (const h of tr.hazards) {
    const col = HAZ_COL[h.kind]; ctx.fillStyle = col[0];
    for (const [ox, oz, k] of [[0, 0, 1], [.5, .35, .6], [-.45, .3, .5], [.1, -.5, .55]]) { ctx.beginPath(); ctx.arc(h.x + ox * h.r, h.z + oz * h.r, h.r * k, 0, TAU); ctx.fill(); }
    ctx.fillStyle = col[1]; ctx.beginPath(); ctx.arc(h.x - h.r * .25, h.z - h.r * .2, h.r * .4, 0, TAU); ctx.fill();
  }
}
function repaintGround(tr) {
  const c = groundCanvas.getContext('2d'); c.setTransform(groundCanvas.width / WW, 0, 0, groundCanvas.height / WH, 0, 0);
  paintGround(c, tr, groundCanvas.width, groundCanvas.height); groundTex.needsUpdate = true;
}

/* ---------- traces sur le sol (dérapages, brûlures, taches) ---------- */
function decalBlob(x, z, r, color, alpha) { const c = decalCtx, k = decalCanvas.width / WW; c.globalAlpha = alpha; c.fillStyle = color; c.beginPath(); c.arc(x * k, z * k, Math.max(.8, r * k), 0, TAU); c.fill(); c.globalAlpha = 1; decalDirty = true; }
function decalScorch(x, z, r) {
  const c = decalCtx, k = decalCanvas.width / WW, g = c.createRadialGradient(x * k, z * k, 0, x * k, z * k, r * k);
  g.addColorStop(0, 'rgba(12,10,8,.6)'); g.addColorStop(.55, 'rgba(25,18,12,.32)'); g.addColorStop(1, 'rgba(25,18,12,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x * k, z * k, r * k, 0, TAU); c.fill();
  for (let i = 0; i < 9; i++) { const a = Math.random() * TAU, d = r * (.5 + Math.random() * .7); decalBlob(x + Math.cos(a) * d, z + Math.sin(a) * d, 3 + Math.random() * 5, '#14100c', .35); }
  decalDirty = true;
}

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
  const shield = new THREE.Mesh(geoCache.sph || (geoCache.sph = new THREE.SphereGeometry(1, 14, 10)), new THREE.MeshBasicMaterial({ color: 0x7fe6ff, transparent: true, opacity: .3, depthWrite: false }));
  shield.scale.setScalar(54); shield.position.y = 22; shield.visible = false; root.add(shield);
  const ring = new THREE.Mesh(geoCache.ring || (geoCache.ring = new THREE.RingGeometry(40, 50, 30)), new THREE.MeshBasicMaterial({ color: colr.hex, transparent: true, opacity: .8, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2;
  return { root, shell, shellMat, wheels, shield, ring, hex: colr.hex };
}
function resetCarVis(v) { v.shell.visible = true; v.shell.rotation.set(0, 0, 0); v.shellMat.color.set(0xffffff); for (const w of v.wheels) w.g.visible = true; }
function syncCar(c, dt, time) {
  const v = c.vis, dead = c.dead > 0;
  v.root.visible = !dead && !(c.inv > 0 && Math.floor(time * 14) % 2 === 0); v.ring.visible = !dead;
  v.root.position.set(c.x, c.y + c.sus, c.z); v.ring.position.set(c.x, 1.2, c.z); v.ring.scale.setScalar(c.human ? 1.12 : .92);
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
  if (debris.length > 80) dynGroup.remove(debris.shift().o);
}
function flash(x, y, z, r, hex, dur, ring) {
  const m = ring ? new THREE.Mesh(geoCache.fring || (geoCache.fring = new THREE.RingGeometry(.82, 1, 40)), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }))
    : new THREE.Mesh(geoCache.sph, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: .9, depthWrite: false }));
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
  const m = new THREE.Mesh(geoCache.box, matCache.qMat || (matCache.qMat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x4a2a00 }))); m.scale.setScalar(30); m.castShadow = true; return m;
}
function makeWrenchVis() { const mt = new THREE.MeshLambertMaterial({ color: 0x35d873, emissive: 0x0b4a22 }); return shadowed(grp(boxMesh(32, 10, 10, mt, 0, 0, 0), boxMesh(10, 32, 10, mt, 0, 0, 0), boxMesh(10, 10, 14, lam(0xffffff), 0, 0, 0))); }
function makeMineVis() { const light = sphMesh(5, basic(0xff2a2a, 1), 0, 11, 0); const g = shadowed(grp(cylMesh(15, 18, 9, 12, lam(0x2a2d35), 0, 4.5, 0), light)); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.add(boxMesh(5, 4, 5, lam(0x8b9099), Math.cos(a) * 17, 4, Math.sin(a) * 17)); } g.userData.light = light; return g; }
function makeMissileVis(hex) {
  const body = cylMesh(4.5, 4.5, 24, 8, lam(0xf4f4f0), 0, 0, 0); body.rotation.z = -Math.PI / 2;
  const nose = cylMesh(.5, 4.5, 10, 8, lam(hex), 17, 0, 0); nose.rotation.z = -Math.PI / 2;
  return shadowed(grp(body, nose, boxMesh(8, 14, 1.5, lam(hex), -10, 0, 0), boxMesh(8, 1.5, 14, lam(hex), -10, 0, 0)));
}
function makeOilVis(r) { const m = new THREE.Mesh(geoCache.circ || (geoCache.circ = new THREE.CircleGeometry(1, 22)), basic(0x121318, .92)); m.rotation.x = -Math.PI / 2; m.scale.setScalar(r); m.renderOrder = 2; return m; }
function makePropVis(kind) { const m = new THREE.Mesh(geoCache['prop' + kind] || (geoCache['prop' + kind] = mergeGeo(propParts(kind))), vcMat()); m.castShadow = true; return m; }
function propParts(kind) {
  if (kind === 'cone') return (grp(cylMesh(2.5, 11, 28, 10, lam(0xff7a1a), 0, 15, 0), cylMesh(6.3, 8, 6, 10, lam(0xffffff), 0, 14, 0), boxMesh(26, 3, 26, lam(0xff7a1a), 0, 1.5, 0)));
  if (kind === 'tyre') { const g = new THREE.Group(); for (let i = 0; i < 3; i++) g.add(cylMesh(19, 19, 10, 14, lam(i === 1 ? 0x2c2e35 : 0x1d1e24), (i - 1) * 1.5, 5 + i * 10.5, 0)); g.add(cylMesh(9, 9, 1, 12, lam(0x0d0d10), 3, 31.6, 0)); return g; }
  if (kind === 'crate') return (grp(boxMesh(32, 32, 32, lam(0xc08a4c), 0, 16, 0), boxMesh(33, 5, 33, lam(0x8e5f2c), 0, 4, 0), boxMesh(33, 5, 33, lam(0x8e5f2c), 0, 28, 0)));
  return (grp(cylMesh(14, 14, 32, 14, lam(0xd92b2b), 0, 16, 0), cylMesh(14.6, 14.6, 4, 14, lam(0x2a2d35), 0, 9, 0), cylMesh(14.6, 14.6, 4, 14, lam(0x2a2d35), 0, 23, 0), cylMesh(8, 8, 1, 10, lam(0xffd24a), 0, 32.3, 0)));   // baril explosif
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

/* ---------- construction du monde d'un circuit ---------- */
function disposeGroup(g) { g.traverse(o => { if (o.isMesh && (o.userData.own || o.isInstancedMesh)) o.geometry.dispose(); }); }
function loadTrackWorld(tr) {
  if (worldGroup) { scene.remove(worldGroup); disposeGroup(worldGroup); }
  worldGroup = new THREE.Group(); scene.add(worldGroup);
  const th = tr.def.theme; outsideMat.color.set(th.outside); scene.background.set(th.sky);
  repaintGround(tr);
  const fm = lam(th.frame), T = 28;
  for (const f of [boxMesh(WW + 2 * T, T, T, fm, WW / 2, T / 2 - 2, -T / 2), boxMesh(WW + 2 * T, T, T, fm, WW / 2, T / 2 - 2, WH + T / 2), boxMesh(T, T, WH, fm, -T / 2, T / 2 - 2, WH / 2), boxMesh(T, T, WH, fm, WW + T / 2, T / 2 - 2, WH / 2)]) { f.castShadow = true; f.receiveShadow = true; worldGroup.add(f); }
  blockMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), tr.blocks.length);
  blockMesh.frustumCulled = false; blockMesh.castShadow = true; blockMesh.receiveShadow = true;
  tr.blocks.forEach((b, i) => { b.col = th.blocks[i % th.blocks.length]; b.alive = true; setBlockMatrix(tr, i); blockMesh.setColorAt(i, _c.set(b.col)); });
  worldGroup.add(blockMesh);
  for (const r of tr.ramps) worldGroup.add(makeRamp(r));
  for (const L of tr.loops) worldGroup.add(makeLoop(L));
  bumperVis = tr.bumpers.map(b => { const v = makeBumper(b); worldGroup.add(v.g); return v; });
  const R = seeded(4321 + tr.index * 97), list = DECO[tr.def.deco], placed = [], decoRoot = new THREE.Group();
  for (let k = 0; k < 700 && placed.length < 24; k++) {
    const x = 45 + R() * (WW - 90), z = 45 + R() * (WH - 90); nearestOn(tr, x, z);
    if (NEAR.d < tr.half[NEAR.i] + 70 || placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 105)) continue;
    if (tr.loops.some(L => Math.hypot(L.x - x, L.z - z) < 230)) continue;
    const o = list[Math.floor(R() * list.length)](); o.position.set(x, 0, z); o.rotation.y = R() * TAU; o.scale.setScalar(.8 + R() * .45); decoRoot.add(o); placed.push([x, z]);
  }
  for (const [x, z, s] of [[-170, 140, 2.2], [WW + 190, 620, 2.4], [330, -170, 2], [1380, WH + 200, 2.3], [WW + 160, 120, 1.8], [-150, 760, 2]]) {
    const o = list[Math.floor(R() * list.length)](); o.position.set(x, 0, z); o.rotation.y = R() * TAU; o.scale.setScalar(s); decoRoot.add(o);
  }
  const dm = merged(decoRoot); dm.userData.own = true; dm.receiveShadow = true; worldGroup.add(dm);
  resetTrackWorld(tr);
}
/* Remet le circuit à neuf avant chaque course. */
function resetTrackWorld(tr) {
  if (dynGroup) scene.remove(dynGroup);
  dynGroup = new THREE.Group(); scene.add(dynGroup);
  puffs.length = 0; debris.length = 0; flashes.length = 0;
  decalCtx.clearRect(0, 0, decalCanvas.width, decalCanvas.height); decalTex.needsUpdate = true; decalDirty = false;
  tr.blocks.forEach((b, i) => { b.alive = true; setBlockMatrix(tr, i); }); blockMesh.instanceMatrix.needsUpdate = true; if (blockMesh.instanceColor) blockMesh.instanceColor.needsUpdate = true;
}

/* ---------- mise à jour des effets ---------- */
function updateWorldFx(dt, time, tr) {
  let n = 0, ng = 0;
  for (let k = puffs.length - 1; k >= 0; k--) { const p = puffs[k]; p.life -= dt; if (p.life <= 0) { puffs.splice(k, 1); continue; } p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 2) { p.y = 2; p.vy *= -.3; } const d = 1 - 2.5 * dt; p.vx *= d; p.vz *= d; }
  for (const p of puffs) {
    const f = p.life / p.max, s = p.r * Math.min(1, (1 - f) * 7 + .25) * Math.min(1, f * 2.2);
    _e.set(p.rot, p.rot * 1.7, 0); _q.setFromEuler(_e); _p.set(p.x, p.y, p.z); _s.set(s, s, s);
    _m.compose(_p, _q, _s); _c.set(p.col);
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
  decalClock += dt; if (decalDirty && decalClock > .12) { decalTex.needsUpdate = true; decalDirty = false; decalClock = 0; }
}

/* ---------- caméra ---------- */
function fitRect(x0, z0, x1, z1, m) {
  const s = Math.sin(CAM.tilt), c = Math.cos(CAM.tilt), k1 = c / (m * CAM.tV) - s, k2 = c / (m * CAM.tV) + s, Hd = z1 - z0;
  const a = Hd * k2 / (k1 + k2), b = Hd - a;
  return { cx: (x0 + x1) / 2, cz: z0 + a, D: Math.max(a * k1, (x1 - x0) / 2 / (m * CAM.tH) + b * s) };
}
const WHOLE = { x0: -34, z0: -170, x1: WW + 34, z1: WH + 70 }, CLOSE = { x0: -320, z0: -470, x1: WW + 320, z1: WH + 330 };
function resizeWorld(CW, CH, VW, VH, rot, dpr) {
  renderer.setPixelRatio(dpr); renderer.setSize(CW, CH, false);
  const asp = VW / VH; CAM.VW = VW; CAM.VH = VH; CAM.rot = rot; CAM.tH = asp >= 1.6 ? .364 : .364 * asp / 1.6; CAM.tV = CAM.tH / asp;
  camera.fov = 2 * Math.atan(rot ? CAM.tH : CAM.tV) * 180 / Math.PI; camera.aspect = rot ? 1 / asp : asp; camera.updateProjectionMatrix();
  CAM.whole = fitRect(WHOLE.x0, WHOLE.z0, WHOLE.x1, WHOLE.z1, .98);
}
/* list = voitures à garder dans le cadre (vue rapprochée), ou null pour voir tout le circuit. */
function updateCamera(dt, list, snap, shakeAmt) {
  let t = CAM.whole;
  if (list && list.length) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const c of list) for (const k of [0, .5]) { const x = c.x + c.vx * k, z = c.z + c.vz * k; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    x0 -= 330; x1 += 330; z0 -= 300; z1 += 300;
    if (x1 - x0 < 1040) { const p = (1040 - (x1 - x0)) / 2; x0 -= p; x1 += p; }
    if (x1 - x0 < WHOLE.x1 - WHOLE.x0 - 80) {
      if (x0 < CLOSE.x0) { x1 += CLOSE.x0 - x0; x0 = CLOSE.x0; } if (x1 > CLOSE.x1) { x0 -= x1 - CLOSE.x1; x1 = CLOSE.x1; }
      if (z0 < CLOSE.z0) { z1 += CLOSE.z0 - z0; z0 = CLOSE.z0; } if (z1 > CLOSE.z1) { z0 -= z1 - CLOSE.z1; z1 = CLOSE.z1; }
      const f = fitRect(x0, z0, x1, z1, .98); if (f.D < CAM.whole.D) t = f;
    }
  }
  const k = snap ? 1 : 1 - Math.exp(-dt * 2.4);
  CAM.cx += (t.cx - CAM.cx) * k; CAM.cz += (t.cz - CAM.cz) * k; CAM.D += (t.D - CAM.D) * k;
  const sx = shakeAmt ? (Math.random() - .5) * shakeAmt : 0, sz = shakeAmt ? (Math.random() - .5) * shakeAmt : 0;
  camera.position.set(CAM.cx + sx, CAM.D * Math.cos(CAM.tilt), CAM.cz + sz + CAM.D * Math.sin(CAM.tilt));
  camera.up.set(0, 1, 0); camera.lookAt(CAM.cx + sx, 0, CAM.cz + sz);
  if (CAM.rot) camera.rotateZ(Math.PI / 2);
}
/* Position à l'écran (repère de la vue, avant rotation éventuelle) d'un point du monde. */
function projectToView(x, y, z, out) {
  const s = Math.sin(CAM.tilt), c = Math.cos(CAM.tilt), dx = x - CAM.cx, dz = z - CAM.cz, depth = CAM.D - y * c - dz * s;
  out.x = CAM.VW / 2 * (1 + dx / (depth * CAM.tH)); out.y = CAM.VH / 2 * (1 - (y * s - dz * c) / (depth * CAM.tV)); return out;
}
