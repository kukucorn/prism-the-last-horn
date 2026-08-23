// String-based tilemap. Levels are arrays of equal-width rows; each character
// is one TILE. This keeps stages tiny (a few hundred bytes of text) instead of
// hand-written coordinate arrays. The parser greedily merges horizontal runs of
// solid tiles into single wide AABBs, so a 40-wide floor is one collision box,
// not forty — cheaper to test against and to compress.
//
// Legend:  #=solid  O=breakable rock  ^=spike(hazard)  S=spawn  G=goal  .=empty
export const TILE = 12;

// Each stage purifies one colour (revealed on clear = COLORS[stageIndex]).
const LEVELS = [
  [
    '########################################', // 0  ceiling (stops gravity-flip)
    '#......................................#', // 1
    '#......................................#', // 2
    '#......................................#', // 3
    '#......................................#', // 4
    '#...........................G..........#', // 5  goal
    '#.........................######.......#', // 6  goal platform
    '#......................................#', // 7
    '#......................................#', // 8
    '#..............................####....#', // 9  P4
    '#......................................#', // 10
    '#......................................#', // 11
    '#..........................####........#', // 12 P3
    '#......................................#', // 13
    '#......................................#', // 14
    '#..............................####....#', // 15 P2
    '#......................................#', // 16
    '#......................................#', // 17
    '#..........................####........#', // 18 P1
    '#.........OO...........................#', // 19 rock mound (top)
    '#.S.....OOOOOO.....^^^^^...............#', // 20 spawn, rocks, spike pit
    '########################################', // 21 ground (+ side walls)
  ],
  [
    '########################################', // 0  ceiling
    '#......................................#', // 1
    '#...G..................................#', // 2  goal
    '#..#####...............................#', // 3  goal platform
    '#......................................#', // 4
    '#......................................#', // 5
    '#........#####.........................#', // 6  step 5
    '#......................................#', // 7
    '#......................................#', // 8
    '#..............#####...................#', // 9  step 4
    '#......................................#', // 10
    '#......................................#', // 11
    '#...................#####..............#', // 12 step 3
    '#......................................#', // 13
    '#......................................#', // 14
    '#........................#####.........#', // 15 step 2
    '#......................................#', // 16
    '#......................................#', // 17
    '#.............................#####....#', // 18 step 1
    '#......................................#', // 19
    '#..............^^^^^^...............S..#', // 20 spike pit + spawn
    '########################################', // 21 ground
  ],
];

export const LEVEL_COUNT = LEVELS.length;

// Parse a row array into world geometry. Returns pixel-space rects/points.
export function parseLevel(rows, tile) {
  const solids = [], hazards = [], rocks = [];
  let spawn = { x: tile, y: tile }, goal = null;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '#') {
        // Extend across the contiguous run of solids, emit one merged box.
        let w = 1;
        while (row[x + w] === '#') w++;
        solids.push({ x: x * tile, y: y * tile, w: w * tile, h: tile });
        x += w - 1;
      } else if (c === 'O') {
        // Rocks stay per-tile (unmerged) so an Earth slam can destroy them one by one.
        rocks.push({ x: x * tile, y: y * tile, w: tile, h: tile });
      } else if (c === '^') {
        hazards.push({ x: x * tile, y: y * tile, w: tile, h: tile });
      } else if (c === 'S') {
        // Spawn is a ground point: the bottom-center of the marked tile.
        spawn = { x: x * tile + tile / 2, y: (y + 1) * tile };
      } else if (c === 'G') {
        goal = { x: x * tile, y: y * tile, w: tile, h: tile };
      }
    }
  }
  // Second pass: merge vertically-adjacent solids that share x and width
  // (e.g. the full-height side walls) into single tall boxes — cheaper
  // collision and fewer bytes of geometry. Repeat until nothing more merges.
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < solids.length; i++)
      for (let j = solids.length - 1; j > i; j--) {
        const a = solids[i], b = solids[j];
        if (a.x === b.x && a.w === b.w && (a.y + a.h === b.y || b.y + b.h === a.y)) {
          a.y = Math.min(a.y, b.y); a.h += b.h; solids.splice(j, 1); changed = true;
        }
      }
  }

  return { solids, hazards, rocks, spawn, goal, w: rows[0].length * tile, h: rows.length * tile };
}

// Parse and return stage `i` (wraps around past the last stage).
export function loadLevel(i) {
  return parseLevel(LEVELS[i % LEVEL_COUNT], TILE);
}
