import * as THREE from 'three';
import { MATERIALS, icon } from './materials.js';
import { PLANET1, NODE_MATERIAL } from './planet.js';

const P = PLANET1;
const SAVE_KEY = 'bloom-save-v2'; // the bigger planet: older saves start fresh

// ------------------------------------------------------------------ tuning
const WALK = 6.2;            // walking speed (units / s)
const FLOAT_HOME = 10;       // speed when the suit floats you home
const REACH = 0.75;          // walk right up and touch it to gather (you stop about 0.45 from it)
const SITE_REACH = 2.0;      // generators: you stop about 1.55 from their centre, so this is touching
const BASE_SWING = 0.62;     // seconds between tool swings at level 1
const REGROW = 45;           // seconds for a used-up node to grow back
const TOOL_SPEED = [1, 1.5, 2.1];
const BAG_SIZES = [30, 40, 55, 70];
const AIR_TIMES = [12, 20, 30, 45];
const UPGRADES = {
  pick:  { name: 'Pickaxe',  note: ['Stone pick', 'Crystal pick: mines gold', 'Golden pick: swings fast'], costs: [{ stone: 12, redCrystal: 8 }, { goldBar: 3, redCrystal: 12 }] },
  axe:   { name: 'Axe',      note: ['Stone axe', 'Crystal axe', 'Golden axe'], costs: [{ wood: 12, stone: 8 }, { stone: 14, redCrystal: 10 }] },
  bag:   { name: 'Backpack', note: BAG_SIZES.map((s) => `Holds ${s}`), costs: [{ wood: 14, stone: 10 }, { redCrystal: 16, stone: 12 }, { gold: 10, redCrystal: 14 }] },
  suit:  { name: 'Space suit', note: AIR_TIMES.map((s) => `${s}s of air outside`), costs: [{ wood: 10, stone: 10 }, { redCrystal: 12, stone: 10 }, { gold: 8, redCrystal: 12 }] },
};

