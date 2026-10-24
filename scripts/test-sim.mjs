// Plain-Node checks for the simulation.  node scripts/test-sim.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CFG, addBot, addPlayer, setClass, createWorld, drainEvents, removePlayer, setInput, snapshot, solidAt, step, teamCount } from '../server/sim.mjs';

CFG.FRIENDLY_FIRE = false; // the server ships with these on for testing; the checks below are about normal play
CFG.FRIENDLY_FLASH = false;

const map = JSON.parse(fs.readFileSync(new URL('../shared/map.json', import.meta.url), 'utf8'));
let seed = 7;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// The tests need a stretch of open street, so this world has rows 15-17 cleared between x=8 and x=21 (a copy: the map file is untouched).
const fresh = () => {
  const w = createWorld(map, rng);
  w.rows = w.rows.slice();
  for (const y of [15, 16, 17]) w.rows[y] = w.rows[y].slice(0, 8) + '.'.repeat(14) + w.rows[y].slice(22);
  return w;
};
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
const LANE = 16 * 32 + 16; // middle of the cleared rows
// Open ground for line-of-fire tests: finds a street stretch and drops one cover tile into it (in this world only).
const coverSpot = (w) => {
  for (let ty = 3; ty < map.rows.length - 3; ty++) {
    for (let tx = 12; tx < 50; tx++) {
      const clear = (row) => /^[.o]+$/.test(map.rows[row].slice(tx - 4, tx + 5));
      if (clear(ty - 1) && clear(ty) && clear(ty + 1)) {
        w.rows = w.rows.slice();
        w.rows[ty] = w.rows[ty].slice(0, tx) + 'c' + w.rows[ty].slice(tx + 1);
        return { tx, ty };
      }
    }
  }
  throw new Error('no open stretch in the map');
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
  let t0 = run(w, 0.05);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false });
  t0 = run(w, 0.5, t0);
  assert.equal(e.hp, CFG.HP - 34, 'one AR hit takes a third');
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  const t = run(w, 0.8, t0); // more shots land
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false });
  run(w, 0.5, t);
  assert.equal(f.hp, CFG.HP, 'friendly fire is off');
  assert.equal(e.hp, 0, 'three AR hits kill');
});

test('cover blocks bullets', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  // Find a cover tile in the open field and put the shooter and target on either side.
  const { tx, ty } = coverSpot(w);
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

test('three AR hits kill, then the player respawns protected', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  place(a, 400, LANE, 0);
  place(e, 520, LANE);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  let now = run(w, 1.2);
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
  assert.ok(w.points.green > 5 * CFG.POINT_RATE, 'points grow for green, faster with six soldiers');
  assert.equal(w.points.red, 0);
  now = run(w, 30, now);
  assert.equal(w.round.state, 'ended');
  assert.equal(w.round.winner, 'green');
  now = run(w, CFG.END_S + 1, now);
  assert.equal(w.round.state, 'live');
  assert.equal(w.round.n, 2);
  assert.equal(w.points.green, 0);
  void gs;
});

test('a contested point does not move', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  place(a, map.capture.x - 10, map.capture.y);
  place(e, map.capture.x + 10, map.capture.y);
  run(w, 5);
  assert.equal(w.points.green + w.points.red, 0, 'nobody scores');
});

test('time up decides by who is ahead', () => {
  const w = fresh();
  const e = addPlayer(w, { name: 'e', want: 'red' });
  place(e, map.capture.x, map.capture.y);
  let now = run(w, 20);
  assert.ok(w.points.red > 0);
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
  const { tx, ty } = coverSpot(w);
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

test('30 rounds, then a reload', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  place(a, 500, openRow() * 32 + 16, 0);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  let now = 1000;
  for (let i = 0; i < CFG.CLASSES.rifleman.mag; i++) {
    now += 200;
    step(w, 0.05, now);
  }
  assert.equal(a.ammo, 0);
  assert.ok(a.reloadLeft > CFG.CLASSES.rifleman.reloadS - 0.1, 'reload starts on its own when empty');
  now += 500;
  step(w, 0.05, now);
  assert.equal(a.ammo, 0, 'no shots while reloading');
  now = run(w, 2.2, now);
  assert.ok(a.ammo >= CFG.CLASSES.rifleman.mag - 2, 'magazine is back after the reload');
});

test('artillery lands after 3 s and bursts like a big grenade: kills close, hurts farther out, never spares friends', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  const f = addPlayer(w, { name: 'f', want: 'green' });
  const h = addPlayer(w, { name: 'h', want: 'red' });
  const y = openRow() * 32 + 16;
  place(a, 500, y, 0);
  place(e, 650, y, 0);
  place(f, 640, y + 10, 0);
  place(h, 650 + 100, y, 0); // 100 px from the impact: outside the lethal ring
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
  assert.equal(w.arty.length, 0, 'one burst, no lingering cloud');
  assert.equal(e.hp, 0, 'killed at the centre');
  assert.equal(f.hp, 0, 'does not spare teammates');
  assert.ok(h.hp > 0 && h.hp < CFG.HP, 'hurt but alive farther out');
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
  const row = snapshot(w, now).p.find((q) => q[0] === a.id);
  assert.deepEqual([row[15], row[16]], [1, 0], 'kills and deaths are in the snapshot');
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

test('a medic has a limited medkit, so he cannot out-heal forever; wounded test bot', () => {
  const w = fresh();
  const m = addPlayer(w, { name: 'm', want: 'green', cls: 'medic' });
  place(m, 500, openRow() * 32 + 16);
  const bot = addBot(w, m.id, 1000);
  assert.ok(bot && bot.isBot && bot.hp === 30 && bot.team === 'green');
  assert.equal(teamCount(w, 'green'), 1, 'bots do not count for team balance');
  assert.equal(snapshot(w, 1000).p.length, 2);
  bot.x = m.x + 40;
  bot.y = m.y;
  assert.equal(addBot(w, m.id, 1000) ? 1 : 0, 1, 'a second bot is allowed');
  assert.equal(addBot(w, m.id, 1000), null, 'but not a third');
  // keep draining the bot's health: every time he is hurt, the medic spends medkit
  let now = 1000;
  let healed = 0;
  let last = bot.hp;
  for (let i = 0; i < 20 * 20; i++) {
    now += 50;
    if (i % 4 === 0) bot.hp = Math.max(1, bot.hp - 9); // 'damage': 180 HP per second is far more than a medic can heal
    last = bot.hp;
    step(w, 0.05, now);
    healed += Math.max(0, bot.hp - last);
  }
  assert.ok(m.medkit < 20, 'medkit runs dry');
  assert.ok(healed < CFG.HEAL_POOL + CFG.HEAL_REGEN * 20 + 5, `healed ${healed} in 20 s, at most pool + regen`);
  // full heal: the bot is wounded again after ~3 s so the test can be repeated
  bot.hp = CFG.HP;
  now = run(w, 3.5, now);
  assert.ok(bot.hp < 50, 'wounded again (the medic starts healing him once more)');
});

test('team score: kills this round, rounds won across rounds', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  place(a, 400, LANE, 0);
  place(e, 520, LANE);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  const now = run(w, 1.2);
  assert.deepEqual(snapshot(w, now).ts, [1, 0, 0, 0]);
  w.points.green = CFG.POINTS_TO_WIN - 0.5; // green is about to reach 100: round won
  place(a, w.map.capture.x, w.map.capture.y);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false });
  const t2 = run(w, 1, now);
  assert.deepEqual(snapshot(w, t2).ts, [1, 0, 1, 0]);
  run(w, 11, t2); // next round starts: kills reset, wins stay
  assert.deepEqual(snapshot(w, t2 + 11000).ts, [0, 0, 1, 0]);
});

