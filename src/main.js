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
import { drawUnicornPixel } from './pixelUnicorn.js';
import { snd, S_HURT, S_FREEZE, S_GOAL, S_STEP, S_OMEN, S_PRISM, S_REVEAL } from './sfx.js';
import { makeBoss, updateBoss, drawBoss } from './boss.js';

const WIDTH = 480, HEIGHT = 270;
const BOSS_STAGE = LEVEL_COUNT - 1; // last stage is the boss arena
const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const FREEZE_DUR = 120;  // frames an Ice-frozen trap stays inert
const INTRO_DUR = 180;   // boss entrance sequence length (frames, ~3s)
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
let boss = null;         // boss instance while on the arena stage
let introT = 0;          // boss entrance sequence frames remaining (0 = fighting)
let camX = 0;            // horizontal camera offset (0 on single-screen stages)
let lastCheck = null;    // last checkpoint passed on the chase runner
let won = false;         // world fully purified (victory)
let winT = 0;            // frames since victory (drives the ending timeline)
let started = false;     // false = title screen; true = playing
let openIdx = -1;        // >=0 while stepping the opening story cards
let beaten = false;      // the world has been coloured once -> title blooms
let dead = false;        // awaiting Continue after a death (freeze until a key)

// Contextual control tooltips: teach each stage's skill key on first arrival,
// and the colour-swap key once it first matters (the boss duel).
const SKILL_HINT = [
  'press [X] to DASH across the spikes',
  'JUMP, then press [X] in the air to SLAM through rock',
  'press [X] to BLINK through the walls',
  'press [X] in the air to DOUBLE-JUMP the gaps',
  'hold [X] while swimming to FLOAT — only works in water',
  'walk through as ICE — spikes FREEZE on touch, no button needed',
  'press [X] anytime to FLIP gravity — floor and ceiling swap',
];
let skillUsed = false;   // player demonstrated this stage's skill (hides its hint)
let swapUsed = false;    // player has swapped colour at least once (hides swap hint)
let prevEl = 0;          // last frame's element, to detect a swap

// Full-screen skill tip: freezes play once per stage on first arrival, so a
// new mechanic (e.g. Earth's jump-then-slam) is explained before you're
// expected to use it, instead of only a small pulsing reminder mid-run.
let showTip = false;
const tipSeen = [0, 0, 0, 0, 0, 0, 0];

// --- Story ------------------------------------------------------------------
// A creation myth: the world we live in comes AFTER this game. The unicorn is
// the last light in a world not yet begun; it gives its seven colours away and
// vanishes — which is why no one has ever seen it.
const OPEN = [
  ['BEFORE THE WORLD', 'there was only The Monochrome —', 'a silence that had never known colour.'],
  ['THE LAST HORN', 'one unicorn walked that grey.', 'seven colours slept inside its horn.'],
  ['', 'it went to give them all away.', ''],
];
// Spoken as each element is returned to the world (order matches NAMES).
const LORE = [
  'warmth — and so the first fire was lit',
  'firmness — and so the mountains rose',
  'brightness — and so the morning came',
  'breath — and so the forests woke',
  'flow — and so the rivers ran',
  'stillness — and so the winter fell',
  'pull — and so the stars kept their place',
];

const player = makePlayer(lv.spawn.x - 6, lv.spawn.y - 16);
let prevX = player.x, prevY = player.y;

// Progressive unlock: on stage i you hold elements 0..i (the newest = element i
// is the one this stage is built around). Entering a stage equips it by default.
function syncElements() {
  player.unlocked = Math.min(lvi + 1, 7);
  player.el = Math.min(lvi, 6);
  prevEl = player.el;
  skillUsed = false; // re-show the skill hint for the newly-introduced element
}
syncElements();

// Show the full-screen tip once per stage, the first time it's entered.
function maybeShowTip() {
  if (!boss && !tipSeen[lvi]) { tipSeen[lvi] = 1; showTip = true; }
}
maybeShowTip();

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
  syncElements();
  boss = lvi === BOSS_STAGE ? makeBoss() : null;
  introT = boss ? INTRO_DUR : 0;
  lastCheck = boss ? lv.spawn : null;
  if (boss) snd(S_OMEN);            // the Monochrome looms
  maybeShowTip();
  if (import.meta.env.DEV) window.LV = lv;
}

