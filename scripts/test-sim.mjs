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

test('shots are reported once for sound and flashes', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  place(a, 400, 300, 0);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  step(w, 0.05, 1000);
  assert.deepEqual(snapshot(w, 1000).f, [[400, 300, a.id]]);
  step(w, 0.05, 1050);
  assert.deepEqual(snapshot(w, 1050).f, [], 'not repeated on the next tick');
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

// Press G: the client raises a counter and sends where the cursor is.
const press = (w, p, range, n) => setInput(w, p.id, { dx: 0, dy: 0, aim: p.aim, fire: false, nade: n, range });
const openRow = () => map.rows.findIndex((r) => r.slice(12, 40) === '.'.repeat(28));

test('a grenade flies over cover and kills inside the lethal ring', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  // Shooter behind a cover tile, target 200 px away on the other side of it.
  const ty = 12;
  const tx = map.rows[ty].indexOf('c', 10);
  place(a, (tx - 2) * 32 + 16, ty * 32 + 16, 0);
  place(e, (tx - 2) * 32 + 16 + 200, ty * 32 + 16);
  press(w, a, 200, 0);
  step(w, 0.05, 1000);
  press(w, a, 200, 1);
  assert.equal(a.wantNade, true);
  let now = run(w, 1, 1050);
  assert.equal(w.nades.length, 1, 'still in play');
  assert.equal(e.hp, CFG.HP, 'not hurt before the bang');
  now = run(w, 1.4, now);
  assert.equal(w.nades.length, 0);
  assert.equal(e.hp, 0, 'killed by the blast');
  assert.equal(a.grenades, CFG.GRENADES - 1);
  const ev = drainEvents(w);
  assert.ok(ev.some((x) => x.t === 'boom'));
  assert.ok(ev.some((x) => x.t === 'kill' && x.weapon === 'grenade'));
});

test('grenades spare friends and are blocked by cover', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const f = addPlayer(w, { name: 'f', want: 'green' });
  f.team = 'green';
  const e = addPlayer(w, { name: 'e', want: 'red' });
  e.team = 'red';
  const ty = openRow();
  place(a, 500, ty * 32 + 16, 0);
  place(f, 700, ty * 32 + 16);
  place(e, 700, ty * 32 + 16 + 30);
  press(w, a, 200, 0);
  step(w, 0.05, 1000);
  press(w, a, 200, 1);
  run(w, 3, 1050);
  assert.equal(f.hp, CFG.HP, 'no friendly fire');
  assert.equal(e.hp, 0, 'enemy next to the blast dies');

  // Now put cover between a fresh blast and a target.
  const w2 = fresh();
  const a2 = addPlayer(w2, { name: 'a', want: 'green' });
  const e2 = addPlayer(w2, { name: 'e', want: 'red' });
  const row = 12;
  const cx = map.rows[row].indexOf('c', 10);
  place(a2, (cx - 3) * 32 + 16, row * 32 + 16, 0);
  place(e2, (cx + 2) * 32 + 16, row * 32 + 16);
  // Land the grenade just before the cover, so the cover sits between the blast and the target.
  press(w2, a2, 2 * 32, 0);
  step(w2, 0.05, 1000);
  press(w2, a2, 2 * 32, 1);
  run(w2, 3, 1050);
  assert.equal(e2.hp, CFG.HP, 'cover shields from the blast');
});

test('two grenades per life, with a cooldown, refilled on respawn', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  place(a, 500, openRow() * 32 + 16, 0);
  press(w, a, 150, 0);
  step(w, 0.05, 1000);
  let n = 1;
  let now = 1050;
  press(w, a, 150, n++);
  step(w, 0.05, now);
  assert.equal(a.grenades, 1);
  press(w, a, 150, n++); // too soon: cooldown
  now += 50;
  step(w, 0.05, now);
  assert.equal(a.grenades, 1, 'cooldown holds');
  now = run(w, 1, now);
  press(w, a, 150, n++);
  step(w, 0.05, now + 50);
  assert.equal(a.grenades, 0);
  now = run(w, 1, now + 50);
  press(w, a, 150, n++);
  step(w, 0.05, now + 50);
  assert.equal(a.grenades, 0, 'a third throw does nothing');
  assert.equal(snapshot(w, now).p[0][6], 0, 'count is in the snapshot');
  a.hp = 0;
  a.respawnAt = now + 1;
  run(w, 1, now + 100);
  assert.equal(a.grenades, CFG.GRENADES);
});

test('leaving removes the player', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a' });
  removePlayer(w, a.id);
  assert.equal(w.players.size, 0);
});

console.log(`\n${n} checks passed`);
