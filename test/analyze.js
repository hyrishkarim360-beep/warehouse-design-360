/* Programme-level sanity check of exported shots: decodes PNGs and
   verifies content variance, expected colours and layout properties. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodePNG(buf) {
  if (buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error('not png');
  let off = 8, w = 0, h = 0, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 3 + 1;
  const px = Buffer.alloc(w * h * 3);
  let di = 0;
  for (let y = 0; y < h; y++) {
    off = y * stride + 1; // filter 0
    for (let x = 0; x < w * 3; x++) px[di++] = raw[off + x];
  }
  return { w, h, px };
}

function stats(img) {
  const { w, h, px } = img;
  const hist = new Map();
  let sum = 0, sumSq = 0, n = 0;
  for (let i = 0; i < px.length; i += 3) {
    const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    hist.set(key, (hist.get(key) || 0) + 1);
    const lum = 0.3 * px[i] + 0.6 * px[i + 1] + 0.1 * px[i + 2];
    sum += lum; sumSq += lum * lum; n++;
  }
  const mean = sum / n;
  const std = Math.sqrt(sumSq / n - mean * mean);
  return { colors: hist.size, mean, std, hist };
}

function regionMean(img, x0, y0, x1, y1) {
  const { w, px } = img;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y += 4) {
    for (let x = x0; x < x1; x += 4) {
      const i = (y * w + x) * 3;
      r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
  }
  return [r / n, g / n, b / n];
}

const dir = path.join(__dirname, '..', 'screenshots');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
console.log(`${files.length} shots\n`);
let fail = 0;
for (const f of files) {
  const img = decodePNG(fs.readFileSync(path.join(dir, f)));
  const st = stats(img);
  const ok = st.colors > 40 && st.std > 8;
  if (!ok) fail++;
  console.log(`${ok ? 'ok ' : 'BAD'} ${f.padEnd(28)} ${img.w}×${img.h}  colours=${st.colors}  lumMean=${st.mean.toFixed(1)} std=${st.std.toFixed(1)}`);
}

// plan shot: building centre should be neutral concrete floor; far corner is ground
const plan = decodePNG(fs.readFileSync(path.join(dir, 'CAM_PLAN_NORTH.png')));
const centre = regionMean(plan, 600, 320, 680, 400);   // world (0, 0)±7 m
const corner = regionMean(plan, 20, 20, 140, 100);     // world (-103, 44) — site ground
console.log('\nplan centre rgb ≈', centre.map(v => v.toFixed(0)).join(','), '(expect neutral grey floor)');
console.log('plan corner rgb ≈', corner.map(v => v.toFixed(0)).join(','), '(expect dark site ground)');
const centreGrey = Math.abs(centre[0] - centre[2]) < 32 && centre[0] > 110 && centre[0] < 215;
const cornerGround = corner[0] < 130;
if (!centreGrey || !cornerGround) { fail++; console.log('BAD plan layout'); } else console.log('ok  plan layout');

// night shot should be much darker than day
const day = stats(decodePNG(fs.readFileSync(path.join(dir, 'CAM_EXTERIOR_SE.png'))));
const night = stats(decodePNG(fs.readFileSync(path.join(dir, 'CAM_EXTERIOR_SE_NIGHT.png'))));
console.log(`\nday lum ${day.mean.toFixed(1)} vs night lum ${night.mean.toFixed(1)}`);
if (night.mean < day.mean * 0.6) console.log('ok  night lighting darker');
else { fail++; console.log('BAD night lighting'); }

console.log(fail ? `\n${fail} FAILURES` : '\nALL SHOT CHECKS PASSED');
process.exit(fail ? 1 : 0);
