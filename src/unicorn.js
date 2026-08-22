// Procedurally-animated unicorn. No sprites: the body is minimal geometry
// (ellipses + paths), the tail and mane are Verlet chains that trail with
// momentum, and the four legs are driven by two-bone IK against foot targets
// from a distance-based gait so they plant without sliding.
//
// At speed it shifts into a proper GALLOP: the body see-saws (vertical bounce +
// fore/aft pitch), the spine squashes & stretches, the four legs fire in a
// 4-beat rhythm with a high swing arc, and the tail/mane stiffen out
// horizontally. Everything keys off the player body (position, velocity, facing,
// grounded, element) and eases back to a calm idle as speed drops to zero.
import { COLORS } from './palette.js';
import { makeChain, updateChain } from './chain.js';
import { solve2 } from './ik.js';

const TAU = Math.PI * 2;
const AMP = 7;      // half-stride reach, local px
const LIFT = 9;     // swing-arc height (raised ~1.8x for a bold gallop step)
const DUTY = 0.4;   // fraction of a leg's cycle spent planted (stance)
const STRIDE = 22;  // world px travelled per full gait cycle
const L1 = 4.5, L2 = 5.5; // thigh / shin bone lengths

// Gallop body dynamics (scaled by how fast we're running).
const BOUNCE = 3.5; // vertical see-saw amplitude, px
const PITCH = 0.16; // fore/aft pitch amplitude, radians
const SQUASH = 0.12; // spine squash & stretch fraction

// Per-leg config: hip offset (facing space), neutral foot offset, gait phase,
// IK bend side, far/near (depth). Phases form a 4-beat gallop: the hind pair
// lands first (0.0, 0.1), then the fore pair (0.4, 0.5).
const LEGS = [
  { hipDX: -7, baseFX: -2, phase: 0.1, bend: 1, far: true },  // hind far
  { hipDX: 6, baseFX: 2, phase: 0.5, bend: -1, far: true },   // fore far
  { hipDX: -7, baseFX: -3, phase: 0.0, bend: 1, far: false },  // hind near
  { hipDX: 6, baseFX: 3, phase: 0.4, bend: -1, far: false },   // fore near
];

let tail, mane, gait, legState, knee = { x: 0, y: 0 };
// Body-transform state, refreshed each update and reused by the renderer.
let gBounce = 0, gPitch = 0, gSx = 1, gSy = 1;

export function initUnicorn(p) {
  const cx = p.x + p.w / 2, by = p.y + 6;
  tail = makeChain(7, 3, cx, by);
  // Mane is a short, stiff tuft that rides the neck crest (not a second tail).
  mane = makeChain(4, 2.2, cx, by);
  gait = 0;
  legState = LEGS.map(() => ({ fx: cx, fy: p.y + p.h }));
}

// Transform a body-local point (relative to barrel centre) through the current
// squash/pitch so hips, strand anchors, and body art all share one motion.
function bodyPoint(lx, ly, cx, cy) {
  const x = lx * gSx, y = ly * gSy;
  const c = Math.cos(gPitch), s = Math.sin(gPitch);
  return { x: cx + x * c - y * s, y: cy + x * s + y * c };
}

