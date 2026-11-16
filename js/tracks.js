'use strict';
/* Circuits : tracés, largeur variable, barrières et éléments de piste (tremplins, bumpers, loopings, caisses, pièges). */
const WW = 1800, WH = 900, STEP = 1 / 120, TAU = Math.PI * 2, GRAV = 1300;
const CAR_R = 24, CAR_OFF = 19;                  // chaque voiture = 2 cercles de collision (avant / arrière)
const CAR_COLORS = [
  { name: 'Rouge', hex: 0xe5383b, css: '#e5383b' }, { name: 'Bleu', hex: 0x2f6fed, css: '#2f6fed' },
  { name: 'Jaune', hex: 0xf6b40e, css: '#f6b40e' }, { name: 'Vert', hex: 0x2fb26a, css: '#2fb26a' },
];
const NEAR = { d: 0, i: 0 };

function seeded(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function figure8() { const p = []; for (let k = 0; k < 16; k++) { const t = Math.PI / 2 + k * TAU / 16; p.push([900 + 690 * Math.sin(t), 450 + 325 * Math.sin(2 * t)]); } return p; }

/* Les éléments sont posés par coordonnées : ils s'accrochent au point le plus proche du tracé (lat = décalage vers la droite du pilote). */
const TRACK_DEFS = [
  { name: 'Bac à sable', deco: 'sand', half: 95, grip: 4.4,
    theme: { outside: 0x7d6140, frame: 0xa9773f, ground: '#ecd7a6', road: '#cfae75', kerb: '#c9a56b', kerbDark: '#8c6a3c', dust: 0xe6cf9c, blocks: [0xe5383b, 0x2f6fed, 0xf6b40e, 0x2fb26a], sky: 0x6f5a3e },
    pts: [[600, 140], [1000, 140], [1400, 140], [1640, 300], [1640, 610], [1400, 775], [1130, 775], [900, 520], [670, 775], [400, 775], [200, 610], [200, 300], [380, 140]],
    wide: [{ p: [200, 450], len: 230, extra: 50 }, { p: [1010, 125], len: 150, extra: 22 }],
    loops: [{ p: [960, 125] }], pads: [{ p: [800, 125], lat: -45 }, { p: [520, 775], lat: 0 }],
    ramps: [{ p: [1640, 400], w: 150 }],
    bumpers: [{ p: [200, 545], lat: -55 }, { p: [200, 450], lat: 55 }, { p: [200, 355], lat: -55 }],
    boxes: [[1290, 775], [1500, 170]],
    hazards: [{ p: [760, 680], lat: 20, r: 42, kind: 'water' }, { p: [1035, 670], lat: -25, r: 40, kind: 'water' }],
    props: [{ p: [1560, 700], lat: 62, kind: 'tyre' }, { p: [1590, 660], lat: 68, kind: 'tyre' }, { p: [430, 775], lat: -55, kind: 'crate' }, { p: [300, 710], lat: 60, kind: 'crate' },
      { p: [900, 520], lat: -70, kind: 'cone' }, { p: [860, 560], lat: -72, kind: 'cone' }, { p: [940, 560], lat: -72, kind: 'cone' }, { p: [1250, 125], lat: 60, kind: 'barrel' }, { p: [600, 775], lat: 62, kind: 'barrel' }] },

  { name: 'Jardin', deco: 'garden', half: 95, grip: 5.2,
    theme: { outside: 0x3b7436, frame: 0x8a5a2b, ground: '#7fbf6a', road: '#d4b78d', kerb: '#bf9c6f', kerbDark: '#7c5f3c', dust: 0xd8c19a, blocks: [0xf4f1ea, 0xc8643c], sky: 0x3c6b3a },
    pts: figure8(),
    wide: [{ p: [210, 450], len: 260, extra: 55 }],
    ramps: [{ p: [1024, 333], w: 150 }], pads: [{ p: [1120, 243], lat: 0 }, { p: [1130, 660], lat: 0 }],
    bumpers: [{ p: [215, 530], lat: 50 }, { p: [212, 450], lat: -60 }, { p: [215, 370], lat: 50 }],
    boxes: [[1420, 755], [420, 130]],
    hazards: [{ p: [1500, 190], lat: -30, r: 44, kind: 'mud' }, { p: [600, 665], lat: 25, r: 44, kind: 'mud' }, { p: [1250, 700], lat: -40, r: 38, kind: 'water' }],
    props: [{ p: [330, 180], lat: 55, kind: 'crate' }, { p: [300, 730], lat: -55, kind: 'crate' }, { p: [1300, 210], lat: -62, kind: 'barrel' }, { p: [700, 265], lat: 62, kind: 'barrel' },
      { p: [760, 590], lat: -68, kind: 'cone' }, { p: [1040, 590], lat: 68, kind: 'cone' }, { p: [760, 310], lat: 68, kind: 'cone' }, { p: [1560, 330], lat: 65, kind: 'tyre' }] },

  { name: 'Piste de terre', deco: 'dirt', half: 95, grip: 4.6,
    theme: { outside: 0x5f3d22, frame: 0x4a2f1a, ground: '#c98a55', road: '#7a4f30', kerb: '#6f4829', kerbDark: '#3f2714', dust: 0xb98660, blocks: [0xe23b3b, 0xf6f4ee], sky: 0x4d3320 },
    pts: [[520, 140], [900, 140], [1280, 140], [1500, 140], [1670, 280], [1670, 630], [1500, 775], [1300, 775], [1150, 700], [1100, 560], [1000, 455], [800, 455], [700, 560], [650, 700], [500, 775], [330, 775], [200, 630], [200, 280], [330, 140]],
    wide: [{ p: [900, 455], len: 170, extra: 40 }, { p: [1010, 125], len: 150, extra: 22 }],
    loops: [{ p: [960, 125] }], pads: [{ p: [790, 125], lat: -45 }, { p: [200, 560], lat: 0 }],
    ramps: [{ p: [1670, 345], w: 150 }],
    bumpers: [{ p: [960, 455], lat: -52 }, { p: [860, 455], lat: 52 }],
    boxes: [[1400, 775], [410, 775]],
    hazards: [{ p: [1110, 590], lat: 10, r: 42, kind: 'mud' }, { p: [200, 400], lat: -35, r: 46, kind: 'mud' }, { p: [660, 660], lat: -15, r: 40, kind: 'water' }],
    props: [{ p: [1640, 690], lat: -66, kind: 'barrel' }, { p: [1600, 725], lat: -66, kind: 'tyre' }, { p: [1340, 125], lat: 60, kind: 'tyre' }, { p: [1380, 125], lat: 64, kind: 'tyre' },
      { p: [570, 760], lat: 60, kind: 'crate' }, { p: [250, 720], lat: -60, kind: 'crate' }, { p: [240, 200], lat: -60, kind: 'barrel' }, { p: [1230, 760], lat: -60, kind: 'cone' }, { p: [1180, 735], lat: -62, kind: 'cone' }] },

  { name: 'Parking', deco: 'parking', half: 95, grip: 7.5,
    theme: { outside: 0x1f2227, frame: 0xf2c230, ground: '#4b5059', road: '#6a707a', kerb: '#d8d8d2', kerbDark: '#2a2c31', dust: 0xc9ccd2, blocks: [0xff7a1a, 0xf6f4ee], sky: 0x2a2e36 },
    pts: [[1100, 125], [1450, 125], [1670, 280], [1670, 620], [1480, 775], [1260, 775], [1150, 590], [1000, 455], [850, 590], [740, 775], [520, 775], [330, 775], [200, 620], [200, 300], [300, 140], [430, 150], [520, 330], [650, 440], [780, 330], [870, 150], [980, 125]],
    wide: [{ p: [200, 480], len: 150, extra: 22 }],
    loops: [{ p: [200, 540] }], pads: [{ p: [1300, 125], lat: 0 }, { p: [1370, 775], lat: 0 }],
    ramps: [{ p: [1670, 350], w: 150 }],
    bumpers: [{ p: [690, 775], lat: 48 }, { p: [580, 775], lat: -48 }],
    boxes: [[1420, 125], [440, 775]],
    hazards: [{ p: [1000, 455], lat: 10, r: 40, kind: 'oil' }, { p: [650, 440], lat: -20, r: 38, kind: 'oil' }, { p: [1590, 720], lat: -30, r: 40, kind: 'oil' }],
    props: [{ p: [1150, 590], lat: 66, kind: 'cone' }, { p: [1125, 545], lat: 66, kind: 'cone' }, { p: [850, 590], lat: 66, kind: 'cone' }, { p: [875, 545], lat: 66, kind: 'cone' },
      { p: [520, 330], lat: 66, kind: 'barrel' }, { p: [780, 330], lat: 66, kind: 'barrel' }, { p: [1560, 180], lat: 62, kind: 'tyre' }, { p: [1260, 775], lat: 60, kind: 'crate' }, { p: [300, 760], lat: -58, kind: 'crate' }] },
];

function nearestOn(tr, x, z) {
  let b = 1e18, bi = 0; const sx = tr.sx, sz = tr.sz, n = tr.N;
  for (let i = 0; i < n; i++) { const dx = sx[i] - x, dz = sz[i] - z, d = dx * dx + dz * dz; if (d < b) { b = d; bi = i; } }
  NEAR.d = Math.sqrt(b); NEAR.i = bi; return NEAR;
}

/* Point d'un looping : th de 0 à 2π ; la boucle monte devant l'entrée, redescend derrière, et se décale sur le côté. */
function loopPoint(L, th, lat, out) {
  const al = L.R * Math.sin(th) + L.adv * th / TAU, la = L.shift * th / TAU + lat;
  out.x = L.x + L.ca * al - L.sa * la; out.y = L.R * (1 - Math.cos(th)); out.z = L.z + L.sa * al + L.ca * la; return out;
}

function buildTrack(def, index) {
  const P = def.pts, n = P.length, raw = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t, pt = [0, 0];
      for (let c = 0; c < 2; c++) pt[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
      raw.push(pt);
    }
  }
  const m = raw.length, cum = [0];
  for (let i = 0; i < m; i++) { const a = raw[i], b = raw[(i + 1) % m]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = cum[m], N = Math.round(L / 8), step = L / N;
  const sx = new Float32Array(N), sz = new Float32Array(N), tx = new Float32Array(N), tz = new Float32Array(N), half = new Float32Array(N).fill(def.half);
  let seg = 0;
  for (let i = 0; i < N; i++) {
    const d = i * step; while (cum[seg + 1] < d) seg++;
    const f = (d - cum[seg]) / (cum[seg + 1] - cum[seg] || 1), a = raw[seg], b = raw[(seg + 1) % m];
    sx[i] = a[0] + (b[0] - a[0]) * f; sz[i] = a[1] + (b[1] - a[1]) * f;
  }
  for (let i = 0; i < N; i++) { const p = (i - 1 + N) % N, q = (i + 1) % N, dx = sx[q] - sx[p], dz = sz[q] - sz[p], l = Math.hypot(dx, dz) || 1; tx[i] = dx / l; tz[i] = dz / l; }
  const tr = { def, index, N, L, sx, sz, tx, tz, half };
  const at = (p, lat) => { nearestOn(tr, p[0], p[1]); const i = NEAR.i, ca = tx[i], sa = tz[i]; lat = lat || 0; return { i, lat, x: sx[i] - sa * lat, z: sz[i] + ca * lat, a: Math.atan2(sa, ca), ca, sa }; };
  tr.at = at;
  for (const w of def.wide || []) { const c = at(w.p).i, k = Math.round(w.len / 8); for (let d = -k; d <= k; d++) half[((c + d) % N + N) % N] += w.extra * .5 * (1 + Math.cos(Math.PI * d / k)); }

  tr.ramps = (def.ramps || []).map(r => Object.assign(at(r.p, r.lat), { w: r.w || 150, len: 72, h: 24 }));
  tr.pads = (def.pads || []).map(r => Object.assign(at(r.p, r.lat), { w: 70, len: 84 }));
  tr.bumpers = (def.bumpers || []).map(r => Object.assign(at(r.p, r.lat), { r: 24, pulse: 0 }));
  tr.loops = (def.loops || []).map(r => Object.assign(at(r.p, -50), { R: 85, shift: 100, adv: 60 }));
  tr.hazards = (def.hazards || []).map(r => Object.assign(at(r.p, r.lat), { r: r.r, kind: r.kind }));
  tr.propSpots = (def.props || []).map(r => Object.assign(at(r.p, r.lat), { kind: r.kind }));
  tr.boxSpots = []; for (const p of def.boxes || []) for (const lat of [-56, 0, 56]) tr.boxSpots.push(at(p, lat));
  tr.obst = tr.bumpers.map(b => ({ i: b.i, lat: b.lat })).concat(tr.hazards.map(h => ({ i: h.i, lat: h.lat })));
  tr.grid = slot => { const i = N - 9 - 13 * (slot >> 1), lat = (slot % 2 ? 1 : -1) * 44; return { i, x: sx[i] - tz[i] * lat, z: sz[i] + tx[i] * lat, a: Math.atan2(tz[i], tx[i]) }; };

  // barrières : des blocs posés le long des deux bords, sauf là où deux portions de piste se rejoignent ou se croisent
  tr.blocks = [];
  for (const s of [-1, 1]) {
    let last = null;
    for (let i = 0; i <= N; i++) {
      const j = i % N, px = sx[j] - tz[j] * s * (half[j] + 8), pz = sz[j] + tx[j] * s * (half[j] + 8);
      nearestOn(tr, px, pz);
      if (NEAR.d < half[NEAR.i] + 6 || px < 12 || px > WW - 12 || pz < 12 || pz > WH - 12) { last = null; continue; }
      if (!last) { last = [px, pz]; continue; }
      const dx = px - last[0], dz = pz - last[1], d = Math.hypot(dx, dz);
      if (d >= 26) { tr.blocks.push({ x: (px + last[0]) / 2, z: (pz + last[1]) / 2, a: Math.atan2(dz, dx), len: d, alive: true }); last = [px, pz]; }
    }
  }
  return tr;
}
const TRACKS = TRACK_DEFS.map(buildTrack);
