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
