// AABB collision. Bodies and solids are {x, y, w, h} with x,y at the top-left.
// Movement is resolved one axis at a time (move X, resolve overlaps; then move
// Y, resolve) which is the classic robust approach for tile/box platformers:
// it avoids corner-snagging and yields clean wall/floor/ceiling contact flags.

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// Move body along X by dx against solids, resolving penetrations.
// Returns -1 if it hit a wall on the left, +1 on the right, 0 otherwise.
export function moveX(body, dx, solids) {
  body.x += dx;
  let hit = 0;
  for (const s of solids) {
    if (!overlap(body, s)) continue;
    if (dx > 0) { body.x = s.x - body.w; hit = 1; }
    else if (dx < 0) { body.x = s.x + s.w; hit = -1; }
  }
  return hit;
}

// Move body along Y by dy against solids, resolving penetrations.
// Returns +1 if it landed on a floor, -1 if it bonked a ceiling, 0 otherwise.
export function moveY(body, dy, solids) {
  body.y += dy;
  let hit = 0;
  for (const s of solids) {
    if (!overlap(body, s)) continue;
    if (dy > 0) { body.y = s.y - body.h; hit = 1; }
    else if (dy < 0) { body.y = s.y + s.h; hit = -1; }
  }
  return hit;
}
