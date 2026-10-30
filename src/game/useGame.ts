import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WALLET_LOGIN } from '../config';
import { useVoice } from './useVoice';
import { playBoom, playCannon, playPickup, playPop, playReload, playShot, playStreak, playTrainHorn, playTrainPass, playWhistle, heliGun, heliRotor } from './audio';

/** A random id this browser keeps, so a guest's kills and wins are saved and ranked without a wallet. */
function guestId(): string {
  try {
    let id = localStorage.getItem('ruins-guest-id');
    if (!id || !/^[a-f0-9]{32}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('ruins-guest-id', id);
    }
    return id;
  } catch {
    return ''; // storage blocked: this visit is not ranked
  }
}

export type Team = 'green' | 'red';
export type Unit = { id: number; name: string; team: Team; x: number; y: number; tx: number; ty: number; aim: number; hp: number; prot: boolean; seen: boolean; flash: number; walk: number; gren: number; ammo: number; reload: number; arty: number; cls: number; healing: boolean; tent: number; next: number; kit: number; bot: boolean; kills: number; deaths: number; say: string; sayUntil: number; stamina: number; winded: boolean; scoped: boolean; rockets: number; bazooka: boolean; sidearm: boolean; elev: boolean; blind: number; spec: number; specCd: number; shield: number; heat: number; shieldHp: number; vx: number; vy: number; snapAt: number; rw: number; rwN: number; ctl: number; ctlLeft: number; streak: number; jug: number };
export type ClassId = 'rifleman' | 'smg' | 'medic' | 'sniper' | 'shotgunner' | 'squad';
export const CLASSES: { id: ClassId; label: string; mag: number; hp: number; sideMag?: number; special?: string; blurb: string }[] = [
  { id: 'rifleman', label: 'Assault', mag: 15, hp: 100, special: 'Smoke grenade', blurb: 'All-rounder. 15-round AR, 3 hits kill. It kicks on full auto, so fire in bursts. Smoke hides your push from the enemy.' },
  { id: 'smg', label: 'SMG', mag: 20, hp: 100, special: 'Flashbang', blurb: 'Fast and close. 20 rounds, 5 hits kill, short reach. Flashbang blinds enemies for 2 seconds.' },
  { id: 'medic', label: 'Medic', mag: 16, hp: 100, special: 'Air drop flare', blurb: 'Heals teammates next to you. 16-round SMG, a little weaker than the SMG class. The flare calls a medical crate that heals your side for 10 seconds.' },
  { id: 'sniper', label: 'Sniper', mag: 5, hp: 100, sideMag: 8, special: 'Tower', blurb: 'One shot, one kill, through light cover. Right-click to scope, but every shot reveals you. Build a tower to shoot over cover. 8-round pistol.' },
  { id: 'shotgunner', label: 'Shotgunner', mag: 5, hp: 140, sideMag: 12, special: 'Riot shield', blurb: 'Tough brawler, 140 HP. Deadly up close, weak at range. The riot shield stops fire from the front: 5 seconds, 200 damage.' },
  { id: 'squad', label: 'Squad Leader', mag: 15, hp: 100, sideMag: 10, special: 'UAV', blurb: 'AR, pistol, 2 grenades and artillery. The UAV lifts the fog at your cursor for 10 seconds, 60 second recharge.' },
];
export type RoundInfo = { n: number; e: number; s: 'live' | 'ended'; l: number; w: string | null; mp: string; mr: number; mt: number; nx: string }; // mp: map id, mr/mt: round on this map of how many, nx: the next map's id once this map's last round is over
export type FeedLine = { self: boolean; tk: boolean; weapon: string; text: string; kteam: Team; vteam: Team; at: number; killer: string; victim: string };
export type Score = { id: number; name: string; team: Team; k: number; d: number; mk: number; h: number }; // mk: kills this map, h: HP healed this map
export type World = {
  me: number;
  units: Map<number, Unit>;
  bullets: [number, number][];
  nades: [number, number, number, number][]; // x, y, and how much of the flight is left (0 = on the ground)
  gas: [number, number, number, number][]; // incoming artillery: x, y, 0, fraction of the flight left
  booms: { x: number; y: number; at: number; big?: boolean }[];
  mapId: string; // which map the server is playing
  corpses: { x: number; y: number; aim: number; team: Team; cls: number; at: number; seed: number }[]; // where soldiers fell, kept on the ground for a minute
  callouts: { id: number; name: string; team: Team; n: number; at: number }[]; // kill-streak announcements, newest last
  pops: { x: number; y: number; at: number; kind: string }[]; // smoke / flash / flare canisters going off
  crates: number[]; // 1 = ready to use, in the same order as the crates in the map file
  progress: number;
  crane: number[]; // the crane: state (0 none, 1 container coming, 2 container standing), x, y, tenths of a second to the drop (or seconds it still stands)
  train: number[]; // the train: state (0 none, 1 warning, 2 running), track, way (1 east, -1 west), head x, seconds to arrival
  zone: number[]; // the live scoring zone: x, y, radius, seconds until it moves (0 = it stays), next x, next y
  points: [number, number]; // round points, green and red (first to 100 wins the round)
  round: RoundInfo;
  score: [number, number, number, number]; // green kills, red kills this round, green wins, red wins
  cam: { x: number; y: number };
  vision: number; // fog of war: how far your side sees from each living soldier
  scopeVision: number; // ... and how far a scoped sniper sees along his beam
  scopeHalf: number; // half the width of that beam, in radians
  clouds: number[][]; // smoke: x, y, radius, fraction left, team
  drops: number[][]; // air drops: x, y, 1 once landed, fraction left, fraction of the fall left
  ping: number; // round trip to the server in ms (measured every 2 s)
  ms: number[][]; // missiles and helicopters being flown: kind (0 attack drone, 1 helicopter), x, y, heading, pilot id, team (0 green, 1 red)
  uavAreas: number[][]; // where your UAV has lifted the fog: x, y, radius, fraction of time left
  uav: [number, number]; // tenths of a second left on your UAV and the enemy's
  towers: number[][]; // sniper towers: [team (0 green, 1 red), owner id, x, y, 1 if someone is on it]
  rockets: [number, number, number][]; // x, y, heading
  pickups: [number, number, number][]; // bazooka crates: x, y, 1 if your side already holds a bazooka (so it cannot take this one)
};
export type Input = { streak: number; special: number; sprint: boolean; dx: number; dy: number; aim: number; fire: boolean; nade: number; range: number; reload: number; arty: number; scope: boolean; swap: number; nest: number; dismantle: boolean }; // `nest` is the tower counter (the sniper's C key): a sniper builds, climbs or leaves his tower
export type Status = 'idle' | 'signing' | 'connecting' | 'playing' | 'error';
export type ChatLine = { name: string; team: Team; text: string; at: number; mode?: 'all' | 'team' };
export type Hud = { myReward: number; myRewardN: number; myCtl: number; myCtlLeft: number; myStreak: number; myJug: number; myShieldHp: number; mySpec: number; mySpecCd: number; myShield: number; myHeat: number; myBlind: number; uavMine: number; uavEnemy: number; chat: ChatLine[]; score: [number, number, number, number]; round: RoundInfo; progress: number; train: number[]; crane: number[]; points: [number, number]; green: number; red: number; myHp: number; myGren: number; myAmmo: number; myTent: number; myKit: number; myStamina: number; myWinded: boolean; myKills: number; myDeaths: number; training: boolean; myNext: string; myClassId: ClassId; myMag: number; myClass: string; myReload: number; myArty: number; myRockets: number; myBazooka: boolean; myTowerUp: boolean; myTowerProg: number; myElev: boolean; myNearTower: boolean; mySidearm: boolean; myTeam: Team | null; feed: FeedLine[]; board: Score[] };

