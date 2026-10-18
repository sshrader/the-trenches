import { useEffect, useRef } from 'react';
import type { MouseEvent, MutableRefObject } from 'react';
import map from '../../shared/map.json';
import type { Input, Unit, World } from './useGame';

const TILE = map.tile as number;
const ROWS = map.rows as string[];
const COLS = ROWS[0].length;
const VIEW_W = 960;
const VIEW_H = 600;
const MAP_W = COLS * TILE;
const MAP_H = ROWS.length * TILE;
const CAP = map.capture as { x: number; y: number; r: number };
const GREEN = '#4ade80';
const RED = '#f87171';
const teamColor = (t: string) => (t === 'green' ? GREEN : RED);

function drawTile(ctx: CanvasRenderingContext2D, c: string, tx: number, ty: number, sx: number, sy: number) {
  const noise = (tx * 7 + ty * 13) % 5;
  if (c === 'T') {
    ctx.fillStyle = (tx + ty) % 2 ? '#2c2820' : '#292519';
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(sx, sy + TILE - 2, TILE, 2); // plank seam
    return;
  }
  ctx.fillStyle = ['#4a4632', '#48442f', '#4c4834', '#474330', '#4b4733'][noise];
  ctx.fillRect(sx, sy, TILE, TILE);
  if (c === '#') {
    ctx.fillStyle = '#16181a';
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = '#23272a';
    ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
  } else if (c === 'c') {
    ctx.fillStyle = '#6b5d3a'; // sandbags
    ctx.fillRect(sx + 1, sy + 3, TILE - 2, TILE - 6);
    ctx.fillStyle = '#8a7a52';
    ctx.fillRect(sx + 3, sy + 5, TILE - 6, TILE / 2 - 5);
    ctx.fillRect(sx + 3, sy + TILE / 2 + 1, TILE - 6, TILE / 2 - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(sx + 1, sy + TILE / 2 - 1, TILE - 2, 2);
  } else if (c === 'o') {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(sx + TILE / 2, sy + TILE / 2, TILE * 0.42, TILE * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawUnit(ctx: CanvasRenderingContext2D, u: Unit, sx: number, sy: number, mine: boolean, myTeam: string) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 8, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // rifle
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx + Math.cos(u.aim) * 6, sy + Math.sin(u.aim) * 6);
  ctx.lineTo(sx + Math.cos(u.aim) * 22, sy + Math.sin(u.aim) * 22);
  ctx.stroke();
  // body
  ctx.fillStyle = teamColor(u.team);
  ctx.beginPath();
  ctx.arc(sx, sy, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = mine ? 3 : 2;
  ctx.strokeStyle = mine ? '#ffffff' : 'rgba(0,0,0,0.55)';
  ctx.stroke();
  // helmet mark
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(sx - Math.cos(u.aim) * 2, sy - Math.sin(u.aim) * 2, 6, 0, Math.PI * 2);
  ctx.fill();
  if (u.prot) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(sx, sy, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (u.hp < 100) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx - 14, sy - 24, 28, 5);
    ctx.fillStyle = u.hp > 50 ? '#4ade80' : u.hp > 25 ? '#fbbf24' : '#f87171';
    ctx.fillRect(sx - 14, sy - 24, (28 * Math.max(0, u.hp)) / 100, 5);
  }
  if (u.team === myTeam && !mine) {
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(u.name, sx, sy - 30);
  }
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
    const onDown = (e: KeyboardEvent) => {
      if (typing?.()) return;
      const k = e.key.toLowerCase();
      if (k === ' ') input.current.fire = true;
      if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) return;
      e.preventDefault();
      keys.add(k);
      move();
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.delete(k);
      if (k === ' ') input.current.fire = false;
      move();
    };
    const onBlur = () => {
      keys.clear();
      input.current.dx = input.current.dy = 0;
      input.current.fire = false;
    };
    const onMouseUp = () => (input.current.fire = false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
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
        u.x += (u.tx - u.x) * 0.4; // glide toward the latest server position
        u.y += (u.ty - u.y) * 0.4;
      }
      const you = w.units.get(w.me);
      const camX = Math.max(0, Math.min(MAP_W - VIEW_W, (you?.x ?? CAP.x) - VIEW_W / 2));
      const camY = Math.max(0, Math.min(MAP_H - VIEW_H, (you?.y ?? CAP.y) - VIEW_H / 2));
      w.cam.x = camX;
      w.cam.y = camY;
      if (you) input.current.aim = Math.atan2(mouse.current.y - (you.y - camY), mouse.current.x - (you.x - camX));

      ctx.fillStyle = '#16181a';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const x0 = Math.floor(camX / TILE);
      const y0 = Math.floor(camY / TILE);
      for (let ty = y0; ty <= y0 + VIEW_H / TILE + 1 && ty < ROWS.length; ty++) {
        for (let tx = x0; tx <= x0 + VIEW_W / TILE + 1 && tx < COLS; tx++) drawTile(ctx, ROWS[ty][tx], tx, ty, tx * TILE - camX, ty * TILE - camY);
      }
      // Team zones
      ctx.fillStyle = 'rgba(74,222,128,0.07)';
      ctx.fillRect(-camX, -camY, 7 * TILE, MAP_H);
      ctx.fillStyle = 'rgba(248,113,113,0.07)';
      ctx.fillRect(MAP_W - 7 * TILE - camX, -camY, 7 * TILE, MAP_H);
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
      // Soldiers (alive only), lowest first so the ones nearer the bottom draw on top
      const myTeam = you?.team ?? '';
      const alive = [...w.units.values()].filter((u) => u.seen && u.hp > 0).sort((a, b) => a.y - b.y);
      for (const u of alive) drawUnit(ctx, u, u.x - camX, u.y - camY, u.id === w.me, myTeam);

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
      ctx.fillRect(mx, my, 7 * TILE * k, mh);
      ctx.fillStyle = 'rgba(248,113,113,0.18)';
      ctx.fillRect(mx + mw - 7 * TILE * k, my, 7 * TILE * k, mh);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(mx + CAP.x * k, my + CAP.y * k, CAP.r * k, 0, Math.PI * 2);
      ctx.stroke();
      for (const u of alive) {
        if (u.team !== myTeam) continue;
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
