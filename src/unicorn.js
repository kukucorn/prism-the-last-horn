// Procedurally-animated unicorn, modelled on Muybridge's horse locomotion.
// No sprites: the body is geometry, the tail and mane are Verlet chains, and the
// four legs are 3-segment FABRIK chains (fore legs fold backward at the knee,
// hind legs make the stifle/hock zig-zag) planted on foot targets from a 4-beat
// gait. At speed it gallops: body see-saw (bounce + pitch), spine squash &
// stretch, head/neck nod, and a mid-stride gather (legs drawn under the belly).
import { COLORS } from './palette.js';
import { makeChain, updateChain } from './chain.js';
import { fabrik } from './ik.js';

const TAU = Math.PI * 2;
const AMP = 7;      // half-stride reach, local px
const LIFT = 9;     // swing-arc height
const DUTY = 0.4;   // fraction of a leg's cycle spent planted
const STRIDE = 22;  // world px per full gait cycle

// Gallop body dynamics (scaled by running speed).
const BOUNCE = 3.5, PITCH = 0.16, SQUASH = 0.12, NOD = 2.6;

const FORE_LEN = [5, 5, 4.2];   // shoulder->elbow->knee->hoof (longer, leggier)
const HIND_LEN = [5.4, 5, 4.2]; // hip->stifle->hock->hoof

// Per-leg: hip offset (facing space), neutral foot x, gait phase, fold side
// (+1 forward / -1 back), zig (hind Z-fold vs fore C-fold), far/near depth.
// Phases are a 4-beat gallop: hind pair (0.0, 0.1) then fore pair (0.4, 0.5).
const LEGS = [
  { hx: -8, hy: 2, fx: -2, phase: 0.1, fold: 1, zig: 1, len: HIND_LEN, far: true },  // hind far
  { hx: 7, hy: 2, fx: 2, phase: 0.5, fold: -1, zig: 0, len: FORE_LEN, far: true },   // fore far
  { hx: -8, hy: 2, fx: -3, phase: 0.0, fold: 1, zig: 1, len: HIND_LEN, far: false }, // hind near
  { hx: 7, hy: 2, fx: 3, phase: 0.4, fold: -1, zig: 0, len: FORE_LEN, far: false },  // fore near
];

let tail, mane, gait, legState;
let gBounce = 0, gPitch = 0, gSx = 1, gSy = 1, gNod = 0;

export function initUnicorn(p) {
  const cx = p.x + p.w / 2, by = p.y + 2;
  tail = makeChain(9, 2.4, cx, by);
  mane = makeChain(6, 1.9, cx, by);
  gait = 0;
  legState = LEGS.map(() => ({
    fx: cx, fy: p.y + p.h,
    pts: [{ x: cx, y: by }, { x: cx, y: by }, { x: cx, y: by }, { x: cx, y: by }],
  }));
}

// Transform a body-local point through the squash/pitch so hips, strand anchors
// and body art all share one motion.
function bodyPoint(lx, ly, cx, cy) {
  const x = lx * gSx, y = ly * gSy;
  const c = Math.cos(gPitch), s = Math.sin(gPitch);
  return { x: cx + x * c - y * s, y: cy + x * s + y * c };
}