test('sprint is faster, drains stamina in ~2.5 s, then must recover', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const y = openRow() * 32 + 16;
  place(a, 400, y, 0);
  const go = (sprint) => setInput(w, a.id, { dx: 1, dy: 0, aim: 0, fire: false, sprint });
  go(false);
  let now = run(w, 1);
  const walked = a.x - 400;
  place(a, 400, y, 0);
  go(true);
  now = run(w, 1, now);
  const sprinted = a.x - 400;
  assert.ok(sprinted > walked * 1.5, `sprint ${sprinted} vs walk ${walked}`);
  assert.ok(a.stamina < 70);
  now = run(w, 2, now);
  assert.ok(a.winded && a.stamina === 0, 'ran dry');
  place(a, 400, y, 0);
  now = run(w, 1, now);
  assert.ok(Math.abs(a.x - 400 - walked) < 5, 'while winded he only walks');
  go(false);
  now = run(w, 4, now);
  assert.ok(!a.winded && a.stamina > 50, 'recovered');
});

test('spawn protection: enemies cannot enter, soldiers at home are safe and cannot fire out', () => {
  const w = fresh();
  const g = addPlayer(w, { name: 'g', want: 'green' });
  const r = addPlayer(w, { name: 'r', want: 'red' });
  // The enemy walks toward the green trench and is stopped at its edge.
  place(r, 600, LANE, Math.PI);
  setInput(w, r.id, { dx: -1, dy: 0, aim: Math.PI });
  let now = run(w, 6);
  const edge = map.spawns.green.x1 + CFG.BASE_PAD;
  assert.ok(r.x > edge, 'red stays out of the green zone');
  // A red soldier shooting at a green soldier standing at home does no damage.
  setInput(w, r.id, { dx: 0, dy: 0, aim: Math.PI });
  place(g, edge - 10, LANE, 0);
  place(r, edge + 60, LANE, Math.PI);
  g.hp = r.hp = CFG.HP;
  setInput(w, r.id, { dx: 0, dy: 0, aim: Math.PI, fire: true });
  now = run(w, 2, now);
  assert.equal(g.hp, CFG.HP, 'green at home takes no damage');
  // The protected soldier cannot shoot out either.
  setInput(w, r.id, { dx: 0, dy: 0, aim: Math.PI, fire: false });
  setInput(w, g.id, { dx: 0, dy: 0, aim: 0, fire: true });
  const ammo = g.ammo;
  now = run(w, 1, now);
  assert.equal(g.ammo, ammo, 'no shooting from inside the zone');
  assert.equal(r.hp, CFG.HP, 'red untouched');
  // Once green steps out of the zone he can be hurt and can fire.
  setInput(w, g.id, { dx: 0, dy: 0, aim: 0, fire: false });
  place(g, edge + 30, LANE, 0);
  r.ammo = CFG.CLASSES.rifleman.mag; // (the 15-round magazine ran dry above)
  r.reloadLeft = 0;
  setInput(w, r.id, { dx: 0, dy: 0, aim: Math.PI, fire: true });
  now = run(w, 2, now);
  assert.ok(g.hp < CFG.HP, 'outside the zone he can be hurt');
});

