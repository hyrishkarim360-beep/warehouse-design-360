/* ============================================================
   Warehouse Blok O — Interactive Spatial Model
   Offline-first, dependency-free procedural 3D viewer.
   Renderer: Canvas 2D perspective painter (depth-sorted polygons).
   Units: 1 scene unit = 1 metre.  Axes: X east, Y up, Z north.
   Source: REV-00 schematic brief. Unknowns are labelled TBC.
   ============================================================ */

'use strict';

/* ============================ 1. math ============================ */

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len3 = a => Math.hypot(a[0], a[1], a[2]);
const norm3 = a => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const pad2 = n => String(n).padStart(2, '0');

/* ============================ 2. state ============================ */

const FACES = [];          // every rendered polygon
const SELECTABLES = [];    // {sys, min, max} ray-test boxes
const ANIMATORS = [];      // per-frame geometry updates
const COLLIDERS = [];      // POV collision AABBs {x0,z0,x1,z1}
const MARKERS = [];        // system marker descriptors
const LABELS = [];         // floating HTML label descriptors
const OVERLAY_TAGS = new Set(['cable01']);

const S = {
  mode: 'orbit',           // 'orbit' | 'pov'
  plan: false,
  lighting: 'day',
  selected: 0,             // system number (0 = none)
  isolated: false,
  measureMode: false,
  measurePts: [],
  presenting: false,
  presentIdx: 0,
  sysVis: {},              // system number -> visible
  grpVis: {},              // layer group id -> visible
  overlay01: false,        // NYM cable technical overlay
  anim: null,              // camera animation
  pickSys: 0,              // system under pointer this frame
  pointer: { x: -1, y: -1, inside: false },
  fps: 0, facesDrawn: 0, frameMs: 0,
  lowQuality: false,
  pov: { pos: [0, 1.7, 60], yaw: Math.PI, pitch: -0.04, speed: 1.5, keys: {} },
};

/* default visibility (systems.js / LAYER_GROUPS must be loaded first) */
try {
  if (typeof SYSTEMS !== 'undefined') for (const s of SYSTEMS) S.sysVis[s.number] = true;
  if (typeof LAYER_GROUPS !== 'undefined') for (const lg of LAYER_GROUPS) S.grpVis[lg.id] = true;
} catch (e) { /* headless harness provides data later */ }

/* true when a real browser DOM is present */
const HAS_UI = typeof window !== 'undefined' && typeof document !== 'undefined';

/* ============================ 3. canvas & camera ============================ */

let canvas = null, ctx = null, W = 0, H = 0, DPR = 1, focal = 600;

const cam = {
  pos: [128, 62, -128], target: [0, 8, 0],
  r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, -1],
  fov: Math.PI / 4.4,
  planScale: 4,
};
const camGoal = { yaw: 0, pitch: 0.32, dist: 230, tx: 0, ty: 8, tz: 0 };

function orbitFromState() {
  const cp = Math.cos(camGoal.pitch), sp = Math.sin(camGoal.pitch);
  const ox = Math.sin(camGoal.yaw) * cp, oy = sp, oz = Math.cos(camGoal.yaw) * cp;
  cam.pos = [
    camGoal.tx + ox * camGoal.dist,
    camGoal.ty + oy * camGoal.dist,
    camGoal.tz + oz * camGoal.dist,
  ];
  cam.target = [camGoal.tx, camGoal.ty, camGoal.tz];
}

function syncOrbitFromPos() {
  const off = sub3(cam.pos, cam.target);
  camGoal.dist = clamp(len3(off), 6, 500);
  camGoal.pitch = clamp(Math.asin(clamp(off[1] / camGoal.dist, -1, 1)), 0.04, 1.52);
  camGoal.yaw = Math.atan2(off[0], off[2]);
  camGoal.tx = cam.target[0]; camGoal.ty = cam.target[1]; camGoal.tz = cam.target[2];
}

function updateBasis() {
  if (S.plan) {
    cam.r = [1, 0, 0]; cam.u = [0, 0, 1]; cam.f = [0, -1, 0];
    cam.pos = [cam.target[0], 300, cam.target[2]];
    cam.planScale = Math.min(W / 170, H / 120);
    return;
  }
  if (S.mode === 'pov') {
    const cp = Math.cos(S.pov.pitch);
    cam.f = norm3([Math.sin(S.pov.yaw) * cp, Math.sin(S.pov.pitch), Math.cos(S.pov.yaw) * cp]);
    cam.pos = S.pov.pos;
    cam.r = norm3(cross3(cam.f, [0, 1, 0]));
    cam.u = cross3(cam.r, cam.f);
    return;
  }
  orbitFromState();
  cam.f = norm3(sub3(cam.target, cam.pos));
  cam.r = norm3(cross3(cam.f, [0, 1, 0]));
  cam.u = cross3(cam.r, cam.f);
}

function project(x, y, z, out) {
  const dx = x - cam.pos[0], dy = y - cam.pos[1], dz = z - cam.pos[2];
  const vx = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2];
  const vy = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
  const vz = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
  if (S.plan) {
    out.x = W / 2 + vx * cam.planScale;
    out.y = H / 2 - vy * cam.planScale;
  } else {
    const zc = Math.max(vz, 0.35);
    out.x = W / 2 + (vx / zc) * focal;
    out.y = H / 2 - (vy / zc) * focal;
  }
  out.d = vz;
  return out;
}

/* screen ray for picking / measuring */
function screenRay(mx, my) {
  if (S.plan) {
    const o = [cam.pos[0] + (mx - W / 2) / cam.planScale, cam.pos[1], cam.pos[2] - (my - H / 2) / cam.planScale];
    return { o, d: [0, -1, 0] };
  }
  const tanV = Math.tan(cam.fov / 2);
  const nx = (mx - W / 2) / focal * tanV * (W / H);
  const ny = -(my - H / 2) / focal * tanV;
  const d = norm3([
    cam.f[0] + cam.r[0] * nx + cam.u[0] * ny,
    cam.f[1] + cam.r[1] * nx + cam.u[1] * ny,
    cam.f[2] + cam.r[2] * nx + cam.u[2] * ny,
  ]);
  return { o: cam.pos.slice(), d };
}

function rayAABB(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / (d[i] || 1e-12);
    let t0 = (min[i] - o[i]) * inv, t1 = (max[i] - o[i]) * inv;
    if (inv < 0) { const t = t0; t0 = t1; t1 = t; }
    tmin = Math.max(tmin, t0); tmax = Math.min(tmax, t1);
  }
  return tmax >= Math.max(tmin, 0) ? tmin : -1;
}

function rayGround(o, d) {
  if (Math.abs(d[1]) < 1e-9) return null;
  const t = -o[1] / d[1];
  return t > 0 ? [o[0] + d[0] * t, 0, o[2] + d[2] * t] : null;
}

function segHitsAABB(p0, p1, min, max) {
  const d = sub3(p1, p0);
  const t = rayAABB(p0, norm3(d), min, max);
  return t >= 0 && t <= len3(d);
}

function pointInAABB(p, min, max) {
  return p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1] && p[2] >= min[2] && p[2] <= max[2];
}

/* ============================ 4. materials & textures ============================ */

function makeTex(w, h, fn) {
  const c = { w, h, canvas: null };
  if (typeof document !== 'undefined') {
    c.canvas = document.createElement('canvas');
    c.canvas.width = w; c.canvas.height = h;
    fn(c.canvas.getContext('2d'), w, h);
  }
  c.draw = fn; // for software raster fallback
  return c;
}

function noise(g, w, h, n, alpha, light) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${(alpha * Math.random()).toFixed(3)})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

