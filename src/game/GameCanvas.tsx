import { useEffect, useRef } from 'react';
import type { MouseEvent, MutableRefObject } from 'react';
import { MAPS } from './maps';
import type { MapData } from './maps';
import { CLASSES } from './useGame';
import type { Input, Unit, World } from './useGame';

// The ground of the map being played. The server names the current map in every snapshot, and applyMap() switches these when it changes.
let TILE = 32;
let ROWS: string[] = [];
let COLS = 0;
let MAP_W = 0;
let MAP_H = 0;
let CAP = { x: 0, y: 0, r: 0 };
let PROPS: NonNullable<MapData['props']> = [];
let CRATES: NonNullable<MapData['crates']> = [];
let TENTS: NonNullable<MapData['tents']> = [];
let TRAIN: MapData['train'] = undefined;
let NESTS: NonNullable<MapData['nests']> = [];
let ROADS: { v: number[][]; h: number[][] } = { v: [], h: [] };
let THEME = 'city';
let curMap = '';
function applyMap(id: string) {
  if (id === curMap) return;
  const m = MAPS[id] ?? MAPS.city;
  curMap = id;
  TILE = m.tile;
  ROWS = m.rows;
  COLS = ROWS[0].length;
  MAP_W = COLS * TILE;
  MAP_H = ROWS.length * TILE;
  CAP = m.capture;
  PROPS = m.props ?? [];
  CRATES = m.crates ?? [];
  TENTS = m.tents ?? [];
  TRAIN = m.train;
  NESTS = m.nests ?? [];
  ROADS = m.roads ?? { v: [], h: [] };
  THEME = m.theme ?? 'city';
}
applyMap('city');

// The ground never changes, so it is drawn once into 512 px chunks and then just copied each frame (this was most of the drawing cost).
const CHUNK = 512;
let groundChunks = new Map<string, HTMLCanvasElement>();
let groundFor = '';
function drawGround(ctx: CanvasRenderingContext2D, camX: number, camY: number, VW: number, VH: number) {
  if (groundFor !== curMap) {
    groundChunks = new Map();
    groundFor = curMap;
  }
  const perT = CHUNK / TILE;
  for (let cy = Math.max(0, Math.floor(camY / CHUNK)); cy <= Math.floor((camY + VH) / CHUNK) && cy * CHUNK < MAP_H; cy++) {
    for (let cx = Math.max(0, Math.floor(camX / CHUNK)); cx <= Math.floor((camX + VW) / CHUNK) && cx * CHUNK < MAP_W; cx++) {
      const key = `${cx},${cy}`;
      let cv = groundChunks.get(key);
      if (!cv) {
        cv = document.createElement('canvas');
        cv.width = CHUNK;
        cv.height = CHUNK;
        const g = cv.getContext('2d');
        if (g) {
          const ox = cx * CHUNK;
          const oy = cy * CHUNK;
          const t0x = cx * perT;
          const t0y = cy * perT;
          for (let ty = t0y; ty < t0y + perT && ty < ROWS.length; ty++) {
            for (let tx = t0x; tx < t0x + perT && tx < COLS; tx++) drawTile(g, ROWS[ty][tx], tx, ty, tx * TILE - ox, ty * TILE - oy);
          }
          if (THEME === 'forest') {
            // the crowns go over the ground of every tile around them, so a grove reads as one canopy
            for (let ty = t0y - 1; ty < t0y + perT + 1 && ty < ROWS.length; ty++) {
              for (let tx = t0x - 1; tx < t0x + perT + 1 && tx < COLS; tx++) {
                const c = ty >= 0 && tx >= 0 ? ROWS[ty][tx] : '';
                if (c === 'B' || c === '#') drawTreeTop(g, c, tx, ty, tx * TILE - ox, ty * TILE - oy);
              }
            }
          }
        }
        groundChunks.set(key, cv);
      }
      ctx.drawImage(cv, Math.round(cx * CHUNK - camX), Math.round(cy * CHUNK - camY));
    }
  }
}
const solidTile = (px: number, py: number) => {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS.length) return true;
  const c = ROWS[ty][tx];
  return c === '#' || c === 'c' || c === 'B' || c === 'K' || c === 'Y';
};
const blockedAt = (x: number, y: number, r = 11) => solidTile(x - r, y - r) || solidTile(x + r, y - r) || solidTile(x - r, y + r) || solidTile(x + r, y + r);
const VIEW_W = 1152; // a wider field of view than before: the camera is zoomed out a little
const VIEW_H = 720;
type Prop = NonNullable<MapData['props']>[number];
const SCOPE_ZOOM = 0.82; // a scoped sniper's view pulls back a little (1 = normal) ...
const SCOPE_PAN = 330; // ... and slides this far toward where the scope points
/** Is `e` inside the narrow beam a scoped sniper `q` is aiming? */
const inBeam = (q: { x: number; y: number }, e: { x: number; y: number }, range: number, half: number, aim: number) => {
  const d = Math.hypot(e.x - q.x, e.y - q.y);
  if (d > range) return false;
  const da = Math.atan2(Math.sin(Math.atan2(e.y - q.y, e.x - q.x) - aim), Math.cos(Math.atan2(e.y - q.y, e.x - q.x) - aim));
  return Math.abs(da) <= half;
};
const GREEN = '#4ade80';
const RED = '#f87171';
const teamColor = (t: string) => (t === 'green' ? GREEN : RED);

// Tiles that belong to a street (painted asphalt) rather than a sidewalk or lot.
const onRoad = (tx: number, ty: number) => ROADS.v.some(([a, b]) => tx >= a && tx <= b) || ROADS.h.some(([a, b]) => ty >= a && ty <= b);