// ------------------------------------------------------------------ game state
const bag = {};
const tools = { pick: 0, axe: 0, bag: 0, suit: 0 };
const skills = { mine: 0, chop: 0 };
let rescued = 0, restore = 0, hudDirty = true, incoming = 0, badge = false;

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
    vec3 dead = mix(vec3(0.6, 0.3, 0.2), vec3(0.72, 0.4, 0.27), n);
    dead = mix(vec3(0.4, 0.19, 0.13), dead, cr);
    vec3 grass = mix(vec3(0.3, 0.66, 0.2), vec3(0.45, 0.78, 0.26), n);
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
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(WORLD_R, WORLD_R * 0.82, 10, 96, 1, true), mat('#6b3b2a'));
  rim.position.y = -5;
  scene.add(rim);
  const under = new THREE.Mesh(new THREE.ConeGeometry(WORLD_R * 0.82, 26, 48), mat('#4a2a22'));
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
  let best = Infinity, tx = 1, tz = 0;
  for (let i = 0; i < river.points.length - 1; i++) {
    const [ax, az] = river.points[i], [bx, bz] = river.points[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; const L = Math.sqrt(L2); tx = dx / L; tz = dz / L; }
  }
  return { d: best, tx, tz };
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
        vec3 lava = mix(vec3(0.78, 0.13, 0.12), vec3(0.98, 0.42, 0.32), smoothstep(0.55, 0.8, n));
        vec3 water = mix(vec3(0.21, 0.58, 0.9), vec3(0.95, 0.98, 1.0), smoothstep(0.62, 0.78, n));
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
  const greens = ['#3fae5a', '#4cbc63', '#36a052'];
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
function makeBridge(repaired, tx, tz) {
  // built in a local frame where the river runs along X and you walk across it along Z
  const grp = new THREE.Group();
  const half = river.width / 2 + 1.2;
  const n = Math.round((half * 2) / 0.48);
  for (let i = 0; i <= n; i++) {
    if (!repaired && (i % 3 === 1 || (i > n * 0.3 && i < n * 0.7))) continue;
    const pl = mesh(new THREE.BoxGeometry(2.6, 0.14, 0.42), i % 2 ? '#b07a45' : '#9c6a3b');
    pl.position.set(repaired ? 0 : (i % 2 ? 0.15 : -0.1), 0.32, -half + i * 0.48);
    if (!repaired) pl.rotation.y = (i % 2 ? 0.12 : -0.08);
    grp.add(pl);
  }
  for (const sx of [-1.4, 1.4]) for (const sz of [-half, half]) {
    const post = mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.2, 6), '#7d5230');
    post.position.set(sx, 0.6, sz);
    grp.add(post);
  }
  if (repaired) for (const sx of [-1.4, 1.4]) { const rail = mesh(new THREE.BoxGeometry(0.1, 0.1, half * 2), '#8a5a35'); rail.position.set(sx, 1.1, 0); grp.add(rail); }
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
          !P.refiners.some((m) => Math.abs(m.x - x) < 6.5 && Math.abs(m.z - z) < 3.5) && Math.hypot(P.shed.x - x, P.shed.z - z) > 4.5 &&
          Math.hypot(P.workbench.x - x, P.workbench.z - 1.5 - z) > 5.5;
      }
      if (!ok) continue;
      const type = zone.node;
      const obj = type === 'tree' ? makeTree(seed) : type === 'boulder' ? makeBoulder(seed) : type === 'crystal' ? makeCrystal(seed) : makeOre(seed);
      seed++;
      obj.position.set(x, 0, z);
      obj.rotation.y = r() * Math.PI * 2;
      scene.add(obj);
      const matId = NODE_MATERIAL[type];
      const node = { type, mat: matId, x, z, obj, hp: MATERIALS[matId].perNode, max: MATERIALS[matId].perNode, regrow: 0, shake: 0, scale: 1, r: type === 'tree' ? 0.55 : 0.95 };
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
const grassMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.6, 4), mat('#5cbf45'), decoPts.length * 3);
const flowerMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial(), decoPts.length);
const pebbleMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.22, 0), mat('#8e5a45', { flatShading: true }), decoPts.length);
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
  ex.deposit = makeCrystal(77, color); ex.deposit.position.set(ex.x, 0, ex.z); scene.add(ex.deposit);
  if (ex.mat === 'gold') { scene.remove(ex.deposit); ex.deposit = makeOre(77); ex.deposit.position.set(ex.x, 0, ex.z); scene.add(ex.deposit); }
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
  br.broken = makeBridge(false, info.tx, info.tz); br.broken.position.set(bx, 0, bz); scene.add(br.broken);
  br.whole = makeBridge(true, info.tx, info.tz); br.whole.position.set(bx, 0, bz); br.whole.visible = false; scene.add(br.whole);
  br.sign = makeSign(); br.sign.position.set(bx - info.tz * 6 + info.tx * 2, 0, bz + info.tx * 6 + info.tz * 2); scene.add(br.sign);
  br.site = addSite({
    x: bx - info.tz * 6, z: bz + info.tx * 6, reach: 1.6,
    title: () => 'Broken bridge',
    cost: () => { if (br.repaired) return null; const left = {}; for (const [m, n] of Object.entries(def.cost)) left[m] = n - (br.paid[m] || 0); return left; },
    pay: (m) => { br.paid[m] = (br.paid[m] || 0) + 1; },
    complete: () => { br.repaired = true; sfx.build(); toast('Bridge repaired! You can cross the river here.', true); refreshBridge(br); },
    hideWhenDone: true,
  });
  return br;
});
function refreshBridge(br) { br.broken.visible = !br.repaired; br.whole.visible = br.repaired; br.sign.visible = !br.repaired; }

