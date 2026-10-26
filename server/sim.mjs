// The Trenches simulation. Pure logic: no sockets, no timers, so it can be tested with plain Node.
// Everything that matters (movement, shots, damage, capture, rounds) is decided here, on the server.

export const CFG = {
  SPEED: 150, // px per second
  SPRINT_MULT: 1.6, // sprint speed
  STAMINA: 100,
  STAMINA_DRAIN: 40, // per second while sprinting: about 2.5 s
  STAMINA_REGEN: 20, // per second, after a short rest
  STAMINA_DELAY_S: 0.8,
  STAMINA_RESUME: 25, // after running dry you must recover this much before sprinting again
  RADIUS: 11, // player body
  TOWER_REACH: 70, // a sniper this close to a free tower of his side can climb it (E)
  TOWER_IDLE_S: 20, // a tower nobody is standing on is taken down after this many seconds
  TOWER_DISMANTLE_S: 5, // hold B this long, standing beside your own tower, to take it down
  TOWER_GAP: 150, // towers are built at least this far apart
  HP: 100,
  BULLET_R: 3,
  // Classes. `life` is how long a bullet flies, so speed x life is the weapon's reach.
  CLASSES: {
    // Assault (id 'rifleman'): a modern AR. Three hits kill; held on full auto it climbs and the shots spread (tap or burst to stay accurate).
    rifleman: { label: 'Assault', weapon: 'rifle', mag: 15, reloadS: 2.2, fireMs: 140, damage: 34, speed: 760, life: 1.1, recoil: { per: 0.18, max: 0.12 }, special: { id: 'smoke', charges: 1 } },
    smg: { label: 'SMG', weapon: 'smg', mag: 20, reloadS: 2, fireMs: 110, damage: 21, speed: 620, life: 0.6, special: { id: 'flash', charges: 1 } }, // five hits kill, short reach
    sniper: { label: 'Sniper', weapon: 'sniper', mag: 5, reloadS: 3.5, fireMs: 1800, damage: 100, speed: 2600, life: 0.65, grenades: 1, arty: 0, side: { weapon: 'pistol', mag: 8, reloadS: 1.5, fireMs: 350, damage: 20, speed: 600, life: 0.5 } }, // one hit kills; hold scope to see far, but slow, only 5 rounds, a weak 8-round pistol to swap to, no artillery strike, and each shot gives him away
    shotgunner: { label: 'Shotgunner', weapon: 'shotgun', mag: 5, reloadS: 2.5, fireMs: 450, damage: 25, falloff: [100, 240, 0.25], speed: 700, life: 0.34, pellets: 8, spread: 0.2, hp: 140, staminaX: 1.5, side: { weapon: 'pistol', mag: 12, reloadS: 1.5, fireMs: 280, damage: 20, speed: 600, life: 0.55 }, special: { id: 'shield', durS: 5, rechargeS: 20 } }, // 140 HP, 8-pellet shotgun (deadly up close, 5 shells, quicker than the rifle, slower than the SMG) and a pistol to swap to
    medic: { label: 'Medic', weapon: 'smg', mag: 16, reloadS: 2, fireMs: 130, damage: 20, speed: 620, life: 0.5, special: { id: 'drop', charges: 1 } },
    // Squad leader: the Assault's AR plus a pistol, and a UAV that shows the whole team where the enemy is. Not refilled by resupply.
    squad: { label: 'Squad Leader', weapon: 'rifle', mag: 15, reloadS: 2.2, fireMs: 140, damage: 34, speed: 760, life: 1.1, recoil: { per: 0.18, max: 0.12 }, arty: 1, grenades: 2, side: { weapon: 'pistol', mag: 10, reloadS: 2, fireMs: 350, damage: 25, speed: 600, life: 0.5 }, special: { id: 'uav', durS: 10, rechargeS: 60 } }, // heals teammates next to him
  },
  RECOIL_DECAY: 0.9, // how fast an AR settles per second when you let off the trigger
  SMOKE_R: 140, // a smoke grenade's cloud: enemies cannot see in, out of, or through it; its own side can
  SMOKE_S: 12,
  SMOKE_POINT_BLANK: 60, // ... except a target this close
  FLASH_R: 170, // a flashbang blinds enemies this close (with a clear line to it) ...
  FLASH_S: 2, // ... for this long: white screen and almost no sight
  FLASH_DR: 0.5, // diminishing returns: each flash on someone already flashed lately lasts this fraction of the one before ...
  FLASH_DR_WINDOW_S: 10, // ... until he has gone this long without being flashed
  FLASH_MIN_S: 0.4,
  BLIND_VISION: 70,
  UAV_R: 420, // the UAV lifts the fog in a circle this big, called in at the cursor like an artillery strike
  DROP_DELAY_S: 1.5, // medic flare: the air drop lands this long after the flare ...
  DROP_S: 10, // ... and heals friendlies near it for this long
  DROP_R: 75,
  HEAL_POINT: 100, // every this many HP a medic heals (medkit or air drop) counts as one kill towards his streak rewards
  DROP_RATE: 22, // HP per second
  SHIELD_ARC: 1.15, // riot shield: stops bullets arriving within this many radians of where he faces
  SHIELD_HP: 200, // damage the shield can soak before it breaks (then the recharge starts)
  SHIELD_SPEED: 0.85, // ... and slows him
  HEAL_RADIUS: 60, // a medic heals teammates this close ...
  HEAL_RATE: 18, // ... at this many HP per second
  HEAL_POOL: 100, // a medic's medkit: total HP he can give out before it runs dry ...
  HEAL_REGEN: 4, // ... and how fast it refills per second, so standing on someone cannot keep him alive forever
  TENT_R: 80, // the medic tent heals anyone on its side this close
  TENT_RATE: 24,
  TENT_COOLDOWN_S: 30, // after using the tent, each soldier waits this long before it heals him again
  RESPAWN_S: 4,
  PROTECT_S: 1.5, // can't be hurt just after spawning
  EXIT_PROTECT_S: 1, // ... and for this long after stepping out of your own base, so the doorway cannot be camped
  EXIT_PROTECT_COOLDOWN_S: 6, // stepping back in and out does not chain it
  VISION: 420, // fog of war: a side sees enemies, shots and blasts only within this many px of one of its living soldiers
  SCOPE_VISION: 1000, // a scoped sniper sees this far, but only along a narrow beam in the direction he is aiming ...
  SCOPE_HALF: 0.3, // ... half the beam's width in radians (about 17 degrees each side). His normal sight circle stays.
  SCOPE_SPEED: 0.35, // ... but walks at this fraction of normal speed and cannot sprint while scoped
  SNIPER_REVEAL_S: 3, // after a sniper fires, the enemy sees him (through the fog) for this long
  MAX_SNIPERS: 1, // per side
  PICKUP_RESPAWN_S: 30, // each side has one bazooka crate near its base; when it is taken, a new one appears elsewhere on that side this long after
  PICKUP_NEAR: [10, 28], // ... between this many tiles from its own edge (just outside the safe zone) and this
  PICKUP_R: 26, // walk this close to take it
  ROCKETS: 2, // a bazooka holds two rockets: no reload, no resupply
  ROCKET_SPEED: 430,
  ROCKET_LIFE: 1.5, // seconds in flight (about 640 px)
  ROCKET_COOLDOWN_MS: 1000,
  ROCKET_RADIUS: 125, // blast reach
  ROCKET_LETHAL: 62, // inside this, it kills
  ROCKET_OUTER_MAX: 80,
  ROCKET_OUTER_MIN: 25,
  BASE_PAD: 32, // each side's safe zone: its spawn trench plus this much ground in front of it
  BASE_NO_FIRE: true, // nobody inside his own safe zone can shoot, throw or call a strike out of it (no sniping from invulnerability)
  TRAIN_EVERY_S: 70, // maps with a `train` (Industry): one passes this often, alternating track and direction ...
  TRAIN_FIRST_S: 40, // ... the first one this long into a round
  TRAIN_WARN_S: 5, // the track flashes and a horn sounds this long before it arrives
  TRAIN_SPEED: 900, // px per second (about 4 s to cross)
  TRAIN_DMG: 80, // taken once per pass by anyone on the rails
  HARDPOINT: true, // Hardpoint mode: the scoring zone moves round the map's hardpoints; false = the zone stays on the plaza (server env MODE=capture)
  HARDPOINT_S: 45, // each zone stays this long ...
  HARDPOINT_WARN_S: 5, // ... and the next one is shown for the last this many seconds
  POINTS_TO_WIN: 100, // first side to this many points wins the round
  POINT_RATE: 1, // points per second for a side that holds the point alone with one soldier ...
  POINT_EXTRA: 0.5, // ... plus this much for each extra soldier standing in it (up to CAP_MAX soldiers)
  CAP_MAX: 6,
  ROUND_S: 360,
  END_S: 10,
  AUTO_BALANCE_S: 15, // sides that stay two or more people apart this long are evened out by moving someone over (0 = off)
  STREAK_REWARDS: { 3: 'uav', 5: 'drone', 7: 'heli' }, // kills in a row that earn a reward, used with Z (lost on death)
  BIGUAV_S: 8, // the streak UAV: the whole map's fog lifts and every enemy shows, for this long
  DRONE_S: 15, // attack drone: flown with WASD over everything, click (or Z) to blow it up; invisible to the enemy
  DRONE_SPEED: 240,
  DRONE_RADIUS: 170,
  DRONE_LETHAL: 90,
  DRONE_VISION: 320, // like a UAV: the owner's side sees this far around the drone
  HELI_S: 15, // attack helicopter flight time
  HELI_SPEED: 210,
  HELI_VISION: 340,
  HELI_FIRE_MS: 55, // minigun
  HELI_DAMAGE: 14,
  HELI_SPREAD: 0.09,
  HELI_ROCKET_MS: 900,
  STREAK_CALLOUTS: [3, 5, 7], // kills in a row (without dying) that are announced to everyone
  ROUNDS_PER_MAP: 3, // a map is played as a best-of series, then the server moves to the next map and the round wins start again
  MAP_EARLY_END: true, // a side that has won more than half of the series (2 of 3) ends the map without playing the rest
  END_MAP_S: 14, // the pause after the last round on a map is a little longer: the result, then the next map's name
  BUSH_REVEAL: 110, // a soldier hiding in a bush is hidden from the enemy until one of them gets this close ...
  BUSH_FIRE_REVEAL_S: 1.5, // ... or until he fires from it (this long)
  MAX_PER_TEAM: 30,
  ARTY: 1, // artillery strikes per life
  ARTY_DELAY_S: 3, // call-in to impact
  ARTY_WARN_S: 0.75, // the enemy sees (and hears the shell of) a strike only this long before it lands; the calling side knows at once
  ARTY_RADIUS: 130, // the shell bursts like a big grenade: kills inside ARTY_LETHAL, hurts out to this reach
  ARTY_LETHAL: 55,
  ARTY_OUTER_MAX: 70,
  ARTY_OUTER_MIN: 20,
  ARTY_COOLDOWN_MS: 1000,
  CRATE_R: 24, // walk this close to your own crate to resupply
  CRATE_COOLDOWN_S: 30,
  FADE_START: 420, // every gun but the sniper rifle: past this distance (your sight range) its rounds start losing power ...
  FADE_STEP: 64, // ... and lose FADE_LOSS of their damage every this many px (2 tiles) ...
  FADE_LOSS: 0.25, // ... until they do nothing and vanish, so you cannot spray down the street blind
  FRIENDLY_FIRE: false, // bullets and rockets in flight hurt your own side too (not yourself) when true; off for normal play.
  FRIENDLY_FLASH: true, // TEST SETTING: flashbangs blind your own side and you. Keep false for normal play.
  FRIENDLY_BLASTS: true, // grenades, rockets and artillery hurt your own side and yourself (bullets still do not)
  GRENADES: 2, // per life
  NADE_FLIGHT_S: 0.7, // in the air (flies over cover)
  NADE_FUSE_S: 1.6, // from the throw to the bang
  NADE_COOLDOWN_MS: 800,
  NADE_MIN: 70, // throw range limits in px
  NADE_MAX: 380,
  NADE_RADIUS: 100, // blast reach
  NADE_LETHAL: 45, // inside this, it kills
  NADE_OUTER_MAX: 70, // damage just outside the lethal ring ...
  NADE_OUTER_MIN: 20, // ... fading to this at the edge
};

