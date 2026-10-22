// Generates shared/map.json: a ruined city, streets and buildings. Run: node scripts/make-map.mjs
// '.' street, 'T' safe-zone floor, '#' boundary wall, 'c' barricade / junk (blocks movement and bullets), 'o' pothole (walkable decoration),
// 'B' ruined building wall, 'K' wrecked vehicle, 'Y' rubble pile (all solid), 'f' floor inside a building (walkable).
// The tile letters are unchanged from the old trench map, so the simulation does not care what the art looks like.
import fs from 'node:fs';

const W = 120;
const H = 68;
const TILE = 32;
const g = Array.from({ length: H }, () => Array(W).fill('.'));

for (let x = 0; x < W; x++) g[0][x] = g[H - 1][x] = '#';
for (let y = 0; y < H; y++) g[y][0] = g[y][W - 1] = '#';

// One half is built, then mirrored so both sides get the same city.
const left = Array.from({ length: H }, () => Array(W).fill(null));
const put = (x, y, c) => {
  if (x > 0 && y > 0 && x < W / 2 && y < H - 1) left[y][x] = c;
};
const get = (x, y) => (x > 0 && y > 0 && x < W / 2 && y < H - 1 ? left[y][x] : null);

// The safe zone: floor columns 1..6 and a barricade line at column 7 with a gap every 5 rows.
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x <= 6; x++) put(x, y, 'T');
  if (y % 5 !== 0) put(7, y, 'c');
}

let seed = 4242;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const capX = W / 2;
const capY = H / 2;
const taken = new Set(); // tiles used by buildings, cars and other solid scenery
const claim = (x, y, w, h) => {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) taken.add(`${x + dx},${y + dy}`);
};
const isFree = (x, y, w, h, pad = 0) => {
  for (let dy = -pad; dy < h + pad; dy++) for (let dx = -pad; dx < w + pad; dx++) if (taken.has(`${x + dx},${y + dy}`)) return false;
  return true;
};
const props = [];

// Street grid (left half): vertical streets by x range, horizontal streets by y range.
const VST = [[8, 11], [24, 27], [41, 44], [56, 59]];
const HST = [[15, 18], [32, 35], [49, 52]];
const BX = [[12, 23], [28, 40], [45, 55]]; // block columns between the vertical streets
const BY = [[2, 14], [19, 31], [36, 48], [53, 65]]; // block rows between the horizontal streets

/** A ruined building with a wall ring, a floor, an inner wall with a door, doorways to the streets and blasted gaps. */
function building(x0, y0, w, h) {
  claim(x0 - 1, y0 - 1, w + 2, h + 2);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const edge = dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1;
      put(x0 + dx, y0 + dy, edge ? 'B' : 'f');
    }
  }
  // inner wall with a door, when big enough
  if (w >= 8 && rnd() < 0.8) {
    const wx = x0 + ri(3, w - 4);
    const door = y0 + ri(2, h - 3);
    for (let dy = 1; dy < h - 1; dy++) if (dy + y0 !== door && dy + y0 !== door + 1) put(wx, y0 + dy, 'B');
  } else if (h >= 8) {
    const wy = y0 + ri(3, h - 4);
    const door = x0 + ri(2, w - 3);
    for (let dx = 1; dx < w - 1; dx++) if (dx + x0 !== door && dx + x0 !== door + 1) put(x0 + dx, wy, 'B');
  }
  // doorways in each outer wall (2 tiles wide so a soldier with a rifle fits easily)
  const carve = (cells) => cells.forEach(([cx, cy]) => put(cx, cy, 'f'));
  const dy = y0 + ri(1, h - 3);
  const dx = x0 + ri(1, w - 3);
  carve([[x0, dy], [x0, dy + 1]]); // west
  carve([[x0 + w - 1, y0 + ri(1, h - 3)], [x0 + w - 1, y0 + ri(1, h - 3)]]);
  carve([[dx, y0], [dx + 1, y0]]); // north
  carve([[x0 + ri(1, w - 3), y0 + h - 1], [x0 + ri(1, w - 3), y0 + h - 1]]);
  // a blasted gap
  if (rnd() < 0.7) {
    const gx = x0 + ri(2, w - 4);
    carve([[gx, y0 + h - 1], [gx + 1, y0 + h - 1], [gx + 2, y0 + h - 1]]);
  }
  // desks and rubble inside
  for (let i = 0; i < Math.floor((w * h) / 18); i++) {
    const cx = x0 + ri(2, w - 3);
    const cy = y0 + ri(2, h - 3);
    if (get(cx, cy) === 'f') put(cx, cy, 'c');
  }
  props.push({ kind: 'building', x: x0, y: y0, w, h });
}

