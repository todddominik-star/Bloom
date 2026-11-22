// The journey: where you've been, the next planets on offer, missions and relics.
// Everything here is plain data and HTML; main.js wires it into the world.
import { MATERIALS } from './materials.js';

// Relic sets: collect every piece and the old tool comes back to life.
export const RELICS = {
  pick: { name: 'Star pickaxe', pieces: ['Star head', 'Comet haft', 'Anchor grip'], effect: 'Mines anything, 1.5× faster', color: '#ffd65a' },
  axe: { name: 'Star axe', pieces: ['Moon blade', 'Rootwood haft', 'Ember grip'], effect: 'Chops anything, 1.5× faster', color: '#7fe0a0' },
  suit: { name: 'Star suit', pieces: ['Boots', 'Gloves', 'Helmet', 'Body suit', 'Power pack'], effect: 'Twice the air', color: '#6ec6ff' },
  bag: { name: 'Star pack', pieces: ['Frame', 'Straps', 'Pouch', 'Clasp'], effect: '+50 bag space', color: '#ff9fc8' },
};
export const relicDone = (game, k) => (game.relics?.[k] || 0) >= RELICS[k].pieces.length;
export const LOOK_COLOR = { ember: '#d0603f', teal: '#2fb8a6', dusk: '#b46ad0', sand: '#cfa66c' };
const CRITTER_NAMES = ['Pip', 'Moss', 'Bibi', 'Tumble', 'Nib', 'Puddle', 'Dot', 'Wim', 'Bo', 'Fennel', 'Lulu', 'Pebble'];

