import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WALLET_LOGIN } from '../config';
import { playBoom, playCannon, playPickup, playReload, playShot, playWhistle } from './audio';

export type Team = 'green' | 'red';
export type Unit = { id: number; name: string; team: Team; x: number; y: number; tx: number; ty: number; aim: number; hp: number; prot: boolean; seen: boolean; flash: number; walk: number; gren: number; ammo: number; reload: number; arty: number; cls: number; healing: boolean; tent: number; next: number; kit: number; bot: boolean; kills: number; deaths: number; say: string; sayUntil: number; stamina: number; winded: boolean; scoped: boolean; rockets: number; bazooka: boolean; sidearm: boolean };
export type ClassId = 'rifleman' | 'smg' | 'medic' | 'sniper' | 'shotgunner';
export const CLASSES: { id: ClassId; label: string; mag: number; hp: number; sideMag?: number; blurb: string }[] = [
  { id: 'rifleman', label: 'Rifleman', mag: 8, hp: 100, blurb: 'Scavenged bolt rifle. Two hits kill, it reaches farthest, but it fires slowly.' },
  { id: 'smg', label: 'SMG', mag: 20, hp: 100, blurb: 'Fast fire, 20 rounds. About five hits to kill, shorter reach.' },
  { id: 'medic', label: 'Medic', mag: 10, hp: 100, blurb: 'Pistol, 10 rounds. Heals teammates standing next to you.' },
  { id: 'sniper', label: 'Sniper', mag: 5, hp: 100, blurb: 'One hit kills. Hold the right mouse button to scope: you spot enemies for your team from far away, but you crawl, and each shot gives you away. Rounds punch through barricades and rubble. 5 rounds, no artillery strike, 2 per side.' },
  { id: 'shotgunner', label: 'Shotgunner', mag: 5, hp: 140, sideMag: 12, blurb: 'Tough: 140 HP. Shotgun with 5 shells, fires faster than the rifle but slower than the SMG, one blast kills up close, but damage drops off quickly with distance. Sprints 1.5x as long. Mouse wheel or Q swaps to your 12-round pistol.' },
];
export type RoundInfo = { n: number; s: 'live' | 'ended'; l: number; w: string | null };
export type FeedLine = { self: boolean; tk: boolean; weapon: string; text: string; kteam: Team; vteam: Team; at: number; killer: string; victim: string };
export type Score = { id: number; name: string; team: Team; k: number; d: number };
export type World = {
  me: number;
  units: Map<number, Unit>;
  bullets: [number, number][];
  nades: [number, number, number][]; // x, y, and how much of the flight is left (0 = on the ground)
  gas: [number, number, number, number][]; // incoming artillery: x, y, 0, fraction of the flight left
  booms: { x: number; y: number; at: number; big?: boolean }[];
  crates: number[]; // 1 = ready to use, in the same order as the crates in the map file
  progress: number;
  round: RoundInfo;
  score: [number, number, number, number]; // green kills, red kills this round, green wins, red wins
  cam: { x: number; y: number };
  vision: number; // fog of war: how far your side sees from each living soldier
  scopeVision: number; // ... and from a scoped sniper
  nests: number[][]; // deployed sniper nests: [team (0 green, 1 red), owner id, tx, ty, tx, ty ...]
  nestTiles: Set<string>; // the same tiles as 'tx,ty', for walking and drawing
  rockets: [number, number, number][]; // x, y, heading
  pickups: [number, number, number][]; // bazooka crates: x, y, 1 if your side already holds a bazooka (so it cannot take this one)
};
export type Input = { sprint: boolean; dx: number; dy: number; aim: number; fire: boolean; nade: number; range: number; reload: number; arty: number; scope: boolean; swap: number; nest: number };
export type Status = 'idle' | 'signing' | 'connecting' | 'playing' | 'error';
export type ChatLine = { name: string; team: Team; text: string; at: number; mode?: 'all' | 'team' };
export type Hud = { chat: ChatLine[]; score: [number, number, number, number]; round: RoundInfo; progress: number; green: number; red: number; myHp: number; myGren: number; myAmmo: number; myTent: number; myKit: number; myStamina: number; myWinded: boolean; myKills: number; myDeaths: number; training: boolean; myNext: string; myClassId: ClassId; myMag: number; myClass: string; myReload: number; myArty: number; myRockets: number; myBazooka: boolean; myNestUp: boolean; mySidearm: boolean; myTeam: Team | null; feed: FeedLine[]; board: Score[] };

