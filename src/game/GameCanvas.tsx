import { useEffect, useRef } from 'react';
import type { MouseEvent, MutableRefObject } from 'react';
import map from '../../shared/map.json';
import type { Input, Unit, World } from './useGame';

const TILE = map.tile as number;
const ROWS = map.rows as string[];
const COLS = ROWS[0].length;
const VIEW_W = 1152; // a wider field of view than before: the camera is zoomed out a little
const VIEW_H = 720;
const MAP_W = COLS * TILE;
const MAP_H = ROWS.length * TILE;
const CAP = map.capture as { x: number; y: number; r: number };
type Prop = { kind: string; x: number; y: number; w: number; h: number; flip?: boolean; v?: number };
const PROPS = ((map as unknown as { props?: Prop[] }).props ?? []) as Prop[];
const CRATES = ((map as unknown as { crates?: { x: number; y: number; team: string }[] }).crates ?? []);
const GREEN = '#4ade80';
const RED = '#f87171';
const teamColor = (t: string) => (t === 'green' ? GREEN : RED);

// Tiles that belong to a street (painted asphalt) rather than a sidewalk or lot.
const ROADS = (map as unknown as { roads?: { v: number[][]; h: number[][] } }).roads ?? { v: [], h: [] };
const onRoad = (tx: number, ty: number) => ROADS.v.some(([a, b]) => tx >= a && tx <= b) || ROADS.h.some(([a, b]) => ty >= a && ty <= b);

function drawTile(ctx: CanvasRenderingContext2D, c: string, tx: number, ty: number, sx: number, sy: number) {
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
  ctx.strokeStyle = 'rgba(134,239,172,0.3)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(sx + w / 2, sy + h / 2, 80, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(sx + 6, sy + 8, w - 8, h - 8);
  ctx.fillStyle = '#c9c2a4';
  ctx.fillRect(sx + 2, sy + 2, w - 8, h - 8);
  ctx.fillStyle = '#b3ab8b'; // the ridge line and two roof panels
  ctx.fillRect(sx + 2, sy + 2 + (h - 8) / 2 - 2, w - 8, 4);
  ctx.strokeStyle = '#6f6850';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx + 2, sy + 2, w - 8, h - 8);
  ctx.fillStyle = '#dc2626';
  const cx = sx + 2 + (w - 8) / 2;
  const cy = sy + 2 + (h - 8) / 2;
  ctx.fillRect(cx - 5, cy - 16, 10, 32);
  ctx.fillRect(cx - 16, cy - 5, 32, 10);
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
  ctx.fillStyle = u.hp > 50 ? '#4ade80' : u.hp > 25 ? '#fbbf24' : '#f87171';
  ctx.fillRect(sx - 15, sy - 28, (30 * Math.max(0, Math.min(100, u.hp))) / 100, 5);
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
function drawFallen(ctx: CanvasRenderingContext2D, u: Unit, sx: number, sy: number) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.translate(sx, sy);
  ctx.rotate(u.aim + 1.3);
  ctx.fillStyle = UNIFORM[u.team];
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = HELMET[u.team];
  ctx.beginPath();
  ctx.arc(11, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#7a4e2a';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-6, 13);
  ctx.lineTo(10, 15);
  ctx.stroke();
  ctx.restore();
}

