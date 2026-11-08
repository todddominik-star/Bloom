import * as THREE from 'three';
import { MATERIALS, icon, STAGE_CAP, STAGE_NAME } from './materials.js';
import { PLANET1, NODE_MATERIAL } from './planet.js';
import { generatePlanet, LOOKS } from './planetgen.js';

// ---- which planet are we on? Ember first, then generated planets. The journey (planet number,
// its seed, the crew who came along, your tools and skills) lives in GAME_KEY; each planet has
// its own save.
const GAME_KEY = 'bloom-game-v3';
let game = null;
try { game = JSON.parse(localStorage.getItem(GAME_KEY) || 'null'); } catch (e) {}
if (!game) game = { planet: 0, seed: 0, crew: [], tools: null, skills: null };
const P = game.planet === 0 ? PLANET1 : generatePlanet(game.seed, game.planet);
if (!P.look) P.look = LOOKS.ember;
const SAVE_KEY = 'bloom-save-v3-p' + game.planet; // Ember's rework: older saves start fresh
const LOOK = P.look;
const glsl3 = (hex) => { const c = parseInt(hex.slice(1), 16); return `vec3(${((c >> 16) & 255) / 255}, ${((c >> 8) & 255) / 255}, ${(c & 255) / 255})`; };
// suit colours: astronauts wear the colour of the planet they were lost on
const SUIT_COLORS = ['#7ed957', '#ffb347', '#6ec6ff', '#ff7eb6', '#c59bff', '#ffe066', '#5fe0c0'];
// Ember's materials play the parts A-D; tool upgrades use whatever plays that part here
const ROLE_OF = { wood: P.roles.A, stone: P.roles.B, redCrystal: P.roles.C, gold: P.roles.D };
const remap = (cost) => { const o = {}; for (const [m, n] of Object.entries(cost)) o[ROLE_OF[m] || m] = (o[ROLE_OF[m] || m] || 0) + n; return o; };

// ------------------------------------------------------------------ tuning
const WALK = 6.2;            // walking speed (units / s)
const FLOAT_HOME = 10;       // speed when the suit floats you home
const REACH = 0.75;          // walk right up and touch it to gather (you stop about 0.45 from it)
const SITE_REACH = 2.0;      // generators: you stop about 1.55 from their centre, so this is touching
const BASE_SWING = 0.62;     // seconds between tool swings at level 1
const REGROW = 45;           // seconds for a used-up node to grow back
const TOOL_SPEED = [1, 1.5, 2.1];
const BAG_SIZES = [30, 45, 60, 80, 100];
const AIR_TIMES = [12, 20, 30, 45];
const UPGRADES = {
  pick:  { name: 'Pickaxe',  note: ['Stone pick', 'Crystal pick: mines gold', 'Golden pick: swings fast'], costs: [{ stone: 12, redCrystal: 8 }, { goldBar: 3, redCrystal: 12 }] },
  axe:   { name: 'Axe',      note: ['Stone axe', 'Crystal axe', 'Golden axe'], costs: [{ wood: 12, stone: 8 }, { stone: 14, redCrystal: 10 }] },
  bag:   { name: 'Backpack', note: BAG_SIZES.map((s) => `Holds ${s}`), costs: [{ wood: 14, stone: 10 }, { stone: 16, redCrystal: 12 }, { redCrystal: 16, gold: 10 }, { goldBar: 4, gold: 14 }] },
  suit:  { name: 'Space suit', note: AIR_TIMES.map((s) => `${s}s of air outside`), costs: [{ wood: 10, stone: 10 }, { redCrystal: 12, stone: 10 }, { gold: 8, redCrystal: 12 }] },
};
for (const u of Object.values(UPGRADES)) u.costs = u.costs.map(remap);

// ------------------------------------------------------------------ game state
const bag = {};
const tools = { pick: 0, axe: 0, bag: 0, suit: 0 };
const skills = { mine: 0, chop: 0 };
let rescued = 0, restore = 0, hudDirty = true, incoming = 0, badge = false;
const retired = new Set(); // raw materials nothing on the planet needs any more

// ------------------------------------------------------------------ helpers
function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const matCache = {};
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache[key]) matCache[key] = new THREE.MeshLambertMaterial({ color, ...opts });
  return matCache[key];
}
function mesh(geo, color, opts) { const m = new THREE.Mesh(geo, mat(color, opts)); m.castShadow = true; m.receiveShadow = true; return m; }