const newUnit = (id: number, name: string, team: Team, bot = false): Unit => ({ id, name, team, x: 0, y: 0, tx: 0, ty: 0, aim: 0, hp: 100, prot: false, seen: false, flash: 0, walk: 0, gren: 2, ammo: 8, reload: 0, arty: 1, cls: 0, healing: false, tent: 0, next: -1, kit: 100, bot, kills: 0, deaths: 0, say: '', sayUntil: 0, stamina: 100, winded: false, scoped: false, rockets: 0, bazooka: false, sidearm: false });
const emptyWorld = (): World => ({ me: 0, units: new Map(), bullets: [], nades: [], gas: [], booms: [], crates: [], progress: 0, round: { n: 1, s: 'live', l: 0, w: null }, score: [0, 0, 0, 0], cam: { x: 0, y: 0 }, vision: 420, scopeVision: 680, rockets: [], pickups: [], nests: [], nestTiles: new Set() });
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** Owns the socket. The canvas reads `world` and writes `input` through refs, so 60 fps drawing never re-renders React. */
export function useGame() {
  const wallet = useWallet();
  const [status, setStatusState] = useState<Status>('idle');
  const statusRef = useRef<Status>('idle');
  const [error, setError] = useState('');
  const [hud, setHud] = useState<Hud | null>(null);
  const world = useRef<World>(emptyWorld());
  const input = useRef<Input>({ sprint: false, dx: 0, dy: 0, aim: 0, fire: false, nade: 0, range: 200, reload: 0, arty: 0, scope: false, swap: 0, nest: 0 });
  const ws = useRef<WebSocket | null>(null);
  const training = useRef(false);
  const chat = useRef<ChatLine[]>([]);
  const feed = useRef<FeedLine[]>([]);
  const board = useRef<Score[]>([]);

  const setStatus = useCallback((s: Status) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  const leave = useCallback(() => {
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
    const refresh = setInterval(() => {
      const w = world.current;
      const units = [...w.units.values()];
      const me = w.units.get(w.me);
      const now = Date.now();
      feed.current = feed.current.filter((f) => now - f.at < 6000);
      setHud({
        round: w.round,
        progress: w.progress,
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
        myNestUp: w.nests.some((n) => n[1] === w.me),
        myTeam: me?.team ?? null,
        feed: [...feed.current],
        board: board.current,
      });
    }, 250);
    return () => {
      clearInterval(send);
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
        sock.onopen = () => sock.send(JSON.stringify({ t: 'join', team, name, cls, ...(auth ?? {}) }));
        sock.onmessage = (ev) => {
          let m;
          try {
            m = JSON.parse(ev.data);
          } catch {
            return;
          }
          const w = world.current;
          if (m.t === 'welcome') {
            w.me = m.id;
            training.current = !!m.training;
            for (const p of m.players) w.units.set(p.id, newUnit(p.id, p.name, p.team, !!p.bot));
            board.current = m.sb ?? [];
            setStatus('playing');
          } else if (m.t === 'chat') {
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
            for (const [id, x, y, aim, hp, prot, gren, ammo, reload, arty, ci, heal, tent, next, kit, kills, deaths, stamina, winded, scoped, rockets, weap] of m.p as number[][]) {
              const u = w.units.get(id);
              if (!u) continue;
              inSight.add(id);
              if (!u.seen || Math.hypot(x - u.tx, y - u.ty) > 120) {
                u.x = x; // first sighting or a respawn: appear in place instead of gliding across the map
                u.y = y;
                u.seen = true;
              }
              u.tx = x;
              u.ty = y;
              u.aim = aim;
              u.hp = hp;
              u.prot = prot === 1;
              u.gren = gren;
              u.ammo = ammo;
              if (u.reload === 0 && reload > 0 && u.hp > 0) {
                const me2 = w.units.get(w.me);
                playReload(me2 ? Math.hypot(u.tx - me2.tx, u.ty - me2.ty) : 400, ci === 0 || ci === 3 || ci === 4 ? 0 : 1);
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
              u.rockets = rockets;
              u.bazooka = weap === 1;
              u.sidearm = weap === 2;
            }
            for (const u of w.units.values()) if (!inSight.has(u.id)) u.seen = false; // lost in the fog: stop drawing him
            w.vision = m.v ?? 420;
            w.scopeVision = m.sv ?? 680;
            w.rockets = m.rk ?? [];
            w.pickups = m.u ?? [];
            w.nests = m.nt ?? [];
            const nt = new Set<string>();
            for (const n of w.nests) for (let q = 2; q + 1 < n.length; q += 2) nt.add(`${n[q]},${n[q + 1]}`);
            w.nestTiles = nt;
            // Gunfire: flash the shooter's muzzle and play a quiet shot, fainter the farther it is from you.
            const me = w.units.get(w.me);
            for (const [sx, sy, sid] of (m.f ?? []) as [number, number, number][]) {
              const shooter = w.units.get(sid);
              if (shooter) shooter.flash = Date.now() + 90;
              playShot(me ? Math.hypot(sx - me.tx, sy - me.ty) : 600, shooter?.cls ?? 0);
            }
            w.bullets = m.b;
            w.nades = m.g ?? [];
            w.gas = m.a ?? [];
            w.crates = m.k ?? [];
            w.progress = m.c;
            w.round = m.r;
            w.score = m.ts ?? [0, 0, 0, 0];
          } else if (m.t === 'kill') {
            feed.current = [...feed.current.slice(-4), { text: '', kteam: m.kteam, vteam: m.vteam, killer: m.killer, victim: m.victim, weapon: m.weapon ?? 'rifle', self: !!m.self, tk: !!m.tk, at: Date.now() }];
          } else if (m.t === 'boom') {
            w.booms.push({ x: m.x, y: m.y, at: Date.now(), big: !!m.big });
            const me = w.units.get(w.me);
            playBoom(me ? Math.hypot(m.x - me.tx, m.y - me.ty) : 600, !!m.big);
          } else if (m.t === 'arty') {
            // the gun fires now; the shell whistles in over the last second and a half
            const me = w.units.get(w.me);
            const near = (x: number, y: number) => (me ? Math.hypot(x - me.tx, y - me.ty) : 800);
            playCannon(near(m.fx, m.fy));
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
          const before = statusRef.current;
          ws.current = null;
          world.current = emptyWorld();
          setHud(null);
          if (before === 'idle' || before === 'error') return; // we left on purpose, or already showed the reason
          if (ev.code === 4000) setError('You signed in somewhere else.');
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

  return { status, error, hud, world, input, join, leave, setClass, addBot, sendChat, say };
}
