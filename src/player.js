// Player body + precision-platformer movement. Units are logical px per second;
// the loop steps this at a fixed dt (1/60s). Timers are counted in frames since
// the spec calls out "coyote time (6 frames)".
import { input, JUMP, SKILL, SWAP } from './input.js';
import { moveX, moveY } from './physics.js';

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
  };
}

export function updatePlayer(p, dt, solids) {
  // --- Element swap (0.1s lock) -------------------------------------------
  if (p.swapLock > 0) p.swapLock--;
  if (input.pressed(SWAP) && p.swapLock === 0) {
    p.el = (p.el + 1) % 7;
    p.swapLock = SWAP_DELAY;
  }
  if (input.pressed(SKILL)) p.glow = 12;
  if (p.glow > 0) p.glow--;

  // --- Jump timers ---------------------------------------------------------
  // Buffer remembers a press; coyote remembers recent ground contact.
  p.buffer = input.pressed(JUMP) ? BUFFER : Math.max(0, p.buffer - 1);
  p.coyote = p.grounded ? COYOTE : Math.max(0, p.coyote - 1);

  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -JUMP_VEL;
    p.buffer = 0;
    p.coyote = 0;
    p.grounded = false;
  }
  // Variable height: releasing while still rising cuts the ascent.
  if (input.released(JUMP) && p.vy < 0) p.vy *= JUMP_CUT;

  // --- Horizontal ----------------------------------------------------------
  const ax = input.axis();
  if (ax) p.face = ax;
  const target = ax * RUN;
  if (ax) {
    const a = (p.grounded ? GND_ACCEL : AIR_ACCEL) * dt;
    p.vx += Math.max(-a, Math.min(a, target - p.vx));
  } else {
    const f = (p.grounded ? GND_FRICTION : AIR_FRICTION) * dt;
    p.vx = p.vx > 0 ? Math.max(0, p.vx - f) : Math.min(0, p.vx + f);
  }

  // --- Gravity -------------------------------------------------------------
  p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);

  // --- Integrate + collide (X then Y) --------------------------------------
  if (moveX(p, p.vx * dt, solids)) p.vx = 0;
  const vhit = moveY(p, p.vy * dt, solids);
  p.grounded = vhit > 0;
  if (vhit !== 0) p.vy = 0; // floor or ceiling stops vertical motion

  input.clear();
}