test('fog of war: a side only receives enemies near its soldiers, but always its own', () => {
  const w = fresh();
  const g1 = addPlayer(w, { name: 'g1', want: 'green' });
  const g2 = addPlayer(w, { name: 'g2', want: 'green' });
  const r = addPlayer(w, { name: 'r', want: 'red' });
  g1.team = g2.team = 'green'; // the join balancer may have put one elsewhere
  r.team = 'red';
  place(g1, 600, LANE);
  place(g2, 2600, LANE);
  place(r, 600 + CFG.VISION + 100, LANE);
  const ids = (snap) => snap.p.map((q) => q[0]);
  let snap = snapshot(w, 1000, 'green');
  assert.ok(ids(snap).includes(g1.id) && ids(snap).includes(g2.id), 'teammates always listed');
  assert.ok(!ids(snap).includes(r.id), 'an enemy beyond sight is hidden');
  place(r, 600 + CFG.VISION - 50, LANE);
  snap = snapshot(w, 1000, 'green');
  assert.ok(ids(snap).includes(r.id), 'an enemy inside sight is shown');
  const far = snapshot(w, 1000, 'red');
  assert.ok(ids(far).includes(r.id) && !ids(far).includes(g2.id), 'red sees itself, not the far green soldier');
  assert.equal(snapshot(w, 1000).p.length, 3, 'no team given: everyone');
});

test('sniper: one shot kills, scope = slow + far sight, shots reveal him, limited slots', () => {
  const w = fresh();
  const sn = addPlayer(w, { name: 'sn', want: 'green', cls: 'sniper' });
  const r = addPlayer(w, { name: 'r', want: 'red' });
  sn.team = 'green';
  r.team = 'red';
  assert.equal(sn.cls, 'sniper');
  assert.equal(sn.ammo, 5, 'five rounds');
  assert.equal(sn.arty, 0, 'no artillery strike');
  // Scoped: slow, no sprint, sees much farther.
  place(sn, 600, LANE, 0);
  place(r, 600 + CFG.VISION + 150, LANE);
  assert.ok(!snapshot(w, 1000, 'green').p.some((q) => q[0] === r.id), 'unscoped he sees only the normal radius');
  setInput(w, sn.id, { dx: 1, dy: 0, aim: 0, scope: false, sprint: false });
  let now = run(w, 1);
  const free = sn.x - 600;
  place(sn, 600, LANE, 0);
  setInput(w, sn.id, { dx: 1, dy: 0, aim: 0, scope: true, sprint: true });
  now = run(w, 1, now);
  const slow = sn.x - 600;
  assert.ok(slow < free * 0.5, 'scoped is much slower and cannot sprint');
  assert.ok(sn.scoped);
  place(sn, 600, LANE, 0);
  setInput(w, sn.id, { dx: 0, dy: 0, aim: 0, scope: true });
  now = run(w, 0.1, now);
  assert.ok(snapshot(w, now, 'green').p.some((q) => q[0] === r.id), 'scoped he sees the far enemy');
  // One shot, one kill (the open lane is short, so close the range).
  place(sn, 390, LANE, 0);
  place(r, 585, LANE);
  r.hp = CFG.HP;
  setInput(w, sn.id, { dx: 0, dy: 0, aim: 0, scope: true, fire: true });
  now = run(w, 0.5, now);
  setInput(w, sn.id, { dx: 0, dy: 0, aim: 0, scope: true, fire: false });
  assert.ok(r.hp <= 0, 'a single hit kills');
  // Firing gives him away to the other side even in the fog.
  const r2 = addPlayer(w, { name: 'r2', want: 'red' });
  r2.team = 'red';
  place(r2, 2500, LANE);
  sn.revealUntil = now + 1000;
  assert.ok(snapshot(w, now, 'red').p.some((q) => q[0] === sn.id), 'just-fired sniper is visible');
  assert.ok(!snapshot(w, now + 5000, 'red').p.some((q) => q[0] === sn.id), 'and hidden again later');
  // Only MAX_SNIPERS per side.
  const a = addPlayer(w, { name: 'a', want: 'green', cls: 'sniper' });
  const b = addPlayer(w, { name: 'b', want: 'green', cls: 'sniper' });
  const c = addPlayer(w, { name: 'c', want: 'green', cls: 'sniper' });
  const snipers = [sn, a, b, c].filter((q) => q && q.team === 'green' && q.cls === 'sniper').length;
  assert.ok(snipers <= CFG.MAX_SNIPERS, 'sniper slots are limited');
});

test('bazooka: random crate, two rockets, swap with the main weapon, blast kills, gone when empty', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  const r = addPlayer(w, { name: 'r', want: 'red' });
  a.team = 'green';
  r.team = 'red';
  // A crate drops by itself after a while.
  let now = run(w, 1);
  assert.equal(w.pickups.length, 0);
  now = run(w, 20, now);
  assert.equal(w.pickups.length, 2, 'each side gets a bazooka crate');
  assert.ok(w.pickups.find((q) => q.team === 'green').x < 29 * 32 && w.pickups.find((q) => q.team === 'red').x > (map.rows[0].length - 29) * 32, 'each near its own base');
  // Take one: put a crate under the soldier.
  place(a, 390, LANE, 0);
  w.pickups = [{ id: 99, x: 390, y: LANE, team: 'green' }];
  now = run(w, 0.2, now);
  assert.equal(a.rockets, CFG.ROCKETS);
  assert.equal(a.weapon, 'rocket');
  assert.equal(w.pickups.length, 0, 'the crate is gone');
  // Swap to the rifle and back.
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, swap: 1 });
  now = run(w, 0.1, now);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, swap: 2 });
  now = run(w, 0.1, now);
  assert.equal(a.weapon, 'main', 'swap goes back to the main weapon');
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, swap: 3 });
  now = run(w, 0.1, now);
  assert.equal(a.weapon, 'rocket');
  // Fire at a soldier standing nearby: the blast kills him.
  place(r, 560, LANE);
  r.hp = CFG.HP;
  r.wasSafe = false;
  r.exitProtectReadyAt = 1e12; // the test teleported him out of his base; do not count that as walking out
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  now = run(w, 0.15, now);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false });
  now = run(w, 1, now);
  assert.ok(r.hp <= 0, 'the rocket kills');
  assert.equal(a.rockets, CFG.ROCKETS - 1);
  // Second rocket, then it is empty and he is back on his rifle.
  const ammo = a.ammo;
  place(r, 560, LANE);
  r.hp = CFG.HP;
  r.respawnAt = 0;
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  now = run(w, 1.3, now);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false });
  assert.equal(a.rockets, 0);
  assert.equal(a.weapon, 'main', 'back to the main weapon');
  assert.equal(a.ammo, ammo, 'firing rockets did not use rifle ammo');
  // No second pickup while holding one.
  w.pickups = [{ id: 100, x: a.x, y: a.y }];
  a.rockets = 1;
  now = run(w, 0.2, now);
  assert.equal(w.pickups.length, 1, 'cannot take a crate while holding rockets');
});