// ------------------------------------------------------------------ renderer + scene
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
scene.add(new THREE.HemisphereLight(0xf2f7ff, 0x8a6e5a, 1.25));
const sun = new THREE.DirectionalLight(0xfff2de, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(-0.45, 1, 0.35).normalize();

// ------------------------------------------------------------------ bubbles (the living zones)
const MAX_B = 24;
const bubbleU = { value: Array.from({ length: MAX_B }, () => new THREE.Vector3(0, 0, 0)) };
const bubbleN = { value: 0 };
const timeU = { value: 0 };
const gens = P.generators.map((g) => ({ ...g, level: g.built ? 0 : -1, r: 0, rShown: g.built ? g.radii[0] : 0 }));
function bubbleList() { return gens.filter((g) => g.level >= 0 && g.rShown > 0.1); }
function syncBubbleUniforms() {
  const list = bubbleList();
  bubbleN.value = list.length;
  list.forEach((g, i) => bubbleU.value[i].set(g.x, g.z, g.rShown));
}
// 0 = dead, 1 = alive
function aliveAt(x, z) {
  let a = 0;
  for (const g of gens) if (g.level >= 0 && g.rShown > 0) a = Math.max(a, smooth(g.rShown + 0.2, g.rShown - 1.2, Math.hypot(x - g.x, z - g.z)));
  return a;
}
const SHADER_NOISE = `
  vec2 h2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    float a = h2(i).x, b = h2(i + vec2(1, 0)).x, c = h2(i + vec2(0, 1)).x, d = h2(i + vec2(1, 1)).x;
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
  float crack(vec2 p) { vec2 n = floor(p), f = fract(p); float m1 = 8.0, m2 = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)); vec2 r = g + h2(n + g) - f; float d = dot(r, r);
      if (d < m1) { m2 = m1; m1 = d; } else if (d < m2) m2 = d; }
    return sqrt(m2) - sqrt(m1); }
  uniform vec3 uB[${MAX_B}]; uniform int uN; uniform float uTime;
  float aliveF(vec2 p, out float glow) { float a = 0.0; glow = 0.0;
    for (int i = 0; i < ${MAX_B}; i++) { if (i >= uN) break; float d = distance(p, uB[i].xy); float r = uB[i].z;
      a = max(a, smoothstep(r + 0.2, r - 1.2, d)); glow = max(glow, 1.0 - smoothstep(0.0, 0.8, abs(d - r))); }
    return a; }
`;

// ------------------------------------------------------------------ the planet surface
const groundMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
groundMat.onBeforeCompile = (s) => {
  s.uniforms.uB = bubbleU; s.uniforms.uN = bubbleN; s.uniforms.uTime = timeU;
  s.vertexShader = 'varying vec3 vW;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  s.fragmentShader = 'varying vec3 vW;\n' + SHADER_NOISE + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    vec2 p = vW.xz;
    float glow; float a = aliveF(p, glow);
    float n = vnoise(p * 0.18) * 0.6 + vnoise(p * 0.7) * 0.4;
    float cr = smoothstep(0.0, 0.07, crack(p * 0.32));
    vec3 dead = mix(${glsl3(LOOK.dead[0])}, ${glsl3(LOOK.dead[1])}, n);
    dead = mix(${glsl3(LOOK.dead[2])}, dead, cr);
    vec3 grass = mix(${glsl3(LOOK.grass[0])}, ${glsl3(LOOK.grass[1])}, n);
    grass *= 0.94 + 0.08 * vnoise(p * 1.7);
    vec3 col = mix(dead, grass, a);
    col += vec3(0.25, 0.95, 1.0) * glow * 0.55;
    diffuseColor.rgb = col;`);
};
const WORLD_R = P.radius + 4;
const ground = new THREE.Mesh(new THREE.CircleGeometry(WORLD_R, 96), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
{
  // the planet's rim, fading into space
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(WORLD_R, WORLD_R * 0.82, 10, 96, 1, true), mat(LOOK.rim));
  rim.position.y = -5;
  scene.add(rim);
  const under = new THREE.Mesh(new THREE.ConeGeometry(WORLD_R * 0.82, 26, 48), mat(LOOK.under));
  under.rotation.x = Math.PI; under.position.y = -23;
  scene.add(under);
  // stars below and around the little planet
  const pts = [];
  const r = rng(7);
  for (let i = 0; i < 900; i++) {
    const a = r() * Math.PI * 2, d = 80 + r() * 160;
    pts.push(Math.cos(a) * d, -40 - r() * 80, Math.sin(a) * d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#dfe8ff', size: 0.9, sizeAttenuation: true })));
}

// ------------------------------------------------------------------ the river (lava outside, water inside)
const river = P.river;
function riverInfo(x, z) {
  // distance to the river's centre line and the direction it runs at the closest point
  let best = Infinity, tx = 1, tz = 0, side = 1;
  for (let i = 0; i < river.points.length - 1; i++) {
    const [ax, az] = river.points[i], [bx, bz] = river.points[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; const L = Math.sqrt(L2); tx = dx / L; tz = dz / L; side = Math.sign(dx * (z - az) - dz * (x - ax)) || 1; }
  }
  return { d: best, tx, tz, side };
}
{
  // a ribbon mesh along a smoothed river path
  const pts = [];
  for (let i = 0; i < river.points.length - 1; i++) {
    const [ax, az] = river.points[i], [bx, bz] = river.points[i + 1];
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5);
    for (let s = 0; s < steps; s++) pts.push([lerp(ax, bx, s / steps), lerp(az, bz, s / steps)]);
  }
  pts.push(river.points[river.points.length - 1]);
  // smooth the corners
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i < pts.length - 1; i++) pts[i] = [(pts[i - 1][0] + pts[i][0] * 2 + pts[i + 1][0]) / 4, (pts[i - 1][1] + pts[i][1] * 2 + pts[i + 1][1]) / 4];
  const pos = [], uv = [], idx = [];
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    const w = river.width / 2 * (0.92 + 0.16 * Math.sin(i * 0.7));
    if (i > 0) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    pos.push(pts[i][0] - tz * w, 0.03, pts[i][1] + tx * w, pts[i][0] + tz * w, 0.03, pts[i][1] - tx * w);
    uv.push(along, 0, along, 1);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const rm = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uB: bubbleU, uN: bubbleN, uTime: timeU },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: SHADER_NOISE + `varying vec2 vUv; varying vec3 vW;
      void main() {
        float glow; float a = aliveF(vW.xz, glow);
        vec2 q = vec2(vUv.x * 0.35 - uTime * 0.6, vUv.y * 2.2);
        float n = vnoise(q * 1.3) * 0.65 + vnoise(q * 3.1 + 7.0) * 0.35;
        float edge = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
        vec3 lava = mix(${glsl3(LOOK.lava[0])}, ${glsl3(LOOK.lava[1])}, smoothstep(0.55, 0.8, n));
        vec3 water = mix(${glsl3(LOOK.water[0])}, ${glsl3(LOOK.water[1])}, smoothstep(0.62, 0.78, n));
        vec3 col = mix(lava, water, a);
        col = mix(col * 0.82, col, edge);
        col += vec3(0.25, 0.95, 1.0) * glow * 0.4;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const rmesh = new THREE.Mesh(geo, rm);
  rmesh.receiveShadow = false;
  scene.add(rmesh);
}

// ------------------------------------------------------------------ bubble domes
const domeMat = new THREE.ShaderMaterial({
  uniforms: { uTime: timeU },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vY = position.y; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vY;
    void main() { float f = pow(1.0 - abs(dot(vN, vV)), 3.0); float base = 1.0 - smoothstep(0.0, 0.08, vY);
      float a = f * 0.3 + base * 0.3; gl_FragColor = vec4(vec3(0.2, 0.85, 1.0) * a, a); }`,
});
const domeGeo = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
for (const g of gens) {
  g.dome = new THREE.Mesh(domeGeo, domeMat);
  g.dome.renderOrder = 5;
  g.dome.position.set(g.x, 0, g.z);
  scene.add(g.dome);
}

// ------------------------------------------------------------------ models
function makeTree(seed) {
  const r = rng(seed);
  const grp = new THREE.Group();
  const alive = new THREE.Group(), dead = new THREE.Group();
  const h = 0.9 + r() * 0.5, s = 0.85 + r() * 0.35;
  const trunk = mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.1, 7), '#8a5a35'); trunk.position.y = 0.55;
  alive.add(trunk);
  const greens = LOOK.leaves;
  for (let i = 0; i < 3; i++) {
    const c = mesh(new THREE.ConeGeometry(1.05 - i * 0.24, 1.25, 8), greens[(i + Math.floor(r() * 3)) % 3]);
    c.position.y = 1.15 + i * 0.62;
    alive.add(c);
  }
  alive.scale.set(s, s * h, s);
  const dt = mesh(new THREE.CylinderGeometry(0.08, 0.16, 1.9, 6), '#6e5446'); dt.position.y = 0.95; dt.rotation.z = (r() - 0.5) * 0.2;
  dead.add(dt);
  for (let i = 0; i < 2; i++) {
    const b = mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.8, 5), '#6e5446');
    b.position.set((i ? -1 : 1) * 0.22, 1.1 + i * 0.35, 0); b.rotation.z = (i ? 1 : -1) * 0.9;
    dead.add(b);
  }
  grp.add(alive, dead);
  grp.userData = { alive, dead, lively: true };
  return grp;
}
function makeBoulder(seed) {
  const r = rng(seed);
  const grp = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(0.9, 0);
  const m = mesh(geo, r() < 0.5 ? '#a7adb8' : '#9aa1ad', { flatShading: true });
  m.scale.set(1 + r() * 0.3, 0.7 + r() * 0.25, 1 + r() * 0.3); m.position.y = 0.45; m.rotation.y = r() * 6;
  const m2 = mesh(new THREE.IcosahedronGeometry(0.5, 0), '#b7bdc7', { flatShading: true });
  m2.position.set(0.7, 0.3, 0.3);
  grp.add(m, m2);
  return grp;
}
function makeCrystal(seed, color = '#ef4b5f') {
  const r = rng(seed);
  const grp = new THREE.Group();
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = 0.8 + r() * 1.3;
    const c = mesh(new THREE.OctahedronGeometry(0.32, 0), color, { flatShading: true, emissive: color, emissiveIntensity: 0.12 });
    c.scale.set(1, h * 1.6, 1);
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 0.35 + r() * 0.35;
    c.position.set(Math.cos(a) * d, h * 0.45, Math.sin(a) * d);
    c.rotation.set((r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6);
    grp.add(c);
  }
  return grp;
}
function makeIce(seed) {
  const r = rng(seed);
  const grp = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const m = mesh(new THREE.IcosahedronGeometry(0.55 + r() * 0.35, 0), i ? '#d9f4ff' : '#bfeaff', { flatShading: true, transparent: true, opacity: 0.88, emissive: '#9fdcff', emissiveIntensity: 0.12 });
    const a = r() * Math.PI * 2; m.position.set(i ? Math.cos(a) * 0.55 : 0, 0.42 + r() * 0.2, i ? Math.sin(a) * 0.55 : 0); m.scale.set(1, 1.3 + r() * 0.5, 1); m.rotation.y = r() * 6;
    grp.add(m);
  }
  return grp;
}
function makeShroom(seed) {
  const r = rng(seed);
  const grp = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const h = 0.5 + r() * 0.7, cs = 0.35 + r() * 0.35;
    const stem = mesh(new THREE.CylinderGeometry(0.1, 0.14, h, 7), '#efe6d8');
    const cap = mesh(new THREE.SphereGeometry(cs, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#b48ef0', { emissive: '#b48ef0', emissiveIntensity: 0.3 });
    const a = r() * Math.PI * 2, d = i ? 0.45 : 0;
    stem.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); cap.position.set(Math.cos(a) * d, h, Math.sin(a) * d);
    grp.add(stem, cap);
  }
  return grp;
}
// the model for a node of any material
function nodeModel(matId, seed) {
  switch (matId) {
    case 'wood': return makeTree(seed);
    case 'stone': return makeBoulder(seed);
    case 'gold': return makeOre(seed);
    case 'ice': return makeIce(seed);
    case 'mushroom': return makeShroom(seed);
    default: return makeCrystal(seed, MATERIALS[matId].color);
  }
}
function makeOre(seed) {
  const grp = makeBoulder(seed);
  const r = rng(seed + 3);
  grp.children[0].material = mat('#6f7480', { flatShading: true });
  for (let i = 0; i < 6; i++) {
    const g = mesh(new THREE.DodecahedronGeometry(0.17, 0), '#f5c542', { flatShading: true, emissive: '#f5c542', emissiveIntensity: 0.15 });
    const a = r() * Math.PI * 2;
    g.position.set(Math.cos(a) * 0.75, 0.35 + r() * 0.45, Math.sin(a) * 0.65);
    grp.add(g);
  }
  return grp;
}
function makeRock(seed) {
  const r = rng(seed);
  const grp = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const m = mesh(new THREE.DodecahedronGeometry(1.4 + r() * 1.2, 0), i ? '#7b7f88' : '#8d9099', { flatShading: true });
    m.position.set((r() - 0.5) * 2.5, 0.6 + r(), (r() - 0.5) * 2.5);
    m.scale.y = 0.7 + r() * 0.4;
    grp.add(m);
  }
  return grp;
}
function makeAstronaut(helmet = '#3d8bff') {
  const grp = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.42, 0.35, 6, 12), '#f4f6fb'); body.position.y = 0.85;
  const pack = mesh(new THREE.BoxGeometry(0.5, 0.55, 0.28), '#dfe4ee'); pack.position.set(0, 0.95, -0.38);
  const head = mesh(new THREE.SphereGeometry(0.5, 20, 14), helmet); head.position.y = 1.55;
  const visor = mesh(new THREE.SphereGeometry(0.36, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#e8f4ff', { emissive: '#bfe6ff', emissiveIntensity: 0.35 });
  visor.rotation.x = Math.PI / 2; visor.position.set(0, 1.55, 0.22); visor.scale.set(1, 0.8, 0.7);
  const legL = mesh(new THREE.CapsuleGeometry(0.13, 0.2, 4, 8), '#e4e8f0'); legL.position.set(-0.18, 0.28, 0);
  const legR = legL.clone(); legR.position.x = 0.18;
  const arm = new THREE.Group(); arm.position.set(0.48, 1.0, 0.05);
  const armMesh = mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 8), '#f4f6fb'); armMesh.position.y = -0.18;
  const tool = new THREE.Group();
  const handle = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 5), '#8a5a35'); handle.position.y = -0.45;
  const headT = mesh(new THREE.BoxGeometry(0.55, 0.1, 0.12), '#9aa1ad'); headT.position.y = -0.8;
  tool.add(handle, headT); arm.add(armMesh, tool);
  grp.add(body, pack, head, visor, legL, legR, arm);
  grp.userData = { legL, legR, arm, toolHead: headT, body };
  return grp;
}
function makeGenerator() {
  const grp = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.9, 1.15, 0.45, 18), '#eef1f6'); base.position.y = 0.22;
  const ring = mesh(new THREE.TorusGeometry(0.85, 0.07, 6, 24), '#3d8bff'); ring.rotation.x = Math.PI / 2; ring.position.y = 0.47;
  const post = mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.1, 10), '#dfe4ee'); post.position.y = 1.0;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12), new THREE.MeshBasicMaterial({ color: '#7ff4ff' }));
  orb.position.y = 1.8;
  const cap = mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.18, 12), '#eef1f6'); cap.position.y = 1.5;
  const pips = new THREE.Group(); pips.position.y = 0.48;
  grp.add(base, ring, post, cap, orb, pips);
  grp.userData = { orb, pips };
  return grp;
}
function setPips(grp, n, max) {
  const pips = grp.userData.pips;
  while (pips.children.length) pips.remove(pips.children[0]);
  for (let i = 0; i < max; i++) {
    const p = mesh(new THREE.SphereGeometry(0.11, 10, 8), i < n ? '#7ff4ff' : '#9aa1ad', i < n ? { emissive: '#7ff4ff', emissiveIntensity: 0.6 } : {});
    const a = (i / max) * Math.PI * 2 + Math.PI / 2;
    p.position.set(Math.cos(a) * 1.02, 0, Math.sin(a) * 1.02);
    pips.add(p);
  }
}
function makeSign() {
  const grp = new THREE.Group();
  const post = mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 6), '#8a5a35'); post.position.y = 0.6;
  const board = mesh(new THREE.BoxGeometry(1.3, 0.55, 0.12), '#c08a52'); board.position.y = 1.15; board.rotation.z = -0.06;
  const tip = mesh(new THREE.ConeGeometry(0.3, 0.35, 4), '#c08a52'); tip.rotation.z = -Math.PI / 2; tip.position.set(0.8, 1.15, 0);
  grp.add(post, board, tip);
  return grp;
}
function makeFrame(r = 1.2) {
  // a dashed outline showing where something will be built
  const grp = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    if (i % 2) continue;
    const a = (i / 12) * Math.PI * 2;
    const seg = mesh(new THREE.BoxGeometry(0.5, 0.08, 0.14), '#ffffff', { transparent: true, opacity: 0.85 });
    seg.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r); seg.rotation.y = -a + Math.PI / 2;
    grp.add(seg);
  }
  return grp;
}
function makeExtractor(color) {
  const grp = new THREE.Group();
  grp.add(makeCrystal(91, color));
  const ring = mesh(new THREE.TorusGeometry(1.5, 0.16, 8, 28), '#e4e8f0'); ring.rotation.x = Math.PI / 2; ring.position.y = 1.9;
  grp.add(ring);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(new THREE.BoxGeometry(0.22, 2.1, 0.22), '#9aa1ad'); leg.position.set(Math.cos(a) * 1.5, 1.0, Math.sin(a) * 1.5);
    grp.add(leg);
  }
  const drill = mesh(new THREE.ConeGeometry(0.35, 0.8, 8), '#3d8bff'); drill.position.y = 1.6; drill.rotation.x = Math.PI;
  grp.add(drill);
  grp.userData = { ring, drill };
  return grp;
}
function makeWorkbench() {
  const grp = new THREE.Group();
  const pad = mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.08, 24), '#3d8bff'); pad.position.y = 0.04;
  const top = mesh(new THREE.BoxGeometry(2.2, 0.18, 1.1), '#c08a52'); top.position.set(0, 0.95, -1.0);
  grp.add(pad, top);
  for (const x of [-0.95, 0.95]) for (const z of [-1.4, -0.6]) { const l = mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), '#8a5a35'); l.position.set(x, 0.45, z); grp.add(l); }
  const anvil = mesh(new THREE.BoxGeometry(0.6, 0.3, 0.35), '#6f7480'); anvil.position.set(-0.4, 1.2, -1.0);
  const gear = mesh(new THREE.TorusGeometry(0.25, 0.08, 6, 8), '#f5c542'); gear.position.set(0.5, 1.3, -1.0);
  grp.add(anvil, gear);
  return grp;
}
function makeRocket() {
  const grp = new THREE.Group();
  const pad = mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.3, 24), '#9aa1ad'); pad.position.y = 0.15;
  const body = mesh(new THREE.CylinderGeometry(1.0, 1.15, 4.2, 20), '#f4f6fb'); body.position.y = 2.6;
  const nose = mesh(new THREE.ConeGeometry(1.0, 1.8, 20), '#ef4b5f'); nose.position.y = 5.6;
  const win = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 18), '#3d8bff', { emissive: '#7fc4ff', emissiveIntensity: 0.3 }); win.rotation.x = Math.PI / 2; win.position.set(0, 3.4, 1.02);
  const band = mesh(new THREE.CylinderGeometry(1.06, 1.06, 0.3, 20), '#ef4b5f'); band.position.y = 1.4;
  grp.add(pad, body, nose, win, band);
  const fins = [];
  for (let i = 0; i < 3; i++) {
    const f = mesh(new THREE.BoxGeometry(0.16, 1.4, 1.1), '#ef4b5f');
    const a = (i / 3) * Math.PI * 2;
    f.position.set(Math.cos(a) * 1.15, 1.1, Math.sin(a) * 1.15); f.rotation.y = -a;
    grp.add(f); fins.push(f);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.4, 14), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9 }));
  flame.rotation.x = Math.PI; flame.position.y = -0.6; flame.visible = false;
  grp.add(flame);
  grp.userData = { fins, flame, body, nose };
  return grp;
}
// bridge looks: wood and stone, glowing crystal, or solid gold
const BRIDGE_LOOK = {
  wood: { a: '#b07a45', b: '#9c6a3b', post: '#7d5230', rail: '#8a5a35', opts: {} },
  crystal: { a: '#ff7a8f', b: '#ef4b5f', post: '#ff9fb0', rail: '#ffc2cd', opts: { emissive: '#ef4b5f', emissiveIntensity: 0.35, transparent: true, opacity: 0.92 }, crystal: true },
  gold: { a: '#ffd65a', b: '#f5c542', post: '#d9a520', rail: '#ffe58a', opts: { emissive: '#c99a1c', emissiveIntensity: 0.15 } },
  blue: { a: '#7fbcff', b: '#4fa8ff', post: '#a8d4ff', rail: '#cfe6ff', opts: { emissive: '#4fa8ff', emissiveIntensity: 0.35, transparent: true, opacity: 0.92 }, crystal: true },
};
function makeBridge(repaired, tx, tz, kind = 'wood') {
  // built in a local frame where the river runs along X and you walk across it along Z
  const L = BRIDGE_LOOK[kind] || BRIDGE_LOOK.wood;
  const grp = new THREE.Group();
  const half = river.width / 2 + 1.2;
  const n = Math.round((half * 2) / 0.48);
  for (let i = 0; i <= n; i++) {
    if (!repaired && (i % 3 === 1 || (i > n * 0.3 && i < n * 0.7))) continue;
    const pl = mesh(new THREE.BoxGeometry(2.6, 0.14, 0.42), i % 2 ? L.a : L.b, L.opts);
    pl.position.set(repaired ? 0 : (i % 2 ? 0.15 : -0.1), 0.32, -half + i * 0.48);
    if (!repaired) pl.rotation.y = (i % 2 ? 0.12 : -0.08);
    grp.add(pl);
  }
  for (const sx of [-1.4, 1.4]) for (const sz of [-half, half]) {
    const post = L.crystal ? mesh(new THREE.OctahedronGeometry(0.4, 0), L.post, { ...L.opts, flatShading: true }) : mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.2, 6), L.post, L.opts);
    post.position.set(sx, L.crystal ? 0.9 : 0.6, sz);
    if (L.crystal) post.scale.set(0.7, 1.6, 0.7);
    grp.add(post);
  }
  if (repaired) for (const sx of [-1.4, 1.4]) { const rail = mesh(new THREE.BoxGeometry(0.1, 0.1, half * 2), L.rail, L.opts); rail.position.set(sx, 1.1, 0); grp.add(rail); }
  if (repaired && L.crystal) for (let i = 1; i < 6; i++) for (const sx of [-1.4, 1.4]) {
    const sp = mesh(new THREE.OctahedronGeometry(0.16, 0), L.post, { ...L.opts, flatShading: true });
    sp.position.set(sx, 1.25, -half + (i * half * 2) / 6); sp.scale.set(0.7, 1.4, 0.7); grp.add(sp);
  }
  grp.rotation.y = -Math.atan2(tz, tx);
  return grp;
}

// ------------------------------------------------------------------ world objects
const colliders = []; // {x, z, r}
const nodes = [];
{
  let seed = 100;
  const r = rng(P.seed * 13);
  for (const zone of P.zones) {
    for (let i = 0; i < zone.n; i++) {
      let x, z, ok = false;
      for (let t = 0; t < 30 && !ok; t++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * zone.r;
        x = zone.x + Math.cos(a) * d; z = zone.z + Math.sin(a) * d;
        ok = Math.hypot(x, z) < P.radius - 3 && riverInfo(x, z).d > river.width / 2 + 2 &&
          !nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 2.6) &&
          !gens.some((g) => Math.hypot(g.x - x, g.z - z) < 3.5) &&
          Math.hypot(P.rocket.x - x, P.rocket.z - z) > 4.5 && Math.hypot(P.workbench.x - x, P.workbench.z - z) > 3.5 &&
          Math.hypot(P.start.x - x, P.start.z - z) > 2.5 &&
          !P.extractors.some((e) => Math.hypot(e.x - x, e.z - z) < 4) && !P.bridges.some((b) => Math.hypot(b.at[0] - x, b.at[1] - z) < 7) &&
          !P.refiners.some((m) => Math.abs(m.x - x) < 6.5 && Math.abs(m.z - z) < 3.5) && Math.hypot(P.shed.x - x, P.shed.z - z) > 8 && Math.hypot(P.shed.x - x, P.shed.z + 3 - z) > 8 && !(P.hut && Math.hypot(P.hut.x - x, P.hut.z - z) < 7) &&
          Math.hypot(P.workbench.x - x, P.workbench.z - 1.5 - z) > 5.5;
      }
      if (!ok) continue;
      const matId = zone.mat || NODE_MATERIAL[zone.node];
      const type = MATERIALS[matId].node;
      const obj = nodeModel(matId, seed);
      seed++;
      obj.position.set(x, 0, z);
      obj.rotation.y = r() * Math.PI * 2;
      scene.add(obj);
      const node = { type, mat: matId, x, z, obj, hp: MATERIALS[matId].perNode, max: MATERIALS[matId].perNode, regrow: 0, shake: 0, scale: 1, r: type === 'tree' || type === 'shroom' ? 0.55 : 0.95 };
      nodes.push(node);
      colliders.push(node);
    }
  }
  for (let i = 0; i < P.rocks.length; i++) {
    const [x, z] = P.rocks[i];
    const o = makeRock(500 + i); o.position.set(x, 0, z); scene.add(o);
    colliders.push({ x, z, r: 2.6 });
  }
}

// ---- decoration: grass and flowers that only grow inside bubbles, pebbles and twigs outside
const DECO = 2000;
const decoPts = [];
{
  const r = rng(42);
  for (let i = 0; i < DECO; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (P.radius + 1);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (riverInfo(x, z).d < river.width / 2 + 0.5) continue;
    decoPts.push({ x, z, rot: r() * 6, s: 0.7 + r() * 0.6, kind: r() });
  }
}
const grassMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.6, 4), mat(LOOK.deco), decoPts.length * 3);
const flowerMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial(), decoPts.length);
const pebbleMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.22, 0), mat(LOOK.pebble, { flatShading: true }), decoPts.length);
[grassMesh, flowerMesh, pebbleMesh].forEach((m) => { m.receiveShadow = true; scene.add(m); });
{
  const flowerCols = ['#ffffff', '#ffd23f', '#f49ac1', '#b48ef0', '#ff8f6b'];
  const c = new THREE.Color();
  decoPts.forEach((p, i) => flowerMesh.setColorAt(i, c.set(flowerCols[i % flowerCols.length])));
}
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
function updateDeco() {
  decoPts.forEach((p, i) => {
    const a = aliveAt(p.x, p.z);
    for (let b = 0; b < 3; b++) {
      const s = a * p.s * (0.8 + b * 0.15);
      tmpE.set((b - 1) * 0.35, p.rot + b, 0); tmpQ.setFromEuler(tmpE);
      tmpP.set(p.x + (b - 1) * 0.12, 0.25 * s, p.z + (b % 2) * 0.1); tmpS.set(s, s, s);
      grassMesh.setMatrixAt(i * 3 + b, tmpM.compose(tmpP, tmpQ, tmpS));
    }
    const fs = p.kind < 0.3 ? a * p.s : 0;
    tmpP.set(p.x + 0.3, 0.45 * Math.max(fs, 0.01), p.z); tmpS.set(fs, fs, fs); tmpQ.identity();
    flowerMesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
    const ps = p.kind > 0.6 ? (1 - a) * p.s : 0;
    tmpE.set(p.rot, p.rot * 2, 0); tmpQ.setFromEuler(tmpE);
    tmpP.set(p.x, 0.1, p.z); tmpS.set(ps, ps * 0.7, ps);
    pebbleMesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
  });
  grassMesh.instanceMatrix.needsUpdate = flowerMesh.instanceMatrix.needsUpdate = pebbleMesh.instanceMatrix.needsUpdate = true;
  if (flowerMesh.instanceColor) flowerMesh.instanceColor.needsUpdate = true;
}

// ------------------------------------------------------------------ build sites (signposts, generators, extractors, bridge, rocket)
const sites = [];
const sitesEl = document.getElementById('sites');
function addSite(site) {
  site.el = document.createElement('div');
  site.el.className = 'site';
  sitesEl.appendChild(site.el);
  sites.push(site);
  renderSite(site);
  return site;
}
function costTotal(c) { return c ? Object.values(c).reduce((a, b) => a + b, 0) : 0; }
function renderSite(site) {
  const c = site.cost();
  let html = `<b>${site.title()}</b>`;
  const lock = site.locked && site.locked();
  if (lock) html += `<span class="lock">${lock}</span>`;
  else if (!c) html += site.doneText === '' ? '' : `<span class="max">${site.doneText || 'MAX'}</span>`;
  else {
    html += `<span class="row">${site.rowLabel && site.rowLabel() ? `<span class="lbl">${site.rowLabel()}</span>` : ''}`;
    for (const [m, n] of Object.entries(c)) if (n > 0 || (site.showFull && site.showFull())) html += `<span class="cost${(bag[m] || 0) > 0 && n > 0 ? ' have' : ''}">${icon(m, 18)}${site.costText ? site.costText(m, n) : n}</span>`;
    html += '</span>';
  }
  if (site.extra) html += site.extra();
  site.el.innerHTML = html;
}

// --- generators
for (const g of gens) {
  g.model = makeGenerator();
  g.model.position.set(g.x, 0, g.z);
  scene.add(g.model);
  g.frame = makeFrame(1.4); g.frame.position.set(g.x, 0, g.z); scene.add(g.frame);
  g.sign = makeSign(); g.sign.position.set(g.x + 1.8, 0, g.z + 1.2); scene.add(g.sign);
  g.paid = {};
  colliders.push({ x: g.x, z: g.z, r: 1.1, gen: g });
  const site = addSite({
    x: g.x, z: g.z, reach: SITE_REACH,
    title: () => (g.level < 0 ? 'Bubble generator' : `Bubble · LVL ${g.level + 1}`),
    cost: () => {
      const base = g.level < 0 ? g.build : g.costs[g.level];
      if (!base) return null;
      const left = {};
      for (const [m, n] of Object.entries(base)) left[m] = n - (g.paid[m] || 0);
      return left;
    },
    pay: (m) => { g.paid[m] = (g.paid[m] || 0) + 1; },
    complete: () => {
      g.paid = {};
      g.level++;
      sfx.build(); bloomPulse(g);
      toast(g.level === 0 ? 'Bubble generator built!' : g.level === g.radii.length - 1 ? 'Bubble at its biggest (MAX)' : `Bubble grows (LVL ${g.level + 1})`, true);
      refreshGen(g);
    },
  });
  g.site = site;
  refreshGen(g);
}
function refreshGen(g) {
  const built = g.level >= 0;
  g.model.visible = built; g.frame.visible = !built; g.sign.visible = !built;
  if (built) setPips(g.model, g.level + 1, g.radii.length);
  g.r = built ? g.radii[g.level] : 0;
  const c = colliders.find((k) => k.gen === g); if (c) c.r = built ? 1.1 : 0;
}

// --- extractors
const extractors = P.extractors.map((e) => ({ ...e, level: -1, stored: 0, timer: 0, paid: {} }));
for (const ex of extractors) {
  const color = MATERIALS[ex.mat].color;
  ex.model = makeExtractor(color); ex.model.position.set(ex.x, 0, ex.z); scene.add(ex.model);
  ex.deposit = nodeModel(ex.mat, 77); ex.deposit.position.set(ex.x, 0, ex.z); scene.add(ex.deposit);
  ex.sign = makeSign(); ex.sign.position.set(ex.x + 2.2, 0, ex.z + 1.4); scene.add(ex.sign);
  colliders.push({ x: ex.x, z: ex.z, r: 1.3 });
  ex.site = addSite({
    x: ex.x, z: ex.z, reach: 2.2,
    title: () => (ex.level < 0 ? `${MATERIALS[ex.mat].name} extractor` : `Extractor · LVL ${ex.level + 1}`),
    cost: () => {
      const base = ex.level < 0 ? ex.build : ex.costs[ex.level];
      if (!base) return null;
      const left = {};
      for (const [m, n] of Object.entries(base)) left[m] = n - (ex.paid[m] || 0);
      return left;
    },
    extra: () => (ex.level >= 0 ? `<span class="store">${icon(ex.mat, 16)} ${ex.stored}/${ex.levels[ex.level].cap}</span>` : ''),
    pay: (m) => { ex.paid[m] = (ex.paid[m] || 0) + 1; },
    complete: () => { ex.paid = {}; ex.level++; sfx.build(); toast(ex.level === 0 ? 'Extractor built: it mines while you explore' : `Extractor upgraded (LVL ${ex.level + 1})`, true); refreshEx(ex); },
  });
  refreshEx(ex);
}
function refreshEx(ex) {
  const built = ex.level >= 0;
  ex.model.visible = built; ex.deposit.visible = !built; ex.sign.visible = !built;
}

// --- bridges
const bridges = P.bridges.map((def, i) => {
  const [bx, bz] = def.at;
  const info = riverInfo(bx, bz);
  const br = { def, i, repaired: false, paid: {}, tx: info.tx, tz: info.tz };
  br.broken = makeBridge(false, info.tx, info.tz, def.kind); br.broken.position.set(bx, 0, bz); scene.add(br.broken);
  br.whole = makeBridge(true, info.tx, info.tz, def.kind); br.whole.position.set(bx, 0, bz); br.whole.visible = false; scene.add(br.whole);
  br.sign = makeSign(); br.sign.position.set(bx - info.tz * 6 + info.tx * 2, 0, bz + info.tx * 6 + info.tz * 2); scene.add(br.sign);
  br.site = addSite({
    x: bx - info.tz * 6, z: bz + info.tx * 6, reach: 1.6,
    title: () => (def.kind === 'crystal' || def.kind === 'blue' ? 'Broken crystal bridge' : def.kind === 'gold' ? 'Broken golden bridge' : 'Broken bridge'),
    cost: () => { if (br.repaired) return null; const left = {}; for (const [m, n] of Object.entries(def.cost)) left[m] = n - (br.paid[m] || 0); return left; },
    pay: (m) => { br.paid[m] = (br.paid[m] || 0) + 1; },
    complete: () => { br.repaired = true; sfx.build(); toast('Bridge repaired! You can cross the river here.', true); refreshBridge(br); },
    hideWhenDone: true,
  });
  return br;
});
function refreshBridge(br) { br.broken.visible = !br.repaired; br.whole.visible = br.repaired; br.sign.visible = !br.repaired; }

// --- refining machines: a long machine with a LOAD end (west) and a PICKUP end (east)
const refiners = P.refiners.map((def) => ({ ...def, repaired: false, paid: {}, loaded: {}, out: 0, t: 0, level: 0, upPaid: {} }));
// LVL 1 after repair, then two upgrades: faster, and bigger loads and trays
const RF_SPEED = [1, 0.7, 0.5], RF_SIZE = [1, 1.5, 2];
const rfSecs = (rf) => rf.secs * RF_SPEED[rf.level];
const rfHold = (rf) => Math.round(rf.hold * RF_SIZE[rf.level]);
const rfStore = (rf) => Math.round(rf.store * RF_SIZE[rf.level]);
const rfMax = (rf) => rf.level >= rf.upgrades.length;
function makeRefiner(def) {
  const grp = new THREE.Group();
  const bodyCol = def.id === 'smelter' ? '#8a8f9a' : def.id === 'kiln' ? '#c97b5a' : '#e8ecf3';
  const deck = mesh(new THREE.BoxGeometry(7.2, 0.5, 2.4), '#dfe4ee'); deck.position.y = 0.25;
  const belt = mesh(new THREE.BoxGeometry(7.0, 0.12, 1.2), '#4b5160'); belt.position.y = 0.56;
  // the hopper you load at the west end
  const hopper = mesh(new THREE.CylinderGeometry(1.0, 0.5, 1.2, 4), '#9aa1ad', { flatShading: true }); hopper.position.set(-2.6, 1.4, 0); hopper.rotation.y = Math.PI / 4;
  const inPad = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.06, 20), '#3d8bff'); inPad.position.set(-4.4, 0.03, 0);
  // the furnace in the middle
  const body = mesh(new THREE.BoxGeometry(2.2, 1.9, 2.0), bodyCol); body.position.set(0, 1.45, 0);
  const cap = mesh(new THREE.ConeGeometry(1.0, 0.8, 4), '#3d8bff', { flatShading: true }); cap.position.set(0, 2.8, 0); cap.rotation.y = Math.PI / 4;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshBasicMaterial({ color: '#5ff2ff' })); glow.position.set(0, 1.4, 1.02);
  // the pickup tray at the east end
  const tray = mesh(new THREE.BoxGeometry(1.8, 0.4, 1.8), '#f5c542'); tray.position.set(2.7, 0.8, 0);
  const outPad = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.06, 20), '#2f9e57'); outPad.position.set(4.4, 0.03, 0);
  const out = mesh(new THREE.OctahedronGeometry(0.32, 0), MATERIALS[def.output].color, { flatShading: true, emissive: MATERIALS[def.output].color, emissiveIntensity: 0.3 });
  out.position.set(2.7, 1.5, 0);
  grp.add(deck, belt, hopper, inPad, body, cap, glow, tray, outPad, out);
  const junk = new THREE.Group();
  for (let i = 0; i < 5; i++) { const j = mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), '#9aa1ad'); j.position.set(-3 + i * 1.5, 0.15, (i % 2 ? 1.6 : -1.6)); j.rotation.y = i; junk.add(j); }
  grp.add(junk);
  grp.userData = { glow, out, cap, body, junk, tray };
  return grp;
}
for (const rf of refiners) {
  rf.model = makeRefiner(rf); rf.model.position.set(rf.x, 0, rf.z); scene.add(rf.model);
  for (const dx of [-2.4, 0, 2.4]) colliders.push({ x: rf.x + dx, z: rf.z, r: 1.15 });
  rf.inX = rf.x - 4.4; rf.outX = rf.x + 4.4;
  const maxIn = (m) => rf.inputs[m] * rfHold(rf);
  rf.site = addSite({
    x: rf.inX, z: rf.z, reach: 1.5,
    title: () => (rf.repaired ? `${rf.name} · load here` : `Broken ${rf.name.toLowerCase()}`),
    cost: () => {
      if (!rf.repaired) { const left = {}; for (const [m, n] of Object.entries(rf.repair)) left[m] = n - (rf.paid[m] || 0); return left; }
      const left = {};
      for (const m of Object.keys(rf.inputs)) left[m] = maxIn(m) - (rf.loaded[m] || 0);
      return left;
    },
    // once repaired, show what's loaded out of what it can hold
    costText: (m, n) => (rf.repaired ? `${rf.loaded[m] || 0}/${maxIn(m)}` : n),
    showFull: () => rf.repaired,
    pay: (m) => { if (!rf.repaired) rf.paid[m] = (rf.paid[m] || 0) + 1; else rf.loaded[m] = (rf.loaded[m] || 0) + 1; },
    complete: () => {
      if (rf.repaired) return; // a full hopper isn't an event
      rf.repaired = true; rf.paid = {}; sfx.build();
      toast(`${rf.name} repaired! Load it at the blue pad, pick up at the green pad.`, true);
      refreshRefiner(rf); renderSite(rf.outSite);
    },
    extra: () => `<span class="recipe">${recipeHtml(rf)}</span>`,
  });
  rf.outSite = addSite({
    x: rf.outX, z: rf.z, reach: 1.5,
    title: () => 'Pickup',
    hidden: () => !rf.repaired,
    cost: () => null, doneText: '',
    extra: () => {
      const pct = Math.round((rf.t / rfSecs(rf)) * 100);
      return `<span class="store">${icon(rf.output, 18)} Ready ${rf.out}/${rfStore(rf)}</span>${canRun(rf) ? `<span class="prog"><i style="width:${pct}%"></i></span>` : rf.out >= rfStore(rf) ? '<span class="lock">Tray full: collect to keep it working</span>' : ''}`;
    },
  });
  // the upgrade sign in front of the machine
  rf.upSign = makeSign(); rf.upSign.position.set(rf.x + 0.8, 0, rf.z + 2.4); scene.add(rf.upSign);
  rf.upSite = addSite({
    x: rf.x, z: rf.z + 2.6, reach: 1.3,
    title: () => `${rf.name} · LVL ${rf.level + 1}${rfMax(rf) ? '' : ' → faster, bigger'}`,
    hidden: () => !rf.repaired,
    cost: () => {
      const base = rf.upgrades[rf.level];
      if (!base) return null;
      const left = {}; for (const [m, n] of Object.entries(base)) left[m] = n - (rf.upPaid[m] || 0); return left;
    },
    pay: (m) => { rf.upPaid[m] = (rf.upPaid[m] || 0) + 1; },
    complete: () => {
      rf.upPaid = {}; rf.level++; sfx.build();
      toast(`${rf.name} upgraded${rfMax(rf) ? ' (MAX)' : ''}: works faster, holds ${rfHold(rf)} loads, tray ${rfStore(rf)}`, true);
      refreshRefiner(rf); renderSite(rf.site); renderSite(rf.outSite);
    },
  });
  refreshRefiner(rf);
}
function recipeHtml(rf) {
  return Object.entries(rf.inputs).map(([m, n]) => `${n}${icon(m, 14)}`).join(' + ') + ` → ${icon(rf.output, 16)}`;
}
function canRun(rf) { return rf.repaired && rf.out < rfStore(rf) && Object.entries(rf.inputs).every(([m, n]) => (rf.loaded[m] || 0) >= n); }
function refreshRefiner(rf) {
  const u = rf.model.userData;
  u.junk.visible = !rf.repaired;
  u.cap.visible = rf.repaired;
  u.body.rotation.z = rf.repaired ? 0 : 0.2;
  u.glow.material.color.set(rf.repaired ? '#5ff2ff' : '#6b7280');
  rf.upSign.visible = rf.repaired && !rfMax(rf);
  // a gold cap once it's maxed out
  u.cap.material = mat(rfMax(rf) ? '#f5c542' : '#3d8bff', { flatShading: true });
}
function updateRefiners(dt, t) {
  for (const rf of refiners) {
    const u = rf.model.userData;
    u.out.visible = rf.repaired && rf.out > 0;
    if (!rf.repaired) continue;
    const running = canRun(rf);
    u.out.rotation.y += dt * 1.5;
    u.out.position.y = 1.5 + Math.sin(t * 2) * 0.1;
    u.glow.scale.setScalar(running ? 1 + Math.sin(t * 10) * 0.15 : 0.8);
    if (running) {
      rf.t += dt;
      if (rf.t >= rfSecs(rf)) {
        rf.t = 0;
        for (const [m, n] of Object.entries(rf.inputs)) rf.loaded[m] -= n;
        rf.out++;
        sfx.pop(); renderSite(rf.site);
      }
      if (Math.random() < dt * 4) renderSite(rf.outSite);
    }
    // touch the pickup pad to collect
    if (rf.out > 0 && Math.hypot(rf.outX - player.x, rf.z - player.z) < 1.5 && bagRoom() > 0 && payT <= 0) {
      rf.out--; payT = 0.1;
      toBag(rf.output, new THREE.Vector3(rf.x + 2.7, 1.5, rf.z));
      renderSite(rf.outSite);
    }
  }
}

// --- rocket
const rocket = { model: makeRocket(), paid: {}, done: false, launching: 0 };
rocket.model.position.set(P.rocket.x, 0, P.rocket.z); scene.add(rocket.model);
colliders.push({ x: P.rocket.x, z: P.rocket.z, r: 2.4 });
rocket.site = addSite({
  x: P.rocket.x, z: P.rocket.z, reach: 3.3,
  title: () => (rocket.done ? 'Rocket ready' : 'Broken rocket'),
  doneText: 'READY',
  locked: () => (restore < P.restoreGoal && !rocket.done ? `Bring ${Math.round(P.restoreGoal * 100)}% of the planet to life first (${pctAlive()}%)` : null),
  cost: () => { if (rocket.done) return null; const left = {}; for (const [m, n] of Object.entries(P.rocket.cost)) left[m] = n - (rocket.paid[m] || 0); return left; },
  pay: (m) => { rocket.paid[m] = (rocket.paid[m] || 0) + 1; },
  complete: () => { rocket.done = true; sfx.fanfare(); toast('Rocket repaired! Launch whenever you are ready.', true); },
});
function refreshRocket() {
  const f = rocket.model.userData.fins;
  const fixed = rocket.done ? 1 : costTotal(rocket.paid) / costTotal(P.rocket.cost);
  f.forEach((fin, i) => { fin.visible = fixed > (i + 1) / 4; });
  rocket.model.userData.nose.rotation.z = rocket.done ? 0 : 0.35 * (1 - fixed);
}

// --- workbench: four signposts around it, one per upgrade, paid like any other sign
const bench = makeWorkbench();
bench.position.set(P.workbench.x, 0, P.workbench.z - 1.5); scene.add(bench);
colliders.push({ x: P.workbench.x, z: P.workbench.z - 2.5, r: 1.2 });
const toolPaid = { pick: {}, axe: {}, bag: {}, suit: {} };
const BENCH_SIGNS = { pick: [-3.6, 1.2], axe: [-1.25, 2.6], bag: [1.25, 2.6], suit: [3.6, 1.2] };
for (const [key, [ox, oz]] of Object.entries(BENCH_SIGNS)) {
  const u = UPGRADES[key];
  const sx = P.workbench.x + ox, sz = P.workbench.z + oz;
  const sign = makeSign(); sign.position.set(sx, 0, sz - 0.6); sign.rotation.y = Math.atan2(ox, oz) * 0.3; scene.add(sign);
  addSite({
    x: sx, z: sz, reach: 1.2,
    title: () => `${u.name}${u.costs[tools[key]] ? ` → ${u.note[tools[key] + 1]}` : `: ${u.note[tools[key]]}`}`,
    cost: () => {
      const base = u.costs[tools[key]];
      if (!base) return null;
      const left = {};
      for (const [m, n] of Object.entries(base)) left[m] = n - (toolPaid[key][m] || 0);
      return left;
    },
    pay: (m) => { toolPaid[key][m] = (toolPaid[key][m] || 0) + 1; },
    complete: () => {
      toolPaid[key] = {};
      tools[key]++;
      if (key === 'suit') player.air = maxAir();
      sfx.build();
      toast(`${u.name} upgraded: ${u.note[tools[key]]}`, true);
      hudDirty = true;
    },
  });
}

// --- storage shed: touch it, then tap a material on the left to store it all or take it back
const shed = { store: {}, open: false, level: -1, paid: {} }; // level -1 = broken
// each level unlocks a stage of items; every item has its own limit (50 raw, 25 refined, 10 manufactured)
const shedStage = () => (shed.level >= 0 ? P.shed.levels[shed.level].stage : -1);
const shedHolds = (m) => MATERIALS[m].stage <= shedStage();
const capOf = (m) => STAGE_CAP[MATERIALS[m].stage];
const shedRoom = (m) => (shedHolds(m) ? Math.max(0, capOf(m) - (shed.store[m] || 0)) : 0);
const shedFull = (m) => shedRoom(m) <= 0;
function makeShed() {
  const grp = new THREE.Group();
  const walls = mesh(new THREE.BoxGeometry(3.2, 2.2, 2.6), '#c08a52'); walls.position.y = 1.1;
  const roof = mesh(new THREE.ConeGeometry(2.6, 1.3, 4), '#ef4b5f', { flatShading: true }); roof.position.y = 2.85; roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.85);
  const door = mesh(new THREE.BoxGeometry(1.0, 1.6, 0.1), '#7d5230'); door.position.set(0, 0.8, 1.32);
  const pad = mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 20), '#f5c542'); pad.position.set(0, 0.03, 2.4);
  const planks = new THREE.Group();
  for (let i = 0; i < 4; i++) { const pl = mesh(new THREE.BoxGeometry(1.6, 0.12, 0.35), '#9c6a3b'); pl.position.set(-1.6 + i * 1.1, 0.08, 1.9 + (i % 2) * 0.4); pl.rotation.y = i * 0.7; planks.add(pl); }
  grp.add(walls, roof, door, pad, planks);
  grp.userData = { roof, walls, planks, pad };
  return grp;
}
shed.model = makeShed(); shed.model.position.set(P.shed.x, 0, P.shed.z); scene.add(shed.model);
colliders.push({ x: P.shed.x, z: P.shed.z, r: 1.6 });
function refreshShed() {
  const u = shed.model.userData, ok = shed.level >= 0;
  u.roof.visible = ok; u.planks.visible = !ok; u.pad.visible = ok;
  u.walls.rotation.z = ok ? 0 : 0.12; u.walls.scale.y = ok ? 1 : 0.7; u.walls.position.y = ok ? 1.1 : 0.77;
}
{ const sg = makeSign(); sg.position.set(P.shed.x + 2.8, 0, P.shed.z + 0.4); scene.add(sg); }
addSite({
  x: P.shed.x + 2.8, z: P.shed.z + 1.2, reach: 1.3,
  title: () => (shed.level < 0 ? 'Broken shed' : `Shed · LVL ${shed.level + 1}`),
  cost: () => {
    const next = P.shed.levels[shed.level + 1];
    if (!next) return null;
    const left = {}; for (const [m, n] of Object.entries(next.cost)) left[m] = n - (shed.paid[m] || 0); return left;
  },
  extra: () => {
    const next = P.shed.levels[shed.level + 1];
    if (!next) return '';
    const newOnes = [...P.materials, ...P.refined].filter((m) => MATERIALS[m].stage === next.stage);
    return `<span class="lock">Stores ${STAGE_NAME[next.stage]} items: ${newOnes.map((m) => icon(m, 14)).join(' ')} up to ${STAGE_CAP[next.stage]} each</span>`;
  },
  pay: (m) => { shed.paid[m] = (shed.paid[m] || 0) + 1; },
  complete: () => {
    shed.paid = {}; shed.level++; refreshShed(); sfx.build();
    toast(shed.level === 0 ? 'Shed repaired! Stand on its yellow pad to store things (50 of each).' : `Shed upgraded: now stores ${STAGE_NAME[shedStage()]} items (${STAGE_CAP[shedStage()]} of each)`, true);
  },
});
refreshShed();
const shedCount = () => Object.values(shed.store).reduce((a, b) => a + b, 0);
const shedEl = document.getElementById('shed');
function shedNear() { return shed.level >= 0 && Math.hypot(P.shed.x - player.x, P.shed.z + 2.4 - player.z) < 1.5; }
function renderShed() {
  let html = `<div class="shead">Shed<span>LVL ${shed.level + 1}</span></div>`;
  for (const m of [...P.materials, ...P.refined]) {
    if (MATERIALS[m].special) continue;
    const b = bag[m] || 0, st = shed.store[m] || 0;
    if (!b && !st) continue;
    if (retired.has(m)) { html += `<button class="srow done" data-m="${m}" aria-label="${MATERIALS[m].name}">${icon(m, 24)}<span><b>${b}</b><i>✓ recycle</i></span></button>`; continue; }
    const ok = shedHolds(m) || st > 0;
    html += `<button class="srow${ok ? '' : ' no'}${ok && st >= capOf(m) ? ' full' : ''}" data-m="${m}" aria-label="${MATERIALS[m].name}">${icon(m, 24)}<span><b>${b}</b><i>${ok ? `${st}/${capOf(m)}` : 'upgrade'}</i></span></button>`;
  }
  html += '<div class="shint">bag · shed<br>tap to store; when it can\'t store, a tap takes some out</div>';
  shedEl.innerHTML = html;
}
shedEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-m]');
  if (!btn) return;
  const m = btn.dataset.m, name = MATERIALS[m].name.toLowerCase();
  if (retired.has(m)) {
    // nothing needs it any more: everything you hand in is recycled, and the shelf is cleared
    const n = (bag[m] || 0) + (shed.store[m] || 0);
    bag[m] = 0; shed.store[m] = 0; sfx.pay(); toast(`Recycled ${n} ${name}: nothing needs it any more`);
    hudDirty = true; renderShed(); return;
  }
  // one tap: store it if any of it can go in; if nothing can, take some out instead
  const canStore = Math.min(bag[m] || 0, shedRoom(m));
  if (canStore > 0) {
    bag[m] -= canStore; shed.store[m] = (shed.store[m] || 0) + canStore;
    sfx.pay(); toast(`Stored ${canStore} ${name}`);
  } else {
    const n = Math.min(shed.store[m] || 0, Math.max(0, bagRoom()));
    if (n > 0) {
      shed.store[m] -= n; bag[m] = (bag[m] || 0) + n;
      sfx.pop();
      toast((bag[m] - n) > 0 ? (shedHolds(m) ? `Shed is full of ${name}, took ${n}` : `Took ${n} ${name}`) : `Took ${n} ${name}`);
    } else if ((bag[m] || 0) > 0 && !shedHolds(m)) { toast(`Upgrade the shed to store ${name}`); sfx.warn(); }
    else if ((bag[m] || 0) > 0 && !(shed.store[m] > 0)) { toast(`The shed is full of ${name}`); sfx.warn(); }
    else if (!(shed.store[m] > 0)) { toast(`No ${name} in the shed`); sfx.warn(); }
    else { toast('Your bag is full'); sfx.warn(); }
  }
  hudDirty = true; renderShed();
});

// --- lost astronauts
const planetColor = SUIT_COLORS[game.planet % SUIT_COLORS.length];
const lost = [
  ...P.astronauts.map(([x, z]) => ({ x, z, color: planetColor, carried: false })),
  ...(game.planet > 0 ? game.crew || [] : []).map((c, k) => ({ x: P.start.x - 1.6 + k * 3.2, z: P.start.z + 2.6, color: c.color, name: c.name, carried: true })),
].map((d, i) => {
  const m = makeAstronaut(d.color);
  m.position.set(d.x, 0, d.z); m.rotation.y = Math.PI;
  scene.add(m);
  const dome = new THREE.Mesh(domeGeo, domeMat); dome.scale.set(1.9, 1.6, 1.9); dome.position.set(d.x, 0, d.z); scene.add(dome);
  const el = document.createElement('div'); el.className = 'help'; el.textContent = 'HELP'; sitesEl.appendChild(el);
  if (d.carried) dome.visible = false;
  return { x: d.x, z: d.z, m, dome, el, state: d.carried ? 'rescued' : 'waiting', i, color: d.color, name: d.name, carried: d.carried };
});
const newLost = lost.filter((a) => !a.carried);
rescued = lost.length - newLost.length;

// ------------------------------------------------------------------ player
const player = { x: P.start.x, z: P.start.z, face: Math.PI, model: makeAstronaut(), swing: 0, swingT: 0, walk: 0, air: AIR_TIMES[0], floating: false, target: null };
player.model.position.set(player.x, 0, player.z);
scene.add(player.model);
const bagCap = () => BAG_SIZES[tools.bag];
const bagCount = () => Object.values(bag).reduce((a, b) => a + b, 0);
// room left, counting pieces already flying toward you
const bagRoom = () => bagCap() - bagCount() - incoming;
function toBag(id, from) {
  incoming++;
  fly(id, from, playerChest, () => { incoming--; bag[id] = (bag[id] || 0) + 1; sfx.pop(); hudDirty = true; });
}
const maxAir = () => AIR_TIMES[tools.suit];
const skillLevel = (k) => Math.min(20, 1 + Math.floor(Math.sqrt(skills[k] / 6)));

// ------------------------------------------------------------------ flying pickups
const flyers = [];
const flyGeo = new THREE.OctahedronGeometry(0.2, 0);
function fly(matId, from, to, onArrive) {
  const m = new THREE.Mesh(flyGeo, mat(MATERIALS[matId].color, { flatShading: true }));
  m.position.copy(from);
  scene.add(m);
  flyers.push({ m, from: from.clone(), to, t: 0, onArrive });
}
function updateFlyers(dt) {
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i];
    f.t += dt / 0.38;
    const tgt = typeof f.to === 'function' ? f.to() : f.to;
    const t = Math.min(1, f.t);
    f.m.position.lerpVectors(f.from, tgt, t);
    f.m.position.y += Math.sin(t * Math.PI) * 1.4;
    f.m.rotation.y += dt * 8;
    if (f.t >= 1) { scene.remove(f.m); flyers.splice(i, 1); f.onArrive && f.onArrive(); }
  }
}
const playerChest = () => new THREE.Vector3(player.x, 1.1, player.z);

// ------------------------------------------------------------------ audio (soft)
const sfx = (() => {
  let ctx = null, muted = false;
  try { muted = localStorage.getItem('bloom-muted') === '1'; } catch (e) {}
  const tone = (f, t0, dur, g, type = 'sine', drop = 0.7) => {
    if (!ctx || muted) return;
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, ctx.currentTime + t0);
    o.frequency.exponentialRampToValueAtTime(f * drop, ctx.currentTime + t0 + dur);
    gn.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
    gn.gain.exponentialRampToValueAtTime(g, ctx.currentTime + t0 + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + dur);
    o.connect(gn).connect(ctx.destination); o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + dur + 0.05);
  };
  return {
    init() { if (!ctx) try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} if (ctx && ctx.state === 'suspended') ctx.resume(); },
    hit(kind) { if (kind === 'chop') tone(180 + Math.random() * 40, 0, 0.12, 0.07, 'triangle', 0.6); else tone(900 + Math.random() * 300, 0, 0.09, 0.04, 'square', 0.8); },
    pop() { tone(620 + Math.random() * 300, 0, 0.08, 0.03); },
    pay() { tone(500 + Math.random() * 120, 0, 0.06, 0.025, 'triangle'); },
    build() { tone(523, 0, 0.5, 0.06); tone(659, 0.08, 0.5, 0.05); tone(784, 0.16, 0.7, 0.05); },
    bloom() { tone(300, 0, 1.2, 0.05, 'sine', 2.2); },
    level() { tone(784, 0, 0.3, 0.05); tone(1047, 0.1, 0.4, 0.05); },
    fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.7, 0.05, 'sine', 0.98)); },
    warn() { tone(330, 0, 0.18, 0.05, 'triangle', 0.9); },
    toggle() { muted = !muted; try { localStorage.setItem('bloom-muted', muted ? '1' : '0'); } catch (e) {} return muted; },
    get muted() { return muted; },
  };
})();

// ------------------------------------------------------------------ input: press anywhere and pull
let drag = null, playing = false;
const stickEl = document.getElementById('stick');
canvas.addEventListener('pointerdown', (e) => {
  if (!playing || drag) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY };
  stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px'; stickEl.classList.remove('gone');
  document.getElementById('hint').classList.add('gone');
});
canvas.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) { drag.cx = e.clientX; drag.cy = e.clientY; } });
const endDrag = (e) => { if (drag && e.pointerId === drag.id) { drag = null; stickEl.classList.add('gone'); } };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag); canvas.addEventListener('lostpointercapture', endDrag);
const keys = {};
addEventListener('keydown', (e) => (keys[e.key] = true));
addEventListener('keyup', (e) => (keys[e.key] = false));
function inputDir() {
  let dx = 0, dz = 0, f = 0;
  if (drag) {
    const R = Math.max(40, Math.min(innerWidth, innerHeight) * 0.11);
    const ddx = drag.cx - drag.sx, ddy = drag.cy - drag.sy, len = Math.hypot(ddx, ddy);
    const kl = Math.min(len, R);
    stickEl.firstElementChild.style.transform = len > 0 ? `translate(${(ddx / len) * kl}px, ${(ddy / len) * kl}px)` : '';
    if (len > 6) { dx = ddx / len; dz = ddy / len; f = Math.min(1, (len - 6) / (R * 0.6)); }
  }
  const kx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0);
  const kz = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0);
  if (kx || kz) { const L = Math.hypot(kx, kz); dx = kx / L; dz = kz / L; f = 1; }
  return { dx, dz, f };
}

// ------------------------------------------------------------------ movement + collisions
function blocked(x, z) {
  if (Math.hypot(x, z) > P.radius - 0.5) return true;
  const ri = riverInfo(x, z);
  if (ri.d < river.width / 2 + 0.35) {
    const onBridge = bridges.some((br) => br.repaired && Math.abs((x - br.def.at[0]) * br.tx + (z - br.def.at[1]) * br.tz) < 1.25 && Math.hypot(x - br.def.at[0], z - br.def.at[1]) < river.width);
    if (!onBridge) return true;
  }
  return false;
}
function resolveColliders() {
  for (const c of colliders) {
    if (!c.r) continue;
    if (c.hp !== undefined && c.hp <= 0) continue;
    const dx = player.x - c.x, dz = player.z - c.z, d = Math.hypot(dx, dz), min = c.r + 0.45;
    if (d < min && d > 0.0001) { player.x = c.x + (dx / d) * min; player.z = c.z + (dz / d) * min; }
  }
}
function movePlayer(dt) {
  if (player.floating) {
    // out of air: the suit floats you gently back to the nearest bubble
    const t = player.target;
    const dx = t.x - player.x, dz = t.z - player.z, d = Math.hypot(dx, dz);
    if (d < 0.3 || (aliveAt(player.x, player.z) > 0.8 && canStand(player.x, player.z))) { player.floating = false; unstick(); toast('Safe inside the bubble. Your bag is just as you left it.'); return; }
    player.x += (dx / d) * FLOAT_HOME * dt; player.z += (dz / d) * FLOAT_HOME * dt;
    player.face = Math.atan2(dx, dz);
    return;
  }
  const { dx, dz, f } = inputDir();
  if (f > 0) {
    const sp = WALK * f * dt;
    const nx = player.x + dx * sp, nz = player.z + dz * sp;
    if (!blocked(nx, nz)) { player.x = nx; player.z = nz; }
    else if (!blocked(nx, player.z)) player.x = nx;
    else if (!blocked(player.x, nz)) player.z = nz;
    const want = Math.atan2(dx, dz);
    let diff = want - player.face; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    player.face += diff * Math.min(1, dt * 14);
    player.walk += dt * 10 * f;
  }
  resolveColliders();
  player.moving = f > 0;
}
// somewhere you can stand: not in a river (unless on a bridge), not inside a machine, rock,
// tree or anything else solid, and inside the planet
function canStand(x, z) {
  if (blocked(x, z)) return false;
  for (const c of colliders) { if (!c.r || (c.hp !== undefined && c.hp <= 0)) continue; if (Math.hypot(x - c.x, z - c.z) < c.r + 0.6) return false; }
  for (const n of nodes) if (n.hp > 0 && Math.hypot(x - n.x, z - n.z) < n.r + 0.6) return false;
  return true;
}
// the closest safe spot to (x, z); inBubble: it must also be well inside a bubble
function findSafe(x, z, inBubble) {
  const ok = (px, pz) => canStand(px, pz) && (!inBubble || aliveAt(px, pz) > 0.8);
  if (ok(x, z)) return { x, z };
  for (let r = 1; r < 140; r += 1) {
    const steps = Math.max(12, Math.round(r * 3));
    for (let k = 0; k < steps; k++) { const a = (k / steps) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (ok(px, pz)) return { x: px, z: pz }; }
  }
  return null;
}
// out of air: the nearest safe spot inside a bubble
function nearestBubblePoint() { return findSafe(player.x, player.z, true); }
// never leave you somewhere you can't walk out of (a river, inside a rock...)
function unstick() {
  if (canStand(player.x, player.z)) return false;
  const p = findSafe(player.x, player.z, false);
  if (p) { player.x = p.x; player.z = p.z; return true; }
  return false;
}

// ------------------------------------------------------------------ gathering
let lastNeedPickToast = 0;
function gather(dt) {
  player.swingT -= dt;
  let target = null, bd = Infinity;
  for (const n of nodes) {
    if (n.hp <= 0 || retired.has(n.mat)) continue;
    const d = Math.hypot(n.x - player.x, n.z - player.z) - n.r;
    if (d < REACH && d < bd) { bd = d; target = n; }
  }
  player.gathering = !!target;
  if (!target) return;
  const m = MATERIALS[target.mat];
  const toolKey = m.skill === 'chop' ? 'axe' : 'pick';
  player.lastTool = toolKey;
  if (tools[toolKey] + 1 < m.tier) {
    if (performance.now() - lastNeedPickToast > 5000) { toast(`${m.name} needs a better ${toolKey === 'pick' ? 'pickaxe' : 'axe'} (workbench)`); lastNeedPickToast = performance.now(); }
    player.gathering = false;
    return;
  }
  if (bagRoom() <= 0) {
    if (performance.now() - lastNeedPickToast > 4000) { toast('Your bag is full: spend it at a sign or the workbench'); lastNeedPickToast = performance.now(); sfx.warn(); }
    player.gathering = false;
    return;
  }
  if (!player.moving) player.face = Math.atan2(target.x - player.x, target.z - player.z);
  if (player.swingT > 0) return;
  const lvl = skillLevel(m.skill);
  player.swingT = BASE_SWING / (TOOL_SPEED[tools[toolKey]] * (1 + 0.05 * (lvl - 1)));
  player.swing = 1;
  target.shake = 1;
  sfx.hit(m.skill);
  target.hp--;
  let got = 1;
  if (Math.random() < 0.04 * (lvl - 1)) got = 2; // skilled hands find extra
  const before = skillLevel(m.skill);
  skills[m.skill] += 1;
  if (skillLevel(m.skill) > before) { sfx.level(); toast(`${m.skill === 'mine' ? 'Mining' : 'Woodcutting'} skill ${skillLevel(m.skill)}: faster swings, more lucky finds`, true); }
  for (let i = 0; i < got && bagRoom() > 0; i++) toBag(target.mat, new THREE.Vector3(target.x, 1.2 + i * 0.4, target.z));
  if (target.hp <= 0) target.regrow = REGROW;
}
function updateNodes(dt) {
  for (const n of nodes) {
    if (n.hp <= 0) {
      n.regrow -= dt;
      n.scale = Math.max(0, n.scale - dt * 3);
      if (n.regrow <= 0) n.hp = n.max;
    } else n.scale = Math.min(1, n.scale + dt * 2);
    n.shake = Math.max(0, n.shake - dt * 5);
    const s = Math.max(0.001, n.scale * (0.75 + 0.25 * (n.hp / n.max)) * (1 + n.shake * 0.08));
    n.obj.scale.set(s, s, s);
    n.obj.rotation.z = Math.sin(n.shake * 20) * 0.05 * n.shake;
    if (n.obj.userData.lively) {
      const a = aliveAt(n.x, n.z);
      const u = n.obj.userData;
      u.alive.visible = a > 0.02; u.dead.visible = a < 0.98;
      u.alive.scale.setScalar(Math.max(0.001, a)); u.dead.scale.setScalar(Math.max(0.001, 1 - a));
    }
  }
}

// ------------------------------------------------------------------ paying into sites
let payT = 0;
function updateSites(dt) {
  payT -= dt;
  for (const s of sites) {
    const c = s.cost();
    const near = Math.hypot(s.x - player.x, s.z - player.z) < s.reach;
    s.near = near;
    if (!near || !c || !s.pay || (s.locked && s.locked())) continue;
    if (payT > 0) continue;
    const need = Object.entries(c).find(([m, n]) => n > 0 && (bag[m] || 0) > 0);
    if (!need) continue;
    const [m] = need;
    bag[m]--; hudDirty = true;
    s.pay(m);
    sfx.pay();
    payT = 0.06;
    fly(m, playerChest(), new THREE.Vector3(s.x, 1.2, s.z));
    renderSite(s);
    const left = s.cost();
    if (left && Object.values(left).every((n) => n <= 0)) { s.complete(); renderSite(s); }
  }
}

// ------------------------------------------------------------------ extractors at work
function updateExtractors(dt) {
  for (const ex of extractors) {
    if (ex.level < 0) continue;
    const L = ex.levels[ex.level];
    const u = ex.model.userData;
    u.ring.rotation.z += dt * (ex.stored < L.cap ? 2 : 0.3);
    u.drill.position.y = 1.5 + Math.sin(performance.now() / 150) * (ex.stored < L.cap ? 0.12 : 0);
    if (ex.stored < L.cap) { ex.timer += dt; if (ex.timer >= L.every) { ex.timer = 0; ex.stored++; renderSite(ex.site); } }
    // walk past to collect
    if (Math.hypot(ex.x - player.x, ex.z - player.z) < 2.2 && ex.stored > 0 && bagRoom() > 0 && payT <= 0 && !retired.has(ex.mat)) {
      ex.stored--; payT = 0.08;
      toBag(ex.mat, new THREE.Vector3(ex.x, 1.8, ex.z));
      renderSite(ex.site);
    }
  }
}

// ------------------------------------------------------------------ bubble growth
function bloomPulse(g) { g.pulse = 1; sfx.bloom(); }
let decoT = 0;
const SAMPLES = (() => { const r = rng(3), a = []; for (let i = 0; i < 4000; i++) { const t = r() * Math.PI * 2, d = Math.sqrt(r()) * P.radius; a.push([Math.cos(t) * d, Math.sin(t) * d]); } return a; })();
// one number for every screen: whole percent, never rounded up to a 100 that isn't real
function pctAlive() { return restore >= 1 ? 100 : Math.min(99, Math.floor(restore * 100)); }
function computeRestore() {
  let n = 0;
  for (const [x, z] of SAMPLES) if (aliveAt(x, z) > 0.5) n++;
  return n / SAMPLES.length;
}
function updateBubbles(dt) {
  let changing = false;
  for (const g of gens) {
    const want = g.level >= 0 ? g.radii[g.level] : 0;
    if (Math.abs(g.rShown - want) > 0.01) { g.rShown += (want - g.rShown) * Math.min(1, dt * 1.6); changing = true; }
    else g.rShown = want;
    g.dome.visible = g.rShown > 0.1;
    g.dome.scale.set(g.rShown, g.rShown * 0.42, g.rShown);
    if (g.level >= 0) {
      const o = g.model.userData.orb;
      g.pulse = Math.max(0, (g.pulse || 0) - dt * 1.5);
      o.scale.setScalar(1 + Math.sin(performance.now() / 300 + g.x) * 0.06 + (g.pulse || 0) * 0.5);
    }
  }
  syncBubbleUniforms();
  decoT -= dt;
  if (changing || decoT <= 0) {
    if (decoT <= 0 || changing) { updateDeco(); restore = computeRestore(); hudDirty = true; }
    decoT = changing ? 0.12 : 1e9;
  }
}

// ------------------------------------------------------------------ air outside the bubbles
const airEl = document.getElementById('air');
function updateAir(dt) {
  const inside = aliveAt(player.x, player.z) > 0.5;
  if (inside) player.air = Math.min(maxAir(), player.air + dt * maxAir() / 1.2);
  else if (!player.floating) {
    player.air -= dt * (P.airDrain || 1);
    if (player.air <= 0) {
      player.air = 0;
      player.target = nearestBubblePoint();
      if (player.target) { player.floating = true; drag = null; stickEl.classList.add('gone'); toast('Out of air: your suit is floating you home'); sfx.warn(); }
    }
  }
  const show = !inside || player.air < maxAir() - 0.05;
  airEl.classList.toggle('gone', !show);
  const frac = player.air / maxAir();
  airEl.style.setProperty('--p', frac);
  airEl.classList.toggle('low', frac < 0.3);
}

// ------------------------------------------------------------------ rescuing astronauts
// ---- crew: rescued astronauts get a job. Gatherers bring one material to the shed;
// explorers wander the dead zone and come back with surprises.
const CREW_NAMES = ['Ava', 'Kai', 'Mira', 'Leo', 'Juno', 'Theo', 'Nova', 'Remy'];
const CREW_SPEED = 4.2, EXPLORE_SPEED = 3.0, CARRY = 5, CREW_HIT = 2.6;
// the crew only fill a raw shelf to 30 of its 50, so there's always room for what you carry
const CREW_SHELF = 30;
const crewFull = (m) => shedFull(m) || (MATERIALS[m].stage === 0 && (shed.store[m] || 0) >= CREW_SHELF);
const crewPut = (m, n) => shedPut(m, MATERIALS[m].stage === 0 ? Math.min(n, Math.max(0, CREW_SHELF - (shed.store[m] || 0))) : n);
// gatherers take the planet's raw materials in order (A, B, C, D), skipping ones that are no
// longer needed or that someone else already gathers. On later planets the 4th crew member explores.
function nextGatherMat(a) {
  const taken = new Set(lost.filter((o) => o !== a && o.state === 'rescued' && o.job && o.job.type === 'gather').map((o) => o.job.mat));
  const order = [P.roles.A, P.roles.B, P.roles.C, P.roles.D];
  return order.find((m) => !retired.has(m) && !taken.has(m)) || order.find((m) => !retired.has(m)) || null;
}
function assignJob(a, job = null) {
  if (!a.name) {
    const used = new Set(lost.map((o) => o.name).filter(Boolean));
    for (let k = 0; k < CREW_NAMES.length; k++) { const n = CREW_NAMES[(k + game.planet * 3) % CREW_NAMES.length]; if (!used.has(n)) { a.name = n; break; } }
  }
  if (job) a.job = job;
  else {
    const crew = lost.filter((o) => o !== a && o.state === 'rescued' && o.job);
    if (game.planet > 0 && crew.length >= 3 && !crew.some((o) => o.job.type === 'explore')) a.job = { type: 'explore' };
    else { const m = nextGatherMat(a); a.job = m ? { type: 'gather', mat: m } : { type: 'explore' }; }
  }
  a.task = 'find'; a.carry = 0; a.t = 0; a.target = null; a.exploring = a.job.type === 'explore';
  crewLabel(a);
}
function crewLabel(a) {
  a.el.innerHTML = a.job.type === 'gather' && !a.exploring ? `${a.name} ${icon(a.job.mat, 14)}` : `${a.name} · ${a.job.type === 'gather' ? 'exploring' : 'explorer'}`;
}
function jobText(a) { return a.job.type === 'gather' ? `They'll gather ${MATERIALS[a.job.mat].name.toLowerCase()} for the shed` : 'They\'ll explore and fill in your map'; }
const SHED_SIDE = riverInfo(P.shed.x, P.shed.z).side;
// crew stay on the shed's side of the river until a bridge is fixed, then they cross by bridge
const sameSide = (x, z) => riverInfo(x, z).side === SHED_SIDE || bridges.some((b) => b.repaired);
function crewGo(a, tx, tz, dt) {
  if (a.crossing) { if (walkTo(a, a.crossing.x, a.crossing.z, dt)) a.crossing = null; return false; }
  const here = riverInfo(a.x, a.z).side, there = riverInfo(tx, tz).side;
  if (here !== there) {
    let best = null, bd = Infinity;
    for (const b of bridges) if (b.repaired) { const d = Math.hypot(b.def.at[0] - a.x, b.def.at[1] - a.z); if (d < bd) { bd = d; best = b; } }
    if (best) {
      const nx = -best.tz, nz = best.tx, half = river.width / 2 + 2.5;
      const e1 = { x: best.def.at[0] + nx * half, z: best.def.at[1] + nz * half }, e2 = { x: best.def.at[0] - nx * half, z: best.def.at[1] - nz * half };
      const mine = riverInfo(e1.x, e1.z).side === here ? e1 : e2, other = mine === e1 ? e2 : e1;
      if (walkTo(a, mine.x, mine.z, dt)) a.crossing = other;
      return false;
    }
  }
  return walkTo(a, tx, tz, dt);
}
const shedPad = () => ({ x: P.shed.x + (Math.random() - 0.5) * 1.2, z: P.shed.z + 2.6 });
function walkTo(a, tx, tz, dt) {
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  if (d < 0.25) return true;
  const sp = Math.min(d, (a.exploring ? EXPLORE_SPEED : CREW_SPEED) * dt);
  a.x += (dx / d) * sp; a.z += (dz / d) * sp; a.m.rotation.y = Math.atan2(dx, dz);
  a.walking = true;
  return false;
}
function shedPut(m, n) {
  const k = Math.min(n, shedRoom(m));
  if (k > 0) { shed.store[m] = (shed.store[m] || 0) + k; if (shed.open) renderShed(); }
  return k;
}
function crewWork(a, dt, t) {
  a.walking = false; a.working = false;
  if (!a.job) assignJob(a);
  if (a.carryPart && hut) {
    if (crewGo(a, P.hut.x + (a.i % 2 ? 0.8 : -0.8), P.hut.z + 2.4, dt)) {
      a.carryPart = false; hut.parts++; sfx.build();
      toast(`${a.name} left a shield part at the hut (${Math.min(2, hut.parts)}/2)`, true);
      hutCheckShield(); refreshHut(); renderSite(hut.site);
    }
  } else
  if (shed.level < 0) {
    // nothing to do until the shed is repaired: wait near it
    if (!a.idleSpot) a.idleSpot = { x: P.shed.x - 3 + a.i * 1.2, z: P.shed.z + 4.5 };
    walkTo(a, a.idleSpot.x, a.idleSpot.z, dt);
  } else if (a.job.type === 'gather' && !a.exploring) {
    if (a.task === 'find' && retired.has(a.job.mat)) {
      // nothing on the planet needs this any more: switch to a material that's still needed
      const m = nextGatherMat(a);
      if (m) { a.job = { type: 'gather', mat: m }; crewLabel(a); if (Math.hypot(a.x - player.x, a.z - player.z) < 40) toast(`${a.name} switched to ${MATERIALS[m].name.toLowerCase()}`); }
      else { a.job = { type: 'explore' }; a.exploring = true; crewLabel(a); }
    } else if (a.task === 'find' && crewFull(a.job.mat)) {
      // the shed has all it can hold of this: go exploring until there's room again
      a.exploring = true; a.task = 'find'; crewLabel(a);
    } else if (a.task === 'find') {
      let best = null, bd = Infinity;
      for (const n of nodes) {
        if (n.mat !== a.job.mat || n.hp <= 0 || (n.claim && n.claim !== a) || aliveAt(n.x, n.z) < 0.6 || !sameSide(n.x, n.z)) continue;
        const d = Math.hypot(n.x - P.shed.x, n.z - P.shed.z);
        if (d < bd && d < 70) { bd = d; best = n; }
      }
      if (best) { a.target = best; best.claim = a; a.task = 'walk'; } else { a.t += dt; if (a.t > 3) a.t = 0; }
    } else if (a.task === 'walk') {
      const n = a.target;
      if (!n || n.hp <= 0) { a.task = a.carry ? 'return' : 'find'; if (n) n.claim = null; }
      else {
        const dx = n.x - a.x, dz = n.z - a.z, d = Math.hypot(dx, dz);
        if (d < n.r + 1.05) { a.task = "work"; a.t = 0; } else crewGo(a, n.x - (dx / d) * (n.r + 0.7), n.z - (dz / d) * (n.r + 0.7), dt);
      }
    } else if (a.task === 'work') {
      const n = a.target;
      a.working = true;
      a.m.rotation.y = Math.atan2(n.x - a.x, n.z - a.z);
      a.t += dt;
      if (a.t > CREW_HIT) {
        a.t = 0;
        if (n.hp > 0) { n.hp--; n.shake = 1; a.carry++; if (n.hp <= 0) n.regrow = REGROW; }
        if (a.carry >= CARRY || n.hp <= 0) { n.claim = null; a.task = 'return'; a.dest = shedPad(); }
      }
    } else if (a.task === 'return') {
      if (!a.dest) a.dest = shedPad();
      if (crewGo(a, a.dest.x, a.dest.z, dt)) {
        const put = crewPut(a.job.mat, a.carry);
        a.carry -= put; a.dest = null;
        a.task = a.carry > 0 ? 'full' : 'find';
      }
    } else if (a.task === 'full') {
      // the shed filled up while they were out: leave the extra and go exploring
      a.carry = 0; a.exploring = true; a.task = 'find'; crewLabel(a);
    }
  } else {
    // explorer
    if (a.task === 'find') {
      let spot = null;
      for (let k = 0; k < 40 && !spot; k++) {
        const ang = Math.random() * Math.PI * 2, d = 20 + Math.random() * (P.radius - 26);
        const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
        if (sameSide(x, z) && riverInfo(x, z).d > river.width / 2 + 2 && (aliveAt(x, z) < 0.3 || (k < 25 && !isSeen(x, z)))) spot = { x, z };
      }
      if (!spot) { const ang = Math.random() * Math.PI * 2; spot = { x: P.shed.x + Math.cos(ang) * 30, z: P.shed.z + Math.sin(ang) * 20 }; if (!sameSide(spot.x, spot.z) || Math.hypot(spot.x, spot.z) > P.radius - 4) spot = { x: P.shed.x + 8, z: P.shed.z + 6 }; }
      a.dest = spot; a.task = 'out';
    } else if (a.task === 'out') {
      if (crewGo(a, a.dest.x, a.dest.z, dt)) { a.task = 'search'; a.t = 0; }
    } else if (a.task === 'search') {
      a.working = true; a.t += dt;
      if (a.t > 4) { a.task = 'return'; a.dest = shedPad(); }
    } else if (a.task === 'return') {
      if (crewGo(a, a.dest.x, a.dest.z, dt)) {
        // finds: a little raw material the shed still has room for, sometimes a refined item,
        // rarely a manufactured one (a little more often when the raw shelves are full)
        const found = {};
        const roomy = P.materials.filter((m) => !crewFull(m) && !retired.has(m));
        const picks = roomy.sort(() => Math.random() - 0.5).slice(0, 2);
        for (const m of picks) found[m] = 2 + Math.floor(Math.random() * 3);
        const rawFull = roomy.length === 0;
        const refinedIds = P.refined.filter((m) => MATERIALS[m].stage === 1), madeIds = P.refined.filter((m) => MATERIALS[m].stage === 2 && !MATERIALS[m].special);
        if (refinedIds.length && Math.random() < (rawFull ? 0.12 : 0.08)) found[refinedIds[Math.floor(Math.random() * refinedIds.length)]] = 1;
        if (madeIds.length && Math.random() < (rawFull ? 0.02 : 0.01)) found[madeIds.filter((m) => !MATERIALS[m].special)[0]] = 1;
        const kept = [];
        for (const [m, n] of Object.entries(found)) { const k = crewPut(m, n); if (k) kept.push(`${k} ${MATERIALS[m].name.toLowerCase()}`); }
        if (kept.length && Math.hypot(a.x - player.x, a.z - player.z) < 40) toast(`${a.name} brought back ${kept.join(', ')}`);
        a.task = 'rest'; a.t = 0;
      }
    } else if (a.task === 'rest') {
      a.t += dt;
      if (a.t > 6) {
        a.task = 'find';
        // a gatherer goes back to work once the shed has room for their material again
        if (a.job.type === 'gather' && !crewFull(a.job.mat) && !retired.has(a.job.mat)) { a.exploring = false; crewLabel(a); }
      }
    }
  }
  // look busy
  const u = a.m.userData;
  a.m.position.set(a.x, a.walking ? Math.abs(Math.sin(t * 9 + a.i)) * 0.08 : 0, a.z);
  u.legL.rotation.x = a.walking ? Math.sin(t * 10 + a.i) * 0.6 : 0; u.legR.rotation.x = -u.legL.rotation.x;
  u.arm.rotation.x = a.working ? -1.6 + Math.abs(Math.sin(t * 4.8 + a.i)) * 1.6 : 0;
  u.arm.rotation.z = 0;
}
const homeSpot = (i) => ({ x: P.workbench.x - 4 + (i % 3) * 1.8, z: P.workbench.z + 2.5 + Math.floor(i / 3) * 1.8 });
function updateLost(dt, t) {
  let followIdx = 0;
  for (const a of lost) {
    if (a.state === 'waiting') {
      a.m.position.y = Math.sin(t * 2 + a.i) * 0.08;
      if (Math.hypot(a.x - player.x, a.z - player.z) < 2.6) { a.state = 'following'; a.dome.visible = false; toast(hut ? 'Found a lost astronaut carrying part of a heat shield for the hut by the rocket! Lead them into a bubble.' : 'Found a lost astronaut! Lead them into a bubble.', true); sfx.level(); }
    } else if (a.state === 'following') {
      followIdx++;
      const back = 1.6 * followIdx;
      const tx = player.x - Math.sin(player.face) * back, tz = player.z - Math.cos(player.face) * back;
      const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
      if (d > 0.2) { const sp = Math.min(d, (WALK + 1.5) * dt * Math.min(1, d)); a.x += (dx / d) * sp; a.z += (dz / d) * sp; a.m.rotation.y = Math.atan2(dx, dz); }
      a.m.position.set(a.x, Math.abs(Math.sin(t * 9)) * 0.08, a.z);
      if (aliveAt(a.x, a.z) > 0.7) {
        a.state = 'rescued'; rescued++;
        assignJob(a);
        sfx.fanfare();
        if (hut) {
          // on planets with a hut, every lost astronaut was carrying half of a heat shield
          a.carryPart = true;
          toast(`${a.name} is safe! They were carrying half of a heat shield and will take it to the hut. ${jobText(a)} after that.`, true);
        } else toast(`${a.name} is safe (${newLost.filter((o) => o.state === 'rescued').length}/${newLost.length})! ${jobText(a)}.`, true);
        a.home = homeSpot(a.i);
        hudDirty = true;
      }
    } else crewWork(a, dt, t);
    a.el.classList.toggle('crew', a.state === 'rescued');
    a.el.classList.toggle('gone', a.state === 'following' || (a.state === 'rescued' && Math.hypot(a.x - player.x, a.z - player.z) > 22));
  }
}

// ------------------------------------------------------------------ HUD
const hudEl = document.getElementById('bagrows');
const capEl = document.getElementById('cap');
const restoreEl = document.getElementById('restore');
const sosEl = document.getElementById('sos');
function updateHUD() {
  capEl.textContent = `${bagCount()}/${bagCap()}`;
  capEl.parentElement.classList.toggle('full', bagCount() >= bagCap());
  hudEl.innerHTML = [...P.materials, ...P.refined].filter((m) => (bag[m] || 0) > 0).map((m) => `<div class="mrow">${icon(m, 20)}<b>${bag[m]}</b></div>`).join('');
  restoreEl.style.setProperty('--p', restore);
  restoreEl.querySelector('b').textContent = badge ? '100% ★' : `${pctAlive()}%`;
  restoreEl.classList.toggle('gold', badge);
  sosEl.textContent = `${newLost.filter((o) => o.state === 'rescued').length}/${newLost.length}`;
  for (const s of sites) renderSite(s);
  if (shed.open) renderShed();
  hudDirty = false;
}
let toastTimer = 0;
const toastEl = document.getElementById('toast');
function toast(text, good = false) {
  toastEl.textContent = text; toastEl.classList.toggle('good', good); toastEl.classList.remove('gone');
  const ms = Math.min(7000, Math.max(2600, 1500 + text.length * 30)); // longer messages stay up longer
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.add('gone'), ms);
}
const v3 = new THREE.Vector3();
function project(x, y, z) { v3.set(x, y, z).project(camera); return [(v3.x * 0.5 + 0.5) * innerWidth, (-v3.y * 0.5 + 0.5) * innerHeight, v3.z]; }
function updateOverlays() {
  for (const s of sites) {
    const d = Math.hypot(s.x - player.x, s.z - player.z);
    const show = d < 24 && !boarding && !rocket.launching && !(s.hideWhenDone && !s.cost()) && !(s.hidden && s.hidden());
    s.el.classList.toggle('gone', !show);
    s.el.classList.toggle('near', !!s.near);
    if (!show) continue;
    const [sx, sy, sz] = project(s.x, 3.2, s.z);
    s.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
    if (sz > 1) s.el.classList.add('gone');
  }
  for (const a of lost) {
    if (a.state === 'following') continue;
    const [sx, sy] = project(a.x, a.state === 'rescued' ? 2.6 : 3.6, a.z);
    a.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
  }
  const [ax, ay] = project(player.x, 2.6, player.z);
  airEl.style.transform = `translate(${ax}px, ${ay}px) translate(-50%, -100%)`;
  const open = shedNear() && playing;
  if (open && !shed.open) renderShed();
  shed.open = open;
  shedEl.classList.toggle('gone', !open);
}


// ------------------------------------------------------------------ the hut (planets after Ember)
// Repair it and upgrade it; at MAX it makes the heat shield the rocket needs. At launch, two of
// the crew stay behind and move in.
function makeHut() {
  const grp = new THREE.Group(), whole = new THREE.Group(), broken = new THREE.Group();
  const wall = mesh(new THREE.BoxGeometry(3.4, 2.2, 2.8), '#c9935a'); wall.position.y = 1.1;
  const roof = mesh(new THREE.ConeGeometry(2.9, 1.6, 4), '#b5553c', { flatShading: true }); roof.position.y = 3.0; roof.rotation.y = Math.PI / 4;
  const door = mesh(new THREE.BoxGeometry(0.9, 1.5, 0.1), '#6b4428'); door.position.set(0, 0.75, 1.42);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.1), new THREE.MeshBasicMaterial({ color: '#ffd77a' })); win.position.set(1.0, 1.4, 1.42);
  const chim = mesh(new THREE.BoxGeometry(0.4, 1.0, 0.4), '#8d8f98'); chim.position.set(-0.9, 3.2, -0.4);
  whole.add(wall, roof, door, win, chim);
  for (let i = 0; i < 6; i++) { const pl = mesh(new THREE.BoxGeometry(0.25, 1.6 - (i % 3) * 0.35, 0.12), '#a8784a'); pl.position.set(-1.5 + i * 0.6, 0.7, 1.3 - (i % 2) * 0.4); pl.rotation.z = (i % 2 ? 0.25 : -0.18); broken.add(pl); }
  const beam = mesh(new THREE.BoxGeometry(3.2, 0.2, 0.2), '#8a5a35'); beam.position.set(0, 0.3, 0); beam.rotation.y = 0.4; broken.add(beam);
  grp.add(whole, broken);
  grp.userData = { whole, broken, win };
  return grp;
}
const hut = P.hut ? { level: -1, paid: {}, shield: false, taken: false, parts: 0 } : null;
const hutMax = () => !!hut && hut.level >= P.hut.levels.length - 1;
// the shield is put together once the hut is at MAX and both astronauts have brought their part
function hutCheckShield() {
  if (hut && !hut.shield && hutMax() && hut.parts >= 2) { hut.shield = true; sfx.fanfare(); toast('The hut put the heat shield together! Take it from the door to the rocket.', true); }
}
function refreshHut() {
  if (!hut) return;
  const u = hut.model.userData;
  u.whole.visible = hut.level >= 0; u.broken.visible = hut.level < 0;
  u.win.material.color.set(hutMax() ? '#ffd77a' : '#7a6a58');
  hut.shieldModel.visible = hut.shield && !hut.taken;
}
if (hut) {
  hut.model = makeHut(); hut.model.position.set(P.hut.x, 0, P.hut.z); scene.add(hut.model);
  colliders.push({ x: P.hut.x, z: P.hut.z, r: 2.0 });
  hut.shieldModel = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.14, 6), '#ff9f43', { emissive: '#ff9f43', emissiveIntensity: 0.6 });
  hut.shieldModel.rotation.x = Math.PI / 2; hut.shieldModel.position.set(P.hut.x, 1.1, P.hut.z + 2.1); scene.add(hut.shieldModel);
  hut.sign = makeSign(); hut.sign.position.set(P.hut.x + 2.7, 0, P.hut.z + 1.4); scene.add(hut.sign);
  hut.site = addSite({
    x: P.hut.x + 2.7, z: P.hut.z + 2.0, reach: 1.3,
    title: () => (hut.level < 0 ? 'Broken hut' : `Hut · LVL ${hut.level + 1}`),
    extra: () => `<span class="store">${icon('heatShield', 16)} Shield parts ${Math.min(2, hut.parts)}/2</span><span class="lock">${hut.shield ? 'Heat shield ready at the door' : 'At MAX, with both parts, it makes the heat shield for the rocket'}</span>`,
    cost: () => { const base = P.hut.levels[hut.level + 1]; if (!base) return null; const left = {}; for (const [m, n] of Object.entries(base)) left[m] = n - (hut.paid[m] || 0); return left; },
    pay: (m) => { hut.paid[m] = (hut.paid[m] || 0) + 1; },
    complete: () => {
      hut.paid = {}; hut.level++; sfx.build();
      if (hutMax() && hut.parts < 2) toast(`Hut at MAX. It's waiting for shield parts (${hut.parts}/2): find the lost astronauts.`, true);
      else if (!hutMax()) toast(hut.level === 0 ? 'Hut repaired! Upgrade it to MAX to make the heat shield.' : 'Hut upgraded', true);
      hutCheckShield();
      refreshHut();
    },
  });
}
function updateHut(t) {
  if (!hut) return;
  if (hut.shieldModel.visible) { hut.shieldModel.position.y = 1.1 + Math.sin(t * 2.5) * 0.12; hut.shieldModel.rotation.z = t; }
  if (hut.shield && !hut.taken && Math.hypot(P.hut.x - player.x, P.hut.z + 2.1 - player.z) < 1.6 && bagRoom() > 0) {
    hut.taken = true; toBag('heatShield', hut.shieldModel.position.clone()); refreshHut();
    toast('Heat shield in your bag: bring it to the rocket', true);
  }
}

