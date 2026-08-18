// PRISM — The Last Horn.  Day 3-4: procedural unicorn animation.
//
// Logical WIDTH x HEIGHT space, letterboxed to the window. Simulation runs at a
// fixed 1/60s step (accumulator) so movement is deterministic; rendering
// interpolates between the previous and current body position for smoothness.
import { COLORS, NAMES } from './palette.js';
import { makePlayer, updatePlayer } from './player.js';
import { SOLIDS, SPAWN } from './world.js';
import { initUnicorn, updateUnicorn, drawUnicorn } from './unicorn.js';

const WIDTH = 480, HEIGHT = 270;
const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const canvas = document.getElementById('g');
const ctx = canvas.getContext('2d');
let scale = 1, offX = 0, offY = 0, dpr = 1, vw = 0, vh = 0;

function resize() {
  dpr = devicePixelRatio || 1;
  vw = innerWidth; vh = innerHeight;
  scale = Math.min(vw / WIDTH, vh / HEIGHT);
  offX = (vw - WIDTH * scale) / 2;
  offY = (vh - HEIGHT * scale) / 2;
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
  canvas.width = vw * dpr;
  canvas.height = vh * dpr;
}
addEventListener('resize', resize);
resize();

const player = makePlayer(SPAWN.x, SPAWN.y);
initUnicorn(player);
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

  updateUnicorn(player, STEP);
}

function render(alpha) {
  // Clear the WHOLE canvas (letterbox included) so nothing drawn outside the
  // logical viewport — e.g. the unicorn falling through a gap — leaves a trail.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);
  // Clip to the viewport so sprites can't spill into the letterbox bars.
  ctx.beginPath();
  ctx.rect(0, 0, WIDTH, HEIGHT);
  ctx.clip();

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

  // Interpolated player position for smooth rendering.
  const x = prevX + (player.x - prevX) * alpha;
  const y = prevY + (player.y - prevY) * alpha;

  drawUnicorn(ctx, player, x, y);

  // HUD.
  ctx.fillStyle = COLORS[player.el];
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
