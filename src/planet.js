// A planet is a description: which materials it uses, where things are, and what they cost.
// Planet 1 is laid out by hand here; later planets will come from a generator that
// produces the same shape of description from a seed.

export const PLANET1 = {
  name: 'Ember',            // the dead red planet
  seed: 1,
  radius: 62,               // walkable disc radius (the world is a little floating planet)
  materials: ['wood', 'stone', 'redCrystal', 'gold'],
  start: { x: 0, z: 31 },
  restoreGoal: 0.5,         // share of the planet that must be alive before the rocket can launch

  // the river crosses the whole planet west to east; lava outside a bubble, water inside
  river: { width: 5.5, points: [[-75, -4], [-46, 3], [-24, 9], [-8, 7], [8, 1], [26, -7], [46, -10], [75, -16]] },
  bridge: { at: [-16, 8], cost: { wood: 24, stone: 10 } },

  // bubble generators: radius per level; costs are for the NEXT level
  generators: [
    { id: 'home',  x: 3,   z: 29,  built: true, radii: [9, 13, 17, 21.5],
      costs: [{ wood: 10, stone: 6 }, { wood: 18, stone: 14 }, { stone: 20, redCrystal: 14 }] },
    { id: 'east',  x: 33,  z: 25,  build: { wood: 16, stone: 8 }, radii: [8, 12, 16, 20],
      costs: [{ wood: 14, stone: 10 }, { stone: 16, redCrystal: 10 }, { redCrystal: 18, gold: 6 }] },
    { id: 'west',  x: -33, z: 28,  build: { wood: 18, stone: 10 }, radii: [8, 12, 16, 20],
      costs: [{ wood: 14, redCrystal: 8 }, { stone: 16, redCrystal: 12 }, { redCrystal: 18, gold: 6 }] },
    { id: 'south', x: 22,  z: 45,  build: { wood: 12, redCrystal: 6 }, radii: [7, 11],
      costs: [{ wood: 12, redCrystal: 8 }] },
    { id: 'north', x: -4,  z: -22, build: { stone: 14, redCrystal: 10 }, radii: [8, 12.5, 17, 22],
      costs: [{ stone: 16, gold: 4 }, { redCrystal: 16, gold: 8 }, { stone: 20, gold: 12 }] },
    { id: 'nw',    x: -34, z: -22, build: { wood: 14, gold: 6 }, radii: [8, 12.5, 17.5],
      costs: [{ stone: 14, gold: 6 }, { redCrystal: 16, gold: 10 }] },
    { id: 'ne',    x: 30,  z: -30, build: { stone: 16, gold: 8 }, radii: [8, 12.5, 17.5],
      costs: [{ redCrystal: 14, gold: 8 }, { stone: 18, gold: 12 }] },
  ],

  // an extractor slowly mines a deposit into its own storage; walk past to collect
  extractors: [
    { id: 'redEx', x: -24, z: 40, mat: 'redCrystal', build: { wood: 14, stone: 8 },
      levels: [{ every: 5, cap: 10 }, { every: 3.5, cap: 20 }, { every: 2.4, cap: 30 }],
      costs: [{ wood: 16, stone: 12 }, { stone: 18, gold: 6 }] },
    { id: 'goldEx', x: 14, z: -42, mat: 'gold', build: { stone: 16, redCrystal: 12 },
      levels: [{ every: 7, cap: 8 }, { every: 5, cap: 16 }],
      costs: [{ redCrystal: 16, gold: 8 }] },
  ],

  workbench: { x: 9, z: 33 },
  rocket: { x: -7, z: 38, cost: { stone: 30, redCrystal: 24, gold: 16 } },

  // lost astronauts waiting in little help bubbles
  astronauts: [[47, 8], [-50, 12], [-22, -44], [36, -44]],

  // where resource nodes grow (scattered from the seed)
  zones: [
    { node: 'tree',    x: 2,   z: 30, r: 8,  n: 7 },
    { node: 'boulder', x: -2,  z: 26, r: 8,  n: 5 },
    { node: 'tree',    x: 30,  z: 30, r: 12, n: 10 },
    { node: 'boulder', x: 38,  z: 16, r: 10, n: 7 },
    { node: 'crystal', x: -30, z: 38, r: 12, n: 10 },
    { node: 'tree',    x: -38, z: 20, r: 10, n: 7 },
    { node: 'crystal', x: 20,  z: 50, r: 7,  n: 4 },
    { node: 'boulder', x: -12, z: 50, r: 7,  n: 5 },
    { node: 'ore',     x: -8,  z: -18, r: 10, n: 6 },
    { node: 'tree',    x: 6,   z: -30, r: 10, n: 8 },
    { node: 'boulder', x: -34, z: -16, r: 10, n: 6 },
    { node: 'ore',     x: -36, z: -34, r: 9,  n: 6 },
    { node: 'crystal', x: 30,  z: -24, r: 10, n: 7 },
    { node: 'ore',     x: 22,  z: -42, r: 8,  n: 5 },
    { node: 'tree',    x: 40,  z: -38, r: 8,  n: 6 },
  ],
  // decoration-only rocks (also block walking)
  rocks: [[-50, 32], [52, 30], [-16, -50], [48, -20], [-52, -14], [10, -52], [-4, 54], [54, 4]],
};

// which material each node type gives on this planet
export const NODE_MATERIAL = { tree: 'wood', boulder: 'stone', crystal: 'redCrystal', ore: 'gold' };
