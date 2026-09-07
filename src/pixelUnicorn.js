// Pixel-art unicorn for the game — a 120x96 sprite tinted per element, with a
// 4-beat gallop cycle, a leap (airborne) frame, and body bounce. The design is
// procedural (shapes + rules): rounded muscular barrel, jointed legs, a small
// forward-held head, and a per-strand rainbow mane & tail. Each (element, frame)
// is baked once to an offscreen canvas and blitted with smoothing off so the
// pixels stay crisp. Mane & tail stay rainbow; the body takes the element hue.
import { COLORS } from './palette.js';

const SW = 120, SH = 96, FY = 90, TAU = Math.PI * 2;

// --- palette helpers ---
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mul = (c, k) => c.map((v) => Math.min(255, v * k));
const mix = (c, d, t) => c.map((v, i) => v + (d[i] - v) * t);
const W = [255, 255, 255];

// --- pixel primitives ---
const inb = (x, y) => x >= 0 && x < SW && y >= 0 && y < SH;
function set(g, x, y, v) { if (inb(x | 0, y | 0) && v) g[y | 0][x | 0] = v; }
function ell(g, cx, cy, rx, ry, v) { for (let y = Math.ceil(cy - ry); y <= cy + ry; y++) for (let x = Math.ceil(cx - rx); x <= cx + rx; x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1) set(g, x, y, v); } }
function fillPoly(g, pts, v) { let mn = 1e9, mx = -1e9; for (const p of pts) { mn = Math.min(mn, p[1]); mx = Math.max(mx, p[1]); } for (let y = Math.ceil(mn); y <= mx; y++) { const xs = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); } xs.sort((p, q) => p - q); for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) set(g, x, y, v); } }
function shade(g, cx, cy, rx, ry, v) { for (let y = Math.ceil(cy - ry); y <= cy + ry; y++) for (let x = Math.ceil(cx - rx); x <= cx + rx; x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1 && inb(x, y) && [1, 2, 3, 9, 12].includes(g[y][x])) g[y][x] = v; } }
function strand(g, x0, y0, cx, cy, x1, y1, col, w) { const n = Math.round(Math.abs(y1 - y0) + Math.abs(x1 - x0)) + 4; for (let s = 0; s <= n; s++) { const t = s / n, mt = 1 - t, X = mt * mt * x0 + 2 * mt * t * cx + t * t * x1, Y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1; for (let o = 0; o < w; o++) set(g, Math.round(X) + o, Math.round(Y), col); } }
function drawLeg(g, joints, v, vs) { for (let i = 0; i + 1 < joints.length; i++) { const a = joints[i], b = joints[i + 1]; const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) || 1; for (let s = 0; s <= n; s++) { const t = s / n, cx = Math.round(a[0] + (b[0] - a[0]) * t), cy = Math.round(a[1] + (b[1] - a[1]) * t), w = Math.round(a[2] + (b[2] - a[2]) * t); for (let o = 0; o < w; o++) set(g, cx + o, cy, o >= w - 1 ? vs : v); } } const f = joints[joints.length - 1]; for (let y = f[1]; y <= FY; y++) for (let o = -1; o <= f[2]; o++) set(g, f[0] + o, y, 5); }
const NC = (x) => Math.round(43 - 16 * Math.sin(Math.max(0, Math.min(1, (x - 76) / 24)) * 1.45)); // neck crest y

// leg joints (fore = straight, hind = jointed at the hock)
const foreJ = (hx, hy, fx, fy) => [[hx, hy, 7], [hx, (hy + fy) / 2 + 2 | 0, 5], [fx, fy, 4]];
const hindJ = (hx, hy, fx, fy) => [[hx, hy, 8], [hx + 5, hy + 9 | 0, 7], [hx - 1, hy + 16 | 0, 5], [fx, fy, 4]];

// gallop stride/lift per phase (near legs use phase; far legs use phase+2)
const FDX = [4, 8, -2, -6], FLIFT = [7, 0, 0, 9], HDX = [-6, -2, 6, 3], HLIFT = [9, 5, 0, 0];

