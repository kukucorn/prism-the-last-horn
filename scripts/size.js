// Reports the built zip size against the 13 KB js13kGames budget.
import { statSync } from 'node:fs';

const LIMIT = 13312; // 13 * 1024
const bytes = statSync(new URL('../dist/game.zip', import.meta.url)).size;
const pct = ((bytes / LIMIT) * 100).toFixed(1);
const left = LIMIT - bytes;
const bar = '#'.repeat(Math.min(30, Math.round((bytes / LIMIT) * 30))).padEnd(30, '.');

console.log(`\n  game.zip  ${bytes} B / ${LIMIT} B  (${pct}%)`);
console.log(`  [${bar}]  ${left >= 0 ? left + ' B free' : (-left) + ' B OVER'}\n`);
process.exit(left >= 0 ? 0 : 1);