// ---- The forest: grass, dirt tracks, a creek, bushes, logs, boulders and trees (drawn from above) ----
const GRASS = ['#3d5a30', '#3b572e', '#405f33', '#385430', '#3f5c31'];
const DIRT = ['#6b583b', '#675438', '#6e5b3f', '#65533a', '#6a583c'];
const tileAt = (tx: number, ty: number) => (ty >= 0 && ty < ROWS.length && tx >= 0 && tx < COLS ? ROWS[ty][tx] : '#');
function forestGround(ctx: CanvasRenderingContext2D, hash: number, tx: number, ty: number, sx: number, sy: number, dirt = false) {
  ctx.fillStyle = (dirt ? DIRT : GRASS)[hash % 5];
  ctx.fillRect(sx, sy, TILE, TILE);
  const h2 = (tx * 31 + ty * 17) % 11;
  if (dirt) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(sx + 6 + h2, sy + 9, 3, 2); // pebbles and ruts
    ctx.fillRect(sx + 20 - h2, sy + 22, 2, 2);
    ctx.fillStyle = 'rgba(255,240,200,0.07)';
    ctx.fillRect(sx + 3, sy + 25 - h2 / 2, 8, 1);
  } else {
    ctx.strokeStyle = 'rgba(20,45,20,0.45)'; // blades of grass
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const gx = sx + ((h2 * 7 + i * 11) % 28) + 2, gy = sy + ((h2 * 5 + i * 13) % 24) + 6;
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx - 1, gy - 4);
      ctx.moveTo(gx + 2, gy);
      ctx.lineTo(gx + 3, gy - 3);
    }
    ctx.stroke();
    if (h2 === 3) {
      ctx.fillStyle = '#e8e2a0'; // a little flower
      ctx.fillRect(sx + 14, sy + 12, 2, 2);
    }
  }
}
function drawForestTile(ctx: CanvasRenderingContext2D, c: string, tx: number, ty: number, sx: number, sy: number) {
  const hash = (tx * 7 + ty * 13 + tx * ty) % 9;
  if (c === 'T') {
    // the camp floor: trodden earth and boards, with the yellow safety line along its edge
    ctx.fillStyle = (tx + ty) % 2 ? '#5b4a33' : '#554530';
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(sx, sy + 15, TILE, 1);
    ctx.fillRect(sx + TILE - 1, sy, 1, TILE);
    if (tx === 6 || tx === COLS - 7) {
      ctx.fillStyle = 'rgba(250,204,21,0.7)';
      ctx.fillRect(tx === 6 ? sx + TILE - 5 : sx + 1, sy, 4, TILE);
    }
    return;
  }
  if (c === 'd') return forestGround(ctx, hash, tx, ty, sx, sy, true);
  forestGround(ctx, hash, tx, ty, sx, sy);
  if (c === 'w') {
    ctx.fillStyle = hash % 2 ? '#2d6279' : '#2a5c73';
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = 'rgba(160,215,235,0.28)'; // ripples
    ctx.fillRect(sx + 4 + hash, sy + 8, 10, 1.5);
    ctx.fillRect(sx + 14 - hash, sy + 21, 9, 1.5);
    ctx.fillStyle = '#8f8a62'; // sandy bank where the grass meets the water
    if (tileAt(tx - 1, ty) !== 'w') ctx.fillRect(sx, sy, 3, TILE);
    if (tileAt(tx + 1, ty) !== 'w') ctx.fillRect(sx + TILE - 3, sy, 3, TILE);
  } else if (c === 'g') {
    drawBush(ctx, tx, ty, sx + TILE / 2, sy + TILE / 2, 1);
  } else if (c === 'Y') {
    // a boulder: a grey lump with a lit top and a shadow side
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx + 18, sy + 21, 15, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6f7473';
    ctx.beginPath();
    ctx.ellipse(sx + 16, sy + 17, 14, 12, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8c9291';
    ctx.beginPath();
    ctx.ellipse(sx + 13, sy + 13, 9, 7, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx + 17, sy + 12);
    ctx.lineTo(sx + 20, sy + 19);
    ctx.lineTo(sx + 15, sy + 24);
    ctx.stroke();
  } else if (c === 'c') {
    // a fallen log, lying along whichever way its neighbours run
    const vert = (tileAt(tx, ty - 1) === 'c' || tileAt(tx, ty + 1) === 'c') && tileAt(tx - 1, ty) !== 'c' && tileAt(tx + 1, ty) !== 'c';
    ctx.save();
    ctx.translate(sx + TILE / 2, sy + TILE / 2);
    if (vert) ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-TILE / 2, -9, TILE, 21);
    ctx.fillStyle = '#6a4a2a';
    ctx.fillRect(-TILE / 2, -11, TILE, 21);
    ctx.fillStyle = '#7d5a35';
    ctx.fillRect(-TILE / 2, -11, TILE, 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -12; i <= 12; i += 8) { ctx.moveTo(i + (hash % 3), -10); ctx.lineTo(i + (hash % 3) + 2, 9); }
    ctx.stroke();
    const endL = (vert ? tileAt(tx, ty - 1) : tileAt(tx - 1, ty)) !== 'c';
    const endR = (vert ? tileAt(tx, ty + 1) : tileAt(tx + 1, ty)) !== 'c';
    for (const [on, ex] of [[endL, -TILE / 2 + 3], [endR, TILE / 2 - 3]] as [boolean, number][]) {
      if (!on) continue;
      ctx.fillStyle = '#c9a36b'; // the cut end, with its rings
      ctx.beginPath();
      ctx.ellipse(ex, 0, 4, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a6a3c';
      ctx.beginPath();
      ctx.ellipse(ex, 0, 2, 5.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  } else if (c === '#' || c === 'B') {
    ctx.fillStyle = c === '#' ? '#1d3822' : '#2c4a28'; // shade under the canopy (the canopy itself is drawn in a second pass, over the neighbours)
    ctx.fillRect(sx, sy, TILE, TILE);
  }
}
/** The crowns of trees, drawn after all the ground so they overlap their neighbours into one canopy. */
function drawTreeTop(ctx: CanvasRenderingContext2D, c: string, tx: number, ty: number, sx: number, sy: number) {
  const hash = (tx * 7 + ty * 13 + tx * ty) % 9;
  const cx = sx + TILE / 2 + ((hash % 3) - 1) * 2;
  const cy = sy + TILE / 2 + (((hash * 5) % 3) - 1) * 2;
  const edge = c === '#';
  const r = (edge ? 21 : 19) + (hash % 3);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.arc(cx + 3, cy + 4, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = edge ? '#1b3a22' : '#234d27';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = edge ? '#245030' : ['#2e6a33', '#2b6130', '#32703a'][hash % 3];
  ctx.beginPath();
  ctx.arc(cx - 2, cy - 2, r - 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(190,235,150,0.18)'; // sun on the upper left
  ctx.beginPath();
  ctx.arc(cx - 6, cy - 7, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; // leaf clumps
  ctx.beginPath();
  ctx.arc(cx + 5, cy + 3, 4, 0, Math.PI * 2);
  ctx.arc(cx - 3, cy + 7, 3, 0, Math.PI * 2);
  ctx.fill();
}
/** A bush: a few overlapping leaf clumps. Drawn on the ground, and again over a soldier who is hiding in it. */
function drawBush(ctx: CanvasRenderingContext2D, tx: number, ty: number, cx: number, cy: number, alpha: number) {
  const hash = (tx * 7 + ty * 13 + tx * ty) % 9;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 6, 14, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  const clumps: [number, number, number, string][] = [[-6, 2, 9, '#2a5a2a'], [6, 3, 9, '#2c5f2b'], [0, -5, 10, '#316a30'], [-1, 5, 8, '#2a5a2a']];
  for (const [dx, dy, r, col] of clumps) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx + dx + ((hash % 3) - 1), cy + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(160,220,120,0.28)';
  ctx.beginPath();
  ctx.arc(cx - 3, cy - 8, 4.5, 0, Math.PI * 2);
  ctx.arc(cx + 7, cy - 1, 3.5, 0, Math.PI * 2);
  ctx.fill();
  if (hash % 4 === 1) {
    ctx.fillStyle = '#c0392b'; // berries
    for (const [bx, by] of [[-5, 0], [4, -4], [7, 5]]) ctx.fillRect(cx + bx, cy + by, 2, 2);
  }
  ctx.restore();
}


const CONTAINER_COLORS = ['#a8432f', '#2f5d8a', '#3f7a4a', '#c8962e', '#8b8f94', '#b9622a', '#4f4a7a', '#6e2f2f'];
/** The ground and solid pieces of the container yard. */
function drawIndustryTile(ctx: CanvasRenderingContext2D, c: string, tx: number, ty: number, sx: number, sy: number) {
  const hash = (tx * 7 + ty * 13 + tx * ty) % 9;
  if (c === 'T') {
    // the base floor: bare steel plate with the yellow safety line along its edge
    ctx.fillStyle = (tx + ty) % 2 ? '#3a3d3a' : '#363936';
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(sx, sy, TILE, 1);
    ctx.fillRect(sx, sy, 1, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (const [rx, ry] of [[4, 4], [TILE - 6, 4], [4, TILE - 6], [TILE - 6, TILE - 6]]) ctx.fillRect(sx + rx, sy + ry, 2, 2); // plate bolts
    if (tx === 6 || tx === COLS - 7) {
      ctx.fillStyle = 'rgba(250,204,21,0.75)';
      ctx.fillRect(tx === 6 ? sx + TILE - 5 : sx + 1, sy, 4, TILE);
    }
    return;
  }
  if (c === 'f') {
    // warehouse floor: polished concrete with a faded safety lane
    ctx.fillStyle = (tx + ty) % 2 ? '#4a4c4f' : '#46484b';
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(sx, sy, TILE, 1);
    ctx.fillRect(sx, sy, 1, TILE);
    if (hash === 4) { ctx.fillStyle = 'rgba(20,20,20,0.3)'; ctx.beginPath(); ctx.ellipse(sx + 14, sy + 18, 8, 5, 0.4, 0, Math.PI * 2); ctx.fill(); } // oil stain
    if (ty % 4 === 0) { ctx.fillStyle = 'rgba(234,179,8,0.35)'; ctx.fillRect(sx + 2, sy + 14, TILE - 4, 3); }
    return;
  }
  // everything else sits on the ground: yard concrete, lane asphalt, or rail bed
  if (c === 'a') {
    ctx.fillStyle = ['#34373a', '#323538', '#36393c', '#313437', '#353a3d'][hash % 5];
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    if (hash === 1) ctx.fillRect(sx + 6, sy + 10, 14, 1);
    if (tileAt(tx, ty - 1) !== 'a' && tileAt(tx, ty - 1) !== 'r') { ctx.fillStyle = 'rgba(234,179,8,0.6)'; ctx.fillRect(sx, sy, TILE, 2); } // yellow edge line
    if (tileAt(tx, ty + 1) !== 'a' && tileAt(tx, ty + 1) !== 'r') { ctx.fillStyle = 'rgba(234,179,8,0.6)'; ctx.fillRect(sx, sy + TILE - 2, TILE, 2); }
    if (tileAt(tx, ty - 1) === 'a' && tileAt(tx, ty + 1) === 'a' && tileAt(tx, ty - 2) !== 'a' === false && tx % 2 === 0 && ((tileAt(tx, ty - 2) !== 'a') !== (tileAt(tx, ty + 2) !== 'a'))) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(sx + 4, sy + TILE - 2, TILE - 8, 3); } // dashed centre line
  } else if (c === 'r') {
    ctx.fillStyle = hash % 2 ? '#4b463f' : '#47423b'; // gravel bed
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = '#3a2f26'; // sleepers
    ctx.fillRect(sx + 4, sy, 5, TILE);
    ctx.fillRect(sx + 18, sy, 5, TILE);
    ctx.fillStyle = '#a9aeb4'; // the two steel rails
    ctx.fillRect(sx, sy + 7, TILE, 3);
    ctx.fillRect(sx, sy + TILE - 10, TILE, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(sx, sy + 7, TILE, 1);
    ctx.fillRect(sx, sy + TILE - 10, TILE, 1);
  } else {
    // yard concrete: slabs with expansion joints, stains and cracks
    ctx.fillStyle = ['#5a5c5e', '#585a5c', '#5c5e60', '#575a5b', '#5b5d5f'][hash % 5];
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(sx, sy + TILE - 1, TILE, 1);
    ctx.fillRect(sx + TILE - 1, sy, 1, TILE);
    if (hash === 2) { ctx.fillStyle = 'rgba(20,20,20,0.25)'; ctx.beginPath(); ctx.ellipse(sx + 16, sy + 16, 9, 6, 0.3, 0, Math.PI * 2); ctx.fill(); }
    if (hash === 6) { ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx + 5, sy + 3); ctx.lineTo(sx + 15, sy + 15); ctx.lineTo(sx + 11, sy + 28); ctx.stroke(); }
  }
  if (c === '#') {
    // perimeter fence block and warehouse wall: dark concrete with a lit edge and rivet row
    ctx.fillStyle = '#17191b';
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = '#3b4046';
    ctx.fillRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
    ctx.fillStyle = '#555b63';
    ctx.fillRect(sx + 1, sy + 1, TILE - 2, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(sx + 1, sy + TILE / 2, TILE - 2, 1);
    ctx.fillStyle = '#20242a';
    for (let i = 0; i < 4; i++) ctx.fillRect(sx + 4 + i * 7, sy + 8, 2, 2);
  } else if (c === 'B') {
    // a shipping container seen from above: its colour belongs to the whole run of containers it is part of
    let x0 = tx;
    while (tileAt(x0 - 1, ty) === 'B') x0--;
    let y0 = ty;
    while (tileAt(tx, y0 - 1) === 'B') y0--;
    const horiz = tileAt(tx - 1, ty) === 'B' || tileAt(tx + 1, ty) === 'B';
    const seg = horiz ? Math.floor((tx - x0) / 6) : Math.floor((ty - y0) / 6);
    const body = CONTAINER_COLORS[(x0 * 5 + y0 * 11 + seg * 3 + (horiz ? ty - y0 : tx - x0) * 0) % CONTAINER_COLORS.length];
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx + 1, sy + 3, TILE, TILE); // shadow
    ctx.fillStyle = body;
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; // corrugated roof
    if (horiz) for (let i = 4; i < TILE; i += 5) ctx.fillRect(sx + i, sy, 2, TILE);
    else for (let i = 4; i < TILE; i += 5) ctx.fillRect(sx, sy + i, TILE, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; // lit edge
    ctx.fillRect(sx, sy, TILE, 2);
    ctx.fillRect(sx, sy, 2, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; // the seam between two containers
    if (horiz && (tx - x0) % 6 === 5) ctx.fillRect(sx + TILE - 2, sy, 2, TILE);
    if (!horiz && (ty - y0) % 6 === 5) ctx.fillRect(sx, sy + TILE - 2, TILE, 2);
    if (tileAt(tx, ty + 1) !== 'B') { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(sx, sy + TILE - 3, TILE, 3); }
    if (tileAt(tx + 1, ty) !== 'B') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(sx + TILE - 3, sy, 3, TILE); }
  } else if (c === 'c') {
    const kind = (tx * 3 + ty) % 3;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx + 2, sy + 5, TILE - 2, TILE - 6);
    if (kind === 0) {
      // jersey barrier with hazard chevrons
      ctx.fillStyle = '#a2a29c';
      ctx.fillRect(sx + 1, sy + 4, TILE - 2, TILE - 8);
      ctx.fillStyle = '#bcbcb4';
      ctx.fillRect(sx + 3, sy + 6, TILE - 6, 6);
      ctx.fillStyle = '#d97706';
      for (let k = 0; k < 3; k++) ctx.fillRect(sx + 4 + k * 9, sy + TILE - 13, 5, 6);
    } else if (kind === 1) {
      // stacked pallets with boxes
      ctx.fillStyle = '#8a6a3f';
      ctx.fillRect(sx + 1, sy + 4, TILE - 2, TILE - 8);
      ctx.fillStyle = '#a98558';
      ctx.fillRect(sx + 3, sy + 6, 12, 10);
      ctx.fillRect(sx + 17, sy + 6, 11, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(sx + 1, sy + TILE - 12, TILE - 2, 2);
      ctx.fillRect(sx + 9, sy + 6, 1, 10);
    } else {
      // crate stack
      ctx.fillStyle = '#6b5a45';
      ctx.fillRect(sx + 1, sy + 4, TILE - 2, TILE - 8);
      ctx.fillStyle = '#8b7a62';
      ctx.fillRect(sx + 3, sy + 6, TILE - 6, TILE / 2 - 5);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.moveTo(sx + 3, sy + 6);
      ctx.lineTo(sx + TILE - 3, sy + TILE / 2 + 1);
      ctx.moveTo(sx + TILE - 3, sy + 6);
      ctx.lineTo(sx + 3, sy + TILE / 2 + 1);
      ctx.stroke();
    }
  } else if (c === 'Y') {
    // machinery and drums: a steel drum with a rolled rim, or a gantry-crane foot
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx + 18, sy + 20, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hash % 2 ? '#a3322a' : '#2f6f86';
    ctx.beginPath();
    ctx.ellipse(sx + 16, sy + 16, 13, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx + 16, sy + 16, 9, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(sx + 12, sy + 11, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(sx + 14, sy + 14, 4, 4);
  } else if (c === 'K') {
    // a wrecked truck / forklift: rusted body, a cab, a dead engine bay
    const left = tileAt(tx - 1, ty) === 'K';
    const right = tileAt(tx + 1, ty) === 'K';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx + 1, sy + 4, TILE, TILE - 2);
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(sx, sy + 2, TILE, TILE - 6);
    ctx.fillStyle = '#80583a';
    ctx.fillRect(sx + 2, sy + 4, TILE - 4, 8);
    ctx.fillStyle = '#2b2d30';
    if (!left) ctx.fillRect(sx + 1, sy + 4, 5, TILE - 10);
    if (!right) { ctx.fillStyle = '#4b5057'; ctx.fillRect(sx + TILE - 14, sy + 4, 13, TILE - 10); ctx.fillStyle = '#8fb6c4'; ctx.fillRect(sx + TILE - 11, sy + 7, 8, 7); }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(sx, sy + TILE - 6, TILE, 2);
  }
}

function drawTile(ctx: CanvasRenderingContext2D, c: string, tx: number, ty: number, sx: number, sy: number) {
  if (THEME === 'forest') return drawForestTile(ctx, c, tx, ty, sx, sy);
  if (THEME === 'industry') return drawIndustryTile(ctx, c, tx, ty, sx, sy);
  const hash = (tx * 7 + ty * 13 + tx * ty) % 9;
  if (c === 'f') {
    // the floor inside a ruined building: cold tiles, grime and plaster dust
    ctx.fillStyle = (tx + ty) % 2 ? '#30343a' : '#2b2f35';
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(sx + 1, sy + 1, TILE - 2, 1);
    ctx.fillRect(sx + 1, sy + 1, 1, TILE - 2);
    if (hash === 2) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(sx + 14, sy + 17, 9, 5, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (hash === 5) {
      ctx.fillStyle = 'rgba(200,200,190,0.18)'; // fallen plaster
      ctx.fillRect(sx + 6, sy + 8, 7, 4);
      ctx.fillRect(sx + 16, sy + 18, 6, 5);
    }
    return;
  }
  if (c === 'T') {
    // the safe zone: concrete bunker floor with a yellow safety line along its edge
    ctx.fillStyle = (tx + ty) % 2 ? '#2f353c' : '#2b3138';
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(sx, sy, TILE, 1);
    ctx.fillRect(sx, sy, 1, TILE);
    if (tx === 6 || tx === COLS - 7) {
      ctx.fillStyle = 'rgba(250,204,21,0.7)';
      ctx.fillRect(tx === 6 ? sx + TILE - 5 : sx + 1, sy, 4, TILE);
    }
    return;
  }
  // street, sidewalk or lot
  const road = onRoad(tx, ty);
  ctx.fillStyle = road ? ['#3a3d41', '#383b3f', '#3c3f43', '#37393d', '#3b3e42'][hash % 5] : ['#4a4c4e', '#484a4c', '#4c4e50', '#474949', '#4b4d4f'][hash % 5];
  ctx.fillRect(sx, sy, TILE, TILE);
  if (road) {
    // faded lane markings down the middle of a street
    const horiz = ROADS.h.find(([a, b]) => ty >= a && ty <= b);
    const vert = ROADS.v.find(([a, b]) => tx >= a && tx <= b);
    ctx.fillStyle = 'rgba(234,179,8,0.45)';
    if (horiz && ty === horiz[0] + 2 && tx % 2 === 0) ctx.fillRect(sx + 4, sy, TILE - 8, 3);
    if (vert && !horiz && tx === vert[0] + 2 && ty % 2 === 0) ctx.fillRect(sx, sy + 4, 3, TILE - 8);
    if (hash === 0) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; // cracks
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + 4, sy + 6);
      ctx.lineTo(sx + 14, sy + 14);
      ctx.lineTo(sx + 12, sy + 26);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; // paving slabs
    ctx.fillRect(sx, sy + TILE - 1, TILE, 1);
    ctx.fillRect(sx + TILE - 1, sy, 1, TILE);
  }
  if (c === '#') {
    ctx.fillStyle = '#121416';
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = '#262a2e';
    ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(sx + 2, sy + 2, TILE - 4, 3);
  } else if (c === 'c') {
    const kind = hash % 3;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx + 2, sy + 4, TILE - 2, TILE - 4);
    if (kind === 0) {
      // concrete barrier with hazard chevrons
      ctx.fillStyle = '#9a9a94';
      ctx.fillRect(sx + 1, sy + 3, TILE - 2, TILE - 6);
      ctx.fillStyle = '#b5b5ae';
      ctx.fillRect(sx + 3, sy + 5, TILE - 6, 6);
      ctx.fillStyle = '#d97706';
      for (let k = 0; k < 3; k++) ctx.fillRect(sx + 4 + k * 9, sy + TILE - 12, 5, 6);
    } else if (kind === 1) {
      // dumpster
      ctx.fillStyle = '#2f5d3c';
      ctx.fillRect(sx + 1, sy + 3, TILE - 2, TILE - 6);
      ctx.fillStyle = '#3b7249';
      ctx.fillRect(sx + 3, sy + 5, TILE - 6, TILE / 2 - 5);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(sx + 1, sy + TILE / 2, TILE - 2, 2);
      ctx.fillStyle = '#5b3a1e'; // rust streak
      ctx.fillRect(sx + 20, sy + 6, 3, 14);
    } else {
      // scrap pile: sheet metal and pallets
      ctx.fillStyle = '#6b5a45';
      ctx.fillRect(sx + 1, sy + 3, TILE - 2, TILE - 6);
      ctx.fillStyle = '#8b7a62';
      ctx.fillRect(sx + 3, sy + 5, 13, TILE / 2 - 4);
      ctx.fillStyle = '#6a7378';
      ctx.fillRect(sx + 14, sy + 12, 15, 9);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(sx + 1, sy + TILE / 2 - 1, TILE - 2, 2);
    }
  } else if (c === 'B') {
    // building wall seen from above: concrete shell with a lighter edge and dark window slots
    ctx.fillStyle = '#1b1d20';
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = '#464b52';
    ctx.fillRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
    ctx.fillStyle = '#5d636b';
    ctx.fillRect(sx + 1, sy + 1, TILE - 2, 4);
    ctx.fillStyle = '#16181b';
    if (hash % 2 === 0) {
      ctx.fillRect(sx + 6, sy + 10, 8, 12);
      ctx.fillRect(sx + 18, sy + 10, 8, 12);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    if (hash === 3) ctx.fillRect(sx + 3, sy + 3, 12, 10); // crumbled section
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    if (hash === 6) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + 5, sy + 2);
      ctx.lineTo(sx + 14, sy + 16);
      ctx.lineTo(sx + 10, sy + 29);
      ctx.stroke();
    }
  } else if (c === 'o') {
    if (hash % 2) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; // pothole
      ctx.beginPath();
      ctx.ellipse(sx + TILE / 2, sy + TILE / 2, TILE * 0.36, TILE * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(20,20,20,0.7)'; // manhole cover
      ctx.fillStyle = 'rgba(70,72,76,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx + TILE / 2, sy + TILE / 2, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx + TILE / 2 - 7, sy + TILE / 2);
      ctx.lineTo(sx + TILE / 2 + 7, sy + TILE / 2);
      ctx.stroke();
    }
  }
}

const CAR_COLORS = ['#7b2d2d', '#2f4a6b', '#8a7a2e'];

/** A burnt-out car or van, seen from above (`rot` turns it to lie along a vertical street, `flip` mirrors it). */
function drawCar(ctx: CanvasRenderingContext2D, p: Prop & { rot?: boolean }, sx: number, sy: number) {
  const w = p.w * TILE;
  const h = p.h * TILE;
  ctx.save();
  ctx.translate(sx + w / 2, sy + h / 2);
  const L = p.rot ? h : w; // length along the car
  const Wd = p.rot ? w : h;
  if (p.rot) ctx.rotate(Math.PI / 2);
  if (p.flip && !p.rot) ctx.scale(-1, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(-L / 2 + 3, -Wd / 2 + 4, L - 4, Wd - 4);
  ctx.fillStyle = '#111';
  for (const [wx, wy] of [[-L / 2 + 10, -Wd / 2 + 1], [L / 2 - 18, -Wd / 2 + 1], [-L / 2 + 10, Wd / 2 - 6], [L / 2 - 18, Wd / 2 - 6]]) ctx.fillRect(wx, wy, 9, 5);
  ctx.fillStyle = CAR_COLORS[(p.v ?? 0) % 3]; // faded paint
  ctx.fillRect(-L / 2 + 3, -Wd / 2 + 4, L - 6, Wd - 8);
  ctx.fillStyle = 'rgba(20,20,20,0.55)'; // burnt patches
  ctx.fillRect(-L / 2 + 6, -Wd / 2 + 6, L * 0.35, Wd - 12);
  ctx.fillStyle = '#20262c'; // windscreen and rear window, cracked
  ctx.fillRect(L / 2 - 26, -Wd / 2 + 7, 10, Wd - 14);
  ctx.fillRect(-L / 2 + 8, -Wd / 2 + 7, 8, Wd - 14);
  ctx.fillStyle = '#58606a'; // roof
  ctx.fillRect(-L / 2 + 17, -Wd / 2 + 6, L - 44, Wd - 12);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-L / 2 + 3, -Wd / 2 + 4, L - 6, Wd - 8);
  ctx.fillStyle = '#5a3a20'; // rust
  ctx.fillRect(L / 2 - 14, 2, 8, 5);
  ctx.restore();
}

/** A pile of rubble: broken concrete, a bent rebar. */
function drawDebris(ctx: CanvasRenderingContext2D, p: Prop, sx: number, sy: number) {
  const cx = sx + TILE / 2;
  const cy = sy + TILE / 2;
  const v = p.v ?? 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 3, 14, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  const chunks = v === 0 ? [[-6, -3, 9], [5, 2, 7], [-1, 7, 6], [3, -7, 5]] : v === 1 ? [[0, 0, 10], [-8, 5, 6], [8, -4, 6]] : [[-5, 4, 8], [6, 5, 6], [2, -5, 8], [-8, -5, 5]];
  chunks.forEach(([dx, dy, r], i) => {
    ctx.fillStyle = ['#6d7076', '#5a5d62', '#7b7e84'][i % 3];
    ctx.beginPath();
    ctx.moveTo(cx + dx - r, cy + dy);
    ctx.lineTo(cx + dx - r / 3, cy + dy - r);
    ctx.lineTo(cx + dx + r, cy + dy - r / 2);
    ctx.lineTo(cx + dx + r / 2, cy + dy + r);
    ctx.lineTo(cx + dx - r / 2, cy + dy + r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.strokeStyle = '#7a4a2a'; // rusty rebar
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy + 9);
  ctx.lineTo(cx + 4, cy - 6);
  ctx.lineTo(cx + 9, cy - 13);
  ctx.stroke();
}

/** Survivor clinic tent: canvas roof seen from above with a red cross, and a faint healing circle around it. */
function drawTent(ctx: CanvasRenderingContext2D, p: Prop, sx: number, sy: number) {
  const w = p.w * TILE;
  const h = p.h * TILE;
  const red = !!p.flip; // the mirrored tent belongs to the red side
  const tint = red ? '248,113,113' : '74,222,128';
  ctx.fillStyle = `rgba(${tint},0.10)`;
  ctx.beginPath();
  ctx.arc(sx + w / 2, sy + h / 2, 80, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${tint},0.7)`;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(sx + w / 2, sy + h / 2, 80, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(sx + 6, sy + 8, w - 8, h - 8);
  ctx.fillStyle = red ? '#c9a4a0' : '#a8c9ae';
  ctx.fillRect(sx + 2, sy + 2, w - 8, h - 8);
  ctx.fillStyle = red ? '#b08580' : '#86ad8e'; // the ridge line and two roof panels
  ctx.fillRect(sx + 2, sy + 2 + (h - 8) / 2 - 2, w - 8, 4);
  ctx.strokeStyle = red ? '#b91c1c' : '#15803d';
  ctx.lineWidth = 3;
  ctx.strokeRect(sx + 2, sy + 2, w - 8, h - 8);
  ctx.fillStyle = '#dc2626';
  const cx = sx + 2 + (w - 8) / 2;
  const cy = sy + 2 + (h - 8) / 2;
  ctx.fillRect(cx - 5, cy - 16, 10, 32);
  ctx.fillRect(cx - 16, cy - 5, 32, 10);
}

/** A raised sniper platform (96 px square), seen from above: planks, corner posts, a ladder, a rail and a flag in the owning side's colour. */
/** A thrown canister, drawn along the x axis and rotated by `rot`: frag (0), smoke (1), flash (2) or flare (3). */
function drawThrown(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, rot: number, lit: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b0c0a';
  ctx.lineWidth = 1.5;
  if (kind === 2) {
    // flashbang: a steel tube with glowing holes
    if (lit) {
      ctx.shadowColor = '#7dd3fc';
      ctx.shadowBlur = 12;
    }
    ctx.fillStyle = '#5b636c';
    ctx.beginPath();
    ctx.roundRect(-9, -4.5, 18, 9, 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2a2f35';
    ctx.fillRect(-9, -4.5, 3, 9);
    ctx.fillRect(6, -4.5, 3, 9);
    ctx.fillStyle = '#bae6fd';
    for (const hx of [-3, 1, 5]) {
      ctx.beginPath();
      ctx.arc(hx - 1, -1.8, 1.1, 0, Math.PI * 2);
      ctx.arc(hx - 1, 1.8, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#9aa0a8'; // spoon and ring
    ctx.fillRect(-10, -6, 7, 2);
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(-10, -4, 2.4, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 1) {
    // smoke grenade: a green canister with a cloud mark
    ctx.fillStyle = '#4d6b3a';
    ctx.beginPath();
    ctx.roundRect(-9, -4.5, 18, 9, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d9e2d0';
    ctx.fillRect(-1, -4.5, 7, 9);
    ctx.fillStyle = '#4d6b3a';
    for (const [cx, cy, cr] of [[1.5, 0.6, 1.8], [3.6, -0.6, 2], [5, 0.8, 1.5]]) {
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(-11, -2, 3, 4);
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(-12, 0, 2.4, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 3) {
    // flare: a red tube with a white band and a spark
    ctx.fillStyle = '#b91c1c';
    ctx.beginPath();
    ctx.roundRect(-8, -3.5, 16, 7, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-1, -3.5, 4, 7);
    if (lit) {
      ctx.fillStyle = '#fde047';
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(10, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  } else {
    // frag grenade: an olive body with grooves, lever and pin ring
    ctx.fillStyle = '#4f6038';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#26321a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 6);
    ctx.moveTo(-4, -4.5);
    ctx.lineTo(-4, 4.5);
    ctx.moveTo(4, -4.5);
    ctx.lineTo(4, 4.5);
    ctx.stroke();
    ctx.fillStyle = '#9aa0a8'; // fuze, lever and ring
    ctx.fillRect(6, -2.2, 4, 4.4);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(7, -2.5);
    ctx.quadraticCurveTo(2, -9, -3, -5.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(10.5, 3.2, 2.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTower(ctx: CanvasRenderingContext2D, red: boolean, taken: boolean, prog: number, sx: number, sy: number) {
  const w = 96;
  const h = 96;
  const col = red ? '#f87171' : '#4ade80';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(sx + 12, sy + 16, w - 12, h - 12);
  // ladder (south side)
  ctx.fillStyle = '#6b5a3a';
  ctx.fillRect(sx + w / 2 - 14, sy + h - 14, 4, 18);
  ctx.fillRect(sx + w / 2 + 10, sy + h - 14, 4, 18);
  ctx.fillStyle = '#8b7a52';
  for (let i = 0; i < 4; i++) ctx.fillRect(sx + w / 2 - 14, sy + h - 10 + i * 4, 28, 2);
  // deck
  ctx.fillStyle = '#9a8658';
  ctx.fillRect(sx + 8, sy + 8, w - 16, h - 20);
  ctx.strokeStyle = '#6f6040';
  ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(sx + 8, sy + 8 + ((h - 20) / 6) * i);
    ctx.lineTo(sx + w - 8, sy + 8 + ((h - 20) / 6) * i);
    ctx.stroke();
  }
  // rail and posts
  ctx.strokeStyle = col;
  ctx.lineWidth = 4;
  ctx.strokeRect(sx + 8, sy + 8, w - 16, h - 20);
  ctx.fillStyle = '#3b3220';
  for (const [cx, cy] of [[8, 8], [w - 8, 8], [8, h - 12], [w - 8, h - 12]]) ctx.fillRect(sx + cx - 4, sy + cy - 4, 8, 8);
  // flag
  ctx.fillStyle = col;
  ctx.fillRect(sx + w - 18, sy + 2, 12, 8);
  ctx.fillStyle = '#2a2418';
  ctx.fillRect(sx + w - 20, sy, 2, 20);
  if (prog > 0) {
    // being dismantled: a bar over the platform
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(sx + 10, sy + h / 2 - 8, w - 20, 14);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(sx + 12, sy + h / 2 - 6, (w - 24) * Math.min(1, prog), 10);
  }
  if (taken) {
    ctx.strokeStyle = 'rgba(251,191,36,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(sx + 2, sy + 2, w - 4, h - 12);
    ctx.setLineDash([]);
  }
}

/** A wooden resupply crate with a team-coloured band; dimmed while it is being restocked. */
function drawCrate(ctx: CanvasRenderingContext2D, team: string, ready: boolean, sx: number, sy: number) {
  ctx.globalAlpha = ready ? 1 : 0.35;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(sx - 13, sy - 11, 28, 26);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(sx - 14, sy - 14, 28, 26);
  ctx.strokeStyle = '#3d2c18';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx - 14, sy - 14, 28, 26);
  ctx.beginPath();
  ctx.moveTo(sx - 14, sy - 14);
  ctx.lineTo(sx + 14, sy + 12);
  ctx.moveTo(sx + 14, sy - 14);
  ctx.lineTo(sx - 14, sy + 12);
  ctx.stroke();
  ctx.fillStyle = team === 'green' ? '#4ade80' : '#f87171';
  ctx.fillRect(sx - 14, sy - 4, 28, 6);
  ctx.fillStyle = '#f5f1e0';
  ctx.fillRect(sx - 2, sy - 8, 4, 14); // a white cross
  ctx.fillRect(sx - 7, sy - 3, 14, 4);
  ctx.globalAlpha = 1;
}

let fogCv: HTMLCanvasElement | null = null;

const UNIFORM: Record<string, string> = { green: '#506b4a', red: '#8a3d34' };
const GEAR: Record<string, string> = { green: '#2e3f2a', red: '#4a221c' };
const HELMET: Record<string, string> = { green: '#3f4a3d', red: '#2c2f33' };

/** A survivor seen from above, drawn facing right and then rotated to face where he aims.
 *  Green (survivors) wear a tactical helmet with goggles, Red (raiders) a dark hood with a red scarf. */
function drawSoldier(ctx: CanvasRenderingContext2D, u: Unit, sx: number, sy: number, mine: boolean, myTeam: string, now: number) {
  const step = Math.sin(u.walk / 6);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(sx + 2, sy + 4, 13, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(u.aim);
  ctx.scale(1.25, 1.25); // drawn a little larger than the hitbox so the uniform reads clearly
  const dark = 'rgba(0,0,0,0.55)';
  const green = u.team === 'green';
  const sniper = u.cls === 3;
  const shotgunner = u.cls === 4;
  const cloth = UNIFORM[u.team];
  const trouser = green ? '#4a5a30' : '#6e3326';
  const limb = (x1: number, y1: number, x2: number, y2: number, w: number, col: string) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = dark; // dark outline under every limb so it stands out from the ground
    ctx.lineWidth = w + 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  // legs: trousers, wrapped puttees and boots, striding as he walks
  for (const side of [-1, 1]) {
    const stride = step * 12 * side;
    const hx = -3;
    const hy = side * 4;
    const fx = hx + stride;
    const fy = side * 6.5;
    limb(hx, hy, fx, fy, 5.5, trouser);
    const mx = hx + (fx - hx) * 0.55; // puttee wraps on the lower leg
    const my = hy + (fy - hy) * 0.55;
    limb(mx, my, fx, fy, 5.5, '#a89a6a');
    ctx.fillStyle = '#2a2118'; // boot, toe pointing the way he faces
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(fx + 2, fy, 4.6, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // pack on his back, with a rolled blanket
  ctx.fillStyle = GEAR[u.team];
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-11, -6, 6, 12, 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#c9b88a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, -7);
  ctx.lineTo(-8, 7);
  ctx.stroke();

  if (u.bazooka) {
    // bazooka: a fat launch tube on the shoulder, flared at the back, with a sight on top
    ctx.lineCap = 'round';
    ctx.strokeStyle = dark;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-10, 2);
    ctx.lineTo(28, 2);
    ctx.stroke();
    ctx.strokeStyle = '#59602e';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-9, 2);
    ctx.lineTo(27, 2);
    ctx.stroke();
    ctx.strokeStyle = '#2d3216';
    ctx.lineWidth = 7.5;
    ctx.beginPath();
    ctx.moveTo(24, 2);
    ctx.lineTo(28, 2);
    ctx.moveTo(-10, 2);
    ctx.lineTo(-8, 2);
    ctx.stroke();
    ctx.fillStyle = '#c9b88a';
    ctx.fillRect(4, -3.5, 3, 2.5); // sight
  } else if (u.sidearm) {
    // pistol held out in front
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1b1d20';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(10, 2);
    ctx.lineTo(24, 2);
    ctx.stroke();
    ctx.strokeStyle = '#34373b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(8, 3);
    ctx.lineTo(14, 3);
    ctx.stroke();
  } else if (shotgunner) {
    // pump shotgun: stock, fat barrel, forend slide, magazine tube underneath
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#6b4a2a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-2, 2);
    ctx.lineTo(12, 2);
    ctx.stroke();
    ctx.strokeStyle = '#1b1d20';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(12, 2);
    ctx.lineTo(34, 2);
    ctx.stroke();
    ctx.strokeStyle = '#3a3f45';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 4.4);
    ctx.lineTo(30, 4.4);
    ctx.stroke();
    ctx.strokeStyle = '#5b3a1e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(18, 2);
    ctx.lineTo(27, 2);
    ctx.stroke();
  } else {
  // rifle: wooden stock, steel barrel
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#34373b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(1, 2);
    ctx.lineTo(14, 2);
    ctx.stroke();
    ctx.strokeStyle = '#1b1d20';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(14, 2);
    ctx.lineTo(sniper ? 46 : 32, 2);
    ctx.stroke();
    ctx.fillStyle = '#23262a'; // magazine
    ctx.fillRect(10, 3, 3, 7);
    if (sniper) {
      ctx.strokeStyle = '#111827'; // telescopic sight along the top of the rifle
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(8, -0.6);
      ctx.lineTo(22, -0.6);
      ctx.stroke();
      ctx.fillStyle = '#7dd3fc';
      ctx.beginPath();
      ctx.arc(22.5, -0.6, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // torso: tunic with shoulders, belt, collar and pockets
  ctx.fillStyle = cloth;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8.5, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; // lit upper chest
  ctx.beginPath();
  ctx.ellipse(1.5, 0, 4, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a2d1e'; // belt across the waist, brass buckle
  ctx.fillRect(-3.5, -12, 3, 24);
  ctx.fillStyle = '#d4b45a';
  ctx.fillRect(-3.5, -1.5, 3, 3);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; // pocket flaps
  ctx.lineWidth = 1.2;
  ctx.strokeRect(2, -9, 4, 4);
  ctx.strokeRect(2, 5, 4, 4);
  // plate carrier vest with ammo pouches
  ctx.fillStyle = '#2b3036';
  ctx.beginPath();
  ctx.roundRect(-5, -10, 11, 20, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#3a4047';
  ctx.fillRect(2, -8, 3.5, 4);
  ctx.fillRect(2, -2, 3.5, 4);
  ctx.fillRect(2, 4, 3.5, 4);
  if (shotgunner) {
    // heavy armour: a chest plate and shoulder guards
    ctx.fillStyle = '#6b7178';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-4, -9, 9, 18, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8a9097';
    ctx.fillRect(-2, -7, 3, 14);
    ctx.fillStyle = '#4b5057';
    ctx.beginPath();
    ctx.ellipse(1, -12, 5, 3.6, 0, 0, Math.PI * 2);
    ctx.ellipse(1, 12, 5, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // shoulder epaulettes in the team colour
  ctx.fillStyle = teamColor(u.team);
  ctx.fillRect(-1, -13, 5, 3);
  ctx.fillRect(-1, 10, 5, 3);

  // arms: outlined sleeves with a lighter cuff, bare hands on the rifle
  limb(0, -9, 18, 1.5, 5.5, cloth);
  limb(0, 9, 6, 3, 5.5, cloth);
  limb(15.5, 0.2, 17.6, 1.4, 5.5, '#c9b88a');
  limb(4.6, 4.4, 5.8, 3.2, 5.5, '#c9b88a');
  ctx.fillStyle = '#d9b48c';
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(19.5, 1.5, 3, 0, Math.PI * 2);
  ctx.arc(6.5, 3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // team armband on the sleeve
  ctx.fillStyle = teamColor(u.team);
  ctx.fillRect(4, 7, 4, 5);

  // head and helmet
  ctx.fillStyle = '#d9b48c';
  ctx.beginPath();
  ctx.arc(1, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = sniper ? (green ? '#4d5f2a' : '#5b4a2a') : HELMET[u.team]; // a sniper wears a camouflaged hood
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (sniper) {
    ctx.arc(0.5, 0, 8.8, 0, Math.PI * 2);
  } else if (u.team === 'green') {
    ctx.ellipse(0.5, 0, 8.6, 7.6, 0, 0, Math.PI * 2); // smooth tactical helmet
  } else {
    ctx.ellipse(0, 0, 8.8, 8, 0, 0, Math.PI * 2); // raider hood
    ctx.ellipse(-8.5, 0, 3.4, 6, 0, 0, Math.PI * 2); // scarf tail
  }
  ctx.fill();
  ctx.stroke();
  if (sniper) {
    ctx.fillStyle = 'rgba(20,28,10,0.7)'; // tufts of scrim on the hood
    for (const [tx, ty] of [[-4, -5], [3, -6], [-6, 2], [4, 5], [-2, 6], [-7, -2]]) {
      ctx.beginPath();
      ctx.arc(tx, ty, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; // crown highlight
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0.5, 0, 4.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = teamColor(u.team); // team stripe on the front
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0.5, 0, 6.6, -0.7, 0.7);
  ctx.stroke();
  if (!sniper) {
    if (green) {
      ctx.fillStyle = '#0b1a22'; // goggles pushed up on the helmet
      ctx.fillRect(3.6, -4.8, 3.6, 9.6);
      ctx.fillStyle = 'rgba(103,232,249,0.8)';
      ctx.fillRect(5.2, -3.6, 1.4, 7.2);
    } else {
      ctx.fillStyle = '#b91c1c'; // red scarf pulled over the face
      ctx.fillRect(3.4, -4.2, 3.8, 8.4);
      ctx.fillStyle = '#111';
      ctx.fillRect(2.4, -1.2, 1.6, 2.4);
    }
  }

  if (mine) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.stroke();
  }

  // muzzle flash
  if (now < u.flash) {
    const fxm = sniper ? 48 : 34;
    const g = ctx.createRadialGradient(fxm, 2, 0, fxm, 2, 13);
    g.addColorStop(0, 'rgba(255,248,200,0.95)');
    g.addColorStop(0.5, 'rgba(255,190,70,0.6)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(fxm, 2, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (u.prot) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(sx, sy, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (u.cls === 2) {
    // A medic's healing reach: a soft ring, brighter while he is actually mending someone
    ctx.strokeStyle = u.healing ? 'rgba(134,239,172,0.8)' : 'rgba(134,239,172,0.22)';
    ctx.lineWidth = u.healing ? 2 : 1;
    ctx.beginPath();
    ctx.arc(sx, sy, 60, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Health bar over everyone, so you can see how hurt a soldier is (yours and theirs)
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(sx - 16, sy - 29, 32, 7);
  const top = CLASSES[u.cls]?.hp ?? 100; // a shotgunner has more health than the others
  const frac = Math.max(0, Math.min(1, u.hp / top));
  ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#fbbf24' : '#f87171';
  ctx.fillRect(sx - 15, sy - 28, 30 * frac, 5);
  ctx.strokeStyle = teamColor(u.team);
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - 16.5, sy - 29.5, 33, 8);
  if (u.cls === 2) {
    ctx.fillStyle = '#fff'; // medic badge: a red cross on white
    ctx.fillRect(sx - 29, sy - 30, 10, 10);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(sx - 25, sy - 29, 2, 8);
    ctx.fillRect(sx - 28, sy - 26, 8, 2);
  }
  if (u.team === myTeam && !mine) {
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(u.name, sx, sy - 34);
  }
  if (u.say && u.sayUntil > now) {
    // quick-chat bubble above a teammate's head
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(u.say).width + 12;
    ctx.fillStyle = 'rgba(10,16,18,0.85)';
    ctx.fillRect(sx - tw / 2, sy - 62, tw, 18);
    ctx.strokeStyle = teamColor(u.team);
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - tw / 2 + 0.5, sy - 61.5, tw - 1, 17);
    ctx.fillStyle = '#fff';
    ctx.fillText(u.say, sx, sy - 49);
  }
}

/** A fallen soldier: lying down, faded, until he respawns. */
const CORPSE_HOLD_MS = 60000; // a body stays on the ground this long...
const CORPSE_FADE_MS = 5000; // ...then fades out over this
/** A body left where a soldier fell: a dark blood pool and splatter, then the soldier lying sprawled with his kit. */
function drawCorpse(ctx: CanvasRenderingContext2D, c: World['corpses'][number], sx: number, sy: number, now: number) {
  const age = now - c.at;
  const alpha = age < CORPSE_HOLD_MS ? 1 : Math.max(0, 1 - (age - CORPSE_HOLD_MS) / CORPSE_FADE_MS);
  if (alpha <= 0) return;
  let r = c.seed || 1;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const dry = Math.min(1, age / 40000); // blood slowly darkens as it dries
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);
  // the pool, built from overlapping blobs, plus a few drops thrown away from the body
  const pool = `rgb(${Math.round(150 - 70 * dry)},${Math.round(14 - 6 * dry)},${Math.round(16 - 6 * dry)})`;
  ctx.fillStyle = pool;
  ctx.globalAlpha = alpha * 0.85;
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 9, rad = 7 + rnd() * 9;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d, rad, rad * (0.6 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = 16 + rnd() * 20;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 1 + rnd() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // a smear dragged away from where he was hit
  const sm = c.aim + Math.PI + (rnd() - 0.5) * 0.8;
  ctx.strokeStyle = pool;
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(Math.cos(sm) * 6, Math.sin(sm) * 6);
  ctx.lineTo(Math.cos(sm) * 26, Math.sin(sm) * 26);
  ctx.stroke();
  ctx.globalAlpha = alpha;
  // the body: turned a little differently for each soldier
  ctx.rotate(c.aim + 1.2 + (rnd() - 0.5) * 1.4);
  ctx.scale(1.15, 1.15);
  const dark = 'rgba(0,0,0,0.55)';
  const limb = (x1: number, y1: number, x2: number, y2: number, w: number, col: string) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = dark;
    ctx.lineWidth = w + 1.6;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  const trouser = c.team === 'green' ? '#4a5a30' : '#6e3326';
  const skin = '#c9a27c';
  const spread = 0.35 + rnd() * 0.5;
  limb(-3, 9, -5 - spread * 6, 20, 4.5, trouser); // legs splayed
  limb(3, 9, 5 + spread * 6, 20, 4.5, trouser);
  limb(-7, -3, -14 - rnd() * 4, 4 + rnd() * 4, 3.5, UNIFORM[c.team]); // arms flung out
  limb(7, -3, 13 + rnd() * 4, -6 + rnd() * 10, 3.5, UNIFORM[c.team]);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(-14, 5, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(13, -2, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = UNIFORM[c.team]; // torso
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 2, 8.5, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; // webbing across the chest
  ctx.fillRect(-8, 0, 16, 2.5);
  ctx.fillStyle = pool; // the wound
  ctx.beginPath(); ctx.ellipse(-2 + rnd() * 4, 1 + rnd() * 4, 3.2, 2.4, rnd() * 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = HELMET[c.team]; // helmet, tipped off to one side
  ctx.strokeStyle = dark;
  ctx.beginPath(); ctx.arc(1.5, -11, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.arc(0, -12.5, 2.6, 0, Math.PI * 2); ctx.fill();
  // his weapon, dropped beside him
  ctx.save();
  ctx.translate(18 + rnd() * 3, 2);
  ctx.rotate(0.15 + rnd() * 0.5);
  const len = c.cls === 3 ? 30 : c.cls === 4 ? 24 : c.cls === 1 ? 17 : 22;
  ctx.fillStyle = dark; ctx.fillRect(-len / 2 - 1, -3, len + 2, 6);
  ctx.fillStyle = '#2c3034'; ctx.fillRect(-len / 2, -2, len, 4);
  ctx.fillStyle = '#7a4e2a'; ctx.fillRect(-len / 2, -2, len * 0.3, 4);
  ctx.restore();
  ctx.restore();
}

export default function GameCanvas({ world, input, typing }: { world: MutableRefObject<World>; input: MutableRefObject<Input>; typing?: () => boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: VIEW_W / 2 + 40, y: VIEW_H / 2 });
  // Keep the latest typing check in a ref so the input effect below is not torn down (and held keys reset) on every re-render.
  const typingRef = useRef(typing);
  typingRef.current = typing;

  // Controls: WASD / arrows to move, mouse to aim, hold the left button to fire. Only intentions leave the browser, never positions.
  useEffect(() => {
    const keys = new Set<string>();
    const move = () => {
      input.current.dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      input.current.dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    };
    let shift = false; // sprint: hold left Shift or the right mouse button
    let right = false;
    const onDown = (e: KeyboardEvent) => {
      if (typingRef.current?.()) return;
      const k = e.key.toLowerCase();
      if (k === 'shift') {
        shift = true;
        input.current.sprint = true;
      }
      if (k === ' ') input.current.fire = true;
      if (k === 'r' && !e.repeat) input.current.reload += 1;
      if (k === 't' && !e.repeat) input.current.arty += 1;
      if (k === 'q' && !e.repeat) input.current.swap += 1; // swap between the bazooka and your main weapon
      if (k === 'b') input.current.dismantle = true; // hold beside your tower to take it down
      if (k === 'c' && !e.repeat) {
        // the class special: smoke, flashbang, flare, riot shield or UAV; for the sniper it is his tower (build, climb, climb down)
        if (world.current.units.get(world.current.me)?.cls === 3) input.current.nest += 1;
        else input.current.special += 1;
      }
      if (k === 'z' && !e.repeat) input.current.streak += 1; // kill-streak reward: UAV, attack drone or helicopter
      if (k === 'g' && !e.repeat) input.current.nade += 1; // the server counts presses, so a lost packet cannot eat a throw
      if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) return;
      e.preventDefault();
      keys.add(k);
      move();
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'shift') {
        shift = false;
        input.current.sprint = right;
      }
      keys.delete(k);
      if (k === ' ') input.current.fire = false;
      if (k === 'b') input.current.dismantle = false;
      move();
    };
    const onBlur = () => {
      keys.clear();
      shift = right = false;
      input.current.sprint = false;
      input.current.scope = false;
      input.current.dx = input.current.dy = 0;
      input.current.fire = false;
      input.current.dismantle = false;
    };
    const onMouseUp = (e: globalThis.MouseEvent) => {
      if (e.button === 2) {
        right = false;
        input.current.scope = false;
        input.current.sprint = shift;
      } else input.current.fire = false;
    };
    const onMouseDown = (e: globalThis.MouseEvent) => {
      if (e.button === 2 && (e.target as HTMLElement | null)?.tagName === 'CANVAS') {
        right = true;
        if (world.current.units.get(world.current.me)?.ctl === 2) {
          input.current.nade += 1; // flying the helicopter: right click fires a rocket
          return;
        }
        // A sniper uses the right button to scope; everyone else sprints with it.
        if (world.current.units.get(world.current.me)?.cls === 3) input.current.scope = true;
        else input.current.sprint = true;
      }
    };
    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
      e.preventDefault(); // do not scroll the page while playing
      const t = performance.now();
      if (t - lastWheel < 180) return; // one notch = one swap, even on a free-spinning wheel
      lastWheel = t;
      input.current.swap += 1;
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mouseup', onMouseUp);
      onBlur();
    };
  }, [input]);

  // Drawing loop.
  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let raf = 0;
    let lastT = performance.now();
    let zoom = 1;
    let fpsN = 0, fpsAt = performance.now(), fpsShown = 0, showStats = true;
    const onStatsKey = (e: KeyboardEvent) => { if (e.key === 'F3') { e.preventDefault(); showStats = !showStats; } };
    window.addEventListener('keydown', onStatsKey);
    const ctlPos = { x: 0, y: 0, on: false }; // where the drone / helicopter we are flying is, eased between server updates
    const frame = () => {
      const w = world.current;
      applyMap(w.mapId);
      const nowT = performance.now();
      const dt = Math.min(0.05, (nowT - lastT) / 1000);
      lastT = nowT;
      for (const u of w.units.values()) {
        const px = u.x;
        const py = u.y;
        if (u.id === w.me && u.hp > 0 && !u.elev && !u.ctl && Math.hypot(u.tx - u.x, u.ty - u.y) < 80) {
          // Client-side prediction: move our own soldier right away with the same rules as the server, then ease toward the
          // server's answer. The server still decides where we really are.
          const { dx, dy, sprint } = input.current;
          const len = Math.hypot(dx, dy);
          if (len > 0) {
            const fast = sprint && !u.winded && u.stamina > 0 && !u.scoped;
            const k = (len > 1 ? 1 / len : 1) * 150 * (fast ? 1.6 : u.scoped ? 0.35 : 1) * dt;
            const nx = u.x + dx * k;
            const ZW2 = 8 * TILE;
            const enemyX = (x: number) => (u.team === 'green' ? x > MAP_W - ZW2 : x < ZW2);
            if (!blockedAt(nx, u.y) && !enemyX(nx)) u.x = nx;
            const ny = u.y + dy * k;
            if (!blockedAt(u.x, ny)) u.y = ny;
          }
          u.x += (u.tx - u.x) * 0.1;
          u.y += (u.ty - u.y) * 0.1;
        } else {
          // Everyone else: aim a little ahead of the last server position (his own speed, for up to a quarter second), and glide
          // there at a rate that does not depend on the frame rate. A late update then looks like steady walking, not a freeze and a jump.
          const ahead = u.hp > 0 && u.snapAt ? Math.min(0.25, (nowT - u.snapAt) / 1000) : 0;
          const ease = 1 - Math.exp(-dt * 16);
          u.x += (u.tx + u.vx * ahead - u.x) * ease;
          u.y += (u.ty + u.vy * ahead - u.y) * ease;
        }
        u.walk += Math.hypot(u.x - px, u.y - py); // drives the walking animation
      }
      const you = w.units.get(w.me);
      // Sniper scope: while scoped the view pulls back so you can see the whole of your scope's reach, past the normal window.
      const wantZoom = you?.cls === 3 && input.current.scope && you.hp > 0 ? SCOPE_ZOOM : 1;
      zoom += (wantZoom - zoom) * 0.18;
      if (Math.abs(wantZoom - zoom) < 0.002) zoom = wantZoom;
      const VW = VIEW_W / zoom;
      const VH = VIEW_H / zoom;
      const blend = (1 - zoom) / (1 - SCOPE_ZOOM); // 0 = normal view, 1 = fully scoped
      const panX = Math.cos(input.current.aim) * SCOPE_PAN * blend;
      const panY = Math.sin(input.current.aim) * SCOPE_PAN * blend;
      // Flying a drone or helicopter: the camera rides it (WASD flies it, the mouse aims).
      const flying = you && you.hp > 0 ? w.ms.find((m) => m[4] === w.me) : undefined;
      if (flying) {
        if (!ctlPos.on) { ctlPos.x = flying[1]; ctlPos.y = flying[2]; ctlPos.on = true; }
        ctlPos.x += (flying[1] - ctlPos.x) * 0.5;
        ctlPos.y += (flying[2] - ctlPos.y) * 0.5;
      } else ctlPos.on = false;
      const focusX = flying ? ctlPos.x : (you?.x ?? CAP.x);
      const focusY = flying ? ctlPos.y : (you?.y ?? CAP.y);
      const camX = Math.max(0, Math.min(MAP_W - VW, focusX + panX - VW / 2));
      const camY = Math.max(0, Math.min(MAP_H - VH, focusY + panY - VH / 2));
      w.cam.x = camX;
      w.cam.y = camY;
      if (you) {
        const mdx = mouse.current.x / zoom - (focusX - camX);
        const mdy = mouse.current.y / zoom - (focusY - camY);
        input.current.aim = Math.atan2(mdy, mdx);
        input.current.range = Math.hypot(mdx, mdy); // grenades land where the cursor is
      }

      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.fillStyle = '#16181a';
      ctx.fillRect(0, 0, VW, VH);
      const x0 = Math.floor(camX / TILE);
      const y0 = Math.floor(camY / TILE);
      drawGround(ctx, camX, camY, VW, VH);
      // Safe zones: your side's base and the strip in front of it (no enemies in, no damage, no firing out)
      const ZW = 8 * TILE; // matches the server: spawn zone + BASE_PAD
      ctx.fillStyle = 'rgba(74,222,128,0.09)';
      ctx.fillRect(-camX, -camY, ZW, MAP_H);
      ctx.fillStyle = 'rgba(248,113,113,0.09)';
      ctx.fillRect(MAP_W - ZW - camX, -camY, ZW, MAP_H);
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(74,222,128,0.55)';
      ctx.beginPath();
      ctx.moveTo(ZW - camX, -camY);
      ctx.lineTo(ZW - camX, MAP_H - camY);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(248,113,113,0.55)';
      ctx.beginPath();
      ctx.moveTo(MAP_W - ZW - camX, -camY);
      ctx.lineTo(MAP_W - ZW - camX, MAP_H - camY);
      ctx.stroke();
      ctx.restore();
      // Scenery and supplies
      for (const pr of PROPS) {
        const px = pr.x * TILE - camX;
        const py = pr.y * TILE - camY;
        if (px < -200 || py < -200 || px > VW + 100 || py > VH + 100) continue;
        if (pr.kind === 'car') drawCar(ctx, pr, px, py);
        else if (pr.kind === 'debris') drawDebris(ctx, pr, px, py);
        else if (pr.kind === 'tent') drawTent(ctx, pr, px, py);
      }
      // Sniper towers the snipers have built
      for (const t of w.towers) {
        const tx0 = t[2] - 48 - camX;
        const ty0 = t[3] - 48 - camY;
        if (tx0 < -120 || ty0 < -120 || tx0 > VW + 40 || ty0 > VH + 40) continue;
        drawTower(ctx, t[0] === 1, t[4] === 1, t[5] ?? 0, tx0, ty0);
      }
      // Sniper nests: a faint scope reticle on the ground inside each sandbag pocket, in the owning side's colour
      for (const n of NESTS) {
        const nx = n.x - camX;
        const ny = n.y - camY;
        if (nx < -60 || ny < -60 || nx > VW + 60 || ny > VH + 60) continue;
        ctx.strokeStyle = n.team === 'green' ? 'rgba(74,222,128,0.55)' : 'rgba(248,113,113,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(nx, ny, 16, 0, Math.PI * 2);
        ctx.moveTo(nx - 24, ny);
        ctx.lineTo(nx - 8, ny);
        ctx.moveTo(nx + 8, ny);
        ctx.lineTo(nx + 24, ny);
        ctx.moveTo(nx, ny - 24);
        ctx.lineTo(nx, ny - 8);
        ctx.moveTo(nx, ny + 8);
        ctx.lineTo(nx, ny + 24);
        ctx.stroke();
      }
      // Bazooka crates: an olive box with a rocket on the lid and a pulsing ring so they are easy to spot
      for (const [kx, ky, locked] of w.pickups) {
        const px = kx - camX;
        const py = ky - camY;
        if (px < -60 || py < -60 || px > VW + 60 || py > VH + 60) continue;
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 260);
        ctx.globalAlpha = locked ? 0.45 : 1; // dimmed while your side's bazooka is still in play
        ctx.strokeStyle = `rgba(251,191,36,${0.35 + 0.4 * pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 22 + pulse * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(px - 15, py - 9, 32, 22);
        ctx.fillStyle = '#556b2f';
        ctx.fillRect(px - 16, py - 12, 32, 22);
        ctx.strokeStyle = '#2d3216';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - 16, py - 12, 32, 22);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(px - 11, py - 3, 22, 4); // rocket body
        ctx.beginPath();
        ctx.moveTo(px + 11, py - 4);
        ctx.lineTo(px + 17, py - 1);
        ctx.lineTo(px + 11, py + 2);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(px - 11, py - 5, 3, 8); // fins
        ctx.globalAlpha = 1;
      }
      CRATES.forEach((cr, i) => {
        const px = cr.x - camX;
        const py = cr.y - camY;
        if (px > -40 && py > -40 && px < VW + 40 && py < VH + 40) drawCrate(ctx, cr.team, w.crates[i] !== 0, px, py);
      });
      // The train: the track flashes while it is coming, then the cars cross it
      if (TRAIN && w.train[0] > 0) {
        const [st, ti, dirT, head] = w.train;
        const tk = TRAIN.tracks[ti];
        if (st === 1) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 110);
          ctx.save();
          ctx.beginPath();
          ctx.rect(tk.x0 - camX, tk.y - camY, tk.x1 - tk.x0, tk.h);
          ctx.clip();
          ctx.fillStyle = `rgba(250,204,21,${0.12 + pulse * 0.18})`;
          ctx.fillRect(tk.x0 - camX, tk.y - camY, tk.x1 - tk.x0, tk.h);
          ctx.fillStyle = `rgba(20,20,20,${0.25 + pulse * 0.2})`;
          for (let x = Math.floor((camX - tk.x0) / 48) * 48 + tk.x0 - 48; x < camX + VW + 48; x += 48) {
            ctx.beginPath();
            ctx.moveTo(x - camX, tk.y - camY + tk.h);
            ctx.lineTo(x - camX + 24, tk.y - camY + tk.h);
            ctx.lineTo(x - camX + 48, tk.y - camY);
            ctx.lineTo(x - camX + 24, tk.y - camY);
            ctx.fill();
          }
          ctx.restore();
        } else {
          const back = head - dirT * TRAIN.len;
          const lo = Math.max(tk.x0, Math.min(head, back));
          const hi = Math.min(tk.x1, Math.max(head, back));
          if (hi > lo) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(tk.x0 - camX, tk.y - 6 - camY, tk.x1 - tk.x0, tk.h + 12);
            ctx.clip();
            const y0 = tk.y + 6 - camY;
            const hh = tk.h - 12;
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(lo - camX + 3, y0 + 6, hi - lo, hh);
            // cars from the tail towards the locomotive at the head
            const CAR = 150, GAP = 8;
            const n = Math.ceil(TRAIN.len / (CAR + GAP));
            for (let i = 0; i < n; i++) {
              const along = TRAIN.len - (i + 1) * (CAR + GAP) + GAP; // distance of the car's tail end behind the head
              const a = dirT > 0 ? head - along - CAR : head + along;
              const loco = i === n - 1;
              ctx.fillStyle = loco ? '#2c3e50' : ['#7a3b2e', '#3d5a45', '#5b5b63', '#7a6a3a'][i % 4];
              ctx.fillRect(a - camX, y0, CAR, hh);
              ctx.fillStyle = 'rgba(0,0,0,0.28)';
              for (let r = 8; r < CAR - 6; r += 10) ctx.fillRect(a - camX + r, y0 + 3, 3, hh - 6);
              ctx.fillStyle = 'rgba(255,255,255,0.18)';
              ctx.fillRect(a - camX, y0, CAR, 3);
              if (loco) {
                ctx.fillStyle = '#facc15';
                ctx.fillRect(dirT > 0 ? a - camX + CAR - 14 : a - camX, y0, 14, hh);
                ctx.fillStyle = '#fff7c2';
                const hx = dirT > 0 ? a - camX + CAR - 5 : a - camX + 1;
                ctx.fillRect(hx, y0 + 8, 4, 8);
                ctx.fillRect(hx, y0 + hh - 16, 4, 8);
              }
            }
            ctx.restore();
          }
        }
      }
      // Capture point
      const p = w.progress;
      const [zx, zy, zr, zleft, znx, zny] = w.zone[2] ? w.zone : [CAP.x, CAP.y, CAP.r, 0, 0, 0];
      ctx.beginPath();
      ctx.arc(zx - camX, zy - camY, zr, 0, Math.PI * 2);
      ctx.fillStyle = p > 0 ? `rgba(74,222,128,${0.1 + p * 0.3})` : p < 0 ? `rgba(248,113,113,${0.1 - p * 0.3})` : 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = p > 0.02 ? GREEN : p < -0.02 ? RED : 'rgba(255,255,255,0.5)';
      ctx.stroke();
      if (zleft > 0) {
        // Hardpoint: a label and timer on the live zone, and the next zone outlined for its last few seconds
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(`HARDPOINT · moves in ${zleft}`, zx - camX, zy - camY - zr - 8);
        if (zleft <= 5) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 120);
          ctx.setLineDash([10, 8]);
          ctx.lineWidth = 3;
          ctx.strokeStyle = `rgba(250,204,21,${0.55 + pulse * 0.4})`;
          ctx.beginPath();
          ctx.arc(znx - camX, zny - camY, zr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = `rgba(250,204,21,${0.7 + pulse * 0.3})`;
          ctx.fillText(`NEXT ZONE · ${zleft}`, znx - camX, zny - camY - zr - 8);
        }
        ctx.restore();
      }
      // Bullets
      ctx.fillStyle = '#fde68a';
      for (const [bx, by] of w.bullets) {
        ctx.beginPath();
        ctx.arc(bx - camX, by - camY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Rockets in flight, with a flame trail
      for (const [rx, ry, ra] of w.rockets) {
        const sx = rx - camX;
        const sy = ry - camY;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(ra);
        const fl = ctx.createLinearGradient(-26, 0, -4, 0);
        fl.addColorStop(0, 'rgba(255,120,30,0)');
        fl.addColorStop(1, 'rgba(255,220,120,0.95)');
        ctx.fillStyle = fl;
        ctx.beginPath();
        ctx.moveTo(-4, -3);
        ctx.lineTo(-26, 0);
        ctx.lineTo(-4, 3);
        ctx.fill();
        ctx.fillStyle = '#d1d5db';
        ctx.fillRect(-5, -2.5, 12, 5);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(7, -2.5);
        ctx.lineTo(12, 0);
        ctx.lineTo(7, 2.5);
        ctx.fill();
        ctx.restore();
      }
      // Soldiers (alive only), lowest first so the ones nearer the bottom draw on top
      const myTeam = you?.team ?? '';
      const seen = [...w.units.values()].filter((u) => u.seen);
      const alive = seen.filter((u) => u.hp > 0).sort((a, b) => a.y - b.y);
      const now = Date.now();
      w.corpses = w.corpses.filter((c) => now - c.at < CORPSE_HOLD_MS + CORPSE_FADE_MS);
      for (const c of w.corpses) {
        if (c.x - camX < -60 || c.x - camX > VW + 60 || c.y - camY < -60 || c.y - camY > VH + 60) continue;
        drawCorpse(ctx, c, c.x - camX, c.y - camY, now);
      }
      for (const u of alive) drawSoldier(ctx, u, u.x - camX, u.y - camY - (u.elev ? 12 : 0), u.id === w.me, myTeam, now); // a sniper on a tower stands a little higher
      if (THEME === 'forest') {
        // a soldier standing in a bush is half-covered by it (an enemy only shows up here once he has been spotted)
        for (const u of alive) {
          const btx = Math.floor(u.x / TILE), bty = Math.floor(u.y / TILE);
          if (ROWS[bty]?.[btx] === 'g') drawBush(ctx, btx, bty, u.x - camX, u.y - camY, u.team === myTeam ? 0.55 : 0.7);
        }
      }
      if (you && you.hp > 0 && you.scoped) {
        // scoped: a faint sight line out to the edge of what he can see
        ctx.save();
        ctx.strokeStyle = 'rgba(125,211,252,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.moveTo(you.x - camX + Math.cos(input.current.aim) * 48, you.y - camY + Math.sin(input.current.aim) * 48);
        ctx.lineTo(you.x - camX + Math.cos(input.current.aim) * w.scopeVision, you.y - camY + Math.sin(input.current.aim) * w.scopeVision);
        ctx.stroke();
        ctx.restore();
      }

      // Artillery: a warning ring the size of the blast closes in while the shell is on its way
      const gt = Date.now();
      for (const [ax, ay, , left] of w.gas) {
        const sx = ax - camX;
        const sy = ay - camY;
        ctx.strokeStyle = `rgba(248,113,113,${0.5 + 0.4 * Math.abs(Math.sin(gt / 150))})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(sx, sy, 130, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(248,113,113,0.1)';
        ctx.beginPath();
        ctx.arc(sx, sy, 130 * (1 - left), 0, Math.PI * 2); // closes in as the shell gets near
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fca5a5';
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${(left * 3).toFixed(1)}s`, sx, sy + 4);
      }
      // Grenades: a shadow stays on the ground while the grenade itself arcs up and over cover
      for (const [gx, gy, f, kind] of w.nades) {
        const lift = Math.sin(Math.min(1, f) * Math.PI) * 46;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(gx - camX, gy - camY, 6, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // it tumbles in the air (each one at its own angle), then lies still where it landed
        const rot = f > 0 ? Date.now() / 90 + gx * 0.05 : gx * 0.37 + gy * 0.21;
        const sc = 1 + lift / 70;
        ctx.save();
        ctx.translate(gx - camX, gy - camY - lift);
        ctx.scale(sc, sc);
        drawThrown(ctx, kind ?? 0, 0, 0, rot, f <= 0 || kind === 2);
        ctx.restore();
        if (f <= 0 && (!kind || kind === 0) && Math.floor(Date.now() / 120) % 2 === 0) {
          ctx.fillStyle = '#f87171'; // sizzling fuse once it has landed
          ctx.fillRect(gx - camX - 1, gy - camY - 10, 2, 3);
        }
      }
      // Smoke: the enemy's cloud is nearly solid; your own side's is see-through
      for (const [cx, cy, cr, left, ct] of w.clouds) {
        const mineSmoke = (ct === 0 ? 'green' : 'red') === myTeam;
        const fade = Math.min(1, left * 5, (1 - left) * 8 + 0.2);
        const t = Date.now() / 1400;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + t * (i % 2 ? 1 : -1) * 0.4;
          const d = i === 0 ? 0 : cr * 0.45;
          ctx.fillStyle = `rgba(${mineSmoke ? '200,205,210' : '170,175,182'},${(mineSmoke ? 0.4 : 0.86) * fade})`;
          ctx.beginPath();
          ctx.arc(cx - camX + Math.cos(a) * d, cy - camY + Math.sin(a) * d, cr * 0.58, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Air drops: a flare comes down, then a medical crate heals friendlies around it until it runs out
      for (const [dx, dy, landed, left, fall] of w.drops) {
        const sx = dx - camX;
        const sy = dy - camY;
        if (!landed) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 90);
          ctx.fillStyle = `rgba(239,68,68,${0.25 + 0.25 * pulse})`;
          ctx.beginPath();
          ctx.arc(sx, sy, 16 + 10 * (1 - fall), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#e2e8f0';
          const h = fall * 60; // the crate drifts down under its parachute
          ctx.fillRect(sx - 7, sy - 7 - h, 14, 14);
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(sx - 1.5, sy - 5 - h, 3, 10);
          ctx.fillRect(sx - 5, sy - 1.5 - h, 10, 3);
          ctx.strokeStyle = 'rgba(226,232,240,0.7)';
          ctx.beginPath();
          ctx.arc(sx, sy - 28 - h, 16, Math.PI, 0);
          ctx.stroke();
          continue;
        }
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 250);
        ctx.fillStyle = `rgba(74,222,128,${0.1 + 0.07 * pulse})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 75, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(74,222,128,${0.5 + 0.3 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(sx - 9, sy - 9, 18, 18);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 9, sy - 9, 18, 18);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(sx - 2, sy - 7, 4, 14);
        ctx.fillRect(sx - 7, sy - 2, 14, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(sx - 12, sy + 13, 24 * left, 3); // time left
      }
      // Riot shield: a curved ballistic plate held out in front, with a clear viewport slit and a rim that shows its wear
      for (const u of alive) {
        if (!u.shield) continue;
        const hpF = Math.max(0.05, Math.min(1, u.shieldHp / 200));
        const a = u.id === w.me ? input.current.aim : u.aim;
        const cx = u.x - camX, cy = u.y - camY, R = 25, half = 0.95;
        const rim = hpF > 0.5 ? '#93c5fd' : hpF > 0.25 ? '#fde047' : '#f87171'; // the rim goes red as it wears down
        ctx.save();
        ctx.lineCap = 'butt';
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 6;
        ctx.strokeStyle = '#0f1417'; // dark outline
        ctx.lineWidth = 11;
        ctx.beginPath(); ctx.arc(cx, cy, R, a - half, a + half); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#3b4650'; // gunmetal plate
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(cx, cy, R, a - half, a + half); ctx.stroke();
        ctx.strokeStyle = rim; // outer rim, a thin bright edge
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(cx, cy, R + 4, a - half, a + half); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; // sheen
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, cy, R + 1.5, a - half * 0.8, a + half * 0.2); ctx.stroke();
        // the viewport: a clear slit in the middle of the plate
        ctx.strokeStyle = 'rgba(147,210,255,0.85)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(cx, cy, R, a - 0.2, a + 0.2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, R + 1, a - 0.16, a + 0.04); ctx.stroke();
        // rivets
        ctx.fillStyle = '#aab4bd';
        for (const k of [-0.75, -0.5, 0.5, 0.75]) {
          ctx.beginPath(); ctx.arc(cx + Math.cos(a + k) * R, cy + Math.sin(a + k) * R, 1.3, 0, Math.PI * 2); ctx.fill();
        }
        // cracks appear once the plate is badly hurt
        if (hpF < 0.5) {
          ctx.strokeStyle = 'rgba(15,20,23,0.9)';
          ctx.lineWidth = 1;
          for (const k of [-0.5, 0.35, 0.65]) {
            const ax = cx + Math.cos(a + k) * (R - 4), ay = cy + Math.sin(a + k) * (R - 4);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + Math.cos(a + k + 0.5) * 4, ay + Math.sin(a + k + 0.5) * 4 + 1);
            ctx.lineTo(ax + Math.cos(a + k) * 8, ay + Math.sin(a + k) * 8 - 1);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      // Recoil: your fire cone opens as the AR heats up
      if (you && you.hp > 0 && you.heat > 12) {
        const sp = (you.heat / 100) * 0.17;
        ctx.strokeStyle = `rgba(251,191,36,${Math.min(0.6, you.heat / 120)})`;
        ctx.lineWidth = 1;
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(you.x - camX + Math.cos(input.current.aim + sgn * sp) * 40, you.y - camY + Math.sin(input.current.aim + sgn * sp) * 40);
          ctx.lineTo(you.x - camX + Math.cos(input.current.aim + sgn * sp) * 150, you.y - camY + Math.sin(input.current.aim + sgn * sp) * 150);
          ctx.stroke();
        }
      }
      // Canister effects: a flashbang's burst, a flare's sparks, a broken shield's flash
      const pNow = Date.now();
      w.pops = w.pops.filter((q) => pNow - q.at < 600);
      for (const q of w.pops) {
        const a2 = (pNow - q.at) / 600;
        const sx = q.x - camX;
        const sy = q.y - camY;
        if (q.kind === 'flash') {
          ctx.fillStyle = `rgba(186,230,253,${0.7 * (1 - a2)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, 20 + a2 * 110, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${1 - a2})`;
          ctx.lineWidth = 2;
          for (let i = 0; i < 12; i++) {
            const an = (i / 12) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(sx + Math.cos(an) * 14, sy + Math.sin(an) * 14);
            ctx.lineTo(sx + Math.cos(an) * (30 + a2 * 90), sy + Math.sin(an) * (30 + a2 * 90));
            ctx.stroke();
          }
        } else if (q.kind === 'smoke') {
          ctx.fillStyle = `rgba(190,200,186,${0.5 * (1 - a2)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, 14 + a2 * 60, 0, Math.PI * 2);
          ctx.fill();
        } else if (q.kind === 'flare') {
          ctx.fillStyle = `rgba(253,224,71,${0.8 * (1 - a2)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, 6 + a2 * 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(248,113,113,${1 - a2})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy, 10 + a2 * 40, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeStyle = `rgba(147,197,253,${1 - a2})`; // a riot shield giving way
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(sx, sy, 16 + a2 * 34, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // Explosions
      const tNow = Date.now();
      w.booms = w.booms.filter((b) => tNow - b.at < (b.big ? 800 : 450));
      for (const b of w.booms) {
        const a = (tNow - b.at) / (b.big ? 800 : 450);
        const r = b.big ? 50 + a * 140 : 30 + a * 70;
        ctx.fillStyle = `rgba(253,186,116,${0.55 * (1 - a)})`;
        ctx.beginPath();
        ctx.arc(b.x - camX, b.y - camY, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,240,200,${0.9 * (1 - a)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = `rgba(40,36,32,${0.5 * (1 - a)})`;
        ctx.beginPath();
        ctx.arc(b.x - camX, b.y - camY - a * 18, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      // Aim marker for where a grenade would land
      if (you && you.hp > 0) {
        const rg = Math.max(70, Math.min(380, input.current.range));
        const lx = you.x - camX + Math.cos(input.current.aim) * rg;
        const ly = you.y - camY + Math.sin(input.current.aim) * rg;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(lx, ly, 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Fog of war: the field outside your side's sight is dimmed. Teammates (alive) each light a circle around them.
      {
        fogCv ??= document.createElement('canvas');
        if (fogCv.width !== Math.ceil(VW)) fogCv.width = Math.ceil(VW);
        if (fogCv.height !== Math.ceil(VH)) fogCv.height = Math.ceil(VH);
        const fc = fogCv.getContext('2d');
        if (fc) {
          fc.globalCompositeOperation = 'source-over';
          fc.clearRect(0, 0, VW, VH);
          fc.fillStyle = 'rgba(6,9,11,0.74)';
          fc.fillRect(0, 0, VW, VH);
          fc.globalCompositeOperation = 'destination-out';
          const vr = w.vision;
          for (const u of seen) {
            if (u.team !== myTeam || u.hp <= 0) continue;
            const ux = u.x - camX;
            const uy = u.y - camY;
            if (ux < -w.scopeVision || uy < -w.scopeVision || ux > VW + w.scopeVision || uy > VH + w.scopeVision) continue;
            const rr = vr;
            const g = fc.createRadialGradient(ux, uy, rr * 0.72, ux, uy, rr);
            g.addColorStop(0, 'rgba(0,0,0,1)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            fc.fillStyle = g;
            fc.beginPath();
            fc.arc(ux, uy, rr, 0, Math.PI * 2);
            fc.fill();
            if (u.scoped) {
              // a scoped sniper also lights a long narrow beam along his aim (a few overlapping wedges give it soft edges)
              const aimA = u.id === w.me ? input.current.aim : u.aim;
              const R = w.scopeVision;
              for (const [f, al] of [[1, 0.3], [0.86, 0.35], [0.72, 0.45], [0.55, 1]] as const) {
                const bg = fc.createRadialGradient(ux, uy, R * 0.6, ux, uy, R);
                bg.addColorStop(0, `rgba(0,0,0,${al})`);
                bg.addColorStop(1, 'rgba(0,0,0,0)');
                fc.fillStyle = bg;
                fc.beginPath();
                fc.moveTo(ux, uy);
                fc.arc(ux, uy, R, aimA - w.scopeHalf * f, aimA + w.scopeHalf * f);
                fc.closePath();
                fc.fill();
              }
            }
          }
          for (const [ux, uy, ur] of w.uavAreas) {
            if (ur === 0) { fc.fillStyle = 'rgba(0,0,0,1)'; fc.fillRect(0, 0, VW, VH); continue; } // the streak UAV: the whole map
            // UAV: the fog lifts over a big circle
            const ex = ux - camX;
            const ey = uy - camY;
            const g = fc.createRadialGradient(ex, ey, ur * 0.8, ex, ey, ur);
            g.addColorStop(0, 'rgba(0,0,0,1)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            fc.fillStyle = g;
            fc.beginPath();
            fc.arc(ex, ey, ur, 0, Math.PI * 2);
            fc.fill();
          }
          for (const m of w.ms) {
            if (m[5] !== (myTeam === 'green' ? 0 : 1)) continue; // what our side's drone / helicopter sees
            const rr = m[0] === 1 ? 340 : 320;
            const ex = m[1] - camX;
            const ey = m[2] - camY;
            const g = fc.createRadialGradient(ex, ey, rr * 0.7, ex, ey, rr);
            g.addColorStop(0, 'rgba(0,0,0,1)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            fc.fillStyle = g;
            fc.beginPath();
            fc.arc(ex, ey, rr, 0, Math.PI * 2);
            fc.fill();
          }
          ctx.drawImage(fogCv, 0, 0);
          for (const [ux, uy, ur, left] of w.uavAreas) {
            if (ur === 0) {
              ctx.fillStyle = '#86efac';
              ctx.font = 'bold 14px system-ui, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(`UAV ONLINE  ${(left * 8).toFixed(0)}s`, VW / 2, 56);
              continue;
            }
            ctx.strokeStyle = `rgba(134,239,172,${0.35 + 0.25 * Math.sin(Date.now() / 220)})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 8]);
            ctx.beginPath();
            ctx.arc(ux - camX, uy - camY, ur, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#86efac';
            ctx.font = '12px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`UAV ${(left * 10).toFixed(0)}s`, ux - camX, uy - camY - ur + 16);
          }
          // Drones and helicopters (above the fog)
          const tnow = Date.now();
          for (const [kind, mx0, my0, ma, pid] of w.ms) {
            const sx = mx0 - camX;
            const sy = my0 - camY;
            ctx.save();
            ctx.translate(sx, sy);
            if (kind === 0) {
              // attack drone: a quadcopter seen from above, bigger now, with arms, motors, spinning rotors, a battery and a camera pod at the front
              ctx.fillStyle = 'rgba(0,0,0,0.28)';
              ctx.beginPath();
              ctx.ellipse(8, 18, 24, 11, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.rotate(ma);
              ctx.scale(1.5, 1.5);
              ctx.strokeStyle = '#1f2937'; // the four arms
              ctx.lineWidth = 3.4;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(-12, -12); ctx.lineTo(12, 12);
              ctx.moveTo(12, -12); ctx.lineTo(-12, 12);
              ctx.stroke();
              for (const [rx, ry] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
                ctx.fillStyle = '#111827'; // motor
                ctx.beginPath();
                ctx.arc(rx, ry, 3.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(203,213,225,0.22)'; // blur of the spinning blades
                ctx.beginPath();
                ctx.arc(rx, ry, 8.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(241,245,249,0.85)';
                ctx.lineWidth = 1.4;
                const ra = (tnow / 25 + rx * 3 + ry) % (Math.PI * 2);
                ctx.beginPath();
                ctx.moveTo(rx - Math.cos(ra) * 8.5, ry - Math.sin(ra) * 8.5);
                ctx.lineTo(rx + Math.cos(ra) * 8.5, ry + Math.sin(ra) * 8.5);
                ctx.moveTo(rx - Math.sin(ra) * 8.5, ry + Math.cos(ra) * 8.5);
                ctx.lineTo(rx + Math.sin(ra) * 8.5, ry - Math.cos(ra) * 8.5);
                ctx.stroke();
              }
              ctx.fillStyle = '#374151'; // body
              ctx.beginPath();
              ctx.roundRect(-8, -6, 16, 12, 4);
              ctx.fill();
              ctx.fillStyle = '#4b5563'; // battery strip
              ctx.fillRect(-6, -3, 8, 6);
              ctx.fillStyle = '#0f172a'; // camera pod at the front
              ctx.beginPath();
              ctx.arc(9, 0, 3.6, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#7dd3fc';
              ctx.beginPath();
              ctx.arc(10, 0, 1.5, 0, Math.PI * 2);
              ctx.fill();
              const blink = Math.sin(tnow / 140) > 0;
              ctx.fillStyle = blink ? '#ef4444' : '#7f1d1d'; // nav lights
              ctx.beginPath();
              ctx.arc(-9, -5, 1.4, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = blink ? '#22c55e' : '#14532d';
              ctx.beginPath();
              ctx.arc(-9, 5, 1.4, 0, Math.PI * 2);
              ctx.fill();
            } else {
              // Attack helicopter (top-down, nose to the right): slim fuselage, tandem cockpit, stub wings with rocket pods, tail boom, chin gun
              const body = pid === w.me ? '#3d4a38' : '#3a4656';
              const dark = pid === w.me ? '#2a3326' : '#273140';
              ctx.fillStyle = 'rgba(0,0,0,0.25)';
              ctx.beginPath();
              ctx.ellipse(16, 22, 38, 12, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.rotate(ma);
              ctx.scale(1.6, 1.6);
              ctx.fillStyle = dark; // tail boom, tail fin and stabilizers
              ctx.fillRect(-36, -1.6, 24, 3.2);
              ctx.fillRect(-40, -2.4, 7, 4.8);
              ctx.fillRect(-38, -7, 5, 14);
              ctx.fillStyle = dark; // stub wings with rocket pods
              ctx.fillRect(-6, -17, 8, 34);
              ctx.fillStyle = '#1f2937';
              for (const sy2 of [-1, 1]) {
                ctx.fillRect(-8, sy2 * 12 - 2.5, 14, 5);
                ctx.fillStyle = '#9ca3af';
                ctx.fillRect(6, sy2 * 12 - 1.5, 2, 3);
                ctx.fillStyle = '#1f2937';
              }
              ctx.fillStyle = body; // fuselage, narrow and pointed
              ctx.beginPath();
              ctx.moveTo(19, 0);
              ctx.quadraticCurveTo(12, -6, 0, -6);
              ctx.lineTo(-14, -3);
              ctx.lineTo(-14, 3);
              ctx.lineTo(0, 6);
              ctx.quadraticCurveTo(12, 6, 19, 0);
              ctx.fill();
              ctx.fillStyle = '#7dd3fc'; // gunner and pilot canopies, one behind the other
              ctx.beginPath();
              ctx.ellipse(12, 0, 4.5, 2.6, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#38bdf8';
              ctx.beginPath();
              ctx.ellipse(4, 0, 4.5, 2.8, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#9ca3af'; // chin minigun
              ctx.fillRect(18, -1, 9, 2);
              ctx.save();
              ctx.translate(-37, 0); // tail rotor
              ctx.rotate(-(tnow / 25) % (Math.PI * 2));
              ctx.strokeStyle = 'rgba(226,232,240,0.55)';
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.moveTo(0, -6);
              ctx.lineTo(0, 6);
              ctx.stroke();
              ctx.restore();
              ctx.rotate(-ma);
              ctx.scale(1 / 1.6, 1 / 1.6);
              ctx.rotate((tnow / 35) % (Math.PI * 2)); // main rotor: four blades, spinning
              ctx.strokeStyle = 'rgba(226,232,240,0.6)';
              ctx.lineWidth = 3.5;
              ctx.beginPath();
              for (const a of [0, Math.PI / 2]) {
                ctx.moveTo(-46 * Math.cos(a), -46 * Math.sin(a));
                ctx.lineTo(46 * Math.cos(a), 46 * Math.sin(a));
              }
              ctx.stroke();
              ctx.fillStyle = '#e5e7eb';
              ctx.beginPath();
              ctx.arc(0, 0, 3, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
          if (w.uavAreas.length) {
            ctx.strokeStyle = 'rgba(248,113,113,0.85)';
            ctx.lineWidth = 1.5;
            for (const u of alive) {
              if (u.team === myTeam) continue;
              ctx.beginPath();
              ctx.arc(u.x - camX, u.y - camY, 20 + 3 * Math.sin(Date.now() / 150), 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
      }

      ctx.restore();
      // Flashbang: the screen whites out, then fades
      if (you && you.blind > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, you.blind / 12)})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
      // Flying a drone or helicopter: a screen frame and the controls
      if (you && you.hp > 0 && you.ctl) {
        const heli = you.ctl === 2;
        const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        ctx.strokeStyle = 'rgba(134,239,172,0.75)';
        ctx.lineWidth = 1.5;
        const cx0 = mouse.current.x;
        const cy0 = mouse.current.y;
        ctx.beginPath();
        ctx.arc(cx0, cy0, 14, 0, Math.PI * 2);
        ctx.moveTo(cx0 - 22, cy0);
        ctx.lineTo(cx0 - 8, cy0);
        ctx.moveTo(cx0 + 8, cy0);
        ctx.lineTo(cx0 + 22, cy0);
        ctx.moveTo(cx0, cy0 - 22);
        ctx.lineTo(cx0, cy0 - 8);
        ctx.moveTo(cx0, cy0 + 8);
        ctx.lineTo(cx0, cy0 + 22);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#86efac';
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.fillText(heli ? `ATTACK HELICOPTER  ${(you.ctlLeft / 10).toFixed(1)}s` : `ATTACK DRONE  ${(you.ctlLeft / 10).toFixed(1)}s`, VIEW_W / 2, 84);
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText(heli ? 'WASD fly · hold click: minigun · right click: rocket · your soldier is standing still, so stay hidden' : 'WASD fly · left click or Z: explode · it sees like a UAV and the enemy cannot see it · your soldier is standing still', VIEW_W / 2, 104);
      }
      // UAV status
      if (w.uav[0] > 0 || w.uav[1] > 0) {
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = w.uav[1] > 0 ? '#fca5a5' : '#86efac';
        ctx.fillText(w.uav[1] > 0 ? `ENEMY UAV OVERHEAD ${Math.ceil(w.uav[1] / 10)}s: they can see you` : `UAV ONLINE ${Math.ceil(w.uav[0] / 10)}s: enemies marked`, VIEW_W / 2, 28);
      }
      // Kill-streak call-outs, stacked under the top edge for a few seconds
      {
        const live = w.callouts.filter((c) => now - c.at < 4500);
        live.forEach((c, i) => {
          const age = now - c.at;
          const a = age < 250 ? age / 250 : age > 3800 ? Math.max(0, (4500 - age) / 700) : 1;
          const big = c.n >= 7 ? 3 : c.n >= 5 ? 2 : 1;
          const who = c.id === w.me ? 'You are' : `${c.name} is`;
          const y = 62 + i * 40;
          ctx.save();
          ctx.globalAlpha = a;
          ctx.textAlign = 'center';
          ctx.font = `800 ${16 + big * 3}px system-ui, sans-serif`;
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          const tail = `on a ${c.n} kill streak!`;
          const full = `${who} ${tail}`;
          ctx.strokeText(full, VIEW_W / 2, y);
          ctx.fillStyle = c.n >= 7 ? '#f87171' : c.n >= 5 ? '#fb923c' : '#fde047';
          ctx.fillText(full, VIEW_W / 2, y);
          ctx.restore();
        });
      }
      // Minimap: the whole field, your side's soldiers and the point. Enemies stay hidden.
      const mw = 168;
      const mh = (mw * MAP_H) / MAP_W;
      const mx = VIEW_W - mw - 10;
      const my = 10;
      ctx.fillStyle = 'rgba(10,16,18,0.75)';
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(mx, my, mw, mh);
      const k = mw / MAP_W;
      ctx.fillStyle = 'rgba(74,222,128,0.18)';
      ctx.fillRect(mx, my, 8 * TILE * k, mh);
      ctx.fillStyle = 'rgba(248,113,113,0.18)';
      ctx.fillRect(mx + mw - 8 * TILE * k, my, 8 * TILE * k, mh);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      const mz = w.zone[2] ? w.zone : [CAP.x, CAP.y, CAP.r, 0, 0, 0];
      ctx.arc(mx + mz[0] * k, my + mz[1] * k, mz[2] * k, 0, Math.PI * 2);
      ctx.stroke();
      if (mz[3] > 0 && mz[3] <= 5) {
        ctx.strokeStyle = 'rgba(250,204,21,0.95)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(mx + mz[4] * k, my + mz[5] * k, mz[2] * k, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const t of TENTS) {
        // medic tents: a team-coloured square with a white cross
        const tx = mx + t.x * k;
        const ty = my + t.y * k;
        ctx.fillStyle = teamColor(t.team);
        ctx.fillRect(tx - 4.5, ty - 4.5, 9, 9);
        ctx.fillStyle = '#fff';
        ctx.fillRect(tx - 1, ty - 3.5, 2, 7);
        ctx.fillRect(tx - 3.5, ty - 1, 7, 2);
      }
      for (const [kx, ky, locked] of w.pickups) {
        // bazooka crates: a pulsing gold marker with a rocket on it, so they are easy to find (dim while your side's bazooka is in play)
        const bx = mx + kx * k;
        const by = my + ky * k;
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 260);
        ctx.globalAlpha = locked ? 0.4 : 1;
        ctx.strokeStyle = `rgba(251,191,36,${0.5 + 0.4 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, 6 + pulse * 2.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#0b0f12';
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(bx - 3.5, by - 1, 7, 2); // a tiny rocket
        ctx.beginPath();
        ctx.moveTo(bx + 3.5, by - 1.8);
        ctx.lineTo(bx + 6, by);
        ctx.lineTo(bx + 3.5, by + 1.8);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Spotting ping: enemies a scoped teammate is picking out at long range show as pulsing red dots on the minimap.
      const scopers = alive.filter((q) => q.team === myTeam && q.scoped);
      const uavOn = w.uav[0] > 0 || w.ms.some((m) => m[0] === 0 && m[4] === w.me); // (a flying drone shows what it sees on the minimap too)
      for (const [ux, uy, ur] of w.uavAreas) {
        if (ur === 0) continue; // (the whole-map UAV has no ring)
        ctx.strokeStyle = 'rgba(134,239,172,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mx + ux * k, my + uy * k, ur * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (scopers.length || uavOn) {
        const pulse2 = 0.5 + 0.5 * Math.sin(Date.now() / 200);
        for (const e of alive) {
          if (e.team === myTeam || !(uavOn || scopers.some((q) => inBeam(q, e, w.scopeVision, w.scopeHalf, q.id === w.me ? input.current.aim : q.aim)))) continue;
          const ex = mx + e.x * k;
          const ey = my + e.y * k;
          ctx.fillStyle = '#f87171';
          ctx.beginPath();
          ctx.arc(ex, ey, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(248,113,113,${0.4 + 0.5 * pulse2})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ex, ey, 5 + pulse2 * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      for (const u of alive) {
        if (u.team !== myTeam) continue;
        if (u.bot) {
          // test bots: a bigger amber dot with a white ring, easy to spot
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(mx + u.x * k, my + u.y * k, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          continue;
        }
        // teammates: round dots with a dark rim; you are a bigger white dot with a team-coloured ring
        const dx = mx + u.x * k;
        const dy = my + u.y * k;
        const me = u.id === w.me;
        ctx.beginPath();
        ctx.arc(dx, dy, me ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = me ? '#ffffff' : teamColor(u.team);
        ctx.fill();
        ctx.lineWidth = me ? 2 : 1;
        ctx.strokeStyle = me ? teamColor(u.team) : 'rgba(0,0,0,0.8)';
        ctx.stroke();
      }
      // Frame rate and round-trip time (F3 hides it)
      fpsN++;
      if (nowT - fpsAt >= 1000) {
        fpsShown = Math.round((fpsN * 1000) / (nowT - fpsAt));
        fpsN = 0;
        fpsAt = nowT;
      }
      if (showStats) {
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = fpsShown < 30 || w.ping > 150 ? 'rgba(252,165,165,0.9)' : 'rgba(203,213,225,0.55)';
        ctx.fillText(`${fpsShown} fps · ${w.ping} ms`, 8, VIEW_H - 8);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onStatsKey);
    };
  }, [world, input]);

  const toCanvas = (e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mouse.current = { x: ((e.clientX - r.left) * VIEW_W) / r.width, y: ((e.clientY - r.top) * VIEW_H) / r.height };
  };

  return (
    <canvas
      ref={canvas}
      width={VIEW_W}
      height={VIEW_H}
      className="game-canvas"
      onMouseMove={toCanvas}
      onMouseDown={(e) => {
        toCanvas(e);
        if (e.button === 0) input.current.fire = true;
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Battlefield. Move with W A S D, aim with the mouse, hold the left button or space to fire."
    />
  );
}