export function updateUnicorn(p, dt) {
  const f = p.face;
  const cx = p.x + p.w / 2, by = p.y + 2;
  const feetY = p.y + p.h, bellyY = by + 4;

  gait += (p.vx * dt) / STRIDE;
  const run = Math.min(1, Math.abs(p.vx) / 120);
  const moveAmt = Math.min(1, Math.abs(p.vx) / 60);
  const ph = gait * TAU;

  const active = p.grounded ? run : 0;
  gBounce = Math.sin(ph) * BOUNCE * active;
  gPitch = Math.sin(ph - 1.2) * PITCH * active * f;
  gSx = 1 + Math.cos(ph) * SQUASH * active;
  gSy = 1 - Math.cos(ph) * SQUASH * 0.6 * active;
  gNod = Math.sin(ph + 0.6) * NOD * active; // head bobs with the stride
  const bcy = by + gBounce;

  // --- Legs: 4-beat gait; mid-swing gathers the hoof under the belly ---------
  for (let i = 0; i < LEGS.length; i++) {
    const l = LEGS[i], s = legState[i];
    const hipX = cx + f * l.hx;
    let tx, ty;
    if (p.grounded) {
      let lp = (gait + l.phase) % 1; if (lp < 0) lp += 1;
      let localX, lift = 0;
      if (lp < DUTY) {                    // stance: planted, drifting backward
        localX = (0.5 - lp / DUTY) * 2 * AMP;
      } else {                            // swing: lift and reach; gather at apex
        const t = (lp - DUTY) / (1 - DUTY);
        localX = (2 * t - 1) * AMP;
        lift = LIFT * Math.sin(Math.PI * t);
      }
      tx = hipX + f * (l.fx + localX * moveAmt);
      ty = feetY - lift * moveAmt;
    } else {                             // airborne: gather legs under the belly
      tx = cx + f * l.fx * 0.4;
      ty = bellyY + 6;
    }
    s.fx += (tx - s.fx) * 0.4;
    s.fy += (ty - s.fy) * 0.4;
  }

  // --- Tail & mane: stiffen out horizontally the faster we go ---------------
  const dragX = -p.vx * dt * 0.5, dragY = -p.vy * dt * 0.25;
  const tDamp = 0.9 + 0.07 * run;
  const tGravY = 0.18 * (1 - 0.85 * run);
  const tBiasX = -f * (0.35 + 0.45 * run);
  const ta = bodyPoint(-f * 11, -4, cx, bcy);
  updateChain(tail, ta.x, ta.y, tDamp, tBiasX + dragX, tGravY + dragY);
  // Mane anchored near the poll, draping mostly DOWN over the neck (little
  // backward lean) so it reads as a full mane lying on the neck, not a streamer.
  const ma = bodyPoint(f * 11, -11, cx, bcy);
  updateChain(mane, ma.x, ma.y, 0.82 + 0.05 * run, -f * (0.1 + 0.22 * run) + dragX * 0.35, 0.36 * (1 - 0.45 * run) + dragY * 0.6);
}

// Silky rainbow strand: rainbow segments, then a white sheen highlight offset
// along the top edge so the mane/tail catch the studio light like silk.
function strand(ctx, chain, width, sheen) {
  const p = chain.pts, n = p.length;
  ctx.lineCap = 'round';
  for (let i = 1; i < n; i++) {
    ctx.strokeStyle = COLORS[Math.min(6, Math.floor((i - 1) / (n - 1) * 7))];
    ctx.lineWidth = width * (1 - (i / n) * 0.5);
    ctx.beginPath();
    ctx.moveTo(p[i - 1].x, p[i - 1].y);
    ctx.lineTo(p[i].x, p[i].y);
    ctx.stroke();
  }
  if (sheen) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    for (let i = 1; i < n; i++) {
      ctx.lineWidth = width * (1 - (i / n) * 0.5) * 0.3;
      ctx.beginPath();
      ctx.moveTo(p[i - 1].x, p[i - 1].y - 0.9);
      ctx.lineTo(p[i].x, p[i].y - 0.9);
      ctx.stroke();
    }
  }
}

// Seed the 3-segment chain along root->foot, bulged to one side so the joints
// fold anatomically (fore: single C-fold; hind: S-shaped stifle/hock), then
// FABRIK it onto the hoof. Draw with a tapered cannon and a small hoof.
function drawLeg(ctx, rootX, rootY, s, l, f, color) {
  const pts = s.pts, tx = s.fx, ty = s.fy, N = 4.5;
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const bulge = l.zig ? Math.sin(TAU * t) : Math.sin(Math.PI * t);
    pts[i].x = rootX + (tx - rootX) * t + f * l.fold * N * bulge;
    pts[i].y = rootY + (ty - rootY) * t;
  }
  fabrik(pts, l.len, rootX, rootY, tx, ty);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const w = [2.7, 1.6, 0.9]; // muscular upper leg tapering to a thin cannon
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = w[i];
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    ctx.stroke();
  }
  // Feathering: a couple of soft fur wisps above the fetlock.
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  const kx = pts[2].x, ky = pts[2].y;
  ctx.beginPath();
  ctx.moveTo(kx, ky); ctx.lineTo(kx - f * 1.4, ky + 2.4);
  ctx.moveTo((kx + tx) / 2, (ky + ty) / 2); ctx.lineTo((kx + tx) / 2 - f * 1.2, (ky + ty) / 2 + 2.2);
  ctx.stroke();
  // Hoof.
  ctx.fillStyle = '#15151b';
  ctx.beginPath();
  ctx.ellipse(tx, ty, 1.7, 1.2, 0, 0, TAU);
  ctx.fill();
}