test('bazooka: one crate per side, own side only, one carrier at a time, a taken crate returns elsewhere after 30 s', () => {
  const w = fresh();
  const g1 = addPlayer(w, { name: 'g1', want: 'green' });
  const g2 = addPlayer(w, { name: 'g2', want: 'green' });
  const r = addPlayer(w, { name: 'r', want: 'red' });
  g1.team = g2.team = 'green';
  r.team = 'red';
  w.pickupDue = []; // no automatic drops in this test
  w.pickups = [{ id: 1, x: 390, y: LANE, team: 'green' }];
  place(r, 390, LANE);
  place(g1, 2000, LANE);
  place(g2, 2100, LANE);
  let now = run(w, 0.3);
  assert.equal(r.rockets, 0, 'the other side cannot take it');
  place(g1, 390, LANE);
  now = run(w, 0.3, now);
  assert.equal(g1.rockets, CFG.ROCKETS, 'its own side can');
  assert.equal(w.pickups.length, 0);
  // It comes back 30 s later, on the same side, elsewhere.
  now = run(w, 25, now);
  assert.equal(w.pickups.length, 0, 'not yet');
  now = run(w, 8, now);
  assert.equal(w.pickups.length, 1, 'back after 30 s');
  assert.equal(w.pickups[0].team, 'green');
  assert.ok(w.pickups[0].x < 29 * 32, 'on the green side');
  // While g1 still holds rockets a teammate cannot take the new one; once g1 is out, he can.
  place(g2, w.pickups[0].x, w.pickups[0].y);
  now = run(w, 0.3, now);
  assert.equal(g2.rockets, 0, 'one carrier at a time');
  g1.rockets = 0;
  g1.weapon = 'main';
  now = run(w, 0.3, now);
  assert.equal(g2.rockets, CFG.ROCKETS, 'allowed once his side has none');
});

test('shotgunner: 140 HP, 5 shells, spread kills up close but not far away, can swap to a pistol with its own ammo', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green', cls: 'shotgunner' });
  const e = addPlayer(w, { name: 'e', want: 'red' });
  a.team = 'green';
  e.team = 'red';
  assert.equal(a.cls, 'shotgunner');
  assert.equal(a.hp, 140, 'extra health');
  assert.equal(a.ammo, 5);
  assert.equal(a.sideAmmo, 12);
  // Point blank: one blast kills.
  place(a, 400, LANE, 0);
  place(e, 440, LANE);
  e.hp = CFG.HP;
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  let now = run(w, 0.2);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false });
  now = run(w, 0.5, now);
  assert.ok(e.hp <= 0, 'a close blast kills');
  assert.equal(a.ammo, 4, 'one shell used');
  // Far away: the pellets fall short.
  place(e, 400 + 330, LANE);
  e.hp = CFG.HP;
  e.respawnAt = 0;
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  now = run(w, 0.5, now);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false });
  now = run(w, 0.5, now);
  assert.equal(e.hp, CFG.HP, 'out of range');
  // Fire rate: slower than the AR and the SMG (110 ms).
  assert.ok(CFG.CLASSES.shotgunner.fireMs > CFG.CLASSES.rifleman.fireMs && CFG.CLASSES.shotgunner.fireMs > CFG.CLASSES.smg.fireMs);
  // Swap to the pistol: separate ammo, different fire rate.
  const shells = a.ammo;
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, swap: 0 }); // the first value only sets the counter
  now = run(w, 0.05, now);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, swap: 1 });
  now = run(w, 0.1, now);
  assert.equal(a.weapon, 'side');
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true, swap: 1 });
  now = run(w, 0.6, now);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false, swap: 1 });
  assert.ok(a.sideAmmo < 12, 'pistol ammo used');
  assert.equal(a.ammo, shells, 'shotgun shells untouched');
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, swap: 2 });
  now = run(w, 0.1, now);
  assert.equal(a.weapon, 'main', 'swap goes back to the shotgun');
  // Healing stops at his own maximum.
  a.hp = 120;
  place(a, w.tents[0].x, w.tents[0].y);
  now = run(w, 5, now);
  assert.equal(a.hp, 140, 'the tent heals him to 140, not 100');
});

test('shotgunner sprints 1.5x as long as other classes', () => {
  const run1 = (cls) => {
    const w = fresh();
    const a = addPlayer(w, { name: 'a', want: 'green', cls });
    a.team = 'green';
    place(a, 400, LANE, 0);
    setInput(w, a.id, { dx: 0, dy: 0, aim: 0, sprint: true });
    run(w, 0.05);
    let t = 0;
    let now = 1100;
    setInput(w, a.id, { dx: 1, dy: 0, aim: 0, sprint: true });
    while (!a.winded && t < 10) {
      now += 50;
      step(w, 0.05, now);
      t += 0.05;
    }
    return t;
  };
  const normal = run1('rifleman');
  const heavy = run1('shotgunner');
  assert.ok(Math.abs(heavy / normal - 1.5) < 0.15, `ratio ${heavy / normal}`);
});

