// Master list of materials. Each planet uses 3-6 of these; the list grows over time.
// skill: which skill gathering it trains. tier: tool level needed to gather it.
// stage: 0 raw (gathered), 1 refined (made from raw), 2 manufactured (made from refined),
// 3 kept free for a second manufacturing step on later planets. Storage per item depends on it.
// shape: how the node looks in the world and the icon in the HUD.
export const MATERIALS = {
  wood:       { name: 'Wood',        color: '#b07a45', dark: '#7d5230', skill: 'chop', tier: 1, shape: 'log',     node: 'tree',    perNode: 4, stage: 0 },
  stone:      { name: 'Stone',       color: '#a7adb8', dark: '#7c828d', skill: 'mine', tier: 1, shape: 'chunk',   node: 'boulder', perNode: 4, stage: 0 },
  redCrystal: { name: 'Red crystal', color: '#ef4b5f', dark: '#b8283c', skill: 'mine', tier: 1, shape: 'crystal', node: 'crystal', perNode: 5, stage: 0 },
  gold:       { name: 'Gold',        color: '#f5c542', dark: '#c99a1c', skill: 'mine', tier: 2, shape: 'nugget',  node: 'ore',     perNode: 3, stage: 0 },
  // refined items, made in machines
  polishedCrystal: { name: 'Polished crystal', color: '#ff7aa8', dark: '#d94a7c', shape: 'cube', refined: true, stage: 1 },
  goldBar:         { name: 'Gold bar',         color: '#ffd65a', dark: '#d9a520', shape: 'bar',  refined: true, stage: 1 },
  powerCore:       { name: 'Power core',       color: '#5ff2ff', dark: '#1aa7c4', shape: 'core', refined: true, stage: 2 },
  // special: a part only the hut makes (planets after Ember); never stored in the shed
  heatShield:      { name: 'Heat shield',      color: '#ff9f43', dark: '#d9731a', shape: 'shield', refined: true, stage: 2, special: true },
  // ready for later planets
  blueCrystal: { name: 'Blue crystal', color: '#4fa8ff', dark: '#2a6fcc', skill: 'mine', tier: 3, shape: 'crystal', node: 'crystal', perNode: 5, stage: 0 },
  ice:         { name: 'Ice',          color: '#bfeaff', dark: '#86c6e6', skill: 'mine', tier: 2, shape: 'chunk',   node: 'boulder', perNode: 4, stage: 0 },
  mushroom:    { name: 'Glow cap',     color: '#b48ef0', dark: '#7d5cc4', skill: 'chop', tier: 2, shape: 'cap',     node: 'shroom',  perNode: 3, stage: 0 },
  // v14: new raw materials: powder piles, obsidian shards, more crystal colours (never yellow)
  sand:          { name: 'Sand',           color: '#d9b77a', dark: '#a8844a', skill: 'mine', tier: 1, shape: 'pile',    node: 'pile',    perNode: 5, stage: 0 },
  ash:           { name: 'Ash',            color: '#a3a3ab', dark: '#6e6e78', skill: 'mine', tier: 1, shape: 'pile',    node: 'pile',    perNode: 5, stage: 0 },
  carbon:        { name: 'Carbon',         color: '#3a3a44', dark: '#16161c', skill: 'mine', tier: 2, shape: 'pile',    node: 'pile',    perNode: 4, stage: 0 },
  uranium:       { name: 'Uranium',        color: '#7dff6a', dark: '#2fa83a', skill: 'mine', tier: 3, shape: 'pile',    node: 'pile',    perNode: 3, stage: 0, glow: true },
  obsidian:      { name: 'Obsidian',       color: '#3b2f52', dark: '#1a1426', skill: 'mine', tier: 2, shape: 'shard',   node: 'shards',  perNode: 4, stage: 0 },
  greenCrystal:  { name: 'Green crystal',  color: '#3fd67a', dark: '#1f9a52', skill: 'mine', tier: 2, shape: 'crystal', node: 'crystal', perNode: 5, stage: 0 },
  purpleCrystal: { name: 'Purple crystal', color: '#b05cf0', dark: '#7a2fc0', skill: 'mine', tier: 3, shape: 'crystal', node: 'crystal', perNode: 5, stage: 0 },
  // v14: rocket supplies, made by refineries running a rocket blueprint
  fuelCell:  { name: 'Fuel cell', color: '#ff6a3d', dark: '#c23d1a', shape: 'canister', refined: true, stage: 2, supply: true },
  airTank:   { name: 'Air tank',  color: '#7fd8ff', dark: '#3a9ccc', shape: 'tank',     refined: true, stage: 2, supply: true },
  foodPack:  { name: 'Food pack', color: '#8fd650', dark: '#5a9a2a', shape: 'crate',    refined: true, stage: 2, supply: true },
  // special carried items: never stored in the shed. slots: how much bag room one takes
  bpFuel:   { name: 'Fuel blueprint', color: '#ff6a3d', dark: '#2a4f9a', shape: 'scroll', special: true, stage: 3 },
  bpAir:    { name: 'Air blueprint',  color: '#7fd8ff', dark: '#2a4f9a', shape: 'scroll', special: true, stage: 3 },
  bpFood:   { name: 'Food blueprint', color: '#8fd650', dark: '#2a4f9a', shape: 'scroll', special: true, stage: 3 },
  scanPart: { name: 'Scanner part',   color: '#d9dde6', dark: '#3d8bff', shape: 'gear',   special: true, stage: 3 },
  scanner:  { name: 'Scanner',        color: '#d9dde6', dark: '#ff9f43', shape: 'dish',   special: true, stage: 3, slots: 10 },
};
export const SUPPLIES = ['fuelCell', 'airTank', 'foodPack'];

