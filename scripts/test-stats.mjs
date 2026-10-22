// Plain-Node checks for saved stats.  node scripts/test-stats.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trenches-stats-'));
const stats = await import('../server/stats.mjs');

const A = { id: 1, team: 'green', wallet: 'AAAA1111111111111111111111111111111111111111' };
const B = { id: 2, team: 'red', wallet: 'BBBB2222222222222222222222222222222222222222' };
const C = { id: 3, team: 'green', wallet: 'CCCC3333333333333333333333333333333333333333' };
const guest = { id: 4, team: 'red' };
const bot = { id: 5, team: 'red', isBot: true, wallet: 'DDDD' };
let t = 100_000;

stats.recordKill(A, B, t);
assert.equal(stats.statsFor(A.wallet).k, 1, 'kill counts');
assert.equal(stats.statsFor(B.wallet).d, 1, 'death counts');
stats.recordKill(A, B, t + 1000);
assert.equal(stats.statsFor(A.wallet).k, 1, 'same pair within 10 s does not count again');
assert.equal(stats.statsFor(B.wallet).d, 2, 'but the death does');
stats.recordKill(A, B, t + 20_000);
assert.equal(stats.statsFor(A.wallet).k, 2, 'counts again after the gap');
stats.recordKill(A, C, t);
assert.equal(stats.statsFor(A.wallet).k, 2, 'team kills do not count');
stats.recordKill(A, bot, t);
assert.equal(stats.statsFor(A.wallet).k, 2, 'bots do not count');
stats.recordKill(A, A, t);
assert.equal(stats.statsFor(A.wallet).k, 2, 'suicide does not count');
stats.recordKill(guest, B, t + 40_000);
assert.equal(stats.statsFor(B.wallet).d, 3, 'a guest killing a wallet player still counts the death');
assert.equal(stats.statsFor('guest'), null, 'guests are not tracked');

const now = t + 200_000;
stats.recordRound([{ ...A, joinedAt: now - 60_000 }, { ...B, joinedAt: now - 60_000 }, { ...C, joinedAt: now - 5000 }], 'green', now);
assert.equal(stats.statsFor(A.wallet).w, 1, 'winner gets a win');
assert.equal(stats.statsFor(A.wallet).r, 1);
assert.equal(stats.statsFor(B.wallet).w, 0, 'loser gets none');
assert.equal(stats.statsFor(B.wallet).r, 1, 'loser still played the round');
assert.equal(stats.statsFor(C.wallet), null, 'a late joiner gets no round');

const top = stats.leaderboard('kills', 10);
assert.equal(top[0].rank, 1);
assert.match(top[0].name, /^AAAA…1111$/);
assert.equal(top[0].k, 2);
assert.equal(stats.leaderboard('wins', 10)[0].w, 1);

stats.flush();
const saved = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'stats.json'), 'utf8'));
assert.equal(saved[A.wallet].k, 2, 'saved to disk');
console.log('stats checks passed');
process.exit(0);