// Chase respawn: back to the last checkpoint, wall reset behind it.
function respawnChase() {
  const c = lastCheck || lv.spawn;
  player.x = c.x - 6; player.y = c.y - 16;
  player.vx = player.vy = 0; player.gflip = 1;
  prevX = player.x; prevY = player.y;
  if (boss) { boss.x = c.x - 130; boss.sp = boss.sp0; }
}

// Death: freeze on the Continue prompt with the unicorn left exactly where it
// hit the obstacle. Nothing is moved or reset yet — that waits for revive().
function die() {
  dead = true;
  snd(S_HURT);
}

// Continue: the player pressed a key. Now reload the level so every obstacle
// returns to its initial state (Ice-frozen spikes thaw, blades reset, rocks
// return — closing the freeze-then-die exploit) and reposition to the checkpoint
// on the chase, or the spawn otherwise.
function revive() {
  lv = loadLevel(lvi);
  if (import.meta.env.DEV) window.LV = lv;
  if (boss) respawnChase(); else respawn();
  dead = false;
}

// Boss purified: the world is whole again.
function onWin() {
  won = true;
  beaten = true;              // the title will now bloom into full colour
  for (let i = 0; i < 7; i++) if (!purified.includes(i)) purified.push(i);
  snd(S_PRISM);               // the horn breaks — a rising shimmer of colour
}

// Restart from stage 1 (used by "play again" after victory).
function reset() {
  lvi = 0; lv = loadLevel(0); purified.length = 0;
  clearT = 0; boss = null; introT = 0; camX = 0; lastCheck = null; won = false;
  winT = 0; openIdx = -1; tipSeen.fill(0);
  respawn(); syncElements(); maybeShowTip();
}

// Title -> opening story cards -> play. A key steps the opening; on the ending
// (once its last card has settled) a key returns to the now-colour title.
// Ignore auto-repeat (held-key) events: every transition here wants a fresh
// press, so on Continue you must release and press again to revive.
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (dead) { revive(); }                                 // Continue: release+press to revive
  else if (!started) { started = true; openIdx = 0; snd(S_STEP); } // begin the opening
  else if (openIdx >= 0) { if (++openIdx >= OPEN.length) openIdx = -1; snd(S_STEP); } // step / dismiss
  else if (showTip) { showTip = false; snd(S_STEP); }       // dismiss the skill tip -> begin
  else if (won && winT > 270) { reset(); started = false; } // ending -> colour title
});

// Dev-only inspection hook (stripped from the production build).
if (import.meta.env.DEV) {
  window.P = player; window.LV = lv;
  window.stage = () => ({ lvi, clearT, purified: [...purified], bossHp: boss && boss.hp, won });
  window.getBoss = () => boss;
  window.goStage = (i) => { lvi = i; lv = loadLevel(i); respawn(); syncElements(); window.LV = lv; clearT = 0; won = false; dead = false; showTip = false; boss = i === BOSS_STAGE ? makeBoss() : null; introT = boss ? INTRO_DUR : 0; lastCheck = boss ? lv.spawn : null; };
}

