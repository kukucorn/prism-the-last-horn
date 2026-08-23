// Player body + precision-platformer movement. Units are logical px per second;
// the loop steps this at a fixed dt (1/60s). Timers are counted in frames since
// the spec calls out "coyote time (6 frames)".
import { input, JUMP, SKILL, SWAP } from './input.js';
import { moveX, moveY, overlap } from './physics.js';
import { RED, ORANGE, YELLOW, GREEN, BLUE, INDIGO, VIOLET } from './palette.js';
import { snd, S_JUMP, S_LAND, S_DASH, S_SLAM, S_BLINK, S_SWAP, S_DJUMP, S_GRAV } from './sfx.js';

// Tuning.
const GRAVITY = 1400;
const MAX_FALL = 540;
const RUN = 150;            // top horizontal speed
const GND_ACCEL = 1600;    // toward target speed on the ground
const AIR_ACCEL = 900;     // ...in the air (less control)
const GND_FRICTION = 1800; // decel when no input, grounded
const AIR_FRICTION = 300;  // ...in the air (keep momentum)
const JUMP_VEL = 360;      // launch velocity
const JUMP_CUT = 0.45;     // release mid-rise -> keep this fraction of vy
const COYOTE = 6;          // frames you can still jump after leaving a ledge
const BUFFER = 6;          // frames a jump press is remembered before landing
const SWAP_DELAY = 6;      // ~0.1s element-swap lock

// Fire (Red) dash.
const DASH_SPEED = 360;    // px/s burst forward
const DASH_DUR = 12;       // frames of dash
const DASH_CD = 30;        // frames of cooldown after it ends

// Earth (Orange) slam.
const SLAM_SPEED = 720;    // px/s straight down
const SHOCK_R = 30;        // shockwave rock-shatter radius
const SHOCK_DUR = 16;      // frames the shockwave ring animates
const EARTH_CD = 20;       // cooldown after a slam lands

// Light (Yellow) blink.
const BLINK_DIST = 64;     // px teleported forward
const BLINK_DUR = 10;      // frames the light streak lingers
const LIGHT_CD = 40;       // cooldown

// Nature (Green) double jump + glide.
const GLIDE_FALL = 120;    // capped fall speed while gliding
const DJ_DUR = 12;         // frames the double-jump ring animates

// Water (Blue) buoyant float.
const FLOAT_GRAV = 0.2;    // fraction of gravity that still applies
const FLOAT_LIFT = 560;    // upward buoyancy accel, px/s^2 (net ~ -280 = rises)
const FLOAT_RISE = 140;    // capped upward drift speed

// Gravity (Violet) flip.
const GRAV_CD = 10;        // cooldown so you can't strobe the flip

export function makePlayer(x, y) {
  return {
    x, y, w: 12, h: 16,
    vx: 0, vy: 0,
    grounded: false,
    coyote: 0,
    buffer: 0,
    el: 0,          // current element index (0..6)
    swapLock: 0,
    face: 1,
    glow: 0,        // brief feedback on skill press
    dashT: 0,       // remaining dash frames
    cd: 0,          // skill cooldown frames
    inv: 0,         // invincibility frames (no hazard death)
    slam: false,    // Earth slam in progress
    shockT: 0,      // shockwave ring animation frames
    blinkT: 0,      // light-streak animation frames
    bx0: 0, by0: 0, // blink origin (for the streak)
    doubleUsed: false, // Nature double jump spent this airtime
    gliding: false, // currently gliding
    djT: 0,         // double-jump ring animation frames
    floating: false, // Water buoyant float active
    gflip: 1,       // gravity direction: +1 down, -1 up (Violet flips it)
    flipT: 0,       // gravity-flip flash frames
  };
}