// --- Shading helpers (all in the body-local frame) -------------------------
// Radial "muscle pocket": a soft light or dark blob to sculpt anatomical form.
function pocket(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
  g.addColorStop(1, 'rgba(' + rgb + ',0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
// Top-lit vertical gradient (caller has already clipped to the shape).
function vgrad(ctx, top, bot, hi, lo) {
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, 'rgba(255,255,255,' + hi + ')');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,' + lo + ')');
  ctx.fillStyle = g; ctx.fillRect(-24, top, 48, bot - top);
}
// Warm rim/back light: stroke the current path, bright along its top edge.
function rim(ctx, top, bot, a) {
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, 'rgba(255,246,225,' + a + ')');
  g.addColorStop(1, 'rgba(255,246,225,0)');
  ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.stroke();
}

// Smooth horse torso path: chest -> withers -> back -> croup -> rump -> belly.
function bodyPath(ctx, f) {
  ctx.beginPath();
  ctx.moveTo(f * 12, -2);
  ctx.quadraticCurveTo(f * 10, -6, f * 6, -6);
  ctx.quadraticCurveTo(0, -7.5, -f * 4, -6.5);
  ctx.quadraticCurveTo(-f * 10, -5.5, -f * 12, -1);
  ctx.quadraticCurveTo(-f * 14.5, 3, -f * 11, 6.5);
  ctx.quadraticCurveTo(-f * 6, 8.5, -f * 1, 7.5);
  ctx.quadraticCurveTo(f * 6, 7, f * 10, 5);
  ctx.quadraticCurveTo(f * 14.5, 2, f * 12, -2);
  ctx.closePath();
}

function drawBody(ctx, f, body) {
  bodyPath(ctx, f);
  ctx.fillStyle = body;
  ctx.fill();
  // Anatomical form: shadow grooves + lit muscle tops (key light front-top).
  ctx.save();
  ctx.clip();
  pocket(ctx, f * 3, 4.5, 8, '0,0,0', 0.3);      // girth / behind the elbow
  pocket(ctx, -f * 5, 3.5, 9, '0,0,0', 0.26);    // flank & stifle groove
  pocket(ctx, -f * 12, 2.5, 6, '0,0,0', 0.32);   // hamstring shadow
  pocket(ctx, f * 1, -1, 5, '0,0,0', 0.12);      // shoulder crease
  pocket(ctx, f * 8, -3, 5.5, '255,250,235', 0.3);   // shoulder highlight
  pocket(ctx, -f * 8, -3.5, 6, '255,250,235', 0.24); // haunch highlight
  pocket(ctx, 0, -4, 7, '255,250,235', 0.14);        // barrel top sheen
  vgrad(ctx, -8, 8, 0.08, 0.26);
  // A hint of fur along the lit back.
  ctx.strokeStyle = 'rgba(255,250,235,0.25)';
  ctx.lineWidth = 0.5;
  for (let i = -10; i <= 8; i += 2) { ctx.beginPath(); ctx.moveTo(f * i, -6.6); ctx.lineTo(f * (i + 0.6), -5); ctx.stroke(); }
  ctx.restore();
  bodyPath(ctx, f); rim(ctx, -8, 2, 0.7);
}