const TEX = {};
function buildTextures() {
  TEX.floor = makeTex(1024, 640, (g, w, h) => {
    g.fillStyle = '#a9a7a1'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 9000, 0.05, true); noise(g, w, h, 9000, 0.05, false);
    for (let i = 0; i < 40; i++) { // soft mottling
      g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '60,58,54'},0.03)`;
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 30 + Math.random() * 90, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(70,68,64,0.5)'; g.lineWidth = 1.4; // expansion joints ~6 m
    for (let x = 0; x <= w; x += 44) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 44) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = 'rgba(60,58,55,0.16)'; // faint tire arcs
    for (let i = 0; i < 14; i++) {
      g.lineWidth = 5 + Math.random() * 6;
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 60 + Math.random() * 160, Math.random() * 3, Math.random() * 2 + 0.6);
      g.stroke();
    }
  });
  TEX.asphalt = makeTex(256, 256, (g, w, h) => {
    g.fillStyle = '#43464b'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 5200, 0.09, true); noise(g, w, h, 5200, 0.09, false);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 10; i++) {
      g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h);
      g.lineTo(Math.random() * w, Math.random() * h); g.stroke();
    }
  });
  TEX.cladding = makeTex(1024, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#9aa3ab'); gr.addColorStop(1, '#878f97');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(52,58,64,0.55)'; g.lineWidth = 2; // panel seams
    for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    for (let x = 3; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    noise(g, w, h, 2600, 0.05, false);
    g.fillStyle = 'rgba(70,66,60,0.10)'; g.fillRect(0, h - 34, w, 34); // plinth grime
  });
  TEX.roof = makeTex(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#7d848b'); gr.addColorStop(0.5, '#8b9299'); gr.addColorStop(1, '#7d848b');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,44,48,0.6)'; g.lineWidth = 2; // standing seams
    for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    noise(g, w, h, 3200, 0.05, false);
  });
  TEX.mesh = makeTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(190,198,204,0.95)'; g.lineWidth = 2;
    for (let i = -h; i < w + h; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
    }
  });
  TEX.grating = makeTex(128, 128, (g, w, h) => {
    g.fillStyle = '#5c636a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#787f86';
    for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 5);
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 5, h);
    noise(g, w, h, 500, 0.08, false);
  });
  TEX.pallet = makeTex(128, 128, (g, w, h) => {
    g.fillStyle = '#a9854f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,58,30,0.6)'; g.lineWidth = 2;
    for (let y = 0; y <= h; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    noise(g, w, h, 700, 0.08, false);
  });
  TEX.belt = makeTex(128, 128, (g, w, h) => {
    g.fillStyle = '#3c4045'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4a4f55';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h);
    g.fillStyle = 'rgba(232,163,61,0.55)'; // flow chevrons
    for (let x = 8; x < w; x += 64) {
      g.beginPath(); g.moveTo(x, 20); g.lineTo(x + 22, 64); g.lineTo(x, 108);
      g.lineTo(x + 12, 108); g.lineTo(x + 34, 64); g.lineTo(x + 12, 20); g.fill();
    }
  });
  TEX.shutter = makeTex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#6e7a84'); gr.addColorStop(1, '#5a646d');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(30,34,38,0.7)'; g.lineWidth = 2;
    for (let y = 0; y <= h; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  TEX.exit = makeTex(128, 48, (g, w, h) => {
    g.fillStyle = '#1d7a4f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = 'bold 30px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('EXIT', w / 2, h / 2 + 1);
  });
  TEX.hazard = makeTex(64, 64, (g, w, h) => {
    g.fillStyle = '#d8b13a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#22252a';
    for (let i = -h; i < w; i += 24) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 12, 0); g.lineTo(i + 12 + h, h); g.lineTo(i + h, h); g.fill();
    }
  });
  TEX.radius = makeTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(232,163,61,0.85)'; g.lineWidth = 5;
    g.setLineDash([18, 12]);
    g.beginPath(); g.arc(w / 2, h / 2, 118, 0, 7); g.stroke();
    g.setLineDash([]);
  });
  TEX.louver = makeTex(64, 64, (g, w, h) => {
    g.fillStyle = '#4c545c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#20252a';
    for (let y = 4; y < h; y += 10) g.fillRect(4, y, w - 8, 4);
  });
  TEX.perf = makeTex(64, 64, (g, w, h) => {
    g.fillStyle = '#7c838a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4a5056';
    for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) g.fillRect(x, y, 3, 3);
  });
  TEX.acF = makeTex(64, 64, (g, w, h) => {
    g.fillStyle = '#3a3f45'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#22262b'; g.lineWidth = 3;
    g.beginPath(); g.arc(w / 2, h / 2, 24, 0, 7); g.stroke();
    g.strokeStyle = '#565d64';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath(); g.moveTo(w / 2, h / 2);
      g.lineTo(w / 2 + Math.cos(a) * 24, h / 2 + Math.sin(a) * 24); g.stroke();
    }
  });
  TEX.grate = makeTex(64, 64, (g, w, h) => {
    g.fillStyle = '#3a3e42'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#24282c';
    for (let x = 0; x < w; x += 12) g.fillRect(x, 0, 6, h);
  });
  TEX.panel = makeTex(128, 64, (g, w, h) => {
    g.fillStyle = '#8d959d'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5a6168'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#2c3136'; g.fillRect(14, 14, w - 28, 12);
    g.fillStyle = '#c8ced4';
    for (let i = 0; i < 6; i++) g.fillRect(20 + i * 15, 17, 8, 6);
  });
  function textPlate(str, bg, fg) {
    return makeTex(256, 64, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = fg; g.font = 'bold 30px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(str, w / 2, h / 2 + 1);
    });
  }
  TEX.siteSign = textPlate('WAREHOUSE BLOK O', '#23282e', '#e8a33d');
  TEX.mdp = textPlate('MDP', '#37424c', '#e8eaec');
  TEX.ats = textPlate('ATS', '#37424c', '#e8eaec');
  TEX.vfd = textPlate('VFD', '#37424c', '#e8eaec');
  TEX.apar = textPlate('APAR', '#b03a30', '#ffffff');
  TEX.keepClear = textPlate('KEEP CLEAR', '#c9a227', '#1d1a12');
  TEX.consum = textPlate('CONSUMABLES', '#37424c', '#e8a33d');
  TEX.gen = textPlate('GENERATOR HOUSE', '#37424c', '#e8eaec');
  TEX.fac = textPlate('FACILITIES', '#37424c', '#e8eaec');
  TEX.acp = textPlate('AC PLATFORM', '#37424c', '#e8eaec');
  TEX.cage = textPlate('SECURE STORAGE', '#37424c', '#e8eaec');
  TEX.tank = textPlate('TORENT', '#3d5a76', '#ffffff');
}

/* palette (0-255) */
const MAT = {
  floor:   { c: [168, 166, 160], tex: () => TEX.floor },
  slab:    { c: [148, 146, 140] },
  plinth:  { c: [128, 126, 120] },
  ground:  { c: [96, 110, 78], tex: () => TEX.asphalt },
  asphalt: { c: [70, 72, 76], tex: () => TEX.asphalt },
  concrete:{ c: [160, 158, 152] },
  steel:   { c: [128, 136, 144] },
  steelDk: { c: [86, 92, 98] },
  steelLt: { c: [168, 176, 184] },
  column:  { c: [112, 102, 88] },
  cladding:{ c: [158, 165, 172], tex: () => TEX.cladding },
  roof:    { c: [132, 139, 146], tex: () => TEX.roof },
  ridge:   { c: [110, 116, 122] },
  gutter:  { c: [96, 102, 108] },
  door:    { c: [110, 122, 134], tex: () => TEX.shutter },
  doorTrim:{ c: [66, 76, 86] },
  rubber:  { c: [38, 40, 42] },
  yellow:  { c: [226, 188, 62] },
  white:   { c: [228, 230, 232] },
  hazard:  { c: [210, 170, 60], tex: () => TEX.hazard },
  red:     { c: [178, 52, 44] },
  redDk:   { c: [140, 38, 34] },
  green:   { c: [58, 148, 98] },
  blue:    { c: [64, 130, 190] },
  copper:  { c: [176, 122, 74] },
  rack:    { c: [62, 92, 148] },
  rackBeam:{ c: [214, 120, 44] },
  pallet:  { c: [166, 130, 82], tex: () => TEX.pallet },
  carton:  { c: [198, 176, 138] },
  carton2: { c: [154, 138, 112] },
  wrap:    { c: [208, 212, 216] },
  office:  { c: [204, 202, 194] },
  officeFl:{ c: [148, 144, 136] },
  glass:   { c: [140, 172, 196], alpha: 0.35 },
  wood:    { c: [148, 114, 72] },
  fan:     { c: [72, 78, 84] },
  fanBlade:{ c: [96, 104, 110] },
  genset:  { c: [62, 106, 70] },
  gensetDk:{ c: [48, 84, 56] },
  mesh:    { c: [172, 180, 186], tex: () => TEX.mesh, alpha: 0.6 },
  grating: { c: [96, 102, 108], tex: () => TEX.grating },
  belt:    { c: [62, 66, 70], tex: () => TEX.belt },
  pvc:     { c: [214, 216, 218] },
  cable:   { c: [222, 158, 52] },
  tray:    { c: [140, 146, 152], tex: () => TEX.grate },
  panel:   { c: [140, 148, 156], tex: () => TEX.panel },
  mdp:     { c: [90, 100, 110], tex: () => TEX.mdp },
  ats:     { c: [90, 100, 110], tex: () => TEX.ats },
  vfd:     { c: [90, 100, 110], tex: () => TEX.vfd },
  exit:    { c: [46, 150, 96], tex: () => TEX.exit, emis: true },
  apar:    { c: [178, 52, 44] },
  aparSign:{ c: [176, 58, 50], tex: () => TEX.apar },
  keep:    { c: [190, 158, 60], tex: () => TEX.keepClear },
  consum:  { c: [90, 100, 110], tex: () => TEX.consum },
  genSign: { c: [90, 100, 110], tex: () => TEX.gen },
  facSign: { c: [90, 100, 110], tex: () => TEX.fac },
  acpSign: { c: [90, 100, 110], tex: () => TEX.acp },
  cageSign:{ c: [90, 100, 110], tex: () => TEX.cage },
  tankSign:{ c: [90, 100, 110], tex: () => TEX.tank },
  louver:  { c: [96, 102, 108], tex: () => TEX.louver },
  perf:    { c: [124, 130, 136], tex: () => TEX.perf },
  acUnit:  { c: [168, 172, 176] },
  acFan:   { c: [70, 76, 82], tex: () => TEX.acF },
  radius:  { c: [232, 163, 61], tex: () => TEX.radius, alpha: 0.5 },
  toilet:  { c: [176, 178, 172] },
  foliage: { c: [74, 116, 62] },
  foliage2:{ c: [92, 134, 70] },
  trunk:   { c: [96, 76, 54] },
  tire:    { c: [44, 46, 48] },
  truckCab:{ c: [196, 178, 150] },
  truckBox:{ c: [210, 212, 214] },
  truckBox2:{ c: [122, 150, 178] },
  car1:    { c: [126, 140, 158] },
  car2:    { c: [158, 96, 88] },
  car3:    { c: [96, 118, 142] },
  lampHead:{ c: [52, 56, 60], emis: true },
  led:     { c: [238, 244, 248], emis: true },
  cone:    { c: [214, 120, 44] },
  bollard: { c: [226, 188, 62] },
  dark:    { c: [40, 43, 47] },
};

/* ============================ 5. geometry builders ============================ */

let faceIdx = 0;

function face(verts, mat, o = {}) {
  const e1 = sub3(verts[1], verts[0]);
  const e2 = sub3(verts[2], verts[0]);
  let n = norm3(cross3(e1, e2));
  let v = verts;
  if (o.outward && dot3(n, o.outward) < 0) {
    v = verts.slice().reverse();
    n = scale3(n, -1);
  }
  const fr = {
    v, n,
    c: mat.c, tex: mat.tex ? mat.tex() : (o.tex || null),
    uv: o.uv || null,
    grp: o.grp || 'architecture',
    sys: o.sys || 0,
    emis: !!(o.emis || mat.emis),
    alpha: o.alpha != null ? o.alpha : (mat.alpha != null ? mat.alpha : 1),
    tag: o.tag || null,
    decor: !!o.decor,
    noCull: !!o.noCull,
    varr: 0.93 + 0.13 * Math.abs(Math.sin(faceIdx * 12.9898) * 43758.5453 % 1),
    sp: new Array(v.length),
    idx: faceIdx++,
  };
  for (let i = 0; i < v.length; i++) fr.sp[i] = [0, 0];
  FACES.push(fr);
  return fr;
}

function box(cx, cy, cz, w, h, d, mat, o = {}) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const P = (x, y, z) => [x, y, z];
  face([P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1)], mat, { ...o, outward: [1, 0, 0] });
  face([P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], mat, { ...o, outward: [-1, 0, 0] });
  face([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], mat, { ...o, outward: [0, 1, 0] });
  face([P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], mat, { ...o, outward: [0, -1, 0] });
  face([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], mat, { ...o, outward: [0, 0, 1] });
  face([P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0)], mat, { ...o, outward: [0, 0, -1] });
  if (o.aabb) SELECTABLES.push({ sys: o.sys, min: [x0, y0, z0], max: [x1, y1, z1] });
}

function prism(cx, cy, cz, r, h, seg, mat, o = {}) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r]);
  }
  for (let i = 0; i < seg; i++) {
    const a = pts[i], b = pts[(i + 1) % seg];
    const mid = [(a[0] + b[0]) / 2 - cx, 0, (a[2] + b[2]) / 2 - cz];
    face([
      [a[0], cy - h / 2, a[2]], [b[0], cy - h / 2, b[2]],
      [b[0], cy + h / 2, b[2]], [a[0], cy + h / 2, a[2]],
    ], mat, { ...o, outward: [mid[0], 0, mid[2]] });
  }
  face(pts.map(p => [p[0], cy + h / 2, p[2]]), mat, { ...o, outward: [0, 1, 0] });
  if (o.caps) face(pts.map(p => [p[0], cy - h / 2, p[2]]).reverse(), mat, { ...o, outward: [0, -1, 0] });
}

function beam(p0, p1, w, t, mat, o = {}) {
  const dir = norm3(sub3(p1, p0));
  const ref = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm3(cross3(dir, ref));
  const v = norm3(cross3(dir, u));
  const hw = w / 2, ht = t / 2, L = len3(sub3(p1, p0));
  const P = (s, a, b) => [
    p0[0] + dir[0] * s + u[0] * a + v[0] * b,
    p0[1] + dir[1] * s + u[1] * a + v[1] * b,
    p0[2] + dir[2] * s + u[2] * a + v[2] * b,
  ];
  const A = [-hw, -ht], B = [hw, -ht], C = [hw, ht], D = [-hw, ht];
  face([P(0, ...A), P(0, ...B), P(L, ...B), P(L, ...A)], mat, { ...o, outward: scale3(v, -1) });
  face([P(0, ...C), P(0, ...D), P(L, ...D), P(L, ...C)], mat, { ...o, outward: v });
  face([P(0, ...D), P(0, ...A), P(L, ...A), P(L, ...D)], mat, { ...o, outward: scale3(u, -1) });
  face([P(0, ...B), P(0, ...C), P(L, ...C), P(L, ...B)], mat, { ...o, outward: u });
  face([P(0, ...B), P(0, ...A), P(0, ...D), P(0, ...C)], mat, { ...o, outward: scale3(dir, -1) });
  face([P(L, ...A), P(L, ...B), P(L, ...C), P(L, ...D)], mat, { ...o, outward: dir });
}

/* flat ground marking / painted polygon — accepts [x,z] or [x,y,z] points */
function flat(pts, mat, o = {}) {
  const v = pts.map(p => (p.length === 2 ? [p[0], o.y != null ? o.y : 0.02, p[1]] : p));
  face(v, mat, { ...o, outward: [0, 1, 0] });
}

function addCollider(x0, z0, x1, z1) {
  COLLIDERS.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
}

/* ============================ 6. scene construction ============================ */

const WH = { x0: -70, x1: 70, z0: -44, z1: 44, eave: 9, ridge: 10.8 };
const OFFICE = { x0: -68, x1: -54, z0: -18, z1: 18, h: 3.2 };

function buildSite() {
  // ground & roads (ground plane below the warehouse slab top)
  flat([[-160, -0.02, -120], [160, -0.02, -120], [160, -0.02, 120], [-160, -0.02, 120]], MAT.ground, { tag: 'ctx' });
  flat([[-104, -70], [116, -70], [116, -58], [-104, -58]], MAT.asphalt, { tag: 'ctx' });       // south yard road
  flat([[-104, 44], [116, 44], [116, 62], [-104, 62]], MAT.asphalt, { tag: 'ctx' });            // north apron road
  flat([[-104, -58], [-92, -58], [-92, 44], [-104, 44]], MAT.asphalt, { tag: 'ctx' });          // west road
  flat([[104, -58], [116, -58], [116, 44], [104, 44]], MAT.asphalt, { tag: 'ctx' });            // east road
  flat([[-92, -58], [104, -58], [104, -44], [-92, -44]], MAT.concrete, { tag: 'ctx' });         // south apron
  flat([[-92, 44], [104, 44], [104, 60], [-92, 60]], MAT.concrete, { tag: 'ctx' });             // north apron
  // truck circulation lanes (white dashed centre lines)
  for (let x = -88; x < 100; x += 6) {
    flat([[x, 0.03, 52], [x + 3, 0.03, 52], [x + 3, 0.03, 52.25], [x, 0.03, 52.25]], MAT.white, { tag: 'ctx', decor: true });
    flat([[x, 0.03, -52], [x + 3, 0.03, -52], [x + 3, 0.03, -52.25], [x, 0.03, -52.25]], MAT.white, { tag: 'ctx', decor: true });
  }
  // lane arrows
  const arrow = (cx, cz, rot) => {
    const pts = [[0, -3], [2, 0], [0.9, 0], [0.9, 3], [-0.9, 3], [-0.9, 0], [-2, 0]].map(p => {
      const a = rot;
      return [cx + p[0] * Math.cos(a) - p[1] * Math.sin(a), 0.035, cz + p[0] * Math.sin(a) + p[1] * Math.cos(a)];
    });
    flat(pts, MAT.white, { tag: 'ctx', decor: true });
  };
  arrow(-40, 53, Math.PI); arrow(30, 53, Math.PI); arrow(-40, -53, 0); arrow(30, -53, 0);
  arrow(96, 0, -Math.PI / 2); arrow(-80, 0, Math.PI / 2);
  // car parking (south-west) with stall lines
  for (let i = 0; i < 8; i++) {
    const x = -64 + i * 3.2, z = -62;
    flat([[x, 0.03, z], [x + 0.15, 0.03, z], [x + 0.15, 0.03, z + 5.5], [x, 0.03, z + 5.5]], MAT.white, { tag: 'ctx', decor: true });
  }
  flat([[-66, 0.03, -66], [-38, 0.03, -66], [-38, 0.03, -65.7], [-66, 0.03, -65.7]], MAT.white, { tag: 'ctx', decor: true });
  // motorcycle parking (south-east)
  for (let i = 0; i < 6; i++) {
    const x = 46 + i * 1.6, z = -62;
    flat([[x, 0.03, z], [x + 0.12, 0.03, z], [x + 0.12, 0.03, z + 2.6], [x, 0.03, z + 2.6]], MAT.white, { tag: 'ctx', decor: true });
  }
  // stormwater trench drains
  box(0, 0.1, 46.5, 142, 0.2, 1.1, MAT.dark, { grp: 'architecture', tag: 'ctx' });
  box(0, 0.1, -46.5, 142, 0.2, 1.1, MAT.dark, { grp: 'architecture', tag: 'ctx' });
  for (let x = -70; x <= 70; x += 4) {
    box(x, 0.22, 46.5, 0.5, 0.06, 0.9, MAT.steelDk, { grp: 'architecture', tag: 'ctx' });
    box(x, 0.22, -46.5, 0.5, 0.06, 0.9, MAT.steelDk, { grp: 'architecture', tag: 'ctx' });
  }
  // perimeter fence
  const fx0 = -100, fx1 = 120, fz0 = -75, fz1 = 75;
  const post = (x, z) => box(x, 0.9, z, 0.14, 1.8, 0.14, MAT.steelDk, { grp: 'vehicles', decor: true });
  for (let x = fx0; x <= fx1; x += 6) {
    if (Math.abs(x) < 8) continue; // south gate opening
    post(x, fz0);
    post(x, fz1);
  }
  for (let z = fz0; z <= fz1; z += 6) { post(fx0, z); post(fx1, z); }
  const fenceRun = (a, b, c, d) => {
    face([a, b, [c[0], 1.6, c[2]], [d[0], 1.6, d[2]]], MAT.mesh, { grp: 'vehicles', alpha: 0.5, decor: true, uv: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  };
  fenceRun([fx0, 0.15, fz0], [-7, 0.15, fz0], [-7, 0, fz0], [fx0, 0, fz0]);
  fenceRun([7, 0.15, fz0], [fx1, 0.15, fz0], [fx1, 0, fz0], [7, 0, fz0]);
  fenceRun([fx0, 0.15, fz1], [fx1, 0.15, fz1], [fx1, 0, fz1], [fx0, 0, fz1]);
  fenceRun([fx0, 0.15, fz0], [fx0, 0.15, fz1], [fx0, 0, fz1], [fx0, 0, fz0]);
  fenceRun([fx1, 0.15, fz0], [fx1, 0.15, fz1], [fx1, 0, fz1], [fx1, 0, fz0]);
  // gate (opening in south fence) + guardhouse
  box(-7, 1.1, fz0, 0.18, 2.2, 0.18, MAT.steelLt, { grp: 'vehicles' });
  box(7, 1.1, fz0, 0.18, 2.2, 0.18, MAT.steelLt, { grp: 'vehicles' });
  box(10, 1.1, fz0, 0.1, 2.0, 8, MAT.mesh, { grp: 'vehicles', alpha: 0.5, uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }); // open gate leaf
  box(12, 1.4, -72, 4, 2.8, 3, MAT.concrete, { grp: 'architecture' });
  box(12, 2.9, -72, 4.4, 0.15, 3.4, MAT.roof, { grp: 'architecture' });
  box(10.2, 1.4, -70.6, 1.0, 2.0, 0.08, MAT.door, { grp: 'architecture' });
  addCollider(10, -74, 14, -70);
  // site sign
  box(-30, 1.6, -72, 8, 2.2, 0.12, MAT.steelLt, { grp: 'vehicles', decor: true });
  box(-30, 1.9, -71.9, 7.2, 1.5, 0.06, { c: [214, 216, 218], tex: () => TEX.siteSign }, { grp: 'vehicles', decor: true });
  // landscape islands with tropical planting
  const tree = (x, z, s) => {
    box(x, 0.3 * s, z, 0.5 * s, 0.6 * s, 0.5 * s, MAT.trunk, { grp: 'vehicles', decor: true });
    prism(x, 2.2 * s, z, 1.6 * s, 2.6 * s, 7, MAT.foliage, { grp: 'vehicles', decor: true, caps: true });
    prism(x, 3.6 * s, z, 1.1 * s, 1.8 * s, 6, MAT.foliage2, { grp: 'vehicles', decor: true, caps: true });
  };
  const shrub = (x, z) => prism(x, 0.35, z, 0.7, 0.7, 6, MAT.foliage2, { grp: 'vehicles', decor: true, caps: true });
  tree(-88, -30, 1.1); tree(-88, 10, 1.3); tree(-88, 48, 1.0);
  tree(98, -20, 1.2); tree(98, 18, 1.0); tree(98, 52, 1.25);
  tree(-40, -66, 1.15); tree(10, -68, 1.0); tree(60, -66, 1.2);
  tree(-40, 68, 1.05); tree(20, 70, 1.15); tree(80, 66, 1.0);
  shrub(-60, -60); shrub(-20, -70); shrub(40, -64); shrub(80, -60);
  shrub(-60, 62); shrub(0, 70); shrub(60, 64); shrub(100, 30); shrub(-90, -50);
  // site light poles
  const siteLight = (x, z) => {
    prism(x, 3.5, z, 0.12, 7, 6, MAT.steelDk, { grp: 'vehicles', caps: true });
    box(x, 7.1, z, 0.7, 0.25, 0.4, MAT.steelDk, { grp: 'vehicles' });
    box(x, 7.0, z + 0.1, 0.5, 0.12, 0.3, MAT.lampHead, { grp: 'vehicles' });
  };
  siteLight(-90, 52); siteLight(0, 54); siteLight(90, 52);
  siteLight(-90, -54); siteLight(0, -56); siteLight(90, -54);
  // bollards along north apron
  for (let x = -60; x <= 60; x += 12) prism(x, 0.45, 45.6, 0.14, 0.9, 8, MAT.bollard, { grp: 'vehicles', caps: true });
}

function buildWarehouse() {
  const { x0, x1, z0, z1, eave, ridge } = WH;
  // slab & plinth
  box(0, -0.08, 0, 141, 0.16, 89, MAT.slab, { grp: 'architecture', tag: 'ctx' });
  flat([[-70, 0.015, -44], [70, 0.015, -44], [70, 0.015, 44], [-70, 0.015, 44]], MAT.floor, { grp: 'architecture', tag: 'ctx', uv: [[0, 1], [1, 1], [1, 0], [0, 0]] });
  box(0, 0.25, -44.4, 141.6, 0.5, 0.8, MAT.plinth, { grp: 'architecture' });
  box(0, 0.25, 44.4, 141.6, 0.5, 0.8, MAT.plinth, { grp: 'architecture' });
  box(-70.4, 0.25, 0, 0.8, 0.5, 89.6, MAT.plinth, { grp: 'architecture' });
  box(70.4, 0.25, 0, 0.8, 0.5, 89.6, MAT.plinth, { grp: 'architecture' });
  // walls (cladding) — interior faces get a lighter tone via separate inner walls
  const wallMat = MAT.cladding, innerMat = { c: [172, 176, 180] };
  face([[-70, 0, -44], [70, 0, -44], [70, eave, -44], [-70, eave, -44]], wallMat, { grp: 'architecture', uv: [[0, 1], [1, 1], [1, 0], [0, 0]] });
  face([[-70, 0, 44], [-70, eave, 44], [70, eave, 44], [70, 0, 44]], wallMat, { grp: 'architecture', uv: [[0, 0], [0, 1], [1, 1], [1, 0]] });
  face([[-70, 0, -44], [-70, eave, -44], [-70, eave, 44], [-70, 0, 44]], wallMat, { grp: 'architecture', uv: [[0, 1], [0, 0], [1, 0], [1, 1]] });
  face([[70, 0, -44], [70, 0, 44], [70, eave, 44], [70, eave, -44]], wallMat, { grp: 'architecture', uv: [[0, 1], [1, 1], [1, 0], [0, 0]] });
  // gable triangles (west & east)
  face([[-70, eave, -44], [-70, eave, 44], [-70, ridge, 0]], MAT.cladding, { grp: 'architecture' });
  face([[70, eave, -44], [70, ridge, 0], [70, eave, 44]], MAT.cladding, { grp: 'architecture' });
  // roof planes
  const slopeLen = Math.hypot(44, ridge - eave);
  face([[-71.2, eave, -45.2], [71.2, eave, -45.2], [71.2, ridge, 0], [-71.2, ridge, 0]], MAT.roof, { grp: 'roof', uv: [[0, 1], [1, 1], [1, 0], [0, 0]] });
  face([[-71.2, eave, 45.2], [-71.2, ridge, 0], [71.2, ridge, 0], [71.2, eave, 45.2]], MAT.roof, { grp: 'roof', uv: [[0, 0], [0, 1], [1, 1], [1, 0]] });
  // ridge vent + roof vents
  box(0, ridge + 0.35, 0, 138, 0.7, 1.6, MAT.ridge, { grp: 'roof' });
  for (const vx of [-52, -18, 18, 52]) {
    prism(vx, ridge + 0.3, 0, 0.7, 0.8, 8, MAT.steelLt, { grp: 'roof', caps: true });
    box(vx, ridge + 0.85, 0, 1.5, 0.12, 1.5, MAT.steelDk, { grp: 'roof' });
  }
  // gutters & downpipes
  box(0, eave - 0.05, -44.9, 142, 0.3, 0.3, MAT.gutter, { grp: 'roof' });
  box(0, eave - 0.05, 44.9, 142, 0.3, 0.3, MAT.gutter, { grp: 'roof' });
  for (const [dx, dz] of [[-70.2, -44.2], [70.2, -44.2], [-70.2, 44.2], [70.2, 44.2]]) {
    prism(dx, 4.5, dz, 0.09, 9, 6, MAT.gutter, { grp: 'roof', caps: true });
  }
  // portal frames every 10 m
  for (let x = -70; x <= 70; x += 10) {
    box(x, eave / 2, -43.6, 0.35, eave, 0.35, MAT.column, { grp: 'structure' });
    box(x, eave / 2, 43.6, 0.35, eave, 0.35, MAT.column, { grp: 'structure' });
    beam([x, eave, -43.6], [x, ridge - 0.2, 0], 0.3, 0.3, MAT.steel, { grp: 'structure' });
    beam([x, ridge - 0.2, 0], [x, eave, 43.6], 0.3, 0.3, MAT.steel, { grp: 'structure' });
    box(x, eave - 0.35, 0, 0.25, 0.25, 86.5, MAT.steel, { grp: 'structure' }); // tie beam
  }
  // interior columns
  for (let x = -60; x <= 60; x += 20) {
    box(x, eave / 2, -22, 0.3, eave, 0.3, MAT.column, { grp: 'structure' });
    box(x, eave / 2, 22, 0.3, eave, 0.3, MAT.column, { grp: 'structure' });
  }
  // purlins on each slope
  for (const side of [-1, 1]) {
    for (const fz of [11, 22, 33]) {
      const z = side * fz;
      const y = eave + (1 - fz / 44) * (ridge - eave);
      box(0, y - 0.12, z, 141, 0.22, 0.18, MAT.steelDk, { grp: 'structure' });
    }
  }
  // wall bracing X on gable ends
  beam([-70, 1, -43.7], [-70, eave - 1, -20], 0.12, 0.12, MAT.steelLt, { grp: 'structure' });
  beam([-70, 1, -20], [-70, eave - 1, -43.7], 0.12, 0.12, MAT.steelLt, { grp: 'structure' });
  beam([70, 1, 43.7], [70, eave - 1, 20], 0.12, 0.12, MAT.steelLt, { grp: 'structure' });
  beam([70, 1, 20], [70, eave - 1, 43.7], 0.12, 0.12, MAT.steelLt, { grp: 'structure' });
  // corner columns
  for (const [cx, cz] of [[-70, -44], [-70, 44], [70, -44], [70, 44]]) {
    box(cx, eave / 2, cz, 0.5, eave, 0.5, MAT.column, { grp: 'structure' });
  }
  // POV collision walls
  addCollider(WH.x0 - 0.6, WH.z0 - 0.6, WH.x0 + 0.6, WH.z1 + 0.6);
  addCollider(WH.x1 - 0.6, WH.z0 - 0.6, WH.x1 + 0.6, WH.z1 + 0.6);
  addCollider(WH.x0 - 0.6, WH.z0 - 0.6, WH.x1 + 0.6, WH.z0 + 0.6);
  addCollider(WH.x0 - 0.6, WH.z1 - 0.6, WH.x1 + 0.6, WH.z1 + 0.6);

  /* ---- north dock (z = +44): six doors ---- */
  const dockDoor = (x, id, side) => {
    const z = side > 0 ? WH.z1 : WH.z0;
    box(x, 2.4, z, 4.6, 4.8, 0.25, MAT.dark, { grp: 'architecture' });                 // recess
    box(x, 2.4, z - side * 0.05, 4.4, 4.6, 0.12, MAT.door, { grp: 'architecture' });    // shutter
    box(x - 2.4, 2.5, z - side * 0.35, 0.25, 5.0, 0.5, MAT.doorTrim, { grp: 'architecture' });
    box(x + 2.4, 2.5, z - side * 0.35, 0.25, 5.0, 0.5, MAT.doorTrim, { grp: 'architecture' });
    box(x, 5.05, z - side * 0.35, 5.1, 0.25, 0.5, MAT.doorTrim, { grp: 'architecture' });
    box(x - 1.9, 0.25, z - side * 0.6, 0.7, 0.5, 0.35, MAT.rubber, { grp: 'architecture' }); // bumpers
    box(x + 1.9, 0.25, z - side * 0.6, 0.7, 0.5, 0.35, MAT.rubber, { grp: 'architecture' });
    box(x, 0.12, z - side * 0.9, 4.2, 0.24, 1.4, MAT.steelDk, { grp: 'architecture' });   // dock leveller
    box(x, 5.6, z - side * 1.9, 6.4, 0.18, 3.4, MAT.steelLt, { grp: 'architecture' });    // canopy
    beam([x - 3.2, 5.5, z - side * 0.4], [x - 3.2, 5.5, z - side * 3.4], 0.12, 0.12, MAT.steelDk, { grp: 'structure' });
    beam([x + 3.2, 5.5, z - side * 0.4], [x + 3.2, 5.5, z - side * 3.4], 0.12, 0.12, MAT.steelDk, { grp: 'structure' });
    prism(x - 2.6, 0.5, z - side * 1.1, 0.16, 1.0, 8, MAT.bollard, { grp: 'firesafety', caps: true });
    prism(x + 2.6, 0.5, z - side * 1.1, 0.16, 1.0, 8, MAT.bollard, { grp: 'firesafety', caps: true });
    LABELS.push({ el: null, text: id, pos: [x, 5.6, z - side * 0.4], size: 13, cls: 'zone-label' });
  };
  [-55, -35, -15, 5, 25, 45].forEach((x, i) => dockDoor(x, 'D' + (i + 1), 1));
  /* ---- south outbound dock: four doors + two wide outbound doors ---- */
  [-55, -30, -5, 30].forEach((x, i) => dockDoor(x, 'S' + (i + 1), -1));
  for (const x of [10, 34]) {
    box(x, 2.5, WH.z0, 5.4, 5.0, 0.25, MAT.dark, { grp: 'architecture' });
    box(x, 2.5, WH.z0 + 0.05, 5.2, 4.8, 0.12, MAT.door, { grp: 'architecture' });
    box(x, 5.4, WH.z0 - 1.6, 6.4, 0.18, 3.0, MAT.steelLt, { grp: 'architecture' });
    flat([[x - 3, 0.03, WH.z0 - 4.5], [x + 3, 0.03, WH.z0 - 4.5], [x + 3, 0.03, WH.z0 - 3.6], [x - 3, 0.03, WH.z0 - 3.6]], MAT.hazard, { grp: 'firesafety' });
  }
  // keep-clear hatches at docks
  for (const x of [-55, -35, -15, 5, 25, 45]) {
    flat([[x - 3.4, 0.028, 45.2], [x + 3.4, 0.028, 45.2], [x + 3.4, 0.028, 48.4], [x - 3.4, 0.028, 48.4]], MAT.hazard, { grp: 'firesafety', alpha: 0.85 });
  }
  // personnel + emergency doors
  box(-20, 1.2, WH.z1 - 0.06, 1.1, 2.4, 0.12, MAT.door, { grp: 'architecture' });
  box(48, 1.2, WH.z1 - 0.06, 1.1, 2.4, 0.12, MAT.door, { grp: 'architecture' });
  box(-40, 1.2, WH.z0 + 0.06, 1.1, 2.4, 0.12, MAT.door, { grp: 'architecture' });
  box(58, 1.2, WH.z0 + 0.06, 1.1, 2.4, 0.12, MAT.door, { grp: 'architecture' });
  // emergency exit signs (emissive)
  box(-30, 3.4, WH.z1 - 0.25, 1.1, 0.42, 0.08, MAT.exit, { grp: 'firesafety' });
  box(20, 3.4, WH.z0 + 0.25, 1.1, 0.42, 0.08, MAT.exit, { grp: 'firesafety' });
  box(-70 + 0.25, 3.4, 0, 0.08, 0.42, 1.1, MAT.exit, { grp: 'firesafety' });
  // red fire-water main along south interior wall
  beam([-66, 1.15, -42.6], [66, 1.15, -42.6], 0.16, 0.16, MAT.red, { grp: 'firesafety' });
  for (let x = -60; x <= 60; x += 15) box(x, 1.15, -42.9, 0.1, 0.1, 0.5, MAT.red, { grp: 'firesafety' });
  prism(-66, 1.15, -42.6, 0.22, 0.3, 8, MAT.red, { grp: 'firesafety', caps: true });
  // zone bands A–J painted on floor + temporary area D–G tint
  for (let i = 0; i <= 10; i++) {
    const x = -70 + i * 14;
    flat([[x, 0.025, -43], [x + 0.18, 0.025, -43], [x + 0.18, 0.025, 43], [x, 0.025, 43]], MAT.white, { grp: 'architecture', alpha: 0.55 });
  }
  flat([[-28, 0.022, -43], [28, 0.022, -43], [28, 0.022, 43], [-28, 0.022, 43]], MAT.yellow, { grp: 'architecture', alpha: 0.06 });
  // vehicle lanes & pedestrian lanes
  flat([[-38, 0.024, -1.2], [66, 0.024, -1.2], [66, 0.024, 1.2], [-38, 0.024, 1.2]], MAT.white, { grp: 'architecture', alpha: 0.4 });
  flat([[-38, 0.024, 6.4], [66, 0.024, 6.4], [66, 0.024, 7.4], [-38, 0.024, 7.4]], MAT.green, { grp: 'architecture', alpha: 0.5 });
  flat([[-38, 0.024, -7.4], [66, 0.024, -7.4], [66, 0.024, -6.4], [-38, 0.024, -6.4]], MAT.green, { grp: 'architecture', alpha: 0.5 });
  // pedestrian crossing zebra at main aisle
  for (let i = 0; i < 6; i++) {
    flat([[2, 0.026, -3 + i * 1.1], [8, 0.026, -3 + i * 1.1], [8, 0.026, -2.45 + i * 1.1], [2, 0.026, -2.45 + i * 1.1]], MAT.white, { grp: 'architecture', alpha: 0.7 });
  }
  // high-bay LED fixtures
  for (const lx of [-50, -17, 16, 49]) {
    for (let lz = -40; lz <= 40; lz += 10) {
      beam([lx, 8.9, lz], [lx, 8.1, lz], 0.06, 0.06, MAT.steelDk, { grp: 'architecture' });
      box(lx, 7.95, lz, 1.1, 0.18, 0.35, MAT.steelDk, { grp: 'architecture' });
      box(lx, 7.84, lz, 0.95, 0.05, 0.25, MAT.led, { grp: 'architecture', emis: true });
    }
  }
  // cable tray along north wall + drops
  beam([-66, 4.4, 42.4], [66, 4.4, 42.4], 0.5, 0.1, MAT.tray, { grp: 'electrical' });
  beam([-66, 4.4, 42.4], [-66, 4.4, 30], 0.5, 0.1, MAT.tray, { grp: 'electrical' });
  for (let x = -60; x <= 60; x += 20) {
    box(x, 3.4, 42.4, 0.18, 2.0, 0.18, MAT.tray, { grp: 'electrical' });
    box(x, 2.3, 42.4, 0.5, 0.7, 0.25, MAT.panel, { grp: 'electrical' });   // junction boxes
  }
  // distribution panels on walls
  box(-68.6, 1.6, -10, 0.25, 1.6, 1.4, MAT.mdp, { grp: 'electrical', sys: 1, aabb: true });
  box(68.6, 1.6, 0, 0.25, 1.6, 1.4, MAT.mdp, { grp: 'electrical' });
  // conduits to office block
  beam([-54.5, 0.3, -8], [-54.5, 0.3, 8], 0.09, 0.09, MAT.pvc, { grp: 'electrical', sys: 1 });
  beam([-54.5, 0.3, 8], [-54.5, 2.6, 8], 0.09, 0.09, MAT.pvc, { grp: 'electrical', sys: 1 });
}

function buildOfficeBlock() {
  const o = OFFICE;
  const h = o.h, x0 = o.x0, x1 = o.x1, z0 = o.z0, z1 = o.z1;
  const wallT = 0.12;
  const wall = (cx, cy, cz, w, hh, d, mat) => box(cx, cy, cz, w, hh, d, mat, { grp: 'architecture' });
  // exterior walls (door gap in east wall at z ∈ [-1.2, 0.2])
  wall((x0 + x1) / 2, h / 2, z0 + wallT / 2, x1 - x0, h, wallT, MAT.office);
  wall((x0 + x1) / 2, h / 2, z1 - wallT / 2, x1 - x0, h, wallT, MAT.office);
  wall(x0 + wallT / 2, h / 2, (z0 + z1) / 2, wallT, h, z1 - z0, MAT.office);
  wall(x1 - wallT / 2, h / 2, (z0 - 1.2) / 2, wallT, h, -1.2 - z0, MAT.office);
  wall(x1 - wallT / 2, h / 2, (0.2 + z1) / 2, wallT, h, z1 - 0.2, MAT.office);
  box(x1 - wallT / 2, 2.0, -0.5, wallT, 1.6, 0.1, MAT.office, { grp: 'architecture' }); // lintel
  // roof slab + ceiling + floor
  box((x0 + x1) / 2, h + 0.06, (z0 + z1) / 2, x1 - x0 + 0.2, 0.12, z1 - z0 + 0.2, MAT.concrete, { grp: 'architecture' });
  flat([[x0 + 0.1, h - 0.02, z0 + 0.1], [x1 - 0.1, h - 0.02, z0 + 0.1], [x1 - 0.1, h - 0.02, z1 - 0.1], [x0 + 0.1, h - 0.02, z1 - 0.1]], MAT.concrete, { grp: 'architecture', noCull: true });
  box((x0 + x1) / 2, 0.03, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, MAT.officeFl, { grp: 'architecture' });
  // partitions — meeting (SW), training (NW), admin (SE), office (NE), server (N)
  // glass partition on meeting-room east side (x = -58, z -18..-6)
  box(-58, h / 2, -12, 0.1, h, 11.8, MAT.glass, { grp: 'architecture', alpha: 0.4 });
  wall(-58, h / 2, 12, 0.1, h, 11.8, MAT.office);                                   // training/office divider north half
  // meeting-room north partition with door gap (x -68..-62 and -59..-58)
  wall(-65, h / 2, -6, 6.0, h, 0.1, MAT.office);
  wall(-58.55, h / 2, -6, 1.1, h, 0.1, MAT.office);
  // training-room south partition with door gap
  wall(-65, h / 2, 6, 6.0, h, 0.1, MAT.office);
  wall(-58.55, h / 2, 6, 1.1, h, 0.1, MAT.office);
  // admin/office divider (z = 0) and server-room divider (z = 10)
  wall(-56, h / 2, 0, 3.8, h, 0.1, MAT.office);
  wall(-56, h / 2, 10, 3.0, h, 0.1, MAT.office);
  wall(-54.6, h / 2, 14, 0.1, h, 8.0, MAT.office);                                   // server room east wall inset
  // door leaves (open)
  box(x1 - 0.3, 1.1, -2.2, 0.06, 2.2, 1.1, MAT.door, { grp: 'architecture' });
  // meeting-room furniture
  box(-63, 0.75, -12, 3.2, 0.1, 1.6, MAT.wood, { grp: 'architecture' });
  for (const [cx, cz] of [[-63, -13.4], [-63, -10.6], [-64.5, -12], [-61.5, -12]]) {
    box(cx, 0.45, cz, 0.5, 0.08, 0.5, MAT.wood, { grp: 'architecture' });
    box(cx, 0.22, cz, 0.45, 0.45, 0.45, MAT.steelDk, { grp: 'architecture' });
  }
  // office + admin desks
  for (const [dx, dz] of [[-56, -14], [-56, -10]]) {
    box(dx, 0.74, dz, 1.6, 0.06, 0.8, MAT.wood, { grp: 'architecture' });
    box(dx, 0.37, dz, 0.08, 0.72, 0.7, MAT.steelDk, { grp: 'architecture' });
    box(dx + 0.4, 0.55, dz, 0.5, 0.4, 0.06, MAT.dark, { grp: 'architecture' });
    box(dx - 0.6, 0.5, dz, 0.45, 0.5, 0.45, MAT.steelDk, { grp: 'architecture' });
  }
  // training-room tables
  for (const [tx, tz] of [[-63, 10], [-59.5, 10], [-63, 14], [-59.5, 14]]) {
    box(tx, 0.74, tz, 1.8, 0.07, 0.9, MAT.wood, { grp: 'architecture' });
    box(tx, 0.36, tz, 0.5, 0.7, 0.5, MAT.steelDk, { grp: 'architecture' });
  }
  // server racks
  box(-55.4, 1.1, 13, 0.7, 2.2, 0.8, MAT.dark, { grp: 'architecture' });
  box(-55.4, 1.1, 14.4, 0.7, 2.2, 0.8, MAT.dark, { grp: 'architecture' });
  box(-55.4, 1.1, 15.8, 0.7, 2.2, 0.8, MAT.dark, { grp: 'architecture' });
  // cabinets
  box(-66.8, 1.0, -16, 0.6, 2.0, 1.2, MAT.steelDk, { grp: 'architecture' });
  box(-66.8, 1.0, -14.4, 0.6, 2.0, 1.2, MAT.steelDk, { grp: 'architecture' });
  // interior lights
  for (const [lx, lz] of [[-61, -12], [-61, 12], [-56, -14], [-56, 14]]) {
    box(lx, h - 0.1, lz, 0.9, 0.06, 0.3, MAT.led, { grp: 'architecture', emis: true });
  }
  addCollider(x0, z0, x1, z1);
  LABELS.push({ el: null, text: 'MEETING', pos: [-63, 2.2, -15.5], size: 12, cls: 'zone-label' });
  LABELS.push({ el: null, text: 'SERVER ROOM', pos: [-56, 2.2, 16.5], size: 12, cls: 'zone-label' });
  LABELS.push({ el: null, text: 'TRAINING', pos: [-63, 2.2, 8], size: 12, cls: 'zone-label' });
  LABELS.push({ el: null, text: 'ADMIN', pos: [-56, 2.2, -14.5], size: 12, cls: 'zone-label' });
  LABELS.push({ el: null, text: 'OFFICE', pos: [-56, 2.2, 5], size: 12, cls: 'zone-label' });
}

function buildStorage() {
  const rackRow = (cx, z0, z1, bays) => {
    const len = z1 - z0, bayW = len / bays, depth = 1.2, h = 6;
    addCollider(cx - depth, z0, cx + depth, z1);
    for (let i = 0; i <= bays; i++) {
      const z = z0 + i * bayW;
      box(cx - depth / 2 + 0.05, h / 2, z, 0.1, h, 0.1, MAT.rack, { grp: 'storage' });
      box(cx + depth / 2 - 0.05, h / 2, z, 0.1, h, 0.1, MAT.rack, { grp: 'storage' });
    }
    for (let i = 0; i < bays; i++) {
      const z = z0 + i * bayW + bayW / 2;
      for (const y of [2.2, 4.4]) {
        box(cx, y, z - bayW / 2 + 0.05, depth - 0.1, 0.12, 0.08, MAT.rackBeam, { grp: 'storage' });
        box(cx, y, z + bayW / 2 - 0.05, depth - 0.1, 0.12, 0.08, MAT.rackBeam, { grp: 'storage' });
      }
      box(cx, 0.06, z, depth - 0.1, 0.12, bayW - 0.1, MAT.rackBeam, { grp: 'storage' }); // floor beam
      // pallets + cartons (mixed occupancy)
      for (const [py, lvl] of [[0.25, 0], [2.35, 1]]) {
        if ((i * 7 + lvl * 3) % 3 === 0) continue; // empty slot
        box(cx, py + 0.075, z, 1.0, 0.15, 1.0, MAT.pallet, { grp: 'storage' });
        if ((i + lvl) % 2 === 0) {
          box(cx - 0.1, py + 0.45, z - 0.05, 0.7, 0.5, 0.7, MAT.carton, { grp: 'storage' });
          box(cx + 0.25, py + 0.35, z + 0.1, 0.45, 0.3, 0.5, MAT.carton2, { grp: 'storage' });
        } else {
          box(cx, py + 0.4, z, 0.9, 0.65, 0.9, MAT.wrap, { grp: 'storage' });
        }
      }
      if (h > 4 && (i % 2 === 0)) {
        box(cx, 4.75, z, 0.9, 0.5, 0.9, MAT.wrap, { grp: 'storage' });
      }
    }
    // row end guards
    box(cx, 0.5, z0, depth + 0.2, 1.0, 0.15, MAT.yellow, { grp: 'firesafety' });
    box(cx, 0.5, z1, depth + 0.2, 1.0, 0.15, MAT.yellow, { grp: 'firesafety' });
  };
  rackRow(-40, -30, 30, 12);
  rackRow(30, -30, 30, 12);
  rackRow(44, -30, 30, 12);
  LABELS.push({ el: null, text: 'AISLE 01', pos: [20, 0.4, -32], size: 12, cls: 'zone-label' });
  LABELS.push({ el: null, text: 'AISLE 02', pos: [37, 0.4, 32], size: 12, cls: 'zone-label' });
  LABELS.push({ el: null, text: 'AISLE 03', pos: [-46, 0.4, 32], size: 12, cls: 'zone-label' });
}

function buildConveyors() {
  // main conveyor line along z at x = 8..12
  for (let z = -38; z <= 38; z += 4) {
    box(10, 0.45, z, 4.0, 0.9, 3.6, MAT.steelDk, { grp: 'conveyors' });
    box(10, 0.95, z, 4.0, 0.12, 3.6, MAT.belt, { grp: 'conveyors', uv: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  }
  // flow arrows on belt
  for (let z = -34; z <= 34; z += 8) {
    flat([[9, 0.99, z - 1.2], [11, 0.99, z - 1.2], [11, 0.99, z + 0.4], [10, 0.99, z - 0.4], [9, 0.99, z + 0.4]], MAT.yellow, { grp: 'conveyors', alpha: 0.8 });
  }
  LABELS.push({ el: null, text: 'CONVEYOR FLOW →', pos: [10, 1.6, 36], size: 12, cls: 'zone-label' });
  // seven representative access platforms (tentative)
  for (let i = 0; i < 7; i++) {
    const z = -33 + i * 11;
    const x = 14.6;
    box(x, 0.4, z, 0.18, 0.8, 0.18, MAT.steel, { grp: 'conveyors', sys: 7 });
    box(x + 1.6, 0.4, z, 0.18, 0.8, 0.18, MAT.steel, { grp: 'conveyors', sys: 7 });
    box(x + 0.8, 1.55, z, 2.2, 0.1, 1.7, MAT.grating, { grp: 'conveyors', sys: 7 });
    // handrails
    beam([x - 0.2, 1.6, z - 0.8], [x - 0.2, 2.6, z - 0.8], 0.06, 0.06, MAT.steelLt, { grp: 'conveyors', sys: 7 });
    beam([x + 1.8, 1.6, z - 0.8], [x + 1.8, 2.6, z - 0.8], 0.06, 0.06, MAT.steelLt, { grp: 'conveyors', sys: 7 });
    beam([x - 0.2, 2.6, z - 0.8], [x + 1.8, 2.6, z - 0.8], 0.06, 0.06, MAT.steelLt, { grp: 'conveyors', sys: 7 });
    beam([x - 0.2, 2.1, z - 0.8], [x + 1.8, 2.1, z - 0.8], 0.05, 0.05, MAT.steelLt, { grp: 'conveyors', sys: 7 });
    beam([x + 1.8, 1.6, z - 0.8], [x + 1.8, 2.6, z + 0.8], 0.06, 0.06, MAT.steelLt, { grp: 'conveyors', sys: 7 });
    beam([x + 1.8, 2.6, z - 0.8], [x + 1.8, 2.6, z + 0.8], 0.06, 0.06, MAT.steelLt, { grp: 'conveyors', sys: 7 });
    // kickplate
    box(x + 0.8, 1.68, z - 0.78, 2.2, 0.16, 0.04, MAT.steelDk, { grp: 'conveyors', sys: 7 });
    // stairs (4 steps) on south side
    for (let s = 0; s < 4; s++) {
      box(x + 0.8, 0.2 + s * 0.36, z + 1.15 + s * 0.32, 1.4, 0.14, 0.34, MAT.grating, { grp: 'conveyors', sys: 7 });
    }
    SELECTABLES.push({ sys: 7, min: [x - 0.4, 0, z - 1.2], max: [x + 2.2, 2.8, z + 2.6] });
  }
  // secondary short conveyor to south dock
  for (let z = -40; z <= -34; z += 3) {
    box(-14, 0.45, z, 3.2, 0.9, 2.6, MAT.steelDk, { grp: 'conveyors' });
    box(-14, 0.95, z, 3.2, 0.12, 2.6, MAT.belt, { grp: 'conveyors' });
  }
}

function buildSystem01() {
  // meeting-room outlets SK-1..SK-10 on PVC conduit, ±250 mm AFFL
  // SK-1..5 on the meeting-room south wall, SK-6..10 on the west wall
  const sZ = OFFICE.z0 + 0.1; // south wall inner face
  const wX = OFFICE.x0 + 0.1; // west wall inner face
  const outlet = (x, z, alongWall) => {
    box(x, 0.25, z, alongWall ? 0.16 : 0.06, 0.16, alongWall ? 0.06 : 0.16, MAT.pvc, { grp: 'electrical', sys: 1 });
    // drop conduit to floor tee
    const jx = alongWall ? x : x - 1.2;
    const jz = alongWall ? z - 1.2 : z;
    beam([x, 0.25, z], [x, 0.25, alongWall ? z - 1.2 : z], 0.07, 0.07, MAT.pvc, { grp: 'electrical', sys: 1 });
    if (!alongWall) beam([x, 0.25, z], [x - 1.2, 0.25, z], 0.07, 0.07, MAT.pvc, { grp: 'electrical', sys: 1 });
    box(jx, 0.25, jz, 0.18, 0.18, 0.18, MAT.pvc, { grp: 'electrical', sys: 1 }); // tee junction box
    return [jx, jz];
  };
  const junctions = [];
  for (let i = 0; i < 5; i++) junctions.push(outlet(-66.5 + i * 2.0, sZ - 0.03, true));
  for (let i = 0; i < 5; i++) junctions.push(outlet(wX + 0.03, -16 + i * 2.0, false));
  // conduit spine along south wall and west wall + riser to distribution panel
  beam([-67, 0.25, sZ - 1.2], [-55.4, 0.25, sZ - 1.2], 0.08, 0.08, MAT.pvc, { grp: 'electrical', sys: 1 });
  beam([wX + 1.2, 0.25, -17.5], [wX + 1.2, 0.25, -7.4], 0.08, 0.08, MAT.pvc, { grp: 'electrical', sys: 1 });
  beam([wX + 1.2, 0.25, -17.5], [-67, 0.25, sZ - 1.2], 0.08, 0.08, MAT.pvc, { grp: 'electrical', sys: 1 });
  beam([-55.4, 0.25, sZ - 1.2], [-55.4, 1.4, sZ - 1.2], 0.08, 0.08, MAT.pvc, { grp: 'electrical', sys: 1 });
  box(-55.4, 1.55, sZ - 1.3, 0.9, 1.0, 0.2, MAT.mdp, { grp: 'electrical', sys: 1, aabb: true }); // distribution panel
  // grounding connection at panel
  prism(-55.4, 0.35, sZ - 1.6, 0.09, 0.7, 6, MAT.copper, { grp: 'electrical', sys: 1, caps: true });
  // NYM cable overlay (technical mode) — bright amber tubes beside conduit
  for (const [jx, jz] of junctions) {
    beam([jx + 0.08, 0.29, jz], [jx + 0.08, 0.29, jz + 0.9], 0.03, 0.03, MAT.cable, { grp: 'electrical', sys: 1, tag: 'cable01' });
  }
  beam([-66.9, 0.29, sZ - 1.31], [-55.5, 0.29, sZ - 1.31], 0.035, 0.035, MAT.cable, { grp: 'electrical', sys: 1, tag: 'cable01' });
  for (let i = 0; i < 5; i++) {
    LABELS.push({ el: null, text: 'SK-' + (i + 1), pos: [-66.5 + i * 2.0, 0.55, sZ + 0.3], size: 11, cls: 'zone-label', sys: 1 });
    LABELS.push({ el: null, text: 'SK-' + (i + 6), pos: [wX + 0.3, 0.55, -16 + i * 2.0], size: 11, cls: 'zone-label', sys: 1 });
  }
  SELECTABLES.push({ sys: 1, min: [OFFICE.x0, 0, OFFICE.z0], max: [OFFICE.x1, OFFICE.h + 0.2, OFFICE.z1] });
}

function buildSystem02() {
  const barrier = (cx, cz, len, rot, hgt) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (u, v) => [cx + u * c - v * s, 0, cz + u * s + v * c];
    for (let u = -len / 2; u <= len / 2 + 0.1; u += 3) {
      const p = P(u, 0);
      box(p[0], hgt / 2, p[2], 0.12, hgt, 0.12, MAT.steelLt, { grp: 'firesafety', sys: 2 });
      box(p[0], 0.03, p[2], 0.4, 0.06, 0.4, MAT.steelDk, { grp: 'firesafety', sys: 2 }); // baseplate
    }
    // mesh panel (two-sided)
    const a = P(-len / 2, 0), b = P(len / 2, 0);
    const nx = Math.sin(rot), nz = -Math.cos(rot);
    face([a, b, [b[0], hgt, b[2]], [a[0], hgt, a[2]]], MAT.mesh, { grp: 'firesafety', sys: 2, alpha: 0.7, outward: [nx, 0, nz], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    face([a, [a[0], hgt, a[2]], [b[0], hgt, b[2]], b], MAT.mesh, { grp: 'firesafety', sys: 2, alpha: 0.7, outward: [-nx, 0, -nz], uv: [[0, 0], [0, 1], [1, 1], [1, 0]] });
    // top frame rail
    beam([a[0], hgt, a[2]], [b[0], hgt, b[2]], 0.08, 0.08, MAT.steelLt, { grp: 'firesafety', sys: 2 });
    beam([a[0], 0.06, a[2]], [b[0], 0.06, b[2]], 0.08, 0.08, MAT.steelLt, { grp: 'firesafety', sys: 2 });
    SELECTABLES.push({ sys: 2, min: [cx - len / 2 - 0.5, 0, cz - len / 2 - 0.5], max: [cx + len / 2 + 0.5, hgt + 0.3, cz + len / 2 + 0.5] });
  };
  barrier(0, -46.2, 48, 0, 1.0);        // outbound barrier ~1 m (documented)
  barrier(20, 12, 6, Math.PI / 2, 1.2);  // tentative interior point
  barrier(-50, -26, 4, 0, 1.2);          // tentative point near consumable cage
}

function buildSystem03() {
  const fan = (cx, cz) => {
    // suspension frame from roof
    beam([cx, 10.6, cz], [cx, 8.3, cz], 0.12, 0.12, MAT.steelDk, { grp: 'mechanical', sys: 3 });
    beam([cx - 1.2, 10.4, cz], [cx, 8.35, cz], 0.09, 0.09, MAT.steelDk, { grp: 'mechanical', sys: 3 });
    beam([cx + 1.2, 10.4, cz], [cx, 8.35, cz], 0.09, 0.09, MAT.steelDk, { grp: 'mechanical', sys: 3 });
    // hub + motor
    prism(cx, 7.9, cz, 0.55, 0.7, 10, MAT.fan, { grp: 'mechanical', sys: 3, caps: true });
    prism(cx, 8.45, cz, 0.3, 0.5, 8, MAT.steelDk, { grp: 'mechanical', sys: 3, caps: true });
    // safety cable
    beam([cx, 10.5, cz], [cx, 8.2, cz], 0.03, 0.03, MAT.yellow, { grp: 'mechanical', sys: 3 });
    // six blades (animated)
    const blades = [];
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * Math.PI * 2;
      const local = [];
      const r0 = 0.5, r1 = 3.65, w0 = 0.34, w1 = 0.62;
      const corners = [
        [r0, -w0], [r1, -w1], [r1, w1], [r0, w0],
      ].map(p => [cx + p[0] * Math.cos(a) - p[1] * Math.sin(a), 7.62, cz + p[0] * Math.sin(a) + p[1] * Math.cos(a)]);
      const localCorners = corners.map(p => [p[0] - cx, p[1] - 7.62, p[2] - cz]);
      const fcTop = face(corners, MAT.fanBlade, { grp: 'mechanical', sys: 3, outward: [0, 1, 0] });
      const fcBot = face(corners.slice().reverse(), MAT.fanBlade, { grp: 'mechanical', sys: 3, outward: [0, -1, 0] });
      blades.push({ fc: fcTop, local: localCorners }, { fc: fcBot, local: localCorners });
    }
    ANIMATORS.push({
      cx, cy: 7.62, cz, speed: 0.55,
      update(t) {
        const ang = t * this.speed;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        for (const bl of blades) {
          for (let i = 0; i < bl.fc.v.length; i++) {
            const p = bl.local[i];
            bl.fc.v[i] = [this.cx + p[0] * ca - p[2] * sa, this.cy + p[1], this.cz + p[0] * sa + p[2] * ca];
          }
        }
      },
    });
    // no-obstruction safety radius (painted)
    flat([[cx - 4.2, 0.03, cz - 4.2], [cx + 4.2, 0.03, cz - 4.2], [cx + 4.2, 0.03, cz + 4.2], [cx - 4.2, 0.03, cz + 4.2]], MAT.radius, { grp: 'mechanical', sys: 3, uv: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    // VFD control panel on nearby wall
    const vx = cx < 0 ? -69.4 : 69.4;
    box(vx, 1.5, cz + 3, 0.2, 1.3, 0.9, MAT.vfd, { grp: 'mechanical', sys: 3 });
    SELECTABLES.push({ sys: 3, min: [cx - 4, 6.8, cz - 4], max: [cx + 4, 8.6, cz + 4] });
  };
  fan(-20, 0);
  fan(24, 0);
}

function buildSystem04() {
  // four APAR points
  const apar = (x, y, z, wallOut) => {
    box(x, y, z, 0.3, 0.12, 0.3, MAT.steelDk, { grp: 'facilities', sys: 4 });       // bracket
    prism(x, y + 0.45, z, 0.11, 0.55, 8, MAT.red, { grp: 'facilities', sys: 4, caps: true });
    prism(x, y + 0.78, z, 0.04, 0.12, 6, MAT.dark, { grp: 'facilities', sys: 4, caps: true });
    box(x + wallOut[0] * 0.1, y + 1.15, z + wallOut[2] * 0.1, 0.5, 0.3, 0.06, MAT.aparSign, { grp: 'facilities', sys: 4 });
  };
  apar(-20, 1.2, 43.3, [0, 0, -1]);
  apar(20, 1.2, -43.3, [0, 0, 1]);
  apar(-53.4, 1.2, 14, [1, 0, 0]);
  apar(69.4, 1.2, -20, [-1, 0, 0]);
  // portable toilets (south-east yard)
  for (const [tx, tz, col] of [[52, -53, MAT.toilet], [55, -53, MAT.toilet]]) {
    box(tx, 1.15, tz, 1.3, 2.3, 1.3, col, { grp: 'facilities', sys: 4 });
    box(tx, 2.42, tz, 1.44, 0.12, 1.44, MAT.roof, { grp: 'facilities', sys: 4 });
    box(tx - 0.2, 1.0, tz - 0.64, 0.7, 1.8, 0.06, MAT.door, { grp: 'facilities', sys: 4 });
    box(tx, 0.08, tz, 1.5, 0.16, 1.5, MAT.concrete, { grp: 'facilities', sys: 4 });
    addCollider(tx - 0.8, tz - 0.8, tx + 0.8, tz + 0.8);
  }
  // elevated water tank (torent)
  const tx = 62, tz = -52;
  for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
    box(tx + lx, 0.7, tz + lz, 0.14, 1.4, 0.14, MAT.steelDk, { grp: 'facilities', sys: 4 });
  }
  box(tx, 1.42, tz, 2.8, 0.14, 2.8, MAT.steelDk, { grp: 'facilities', sys: 4 });
  prism(tx, 2.7, tz, 1.5, 2.0, 12, MAT.toilet, { grp: 'facilities', sys: 4, caps: true });
  prism(tx, 3.85, tz, 0.5, 0.5, 8, MAT.steelLt, { grp: 'facilities', sys: 4, caps: true }); // lid
  box(tx, 3.2, tz + 1.62, 0.5, 1.2, 0.06, MAT.tankSign, { grp: 'facilities', sys: 4 });
  // clean-water pipe route to toilets
  beam([tx, 2.2, tz + 1.2], [tx, 0.3, tz + 1.2], 0.09, 0.09, MAT.blue, { grp: 'facilities', sys: 4 });
  beam([tx, 0.3, tz + 1.2], [53.5, 0.3, tz + 1.2], 0.09, 0.09, MAT.blue, { grp: 'facilities', sys: 4 });
  beam([53.5, 0.3, tz + 1.2], [53.5, 0.8, tz + 1.2], 0.09, 0.09, MAT.blue, { grp: 'facilities', sys: 4 });
  SELECTABLES.push({ sys: 4, min: [50, 0, -57], max: [65, 4.5, -47] });
  for (const [x, y, z] of [[-20, 1.2, 43.3], [20, 1.2, -43.3], [-53.4, 1.2, 14], [69.4, 1.2, -20]]) {
    SELECTABLES.push({ sys: 4, min: [x - 0.6, y - 0.3, z - 0.6], max: [x + 0.6, y + 1.6, z + 0.6] });
  }
}

function buildSystem05() {
  const gx = 82, gz = 18; // generator house centre (east exterior)
  box(gx, 0.15, gz, 12.6, 0.3, 7.6, MAT.concrete, { grp: 'facilities', sys: 5 });        // slab
  // walls (leave west face open as wide service opening)
  box(gx, 1.65, gz - 3.3, 12, 3.0, 0.15, MAT.cladding, { grp: 'facilities', sys: 5 });    // north
  box(gx, 1.65, gz + 3.3, 12, 3.0, 0.15, MAT.cladding, { grp: 'facilities', sys: 5 });    // south
  box(gx + 5.85, 1.65, gz, 0.15, 3.0, 6.6, MAT.cladding, { grp: 'facilities', sys: 5 });  // east
  box(gx - 5.85, 1.65, gz - 2.4, 0.15, 3.0, 2.4, MAT.cladding, { grp: 'facilities', sys: 5 }); // west segment
  box(gx - 5.85, 1.65, gz + 2.4, 0.15, 3.0, 2.4, MAT.cladding, { grp: 'facilities', sys: 5 }); // west segment
  box(gx - 5.85, 2.9, gz, 0.15, 0.5, 3.6, MAT.cladding, { grp: 'facilities', sys: 5 });   // lintel
  // roof
  box(gx, 3.3, gz, 12.6, 0.18, 7.6, MAT.roof, { grp: 'facilities', sys: 5 });
  // acoustic intent: perforated inner panels
  box(gx, 1.5, gz - 3.2, 11.4, 2.6, 0.05, MAT.perf, { grp: 'facilities', sys: 5 });
  // intake louver (north face)
  box(gx - 2, 1.7, gz - 3.42, 2.4, 1.8, 0.1, MAT.louver, { grp: 'facilities', sys: 5 });
  // access door (east face)
  box(gx + 5.95, 1.15, gz + 1.8, 0.1, 2.3, 1.2, MAT.door, { grp: 'facilities', sys: 5 });
  // generator unit on anti-vibration mounts
  for (const [mx, mz] of [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]]) {
    prism(gx + mx, 0.45, gz + mz, 0.18, 0.3, 6, MAT.dark, { grp: 'mechanical', sys: 5, caps: true });
  }
  box(gx, 1.35, gz, 3.4, 1.6, 1.6, MAT.genset, { grp: 'mechanical', sys: 5 });
  box(gx, 2.25, gz, 2.6, 0.35, 1.2, MAT.gensetDk, { grp: 'mechanical', sys: 5 });         // canopy
  box(gx - 0.6, 1.35, gz + 0.82, 0.7, 0.9, 0.06, MAT.panel, { grp: 'mechanical', sys: 5 }); // control cubicle
  // exhaust route + weather cap
  prism(gx + 1.2, 2.9, gz, 0.16, 1.6, 8, MAT.steelDk, { grp: 'mechanical', sys: 5, caps: true });
  prism(gx + 1.2, 3.85, gz, 0.3, 0.25, 8, MAT.steelLt, { grp: 'mechanical', sys: 5, caps: true });
  // daily fuel tank + protected line
  prism(gx - 1.8, 0.85, gz + 1.9, 0.7, 1.1, 10, MAT.yellow, { grp: 'mechanical', sys: 5, caps: true });
  beam([gx - 1.8, 0.9, gz + 1.4], [gx - 0.4, 0.9, gz + 0.8], 0.07, 0.07, MAT.yellow, { grp: 'mechanical', sys: 5 });
  // ATS panel outside the service opening
  box(gx - 6.6, 1.3, gz, 0.35, 1.7, 1.1, MAT.ats, { grp: 'electrical', sys: 5 });
  // power cable route from ATS to main panel on warehouse east wall
  beam([gx - 6.6, 0.5, gz], [70.6, 0.5, gz], 0.12, 0.12, MAT.pvc, { grp: 'electrical', sys: 5 });
  beam([70.6, 0.5, gz], [70.6, 1.6, gz], 0.12, 0.12, MAT.pvc, { grp: 'electrical', sys: 5 });
  box(69.7, 1.7, gz, 0.2, 1.4, 1.0, MAT.mdp, { grp: 'electrical', sys: 5 });
  // grounding system
  prism(gx - 6.2, 0.35, gz + 2.6, 0.06, 0.7, 6, MAT.copper, { grp: 'electrical', sys: 5, caps: true });
  beam([gx - 6.2, 0.7, gz + 2.6], [gx - 6.2, 0.2, gz + 2.6], 0.14, 0.02, MAT.copper, { grp: 'electrical', sys: 5 });
  // sign
  box(gx - 5.95, 2.6, gz + 2.2, 0.06, 0.6, 2.6, MAT.genSign, { grp: 'facilities', sys: 5 });
  addCollider(gx - 6, gz - 3.8, gx + 6, gz + 3.8);
  SELECTABLES.push({ sys: 5, min: [gx - 6.4, 0, gz - 4], max: [gx + 6.4, 3.8, gz + 4] });
}

function buildSystem06() {
  const cx = -56, cz = -33, w = 8, d = 6, h = 2.2;
  // posts
  for (const px of [cx - w / 2, cx + w / 2]) {
    for (const pz of [cz - d / 2, cz + d / 2]) {
      box(px, h / 2, pz, 0.12, h, 0.12, MAT.steelLt, { grp: 'firesafety', sys: 6 });
      box(px, 0.03, pz, 0.4, 0.06, 0.4, MAT.steelDk, { grp: 'firesafety', sys: 6 });
    }
    box(px, h / 2, cz, 0.12, h, 0.12, MAT.steelLt, { grp: 'firesafety', sys: 6 });
  }
  for (const pz of [cz - d / 2, cz + d / 2]) {
    box(cx, h / 2, pz, 0.12, h, 0.12, MAT.steelLt, { grp: 'firesafety', sys: 6 });
  }
  // mesh walls (gate opening on east side, 1.2 m)
  face([[cx - w / 2, 0, cz - d / 2], [cx + w / 2, 0, cz - d / 2], [cx + w / 2, h, cz - d / 2], [cx - w / 2, h, cz - d / 2]], MAT.mesh, { grp: 'firesafety', sys: 6, alpha: 0.7, outward: [0, 0, -1], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  face([[cx - w / 2, 0, cz + d / 2], [cx - w / 2, h, cz + d / 2], [cx + w / 2, h, cz + d / 2], [cx + w / 2, 0, cz + d / 2]], MAT.mesh, { grp: 'firesafety', sys: 6, alpha: 0.7, outward: [0, 0, 1], uv: [[0, 0], [0, 1], [1, 1], [1, 0]] });
  face([[cx - w / 2, 0, cz - d / 2], [cx - w / 2, h, cz - d / 2], [cx - w / 2, h, cz + d / 2], [cx - w / 2, 0, cz + d / 2]], MAT.mesh, { grp: 'firesafety', sys: 6, alpha: 0.7, outward: [-1, 0, 0], uv: [[0, 0], [0, 1], [1, 1], [1, 0]] });
  face([[cx + w / 2, 0, cz - d / 2], [cx + w / 2, h, cz - d / 2], [cx + w / 2, h, cz - 0.6], [cx + w / 2, 0, cz - 0.6]], MAT.mesh, { grp: 'firesafety', sys: 6, alpha: 0.7, outward: [1, 0, 0], uv: [[0, 0], [0, 1], [0.4, 1], [0.4, 0]] });
  face([[cx + w / 2, 0, cz + 0.6], [cx + w / 2, h, cz + 0.6], [cx + w / 2, h, cz + d / 2], [cx + w / 2, 0, cz + d / 2]], MAT.mesh, { grp: 'firesafety', sys: 6, alpha: 0.7, outward: [1, 0, 0], uv: [[0, 0], [0, 1], [1, 1], [1, 0]] });
  // gate panel (open) + lock bar
  face([[cx + w / 2, 0, cz - 0.6], [cx + w / 2 + 1.6, 0, cz - 1.4], [cx + w / 2 + 1.6, h, cz - 1.4], [cx + w / 2, h, cz - 0.6]], MAT.mesh, { grp: 'firesafety', sys: 6, alpha: 0.7, outward: [0.7, 0, 0.7], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  box(cx + w / 2 + 0.7, 1.1, cz - 1.0, 1.5, 0.08, 0.08, MAT.steelDk, { grp: 'firesafety', sys: 6 });
  // Rack A and Rack B
  box(cx - 2.2, 1.0, cz, 0.1, 2.0, 2.4, MAT.steelLt, { grp: 'storage', sys: 6 });
  box(cx - 1.2, 1.0, cz, 0.1, 2.0, 2.4, MAT.steelLt, { grp: 'storage', sys: 6 });
  box(cx - 1.7, 0.9, cz, 1.0, 0.08, 2.5, MAT.wood, { grp: 'storage', sys: 6 });
  box(cx - 1.7, 1.9, cz, 1.0, 0.08, 2.5, MAT.wood, { grp: 'storage', sys: 6 });
  box(cx - 1.7, 1.2, cz - 0.5, 0.8, 0.5, 0.7, MAT.carton, { grp: 'storage', sys: 6 });
  box(cx - 1.7, 1.2, cz + 0.6, 0.8, 0.5, 0.7, MAT.carton2, { grp: 'storage', sys: 6 });
  box(cx + 2.2, 1.0, cz, 0.1, 2.0, 2.4, MAT.steelLt, { grp: 'storage', sys: 6 });
  box(cx + 1.2, 1.0, cz, 0.1, 2.0, 2.4, MAT.steelLt, { grp: 'storage', sys: 6 });
  box(cx + 1.7, 0.9, cz, 1.0, 0.08, 2.5, MAT.wood, { grp: 'storage', sys: 6 });
  box(cx + 1.7, 1.9, cz, 1.0, 0.08, 2.5, MAT.wood, { grp: 'storage', sys: 6 });
  box(cx + 1.7, 1.2, cz - 0.5, 0.8, 0.5, 0.7, MAT.wrap, { grp: 'storage', sys: 6 });
  box(cx + 1.7, 1.2, cz + 0.6, 0.8, 0.5, 0.7, MAT.carton, { grp: 'storage', sys: 6 });
  // zone marking + sign
  flat([[cx - w / 2 - 1, 0.028, cz - d / 2 - 1], [cx + w / 2 + 1, 0.028, cz - d / 2 - 1], [cx + w / 2 + 1, 0.028, cz + d / 2 + 1], [cx - w / 2 - 1, 0.028, cz + d / 2 + 1]], MAT.yellow, { grp: 'firesafety', sys: 6, alpha: 0.08 });
  box(cx, h + 0.25, cz - d / 2 - 0.1, 2.6, 0.5, 0.08, MAT.consum, { grp: 'firesafety', sys: 6 });
  addCollider(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
  SELECTABLES.push({ sys: 6, min: [cx - w / 2 - 0.3, 0, cz - d / 2 - 0.3], max: [cx + w / 2 + 0.3, h + 0.3, cz + d / 2 + 0.3] });
}

function buildSystem07() {
  // platforms themselves are built in buildConveyors (tagged sys 7)
  // add conveyor line selectable bounding volumes
  SELECTABLES.push({ sys: 7, min: [7.5, 0, -39], max: [12.5, 1.4, 39] });
}

function buildSystem08() {
  const px = -76, pz = 0; // platform centre (west exterior)
  // steel bracket frame + grating deck
  for (const [bx, bz] of [[-4, -1.1], [4, -1.1], [-4, 1.1], [4, 1.1]]) {
    box(px + bx, 0.2, pz + bz, 0.2, 0.4, 0.2, MAT.steel, { grp: 'mechanical', sys: 8 });
  }
  beam([px - 4, 0.4, pz - 1.1], [px - 4, 0.4, pz + 1.1], 0.14, 0.14, MAT.steel, { grp: 'mechanical', sys: 8 });
  beam([px + 4, 0.4, pz - 1.1], [px + 4, 0.4, pz + 1.1], 0.14, 0.14, MAT.steel, { grp: 'mechanical', sys: 8 });
  beam([px - 4, 0.4, pz], [px - 74, 0.4, pz], 0.14, 0.14, MAT.steel, { grp: 'mechanical', sys: 8 });
  box(px, 0.48, pz, 8.4, 0.1, 2.6, MAT.grating, { grp: 'mechanical', sys: 8 });
  // handrail on west edge
  for (const hx of [-4, 0, 4]) {
    beam([px + hx, 0.53, pz - 1.2], [px + hx, 1.5, pz - 1.2], 0.05, 0.05, MAT.steelLt, { grp: 'mechanical', sys: 8 });
  }
  beam([px - 4, 1.5, pz - 1.2], [px + 4, 1.5, pz - 1.2], 0.05, 0.05, MAT.steelLt, { grp: 'mechanical', sys: 8 });
  beam([px - 4, 1.05, pz - 1.2], [px + 4, 1.05, pz - 1.2], 0.04, 0.04, MAT.steelLt, { grp: 'mechanical', sys: 8 });
  // three outdoor AC units on spring vibration mounts
  for (const [i, ux] of [[0, -2.4], [1, 0], [2, 2.4]]) {
    const ux0 = px + ux;
    prism(ux0 - 0.5, 0.62, pz - 0.6, 0.09, 0.22, 6, MAT.dark, { grp: 'mechanical', sys: 8, caps: true });
    prism(ux0 + 0.5, 0.62, pz - 0.6, 0.09, 0.22, 6, MAT.dark, { grp: 'mechanical', sys: 8, caps: true });
    prism(ux0 - 0.5, 0.62, pz + 0.6, 0.09, 0.22, 6, MAT.dark, { grp: 'mechanical', sys: 8, caps: true });
    prism(ux0 + 0.5, 0.62, pz + 0.6, 0.09, 0.22, 6, MAT.dark, { grp: 'mechanical', sys: 8, caps: true });
    box(ux0, 1.25, pz, 1.5, 1.1, 0.85, MAT.acUnit, { grp: 'mechanical', sys: 8 });
    box(ux0, 1.85, pz, 1.3, 0.08, 0.7, MAT.acFan, { grp: 'mechanical', sys: 8 }); // fan grille top
    box(ux0, 1.25, pz + 0.44, 1.2, 0.7, 0.04, MAT.dark, { grp: 'mechanical', sys: 8 }); // grille face
  }
  // refrigerant pipework (copper) to wall penetration + drain + cable route
  beam([px - 2.4, 1.0, pz + 0.45], [-70.2, 1.0, pz + 0.45], 0.09, 0.09, MAT.copper, { grp: 'mechanical', sys: 8 });
  beam([px, 0.9, pz + 0.45], [-70.2, 0.9, pz + 0.45], 0.07, 0.07, MAT.copper, { grp: 'mechanical', sys: 8 });
  beam([px + 2.4, 1.1, pz + 0.45], [-70.2, 1.1, pz + 0.45], 0.09, 0.09, MAT.copper, { grp: 'mechanical', sys: 8 });
  beam([px + 3.2, 0.55, pz + 0.45], [-70.2, 0.55, pz + 0.45], 0.06, 0.06, MAT.blue, { grp: 'mechanical', sys: 8 }); // drain
  beam([px - 2.4, 1.35, pz - 0.45], [-70.2, 1.35, pz - 0.45], 0.1, 0.1, MAT.tray, { grp: 'electrical', sys: 8 });    // cable tray
  // supports for pipework
  for (const sx of [-72, -68]) {
    box(sx, 0.75, pz + 0.45, 0.1, 1.5, 0.1, MAT.steelDk, { grp: 'mechanical', sys: 8 });
    box(sx, 0.75, pz - 0.45, 0.1, 1.5, 0.1, MAT.steelDk, { grp: 'mechanical', sys: 8 });
  }
  // access door in warehouse wall + service clearance marking
  box(-70.05, 1.05, 0, 0.1, 2.1, 1.1, MAT.door, { grp: 'architecture' });
  flat([[px - 4.6, 0.03, pz - 1.8], [px + 4.6, 0.03, pz - 1.8], [px + 4.6, 0.03, pz + 1.8], [px - 4.6, 0.03, pz + 1.8]], MAT.hazard, { grp: 'firesafety', sys: 8, alpha: 0.35 });
  box(px, 2.0, pz - 1.5, 3.2, 0.5, 0.08, MAT.acpSign, { grp: 'mechanical', sys: 8 });
  SELECTABLES.push({ sys: 8, min: [px - 4.6, 0, pz - 1.6], max: [px + 4.6, 2.2, pz + 1.6] });
}

function buildVehicles() {
  const truck = (x, z, cabMat) => {
    box(x, 1.5, z + 5.2, 2.4, 2.2, 2.2, cabMat, { grp: 'vehicles' });                 // cab
    box(x, 1.35, z + 5.2, 2.3, 0.7, 0.1, MAT.glass, { grp: 'vehicles' });               // windshield
    box(x, 1.7, z - 1.2, 2.5, 2.6, 8.6, MAT.truckBox, { grp: 'vehicles' });             // trailer
    box(x, 0.5, z + 5.2, 2.2, 1.0, 2.0, MAT.dark, { grp: 'vehicles' });                 // chassis
    for (const dz of [4.6, 3.8, -3.6, -4.6]) {
      prism(x - 1.05, 0.5, z + dz, 0.45, 0.3, 8, MAT.tire, { grp: 'vehicles', caps: true });
      prism(x + 1.05, 0.5, z + dz, 0.45, 0.3, 8, MAT.tire, { grp: 'vehicles', caps: true });
    }
    addCollider(x - 1.4, z - 5.8, x + 1.4, z + 6.5);
  };
  truck(-38, 52, MAT.truckCab); truck(2, 53, MAT.truckBox2); truck(42, 51, MAT.truckCab);
  // forklift (interior)
  const fx = 18, fz = -14;
  box(fx, 0.7, fz, 1.6, 1.0, 2.2, MAT.yellow, { grp: 'vehicles' });
  box(fx, 1.5, fz + 0.6, 1.5, 0.9, 0.1, MAT.glass, { grp: 'vehicles' });
  box(fx, 1.6, fz - 1.0, 0.12, 2.4, 0.12, MAT.steelDk, { grp: 'vehicles' });
  box(fx, 1.6, fz + 0.9, 0.12, 2.4, 0.12, MAT.steelDk, { grp: 'vehicles' });
  box(fx, 2.75, fz - 0.95, 0.1, 0.1, 2.0, MAT.steelDk, { grp: 'vehicles' });
  box(fx, 0.25, fz - 1.6, 1.2, 0.08, 0.9, MAT.steelDk, { grp: 'vehicles' });
  prism(fx - 0.7, 0.35, fz + 0.8, 0.3, 0.25, 8, MAT.tire, { grp: 'vehicles', caps: true });
  prism(fx + 0.7, 0.35, fz + 0.8, 0.3, 0.25, 8, MAT.tire, { grp: 'vehicles', caps: true });
  addCollider(fx - 1.0, fz - 1.4, fx + 1.0, fz + 1.4);
  // parked cars
  const car = (x, z, mat) => {
    box(x, 0.65, z, 1.8, 0.9, 4.2, mat, { grp: 'vehicles' });
    box(x, 1.35, z - 0.2, 1.6, 0.6, 2.2, MAT.glass, { grp: 'vehicles' });
    for (const [wx, wz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
      prism(x + wx, 0.35, z + wz, 0.32, 0.25, 8, MAT.tire, { grp: 'vehicles', caps: true });
    }
    addCollider(x - 1.0, z - 2.2, x + 1.0, z + 2.2);
  };
  car(-60, -59, MAT.car1); car(-56.8, -59, MAT.car2); car(-53.6, -59, MAT.car3); car(-50.4, -59, MAT.car1);
  car(-60, -53.5, MAT.car2); car(-56.8, -53.5, MAT.car3);
  // motorcycles
  for (const mx of [46, 49]) {
    box(mx, 0.5, -61, 0.4, 0.5, 1.6, MAT.car2, { grp: 'vehicles' });
    prism(mx, 0.85, -60.2, 0.28, 0.2, 8, MAT.dark, { grp: 'vehicles', caps: true });
  }
}

/* ============================ 7. scene assembly ============================ */

function buildScene(onProgress) {
  const phases = [
    ['Textures & materials', () => { buildTextures(); }],
    ['Site, roads & landscape', () => { buildSite(); }],
    ['Warehouse shell & structure', () => { buildWarehouse(); }],
    ['Office block & interiors', () => { buildOfficeBlock(); buildStorage(); buildConveyors(); }],
    ['Installation systems 01–04', () => { buildSystem01(); buildSystem02(); buildSystem03(); buildSystem04(); }],
    ['Installation systems 05–08', () => { buildSystem05(); buildSystem06(); buildSystem07(); buildSystem08(); }],
    ['Vehicles & final touches', () => { buildVehicles(); }],
  ];
  return (async () => {
    for (let i = 0; i < phases.length; i++) {
      phases[i][1]();
      if (onProgress) onProgress((i + 1) / phases.length, phases[i][0]);
      await new Promise(r => setTimeout(r, 0));
    }
    // system marker descriptors
    for (const sys of SYSTEMS) {
      MARKERS.push({ sys, anchor: sys.anchor.slice(), label: pad2(sys.number) });
    }
    return true;
  })();
}

/* ============================ 8. lighting ============================ */

const LIGHTING = {
  day: {
    amb: 0.74, dif: 0.52, dir: norm3([-0.42, 0.82, 0.36]), emis: 0,
    skyTop: '#8fb4cc', skyBot: '#dfe7ec', fog: [198, 210, 218], fogNear: 260, fogFar: 620,
  },
  interior: {
    amb: 0.62, dif: 0.42, dir: norm3([-0.25, 0.9, 0.2]), emis: 0.25,
    skyTop: '#6d7a84', skyBot: '#b9c2c9', fog: [150, 158, 164], fogNear: 200, fogFar: 520,
  },
  night: {
    amb: 0.17, dif: 0.22, dir: norm3([-0.2, 0.9, -0.35]), emis: 1.0,
    skyTop: '#0a101c', skyBot: '#1b2531', fog: [16, 22, 32], fogNear: 180, fogFar: 480,
  },
};

/* ============================ 9. renderer ============================ */

let skyGrad = null, skyKey = '';

function faceVisible(fc) {
  if (!S.grpVis[fc.grp]) return false;
  if (fc.sys && !S.sysVis[fc.sys]) return false;
  if (fc.decor && !S.decorVisible) return false;
  if (fc.tag === 'cable01' && !S.overlay01) return false;
  if (S.isolated && fc.sys !== S.selected && fc.tag !== 'ctx') return false;
  return true;
}

function cssRGB(c, k = 1) {
  return `rgb(${clamp(Math.round(c[0] * k), 0, 255)},${clamp(Math.round(c[1] * k), 0, 255)},${clamp(Math.round(c[2] * k), 0, 255)})`;
}

function renderFrame(g, now) {
  // animators (HVLS fan blades etc.)
  for (const an of ANIMATORS) an.update(now);

  const L = LIGHTING[S.lighting];
  // sky
  const skyKeyNow = S.lighting + '|' + H;
  if (skyKeyNow !== skyKey || !skyGrad) {
    skyKey = skyKeyNow;
    skyGrad = g.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, L.skyTop);
    skyGrad.addColorStop(1, L.skyBot);
  }
  g.globalAlpha = 1;
  g.fillStyle = skyGrad;
  g.fillRect(0, 0, W, H);

  updateBasis();
  const tanV = Math.tan(cam.fov / 2);
  const aspect = W / H;
  const tmp = [0, 0];
  const visible = [];
  S.pickSys = 0;
  const doPick = S.pointer.inside && (S.mode === 'orbit' || S.plan);

  for (let i = 0; i < FACES.length; i++) {
    const fc = FACES[i];
    if (!faceVisible(fc)) continue;
    // view-space transform + frustum cull
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, maxD = -1e9, minD = 1e9;
    let cx = 0, cy = 0, cz = 0;
    const v = fc.v, n = fc.n;
    let behind = 0;
    for (let j = 0; j < v.length; j++) {
      const p = v[j];
      const dx = p[0] - cam.pos[0], dy = p[1] - cam.pos[1], dz = p[2] - cam.pos[2];
      const vx = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2];
      const vy = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
      const vz = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
      if (vz < 0.2) behind++;
      cx += p[0]; cy += p[1]; cz += p[2];
      let sx, sy;
      if (S.plan) {
        sx = W / 2 + vx * cam.planScale; sy = H / 2 - vy * cam.planScale;
      } else {
        const zc = Math.max(vz, 0.35);
        sx = W / 2 + (vx / zc) * focal; sy = H / 2 - (vy / zc) * focal;
      }
      fc.sp[j][0] = sx; fc.sp[j][1] = sy;
      if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
      if (vz > maxD) maxD = vz; if (vz < minD) minD = vz;
    }
    if (behind === v.length) continue;
    if (maxD > 850) continue;
    // frustum
    if (!S.plan) {
      const m = maxD * tanV + 40;
      if (maxX < W / 2 - m * aspect || minX > W / 2 + m * aspect || maxY < H / 2 - m || minY > H / 2 + m) continue;
    } else {
      const m = 30;
      if (maxX < -m || minX > W + m || maxY < -m || minY > H + m) continue;
    }
    // backface cull (normal toward camera)
    if (!fc.noCull) {
      const fcx = cx / v.length, fcy = cy / v.length, fcz = cz / v.length;
      const tox = cam.pos[0] - fcx, toy = cam.pos[1] - fcy, toz = cam.pos[2] - fcz;
      if (dot3(n, [tox, toy, toz]) <= 0) continue;
    }
    // shading
    let k = L.amb + L.dif * Math.max(0, dot3(n, L.dir));
    k *= fc.varr;
    let r = fc.c[0], gg = fc.c[1], b = fc.c[2];
    if (fc.emis && L.emis > 0) {
      const boost = 1 + L.emis * 1.1;
      r = Math.min(255, r * boost); gg = Math.min(255, gg * boost); b = Math.min(255, b * boost);
    } else {
      r *= k; gg *= k; b *= k;
    }
    // fog
    const depth = (minD + maxD) / 2;
    const ft = clamp((depth - L.fogNear) / (L.fogFar - L.fogNear), 0, 1) * 0.85;
    if (ft > 0) {
      r = lerp(r, L.fog[0], ft); gg = lerp(gg, L.fog[1], ft); b = lerp(b, L.fog[2], ft);
    }
    // selection highlight
    const selected = S.selected > 0 && fc.sys === S.selected;
    if (selected) { r = Math.min(255, r * 1.12 + 14); gg = Math.min(255, gg * 1.05 + 8); b *= 0.96; }
    fc.depth = depth;
    fc.fill = cssRGB([r, gg, b]);
    fc.sel = selected;
    visible.push(fc);
  }

  visible.sort((a, b) => b.depth - a.depth);

  g.lineWidth = 1;
  for (let i = 0; i < visible.length; i++) {
    const fc = visible[i];
    const pts = fc.sp;
    const n = pts.length;
    // tiny-face skip at low quality
    if (S.lowQuality) {
      let aMin = 1e9, aMax = -1e9, bMin = 1e9, bMax = -1e9;
      for (let j = 0; j < n; j++) {
        if (pts[j][0] < aMin) aMin = pts[j][0]; if (pts[j][0] > aMax) aMax = pts[j][0];
        if (pts[j][1] < bMin) bMin = pts[j][1]; if (pts[j][1] > bMax) bMax = pts[j][1];
      }
      if ((aMax - aMin) * (bMax - bMin) < 30) continue;
    }
    g.globalAlpha = fc.alpha;
    if (fc.tex) {
      const tex = fc.tex;
      if (n >= 3) {
        g.save();
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < n; j++) g.lineTo(pts[j][0], pts[j][1]);
        g.closePath();
        g.clip();
        // affine texture map per triangle fan
        const uv = fc.uv;
        if (uv && tex.canvas) {
          for (let t = 1; t < n - 1; t++) {
            drawTexTri(g, pts[0], pts[t], pts[t + 1], uv[0], uv[t], uv[t + 1], tex);
          }
        } else {
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.fillStyle = fc.fill;
          g.fill();
        }
        g.restore();
        g.setTransform(1, 0, 0, 1, 0, 0);
      }
    } else {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < n; j++) g.lineTo(pts[j][0], pts[j][1]);
      g.closePath();
      g.fillStyle = fc.fill;
      g.fill();
    }
    // edges
    g.globalAlpha = fc.sel ? 1 : Math.min(1, fc.alpha + 0.25);
    g.strokeStyle = fc.sel ? 'rgba(232,163,61,0.95)' : 'rgba(12,14,16,0.20)';
    g.lineWidth = fc.sel ? 1.6 : 1;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let j = 1; j < n; j++) g.lineTo(pts[j][0], pts[j][1]);
    g.closePath();
    g.stroke();
    g.globalAlpha = 1;
    // picking (topmost first)
    if (doPick && !S.pickSys && fc.sys && S.pointer.inside) {
      if (pointInPoly(S.pointer.x, S.pointer.y, pts)) S.pickSys = fc.sys;
    }
  }
  g.globalAlpha = 1;
  S.facesDrawn = visible.length;

  // plan-mode dimensions
  if (S.plan) drawPlanAnnotations(g);
  // measure overlay
  if (S.measurePts.length) drawMeasure(g);
}

function drawTexTri(g, p0, p1, p2, uv0, uv1, uv2, tex) {
  const Ax = uv0[0] * tex.w, Ay = uv0[1] * tex.h;
  const Bx = uv1[0] * tex.w, By = uv1[1] * tex.h;
  const Cx = uv2[0] * tex.w, Cy = uv2[1] * tex.h;
  const e1x = Bx - Ax, e1y = By - Ay, e2x = Cx - Ax, e2y = Cy - Ay;
  const det = e1x * e2y - e1y * e2x;
  if (Math.abs(det) < 1e-9) return;
  const s1x = p1[0] - p0[0], s1y = p1[1] - p0[1], s2x = p2[0] - p0[0], s2y = p2[1] - p0[1];
  const a = (s1x * e2y - s2x * e1y) / det;
  const b = (s1y * e2y - s2y * e1y) / det;
  const c = (-s1x * e2x + s2x * e1x) / det;
  const d = (-s1y * e2x + s2y * e1x) / det;
  const e = p0[0] - a * Ax - c * Ay;
  const f = p0[1] - b * Ay - d * Ax;
  g.setTransform(a, b, c, d, e, f);
  g.drawImage(tex.canvas, 0, 0);
}

function drawPlanAnnotations(g) {
  const s = cam.planScale;
  const px = x => W / 2 + x * s, pz = z => H / 2 - z * s;
  g.strokeStyle = 'rgba(232,163,61,0.9)'; g.fillStyle = 'rgba(232,163,61,0.95)';
  g.lineWidth = 1.4; g.font = '12px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  // 140 m dimension (south of building)
  const y1 = pz(-52);
  g.beginPath(); g.moveTo(px(-70), y1); g.lineTo(px(70), y1); g.stroke();
  g.beginPath(); g.moveTo(px(-70), y1 - 6); g.lineTo(px(-70), y1 + 6); g.stroke();
  g.beginPath(); g.moveTo(px(70), y1 - 6); g.lineTo(px(70), y1 + 6); g.stroke();
  g.fillText('140 m', 0, y1 - 12);
  // 88 m dimension (west)
  const x1 = px(-78);
  g.beginPath(); g.moveTo(x1, pz(-44)); g.lineTo(x1, pz(44)); g.stroke();
  g.beginPath(); g.moveTo(x1 - 6, pz(-44)); g.lineTo(x1 + 6, pz(-44)); g.stroke();
  g.beginPath(); g.moveTo(x1 - 6, pz(44)); g.lineTo(x1 + 6, pz(44)); g.stroke();
  g.save(); g.translate(x1 - 14, 0); g.rotate(-Math.PI / 2); g.fillText('88 m', 0, 0); g.restore();
  // north arrow
  g.beginPath(); g.moveTo(W - 40, 60); g.lineTo(W - 46, 84); g.lineTo(W - 40, 78); g.lineTo(W - 34, 84); g.closePath(); g.fill();
  g.fillText('N', W - 40, 48);
  // zone ticks
  g.fillStyle = 'rgba(232,234,236,0.75)';
  for (let i = 0; i < 10; i++) {
    const zx = -70 + (i + 0.5) * 14;
    g.fillText(String.fromCharCode(65 + i), px(zx), pz(47));
  }
}

function drawMeasure(g) {
  const pts = S.measurePts.map(p => project(p[0], p[1], p[2], [0, 0]));
  g.strokeStyle = '#e8a33d'; g.fillStyle = '#e8a33d'; g.lineWidth = 2;
  g.setLineDash([6, 5]);
  g.beginPath();
  pts.forEach((p, i) => { if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); });
  g.stroke();
  g.setLineDash([]);
  for (const p of pts) { g.beginPath(); g.arc(p.x, p.y, 4, 0, 7); g.fill(); }
  if (pts.length === 2) {
    const d = len3(sub3(S.measurePts[1], S.measurePts[0]));
    g.font = 'bold 13px monospace'; g.textAlign = 'center';
    const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
    g.fillStyle = 'rgba(16,18,20,0.85)';
    const label = d.toFixed(2) + ' m';
    const tw = g.measureText(label).width + 14;
    g.fillRect(mx - tw / 2, my - 26, tw, 20);
    g.fillStyle = '#e8a33d';
    g.fillText(label, mx, my - 16);
  }
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/* ============================ 10. camera presets & animation ============================ */

function startAnim(toPos, toTarget, toPlan) {
  S.anim = {
    t: 0, dur: 1.1,
    fromPos: cam.pos.slice(), toPos,
    fromTg: cam.target.slice(), toTarget,
    toPlan,
  };
}

function applyPreset(preset, instant) {
  setRoof(!(preset.roofHidden));
  if (instant) {
    if (preset.mode === 'plan') {
      S.plan = true; S.mode = 'orbit';
      cam.target = preset.target.slice();
      cam.pos = [preset.target[0], 300, preset.target[2]];
    } else {
      S.plan = false;
      cam.pos = preset.pos.slice(); cam.target = preset.target.slice();
      syncOrbitFromPos();
    }
    syncToolButtonsSafe();
    return;
  }
  if (preset.mode === 'plan') {
    startAnim([preset.target[0], 320, preset.target[2]], preset.target.slice(), true);
  } else {
    if (S.plan) { S.plan = false; cam.pos = [preset.target[0], 60, preset.target[2] + 60]; }
    startAnim(preset.pos.slice(), preset.target.slice(), false);
  }
}

function focusSystem(sys) {
  applyPreset({ mode: 'orbit', pos: sys.focusPos, target: sys.focusTarget }, false);
}

/* ============================ 11. UI ============================ */

const $ = s => (typeof document !== 'undefined' ? document.getElementById(s) : null);

function buildUI() {
  if (!HAS_UI) return;
  // system rows
  const list = $('systemList');
  list.innerHTML = '';
  for (const sys of SYSTEMS) {
    const li = document.createElement('li');
    li.className = 'system-row';
    li.dataset.sys = sys.number;
    li.innerHTML = `
      <span class="system-row__num">${pad2(sys.number)}</span>
      <span>
        <span class="system-row__name">${sys.short}</span><br>
        <span class="system-row__cat">${sys.category}</span>
      </span>
      <span class="system-row__tools">
        ${sys.tentative ? '<span class="tentative-badge" title="Tentative location — verify on site">⚠</span>' : ''}
        <button class="eye" title="Toggle visibility" aria-label="Toggle visibility of ${sys.name}">👁</button>
      </span>`;
    li.addEventListener('click', () => selectSystem(sys.number, true));
    li.querySelector('.eye').addEventListener('click', ev => {
      ev.stopPropagation();
      S.sysVis[sys.number] = !S.sysVis[sys.number];
      refreshSystemRows();
    });
    list.appendChild(li);
  }
  // layer rows
  const layers = $('layerList');
  layers.innerHTML = '';
  for (const lg of LAYER_GROUPS) {
    const li = document.createElement('li');
    li.className = 'layer-row';
    li.innerHTML = `<button class="eye" title="Toggle layer" aria-label="Toggle ${lg.name}">👁</button><span>${lg.name}</span>`;
    li.addEventListener('click', () => {
      S.grpVis[lg.id] = !S.grpVis[lg.id];
      refreshLayerRows();
    });
    li.querySelector('.eye').classList.toggle('is-off', false);
    layers.appendChild(li);
  }
  refreshSystemRows(); refreshLayerRows();
  // markers
  const mLayer = $('markerLayer');
  for (const mk of MARKERS) {
    const el = document.createElement('button');
    el.className = 'marker' + (mk.sys.tentative ? ' is-tentative' : '');
    el.textContent = mk.label;
    el.title = `${pad2(mk.sys.number)} — ${mk.sys.name} (${mk.sys.category})`;
    el.addEventListener('click', ev => { ev.stopPropagation(); selectSystem(mk.sys.number, false); });
    el.addEventListener('mouseenter', ev => showTooltip(mk, ev));
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('mousemove', ev => moveTooltip(ev));
    mLayer.appendChild(el);
    mk.el = el;
  }
  // labels
  const lLayer = $('labelLayer');
  for (const lb of LABELS) {
    const el = document.createElement('div');
    el.className = lb.cls || 'zone-label';
    el.textContent = lb.text;
    lLayer.appendChild(el);
    lb.el = el;
  }
  // zone labels A–J
  for (let i = 0; i < 10; i++) {
    const el = document.createElement('div');
    el.className = 'zone-label';
    el.textContent = 'ZONE ' + String.fromCharCode(65 + i);
    $('labelLayer').appendChild(el);
    LABELS.push({ el, text: 'ZONE ' + String.fromCharCode(65 + i), pos: [-63 + i * 14, 0.4, 40.5], size: 12, cls: 'zone-label' });
  }
  const tempEl = document.createElement('div');
  tempEl.className = 'zone-label zone-label--temp';
  tempEl.textContent = 'TEMPORARY WORK AREA D–G';
  $('labelLayer').appendChild(tempEl);
  LABELS.push({ el: tempEl, text: 'TEMP D–G', pos: [0, 0.4, -38], size: 12, cls: 'zone-label zone-label--temp' });
  const northEl = document.createElement('div');
  northEl.className = 'zone-label';
  northEl.textContent = 'NORTH DOCK / APRON';
  $('labelLayer').appendChild(northEl);
  LABELS.push({ el: northEl, text: 'NORTH DOCK', pos: [0, 0.4, 50], size: 12, cls: 'zone-label' });
  const southEl = document.createElement('div');
  southEl.className = 'zone-label';
  southEl.textContent = 'OUTBOUND / SOUTHERN DOCK';
  $('labelLayer').appendChild(southEl);
  LABELS.push({ el: southEl, text: 'OUTBOUND', pos: [0, 0.4, -50], size: 12, cls: 'zone-label' });
}

function refreshSystemRows() {
  if (!HAS_UI) return;
  document.querySelectorAll('.system-row').forEach(row => {
    const n = Number(row.dataset.sys);
    row.classList.toggle('is-selected', n === S.selected);
    row.classList.toggle('is-hidden', !S.sysVis[n]);
    const eye = row.querySelector('.eye');
    eye.classList.toggle('is-off', !S.sysVis[n]);
    eye.textContent = S.sysVis[n] ? '👁' : '–';
  });
  $('btnIsolate').disabled = !S.selected;
}

function refreshLayerRows() {
  if (!HAS_UI) return;
  const rows = $('layerList').children;
  for (let i = 0; i < LAYER_GROUPS.length; i++) {
    const eye = rows[i].querySelector('.eye');
    const on = S.grpVis[LAYER_GROUPS[i].id];
    eye.classList.toggle('is-off', !on);
    eye.textContent = on ? '👁' : '–';
  }
  $('toolRoof').setAttribute('aria-pressed', String(S.grpVis['roof']));
  $('toolRoof').classList.toggle('is-on', S.grpVis['roof']);
}

function selectSystem(number, focus) {
  S.selected = number || 0;
  S.isolated = false;
  refreshSystemRows();
  updateRightPanel();
  if (number && focus) {
    const sys = getSystem(number);
    if (sys) focusSystem(sys);
  }
  if (HAS_UI && typeof history !== 'undefined' && history.replaceState) {
    history.replaceState(null, '', number ? '#sys=' + number : location.pathname + location.search);
  }
}

/* ---------- right panel ---------- */

function updateRightPanel() {
  if (!HAS_UI) return;
  const body = $('rightBody');
  const title = $('rightTitle');
  if (!S.selected) {
    title.textContent = 'Project overview';
    body.innerHTML = `
      <div class="overview-hero">
        <h3>Warehouse Blok O</h3>
        <dl class="fact-grid">
          <div class="fact"><dt>Footprint</dt><dd>140 × 88 m</dd></div>
          <div class="fact"><dt>Area</dt><dd>12,320 m²</dd></div>
          <div class="fact"><dt>Grid</dt><dd>Zones A–J</dd></div>
          <div class="fact"><dt>Temp. area</dt><dd>Zones D–G</dd></div>
          <div class="fact"><dt>North side</dt><dd>Dock / apron</dd></div>
          <div class="fact"><dt>South side</dt><dd>Outbound dock</dd></div>
          <div class="fact"><dt>Revision</dt><dd>REV-00 / 2026</dd></div>
          <div class="fact"><dt>Source</dt><dd>Schematic</dd></div>
        </dl>
      </div>
      <div class="status-block">
        ⚠ <strong>Schematic basis.</strong> The brief's zone schedule (10 zones summing to 9,520 m²)
        does not reconcile with the 12,320 m² footprint. Zone bands are schematic equal widths —
        not survey dimensions. Tentative positions are flagged amber; unknown values are TBC.
      </div>
      <p style="color:var(--ink-2);font-size:12px;margin:6px 0 10px">
        Navigation: <b>Orbit</b> 360°, <b>Plan</b> north-up, <b>POV</b> first-person walk,
        plus interior / exterior presets. Select a numbered marker, a system row, or highlighted
        geometry to inspect specifications, installation sequence and QA/QC checklists.
      </p>
      <div class="section-title">Installation systems</div>
      <div class="action-row">
        ${SYSTEMS.map(s => `<button class="btn btn--mini" data-sysjump="${s.number}">${pad2(s.number)} ${s.short}</button>`).join('')}
      </div>
      <div class="section-title">Lighting</div>
      <div class="action-row">
        <button class="btn btn--mini" data-light="day">Day exterior</button>
        <button class="btn btn--mini" data-light="interior">Day interior</button>
        <button class="btn btn--mini" data-light="night">Night operations</button>
      </div>`;
    body.querySelectorAll('[data-sysjump]').forEach(b =>
      b.addEventListener('click', () => selectSystem(Number(b.dataset.sysjump), true)));
    body.querySelectorAll('[data-light]').forEach(b =>
      b.addEventListener('click', () => setLighting(b.dataset.light)));
    return;
  }
  const sys = getSystem(S.selected);
  if (!sys) return;
  title.textContent = `System ${pad2(sys.number)}`;
  const statusBadge = sys.status === 'confirmed'
    ? '<span class="badge badge--ok">CONFIRMED IN BRIEF</span>'
    : sys.status === 'tentative'
      ? '<span class="badge badge--warn">TENTATIVE — VERIFY ON SITE</span>'
      : '<span class="badge badge--tbc">INFERRED — CONCEPTUAL</span>';
  body.innerHTML = `
    <div class="sys-head">
      <span class="num">${pad2(sys.number)}</span>
      <h3>${sys.name}</h3>
    </div>
    <p class="sys-cat">${sys.category} · ${sys.layer}</p>
    <p class="sys-desc">${sys.description}</p>
    <div>${statusBadge}<span class="badge">${sys.id}</span></div>
    <div class="section-title">Specification</div>
    <table class="spec-grid">
      ${sys.specs.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}
    </table>
    <div class="section-title">Location</div>
    <p style="font-size:12px;color:var(--ink-2);margin:0 0 4px">${sys.location}</p>
    ${sys.tentative ? '<div class="status-block">⚠ Tentative location — verify on site before installation.</div>' : ''}
    <div class="action-row">
      <button class="btn btn--mini" id="btnFocusAsset">Focus asset</button>
      <button class="btn btn--mini" id="btnIsolateLayer">${S.isolated ? 'Release isolation' : 'Isolate layer'}</button>
      <button class="btn btn--mini" id="btnSequence">Show installation sequence</button>
      ${sys.number === 1 ? '<button class="btn btn--mini" id="btnCableOverlay">NYM cable overlay</button>' : ''}
    </div>
    <div class="section-title" id="seqHead" hidden>Installation sequence</div>
    <ol class="stepper" id="seqSteps" hidden>
      ${sys.steps.map((s, i) => `<li>${s}</li>`).join('')}
    </ol>
    <div class="section-title">QA / QC checklist</div>
    <ul class="qa-list">${sys.qa.map(q => `<li>${q}</li>`).join('')}</ul>
    <div class="section-title">Source status</div>
    <p style="font-size:11.5px;color:var(--ink-3);margin:0">${sys.statusLabel}. Derived from Blok O schematic layout, REV-00 / 2026. Structural member sizing, ratings, foundations and fire classifications are intentionally not stated.</p>
  `;
  $('btnFocusAsset').addEventListener('click', () => focusSystem(sys));
  $('btnIsolateLayer').addEventListener('click', () => {
    S.isolated = !S.isolated;
    updateRightPanel();
  });
  $('btnSequence').addEventListener('click', () => {
    const head = $('seqHead'), steps = $('seqSteps');
    const open = steps.hidden;
    head.hidden = !open; steps.hidden = !open;
    if (open) animateSequence(steps);
  });
  if (sys.number === 1) {
    const cb = $('btnCableOverlay');
    cb.classList.toggle('is-on', S.overlay01);
    cb.addEventListener('click', () => {
      S.overlay01 = !S.overlay01;
      cb.classList.toggle('is-on', S.overlay01);
      cb.textContent = S.overlay01 ? 'NYM cable overlay: ON' : 'NYM cable overlay';
    });
  }
}

let seqTimer = null;
function animateSequence(stepsEl) {
  if (seqTimer) { clearInterval(seqTimer); seqTimer = null; }
  const items = stepsEl.querySelectorAll('li');
  let i = 0;
  const tick = () => {
    items.forEach((li, idx) => {
      li.classList.toggle('is-done', idx < i);
      li.classList.toggle('is-active', idx === i);
    });
    i++;
    if (i > items.length) { clearInterval(seqTimer); seqTimer = null; items.forEach(li => li.classList.remove('is-active')); }
  };
  tick();
  seqTimer = setInterval(tick, 950);
}

/* ---------- tooltip ---------- */

function showTooltip(mk, ev) {
  const tt = $('tooltip');
  const sys = mk.sys;
  tt.innerHTML = `<b>${pad2(sys.number)} — ${sys.name}</b><span>${sys.category} · ${sys.statusLabel}</span>`;
  tt.hidden = false;
  moveTooltip(ev);
}
function moveTooltip(ev) {
  const tt = $('tooltip');
  const vp = $('viewport').getBoundingClientRect();
  tt.style.left = (ev.clientX - vp.left) + 'px';
  tt.style.top = (ev.clientY - vp.top) + 'px';
}
function hideTooltip() { $('tooltip').hidden = true; }

/* ---------- compass / scale bar ---------- */

function updateCompass() {
  let heading;
  if (S.plan) heading = 0;
  else if (S.mode === 'pov') heading = S.pov.yaw * 180 / Math.PI;
  else heading = Math.atan2(cam.f[0], cam.f[2]) * 180 / Math.PI;
  $('compassDial').style.transform = `rotate(${-heading}deg)`;
}

function updateScaleBar() {
  const bar = $('scaleBar');
  if (!S.plan) { bar.hidden = true; return; }
  const s = cam.planScale; // px per metre
  const candidates = [100, 50, 20, 10, 5, 2, 1];
  let len = 10;
  for (const c of candidates) { if (c * s >= 70 && c * s <= 240) { len = c; break; } len = c; }
  $('scaleRule').style.width = (len * s) + 'px';
  $('scaleText').textContent = len + ' m';
  bar.hidden = false;
}

/* ============================ 12. interaction ============================ */

function initInteraction() {
  if (!HAS_UI) return;
  const vp = $('viewport');
  let dragging = false, dragBtn = 0, lastX = 0, lastY = 0, downX = 0, downY = 0, moved = 0;
  const pointers = new Map();
  let pinchDist = 0;

  vp.addEventListener('pointerdown', ev => {
    if (ev.target !== canvas) return;
    canvas.focus();
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    dragging = true; dragBtn = ev.button; lastX = ev.clientX; lastY = ev.clientY;
    downX = ev.clientX; downY = ev.clientY; moved = 0;
    if (S.mode === 'pov' && document.pointerLockElement !== canvas && !S.plan) {
      canvas.requestPointerLock && canvas.requestPointerLock();
    }
    S.anim = null;
  });

  vp.addEventListener('pointermove', ev => {
    const rect = canvas.getBoundingClientRect();
    S.pointer.x = ev.clientX - rect.left; S.pointer.y = ev.clientY - rect.top;
    S.pointer.inside = true;
    if (!dragging) return;
    const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const nd = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) camGoal.dist = clamp(camGoal.dist * (pinchDist / nd), 6, 500);
      pinchDist = nd;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      return;
    }
    if (S.mode === 'pov') {
      if (document.pointerLockElement === canvas) {
        S.pov.yaw -= ev.movementX * 0.0026;
        S.pov.pitch = clamp(S.pov.pitch - ev.movementY * 0.0026, -1.45, 1.45);
      }
      return;
    }
    if (S.plan) {
      const s = cam.planScale;
      camGoal.tx -= dx / s; camGoal.tz += dy / s;
      camGoal.tx = clamp(camGoal.tx, -90, 90); camGoal.tz = clamp(camGoal.tz, -70, 70);
    } else if (dragBtn === 0 && ev.shiftKey) {
      panBy(dx, dy);
    } else if (dragBtn === 1 || (dragBtn === 0 && ev.shiftKey)) {
      panBy(dx, dy);
    } else if (dragBtn === 0) {
      camGoal.yaw -= dx * 0.0052;
      camGoal.pitch = clamp(camGoal.pitch + dy * 0.0052, 0.04, 1.52);
    }
    lastX = ev.clientX; lastY = ev.clientY;
  });

  const endDrag = ev => {
    const wasClick = moved < 6 && pointers.size <= 1;
    pointers.delete(ev.pointerId);
    dragging = false;
    if (wasClick && ev.target === canvas) handleClick(ev);
  };
  vp.addEventListener('pointerup', endDrag);
  vp.addEventListener('pointercancel', () => { pointers.clear(); dragging = false; });
  vp.addEventListener('pointerleave', () => { S.pointer.inside = false; });
  vp.addEventListener('wheel', ev => {
    ev.preventDefault();
    if (S.plan) {
      cam.planScale = clamp(cam.planScale * Math.exp(-ev.deltaY * 0.0012), 1.2, 14);
    } else {
      camGoal.dist = clamp(camGoal.dist * Math.exp(ev.deltaY * 0.0011), 6, 500);
    }
  }, { passive: false });
  vp.addEventListener('contextmenu', ev => ev.preventDefault());

  // keyboard
  if (typeof window !== 'undefined') {
  window.addEventListener('keydown', ev => {
    if (ev.target && ev.target.tagName === 'INPUT') return;
    const k = ev.key.toLowerCase();
    if (S.mode === 'pov') {
      S.pov.keys[k] = true;
      if (k === 'escape') exitPov();
      return;
    }
    if (k === 'escape') {
      if (S.presenting) exitPresentation();
      else if (S.measureMode) setMeasure(false);
      else if (S.selected) selectSystem(0, false);
      return;
    }
    if (k >= '1' && k <= '8') { selectSystem(Number(k), true); return; }
    if (k === 'arrowleft' && S.presenting) { presentStep(S.presentIdx - 1); ev.preventDefault(); }
    if (k === 'arrowright' && S.presenting) { presentStep(S.presentIdx + 1); ev.preventDefault(); }
  });
  window.addEventListener('keyup', ev => { S.pov.keys[ev.key.toLowerCase()] = false; });
  }
}

function panBy(dx, dy) {
  const dwp = (2 * camGoal.dist * Math.tan(cam.fov / 2)) / H;
  const rx = -dx * dwp, uy = dy * dwp;
  camGoal.tx += cam.r[0] * rx + cam.u[0] * uy;
  camGoal.ty += cam.r[1] * rx + cam.u[1] * uy;
  camGoal.tz += cam.r[2] * rx + cam.u[2] * uy;
  camGoal.ty = clamp(camGoal.ty, 0.5, 120);
}

function handleClick(ev) {
  const rect = canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  if (S.measureMode) {
    const { o, d } = screenRay(mx, my);
    const p = rayGround(o, d);
    if (p) {
      S.measurePts.push([p[0], 0.05, p[2]]);
      if (S.measurePts.length > 2) S.measurePts.shift();
    }
    return;
  }
  if (S.pickSys) { selectSystem(S.pickSys, false); return; }
  // AABB fallback
  const { o, d } = screenRay(mx, my);
  let best = -1, bestSys = 0;
  for (const sb of SELECTABLES) {
    if (!S.sysVis[sb.sys]) continue;
    const t = rayAABB(o, d, sb.min, sb.max);
    if (t >= 0 && (best < 0 || t < best)) { best = t; bestSys = sb.sys; }
  }
  if (bestSys) selectSystem(bestSys, false);
  else selectSystem(0, false);
}

/* ============================ 13. modes ============================ */

function setMode(mode) {
  if (mode === 'pov') {
    if (S.mode === 'pov') return;
    S.pov.pos = [cam.pos[0], 1.7, cam.pos[2]];
    const f = norm3(sub3(cam.target, cam.pos));
    S.pov.yaw = Math.atan2(f[0], f[2]);
    S.pov.pitch = clamp(Math.asin(clamp(f[1], -1, 1)), -1.4, 1.4);
    S.mode = 'pov';
    $('povHud').hidden = false;
    canvas.classList.add('pov-locked');
  } else {
    if (S.mode === 'pov') {
      // return to orbit near the POV position
      const f = [Math.sin(S.pov.yaw), 0, Math.cos(S.pov.yaw)];
      cam.target = [S.pov.pos[0] + f[0] * 9, 2.2, S.pov.pos[2] + f[2] * 9];
      cam.pos = [S.pov.pos[0] - f[0] * 9 + 0, 4.4, S.pov.pos[2] - f[2] * 9];
      syncOrbitFromPos();
      $('povHud').hidden = true;
      canvas.classList.remove('pov-locked');
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
    if (S.plan) {
      // leaving plan: rebuild spherical goal from the current look direction
      syncOrbitFromPos();
      camGoal.dist = clamp(camGoal.dist, 40, 400);
      camGoal.pitch = clamp(camGoal.pitch, 0.18, 1.2);
    }
    S.mode = mode;
  }
  if (mode === 'plan') { S.plan = true; }
  else if (S.mode === 'orbit') { S.plan = false; }
  if (mode !== 'pov') $('povHud').hidden = true;
  if (mode !== 'pov' && document.pointerLockElement === canvas) document.exitPointerLock();
  syncToolButtons();
}

function setMeasure(on) {
  S.measureMode = on;
  S.measurePts = [];
  $('toolMeasure').setAttribute('aria-pressed', String(on));
  $('toolMeasure').classList.toggle('is-on', on);
}

function setRoof(on) {
  S.grpVis['roof'] = on;
  refreshLayerRows();
}

function setLighting(name) {
  S.lighting = name;
  document.querySelectorAll('.tool--light').forEach(b => {
    const on = b.dataset.light === name;
    b.classList.toggle('is-on', on);
  });
}

function syncToolButtons() {
  document.querySelectorAll('.tool[data-mode]').forEach(b => {
    b.classList.toggle('is-on',
      (b.dataset.mode === 'plan' && S.plan) ||
      (b.dataset.mode === 'orbit' && S.mode === 'orbit' && !S.plan) ||
      (b.dataset.mode === 'pov' && S.mode === 'pov'));
  });
}

/* ---------- POV ---------- */

function updatePOV(dt) {
  const k = S.pov.keys;
  const speed = (k['shift'] ? 4.2 : 1.5);
  const f = [Math.sin(S.pov.yaw), 0, Math.cos(S.pov.yaw)];
  const r = [Math.cos(S.pov.yaw), 0, -Math.sin(S.pov.yaw)];
  let mx = 0, mz = 0;
  if (k['w'] || k['arrowup']) { mx += f[0]; mz += f[2]; }
  if (k['s'] || k['arrowdown']) { mx -= f[0]; mz -= f[2]; }
  if (k['a'] || k['arrowleft']) { mx -= r[0]; mz -= r[2]; }
  if (k['d'] || k['arrowright']) { mx += r[0]; mz += r[2]; }
  const ml = Math.hypot(mx, mz);
  if (ml > 0) {
    const step = speed * dt;
    mx = (mx / ml) * step; mz = (mz / ml) * step;
    tryMove(mx, mz);
  }
  S.pov.pos[0] = clamp(S.pov.pos[0], -110, 130);
  S.pov.pos[2] = clamp(S.pov.pos[2], -85, 85);
}

function tryMove(dx, dz) {
  const r = 0.4;
  const nx = S.pov.pos[0] + dx;
  if (!hitsCollider(nx, S.pov.pos[2], r)) S.pov.pos[0] = nx;
  const nz = S.pov.pos[2] + dz;
  if (!hitsCollider(S.pov.pos[0], nz, r)) S.pov.pos[2] = nz;
}

function hitsCollider(x, z, r) {
  for (const c of COLLIDERS) {
    const cx = clamp(x, c.x0, c.x1), cz = clamp(z, c.z0, c.z1);
    if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return true;
  }
  return false;
}

function exitPov() { setMode('orbit'); }

/* ---------- presentation ---------- */

function startPresentation() {
  S.presenting = true;
  S.presentIdx = 0;
  document.body.classList.add('presenting');
  $('presentHud').hidden = false;
  buildChapters();
  showStop(0, false);
}

function exitPresentation() {
  S.presenting = false;
  document.body.classList.remove('presenting');
  $('presentHud').hidden = true;
}

function buildChapters() {
  const wrap = $('presentChapters');
  wrap.innerHTML = '';
  PRESENTATION.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'chapter-btn';
    b.textContent = i + 1;
    b.title = p.title;
    b.addEventListener('click', () => showStop(i, false));
    wrap.appendChild(b);
  });
}

function showStop(i, animate = true) {
  S.presentIdx = (i + PRESENTATION.length) % PRESENTATION.length;
  const stop = PRESENTATION[S.presentIdx];
  $('presentStep').textContent = `${S.presentIdx + 1} / ${PRESENTATION.length}`;
  $('presentTitle').textContent = stop.title;
  $('presentText').textContent = stop.text;
  document.querySelectorAll('.chapter-btn').forEach((b, idx) =>
    b.classList.toggle('is-active', idx === S.presentIdx));
  const preset = getPreset(stop.preset);
  if (preset) applyPreset(preset, !animate);
}

/* ---------- screenshots ---------- */

function captureShot() {
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `warehouse-bloko-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

async function captureAllShots() {
  const btn = $('btnShots');
  btn.disabled = true;
  let ok = 0, fail = 0;
  for (let i = 0; i < CAMERA_PRESETS.length; i++) {
    const p = CAMERA_PRESETS[i];
    btn.textContent = `Shot ${i + 1}/${CAMERA_PRESETS.length}`;
    applyPreset(p, true);
    await nextFrames(2);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if (!blob) { fail++; continue; }
    const dataUrl = await new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => res(null);
      fr.readAsDataURL(blob);
    });
    if (!dataUrl) { fail++; continue; }
    try {
      const resp = await fetch('/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: p.id + '.png', data: dataUrl }),
      });
      if (resp.ok) ok++; else fail++;
    } catch (e) { fail++; }
  }
  btn.disabled = false;
  btn.textContent = '17 shots';
  const dbg = $('debugStrip');
  if (!dbg.hidden) dbg.textContent = debugText() + `\nshots: ${ok} ok, ${fail} failed`;
  if (fail > 0 && ok === 0) {
    alert('Could not reach the local capture endpoint. Start the server first: python serve.py, then open http://localhost:8000');
  }
}

