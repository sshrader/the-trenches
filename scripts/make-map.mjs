// Generates shared/map.json. Run: node scripts/make-map.mjs
// '.' mud, 'T' trench floor, '#' wall, 'c' cover (blocks movement and bullets), 'o' crater (walkable, decoration).
import fs from 'node:fs';

const W = 60;
const H = 34;
const TILE = 32;
const g = Array.from({ length: H }, () => Array(W).fill('.'));

// Walls around the edge.
for (let x = 0; x < W; x++) g[0][x] = g[H - 1][x] = '#';
for (let y = 0; y < H; y++) g[y][0] = g[y][W - 1] = '#';

// One side is built, then mirrored so both teams get an identical battlefield.
const left = Array.from({ length: H }, () => Array(W).fill(null));
const put = (x, y, c) => {
  if (x > 0 && y > 0 && x < W / 2 && y < H - 1) left[y][x] = c;
};
// Trench: floor columns 2..6, parapet (cover) at column 7 with a gap every 5 rows to climb out.
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x <= 6; x++) put(x, y, 'T');
  if (y % 5 !== 0) put(7, y, 'c');
}
// Cover in no-man's land: [x, y, w, h]
const cover = [
  [11, 4, 2, 1], [12, 9, 1, 3], [10, 14, 3, 1], [13, 18, 1, 2], [11, 23, 2, 1], [12, 28, 3, 1],
  [16, 6, 1, 1], [17, 12, 2, 2], [16, 21, 2, 2], [17, 27, 1, 1],
  [21, 9, 1, 2], [22, 16, 2, 1], [21, 24, 1, 2],
  [25, 13, 1, 3], [25, 19, 1, 3], [27, 7, 2, 1], [27, 26, 2, 1], [28, 3, 1, 2], [28, 29, 1, 2],
];
for (const [x, y, w, h] of cover) for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) put(x + dx, y + dy, 'c');
// Craters (walkable decoration)
for (const [x, y] of [[9, 7], [15, 16], [19, 4], [20, 19], [23, 12], [24, 22], [14, 11], [18, 30]]) put(x, y, 'o');

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W / 2; x++) {
    if (left[y][x]) {
      g[y][x] = left[y][x];
      g[y][W - 1 - x] = left[y][x];
    }
  }
}

const rows = g.map((r) => r.join(''));
const cx = (W * TILE) / 2;
const cy = (H * TILE) / 2;
const map = {
  tile: TILE,
  rows,
  capture: { x: cx, y: cy, r: 3.5 * TILE },
  spawns: {
    green: { x0: 1 * TILE, x1: 7 * TILE, y0: 2 * TILE, y1: (H - 2) * TILE },
    red: { x0: (W - 7) * TILE, x1: (W - 1) * TILE, y0: 2 * TILE, y1: (H - 2) * TILE },
  },
};
fs.writeFileSync(new URL('../shared/map.json', import.meta.url), JSON.stringify(map, null, 1));
console.log(rows.join('\n'));
