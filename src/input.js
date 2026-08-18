// Input manager — maps physical keys to logical actions and exposes both
// "held" state and per-tick "just pressed / released" edges. The platformer
// (coyote time, jump buffering, element swap) is built on these edges.
//
// Edges are LATCHED in the event handlers, not derived by sampling held-state
// each tick: a tap that presses and releases inside a single frame still
// registers. The loop reads edges during update(), then calls input.clear()
// at the END of the update to consume them.

// Logical actions.
export const LEFT = 0;
export const RIGHT = 1;
export const JUMP = 2;
export const SKILL = 3;
export const SWAP = 4;
const COUNT = 5;

// Physical key (event.code) -> action. Multiple keys can share an action.
const MAP = {
  ArrowLeft: LEFT, KeyA: LEFT,
  ArrowRight: RIGHT, KeyD: RIGHT,
  ArrowUp: JUMP, KeyW: JUMP, Space: JUMP,
  KeyX: SKILL, KeyJ: SKILL,
  KeyC: SWAP, KeyL: SWAP, ShiftLeft: SWAP, ShiftRight: SWAP,
};

const held = new Uint8Array(COUNT);      // 1 while any bound key is down
const pressed = new Uint8Array(COUNT);   // latched on up->down transition
const released = new Uint8Array(COUNT);  // latched on down->up transition

addEventListener('keydown', (e) => {
  const a = MAP[e.code];
  if (a === undefined) return;
  if (!held[a]) { held[a] = 1; pressed[a] = 1; } // ignore OS auto-repeat
  e.preventDefault(); // stop Space/Arrows from scrolling the page
});
addEventListener('keyup', (e) => {
  const a = MAP[e.code];
  if (a === undefined) return;
  if (held[a]) { held[a] = 0; released[a] = 1; }
});
// Dropping focus should release everything so the unicorn doesn't run off.
addEventListener('blur', () => { held.fill(0); });

export const input = {
  down: (a) => held[a] === 1,
  pressed: (a) => pressed[a] === 1,
  released: (a) => released[a] === 1,
  // Horizontal axis convenience: -1, 0, or +1.
  axis: () => (held[RIGHT] - held[LEFT]),
  // Consume this tick's edges. Call once at the END of each fixed update.
  clear() {
    pressed.fill(0);
    released.fill(0);
  },
};