// Build the code-grid for a frame. 0 idle, 1..4 gallop, 5 leap.
function buildGrid(frame) {
  const g = Array.from({ length: SH }, () => new Int8Array(SW));
  const gallop = frame >= 1 && frame <= 4, air = frame === 5, ph = gallop ? frame - 1 : 0, pF = (ph + 2) & 3;
  let feet;
  if (air) feet = { fN: [86, FY - 7], fF: [93, FY - 5], hN: [29, FY - 9], hF: [25, FY - 7] };
  else if (gallop) feet = { fN: [79 + FDX[ph], FY - FLIFT[ph]], fF: [88 + FDX[pF], FY - FLIFT[pF]], hN: [35 + HDX[ph], FY - HLIFT[ph]], hF: [31 + HDX[pF], FY - HLIFT[pF]] };
  else feet = { fN: [79, FY], fF: [88, FY], hN: [35, FY], hF: [31, FY] };

  // --- far legs (behind, darker) ---
  drawLeg(g, foreJ(89, 60, feet.fF[0], feet.fF[1]), 2, 9);
  drawLeg(g, hindJ(30, 60, feet.hF[0], feet.hF[1]), 2, 9);
  // --- body: barrel + haunch + deep chest + shoulder ---
  ell(g, 62, 54, 30, 14, 1); ell(g, 37, 52, 17, 15, 1); ell(g, 88, 56, 11, 14, 1); ell(g, 79, 49, 10, 11, 1);
  // --- neck (arched forward) + head wedge ---
  for (let i = 0; i <= 24; i++) { const x = 76 + i, t = i / 24, cy = NC(x), by = Math.round(60 - 22 * t); for (let y = cy; y <= by; y++) set(g, x, y, 1); }
  fillPoly(g, [[94, 26], [100, 25], [105, 28], [110, 32], [116, 37], [117, 41], [115, 45], [108, 45], [102, 42], [98, 37], [95, 31]], 1);
  // --- shading: y-bands + muscle highlights/shadows ---
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (g[y][x] === 1) { if (y >= 67) g[y][x] = 9; else if (y >= 56) g[y][x] = 2; else if (y <= 44) g[y][x] = 3; }
  shade(g, 37, 44, 11, 4, 12); shade(g, 62, 42, 19, 4, 12); shade(g, 80, 45, 7, 5, 12); shade(g, 32, 45, 7, 4, 12); shade(g, 90, 33, 5, 5, 12);
  shade(g, 88, 30, 5, 5, 3);
  shade(g, 50, 63, 15, 3, 9); shade(g, 78, 64, 9, 3, 9);
  shade(g, 30, 58, 4, 6, 2); shade(g, 75, 56, 4, 6, 2);
  // --- face ---
  set(g, 106, 33, 6); set(g, 107, 33, 6); set(g, 107, 32, 12);
  set(g, 116, 43, 9); set(g, 115, 44, 9); set(g, 111, 44, 2);
  shade(g, 104, 39, 5, 4, 2);
  fillPoly(g, [[90, 17], [93, 26], [96, 25]], 1); fillPoly(g, [[98, 16], [100, 25], [103, 25]], 1);
  // --- horn: ivory spiral with gold ridge highlights ---
  for (let i = 0; i < 24; i++) { const x = 100 + Math.round(i * 0.48), y = 24 - i, w = i < 8 ? 4 : i < 16 ? 3 : 2; for (let k = 0; k < w; k++) set(g, x + k, y, 4); set(g, x + (i % 2), y, i % 2 ? 13 : 8); }
  // --- near legs (base tone, on top) ---
  drawLeg(g, foreJ(80, 58, feet.fN[0], feet.fN[1]), 1, 2);
  drawLeg(g, hindJ(36, 57, feet.hN[0], feet.hN[1]), 1, 2);
  // --- auto outline ---
  const fl = (x, y) => inb(x, y) && g[y][x] !== 0; const out = [];
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (g[y][x] === 0 && (fl(x - 1, y) || fl(x + 1, y) || fl(x, y - 1) || fl(x, y + 1))) out.push([x, y]);
  for (const [x, y] of out) g[y][x] = 7;
  // --- mane: clean rainbow stripes flowing along the neck crest ---
  // Coloured by perpendicular distance from the crest: violet against the neck,
  // out through the spectrum to red on the leading/outer edge (matches the ref).
  // 2px bands stay continuous along the whole neck; thickness tapers at the ends.
  for (let x = 75; x <= 101; x++) {
    const cy = NC(Math.min(x, 100));
    const th = Math.round(14 - Math.max(0, Math.abs(x - 89) - 7) * 0.9);
    for (let dy = 0; dy <= th; dy++) { const idx = Math.max(0, Math.min(6, 6 - Math.floor(dy / 2))); set(g, x - Math.round(dy * 0.18), cy - dy, 20 + idx); }
  }
  // forelock: a short rainbow tuft falling forward over the brow
  for (let dy = 0; dy <= 9; dy++) { const idx = Math.max(0, Math.min(6, 6 - Math.floor(dy / 2))); set(g, 101 + Math.round(dy * 0.45), 26 + dy, 20 + idx); }
  // --- tail: rainbow drape + strand texture (sways in motion) ---
  const sway = air ? 3 : gallop ? [0, 1, 2, 1][ph] : 0;
  for (let cy = 44; cy <= 86; cy++) { const t = (cy - 44) / 42, cx = Math.round(30 - 12 * t - 4 * Math.sin(t * 2.2)) - Math.round(sway * t), w = cy > 78 ? 9 : 13; for (let k = 0; k < w; k++) set(g, cx + k - 3, cy, 20 + Math.floor(k * 6.99 / w)); }
  for (let s = 0; s < 12; s++) { const k = s % 7, dx = (s % 4) - 1, x0 = 27 + dx - Math.round(sway), lit = s % 2; strand(g, x0, 46 + s, x0 - 8, 64, (16 - s * 0.4 | 0) - Math.round(sway), 84 - (s % 5), lit ? 40 + k : 30 + k, 1); }
  return g;
}

