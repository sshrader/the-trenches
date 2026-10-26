// Generates shared/forest.json: a forest battlefield, the same size and layout rules as the city (so every class special still works).
// Tiles: '.' grass, 'd' dirt path (walkable decoration), 'w' shallow creek (walkable decoration), 'g' BUSH (walkable; hides the soldier standing in it
// until an enemy gets close), 'T' safe-zone camp floor, '#' dense forest edge, 'B' tree (solid, stops every bullet), 'Y' boulder (solid, sniper rounds punch through),
// 'c' fallen log (solid, sniper rounds punch through). The simulation only needs the solid letters, so it plays like the city map.
// Run: node scripts/make-forest.mjs
import fs from 'node:fs';

const W = 120;
const H = 68;
const TILE = 32;
const HALF = W / 2;
const city = JSON.parse(fs.readFileSync(new URL('../shared/map.json', import.meta.url), 'utf8'));

let seed = 777;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// The left half is built, then mirrored so both sides get the same ground.
const L = Array.from({ length: H }, () => Array(HALF).fill('.'));
const inHalf = (x, y) => x > 0 && y > 0 && x < HALF && y < H - 1;
const put = (x, y, c) => { if (inHalf(x, y)) L[y][x] = c; };
const get = (x, y) => (inHalf(x, y) ? L[y][x] : '#');

const AV = [[15, 18], [32, 35], [49, 52]]; // the three avenues (same rows as the city's streets)
const BLOCKS = [[2, 14], [19, 31], [36, 48], [53, 65]]; // forest between them
const X0 = 13; // the forest starts here (the base exit, columns 8..12, stays open)

// 1. Forest blocks: random trees smoothed into groves, so they come out as clumps with gaps rather than noise.
for (const [ya, yb] of BLOCKS) {
  const h = yb - ya + 1;
  let grid = Array.from({ length: h }, () => Array.from({ length: HALF - X0 }, () => rnd() < 0.43));
  for (let step = 0; step < 3; step++) {
    grid = grid.map((row, y) => row.map((_, x) => {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const yy = y + dy, xx = x + dx;
        n += yy < 0 || yy >= h || xx < 0 ? 1 : xx >= grid[0].length ? 0 : grid[yy][xx] ? 1 : 0;
      }
      return n >= 5 || (n === 4 && grid[y][x]);
    }));
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < grid[0].length; x++) if (grid[y][x]) put(X0 + x, ya + y, 'B');
  // trails through the grove, so nobody has to go the long way round: wiggly, three tiles wide, linking the avenues either side
  const trails = ri(5, 6);
  for (let t = 0; t < trails; t++) {
    let tx = 17 + Math.floor(((t + 0.5) * (HALF - 20)) / trails) + ri(-3, 3);
    for (let y = ya - 1; y <= yb + 1; y++) {
      tx += rnd() < 0.3 ? ri(-1, 1) : 0;
      for (let dx = -1; dx <= 2; dx++) if (get(tx + dx, y) === 'B') put(tx + dx, y, rnd() < 0.5 ? 'd' : '.'); // four tiles wide
    }
  }
}

// Lone trees and thin spurs snag people on the way past: keep only trees that are part of a real clump (3+ tree neighbours).
for (let pass = 0; pass < 2; pass++) {
  const kill = [];
  for (let y = 2; y < H - 2; y++) for (let x = X0; x < HALF - 1; x++) {
    if (get(x, y) !== 'B') continue;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && get(x + dx, y + dy) === 'B') n++;
    if (n < 3) kill.push([x, y]);
  }
  for (const [x, y] of kill) put(x, y, '.');
}

// 2. Avenues: open ground with a dirt track down the middle and a few logs and boulders for cover (always leaving three open rows).
for (const [a, b] of AV) {
  for (let y = a; y <= b; y++) for (let x = X0; x < HALF; x++) put(x, y, '.');
  let wob = 0;
  for (let x = X0; x < HALF; x++) {
    wob += rnd() < 0.15 ? ri(-1, 1) : 0;
    wob = Math.max(-1, Math.min(1, wob));
    for (const dy of [1, 2]) put(x, a + dy - (wob > 0 ? 0 : wob < 0 ? 1 : 0), 'd');
  }
}

