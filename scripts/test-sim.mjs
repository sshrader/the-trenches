// Plain-Node checks for the simulation.  node scripts/test-sim.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CFG, addPlayer, setClass, createWorld, drainEvents, removePlayer, setInput, snapshot, step, teamCount } from '../server/sim.mjs';

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
// A row with open ground from x=380 to x=600 (the generated map has scenery almost everywhere).
const LANE = (map.rows.findIndex((r, i) => i > 3 && [0, 1, 2].every((d) => map.rows[i + d].slice(11, 20) === '.'.repeat(9))) + 1) * 32 + 16;
// A cover tile with 3 clear tiles of open ground on each side of it (and the row above/below it open), for line-of-fire tests.
const coverSpot = () => {
  for (let ty = 3; ty < map.rows.length - 3; ty++) {
    for (let tx = 12; tx < 50; tx++) {
      if (map.rows[ty][tx] !== 'c') continue;
      const clear = (row, a, b) => map.rows[row].slice(a, b) === '.'.repeat(b - a);
      if (clear(ty, tx - 4, tx) && clear(ty, tx + 1, tx + 5) && '.o'.includes(map.rows[ty - 1][tx]) && '.o'.includes(map.rows[ty + 1][tx])) return { tx, ty };
    }
  }
  throw new Error('no cover spot in the map');
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
  place(a, 400, LANE, 0);
  place(f, 460, LANE);
  place(e, 560, LANE);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  const t = run(w, 0.4);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false });
  run(w, 0.5, t);
  assert.equal(f.hp, CFG.HP, 'friendly fire is off');
  assert.equal(e.hp, 0);
});

test('cover blocks bullets', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  // Find a cover tile in the open field and put the shooter and target on either side.
  const { tx, ty } = coverSpot();
  place(a, (tx - 3) * 32 + 16, ty * 32 + 16, 0);
  place(e, (tx + 3) * 32 + 16, ty * 32 + 16);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  run(w, 1.5);
  assert.equal(e.hp, CFG.HP);
});

test('fire rate is limited by the server', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  place(a, 400, LANE, 0);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  let shots = 0;
  let now = 1000;
  for (let i = 0; i < 40; i++) {
    now += 50;
    const before = w.bullets.length;
    step(w, 0.05, now);
    if (w.bullets.length > before) shots++;
  }
  assert.ok(shots <= Math.ceil(2000 / CFG.CLASSES.rifleman.fireMs) + 1, `fired ${shots} times in 2s`);
});

test('shots are reported once for sound and flashes', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  place(a, 400, LANE, 0);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  step(w, 0.05, 1000);
  assert.deepEqual(snapshot(w, 1000).f, [[400, LANE, a.id]]);
  step(w, 0.05, 1050);
  assert.deepEqual(snapshot(w, 1050).f, [], 'not repeated on the next tick');
});