// Neck + head + spiral horn, nodding by `nod`. Local frame.
function drawHead(ctx, f, body, nod) {
  const neck = () => {
    ctx.beginPath();
    ctx.moveTo(f * 4, -4);
    ctx.lineTo(f * 9, -10 + nod * 0.5);
    ctx.lineTo(f * 14, -14 + nod);
    ctx.lineTo(f * 16, -11 + nod);
    ctx.lineTo(f * 10, -3);
    ctx.lineTo(f * 6, 0);
    ctx.closePath();
  };
  neck(); ctx.fillStyle = body; ctx.fill();
  ctx.save(); neck(); ctx.clip();
  pocket(ctx, f * 8, -4, 5, '0,0,0', 0.24);         // jugular groove
  pocket(ctx, f * 10, -11 + nod, 4, '255,250,235', 0.26); // crest highlight
  vgrad(ctx, -14 + nod, 1, 0.12, 0.24);
  ctx.restore();
  neck(); rim(ctx, -14 + nod, -4, 0.6);

  // Head.
  const hx = f * 15, hy = -12 + nod;
  const head = () => {
    ctx.beginPath();
    ctx.moveTo(hx - f * 1.5, hy - 2.5);
    ctx.lineTo(hx + f * 5, hy - 0.5);
    ctx.lineTo(hx + f * 8.5, hy + 2);
    ctx.lineTo(hx + f * 8, hy + 4);
    ctx.lineTo(hx + f * 5.5, hy + 4.8);
    ctx.lineTo(hx + f * 2, hy + 4.5);
    ctx.lineTo(hx - f * 1.5, hy + 1.5);
    ctx.closePath();
  };
  head(); ctx.fillStyle = body; ctx.fill();
  ctx.save(); head(); ctx.clip();
  pocket(ctx, hx + f * 3, hy + 3.5, 5, '0,0,0', 0.24);   // jaw shadow
  pocket(ctx, hx + f * 4, hy - 0.5, 4, '255,250,235', 0.22); // nose bridge light
  vgrad(ctx, hy - 3, hy + 5, 0.1, 0.18);
  ctx.restore();
  head(); rim(ctx, hy - 3, hy + 1, 0.55);

  // Ear.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(hx - f * 1, hy - 1);
  ctx.lineTo(hx - f * 2, hy - 5);
  ctx.lineTo(hx + f * 0.5, hy - 2);
  ctx.closePath();
  ctx.fill();

  drawHorn(ctx, hx, hy, f);

  // Eye with a catchlight.
  ctx.fillStyle = '#15151b';
  ctx.beginPath(); ctx.arc(hx + f * 2, hy + 1, 1, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.arc(hx + f * 2.4, hy + 0.6, 0.32, 0, TAU); ctx.fill();
}

// Ivory horn with a spiral ridge pattern and a lit edge.
function drawHorn(ctx, hx, hy, f) {
  const bx = hx + f * 1.5, by0 = hy - 2, tx = hx + f * 8, ty = hy - 12, bw = 2.2;
  const g = ctx.createLinearGradient(bx, by0, tx, ty);
  g.addColorStop(0, '#cdbd93');
  g.addColorStop(1, '#fbf4dd');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(bx - f * bw, by0);
  ctx.lineTo(tx, ty);
  ctx.lineTo(bx + f * bw, by0);
  ctx.closePath();
  ctx.fill();
  // Spiral ridges: short diagonals crossing the taper.
  ctx.strokeStyle = 'rgba(120,100,60,0.5)';
  ctx.lineWidth = 0.7; ctx.lineCap = 'round';
  for (let i = 1; i <= 4; i++) {
    const t = i / 5, cxp = bx + (tx - bx) * t, cyp = by0 + (ty - by0) * t, wv = bw * (1 - t) + 0.3;
    ctx.beginPath();
    ctx.moveTo(cxp - f * wv, cyp + 0.7);
    ctx.lineTo(cxp + f * wv, cyp - 0.7);
    ctx.stroke();
  }
  // Lit edge.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(bx + f * bw * 0.5, by0); ctx.lineTo(tx, ty); ctx.stroke();
}

export function drawUnicorn(ctx, p, ix, iy) {
  const f = p.face;
  const cx = p.x + p.w / 2, by = p.y + 2;
  const bcy = by + gBounce;
  const body = COLORS[p.el];

  ctx.save();
  ctx.translate(ix - p.x, iy - p.y);

  // Gravity flip: mirror the whole rig vertically about the body's centre.
  if (p.gflip < 0) {
    const cyc = p.y + p.h / 2;
    ctx.translate(0, 2 * cyc);
    ctx.scale(1, -1);
  }

  // Soft contact shadow under the hooves, grounding the unicorn.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, p.y + p.h, 12, 2.2, 0, 0, TAU);
  ctx.fill();

  strand(ctx, tail, 3, 1);

  const hip = (i) => bodyPoint(f * LEGS[i].hx, LEGS[i].hy, cx, bcy);
  const darker = '#3a3a44';

  // Far legs behind the barrel.
  for (let i = 0; i < LEGS.length; i++)
    if (LEGS[i].far) { const h = hip(i); drawLeg(ctx, h.x, h.y, legState[i], LEGS[i], f, darker); }

  ctx.save();
  ctx.translate(cx, bcy); ctx.rotate(gPitch); ctx.scale(gSx, gSy);
  drawBody(ctx, f, body);
  ctx.restore();

  // Near legs in front of the barrel.
  for (let i = 0; i < LEGS.length; i++)
    if (!LEGS[i].far) { const h = hip(i); drawLeg(ctx, h.x, h.y, legState[i], LEGS[i], f, body); }

  ctx.save();
  ctx.translate(cx, bcy); ctx.rotate(gPitch); ctx.scale(gSx, gSy);
  drawHead(ctx, f, body, gNod);
  ctx.restore();

  strand(ctx, mane, 5.5, 1);

  ctx.restore();
}