// `rocks` are breakable; normal movement collides with them, but an Earth slam
// plows through and shatters them.
export function updatePlayer(p, dt, solids, hazards, rocks) {
  const world = rocks && rocks.length ? solids.concat(rocks) : solids;
  // --- Element swap (0.1s lock) -------------------------------------------
  if (p.swapLock > 0) p.swapLock--;
  if (input.pressed(SWAP) && p.swapLock === 0) {
    p.el = (p.el + 1) % 7;
    p.swapLock = SWAP_DELAY;
    snd(S_SWAP);
  }
  if (p.glow > 0) p.glow--;
  if (p.cd > 0) p.cd--;
  if (p.shockT > 0) p.shockT--;
  if (p.blinkT > 0) p.blinkT--;
  if (p.djT > 0) p.djT--;
  if (p.flipT > 0) p.flipT--;

  // --- Skill activation ----------------------------------------------------
  if (input.pressed(SKILL) && p.cd === 0 && p.dashT === 0 && !p.slam) {
    p.glow = 12;
    if (p.el === RED) { p.dashT = DASH_DUR; p.inv = DASH_DUR; snd(S_DASH); } // Fire dash
    else if (p.el === VIOLET) {                                   // Gravity flip
      p.gflip = -p.gflip; p.vy = 0; p.grounded = false; p.cd = GRAV_CD; p.flipT = 12;
      snd(S_GRAV);
    }
    else if (p.el === ORANGE && !p.grounded) { p.slam = true; snd(S_DASH); } // Earth slam (air only)
    else if (p.el === GREEN && !p.grounded && !p.doubleUsed) {    // Nature double jump
      p.vy = -JUMP_VEL; p.doubleUsed = true; p.djT = DJ_DUR; snd(S_DJUMP);
    }
    else if (p.el === YELLOW) {                                   // Light blink
      // Teleport forward, checking only the endpoint (so thin walls are
      // passed through). Land at the farthest free spot within reach.
      for (let d = BLINK_DIST; d >= 0; d -= 2) {
        const box = { x: p.x + p.face * d, y: p.y, w: p.w, h: p.h };
        if (!world.some((s) => overlap(box, s))) {
          p.bx0 = p.x; p.by0 = p.y; p.blinkT = BLINK_DUR;
          p.x = box.x; p.cd = LIGHT_CD; snd(S_BLINK);
          break;
        }
      }
    }
  }

  // --- Fire dash (overrides normal movement while active) ------------------
  if (p.dashT > 0) {
    p.vy = 0;
    const hit = moveX(p, p.face * DASH_SPEED * dt, world);
    // Burn through any spikes we pass over.
    if (hazards) for (let i = hazards.length - 1; i >= 0; i--)
      if (overlap(p, hazards[i])) hazards.splice(i, 1);
    p.vx = p.face * DASH_SPEED;
    p.dashT--;
    if (p.inv > 0) p.inv--;
    if (hit || p.dashT === 0) { p.dashT = 0; p.inv = 0; p.cd = DASH_CD; }
    input.clear();
    return;
  }
  if (p.inv > 0) p.inv--;

  // --- Earth slam (overrides normal movement while active) -----------------
  if (p.slam) {
    p.vx = 0;
    p.vy = SLAM_SPEED * p.gflip; // slam toward gravity
    // Smash any rocks we plow through on the way.
    if (rocks) for (let i = rocks.length - 1; i >= 0; i--)
      if (overlap(p, rocks[i])) rocks.splice(i, 1);
    const vhit = moveY(p, p.vy * dt, solids); // stop only on permanent ground
    if (vhit === p.gflip) { // landed on a surface in the gravity direction
      // Impact shockwave: shatter every rock within radius of the feet.
      const cx = p.x + p.w / 2, cy = p.gflip > 0 ? p.y + p.h : p.y;
      if (rocks) for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        if (Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy) <= SHOCK_R) rocks.splice(i, 1);
      }
      p.slam = false; p.vy = 0; p.grounded = true; p.shockT = SHOCK_DUR; p.cd = EARTH_CD;
      snd(S_SLAM);
    }
    input.clear();
    return;
  }

  const wasGrounded = p.grounded; // for landing-sound edge detection

  // --- Jump timers ---------------------------------------------------------
  // Buffer remembers a press; coyote remembers recent ground contact.
  p.buffer = input.pressed(JUMP) ? BUFFER : Math.max(0, p.buffer - 1);
  p.coyote = p.grounded ? COYOTE : Math.max(0, p.coyote - 1);

  if (p.buffer > 0 && p.coyote > 0) {
    snd(S_JUMP);
    p.vy = -JUMP_VEL * p.gflip; // launch opposite gravity
    p.buffer = 0;
    p.coyote = 0;
    p.grounded = false;
  }
  // Variable height: releasing while still rising (moving against gravity) cuts it.
  if (input.released(JUMP) && p.vy * p.gflip < 0) p.vy *= JUMP_CUT;

  // --- Horizontal ----------------------------------------------------------
  const ax = input.axis();
  if (ax) p.face = ax;
  const target = ax * RUN;
  if (ax) {
    const a = (p.grounded ? GND_ACCEL : AIR_ACCEL) * dt;
    p.vx += Math.max(-a, Math.min(a, target - p.vx));
  } else {
    // Ice: zero ground friction, so the unicorn keeps its momentum and slides.
    const base = p.el === INDIGO && p.grounded ? 0 : (p.grounded ? GND_FRICTION : AIR_FRICTION);
    const f = base * dt;
    p.vx = p.vx > 0 ? Math.max(0, p.vx - f) : Math.min(0, p.vx + f);
  }

  // --- Gravity (direction = p.gflip) ---------------------------------------
  const g = p.gflip;
  // Water buoyancy: holding the skill in the air swaps full gravity for a weak
  // one plus a lift opposite gravity, so the unicorn drifts away from the floor.
  p.floating = p.el === BLUE && input.down(SKILL) && !p.grounded;
  if (p.floating) {
    p.vy += (GRAVITY * FLOAT_GRAV - FLOAT_LIFT) * g * dt;
    // Cap the drift speed opposite gravity; full fall speed toward it.
    p.vy = g > 0 ? Math.max(-FLOAT_RISE, Math.min(MAX_FALL, p.vy))
                 : Math.min(FLOAT_RISE, Math.max(-MAX_FALL, p.vy));
  } else {
    p.vy += GRAVITY * g * dt;
    p.vy = Math.max(-MAX_FALL, Math.min(MAX_FALL, p.vy));
  }

  // Nature glide: holding the skill while falling (with gravity) caps the descent.
  p.gliding = p.el === GREEN && input.down(SKILL) && !p.grounded && p.vy * g > 0;
  if (p.gliding) p.vy = g > 0 ? Math.min(p.vy, GLIDE_FALL) : Math.max(p.vy, -GLIDE_FALL);

  // --- Integrate + collide (X then Y) --------------------------------------
  if (moveX(p, p.vx * dt, world)) p.vx = 0;
  const vhit = moveY(p, p.vy * dt, world);
  p.grounded = vhit === g; // grounded only when we hit a surface in the gravity direction
  if (vhit !== 0) p.vy = 0; // floor or ceiling stops vertical motion
  if (p.grounded) {
    p.doubleUsed = false; // recharge the double jump on landing
    if (!wasGrounded) snd(S_LAND);
  }

  input.clear();
}