const newUnit = (id: number, name: string, team: Team, bot = false): Unit => ({ id, name, team, x: 0, y: 0, tx: 0, ty: 0, aim: 0, hp: 100, prot: false, seen: false, flash: 0, walk: 0, gren: 2, ammo: 8, reload: 0, arty: 1, cls: 0, healing: false, tent: 0, next: -1, kit: 100, bot, kills: 0, deaths: 0, say: '', sayUntil: 0, stamina: 100, winded: false, scoped: false, rockets: 0, bazooka: false, sidearm: false, elev: false, blind: 0, spec: 0, specCd: 0, shield: 0, heat: 0, shieldHp: 0, vx: 0, vy: 0, snapAt: 0, rw: 0, rwN: 0, ctl: 0, ctlLeft: 0, streak: 0, jug: 0 });
const emptyWorld = (): World => ({ me: 0, units: new Map(), bullets: [], nades: [], mapId: 'city', gas: [], booms: [], corpses: [], callouts: [], pops: [], crates: [], progress: 0, crane: [0, 0, 0, 0], train: [0, 0, 0, 0, 0], zone: [0, 0, 0, 0, 0, 0], points: [0, 0], round: { n: 1, e: 0, s: 'live', l: 0, w: null, mp: 'city', mr: 1, mt: 3, nx: '' }, score: [0, 0, 0, 0], cam: { x: 0, y: 0 }, vision: 420, scopeVision: 1000, scopeHalf: 0.3, rockets: [], pickups: [], towers: [], clouds: [], drops: [], uav: [0, 0], uavAreas: [], ms: [], ping: 0 });
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** Owns the socket. The canvas reads `world` and writes `input` through refs, so 60 fps drawing never re-renders React. */
export function useGame() {
  const wallet = useWallet();
  const [status, setStatusState] = useState<Status>('idle');
  const statusRef = useRef<Status>('idle');
  const [error, setError] = useState('');
  const [hud, setHud] = useState<Hud | null>(null);
  const world = useRef<World>(emptyWorld());
  const input = useRef<Input>({ streak: 0, special: 0, sprint: false, dx: 0, dy: 0, aim: 0, fire: false, nade: 0, range: 200, reload: 0, arty: 0, scope: false, swap: 0, nest: 0, dismantle: false });
  const ws = useRef<WebSocket | null>(null);
  const sendRaw = useCallback((msg: object) => {
    if (ws.current?.readyState === 1) ws.current.send(JSON.stringify(msg));
  }, []);
  const voice = useVoice(sendRaw);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const training = useRef(false);
  const chat = useRef<ChatLine[]>([]);
  const feed = useRef<FeedLine[]>([]);
  const board = useRef<Score[]>([]);

  const setStatus = useCallback((s: Status) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  const leave = useCallback(() => {
    voiceRef.current.leave(false);
    statusRef.current = 'idle';
    ws.current?.close();
    ws.current = null;
    world.current = emptyWorld();
    feed.current = [];
    chat.current = [];
    board.current = [];
    setHud(null);
    setStatus('idle');
  }, [setStatus]);

  useEffect(() => () => ws.current?.close(), []);

  // While playing: send our controls 30 times a second, and refresh the on-screen numbers 4 times a second.
  useEffect(() => {
    if (status !== 'playing') return;
    const send = setInterval(() => {
      if (ws.current?.readyState === 1) ws.current.send(JSON.stringify({ t: 'in', ...input.current }));
    }, 33);
    const pinger = setInterval(() => {
      if (ws.current?.readyState === 1) ws.current.send(JSON.stringify({ t: 'ping', n: performance.now() }));
    }, 2000);
    const refresh = setInterval(() => {
      const w = world.current;
      const units = [...w.units.values()];
      const me = w.units.get(w.me);
      const now = Date.now();
      feed.current = feed.current.filter((f) => now - f.at < 6000);
      setHud({
        round: w.round,
        progress: w.progress,
        points: w.points,
        train: w.train,
        crane: w.crane,
        green: units.filter((u) => u.team === 'green').length,
        red: units.filter((u) => u.team === 'red').length,
        myHp: me?.hp ?? 0,
        myGren: me?.gren ?? 0,
        myAmmo: me?.ammo ?? 0,
        myTent: me?.tent ?? 0,
        myKit: me?.kit ?? 0,
        chat: chat.current.filter((c) => Date.now() - c.at < 9000),
        score: w.score,
        myStamina: me?.stamina ?? 100,
        myWinded: me?.winded ?? false,
        myKills: me?.kills ?? 0,
        myDeaths: me?.deaths ?? 0,
        training: training.current,
        myNext: me && me.next >= 0 ? CLASSES[me.next].label : '',
        myClassId: CLASSES[me?.cls ?? 0].id,
        myMag: me?.sidearm ? CLASSES[me.cls].sideMag ?? CLASSES[me.cls].mag : CLASSES[me?.cls ?? 0].mag,
        mySidearm: me?.sidearm ?? false,
        myClass: CLASSES[me?.cls ?? 0].label,
        myReload: me?.reload ?? 0,
        myArty: me?.arty ?? 0,
        myRockets: me?.rockets ?? 0,
        myBazooka: me?.bazooka ?? false,
        myTowerUp: w.towers.some((t) => t[1] === w.me),
        myTowerProg: w.towers.find((t) => t[1] === w.me)?.[5] ?? 0,
        myElev: me?.elev ?? false,
        mySpec: me?.spec ?? 0,
        mySpecCd: me?.specCd ?? 0,
        myShield: me?.shield ?? 0,
        myShieldHp: me?.shieldHp ?? 0,
        myJug: me?.jug ?? 0,
        myReward: me?.rw ?? 0,
        myRewardN: me?.rwN ?? 0,
        myCtl: me?.ctl ?? 0,
        myCtlLeft: me?.ctlLeft ?? 0,
        myStreak: me?.streak ?? 0,
        myHeat: me?.heat ?? 0,
        myBlind: me?.blind ?? 0,
        uavMine: w.uav[0],
        uavEnemy: w.uav[1],
        myNearTower: !!me && w.towers.some((t) => t[0] === (me.team === 'green' ? 0 : 1) && (t[4] === 0 || me.elev) && Math.hypot(t[2] - me.x, t[3] - me.y) <= 70),
        myTeam: me?.team ?? null,
        feed: [...feed.current],
        board: board.current,
      });
    }, 250);
    return () => {
      clearInterval(send);
      clearInterval(pinger);
      clearInterval(refresh);
    };
  }, [status]);

  const join = useCallback(
    async (team: Team | 'random', name: string, useWalletLogin: boolean, cls: ClassId = 'rifleman') => {
      setError('');
      try {
        let auth: { wallet: string; nonce: string; sig: string } | null = null;
        if (WALLET_LOGIN && useWalletLogin) {
          if (!wallet.publicKey || !wallet.signMessage) throw new Error('This wallet cannot sign messages. Try Phantom or Solflare.');
          setStatus('signing');
          const { nonce, message } = await (await fetch('/api/nonce')).json();
          const sig = await wallet.signMessage(new TextEncoder().encode(message));
          auth = { wallet: wallet.publicKey.toBase58(), nonce, sig: b64(sig) };
        }
        setStatus('connecting');
        const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
        ws.current = sock;
        sock.onopen = () => sock.send(JSON.stringify({ t: 'join', team, name, cls, ...(auth ?? { guest: guestId() }) }));
        sock.onmessage = (ev) => {
          let m;
          try {
            m = JSON.parse(ev.data);
          } catch {
            return;
          }
          if (voiceRef.current.handle(m)) return; // voice chat setup messages
          const w = world.current;
          if (m.t === 'welcome') {
            w.me = m.id;
            if (m.map) w.mapId = m.map;
            training.current = !!m.training;
            for (const p of m.players) w.units.set(p.id, newUnit(p.id, p.name, p.team, !!p.bot));
            board.current = m.sb ?? [];
            setStatus('playing');
          } else if (m.t === 'pong') {
            world.current.ping = Math.round(performance.now() - Number(m.n));
          } else if (m.t === 'chat') {
            if (voiceRef.current.isMuted(m.id)) return; // you muted this player
            chat.current = [...chat.current.slice(-7), { name: m.name, team: m.team, text: m.text, at: Date.now(), mode: m.mode }];
            const u = w.units.get(m.id);
            if (u) {
              u.say = m.text;
              u.sayUntil = Date.now() + 4000;
            }
          } else if (m.t === 'team') {
            const u = w.units.get(m.id);
            if (u) u.team = m.team;
          } else if (m.t === 'join') {
            w.units.set(m.id, newUnit(m.id, m.name, m.team, !!m.bot));
          } else if (m.t === 'leave') {
            w.units.delete(m.id);
          } else if (m.t === 's') {
            const inSight = new Set<number>();
            for (const [id, x, y, aim, hp, prot, gren, ammo, reload, arty, ci, heal, tent, next, kit, kills, deaths, stamina, winded, scoped, rockets, weap, elev, blind, spec, specCd, shield, heat, shieldHp, rw, rwN, ctl, ctlLeft, streak, jug] of m.p as number[][]) {
              const u = w.units.get(id);
              if (!u) continue;
              inSight.add(id);
              if (!u.seen || Math.hypot(x - u.tx, y - u.ty) > 120) {
                u.x = x; // first sighting or a respawn: appear in place instead of gliding across the map
                u.y = y;
                u.seen = true;
              }
              {
                // How fast is he moving? (from the last two updates; used to keep him gliding on if one is late)
                const nowMs = performance.now();
                const gap = (nowMs - u.snapAt) / 1000;
                const jump = Math.hypot(x - u.tx, y - u.ty);
                if (u.snapAt && gap > 0.02 && gap < 0.6 && jump < 100 && hp > 0) {
                  u.vx = u.vx * 0.4 + ((x - u.tx) / gap) * 0.6;
                  u.vy = u.vy * 0.4 + ((y - u.ty) / gap) * 0.6;
                } else {
                  u.vx = u.vy = 0;
                }
                u.snapAt = nowMs;
              }
              u.tx = x;
              u.ty = y;
              u.aim = aim;
              if (u.hp > 0 && hp <= 0 && u.seen) {
                // he just fell where we can see: leave a body on the ground (the renderer keeps it for a minute, then fades it)
                w.corpses.push({ x, y, aim, team: u.team, cls: u.cls, at: Date.now(), seed: (id * 9301 + Math.floor(x) * 49297 + Math.floor(y) * 233) % 233280 });
                if (w.corpses.length > 120) w.corpses.shift();
              }
              u.hp = hp;
              u.prot = prot === 1;
              u.gren = gren;
              u.ammo = ammo;
              if (u.reload === 0 && reload > 0 && u.hp > 0) {
                const me2 = w.units.get(w.me);
                playReload(me2 ? Math.hypot(u.tx - me2.tx, u.ty - me2.ty) : 400, ci === 0 || ci === 3 || ci === 4 || ci === 5 ? 0 : 1, ci === 4 && weap !== 2);
              }
              u.reload = reload;
              u.arty = arty;
              u.cls = ci;
              u.healing = heal === 1;
              u.tent = tent;
              u.next = next;
              u.kit = kit;
              u.kills = kills;
              u.deaths = deaths;
              u.stamina = stamina;
              u.winded = winded === 1;
              u.scoped = scoped === 1;
              u.elev = elev === 1;
              u.blind = blind ?? 0;
              u.spec = spec ?? 0;
              u.specCd = specCd ?? 0;
              u.shield = shield ?? 0;
              u.heat = heat ?? 0;
              u.shieldHp = shieldHp ?? 0;
              u.rw = rw ?? 0;
              u.rwN = rwN ?? 0;
              u.ctl = ctl ?? 0;
              u.jug = jug ?? 0;
              u.ctlLeft = ctlLeft ?? 0;
              u.streak = streak ?? 0;
              u.rockets = rockets;
              u.bazooka = weap === 1;
              u.sidearm = weap === 2;
            }
            for (const u of w.units.values()) if (!inSight.has(u.id)) u.seen = false; // lost in the fog: stop drawing him
            w.vision = m.v ?? 420;
            w.scopeVision = m.sv ?? 1000;
            w.scopeHalf = m.sh ?? 0.3;
            w.rockets = m.rk ?? [];
            w.pickups = m.u ?? [];
            w.towers = m.tw ?? [];
            w.clouds = m.cl ?? [];
            w.drops = m.dr ?? [];
            w.uav = m.uv ?? [0, 0];
            w.uavAreas = m.ua ?? [];
            w.ms = m.ms ?? [];
            // Gunfire: flash the shooter's muzzle and play a quiet shot, fainter the farther it is from you.
            const me = w.units.get(w.me);
            // Where we are listening from: our own helicopter's camera while we fly one, otherwise our soldier.
            const mine = w.ms.find((h) => h[4] === w.me);
            const ear = mine ? { x: mine[1], y: mine[2] } : me ? { x: me.tx, y: me.ty } : null;
            let heliD: number | null = null;
            for (const h of w.ms) if (h[0] === 1 && ear) heliD = Math.min(heliD ?? 1e9, Math.hypot(h[1] - ear.x, h[2] - ear.y));
            heliRotor(heliD);
            for (const [sx, sy, sid, air] of (m.f ?? []) as [number, number, number, number?][]) {
              if (air) { heliGun(ear ? Math.hypot(sx - ear.x, sy - ear.y) : 600); continue; }
              const shooter = w.units.get(sid);
              if (shooter) shooter.flash = Date.now() + 90;
              if (shooter && shooter.jug > 0) heliGun(ear ? Math.hypot(sx - ear.x, sy - ear.y) : 600);
              else playShot(me ? Math.hypot(sx - me.tx, sy - me.ty) : 600, shooter?.cls ?? 0, shooter?.sidearm ?? false);
            }
            w.bullets = m.b;
            w.nades = m.g ?? [];
            w.gas = m.a ?? [];
            w.crates = m.k ?? [];
            w.progress = m.c;
            w.points = m.pt ?? [0, 0];
            if (m.hz) w.zone = m.hz;
            {
              const tr: number[] = m.tr ?? [0, 0, 0, 0, 0];
              if (tr[0] === 1 && w.train[0] !== 1) playTrainHorn();
              if (tr[0] === 2 && w.train[0] !== 2) playTrainPass();
              w.train = tr;
            }
            w.crane = m.cr ?? [0, 0, 0, 0];
            if (m.r && (m.r.n !== w.round.n || m.r.e !== w.round.e)) w.corpses = []; // a new round (or an admin restart) wipes the field
            if (m.r?.mp && m.r.mp !== w.mapId) w.mapId = m.r.mp; // the series moved to the next map
            w.round = m.r;
            w.score = m.ts ?? [0, 0, 0, 0];
          } else if (m.t === 'kill') {
            feed.current = [...feed.current.slice(-4), { text: '', kteam: m.kteam, vteam: m.vteam, killer: m.killer, victim: m.victim, weapon: m.weapon ?? 'rifle', self: !!m.self, tk: !!m.tk, at: Date.now() }];
          } else if (m.t === 'streak') {
            w.callouts = [...w.callouts.filter((c) => Date.now() - c.at < 5000).slice(-2), { id: m.id, name: m.name, team: m.team, n: m.n, at: Date.now() }];
            playStreak(m.n, m.id === w.me);
          } else if (m.t === 'boom') {
            w.booms.push({ x: m.x, y: m.y, at: Date.now(), big: !!m.big });
            const me = w.units.get(w.me);
            playBoom(me ? Math.hypot(m.x - me.tx, m.y - me.ty) : 600, !!m.big);
          } else if (m.t === 'pop') {
            w.pops.push({ x: m.x, y: m.y, at: Date.now(), kind: m.kind ?? '' });
            const me = w.units.get(w.me);
            playPop(me ? Math.hypot(m.x - me.tx, m.y - me.ty) : 600);
          } else if (m.t === 'arty') {
            // the gun fires now; the shell whistles in over the last second and a half
            const me = w.units.get(w.me);
            const near = (x: number, y: number) => (me ? Math.hypot(x - me.tx, y - me.ty) : 800);
            if (!m.late) playCannon(near(m.fx, m.fy)); // (the enemy never hears the gun, only the last of the shell)
            const wait = Math.max(0, m.delay - 1.6);
            window.setTimeout(() => playWhistle(near(m.x, m.y), Math.min(1.6, m.delay)), wait * 1000);
          } else if (m.t === 'got') {
            if (m.id === w.me) playPickup();
          } else if (m.t === 'rocket') {
            const me = w.units.get(w.me);
            playBoom(me ? Math.hypot(m.x - me.tx, m.y - me.ty) + 250 : 800, false); // the launch: a dull thump
          } else if (m.t === 'crate') {
            if (m.who === w.me) playPickup();
          } else if (m.t === 'sb') {
            board.current = m.rows;
          } else if (m.t === 'err') {
            setError(m.msg);
            if (statusRef.current !== 'playing') {
              sock.close();
              setStatus('error');
            }
          }
        };
        sock.onclose = (ev) => {
          voiceRef.current.leave(false);
          const before = statusRef.current;
          ws.current = null;
          world.current = emptyWorld();
          setHud(null);
          if (before === 'idle' || before === 'error') return; // we left on purpose, or already showed the reason
          if (ev.code === 4000) setError('You signed in somewhere else.');
          else if (ev.code === 4002) setError('You were removed for being idle for over a minute. Join again when you are ready.');
          else if (ev.code === 4451) setError('Not available in your region.');
          else if (ev.code === 1013) setError('Too many connections from your network.');
          else setError(before === 'playing' ? 'Disconnected from the battle.' : 'Could not connect.');
          setStatus('error');
        };
      } catch (e) {
        setError(e instanceof Error && /reject|denied/i.test(e.message) ? 'Sign-in cancelled.' : e instanceof Error ? e.message : 'Could not join.');
        setStatus('error');
      }
    },
    [wallet, setStatus],
  );

  const say = useCallback((n: number) => {
    if (ws.current?.readyState === 1) ws.current.send(JSON.stringify({ t: 'say', n }));
  }, []);

  const sendChat = useCallback((text: string, mode: 'all' | 'team') => {
    if (ws.current?.readyState === 1) ws.current.send(JSON.stringify({ t: 'chat', text, mode }));
  }, []);

  const addBot = useCallback(() => {
    if (ws.current?.readyState === 1) ws.current.send(JSON.stringify({ t: 'dummy' }));
  }, []);

  const setClass = useCallback((cls: ClassId) => {
    if (ws.current?.readyState === 1) ws.current.send(JSON.stringify({ t: 'class', cls }));
  }, []);

  return { status, error, hud, world, input, join, leave, setClass, addBot, sendChat, say, voice };
}
