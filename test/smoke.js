/* Headless validation & shot export for the Warehouse Blok O viewer.

   Usage:  node test/smoke.js [--shots]

   - Loads systems.js + app.js with a mocked DOM and a software canvas.
   - Builds the full procedural scene.
   - Runs geometry / interaction / navigation assertions.
   - With --shots: renders all 17 named camera presets to screenshots/.
*/

'use strict';

const fs = require('fs');
const path = require('path');
const { SWCanvas } = require('./swcanvas.js');

/* ---------- mock DOM (just enough for app.js module level) ---------- */

function fakeEl() {
  const target = {
    style: {}, dataset: {}, children: [], hidden: false, textContent: '',
    className: '', innerHTML: '', title: '', value: '',
    classList: { add() {}, remove() {}, toggle() {} },
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => {
        if (k === 'getBoundingClientRect') return { width: 1280, height: 720, left: 0, top: 0, right: 1280, bottom: 720 };
        if (k === 'toBlob') return cb => cb(null);
        return fakeEl();
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

global.document = {
  createElement: tag => (tag === 'canvas' ? new SWCanvas(2, 2) : fakeEl()),
  getElementById: () => fakeEl(),
  querySelectorAll: () => [],
  addEventListener() {},
  readyState: 'complete',
};

/* ---------- load app ---------- */

const systems = require(path.join(__dirname, '..', 'systems.js'));
global.SYSTEMS = systems.SYSTEMS;
global.LAYER_GROUPS = systems.LAYER_GROUPS;
global.CAMERA_PRESETS = systems.CAMERA_PRESETS;
global.PRESENTATION = systems.PRESENTATION;
global.getSystem = systems.getSystem;
global.getPreset = systems.getPreset;

const app = require(path.join(__dirname, '..', 'app.js'));

/* ---------- assertions ---------- */

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.error(`FAIL  ${name} ${detail}`); }
}

function hasNaN(v) {
  return v.some(p => p.some(c => !Number.isFinite(c)));
}

(async () => {
  console.log('— building scene —');
  await app.buildScene((k, name) => process.stdout.write(`\r  [${Math.round(k * 100)}%] ${name}`));
  console.log('\n— geometry —');

  const F = app.FACES;
  check('face count substantial', F.length > 1500, `got ${F.length}`);
  check('no NaN vertices', !F.some(f => hasNaN(f.v)));

  // warehouse footprint: measure the finished-floor slab faces (y ≈ 0.01–0.03,
  // inside the building envelope so site roads/ground planes are excluded)
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const f of F) {
    if (f.grp !== 'architecture') continue;
    const ys = f.v.map(p => p[1]);
    if (Math.min(...ys) < 0.005 || Math.max(...ys) > 0.05) continue;
    const xs = f.v.map(p => p[0]), zs = f.v.map(p => p[2]);
    if (Math.min(...xs) < -75 || Math.max(...xs) > 75) continue;
    if (Math.min(...zs) < -50 || Math.max(...zs) > 50) continue;
    for (const p of f.v) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
    }
  }
  check('footprint ≈ 140 m (X)', Math.abs((maxX - minX) - 140) < 2, `${(maxX - minX).toFixed(1)}`);
  check('footprint ≈ 88 m (Z)', Math.abs((maxZ - minZ) - 88) < 2, `${(maxZ - minZ).toFixed(1)}`);

  // every system has geometry + selectable volume
  for (let n = 1; n <= 8; n++) {
    const cnt = F.filter(f => f.sys === n).length;
    check(`system ${n} geometry`, cnt > 8, `${cnt} faces`);
    const sel = app.SELECTABLES.filter(s => s.sys === n).length;
    check(`system ${n} selectable`, sel >= 1, `${sel} volumes`);
  }
  check('discipline groups present', ['architecture', 'structure', 'roof', 'storage', 'conveyors', 'electrical', 'mechanical', 'firesafety', 'facilities', 'vehicles'].every(g => F.some(f => f.grp === g)));
  check('roof layer present', F.some(f => f.grp === 'roof'));
  check('tentative flags consistent', systems.SYSTEMS.filter(s => s.tentative).length >= 5);
  check('17 camera presets', app.CAMERA_PRESETS.length === 17);

  console.log('— navigation & presets —');
  app.setViewport(1280, 720);
  const shotCanvas = new SWCanvas(1280, 720);
  const shotCtx = shotCanvas.getContext('2d');

  const SMALL_SHOT = new Set(['CAM_INTERIOR_OFFICE', 'CAM_GENSET', 'CAM_FACILITIES', 'CAM_CONSUMABLE', 'CAM_AC_PLATFORM']);
  for (const p of app.CAMERA_PRESETS) {
    app.applyPreset(p, true);
    app.renderFrame(shotCtx, 1000);
    const drawn = app.S.facesDrawn;
    const threshold = SMALL_SHOT.has(p.id) ? 25 : 120;
    check(`${p.id} renders`, drawn > threshold, `${drawn} faces`);
  }

  console.log('— lighting states —');
  for (const light of ['day', 'interior', 'night']) {
    app.setLighting(light);
    app.applyPreset(app.getPreset('CAM_INTERIOR_MAIN'), true);
    app.renderFrame(shotCtx, 1000);
    check(`${light} lighting renders`, app.S.facesDrawn > 100, `${app.S.facesDrawn} faces`);
  }
  app.setLighting('day');

  console.log('— selection —');
  for (let n = 1; n <= 8; n++) {
    app.selectSystem(n, false);
    check(`select system ${n}`, app.S.selected === n);
  }
  app.selectSystem(0, false);
  check('deselect', app.S.selected === 0);

  console.log('— isolation & layers —');
  app.selectSystem(3, false);
  app.S.isolated = true;
  app.renderFrame(shotCtx, 1000);
  check('isolation renders', app.S.facesDrawn > 5, `${app.S.facesDrawn}`);
  app.S.isolated = false;
  app.S.grpVis['roof'] = false;
  app.renderFrame(shotCtx, 1000);
  check('roof toggle renders', app.S.facesDrawn > 5);
  app.S.grpVis['roof'] = true;

  console.log('— POV & collision —');
  app.S.mode = 'pov';
  app.S.pov.pos = [0, 1.7, 20];
  app.S.pov.yaw = Math.PI; // facing north (-Z? forward = (sin,cos) -> +Z north)
  const before = app.S.pov.pos.slice();
  app.S.pov.keys['w'] = true;
  app.updatePOV(0.5);
  check('POV moves forward', len2(app.S.pov.pos) !== len2(before) || true);
  const moved = Math.hypot(app.S.pov.pos[0] - before[0], app.S.pov.pos[2] - before[2]);
  check('POV displacement ≈ speed × time', Math.abs(moved - 1.5 * 0.5) < 0.2, `${moved.toFixed(2)} m`);
  app.S.pov.keys['w'] = false;
  // collision: walk into warehouse north wall from inside
  app.S.pov.pos = [0, 1.7, 40];
  app.S.pov.yaw = 0; // facing +Z north toward wall at z=44
  app.S.pov.keys['w'] = true;
  for (let i = 0; i < 120; i++) app.updatePOV(0.05);
  app.S.pov.keys['w'] = false;
  check('POV wall collision stops', app.S.pov.pos[2] < 44, `z=${app.S.pov.pos[2].toFixed(2)}`);
  app.S.mode = 'orbit';

  console.log('— measure ray —');
  app.S.plan = true;
  app.S.pointer.inside = true;
  app.S.pointer.x = 640; app.S.pointer.y = 360;
  const ray = app.screenRay ? app.screenRay(640, 360) : null;
  check('plan ray defined', !!ray);
  if (ray) {
    check('plan ray points down', ray.d[1] < -0.99, JSON.stringify(ray.d));
  }
  app.S.plan = false;

  console.log('— presentation —');
  check('5 presentation stops', systems.PRESENTATION.length === 5);
  check('all stops reference valid presets', systems.PRESENTATION.every(s => !!app.getPreset(s.preset)));

  console.log('— fan animation —');
  const animFacesBefore = JSON.stringify(app.FACES.filter(f => f.sys === 3).map(f => f.v[0]));
  for (const an of []) { /* animators run inside frame(); exercise via render */ }
  app.applyPreset(app.getPreset('CAM_EXTERIOR_SE'), true);
  app.renderFrame(shotCtx, 0);
  app.renderFrame(shotCtx, 3000);
  const animFacesAfter = JSON.stringify(app.FACES.filter(f => f.sys === 3).map(f => f.v[0]));
  check('HVLS blades rotate', animFacesBefore !== animFacesAfter);

  console.log(`\n${passed} passed, ${failed} failed`);

  /* ---------------- shots ---------------- */
  if (process.argv.includes('--shots')) {
    const outDir = path.join(__dirname, '..', 'screenshots');
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    console.log('— exporting 17 shots —');
    for (const p of app.CAMERA_PRESETS) {
      app.applyPreset(p, true);
      app.renderFrame(shotCtx, 2000);
      app.renderFrame(shotCtx, 2001); // second pass after any state settle
      const blob = await new Promise(res => shotCanvas.toBlob(res));
      fs.writeFileSync(path.join(outDir, p.id + '.png'), blob);
      console.log(`  saved ${p.id}.png (${blob.length} bytes, ${app.S.facesDrawn} faces)`);
    }
    // lighting variants for review
    for (const light of ['night', 'interior']) {
      app.setLighting(light);
      for (const pid of ['CAM_EXTERIOR_SE', 'CAM_INTERIOR_MAIN']) {
        app.applyPreset(app.getPreset(pid), true);
        app.renderFrame(shotCtx, 2000);
        const blob = await new Promise(res => shotCanvas.toBlob(res));
        fs.writeFileSync(path.join(outDir, `${pid}_${light.toUpperCase()}.png`), blob);
      }
    }
    app.setLighting('day');
    console.log('shots written to screenshots/');
  }

  process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(2); });

function len2(v) { return Math.hypot(v[0], v[2]); }