export function updateUnicorn(p, dt) {
  const f = p.face;
  const cx = p.x + p.w / 2, by = p.y + 6;
  const feetY = p.y + p.h, hipY = by + 3;

  // Advance the gait by distance travelled so hooves never skate.
  gait += (p.vx * dt) / STRIDE;
  const run = Math.min(1, Math.abs(p.vx) / 120); // 0..1 gallop intensity
  const moveAmt = Math.min(1, Math.abs(p.vx) / 60);
  const ph = gait * TAU;

  // --- Body see-saw: bounce + pitch + squash/stretch (grounded gallop) ------
  const active = p.grounded ? run : 0;
  gBounce = Math.sin(ph) * BOUNCE * active;              // up/down once per stride
  gPitch = Math.sin(ph - 1.2) * PITCH * active * f;      // shoulder/pelvis see-saw
  gSx = 1 + Math.cos(ph) * SQUASH * active;              // stretch long when reaching
  gSy = 1 - Math.cos(ph) * SQUASH * 0.6 * active;        // ...and squash the height
  const bcy = by + gBounce;

  // --- Legs: 4-beat gait with a high swing arc -----------------------------
  for (let i = 0; i < LEGS.length; i++) {
    const l = LEGS[i], s = legState[i];
    const hipX = cx + f * l.hipDX;
    let tx, ty;
    if (p.grounded) {
      let lp = (gait + l.phase) % 1; if (lp < 0) lp += 1;
      let localX, lift = 0;
      if (lp < DUTY) {                    // stance: planted, drifting backward
        localX = (0.5 - lp / DUTY) * 2 * AMP;
      } else {                            // swing: lift high and reach forward
        const t = (lp - DUTY) / (1 - DUTY);
        localX = (2 * t - 1) * AMP;
        lift = LIFT * Math.sin(Math.PI * t);
      }
      tx = hipX + f * (l.baseFX + localX * moveAmt);
      ty = feetY - lift * moveAmt;
    } else {                             // airborne: tuck the legs up
      tx = hipX + f * (l.baseFX * 0.5 + 2);
      ty = hipY + 7;
    }
    s.fx += (tx - s.fx) * 0.4;
    s.fy += (ty - s.fy) * 0.4;
  }

  // --- Tail & mane: stiffen out horizontally the faster we go ---------------
  const dragX = -p.vx * dt * 0.5, dragY = -p.vy * dt * 0.25;
  const tDamp = 0.9 + 0.07 * run;          // more inertia at speed
  const tGravY = 0.18 * (1 - 0.85 * run);  // gravity fades as it streams flat
  const tBiasX = -f * (0.35 + 0.45 * run); // stronger backward pull at speed
  const ta = bodyPoint(-f * 10, -3, cx, bcy);
  updateChain(tail, ta.x, ta.y, tDamp, tBiasX + dragX, tGravY + dragY);
  const ma = bodyPoint(f * 12, -8, cx, bcy);
  updateChain(mane, ma.x, ma.y, 0.8 + 0.05 * run, -f * (0.16 + 0.2 * run) + dragX * 0.35, 0.28 * (1 - 0.7 * run) + dragY * 0.7);
}

function strand(ctx, chain, width) {
  const p = chain.pts, n = p.length;
  ctx.lineCap = 'round';
  for (let i = 1; i < n; i++) {
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
  const cx = p.x + p.w / 2, by = p.y + 6;
  const bcy = by + gBounce;
  const body = COLORS[p.el];
  const dark = '#0e0e12';

  ctx.save();
  ctx.translate(ix - p.x, iy - p.y); // apply render interpolation to the whole rig

  // Gravity flip: mirror the whole rig vertically about the body's centre so it
  // stands on the ceiling. The gait/IK still compute in a gravity-down frame;
  // this transform presents them the right way up.
  if (p.gflip < 0) {
    const cyc = p.y + p.h / 2;
    ctx.translate(0, 2 * cyc);
    ctx.scale(1, -1);
  }

  // Tail behind everything.
  strand(ctx, tail, 3);

  // Hips ride the body transform so IK legs stretch/compress with the gallop.
  const hip = (i) => bodyPoint(f * LEGS[i].hipDX, 3, cx, bcy);

  // Far legs (darker, behind the barrel).
  for (let i = 0; i < LEGS.length; i++)
    if (LEGS[i].far) { const h = hip(i); leg(ctx, h.x, h.y, legState[i], LEGS[i].bend, '#3a3a44'); }

  // Barrel (its own transformed group).
  ctx.save();
  ctx.translate(cx, bcy); ctx.rotate(gPitch); ctx.scale(gSx, gSy);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 6, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Near legs (in front of the barrel).
  for (let i = 0; i < LEGS.length; i++)
    if (!LEGS[i].far) { const h = hip(i); leg(ctx, h.x, h.y, legState[i], LEGS[i].bend, body); }

  // Neck + head + horn, sharing the same body transform (local coords).
  ctx.save();
  ctx.translate(cx, bcy); ctx.rotate(gPitch); ctx.scale(gSx, gSy);
  ctx.fillStyle = body;
  // Neck (shoulder -> head base).
  ctx.beginPath();
  ctx.moveTo(f * 6, -3);
  ctx.lineTo(f * 11, -6);
  ctx.lineTo(f * 15, -7);
  ctx.lineTo(f * 12, -5);
  ctx.lineTo(f * 6, 1);
  ctx.closePath();
  ctx.fill();
  // Head.
  const hx = f * 14, hy = -8;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 4.5, 3.2, f * 0.3, 0, TAU);
  ctx.fill();
  // Muzzle.
  ctx.beginPath();
  ctx.ellipse(hx + f * 3.5, hy + 1.5, 2.2, 1.8, 0, 0, TAU);
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
  ctx.arc(hx + f * 1.5, hy - 0.3, 0.9, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Mane rides the neck crest, drawn last so it sits on top.
  strand(ctx, mane, 3.8);

  ctx.restore();
}
