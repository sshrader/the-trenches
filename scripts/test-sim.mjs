// Plain-Node checks for the simulation.  node scripts/test-sim.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CFG, addPlayer, createWorld, drainEvents, removePlayer, setInput, snapshot, step, teamCount } from '../server/sim.mjs';

const map = JSON.parse(fs.readFileSync(new URL('../shared/map.json', import.meta.url), 'utf8'));
let seed = 7;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const fresh = () => createWorld(map, rng);
const run = (w, secs, t0 = 1000) => {
  let now = t0;
  for (let i = 0; i < secs * 20; i++) {
    now += 50;
    step(w, 0.05, now);
  }
  return now;
};
const place = (p, x, y, aim = 0) => {
  p.x = x;
  p.y = y;
  p.aim = aim;
  p.protectUntil = 0;
};
let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log('ok  ' + name);
};

test('map is symmetric and enclosed', () => {
  const r = map.rows;
  for (const row of r) assert.equal(row, [...row].reverse().join(''));
  assert.ok(r[0].split('').every((c) => c === '#'));
});

test('teams stay balanced', () => {
  const w = fresh();
  for (let i = 0; i < 10; i++) addPlayer(w, { name: 'a' + i, want: 'green' });
  assert.equal(teamCount(w, 'green'), 5);
  assert.equal(teamCount(w, 'red'), 5);
});

test('walls and cover stop movement', () => {
  const w = fresh();
  const p = addPlayer(w, { name: 'a', want: 'green' });
  place(p, 100, 100);
  setInput(w, p.id, { dx: -1, dy: 0, aim: 0, fire: false });
  run(w, 3);
  assert.ok(p.x >= 32 + CFG.RADIUS - 0.01, 'stayed inside the border wall');
});

test('a bullet hits an enemy, not a friend', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const f = addPlayer(w, { name: 'f', want: 'green' });
  f.team = 'green'; // the balancer would have put a second joiner on red
  const e = addPlayer(w, { name: 'e', want: 'red' });
  e.team = 'red';
  place(a, 400, 300, 0);
  place(f, 460, 300);
  place(e, 560, 300);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  const t = run(w, 0.4);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false });
  run(w, 0.5, t);
  assert.equal(f.hp, CFG.HP, 'friendly fire is off');
  assert.equal(e.hp, CFG.HP - CFG.DAMAGE);
});

test('cover blocks bullets', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  // Find a cover tile in the open field and put the shooter and target on either side.
  const ty = 12;
  const tx = map.rows[ty].indexOf('c', 10);
  place(a, (tx - 3) * 32 + 16, ty * 32 + 16, 0);
  place(e, (tx + 3) * 32 + 16, ty * 32 + 16);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  run(w, 1.5);
  assert.equal(e.hp, CFG.HP);
});

test('fire rate is limited by the server', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  place(a, 400, 300, 0);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  let shots = 0;
  let now = 1000;
  for (let i = 0; i < 40; i++) {
    now += 50;
    const before = w.bullets.length;
    step(w, 0.05, now);
    if (w.bullets.length > before) shots++;
  }
  assert.ok(shots <= Math.ceil(2000 / CFG.FIRE_MS) + 1, `fired ${shots} times in 2s`);
});

test('three hits kill, then the player respawns protected', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  place(a, 400, 300, 0);
  place(e, 520, 300);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  let now = run(w, 1.8);
  assert.equal(e.hp, 0);
  assert.equal(a.kills, 1);
  assert.equal(e.deaths, 1);
  assert.equal(drainEvents(w).filter((x) => x.t === 'kill').length, 1);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false });
  now = run(w, CFG.RESPAWN_S + 0.5, now);
  assert.equal(e.hp, CFG.HP);
  const s = snapshot(w, now);
  assert.equal(s.p.find((q) => q[0] === e.id)[5], 1, 'shows as protected');
});

test('holding the point wins the round, then a new round starts', () => {
  const w = fresh();
  const gs = [1, 2, 3, 4, 5, 6].map((i) => addPlayer(w, { name: 'g' + i, want: 'green' }));
  const rs = [1, 2, 3, 4, 5, 6].map((i) => addPlayer(w, { name: 'r' + i, want: 'red' }));
  void rs;
  for (const p of w.players.values()) if (p.team === 'green') place(p, map.capture.x + 10, map.capture.y);
  for (const p of w.players.values()) if (p.team === 'red') place(p, 100, 100);
  let now = run(w, 5);
  assert.ok(w.progress > 0, 'progress grows for green');
  now = run(w, 12, now);
  assert.equal(w.round.state, 'ended');
  assert.equal(w.round.winner, 'green');
  now = run(w, CFG.END_S + 1, now);
  assert.equal(w.round.state, 'live');
  assert.equal(w.round.n, 2);
  assert.equal(w.progress, 0);
  void gs;
});

test('a contested point does not move', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  place(a, map.capture.x - 10, map.capture.y);
  place(e, map.capture.x + 10, map.capture.y);
  run(w, 5);
  assert.equal(w.progress, 0);
});

test('time up decides by who is ahead', () => {
  const w = fresh();
  const e = addPlayer(w, { name: 'e', want: 'red' });
  place(e, map.capture.x, map.capture.y);
  let now = run(w, 20);
  assert.ok(w.progress < 0);
  e.x = e.y = 100;
  w.round.left = 1;
  now = run(w, 2, now);
  assert.equal(w.round.winner, 'red');
});

test('leaving removes the player', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a' });
  removePlayer(w, a.id);
  assert.equal(w.players.size, 0);
});

console.log(`\n${n} checks passed`);