/** A collapsed building: a loose field of rubble and junk, with plenty of gaps. */
function rubble(x0, y0, x1, y1) {
  for (let i = 0; i < ((x1 - x0) * (y1 - y0)) / 8; i++) {
    const x = ri(x0, x1);
    const y = ri(y0, y1);
    if (!isFree(x, y, 1, 1)) continue;
    if (rnd() < 0.45) {
      put(x, y, 'Y');
      props.push({ kind: 'debris', x, y, w: 1, h: 1, v: ri(0, 2) });
    } else {
      const horiz = rnd() < 0.5;
      const w = horiz ? 2 : 1;
      const h = horiz ? 1 : 2;
      if (!isFree(x, y, w, h)) continue;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) put(x + dx, y + dy, 'c');
    }
    taken.add(`${x},${y}`);
  }
  claim(x0, y0, 0, 0);
}

// Fill each city block. The blocks next to the middle plaza are lighter so the point stays contestable.
for (let bi = 0; bi < BX.length; bi++) {
  for (let bj = 0; bj < BY.length; bj++) {
    const [bx0, bx1] = BX[bi];
    const [by0, by1] = BY[bj];
    const roll = rnd();
    const wTot = bx1 - bx0 + 1;
    const hTot = by1 - by0 + 1;
    const nearMid = bi === 2 && bj >= 1 && bj <= 2;
    if (roll < 0.14 || nearMid) {
      rubble(bx0, by0, bx1, by1); // collapsed block
      if (nearMid) building(bx0 + 1, by0 + 1, Math.min(7, wTot - 2), Math.min(6, hTot - 2));
    } else if (roll < 0.55) {
      building(bx0 + 1, by0 + 1, wTot - 2, hTot - 2); // one big building
    } else if (wTot >= hTot) {
      const w1 = ri(5, wTot - 8); // two buildings with an alley between
      building(bx0 + 1, by0 + 1, w1, hTot - 2);
      building(bx0 + w1 + 3, by0 + 1, wTot - w1 - 4, hTot - 2);
    } else {
      const h1 = ri(5, hTot - 8);
      building(bx0 + 1, by0 + 1, wTot - 2, h1);
      building(bx0 + 1, by0 + h1 + 3, wTot - 2, hTot - h1 - 4);
    }
  }
}

