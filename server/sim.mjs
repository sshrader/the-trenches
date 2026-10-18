// The Trenches simulation. Pure logic: no sockets, no timers, so it can be tested with plain Node.
// Everything that matters (movement, shots, damage, capture, rounds) is decided here, on the server.

export const CFG = {
  SPEED: 150, // px per second
  RADIUS: 11, // player body
  HP: 100,
  BULLET_R: 3,
  // Classes. `life` is how long a bullet flies, so speed x life is the weapon's reach.
  CLASSES: {
    rifleman: { label: 'Rifleman', weapon: 'rifle', mag: 8, reloadS: 2, fireMs: 700, damage: 100, speed: 760, life: 1.5 }, // one hit kills, longest reach
    smg: { label: 'SMG', weapon: 'smg', mag: 20, reloadS: 2, fireMs: 110, damage: 21, speed: 620, life: 0.6 }, // five hits kill, short reach
    medic: { label: 'Medic', weapon: 'pistol', mag: 10, reloadS: 2, fireMs: 350, damage: 25, speed: 600, life: 0.5 }, // heals teammates next to him
  },
  HEAL_RADIUS: 60, // a medic heals teammates this close ...
  HEAL_RATE: 18, // ... at this many HP per second
  HEAL_POOL: 100, // a medic's medkit: total HP he can give out before it runs dry ...
  HEAL_REGEN: 4, // ... and how fast it refills per second, so standing on someone cannot keep him alive forever
  TENT_R: 80, // the medic tent heals anyone on its side this close
  TENT_RATE: 24,
  TENT_COOLDOWN_S: 30, // after using the tent, each soldier waits this long before it heals him again
  RESPAWN_S: 4,
  PROTECT_S: 1.5, // can't be hurt just after spawning
  CAP_RATE: 0.012, // capture progress per second per player in the circle (up to CAP_MAX)
  CAP_MAX: 6,
  CAP_DECAY: 0.01, // an empty point drifts back to neutral
  ROUND_S: 360,
  END_S: 10,
  MAX_PER_TEAM: 30,
  ARTY: 1, // artillery strikes per life
  ARTY_DELAY_S: 3, // call-in to impact
  ARTY_GAS_S: 4, // how long the gas lingers
  ARTY_DPS: 26, // 4 s in the cloud is 104 damage: a full-health soldier does not survive
  ARTY_RADIUS: 120,
  ARTY_COOLDOWN_MS: 1000,
  CRATE_R: 24, // walk this close to your own crate to resupply
  CRATE_COOLDOWN_S: 30,
  FRIENDLY_BLASTS: true, // grenades and gas hurt your own side and yourself (bullets still do not)
  GRENADES: 2, // per life
  NADE_FLIGHT_S: 0.7, // in the air (flies over cover)
  NADE_FUSE_S: 2.0, // from the throw to the bang
  NADE_COOLDOWN_MS: 800,
  NADE_MIN: 70, // throw range limits in px
  NADE_MAX: 380,
  NADE_RADIUS: 100, // blast reach
  NADE_LETHAL: 45, // inside this, it kills
  NADE_OUTER_MAX: 70, // damage just outside the lethal ring ...
  NADE_OUTER_MIN: 20, // ... fading to this at the edge
};

export const CLASS_IDS = ['rifleman', 'smg', 'medic'];
const cls = (p) => CFG.CLASSES[p.cls];
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
    nades: [],
    tents: map.tents || [],
    crates: (map.crates || []).map((c) => ({ x: c.x, y: c.y, team: c.team, readyAt: 0 })),
    arty: [], // incoming strikes and lingering gas clouds
    progress: 0, // -1 red owns the point ... +1 green owns it
    round: { n: 1, state: 'live', left: CFG.ROUND_S, winner: null, endLeft: 0 },
    events: [],
    shots: [], // [x, y, shooterId] fired during the latest step, for clients to draw flashes and play sounds
    nextId: 1,
  };
}