function update() {
  // Title screen / opening story: freeze until the player steps through.
  if (!started || openIdx >= 0) return;

  // Victory: freeze play and run the ending timeline (the unicorn idles on).
  // Cue the grey breaking into colour, then the quiet reveal.
  if (won) { winT++; if (winT === 130) snd(S_GOAL); else if (winT === 270) snd(S_REVEAL); return; }

  // Stage-clear transition: freeze play, swap stage at the midpoint.
  if (clearT > 0) {
    clearT--;
    if (clearT === HALF) advance();
    return;
  }

  // Boss entrance: freeze play while the Monochrome looms and is named.
  if (introT > 0) { introT--; return; }

  // Skill tip: freeze on the explanation until the player presses a key.
  if (showTip) return;

  // Death: hold on the Continue prompt until the player presses a key.
  if (dead) return;

  prevX = player.x;
  prevY = player.y;
  player.inWater = lv.water.some((w) => overlap(player, w)); // gates Water's float
  updatePlayer(player, STEP, lv.solids, lv.hazards, lv.rocks);

  // Tooltip triggers: any active-skill press (glow) clears the skill hint; the
  // passive Ice skill clears it on the first freeze (handled below). A colour
  // change clears the swap hint for good.
  if (player.el !== INDIGO && player.glow > 0) skillUsed = true;
  if (player.el !== prevEl) swapUsed = true;
  prevEl = player.el;

  // Hazards: frozen spikes are inert; Ice freezes any it touches; else lethal.
  let died = player.y > HEIGHT + 40;
  for (const h of lv.hazards) {
    if (h.frozen > 0) { h.frozen--; continue; }
    if (h.mvx) { h.x += h.mvx; if (h.x <= h.x0 || h.x >= h.x1) h.mvx = -h.mvx; } // patrol
    if (!died && overlap(player, h)) {
      if (player.el === INDIGO) { h.frozen = FREEZE_DUR; skillUsed = true; snd(S_FREEZE); }
      else if (!player.inv) died = true;
    }
  }
  if (died) { die(); return; }            // -> Continue prompt

  if (boss) {
    // Chase runner: record checkpoints, advance the wall, win at the far light.
    const cx = player.x + player.w / 2;
    for (const c of lv.checks) if (cx > c.x && (!lastCheck || c.x > lastCheck.x)) lastCheck = c;
    updateBoss(boss, player, die);        // caught -> Continue prompt
    if (dead) return;
    if (lv.goal && overlap(player, lv.goal)) onWin();
  } else if (lv.goal && overlap(player, lv.goal)) {
    startClear();                          // reached the goal -> purify + advance
  }
}

// 0..1 alpha -> 2-digit hex, for `#rrggbb` + alpha fills.
const A = (a) => ('0' + (Math.max(0, Math.min(255, a * 255 | 0))).toString(16)).slice(-2);

// The title card (drawn inside the clipped/scaled viewport).
const titleHorse = { x: WIDTH / 2 - 6, y: 184, w: 12, h: 16, el: 6, face: 1, grounded: true, vx: 0, gflip: 1 };
function drawTitle() {
  const t = performance.now();
  // Once beaten, the world behind the title is full of the colour you returned.
  if (beaten) {
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 7; i++) { ctx.fillStyle = COLORS[i]; ctx.fillRect(0, HEIGHT * i / 7, WIDTH, HEIGHT / 7 + 1); }
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'center';
  // Title — a rainbow wordmark after the world is coloured, pale before.
  ctx.font = 'bold 42px monospace';
  if (beaten) {
    const grad = ctx.createLinearGradient(WIDTH / 2 - 72, 0, WIDTH / 2 + 72, 0);
    for (let i = 0; i < 7; i++) grad.addColorStop(i / 6, COLORS[i]);
    ctx.fillStyle = grad;
  } else ctx.fillStyle = '#ececf2';
  ctx.fillText('PRISM', WIDTH / 2, 74);
  ctx.fillStyle = '#b45cff';
  ctx.font = '15px monospace';
  ctx.fillText('T H E   L A S T   H O R N', WIDTH / 2, 98);
  // Seven-colour spectrum
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = COLORS[i];
    ctx.beginPath(); ctx.arc(WIDTH / 2 - 30 + i * 10, 116, 3, 0, Math.PI * 2); ctx.fill();
  }
  // After the ending: the myth's closing line, now the reason our world is bright.
  if (beaten) {
    ctx.fillStyle = '#cfcfda'; ctx.font = '9px monospace';
    ctx.fillText('the horn is gone — but the world it left is bright', WIDTH / 2, 132);
  }
  // The unicorn, its coat cycling through the spectrum it seeks
  titleHorse.el = Math.floor(t / 550) % 7;
  drawUnicornPixel(ctx, titleHorse, titleHorse.x, titleHorse.y);
  // Start prompt (pulsing) + controls
  ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 300);
  ctx.fillStyle = '#e6e6ee';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('press any key to begin', WIDTH / 2, 230);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#83838f';
  ctx.font = '9px monospace';
  ctx.fillText('[<>] move    [^] jump    [X] skill    [C] swap colour', WIDTH / 2, 250);
  ctx.textAlign = 'left';
}