test('sniper rounds pierce light cover but not buildings', () => {
  for (const [ch, shouldKill] of [['c', true], ['B', false]]) {
    const w = fresh();
    w.rows = w.rows.slice();
    const sn = addPlayer(w, { name: 'sn', want: 'green', cls: 'sniper' });
    const r = addPlayer(w, { name: 'r', want: 'red' });
    sn.team = 'green';
    r.team = 'red';
    const ty = Math.floor(LANE / 32);
    w.rows[ty] = w.rows[ty].slice(0, 14) + ch + w.rows[ty].slice(15); // wall tile between them
    place(sn, 12 * 32 + 16, LANE, 0);
    place(r, 17 * 32 + 16, LANE);
    r.hp = CFG.HP;
    sn.lastFire = -1e6;
    setInput(w, sn.id, { dx: 0, dy: 0, aim: 0, fire: true });
    let now = run(w, 0.5);
    setInput(w, sn.id, { dx: 0, dy: 0, aim: 0, fire: false });
    assert.equal(r.hp <= 0, shouldKill, `tile ${ch}`);
  }
});

test('shotgun damage falls off with distance', () => {
  const dmgAt = (dist) => {
    const w = fresh();
    const a = addPlayer(w, { name: 'a', want: 'green', cls: 'shotgunner' });
    const e = addPlayer(w, { name: 'e', want: 'red' });
    a.team = 'green';
    e.team = 'red';
    place(a, 400, LANE, 0);
    place(e, 400 + dist, LANE);
    e.hp = 10000; // measure total damage instead of killing
    setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
    let now = run(w, 0.1);
    setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false });
    run(w, 0.6, now);
    return 10000 - e.hp;
  };
  const near = dmgAt(40);
  const mid = dmgAt(140);
  assert.ok(near >= 100, `close blast kills a 100 HP soldier (${near})`);
  assert.ok(mid > 0 && mid < near * 0.7, `mid range hurts less (${mid} vs ${near})`);
});

test('switching class at home sets health to the new class maximum', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  a.team = 'green';
  const z = w.map.spawns.green;
  place(a, z.x0 + 40, LANE, 0);
  setClass(w, a.id, 'shotgunner', 100000);
  assert.equal(a.cls, 'shotgunner');
  assert.equal(a.hp, 140, 'full shotgunner health');
  setClass(w, a.id, 'rifleman', 200000);
  assert.equal(a.hp, CFG.HP, 'back to 100 for a rifleman');
});

test('one second of protection after stepping out of your own base, not chainable', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green' });
  a.team = 'green';
  const z = w.map.spawns.green;
  const edge = 8 * 32; // the safe zone ends here (spawn zone + pad)
  place(a, edge - 6, LANE, 0);
  a.protectUntil = 0;
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0 });
  let now = run(w, 0.2);
  setInput(w, a.id, { dx: 1, dy: 0, aim: 0 });
  now = run(w, 0.5, now);
  assert.ok(a.x > edge, 'he left the zone');
  assert.ok(a.protectUntil > now, 'protected just after leaving');
  now = run(w, 1.2, now);
  assert.ok(a.protectUntil <= now, 'protection ended');
  place(a, edge - 6, LANE, 0);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0 });
  now = run(w, 0.2, now);
  setInput(w, a.id, { dx: 1, dy: 0, aim: 0 });
  a.protectUntil = 0;
  now = run(w, 0.5, now);
  assert.ok(a.protectUntil <= now, 'not chained within the cooldown');
});

test('scoped sniper sees a long narrow beam along his aim, not a big circle', () => {
  const w = fresh();
  const sn = addPlayer(w, { name: 'sn', want: 'green', cls: 'sniper' });
  const ahead = addPlayer(w, { name: 'ahead', want: 'red' });
  const side = addPlayer(w, { name: 'side', want: 'red' });
  sn.team = 'green';
  ahead.team = 'red';
  side.team = 'red';
  place(sn, 400, LANE, 0);
  place(ahead, 400 + 900, LANE);
  place(side, 400, LANE + CFG.VISION + 150);
  setInput(w, sn.id, { dx: 0, dy: 0, aim: 0, scope: true });
  const now = run(w, 0.1);
  const seen = (id) => snapshot(w, now, 'green').p.some((q) => q[0] === id);
  assert.ok(seen(ahead.id), 'far enemy along the scope is seen');
  assert.ok(!seen(side.id), 'an enemy to the side beyond normal sight is not');
  setInput(w, sn.id, { dx: 0, dy: 0, aim: Math.PI / 2, scope: true });
  const n2 = run(w, 0.1, now);
  assert.ok(snapshot(w, n2, 'green').p.some((q) => q[0] === side.id), 'turning the scope toward him reveals him');
  assert.ok(!snapshot(w, n2, 'green').p.some((q) => q[0] === ahead.id), 'and the one behind is lost again');
});

