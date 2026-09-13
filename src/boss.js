// Final boss — THE MONOCHROME: a relentless wall of un-colour that chases the
// unicorn from the left through the final runner. There is no trading blows;
// the exam is to OUTRUN it, using every skill (dash, slam, blink, double-jump,
// float, freeze, gravity-flip...) to clear each zone before the wall reaches
// you — each zone force-equips its own element, in a colour-lined stretch of
// the level, so there's nothing to pick, only to execute. Touch the wall and
// you're thrown back to the last checkpoint. Reach the far light and the
// world's colour is restored.

const H = 270;
const CHASE_SP = 72;    // px/s the wall creeps forward
const ACCEL = 1.5;      // px/s^2 — it slowly quickens, so you can't dawdle

export function makeBoss() { return { x: -44, sp: CHASE_SP, sp0: CHASE_SP, t: 0 }; }

// Advance the wall. onCaught() fires when its front overtakes the unicorn.
export function updateBoss(b, p, onCaught) {
  b.t++;
  b.sp += ACCEL / 60;
  b.x += b.sp / 60;
  if (b.x > p.x + p.w * 0.4) onCaught();
}

// Drawn in screen space; `camX` maps world -> screen.
export function drawBoss(ctx, b, camX) {
  const front = b.x - camX;
  if (front < -24) return;
  const TAU = Math.PI * 2;
  // Solid dark mass behind the writhing front edge.
  ctx.fillStyle = '#08080c';
  ctx.fillRect(0, 0, Math.max(0, front - 6), H);
  ctx.fillStyle = '#15131d';
  ctx.beginPath(); ctx.moveTo(0, 0);
  for (let y = 0; y <= H; y += 8) {
    const wob = Math.sin(y * 0.14 + b.t * 0.09) * 9 + Math.sin(y * 0.5 - b.t * 0.06) * 4;
    ctx.lineTo(front + wob, y);
  }
  ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  // A few hollow eyes glinting near the leading edge.
  for (let i = 0; i < 4; i++) {
    const ey = H * (0.2 + 0.2 * i) + Math.sin(b.t * 0.05 + i * 1.7) * 12;
    const ex = front - 16 - (i % 2) * 12;
    if (ex > 4) {
      ctx.fillStyle = '#d0d0dc'; ctx.beginPath(); ctx.arc(ex, ey, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex, ey, 1.4, 0, TAU); ctx.fill();
    }
  }
}
