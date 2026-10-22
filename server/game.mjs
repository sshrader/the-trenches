// Network layer for The Trenches: sockets in, simulation (sim.mjs) in the middle, snapshots out.
// Protocol (JSON over WebSocket at /ws):
//   client -> server  {t:'join', team:'green'|'red'|'random', name?, wallet?, nonce?, sig?}   once
//                     {t:'in', dx, dy, aim, fire}                                              many times a second
//   server -> client  {t:'welcome', id, team, players:[{id,name,team}], sb}
//                     {t:'join', id, name, team} / {t:'leave', id}
//                     {t:'s', p, b, c, r}    world snapshot every tick (see sim.snapshot)
//                     {t:'kill', killer, kteam, victim, vteam} / {t:'round', winner}
//                     {t:'sb', rows}         scoreboard every couple of seconds
//                     {t:'err', msg}
import fs from 'node:fs';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { verifyLogin } from './auth.mjs';
import { blockedCountry } from './guard.mjs';
import * as sim from './sim.mjs';
import * as stats from './stats.mjs';

const MAP = JSON.parse(fs.readFileSync(new URL('../shared/map.json', import.meta.url), 'utf8'));
const world = sim.createWorld(MAP);
const TICK_MS = 50;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 60);
const MAX_PER_IP = Number(process.env.MAX_CONN_PER_IP || 4);
const TRAINING = process.env.TRAINING_BOT === '1' || (process.env.TRAINING_BOT !== '0' && process.env.NODE_ENV !== 'production'); // lets players add a wounded test bot
const WALLET_REQUIRED = process.env.WALLET_REQUIRED === '1'; // default: guests may play, wallet sign-in is optional

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const shortName = (w) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const guestName = () => `Recruit-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

// Quick team chat: the client sends only a number, the words live here so nobody can type anything into the game.
const SAY = ['', 'Cover me!', "I'll cover you!", 'Throw a grenade!', 'Call in artillery!', "Let's go for the CP!"];

const sockets = new Map(); // player id -> ws
const byWallet = new Map(); // wallet -> ws
const perIp = new Map();

export const onlineCount = () => world.players.size;

const ipOf = (req) => {
  if (process.env.TRUST_PROXY) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xf) return xf;
  }
  return req.socket.remoteAddress || 'unknown';
};

const send = (ws, msg) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
};
const broadcast = (msg) => {
  const raw = JSON.stringify(msg);
  for (const ws of sockets.values()) if (ws.readyState === 1) ws.send(raw);
};

export function attachGame(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });

  wss.on('connection', (ws, req) => {
    const ip = ipOf(req);
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return ws.close(1008, 'bad origin');
      } catch {
        return ws.close(1008, 'bad origin');
      }
    }
    if (blockedCountry(req)) return ws.close(4451, 'region');
    const n = perIp.get(ip) || 0;
    if (n >= MAX_PER_IP) return ws.close(1013, 'too many connections');
    perIp.set(ip, n + 1);

    let me = null;
    let wallet = '';
    let alive = true;
    let inputs = 0;
    const joinTimer = setTimeout(() => !me && ws.close(4401, 'join timed out'), 15_000);
    const inputReset = setInterval(() => (inputs = 0), 1000);
    ws.on('pong', () => (alive = true));
    ws._alive = () => alive;
    ws._beat = () => (alive = false);

    ws.on('message', (data) => {
      let m;
      try {
        m = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!m || typeof m.t !== 'string') return;

      if (m.t === 'join') {
        if (me) return;
        let name;
        if (m.sig) {
          wallet = verifyLogin({ wallet: m.wallet, nonce: m.nonce, signature: m.sig }) || '';
          if (!wallet) return send(ws, { t: 'err', msg: 'Wallet sign-in failed. Try again.' });
          name = shortName(wallet);
        } else {
          if (WALLET_REQUIRED) return send(ws, { t: 'err', msg: 'Sign in with your wallet to play.' });
          name = clean(m.name, 16) || guestName();
        }
        if (world.players.size >= MAX_PLAYERS) return send(ws, { t: 'err', msg: 'The battle is full. Try again in a moment.' });
        if (wallet) {
          const old = byWallet.get(wallet);
          if (old && old !== ws) old.close(4000, 'signed in elsewhere');
          byWallet.set(wallet, ws);
        }
        const p = sim.addPlayer(world, { name, want: m.team, cls: m.cls });
        if (!p) return send(ws, { t: 'err', msg: 'Both sides are full. Try again in a moment.' });
        me = p;
        p.joinedAt = Date.now();
        if (wallet) p.wallet = wallet;
        sockets.set(p.id, ws);
        send(ws, { t: 'welcome', training: TRAINING, id: p.id, team: p.team, players: sim.roster(world), sb: sim.scoreboard(world) });
        broadcast({ t: 'join', id: p.id, name: p.name, team: p.team });
        return;
      }
      if (!me) return;

      if (m.t === 'say') {
        const n = Math.floor(Number(m.n));
        const nowMs = Date.now();
        if (!(n >= 1 && n < SAY.length) || nowMs - (me.lastSay || 0) < 1200) return;
        me.lastSay = nowMs;
        const raw = JSON.stringify({ t: 'chat', id: me.id, name: me.name, team: me.team, text: SAY[n] });
        for (const [pid, sock] of sockets) {
          if (sock.readyState === 1 && world.players.get(pid)?.team === me.team) sock.send(raw); // team only
        }
        return;
      }

      if (m.t === 'dummy') {
        if (!TRAINING) return;
        const b = sim.addBot(world, me.id);
        if (b) broadcast({ t: 'join', id: b.id, name: b.name, team: b.team, bot: true });
        return;
      }

      if (m.t === 'class') {
        sim.setClass(world, me.id, m.cls);
        return;
      }

      if (m.t === 'in') {
        if (++inputs > 40) return;
        sim.setInput(world, me.id, m);
      }
    });

    ws.on('close', () => {
      clearTimeout(joinTimer);
      clearInterval(inputReset);
      perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1));
      if (wallet && byWallet.get(wallet) === ws) byWallet.delete(wallet);
      if (me) {
        sockets.delete(me.id);
        for (const id of sim.removeBotsOf(world, me.id)) broadcast({ t: 'leave', id });
        sim.removePlayer(world, me.id);
        broadcast({ t: 'leave', id: me.id });
      }
    });
    ws.on('error', () => {});
  });

  let last = Date.now();
  let ticks = 0;
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.2, (now - last) / 1000);
    last = now;
    if (!world.players.size) return;
    sim.step(world, dt, now);
    for (const e of sim.drainEvents(world)) {
      if (e.t === 'kill') {
        stats.recordKill(world.players.get(e.kid), world.players.get(e.vid), now);
        const { kid, vid, ...pub } = e; // clients do not need the ids
        broadcast(pub);
        continue;
      }
      if (e.t === 'round') stats.recordRound(world.players.values(), e.winner, now);
      broadcast(e);
    }
    broadcast(sim.snapshot(world, now));
    if (++ticks % 40 === 0) broadcast({ t: 'sb', rows: sim.scoreboard(world) });
  }, TICK_MS).unref();

  setInterval(() => {
    for (const ws of wss.clients) {
      if (ws._alive && !ws._alive()) {
        ws.terminate();
        continue;
      }
      ws._beat?.();
      try {
        ws.ping();
      } catch {
        /* closing */
      }
    }
  }, 30_000).unref();

  return wss;
}