test('sniper tower: E builds one under him and climbs it; rounds fly over low cover; abandoned or dead = gone', () => {
  const w = fresh();
  const sn = addPlayer(w, { name: 'sn', want: 'green', cls: 'sniper' });
  const r = addPlayer(w, { name: 'r', want: 'red' });
  sn.team = 'green';
  r.team = 'red';
  place(sn, 420, LANE, 0);
  setInput(w, sn.id, { dx: 0, dy: 0, aim: 0, nest: 0 });
  let now = run(w, 0.1);
  setInput(w, sn.id, { dx: 0, dy: 0, aim: 0, nest: 1 });
  now = run(w, 0.1, now);
  assert.equal(w.towers.length, 1, 'a tower is built');
  assert.ok(sn.elevated, 'and he is on it');
  assert.equal(w.towers[0].by, sn.id);
  const tx = w.towers[0].x;
  setInput(w, sn.id, { dx: 1, dy: 0, aim: 0, nest: 1 });
  now = run(w, 0.5, now);
  assert.equal(sn.x, tx, 'cannot walk off the platform');
  // a wall of wrecks three tiles thick is shot over
  const ty = Math.floor(LANE / 32);
  w.rows = w.rows.slice();
  for (const x of [14, 15, 16]) w.rows[ty] = w.rows[ty].slice(0, x) + 'K' + w.rows[ty].slice(x + 1);
  place(r, 620, LANE);
  r.hp = CFG.HP;
  r.wasSafe = false;
  r.exitProtectReadyAt = 1e12;
  sn.lastFire = -1e6;
  setInput(w, sn.id, { dx: 0, dy: 0, aim: 0, fire: true, nest: 1 });
  now = run(w, 0.6, now);
  setInput(w, sn.id, { dx: 0, dy: 0, aim: 0, fire: false, nest: 1 });
  assert.ok(r.hp <= 0, 'shot over the wrecks');
  // climb down; walk away for 10 s: the tower is taken down
  setInput(w, sn.id, { dx: 0, dy: 0, aim: 0, nest: 2 });
  now = run(w, 0.1, now);
  assert.ok(!sn.elevated && w.towers[0].by === null, 'climbed down');
  now = run(w, 15, now);
  assert.equal(w.towers.length, 1, 'still up after 15 s without anyone on it');
  now = run(w, 6, now);
  assert.equal(w.towers.length, 0, 'taken down after 20 s with nobody on it');
  // build another, then die: gone
  place(sn, 420, LANE, 0);
  sn.lastTower = -1e9;
  setInput(w, sn.id, { dx: 0, dy: 0, aim: 0, nest: 3 });
  now = run(w, 0.1, now);
  assert.equal(w.towers.length, 1);
  sn.hp = 0;
  now = run(w, 0.1, now);
  assert.equal(w.towers.length, 0, 'dying removes the tower');
  assert.ok(!sn.elevated);
});

test('if the builder dies while a teammate sniper is on the tower, it stays with him', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green', cls: 'sniper' });
  const b = addPlayer(w, { name: 'b', want: 'green', cls: 'sniper' });
  a.team = 'green';
  b.team = 'green';
  place(a, 420, LANE, 0);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 0 });
  setInput(w, b.id, { dx: 0, dy: 0, aim: 0, nest: 0 });
  let now = run(w, 0.1);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 1 }); // builds and climbs
  now = run(w, 0.1, now);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 2 }); // climbs down
  now = run(w, 0.1, now);
  place(b, 430, LANE, 0);
  setInput(w, b.id, { dx: 0, dy: 0, aim: 0, nest: 1 }); // teammate climbs
  now = run(w, 0.1, now);
  assert.ok(b.elevated);
  a.hp = 0; // the builder dies
  now = run(w, 0.2, now);
  assert.equal(w.towers.length, 1, 'tower stays while the teammate is on it');
  assert.equal(w.towers[0].owner, b.id, 'and now belongs to him');
  assert.ok(b.elevated);
  setInput(w, b.id, { dx: 0, dy: 0, aim: 0, nest: 2 }); // he climbs down: 20 s idle clock starts
  now = run(w, 21, now);
  assert.equal(w.towers.length, 0, 'gone 20 s after he stops using it');
});

test('one tower per sniper until he dismantles it (hold B for 5 s beside it), then he can build again', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green', cls: 'sniper' });
  a.team = 'green';
  place(a, 420, LANE, 0);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 0 });
  let now = run(w, 0.1);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 1 }); // build + climb
  now = run(w, 0.1, now);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 2 }); // down
  now = run(w, 0.1, now);
  assert.equal(w.towers.length, 1);
  // walk away and try to build a second one: refused while the first stands
  place(a, 420 + 300, LANE, 0);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 3 });
  now = run(w, 0.1, now);
  assert.equal(w.towers.length, 1, 'no second tower');
  assert.ok(!a.elevated);
  // holding B far away does nothing
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 3, dismantle: true });
  now = run(w, 6, now);
  assert.equal(w.towers.length, 1, 'too far away to dismantle');
  // beside it: 3 s is not enough, releasing resets, 5 s takes it down
  place(a, 430, LANE, 0);
  a.wasSafe = false;
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 3, dismantle: true });
  now = run(w, 3, now);
  assert.equal(w.towers.length, 1, 'not yet');
  assert.ok(w.towers[0].prog > 0.5);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 3, dismantle: false });
  now = run(w, 0.1, now);
  assert.equal(w.towers[0].prog, 0, 'releasing B starts over');
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 3, dismantle: true });
  now = run(w, 5.2, now);
  assert.equal(w.towers.length, 0, 'dismantled after 5 s');
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 4, dismantle: false });
  now = run(w, 0.1, now);
  assert.equal(w.towers.length, 1, 'and he can build a new one at once');
});

test('another sniper of the side can climb a free tower; enemies cannot', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a', want: 'green', cls: 'sniper' });
  const b = addPlayer(w, { name: 'b', want: 'green', cls: 'sniper' });
  a.team = 'green';
  b.team = 'green';
  place(a, 420, LANE, 0);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 0 });
  setInput(w, b.id, { dx: 0, dy: 0, aim: 0, nest: 0 });
  let now = run(w, 0.1);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 1 });
  now = run(w, 0.1, now);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, nest: 2 }); // down
  now = run(w, 0.1, now);
  place(b, 430, LANE, 0);
  setInput(w, b.id, { dx: 0, dy: 0, aim: 0, nest: 1 });
  now = run(w, 0.1, now);
  assert.ok(b.elevated, 'a teammate sniper uses the free tower');
  assert.equal(w.towers.length, 1, 'no second tower built beside it');
});