export const solidAt = (w, px, py) => {
  const tx = Math.floor(px / w.tile);
  const ty = Math.floor(py / w.tile);
  if (tx < 0 || ty < 0 || tx >= w.W || ty >= w.H) return true;
  const c = w.rows[ty][tx];
  return c === '#' || c === 'c' || c === 'B' || c === 'K' || c === 'Y'; // wall, sandbags, ruin, tank wreck, tree
};
export const blockedAt = (w, x, y, r = CFG.RADIUS) =>
  solidAt(w, x - r, y - r) || solidAt(w, x + r, y - r) || solidAt(w, x - r, y + r) || solidAt(w, x + r, y + r);

/** Is there open ground (no wall or cover) between two points? Used so a blast does not go through cover. */
export function lineClear(w, x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(1, Math.ceil(d / 8));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (solidAt(w, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}

export const teamCount = (w, team) => [...w.players.values()].filter((p) => p.team === team && !p.isBot).length;

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
  p.medkit = CFG.HEAL_POOL;
  if (p.nextCls) {
    p.cls = p.nextCls; // a class change waits for the next life
    p.nextCls = null;
  }
  const s = p.isBot ? p.post : spawnPoint(w, p.team);
  p.x = s.x;
  p.y = s.y;
  p.hp = CFG.HP;
  p.protectUntil = now + CFG.PROTECT_S * 1000;
  p.respawnAt = 0;
  p.grenades = CFG.GRENADES;
  p.arty = CFG.ARTY;
  p.ammo = cls(p).mag;
  p.reloadLeft = 0;
  p.tentReadyAt = 0;
  p.tentUsing = false;
  // Face the enemy.
  p.aim = p.team === 'green' ? 0 : Math.PI;
}

/** Adds a player. `want` is 'green' | 'red' | 'random'. Returns the player, or null when both teams are full. */
export function addPlayer(w, { name, want = 'random', cls: wantCls = 'rifleman' }, now = Date.now()) {
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
    grenades: CFG.GRENADES,
    arty: CFG.ARTY,
    cls: CLASS_IDS.includes(wantCls) ? wantCls : 'rifleman',
    healing: false,
    ammo: 0,
    reloadLeft: 0, // seconds until the magazine is back
    nadeSeq: null,
    reloadSeq: null,
    artySeq: null,
    wantNade: false,
    wantReload: false,
    wantArty: false,
    lastArty: 0,
    nadeRange: 200,
    lastNade: 0,
    protectUntil: 0,
    respawnAt: 0,
    kills: 0,
    deaths: 0,
    tentReadyAt: 0,
    tentUsing: false,
    nextCls: null,
    lastClassChange: 0,
  };
  respawn(w, p, now);
  w.players.set(p.id, p);
  return p;
}

/** A stationary, wounded teammate for testing medics. Stays at 30 HP: three seconds after being healed to full it is wounded again. */
export function addBot(w, ownerId, now = Date.now()) {
  const o = w.players.get(ownerId);
  if (!o || o.hp <= 0) return null;
  if ([...w.players.values()].filter((p) => p.isBot && p.owner === ownerId).length >= 2) return null;
  let spot = null;
  for (const [dx, dy] of [[70, 0], [-70, 0], [0, 70], [0, -70], [50, 50], [-50, -50], [50, -50], [-50, 50]]) {
    if (!blockedAt(w, o.x + dx, o.y + dy, CFG.RADIUS + 2)) {
      spot = { x: o.x + dx, y: o.y + dy };
      break;
    }
  }
  if (!spot) return null;
  const p = addPlayer(w, { name: 'Wounded Bot', want: o.team }, now);
  if (!p) return null;
  w.players.delete(p.id);
  p.team = o.team;
  p.isBot = true;
  p.owner = ownerId;
  p.post = spot;
  p.fullAt = 0;
  respawn(w, p, now);
  p.protectUntil = 0;
  p.hp = 30;
  w.players.set(p.id, p);
  return p;
}

