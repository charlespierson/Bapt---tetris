'use strict';
/* Le circuit : un grand tracé (lignes droites, virages, trois boucles), trois raccourcis, barrières et éléments de piste.
   Le même tracé se joue dans quatre décors. */
const WW = 3600, WH = 2000, STEP = 1 / 120, TAU = Math.PI * 2, GRAV = 1300;
const CAR_R = 24, CAR_OFF = 19;                  // chaque voiture = 2 cercles de collision (avant / arrière)
const CAR_COLORS = [
  { fr: 'rouge', en: 'red', hex: 0xe5383b, css: '#e5383b' }, { fr: 'bleu', en: 'blue', hex: 0x2f6fed, css: '#2f6fed' },
  { fr: 'jaune', en: 'yellow', hex: 0xf6b40e, css: '#f6b40e' }, { fr: 'vert', en: 'green', hex: 0x2fb26a, css: '#2fb26a' },
];
const NEAR = { d: 0, i: 0 }, HIT = { m: 0, mainM: 0, mi: 0, d: 0, x: 0, z: 0, cut: -1, j: 0 };

function seeded(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Tracé principal, dans le sens des aiguilles d'une montre. Les éléments sont posés par coordonnées : ils s'accrochent
   au point le plus proche du tracé (lat = décalage vers la droite du pilote). */
const LAYOUT = {
  half: 100,
  pts: [
    [800, 200], [1250, 200], [1700, 200], [2100, 200],                                                            // ligne droite du départ (looping)
    [2420, 240], [2700, 430], [2980, 330], [3200, 300], [3340, 430],                                              // le S
    [3350, 680], [3315, 765], [3230, 800], [3080, 800], [2995, 835], [2960, 920], [2960, 1030], [2995, 1115], [3080, 1150], [3230, 1150], [3315, 1185], [3350, 1270],   // boucle 1
    [3350, 1450], [3350, 1620], [3297, 1747], [3170, 1800], [2950, 1800],                                         // virage, tremplin
    [2620, 1800], [2535, 1765], [2500, 1680], [2500, 1460], [2500, 1240], [2459, 1141], [2360, 1100], [2225, 1100], [2090, 1100], [1991, 1141], [1950, 1240], [1950, 1460], [1950, 1680], [1915, 1765], [1830, 1800],   // boucle 2
    [1500, 1800], [1100, 1800], [700, 1800], [430, 1800], [303, 1747], [250, 1620],                               // ligne droite du bas (bumpers), virage
    [250, 1560], [285, 1475], [370, 1440], [650, 1440], [950, 1440], [1230, 1440], [1336, 1396], [1380, 1290], [1380, 1100], [1380, 900], [1336, 794], [1230, 750], [950, 750], [650, 750], [370, 750], [285, 715], [250, 630],   // boucle 3
    [250, 480], [250, 380], [303, 253], [430, 200],
  ],
  wide: [{ p: [1375, 200], len: 170, extra: 22 }, { p: [1100, 1800], len: 270, extra: 45 }],
  loops: [{ p: [1300, 200] }],
  pads: [{ p: [1060, 200], lat: -50 }, { p: [900, 750], lat: 0 }],
  ramps: [{ p: [3020, 1800], w: 160 }],
  bumpers: [{ p: [1250, 1800], lat: -58 }, { p: [1100, 1800], lat: 58 }, { p: [950, 1800], lat: -58 }],
  boxes: [[2420, 240], [3350, 1400], [1620, 1800], [800, 1440]],
  hazards: [{ p: [2960, 975], lat: 20, r: 46 }, { p: [2225, 1100], lat: -25, r: 46 }, { p: [1380, 1100], lat: 20, r: 44 }],
  props: [{ p: [3340, 430], lat: -72, kind: 'tyre' }, { p: [3297, 1747], lat: -74, kind: 'tyre' }, { p: [2500, 1460], lat: -60, kind: 'crate' }, { p: [1950, 1460], lat: 58, kind: 'crate' },
    { p: [2360, 1100], lat: -66, kind: 'barrel' }, { p: [1380, 1290], lat: -66, kind: 'barrel' }, { p: [950, 1440], lat: 10, kind: 'cone' }, { p: [650, 750], lat: -30, kind: 'cone' }, { p: [1700, 200], lat: 62, kind: 'crate' }],
  /* Raccourcis : ils coupent tout droit à travers l'intérieur d'une boucle. cost = part de la jauge de boost consommée. */
  cuts: [
    { pts: [[3350, 640], [3350, 1310]], cost: .5 },
    { pts: [[2670, 1800], [1780, 1800]], cost: .75 },
    { pts: [[250, 1610], [250, 580]], cost: 1 },
  ],
};

const THEMES = [
  { key: 'sand', name: { fr: 'Bac à sable', en: 'Sandbox' }, deco: 'sand', grip: 9, style: 'dirt', haz: ['water', 'water', 'water'],
    theme: { outside: 0x8b6c47, frame: 0xa9773f, ground: '#ecd7a6', road: '#c9a56b', kerb: '#b98f55', kerbDark: '#8c6a3c', cut: '#a37f49', dust: 0xe6cf9c, blocks: [0xe5383b, 0x2f6fed, 0xf6b40e, 0x2fb26a], sky: 0x9fd4f5 } },
  { key: 'garden', name: { fr: 'Jardin', en: 'Garden' }, deco: 'garden', grip: 10, style: 'dirt', haz: ['mud', 'water', 'mud'],
    theme: { outside: 0x478a41, frame: 0x8a5a2b, ground: '#7fbf6a', road: '#d4b78d', kerb: '#bf9c6f', kerbDark: '#7c5f3c', cut: '#9c7f55', dust: 0xd8c19a, blocks: [0xf4f1ea, 0xc8643c], sky: 0xa9dcf7 } },
  { key: 'dirt', name: { fr: 'Piste de terre', en: 'Dirt track' }, deco: 'dirt', grip: 9.5, style: 'dirt', haz: ['mud', 'mud', 'water'],
    theme: { outside: 0x7a4f2e, frame: 0x4a2f1a, ground: '#c98a55', road: '#7a4f30', kerb: '#6f4829', kerbDark: '#3f2714', cut: '#5a3a22', dust: 0xb98660, blocks: [0xe23b3b, 0xf6f4ee], sky: 0xf1cfa5 } },
  { key: 'parking', name: { fr: 'Parking', en: 'Car park' }, deco: 'parking', grip: 11.5, style: 'asphalt', haz: ['oil', 'oil', 'oil'],
    theme: { outside: 0x33373f, frame: 0xf2c230, ground: '#4b5059', road: '#6a707a', kerb: '#d8d8d2', kerbDark: '#2a2c31', cut: '#3a3e47', dust: 0xc9ccd2, blocks: [0xff7a1a, 0xf6f4ee], sky: 0x9fb2c6 } },
];

function nearestOn(tr, x, z) {
  let b = 1e18, bi = 0; const sx = tr.sx, sz = tr.sz, n = tr.N;
  for (let i = 0; i < n; i++) { const dx = sx[i] - x, dz = sz[i] - z, d = dx * dx + dz * dz; if (d < b) { b = d; bi = i; } }
  NEAR.d = Math.sqrt(b); NEAR.i = bi; return NEAR;
}
/* Où est-on par rapport à la surface roulable (piste + raccourcis) ? m < 0 : dedans, à |m| du bord ; m > 0 : dehors.
   x, z = le point du tracé le plus proche ; cut = numéro du raccourci si c'est lui le plus proche, sinon -1 ;
   mainM et mi = marge et point le plus proche pour la piste seule. */
function trackHit(tr, x, z) {
  nearestOn(tr, x, z);
  HIT.m = HIT.mainM = NEAR.d - tr.half[NEAR.i]; HIT.d = NEAR.d; HIT.x = tr.sx[NEAR.i]; HIT.z = tr.sz[NEAR.i]; HIT.cut = -1; HIT.j = HIT.mi = NEAR.i;
  for (const c of tr.cuts) {
    if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
    let b = 1e18, bj = 0; for (let j = 0; j < c.M; j++) { const dx = c.sx[j] - x, dz = c.sz[j] - z, d = dx * dx + dz * dz; if (d < b) { b = d; bj = j; } }
    const d = Math.sqrt(b), m = d - c.half;
    if (m < HIT.m) { HIT.m = m; HIT.d = d; HIT.x = c.sx[bj]; HIT.z = c.sz[bj]; HIT.cut = c.k; HIT.j = bj; }
  }
  return HIT;
}

/* Point d'un looping : th de 0 à 2π ; la boucle monte devant l'entrée, redescend derrière, et se décale sur le côté. */
function loopPoint(L, th, lat, out) {
  const al = L.R * Math.sin(th) + L.adv * th / TAU, la = L.shift * th / TAU + lat;
  out.x = L.x + L.ca * al - L.sa * la; out.y = L.R * (1 - Math.cos(th)); out.z = L.z + L.sa * al + L.ca * la; return out;
}

function buildTrack(def, index) {
  const P = LAYOUT.pts, n = P.length, raw = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t, pt = [0, 0];
      for (let c = 0; c < 2; c++) pt[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
      raw.push(pt);
    }
  }
  const m = raw.length, cum = [0];
  for (let i = 0; i < m; i++) { const a = raw[i], b = raw[(i + 1) % m]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = cum[m], N = Math.round(L / 8), step = L / N;
  const sx = new Float32Array(N), sz = new Float32Array(N), tx = new Float32Array(N), tz = new Float32Array(N), half = new Float32Array(N).fill(LAYOUT.half);
  let seg = 0;
  for (let i = 0; i < N; i++) {
    const d = i * step; while (cum[seg + 1] < d) seg++;
    const f = (d - cum[seg]) / (cum[seg + 1] - cum[seg] || 1), a = raw[seg], b = raw[(seg + 1) % m];
    sx[i] = a[0] + (b[0] - a[0]) * f; sz[i] = a[1] + (b[1] - a[1]) * f;
  }
  for (let i = 0; i < N; i++) { const p = (i - 1 + N) % N, q = (i + 1) % N, dx = sx[q] - sx[p], dz = sz[q] - sz[p], l = Math.hypot(dx, dz) || 1; tx[i] = dx / l; tz[i] = dz / l; }
  const tr = { def, index, N, L, sx, sz, tx, tz, half, cuts: [] };
  const at = (p, lat) => { nearestOn(tr, p[0], p[1]); const i = NEAR.i, ca = tx[i], sa = tz[i]; lat = lat || 0; return { i, lat, x: sx[i] - sa * lat, z: sz[i] + ca * lat, a: Math.atan2(sa, ca), ca, sa }; };
  tr.at = at;
  for (const w of LAYOUT.wide) { const c = at(w.p).i, k = Math.round(w.len / 8); for (let d = -k; d <= k; d++) half[((c + d) % N + N) % N] += w.extra * .5 * (1 + Math.cos(Math.PI * d / k)); }

  // raccourcis : une ligne brisée rééchantillonnée ; g0..g1 = la partie située hors de la piste principale
  tr.cuts = LAYOUT.cuts.map((c, k) => {
    const pts = []; for (let s = 0; s < c.pts.length - 1; s++) { const a = c.pts[s], b = c.pts[s + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), q = Math.max(1, Math.round(len / 8)); for (let j = s ? 1 : 0; j <= q; j++) pts.push([a[0] + (b[0] - a[0]) * j / q, a[1] + (b[1] - a[1]) * j / q]); }
    const M = pts.length, cu = { k, cost: c.cost, half: 70, M, sx: new Float32Array(M), sz: new Float32Array(M), tx: new Float32Array(M), tz: new Float32Array(M), g0: -1, g1: -1 };
    for (let j = 0; j < M; j++) { cu.sx[j] = pts[j][0]; cu.sz[j] = pts[j][1]; }
    for (let j = 0; j < M; j++) { const p = Math.max(0, j - 1), q = Math.min(M - 1, j + 1), dx = cu.sx[q] - cu.sx[p], dz = cu.sz[q] - cu.sz[p], l = Math.hypot(dx, dz) || 1; cu.tx[j] = dx / l; cu.tz[j] = dz / l; }
    cu.iA = at(c.pts[0]).i; cu.iB = at(c.pts[c.pts.length - 1]).i;
    for (let j = 0; j < M; j++) { nearestOn(tr, cu.sx[j], cu.sz[j]); if (NEAR.d > half[NEAR.i] + 6) { if (cu.g0 < 0) cu.g0 = j; cu.g1 = j; } }
    cu.x0 = Math.min(cu.sx[0], cu.sx[M - 1]) - 160; cu.x1 = Math.max(cu.sx[0], cu.sx[M - 1]) + 160; cu.z0 = Math.min(cu.sz[0], cu.sz[M - 1]) - 160; cu.z1 = Math.max(cu.sz[0], cu.sz[M - 1]) + 160;
    return cu;
  });

  tr.ramps = LAYOUT.ramps.map(r => Object.assign(at(r.p, r.lat), { w: r.w || 150, len: 72, h: 24 }));
  tr.pads = LAYOUT.pads.map(r => Object.assign(at(r.p, r.lat), { w: 70, len: 84 }));
  tr.bumpers = LAYOUT.bumpers.map(r => Object.assign(at(r.p, r.lat), { r: 24, pulse: 0 }));
  tr.loops = LAYOUT.loops.map(r => Object.assign(at(r.p, -50), { R: 85, shift: 100, adv: 60 }));
  tr.hazards = LAYOUT.hazards.map((r, k) => Object.assign(at(r.p, r.lat), { r: r.r, kind: def.haz[k % def.haz.length] }));
  tr.propSpots = LAYOUT.props.map(r => Object.assign(at(r.p, r.lat), { kind: r.kind }));
  tr.boxSpots = []; for (const p of LAYOUT.boxes) for (const lat of [-58, 0, 58]) tr.boxSpots.push(at(p, lat));
  tr.obst = tr.bumpers.map(b => ({ i: b.i, lat: b.lat })).concat(tr.hazards.map(h => ({ i: h.i, lat: h.lat })));
  tr.grid = slot => { const i = N - 9 - 13 * (slot >> 1), lat = (slot % 2 ? 1 : -1) * 46; return { i, x: sx[i] - tz[i] * lat, z: sz[i] + tx[i] * lat, a: Math.atan2(tz[i], tx[i]) }; };

  // barrières : des blocs le long des bords de la piste et des raccourcis, sauf là où deux portions se rejoignent
  tr.blocks = [];
  const edge = (ex, ez, etx, etz, hw, cnt, closed) => {
    for (const s of [-1, 1]) {
      let last = null;
      for (let i = 0; i <= (closed ? cnt : cnt - 1); i++) {
        const j = i % cnt, w = (typeof hw === 'number' ? hw : hw[j]) + 8, px = ex[j] - etz[j] * s * w, pz = ez[j] + etx[j] * s * w;
        if (trackHit(tr, px, pz).m < 6 || px < 12 || px > WW - 12 || pz < 12 || pz > WH - 12) { last = null; continue; }
        if (!last) { last = [px, pz]; continue; }
        const dx = px - last[0], dz = pz - last[1], d = Math.hypot(dx, dz);
        if (d >= 26) { tr.blocks.push({ x: (px + last[0]) / 2, z: (pz + last[1]) / 2, a: Math.atan2(dz, dx), len: d, alive: true }); last = [px, pz]; }
      }
    }
  };
  edge(sx, sz, tx, tz, half, N, true);
  for (const cu of tr.cuts) edge(cu.sx, cu.sz, cu.tx, cu.tz, cu.half, cu.M, false);
  return tr;
}
const TRACKS = THEMES.map(buildTrack);
