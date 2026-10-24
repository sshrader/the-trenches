// Fill-in soldiers: when the setting is on, each side is topped up with bots until it has `size` soldiers (humans count, so 5v5 means five a side
// counting the people playing). Bots only exist while a person is online, leave as people join, play like players (they send the same inputs, see
// only what their side can see through the fog, and are hidden by bushes like anyone else), and never count for the scoreboard or the stats.
import * as sim from './sim.mjs';

const { CFG } = sim;
const NAMES = ['Ghost', 'Viper', 'Rook', 'Jackal', 'Raven', 'Falcon', 'Hawk', 'Wolf', 'Cobra', 'Badger', 'Fox', 'Lynx', 'Otter', 'Mantis', 'Bishop', 'Anvil', 'Cinder', 'Dagger', 'Echo', 'Flint', 'Gale', 'Harbor', 'Ivory', 'Kestrel'];
const ORDER = ['rifleman', 'medic', 'smg', 'sniper', 'shotgunner', 'squad']; // the mix the bots build towards on each side
const TILE = 32;
const SOLID = '#cBKY';

// ---------- walking: breadth-first search over the tiles, cached per map ----------
const pathCache = new Map();
const solidT = (w, tx, ty) => {
  const c = w.rows[ty]?.[tx];
  return c === undefined || SOLID.includes(c);
};
function findPath(w, sx, sy, gx, gy) {
  const W = w.W, H = w.H;
  const s = [Math.floor(sx / TILE), Math.floor(sy / TILE)];
  const e = [Math.floor(gx / TILE), Math.floor(gy / TILE)];
  const key = `${w.mapId}:${s}>${e}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  if (pathCache.size > 4000) pathCache.clear();
  const prev = new Map([[s[1] * W + s[0], -1]]);
  const q = [s];
  let found = false;
  for (let qi = 0; qi < q.length && !found; qi++) {
    const [x, y] = q[qi];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || solidT(w, nx, ny) || prev.has(ny * W + nx)) continue;
      if (dx && dy && (solidT(w, x + dx, y) || solidT(w, x, y + dy))) continue; // no cutting corners
      prev.set(ny * W + nx, y * W + x);
      q.push([nx, ny]);
      if (nx === e[0] && ny === e[1]) { found = true; break; }
    }
  }
  const out = [];
  if (found) {
    let cur = e[1] * W + e[0];
    while (cur !== -1) { out.push([(cur % W) * TILE + TILE / 2, Math.floor(cur / W) * TILE + TILE / 2]); cur = prev.get(cur); }
    out.reverse();
  }
  pathCache.set(key, out);
  return out;
}

// ---------- what a side can see (the same rules as the snapshot: fog, smoke, bushes) ----------
function viewFor(w, team, now) {
  const eyes = sim.eyesFor(w, team, now);
  const walls = w.clouds.filter((c) => c.team !== team);
  const areas = w.uavAreas.filter((a) => a.team === team && now < a.until);
  const watchers = [...w.players.values()].filter((q) => q.team === team && q.hp > 0);
  return (q) => {
    if (now < q.revealUntil) return true;
    if (areas.some((a) => Math.hypot(a.x - q.x, a.y - q.y) <= (a.r ?? CFG.UAV_R))) return true;
    if (!sim.canSee(eyes, q.x, q.y, 0, walls)) return false;
    if (sim.inBush(w, q.x, q.y) && !watchers.some((m) => Math.hypot(m.x - q.x, m.y - q.y) <= CFG.BUSH_REVEAL)) return false;
    return true;
  };
}

const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// per class: how far he engages from, how close he likes to get, how long he bursts
const STYLE = {
  rifleman: { engage: 520, keep: 230, on: 0.55, off: 0.3 },
  smg: { engage: 380, keep: 120, on: 0.9, off: 0.25 },
  medic: { engage: 400, keep: 260, on: 0.5, off: 0.4 },
  sniper: { engage: 900, keep: 520, on: 0.12, off: 1.5 },
  shotgunner: { engage: 260, keep: 70, on: 0.25, off: 0.35 },
  squad: { engage: 520, keep: 230, on: 0.55, off: 0.3 },
};

function brain(p) {
  return (p.mind ??= { path: [], pi: 0, goal: '', strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0, burst: 0, tid: 0, seenAt: 0, last: null, lastMoved: 0, lx: p.x, ly: p.y, jiggle: 0, cd: {}, c: { nade: 0, special: 0, arty: 0, reload: 0 }, idleSince: 0, slot: Math.random() });
}

/** One decision for one bot. */
function think(w, p, view, enemies, mates, now, dt) {
  const ai = brain(p);
  const st = STYLE[p.cls] ?? STYLE.rifleman;
  const cap = w.map.capture;
  const hpMax = sim.maxHp(p);
  const cool = (k, ms) => (now >= (ai.cd[k] ?? 0) ? ((ai.cd[k] = now + ms), true) : false);
  const input = { dx: 0, dy: 0, aim: p.aim, fire: false, sprint: false, scope: false, range: 200 };

  // ---- who to shoot: the nearest enemy his side can see, in range, with a clear line
  let target = null, td = 1e9;
  const seen = [];
  for (const e of enemies) {
    if (!view(e)) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    seen.push([e, d]);
    if (d <= st.engage && d < td && sim.lineClear(w, p.x, p.y, e.x, e.y)) { target = e; td = d; }
  }
  if (target) {
    if (ai.tid !== target.id) { ai.tid = target.id; ai.seenAt = now + 250 + Math.random() * 300; ai.last = null; } // a moment to react to a new face
  } else ai.tid = 0;

  // ---- where to be
  let goal;
  const wounded = p.hp < hpMax * 0.4;
  const tent = w.tents.find((t) => t.team === p.team);
  if (wounded && tent && !(target && td < 160)) goal = [tent.x, tent.y];
  else if (p.cls === 'sniper') {
    const nests = (w.map.nests || []).filter((n) => n.team === p.team);
    const nest = nests.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    goal = nest ? [nest.x, nest.y] : [cap.x, cap.y];
  } else if (p.cls === 'medic') {
    const hurt = mates.filter((m) => m.id !== p.id && m.hp > 0 && m.hp < sim.maxHp(m) * 0.7 && Math.hypot(m.x - p.x, m.y - p.y) < 700).sort((a, b) => a.hp - b.hp)[0];
    if (hurt) goal = [hurt.x, hurt.y];
  }
  if (!goal) {
    // the rest hold the plaza, spread round it so they do not stack up
    const ang = ((p.id * 2.399) % (Math.PI * 2));
    const ring = cap.r * (0.5 + ((p.id * 7) % 5) / 6);
    goal = [cap.x + Math.cos(ang) * ring, cap.y + Math.sin(ang) * ring];
    if (solidT(w, Math.floor(goal[0] / TILE), Math.floor(goal[1] / TILE))) goal = [cap.x, cap.y];
  }
  const gkey = `${Math.floor(goal[0] / TILE)},${Math.floor(goal[1] / TILE)}`;
  if (ai.goal !== gkey) { ai.goal = gkey; ai.path = findPath(w, p.x, p.y, goal[0], goal[1]); ai.pi = 0; }
  while (ai.pi < ai.path.length && Math.hypot(ai.path[ai.pi][0] - p.x, ai.path[ai.pi][1] - p.y) < 16) ai.pi++;
  let wp = ai.path[ai.pi];
  const toGoal = Math.hypot(goal[0] - p.x, goal[1] - p.y);
  if (!wp && toGoal > 60) {
    // the path is used up but he is not there (he died and respawned, or was knocked off it): plan again from where he stands
    ai.path = findPath(w, p.x, p.y, goal[0], goal[1]);
    ai.pi = 0;
    wp = ai.path[0];
  }

  // ---- move and aim
  const standGround = p.cls === 'sniper' ? toGoal < 60 : false;
  if (target) {
    const prev = ai.last;
    ai.last = { x: target.x, y: target.y, t: now };
    let tx = target.x, ty = target.y;
    if (prev && now - prev.t > 0 && now - prev.t < 400) {
      const lead = Math.min(0.5, td / 700) * 0.6; // a little lead on a moving target
      tx += ((target.x - prev.x) / ((now - prev.t) / 1000)) * lead;
      ty += ((target.y - prev.y) / ((now - prev.t) / 1000)) * lead;
    }
    const miss = (0.03 + td / 9000) * (0.5 + Math.random()) * (p.cls === 'sniper' ? 0.4 : 1);
    input.aim = Math.atan2(ty - p.y, tx - p.x) + (Math.random() * 2 - 1) * miss;
    input.range = td;
    // keep his preferred distance: close in if he is too far, otherwise stand and sidestep
    if (td > st.keep && wp && !standGround) {
      const a = Math.atan2(wp[1] - p.y, wp[0] - p.x);
      input.dx = Math.cos(a) * 0.9; input.dy = Math.sin(a) * 0.9;
    } else {
      ai.strafeT -= dt;
      if (ai.strafeT <= 0) { ai.strafeT = 0.5 + Math.random() * 0.9; ai.strafe = -ai.strafe; }
      const perp = input.aim + Math.PI / 2;
      const back = td < st.keep * 0.5 ? -0.5 : 0;
      input.dx = Math.cos(perp) * ai.strafe * 0.7 + Math.cos(input.aim) * back;
      input.dy = Math.sin(perp) * ai.strafe * 0.7 + Math.sin(input.aim) * back;
    }
    // fire in bursts, once he has reacted
    if (now >= ai.seenAt && !(p.reloadLeft > 0)) {
      ai.burst -= dt;
      if (ai.burst <= -st.off) ai.burst = st.on;
      input.fire = ai.burst > 0;
      if (p.cls === 'sniper') { input.scope = true; input.fire = input.fire && p.scoped; }
    } else if (p.cls === 'sniper') input.scope = true;
  } else if (wp && !standGround && toGoal > 40) {
    const a = Math.atan2(wp[1] - p.y, wp[0] - p.x);
    input.dx = Math.cos(a); input.dy = Math.sin(a);
    input.aim = a;
    input.sprint = toGoal > 350 && p.stamina > 35;
  } else if (!target) {
    // at his post: look towards the enemy
    const away = p.team === 'green' ? 0 : Math.PI;
    input.aim = away + Math.sin(now / 1500 + p.id) * 0.4;
    if (p.cls === 'sniper') input.scope = false;
  }

  // ---- stuck? (against a prop, another soldier...) sidestep and re-plan
  if (Math.hypot(p.x - ai.lx, p.y - ai.ly) > 6) { ai.lx = p.x; ai.ly = p.y; ai.lastMoved = now; }
  if (now - ai.lastMoved > 1200 && (input.dx || input.dy) && !target) {
    ai.jiggle = now + 500;
    ai.lastMoved = now;
    ai.goal = '';
  }
  if (now < ai.jiggle) { const a = Math.random() * Math.PI * 2; input.dx = Math.cos(a); input.dy = Math.sin(a); }

  // ---- the toys
  if (target && now >= ai.seenAt) {
    const at = (x, y) => { input.aim = Math.atan2(y - p.y, x - p.x); };
    if (td > 140 && td < 320 && p.grenades > 0 && cool('nade', 9000) && Math.random() < 0.5) { input.range = td; at(target.x, target.y); ai.c.nade++; }
    else if (p.cls === 'rifleman' && seen.length && td > 220 && td < 520 && (seen.length >= 2 || p.hp < hpMax * 0.7) && cool('special', 22000)) { input.range = td * 0.6; at(target.x, target.y); ai.c.special++; } // smoke between us
    else if (p.cls === 'smg' && td > 90 && td < 280 && cool('special', 12000)) { input.range = td; at(target.x, target.y); ai.c.special++; } // flashbang
    else if (p.cls === 'shotgunner' && td < 300 && p.hp < hpMax * 0.9 && cool('special', 9000)) ai.c.special++; // riot shield
    if (p.arty > 0 && seen.length >= 3 && td > 250 && td < 700 && cool('arty', 20000)) { input.range = td; at(target.x, target.y); ai.c.arty++; }
  }
  if (p.cls === 'medic') {
    const near = mates.filter((m) => m.hp > 0 && Math.hypot(m.x - p.x, m.y - p.y) < 80 && m.hp < sim.maxHp(m) * 0.75);
    if (near.length >= 2 && cool('special', 25000)) { input.range = CFG.NADE_MIN; ai.c.special++; } // flare at his feet
  }
  if (p.cls === 'squad' && !target && cool('special', 30000)) { input.aim = Math.atan2(cap.y - p.y, cap.x - p.x); input.range = Math.min(CFG.NADE_MAX, Math.hypot(cap.x - p.x, cap.y - p.y)); ai.c.special++; } // UAV on the plaza
  if (p.ammo < 3 && !target && p.reloadLeft <= 0 && cool('reload', 4000)) ai.c.reload++;
  return input;
}

/** Let every bot decide and send its input. Call once a tick, before the simulation step. */
export function tick(w, now, dt) {
  const bots = [...w.players.values()].filter((p) => p.fill && p.hp > 0);
  if (!bots.length) return;
  const views = {};
  for (const team of ['green', 'red']) views[team] = viewFor(w, team, now);
  for (const p of bots) {
    const enemies = [...w.players.values()].filter((q) => q.team !== p.team && q.hp > 0);
    const mates = [...w.players.values()].filter((q) => q.team === p.team);
    let inp;
    try { inp = think(w, p, views[p.team], enemies, mates, now, dt); } catch { continue; }
    sim.setInput(w, p.id, { ...inp, ...brain(p).c });
  }
}

/**
 * Add or remove bots so that each side has `size` soldiers counting the people on it. Returns what changed so the server can tell the clients.
 * With the setting off, or nobody online, every bot goes.
 */
export function sync(w, { enabled, size }, now) {
  const added = [], removed = [];
  const humans = [...w.players.values()].filter((p) => !p.isBot);
  const wanted = enabled && humans.length ? Math.max(0, Math.min(CFG.MAX_PER_TEAM, Math.floor(size))) : 0;
  for (const team of ['green', 'red']) {
    const side = [...w.players.values()].filter((p) => p.team === team);
    const bots = side.filter((p) => p.fill);
    const want = Math.max(0, wanted - (side.length - bots.length));
    for (let i = bots.length; i > want; i--) { // too many: the newest bots go (a person took the place)
      const b = bots.pop();
      sim.removePlayer(w, b.id);
      removed.push(b.id);
    }
    for (let i = bots.length; i < want; i++) {
      const counts = Object.fromEntries(ORDER.map((c) => [c, side.filter((p) => p.cls === c).length]));
      const cls = ORDER.filter((c) => c !== 'sniper' || counts.sniper < 1).sort((a, b) => counts[a] - counts[b] || ORDER.indexOf(a) - ORDER.indexOf(b))[0];
      const used = new Set([...w.players.values()].map((p) => p.name));
      const name = `Bot ${NAMES.find((n) => !used.has(`Bot ${n}`)) ?? Math.floor(Math.random() * 900 + 100)}`;
      const p = sim.addPlayer(w, { name, want: team, cls, fill: true }, now); // a bot is not a person: not counted when teams are balanced, not on the scoreboard, never in the stats
      if (!p) break;
      side.push(p);
      added.push(p);
    }
  }
  return { added, removed };
}