export function removeBotsOf(w, ownerId) {
  const ids = [];
  for (const p of [...w.players.values()]) {
    if (p.isBot && p.owner === ownerId) {
      w.players.delete(p.id);
      ids.push(p.id);
    }
  }
  return ids;
}

export const removePlayer = (w, id) => w.players.delete(id);

export function setInput(w, id, { dx, dy, aim, fire, nade, range, reload, arty }) {
  const p = w.players.get(id);
  if (!p) return;
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  p.dx = clamp(n(dx), -1, 1);
  p.dy = clamp(n(dy), -1, 1);
  if (Number.isFinite(Number(aim))) p.aim = Number(aim) % (Math.PI * 2);
  p.fire = !!fire;
  if (Number.isFinite(Number(range))) p.nadeRange = clamp(Number(range), CFG.NADE_MIN, CFG.NADE_MAX);
  // A throw is a counter going up (one press = +1), so a repeated message can never throw twice.
  if (nade !== undefined && nade !== p.nadeSeq) {
    if (p.nadeSeq !== null) p.wantNade = true;
    p.nadeSeq = nade;
  }
  if (reload !== undefined && reload !== p.reloadSeq) {
    if (p.reloadSeq !== null) p.wantReload = true;
    p.reloadSeq = reload;
  }
  if (arty !== undefined && arty !== p.artySeq) {
    if (p.artySeq !== null) p.wantArty = true;
    p.artySeq = arty;
  }
}

/** Ask for another class. Takes effect on the next life, or at once while dead or standing in your own trench. */
export function setClass(w, id, wantCls, now = Date.now()) {
  const p = w.players.get(id);
  if (!p || !CLASS_IDS.includes(wantCls)) return;
  if (wantCls === p.cls && !p.nextCls) return;
  if (now - p.lastClassChange < 5000) return;
  p.lastClassChange = now;
  const z = w.map.spawns[p.team];
  const home = p.x >= z.x0 && p.x <= z.x1;
  if (wantCls === p.cls) {
    p.nextCls = null;
  } else if (p.hp <= 0) {
    p.nextCls = wantCls; // applied when he respawns
  } else if (home) {
    p.cls = wantCls;
    p.nextCls = null;
    p.ammo = cls(p).mag;
    p.reloadLeft = 0;
    p.fire = false;
  } else {
    p.nextCls = wantCls;
  }
}

/** Keep the sides within one player of each other. `force` moves living players too (used between rounds). */
function rebalance(w, now, force) {
  for (let guard = 0; guard < 60; guard++) {
    const g = teamCount(w, 'green');
    const r = teamCount(w, 'red');
    if (Math.abs(g - r) < 2) return;
    const big = g > r ? 'green' : 'red';
    const mine = [...w.players.values()].filter((p) => p.team === big && !p.isBot);
    const pick = mine.filter((p) => p.hp <= 0).sort((a, b) => b.id - a.id)[0] || (force ? mine.sort((a, b) => b.id - a.id)[0] : null);
    if (!pick) return;
    pick.team = otherTeam(big);
    pick.tentUsing = false;
    w.events.push({ t: 'team', id: pick.id, team: pick.team });
    if (pick.hp > 0) respawn(w, pick, now);
  }
}

function endRound(w, winner) {
  w.round.state = 'ended';
  w.round.winner = winner;
  w.round.endLeft = CFG.END_S;
  w.bullets = [];
  w.nades = [];
  w.arty = [];
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
  w.nades = [];
  w.arty = [];
  for (const c of w.crates) c.readyAt = 0;
  rebalance(w, now, true);
  for (const p of w.players.values()) respawn(w, p, now);
}

function hurt(w, t, amount, ownerId, ownerTeam, now, weapon) {
  t.hp -= amount;
  if (t.hp > 0) return;
  t.hp = 0;
  t.deaths++;
  t.respawnAt = now + CFG.RESPAWN_S * 1000;
  t.dx = t.dy = 0;
  t.fire = false;
  t.wantNade = t.wantReload = t.wantArty = false;
  const k = w.players.get(ownerId);
  const own = !!k && k.team === t.team; // killed himself or a teammate: no credit
  if (k && !own) k.kills++;
  w.events.push({ t: 'kill', killer: k ? k.name : '?', kteam: ownerTeam, victim: t.name, vteam: t.team, weapon, self: k === t, tk: own && k !== t });
}

