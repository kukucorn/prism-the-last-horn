// Final boss — the Monochrome, a corrupted mass that hurls colour back at the
// world. Colour-parry: a shot only hurts if it strikes the unicorn in a
// mismatched colour; matching its colour (swap with C in time) parries it,
// reflecting it back to damage the boss. Parry HP=5 hits purifies it.
import { COLORS } from './palette.js';
import { snd, S_BLINK, S_SLAM, S_HURT } from './sfx.js';

const W = 480;
const BOSS_HP = 5;
const FIRE_INT = 95;    // frames between shots
const SHOT_SP = 100;    // px/s toward the player
const REFLECT_SP = 240; // px/s back at the boss
const HURT_DUR = 16;

export function makeBoss() {
  return { x: W / 2, y: 48, hp: BOSS_HP, fireT: 70, hurtT: 0, hue: 0, shots: [] };
}

// Advance the boss one fixed step. onDefeat() fires when its HP hits 0.
export function updateBoss(b, p, onDefeat) {
  if (b.hurtT > 0) b.hurtT--;
  b.x = W / 2 + Math.sin(performance.now() / 900) * 70; // hover side to side

  if (b.hp > 0 && --b.fireT <= 0) {
    b.fireT = FIRE_INT;
    b.hue = (b.hue + 1 + (Math.random() * 5 | 0)) % 7; // demand a new colour
    const px = p.x + p.w / 2, py = p.y + p.h / 2;
    const dx = px - b.x, dy = py - b.y, d = Math.hypot(dx, dy) || 1;
    b.shots.push({ x: b.x, y: b.y + 16, vx: dx / d * SHOT_SP, vy: dy / d * SHOT_SP, hue: b.hue, ref: 0 });
  }

  const px = p.x + p.w / 2, py = p.y + p.h / 2;
  for (let i = b.shots.length - 1; i >= 0; i--) {
    const s = b.shots[i];
    // Reflected shots home in on the (side-to-side moving) boss so a parry lands.
    if (s.ref) {
      const dx = b.x - s.x, dy = b.y - s.y, d = Math.hypot(dx, dy) || 1;
      s.vx = dx / d * REFLECT_SP; s.vy = dy / d * REFLECT_SP;
    }
    s.x += s.vx / 60; s.y += s.vy / 60;

    if (s.ref) {
      // reflected shot: damage the boss on contact
      if (Math.hypot(s.x - b.x, s.y - b.y) < 20) {
        b.shots.splice(i, 1); b.hp--; b.hurtT = HURT_DUR; snd(S_SLAM);
        if (b.hp <= 0) onDefeat();
      }
    } else if (s.x > p.x - 3 && s.x < p.x + p.w + 3 && s.y > p.y - 3 && s.y < p.y + p.h + 3) {
      // reached the unicorn: parry if the colour matches, else it's a hit
      if (p.el === s.hue) {
        const dx = b.x - s.x, dy = b.y - s.y, d = Math.hypot(dx, dy) || 1;
        s.vx = dx / d * REFLECT_SP; s.vy = dy / d * REFLECT_SP; s.ref = 1;
        snd(S_BLINK);
      } else {
        b.shots.splice(i, 1);
        p.vx += (px < b.x ? -1 : 1) * 170; p.vy = -150; // knockback
        snd(S_HURT);
      }
    } else if (s.x < -12 || s.x > W + 12 || s.y < -12 || s.y > 290) {
      b.shots.splice(i, 1);
    }
  }
}

export function drawBoss(ctx, b) {
  const TAU = Math.PI * 2;
  // shots (glowing colour orbs).
  for (const s of b.shots) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = COLORS[s.hue];
    ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.ref ? 4 : 5, 0, TAU); ctx.fill();
    if (s.ref) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, 1.6, 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;

  // Corrupted body: a dark jagged orb, flashing white when hurt.
  const r = 22, flash = b.hurtT > 0 && b.hurtT % 4 < 2;
  ctx.fillStyle = flash ? '#fff' : '#15121a';
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const a = i / 16 * TAU, rr = r + (i % 2 ? 4 : 0);
    ctx[i ? 'lineTo' : 'moveTo'](b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
  // Eye glowing in the colour it now demands.
  ctx.fillStyle = COLORS[b.hue];
  ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, TAU); ctx.fill();
  // HP pips above.
  for (let i = 0; i < b.hp; i++) {
    ctx.fillStyle = COLORS[i % 7];
    ctx.beginPath(); ctx.arc(b.x - (b.hp - 1) * 5 + i * 10, b.y - r - 10, 3, 0, TAU); ctx.fill();
  }
}
