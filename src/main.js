// PRISM — The Last Horn.  Day 2: AABB collision + 2D platformer physics.
//
// Logical WIDTH x HEIGHT space, letterboxed to the window. Simulation runs at a
// fixed 1/60s step (accumulator) so movement is deterministic; rendering
// interpolates between the previous and current body position for smoothness.
import { COLORS, NAMES } from './palette.js';
import { makePlayer, updatePlayer } from './player.js';
import { SOLIDS, SPAWN } from './world.js';

const WIDTH = 480, HEIGHT = 270;
const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const canvas = document.getElementById('g');
const ctx = canvas.getContext('2d');
let scale = 1, offX = 0, offY = 0;

function resize() {
  const dpr = devicePixelRatio || 1;
  const w = innerWidth, h = innerHeight;
  scale = Math.min(w / WIDTH, h / HEIGHT);
  offX = (w - WIDTH * scale) / 2;
  offY = (h - HEIGHT * scale) / 2;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

const player = makePlayer(SPAWN.x, SPAWN.y);
let prevX = player.x, prevY = player.y;

// Dev-only inspection hook. `import.meta.env.DEV` is false in the production
// build, so terser dead-code-strips this whole block from the 13KB bundle.
if (import.meta.env.DEV) window.P = player;

function update() {
  prevX = player.x;
  prevY = player.y;
  updatePlayer(player, STEP, SOLIDS);

  // Fell out of the arena? Respawn (temporary until hazards exist).
  if (player.y > HEIGHT + 40) {
    player.x = SPAWN.x; player.y = SPAWN.y;
    player.vx = player.vy = 0;
    prevX = player.x; prevY = player.y;
  }
}

function render(alpha) {
  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Solids.
  ctx.fillStyle = '#2a2a2a';
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (const s of SOLIDS) {
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
  }

  // Interpolated player.
  const x = prevX + (player.x - prevX) * alpha;
  const y = prevY + (player.y - prevY) * alpha;
  const color = COLORS[player.el];

  if (player.glow > 0) {
    ctx.globalAlpha = (player.glow / 12) * 0.6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + player.w / 2, y + player.h / 2, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = color;
  ctx.fillRect(x, y, player.w, player.h);
  // Facing eye.
  ctx.fillStyle = '#111';
  ctx.fillRect(x + player.w / 2 + player.face * 2 - 1, y + 4, 2, 2);

  // HUD.
  ctx.fillStyle = color;
  ctx.font = '10px monospace';
  ctx.fillText('PRISM — THE LAST HORN', 8, 14);
  ctx.fillStyle = player.grounded ? '#6c6' : '#888';
  ctx.fillText(player.grounded ? 'GROUNDED' : 'AIRBORNE', 8, 26);
  ctx.fillStyle = '#888';
  ctx.fillText('element: ' + NAMES[player.el] + '   [C] swap   [<>] move   [^] jump', 8, HEIGHT - 8);

  ctx.restore();
}

let last = performance.now(), acc = 0;
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > MAX_FRAME) dt = MAX_FRAME;
  acc += dt;
  while (acc >= STEP) { update(); acc -= STEP; }
  render(acc / STEP);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