// ------------------------------------------------------------------ retired materials
// When nothing left on the planet needs a raw material (no sign, upgrade, rocket part, or a
// machine whose product is still needed), it retires: no more pickups, crew switch jobs, and
// the shed recycles it.
function costLeft(cost, paid, add) { if (cost) for (const [m, n] of Object.entries(cost)) if (n - ((paid && paid[m]) || 0) > 0) add(m); }
function computeRetired() {
  const need = new Set(), add = (m) => need.add(m);
  for (const g of gens) { if (g.level < 0) costLeft(g.build, g.paid, add); for (let k = Math.max(0, g.level); k < g.costs.length; k++) costLeft(g.costs[k], k === g.level ? g.paid : null, add); }
  for (const b of bridges) if (!b.repaired) costLeft(b.def.cost, b.paid, add);
  for (const e of extractors) { if (e.level < 0) costLeft(e.build, e.paid, add); for (let k = Math.max(0, e.level); k < e.costs.length; k++) costLeft(e.costs[k], null, add); }
  for (const r of refiners) { if (!r.repaired) costLeft(r.repair, r.paid, add); for (let k = r.level; k < r.upgrades.length; k++) costLeft(r.upgrades[k], k === r.level ? r.upPaid : null, add); }
  for (let k = shed.level + 1; k < P.shed.levels.length; k++) costLeft(P.shed.levels[k].cost, k === shed.level + 1 ? shed.paid : null, add);
  for (const [key, u] of Object.entries(UPGRADES)) for (let k = tools[key]; k < u.costs.length; k++) costLeft(u.costs[k], k === tools[key] ? toolPaid[key] : null, add);
  if (!rocket.done) costLeft(P.rocket.cost, rocket.paid, add);
  if (hut) for (let k = hut.level + 1; k < P.hut.levels.length; k++) costLeft(P.hut.levels[k], k === hut.level + 1 ? hut.paid : null, add);
  // a machine's inputs are needed for as long as its product is
  for (let pass = 0; pass < 3; pass++) for (const r of refiners) if (need.has(r.output)) for (const m of Object.keys(r.inputs)) need.add(m);
  for (const m of P.materials) if (!need.has(m) && !retired.has(m)) {
    retired.add(m); hudDirty = true; if (shed.open) renderShed();
    if (playing) toast(`${MATERIALS[m].name} isn't needed any more. Recycle what's left at the shed.`, true);
  }
}
let retireT = 0;