function explode(w, n, now) {
  w.events.push({ t: 'boom', x: Math.round(n.x), y: Math.round(n.y) });
  for (const t of w.players.values()) {
    if ((!CFG.FRIENDLY_BLASTS && t.team === n.team) || t.hp <= 0 || now < t.protectUntil) continue;
    const d = Math.hypot(t.x - n.x, t.y - n.y);
    if (d > CFG.NADE_RADIUS || !lineClear(w, n.x, n.y, t.x, t.y)) continue;
    const dmg =
      d <= CFG.NADE_LETHAL
        ? CFG.HP
        : CFG.NADE_OUTER_MAX - ((CFG.NADE_OUTER_MAX - CFG.NADE_OUTER_MIN) * (d - CFG.NADE_LETHAL)) / (CFG.NADE_RADIUS - CFG.NADE_LETHAL);
    hurt(w, t, dmg, n.owner, n.team, now, 'grenade');
  }
}

function throwNade(w, p, now) {
  if (p.hp <= 0 || p.grenades <= 0 || now - p.lastNade < CFG.NADE_COOLDOWN_MS) return;
  p.grenades--;
  p.lastNade = now;
  const c = Math.cos(p.aim);
  const s = Math.sin(p.aim);
  let dist = p.nadeRange;
  // It lands on open ground: if the target is inside a wall or cover, pull it back toward the thrower.
  while (dist > CFG.NADE_MIN / 2 && solidAt(w, p.x + c * dist, p.y + s * dist)) dist -= 8;
  w.nades.push({ sx: p.x, sy: p.y, x: p.x, y: p.y, tx: p.x + c * dist, ty: p.y + s * dist, flight: CFG.NADE_FLIGHT_S, fuse: CFG.NADE_FUSE_S, owner: p.id, team: p.team });
}

function callArty(w, p, now) {
  if (p.hp <= 0 || p.arty <= 0 || now - p.lastArty < CFG.ARTY_COOLDOWN_MS) return;
  p.arty--;
  p.lastArty = now;
  const c = Math.cos(p.aim);
  const s = Math.sin(p.aim);
  let dist = p.nadeRange; // same reach as a grenade
  while (dist > CFG.NADE_MIN / 2 && solidAt(w, p.x + c * dist, p.y + s * dist)) dist -= 8;
  w.events.push({ t: 'arty', x: Math.round(p.x + c * dist), y: Math.round(p.y + s * dist), fx: Math.round(w.map.tile * (p.team === 'green' ? 3 : w.W - 3)), fy: Math.round(p.y), delay: CFG.ARTY_DELAY_S });
  w.arty.push({ x: p.x + c * dist, y: p.y + s * dist, delay: CFG.ARTY_DELAY_S, gas: 0, owner: p.id, team: p.team });
}