function nextFrames(n) {
  return new Promise(res => {
    let count = 0;
    const step = () => { if (++count >= n) res(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

/* ============================ 14. overlays ============================ */

const OCCLUDERS = [
  { min: [WH.x0 - 1, 0, WH.z0 - 1], max: [WH.x1 + 1, WH.ridge + 1, WH.z1 + 1], roofAware: true },
  { min: [OFFICE.x0 - 0.3, 0, OFFICE.z0 - 0.3], max: [OFFICE.x1 + 0.3, OFFICE.h + 0.3, OFFICE.z1 + 0.3], roofAware: false },
];

function markerOccluded(pos) {
  if (S.plan) return false;
  for (const oc of OCCLUDERS) {
    const effMax = oc.roofAware && !S.grpVis['roof'] ? [oc.max[0], 1.4, oc.max[2]] : oc.max;
    if (pointInAABB(pos, oc.min, effMax)) {
      const inside = pointInAABB(cam.pos, oc.min, effMax);
      if (!inside) return true;
    }
  }
  return false;
}

function updateOverlays() {
  // markers
  for (const mk of MARKERS) {
    const el = mk.el;
    if (!S.sysVis[mk.sys.number] || (S.isolated && S.selected !== mk.sys.number)) {
      el.classList.add('is-hidden');
      continue;
    }
    const p = project(mk.anchor[0], mk.anchor[1], mk.anchor[2], [0, 0]);
    if (p.d < 0.3 || markerOccluded(mk.anchor)) { el.classList.add('is-hidden'); continue; }
    el.classList.remove('is-hidden');
    const dist = len3(sub3(cam.pos, mk.anchor));
    if (dist > 260 && !S.plan) el.classList.add('is-dim'); else el.classList.remove('is-dim');
    el.style.left = p.x.toFixed(1) + 'px';
    el.style.top = p.y.toFixed(1) + 'px';
    el.classList.toggle('is-selected', S.selected === mk.sys.number);
  }
  // labels
  for (const lb of LABELS) {
    const p = project(lb.pos[0], lb.pos[1], lb.pos[2], [0, 0]);
    if (p.d < 0.3 || markerOccluded(lb.pos)) { lb.el.style.display = 'none'; continue; }
    const dist = len3(sub3(cam.pos, lb.pos));
    if (dist > 300 && !S.plan) { lb.el.style.display = 'none'; continue; }
    lb.el.style.display = 'block';
    lb.el.style.left = p.x.toFixed(1) + 'px';
    lb.el.style.top = p.y.toFixed(1) + 'px';
    lb.el.style.opacity = dist > 220 && !S.plan ? '0.35' : '1';
  }
  updateCompass();
  updateScaleBar();
}

/* return-to-overview floating button */
let overviewBtn = null;
function ensureOverviewButton() {
  if (overviewBtn) return;
  overviewBtn = document.createElement('button');
  overviewBtn.className = 'btn btn--amber';
  overviewBtn.id = 'btnOverview';
  overviewBtn.textContent = '← Return to overview';
  overviewBtn.style.cssText = 'position:absolute;left:14px;top:14px;z-index:15;display:none;';
  overviewBtn.addEventListener('click', () => selectSystem(0, false));
  $('viewport').appendChild(overviewBtn);
}

/* ============================ 15. debug ============================ */

function debugText() {
  return `fps ${S.fps} · faces ${S.facesDrawn}/${FACES.length} · ${S.frameMs.toFixed(1)} ms\n` +
    `mode ${S.plan ? 'plan' : S.mode} · light ${S.lighting} · sel ${S.selected || '—'}\n` +
    `cam ${cam.pos.map(v => v.toFixed(0)).join(', ')} → ${cam.target.map(v => v.toFixed(0)).join(', ')}`;
}

/* ============================ 16. main loop ============================ */

let lastT = 0, fpsAcc = 0, fpsN = 0, fpsTimer = 0, slowFrames = 0;

function frame(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  const t0 = performance.now();

  // camera animation
  if (S.anim) {
    S.anim.t += dt;
    const k = easeInOut(clamp(S.anim.t / S.anim.dur, 0, 1));
    cam.pos = [
      lerp(S.anim.fromPos[0], S.anim.toPos[0], k),
      lerp(S.anim.fromPos[1], S.anim.toPos[1], k),
      lerp(S.anim.fromPos[2], S.anim.toPos[2], k),
    ];
    cam.target = [
      lerp(S.anim.fromTg[0], S.anim.toTarget[0], k),
      lerp(S.anim.fromTg[1], S.anim.toTarget[1], k),
      lerp(S.anim.fromTg[2], S.anim.toTarget[2], k),
    ];
    if (S.anim.t >= S.anim.dur) {
      S.plan = S.anim.toPlan;
      if (!S.plan) syncOrbitFromPos();
      S.anim = null;
      syncToolButtons();
    }
  }
  if (S.mode === 'pov') updatePOV(dt);
  else {
    // damping toward goal
    const k2 = 1 - Math.exp(-dt * 14);
    cam.pos = [
      lerp(cam.pos[0], camGoalTx(), k2),
      lerp(cam.pos[1], camGoalTy(), k2),
      lerp(cam.pos[2], camGoalTz(), k2),
    ];
    cam.target = [camGoal.tx, camGoal.ty, camGoal.tz];
  }

  // animators run inside renderFrame
  renderFrame(ctx, t / 1000);
  updateOverlays();
  if (overviewBtn) overviewBtn.style.display = S.selected ? 'block' : 'none';

  const t1 = performance.now();
  S.frameMs = t1 - t0;
  fpsAcc += 1 / Math.max(dt, 1e-4); fpsN++; fpsTimer += dt;
  if (fpsTimer > 0.5) {
    S.fps = Math.round(fpsN / fpsTimer);
    fpsAcc = 0; fpsN = 0; fpsTimer = 0;
    const dbg = $('debugStrip');
    if (dbg && !dbg.hidden) dbg.textContent = debugText();
  }
  // adaptive quality
  if (S.frameMs > 26) { slowFrames++; if (slowFrames > 90) { S.lowQuality = true; slowFrames = 0; } }
  else slowFrames = Math.max(0, slowFrames - 2);

  requestAnimationFrame(frame);
}

/* orbit goal projected position (mirrors orbitFromState without touching cam) */
function camGoalTx() { return camGoal.tx + Math.sin(camGoal.yaw) * Math.cos(camGoal.pitch) * camGoal.dist; }
function camGoalTy() { return camGoal.ty + Math.sin(camGoal.pitch) * camGoal.dist; }
function camGoalTz() { return camGoal.tz + Math.cos(camGoal.yaw) * Math.cos(camGoal.pitch) * camGoal.dist; }

/* ============================ 17. boot ============================ */

function resize() {
  if (!canvas) return;
  const vp = $('viewport');
  const rect = vp && vp.getBoundingClientRect
    ? vp.getBoundingClientRect()
    : { width: 1280, height: 720 };
  DPR = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  W = Math.max(320, Math.floor(rect.width));
  H = Math.max(240, Math.floor(rect.height));
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  focal = (H / 2) / Math.tan(cam.fov / 2);
}

/* headless harness: set viewport size without DOM */
function setViewport(w, h) {
  W = w; H = h; DPR = 1;
  focal = (H / 2) / Math.tan(cam.fov / 2);
}

function initToolbar() {
  if (!HAS_UI) return;
  document.querySelectorAll('.tool[data-mode]').forEach(b =>
    b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('toolInterior').addEventListener('click', () => applyPreset(getPreset('CAM_INTERIOR_MAIN'), false));
  $('toolExterior').addEventListener('click', () => applyPreset(getPreset('CAM_EXTERIOR_SE'), false));
  $('toolRoof').addEventListener('click', () => setRoof(!S.grpVis['roof']));
  $('toolMeasure').addEventListener('click', () => setMeasure(!S.measureMode));
  $('toolShot').addEventListener('click', captureShot);
  $('toolPresent').addEventListener('click', startPresentation);
  $('toolReset').addEventListener('click', resetAll);
  document.querySelectorAll('.tool--light').forEach(b =>
    b.addEventListener('click', () => setLighting(b.dataset.light)));
  $('btnShots').addEventListener('click', captureAllShots);
  $('btnHelp').addEventListener('click', () => $('helpDialog').showModal());
  $('btnDebug').addEventListener('click', () => {
    const d = $('debugStrip');
    d.hidden = !d.hidden;
    if (!d.hidden) d.textContent = debugText();
  });
  $('btnExitPov').addEventListener('click', exitPov);
  $('btnExitPresent').addEventListener('click', exitPresentation);
  $('btnPrevStop').addEventListener('click', () => showStop(S.presentIdx - 1));
  $('btnNextStop').addEventListener('click', () => showStop(S.presentIdx + 1));
  $('btnShowAll').addEventListener('click', () => {
    for (const lg of LAYER_GROUPS) S.grpVis[lg.id] = true;
    for (const sys of SYSTEMS) S.sysVis[sys.number] = true;
    S.decorVisible = true;
    refreshLayerRows(); refreshSystemRows();
  });
  $('btnHideNoness').addEventListener('click', () => {
    for (const lg of LAYER_GROUPS) S.grpVis[lg.id] = lg.essential;
    S.decorVisible = false;
    refreshLayerRows();
  });
  $('btnIsolate').addEventListener('click', () => {
    if (!S.selected) return;
    S.isolated = !S.isolated;
    updateRightPanel();
  });
  $('btnResetLayers').addEventListener('click', () => {
    for (const lg of LAYER_GROUPS) S.grpVis[lg.id] = true;
    for (const sys of SYSTEMS) S.sysVis[sys.number] = true;
    S.decorVisible = true;
    S.isolated = false;
    refreshLayerRows(); refreshSystemRows();
  });
  $('searchBox').addEventListener('input', ev => {
    const q = ev.target.value.trim().toLowerCase();
    document.querySelectorAll('.system-row').forEach(row => {
      const sys = getSystem(Number(row.dataset.sys));
      const hay = (sys.name + ' ' + sys.short + ' ' + sys.category + ' ' + sys.id).toLowerCase();
      row.style.display = !q || hay.includes(q) ? '' : 'none';
    });
  });
  $('btnLeftToggle').addEventListener('click', () => $('panelLeft').classList.toggle('is-open'));
  $('btnRightToggle').addEventListener('click', () => $('panelRight').classList.toggle('is-open'));
  $('btnCollapseRight').addEventListener('click', () => $('panelRight').classList.remove('is-open'));
  window.addEventListener('resize', resize);
}

function resetAll() {
  exitPresentationSafe();
  if (S.mode === 'pov') setMode('orbit');
  setMeasure(false);
  S.isolated = false;
  S.overlay01 = false;
  for (const lg of LAYER_GROUPS) S.grpVis[lg.id] = true;
  for (const sys of SYSTEMS) S.sysVis[sys.number] = true;
  S.decorVisible = true;
  setLighting('day');
  selectSystem(0, false);
  applyPreset(getPreset('CAM_EXTERIOR_SE'), false);
  refreshLayerRows(); refreshSystemRows();
}

function exitPresentationSafe() {
  if (S.presenting) exitPresentation();
}

async function boot() {
  canvas = $('gl');
  ctx = canvas.getContext('2d');
  resize();
  ensureOverviewButton();

  // defaults
  for (const lg of LAYER_GROUPS) S.grpVis[lg.id] = true;
  for (const sys of SYSTEMS) S.sysVis[sys.number] = true;

  const fill = $('loadingFill'), phase = $('loadingPhase');
  await buildScene((k, name) => {
    fill.style.width = Math.round(k * 100) + '%';
    phase.textContent = name;
  });

  buildUI();
  initInteraction();
  initToolbar();

  // URL state
  const m = (typeof location !== 'undefined' && location.hash.match(/sys=(\d)/)) || null;
  if (m) selectSystem(Number(m[1]), true);

  applyPreset(getPreset('CAM_EXTERIOR_SE'), true);
  updateRightPanel();
  syncToolButtons();

  $('loading').classList.add('is-done');
  setTimeout(() => { $('loading').style.display = 'none'; }, 600);

  lastT = performance.now();
  requestAnimationFrame(frame);
}

/* safe no-op helpers when UI DOM is absent (headless harness) */
function syncToolButtonsSafe() {
  if (!HAS_UI) return;
  syncToolButtons();
}

/* expose for testing / debugging */
const WD360 = {
  FACES, SELECTABLES, SYSTEMS, CAMERA_PRESETS, S, cam, camGoal,
  buildScene, renderFrame, applyPreset, selectSystem, setLighting, setMode,
  getSystem, getPreset, LIGHTING, resize, resetAll, setViewport, screenRay,
  updatePOV, tryMove, hitsCollider, buildUI, initInteraction, initToolbar,
  updateOverlays: typeof document === 'undefined' ? () => {} : updateOverlays,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WD360;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
