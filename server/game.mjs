// Network layer for The Trenches: sockets in, simulation (sim.mjs) in the middle, snapshots out.
// Protocol (JSON over WebSocket at /ws):
//   client -> server  {t:'join', team:'green'|'red'|'random', name?, wallet?, nonce?, sig?}   once
//                     {t:'in', dx, dy, aim, fire}                                              many times a second
//   server -> client  {t:'welcome', id, team, players:[{id,name,team}], sb}
//                     {t:'join', id, name, team} / {t:'leave', id}
//                     {t:'s', p, b, c, r}    world snapshot every tick (see sim.snapshot)
//                     {t:'kill', killer, kteam, victim, vteam} / {t:'round', winner} / {t:'map', id} (the series moved to another map)
//                     {t:'sb', rows}         scoreboard every couple of seconds
//                     {t:'err', msg}
import fs from 'node:fs';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { verifyLogin } from './auth.mjs';
import { blockedCountry } from './guard.mjs';
import * as sim from './sim.mjs';
import * as stats from './stats.mjs';
import * as bots from './bots.mjs';

// The maps, played in this order (a best-of-3 on each, then the next one). MAP_ORDER=forest,city overrides it, e.g. to start on the forest.
const MAPS = {
  city: JSON.parse(fs.readFileSync(new URL('../shared/map.json', import.meta.url), 'utf8')),
  forest: JSON.parse(fs.readFileSync(new URL('../shared/forest.json', import.meta.url), 'utf8')),
};
const ORDER = (process.env.MAP_ORDER || 'city,forest').split(',').map((s) => s.trim()).filter((id) => MAPS[id]);
if (!ORDER.length) ORDER.push('city');
const world = sim.createWorld(MAPS[ORDER[0]], Math.random, { id: ORDER[0], maps: MAPS, order: ORDER });
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
const adminTries = new Map(); // ip -> failed /admin attempts

export const onlineCount = () => [...world.players.values()].filter((p) => !p.isBot).length;

// Fill-in bots (an admin setting). BOTS=1 turns them on at start-up, BOT_TEAM_SIZE (default 5) is how many soldiers each side is topped up to,
// counting the people on it. Admins can also change it while the server runs (see /api/admin/bots in index.mjs).
const botSettings = { enabled: process.env.BOTS === '1', size: Math.max(1, Math.min(15, Number(process.env.BOT_TEAM_SIZE) || 5)) };
export const getBotSettings = () => ({ ...botSettings, bots: [...world.players.values()].filter((p) => p.fill).length });
export function setBotSettings({ enabled, size }) {
  if (typeof enabled === 'boolean') botSettings.enabled = enabled;
  if (Number.isFinite(Number(size))) botSettings.size = Math.max(1, Math.min(15, Math.floor(Number(size))));
  return getBotSettings();
}
/** Who is in the match right now, by side (names and classes only), for the lobby. */
export const lobbyRoster = () => {
  const out = { green: [], red: [] };
  for (const p of world.players.values()) {
    if (p.isBot || !out[p.team]) continue;
    out[p.team].push({ name: p.name, cls: p.cls, kills: p.kills || 0 });
  }
  return out;
};

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
// Voice chat: opt in to your team's channel ('team') or the all-player channel ('all'). The server only passes the setup messages between
// people in the same channel; the audio itself flows browser to browser.
const sendTo = (id, msg) => {
  const sock = sockets.get(id);
  if (sock) send(sock, msg);
};
const voiceMates = (p, team = p.team, chan = p.voice) =>
  [...world.players.values()].filter((q) => q.voice && q.voice === chan && q.id !== p.id && (chan === 'all' || q.team === team) && !q.isBot);
const dropVoice = (p, kick = true, team = p?.team) => {
  if (!p?.voice) return;
  const chan = p.voice;
  const mates = voiceMates(p, team, chan);
  p.voice = false;
  for (const q of mates) sendTo(q.id, { t: 'vleft', id: p.id });
  if (kick) sendTo(p.id, { t: 'vkick' });
};

