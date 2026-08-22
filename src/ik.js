// Two-bone inverse kinematics for the unicorn's legs. Given a fixed hip, a foot
// target, and the two bone lengths, it finds the knee/hock position. This is the
// closed-form circle-intersection solution — for a 2-link chain FABRIK converges
// to exactly this, so we skip the iteration and get a stable joint in one shot.
//
// `bend` (+1/-1) selects which side the joint pops out to, so front legs can
// bend backward and hind legs forward like a real quadruped.
// Writes the result into `out` ({x,y}) and returns it.
export function solve2(hipX, hipY, footX, footY, l1, l2, bend, out) {
  const dx = footX - hipX, dy = footY - hipY;
  const len = Math.hypot(dx, dy) || 0.0001;
  const ux = dx / len, uy = dy / len;
  // Clamp reach so the leg can't over-extend (target beyond l1+l2) or fold
  // through itself (target closer than |l1-l2|).
  const dmax = l1 + l2 - 0.01, dmin = Math.abs(l1 - l2) + 0.01;
  const d = len > dmax ? dmax : len < dmin ? dmin : len;
  // Distance from hip to the knee's projection onto the hip->foot line.
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const baseX = hipX + ux * a, baseY = hipY + uy * a;
  // Perpendicular offset picks the knee side.
  out.x = baseX + -uy * h * bend;
  out.y = baseY + ux * h * bend;
  return out;
}

// FABRIK for a multi-link leg (>2 segments): a horse leg is really 3 bones
// (upper / mid / cannon) and fore vs hind legs fold in different directions.
// `pts` (length n) must be pre-seeded — typically a straight line from the root
// toward the foot, nudged sideways so the chain folds the anatomically correct
// way — then this iterates it onto the foot target. Root stays pinned.
export function fabrik(pts, lens, rx, ry, tx, ty) {
  const n = pts.length;
  let total = 0;
  for (const l of lens) total += l;
  const dx = tx - rx, dy = ty - ry, d = Math.hypot(dx, dy) || 1e-4;
  if (d >= total) {
    // Out of reach: lay the chain straight toward the target.
    const ux = dx / d, uy = dy / d;
    pts[0].x = rx; pts[0].y = ry;
    for (let i = 1; i < n; i++) {
      pts[i].x = pts[i - 1].x + ux * lens[i - 1];
      pts[i].y = pts[i - 1].y + uy * lens[i - 1];
    }
    return;
  }
  for (let it = 0; it < 4; it++) {
    // Backward reach: pin the tip to the target, pull each joint inward.
    pts[n - 1].x = tx; pts[n - 1].y = ty;
    for (let i = n - 2; i >= 0; i--) {
      let vx = pts[i].x - pts[i + 1].x, vy = pts[i].y - pts[i + 1].y;
      const s = lens[i] / (Math.hypot(vx, vy) || 1e-4);
      pts[i].x = pts[i + 1].x + vx * s; pts[i].y = pts[i + 1].y + vy * s;
    }
    // Forward reach: pin the root, push each joint outward.
    pts[0].x = rx; pts[0].y = ry;
    for (let i = 1; i < n; i++) {
      let vx = pts[i].x - pts[i - 1].x, vy = pts[i].y - pts[i - 1].y;
      const s = lens[i - 1] / (Math.hypot(vx, vy) || 1e-4);
      pts[i].x = pts[i - 1].x + vx * s; pts[i].y = pts[i - 1].y + vy * s;
    }
  }
}