// 3. The plaza: a clearing around the point, with boulders and logs to fight behind and bushes at the edges.
const cx = HALF, cy = 34;
for (let y = cy - 12; y <= cy + 12; y++) for (let x = cx - 13; x < HALF; x++) {
  const d = Math.hypot((x - cx) * 0.9, y - cy);
  if (d < 11 && ['B', 'c', 'Y'].includes(get(x, y))) put(x, y, '.');
}
for (const [x, y] of [[56, 30], [56, 38], [53, 33], [53, 35]]) put(x, y, 'Y');
for (const [x, y, n] of [[51, 29, 3], [51, 38, 3]]) for (let i = 0; i < n; i++) put(x, y + i, 'c');
for (const [x, y] of [[55, 26], [55, 42], [49, 27], [49, 41]]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Math.abs(dx) + Math.abs(dy) <= 2 && get(x + dx, y + dy) !== 'B') put(x + dx, y + dy, 'g');

// 4. Creek: a wavy band of shallow water down the field (you can wade it), with boulders on the banks.
for (let y = 1; y < H - 1; y++) {
  const mx = 30 + Math.round(2.2 * Math.sin(y / 5.5) + 1.2 * Math.sin(y / 2.3));
  for (let x = mx - 1; x <= mx + 1; x++) put(x, y, 'w');
  if (rnd() < 0.2) put(mx + (rnd() < 0.5 ? -2 : 2), y, 'Y');
}

// 5. Bushes: patches in the forest and along the edge of the avenues, so there is always somewhere to wait in ambush.
const bushBlob = (x, y, r) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy <= r * r + 1 && rnd() < 0.85 && ['.', 'd'].includes(get(x + dx, y + dy))) put(x + dx, y + dy, 'g');
  }
};
for (let i = 0; i < 55; i++) bushBlob(ri(X0 + 1, HALF - 2), ri(3, H - 4), ri(1, 2));
for (const [a, b] of AV) for (let x = X0 + 2; x < HALF - 3; x += ri(5, 9)) { bushBlob(x, rnd() < 0.5 ? a - 1 : b + 1, 1); }

// 6. Boulders and logs in the open.
for (let y = 2; y < H - 2; y++) for (let x = X0; x < HALF - 1; x++) {
  if (get(x, y) !== '.') continue;
  if (rnd() < 0.012) { put(x, y, 'Y'); if (rnd() < 0.5) put(x + 1, y, 'Y'); }
}
for (let i = 0; i < 46; i++) {
  const x = ri(X0 + 2, HALF - 6), y = ri(3, H - 4), len = ri(2, 4), vert = rnd() < 0.4;
  let ok = true;
  for (let k = 0; k < len; k++) if (!['.', 'd'].includes(get(x + (vert ? 0 : k), y + (vert ? k : 0)))) ok = false;
  if (ok) for (let k = 0; k < len; k++) put(x + (vert ? 0 : k), y + (vert ? k : 0), 'c');
}

// 7. The bases: the same camp as the city (floor in columns 1..6, a log barricade line in column 7 with wide gaps), and a clear way out.
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x <= 6; x++) put(x, y, 'T');
  if (y % 6 <= 1) put(7, y, 'c');
  for (let x = 8; x < X0; x++) put(x, y, rnd() < 0.06 && !(y % 6 <= 2) ? 'g' : (x === 10 ? 'd' : '.'));
}
for (let y = 1; y < H - 1; y++) for (let x = 8; x < X0; x++) if (['B', 'c', 'Y'].includes(get(x, y))) put(x, y, '.');

