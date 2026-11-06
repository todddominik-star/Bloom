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
  // ready for later planets
  blueCrystal: { name: 'Blue crystal', color: '#4fa8ff', dark: '#2a6fcc', skill: 'mine', tier: 3, shape: 'crystal', node: 'crystal', perNode: 5, stage: 0 },
  ice:         { name: 'Ice',          color: '#bfeaff', dark: '#86c6e6', skill: 'mine', tier: 2, shape: 'chunk',   node: 'boulder', perNode: 4, stage: 0 },
  mushroom:    { name: 'Glow cap',     color: '#b48ef0', dark: '#7d5cc4', skill: 'chop', tier: 2, shape: 'cap',     node: 'shroom',  perNode: 3, stage: 0 },
};

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
    core: `<circle cx="10" cy="10" r="8" fill="${d}"/><circle cx="10" cy="10" r="5.5" fill="${c}"/><circle cx="8.5" cy="8.5" r="2" fill="#e8feff"/><path d="M10 1 L10 4 M10 16 L10 19 M1 10 L4 10 M16 10 L19 10" stroke="${c}" stroke-width="1.6"/>`,
  };
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 20 20" aria-label="${m.name}">${shapes[m.shape]}</svg>`;
}
