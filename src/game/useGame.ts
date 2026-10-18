import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WALLET_LOGIN } from '../config';
import { playBoom, playCannon, playPickup, playShot, playWhistle } from './audio';

export type Team = 'green' | 'red';
export type Unit = { id: number; name: string; team: Team; x: number; y: number; tx: number; ty: number; aim: number; hp: number; prot: boolean; seen: boolean; flash: number; walk: number; gren: number; ammo: number; reload: number; arty: number };
export type RoundInfo = { n: number; s: 'live' | 'ended'; l: number; w: string | null };
export type FeedLine = { weapon: string; text: string; kteam: Team; vteam: Team; at: number; killer: string; victim: string };
export type Score = { id: number; name: string; team: Team; k: number; d: number };
export type World = {
  me: number;
  units: Map<number, Unit>;
  bullets: [number, number][];
  nades: [number, number, number][]; // x, y, and how much of the flight is left (0 = on the ground)
  gas: [number, number, number, number][]; // x, y, 0 incoming | 1 gas cloud, fraction of that phase left
  booms: { x: number; y: number; at: number; big?: boolean }[];
  crates: number[]; // 1 = ready to use, in the same order as the crates in the map file
  progress: number;
  round: RoundInfo;
  cam: { x: number; y: number };
};
export type Input = { dx: number; dy: number; aim: number; fire: boolean; nade: number; range: number; reload: number; arty: number };
export type Status = 'idle' | 'signing' | 'connecting' | 'playing' | 'error';
export type Hud = { round: RoundInfo; progress: number; green: number; red: number; myHp: number; myGren: number; myAmmo: number; myReload: number; myArty: number; myTeam: Team | null; feed: FeedLine[]; board: Score[] };

const newUnit = (id: number, name: string, team: Team): Unit => ({ id, name, team, x: 0, y: 0, tx: 0, ty: 0, aim: 0, hp: 100, prot: false, seen: false, flash: 0, walk: 0, gren: 2, ammo: 8, reload: 0, arty: 1 });
const emptyWorld = (): World => ({ me: 0, units: new Map(), bullets: [], nades: [], gas: [], booms: [], crates: [], progress: 0, round: { n: 1, s: 'live', l: 0, w: null }, cam: { x: 0, y: 0 } });
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** Owns the socket. The canvas reads `world` and writes `input` through refs, so 60 fps drawing never re-renders React. */
export function useGame() {
  const wallet = useWallet();
  const [status, setStatusState] = useState<Status>('idle');
  const statusRef = useRef<Status>('idle');
  const [error, setError] = useState('');
  const [hud, setHud] = useState<Hud | null>(null);
  const world = useRef<World>(emptyWorld());
  const input = useRef<Input>({ dx: 0, dy: 0, aim: 0, fire: false, nade: 0, range: 200, reload: 0, arty: 0 });
  const ws = useRef<WebSocket | null>(null);
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
    board.current = [];
    setHud(null);
    setStatus('idle');
  }, [setStatus]);

  useEffect(() => () => ws.current?.close(), []);

  // While playing: send our controls 20 times a second, and refresh the on-screen numbers 4 times a second.
  useEffect(() => {
    if (status !== 'playing') return;
    const send = setInterval(() => {
      if (ws.current?.readyState === 1) ws.current.send(JSON.stringify({ t: 'in', ...input.current }));
    }, 50);
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
        myReload: me?.reload ?? 0,
        myArty: me?.arty ?? 0,
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
    async (team: Team | 'random', name: string, useWalletLogin: boolean) => {
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
        sock.onopen = () => sock.send(JSON.stringify({ t: 'join', team, name, ...(auth ?? {}) }));
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
            for (const p of m.players) w.units.set(p.id, newUnit(p.id, p.name, p.team));
            board.current = m.sb ?? [];
            setStatus('playing');
          } else if (m.t === 'join') {
            w.units.set(m.id, newUnit(m.id, m.name, m.team));
          } else if (m.t === 'leave') {
            w.units.delete(m.id);
          } else if (m.t === 's') {
            for (const [id, x, y, aim, hp, prot, gren, ammo, reload, arty] of m.p as [number, number, number, number, number, number, number, number, number, number][]) {
              const u = w.units.get(id);
              if (!u) continue;
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
              u.reload = reload;
              u.arty = arty;
            }
            // Gunfire: flash the shooter's muzzle and play a quiet shot, fainter the farther it is from you.
            const me = w.units.get(w.me);
            for (const [sx, sy, sid] of (m.f ?? []) as [number, number, number][]) {
              const shooter = w.units.get(sid);
              if (shooter) shooter.flash = Date.now() + 90;
              playShot(me ? Math.hypot(sx - me.tx, sy - me.ty) : 600);
            }
            w.bullets = m.b;
            w.nades = m.g ?? [];
            w.gas = m.a ?? [];
            w.crates = m.k ?? [];
            w.progress = m.c;
            w.round = m.r;
          } else if (m.t === 'kill') {
            feed.current = [...feed.current.slice(-4), { text: '', kteam: m.kteam, vteam: m.vteam, killer: m.killer, victim: m.victim, weapon: m.weapon ?? 'rifle', at: Date.now() }];
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

  return { status, error, hud, world, input, join, leave };
}
