// Generates shared/industry.json: a container yard, the same size and layout rules as the city (so every class special still works).
// Tiles: '.' concrete yard, 'a' asphalt lane, 'r' rail track (walkable), 'f' warehouse floor (walkable), 'T' base floor,
// '#' perimeter fence and warehouse walls (solid, stop every bullet), 'B' shipping container (solid, stops every bullet),
// 'c' low cover: jersey barriers, pallet stacks, crates (solid, sniper rounds punch through), 'Y' machinery and drums (solid, sniper rounds punch through),
// 'K' wrecked truck or forklift (solid, low: a sniper on a tower shoots over it). The simulation only needs the solid letters.
// Run: node scripts/make-industry.mjs
import fs from 'node:fs';

const W = 120;
const H = 68;
const TILE = 32;
const HALF = W / 2;
const city = JSON.parse(fs.readFileSync(new URL('../shared/map.json', import.meta.url), 'utf8'));

let seed = 4242;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// The left half is built, then mirrored so both sides get the same ground.
const L = Array.from({ length: H }, () => Array(HALF).fill('.'));
const inHalf = (x, y) => x > 0 && y > 0 && x < HALF && y < H - 1;
const put = (x, y, c) => { if (inHalf(x, y)) L[y][x] = c; };
const get = (x, y) => (inHalf(x, y) ? L[y][x] : '#');
const box = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };

const AV = [[15, 18], [32, 35], [49, 52]]; // the three lanes (same rows as the city's streets)
const BLOCKS = [[2, 14], [19, 31], [36, 48], [53, 65]]; // container stacks between them
const X0 = 13; // the yard starts here (the base exit, columns 8..12, stays open)

// 1. Container stacks: rows of containers with aisles between the rows and gaps every few containers.
for (const [ya, yb] of BLOCKS) {
  for (let ly = ya; ly + 1 <= yb - 1; ly += 3) { // a row of containers is 2 tiles tall; the tile row after it is an aisle
    let x = X0 + ri(0, 4);
    while (x < HALF - 2) {
      const len = ri(5, 7);
      if (rnd() < 0.2) { x += len + 1; continue; } // an empty slot: a little courtyard
      box(x, ly, Math.min(len, HALF - 1 - x), 2, 'B');
      x += len + (rnd() < 0.45 ? 3 : 1); // gaps: a squeeze (1) or a proper cut-through (3)
    }
  }
}

// 2. Warehouses: walled halls with wide doors, a floor, and pallet racks inside leaving aisles.
const warehouse = (x0, y0, w, h, doors) => {
  box(x0, y0, w, h, '#');
  box(x0 + 1, y0 + 1, w - 2, h - 2, 'f');
  for (const [dx, dy, dw, dh] of doors) box(x0 + dx, y0 + dy, dw, dh, 'f');
  for (let ry = y0 + 2; ry < y0 + h - 3; ry += 3) for (let rx = x0 + 3; rx < x0 + w - 4; rx += 7) if (rnd() < 0.8) box(rx, ry, 4, 1, 'c');
  box(x0 + w - 4, y0 + 2, 2, 2, 'Y'); // a machine in the corner
};
// clear room for them first
box(20, 19, 20, 13, '.'); // block 2 (y 19..31)
warehouse(21, 20, 18, 11, [[0, 4, 1, 3], [17, 4, 1, 3], [6, 0, 3, 1], [6, 10, 3, 1]]);
box(26, 36, 16, 13, '.'); // block 3 (y 36..48)
warehouse(27, 37, 14, 11, [[0, 4, 1, 3], [13, 4, 1, 3], [5, 0, 3, 1], [5, 10, 3, 1]]);

// 3. Lanes: asphalt, with rails along the two outer ones; low cover along the edges, a few parked wrecks.
for (const [a, b] of AV) {
  for (let y = a; y <= b; y++) for (let x = X0; x < HALF; x++) put(x, y, 'a');
}
for (const [a, b, rails] of [[15, 18, [16, 17]], [49, 52, [50, 51]]]) for (const y of rails) for (let x = X0; x < HALF; x++) put(x, y, 'r');
for (const [a, b] of AV) {
  for (let x = X0 + 4; x < HALF - 3; x += ri(6, 10)) {
    const edge = rnd() < 0.5 ? a : b; // against a container row, never in the middle two rows
    const kind = rnd();
    if (kind < 0.45) box(x, edge, 2, 1, 'c'); // jersey barrier
    else if (kind < 0.75) put(x, edge, 'Y'); // drum
    else box(x, edge, 3, 2, 'K'); // parked truck
  }
}
// gantry crane legs on the outer lanes: heavy posts on the block edges either side
for (const x of [22, 36, 50]) for (const y of [14, 19, 48, 53]) { box(x, y, 2, 1, 'Y'); }

