// Distance-constrained point chain (Verlet integration) for the unicorn's tail
// and mane. Point 0 is pinned to an anchor on the body; the rest trail with
// inertia and a little gravity sag, then a few constraint passes pull each
// segment back to its rest length. This is what gives the rainbow strands their
// springy, momentum-driven flow as the unicorn runs and jumps.

// Create a chain of `n` points, each `seg` px apart, all stacked on the anchor.
export function makeChain(n, seg, ax, ay) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push({ x: ax, y: ay, px: ax, py: ay });
  return { pts, seg };
}

// Step the chain one fixed tick. `damp` keeps momentum (1 = frictionless);
// (fx, fy) is a per-tick force applied to every free point — used for a
// directional rest bias (so the tail streams backward, not straight down) plus
// the body's velocity, which makes the strand lag behind motion.
export function updateChain(c, ax, ay, damp, fx, fy) {
  const p = c.pts;
  // Pin the head to the anchor.
  p[0].x = ax; p[0].y = ay;
  // Verlet integrate the free points.
  for (let i = 1; i < p.length; i++) {
    const q = p[i];
    const vx = (q.x - q.px) * damp + fx;
    const vy = (q.y - q.py) * damp + fy;
    q.px = q.x; q.py = q.y;
    q.x += vx; q.y += vy;
  }
  // Satisfy segment-length constraints (a few passes = stiffer strand).
  for (let k = 0; k < 6; k++) {
    p[0].x = ax; p[0].y = ay;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy) || 0.0001;
      const diff = (d - c.seg) / d;
      // Head is pinned (i-1 == 0 stays put); move the tail point fully,
      // otherwise share the correction between both points.
      if (i - 1 === 0) {
        b.x -= dx * diff; b.y -= dy * diff;
      } else {
        const hx = dx * diff * 0.5, hy = dy * diff * 0.5;
        a.x += hx; a.y += hy; b.x -= hx; b.y -= hy;
      }
    }
  }
}