// --- refining machines: a long machine with a LOAD end (west) and a PICKUP end (east)
const refiners = P.refiners.map((def) => ({ ...def, repaired: false, paid: {}, loaded: {}, out: 0, t: 0 }));
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
  const maxIn = (m) => rf.inputs[m] * rf.hold;
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
      const pct = Math.round((rf.t / rf.secs) * 100);
      return `<span class="store">${icon(rf.output, 18)} Ready ${rf.out}/${rf.store}</span>${canRun(rf) ? `<span class="prog"><i style="width:${pct}%"></i></span>` : rf.out >= rf.store ? '<span class="lock">Tray full: collect to keep it working</span>' : ''}`;
    },
  });
  refreshRefiner(rf);
}
function recipeHtml(rf) {
  return Object.entries(rf.inputs).map(([m, n]) => `${n}${icon(m, 14)}`).join(' + ') + ` → ${icon(rf.output, 16)}`;
}
function canRun(rf) { return rf.repaired && rf.out < rf.store && Object.entries(rf.inputs).every(([m, n]) => (rf.loaded[m] || 0) >= n); }
function refreshRefiner(rf) {
  const u = rf.model.userData;
  u.junk.visible = !rf.repaired;
  u.cap.visible = rf.repaired;
  u.body.rotation.z = rf.repaired ? 0 : 0.2;
  u.glow.material.color.set(rf.repaired ? '#5ff2ff' : '#6b7280');
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
      if (rf.t >= rf.secs) {
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
  locked: () => (restore < P.restoreGoal && !rocket.done ? `Bring ${Math.round(P.restoreGoal * 100)}% of the planet to life first (${Math.floor(restore * 100)}%)` : null),
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
const shedCap = () => (shed.level >= 0 ? P.shed.levels[shed.level].cap : 0);
const shedHolds = (m) => shed.level >= 0 && P.shed.levels[shed.level].holds.includes(m);
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
    const newOnes = next.holds.filter((m) => !(shed.level >= 0 && P.shed.levels[shed.level].holds.includes(m)) && MATERIALS[m].refined);
    return `<span class="lock">Holds ${next.cap}${newOnes.length ? ' and ' + newOnes.map((m) => icon(m, 14)).join(' ') : ''}</span>`;
  },
  pay: (m) => { shed.paid[m] = (shed.paid[m] || 0) + 1; },
  complete: () => {
    shed.paid = {}; shed.level++; refreshShed(); sfx.build();
    toast(shed.level === 0 ? 'Shed repaired! Stand on its yellow pad to store things.' : `Shed upgraded: holds ${shedCap()}`, true);
  },
});
refreshShed();
const shedCount = () => Object.values(shed.store).reduce((a, b) => a + b, 0);
const shedEl = document.getElementById('shed');
function shedNear() { return shed.level >= 0 && Math.hypot(P.shed.x - player.x, P.shed.z + 2.4 - player.z) < 1.5; }
function renderShed() {
  let html = `<div class="shead">Shed<span>${shedCount()}/${shedCap()}</span></div>`;
  for (const m of [...P.materials, ...P.refined]) {
    const b = bag[m] || 0, st = shed.store[m] || 0;
    if (!b && !st) continue;
    const ok = shedHolds(m) || st > 0;
    html += `<button class="srow${ok ? '' : ' no'}" data-m="${m}" aria-label="${MATERIALS[m].name}">${icon(m, 24)}<span><b>${b}</b><i>${ok ? st : 'upgrade'}</i></span></button>`;
  }
  html += '<div class="shint">bag · shed<br>tap to store all or take back</div>';
  shedEl.innerHTML = html;
}
shedEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-m]');
  if (!btn) return;
  const m = btn.dataset.m;
  if ((bag[m] || 0) > 0) {
    if (!shedHolds(m)) { toast(`Upgrade the shed to store ${MATERIALS[m].name.toLowerCase()}`); sfx.warn(); return; }
    const n = Math.min(bag[m], shedCap() - shedCount());
    if (n <= 0) { toast('The shed is full'); sfx.warn(); return; }
    bag[m] -= n; shed.store[m] = (shed.store[m] || 0) + n;
    sfx.pay(); toast(`Stored ${n} ${MATERIALS[m].name.toLowerCase()}`);
  } else {
    const n = Math.min(shed.store[m] || 0, Math.max(0, bagRoom()));
    if (n <= 0) { toast('Your bag is full'); sfx.warn(); return; }
    shed.store[m] -= n; bag[m] = (bag[m] || 0) + n;
    sfx.pop(); toast(`Took ${n} ${MATERIALS[m].name.toLowerCase()}`);
  }
  hudDirty = true; renderShed();
});