/** Advance the world by dt seconds. `now` is a millisecond clock. */
export function step(w, dt, now = Date.now()) {
  w.shots = [];
  if (w.round.state === 'ended') {
    w.round.endLeft -= dt;
    if (w.round.endLeft <= 0) newRound(w, now);
    return;
  }

  rebalance(w, now, false); // someone left? a dead soldier on the bigger side is moved over

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
    if (p.reloadLeft > 0) {
      p.reloadLeft -= dt;
      if (p.reloadLeft <= 0) {
        p.reloadLeft = 0;
        p.ammo = cls(p).mag;
      }
    }
    if (p.wantReload) {
      p.wantReload = false;
      if (p.reloadLeft <= 0 && p.ammo < cls(p).mag) p.reloadLeft = cls(p).reloadS;
    }
    if (p.fire && p.reloadLeft <= 0 && p.ammo > 0 && now - p.lastFire >= cls(p).fireMs) {
      p.lastFire = now;
      p.ammo--;
      if (p.ammo <= 0) p.reloadLeft = cls(p).reloadS; // empty: reload on its own
      const c = Math.cos(p.aim);
      const s = Math.sin(p.aim);
      w.shots.push([Math.round(p.x), Math.round(p.y), p.id]);
      const k = cls(p);
      w.bullets.push({ x: p.x + c * 14, y: p.y + s * 14, vx: c * k.speed, vy: s * k.speed, speed: k.speed, damage: k.damage, weapon: k.weapon, life: k.life, owner: p.id, team: p.team });
    }
  }

  for (const p of w.players.values()) {
    if (p.wantNade) {
      p.wantNade = false;
      throwNade(w, p, now);
    }
    if (p.wantArty) {
      p.wantArty = false;
      callArty(w, p, now);
    }
  }

  // Bullets: move in small steps so they cannot jump through cover or a player.
  const alive = [];
  for (const b of w.bullets) {
    const dist = b.speed * dt;
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
          dead = true;
          hurt(w, t, b.damage, b.owner, b.team, now, b.weapon);
          break;
        }
      }
    }
    b.life -= dt;
    if (!dead && b.life > 0) alive.push(b);
  }
  w.bullets = alive;

  // Grenades fly in an arc (over cover), land, then go off when the fuse runs out.
  const live = [];
  for (const n of w.nades) {
    if (n.flight > 0) {
      n.flight = Math.max(0, n.flight - dt);
      const k = 1 - n.flight / CFG.NADE_FLIGHT_S;
      n.x = n.sx + (n.tx - n.sx) * k;
      n.y = n.sy + (n.ty - n.sy) * k;
    }
    n.fuse -= dt;
    if (n.fuse <= 0) explode(w, n, now);
    else live.push(n);
  }
  w.nades = live;

  // Artillery: the shell is on its way for a few seconds, lands, and leaves gas that burns anyone standing in it.
  const clouds = [];
  for (const a of w.arty) {
    if (a.delay > 0) {
      a.delay -= dt;
      if (a.delay <= 0) {
        a.delay = 0;
        a.gas = CFG.ARTY_GAS_S;
        w.events.push({ t: 'boom', x: Math.round(a.x), y: Math.round(a.y), big: true });
      }
    } else {
      a.gas -= dt;
      for (const t of w.players.values()) {
        if ((!CFG.FRIENDLY_BLASTS && t.team === a.team) || t.hp <= 0 || now < t.protectUntil) continue;
        if (Math.hypot(t.x - a.x, t.y - a.y) <= CFG.ARTY_RADIUS) hurt(w, t, CFG.ARTY_DPS * dt, a.owner, a.team, now, 'gas');
      }
    }
    if (a.delay > 0 || a.gas > 0) clouds.push(a);
  }
  w.arty = clouds;

  // Healing: a medic mends teammates standing next to him, and each side's tent mends anyone close to it.
  for (const p of w.players.values()) p.healing = false;
  for (const m of w.players.values()) {
    if (m.cls !== 'medic' || m.hp <= 0) continue;
    m.medkit = Math.min(CFG.HEAL_POOL, m.medkit + CFG.HEAL_REGEN * dt);
    for (const t of w.players.values()) {
      if (t === m || t.team !== m.team || t.hp <= 0 || t.hp >= CFG.HP) continue;
      if (Math.hypot(t.x - m.x, t.y - m.y) > CFG.HEAL_RADIUS) continue;
      const amt = Math.min(CFG.HEAL_RATE * dt, CFG.HP - t.hp, m.medkit);
      if (amt <= 0) continue;
      t.hp += amt;
      m.medkit -= amt;
      m.healing = true;
    }
  }
  // Test bots get wounded again a few seconds after they are fully healed.
  for (const b of w.players.values()) {
    if (!b.isBot || b.hp <= 0) continue;
    if (b.hp >= CFG.HP) {
      if (!b.fullAt) b.fullAt = now;
      else if (now - b.fullAt > 3000) {
        b.hp = 30;
        b.fullAt = 0;
      }
    } else b.fullAt = 0;
  }
  // The tent heals a soldier while he stands in it; once he is full or walks away, he must wait out the cooldown.
  for (const t of w.players.values()) {
    const inTent = t.hp > 0 && w.tents.some((tent) => tent.team === t.team && Math.hypot(t.x - tent.x, t.y - tent.y) <= CFG.TENT_R);
    if (t.tentUsing && (!inTent || t.hp >= CFG.HP)) {
      t.tentUsing = false;
      t.tentReadyAt = now + CFG.TENT_COOLDOWN_S * 1000;
    }
    if (inTent && t.hp < CFG.HP && (t.tentUsing || now >= t.tentReadyAt)) {
      t.tentUsing = true;
      t.hp = Math.min(CFG.HP, t.hp + CFG.TENT_RATE * dt);
    }
  }

  // Resupply crates: a soldier on his own side's crate gets a full magazine, grenades and a gas strike back.
  for (let i = 0; i < w.crates.length; i++) {
    const c = w.crates[i];
    if (now < c.readyAt) continue;
    for (const p of w.players.values()) {
      if (p.team !== c.team || p.hp <= 0 || Math.hypot(p.x - c.x, p.y - c.y) > CFG.CRATE_R) continue;
      if (p.ammo >= cls(p).mag && p.grenades >= CFG.GRENADES && p.arty >= CFG.ARTY) continue; // nothing to take
      p.ammo = cls(p).mag;
      p.reloadLeft = 0;
      p.grenades = CFG.GRENADES;
      p.arty = CFG.ARTY;
      c.readyAt = now + CFG.CRATE_COOLDOWN_S * 1000;
      w.events.push({ t: 'crate', who: p.id });
      break;
    }
  }

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
  for (const q of w.players.values()) p.push([q.id, Math.round(q.x), Math.round(q.y), Math.round(q.aim * 100) / 100, Math.ceil(q.hp), now < q.protectUntil ? 1 : 0, q.grenades, q.ammo, q.reloadLeft > 0 ? Math.round((q.reloadLeft / cls(q).reloadS) * 100) / 100 : 0, q.arty, CLASS_IDS.indexOf(q.cls), q.healing ? 1 : 0, q.tentUsing ? -1 : Math.max(0, Math.ceil((q.tentReadyAt - now) / 1000)), q.nextCls ? CLASS_IDS.indexOf(q.nextCls) : -1, Math.round(q.medkit)]);
  const b = w.bullets.map((x) => [Math.round(x.x), Math.round(x.y)]);
  return {
    t: 's',
    p,
    b,
    f: w.shots,
    g: w.nades.map((n) => [Math.round(n.x), Math.round(n.y), n.flight > 0 ? Math.round((n.flight / CFG.NADE_FLIGHT_S) * 100) / 100 : 0]),
    a: w.arty.map((a) => [Math.round(a.x), Math.round(a.y), a.delay > 0 ? 0 : 1, a.delay > 0 ? Math.round((a.delay / CFG.ARTY_DELAY_S) * 100) / 100 : Math.round((a.gas / CFG.ARTY_GAS_S) * 100) / 100]),
    k: w.crates.map((c) => (now >= c.readyAt ? 1 : 0)),
    c: Math.round(w.progress * 1000) / 1000,
    r: { n: w.round.n, s: w.round.state, l: Math.ceil(Math.max(0, w.round.state === 'live' ? w.round.left : w.round.endLeft)), w: w.round.winner },
  };
}

export const roster = (w) => [...w.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, bot: !!p.isBot }));

export function scoreboard(w) {
  return [...w.players.values()]
    .filter((p) => !p.isBot)
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    .slice(0, 10)
    .map((p) => ({ id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths }));
}

export const drainEvents = (w) => w.events.splice(0, w.events.length);
