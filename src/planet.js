// A planet is a description: which materials it uses, where things are, and what they cost.
// Planet 1 is laid out by hand here; later planets will come from a generator that
// produces the same shape of description from a seed.

// ---- costs are worked out from a "tier" (how far from home), so a generator can reuse them.
// Every bubble follows the same pattern: LVL 1 (build) raw, LVL 2 more raw, LVL 3 refined items,
// LVL 4 (MAX) manufactured items. Counts stay small near home and grow farther out.
const GEN_MATS = [['wood', 'stone'], ['stone', 'redCrystal'], ['redCrystal', 'gold'], ['gold', 'redCrystal']];
export function genCost(tier, step) {
  const [a, b] = GEN_MATS[tier];
  if (step === 0) return { [a]: 8 + 3 * tier, [b]: 5 + 2 * tier };
  if (step === 1) return { [a]: 14 + 4 * tier, [b]: 9 + 3 * tier };
  if (step === 2) return { polishedCrystal: tier < 2 ? 1 : 2, goldBar: tier < 3 ? 1 : 2 };
  return { powerCore: tier < 3 ? 1 : 2 };
}

const HOME = { x: -24, z: 52 };
const GEN_SPOTS = [
  [-24, 52], [0, 84], [-38, 75], [38, 75], [24, 52], [-68, 49], [68, 49], [-48, 24], [0, 24], [48, 8],
  [-84, 9], [84, 9], [-30, -8], [12, -14], [-72, -32], [-24, -32], [24, -36], [72, -32], [-46, -70], [46, -70], [0, -73],
];
const RADII = [9, 15, 22, 30]; // maxing every bubble covers the whole planet