export const CLASS_IDS = ['rifleman', 'smg', 'medic', 'sniper', 'shotgunner', 'squad']; // the client uses the index, so new classes go on the end
const cls = (p) => CFG.CLASSES[p.cls];
export const maxHp = (p) => cls(p).hp ?? CFG.HP;
/** The weapon a soldier is holding: his class weapon, or his sidearm if he has one and switched to it. */
const spec = (p) => (p.weapon === 'side' && cls(p).side ? cls(p).side : cls(p));
const ammoOf = (p) => (spec(p) === cls(p) ? p.ammo : p.sideAmmo);
const setAmmo = (p, v) => {
  if (spec(p) === cls(p)) p.ammo = v;
  else p.sideAmmo = v;
};
const maxGren = (p) => cls(p).grenades ?? CFG.GRENADES;
const maxArty = (p) => cls(p).arty ?? CFG.ARTY;
const maxSpec = (p) => cls(p).special?.charges ?? 0; // thrown specials (smoke, flash, flare) come in charges; shield and UAV run on a recharge timer
/** Snipers on a side (counting those waiting to become one), so a team cannot be all snipers. */
const snipersOn = (w, team, exceptId = 0) =>
  [...w.players.values()].filter((q) => !q.isBot && q.team === team && q.id !== exceptId && (q.cls === 'sniper' || q.nextCls === 'sniper')).length;
const sniperAllowed = (w, p) => snipersOn(w, p.team, p.id) < CFG.MAX_SNIPERS;
const TEAMS = ['green', 'red'];
const otherTeam = (t) => (t === 'green' ? 'red' : 'green');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Point the world at a map (the ground, the clinic tents, the crates). Used when the world is made and when the series moves to the next map. */
export function applyMap(w, map, id = 'map') {
  w.zone = { i: 0, left: CFG.HARDPOINT_S };
  for (const q of w.players.values()) { q.mapKills = 0; q.healed = 0; q.healAcc = 0; } // the map summary counts one map
  w.map = map;
  w.mapId = id;
  w.rows = map.rows;
  w.W = map.rows[0].length;
  w.H = map.rows.length;
  w.tile = map.tile;
  w.tents = map.tents || [];
  w.crates = (map.crates || []).map((c) => ({ x: c.x, y: c.y, team: c.team, readyAt: 0 }));
}

