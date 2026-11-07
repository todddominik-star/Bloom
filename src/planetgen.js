// The planet generator: from a seed and the planet's number, write a planet description in the
// same shape as Ember's (planet.js). Everything after Ember comes from here.
//
// The recipe follows Ember: four raw materials play the parts A, B (early, near home), C and D
// (later, farther out). Costs are Ember's costs with each material swapped for the planet's
// own, and they grow a little with every planet.
import { MATERIALS } from './materials.js';

const NAMES = ['Verdis', 'Kalo', 'Osmund', 'Tessaly', 'Nimbra', 'Quill', 'Saffra', 'Lumen', 'Orrin', 'Pella', 'Corvi', 'Mireth'];
// how each planet looks: dead ground, living ground, the river (dead / alive), plants
export const LOOKS = {
  ember: { dead: ['#994d33', '#b86645', '#663021'], grass: ['#4da833', '#73c742'], lava: ['#c7211f', '#fa6b52'], water: ['#3694e6', '#f2faff'], rim: '#6b3b2a', under: '#4a2a22', leaves: ['#3fae5a', '#4cbc63', '#36a052'], deco: '#5cbf45', pebble: '#8e5a45', river: 'lava' },
  teal:  { dead: ['#5b5470', '#7a7090', '#3c3650'], grass: ['#2fa89a', '#56cdb8'], lava: ['#7fd13a', '#d6ff6a'], water: ['#2e8fd6', '#eafcff'], rim: '#4a4460', under: '#2f2b40', leaves: ['#2bb3a0', '#3fc7b1', '#239c8b'], deco: '#45c4b0', pebble: '#6a6280', river: 'acid' },
  dusk:  { dead: ['#3f4a6b', '#5d6890', '#2a3150'], grass: ['#b065c9', '#d68fe0'], lava: ['#ff7a2e', '#ffc06b'], water: ['#4a7fe0', '#f0f4ff'], rim: '#363e5c', under: '#232840', leaves: ['#a65bd1', '#c07de0', '#8f47bd'], deco: '#c27ad6', pebble: '#55608a', river: 'lava' },
  sand:  { dead: ['#a8814f', '#c9a36a', '#7a5a33'], grass: ['#8fb83a', '#b8d65a'], lava: ['#4a2c5e', '#8a5cb0'], water: ['#3aa3c9', '#f2fdff'], rim: '#8a6640', under: '#5a4229', leaves: ['#7fae2e', '#98c442', '#6b9a24'], deco: '#a3c94a', pebble: '#9a7a4e', river: 'tar' },
};

// try seeds until maxing every bubble really covers the whole planet (almost always the first)
export function generatePlanet(seed, index) {
  let P = null;
  for (let a = 0; a < 8; a++) {
    P = makePlanet(seed + a * 7777, index);
    const R = P.generators[0].radii[3] - 0.6;
    let full = true;
    for (let x = -P.radius; x <= P.radius && full; x += 2) for (let z = -P.radius; z <= P.radius; z += 2)
      if (Math.hypot(x, z) <= P.radius && !P.generators.some((g) => Math.hypot(g.x - x, g.z - z) < R)) { full = false; break; }
    if (full) return P;
  }
  return P;
}