// ------------------------------------------------------------------ the planet map (discovery)
// A grid of 2x2 squares over the planet. Squares near you (and near exploring crew) become
// discovered; the map only shows discovered squares and what's on them, live.
const CELL = 2, GN = Math.ceil((P.radius * 2) / CELL) + 2, GOFF = GN / 2;
const seen = new Uint8Array(GN * GN);
let seenCount = 0, mapDirty = true;
const cellOf = (x, z) => [Math.floor(x / CELL + GOFF), Math.floor(z / CELL + GOFF)];
const inPlanetCell = (i, j) => Math.hypot((i + 0.5 - GOFF) * CELL, (j + 0.5 - GOFF) * CELL) < P.radius;
let planetCells = 0;
for (let i = 0; i < GN; i++) for (let j = 0; j < GN; j++) if (inPlanetCell(i, j)) planetCells++;
function reveal(x, z, rad) {
  const [ci, cj] = cellOf(x, z), rc = Math.ceil(rad / CELL);
  for (let i = ci - rc; i <= ci + rc; i++) for (let j = cj - rc; j <= cj + rc; j++) {
    if (i < 0 || j < 0 || i >= GN || j >= GN) continue;
    const k = i * GN + j;
    if (seen[k] || !inPlanetCell(i, j)) continue;
    if (Math.hypot((i + 0.5 - GOFF) * CELL - x, (j + 0.5 - GOFF) * CELL - z) > rad) continue;
    seen[k] = 1; seenCount++; mapDirty = true;
  }
}
const isSeen = (x, z) => { const [i, j] = cellOf(x, z); return i >= 0 && j >= 0 && i < GN && j < GN && seen[i * GN + j] === 1; };
const explored = () => Math.min(100, Math.floor((seenCount / planetCells) * 100));
const REVEAL_YOU = 17, REVEAL_CREW = 10, REVEAL_HOME = 24;
let lastRevealX = 1e9, lastRevealZ = 1e9;
function updateDiscovery() {
  if (Math.hypot(player.x - lastRevealX, player.z - lastRevealZ) > 1) { reveal(player.x, player.z, REVEAL_YOU); lastRevealX = player.x; lastRevealZ = player.z; }
  // explorers chart the planet with their suits as they go
  for (const a of lost) if (a.state === 'rescued' && a.exploring && (a.task === 'out' || a.task === 'search' || a.task === 'return')) {
    if (Math.hypot(a.x - (a.rvx ?? 1e9), a.z - (a.rvz ?? 1e9)) > 1.5) { reveal(a.x, a.z, REVEAL_CREW); a.rvx = a.x; a.rvz = a.z; }
  }
}
// pack / unpack for the save
function packSeen() { let out = ''; for (let k = 0; k < seen.length; k += 6) { let v = 0; for (let b = 0; b < 6; b++) v |= (seen[k + b] || 0) << b; out += String.fromCharCode(48 + v); } return out; }
function unpackSeen(str) { seenCount = 0; for (let c = 0; c < str.length; c++) { const v = str.charCodeAt(c) - 48; for (let b = 0; b < 6; b++) { const k = c * 6 + b; if (k < seen.length) { seen[k] = (v >> b) & 1; seenCount += seen[k]; } } } mapDirty = true; }