/** `opts.maps` is { id: mapData } and `opts.order` the ids in the order they are played; with neither, the one map is replayed. */
export function createWorld(map, rng = Math.random, opts = {}) {
  const id = opts.id ?? 'map';
  return {
    map,
    mapId: id,
    maps: opts.maps ?? { [id]: map },
    mapOrder: opts.order ?? [id],
    mapRound: 1, // which round of the series on this map
    rows: map.rows,
    W: map.rows[0].length,
    H: map.rows.length,
    tile: map.tile,
    rng,
    players: new Map(),
    bullets: [],
    nades: [],
    rockets: [], // bazooka rockets in flight
    pickups: [], // bazooka crates waiting on the field
    pickupDue: null, // times when a missing crate will be replaced (set on the first tick of a round)
    nextPickupId: 1,
    tents: map.tents || [],
    crates: (map.crates || []).map((c) => ({ x: c.x, y: c.y, team: c.team, readyAt: 0 })),
    arty: [], // incoming artillery strikes
    clouds: [], // smoke: { x, y, r, left, team }
    drops: [], // medic air drops: { x, y, team, delay, left }
    uav: { green: 0, red: 0 }, // until when each side has a UAV up (drives the warning)
    uavAreas: [], // UAV circles: { team, x, y, until }
    towers: [], // sniper towers: { owner, team, x, y, by (the sniper standing on it, or null), awayS }
    teamKills: { green: 0, red: 0 }, // kills this round
    wins: { green: 0, red: 0 }, // rounds won since the server started
    points: { green: 0, red: 0 }, // round points from holding the plaza
    train: { c: CFG.TRAIN_FIRST_S, n: 0, run: null }, // the next train countdown, passes so far, and the one running now
    zone: { i: 0, left: CFG.HARDPOINT_S }, // which hardpoint is live, and how long it has left
    progress: 0, // the lead as a fraction of POINTS_TO_WIN, -1 (red) .. +1 (green): drives the bar
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
/** Is this spot in a bush ('g')? A soldier standing in one is hidden from the enemy until they get close (see snapshot). */
export const inBush = (w, px, py) => w.rows[Math.floor(py / w.tile)]?.[Math.floor(px / w.tile)] === 'g';
export const blockedAt = (w, x, y, r = CFG.RADIUS) =>
  solidAt(w, x - r, y - r) || solidAt(w, x + r, y - r) || solidAt(w, x - r, y + r) || solidAt(w, x + r, y + r);

/** The scoring zones of the map in rotation order: its hardpoints, or just the plaza when the mode is off. */
const zoneList = (w) => (CFG.HARDPOINT && w.map.hardpoints?.length ? w.map.hardpoints : [w.map.capture]);
const zoneCount = (w) => zoneList(w).length;
/** Which track and way the n-th train takes: north then south, east then west, and so on. */
const trainRoute = (n) => ({ track: n % 2, dir: (n >> 1) % 2 ? -1 : 1 });
/** The span a running train covers: [back, front] along x, and its track. */
function trainBody(w) {
  const r = w.train?.run;
  if (!r) return null;
  const tr = w.map.train.tracks[r.track];
  const a = r.head, b = r.head - r.dir * w.map.train.len;
  return { tr, lo: Math.max(tr.x0, Math.min(a, b)), hi: Math.min(tr.x1, Math.max(a, b)) };
}
/** Is a point on a running train's cars? */
function trainAt(w, x, y, pad = 0) {
  const b = trainBody(w);
  return !!b && b.lo < b.hi && x >= b.lo - pad && x <= b.hi + pad && y >= b.tr.y - pad && y <= b.tr.y + b.tr.h + pad;
}
function trainStep(w, dt, now) {
  const t = w.train;
  if (t.run) {
    const r = t.run;
    r.head += r.dir * CFG.TRAIN_SPEED * dt;
    for (const p of w.players.values()) {
      if (p.hp <= 0 || r.hit.has(p.id) || now < p.protectUntil || isSafe(w, p)) continue;
      if (trainAt(w, p.x, p.y, CFG.RADIUS)) {
        r.hit.add(p.id);
        hurt(w, p, CFG.TRAIN_DMG, 0, null, now, 'train');
      }
    }
    const tr = w.map.train.tracks[r.track];
    if (r.dir > 0 ? r.head - w.map.train.len > tr.x1 : r.head + w.map.train.len < tr.x0) t.run = null;
  }
  t.c -= dt;
  if (t.c <= 0) {
    const { track, dir } = trainRoute(t.n);
    const tr = w.map.train.tracks[track];
    t.run = { track, dir, head: dir > 0 ? tr.x0 : tr.x1, hit: new Set() };
    t.n++;
    t.c += CFG.TRAIN_EVERY_S;
    w.events.push({ t: 'train', track, dir });
  }
}
/** [state (0 none, 1 warning, 2 running), track, way, head x, whole seconds to arrival] for the snapshot. */
function trainSnap(w) {
  const t = w.train;
  if (t.run) return [2, t.run.track, t.run.dir, Math.round(t.run.head), 0];
  if (t.c <= CFG.TRAIN_WARN_S) {
    const { track, dir } = trainRoute(t.n);
    return [1, track, dir, 0, Math.ceil(t.c)];
  }
  return [0, 0, 0, 0, 0];
}

/** The live zone (or the one `step` ahead in the rotation). */
export const zoneAt = (w, step = 0) => {
  const l = zoneList(w);
  const z = l[((w.zone?.i ?? 0) + step) % l.length];
  return { x: z.x, y: z.y, r: z.r ?? w.map.capture.r };
};

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

/** A side's safe zone (its spawn trench and a strip in front): its own soldiers cannot be hurt there and the enemy cannot enter. */
export function inBase(w, team, x) {
  const z = w.map.spawns[team];
  return team === 'green' ? x <= z.x1 + CFG.BASE_PAD : x >= z.x0 - CFG.BASE_PAD;
}
export const isSafe = (w, p) => inBase(w, p.team, p.x);
const enemyOf = (team) => (team === 'green' ? 'red' : 'green');
export const inEnemyBase = (w, team, x) => inBase(w, enemyOf(team), x);

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
  p.stamina = CFG.STAMINA;
  p.winded = false;
  p.sprintRest = 0;
  if (p.nextCls) {
    p.cls = p.nextCls; // a class change waits for the next life
    p.nextCls = null;
    if (p.cls === 'sniper' && !sniperAllowed(w, p)) p.cls = 'rifleman';
  }
  const s = p.dummy ? p.post : spawnPoint(w, p.team);
  p.x = s.x;
  p.y = s.y;
  p.hp = maxHp(p);
  p.protectUntil = now + CFG.PROTECT_S * 1000;
  p.respawnAt = 0;
  p.grenades = maxGren(p);
  p.arty = maxArty(p);
  p.spec = maxSpec(p);
  p.shieldUntil = 0;
  p.heat = 0;
  p.blindUntil = 0;
  p.scoped = false;
  p.rockets = 0;
  p.weapon = 'main';
  p.ammo = cls(p).mag;
  p.sideAmmo = cls(p).side?.mag ?? 0;
  p.reloadLeft = 0;
  p.tentReadyAt = 0;
  p.tentUsing = false;
  // Face the enemy.
  p.aim = p.team === 'green' ? 0 : Math.PI;
}

/** Adds a player. `want` is 'green' | 'red' | 'random'. Returns the player, or null when both teams are full. */
export function addPlayer(w, { name, want = 'random', cls: wantCls = 'rifleman', fill = false }, now = Date.now()) {
  const g = teamCount(w, 'green');
  const r = teamCount(w, 'red');
  let team = want === 'green' || want === 'red' ? want : g === r ? TEAMS[Math.floor(w.rng() * 2)] : g < r ? 'green' : 'red';
  if (!fill) {
    // Keep the teams even: you can only join the bigger side if it is not already ahead. (A fill-in bot goes where it is told.)
    const mine = team === 'green' ? g : r;
    const theirs = team === 'green' ? r : g;
    if (mine > theirs) team = otherTeam(team);
    if (teamCount(w, team) >= CFG.MAX_PER_TEAM) team = otherTeam(team);
    if (teamCount(w, team) >= CFG.MAX_PER_TEAM) return null;
  }
  const p = {
    id: w.nextId++,
    lastActive: now,
    isBot: fill,
    fill,
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
    grenades: 0,
    arty: 0,
    spec: 0,
    specSeq: null,
    wantSpecial: false,
    wantStreak: false,
    streakSeq: null,
    rewards: [],
    control: null,
    specReadyAt: 0,
    shieldUntil: 0,
    shieldHp: 0,
    heat: 0,
    blindUntil: 0,
    cls: CLASS_IDS.includes(wantCls) ? wantCls : 'rifleman',
    scoped: false,
    scope: false,
    revealUntil: 0,
    rockets: 0,
    sideAmmo: 0,
    weapon: 'main', // 'main', 'side' (the sidearm, for classes that have one) or 'rocket' (the bazooka, once picked up)
    swapSeq: null,
    wantSwap: false,
    lastRocket: 0,
    fireHold: false,
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
    healed: 0, // HP healed this map (shown on the scoreboard and in the map summary)
    mapKills: 0,
    healAcc: 0,
    tentReadyAt: 0,
    tentUsing: false,
    nextCls: null,
    lastClassChange: 0,
  };
  if (p.cls === 'sniper' && !sniperAllowed(w, p)) p.cls = 'rifleman'; // that side already has its snipers
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
  p.dummy = true; // the stationary test bot (not a fill-in soldier)
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

export const removePlayer = (w, id) => {
  for (const t of w.towers) if (t.by === id) t.by = null;
  dropTower(w, id);
  return w.players.delete(id);
};

export function setInput(w, id, { dx, dy, aim, fire, nade, range, reload, arty, sprint, scope, swap, nest, dismantle, special, streak }) {
  const p = w.players.get(id);
  if (!p) return;
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const oldAim = p.aim;
  const wasWanting = p.wantNade || p.wantReload || p.wantArty || p.wantSwap || p.wantNest || p.wantSpecial || p.wantStreak;
  p.dx = clamp(n(dx), -1, 1);
  p.dy = clamp(n(dy), -1, 1);
  if (Number.isFinite(Number(aim))) p.aim = Number(aim) % (Math.PI * 2);
  p.fire = !!fire;
  p.sprint = !!sprint;
  p.scope = !!scope;
  p.dismantle = !!dismantle;
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
  if (swap !== undefined && swap !== p.swapSeq) {
    if (p.swapSeq !== null) p.wantSwap = true;
    p.swapSeq = swap;
  }
  if (nest !== undefined && nest !== p.nestSeq) {
    if (p.nestSeq !== null && p.nestSeq !== undefined) p.wantNest = true;
    p.nestSeq = nest;
  }
  if (streak !== undefined && streak !== p.streakSeq) {
    if (p.streakSeq !== undefined && p.streakSeq !== null) p.wantStreak = true;
    p.streakSeq = streak;
  }
  if (special !== undefined && special !== p.specSeq) {
    if (p.specSeq !== null) p.wantSpecial = true;
    p.specSeq = special;
  }
  // Is a person really there? Moving, firing, scoping, a key press or any change of aim (the mouse) counts. (A bot decides for itself.)
  const aimMoved = Math.abs(Math.atan2(Math.sin(p.aim - oldAim), Math.cos(p.aim - oldAim))) > 0.01;
  const pressed = !wasWanting && (p.wantNade || p.wantReload || p.wantArty || p.wantSwap || p.wantNest || p.wantSpecial || p.wantStreak);
  if (p.dx || p.dy || p.fire || p.scope || p.sprint || p.dismantle || aimMoved || pressed) p.lastActive = Date.now();
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
  if (wantCls === 'sniper' && !sniperAllowed(w, p)) return; // the side's sniper slots are taken
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
    p.grenades = Math.min(p.grenades, maxGren(p));
    p.arty = Math.min(p.arty, maxArty(p));
    p.spec = maxSpec(p);
    p.shieldUntil = 0;
    p.scoped = false;
    p.weapon = p.weapon === 'rocket' ? 'rocket' : 'main';
    p.ammo = cls(p).mag;
    p.sideAmmo = cls(p).side?.mag ?? 0;
    p.hp = maxHp(p); // in your own trench you are patched up to the new class's full health (a shotgunner has more)
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

/**
 * Auto-balance: if one side has stayed two or more people ahead (say 1 v 5 after a team left) for AUTO_BALANCE_S, move someone from the bigger side to
 * the smaller one, one every few seconds until they are within one of each other. Prefers a dead soldier, then one inside his own base, then the newest.
 */
function autoBalance(w, now) {
  if (!(CFG.AUTO_BALANCE_S > 0)) return;
  const g = teamCount(w, 'green');
  const r = teamCount(w, 'red');
  if (Math.abs(g - r) < 2) {
    w.imbalanceAt = 0;
    return;
  }
  if (!w.imbalanceAt) {
    w.imbalanceAt = now;
    return;
  }
  if (now - w.imbalanceAt < CFG.AUTO_BALANCE_S * 1000) return;
  const big = g > r ? 'green' : 'red';
  const mine = [...w.players.values()].filter((p) => p.team === big && !p.isBot);
  const pick =
    mine.filter((p) => p.hp <= 0).sort((a, b) => b.id - a.id)[0] ||
    mine.filter((p) => isSafe(w, p)).sort((a, b) => b.id - a.id)[0] ||
    mine.sort((a, b) => b.id - a.id)[0];
  if (!pick) return;
  if (pick.elevated) leaveTower(w, pick);
  dropTower(w, pick.id);
  pick.team = otherTeam(big);
  pick.tentUsing = false;
  w.events.push({ t: 'team', id: pick.id, team: pick.team, auto: true });
  if (pick.hp > 0) respawn(w, pick, now);
  w.imbalanceAt = now - (CFG.AUTO_BALANCE_S - 3) * 1000; // if it is still lopsided, the next move follows in 3 s
}

/** A tower of his own side that this sniper is close enough to climb (free, or already his). */
function towerNear(w, p) {
  return w.towers.find((t) => t.team === p.team && Math.hypot(t.x - p.x, t.y - p.y) <= CFG.TOWER_REACH && (t.by === null || t.by === p.id));
}
function leaveTower(w, p) {
  for (const t of w.towers) if (t.by === p.id) t.by = null;
  p.elevated = false;
}
/** The builder is gone (died, left, changed class). A tower with another sniper on it passes to him; an empty one is taken down. */
function dropTower(w, owner) {
  for (let i = w.towers.length - 1; i >= 0; i--) {
    const t = w.towers[i];
    if (t.owner !== owner) continue;
    const rider = t.by !== null && t.by !== owner ? w.players.get(t.by) : null;
    if (rider && rider.hp > 0 && rider.cls === 'sniper') {
      t.owner = rider.id;
      t.awayS = 0;
      continue;
    }
    if (t.by !== null) {
      const r = w.players.get(t.by);
      if (r) r.elevated = false;
    }
    w.towers.splice(i, 1);
  }
}
function climb(w, p, t) {
  t.by = p.id;
  p.elevated = true;
  p.x = t.x;
  p.y = t.y;
}

/** E for a sniper: climb down; climb a free tower beside him; or build a new tower where he stands (and climb it). */
function useTower(w, p, now) {
  if (p.cls !== 'sniper' || p.hp <= 0) return;
  if (p.elevated) return leaveTower(w, p);
  const near = towerNear(w, p);
  if (near) return climb(w, p, near);
  if ((CFG.BASE_NO_FIRE && isSafe(w, p)) || inBase(w, 'green', p.x) || inBase(w, 'red', p.x)) return;
  if (w.towers.some((t) => t.owner === p.id)) return; // one at a time: take the first one down (hold B beside it) before building another
  if (w.towers.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < CFG.TOWER_GAP)) return;
  const t = { owner: p.id, team: p.team, x: p.x, y: p.y, by: null, awayS: 0, prog: 0 };
  w.towers.push(t);
  climb(w, p, t);
}

function endRound(w, winner) {
  w.round.state = 'ended';
  w.round.winner = winner;
  w.round.endLeft = CFG.END_S;
  w.bullets = [];
  w.nades = [];
  w.arty = [];
  w.towers = [];
  w.clouds = [];
  w.drops = [];
  for (const q of w.players.values()) q.elevated = false;
  for (const p of w.players.values()) {
    p.dx = p.dy = 0;
    p.fire = false;
  }
  if (winner === 'green' || winner === 'red') w.wins[winner]++;
  if (seriesOver(w)) w.round.endLeft = CFG.END_MAP_S;
  w.events.push({ t: 'round', winner });
}

/** Is this the last round on the map? (the set is played out, or one side has clinched it) */
export function seriesOver(w) {
  const need = Math.floor(CFG.ROUNDS_PER_MAP / 2) + 1;
  return w.mapRound >= CFG.ROUNDS_PER_MAP || (CFG.MAP_EARLY_END && (w.wins.green >= need || w.wins.red >= need));
}
/** The id of the map that comes after this one. */
export const nextMapId = (w) => w.mapOrder[(w.mapOrder.indexOf(w.mapId) + 1) % w.mapOrder.length];

function newRound(w, now) {
  if (seriesOver(w)) {
    // on to the next map: the round wins start again and everyone respawns on the new ground
    const id = nextMapId(w);
    applyMap(w, w.maps[id], id);
    w.wins = { green: 0, red: 0 };
    w.mapRound = 1;
    w.events.push({ t: 'map', id });
  } else w.mapRound++;
  startRound(w, now, w.round.n + 1);
}

/** Clear the field and put everyone back in their base for round number `n`. */
function startRound(w, now, n) {
  w.epoch = (w.epoch ?? 0) + 1; // clients clear what they were remembering (bodies) when this changes
  for (const q of w.players.values()) { q.streak = 0; q.healAcc = 0; q.rewards = []; q.control = null; }
  w.teamKills = { green: 0, red: 0 };
  w.round = { n, state: 'live', left: CFG.ROUND_S, winner: null, endLeft: 0 };
  w.progress = 0;
  w.points = { green: 0, red: 0 };
  w.zone = { i: 0, left: CFG.HARDPOINT_S };
  w.train = { c: CFG.TRAIN_FIRST_S, n: 0, run: null };
  w.towers = [];
  w.clouds = [];
  w.drops = [];
  w.uav = { green: 0, red: 0 };
  w.uavAreas = [];
  for (const q of w.players.values()) { q.elevated = false; q.specReadyAt = 0; q.shieldUntil = 0; }
  w.bullets = [];
  w.nades = [];
  w.rockets = [];
  w.pickups = [];
  w.pickupDue = null;
  w.arty = [];
  for (const c of w.crates) c.readyAt = 0;
  rebalance(w, now, true);
  for (const p of w.players.values()) respawn(w, p, now);
}

/** An admin restart: round wins back to 0:0, round 1 of the series with a fresh timer, optionally on another map. Returns false for an unknown map. */
export function restartSeries(w, now = Date.now(), mapId = null) {
  if (mapId && !w.maps[mapId]) return false;
  if (mapId && mapId !== w.mapId) {
    applyMap(w, w.maps[mapId], mapId);
    w.events.push({ t: 'map', id: mapId });
  }
  w.wins = { green: 0, red: 0 };
  w.mapRound = 1;
  startRound(w, now, 1);
  return true;
}

export function hurt(w, t, amount, ownerId, ownerTeam, now, weapon) {
  t.hp -= amount;
  if (t.hp > 0) return;
  t.hp = 0;
  t.deaths++;
  t.respawnAt = now + CFG.RESPAWN_S * 1000;
  t.dx = t.dy = 0;
  t.fire = false;
  t.wantNade = t.wantReload = t.wantArty = t.wantNest = t.wantSpecial = t.wantStreak = false;
  t.rewards = []; // an unused reward is lost with the life
  t.control = null;
  t.shieldUntil = 0;
  const k = w.players.get(ownerId);
  const own = !!k && k.team === t.team; // killed himself or a teammate: no credit
  t.streak = 0; // dying ends a streak
  if (k && !own) {
    k.kills++;
    w.teamKills[k.team]++;
    k.mapKills++;
    streakPoint(w, k);
  }
  w.events.push({ t: 'kill', killer: k ? k.name : '?', kteam: ownerTeam, victim: t.name, vteam: t.team, weapon, self: k === t, tk: own && k !== t, kid: k ? k.id : 0, vid: t.id });
}

/** One step on a soldier's streak: a kill, or CFG.HEAL_POINT HP of healing. Rewards come at the CFG.STREAK_REWARDS counts. */
function streakPoint(w, k) {
  k.streak = (k.streak ?? 0) + 1;
  const rw = CFG.STREAK_REWARDS[k.streak];
  if (rw && !k.isBot) k.rewards.push(rw);
  if (CFG.STREAK_CALLOUTS.includes(k.streak)) w.events.push({ t: 'streak', id: k.id, name: k.name, team: k.team, n: k.streak });
}

/** A medic healed a teammate: count the HP, and every HEAL_POINT of it moves his streak on like a kill. Test dummies do not count. */
function creditHeal(w, m, t, amt) {
  if (!m || t.dummy || amt <= 0) return;
  m.healed += amt;
  m.healAcc += amt;
  while (m.healAcc >= CFG.HEAL_POINT) {
    m.healAcc -= CFG.HEAL_POINT;
    streakPoint(w, m);
  }
}

const NADE_SPEC = () => ({ r: CFG.NADE_RADIUS, lethal: CFG.NADE_LETHAL, hi: CFG.NADE_OUTER_MAX, lo: CFG.NADE_OUTER_MIN });
const ARTY_SPEC = () => ({ r: CFG.ARTY_RADIUS, lethal: CFG.ARTY_LETHAL, hi: CFG.ARTY_OUTER_MAX, lo: CFG.ARTY_OUTER_MIN });
const ROCKET_SPEC = () => ({ r: CFG.ROCKET_RADIUS, lethal: CFG.ROCKET_LETHAL, hi: CFG.ROCKET_OUTER_MAX, lo: CFG.ROCKET_OUTER_MIN });

/** Out in the fog a round loses power: full strength inside sight range, then FADE_LOSS less every FADE_STEP px, to nothing. Sniper rounds are exempt. */
function fadeFactor(b) {
  if (b.weapon === 'sniper') return 1;
  const d = Math.hypot(b.x - b.sx, b.y - b.sy);
  if (d <= CFG.FADE_START) return 1;
  return 1 - CFG.FADE_LOSS * (Math.floor((d - CFG.FADE_START) / CFG.FADE_STEP) + 1);
}

/** What a bullet does to whatever it hits now: shotgun pellets weaken with distance, and every non-sniper round fades past sight range. */
function bulletDamage(b) {
  let dmg = b.damage;
  if (b.falloff) {
    // pellets lose punch with distance: full damage up close, down to a fraction at the end of their reach
    const [near, far, minF] = b.falloff;
    const d = Math.hypot(b.x - b.sx, b.y - b.sy);
    dmg *= d <= near ? 1 : Math.max(minF, 1 - ((1 - minF) * (d - near)) / (far - near));
  }
  return dmg * Math.max(0, fadeFactor(b));
}

function explode(w, n, now, spec = NADE_SPEC(), weapon = 'grenade') {
  w.events.push({ t: 'boom', x: Math.round(n.x), y: Math.round(n.y), big: weapon === 'rocket' || weapon === 'artillery' || weapon === 'drone' });
  for (const t of w.players.values()) {
    if (((!CFG.FRIENDLY_BLASTS || spec.spare) && t.team === n.team) || t.hp <= 0 || now < t.protectUntil || isSafe(w, t)) continue;
    const d = Math.hypot(t.x - n.x, t.y - n.y);
    if (d > spec.r || !lineClear(w, n.x, n.y, t.x, t.y)) continue;
    const dmg = d <= spec.lethal ? 999 : spec.hi - ((spec.hi - spec.lo) * (d - spec.lethal)) / (spec.r - spec.lethal);
    hurt(w, t, dmg, n.owner, n.team, now, weapon);
  }
}

/** Fire the bazooka: one rocket, no reload. When the last one is gone he is back on his main weapon. */
function fireRocket(w, p, now) {
  if (p.rockets <= 0 || now - p.lastRocket < CFG.ROCKET_COOLDOWN_MS) return;
  p.rockets--;
  p.lastRocket = now;
  const c = Math.cos(p.aim);
  const s = Math.sin(p.aim);
  w.rockets.push({ x: p.x + c * 16, y: p.y + s * 16, vx: c * CFG.ROCKET_SPEED, vy: s * CFG.ROCKET_SPEED, aim: p.aim, life: CFG.ROCKET_LIFE, owner: p.id, team: p.team });
  w.events.push({ t: 'rocket', x: Math.round(p.x), y: Math.round(p.y) });
  if (p.rockets <= 0) {
    p.weapon = 'main';
    p.fireHold = true; // the trigger must be let go before the rifle fires, so the last rocket does not turn into a burst
  }
}

/** Drop a side's bazooka crate on open ground in its own half, near its base. Returns false if it found no spot. */
function spawnPickup(w, team) {
  const [n0, n1] = CFG.PICKUP_NEAR;
  for (let i = 0; i < 60; i++) {
    const fromEdge = (n0 + w.rng() * (n1 - n0)) * w.tile;
    const x = team === 'green' ? fromEdge : w.W * w.tile - fromEdge;
    const y = w.tile * 2 + w.rng() * (w.H * w.tile - w.tile * 4);
    if (blockedAt(w, x, y, CFG.RADIUS + 6)) continue;
    w.pickups.push({ id: w.nextPickupId++, x: Math.round(x), y: Math.round(y), team });
    return true;
  }
  return false;
}

/** One bazooka per side at a time: a side cannot pick up another while one of its soldiers still holds rockets. */
const holdsBazooka = (w, team) => [...w.players.values()].some((q) => q.team === team && q.hp > 0 && q.rockets > 0);

/** Lob an item along the aim: a frag grenade, or a smoke / flash / flare canister. It lands on open ground. */
function lob(w, p, kind) {
  p.lastNade = p.lobNow;
  const c = Math.cos(p.aim);
  const s = Math.sin(p.aim);
  let dist = p.nadeRange;
  // It lands on open ground: if the target is inside a wall or cover, pull it back toward the thrower.
  while (dist > CFG.NADE_MIN / 2 && solidAt(w, p.x + c * dist, p.y + s * dist)) dist -= 8;
  w.nades.push({ sx: p.x, sy: p.y, x: p.x, y: p.y, tx: p.x + c * dist, ty: p.y + s * dist, flight: CFG.NADE_FLIGHT_S, fuse: kind === 'frag' ? CFG.NADE_FUSE_S : CFG.NADE_FLIGHT_S, owner: p.id, team: p.team, kind });
}

function throwNade(w, p, now) {
  if (p.hp <= 0 || (CFG.BASE_NO_FIRE && isSafe(w, p)) || p.grenades <= 0 || now - p.lastNade < CFG.NADE_COOLDOWN_MS) return;
  p.grenades--;
  p.lobNow = now;
  lob(w, p, 'frag');
}

/** The F key: the class's special. Thrown ones (smoke, flash, flare) use a charge; the riot shield and UAV run on a recharge timer. */
function useSpecial(w, p, now) {
  const sp = cls(p).special;
  if (!sp || p.hp <= 0) return;
  if (sp.charges !== undefined) {
    if (p.spec <= 0 || (CFG.BASE_NO_FIRE && isSafe(w, p)) || now - p.lastNade < CFG.NADE_COOLDOWN_MS) return;
    p.spec--;
    p.lobNow = now;
    lob(w, p, sp.id === 'smoke' ? 'smoke' : sp.id === 'flash' ? 'flash' : 'flare');
    return;
  }
  if (now < p.specReadyAt) return;
  p.specReadyAt = now + (sp.durS + sp.rechargeS) * 1000;
  if (sp.id === 'shield') {
    p.shieldUntil = now + sp.durS * 1000;
    p.shieldHp = CFG.SHIELD_HP;
  }
  else if (sp.id === 'uav') {
    // like an artillery call: it goes where the cursor is (same reach as a grenade throw)
    const x = clamp(p.x + Math.cos(p.aim) * p.nadeRange, 0, w.W * w.tile);
    const y = clamp(p.y + Math.sin(p.aim) * p.nadeRange, 0, w.H * w.tile);
    w.uavAreas.push({ team: p.team, x, y, until: now + sp.durS * 1000 });
    w.uav[p.team] = Math.max(w.uav[p.team], now + sp.durS * 1000);
    w.events.push({ t: 'uav', team: p.team });
  }
}

const REWARD_RANK = { uav: 1, drone: 2, heli: 3 };
/** The best reward he holds (3 heli, 2 drone, 1 UAV, 0 none). */
export const rewardCode = (p) => p.rewards.reduce((m, r) => Math.max(m, REWARD_RANK[r]), 0);

/** The Z key: spend the best streak reward, or (while flying one) end it early. */
function useStreak(w, p, now) {
  if (p.hp <= 0) return;
  if (p.control) {
    if (p.control.kind === 'drone') p.control.detonate = true; // Z again: blow it where it is
    return;
  }
  const code = rewardCode(p);
  if (!code) return;
  const kind = Object.keys(REWARD_RANK).find((k) => REWARD_RANK[k] === code);
  p.rewards.splice(p.rewards.indexOf(kind), 1);
  if (kind === 'uav') {
    const until = now + CFG.BIGUAV_S * 1000;
    w.uavAreas.push({ team: p.team, x: (w.W * w.tile) / 2, y: (w.H * w.tile) / 2, r: 1e5, until, big: true });
    w.uav[p.team] = Math.max(w.uav[p.team], until);
    w.events.push({ t: 'uav', team: p.team, big: true });
  } else if (kind === 'drone') {
    p.dx = p.dy = 0;
    p.fire = false;
    p.control = { kind: 'drone', x: p.x, y: p.y, aim: p.aim, left: CFG.DRONE_S };
  } else {
    p.dx = p.dy = 0;
    p.fire = false;
    p.control = { kind: 'heli', x: p.x, y: p.y, aim: p.aim, left: CFG.HELI_S, lastFire: 0, lastRocket: 0 };
    w.events.push({ t: 'heli', team: p.team });
  }
}

/** Fly the drone or helicopter a player is controlling for one tick (he stands still and is open to fire meanwhile). */
function controlStep(w, p, now, dt) {
  const c = p.control;
  p.wantNade = p.wantReload = p.wantArty = p.wantSwap = p.wantNest = p.wantSpecial = false;
  c.left -= dt;
  if (c.kind === 'drone') {
    const len = Math.hypot(p.dx, p.dy);
    if (len > 0) {
      c.x = clamp(c.x + (p.dx / Math.max(1, len)) * CFG.DRONE_SPEED * dt, 0, w.W * w.tile);
      c.y = clamp(c.y + (p.dy / Math.max(1, len)) * CFG.DRONE_SPEED * dt, 0, w.H * w.tile);
    }
    c.aim = p.aim;
    const expired = c.left <= 0;
    if (c.detonate || (p.fire && c.left < CFG.DRONE_S - 0.4)) { // left click (or Z again) blows it up where it hovers
      explode(w, { x: c.x, y: c.y, owner: p.id, team: p.team }, now, { spare: true, r: CFG.DRONE_RADIUS, lethal: CFG.DRONE_LETHAL, hi: CFG.ROCKET_OUTER_MAX, lo: CFG.ROCKET_OUTER_MIN }, 'drone');
      p.control = null;
    } else if (expired) {
      w.events.push({ t: 'pop', x: Math.round(c.x), y: Math.round(c.y), kind: 'break' }); // battery spent: it just drops
      p.control = null;
    }
    return;
  }
  // helicopter: flies over everything, steered with WASD, the mouse aims; fire = minigun, G = rocket
  const len = Math.hypot(p.dx, p.dy);
  if (len > 0) {
    c.x = clamp(c.x + (p.dx / Math.max(1, len)) * CFG.HELI_SPEED * dt, 0, w.W * w.tile);
    c.y = clamp(c.y + (p.dy / Math.max(1, len)) * CFG.HELI_SPEED * dt, 0, w.H * w.tile);
  }
  c.aim = p.aim;
  const ca = Math.cos(c.aim), sa = Math.sin(c.aim);
  if (p.fire && now - c.lastFire >= CFG.HELI_FIRE_MS) {
    c.lastFire = now;
    const a = c.aim + (w.rng() * 2 - 1) * CFG.HELI_SPREAD;
    const sp = 800;
    w.bullets.push({ x: c.x + ca * 18, y: c.y + sa * 18, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, speed: sp, damage: CFG.HELI_DAMAGE, weapon: 'heli', life: 0.8, owner: p.id, team: p.team, pierce: 0, air: true, sx: c.x, sy: c.y });
    w.shots.push([Math.round(c.x), Math.round(c.y), p.id, 1]); // the 1 marks a helicopter minigun
  }
  if (p.wantNadeHeli && now - c.lastRocket >= CFG.HELI_ROCKET_MS) {
    c.lastRocket = now;
    w.rockets.push({ x: c.x + ca * 18, y: c.y + sa * 18, vx: ca * CFG.ROCKET_SPEED, vy: sa * CFG.ROCKET_SPEED, aim: c.aim, life: CFG.ROCKET_LIFE, owner: p.id, team: p.team, heli: true });
    w.events.push({ t: 'rocket', x: Math.round(c.x), y: Math.round(c.y) });
  }
  p.wantNadeHeli = false;
  if (c.left <= 0) p.control = null;
}

/** A smoke / flash / flare canister has landed. */
function land(w, n, now) {
  w.events.push({ t: 'pop', x: Math.round(n.x), y: Math.round(n.y), kind: n.kind });
  if (n.kind === 'smoke') w.clouds.push({ x: n.x, y: n.y, r: CFG.SMOKE_R, left: CFG.SMOKE_S, team: n.team });
  else if (n.kind === 'flare') w.drops.push({ x: n.x, y: n.y, team: n.team, owner: n.owner, delay: CFG.DROP_DELAY_S, left: CFG.DROP_S });
  else if (n.kind === 'flash') {
    for (const t of w.players.values()) {
      if ((t.team === n.team && !CFG.FRIENDLY_FLASH) || t.hp <= 0 || Math.hypot(t.x - n.x, t.y - n.y) > CFG.FLASH_R || !lineClear(w, n.x, n.y, t.x, t.y)) continue;
      if (now - (t.flashAt ?? -1e9) > CFG.FLASH_DR_WINDOW_S * 1000) t.flashStacks = 0;
      const secs = Math.max(CFG.FLASH_MIN_S, CFG.FLASH_S * CFG.FLASH_DR ** (t.flashStacks ?? 0));
      t.flashStacks = (t.flashStacks ?? 0) + 1;
      t.flashAt = now;
      t.blindUntil = now + secs * 1000;
    }
  }
}

function callArty(w, p, now) {
  if (p.hp <= 0 || (CFG.BASE_NO_FIRE && isSafe(w, p)) || p.arty <= 0 || now - p.lastArty < CFG.ARTY_COOLDOWN_MS) return;
  p.arty--;
  p.lastArty = now;
  const c = Math.cos(p.aim);
  const s = Math.sin(p.aim);
  let dist = p.nadeRange; // same reach as a grenade
  while (dist > CFG.NADE_MIN / 2 && solidAt(w, p.x + c * dist, p.y + s * dist)) dist -= 8;
  w.events.push({ t: 'arty', x: Math.round(p.x + c * dist), y: Math.round(p.y + s * dist), fx: Math.round(w.map.tile * (p.team === 'green' ? 3 : w.W - 3)), fy: Math.round(p.y), delay: CFG.ARTY_DELAY_S, team: p.team });
  w.arty.push({ x: p.x + c * dist, y: p.y + s * dist, delay: CFG.ARTY_DELAY_S, owner: p.id, team: p.team });
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
  autoBalance(w, now); // ...and if it stays lopsided, a living one is too

  // Players: respawn, move, shoot.
  for (const p of w.players.values()) {
    if (p.hp <= 0) {
      if (p.elevated) leaveTower(w, p);
      if (p.respawnAt && now >= p.respawnAt) respawn(w, p, now);
      continue;
    }
    if (p.wantStreak) {
      p.wantStreak = false;
      useStreak(w, p, now);
    }
    if (p.control) {
      if (p.control.kind === 'heli' && p.wantNade) p.wantNadeHeli = true; // G fires a rocket from the helicopter
      controlStep(w, p, now, dt);
      if (p.control) continue; // while flying he stands still: no moving, shooting or throwing
    }
    p.heat = Math.max(0, p.heat - CFG.RECOIL_DECAY * dt);
    p.scoped = p.cls === 'sniper' && p.scope && p.weapon === 'main'; // holding the scope: sees farther, moves slowly, no sprint
    const len = Math.hypot(p.dx, p.dy);
    const sprinting = !p.scoped && p.sprint && len > 0 && !p.winded && p.stamina > 0;
    if (sprinting) {
      p.stamina = Math.max(0, p.stamina - (CFG.STAMINA_DRAIN / (cls(p).staminaX ?? 1)) * dt); // a shotgunner's stamina lasts 1.5x as long
      p.sprintRest = CFG.STAMINA_DELAY_S;
      if (p.stamina <= 0) p.winded = true;
    } else {
      p.sprintRest = Math.max(0, p.sprintRest - dt);
      if (p.sprintRest <= 0) p.stamina = Math.min(CFG.STAMINA, p.stamina + CFG.STAMINA_REGEN * dt);
      if (p.winded && p.stamina >= CFG.STAMINA_RESUME) p.winded = false;
    }
    if (len > 0 && !p.elevated) {
      const k = (len > 1 ? 1 / len : 1) * CFG.SPEED * (sprinting ? CFG.SPRINT_MULT : p.scoped ? CFG.SCOPE_SPEED : 1) * (now < p.shieldUntil ? CFG.SHIELD_SPEED : 1) * dt;
      const nx = p.x + p.dx * k;
      if (!blockedAt(w, nx, p.y) && !inEnemyBase(w, p.team, nx)) p.x = nx;
      const ny = p.y + p.dy * k;
      if (!blockedAt(w, p.x, ny)) p.y = ny;
    }
    if (inEnemyBase(w, p.team, p.x)) {
      const h = spawnPoint(w, p.team); // somehow inside the enemy's zone: send him home
      p.x = h.x;
      p.y = h.y;
    }
    const safeNow = isSafe(w, p);
    if (p.wasSafe && !safeNow && now >= (p.exitProtectReadyAt || 0)) {
      p.protectUntil = Math.max(p.protectUntil, now + CFG.EXIT_PROTECT_S * 1000);
      p.exitProtectReadyAt = now + CFG.EXIT_PROTECT_COOLDOWN_S * 1000;
    }
    p.wasSafe = safeNow;
    if (p.reloadLeft > 0) {
      p.reloadLeft -= dt;
      if (p.reloadLeft <= 0) {
        p.reloadLeft = 0;
        setAmmo(p, spec(p).mag);
      }
    }
    if (p.wantReload) {
      p.wantReload = false;
      if (p.reloadLeft <= 0 && ammoOf(p) < spec(p).mag) p.reloadLeft = spec(p).reloadS;
    }
    if (!p.fire) p.fireHold = false;
    if (p.wantSwap) {
      p.wantSwap = false;
      // cycle through what he carries: main weapon, sidearm (if his class has one), bazooka (if he holds rockets)
      const slots = ['main', ...(cls(p).side ? ['side'] : []), ...(p.rockets > 0 ? ['rocket'] : [])];
      if (slots.length > 1) {
        p.weapon = slots[(Math.max(0, slots.indexOf(p.weapon)) + 1) % slots.length];
        p.reloadLeft = 0; // switching cancels a reload in progress
      }
    }
    if (p.weapon === 'rocket' && p.rockets <= 0) p.weapon = 'main';
    if (p.weapon === 'rocket') {
      if (p.fire && !(CFG.BASE_NO_FIRE && isSafe(w, p))) fireRocket(w, p, now);
    } else if (p.fire && !p.fireHold && !(CFG.BASE_NO_FIRE && isSafe(w, p)) && p.reloadLeft <= 0 && ammoOf(p) > 0 && now - p.lastFire >= spec(p).fireMs) {
      const k = spec(p);
      p.lastFire = now;
      setAmmo(p, ammoOf(p) - 1);
      if (ammoOf(p) <= 0) p.reloadLeft = k.reloadS; // empty: reload on its own
      const heat = p.heat; // this shot spreads by the heat built up before it
      if (k.recoil) p.heat = Math.min(1, p.heat + k.recoil.per);
      const c = Math.cos(p.aim);
      const s = Math.sin(p.aim);
      w.shots.push([Math.round(p.x), Math.round(p.y), p.id]);
      if (p.cls === 'sniper' && p.weapon === 'main') p.revealUntil = now + CFG.SNIPER_REVEAL_S * 1000; // the flash gives him away
      else if (inBush(w, p.x, p.y)) p.revealUntil = now + CFG.BUSH_FIRE_REVEAL_S * 1000; // firing out of a bush gives the position away
      // a shotgun fires a spread of pellets; everything else fires one bullet
      for (let i = 0; i < (k.pellets ?? 1); i++) {
        const a = p.aim + (k.pellets ? (w.rng() * 2 - 1) * k.spread : 0) + (k.recoil ? (w.rng() * 2 - 1) * heat * k.recoil.max : 0);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const sp = k.speed * (k.pellets ? 0.9 + w.rng() * 0.2 : 1);
        w.bullets.push({ x: p.x + c * 14, y: p.y + s * 14, vx: ca * sp, vy: sa * sp, speed: sp, damage: k.damage, weapon: k.weapon, life: k.life, owner: p.id, team: p.team, pierce: k.weapon === 'sniper' ? 2 : 0, over: !!p.elevated, sx: p.x + c * 14, sy: p.y + s * 14, falloff: k.falloff });
      }
    }
  }

  for (const t of [...w.towers]) {
    const o = w.players.get(t.owner);
    if (!o || o.hp <= 0 || o.cls !== 'sniper') {
      dropTower(w, t.owner);
      continue;
    }
    // Dismantling: the builder stands still on the ground beside it and holds B.
    const taking = o.dismantle && !o.elevated && t.by === null && Math.hypot(o.dx, o.dy) === 0 && Math.hypot(o.x - t.x, o.y - t.y) <= CFG.TOWER_REACH;
    t.prog = taking ? t.prog + dt / CFG.TOWER_DISMANTLE_S : 0;
    if (t.prog >= 1) {
      w.towers.splice(w.towers.indexOf(t), 1);
      continue;
    }
    t.awayS = t.by === null ? t.awayS + dt : 0; // counts while nobody is on it
    if (t.awayS >= CFG.TOWER_IDLE_S) dropTower(w, t.owner);
  }
  for (const p of w.players.values()) {
    if (p.wantNest) {
      p.wantNest = false;
      useTower(w, p, now);
    }
    if (p.wantNade) {
      p.wantNade = false;
      throwNade(w, p, now);
    }
    if (p.wantArty) {
      p.wantArty = false;
      callArty(w, p, now);
    }
    if (p.wantSpecial) {
      p.wantSpecial = false;
      useSpecial(w, p, now);
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
      if (fadeFactor(b) <= 0) {
        dead = true; // spent: it has lost all its power out in the fog
        break;
      }
      if (!b.air && trainAt(w, b.x, b.y)) {
        dead = true; // the train's cars stop bullets
        break;
      }
      if (!b.air && solidAt(w, b.x, b.y)) {
        // Sniper rounds punch through light cover (barricades, rubble) but not buildings, wrecks or the map edge.
        const tx = Math.floor(b.x / w.tile), ty = Math.floor(b.y / w.tile);
        const ch = w.rows[ty]?.[tx];
        if (b.over && (ch === 'c' || ch === 'Y' || ch === 'K')) {
          // fired from a tower: low cover (barricades, rubble, wrecks) is shot over; buildings and the map edge still stop it
        } else if (b.pierce > 0 && (ch === 'c' || ch === 'Y')) {
          if (b.pierceTile !== tx + ',' + ty) { b.pierce--; b.pierceTile = tx + ',' + ty; }
        } else {
          dead = true;
          break;
        }
      }
      for (const t of w.players.values()) {
        if ((t.team === b.team && !CFG.FRIENDLY_FIRE) || t.id === b.owner || t.hp <= 0 || now < t.protectUntil || isSafe(w, t)) continue;
        if (Math.hypot(t.x - b.x, t.y - b.y) <= CFG.RADIUS + CFG.BULLET_R) {
          dead = true;
          if (now < t.shieldUntil) {
            let da = Math.atan2(b.y - b.vy * 0.05 - t.y, b.x - b.vx * 0.05 - t.x) - t.aim; // where the round came from, against where he faces
            da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.abs(da) <= CFG.SHIELD_ARC) {
              // stopped by the shield, which soaks the damage and breaks when it is used up
              t.shieldHp -= bulletDamage(b);
              if (t.shieldHp <= 0) {
                t.shieldUntil = 0; // broken: the recharge starts now
                t.specReadyAt = now + (cls(t).special?.rechargeS ?? 30) * 1000;
                w.events.push({ t: 'pop', x: Math.round(t.x), y: Math.round(t.y), kind: 'break' });
              }
              break;
            }
          }
          hurt(w, t, bulletDamage(b), b.owner, b.team, now, b.weapon);
          break;
        }
      }
    }
    b.life -= dt;
    if (!dead && b.life > 0) alive.push(b);
  }
  w.bullets = alive;

  // Rockets: slower than bullets, they burst on the first wall, cover or soldier they touch (or at the end of their flight).
  const flying = [];
  for (const r of w.rockets) {
    const steps = Math.max(1, Math.ceil((CFG.ROCKET_SPEED * dt) / 6));
    let boom = false;
    for (let i = 0; i < steps && !boom; i++) {
      r.x += (r.vx * dt) / steps;
      r.y += (r.vy * dt) / steps;
      if (solidAt(w, r.x, r.y) && !(r.heli && r.life > CFG.ROCKET_LIFE - 0.12)) boom = true; // a helicopter's rocket clears the roof it left from
      else for (const t of w.players.values()) {
        if ((t.team === r.team && !CFG.FRIENDLY_FIRE) || t.id === r.owner || t.hp <= 0 || now < t.protectUntil || isSafe(w, t)) continue;
        if (Math.hypot(t.x - r.x, t.y - r.y) <= CFG.RADIUS + 5) {
          boom = true;
          break;
        }
      }
    }
    r.life -= dt;
    if (boom || r.life <= 0) explode(w, r, now, ROCKET_SPEC(), 'rocket');
    else flying.push(r);
  }
  w.rockets = flying;

  // Pickups: each side has one bazooka crate near its base; when it is taken, a new one appears elsewhere on that side 30 s later.
  if (!w.pickupDue) w.pickupDue = [{ team: 'green', t: now + 15000 }, { team: 'red', t: now + 15000 }]; // the first ones come quickly
  w.pickupDue = w.pickupDue.filter((d) => !(now >= d.t && spawnPickup(w, d.team)));
  const busy = { green: holdsBazooka(w, 'green'), red: holdsBazooka(w, 'red') };
  for (const pk of w.pickups) {
    for (const p of w.players.values()) {
      if (p.team !== pk.team || p.hp <= 0 || p.isBot || p.rockets > 0 || busy[p.team]) continue;
      if (Math.hypot(p.x - pk.x, p.y - pk.y) > CFG.PICKUP_R) continue;
      p.rockets = CFG.ROCKETS;
      p.weapon = 'rocket';
      p.scoped = false;
      pk.taken = true;
      busy[p.team] = true;
      w.pickupDue.push({ team: pk.team, t: now + CFG.PICKUP_RESPAWN_S * 1000 });
      w.events.push({ t: 'got', id: p.id });
      break;
    }
  }
  w.pickups = w.pickups.filter((pk) => !pk.taken);

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
    if (n.fuse <= 0) {
      if (n.kind && n.kind !== 'frag') land(w, n, now);
      else explode(w, n, now);
    } else live.push(n);
  }
  w.nades = live;

  // Artillery: the shell is on its way for a few seconds, then bursts with grenade-style damage over a wider area.
  const incoming = [];
  for (const a of w.arty) {
    a.delay -= dt;
    if (!a.warned && a.delay > 0 && a.delay <= CFG.ARTY_WARN_S) {
      a.warned = true;
      w.events.push({ t: 'arty', late: true, x: Math.round(a.x), y: Math.round(a.y), delay: Math.round(a.delay * 100) / 100, team: a.team }); // the enemy's warning
    }
    if (a.delay <= 0) explode(w, a, now, ARTY_SPEC(), 'artillery');
    else incoming.push(a);
  }
  w.arty = incoming;

  // Smoke fades; an air drop lands after its delay, then heals friendlies standing near it until it runs out.
  w.clouds = w.clouds.filter((c) => (c.left -= dt) > 0);
  w.drops = w.drops.filter((d) => {
    if (d.delay > 0) d.delay -= dt;
    else d.left -= dt;
    return d.left > 0;
  });
  for (const d of w.drops) {
    if (d.delay > 0) continue;
    for (const t of w.players.values()) {
      if (t.team !== d.team || t.hp <= 0 || t.hp >= maxHp(t) || Math.hypot(t.x - d.x, t.y - d.y) > CFG.DROP_R) continue;
      const gain = Math.min(CFG.DROP_RATE * dt, maxHp(t) - t.hp);
      t.hp += gain;
      const o = w.players.get(d.owner);
      if (o && o.team === d.team && o !== t && o.hp > 0) creditHeal(w, o, t, gain);
    }
  }

  // Healing: a medic mends teammates standing next to him, and each side's tent mends anyone close to it.
  for (const p of w.players.values()) p.healing = false;
  for (const m of w.players.values()) {
    if (m.cls !== 'medic' || m.hp <= 0) continue;
    m.medkit = Math.min(CFG.HEAL_POOL, m.medkit + CFG.HEAL_REGEN * dt);
    for (const t of w.players.values()) {
      if (t === m || t.team !== m.team || t.hp <= 0 || t.hp >= maxHp(t)) continue;
      if (Math.hypot(t.x - m.x, t.y - m.y) > CFG.HEAL_RADIUS) continue;
      const amt = Math.min(CFG.HEAL_RATE * dt, maxHp(t) - t.hp, m.medkit);
      if (amt <= 0) continue;
      t.hp += amt;
      m.medkit -= amt;
      m.healing = true;
      creditHeal(w, m, t, amt);
    }
  }
  // Test bots get wounded again a few seconds after they are fully healed.
  for (const b of w.players.values()) {
    if (!b.dummy || b.hp <= 0) continue;
    if (b.hp >= maxHp(b)) {
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
    if (t.tentUsing && (!inTent || t.hp >= maxHp(t))) {
      t.tentUsing = false;
      t.tentReadyAt = now + CFG.TENT_COOLDOWN_S * 1000;
    }
    if (inTent && t.hp < maxHp(t) && (t.tentUsing || now >= t.tentReadyAt)) {
      t.tentUsing = true;
      t.hp = Math.min(maxHp(t), t.hp + CFG.TENT_RATE * dt);
    }
  }

  // Resupply crates: a soldier on his own side's crate gets a full magazine, grenades and an artillery strike back.
  for (let i = 0; i < w.crates.length; i++) {
    const c = w.crates[i];
    if (now < c.readyAt) continue;
    for (const p of w.players.values()) {
      if (p.team !== c.team || p.hp <= 0 || Math.hypot(p.x - c.x, p.y - c.y) > CFG.CRATE_R) continue;
      if (p.ammo >= cls(p).mag && p.sideAmmo >= (cls(p).side?.mag ?? 0) && p.grenades >= maxGren(p) && p.arty >= maxArty(p) && p.spec >= maxSpec(p)) continue; // nothing to take
      p.ammo = cls(p).mag;
      p.sideAmmo = cls(p).side?.mag ?? 0;
      p.reloadLeft = 0;
      p.grenades = maxGren(p);
      p.arty = maxArty(p);
      p.spec = maxSpec(p);
      c.readyAt = now + CFG.CRATE_COOLDOWN_S * 1000;
      w.events.push({ t: 'crate', who: p.id });
      break;
    }
  }

  // The train (Industry): counts down, warns, then crosses one track and hurts whatever is on the rails.
  if (w.map.train) trainStep(w, dt, now);

  // The scoring zone: the plaza in capture mode, or the live hardpoint, which moves on every HARDPOINT_S seconds.
  if (zoneCount(w) > 1) {
    w.zone.left -= dt;
    if (w.zone.left <= 0) {
      w.zone.i = (w.zone.i + 1) % zoneCount(w);
      w.zone.left += CFG.HARDPOINT_S;
      w.events.push({ t: 'zone', i: w.zone.i });
    }
  }
  const cap = zoneAt(w);
  const inside = { green: 0, red: 0 };
  for (const p of w.players.values()) {
    if (p.hp > 0 && Math.hypot(p.x - cap.x, p.y - cap.y) <= cap.r) inside[p.team]++;
  }
  // Holding the plaza alone earns points every second: POINT_RATE for one soldier, more for each extra one. A contested point scores nothing.
  const rateFor = (n) => CFG.POINT_RATE + CFG.POINT_EXTRA * (Math.min(n, CFG.CAP_MAX) - 1);
  if (inside.green && !inside.red) w.points.green += rateFor(inside.green) * dt;
  else if (inside.red && !inside.green) w.points.red += rateFor(inside.red) * dt;
  w.progress = clamp((w.points.green - w.points.red) / CFG.POINTS_TO_WIN, -1, 1);
  if (w.points.green >= CFG.POINTS_TO_WIN) return endRound(w, 'green');
  if (w.points.red >= CFG.POINTS_TO_WIN) return endRound(w, 'red');

  // Clock.
  w.round.left -= dt;
  if (w.round.left <= 0) endRound(w, w.points.green - w.points.red > 0.5 ? 'green' : w.points.red - w.points.green > 0.5 ? 'red' : 'draw');
}

/** Who can a side see? Teammates are always visible; anything else only within VISION of a living teammate. */
export function eyesFor(w, team, now = Date.now()) {
  const mates = [...w.players.values()].filter((q) => q.team === team);
  const live = mates.filter((q) => q.hp > 0);
  // Everyone sees a circle around them; a scoped sniper also sees a long, narrow beam along his aim: [x, y, radius, aim, halfWidth, range].
  const flying = live.filter((q) => q.control).map((q) => [q.control.x, q.control.y, q.control.kind === 'heli' ? CFG.HELI_VISION : CFG.DRONE_VISION]);
  return flying.concat((live.length ? live : mates).flatMap((q) => (now < q.blindUntil ? [[q.x, q.y, CFG.BLIND_VISION]] : q.scoped ? [[q.x, q.y, CFG.VISION], [q.x, q.y, 0, q.aim, CFG.SCOPE_HALF, CFG.SCOPE_VISION]] : [[q.x, q.y, CFG.VISION]])));
}
/** Does a smoke cloud sit between (ex,ey) and (x,y)? A target at point-blank range is still seen. */
const smoked = (ex, ey, x, y, clouds) => {
  const dx = x - ex, dy = y - ey;
  const len2 = dx * dx + dy * dy;
  if (len2 <= CFG.SMOKE_POINT_BLANK * CFG.SMOKE_POINT_BLANK) return false;
  return clouds.some((c) => {
    const t = len2 ? clamp(((c.x - ex) * dx + (c.y - ey) * dy) / len2, 0, 1) : 0;
    return Math.hypot(ex + dx * t - c.x, ey + dy * t - c.y) <= c.r;
  });
};
export const canSee = (eyes, x, y, extra = 0, clouds = []) =>
  eyes.some(([ex, ey, er, aim, half, range]) => {
    const d = Math.hypot(ex - x, ey - y);
    let seen = d <= er + extra;
    if (!seen && range !== undefined && d <= range + extra) {
      let da = Math.atan2(y - ey, x - ex) - aim;
      da = Math.atan2(Math.sin(da), Math.cos(da)); // wrap to -PI..PI
      seen = Math.abs(da) <= half;
    }
    return seen && (!clouds.length || !smoked(ex, ey, x, y, clouds));
  });

/** What a side's clients need each tick (fog of war applied when a team is given). Kept small. */
export function snapshot(w, now = Date.now(), team = null) {
  const eyes = team ? eyesFor(w, team, now) : null;
  const walls = team ? w.clouds.filter((c) => c.team !== team) : []; // the other side's smoke blocks our view
  const vis = (x, y) => !eyes || areas.some((a) => Math.hypot(a.x - x, a.y - y) <= (a.r ?? CFG.UAV_R)) || canSee(eyes, x, y, 0, walls);
  w.uavAreas = w.uavAreas.filter((a) => now < a.until);
  const areas = team ? w.uavAreas.filter((a) => a.team === team) : []; // where our UAV has lifted the fog
  // enemies in a bush stay hidden unless one of ours is close, a UAV covers them, or they just fired
  const watchers = team ? [...w.players.values()].filter((q) => q.team === team && q.hp > 0) : [];
  const bushHidden = (q) => team && q.team !== team && inBush(w, q.x, q.y) && now >= q.revealUntil && !areas.some((a) => Math.hypot(a.x - q.x, a.y - q.y) <= (a.r ?? CFG.UAV_R)) && !watchers.some((m) => Math.hypot(m.x - q.x, m.y - q.y) <= CFG.BUSH_REVEAL);
  const p = [];
  for (const q of w.players.values()) {
    if (team && q.team !== team && !vis(q.x, q.y) && !(now < q.revealUntil)) continue; // hidden in the fog (a sniper who just fired is not)
    if (bushHidden(q)) continue;
    p.push([q.id, Math.round(q.x), Math.round(q.y), Math.round(q.aim * 100) / 100, Math.ceil(q.hp), now < q.protectUntil ? 1 : 0, q.grenades, ammoOf(q), q.reloadLeft > 0 ? Math.round((q.reloadLeft / spec(q).reloadS) * 100) / 100 : 0, q.arty, CLASS_IDS.indexOf(q.cls), q.healing ? 1 : 0, q.tentUsing ? -1 : Math.max(0, Math.ceil((q.tentReadyAt - now) / 1000)), q.nextCls ? CLASS_IDS.indexOf(q.nextCls) : -1, Math.round(q.medkit), q.kills, q.deaths, Math.round(q.stamina), q.winded ? 1 : 0, q.scoped ? 1 : 0, q.rockets, q.weapon === 'rocket' ? 1 : q.weapon === 'side' ? 2 : 0, q.elevated ? 1 : 0, Math.max(0, Math.ceil((q.blindUntil - now) / 100)), q.spec, Math.max(0, Math.ceil((q.specReadyAt - now) / 1000)), Math.max(0, Math.ceil((q.shieldUntil - now) / 100)), Math.round(q.heat * 100), now < q.shieldUntil ? Math.max(0, Math.round(q.shieldHp)) : 0, !team || q.team === team ? rewardCode(q) : 0, !team || q.team === team ? q.rewards.length : 0, q.control ? (q.control.kind === 'heli' ? 2 : 1) : 0, q.control ? Math.max(0, Math.ceil(q.control.left * 10)) : 0, q.streak ?? 0]);
  }
  const b = w.bullets.filter((x) => x.team === team || vis(x.x, x.y)).map((x) => [Math.round(x.x), Math.round(x.y)]);
  const owner = (id) => w.players.get(id);
  return {
    t: 's',
    v: CFG.VISION,
    sv: CFG.SCOPE_VISION,
    sh: CFG.SCOPE_HALF,
    p,
    b,
    f: w.shots.filter(([x, y, id]) => (vis(x, y) && !(owner(id) && bushHidden(owner(id)))) || owner(id)?.team === team || now < (owner(id)?.revealUntil ?? 0)),
    g: w.nades.filter((n) => vis(n.x, n.y) || n.team === team).map((n) => [Math.round(n.x), Math.round(n.y), n.flight > 0 ? Math.round((n.flight / CFG.NADE_FLIGHT_S) * 100) / 100 : 0, n.kind === 'smoke' ? 1 : n.kind === 'flash' ? 2 : n.kind === 'flare' ? 3 : 0]),
    a: w.arty.filter((a) => a.team === team || (a.delay <= CFG.ARTY_WARN_S && vis(a.x, a.y))).map((a) => [Math.round(a.x), Math.round(a.y), 0, Math.round((a.delay / CFG.ARTY_DELAY_S) * 100) / 100]),
    rk: w.rockets.filter((r) => r.team === team || vis(r.x, r.y)).map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.aim * 100) / 100]),
    u: w.pickups.filter((q) => !team || q.team === team).map((q) => [q.x, q.y, team && holdsBazooka(w, team) ? 1 : 0]), // your side's crate only; 1 = your side already holds a bazooka, so it cannot be taken yet
    cl: w.clouds.filter((c) => !eyes || c.team === team || canSee(eyes, c.x, c.y, c.r)).map((c) => [Math.round(c.x), Math.round(c.y), c.r, Math.round((c.left / CFG.SMOKE_S) * 100) / 100, c.team === 'green' ? 0 : 1]),
    dr: w.drops.filter((d) => !eyes || d.team === team || canSee(eyes, d.x, d.y)).map((d) => [Math.round(d.x), Math.round(d.y), d.delay > 0 ? 0 : 1, Math.round((d.left / CFG.DROP_S) * 100) / 100, d.delay > 0 ? Math.round((d.delay / CFG.DROP_DELAY_S) * 100) / 100 : 0]),
    ua: areas.map((a) => [Math.round(a.x), Math.round(a.y), a.big ? 0 : CFG.UAV_R, Math.round(((a.until - now) / 10000) * 100) / 100]), // radius 0 = the whole map
    ms: w.players.size ? [...w.players.values()].filter((q) => q.control && q.hp > 0 && (!team || q.team === team || (q.control.kind === 'heli' && vis(q.control.x, q.control.y)))).map((q) => [q.control.kind === 'heli' ? 1 : 0, Math.round(q.control.x), Math.round(q.control.y), Math.round(q.control.aim * 100) / 100, q.id, q.team === 'green' ? 0 : 1]) : [],
    uv: team ? [Math.max(0, Math.ceil((w.uav[team] - now) / 100)), Math.max(0, Math.ceil((w.uav[otherTeam(team)] - now) / 100))] : [0, 0], // tenths of a second left: ours, the enemy's
    tw: w.towers.filter((t) => !team || t.team === team || vis(t.x, t.y)).map((t) => [t.team === 'green' ? 0 : 1, t.owner, Math.round(t.x), Math.round(t.y), t.by === null ? 0 : 1, Math.round(t.prog * 100) / 100]),
    ts: [w.teamKills.green, w.teamKills.red, w.wins.green, w.wins.red],
    k: w.crates.map((c) => (now >= c.readyAt ? 1 : 0)),
    c: Math.round(w.progress * 1000) / 1000,
    hz: zoneSnap(w),
    ...(w.map.train ? { tr: trainSnap(w) } : {}),
    pt: [Math.floor(w.points.green), Math.floor(w.points.red)],
    r: { n: w.round.n, e: w.epoch ?? 0, mp: w.mapId, mr: w.mapRound, mt: CFG.ROUNDS_PER_MAP, nx: w.round.state === 'ended' && seriesOver(w) ? nextMapId(w) : '', s: w.round.state, l: Math.ceil(Math.max(0, w.round.state === 'live' ? w.round.left : w.round.endLeft)), w: w.round.winner },
  };
}

export const roster = (w) => [...w.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, bot: !!p.isBot }));

/** [x, y, r, whole seconds left, nextX, nextY], or the plaza alone when the zone does not move. */
function zoneSnap(w) {
  const z = zoneAt(w);
  if (zoneCount(w) < 2) return [Math.round(z.x), Math.round(z.y), z.r, 0, 0, 0];
  const n = zoneAt(w, 1);
  return [Math.round(z.x), Math.round(z.y), z.r, Math.ceil(Math.max(0, w.zone.left)), Math.round(n.x), Math.round(n.y)];
}

export function scoreboard(w) {
  return [...w.players.values()]
    .filter((p) => !p.isBot)
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    .map((p) => ({ id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, mk: p.mapKills, h: Math.round(p.healed) }));
}

export const drainEvents = (w) => w.events.splice(0, w.events.length);