// tiny inline SVG icons for the HUD and cost signs
// how many of one item the shed can hold, by stage
export const STAGE_CAP = [50, 25, 10, 5];
export const STAGE_NAME = ['raw', 'refined', 'manufactured', 'advanced'];

export function icon(id, size = 18) {
  const m = MATERIALS[id];
  const c = m.color, d = m.dark;
  const shapes = {
    log: `<rect x="3" y="7" width="14" height="7" rx="3.5" fill="${c}"/><ellipse cx="16" cy="10.5" rx="2.6" ry="3.5" fill="#e3b77e"/><circle cx="16" cy="10.5" r="1.2" fill="${d}"/>`,
    chunk: `<path d="M4 13 L7 5 L13 4 L17 9 L14 16 L7 16 Z" fill="${c}"/><path d="M7 5 L13 4 L11 9 Z" fill="#fff" opacity=".35"/><path d="M14 16 L17 9 L11 9 Z" fill="${d}"/>`,
    crystal: `<path d="M10 2 L14 7 L12 17 L8 17 L6 7 Z" fill="${c}"/><path d="M10 2 L10 17 L8 17 L6 7 Z" fill="${d}"/><path d="M4 10 L6 8 L7 17 L4 16 Z" fill="${c}" opacity=".85"/><path d="M15 9 L17 11 L15 17 L13 17 Z" fill="${d}"/>`,
    nugget: `<path d="M3 12 L6 7 L11 6 L16 8 L17 13 L12 16 L6 15 Z" fill="${c}"/><path d="M6 7 L11 6 L10 10 Z" fill="#fff6c8"/><path d="M12 16 L17 13 L12 11 Z" fill="${d}"/>`,
    cap: `<path d="M3 11 Q10 1 17 11 Z" fill="${c}"/><rect x="8" y="11" width="4" height="6" rx="1.5" fill="#efe6d8"/><circle cx="8" cy="8" r="1.2" fill="#fff" opacity=".7"/>`,
    cube: `<path d="M10 2 L17 6 L10 10 L3 6 Z" fill="#ffd0e0"/><path d="M3 6 L10 10 L10 18 L3 14 Z" fill="${c}"/><path d="M17 6 L10 10 L10 18 L17 14 Z" fill="${d}"/>`,
    bar: `<path d="M5 7 L15 7 L18 14 L2 14 Z" fill="${c}"/><path d="M5 7 L15 7 L14 9 L6 9 Z" fill="#fff3c0"/><path d="M2 14 L18 14 L17 16 L3 16 Z" fill="${d}"/>`,
    shield: `<path d="M10 2 L17 5 L16 12 Q14 16 10 18 Q6 16 4 12 L3 5 Z" fill="${c}"/><path d="M10 2 L10 18 Q6 16 4 12 L3 5 Z" fill="${d}"/><path d="M7 8 L13 8 M7 11 L13 11" stroke="#fff3e0" stroke-width="1.4"/>`,
    core: `<circle cx="10" cy="10" r="8" fill="${d}"/><circle cx="10" cy="10" r="5.5" fill="${c}"/><circle cx="8.5" cy="8.5" r="2" fill="#e8feff"/><path d="M10 1 L10 4 M10 16 L10 19 M1 10 L4 10 M16 10 L19 10" stroke="${c}" stroke-width="1.6"/>`,
    pile: `<path d="M2 16 Q5 7 10 5 Q15 7 18 16 Z" fill="${c}"/><path d="M10 5 Q15 7 18 16 L12 16 Z" fill="${d}"/><circle cx="7" cy="12" r=".9" fill="#fff" opacity=".5"/><circle cx="10" cy="9" r=".8" fill="#fff" opacity=".45"/><circle cx="13" cy="13" r=".8" fill="${d}"/>`,
    shard: `<path d="M9 2 L13 9 L11 18 L6 15 L5 8 Z" fill="${c}"/><path d="M9 2 L11 18 L13 9 Z" fill="${d}"/><path d="M9 3 L7 9 L8 14" stroke="#c9b8ff" stroke-width="1" fill="none" opacity=".8"/><path d="M14 11 L17 13 L15 18 L12 17 Z" fill="${c}"/>`,
    canister: `<rect x="5" y="4" width="10" height="14" rx="3" fill="${c}"/><rect x="5" y="4" width="4" height="14" rx="2" fill="${d}" opacity=".6"/><rect x="8" y="1.5" width="4" height="3" rx="1" fill="#555"/><path d="M8 9 L11 9 L9.5 12 L12 12 L8.5 16 L9.5 13 L7.5 13 Z" fill="#fff3b0"/>`,
    tank: `<rect x="6" y="3" width="8" height="15" rx="4" fill="${c}"/><rect x="6" y="3" width="3" height="15" rx="1.5" fill="#fff" opacity=".35"/><rect x="8.5" y="1" width="3" height="3" fill="#666"/><circle cx="10" cy="11" r="2.4" fill="${d}"/><circle cx="10" cy="11" r="1" fill="#fff"/>`,
    crate: `<rect x="3" y="5" width="14" height="12" rx="1.5" fill="${c}"/><rect x="3" y="5" width="14" height="3" fill="${d}"/><path d="M10 9 Q7 11 10 15 Q13 11 10 9 Z" fill="#fff6d0"/><path d="M10 9 L10 7" stroke="#5a3" stroke-width="1.2"/>`,
    scroll: `<rect x="4" y="4" width="12" height="13" rx="1" fill="#e9f1ff"/><rect x="4" y="4" width="12" height="13" rx="1" fill="${d}" opacity=".18"/><path d="M6 8 H14 M6 11 H12 M6 14 H13" stroke="${d}" stroke-width="1.1"/><circle cx="14.5" cy="5" r="3" fill="${c}" stroke="#fff" stroke-width="1"/>`,
    gear: `<circle cx="10" cy="10" r="6" fill="${c}"/><path d="M10 1 V5 M10 15 V19 M1 10 H5 M15 10 H19 M3.6 3.6 L6.4 6.4 M13.6 13.6 L16.4 16.4 M3.6 16.4 L6.4 13.6 M13.6 6.4 L16.4 3.6" stroke="${c}" stroke-width="2.6"/><circle cx="10" cy="10" r="2.4" fill="${d}"/>`,
    dish: `<path d="M3 11 Q10 18 17 11 Z" fill="${c}"/><path d="M10 13 L14 5" stroke="#777" stroke-width="1.4"/><circle cx="14" cy="5" r="1.8" fill="${d}"/><rect x="8" y="14" width="4" height="4" fill="#8d8f98"/>`,
  };
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 20 20" aria-label="${m.name}">${shapes[m.shape]}</svg>`;
}