// --- lost astronauts
const lost = P.astronauts.map(([x, z], i) => {
  const m = makeAstronaut('#7ed957');
  m.position.set(x, 0, z); m.rotation.y = Math.PI;
  scene.add(m);
  const dome = new THREE.Mesh(domeGeo, domeMat); dome.scale.set(1.9, 1.6, 1.9); dome.position.set(x, 0, z); scene.add(dome);
  const el = document.createElement('div'); el.className = 'help'; el.textContent = 'HELP'; sitesEl.appendChild(el);
  return { x, z, m, dome, el, state: 'waiting', i };
});

// ------------------------------------------------------------------ player
const player = { x: P.start.x, z: P.start.z, face: Math.PI, model: makeAstronaut(), swing: 0, swingT: 0, walk: 0, air: AIR_TIMES[0], floating: false, target: null };
player.model.position.set(player.x, 0, player.z);
scene.add(player.model);
const bagCap = () => BAG_SIZES[tools.bag] + rescued * 5;
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
    if (d < 0.3 || aliveAt(player.x, player.z) > 0.8) { player.floating = false; toast('Safe inside the bubble. Your bag is just as you left it.'); return; }
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
function nearestBubblePoint() {
  let best = null, bd = Infinity;
  for (const g of gens) {
    if (g.level < 0) continue;
    const dx = player.x - g.x, dz = player.z - g.z, d = Math.hypot(dx, dz) || 1;
    const edge = d - g.r;
    if (edge < bd) { bd = edge; const k = Math.max(0, g.r - 2) / d; best = { x: g.x + dx * k, z: g.z + dz * k }; }
  }
  return best;
}