test('one rifle hit kills, then the player respawns protected', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  place(a, 400, LANE, 0);
  place(e, 520, LANE);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  let now = run(w, 0.6);
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
const openRow = () => map.rows.findIndex((r, i) => i > 3 && [0, 1].every((d) => map.rows[i + d].slice(12, 28) === '.'.repeat(16)));

test('a grenade flies over cover and kills inside the lethal ring', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  // Shooter behind a cover tile, target 200 px away on the other side of it.
  const { tx, ty } = coverSpot();
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

test('grenades hurt friends and the thrower too (but give no kill credit), and cover still shields', () => {
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
  assert.equal(f.hp, 0, 'friendly blast kills a teammate');
  assert.equal(a.kills, 1, 'only the enemy counts as a kill');
  assert.equal(drainEvents(w).filter((x) => x.t === 'kill' && x.tk).length, 1);
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

test('8 rounds, then a 2 second reload', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  place(a, 500, openRow() * 32 + 16, 0);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  let now = 1000;
  for (let i = 0; i < 8; i++) {
    now += 800;
    step(w, 0.05, now);
  }
  assert.equal(a.ammo, 0);
  assert.ok(a.reloadLeft > 1.9, 'reload starts on its own when empty');
  now += 500;
  step(w, 0.05, now);
  assert.equal(a.ammo, 0, 'no shots while reloading');
  now = run(w, 2.2, now);
  assert.ok(a.ammo >= CFG.CLASSES.rifleman.mag - 2, 'magazine is back after the reload');
});

test('artillery lands after 3 s, then gas kills a full-health enemy in 4 s, and never hurts friends', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  const f = addPlayer(w, { name: 'f', want: 'green' });
  const y = openRow() * 32 + 16;
  place(a, 500, y, 0);
  place(e, 650, y, 0);
  place(f, 640, y + 10, 0);
  e.dx = e.dy = 0;
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false, range: 150, arty: 0 });
  step(w, 0.05, 1000);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false, range: 150, arty: 1 });
  let now = 1050;
  step(w, 0.05, now);
  assert.equal(a.arty, 0);
  assert.equal(w.arty.length, 1);
  now = run(w, 2.5, now);
  assert.equal(e.hp, CFG.HP, 'still in the air');
  assert.equal(snapshot(w, now).a[0][2], 0);
  now = run(w, 1, now); // impact
  assert.equal(snapshot(w, now).a[0][2], 1, 'gas is down');
  assert.ok(e.hp < CFG.HP && e.hp > 0, 'burning but alive early on');
  now = run(w, 3.6, now);
  assert.equal(e.hp, 0, 'a full 4 seconds kills');
  assert.equal(f.hp, 0, 'gas does not spare teammates');
  assert.equal(w.arty.length, 0, 'gas is gone after 4 s');
  a.hp = 0;
  a.respawnAt = now + 1;
  run(w, 1, now + 100);
  assert.equal(a.arty, CFG.ARTY);
});

test('a resupply crate refills only its own side, then needs 30 s', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  const mine = w.crates.find((c) => c.team === 'green');
  place(a, mine.x, mine.y);
  place(e, mine.x + 4, mine.y);
  a.ammo = 2;
  a.grenades = 0;
  a.arty = 0;
  e.ammo = 2;
  let now = run(w, 0.1);
  assert.equal(a.ammo, CFG.CLASSES.rifleman.mag);
  assert.equal(a.grenades, CFG.GRENADES);
  assert.equal(a.arty, CFG.ARTY);
  assert.equal(e.ammo, 2, 'the enemy cannot use it');
  assert.ok(snapshot(w, now).k.includes(0), 'crate shows as used');
  a.ammo = 1;
  now = run(w, 5, now);
  assert.equal(a.ammo, 1, 'still restocking');
  now = run(w, 26, now);
  assert.equal(a.ammo, CFG.CLASSES.rifleman.mag, 'ready again after 30 s');
});

test('SMG: five hits to kill and much faster fire; medic pistol; class weapon on the kill', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green', cls: 'smg' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  place(a, 400, LANE, 0);
  place(e, 480, LANE);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  let now = 1000;
  let hits = 0;
  while (e.hp > 0 && hits < 10) {
    now += 50;
    const before = e.hp;
    step(w, 0.05, now);
    if (e.hp < before) hits++;
  }
  assert.equal(hits, 5, 'five hits');
  assert.equal(drainEvents(w).find((x) => x.t === 'kill').weapon, 'smg');
  assert.ok(a.ammo < 20 && a.ammo >= 10, 'smg uses its own 20-round magazine');
  const m = addPlayer(w, { name: 'm', want: 'green', cls: 'medic' });
  assert.equal(m.ammo, 10);
  assert.equal(snapshot(w, now).p.find((q) => q[0] === m.id)[10], 2, 'class is in the snapshot');
});

