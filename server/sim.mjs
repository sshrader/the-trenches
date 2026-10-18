// The Trenches simulation. Pure logic: no sockets, no timers, so it can be tested with plain Node.
// Everything that matters (movement, shots, damage, capture, rounds) is decided here, on the server.

export const CFG = {
  SPEED: 150, // px per second
  RADIUS: 11, // player body
  HP: 100,
  DAMAGE: 34, // three hits to kill
  FIRE_MS: 450, // rifle: one shot per 450 ms
  BULLET_SPEED: 720,
  BULLET_LIFE: 1.1, // seconds
  BULLET_R: 3,
  RESPAWN_S: 4,
  PROTECT_S: 1.5, // can't be hurt just after spawning
  CAP_RATE: 0.012, // capture progress per second per player in the circle (up to CAP_MAX)
  CAP_MAX: 6,
  CAP_DECAY: 0.01, // an empty point drifts back to neutral
  ROUND_S: 360,
  END_S: 10,
  MAX_PER_TEAM: 30,
};

const TEAMS = ['green', 'red'];
const otherTeam = (t) => (t === 'green' ? 'red' : 'green');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createWorld(map, rng = Math.random) {
  return {
    map,
    rows: map.rows,
    W: map.rows[0].length,
    H: map.rows.length,
    tile: map.tile,
    rng,
    players: new Map(),
    bullets: [],
    progress: 0, // -1 red owns the point ... +1 green owns it
    round: { n: 1, state: 'live', left: CFG.ROUND_S, winner: null, endLeft: 0 },
    events: [],
    nextId: 1,
  };
}

export const solidAt = (w, px, py) => {
  const tx = Math.floor(px / w.tile);
  const ty = Math.floor(py / w.tile);
  if (tx < 0 || ty < 0 || tx >= w.W || ty >= w.H) return true;
  const c = w.rows[ty][tx];
  return c === '#' || c === 'c';
};
export const blockedAt = (w, x, y, r = CFG.RADIUS) =>
  solidAt(w, x - r, y - r) || solidAt(w, x + r, y - r) || solidAt(w, x - r, y + r) || solidAt(w, x + r, y + r);

export const teamCount = (w, team) => [...w.players.values()].filter((p) => p.team === team).length;

function spawnPoint(w, team) {
  const z = w.map.spawns[team];
  for (let i = 0; i < 40; i++) {
    const x = z.x0 + w.rng() * (z.x1 - z.x0);
    const y = z.y0 + w.rng() * (z.y1 - z.y0);
    if (!blockedAt(w, x, y, CFG.RADIUS + 2)) return { x, y };
  }
  return { x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 };
}

function respawn(w, p, now) {
  const s = spawnPoint(w, p.team);
  p.x = s.x;
  p.y = s.y;
  p.hp = CFG.HP;
  p.protectUntil = now + CFG.PROTECT_S * 1000;
  p.respawnAt = 0;
  // Face the enemy.
  p.aim = p.team === 'green' ? 0 : Math.PI;
}

/** Adds a player. `want` is 'green' | 'red' | 'random'. Returns the player, or null when both teams are full. */
export function addPlayer(w, { name, want = 'random' }, now = Date.now()) {
  const g = teamCount(w, 'green');
  const r = teamCount(w, 'red');
  let team = want === 'green' || want === 'red' ? want : g === r ? TEAMS[Math.floor(w.rng() * 2)] : g < r ? 'green' : 'red';
  // Keep the teams even: you can only join the bigger side if it is not already ahead.
  const mine = team === 'green' ? g : r;
  const theirs = team === 'green' ? r : g;
  if (mine > theirs) team = otherTeam(team);
  if (teamCount(w, team) >= CFG.MAX_PER_TEAM) team = otherTeam(team);
  if (teamCount(w, team) >= CFG.MAX_PER_TEAM) return null;
  const p = {
    id: w.nextId++,
    name,
    team,
    x: 0,
    y: 0,
    aim: 0,
    hp: CFG.HP,
    dx: 0,
    dy: 0,
    fire: false,
    lastFire: 0,
    protectUntil: 0,
    respawnAt: 0,
    kills: 0,
    deaths: 0,
  };
  respawn(w, p, now);
  w.players.set(p.id, p);
  return p;
}

export const removePlayer = (w, id) => w.players.delete(id);

export function setInput(w, id, { dx, dy, aim, fire }) {
  const p = w.players.get(id);
  if (!p) return;
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  p.dx = clamp(n(dx), -1, 1);
  p.dy = clamp(n(dy), -1, 1);
  if (Number.isFinite(Number(aim))) p.aim = Number(aim) % (Math.PI * 2);
  p.fire = !!fire;
}

function endRound(w, winner) {
  w.round.state = 'ended';
  w.round.winner = winner;
  w.round.endLeft = CFG.END_S;
  w.bullets = [];
  for (const p of w.players.values()) {
    p.dx = p.dy = 0;
    p.fire = false;
  }
  w.events.push({ t: 'round', winner });
}