// ------------------------------------------------------------------ gathering
let lastNeedPickToast = 0;
function gather(dt) {
  player.swingT -= dt;
  let target = null, bd = Infinity;
  for (const n of nodes) {
    if (n.hp <= 0) continue;
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
    if (Math.hypot(ex.x - player.x, ex.z - player.z) < 2.2 && ex.stored > 0 && bagRoom() > 0 && payT <= 0) {
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
    player.air -= dt;
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
const JOBS = [{ type: 'gather', mat: 'wood' }, { type: 'gather', mat: 'stone' }, { type: 'explore' }, { type: 'gather', mat: 'redCrystal' }, { type: 'gather', mat: 'gold' }, { type: 'explore' }];
const CREW_SPEED = 4.2, CARRY = 5;
function assignJob(a, order) {
  a.name = CREW_NAMES[a.i % CREW_NAMES.length];
  a.job = JOBS[order % JOBS.length]; a.jobIdx = order;
  a.task = 'find'; a.carry = 0; a.t = 0; a.target = null;
  a.el.innerHTML = a.job.type === 'gather' ? `${a.name} ${icon(a.job.mat, 14)}` : `${a.name} · explorer`;
}
function jobText(a) { return a.job.type === 'gather' ? `They'll gather ${MATERIALS[a.job.mat].name.toLowerCase()} for the shed` : 'They\'ll explore and bring back surprises'; }
function riverZAt(x) {
  const pts = river.points;
  for (let i = 0; i < pts.length - 1; i++) if (x >= pts[i][0] && x <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]));
  return 0;
}
const shedSide = () => P.shed.z > riverZAt(P.shed.x);
const sameSide = (x, z) => (z > riverZAt(x)) === shedSide();
const shedPad = () => ({ x: P.shed.x + (Math.random() - 0.5) * 1.2, z: P.shed.z + 2.6 });
function walkTo(a, tx, tz, dt) {
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  if (d < 0.25) return true;
  const sp = Math.min(d, CREW_SPEED * dt);
  a.x += (dx / d) * sp; a.z += (dz / d) * sp; a.m.rotation.y = Math.atan2(dx, dz);
  a.walking = true;
  return false;
}
function shedPut(m, n) {
  if (!shedHolds(m)) return 0;
  const k = Math.min(n, shedCap() - shedCount());
  if (k > 0) { shed.store[m] = (shed.store[m] || 0) + k; if (shed.open) renderShed(); }
  return k;
}
function crewWork(a, dt, t) {
  a.walking = false; a.working = false;
  if (!a.job) assignJob(a, a.jobIdx || 0);
  if (shed.level < 0) {
    // nothing to do until the shed is repaired: wait near it
    if (!a.idleSpot) a.idleSpot = { x: P.shed.x - 3 + a.i * 1.2, z: P.shed.z + 4.5 };
    walkTo(a, a.idleSpot.x, a.idleSpot.z, dt);
  } else if (a.job.type === 'gather') {
    if (a.task === 'find') {
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
        if (d < n.r + 1.05) { a.task = "work"; a.t = 0; } else walkTo(a, n.x - (dx / d) * (n.r + 0.7), n.z - (dz / d) * (n.r + 0.7), dt);
      }
    } else if (a.task === 'work') {
      const n = a.target;
      a.working = true;
      a.m.rotation.y = Math.atan2(n.x - a.x, n.z - a.z);
      a.t += dt;
      if (a.t > 1.3) {
        a.t = 0;
        if (n.hp > 0) { n.hp--; n.shake = 1; a.carry++; if (n.hp <= 0) n.regrow = REGROW; }
        if (a.carry >= CARRY || n.hp <= 0) { n.claim = null; a.task = 'return'; a.dest = shedPad(); }
      }
    } else if (a.task === 'return') {
      if (!a.dest) a.dest = shedPad();
      if (walkTo(a, a.dest.x, a.dest.z, dt)) {
        const put = shedPut(a.job.mat, a.carry);
        a.carry -= put; a.dest = null;
        a.task = a.carry > 0 ? 'full' : 'find';
      }
    } else if (a.task === 'full') {
      // the shed is full: wait by it until there's room
      a.t += dt;
      if (a.t > 2) { a.t = 0; const put = shedPut(a.job.mat, a.carry); a.carry -= put; if (!a.carry) a.task = 'find'; }
    }
  } else {
    // explorer
    if (a.task === 'find') {
      let spot = null;
      for (let k = 0; k < 40 && !spot; k++) {
        const ang = Math.random() * Math.PI * 2, d = 20 + Math.random() * (P.radius - 26);
        const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
        if (sameSide(x, z) && aliveAt(x, z) < 0.3) spot = { x, z };
      }
      if (!spot) { const ang = Math.random() * Math.PI * 2; spot = { x: P.shed.x + Math.cos(ang) * 30, z: P.shed.z + Math.sin(ang) * 20 }; if (!sameSide(spot.x, spot.z) || Math.hypot(spot.x, spot.z) > P.radius - 4) spot = { x: P.shed.x + 8, z: P.shed.z + 6 }; }
      a.dest = spot; a.task = 'out';
    } else if (a.task === 'out') {
      if (walkTo(a, a.dest.x, a.dest.z, dt)) { a.task = 'search'; a.t = 0; }
    } else if (a.task === 'search') {
      a.working = true; a.t += dt;
      if (a.t > 4) { a.task = 'return'; a.dest = shedPad(); }
    } else if (a.task === 'return') {
      if (walkTo(a, a.dest.x, a.dest.z, dt)) {
        const found = {};
        const picks = [...P.materials].sort(() => Math.random() - 0.5).slice(0, 2);
        for (const m of picks) found[m] = 2 + Math.floor(Math.random() * 3);
        if (Math.random() < 0.3) found[Math.random() < 0.5 ? 'polishedCrystal' : 'goldBar'] = 1;
        if (Math.random() < 0.06) found.powerCore = 1;
        const kept = [];
        for (const [m, n] of Object.entries(found)) { const k = shedPut(m, n); if (k) kept.push(`${k} ${MATERIALS[m].name.toLowerCase()}`); }
        if (kept.length && Math.hypot(a.x - player.x, a.z - player.z) < 40) toast(`${a.name} brought back ${kept.join(', ')}`);
        a.task = 'rest'; a.t = 0;
      }
    } else if (a.task === 'rest') {
      a.t += dt;
      if (a.t > 6) a.task = 'find';
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
      if (Math.hypot(a.x - player.x, a.z - player.z) < 2.6) { a.state = 'following'; a.dome.visible = false; toast('Found a lost astronaut! Lead them into a bubble.', true); sfx.level(); }
    } else if (a.state === 'following') {
      followIdx++;
      const back = 1.6 * followIdx;
      const tx = player.x - Math.sin(player.face) * back, tz = player.z - Math.cos(player.face) * back;
      const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
      if (d > 0.2) { const sp = Math.min(d, (WALK + 1.5) * dt * Math.min(1, d)); a.x += (dx / d) * sp; a.z += (dz / d) * sp; a.m.rotation.y = Math.atan2(dx, dz); }
      a.m.position.set(a.x, Math.abs(Math.sin(t * 9)) * 0.08, a.z);
      if (aliveAt(a.x, a.z) > 0.7) {
        a.state = 'rescued'; rescued++;
        assignJob(a, rescued - 1);
        sfx.fanfare();
        toast(`${a.name} is safe (${rescued}/${lost.length})! ${jobText(a)}. Your bag holds 5 more.`, true);
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
  restoreEl.querySelector('b').textContent = badge ? '100% ★' : `${Math.floor(restore * 100)}%`;
  restoreEl.classList.toggle('gold', badge);
  sosEl.textContent = `${rescued}/${lost.length}`;
  for (const s of sites) renderSite(s);
  if (shed.open) renderShed();
  hudDirty = false;
}
let toastTimer = 0;
const toastEl = document.getElementById('toast');
function toast(text, good = false) {
  toastEl.textContent = text; toastEl.classList.toggle('good', good); toastEl.classList.remove('gone');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.add('gone'), 2600);
}
const v3 = new THREE.Vector3();
function project(x, y, z) { v3.set(x, y, z).project(camera); return [(v3.x * 0.5 + 0.5) * innerWidth, (-v3.y * 0.5 + 0.5) * innerHeight, v3.z]; }
function updateOverlays() {
  for (const s of sites) {
    const d = Math.hypot(s.x - player.x, s.z - player.z);
    const show = d < 24 && !(s.hideWhenDone && !s.cost()) && !(s.hidden && s.hidden());
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
    v: 2, x: player.x, z: player.z, bag, tools, skills, rescued, badge,
    gens: gens.map((g) => ({ level: g.level, paid: g.paid })),
    ex: extractors.map((e) => ({ level: e.level, stored: e.stored, paid: e.paid })),
    bridges: bridges.map((b) => ({ repaired: b.repaired, paid: b.paid })),
    refiners: refiners.map((r) => ({ repaired: r.repaired, paid: r.paid, loaded: r.loaded, out: r.out, t: r.t })),
    rocket: { paid: rocket.paid, done: rocket.done, launched: rocket.launched },
    lost: lost.map((a) => ({ state: a.state === 'following' ? 'waiting' : a.state, jobIdx: a.jobIdx, x: a.x, z: a.z })),
    shed: { level: shed.level, paid: shed.paid, store: shed.store }, toolPaid,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) {}
}
function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) {}
  if (!d || d.v !== 2) return false;
  player.x = d.x; player.z = d.z;
  Object.assign(bag, d.bag); Object.assign(tools, d.tools); Object.assign(skills, d.skills);
  rescued = d.rescued || 0; badge = !!d.badge;
  d.gens.forEach((s, i) => { if (gens[i]) { gens[i].level = s.level; gens[i].paid = s.paid || {}; gens[i].rShown = s.level >= 0 ? gens[i].radii[s.level] : 0; refreshGen(gens[i]); } });
  d.ex.forEach((s, i) => { if (extractors[i]) { Object.assign(extractors[i], { level: s.level, stored: s.stored, paid: s.paid || {} }); refreshEx(extractors[i]); } });
  (d.bridges || []).forEach((s, i) => { const b = bridges[i]; if (b) { b.repaired = s.repaired; b.paid = s.paid || {}; refreshBridge(b); } });
  (d.refiners || []).forEach((s, i) => { const r = refiners[i]; if (r) { Object.assign(r, { repaired: s.repaired, paid: s.paid || {}, loaded: s.loaded || {}, out: s.out || 0, t: s.t || 0 }); refreshRefiner(r); } });
  rocket.paid = d.rocket.paid || {}; rocket.done = d.rocket.done; rocket.launched = !!d.rocket.launched;
  if (d.shed) { shed.level = d.shed.level; shed.paid = d.shed.paid || {}; Object.assign(shed.store, d.shed.store || {}); refreshShed(); }
  if (d.toolPaid) Object.assign(toolPaid, d.toolPaid);
  d.lost.forEach((s, i) => {
    const a = lost[i]; if (!a) return;
    if (s.state === 'rescued') { a.state = 'rescued'; a.dome.visible = false; a.home = homeSpot(a.i); a.x = s.x ?? a.home.x; a.z = s.z ?? a.home.z; assignJob(a, s.jobIdx || 0); }
  });
  return true;
}
addEventListener('visibilitychange', () => { if (document.hidden && playing) save(); });
addEventListener('pagehide', () => { if (playing) save(); });

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
    document.getElementById('win-stats').textContent = `${Math.floor(restore * 100)}% of the planet alive · ${rescued}/${lost.length} astronauts rescued`;
    document.getElementById('win-text').textContent = badge
      ? 'Every corner of the planet is alive again. You earned the gold planet badge.'
      : 'You flew home. You can come back and bring the rest of the planet to life for the gold badge.';
    document.getElementById('win').classList.remove('gone');
  }, 3200);
}
const launchEl = document.getElementById('launch');
launchEl.addEventListener('click', () => { if (rocket.done && playing) launch(); });
function updateLaunchButton() {
  const near = rocket.done && playing && !rocket.launching && Math.hypot(P.rocket.x - player.x, P.rocket.z - player.z) < 4.2;
  launchEl.classList.toggle('gone', !near);
}
function checkBadge() {
  if (!badge && restore >= 0.995) {
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
document.getElementById('go').textContent = hasSave ? 'Continue' : 'Start';
if (hasSave) { document.getElementById('fresh').classList.remove('gone'); }
function begin() {
  sfx.init();
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req && !document.fullscreenElement) { try { const p = req.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  startEl.classList.add('gone');
  playing = true;
  let hinted = false; try { hinted = localStorage.getItem('bloom-hinted') === '1'; localStorage.setItem('bloom-hinted', '1'); } catch (e) {}
  document.getElementById('hint').classList.toggle('gone', hinted);
  if (!hasSave) toast('Your bubble keeps you alive. Gather wood and stone to make it grow!', true);
}
document.getElementById('go').addEventListener('click', begin);
document.getElementById('fresh').addEventListener('click', () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} location.reload(); });
document.getElementById('again').addEventListener('click', () => { document.getElementById('win').classList.add('gone'); playing = true; rocket.model.position.y = 0; rocket.model.userData.flame.visible = false; rocket.launching = 0; toast('Welcome back. The rocket is ready whenever you are.'); });
const muteBtn = document.getElementById('mute');
muteBtn.classList.toggle('off', sfx.muted);
muteBtn.addEventListener('click', () => { sfx.init(); sfx.toggle(); muteBtn.classList.toggle('off', sfx.muted); });

// ------------------------------------------------------------------ loop
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
resize();
load();
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
  update(dt);
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
    saveT += dt; if (saveT > 5) { saveT = 0; save(); }
  }
  updateNodes(dt);
  updateFlyers(dt);
  updateBubbles(dt);
  refreshRocket();
  if (rocket.launching) {
    rocket.launching += dt;
    const lt = rocket.launching;
    rocket.model.position.y = lt < 1 ? Math.sin(lt * 40) * 0.05 : (lt - 1) * (lt - 1) * 6;
    rocket.model.userData.flame.scale.set(1, 1 + Math.sin(t * 30) * 0.2, 1);
  }
  animatePlayer(dt, t);
  updateCamera(dt);
  if (hudDirty) updateHUD();
}
requestAnimationFrame(frame);

// hooks for automated playtesting
window.__bloom = { step: (n) => { for (let i = 0; i < n; i++) update(1 / 30); }, player, bag, tools, gens, nodes, sites, extractors, bridges, refiners, rocket, lost, launch, shed, get restore() { return restore; }, begin, give: (m, n) => { bag[m] = (bag[m] || 0) + n; hudDirty = true; } };

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