const mapEl = document.getElementById('map');
const mapCv = document.getElementById('mapcv');
let paused = false;
function openMap() { if (!playing) return; paused = true; drawMap(); mapEl.classList.remove('gone'); sfx.pop(); }
function closeMap() { paused = false; mapEl.classList.add('gone'); }
document.getElementById('mapbtn').addEventListener('click', () => (paused ? closeMap() : openMap()));
mapEl.addEventListener('click', (e) => { if (e.target === mapEl || e.target.closest('#mapclose')) closeMap(); });
function drawMap() {
  const box = Math.min(innerWidth - 32, innerHeight - 220, 520);
  const dpr = Math.min(2, devicePixelRatio || 1);
  mapCv.width = mapCv.height = Math.round(box * dpr);
  mapCv.style.width = mapCv.style.height = box + 'px';
  const g = mapCv.getContext('2d');
  const S = (box * dpr) / (P.radius * 2 + 6), C0 = (box * dpr) / 2;
  const px = (x) => C0 + x * S, pz = (z) => C0 + z * S;
  g.clearRect(0, 0, mapCv.width, mapCv.height);
  // the planet: unknown space is a dark disc
  g.fillStyle = 'rgba(13,24,52,.55)'; g.beginPath(); g.arc(C0, C0, P.radius * S, 0, Math.PI * 2); g.fill();
  // discovered ground: green where alive, grey where dead; the river as water or lava
  const cs = CELL * S + 0.6;
  for (let i = 0; i < GN; i++) for (let j = 0; j < GN; j++) {
    if (!seen[i * GN + j]) continue;
    const x = (i + 0.5 - GOFF) * CELL, z = (j + 0.5 - GOFF) * CELL;
    const alive = aliveAt(x, z) > 0.5;
    const ri = riverInfo(x, z);
    g.fillStyle = ri.d < river.width / 2 ? (alive ? '#4fb4ea' : '#e0703c') : alive ? '#6fcf5a' : '#8d8f98';
    g.fillRect(px(x - CELL / 2), pz(z - CELL / 2), cs, cs);
  }
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(C0, C0, P.radius * S, 0, Math.PI * 2); g.stroke();
  // markers: circle = bubble generator, square = machine, bar = bridge, triangle = rocket.
  // Red until it's MAX (or fixed), green once it is.
  const R = 5.5 * dpr;
  const col = (done) => (done ? '#2fd06a' : '#ff4d5e');
  const mark = (x, z, shape, done, ang = 0) => {
    if (!isSeen(x, z)) return;
    g.save(); g.translate(px(x), pz(z)); g.rotate(ang);
    g.fillStyle = col(done); g.strokeStyle = '#fff'; g.lineWidth = 1.6 * dpr;
    g.beginPath();
    if (shape === 'circle') g.arc(0, 0, R, 0, Math.PI * 2);
    else if (shape === 'square') g.rect(-R, -R, R * 2, R * 2);
    else if (shape === 'bar') g.rect(-R * 0.55, -R * 1.5, R * 1.1, R * 3);
    else if (shape === 'house') { g.moveTo(0, -R * 1.3); g.lineTo(R, -R * 0.2); g.lineTo(R, R); g.lineTo(-R, R); g.lineTo(-R, -R * 0.2); g.closePath(); }
    else { g.moveTo(0, -R * 1.3); g.lineTo(R * 1.15, R); g.lineTo(-R * 1.15, R); g.closePath(); }
    g.fill(); g.stroke(); g.restore();
  };
  for (const gn of gens) mark(gn.x, gn.z, 'circle', gn.level >= gn.radii.length - 1);
  for (const rf of refiners) mark(rf.x, rf.z, 'square', rf.repaired && rfMax(rf));
  for (const ex of extractors) mark(ex.x, ex.z, 'square', ex.level >= ex.levels.length - 1);
  mark(P.shed.x, P.shed.z, 'square', shed.level >= P.shed.levels.length - 1);
  mark(P.workbench.x, P.workbench.z, 'square', Object.keys(UPGRADES).every((k) => !UPGRADES[k].costs[tools[k]]));
  for (const br of bridges) mark(br.def.at[0], br.def.at[1], 'bar', br.repaired, Math.atan2(br.tz, br.tx));
  mark(P.rocket.x, P.rocket.z, 'tri', rocket.done);
  if (hut) mark(P.hut.x, P.hut.z, 'house', hutMax());
  // you: a blue dot
  g.fillStyle = '#3d8bff'; g.strokeStyle = '#fff'; g.lineWidth = 2.5 * dpr;
  g.beginPath(); g.arc(px(player.x), pz(player.z), 6.5 * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
  document.getElementById('mapstats').innerHTML = `<span>Explored <b>${explored()}%</b></span><span>Alive <b>${badge ? 100 : pctAlive()}%</b></span>`;
  mapDirty = false;
}

// ------------------------------------------------------------------ camera
const camT = new THREE.Vector3(player.x, 0, player.z);
function updateCamera(dt, snap) {
  const aspect = innerWidth / innerHeight;
  const dist = aspect < 1 ? 31 : 24;   // portrait phones see a little more
  const k = snap ? 1 : 1 - Math.exp(-dt * 6);
  camT.x += (player.x - camT.x) * k; camT.z += (player.z - 1.2 - camT.z) * k;
  camera.position.set(camT.x, dist * 0.82, camT.z + dist * 0.57);
  camera.lookAt(camT);
  sun.target.position.copy(camT);
  sun.position.copy(camT).addScaledVector(SUN_DIR, 40);
  const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 100; sc.updateProjectionMatrix();
}

// ------------------------------------------------------------------ astronaut animation
function animatePlayer(dt, t) {
  const u = player.model.userData;
  player.model.position.set(player.x, player.floating ? 0.6 + Math.sin(t * 3) * 0.15 : Math.abs(Math.sin(player.walk)) * 0.12 * (player.moving ? 1 : 0), player.z);
  player.model.rotation.y = player.face;
  const sw = player.moving ? Math.sin(player.walk) * 0.6 : 0;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  player.swing = Math.max(0, player.swing - dt * 5);
  u.arm.rotation.x = player.gathering ? -1.6 + Math.sin(player.swing * Math.PI) * 1.8 : sw * -0.5;
  u.toolHead.material = mat(['#9aa1ad', '#ef4b5f', '#f5c542'][player.gathering && player.lastTool === 'axe' ? tools.axe : tools.pick]);
}

// ------------------------------------------------------------------ save / load
function save() {
  const d = {
    v: 3, x: player.x, z: player.z, bag, tools, skills, rescued, badge,
    gens: gens.map((g) => ({ level: g.level, paid: g.paid })),
    ex: extractors.map((e) => ({ level: e.level, stored: e.stored, paid: e.paid })),
    bridges: bridges.map((b) => ({ repaired: b.repaired, paid: b.paid })),
    refiners: refiners.map((r) => ({ repaired: r.repaired, paid: r.paid, loaded: r.loaded, out: r.out, t: r.t, level: r.level, upPaid: r.upPaid })),
    rocket: { paid: rocket.paid, done: rocket.done, launched: rocket.launched },
    lost: lost.map((a) => ({ state: a.state === 'following' ? 'waiting' : a.state, job: a.job, name: a.name, x: a.x, z: a.z, carryPart: !!a.carryPart })),
    shed: { level: shed.level, paid: shed.paid, store: shed.store }, toolPaid, seen: packSeen(),
    hut: hut ? { level: hut.level, paid: hut.paid, shield: hut.shield, taken: hut.taken, parts: hut.parts } : null,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) {}
}
function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) {}
  if (!d || d.v !== 3) return false;
  player.x = d.x; player.z = d.z;
  Object.assign(bag, d.bag); Object.assign(tools, d.tools); Object.assign(skills, d.skills);
  rescued = d.rescued || 0; badge = !!d.badge;
  d.gens.forEach((s, i) => { if (gens[i]) { gens[i].level = s.level; gens[i].paid = s.paid || {}; gens[i].rShown = s.level >= 0 ? gens[i].radii[s.level] : 0; refreshGen(gens[i]); } });
  d.ex.forEach((s, i) => { if (extractors[i]) { Object.assign(extractors[i], { level: s.level, stored: s.stored, paid: s.paid || {} }); refreshEx(extractors[i]); } });
  (d.bridges || []).forEach((s, i) => { const b = bridges[i]; if (b) { b.repaired = s.repaired; b.paid = s.paid || {}; refreshBridge(b); } });
  (d.refiners || []).forEach((s, i) => { const r = refiners[i]; if (r) { Object.assign(r, { repaired: s.repaired, paid: s.paid || {}, loaded: s.loaded || {}, out: s.out || 0, t: s.t || 0, level: s.level || 0, upPaid: s.upPaid || {} }); refreshRefiner(r); } });
  rocket.paid = d.rocket.paid || {}; rocket.done = d.rocket.done; rocket.launched = !!d.rocket.launched;
  if (d.shed) { shed.level = d.shed.level; shed.paid = d.shed.paid || {}; Object.assign(shed.store, d.shed.store || {}); refreshShed(); }
  if (d.toolPaid) Object.assign(toolPaid, d.toolPaid);
  if (d.seen) unpackSeen(d.seen);
  if (hut && d.hut) { Object.assign(hut, { level: d.hut.level, paid: d.hut.paid || {}, shield: !!d.hut.shield, taken: !!d.hut.taken, parts: d.hut.parts || 0 }); }
  d.lost.forEach((s, i) => {
    const a = lost[i]; if (!a) return;
    if (s.state === 'rescued') { a.state = 'rescued'; a.dome.visible = false; a.home = homeSpot(a.i); a.x = s.x ?? a.home.x; a.z = s.z ?? a.home.z; if (s.name) a.name = s.name; assignJob(a, s.job); a.carryPart = !!s.carryPart; }
  });
  return true;
}
addEventListener('visibilitychange', () => { if (document.hidden && playing) save(); });
addEventListener('pagehide', () => { if (playing) save(); });

