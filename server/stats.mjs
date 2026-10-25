// Saved player stats and the leaderboard. Wallet players are tracked by their wallet; guests by a random id their browser keeps
// (shown under the name they last played with). The data is a small JSON file in DATA_DIR (put DATA_DIR on a Railway volume or it resets on every deploy).
import fs from 'node:fs';
import path from 'node:path';

const file = () => path.resolve(process.env.DATA_DIR || 'server/data', 'stats.json');
const PAIR_GAP_MS = 10_000; // the same killer scoring the same victim again within this long does not count (stops two-wallet farming)
const MIN_ROUND_MS = 30_000; // you must have been in the battle this long for a round to count for you

const rows = new Map(); // wallet -> { k, d, r, w, seen }
const pairs = new Map(); // `${killer}>${victim}` -> last counted time
let dirty = false;

try {
  for (const [wallet, v] of Object.entries(JSON.parse(fs.readFileSync(file(), 'utf8')))) rows.set(wallet, { k: 0, d: 0, r: 0, w: 0, seen: 0, ...v });
} catch {
  /* first run, or an unreadable file: start empty */
}

const row = (wallet, name) => {
  let r = rows.get(wallet);
  if (!r) rows.set(wallet, (r = { k: 0, d: 0, r: 0, w: 0, seen: 0 }));
  r.seen = Date.now();
  if (wallet.startsWith('g:') && name) r.n = name;
  dirty = true;
  return r;
};

const shortName = (w) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const real = (p) => !!p && !!p.wallet && !p.isBot;

/** A soldier died. `killer` and `victim` are sim players (the killer may be gone); team kills and suicides do not count. */
export function recordKill(killer, victim, now = Date.now()) {
  if (!victim || (killer && killer.team === victim.team)) return;
  if (real(victim)) row(victim.wallet, victim.name).d++;
  if (!real(killer) || !victim || victim.isBot) return;
  const key = `${killer.wallet}>${victim.wallet || victim.id}`;
  if (now - (pairs.get(key) || 0) < PAIR_GAP_MS) return;
  pairs.set(key, now);
  row(killer.wallet, killer.name).k++;
}

/** A round ended. Everyone signed in who has been playing a while gets a round, and the winners get a win. */
export function recordRound(players, winner, now = Date.now()) {
  for (const p of players) {
    if (!real(p) || now - (p.joinedAt || now) < MIN_ROUND_MS) continue;
    const r = row(p.wallet, p.name);
    r.r++;
    if (winner && p.team === winner) r.w++;
  }
}

export function leaderboard(sort = 'kills', limit = 10) {
  const key = sort === 'wins' ? 'w' : 'k';
  return [...rows.entries()]
    .filter(([, v]) => v[key] > 0)
    .sort((a, b) => b[1][key] - a[1][key] || b[1].w - a[1].w || b[1].k - a[1].k)
    .slice(0, Math.min(Math.max(1, limit), 50))
    .map(([wallet, v], i) => ({ rank: i + 1, name: wallet.startsWith('g:') ? v.n || 'Guest' : shortName(wallet), k: v.k, d: v.d, kd: v.d ? Math.round((v.k / v.d) * 100) / 100 : v.k, r: v.r, w: v.w }));
}

export const statsFor = (wallet) => rows.get(wallet) || null;

export function flush() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(rows)));
    fs.renameSync(tmp, file()); // atomic, so a crash never leaves half a file
  } catch (e) {
    dirty = true;
    console.error('stats save failed:', e.message);
  }
}

setInterval(flush, 15_000).unref();
setInterval(() => {
  const old = Date.now() - 60_000;
  for (const [k, t] of pairs) if (t < old) pairs.delete(k);
}, 60_000).unref();
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    flush();
    process.exit(0);
  });
}