export default function GameCanvas({ world, input, typing }: { world: MutableRefObject<World>; input: MutableRefObject<Input>; typing?: () => boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: VIEW_W / 2 + 40, y: VIEW_H / 2 });

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
      if (typing?.()) return;
      const k = e.key.toLowerCase();
      if (k === 'shift') {
        shift = true;
        input.current.sprint = true;
      }
      if (k === ' ') input.current.fire = true;
      if (k === 'r' && !e.repeat) input.current.reload += 1;
      if (k === 't' && !e.repeat) input.current.arty += 1;
      if (k === 'q' && !e.repeat) input.current.swap += 1; // swap between the bazooka and your main weapon
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
      move();
    };
    const onBlur = () => {
      keys.clear();
      shift = right = false;
      input.current.sprint = false;
      input.current.scope = false;
      input.current.dx = input.current.dy = 0;
      input.current.fire = false;
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
  }, [input, typing]);

  // Drawing loop.
  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let raf = 0;
    const frame = () => {
      const w = world.current;
      for (const u of w.units.values()) {
        const px = u.x;
        const py = u.y;
        u.x += (u.tx - u.x) * 0.4; // glide toward the latest server position
        u.y += (u.ty - u.y) * 0.4;
        u.walk += Math.hypot(u.x - px, u.y - py); // drives the walking animation
      }
      const you = w.units.get(w.me);
      const camX = Math.max(0, Math.min(MAP_W - VIEW_W, (you?.x ?? CAP.x) - VIEW_W / 2));
      const camY = Math.max(0, Math.min(MAP_H - VIEW_H, (you?.y ?? CAP.y) - VIEW_H / 2));
      w.cam.x = camX;
      w.cam.y = camY;
      if (you) {
        const mdx = mouse.current.x - (you.x - camX);
        const mdy = mouse.current.y - (you.y - camY);
        input.current.aim = Math.atan2(mdy, mdx);
        input.current.range = Math.hypot(mdx, mdy); // grenades land where the cursor is
      }

      ctx.fillStyle = '#16181a';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const x0 = Math.floor(camX / TILE);
      const y0 = Math.floor(camY / TILE);
      for (let ty = y0; ty <= y0 + VIEW_H / TILE + 1 && ty < ROWS.length; ty++) {
        for (let tx = x0; tx <= x0 + VIEW_W / TILE + 1 && tx < COLS; tx++) drawTile(ctx, ROWS[ty][tx], tx, ty, tx * TILE - camX, ty * TILE - camY);
      }
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
        if (px < -200 || py < -200 || px > VIEW_W + 100 || py > VIEW_H + 100) continue;
        if (pr.kind === 'car') drawCar(ctx, pr, px, py);
        else if (pr.kind === 'debris') drawDebris(ctx, pr, px, py);
        else if (pr.kind === 'tent') drawTent(ctx, pr, px, py);
      }
      // Bazooka crates: an olive box with a rocket on the lid and a pulsing ring so they are easy to spot
      for (const [kx, ky, locked] of w.pickups) {
        const px = kx - camX;
        const py = ky - camY;
        if (px < -60 || py < -60 || px > VIEW_W + 60 || py > VIEW_H + 60) continue;
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
        if (px > -40 && py > -40 && px < VIEW_W + 40 && py < VIEW_H + 40) drawCrate(ctx, cr.team, w.crates[i] !== 0, px, py);
      });
      // Capture point
      const p = w.progress;
      ctx.beginPath();
      ctx.arc(CAP.x - camX, CAP.y - camY, CAP.r, 0, Math.PI * 2);
      ctx.fillStyle = p > 0 ? `rgba(74,222,128,${0.1 + p * 0.3})` : p < 0 ? `rgba(248,113,113,${0.1 - p * 0.3})` : 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = p > 0.02 ? GREEN : p < -0.02 ? RED : 'rgba(255,255,255,0.5)';
      ctx.stroke();
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
      for (const u of seen) if (u.hp <= 0) drawFallen(ctx, u, u.x - camX, u.y - camY);
      for (const u of alive) drawSoldier(ctx, u, u.x - camX, u.y - camY, u.id === w.me, myTeam, now);
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
      for (const [gx, gy, f] of w.nades) {
        const lift = Math.sin(Math.min(1, f) * Math.PI) * 46;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(gx - camX, gy - camY, 6, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3f4a36';
        ctx.beginPath();
        ctx.arc(gx - camX, gy - camY - lift, 5 + lift / 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (f <= 0 && Math.floor(Date.now() / 120) % 2 === 0) {
          ctx.fillStyle = '#f87171'; // sizzling fuse once it has landed
          ctx.fillRect(gx - camX - 1, gy - camY - 8, 2, 3);
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
        if (fogCv.width !== VIEW_W) fogCv.width = VIEW_W;
        if (fogCv.height !== VIEW_H) fogCv.height = VIEW_H;
        const fc = fogCv.getContext('2d');
        if (fc) {
          fc.globalCompositeOperation = 'source-over';
          fc.clearRect(0, 0, VIEW_W, VIEW_H);
          fc.fillStyle = 'rgba(6,9,11,0.74)';
          fc.fillRect(0, 0, VIEW_W, VIEW_H);
          fc.globalCompositeOperation = 'destination-out';
          const vr = w.vision;
          for (const u of seen) {
            if (u.team !== myTeam || u.hp <= 0) continue;
            const ux = u.x - camX;
            const uy = u.y - camY;
            if (ux < -w.scopeVision || uy < -w.scopeVision || ux > VIEW_W + w.scopeVision || uy > VIEW_H + w.scopeVision) continue;
            const rr = u.scoped ? w.scopeVision : vr;
            const g = fc.createRadialGradient(ux, uy, rr * 0.72, ux, uy, rr);
            g.addColorStop(0, 'rgba(0,0,0,1)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            fc.fillStyle = g;
            fc.beginPath();
            fc.arc(ux, uy, rr, 0, Math.PI * 2);
            fc.fill();
          }
          ctx.drawImage(fogCv, 0, 0);
        }
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
      ctx.arc(mx + CAP.x * k, my + CAP.y * k, CAP.r * k, 0, Math.PI * 2);
      ctx.stroke();
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
        ctx.fillStyle = u.id === w.me ? '#ffffff' : teamColor(u.team);
        ctx.fillRect(mx + u.x * k - 1.5, my + u.y * k - 1.5, 3, 3);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
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