// 8. Sniper nests: a log-and-rock pocket on the edge of the two outer avenues, lane cleared to the plaza (sniper rounds punch through logs and rocks).
const nests = [];
for (const [sx, wallY, inner] of [[14, 15, [16, 17]], [14, 52, [50, 51]]]) {
  for (const ly of inner) for (let x = sx + 3; x <= 58; x++) if (['c', 'Y', 'B'].includes(get(x, ly))) put(x, ly, '.');
  for (let x = sx; x <= sx + 2; x++) put(x, wallY, 'c');
  for (const iy of inner) { put(sx, iy, 'c'); for (let x = sx + 1; x <= sx + 2; x++) put(x, iy, '.'); }
  nests.push({ x: (sx + 1.5) * TILE, y: ((inner[0] + inner[1] + 1) / 2) * TILE });
}

// 9. Supplies: the clinic tent and the crates are in the same places as in the city; keep the ground under and around them open.
const tentSrc = city.props.find((p) => p.kind === 'tent' && !p.flip);
for (let y = tentSrc.y - 1; y <= tentSrc.y + tentSrc.h; y++) for (let x = tentSrc.x - 1; x <= tentSrc.x + tentSrc.w; x++) put(x, y, '.');
for (const q of [...city.crates, ...city.tents].filter((c) => c.team === 'green')) {
  const tx = Math.floor(q.x / TILE), ty = Math.floor(q.y / TILE);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(tx + dx, ty + dy, '.');
}

// 10. Join the halves.
const g = Array.from({ length: H }, () => Array(W).fill('.'));
for (let y = 0; y < H; y++) for (let x = 0; x < HALF; x++) {
  let c = L[y][x];
  if (y === 0 || y === H - 1 || x === 0) c = '#';
  g[y][x] = c;
  g[y][W - 1 - x] = c;
}
for (let x = 0; x < W; x++) g[0][x] = g[H - 1][x] = '#';
for (let y = 0; y < H; y++) g[y][0] = g[y][W - 1] = '#';
// a thick tree line round the edge so the field feels enclosed
const rows = g.map((r) => r.join(''));

// Checks: both bases are joined by open ground, and every open tile is reachable (no sealed hollows).
const solid = (c) => '#cBYK'.includes(c);
const seen = new Set(['3,34']);
const queue = [[3, 34]];
while (queue.length) {
  const [x, y] = queue.pop();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(`${nx},${ny}`) || solid(rows[ny][nx])) continue;
    seen.add(`${nx},${ny}`);
    queue.push([nx, ny]);
  }
}
if (!seen.has(`${W - 4},34`)) throw new Error('the two sides are not connected');
let sealed = 0;
rows.forEach((r, y) => [...r].forEach((c, x) => { if (!solid(c) && !seen.has(`${x},${y}`)) sealed++; }));
console.log(`sealed open tiles: ${sealed}`);
// Fill sealed pockets with trees so nobody sees an unreachable hollow.
const out = rows.map((r, y) => [...r].map((c, x) => (!solid(c) && !seen.has(`${x},${y}`) ? 'B' : c)).join(''));

const props = [
  { ...tentSrc },
  { ...city.props.find((p) => p.kind === 'tent' && p.flip) },
];
const map = {
  name: 'The Forest',
  theme: 'forest',
  tile: TILE,
  rows: out,
  props,
  roads: { v: [], h: [] },
  crates: city.crates,
  tents: city.tents,
  nests: [...nests.map((q) => ({ ...q, team: 'green' })), ...nests.map((q) => ({ x: W * TILE - q.x, y: q.y, team: 'red' }))],
  capture: city.capture,
  hardpoints: [{"x": 1920, "y": 1088, "r": 112}, {"x": 1232, "y": 1080, "r": 112}, {"x": 1880, "y": 412, "r": 112}, {"x": 2608, "y": 1080, "r": 112}, {"x": 1912, "y": 1848, "r": 112}], // the Hardpoint zones, in rotation order (centre, west, north, east, south)
  spawns: city.spawns,
};
fs.writeFileSync(new URL('../shared/forest.json', import.meta.url), JSON.stringify(map, null, 1));
const count = {};
for (const r of out) for (const c of r) count[c] = (count[c] || 0) + 1;
console.log(count);
console.log(out.join('\n'));
