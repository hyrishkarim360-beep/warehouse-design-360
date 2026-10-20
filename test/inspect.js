/* Inspect exported shots as coarse ASCII luminance maps + sample points */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodePNG(buf) {
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
    off = y * stride + 1;
    for (let x = 0; x < w * 3; x++) px[di++] = raw[off + x];
  }
  return { w, h, px };
}

const file = process.argv[2];
const img = decodePNG(fs.readFileSync(file));
const { w, h, px } = img;
console.log(file, w + '×' + h);

// ASCII map 96×36
for (let gy = 0; gy < 36; gy++) {
  let row = '';
  for (let gx = 0; gx < 96; gx++) {
    const x = Math.floor((gx + 0.5) / 96 * w);
    const y = Math.floor((gy + 0.5) / 36 * h);
    const i = (y * w + x) * 3;
    const lum = 0.3 * px[i] + 0.6 * px[i + 1] + 0.1 * px[i + 2];
    row += lum > 210 ? '.' : lum > 170 ? '#' : lum > 130 ? '+' : lum > 80 ? '-' : lum > 30 ? '=' : ' ';
  }
  console.log(row);
}
// sample specific points
const pts = process.argv.slice(3).map(s => s.split(',').map(Number));
for (const [x, y] of pts) {
  const i = (y * w + x) * 3;
  console.log(`px(${x},${y}) rgb=${px[i]},${px[i + 1]},${px[i + 2]}`);
}
