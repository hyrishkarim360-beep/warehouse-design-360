/* Software Canvas 2D implementation for headless validation & shot export.
   Implements exactly the subset of the 2D context API used by app.js:
   transforms, paths, polygon fill/stroke, clip, affine drawImage,
   linear gradients, fillRect/clearRect, fillText (5x7 bitmap font).
*/

'use strict';

const zlib = require('zlib');

/* ---------------- color parsing ---------------- */

function parseColor(str) {
  if (!str) return [0, 0, 0, 1];
  if (str && str.__grad) return null; // gradient handled separately
  const m = /^#([0-9a-f]{3,8})$/i.exec(str.trim());
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [r, g, b, a];
  }
  const c = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s]+([\d.]+))?\s*\)/.exec(str.trim());
  if (c) return [+c[1], +c[2], +c[3], c[4] == null ? 1 : +c[4]];
  return [0, 0, 0, 1];
}

/* ---------------- 5x7 bitmap font ---------------- */

const FONT = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11], B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e], D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f], F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f], H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e], J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11], L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11], N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e], P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d], R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e], T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e], V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11], X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04], Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e], '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f], '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02], '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e], '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e], '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ' ': [0, 0, 0, 0, 0, 0, 0], '-': [0, 0, 0, 0x1f, 0, 0, 0], '.': [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ',': [0, 0, 0, 0, 0x0c, 0x04, 0x08], '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  'm': [0, 0, 0, 0x1b, 0x15, 0x15, 0x15], '+': [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  '×': [0, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0], 'ø': [0, 0x0e, 0x11, 0x13, 0x15, 0x19, 0x0e],
  '·': [0, 0, 0x0c, 0x0c, 0, 0, 0], '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08], '°': [0x0e, 0x11, 0x11, 0x0e, 0, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 0x1f], ':': [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  '#': [0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0, 0], '[': [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
  ']': [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e], '<': [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  '>': [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08], '%': [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
};

function drawTextPixels(ctx, text, x0, y0, scale, col) {
  let x = x0;
  for (const ch of String(text)) {
    const glyph = FONT[ch] || FONT[' '];
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row];
      for (let b = 0; b < 5; b++) {
        if (bits & (1 << (4 - b))) {
          const gx = Math.round(x + b * scale), gy = Math.round(y0 + row * scale);
          for (let dy = 0; dy < Math.max(1, Math.round(scale)); dy++) {
            for (let dx = 0; dx < Math.max(1, Math.round(scale)); dx++) {
              ctx.plot(gx + dx, gy + dy, col);
            }
          }
        }
      }
    }
    x += 6 * scale;
  }
}

/* ---------------- gradient ---------------- */

class Gradient {
  constructor(x0, y0, x1, y1) {
    this.__grad = true;
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.stops = [];
  }
  addColorStop(t, color) { this.stops.push([t, parseColor(color)]); this.stops.sort((a, b) => a[0] - b[0]); }
  colorAt(t) {
    if (!this.stops.length) return [0, 0, 0, 1];
    if (t <= this.stops[0][0]) return this.stops[0][1];
    if (t >= this.stops[this.stops.length - 1][0]) return this.stops[this.stops.length - 1][1];
    for (let i = 0; i < this.stops.length - 1; i++) {
      const [t0, c0] = this.stops[i], [t1, c1] = this.stops[i + 1];
      if (t >= t0 && t <= t1) {
        const k = (t - t0) / (t1 - t0 || 1);
        return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k), lerp(c0[3], c1[3], k)];
      }
    }
    return this.stops[0][1];
  }
}

const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------- context ---------------- */

class SWCtx {
  constructor(w, h, buf) {
    this.w = w; this.h = h; this.buf = buf;
    this.stack = [];
    this.transform = [1, 0, 0, 1, 0, 0];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.font = '12px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.path = [];
    this.closed = false;
    this.clipPoly = null;
    this.dash = [];
  }

  /* --- transform --- */
  save() { this.stack.push({ transform: this.transform.slice(), globalAlpha: this.globalAlpha, clipPoly: this.clipPoly }); }
  restore() {
    const s = this.stack.pop();
    if (s) { this.transform = s.transform; this.globalAlpha = s.globalAlpha; this.clipPoly = s.clipPoly; }
  }
  setTransform(a, b, c, d, e, f) { this.transform = [a, b, c, d, e, f]; }
  translate(dx, dy) {
    const [a, b, c, d, e, f] = this.transform;
    this.transform = [a, b, c, d, e + dx, f + dy];
  }
  rotate(theta) {
    const [a, b, c, d, e, f] = this.transform;
    const ca = Math.cos(theta), sa = Math.sin(theta);
    this.transform = [
      ca * a - sa * b, sa * a + ca * b,
      ca * c - sa * d, sa * c + ca * d,
      ca * e - sa * f, sa * e + ca * f,
    ];
  }
  xform(p) {
    const [a, b, c, d, e, f] = this.transform;
    return [a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f];
  }