// ------------------------------------------------------------------ boarding: a 10-second countdown while
// you and the crew walk to the rocket and climb in through a hatch on its far side
let boarding = null;
let aboard = [], stayers = [];   // who flies on with you, and who stays to live in the hut
const countEl = document.getElementById('countdown');
function startBoarding() {
  if (boarding || rocket.launching) return;
  playing = false; closeMap(); player.moving = false; player.floating = false; drag = null;
  launchEl.classList.add('gone');
  const R = P.rocket, walkers = [];
  const hatch = { x: R.x, z: R.z - 1.7 };     // behind the rocket, out of sight
  const pathFrom = (x, z) => { const side = x >= R.x ? 1 : -1; return [{ x: R.x + side * 3.0, z: R.z - 0.2 }, { x: R.x + side * 1.2, z: R.z - 1.6 }, hatch]; };
  // the rocket takes you and two crew; on planets with a hut, two others stay behind (a random pick)
  const crew = lost.filter((a) => a.state === 'rescued' || a.state === 'following');
  const shuffled = crew.slice().sort(() => Math.random() - 0.5);
  aboard = hut ? shuffled.slice(0, 2) : shuffled;
  stayers = hut ? shuffled.slice(2) : [];
  stayers.forEach((a, k) => { a.el.classList.add('gone'); a.stay = { x: P.hut.x - 1 + k * 2, z: P.hut.z + 3.2 }; });
  let i = 0;
  for (const a of lost) {
    if (!aboard.includes(a)) continue;
    // far-away crew come in from just off screen
    const dx = a.x - R.x, dz = a.z - R.z, d = Math.hypot(dx, dz);
    if (d > 15) { a.x = R.x + (dx / d) * 15; a.z = R.z + (dz / d) * 15; }
    a.el.classList.add('gone');
    walkers.push({ who: a, delay: 0.3 + i * 0.55, path: pathFrom(a.x, a.z), step: 0, inside: false });
    i++;
  }
  walkers.push({ who: 'player', delay: Math.max(2.5, 0.3 + i * 0.55 + 0.6), path: pathFrom(player.x, player.z), step: 0, inside: false });
  boarding = { t: 0, shown: 11, walkers };
  sfx.level();
}
function walkCrew(a, tx, tz, dt, t, speed) {
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz), u = a.m.userData;
  if (d > 0.1) {
    const sp = Math.min(d, speed * dt); a.x += (dx / d) * sp; a.z += (dz / d) * sp;
    a.m.rotation.y = Math.atan2(dx, dz);
    a.m.position.set(a.x, Math.abs(Math.sin(t * 9 + a.i)) * 0.08, a.z);
    u.legL.rotation.x = Math.sin(t * 10 + a.i) * 0.6; u.legR.rotation.x = -u.legL.rotation.x;
  } else { u.legL.rotation.x = u.legR.rotation.x = 0; a.m.position.set(a.x, 0, a.z); a.m.rotation.y = Math.PI; }
  u.arm.rotation.x = 0;
  return d <= 0.1;
}
function updateBoarding(dt, t) {
  const b = boarding;
  b.t += dt;
  const n = Math.max(1, 10 - Math.floor(b.t));
  if (n !== b.shown && b.t < 10) { b.shown = n; countEl.textContent = n; countEl.classList.remove('gone', 'tick'); void countEl.offsetWidth; countEl.classList.add('tick'); sfx.pop(); }
  const [cx, cy] = project(P.rocket.x, 8.2, P.rocket.z);
  countEl.style.left = cx + 'px'; countEl.style.top = cy + 'px'; countEl.style.transform = 'translate(-50%, -100%)';
  for (const w of b.walkers) {
    if (w.inside || b.t < w.delay) continue;
    const isP = w.who === 'player';
    const o = isP ? player : w.who;
    const tgt = w.path[w.step];
    const dx = tgt.x - o.x, dz = tgt.z - o.z, d = Math.hypot(dx, dz);
    const sp = Math.min(d, (isP ? 5.5 : 5.2) * dt);
    if (d > 0.05) { o.x += (dx / d) * sp; o.z += (dz / d) * sp; }
    if (d < 0.15) { w.step++; if (w.step >= w.path.length) { w.inside = true; (isP ? player.model : w.who.m).visible = false; sfx.pay(); continue; } }
    if (isP) { player.face = Math.atan2(dx, dz); player.moving = true; player.walk += dt * 10; player.gathering = false; }
    else {
      const a = w.who, u = a.m.userData;
      a.m.rotation.y = Math.atan2(dx, dz);
      a.m.position.set(a.x, Math.abs(Math.sin(t * 9 + a.i)) * 0.08, a.z);
      u.legL.rotation.x = Math.sin(t * 10 + a.i) * 0.6; u.legR.rotation.x = -u.legL.rotation.x; u.arm.rotation.x = 0;
    }
  }
  for (const a of stayers) walkCrew(a, a.stay.x, a.stay.z, dt, t, 4.5);
  if (b.t >= 10) {
    for (const w of b.walkers) { (w.who === 'player' ? player.model : w.who.m).visible = false; }
    countEl.classList.add('gone');
    boarding = null;
    launch();
  }
}