// A full-screen story card: a dim wash, a violet heading, two lines, and an
// optional pulsing key prompt. Used for the opening and the ending's last beat.
function drawStory(card, prompt) {
  ctx.fillStyle = '#07070a' + 'e6';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = 'center';
  if (card[0]) { ctx.fillStyle = '#b45cff'; ctx.font = 'bold 18px monospace'; ctx.fillText(card[0], WIDTH / 2, HEIGHT / 2 - 24); }
  ctx.fillStyle = '#e6e6ee'; ctx.font = '11px monospace';
  ctx.fillText(card[1], WIDTH / 2, HEIGHT / 2 + 2);
  if (card[2]) ctx.fillText(card[2], WIDTH / 2, HEIGHT / 2 + 20);
  if (prompt) {
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(performance.now() / 300);
    ctx.fillStyle = '#83838f'; ctx.font = '9px monospace';
    ctx.fillText('press any key', WIDTH / 2, HEIGHT - 30);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
}

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

  // Title screen: name, a colour-cycling unicorn, and a start prompt.
  if (!started) { drawTitle(); ctx.restore(); return; }

  // Opening story: myth setup over the monochrome void, stepped by any key.
  if (openIdx >= 0) { drawStory(OPEN[openIdx], true); ctx.restore(); return; }

  // Camera: follow the player horizontally on wide stages (clamped; 0 elsewhere).
  const ipx = prevX + (player.x - prevX) * alpha;
  camX = Math.max(0, Math.min(lv.w - WIDTH, ipx + player.w / 2 - WIDTH * 0.42));
  ctx.save();
  ctx.translate(-camX, 0);

  // Water zones (swim upward here as Water). Translucent fill + a wavy surface.
  if (lv.water.length) {
    const topY = Math.min(...lv.water.map((w) => w.y));
    for (const w of lv.water) { ctx.fillStyle = 'rgba(77,184,255,0.20)'; ctx.fillRect(w.x, w.y, w.w, w.h); }
    ctx.strokeStyle = 'rgba(150,220,255,0.6)'; ctx.lineWidth = 1;
    const t = performance.now() / 400;
    for (const w of lv.water) if (w.y === topY) {
      ctx.beginPath();
      for (let x = w.x; x <= w.x + w.w; x += 3) ctx[x === w.x ? 'moveTo' : 'lineTo'](x, w.y + 1.5 + Math.sin(x * 0.3 + t) * 1.5);
      ctx.stroke();
    }
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

  // Hazards: spikes are triangles; moving blades are spinning saws.
  for (const h of lv.hazards) {
    const frozen = h.frozen > 0;
    if (h.mvx) {
      const cx = h.x + h.w / 2, cy = h.y + h.h / 2, rot = performance.now() / 90;
      ctx.fillStyle = frozen ? '#9fdcff' : '#d33';
      ctx.beginPath();
      for (let i = 0; i < 12; i++) { const a = rot + i / 12 * Math.PI * 2, rr = i % 2 ? h.w * 0.6 : h.w * 0.32; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = frozen ? '#cdeeff' : '#511'; ctx.beginPath(); ctx.arc(cx, cy, h.w * 0.16, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = frozen ? '#9fdcff' : '#c33';
      ctx.beginPath();
      if (h.y < 40) { ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + h.w / 2, h.y + h.h); ctx.lineTo(h.x + h.w, h.y); } // ceiling spike points down
      else { ctx.moveTo(h.x, h.y + h.h); ctx.lineTo(h.x + h.w / 2, h.y); ctx.lineTo(h.x + h.w, h.y + h.h); }
      ctx.closePath(); ctx.fill();
    }
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

  // Element aura: a soft halo in the current element's colour, so the faded
  // coat's active element (which drives the skill) always reads at a glance.
  {
    const acx = x + player.w / 2, acy = y + player.h - 16, col = COLORS[player.el];
    const halo = ctx.createRadialGradient(acx, acy, 6, acx, acy, 30);
    halo.addColorStop(0, col + '00');
    halo.addColorStop(0.55, col + (player.el === INDIGO ? '5a' : '4d'));
    halo.addColorStop(1, col + '00');
    ctx.fillStyle = halo;
    ctx.fillRect(acx - 34, acy - 34, 68, 68);
  }

  // The coat fades toward grey as colours are returned — nearly monochrome by
  // the final chase, when the horn is all but empty.
  drawUnicornPixel(ctx, player, x, y, Math.min(0.82, purified.length / 8));

  ctx.restore(); // end camera — overlays, chase wall and HUD are screen-space

  // The Monochrome: an advancing wall of un-colour chasing from the left.
  if (boss) drawBoss(ctx, boss, camX);

  // Boss entrance: darken the arena, then name the enemy and the stakes.
  if (introT > 0) {
    const k = 1 - Math.abs(introT - INTRO_DUR / 2) / (INTRO_DUR / 2); // 0 -> 1 -> 0
    ctx.fillStyle = '#000000' + A(0.6 * Math.min(1, introT / (INTRO_DUR * 0.3)));
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = Math.min(1, k * 2.2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e6e6ee';
    ctx.font = 'bold 17px monospace';
    ctx.fillText('THE MONOCHROME', WIDTH / 2, HEIGHT / 2 - 6);
    ctx.fillStyle = '#9a9aa8';
    ctx.font = '9px monospace';
    ctx.fillText('the silence comes to take the last horn back', WIDTH / 2, HEIGHT / 2 + 12);
    ctx.fillText('run — carry the final colour to the world\'s edge', WIDTH / 2, HEIGHT / 2 + 26);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // Skill tip: a full-screen pause (once per stage) spelling out exactly how
  // the new skill works — e.g. Earth needs a jump BEFORE the slam key, which
  // a small pulsing reminder mid-run was too easy to miss.
  if (showTip) {
    const col = COLORS[lvi % 7];
    ctx.fillStyle = '#07070a' + 'e6';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = 'center';
    ctx.fillStyle = col; ctx.font = 'bold 18px monospace';
    ctx.fillText(NAMES[lvi % 7] + ' AWAKENS', WIDTH / 2, HEIGHT / 2 - 26);
    ctx.fillStyle = '#e6e6ee'; ctx.font = '11px monospace';
    ctx.fillText(SKILL_HINT[lvi % 7], WIDTH / 2, HEIGHT / 2);
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(performance.now() / 300);
    ctx.fillStyle = '#83838f'; ctx.font = '9px monospace';
    ctx.fillText('press any key to begin', WIDTH / 2, HEIGHT / 2 + 26);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // Victory — the ending myth. The horn breaks in a prism burst, the grey
  // shatters into colour, then the reveal: our bright world begins only once
  // the unicorn is spent and gone.
  if (won) {
    const k = Math.min(1, winT / 90);
    ctx.globalAlpha = 0.30 * k;                          // rainbow bloom ramping in
    for (let i = 0; i < 7; i++) { ctx.fillStyle = COLORS[i]; ctx.fillRect(0, HEIGHT * i / 7, WIDTH, HEIGHT / 7 + 1); }
    ctx.globalAlpha = Math.max(0, 1 - winT / 40) * 0.85; // white prism flash as the horn breaks
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    if (winT < 270) {                                    // two settling captions
      ctx.globalAlpha = Math.min(1, winT / 30);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 15px monospace';
      ctx.fillText(winT < 130 ? 'THE LAST COLOUR LEFT THE HORN' : 'THE GREY BROKE INTO EVERY HUE', WIDTH / 2, HEIGHT / 2);
      ctx.globalAlpha = 1;
    } else {                                             // the reveal + replay prompt
      drawStory(['', 'no one ever saw the unicorn —', 'by the time our eyes knew colour, it was gone.'], false);
      ctx.textAlign = 'center';
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(performance.now() / 300);
      ctx.fillStyle = '#83838f'; ctx.font = '9px monospace';
      ctx.fillText('press any key to play again', WIDTH / 2, HEIGHT - 30);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }

  // --- Stage-clear purification wash --------------------------------------
  if (clearT > 0) {
    const k = 1 - Math.abs(clearT - HALF) / HALF; // 0 -> 1 -> 0
    // colour floods from the goal outward (goal is in world space -> subtract camera)
    const gx = (lv.goal ? lv.goal.x : WIDTH / 2) - camX, gy = lv.goal ? lv.goal.y : HEIGHT / 2;
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
    ctx.fillText(NAMES[revealHue] + ' RETURNED', WIDTH / 2, HEIGHT / 2 - 8);
    ctx.font = '10px monospace';
    ctx.fillText(LORE[revealHue], WIDTH / 2, HEIGHT / 2 + 10);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // Contextual control tooltip (only during active play): teach the stage's
  // skill key, or the colour-swap key once the boss makes it matter.
  if (clearT === 0 && !won && !dead && !showTip) {
    let tip = null, col = '#fff';
    if (boss && !swapUsed) { tip = 'RUN! swap [C] to each section\'s skill and use [X]'; col = COLORS[player.el]; }
    else if (!boss && !skillUsed) { tip = SKILL_HINT[lvi % 7]; col = COLORS[lvi % 7]; }
    if (tip) {
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 260);
      ctx.textAlign = 'center';
      ctx.font = 'bold 10px monospace';
      ctx.globalAlpha = pulse;
      ctx.fillStyle = col;
      ctx.fillText(tip, WIDTH / 2, 52);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
  }

  // Death: a calm Continue prompt. Play resumes the moment a key is pressed.
  if (dead) {
    ctx.fillStyle = '#05050a' + A(0.62);
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS[player.el];
    ctx.font = 'bold 20px monospace';
    ctx.fillText('CONTINUE?', WIDTH / 2, HEIGHT / 2 - 4);
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    ctx.fillStyle = '#e6e6ee';
    ctx.font = '10px monospace';
    ctx.fillText('press any key to move on', WIDTH / 2, HEIGHT / 2 + 18);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // HUD (hidden during the clear wash, the skill tip and the ending so their
  // story text stands alone on screen).
  if (!won && clearT === 0 && !dead && !showTip) {
    ctx.fillStyle = COLORS[player.el];
    ctx.font = '10px monospace';
    ctx.fillText('PRISM — THE LAST HORN', 8, 14);
    ctx.fillStyle = '#888';
    if (boss) ctx.fillText('THE MONOCHROME   OUTRUN IT — reach the light', 8, 26);
    else ctx.fillText('STAGE ' + (lvi + 1) + '/' + LEVEL_COUNT + '   purified ' + purified.length + '/7', 8, 26);
    // "element: NAME" — the NAME in its own colour so the active element reads.
    ctx.fillText('element: ', 8, HEIGHT - 8);
    const ex = 8 + ctx.measureText('element: ').width;
    ctx.fillStyle = COLORS[player.el];
    ctx.fillText(NAMES[player.el], ex, HEIGHT - 8);
    ctx.fillStyle = '#888';
    ctx.fillText('   [C] swap   [<>] move   [^] jump   [X] skill', ex + ctx.measureText(NAMES[player.el]).width, HEIGHT - 8);

    // Skill-cooldown gauge (Fire/Earth/Light have real cooldowns now).
    const ready = player.cd <= 0 && player.dashT === 0 && !player.slam;
    const gx = WIDTH - 66;
    ctx.fillStyle = '#777'; ctx.font = '8px monospace';
    ctx.fillText('SKILL', gx - 30, 14);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(gx, 8, 58, 5);
    ctx.fillStyle = ready ? COLORS[player.el] : '#b55';
    ctx.fillRect(gx, 8, 58 * (ready ? 1 : 1 - Math.min(1, player.cd / 48)), 5);
  }

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
