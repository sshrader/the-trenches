// Generates shared/map.json. Run: node scripts/make-map.mjs
// '.' mud, 'T' trench floor, '#' wall, 'c' cover (blocks movement and bullets), 'o' crater (walkable, decoration),
// 'B' ruined brick wall, 'K' tank wreck, 'Y' dead tree (all solid), 'f' broken floor inside a ruin (walkable).
import fs from 'node:fs';

const W = 120; // twice the size in each direction
const H = 68;
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
  if (y % 5 !== 0) put(7, y, "c");
}
// Scenery and supplies are placed first so the random cover works around them. Fixed seed: the map is always the same.
let seed = 1337;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const taken = new Set();
const free = (x, y, w, h) => {
  for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) if (taken.has(`${x + dx},${y + dy}`)) return false;
  return true;
};
const claim = (x, y, w, h) => {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) taken.add(`${x + dx},${y + dy}`);
};
const capX = W / 2;
const capY = H / 2;
const props = []; // drawn on top of the tiles: {kind, x, y, w, h} in tiles (left half; mirrored below)
const crates = []; // tile positions (left half)
const spot = (w, h, x0, x1, minCap) => {
  for (let i = 0; i < 400; i++) {
    const x = x0 + Math.floor(rnd() * (x1 - x0 - w));
    const y = 2 + Math.floor(rnd() * (H - 4 - h));
    if (x + w >= capX - 2) continue;
    if (Math.hypot(x + w / 2 - capX, y + h / 2 - capY) < minCap) continue;
    if (free(x, y, w, h)) return { x, y };
  }
  return null;
};
// The medic tent sits behind the capture point on each side.
claim(capX - 25, capY - 2, 4, 3);
props.push({ kind: 'tent', x: capX - 25, y: capY - 2, w: 4, h: 3 });
// Ruined buildings: 'B' brick walls with doorways and a broken wall, 'f' floor inside.
for (let i = 0; i < 6; i++) {
  const w = 6 + Math.floor(rnd() * 3);
  const h = 5 + Math.floor(rnd() * 2);
  const s0 = spot(w, h, 14, 54, 10);
  if (!s0) continue;
  claim(s0.x, s0.y, w, h);
  const doorY = Math.floor(h / 2);
  const hole = s0.x + 1 + Math.floor(rnd() * (w - 2));
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const edge = dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1;
    if (!edge) put(s0.x + dx, s0.y + dy, 'f');
    else if ((dx === 0 || dx === w - 1) && dy === doorY) put(s0.x + dx, s0.y + dy, 'f'); // doorways front and back
    else if (dy === 0 && s0.x + dx >= hole && s0.x + dx < hole + 2) put(s0.x + dx, s0.y + dy, 'f'); // blasted gap
    else put(s0.x + dx, s0.y + dy, 'B');
  }
  props.push({ kind: 'building', x: s0.x, y: s0.y, w, h });
}
// Wrecked tanks (3x2, solid), the barrel pointing at the enemy
for (let i = 0; i < 5; i++) {
  const s0 = spot(3, 2, 12, 54, 8);
  if (!s0) continue;
  claim(s0.x, s0.y, 3, 2);
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) put(s0.x + dx, s0.y + dy, 'K');
  props.push({ kind: 'tank', x: s0.x, y: s0.y, w: 3, h: 2 });
}
// Dead trees (solid trunk)
for (let i = 0; i < 26; i++) {
  const s0 = spot(1, 1, 9, 56, 5);
  if (!s0) continue;
  claim(s0.x, s0.y, 1, 1);
  put(s0.x, s0.y, 'Y');
  props.push({ kind: 'tree', x: s0.x, y: s0.y, w: 1, h: 1, v: Math.floor(rnd() * 3) });
}
// Resupply crates, a few on each side behind the front
for (let i = 0; i < 3; i++) {
  const s0 = spot(1, 1, 9, 24, 0);
  if (!s0) continue;
  claim(s0.x, s0.y, 1, 1);
  crates.push({ x: s0.x, y: s0.y });
}
// Cover in no-man's land: scattered walls and blocks
let placed = 0;
for (let tries = 0; tries < 4000 && placed < 120; tries++) {
  const horiz = rnd() < 0.5;
  const w = horiz ? 1 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2);
  const h = horiz ? 1 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 3);
  const x = 10 + Math.floor(rnd() * (W / 2 - 14)); // columns 10..~55, clear of the parapet and the centre line
  const y = 2 + Math.floor(rnd() * (H - 5));
  if (x + w >= capX - 1) continue;
  if (Math.hypot(x + w / 2 - capX, y + h / 2 - capY) < 5.5) continue; // keep the point itself fairly open
  if (!free(x, y, w, h)) continue;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    put(x + dx, y + dy, 'c');
    taken.add(`${x + dx},${y + dy}`);
  }
  placed++;
}
// A few sandbag rings right at the capture point so it can be held
for (const [x, y] of [[capX - 6, capY - 4], [capX - 6, capY + 3], [capX - 8, capY]]) if (!taken.has(`${x},${y}`)) put(x, y, 'c');
// Craters (walkable decoration)
for (let i = 0; i < 40; i++) {
  const x = 9 + Math.floor(rnd() * (W / 2 - 10));
  const y = 2 + Math.floor(rnd() * (H - 4));
  if (!taken.has(`${x},${y}`)) put(x, y, 'o');
}

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W / 2; x++) {
    if (left[y][x]) {
      g[y][x] = left[y][x];
      g[y][W - 1 - x] = left[y][x];
    }
  }
}

const rows = g.map((r) => r.join(''));
// Mirror the props and crates onto the other side. Tanks and the like face the enemy on both sides.
const mirrored = props.map((q) => ({ ...q, x: W - q.x - q.w, flip: true }));
const tile = (q) => ({ x: (q.x + 0.5) * TILE, y: (q.y + 0.5) * TILE });
const tentAt = (q) => ({ x: (q.x + q.w / 2) * TILE, y: (q.y + q.h / 2) * TILE });
const tentSrc = props.find((q) => q.kind === 'tent');
const tents = [
  { ...tentAt(tentSrc), team: 'green' },
  { x: W * TILE - tentAt(tentSrc).x, y: tentAt(tentSrc).y, team: 'red' },
];
const crateList = [
  ...crates.map((q) => ({ ...tile(q), team: 'green' })),
  ...crates.map((q) => ({ x: W * TILE - tile(q).x, y: tile(q).y, team: 'red' })),
];
const cx = (W * TILE) / 2;
const cy = (H * TILE) / 2;
const map = {
  tile: TILE,
  rows,
  props: [...props, ...mirrored],
  crates: crateList,
  tents,
  capture: { x: cx, y: cy, r: 3.5 * TILE },
  spawns: {
    green: { x0: 1 * TILE, x1: 7 * TILE, y0: 2 * TILE, y1: (H - 2) * TILE },
    red: { x0: (W - 7) * TILE, x1: (W - 1) * TILE, y0: 2 * TILE, y1: (H - 2) * TILE },
  },
};
fs.writeFileSync(new URL('../shared/map.json', import.meta.url), JSON.stringify(map, null, 1));
console.log(rows.join('\n'));