// Bake a frame to an offscreen canvas tinted for element `el`.
function bake(el, frame) {
  const base = hex(COLORS[el]);
  const pal = { 1: rgb(base), 2: rgb(mul(base, 0.66)), 3: rgb(mix(base, W, 0.40)), 9: rgb(mul(base, 0.44)), 12: rgb(mix(base, W, 0.68)), 4: '#efe4c4', 8: '#c7bb93', 13: '#ffdf8f', 5: '#181820', 6: '#0c0c14', 7: '#1e1d25' };
  const rdk = COLORS.map((h) => rgb(mul(hex(h), 0.5))), rlt = COLORS.map((h) => rgb(mix(hex(h), W, 0.55)));
  const g = buildGrid(frame), cv = document.createElement('canvas'); cv.width = SW; cv.height = SH; const c = cv.getContext('2d');
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { const v = g[y][x]; if (!v) continue; c.fillStyle = v >= 40 ? rlt[(v - 40) % 7] : v >= 30 ? rdk[(v - 30) % 7] : v >= 20 ? COLORS[(v - 20) % 7] : pal[v]; c.fillRect(x, y, 1, 1); }
  return cv;
}
const cache = {};
const frameFor = (el, frame) => cache[el + ':' + frame] || (cache[el + ':' + frame] = bake(el, frame));

const DEST_W = 50, DEST_H = SH / SW * 50; // world-space blit size (~50 x 40)
export function drawUnicornPixel(ctx, p, ix, iy) {
  let frame = 0, bob = 0;
  if (!p.grounded) { frame = 5; bob = -2; }
  else if (Math.abs(p.vx) > 20) { const f = Math.floor(performance.now() / 70) % 4; frame = 1 + f; bob = [-3, 0, -3, 1][f]; }
  const buf = frameFor(p.el, frame);
  const feetY = iy + p.h, cx = ix + p.w / 2, s = DEST_W / SW;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (p.gflip < 0) { ctx.translate(0, (iy + p.h / 2) * 2); ctx.scale(1, -1); }
  ctx.translate(cx, feetY);
  ctx.scale(p.face, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(0, 0, 14, 2.6, 0, 0, TAU); ctx.fill();
  // anchor the sprite's foot line (FY) and horizontal centre to (0,0); bob lifts it
  ctx.drawImage(buf, -62 * s, -FY * s + bob * s, DEST_W, DEST_H);
  ctx.restore();
}