/** Send each side its own version of a message (fog of war). `make(team)` returns the message for that team, or null to skip it. */
const broadcastByTeam = (make) => {
  const raw = {};
  for (const [id, ws] of sockets) {
    if (ws.readyState !== 1) continue;
    const team = world.players.get(id)?.team;
    if (!team) continue;
    if (!(team in raw)) {
      const m = make(team);
      raw[team] = m ? JSON.stringify(m) : null;
    }
    if (raw[team]) ws.send(raw[team]);
  }
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
    let vsigs = 0; // setup messages for voice, per second
    const joinTimer = setTimeout(() => !me && ws.close(4401, 'join timed out'), 15_000);
    const inputReset = setInterval(() => {
      inputs = 0;
      vsigs = 0;
    }, 1000);
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
        send(ws, { t: 'welcome', training: TRAINING, map: world.mapId, id: p.id, team: p.team, players: sim.roster(world), sb: sim.scoreboard(world) });
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

      if (m.t === 'vjoin') {
        if (me.voice) return;
        me.voice = m.chan === 'all' ? 'all' : 'team';
        const mates = voiceMates(me);
        send(ws, { t: 'vpeers', ids: mates.map((q) => q.id) });
        for (const q of mates) sendTo(q.id, { t: 'vjoined', id: me.id });
        return;
      }
      if (m.t === 'vleave') {
        dropVoice(me, false);
        return;
      }
      if (m.t === 'vsig') {
        if (!me.voice || ++vsigs > 80) return;
        const to = world.players.get(Math.floor(Number(m.to)));
        if (!to || !to.voice || to.voice !== me.voice || (me.voice === 'team' && to.team !== me.team) || to.id === me.id) return;
        const data = JSON.stringify(m.data ?? null);
        if (data.length > 8000) return;
        sendTo(to.id, { t: 'vsig', from: me.id, data: m.data });
        return;
      }

      if (m.t === 'chat') {
        const nowMs = Date.now();
        const text = String(m.text ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 120);
        if (!text || nowMs - (me.lastChat || 0) < 800) return;
        me.lastChat = nowMs;
        if (text.startsWith('/')) {
          // chat commands (never shown to anyone else, so a typed password cannot leak into the chat log)
          const reply = (msg) => send(ws, { t: 'chat', id: 0, name: 'Server', team: me.team, text: msg, mode: 'all' });
          const announce = (msg) => broadcast({ t: 'chat', id: 0, name: 'Server', team: me.team, text: msg, mode: 'all' }); // everyone sees what an admin changed
          const [cmd, ...rest] = text.slice(1).split(/\s+/);
          const arg = rest.join(' ').trim();
          if (cmd.toLowerCase() === 'admin') {
            const want = process.env.ADMIN_TOKEN || '';
            const key = `${ip}`;
            const tries = adminTries.get(key) || { n: 0, until: 0 };
            if (nowMs < tries.until) return reply('Too many tries. Wait a minute.');
            const ok = want.length >= 12 && arg.length === want.length && crypto.timingSafeEqual(Buffer.from(arg), Buffer.from(want));
            if (!ok) {
              tries.n++;
              if (tries.n >= 5) { tries.until = nowMs + 60_000; tries.n = 0; }
              adminTries.set(key, tries);
              return reply('Wrong password.');
            }
            adminTries.delete(key);
            me.admin = true;
            console.log(`[admin] ${me.name} unlocked admin commands`);
            return reply('Admin unlocked. /bots 5 (fill each side to 5), /bots 0 (no bots), /map forest or /map city, /restart (round wins 0:0, new timer).');
          }
          if (cmd.toLowerCase() === 'bots' && me.admin) {
            if (arg !== '') {
              const n = Number(arg);
              if (!Number.isInteger(n) || n < 0 || n > 15) return reply('Use /bots followed by a number from 0 to 15.');
              setBotSettings(n === 0 ? { enabled: false } : { enabled: true, size: n });
              console.log(`[admin] ${me.name} set bots to ${n}`);
            }
            const st = getBotSettings();
            return reply(st.enabled ? `Bots on: each side is filled to ${st.size} soldiers (${st.bots} bots in play now).` : 'Bots off.');
          }
          if (cmd.toLowerCase() === 'map' && me.admin) {
            const id = arg.toLowerCase();
            if (!MAPS[id]) return reply(`Maps: ${Object.keys(MAPS).join(', ')}. Use /map followed by one of them.`);
            sim.restartSeries(world, Date.now(), id);
            console.log(`[admin] ${me.name} changed the map to ${id}`);
            return announce(`${me.name} changed the map to ${MAPS[id].name ?? (id === 'city' ? 'The Ruins' : id)}. Round wins reset to 0:0.`);
          }
          if (cmd.toLowerCase() === 'restart' && me.admin) {
            sim.restartSeries(world, Date.now());
            console.log(`[admin] ${me.name} restarted the match`);
            return announce(`${me.name} restarted the match: round wins 0:0, new timer.`);
          }
          return reply('Unknown command.');
        }
        const teamOnly = m.mode === 'team';
        const raw = JSON.stringify({ t: 'chat', id: me.id, name: me.name, team: me.team, text, mode: teamOnly ? 'team' : 'all' });
        for (const [pid, sock] of sockets) {
          if (sock.readyState !== 1) continue;
          if (!teamOnly || world.players.get(pid)?.team === me.team) sock.send(raw);
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
        dropVoice(me, false);
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
    // fill-in bots: topped up each side to the set size while at least one person is online, gone when the setting is off or everyone has left
    const change = bots.sync(world, botSettings, now);
    for (const id of change.removed) broadcast({ t: 'leave', id });
    for (const b of change.added) broadcast({ t: 'join', id: b.id, name: b.name, team: b.team, bot: true });
    if (![...world.players.values()].some((p) => !p.isBot)) return;
    bots.tick(world, now, dt);
    sim.step(world, dt, now);
    for (const e of sim.drainEvents(world)) {
      if (e.t === 'kill') {
        stats.recordKill(world.players.get(e.kid), world.players.get(e.vid), now);
        const { kid, vid, ...pub } = e; // clients do not need the ids
        broadcast(pub);
        continue;
      }
      if (e.t === 'round') stats.recordRound(world.players.values(), e.winner, now);
      if (e.t === 'boom' || e.t === 'pop' || e.t === 'arty' || e.t === 'rocket') {
        // fog of war: you hear a blast somewhat farther than you can see, and always your own side's strikes
        const eyesBy = {};
        broadcastByTeam((team) => {
          eyesBy[team] ??= sim.eyesFor(world, team);
          const near = sim.canSee(eyesBy[team], e.x, e.y, 200);
          return near || (e.t === 'arty' && e.team === team) ? e : null;
        });
        continue;
      }
      if (e.t === 'team' && world.players.get(e.id)?.voice === 'team') dropVoice(world.players.get(e.id), true, e.team === 'green' ? 'red' : 'green'); // moved to the other side: leaves that side's voice
      broadcast(e);
    }
    broadcastByTeam((team) => sim.snapshot(world, now, team));
    if (++ticks % 40 === 0) broadcast({ t: 'sb', rows: sim.scoreboard(world) });
  }, TICK_MS).unref();

  // Idle kick: a person who has not moved, fired or touched the mouse for IDLE_KICK_S seconds (default 60; 0 turns it off) is removed, after a warning.
  const IDLE_S = Number(process.env.IDLE_KICK_S ?? 60);
  if (IDLE_S > 0) {
    setInterval(() => {
      const t = Date.now();
      for (const [id, sock] of sockets) {
        const p = world.players.get(id);
        if (!p || p.isBot || sock.readyState !== 1) continue;
        const idle = (t - (p.lastActive ?? t)) / 1000;
        if (idle >= IDLE_S) {
          send(sock, { t: 'err', msg: 'Removed for being idle.' });
          sock.close(4002, 'idle');
        } else if (idle >= IDLE_S - 15 && !p.idleWarned) {
          p.idleWarned = true;
          send(sock, { t: 'chat', id: 0, name: 'Server', team: p.team, text: `Move or you will be removed for being idle in ${Math.ceil(IDLE_S - idle)} seconds.`, mode: 'all' });
        } else if (idle < IDLE_S - 15) p.idleWarned = false;
      }
    }, 1000).unref();
  }

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
