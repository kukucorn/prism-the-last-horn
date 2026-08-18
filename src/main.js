// PRISM — The Last Horn.  Day 1: boilerplate + fixed-timestep Canvas loop.
//
// Everything runs on a logical WIDTH x HEIGHT coordinate space, scaled to fit
// the window with letterboxing. Simulation advances in fixed 1/60s steps with
// an accumulator so physics stays deterministic regardless of display refresh
// rate; rendering interpolates between the last two states for smoothness.
import { input, JUMP, SKILL, SWAP } from './input.js';
import { COLORS, NAMES } from './palette.js';

const WIDTH = 480, HEIGHT = 270;
const STEP = 1 / 60;            // fixed sim step in seconds
const MAX_FRAME = 0.25;        // clamp huge dt (tab was backgrounded)

const canvas = document.getElementById('g');
const ctx = canvas.getContext('2d');
let scale = 1, offX = 0, offY = 0;

// Fit the logical viewport into the window, preserving aspect ratio. We render
// at device-pixel resolution and apply a transform so game code stays in
// logical units and vector art stays crisp at any zoom.
function resize() {
  const dpr = devicePixelRatio || 1;
  const w = innerWidth, h = innerHeight;
  scale = Math.min(w / WIDTH, h / HEIGHT);
  const vw = WIDTH * scale, vh = HEIGHT * scale;
  offX = (w - vw) / 2;
  offY = (h - vh) / 2;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

// ---- Day 1 placeholder state ------------------------------------------------
// A single element-colored marker the player can nudge left/right, hop, and
// recolor by swapping elements — just enough to prove loop + input + render.
// Real physics, IK unicorn, and tilemap arrive Day 2+.
const st = {
  x: WIDTH / 2, y: HEIGHT - 60, vx: 0, vy: 0,
  el: 0,             // current element index (0..6)
  swapLock: 0,       // ticks remaining on the 0.1s swap delay
  face: 1,
  glow: 0,           // decays after a skill press, for visual feedback
};
let prevState = { x: st.x, y: st.y };

const GROUND_Y = HEIGHT - 40;
const GRAVITY = 900;          // logical units / s^2 (placeholder)
const MOVE = 140;             // horizontal speed, units / s
const HOP = 320;             // placeholder hop launch velocity, units / s
const SWAP_DELAY = 6;         // ~0.1s at 60Hz

function update() {
  prevState.x = st.x;
  prevState.y = st.y;

  // Element swap on rising edge, respecting the 0.1s lock.
  if (st.swapLock > 0) st.swapLock--;
  if (input.pressed(SWAP) && st.swapLock === 0) {
    st.el = (st.el + 1) % 7;
    st.swapLock = SWAP_DELAY;
  }

  // Horizontal movement.
  const ax = input.axis();
  if (ax) st.face = ax;
  st.vx = ax * MOVE;
  st.x += st.vx * STEP;
  st.x = Math.max(12, Math.min(WIDTH - 12, st.x));

  // Placeholder gravity + ground so a hop reads as a hop. vy is units/s.
  const grounded = st.y >= GROUND_Y - 0.001 && st.vy >= 0;
  if (input.pressed(JUMP) && grounded) st.vy = -HOP;
  st.vy += GRAVITY * STEP;
  st.y += st.vy * STEP;
  if (st.y >= GROUND_Y) { st.y = GROUND_Y; st.vy = 0; }

  // Skill press -> brief glow (element logic lands in Phase 2).
  if (input.pressed(SKILL)) st.glow = 12;
  if (st.glow > 0) st.glow--;

  input.clear(); // consume this tick's press/release edges
}

function render(alpha) {
  // Clear in logical space.
  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Ground line.
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 12);
  ctx.lineTo(WIDTH, GROUND_Y + 12);
  ctx.stroke();

  // Interpolated marker position.
  const x = prevState.x + (st.x - prevState.x) * alpha;
  const y = prevState.y + (st.y - prevState.y) * alpha;
  const color = COLORS[st.el];

  if (st.glow > 0) {
    ctx.globalAlpha = st.glow / 12 * 0.6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = color;
  ctx.fillRect(x - 8, y - 16, 16, 16);
  // Facing tick.
  ctx.fillStyle = '#111';
  ctx.fillRect(x + st.face * 3 - 1, y - 11, 3, 3);

  // HUD.
  ctx.fillStyle = color;
  ctx.font = '10px monospace';
  ctx.fillText('PRISM — THE LAST HORN', 8, 14);
  ctx.fillStyle = '#888';
  ctx.fillText('element: ' + NAMES[st.el] + '   [C] swap   [X] skill   [<>] move   [^] jump', 8, HEIGHT - 8);

  ctx.restore();
}

// ---- Fixed-timestep driver --------------------------------------------------
let last = performance.now(), acc = 0;
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > MAX_FRAME) dt = MAX_FRAME;
  acc += dt;
  while (acc >= STEP) { update(); acc -= STEP; }
  render(acc / STEP); // remainder = interpolation factor
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
