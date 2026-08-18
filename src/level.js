// String-based tilemap. Levels are arrays of equal-width rows; each character
// is one TILE. This keeps stages tiny (a few hundred bytes of text) instead of
// hand-written coordinate arrays. The parser greedily merges horizontal runs of
// solid tiles into single wide AABBs, so a 40-wide floor is one collision box,
// not forty — cheaper to test against and to compress.
//
// Legend:  #=solid  O=breakable rock  ^=spike(hazard)  S=spawn  G=goal  .=empty
export const TILE = 12;

const LEVELS = [
  [
    '........................................', // 0
    '........................................', // 1
    '........................................', // 2
    '........................................', // 3
    '........................................', // 4
    '............................G...........', // 5  goal
    '..........................######........', // 6  goal platform
    '........................................', // 7
    '........................................', // 8
    '...............................####.....', // 9  P4
    '........................................', // 10
    '........................................', // 11
    '...........................####.........', // 12 P3
    '........................................', // 13
    '........................................', // 14
    '...............................####.....', // 15 P2
    '........................................', // 16
    '........................................', // 17
    '...........................####.........', // 18 P1
    '..........OO............................', // 19 rock mound (top)
    '..S.....OOOOOO.....^^^^^................', // 20 spawn, rocks, spike pit
    '########################################', // 21 ground
  ],
];

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
  return { solids, hazards, rocks, spawn, goal, w: rows[0].length * tile, h: rows.length * tile };
}

export const level = parseLevel(LEVELS[0], TILE);