// Streets: wrecked vehicles (3x2 across, or 2x3 along a vertical street) and junk, always leaving a way through.
const streetRects = [...HST.map(([y0, y1]) => ({ x0: 9, x1: 59, y0, y1, horiz: true })), ...VST.map(([x0, x1]) => ({ x0, x1, y0: 2, y1: H - 3, horiz: false }))];
let cars = 0;
for (let tries = 0; tries < 600 && cars < 16; tries++) {
  const s = pick(streetRects);
  const rot = !s.horiz;
  const w = rot ? 2 : 3;
  const h = rot ? 3 : 2;
  const x = ri(s.x0, s.x1 - w + 1);
  const y = ri(s.y0, s.y1 - h + 1);
  if (x + w >= capX - 3 && Math.abs(y - capY) < 7) continue; // not on the capture plaza
  if (!isFree(x, y, w, h, 3)) continue;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) put(x + dx, y + dy, 'K');
  claim(x, y, w, h);
  props.push({ kind: 'car', x, y, w, h, rot, v: ri(0, 2) });
  cars++;
}
// Barricades and junk piles across the streets (never fully blocking one)
for (let tries = 0, n = 0; tries < 800 && n < 50; tries++) {
  const s = pick(streetRects);
  const horiz = rnd() < 0.5;
  const w = horiz ? 2 : 1;
  const h = horiz ? 1 : 2;
  const x = ri(s.x0, s.x1 - w + 1);
  const y = ri(s.y0, s.y1 - h + 1);
  if (Math.hypot(x - capX, y - capY) < 6) continue;
  if (!isFree(x, y, w, h, 2)) continue;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) put(x + dx, y + dy, 'c');
  claim(x, y, w, h);
  n++;
}
for (let tries = 0, n = 0; tries < 800 && n < 24; tries++) {
  const s = pick(streetRects);
  const x = ri(s.x0, s.x1);
  const y = ri(s.y0, s.y1);
  if (Math.hypot(x - capX, y - capY) < 5) continue;
  if (!isFree(x, y, 1, 1, 2)) continue;
  put(x, y, 'Y');
  claim(x, y, 1, 1);
  props.push({ kind: 'debris', x, y, w: 1, h: 1, v: ri(0, 2) });
  n++;
}
// A few barricades at the capture plaza so the point can be held
for (const [x, y] of [[capX - 6, capY - 4], [capX - 6, capY + 3], [capX - 8, capY], [capX - 4, capY - 7], [capX - 4, capY + 6]]) if (!taken.has(`${x},${y}`)) put(x, y, 'c');

// The field clinic sits on the main avenue behind the plaza. Resupply crates sit on the sidewalks near the front.
props.push({ kind: 'tent', x: 47, y: 33, w: 4, h: 2 });
claim(47, 33, 4, 2);
const crates = [];
for (let tries = 0; tries < 400 && crates.length < 3; tries++) {
  const x = ri(9, 23);
  const y = ri(3, H - 4);
  if (get(x, y) !== null || !isFree(x, y, 1, 1, 1)) continue;
  crates.push({ x, y });
  claim(x, y, 1, 1);
}
// Potholes (walkable decoration)
for (let i = 0; i < 40; i++) {
  const x = ri(9, 59);
  const y = ri(2, H - 3);
  if (get(x, y) === null && !taken.has(`${x},${y}`)) put(x, y, 'o');
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

// Check that both safe zones are joined by open ground, and that every building floor can be reached.
const solid = (c) => c === '#' || c === 'c' || c === 'B' || c === 'K' || c === 'Y';
const seen = new Set();
const queue = [[3, 34]];
seen.add('3,34');
while (queue.length) {
  const [x, y] = queue.pop();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(`${nx},${ny}`) || solid(rows[ny][nx])) continue;
    seen.add(`${nx},${ny}`);
    queue.push([nx, ny]);
  }
}
if (!seen.has(`${W - 4},34`)) throw new Error('the two sides are not connected');
let sealed = 0;
rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'f' && !seen.has(`${x},${y}`)) sealed++; }));
console.log(`sealed floor tiles: ${sealed}`);

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
const map = {
  tile: TILE,
  rows,
  props: [...props.filter((q) => q.kind !== 'building'), ...mirrored.filter((q) => q.kind !== 'building')],
  roads: { v: VST.flatMap(([a, b]) => [[a, b], [W - 1 - b, W - 1 - a]]), h: HST },
  crates: crateList,
  tents,
  capture: { x: (W * TILE) / 2, y: (H * TILE) / 2, r: 3.5 * TILE },
  spawns: {
    green: { x0: 1 * TILE, x1: 7 * TILE, y0: 2 * TILE, y1: (H - 2) * TILE },
    red: { x0: (W - 7) * TILE, x1: (W - 1) * TILE, y0: 2 * TILE, y1: (H - 2) * TILE },
  },
};
fs.writeFileSync(new URL('../shared/map.json', import.meta.url), JSON.stringify(map, null, 1));
console.log(rows.join('\n'));