export const PLANET1 = {
  name: 'Ember',
  seed: 1,
  radius: 93,
  materials: ['wood', 'stone', 'redCrystal', 'gold'],
  refined: ['polishedCrystal', 'goldBar', 'powerCore'],
  start: { x: -28, z: 57 },
  restoreGoal: 0.5,          // the rocket can launch from here
  // the river crosses the whole planet; lava outside a bubble, water inside
  river: { width: 7, points: [[-112, -6], [-69, 4.5], [-36, 13.5], [-12, 10.5], [12, 1.5], [39, -10.5], [69, -15], [112, -24]] },
  // each bridge is built from one look: 'wood' (wood and stone), 'crystal' or 'gold'.
  // The planet generator will pick the second bridge's material at random.
  bridges: [
    { at: [-36, 13.5], kind: 'wood', cost: { wood: 24, stone: 12 } },
    { at: [39, -10.5], kind: 'crystal', cost: { redCrystal: 36 } },
  ],
  generators: GEN_SPOTS.map(([x, z], i) => {
    const tier = Math.min(3, Math.floor(Math.hypot(x - HOME.x, z - HOME.z) / 40));
    const maxStep = RADII.length - 1;
    return {
      id: 'g' + i, x, z, built: i === 0, radii: RADII,
      build: i === 0 ? null : genCost(tier, 0),
      costs: [1, 2, 3].map((s) => genCost(tier, s)), tier,
    };
  }),

  // extractors slowly mine a deposit into their own storage; walk past to collect
  extractors: [
    { id: 'redEx', x: -50, z: 64, mat: 'redCrystal', build: { wood: 14, stone: 8 },
      levels: [{ every: 5, cap: 10 }, { every: 3.5, cap: 20 }, { every: 2.4, cap: 30 }],
      costs: [{ wood: 16, stone: 12 }, { stone: 18, gold: 6 }] },
    { id: 'redEx2', x: 60, z: 28, mat: 'redCrystal', build: { wood: 16, stone: 10 },
      levels: [{ every: 5, cap: 10 }, { every: 3.5, cap: 20 }],
      costs: [{ stone: 16, gold: 6 }] },
    { id: 'goldEx', x: -10, z: -50, mat: 'gold', build: { stone: 16, redCrystal: 12 },
      levels: [{ every: 7, cap: 8 }, { every: 5, cap: 16 }, { every: 3.5, cap: 24 }],
      costs: [{ redCrystal: 16, gold: 8 }, { polishedCrystal: 4, gold: 10 }] },
  ],

  // broken refining machines: repair, load the inputs, wait, collect the output.
  // Upgrades (LVL 2, LVL 3 = MAX) make them work faster and hold bigger loads and trays.
  refiners: [
    { id: 'kiln', name: 'Kiln', x: -6, z: 64, repair: { stone: 20, wood: 12 },
      inputs: { stone: 2, redCrystal: 2 }, output: 'polishedCrystal', secs: 6, hold: 10, store: 10,
      upgrades: [{ stone: 20, redCrystal: 14 }, { polishedCrystal: 4, goldBar: 3 }] },
    { id: 'smelter', name: 'Smelter', x: -52, z: 36, repair: { stone: 18, redCrystal: 12 },
      inputs: { gold: 2, wood: 1 }, output: 'goldBar', secs: 7, hold: 10, store: 10,
      upgrades: [{ stone: 18, gold: 10 }, { goldBar: 4, polishedCrystal: 3 }] },
    { id: 'assembler', name: 'Assembler', x: 56, z: -52, repair: { stone: 20, polishedCrystal: 3, goldBar: 3 },
      inputs: { polishedCrystal: 1, goldBar: 1 }, output: 'powerCore', secs: 10, hold: 6, store: 6,
      upgrades: [{ polishedCrystal: 5, goldBar: 5 }, { powerCore: 2, gold: 14 }] },
  ],

  workbench: { x: -17, z: 56 },
  // storage shed: starts broken. Each level unlocks the next stage of items: raw (50 of each),
  // then refined (25 each), then manufactured (10 each). Later planets can add a 4th level.
  shed: { x: -32, z: 46, levels: [
    { cost: { wood: 16, stone: 10 }, stage: 0 },
    { cost: { wood: 20, redCrystal: 12 }, stage: 1 },
    { cost: { gold: 12, polishedCrystal: 4 }, stage: 2 },
  ] },
  rocket: { x: -36, z: 64, cost: { stone: 30, polishedCrystal: 4, goldBar: 4, powerCore: 3 } },

  // lost astronauts waiting in little help bubbles
  astronauts: [[58, 64], [-78, 36], [-82, -18], [-18, -84], [72, -56], [86, 24]],

  // where resource nodes grow (scattered from the seed)
  zones: [
    { node: 'tree', x: -24, z: 54, r: 8, n: 7 }, { node: 'boulder', x: -30, z: 48, r: 8, n: 5 },
    { node: 'tree', x: 4, z: 78, r: 12, n: 10 }, { node: 'boulder', x: 30, z: 70, r: 10, n: 7 },
    { node: 'tree', x: 24, z: 46, r: 12, n: 10 }, { node: 'crystal', x: -44, z: 70, r: 10, n: 8 },
    { node: 'tree', x: -66, z: 50, r: 12, n: 9 }, { node: 'boulder', x: -40, z: 30, r: 10, n: 7 },
    { node: 'crystal', x: 62, z: 40, r: 10, n: 8 }, { node: 'tree', x: 74, z: 56, r: 9, n: 7 },
    { node: 'boulder', x: 6, z: 30, r: 10, n: 6 }, { node: 'crystal', x: -20, z: 80, r: 7, n: 5 },
    { node: 'tree', x: 46, z: 22, r: 9, n: 6 }, { node: 'boulder', x: 80, z: 8, r: 8, n: 5 },
    { node: 'tree', x: -80, z: 14, r: 8, n: 6 },
    // north of the river
    { node: 'ore', x: -28, z: -16, r: 10, n: 7 }, { node: 'tree', x: 10, z: -22, r: 10, n: 8 },
    { node: 'boulder', x: -60, z: -24, r: 10, n: 7 }, { node: 'ore', x: -70, z: -40, r: 9, n: 6 },
    { node: 'crystal', x: 30, z: -30, r: 10, n: 8 }, { node: 'ore', x: 20, z: -52, r: 9, n: 6 },
    { node: 'tree', x: -40, z: -62, r: 10, n: 8 }, { node: 'boulder', x: 0, z: -66, r: 10, n: 7 },
    { node: 'crystal', x: -12, z: -40, r: 8, n: 6 }, { node: 'tree', x: 64, z: -24, r: 10, n: 7 },
    { node: 'ore', x: 50, z: -70, r: 8, n: 5 }, { node: 'boulder', x: 80, z: -40, r: 7, n: 5 },
  ],
  // decoration-only rocks (also block walking)
  rocks: [[-86, 30], [82, 44], [-30, -86], [70, -8], [-88, -8], [14, -86], [-6, 88], [88, -18], [-60, 70], [60, -70], [-56, -52], [36, 86]],
};

// which material each node type gives on this planet
export const NODE_MATERIAL = { tree: 'wood', boulder: 'stone', crystal: 'redCrystal', ore: 'gold' };