function rng(seed) { let s = (Math.floor(seed) * 9301 + 49297) % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// Three ways on from here, each a different kind: a voyager's rumour of a relic, a call for help,
// and a delivery of something only this planet has.
export function makeOffers(game, P, generatePlanet) {
  const r = rng((game.seed || 7) * 31 + game.planet * 977 + 13);
  const used = new Set([...(game.visited || []), P.name]);
  const need = Object.keys(RELICS).filter((k) => !relicDone(game, k));
  // the three rewards are always different (while at least three sets are unfinished)
  const usedTools = new Set();
  const pickTool = () => {
    const fresh = need.filter((k) => !usedTools.has(k));
    const pool = fresh.length ? fresh : need;
    const k = pool.length ? pool[Math.floor(r() * pool.length)] : null;
    if (k) usedTools.add(k);
    return k;
  };
  const types = ['relic', 'help', 'delivery'].sort(() => r() - 0.5);
  const offers = [];
  for (const type of types) {
    let best = null;
    for (let k = 0; k < 24; k++) {
      const seed = Math.floor(r() * 1e9);
      const dest = generatePlanet(seed, game.planet + 1);
      if (used.has(dest.name)) continue;
      const missing = P.materials.filter((m) => !dest.materials.includes(m) && !MATERIALS[m].special);
      if (type === 'delivery' && !missing.length) { if (!best) best = { seed, dest, missing }; continue; }
      best = { seed, dest, missing }; break;
    }
    if (!best) continue;
    used.add(best.dest.name);
    const o = { seed: best.seed, name: best.dest.name, look: best.dest.lookName || 'teal', type, tool: pickTool(), landmark: !!best.dest.landmark };
    if (type === 'delivery') {
      if (best.missing.length) { o.mat = best.missing[Math.floor(r() * best.missing.length)]; o.amount = 30 + 10 * Math.min(5, game.planet); }
      else o.type = 'relic';
    }
    if (o.type === 'help') o.critter = CRITTER_NAMES[Math.floor(r() * CRITTER_NAMES.length)];
    o.piece = o.tool ? RELICS[o.tool].pieces[game.relics?.[o.tool] || 0] : null;
    offers.push(o);
  }
  return offers;
}

export function offerTitle(o) {
  return (o.landmark ? '★ Landmark world · ' : '') + ( o.type === 'relic' ? 'A voyager\'s log' : o.type === 'help' ? 'A call for help' : 'A delivery');
}
// the reward is worked out when you look (and when you fly): a set you finished meanwhile is skipped
export function rewardTool(o, game) {
  if (o.tool && !relicDone(game, o.tool)) return o.tool;
  return Object.keys(RELICS).find((k) => !relicDone(game, k)) || null;
}
export function offerText(o, P, game) {
  const k = rewardTool(o, game);
  const reward = k ? ` Reward: a relic piece, the ${RELICS[k].pieces[game.relics?.[k] || 0]} of the ${RELICS[k].name}.` : '';
  const big = o.landmark ? ` ${o.name} is a big landmark world, and its river is dammed up: clear it to let the water flow.` : '';
  if (o.type === 'relic') return big + `"Something hums inside a great rock on ${o.name}." Repair the hut's broken scanner to find it.${reward}`;
  if (o.type === 'help') return big + `"${o.critter} is trapped under a boulder on ${o.name}! Please help." The hut's scanner can find them.${reward}`;
  return big + `${o.name} needs ${o.amount} ${MATERIALS[o.mat].name.toLowerCase()}. There is none there, but ${P.name} has it: load the rocket hold before you go.${reward}`;
}
export const offerIcon = (t) => (t === 'relic' ? '📜' : t === 'help' ? '🆘' : '📦');

// a little star chart: where you've been (left), here, and the three ways on
export function galaxySVG(game, P, offers, course) {
  const log = (game.log || []).slice(-5);
  const W = 340, H = 190, y0 = 70;
  const trail = [...log.map((p) => ({ ...p, past: true })), { name: P.name, look: P.lookName || 'ember', here: true, badge: null }];
  const step = Math.min(64, 200 / Math.max(1, trail.length - 1 || 1));
  const x0 = 34;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block">`;
  // starfield
  const r = rng(game.planet + 5);
  for (let i = 0; i < 46; i++) s += `<circle cx="${(r() * W).toFixed(1)}" cy="${(r() * H).toFixed(1)}" r="${(0.4 + r() * 1.1).toFixed(2)}" fill="#fff" opacity="${(0.25 + r() * 0.6).toFixed(2)}"/>`;
  const pos = trail.map((p, i) => ({ x: x0 + i * step, y: y0 + (i % 2 ? 14 : -6) }));
  const here = pos[pos.length - 1];
  const opos = offers.map((o, i) => ({ x: Math.min(W - 40, here.x + 110), y: 34 + i * 58 }));
  for (let i = 1; i < pos.length; i++) s += `<line x1="${pos[i - 1].x}" y1="${pos[i - 1].y}" x2="${pos[i].x}" y2="${pos[i].y}" stroke="#9fd8ff" stroke-width="2" opacity=".55"/>`;
  offers.forEach((o, i) => { const sel = course === i; s += `<line x1="${here.x}" y1="${here.y}" x2="${opos[i].x}" y2="${opos[i].y}" stroke="${sel ? '#ffd23f' : '#9fd8ff'}" stroke-width="${sel ? 2.6 : 1.6}" stroke-dasharray="4 5" opacity="${sel ? 1 : 0.6}"/>`; });
  trail.forEach((p, i) => {
    const { x, y } = pos[i], c = LOOK_COLOR[p.look] || '#8aa';
    s += `<circle cx="${x}" cy="${y}" r="${p.here ? 13 : 9}" fill="${c}" stroke="${p.here ? '#fff' : 'none'}" stroke-width="2.5"/>`;
    if (p.badge) s += `<text x="${x + 8}" y="${y - 8}" font-size="11" fill="#ffd65a">★</text>`;
    if (p.critters) s += `<circle cx="${x - 9}" cy="${y + 8}" r="3" fill="#ffb3d1"/>`;
    s += `<text x="${x}" y="${y + (p.here ? 30 : 24)}" font-size="${p.here ? 12 : 10}" font-weight="800" fill="#fff" text-anchor="middle" opacity="${p.here ? 1 : 0.75}">${p.name}</text>`;
  });
  s += `<text x="${here.x}" y="${here.y - 20}" font-size="10" font-weight="800" fill="#ffd23f" text-anchor="middle">you</text>`;
  offers.forEach((o, i) => {
    const { x, y } = opos[i], sel = course === i;
    s += `<circle cx="${x}" cy="${y}" r="11" fill="${LOOK_COLOR[o.look] || '#8aa'}" stroke="${sel ? '#ffd23f' : '#fff'}" stroke-width="${sel ? 3 : 1}" stroke-dasharray="${sel ? '' : '2 3'}"/>`;
    s += `<text x="${x + 17}" y="${y + 4}" font-size="12" font-weight="800" fill="#fff">${o.name}</text>`;
  });
  return s + '</svg>';
}

export function relicsHTML(game) {
  let h = '';
  for (const [k, R] of Object.entries(RELICS)) {
    const have = game.relics?.[k] || 0, done = have >= R.pieces.length;
    h += `<div class="relic${done ? ' done' : ''}"><b>${R.name}</b><span class="pips">${R.pieces.map((p, i) => `<i title="${p}" style="${i < have ? `background:${R.color}` : ''}"></i>`).join('')}</span><span class="rfx">${done ? '✓ ' + R.effect : `${have}/${R.pieces.length} · ${R.effect}`}</span></div>`;
  }
  return h;
}

// sectors: five worlds each, the fifth a big landmark world
export const sectorOf = (planet) => Math.floor(planet / 5) + 1;
export const worldInSector = (planet) => (planet % 5) + 1;
export const SECTOR_NAMES = ['Ember Reach', 'Tidewell', 'The Lantern Drift', 'Hollowmere', 'Starfall Verge', 'The Quiet Shoal'];
export const sectorName = (planet) => SECTOR_NAMES[(sectorOf(planet) - 1) % SECTOR_NAMES.length] + (sectorOf(planet) > SECTOR_NAMES.length ? ' ' + (Math.floor((sectorOf(planet) - 1) / SECTOR_NAMES.length) + 1) : '');
