// PRISM — The Last Horn.  Stage progression + purification (Phase 3).
//
// Logical WIDTH x HEIGHT space, letterboxed to the window. Simulation runs at a
// fixed 1/60s step (accumulator); rendering interpolates for smoothness. The
// world is monochrome; reaching a stage's goal triggers a colour-reveal
// "purification" that floods that element's colour and advances the stage.
import { COLORS, NAMES, INDIGO } from './palette.js';
import { makePlayer, updatePlayer } from './player.js';
import { loadLevel, LEVEL_COUNT } from './level.js';
import { overlap } from './physics.js';
import { initUnicorn, updateUnicorn, drawUnicorn } from './unicorn.js';
import { snd, S_HURT, S_FREEZE, S_GOAL } from './sfx.js';

const WIDTH = 480, HEIGHT = 270;
const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const FREEZE_DUR = 120;  // frames an Ice-frozen trap stays inert
const CLEAR_DUR = 100;   // stage-clear transition length
const HALF = CLEAR_DUR / 2;

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

// --- Stage state ------------------------------------------------------------
let lvi = 0;             // current stage index
let lv = loadLevel(lvi); // parsed geometry for the current stage
let clearT = 0;          // clear-transition frames remaining (0 = playing)
let revealHue = 0;       // element colour being purified this clear
const purified = [];     // colour indices already purified (backdrop aurora)

const player = makePlayer(lv.spawn.x - 6, lv.spawn.y - 16);
initUnicorn(player);
let prevX = player.x, prevY = player.y;

function respawn() {
  player.x = lv.spawn.x - 6; player.y = lv.spawn.y - 16;
  player.vx = player.vy = 0;
  player.gflip = 1;
  prevX = player.x; prevY = player.y;
}

function startClear() {
  revealHue = lvi % 7;
  if (!purified.includes(revealHue)) purified.push(revealHue);
  clearT = CLEAR_DUR;
  snd(S_GOAL);
}

function advance() {
  lvi++;
  lv = loadLevel(lvi);
  respawn();
  if (import.meta.env.DEV) window.LV = lv;
}

// Dev-only inspection hook (stripped from the production build).
if (import.meta.env.DEV) { window.P = player; window.LV = lv; window.stage = () => ({ lvi, clearT, purified: [...purified] }); }

function update() {
  // Stage-clear transition: freeze play, swap stage at the midpoint.
  if (clearT > 0) {
    clearT--;
    if (clearT === HALF) advance();
    updateUnicorn(player, STEP);
    return;
  }

  prevX = player.x;
  prevY = player.y;
  updatePlayer(player, STEP, lv.solids, lv.hazards, lv.rocks);

  // Hazards: frozen spikes are inert; Ice freezes any it touches; else lethal.
  let died = player.y > HEIGHT + 40;
  for (const h of lv.hazards) {
    if (h.frozen > 0) { h.frozen--; continue; }
    if (!died && overlap(player, h)) {
      if (player.el === INDIGO) { h.frozen = FREEZE_DUR; snd(S_FREEZE); }
      else if (!player.inv) died = true;
    }
  }
  if (died) { snd(S_HURT); respawn(); }

  // Reached the goal -> purify + advance.
  if (lv.goal && overlap(player, lv.goal)) startClear();

  updateUnicorn(player, STEP);
}

// 0..1 alpha -> 2-digit hex, for `#rrggbb` + alpha fills.
const A = (a) => ('0' + (Math.max(0, Math.min(255, a * 255 | 0))).toString(16)).slice(-2);