// ---- class specials -------------------------------------------------------------------------------------
const mk = (w, name, team, cls, x, aim = 0) => {
  const p = addPlayer(w, { name, want: team, cls });
  p.team = team;
  place(p, x, LANE, aim);
  p.wasSafe = false;
  p.exitProtectReadyAt = 1e12;
  return p;
};
const special = (w, p, n) => setInput(w, p.id, { dx: 0, dy: 0, aim: p.aim, fire: false, special: n });
const hasId = (snap, id) => snap.p.some((q) => q[0] === id);

test('AR recoil: the first shot is true, held fire spreads, letting go settles it', () => {
  const w = fresh();
  const a = mk(w, 'a', 'green', 'rifleman', 400);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: true });
  step(w, 0.05, 1000);
  assert.equal(w.bullets.at(-1).vy, 0, 'first shot goes dead straight');
  const t = run(w, 1.2, 1050);
  assert.ok(a.heat > 0.4, 'heat built up on full auto: ' + a.heat);
  setInput(w, a.id, { dx: 0, dy: 0, aim: 0, fire: false });
  run(w, 1.5, t);
  assert.equal(a.heat, 0, 'settled again');
});

test('smoke blocks the enemy view but not your own side', () => {
  const w = fresh();
  const g = mk(w, 'g', 'green', 'rifleman', 400);
  const r = mk(w, 'r', 'red', 'rifleman', 680, Math.PI);
  setInput(w, g.id, { dx: 0, dy: 0, aim: 0, range: 140, special: 0 });
  let now = run(w, 0.1);
  assert.ok(hasId(snapshot(w, now, 'red'), g.id), 'seen before the smoke');
  special(w, g, 1);
  now = run(w, 1, now);
  assert.equal(g.spec, 0, 'the one smoke is used');
  assert.equal(w.clouds.length, 1);
  assert.ok(!hasId(snapshot(w, now, 'red'), g.id), 'the enemy cannot see through it');
  assert.ok(hasId(snapshot(w, now, 'green'), r.id), 'your side sees through');
  assert.equal(snapshot(w, now, 'green').cl.length, 1);
  now = run(w, CFG.SMOKE_S + 0.5, now);
  assert.equal(w.clouds.length, 0, 'it clears');
  assert.ok(hasId(snapshot(w, now, 'red'), g.id));
  // resupply gives the smoke back
  const crate = w.crates.find((c) => c.team === 'green');
  place(g, crate.x, crate.y);
  now = run(w, 0.2, now);
  assert.equal(g.spec, 1, 'resupply refills the smoke grenade');
});

test('flashbang blinds enemies, not friends', () => {
  const w = fresh();
  const g = mk(w, 'g', 'green', 'smg', 400);
  const mate = mk(w, 'm', 'green', 'rifleman', 520);
  const r = mk(w, 'r', 'red', 'rifleman', 520, Math.PI);
  setInput(w, g.id, { dx: 0, dy: 0, aim: 0, range: 120, special: 0 });
  let now = run(w, 0.1);
  special(w, g, 1);
  now = run(w, 1, now);
  assert.ok(r.blindUntil > now, 'enemy blinded');
  assert.equal(mate.blindUntil, 0, 'friend is not');
  assert.ok(snapshot(w, now, 'red').p.find((q) => q[0] === r.id)[23] > 0, 'blind time is sent to the client');
  now = run(w, CFG.FLASH_S + 0.5, now);
  assert.ok(!(r.blindUntil > now), 'it wears off');
});

test('flashbang diminishing returns: back-to-back flashes get shorter, and it resets after a quiet spell', () => {
  const w = fresh();
  const g = mk(w, 'g', 'green', 'smg', 400);
  const r = mk(w, 'r', 'red', 'rifleman', 520, Math.PI);
  let n = 0;
  const flash = (now) => {
    g.spec = 1;
    g.lastNade = -1e6;
    setInput(w, g.id, { dx: 0, dy: 0, aim: 0, range: 120, special: ++n });
    now = run(w, 0.8, now); // thrown, in the air 0.7 s, lands
    return [now, (r.blindUntil - now) / 1000];
  };
  setInput(w, g.id, { dx: 0, dy: 0, aim: 0, range: 120, special: 0 });
  let now = run(w, 0.1);
  let left;
  [now, left] = flash(now);
  assert.ok(left > 1.6 && left <= 2, 'first flash is about 2 s: ' + left);
  [now, left] = flash(now);
  assert.ok(left > 0.7 && left <= 1, 'the second is half as long: ' + left);
  [now, left] = flash(now);
  assert.ok(left > 0.2 && left <= 0.5, 'the third is a quarter: ' + left);
  now = run(w, 12, now);
  [now, left] = flash(now);
  assert.ok(left > 1.6 && left <= 2, 'full length again after a quiet spell: ' + left);
});

test('riot shield: stops shots from the front for 5 s, then a 30 s recharge', () => {
  const w = fresh();
  const s = mk(w, 's', 'green', 'shotgunner', 520, Math.PI); // faces west
  const r = mk(w, 'r', 'red', 'rifleman', 400, 0);
  setInput(w, s.id, { dx: 0, dy: 0, aim: Math.PI, special: 0 });
  let now = run(w, 0.1);
  special(w, s, 1);
  now = run(w, 0.1, now);
  assert.ok(s.shieldUntil > now);
  setInput(w, r.id, { dx: 0, dy: 0, aim: 0, fire: true });
  now = run(w, 0.8, now);
  assert.equal(s.hp, 140, 'frontal fire is stopped');
  setInput(w, r.id, { dx: 0, dy: 0, aim: 0, fire: false });
  now = run(w, 0.5, now);
  // shot in the back while the shield is up
  const b = mk(w, 'b', 'red', 'rifleman', 640, Math.PI);
  setInput(w, b.id, { dx: 0, dy: 0, aim: Math.PI, fire: true });
  now = run(w, 0.3, now);
  setInput(w, b.id, { dx: 0, dy: 0, aim: Math.PI, fire: false });
  now = run(w, 0.3, now);
  assert.ok(s.hp < 140, 'a shot from behind still hurts');
  const hp = s.hp;
  now = run(w, 6, now);
  assert.ok(!(now < s.shieldUntil), 'the shield drops after 5 s');
  special(w, s, 2); // too soon
  now = run(w, 0.2, now);
  assert.ok(!(now < s.shieldUntil), 'still recharging');
  now = run(w, 30, now);
  special(w, s, 3);
  now = run(w, 0.2, now);
  assert.ok(now < s.shieldUntil, 'ready again after the recharge');
  void hp;
});

