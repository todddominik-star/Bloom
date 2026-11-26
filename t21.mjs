import { generatePlanet } from './src/planetgen.js';
import { MATERIALS } from './src/materials.js';
let bad = 0; const seen = {};
for (let i = 0; i < 40; i++) {
  const seed = 1000 + i * 7919, idx = 1 + (i % 9);
  const P = generatePlanet(seed, idx, 3);
  const line = P.refiners.map((r) => `${r.name}: ${Object.keys(r.inputs).join('+')} → ${r.output}`).join(' | ');
  for (const r of P.refiners) { seen[r.output] = (seen[r.output] || 0) + 1; if (!MATERIALS[r.output]) { bad++; console.log('MISSING', r.output); } for (const m of Object.keys(r.inputs)) if (!MATERIALS[m]) { bad++; console.log('MISSING in', m); } }
  if (i < 12 || P.landmark) console.log(idx, P.landmark ? 'LANDMARK' : '', P.materials.join(','), '\n   ', line, P.monument ? `\n    monument ${JSON.stringify(P.monument.cost)}` : '');
}
console.log('outputs used:', seen, 'bad', bad);
const old = generatePlanet(555, 1, 2); console.log('gen2 items', old.refiners.map((r) => r.output).join(','));
