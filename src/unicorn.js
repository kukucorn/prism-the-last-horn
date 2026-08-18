// Procedurally-animated unicorn. No sprites: the body is minimal geometry
// (ellipses + paths), the tail and mane are Verlet chains that trail with
// momentum, and the four legs are driven by two-bone IK against foot targets
// from a distance-based gait so they plant without sliding. Everything keys off
// the player physics body (position, velocity, facing, grounded, element).
import { COLORS } from './palette.js';
import { makeChain, updateChain } from './chain.js';
import { solve2 } from './ik.js';

const AMP = 6;      // half-stride, in local px
const LIFT = 5;     // how high a swinging hoof rises
const STRIDE = 22;  // world px travelled per full gait cycle
const L1 = 4.5, L2 = 5.5; // thigh / shin bone lengths

// Per-leg config: hip offset (facing space), neutral foot offset, gait phase,
// IK bend side, and whether it's a far (background) leg.
const LEGS = [
  { hipDX: 6, baseFX: 2, phase: 0.5, bend: -1, far: true },   // front far
  { hipDX: -7, baseFX: -2, phase: 0.0, bend: 1, far: true },  // rear far
  { hipDX: 6, baseFX: 3, phase: 0.0, bend: -1, far: false },  // front near
  { hipDX: -7, baseFX: -3, phase: 0.5, bend: 1, far: false }, // rear near
];

let tail, mane, gait, legState, knee = { x: 0, y: 0 };

export function initUnicorn(p) {
  const cx = p.x + p.w / 2, by = p.y + 6;
  tail = makeChain(7, 3, cx, by);
  // Mane is a short, stiff tuft that rides the neck crest (not a second tail).
  mane = makeChain(4, 2.2, cx, by);
  gait = 0;
  legState = LEGS.map((l) => ({ fx: cx, fy: p.y + p.h }));
}

export function updateUnicorn(p, dt) {
  const f = p.face;
  const cx = p.x + p.w / 2, by = p.y + 6;
  const feetY = p.y + p.h, hipY = by + 3;

  // Advance the gait by distance travelled so hooves never skate.
  gait += (p.vx * dt) / STRIDE;
  const moveAmt = Math.min(1, Math.abs(p.vx) / 60);

  for (let i = 0; i < LEGS.length; i++) {
    const l = LEGS[i], s = legState[i];
    const hipX = cx + f * l.hipDX;
    let tx, ty;
    if (p.grounded) {
      let ph = (gait + l.phase) % 1; if (ph < 0) ph += 1;
      let localX, lift = 0;
      if (ph < 0.5) {                    // stance: plant, drift backward
        localX = (0.5 - ph) * 2 * AMP;
      } else {                           // swing: lift and reach forward
        const t = (ph - 0.5) * 2;
        localX = (2 * t - 1) * AMP;
        lift = LIFT * Math.sin(Math.PI * t);
      }
      tx = hipX + f * (l.baseFX + localX * moveAmt);
      ty = feetY - lift * moveAmt;
    } else {                             // airborne: tuck the legs up
      tx = hipX + f * (l.baseFX * 0.5 + 2);
      ty = hipY + 7;
    }
    // Smooth the foot toward its target (eases the airborne transition).
    s.fx += (tx - s.fx) * 0.4;
    s.fy += (ty - s.fy) * 0.4;
  }

  // Tail & mane: a directional rest bias plus the body's velocity so the
  // strands lag and whip during motion.
  const dragX = -p.vx * dt * 0.5, dragY = -p.vy * dt * 0.25;
  // Tail off the rump, streaming back and down.
  updateChain(tail, cx - f * 10, by - 3, 0.9, -f * 0.35 + dragX, 0.18 + dragY);
  // Mane off the poll: mostly droops onto the neck crest with only a light
  // backward lean and half the whip, so it reads as a mane, not a tail.
  updateChain(mane, cx + f * 12, by - 8, 0.8, -f * 0.16 + dragX * 0.35, 0.28 + dragY * 0.7);
}

function strand(ctx, chain, width) {
  const p = chain.pts, n = p.length;
  ctx.lineCap = 'round';
  for (let i = 1; i < n; i++) {
    // Rainbow from root (red) to tip (violet).
    ctx.strokeStyle = COLORS[Math.min(6, Math.floor((i - 1) / (n - 1) * 7))];
    ctx.lineWidth = width * (1 - (i / n) * 0.6);
    ctx.beginPath();
    ctx.moveTo(p[i - 1].x, p[i - 1].y);
    ctx.lineTo(p[i].x, p[i].y);
    ctx.stroke();
  }
}

function leg(ctx, hipX, hipY, s, bend, color) {
  solve2(hipX, hipY, s.fx, s.fy, L1, L2, bend, knee);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(knee.x, knee.y);
  ctx.lineTo(s.fx, s.fy);
  ctx.stroke();
}

export function drawUnicorn(ctx, p, ix, iy) {
  const f = p.face;
  const cx = p.x + p.w / 2, by = p.y + 6, hipY = by + 3;
  const body = COLORS[p.el];
  const dark = '#0e0e12';

  ctx.save();
  ctx.translate(ix - p.x, iy - p.y); // apply render interpolation to the whole rig

  // Tail behind everything.
  strand(ctx, tail, 3);

  // Far legs (darker, drawn behind the barrel).
  for (let i = 0; i < LEGS.length; i++)
    if (LEGS[i].far) leg(ctx, cx + f * LEGS[i].hipDX, hipY, legState[i], LEGS[i].bend, '#3a3a44');

  // Barrel.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(cx, by, 11, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Near legs.
  for (let i = 0; i < LEGS.length; i++)
    if (!LEGS[i].far) leg(ctx, cx + f * LEGS[i].hipDX, hipY, legState[i], LEGS[i].bend, body);

  // Neck (shoulder -> head base).
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(cx + f * 6, by - 3);
  ctx.lineTo(cx + f * 11, by - 6);
  ctx.lineTo(cx + f * 15, p.y - 1);
  ctx.lineTo(cx + f * 12, p.y + 1);
  ctx.lineTo(cx + f * 6, by + 1);
  ctx.closePath();
  ctx.fill();

  // Mane down the neck.
  strand(ctx, mane, 3.8);

  // Head.
  const hx = cx + f * 14, hy = p.y - 2;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 4.5, 3.2, f * 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Muzzle.
  ctx.beginPath();
  ctx.ellipse(hx + f * 3.5, hy + 1.5, 2.2, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ear.
  ctx.beginPath();
  ctx.moveTo(hx - f * 2, hy - 3);
  ctx.lineTo(hx - f * 0.5, hy - 6.5);
  ctx.lineTo(hx + f * 1, hy - 3);
  ctx.closePath();
  ctx.fill();

  // Horn — the last horn.
  ctx.fillStyle = '#f2f2f2';
  ctx.beginPath();
  ctx.moveTo(hx + f * 2, hy - 3);
  ctx.lineTo(hx + f * 9, hy - 11);
  ctx.lineTo(hx + f * 4, hy - 2.5);
  ctx.closePath();
  ctx.fill();

  // Eye.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(hx + f * 1.5, hy - 0.3, 0.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