test('riot shield soaks 200 damage, then breaks and starts its recharge', () => {
  const w = fresh();
  const s = mk(w, 's', 'green', 'shotgunner', 520, Math.PI);
  const r = mk(w, 'r', 'red', 'sniper', 400, 0);
  setInput(w, s.id, { dx: 0, dy: 0, aim: Math.PI, special: 0 });
  let now = run(w, 0.1);
  special(w, s, 1);
  now = run(w, 0.1, now);
  assert.equal(s.shieldHp, CFG.SHIELD_HP);
  for (let i = 0; i < 2; i++) {
    r.lastFire = -1e6;
    r.ammo = 5;
    setInput(w, r.id, { dx: 0, dy: 0, aim: 0, fire: true });
    now = run(w, 0.1, now);
    setInput(w, r.id, { dx: 0, dy: 0, aim: 0, fire: false });
    now = run(w, 0.4, now);
  }
  assert.equal(s.hp, 140, 'two sniper rounds are soaked');
  assert.ok(now >= s.shieldUntil || s.shieldUntil === 0, 'the shield broke');
  assert.equal(s.shieldUntil, 0);
  assert.ok(s.specReadyAt > now + 25000, 'recharge started at the break');
  r.lastFire = -1e6;
  setInput(w, r.id, { dx: 0, dy: 0, aim: 0, fire: true });
  now = run(w, 0.5, now);
  assert.ok(s.hp < 140, 'now a round gets through');
});

test('medic flare: an air drop lands, heals friendlies for 10 s, then goes', () => {
  const w = fresh();
  const m = mk(w, 'm', 'medic', 'medic', 400);
  m.team = 'green';
  const hurtMate = mk(w, 't', 'green', 'rifleman', 500);
  const foe = mk(w, 'f', 'red', 'rifleman', 505);
  hurtMate.hp = 40;
  foe.hp = 40;
  setInput(w, m.id, { dx: 0, dy: 0, aim: 0, range: 100, special: 0 });
  let now = run(w, 0.1);
  special(w, m, 1);
  now = run(w, 1, now);
  assert.equal(w.drops.length, 1);
  assert.ok(w.drops[0].delay > 0, 'still on its way down');
  assert.equal(hurtMate.hp, 40);
  now = run(w, 3, now);
  assert.ok(hurtMate.hp > 80, 'healed: ' + hurtMate.hp);
  assert.equal(foe.hp, 40, 'enemies are not');
  assert.equal(snapshot(w, now, 'green').dr.length, 1);
  now = run(w, 12, now);
  assert.equal(w.drops.length, 0, 'gone after 10 s');
});

test('squad leader: has the AR, pistol, 2 grenades, artillery, and a UAV that shows the enemy for 10 s', () => {
  const w = fresh();
  const l = mk(w, 'l', 'green', 'squad', 400);
  const e = mk(w, 'e', 'red', 'rifleman', 900);
  const far = mk(w, 'far', 'red', 'rifleman', 1700);
  assert.equal(l.grenades, 2);
  assert.equal(l.arty, 1);
  assert.equal(l.sideAmmo, 10, 'has a pistol');
  let now = run(w, 0.1);
  assert.ok(!hasId(snapshot(w, now, 'green'), e.id), 'enemy is in the fog');
  special(w, l, 0);
  now = run(w, 0.1, now);
  special(w, l, 1);
  now = run(w, 0.2, now);
  assert.ok(hasId(snapshot(w, now, 'green'), e.id), 'UAV shows the enemy inside its circle');
  assert.ok(!hasId(snapshot(w, now, 'green'), far.id), 'but not one far outside it');
  assert.equal(snapshot(w, now, 'green').ua.length, 1, 'the lifted area is sent');
  assert.ok(snapshot(w, now, 'red').uv[1] > 0, 'the enemy is told about it');
  assert.ok(!hasId(snapshot(w, now, 'red'), l.id), 'but it is only for the leader\'s side');
  now = run(w, 10, now);
  assert.ok(!hasId(snapshot(w, now, 'green'), e.id), 'gone after 10 s');
  special(w, l, 2);
  now = run(w, 1, now);
  assert.ok(!hasId(snapshot(w, now, 'green'), e.id), 'recharging: no second UAV yet');
  const crate = w.crates.find((c) => c.team === 'green');
  place(l, crate.x, crate.y);
  l.grenades = 0;
  now = run(w, 0.2, now);
  assert.ok(now < l.specReadyAt, 'resupply does not reset the UAV');
  place(l, 400, LANE);
  now = run(w, 61, now);
  special(w, l, 3);
  now = run(w, 0.2, now);
  assert.ok(hasId(snapshot(w, now, 'green'), e.id), 'ready again after 60 s');
});

test('leaving removes the player', () => {
  const w = fresh();
  const a = addPlayer(w, { name: 'a' });
  removePlayer(w, a.id);
  assert.equal(w.players.size, 0);
});

console.log(`\n${n} checks passed`);
