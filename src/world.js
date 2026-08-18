// Day 2 hand-made test arena of AABB solids. Phase 2 replaces this with the
// string-tilemap parser; for now it exercises floors, walls, a ledge to run
// off (coyote time), a gap to buffer a jump into, and a low block to bonk.
export const SOLIDS = [
  { x: 0, y: 250, w: 300, h: 20 },   // main floor (left/center)
  { x: 360, y: 250, w: 120, h: 20 }, // floor after a gap
  { x: 150, y: 210, w: 10, h: 40 },  // short wall rising from the floor
  { x: 80, y: 210, w: 60, h: 10 },   // low platform
  { x: 210, y: 175, w: 70, h: 10 },  // mid platform
  { x: 330, y: 140, w: 80, h: 10 },  // high platform (a ledge to walk off)
  { x: 235, y: 120, w: 30, h: 10 },  // low block to bonk your head on
];

export const SPAWN = { x: 40, y: 234 };