// ------------------------------------------------------------------ launch (end of the planet)
function launch() {
  rocket.launching = 0.001;
  rocket.launched = true;
  playing = false;
  launchEl.classList.add('gone');
  rocket.model.userData.flame.visible = true;
  sfx.fanfare();
  save();
  setTimeout(() => {
    document.getElementById('win-title').textContent = badge ? 'Planet restored!' : 'Lift off!';
    document.getElementById('win-badge').classList.toggle('gone', !badge);
    document.getElementById('win-stats').textContent = `${P.name}: ${badge ? 100 : pctAlive()}% alive · ${explored()}% explored · ${newLost.filter((a) => a.state === 'rescued').length}/${newLost.length} astronauts rescued`;
    const crewNames = aboard.map((a) => a.name).join(' and ');
    const stayNames = stayers.map((a) => a.name).join(' and ');
    document.getElementById('win-text').textContent = (badge
      ? `Every corner of ${P.name} is alive again. You earned the gold planet badge. `
      : `You can come back and bring the rest of ${P.name} to life for the gold badge. `) +
      (stayNames ? `${stayNames} stayed behind to make a home in the hut. ` : '') +
      (crewNames ? `${crewNames} ${aboard.length > 1 ? 'are' : 'is'} flying on with you.` : '');
    document.getElementById('win').classList.remove('gone');
  }, 3200);
}
const launchEl = document.getElementById('launch');
launchEl.addEventListener('click', () => { if (rocket.done && playing) startBoarding(); });
function updateLaunchButton() {
  const near = rocket.done && playing && !rocket.launching && Math.hypot(P.rocket.x - player.x, P.rocket.z - player.z) < 4.2;
  launchEl.classList.toggle('gone', !near);
}
function checkBadge() {
  if (!badge && restore >= 1) {
    badge = true; hudDirty = true;
    sfx.fanfare();
    toast('The whole planet is alive! Gold planet badge earned ★', true);
    save();
  }
}