function render(alpha) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, WIDTH, HEIGHT);
  ctx.clip();

  // Studio backdrop: a soft radial vignette (lit centre, dark edges).
  const bg = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.42, 40, WIDTH * 0.5, HEIGHT * 0.5, WIDTH * 0.62);
  bg.addColorStop(0, '#1c1c22');
  bg.addColorStop(1, '#0b0b0e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Purified aurora: each colour you've reclaimed glows in the monochrome sky.
  for (let i = 0; i < purified.length; i++) {
    const gx = WIDTH * (purified.length > 1 ? 0.18 + 0.64 * i / (purified.length - 1) : 0.5);
    const gg = ctx.createRadialGradient(gx, HEIGHT * 0.18, 6, gx, HEIGHT * 0.18, 130);
    gg.addColorStop(0, COLORS[purified[i]] + '4d');
    gg.addColorStop(1, COLORS[purified[i]] + '00');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT * 0.7);
  }

  // Solids.
  ctx.fillStyle = '#2a2a2a';
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (const s of lv.solids) {
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
  }

  // Breakable rocks.
  for (const r of lv.rocks) {
    ctx.fillStyle = '#6b5a45';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#7d6a52';
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 3, r.h - 3);
    ctx.strokeStyle = '#4a3d30';
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }

  // Spikes (frozen ones icy blue).
  for (const h of lv.hazards) {
    ctx.fillStyle = h.frozen > 0 ? '#9fdcff' : '#c33';
    ctx.beginPath();
    ctx.moveTo(h.x, h.y + h.h);
    ctx.lineTo(h.x + h.w / 2, h.y);
    ctx.lineTo(h.x + h.w, h.y + h.h);
    ctx.closePath();
    ctx.fill();
  }

  // Goal — a pulsing beacon in this stage's element colour.
  if (lv.goal) {
    const t = (Math.sin(performance.now() / 300) + 1) / 2;
    ctx.globalAlpha = 0.5 + t * 0.5;
    ctx.fillStyle = COLORS[lvi % 7];
    ctx.beginPath();
    ctx.arc(lv.goal.x + lv.goal.w / 2, lv.goal.y + lv.goal.h / 2, 5 + t * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Interpolated player position.
  const x = prevX + (player.x - prevX) * alpha;
  const y = prevY + (player.y - prevY) * alpha;

  // Fire dash streaks.
  if (player.dashT > 0) {
    ctx.fillStyle = COLORS[0];
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = 0.25 * (player.dashT / 12) / i;
      ctx.fillRect(x - player.face * i * 7, y, player.w, player.h);
    }
    ctx.globalAlpha = 1;
  }
  // Light blink streak.
  if (player.blinkT > 0) {
    ctx.strokeStyle = COLORS[2];
    ctx.globalAlpha = (player.blinkT / 10) * 0.8;
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(player.bx0 + player.w / 2, player.by0 + player.h / 2);
    ctx.lineTo(x + player.w / 2, y + player.h / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Nature double-jump ring.
  if (player.djT > 0) {
    const t = 1 - player.djT / 12;
    ctx.strokeStyle = COLORS[3];
    ctx.globalAlpha = (1 - t) * 0.8; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + player.w / 2, y + player.h, 3 + t * 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Nature glide wings.
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
  // Water bubbles.
  if (player.floating) {
    ctx.fillStyle = COLORS[4];
    const t = performance.now() / 300;
    for (let i = 0; i < 4; i++) {
      const bx = x + player.w / 2 + Math.sin(t * 2 + i * 2) * (5 + i * 2);
      const by = y + player.h - ((t * 22 + i * 9) % 26);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(bx, by, 1.6 - i * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // Gravity flip pulse.
  if (player.flipT > 0) {
    const t = player.flipT / 12;
    ctx.strokeStyle = COLORS[6];
    ctx.globalAlpha = t * 0.8; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + player.w / 2, y - 10 * (1 - t));
    ctx.lineTo(x + player.w / 2, y + player.h + 10 * (1 - t));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Earth slam shockwave.
  if (player.shockT > 0) {
    const t = 1 - player.shockT / 16;
    ctx.strokeStyle = COLORS[1];
    ctx.globalAlpha = (1 - t) * 0.9; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + player.w / 2, y + player.h, 4 + t * 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawUnicorn(ctx, player, x, y);

  // --- Stage-clear purification wash --------------------------------------
  if (clearT > 0) {
    const k = 1 - Math.abs(clearT - HALF) / HALF; // 0 -> 1 -> 0
    // colour floods from the goal outward
    const gx = lv.goal ? lv.goal.x : WIDTH / 2, gy = lv.goal ? lv.goal.y : HEIGHT / 2;
    const wash = ctx.createRadialGradient(gx, gy, 0, gx, gy, WIDTH * (0.2 + k));
    wash.addColorStop(0, COLORS[revealHue] + A(k * 0.9));
    wash.addColorStop(1, COLORS[revealHue] + '00');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // bright flash near the peak
    ctx.fillStyle = '#ffffff' + A(Math.max(0, k - 0.6) * 1.2);
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // caption
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(NAMES[revealHue] + ' PURIFIED', WIDTH / 2, HEIGHT / 2 - 8);
    ctx.font = '9px monospace';
    ctx.fillText('STAGE ' + (lvi + 1), WIDTH / 2, HEIGHT / 2 + 8);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // HUD.
  ctx.fillStyle = COLORS[player.el];
  ctx.font = '10px monospace';
  ctx.fillText('PRISM — THE LAST HORN', 8, 14);
  ctx.fillStyle = '#888';
  ctx.fillText('STAGE ' + (lvi + 1) + '/' + LEVEL_COUNT + '   purified ' + purified.length + '/7', 8, 26);
  ctx.fillText('element: ' + NAMES[player.el] + '   [C] swap   [<>] move   [^] jump   [X] skill', 8, HEIGHT - 8);

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