// 4. The plaza: a clearing round the point, with machinery and barriers to fight behind.
const cx = HALF, cy = 34;
for (let y = cy - 12; y <= cy + 12; y++) for (let x = cx - 13; x < HALF; x++) {
  const d = Math.hypot((x - cx) * 0.9, y - cy);
  if (d < 11 && ['B', 'c', 'Y', 'K', '#', 'f'].includes(get(x, y))) put(x, y, d < 8 ? '.' : 'a');
}
for (const [x, y] of [[56, 30], [56, 38], [53, 33], [53, 35]]) box(x, y, 2, 1, 'Y');
for (const [x, y, n] of [[51, 29, 3], [51, 38, 3]]) for (let i = 0; i < n; i++) put(x, y + i, 'c');
box(55, 25, 2, 2, 'B'); box(55, 43, 2, 2, 'B'); // a container on its end either side
box(48, 31, 3, 2, 'K'); box(48, 36, 3, 2, 'K'); // wrecked forklifts
for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 9; x < HALF; x++) if (get(x, y) !== 'a' && get(x, y) !== '.') put(x, y, 'a');

// 5. Debris and drums out in the yard.
for (let y = 2; y < H - 2; y++) for (let x = X0; x < HALF - 1; x++) {
  if (get(x, y) !== '.') continue;
  if (rnd() < 0.05) put(x, y, rnd() < 0.5 ? 'Y' : 'c');
}

// 6. The bases: the same camp as the city (floor in columns 1..6, a barrier line in column 7 with wide gaps), and a clear way out.
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x <= 6; x++) put(x, y, 'T');
  if (y % 6 <= 1) put(7, y, 'c');
  for (let x = 8; x < X0; x++) put(x, y, x >= 9 && x <= 11 && ((y >= AV[0][0] && y <= AV[0][1]) || (y >= AV[1][0] && y <= AV[1][1]) || (y >= AV[2][0] && y <= AV[2][1])) ? 'a' : '.');
}
for (let y = 1; y < H - 1; y++) for (let x = 8; x < X0; x++) if (['B', 'c', 'Y', 'K', '#'].includes(get(x, y))) put(x, y, '.');

// 7. Sniper nests: a barrier pocket on the edge of the two outer lanes, lane cleared to the plaza (sniper rounds punch through barriers).
const nests = [];
for (const [sx, wallY, inner] of [[14, 15, [16, 17]], [14, 52, [50, 51]]]) {
  for (const ly of inner) for (let x = sx + 3; x <= 58; x++) if (['c', 'Y', 'B', 'K'].includes(get(x, ly))) put(x, ly, 'r');
  for (let x = sx; x <= sx + 2; x++) put(x, wallY, 'c');
  for (const iy of inner) { put(sx, iy, 'c'); for (let x = sx + 1; x <= sx + 2; x++) put(x, iy, 'r'); }
  nests.push({ x: (sx + 1.5) * TILE, y: ((inner[0] + inner[1] + 1) / 2) * TILE });
}

// 8. Supplies: the clinic tent and the crates are in the same places as in the city; keep the ground under and around them open.
const tentSrc = city.props.find((p) => p.kind === 'tent' && !p.flip);
for (let y = tentSrc.y - 1; y <= tentSrc.y + tentSrc.h; y++) for (let x = tentSrc.x - 1; x <= tentSrc.x + tentSrc.w; x++) put(x, y, '.');
for (const q of [...city.crates, ...city.tents].filter((c) => c.team === 'green')) {
  const tx = Math.floor(q.x / TILE), ty = Math.floor(q.y / TILE);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(tx + dx, ty + dy, '.');
}

// 9. Join the halves.
const g = Array.from({ length: H }, () => Array(W).fill('.'));
for (let y = 0; y < H; y++) for (let x = 0; x < HALF; x++) {
  let c = L[y][x];
  if (y === 0 || y === H - 1 || x === 0) c = '#';
  g[y][x] = c;
  g[y][W - 1 - x] = c;
}
for (let x = 0; x < W; x++) g[0][x] = g[H - 1][x] = '#';
for (let y = 0; y < H; y++) g[y][0] = g[y][W - 1] = '#';
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
// Fill sealed pockets with containers so nobody sees an unreachable hollow.
const out = rows.map((r, y) => [...r].map((c, x) => (!solid(c) && !seen.has(`${x},${y}`) ? 'B' : c)).join(''));

const map = {
  name: 'Industry',
  theme: 'industry',
  tile: TILE,
  rows: out,
  props: [{ ...tentSrc }, { ...city.props.find((p) => p.kind === 'tent' && p.flip) }],
  roads: { v: [], h: [] },
  crates: city.crates,
  tents: city.tents,
  nests: [...nests.map((q) => ({ ...q, team: 'green' })), ...nests.map((q) => ({ x: W * TILE - q.x, y: q.y, team: 'red' }))],
  capture: city.capture,
  spawns: city.spawns,
};
fs.writeFileSync(new URL('../shared/industry.json', import.meta.url), JSON.stringify(map, null, 1));
const count = {};
for (const r of out) for (const c of r) count[c] = (count[c] || 0) + 1;
console.log(count);
console.log(out.map((r) => r.slice(0, 64)).join('\n'));