test('a medic heals teammates next to him, not enemies or himself; the tent heals its side', () => {
  const w = fresh();
  const m = addPlayer(w, { name: 'm', want: 'green', cls: 'medic' });
  const f = addPlayer(w, { name: 'f', want: 'red' });
  const g = addPlayer(w, { name: 'g', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  place(m, 400, LANE);
  place(g, 430, LANE);
  place(e, 440, LANE);
  place(f, 440, LANE + 5);
  g.hp = 40;
  e.hp = 40;
  m.hp = 60;
  run(w, 2);
  assert.ok(g.hp > 70, 'teammate healed');
  assert.equal(e.hp, 40, 'enemy not healed');
  assert.equal(m.hp, 60, 'medic does not heal himself');
  assert.ok(snapshot(w, 3000).p.find((q) => q[0] === m.id)[11] === 1 || g.hp >= CFG.HP);
  const tent = w.tents.find((t) => t.team === 'green');
  place(g, tent.x, tent.y);
  g.hp = 10;
  run(w, 2);
  assert.ok(g.hp > 50, 'tent heals');
  const redTent = w.tents.find((t) => t.team === 'red');
  place(g, redTent.x, redTent.y);
  g.hp = 10;
  run(w, 1);
  assert.equal(g.hp, 10, "the other side's tent does not");
  // Cooldown: heal to full at the tent, then it will not heal again for 30 s.
  place(g, tent.x, tent.y);
  g.hp = 30;
  let now = run(w, 5, 100000);
  assert.equal(g.hp, CFG.HP);
  assert.ok(snapshot(w, now).p.find((q) => q[0] === g.id)[12] > 20, 'cooldown shows in the snapshot');
  g.hp = 30;
  now = run(w, 5, now);
  assert.equal(g.hp, 30, 'on cooldown');
  now = run(w, 28, now);
  now = run(w, 5, now);
  assert.equal(g.hp, CFG.HP, 'ready again after 30 s');
});

test('a short grenade throw hurts the thrower, and kills him with no credit', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  place(a, 500, openRow() * 32 + 16, 0);
  press(w, a, 70, 0);
  step(w, 0.05, 1000);
  press(w, a, 70, 1); // lands 70 px away: inside the 100 px blast, outside the lethal 45
  run(w, 3, 1050);
  assert.ok(a.hp < CFG.HP && a.hp > 0, 'hurt by his own grenade, not dead');
  assert.equal(a.kills, 0);
  a.hp = 10;
  a.protectUntil = 0;
  a.grenades = 1;
  a.lastNade = 0;
  press(w, a, 70, 2);
  const ev = (run(w, 3, 5000), drainEvents(w));
  assert.equal(a.hp, 0);
  assert.ok(ev.some((x) => x.t === 'kill' && x.self));
  assert.equal(a.kills, 0, 'no credit for killing yourself');
});

test('class change: at once in your trench, next life elsewhere; cooldown between changes', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  setClass(w, a.id, 'smg', 10000);
  assert.equal(a.cls, 'smg', 'in the trench it is immediate');
  assert.equal(a.ammo, 20);
  place(a, w.map.capture.x - 200, w.map.capture.y);
  setClass(w, a.id, 'medic', 20000);
  assert.equal(a.cls, 'smg', 'out in the field it waits');
  assert.equal(a.nextCls, 'medic');
  a.hp = 0;
  a.respawnAt = 20001;
  run(w, 1, 20100);
  assert.equal(a.cls, 'medic', 'applied on respawn');
  assert.equal(a.ammo, 10);
});

test('teams are rebalanced when one side gets ahead', () => {
  const w = fresh();
  const gs = [1, 2, 3, 4].map((i) => addPlayer(w, { name: 'g' + i, want: 'green' }));
  void gs;
  assert.equal(teamCount(w, 'green'), 2);
  assert.equal(teamCount(w, 'red'), 2);
  for (const p of [...w.players.values()].filter((q) => q.team === 'red')) w.players.delete(p.id); // two red players leave: 2 v 0
  assert.equal(teamCount(w, 'red'), 0);
  const victim = [...w.players.values()].sort((a, b) => b.id - a.id)[0];
  victim.hp = 0;
  victim.respawnAt = 1e12;
  run(w, 0.2);
  assert.equal(teamCount(w, 'green'), 1, 'a dead soldier is moved across');
  assert.equal(teamCount(w, 'red'), 1);
  const ev = drainEvents(w).filter((x) => x.t === 'team');
  assert.equal(ev.length, 1);
  // new round: living players are moved too
  const w2 = fresh();
  for (let i = 0; i < 4; i++) addPlayer(w2, { name: 'p' + i, want: 'green' });
  for (const p of [...w2.players.values()].filter((q) => q.team === 'red')) w2.players.delete(p.id);
  w2.round.state = 'ended';
  w2.round.endLeft = 0.01;
  run(w2, 0.2);
  assert.equal(teamCount(w2, 'green'), 1);
  assert.equal(teamCount(w2, 'red'), 1);
});

test('leaving removes the player', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a' });
  removePlayer(w, a.id);
  assert.equal(w.players.size, 0);
});

console.log(`\n${n} checks passed`);
