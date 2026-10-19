import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import GameCanvas from '../game/GameCanvas';
import { CLASSES, useGame } from '../game/useGame';
import type { ClassId, Team } from '../game/useGame';
import { WALLET_LOGIN } from '../config';
import { isMuted, setMuted, unlockAudio } from '../game/audio';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Play() {
  const { connected } = useWallet();
  const game = useGame();
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('trenches-name') || '';
    } catch {
      return '';
    }
  });
  const [useWalletLogin, setUseWalletLogin] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [muted, setMutedState] = useState(isMuted());

  // Hold Tab to see the scoreboard.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        setShowBoard(true);
      }
    };
    const up = (e: KeyboardEvent) => e.key === 'Tab' && setShowBoard(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const [cls, setCls] = useState<ClassId>(() => {
    try {
      const c = localStorage.getItem('trenches-class');
      return c === 'smg' || c === 'medic' ? c : 'rifleman';
    } catch {
      return 'rifleman';
    }
  });
  const [pickOpen, setPickOpen] = useState(false);
  const start = (team: Team | 'random') => {
    unlockAudio(); // joining is a click, so the browser allows sound from here on
    try {
      localStorage.setItem('trenches-name', name.trim());
      localStorage.setItem('trenches-class', cls);
    } catch {
      /* private window: the name just is not remembered */
    }
    void game.join(team, name.trim(), useWalletLogin && connected, cls);
  };

  const busy = game.status === 'signing' || game.status === 'connecting';
  const h = game.hud;

  return (
    <div className="wrap">
      {game.status !== 'playing' && (
        <section className="hero">
          <p className="eyebrow">Multiplayer · Green vs Red</p>
          <h1>The Trenches</h1>
          <p className="lede">Two armies dig in on either side of no-man's land. Use the cover, hold the point in the middle, and keep your head down.</p>

          <div className="field">
            <label htmlFor="callsign">Callsign (optional)</label>
            <input id="callsign" className="in" value={name} maxLength={16} placeholder="Recruit" autoComplete="off" onChange={(e) => setName(e.target.value)} disabled={useWalletLogin && connected} />
          </div>

          {WALLET_LOGIN && (
            <div className="field">
              <WalletMultiButton />
              {connected && (
                <label className="check">
                  <input type="checkbox" checked={useWalletLogin} onChange={(e) => setUseWalletLogin(e.target.checked)} /> Sign in with this wallet (free, no transaction)
                </label>
              )}
            </div>
          )}

          <div className="field">
            <label>Class</label>
            <div className="classes" role="radiogroup" aria-label="Class">
              {CLASSES.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={cls === c.id} className={`class ${cls === c.id ? 'on' : ''}`} onClick={() => setCls(c.id)}>
                  <b>{c.label}</b>
                  <span>{c.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sides">
            <button className="side green" disabled={busy} onClick={() => start('green')}>Join Green</button>
            <button className="side random" disabled={busy} onClick={() => start('random')}>{busy ? (game.status === 'signing' ? 'Check your wallet…' : 'Connecting…') : 'Random side'}</button>
            <button className="side red" disabled={busy} onClick={() => start('red')}>Join Red</button>
          </div>
          <p className="muted small">If one side has more soldiers, you will be placed on the other to keep it fair.</p>
          {game.error && <p className="status" role="alert">{game.error}</p>}
          <p className="muted small">Move: W A S D · Aim: mouse · Fire: hold left button or space · reload takes 2 s (R reloads early) · Medics heal teammates next to them, and each side has a medic tent behind the point · Grenade: G (2 per life) · Gas strike: T (1 per life, lands at your cursor after 3 s, gas burns for 4 s) · Scoreboard: hold Tab</p>
        </section>
      )}

      {game.status === 'playing' && h && (
        <section className="stage">
          <div className="hud-top">
            <span className={`pill ${h.myTeam ?? ''}`}>You: {h.myTeam === 'green' ? 'Green' : 'Red'}</span>
            <div className="capbar" role="img" aria-label={`Capture point: ${Math.round(Math.abs(h.progress) * 100)}% ${h.progress >= 0 ? 'green' : 'red'}`}>
              <div className="mid" />
              {h.progress >= 0 ? <div className="fill green" style={{ left: '50%', width: `${h.progress * 50}%` }} /> : <div className="fill red" style={{ right: '50%', width: `${-h.progress * 50}%` }} />}
            </div>
            <span className="pill" title="R to reload">{h.myClass}{h.myNext ? ` → ${h.myNext} next life` : ''} · {h.myReload > 0 ? 'Reloading…' : `Ammo ${h.myAmmo}/${h.myMag}`}</span>
            {h.myClassId === 'medic' && (
              <span className="pill" title="Your medkit holds 100 HP of healing and refills at 4 HP per second">Medkit: {h.myKit}/100</span>
            )}
            <span className="pill" title="The medic tent heals you while you stand in it, then needs 30 s before it heals you again">Tent: {h.myTent < 0 ? 'healing…' : h.myTent === 0 ? 'ready' : `${h.myTent}s`}</span>
            <span className="pill" title="Your kills and deaths this session">K {h.myKills} · D {h.myDeaths}{h.myDeaths > 0 ? ` · ${(h.myKills / h.myDeaths).toFixed(2)}` : ''}</span>
            <span className="pill" title="Press G to throw">Grenades: {h.myGren} [G]</span>
            <span className="pill" title="Press T to call in a gas strike">Gas strike: {h.myArty} [T]</span>
            <span className="pill score" title={`Kills this round. Rounds won: Green ${h.score[2]}, Red ${h.score[3]}`}>
              <b className="green">{h.score[0]}</b> – <b className="red">{h.score[1]}</b>
              <small> · Round {h.round.n} · won {h.score[2]}–{h.score[3]}</small>
            </span>
            <span className="muted small">
              {h.green} v {h.red} · {fmt(h.round.l)}
            </span>
            <button
              className="btn"
              aria-pressed={muted}
              onClick={() => {
                setMuted(!muted);
                setMutedState(!muted);
              }}
            >
              {muted ? 'Sound off' : 'Sound on'}
            </button>
            {h.training && (
              <button className="btn" title="Adds a stationary teammate at 30 HP next to you, to try out medic healing" onClick={game.addBot}>
                Add wounded bot
              </button>
            )}
            <span className="classpick">
              <button className="btn" aria-expanded={pickOpen} onClick={() => setPickOpen(!pickOpen)}>
                Change class
              </button>
              {pickOpen && (
                <div className="classmenu" role="menu">
                  {CLASSES.map((c) => (
                    <button
                      key={c.id}
                      role="menuitem"
                      className={`class ${h.myClassId === c.id ? 'on' : ''}`}
                      onClick={() => {
                        game.setClass(c.id);
                        setCls(c.id);
                        setPickOpen(false);
                      }}
                    >
                      <b>{c.label}</b>
                      <span>{c.blurb}</span>
                    </button>
                  ))}
                  <p className="muted small">Switching works at once in your trench, otherwise on your next life.</p>
                </div>
              )}
            </span>
            <button className="btn" onClick={game.leave}>Leave</button>
          </div>

          <div className="canvas-wrap">
            <GameCanvas world={game.world} input={game.input} />
            <div className="feed" aria-live="polite">
              {h.feed.map((f, i) => (
                <p key={i}>
                  {f.self ? (
                    <>
                      <b className={f.kteam}>{f.killer}</b> {f.weapon === 'gas' ? 'gassed themselves' : 'blew themselves up'}
                    </>
                  ) : (
                    <>
                      <b className={f.kteam}>{f.killer}</b> {f.tk ? (f.weapon === 'gas' ? 'gassed teammate' : 'blew up teammate') : f.weapon === 'grenade' ? 'blew up' : f.weapon === 'gas' ? 'gassed' : 'eliminated'} <b className={f.vteam}>{f.victim}</b>
                    </>
                  )}
                </p>
              ))}
            </div>
            {h.myHp <= 0 && h.round.s === 'live' && <div className="overlay">Eliminated. Back in the trench shortly…</div>}
            {h.round.s === 'ended' && (
              <div className="overlay big">
                {h.round.w === 'draw' ? 'Draw' : `${h.round.w === 'green' ? 'Green' : 'Red'} holds the point`}
                <small>Next round in {h.round.l}s</small>
              </div>
            )}
            {showBoard && (
              <div className="board">
                <table>
                  <thead>
                    <tr><th>Soldier</th><th>K</th><th>D</th></tr>
                  </thead>
                  <tbody>
                    {h.board.map((r) => (
                      <tr key={r.id} className={r.team}>
                        <td>{r.name}</td>
                        <td>{r.k}</td>
                        <td>{r.d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {game.error && <p className="status" role="alert">{game.error}</p>}
        </section>
      )}
    </div>
  );
}