// ------------------------------------------------------------------ screens
const startEl = document.getElementById('start');
let hasSave = false;
try { hasSave = !!localStorage.getItem(SAVE_KEY); } catch (e) {}
document.getElementById('go').textContent = hasSave || game.planet > 0 ? 'Continue' : 'Start';
document.querySelector('.maphead b').textContent = P.name;
if (game.planet > 0) document.getElementById('intro').textContent = `Planet ${game.planet + 1}: ${P.name}. A new dead world, two more lost astronauts, and a hut that needs fixing. Your crew came with you.`;
if (hasSave || game.planet > 0) { document.getElementById('fresh').classList.remove('gone'); }
function showTravel(name) {
  const t = document.getElementById('travel');
  document.getElementById('travel-to').textContent = `Flying to ${name}…`;
  t.classList.remove('gone');
}
// the installed app is already full screen: asking again makes the phone flicker
const installed = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function begin() {
  sfx.init();
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req && !document.fullscreenElement && !installed) { try { const p = req.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  startEl.classList.add('gone');
  playing = true;
  let hinted = false; try { hinted = localStorage.getItem('bloom-hinted') === '1'; localStorage.setItem('bloom-hinted', '1'); } catch (e) {}
  document.getElementById('hint').classList.toggle('gone', hinted);
  if (!hasSave) toast('Your bubble keeps you alive. Gather wood and stone to make it grow!', true);
}
document.getElementById('go').addEventListener('click', begin);
// arriving at a new planet: keep the travel screen up a moment, then land straight in the game
let arriving = null; try { arriving = sessionStorage.getItem('bloom-travel'); sessionStorage.removeItem('bloom-travel'); } catch (e) {}
if (arriving) {
  showTravel(arriving);
  document.getElementById('travel-to').textContent = `Arriving at ${P.name}`;
  startEl.classList.add('gone');
  setTimeout(() => { begin(); toast(`Welcome to ${P.name}. Find the two lost astronauts and fix the hut by the rocket.`, true); document.documentElement.classList.remove('traveling'); document.getElementById('travel').classList.add('fade'); setTimeout(() => document.getElementById('travel').classList.add('gone'), 900); }, 1300);
}
document.getElementById('fresh').addEventListener('click', startOver);
document.getElementById('next').addEventListener('click', () => {
  // on to a brand new planet: your crew aboard, your tools and skills come too
  const flying = aboard.length ? aboard : lost.filter((a) => a.state === 'rescued').slice(0, 2);
  // a new seed whose planet name you haven't visited yet
  const visited = [...(game.visited || []), P.name];
  let seed = Math.floor(Math.random() * 1e9), name = generatePlanet(seed, game.planet + 1).name;
  for (let k = 0; k < 20 && visited.includes(name); k++) { seed = Math.floor(Math.random() * 1e9); name = generatePlanet(seed, game.planet + 1).name; }
  const next = { planet: game.planet + 1, seed, crew: flying.map((a) => ({ name: a.name, color: a.color })), tools: { ...tools }, skills: { ...skills }, visited };
  try { localStorage.setItem(GAME_KEY, JSON.stringify(next)); localStorage.removeItem(SAVE_KEY); } catch (e) {}
  try { sessionStorage.setItem('bloom-travel', name); } catch (e) {}
  showTravel(name);
  setTimeout(() => location.reload(), 1400);
});
function startOver() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('bloom-save') || k === GAME_KEY) localStorage.removeItem(k); } catch (e) {}
  location.reload();
}
document.getElementById('restart').addEventListener('click', startOver);
document.getElementById('again').addEventListener('click', () => {
  document.getElementById('win').classList.add('gone'); playing = true; rocket.model.position.y = 0; rocket.model.userData.flame.visible = false; rocket.launching = 0;
  // everyone climbs back out
  player.x = P.rocket.x; player.z = P.rocket.z + 3.4; player.model.visible = true;
  lost.forEach((a, i) => { if (a.state === 'rescued' || a.state === 'following') { a.m.visible = true; a.x = P.rocket.x - 4 + (i % 4) * 2.2; a.z = P.rocket.z + 5 + Math.floor(i / 4) * 1.8; } });
  stayers = []; aboard = [];
  updateCamera(0, true);
  toast('Welcome back. The rocket is ready whenever you are.');
});
const muteBtn = document.getElementById('mute');
muteBtn.classList.toggle('off', sfx.muted);
muteBtn.addEventListener('click', () => { sfx.init(); sfx.toggle(); muteBtn.classList.toggle('off', sfx.muted); });

// ------------------------------------------------------------------ loop
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
resize();
if (!load() && game.planet > 0) {
  // a new planet: your tools and skills come with you
  if (game.tools) Object.assign(tools, game.tools);
  if (game.skills) Object.assign(skills, game.skills);
  player.air = maxAir();
}
refreshHut();
computeRetired();
if (unstick()) setTimeout(() => toast('Your suit found you a safe spot to stand.'), 1200);
reveal(P.start.x, P.start.z, REVEAL_HOME);
syncBubbleUniforms(); updateDeco(); restore = computeRestore(); refreshRocket();
updateCamera(0, true);
let last = performance.now(), saveT = 0;
let simT = 0;
let fpsN = 0, fpsT = 0, slow = 0, quality = 2;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  // automatic quality: if the phone struggles, render fewer pixels, then drop shadows
  fpsN++; fpsT += dt;
  if (fpsT > 2) {
    const fps = fpsN / fpsT; fpsN = 0; fpsT = 0;
    if (playing && fps < 40) { slow++; if (slow >= 2 && quality > 0) { quality--; slow = 0;
      if (quality === 1) renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25)), resize();
      else { renderer.shadowMap.enabled = false; scene.traverse((o) => o.material && (o.material.needsUpdate = true)); } } }
    else slow = 0;
  }
  if (!paused) update(dt);
  renderer.render(scene, camera);
  updateOverlays();
  requestAnimationFrame(frame);
}
function update(dt) {
  simT += dt;
  const t = simT;
  timeU.value = t;
  if (playing) {
    movePlayer(dt);
    if (!player.floating) gather(dt); else player.gathering = false;
    updateSites(dt);
    updateExtractors(dt);
    updateRefiners(dt, t);
    updateLaunchButton();
    checkBadge();
    updateAir(dt);
    updateLost(dt, t);
    updateDiscovery();
    updateHut(t);
    retireT += dt; if (retireT > 2) { retireT = 0; computeRetired(); if (!player.floating) unstick(); }
    saveT += dt; if (saveT > 5) { saveT = 0; save(); }
  }
  updateNodes(dt);
  updateFlyers(dt);
  updateBubbles(dt);
  refreshRocket();
  if (boarding) updateBoarding(dt, t);
  if (rocket.launching) {
    rocket.launching += dt;
    const lt = rocket.launching;
    rocket.model.position.y = lt < 1 ? Math.sin(lt * 40) * 0.05 : (lt - 1) * (lt - 1) * 6;
    rocket.model.userData.flame.scale.set(1, 1 + Math.sin(t * 30) * 0.2, 1);
    // the two who stay wave, then walk into their new home
    for (const a of stayers) {
      if (!a.m.visible) continue;
      if (lt < 1.4) { a.m.rotation.y = Math.atan2(P.rocket.x - a.x, P.rocket.z - a.z); a.m.userData.arm.rotation.x = -2.6 + Math.sin(t * 8) * 0.4; }
      else if (walkCrew(a, P.hut.x, P.hut.z + 1.2, dt, t, 2.2)) a.m.visible = false;
    }
  }
  animatePlayer(dt, t);
  updateCamera(dt);
  if (hudDirty) updateHUD();
}
requestAnimationFrame(frame);

// hooks for automated playtesting
window.__bloom = { step: (n) => { for (let i = 0; i < n; i++) update(1 / 30); }, player, bag, tools, gens, nodes, sites, extractors, bridges, refiners, rocket, lost, launch, startBoarding, canStand, save, hut, retired, game, P, computeRetired, get aboard() { return aboard; }, get stayers() { return stayers; }, get boarding() { return boarding; }, shed, openMap, closeMap, get explored() { return explored(); }, reveal, get restore() { return restore; }, begin, give: (m, n) => { bag[m] = (bag[m] || 0) + n; hudDirty = true; } };

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
