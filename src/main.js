// PRISM — The Last Horn.  Day 6: string tilemap parser drives the world.
//
// Logical WIDTH x HEIGHT space, letterboxed to the window. Simulation runs at a
// fixed 1/60s step (accumulator) so movement is deterministic; rendering
// interpolates between the previous and current body position for smoothness.
import { COLORS, NAMES } from './palette.js';
import { makePlayer, updatePlayer } from './player.js';
import { level } from './level.js';
import { overlap } from './physics.js';
import { initUnicorn, updateUnicorn, drawUnicorn } from './unicorn.js';

const { solids, hazards, rocks, goal, spawn } = level;

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

// Spawn is a ground point (bottom-center of the S tile); seat the player's box
// on it so the feet rest at the marked ground.
const player = makePlayer(spawn.x - 6, spawn.y - 16);
initUnicorn(player);
let prevX = player.x, prevY = player.y;

function respawn() {
  player.x = spawn.x - 6; player.y = spawn.y - 16;
  player.vx = player.vy = 0;
  prevX = player.x; prevY = player.y;
}

// Dev-only inspection hook. `import.meta.env.DEV` is false in the production
// build, so terser dead-code-strips this whole block from the 13KB bundle.
if (import.meta.env.DEV) { window.P = player; window.LV = level; }

function update() {
  prevX = player.x;
  prevY = player.y;
  updatePlayer(player, STEP, solids, hazards, rocks);

  // Death: fell out of the level, or touched a spike while not invincible.
  if (player.y > HEIGHT + 40 || (!player.inv && hazards.some((h) => overlap(player, h)))) respawn();

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
  for (const s of solids) {
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
  }

  // Breakable rocks — chunky brown blocks with a highlight bevel.
  for (const r of rocks) {
    ctx.fillStyle = '#6b5a45';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#7d6a52';
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 3, r.h - 3);
    ctx.strokeStyle = '#4a3d30';
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }

  // Spikes — upward triangles.
  ctx.fillStyle = '#c33';
  for (const h of hazards) {
    ctx.beginPath();
    ctx.moveTo(h.x, h.y + h.h);
    ctx.lineTo(h.x + h.w / 2, h.y);
    ctx.lineTo(h.x + h.w, h.y + h.h);
    ctx.closePath();
    ctx.fill();
  }

  // Goal — a pulsing rainbow beacon (stage-clear reveal comes in Phase 3).
  if (goal) {
    const t = (Math.sin(performance.now() / 300) + 1) / 2;
    ctx.globalAlpha = 0.4 + t * 0.6;
    ctx.fillStyle = COLORS[(performance.now() / 150 | 0) % 7];
    ctx.beginPath();
    ctx.arc(goal.x + goal.w / 2, goal.y + goal.h / 2, 5 + t * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Interpolated player position for smooth rendering.
  const x = prevX + (player.x - prevX) * alpha;
  const y = prevY + (player.y - prevY) * alpha;

  // Fire dash: red afterimage streaks trailing the burst.
  if (player.dashT > 0) {
    ctx.fillStyle = COLORS[0];
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = 0.25 * (player.dashT / 12) / i;
      ctx.fillRect(x - player.face * i * 7, y, player.w, player.h);
    }
    ctx.globalAlpha = 1;
  }

  // Light blink: a fading yellow streak between origin and destination.
  if (player.blinkT > 0) {
    ctx.strokeStyle = COLORS[2];
    ctx.globalAlpha = (player.blinkT / 10) * 0.8;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(player.bx0 + player.w / 2, player.by0 + player.h / 2);
    ctx.lineTo(x + player.w / 2, y + player.h / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Nature double jump: green burst ring at the launch point.
  if (player.djT > 0) {
    const t = 1 - player.djT / 12;
    ctx.strokeStyle = COLORS[3];
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + player.w / 2, y + player.h, 3 + t * 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Nature glide: faint green wings fanning from the body.
  if (player.gliding) {
    ctx.fillStyle = COLORS[3];
    ctx.globalAlpha = 0.35;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + player.w / 2, y + 4);
      ctx.lineTo(x + player.w / 2 - player.face * 10, y - 4 + s * 8);
      ctx.lineTo(x + player.w / 2 - player.face * 4, y + 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Earth slam: expanding orange shockwave ring at the impact point.
  if (player.shockT > 0) {
    const t = 1 - player.shockT / 16; // 0 -> 1 as it expands
    ctx.strokeStyle = COLORS[1];
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + player.w / 2, y + player.h, 4 + t * 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

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