function makePlanet(seed, index) {
  let s = (seed * 9301 + 49297) % 2147483647 || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const scale = 1 + 0.25 * index;
  const sc = (cost) => { const o = {}; for (const [m, n] of Object.entries(cost)) o[m] = MATERIALS[m] && MATERIALS[m].stage > 0 ? n : Math.round(n * scale); return o; };

  // ---- materials: A and B are easy (tool level 1), C needs at most level 2, D anything
  const easy = shuffle(['wood', 'stone', 'redCrystal']);
  const A = easy[0], B = easy[1];
  const midPool = shuffle([easy[2], 'ice', 'mushroom', 'gold'].filter((m) => m !== A && m !== B));
  const C = midPool[0];
  const D = shuffle(['gold', 'blueCrystal', 'ice', 'mushroom'].filter((m) => m !== C))[0];
  const roles = { A, B, C, D };
  const R = (cost) => { const o = {}; for (const [k, n] of Object.entries(cost)) o[roles[k] || k] = (o[roles[k] || k] || 0) + n; return sc(o); };

  const radius = 92 + Math.floor(rnd() * 8);
  const lookName = pick(['teal', 'dusk', 'sand', 'teal', 'dusk']);
  const name = NAMES[Math.floor(rnd() * NAMES.length)];

  // ---- the start and the home cluster (Ember's layout, turned to face this start)
  const sa = rnd() * Math.PI * 2, sd = radius * 0.62;
  const start = { x: Math.cos(sa) * sd, z: Math.sin(sa) * sd };
  const EMBER_START_A = Math.atan2(57, -28);
  const rot = sa - EMBER_START_A, cr = Math.cos(rot), sr = Math.sin(rot);
  const fromStart = (ox, oz) => ({ x: start.x + ox * cr - oz * sr, z: start.z + ox * sr + oz * cr });
  // Ember offsets from its start (-28, 57)
  const home = fromStart(4, -5), shedP = fromStart(-4, -11), benchP = fromStart(11, -1), rocketP = fromStart(-8, 7);
  // the hut sits beside the rocket, on screen to its right so it's in view at launch
  const hutP = { x: rocketP.x + 5.6, z: rocketP.z - 1.2 };

  // ---- the river: crosses the planet between home and the far side, sometimes cutting off
  // only a smaller piece, turned a bit, with bends
  const nx = -Math.cos(sa), nz = -Math.sin(sa);           // from the start toward the far side
  let off = (rnd() * 0.55 - 0.1) * radius;                 // where along that line it crosses
  const turn = (rnd() - 0.5) * 1.0;
  const tnx = nx * Math.cos(turn) - nz * Math.sin(turn), tnz = nx * Math.sin(turn) + nz * Math.cos(turn);
  const tx = -tnz, tz = tnx;                                // the river runs along this
  const width = 6 + Math.floor(rnd() * 3);
  const bendA = 5 + rnd() * 8, bendF = 0.025 + rnd() * 0.03, bendP = rnd() * 6;
  let riverPts;
  const distTo = (pts, x, z) => { let b = 1e9; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); b = Math.min(b, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return b; };
  for (let tries = 0; tries < 12; tries++) {
    riverPts = [];
    for (let u = -radius * 1.25; u <= radius * 1.25 + 0.1; u += radius * 0.25) {
      const b = Math.sin(u * bendF + bendP) * bendA;
      riverPts.push([+(tnx * off + tx * u + tnx * b).toFixed(1), +(tnz * off + tz * u + tnz * b).toFixed(1)]);
    }
    // keep home well clear of the river
    const worst = Math.min(distTo(riverPts, start.x, start.z), distTo(riverPts, rocketP.x, rocketP.z), distTo(riverPts, shedP.x, shedP.z), distTo(riverPts, home.x, home.z));
    if (worst > 26) break;
    off += 8;
  }
  const side = (x, z) => { // +1 home side, -1 far side
    let best = 1e9, sgn = 1;
    for (let i = 0; i < riverPts.length - 1; i++) { const [ax, az] = riverPts[i], [bx, bz] = riverPts[i + 1]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); const d = Math.hypot(x - ax - dx * t, z - az - dz * t); if (d < best) { best = d; sgn = Math.sign(dx * (z - az) - dz * (x - ax)) || 1; } }
    return sgn;
  };
  const homeSide = side(start.x, start.z);
  const onHome = (x, z) => side(x, z) === homeSide;
  const riverD = (x, z) => distTo(riverPts, x, z);

  // ---- placing things: keep them apart, off the river and inside the planet
  const placed = [{ x: start.x, z: start.z, r: 4 }, { x: home.x, z: home.z, r: 4 }, { x: shedP.x, z: shedP.z, r: 6 }, { x: benchP.x, z: benchP.z, r: 6 }, { x: rocketP.x, z: rocketP.z, r: 6 }];
  if (index > 0) placed.push({ x: hutP.x, z: hutP.z, r: 5 });
  const free = (x, z, r, edge = 8) => Math.hypot(x, z) < radius - edge - r && riverD(x, z) > width / 2 + r + 2 && placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r);
  const find = (want, r, near = null, maxD = 1e9) => {
    for (let t = 0; t < 400; t++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (radius - 10);
      const x = near ? near.x + Math.cos(a) * rnd() * maxD : Math.cos(a) * d, z = near ? near.z + Math.sin(a) * rnd() * maxD : Math.sin(a) * d;
      if ((want === 0 || (want > 0) === onHome(x, z)) && free(x, z, r)) { placed.push({ x, z, r }); return { x: +x.toFixed(1), z: +z.toFixed(1) }; }
    }
    return null;
  };

  // ---- bubble generators: a loose grid that covers the whole planet when all are maxed
  const RADII = [10, 17, 25, 32]; // a little bigger than Ember's: later planets stay at ~21 bubbles
  const gensP = [{ x: +home.x.toFixed(1), z: +home.z.toFixed(1) }];
  const sp = 50, jit = 5;
  for (let gx = -radius; gx <= radius; gx += sp) for (let gz = -radius; gz <= radius; gz += sp * 0.87) {
    const x = gx + ((Math.round(gz / (sp * 0.87)) % 2) * sp) / 2 + (rnd() - 0.5) * jit, z = gz + (rnd() - 0.5) * jit;
    if (Math.hypot(x, z) > radius - 6 || riverD(x, z) < width / 2 + 3) continue;
    if (gensP.some((g) => Math.hypot(g.x - x, g.z - z) < 30)) continue;
    gensP.push({ x: +x.toFixed(1), z: +z.toFixed(1) });
  }
  // fill any gaps (river banks, the rim) until maxing everything covers the planet
  for (let pass = 0; pass < 16 && gensP.length < 24; pass++) {
    let worst = null, wd = 0;
    for (let x = -radius; x <= radius; x += 3) for (let z = -radius; z <= radius; z += 3) {
      if (Math.hypot(x, z) > radius) continue;
      const d = Math.min(...gensP.map((g) => Math.hypot(g.x - x, g.z - z)));
      if (d > 30.5 && d > wd) { wd = d; worst = { x, z }; }
    }
    if (!worst) break;
    // put the new bubble on the nearest dry spot inside the planet
    let best = null;
    for (let rr = 0; rr <= 14 && !best; rr += 2) for (let k = 0; k < 16; k++) {
      const x = worst.x + Math.cos((k / 16) * Math.PI * 2) * rr, z = worst.z + Math.sin((k / 16) * Math.PI * 2) * rr;
      if (riverD(x, z) > width / 2 + 3 && Math.hypot(x, z) < radius - 3) { best = { x, z }; break; }
    }
    if (!best) best = worst;
    gensP.push({ x: +best.x.toFixed(1), z: +best.z.toFixed(1) });
  }
  gensP.forEach((g) => placed.push({ x: g.x, z: g.z, r: 4 }));
  const GEN = [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'C']];
  const genCost = (tier, step) => {
    const [a, b] = GEN[tier];
    if (step === 0) return R({ [a]: 8 + 3 * tier, [b]: 5 + 2 * tier });
    if (step === 1) return R({ [a]: 14 + 4 * tier, [b]: 9 + 3 * tier });
    if (step === 2) return { polishedCrystal: tier < 2 ? 1 : 2, goldBar: tier < 3 ? 1 : 2 };
    return { powerCore: tier < 3 ? 1 : 2 };
  };
  const generators = gensP.map((g, i) => {
    const tier = Math.min(3, Math.floor(Math.hypot(g.x - home.x, g.z - home.z) / 40));
    return { id: 'g' + i, x: g.x, z: g.z, built: i === 0, radii: RADII, build: i === 0 ? null : genCost(tier, 0), costs: [1, 2, 3].map((st) => genCost(tier, st)), tier };
  });

  // ---- bridges: two crossings, the near one wood and stone, the far one a special material
  const inPlanet = riverPts.filter(([x, z]) => Math.hypot(x, z) < radius - 14);
  const crossings = [];
  if (inPlanet.length >= 2) {
    const a = inPlanet[Math.floor(inPlanet.length * 0.3)], b = inPlanet[Math.min(inPlanet.length - 1, Math.floor(inPlanet.length * 0.75))];
    crossings.push(Math.hypot(a[0] - start.x, a[1] - start.z) < Math.hypot(b[0] - start.x, b[1] - start.z) ? [a, b] : [b, a]);
  }
  const special = [];
  if ([A, B, C, D].includes('redCrystal')) special.push({ kind: 'crystal', mat: 'redCrystal' });
  if ([A, B, C, D].includes('blueCrystal')) special.push({ kind: 'blue', mat: 'blueCrystal' });
  if ([A, B, C, D].includes('gold')) special.push({ kind: 'gold', mat: 'gold' });
  const sp2 = special.length ? pick(special) : { kind: 'wood', mat: null };
  const bridges = crossings.length ? [
    { at: crossings[0][0], kind: 'wood', cost: R({ A: 24, B: 12 }) },
    { at: crossings[0][1], kind: sp2.kind, cost: sp2.mat ? sc({ [sp2.mat]: 36 }) : R({ C: 20, B: 10 }) },
  ] : [];

  // ---- machines, astronauts, resources
  const refHome1 = find(1, 7, start, 40) || find(1, 7), refHome2 = find(1, 7, start, 50) || find(1, 7), refFar = find(-1, 7) || find(0, 7);
  const refiners = [
    { id: 'kiln', name: 'Kiln', ...refHome1, repair: R({ B: 20, A: 12 }), inputs: { [B]: 2, [C]: 2 }, output: 'polishedCrystal', secs: 6, hold: 10, store: 10, upgrades: [R({ B: 20, C: 14 }), { polishedCrystal: 4, goldBar: 3 }] },
    { id: 'smelter', name: 'Smelter', ...refHome2, repair: R({ B: 18, C: 12 }), inputs: { [D]: 2, [A]: 1 }, output: 'goldBar', secs: 7, hold: 10, store: 10, upgrades: [R({ B: 18, D: 10 }), { goldBar: 4, polishedCrystal: 3 }] },
    { id: 'assembler', name: 'Assembler', ...refFar, repair: { ...R({ B: 20 }), polishedCrystal: 3, goldBar: 3 }, inputs: { polishedCrystal: 1, goldBar: 1 }, output: 'powerCore', secs: 10, hold: 6, store: 6, upgrades: [{ polishedCrystal: 5, goldBar: 5 }, { powerCore: 2, ...R({ D: 14 }) }] },
  ];
  const exC = find(1, 4, start, 55) || find(1, 4), exD = find(-1, 4) || find(0, 4);
  const extractors = [
    { id: 'exC', ...exC, mat: C, build: R({ A: 14, B: 8 }), levels: [{ every: 5, cap: 10 }, { every: 3.5, cap: 20 }, { every: 2.4, cap: 30 }], costs: [R({ A: 16, B: 12 }), R({ B: 18, D: 6 })] },
    { id: 'exD', ...exD, mat: D, build: R({ B: 16, C: 12 }), levels: [{ every: 7, cap: 8 }, { every: 5, cap: 16 }, { every: 3.5, cap: 24 }], costs: [R({ C: 16, D: 8 }), { polishedCrystal: 4, ...R({ D: 10 }) }] },
  ];
  const a1 = find(1, 3, start, 60) || find(1, 3), a2 = find(-1, 3) || find(0, 3);
  const astronauts = [[a1.x, a1.z], [a2.x, a2.z]];

  // resource patches: A and B plentiful near home, C in between, D mostly out past the river
  const zones = [];
  const zone = (mat, want, nearP, maxD) => { const p = nearP ? find(want, 1, nearP, maxD) : find(want, 1); if (p) { placed.pop(); zones.push({ mat, x: p.x, z: p.z, r: 8 + Math.floor(rnd() * 4), n: 6 + Math.floor(rnd() * 4) }); } };
  const homeA = fromStart(4, -3), homeB = fromStart(14, -12);
  zones.push({ mat: A, x: +homeA.x.toFixed(1), z: +homeA.z.toFixed(1), r: 8, n: 7 }, { mat: B, x: +homeB.x.toFixed(1), z: +homeB.z.toFixed(1), r: 6, n: 5 });
  for (let i = 0; i < 5; i++) { zone(A, 1, start, 70); zone(B, 1, start, 70); }
  for (let i = 0; i < 2; i++) { zone(A, -1); zone(B, -1); }
  for (let i = 0; i < 3; i++) zone(C, 1, start, 80);
  for (let i = 0; i < 3; i++) zone(C, -1);
  for (let i = 0; i < 6; i++) zone(D, -1);
  zone(D, 1);
  const rocks = [];
  for (let i = 0; i < 10; i++) { const p = find(0, 3); if (p) rocks.push([p.x, p.z]); }

  return {
    name, seed, index, roles, look: LOOKS[lookName], lookName,
    radius,
    materials: [A, B, C, D],
    refined: ['polishedCrystal', 'goldBar', 'powerCore', 'heatShield'],
    start: { x: +start.x.toFixed(1), z: +start.z.toFixed(1) },
    restoreGoal: 0.5,
    airDrain: 1 + 0.15 * index,
    river: { width, points: riverPts },
    bridges,
    generators,
    extractors,
    refiners,
    workbench: { x: +benchP.x.toFixed(1), z: +benchP.z.toFixed(1) },
    shed: { x: +shedP.x.toFixed(1), z: +shedP.z.toFixed(1), levels: [
      { cost: R({ A: 16, B: 10 }), stage: 0 },
      { cost: R({ A: 20, C: 12 }), stage: 1 },
      { cost: { ...R({ D: 12 }), polishedCrystal: 4 }, stage: 2 },
    ] },
    rocket: { x: +rocketP.x.toFixed(1), z: +rocketP.z.toFixed(1), cost: { ...R({ B: 30 }), polishedCrystal: 4, goldBar: 4, powerCore: 3, heatShield: 1 } },
    // the hut: repair it, upgrade it twice; at MAX, with both astronauts' parts, it makes the heat shield
    // the two lost astronauts each carry half of the shield, so the hut's own costs stay light
    hut: { x: +hutP.x.toFixed(1), z: +hutP.z.toFixed(1), levels: [R({ A: 16, B: 10 }), { ...R({ C: 12 }), polishedCrystal: 2 }, { goldBar: 3 }], gives: 'heatShield' },
    astronauts,
    zones,
    rocks,
  };
}