  /* --- path --- */
  beginPath() { this.path = []; this.closed = false; }
  moveTo(x, y) { this.path.push([x, y]); }
  lineTo(x, y) { this.path.push([x, y]); }
  closePath() { this.closed = true; }
  arc(cx, cy, r, a0, a1) {
    const steps = Math.max(4, Math.ceil(Math.abs(a1 - a0) * r / 4));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      this.path.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  rect(x, y, w, h) {
    this.path = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    this.closed = true;
  }
  setLineDash(d) { this.dash = d || []; }

  /* --- raster helpers --- */
  plot(x, y, col, alphaMul = 1, lw = 1) {
    const r = Math.max(0.5, lw / 2);
    const x0 = Math.round(x - r), x1 = Math.round(x + r);
    const y0 = Math.round(y - r), y1 = Math.round(y + r);
    const a = col[3] * this.globalAlpha * alphaMul;
    if (a <= 0) return;
    for (let yy = y0; yy <= y1; yy++) {
      if (yy < 0 || yy >= this.h) continue;
      for (let xx = x0; xx <= x1; xx++) {
        if (xx < 0 || xx >= this.w) continue;
        if (this.clipPoly && !pointInPoly(xx + 0.5, yy + 0.5, this.clipPoly)) continue;
        const i = (yy * this.w + xx) * 4;
        const ia = 1 - a;
        this.buf[i] = col[0] * a + this.buf[i] * ia;
        this.buf[i + 1] = col[1] * a + this.buf[i + 1] * ia;
        this.buf[i + 2] = col[2] * a + this.buf[i + 2] * ia;
        this.buf[i + 3] = 255;
      }
    }
  }

  fillPoly(pts, col, alphaMul = 1) {
    if (pts.length < 3) return;
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const p of pts) {
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      if (y < 0 || y >= this.h) continue;
      const xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const y1 = pts[j][1], y2 = pts[i][1];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(pts[j][0] + ((y - y1) / (y2 - y1)) * (pts[i][0] - pts[j][0]));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.ceil(xs[k])), x1 = Math.min(this.w - 1, Math.floor(xs[k + 1]));
        for (let x = x0; x <= x1; x++) this.plot(x, y, col, alphaMul);
      }
    }
  }

  fill() {
    const pts = this.path.map(p => this.xform(p));
    if (pts.length < 3) return;
    const col = this.resolveFill();
    this.fillPoly(pts, col);
  }

  resolveFill() {
    const s = this.fillStyle;
    if (s && s.__grad) {
      const pts = this.path.map(p => this.xform(p));
      const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const t = (cy - s.y0) / ((s.y1 - s.y0) || 1);
      return s.colorAt(clamp01(t));
    }
    return parseColor(s);
  }

  stroke() {
    const col = parseColor(this.strokeStyle);
    const lw = Math.max(0.5, this.lineWidth);
    const n = this.path.length;
    if (n < 2) return;
    const edges = [];
    for (let i = 1; i < n; i++) edges.push([this.path[i - 1], this.path[i]]);
    if (this.closed) edges.push([this.path[n - 1], this.path[0]]);
    for (const [a, b] of edges) {
      const p0 = this.xform(a), p1 = this.xform(b);
      this.strokeSeg(p0, p1, col, lw);
    }
  }

  strokeSeg(p0, p1, col, lw) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.5) { this.plot(p0[0], p0[1], col, 1, lw); return; }
    const steps = Math.ceil(len / Math.max(0.5, lw / 2));
    let dashOn = true, dashLeft = this.dash.length ? this.dash[0] : Infinity, di = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.dash.length) {
        if (dashLeft <= 0) {
          dashOn = !dashOn;
          di = (di + 1) % this.dash.length;
          dashLeft = this.dash[di] || 1;
        }
        dashLeft -= len / steps;
      }
      if (dashOn) this.plot(p0[0] + dx * t, p0[1] + dy * t, col, 1, lw);
    }
  }

  clip() {
    this.clipPoly = this.path.map(p => this.xform(p));
  }

  drawImage(img, dx, dy) {
    const tex = img.getContext ? img.getContext('2d') : img;
    const tw = img.width, th = img.height;
    const inv = invert(this.transform);
    if (!inv) return;
    const corners = [[0, 0], [tw, 0], [tw, th], [0, th]].map(p => this.xform(p));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of corners) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    const triA = [corners[0], corners[1], corners[2]];
    const triB = [corners[0], corners[2], corners[3]];
    this.fillTriTex(triA, tex, inv, tw, th);
    this.fillTriTex(triB, tex, inv, tw, th);
  }

  fillTriTex(tri, tex, inv, tw, th) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of tri) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    const [a, b, c] = tri;
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-9) return;
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      if (y < 0 || y >= this.h) continue;
      for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(this.w - 1, Math.ceil(maxX)); x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d;
        const w1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.01 || w1 < -0.01 || w2 < -0.01) continue;
        if (this.clipPoly && !pointInPoly(px, py, this.clipPoly)) continue;
        const sx = inv[0] * px + inv[2] * py + inv[4];
        const sy = inv[1] * px + inv[3] * py + inv[5];
        const tx = clamp01(sx / tw), ty = clamp01(sy / th);
        const si = ((Math.min(th - 1, Math.floor(ty * th)) * tw) + Math.min(tw - 1, Math.floor(tx * tw))) * 4;
        this.plot(px, py, [tex.buf[si], tex.buf[si + 1], tex.buf[si + 2], tex.buf[si + 3] / 255], 1);
      }
    }
  }

  fillRect(x, y, w, h) {
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(p => this.xform(p));
    this.fillPoly(pts, this.resolveFillRect(x, y, w, h));
  }
  resolveFillRect(x, y, w, h) {
    // fillRect has no path — resolve gradient by rect centre
    const s = this.fillStyle;
    if (s && s.__grad) {
      const [a, b, c, d, e, f] = this.transform;
      const cy = b * (x + w / 2) + d * (y + h / 2) + f;
      return s.colorAt(clamp01((cy - s.y0) / ((s.y1 - s.y0) || 1)));
    }
    return parseColor(s);
  }
  strokeRect(x, y, w, h) {
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(p => this.xform(p));
    const col = parseColor(this.strokeStyle);
    for (let i = 0; i < 4; i++) this.strokeSeg(pts[i], pts[(i + 1) % 4], col, this.lineWidth);
  }
  clearRect(x, y, w, h) {
    const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(this.w - 1, Math.ceil(x + w));
    const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(this.h - 1, Math.ceil(y + h));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const i = (yy * this.w + xx) * 4;
      this.buf[i] = this.buf[i + 1] = this.buf[i + 2] = this.buf[i + 3] = 0;
    }
  }
  fillText(text, x, y) {
    const col = this.resolveFill();
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font || '12px sans-serif');
    const size = m ? parseFloat(m[1]) : 12;
    const scale = Math.max(0.6, size / 7.5);
    const wpx = String(text).length * 6 * scale - scale;
    let x0 = x, y0 = y;
    if (this.textAlign === 'center') x0 -= wpx / 2;
    else if (this.textAlign === 'right') x0 -= wpx;
    if (this.textBaseline === 'middle') y0 -= 3.5 * scale;
    else if (this.textBaseline === 'top') y0 -= 0;
    else y0 -= 6.5 * scale; // alphabetic
    drawTextPixels(this, String(text), x0, y0, scale, col);
  }
  measureText(text) {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font || '12px sans-serif');
    const size = m ? parseFloat(m[1]) : 12;
    return { width: String(text).length * 6 * (size / 7.5) };
  }
  createLinearGradient(x0, y0, x1, y1) {
    return new Gradient(x0, y0, x1, y1);
  }
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function invert(m) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  const id = 1 / det;
  return [d * id, -b * id, -c * id, a * id, (c * f - d * e) * id, (b * e - a * f) * id];
}

/* ---------------- canvas ---------------- */

class SWCanvas {
  constructor(w, h) {
    this._w = w; this._h = h;
    this._alloc();
  }
  get width() { return this._w; }
  set width(v) { this._w = v; this._alloc(); }
  get height() { return this._h; }
  set height(v) { this._h = v; this._alloc(); }
  _alloc() {
    this.buf = new Uint8ClampedArray(this._w * this._h * 4);
    this.ctx = new SWCtx(this._w, this._h, this.buf);
  }
  getContext() { return this.ctx; }
  toBlob(cb) {
    cb(encodePNG(this._w, this._h, this.buf));
  }
}

/* ---------------- PNG encoder ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolor
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * stride + 1 + x * 3;
      const a = rgba[si + 3] / 255;
      raw[di] = rgba[si] * a + 16 * (1 - a);
      raw[di + 1] = rgba[si + 1] * a + 16 * (1 - a);
      raw[di + 2] = rgba[si + 2] * a + 16 * (1 - a);
    }
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { SWCanvas, SWCtx, encodePNG, parseColor, pointInPoly };