function newRound(w, now) {
  w.round = { n: w.round.n + 1, state: 'live', left: CFG.ROUND_S, winner: null, endLeft: 0 };
  w.progress = 0;
  w.bullets = [];
  for (const p of w.players.values()) respawn(w, p, now);
}

/** Advance the world by dt seconds. `now` is a millisecond clock. */
export function step(w, dt, now = Date.now()) {
  if (w.round.state === 'ended') {
    w.round.endLeft -= dt;
    if (w.round.endLeft <= 0) newRound(w, now);
    return;
  }

  // Players: respawn, move, shoot.
  for (const p of w.players.values()) {
    if (p.hp <= 0) {
      if (p.respawnAt && now >= p.respawnAt) respawn(w, p, now);
      continue;
    }
    const len = Math.hypot(p.dx, p.dy);
    if (len > 0) {
      const k = (len > 1 ? 1 / len : 1) * CFG.SPEED * dt;
      const nx = p.x + p.dx * k;
      if (!blockedAt(w, nx, p.y)) p.x = nx;
      const ny = p.y + p.dy * k;
      if (!blockedAt(w, p.x, ny)) p.y = ny;
    }
    if (p.fire && now - p.lastFire >= CFG.FIRE_MS) {
      p.lastFire = now;
      const c = Math.cos(p.aim);
      const s = Math.sin(p.aim);
      w.bullets.push({ x: p.x + c * 14, y: p.y + s * 14, vx: c * CFG.BULLET_SPEED, vy: s * CFG.BULLET_SPEED, life: CFG.BULLET_LIFE, owner: p.id, team: p.team });
    }
  }

  // Bullets: move in small steps so they cannot jump through cover or a player.
  const alive = [];
  for (const b of w.bullets) {
    const dist = CFG.BULLET_SPEED * dt;
    const steps = Math.max(1, Math.ceil(dist / 6));
    let dead = false;
    for (let i = 0; i < steps && !dead; i++) {
      b.x += (b.vx * dt) / steps;
      b.y += (b.vy * dt) / steps;
      if (solidAt(w, b.x, b.y)) {
        dead = true;
        break;
      }
      for (const t of w.players.values()) {
        if (t.team === b.team || t.hp <= 0 || now < t.protectUntil) continue;
        if (Math.hypot(t.x - b.x, t.y - b.y) <= CFG.RADIUS + CFG.BULLET_R) {
          t.hp -= CFG.DAMAGE;
          dead = true;
          if (t.hp <= 0) {
            t.hp = 0;
            t.deaths++;
            t.respawnAt = now + CFG.RESPAWN_S * 1000;
            t.dx = t.dy = 0;
            t.fire = false;
            const k = w.players.get(b.owner);
            if (k) k.kills++;
            w.events.push({ t: 'kill', killer: k ? k.name : '?', kteam: b.team, victim: t.name, vteam: t.team });
          }
          break;
        }
      }
    }
    b.life -= dt;
    if (!dead && b.life > 0) alive.push(b);
  }
  w.bullets = alive;

  // Capture point.
  const cap = w.map.capture;
  const inside = { green: 0, red: 0 };
  for (const p of w.players.values()) {
    if (p.hp > 0 && Math.hypot(p.x - cap.x, p.y - cap.y) <= cap.r) inside[p.team]++;
  }
  if (inside.green && !inside.red) w.progress += CFG.CAP_RATE * Math.min(inside.green, CFG.CAP_MAX) * dt;
  else if (inside.red && !inside.green) w.progress -= CFG.CAP_RATE * Math.min(inside.red, CFG.CAP_MAX) * dt;
  else if (!inside.green && !inside.red) {
    const d = CFG.CAP_DECAY * dt;
    w.progress = Math.abs(w.progress) <= d ? 0 : w.progress - Math.sign(w.progress) * d;
  }
  w.progress = clamp(w.progress, -1, 1);
  if (w.progress >= 1) return endRound(w, 'green');
  if (w.progress <= -1) return endRound(w, 'red');

  // Clock.
  w.round.left -= dt;
  if (w.round.left <= 0) endRound(w, w.progress > 0.05 ? 'green' : w.progress < -0.05 ? 'red' : 'draw');
}

/** What every client needs each tick. Kept small. */
export function snapshot(w, now = Date.now()) {
  const p = [];
  for (const q of w.players.values()) p.push([q.id, Math.round(q.x), Math.round(q.y), Math.round(q.aim * 100) / 100, q.hp, now < q.protectUntil ? 1 : 0]);
  const b = w.bullets.map((x) => [Math.round(x.x), Math.round(x.y)]);
  return {
    t: 's',
    p,
    b,
    c: Math.round(w.progress * 1000) / 1000,
    r: { n: w.round.n, s: w.round.state, l: Math.ceil(Math.max(0, w.round.state === 'live' ? w.round.left : w.round.endLeft)), w: w.round.winner },
  };
}

export const roster = (w) => [...w.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team }));

export function scoreboard(w) {
  return [...w.players.values()]
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    .slice(0, 10)
    .map((p) => ({ id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths }));
}

export const drainEvents = (w) => w.events.splice(0, w.events.length);
