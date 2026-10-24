import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import HudBar from '../game/HudBar';
import GameCanvas from '../game/GameCanvas';
import { CLASSES, useGame } from '../game/useGame';
import type { ClassId, Team } from '../game/useGame';
import { WALLET_LOGIN } from '../config';
import Leaderboard from './Leaderboard';
import { isMuted, setMuted, unlockAudio } from '../game/audio';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

type RosterRow = { name: string; cls: string; kills: number };
const CLS_LABEL: Record<string, string> = { rifleman: 'Assault', smg: 'SMG', medic: 'Medic', sniper: 'Sniper', shotgunner: 'Shotgunner', squad: 'Squad Leader' };

/** Who is in the match right now, refreshed every few seconds while you pick a side. */
function LobbyRoster() {
  const [r, setR] = useState<{ green: RosterRow[]; red: RosterRow[] } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/roster')
        .then((x) => (x.ok ? x.json() : null))
        .then((j) => alive && j && setR(j))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!r) return null;
  const col = (team: 'green' | 'red', label: string) => (
    <div className={`roster-col ${team}`}>
      <h3>{label} <span>{r[team].length}</span></h3>
      {r[team].length === 0 ? <p className="muted small">No one yet</p> : (
        <ul>
          {r[team].map((p, i) => (
            <li key={i}><b>{p.name}</b> <span className="muted small">{CLS_LABEL[p.cls] ?? p.cls}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <div className="roster" aria-label="Players online">
      {col('green', 'Green')}
      {col('red', 'Red')}
    </div>
  );
}

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
      return c === 'smg' || c === 'medic' || c === 'sniper' || c === 'shotgunner' || c === 'squad' ? c : 'rifleman';
    } catch {
      return 'rifleman';
    }
  });
  const [pickOpen, setPickOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const typingRef = useRef(false);
  typingRef.current = typing;
  const [chatMode, setChatMode] = useState<'all' | 'team'>('all');
  const [chatText, setChatText] = useState('');
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [showKeys, setShowKeys] = useState(true);
  const playing = game.status === 'playing';
  // Full screen: the battlefield, its overlays (feed, chat, score) and nothing else. F toggles it, Esc leaves it.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const toggleFull = () => {
    const el = wrapRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    try {
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        if (document.exitFullscreen) void document.exitFullscreen();
        else doc.webkitExitFullscreen?.();
      } else if (el?.requestFullscreen) void el.requestFullscreen();
      else el?.webkitRequestFullscreen?.();
    } catch {
      /* the browser refused (some phones cannot do full screen) */
    }
  };
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement || !!(document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);
  const sayRef = useRef(game.say);
  sayRef.current = game.say;
  // N opens the quick team chat; 1-5 sends a line; N or Esc closes it. Only while playing and not typing in a field.
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'enter' && !e.repeat) {
        e.preventDefault();
        setChatOpen(false);
        setChatText('');
        setTyping(true);
        setTimeout(() => chatInputRef.current?.focus(), 0);
      } else if (k === 'f' && !e.repeat) {
        toggleFull();
      } else if (k === 'n') {
        setChatOpen((o) => !o);
      } else if (k === 'escape') {
        setChatOpen(false);
      } else if (chatOpen && k >= '1' && k <= '5') {
        e.preventDefault();
        sayRef.current(Number(k));
        setChatOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, chatOpen]);
  // V is push-to-talk for team voice (only once you have chosen to join voice).
  const pushRef = useRef(game.voice.push);
  pushRef.current = game.voice.push;
  useEffect(() => {
    if (!playing) return;
    const field = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    };
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'v' && !e.repeat && !field(e)) pushRef.current(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'v') pushRef.current(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      pushRef.current(false);
    };
  }, [playing]);
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
    <div className={`wrap${game.status === 'playing' ? ' wide' : ''}`}>
      {game.status !== 'playing' && (
        <section className="hero">
          <p className="eyebrow">Multiplayer · Green vs Red</p>
          <h1>The Ruins</h1>
          <p className="lede">Two crews hold opposite ends of a ruined city. Use the buildings and wrecks for cover, hold the plaza in the middle, and stay out of the open.</p>

          <div className="top-row">
          <div className="field">
            <label htmlFor="callsign">Callsign (optional)</label>
            <input id="callsign" className="in" value={name} maxLength={16} placeholder="Recruit" autoComplete="off" onChange={(e) => setName(e.target.value)} disabled={useWalletLogin && connected} />
          </div>
          <LobbyRoster />
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

          <div className="field wide-field">
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
          <p className="muted small">Move: W A S D · Aim: mouse · Fire: hold left button or space · reload takes 2 s (R reloads early) · Medics heal teammates next to them, and each side has a clinic tent behind the plaza · Sniper: hold the right mouse button to scope · Your side's bazooka crate (gold marker on your minimap, near your base): walk over it for 2 rockets, one carrier at a time, and it reappears elsewhere on your side 30 s after it is taken (mouse wheel or Q cycles your weapons: rifle, pistol, bazooka) · Grenade: G (2 per life) · Artillery strike: T (1 per life, lands at your cursor after 3 s and bursts like a big grenade) · Scoreboard: hold Tab</p>
        </section>
      )}

      {game.status !== 'playing' && <Leaderboard />}

      {game.status === 'playing' && h && (
        <section className="stage">
          <div className="hud-top">
            <span className={`pill ${h.myTeam ?? ''}`}>You: {h.myTeam === 'green' ? 'Green' : 'Red'}</span>
            <div className="capbar points" role="img" aria-label={`Round points: green ${h.points[0]}, red ${h.points[1]}, first to 100 wins`} title="Hold the plaza alone to score: 1 point per second, more with extra soldiers inside. First to 100 wins the round.">
              <div className="fill green" style={{ left: 0, width: `${Math.min(100, h.points[0])}%` }} />
              <div className="fill red" style={{ right: 0, width: `${Math.min(100, h.points[1])}%` }} />
              <span className="pts"><b className="green">{h.points[0]}</b> / 100 / <b className="red">{h.points[1]}</b></span>
            </div>
            <span className="pill" title="Your kills and deaths this session">K {h.myKills} · D {h.myDeaths}{h.myDeaths > 0 ? ` · ${(h.myKills / h.myDeaths).toFixed(2)}` : ''}</span>
            {h.myNext && <span className="pill" title="Your class changes when you next respawn">{h.myClass} → {h.myNext} next life</span>}
            <span className="voice-ctl">
              {game.voice.on ? (
                <>
                  <button className="btn" onClick={() => game.voice.leave()} title="Leave your team's voice channel">Leave voice</button>
                  <label className="check small" title="Off: hold V to talk. On: your mic stays open.">
                    <input type="checkbox" checked={game.voice.openMic} onChange={(e) => game.voice.setOpenMic(e.target.checked)} /> Open mic
                  </label>
                  <span className={`pill mic ${game.voice.talking ? 'live' : ''}`}>{game.voice.talking ? 'Mic live' : 'Hold V to talk'}</span>
                </>
              ) : (
                <button className="btn" onClick={() => void game.voice.join()} title="Opt in to your team's voice channel (asks for your microphone)">Join voice</button>
              )}
            </span>
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
                  <p className="muted small">Switching works at once in your base, otherwise on your next life.</p>
                </div>
              )}
            </span>
            <button className="btn" onClick={toggleFull} title="Full screen (F). Esc to leave full screen.">{full ? 'Exit full screen' : 'Full screen'}</button>
            <button className="btn" onClick={game.leave}>Leave</button>
          </div>

          <div className="play-row">
          <div className="canvas-wrap" ref={wrapRef}>
            <GameCanvas world={game.world} input={game.input} typing={() => typingRef.current} />
            {typing && (
              <form
                className="chatbox"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = chatText.trim();
                  if (t) game.sendChat(t, chatMode);
                  setChatText('');
                  setTyping(false);
                }}
              >
                <span className={'chatmode ' + chatMode}>{chatMode === 'team' ? 'TEAM' : 'ALL'}</span>
                <input
                  ref={chatInputRef}
                  value={chatText}
                  maxLength={120}
                  placeholder="Enter to send · Tab switches All/Team · Esc cancels"
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Tab') { e.preventDefault(); setChatMode((m) => (m === 'all' ? 'team' : 'all')); }
                    else if (e.key === 'Escape') { setChatText(''); setTyping(false); }
                  }}
                  onKeyUp={(e) => e.stopPropagation()}
                  onBlur={() => setTyping(false)}
                />
              </form>
            )}
            {chatOpen && (
              <div className="quickchat" role="menu" aria-label="Team chat">
                <p className="muted small">Team chat · press a number</p>
                {['Cover me!', "I'll cover you!", 'Throw a grenade!', 'Call in artillery!', "Let's go for the CP!"].map((t, i) => (
                  <button key={t} role="menuitem" onClick={() => { game.say(i + 1); setChatOpen(false); }}>
                    <kbd>{i + 1}</kbd> {t}
                  </button>
                ))}
              </div>
            )}
            <HudBar h={h} />
            {game.voice.error && <p className="status voice-err" role="alert">{game.voice.error}</p>}
            {game.voice.on && game.voice.speaking.length > 0 && (
              <div className="voicebox" aria-live="polite">
                {game.voice.speaking.map((id) => (
                  <p key={id}>🎙 {id === -1 ? 'You' : game.world.current.units.get(id)?.name ?? 'Teammate'}</p>
                ))}
              </div>
            )}
            <div className="chatlog" aria-live="polite">
              {h.chat.map((c, i) => (
                <p key={i}>{c.mode && <i className={'tag ' + (c.mode === 'team' ? 'team' : 'all')}>{c.mode === 'team' ? 'TEAM' : 'ALL'}</i>} <b className={c.team}>{c.name}:</b> {c.text}</p>
              ))}
            </div>
            <div className="feed" aria-live="polite">
              {h.feed.map((f, i) => (
                <p key={i}>
                  {f.self ? (
                    <>
                      <b className={f.kteam}>{f.killer}</b> {f.weapon === 'artillery' ? 'shelled themselves' : 'blew themselves up'}
                    </>
                  ) : (
                    <>
                      <b className={f.kteam}>{f.killer}</b> {f.tk ? (f.weapon === 'artillery' ? 'shelled teammate' : 'blew up teammate') : f.weapon === 'grenade' || f.weapon === 'rocket' ? 'blew up' : f.weapon === 'artillery' ? 'shelled' : 'eliminated'} <b className={f.vteam}>{f.victim}</b>
                    </>
                  )}
                </p>
              ))}
            </div>
            {h.myHp <= 0 && h.round.s === 'live' && <div className="overlay">Eliminated. Back at your base shortly…</div>}
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
                    <tr><th>Soldier</th><th>K</th><th>D</th><th>Mute</th></tr>
                  </thead>
                  <tbody>
                    {h.board.map((r) => (
                      <tr key={r.id} className={r.team}>
                        <td>{r.name}</td>
                        <td>{r.k}</td>
                        <td>{r.d}</td>
                        <td>
                          {r.id !== game.world.current.me && (
                            <button
                              type="button"
                              className={`mute-btn${game.voice.mutedIds.includes(r.id) ? ' on' : ''}`}
                              title={game.voice.mutedIds.includes(r.id) ? 'Unmute: hear their voice and chat again' : 'Mute their voice and chat'}
                              onClick={() => game.voice.toggleMute(r.id)}
                            >
                              {game.voice.mutedIds.includes(r.id) ? '🔇' : '🔊'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <aside className="keys" aria-label="Controls">
              <button className="keys-toggle" onClick={() => setShowKeys(!showKeys)} aria-expanded={showKeys}>
                {showKeys ? 'Hide keys' : 'Keys'}
              </button>
              {showKeys && (
                <dl>
                  <dt>W A S D</dt><dd>Move</dd>
                  <dt>Mouse</dt><dd>Aim</dd>
                  <dt>Click / Space</dt><dd>Fire</dd>
                  <dt>Shift / Right-click</dt><dd>Sprint</dd>
                  <dt>R</dt><dd>Reload</dd>
                  <dt>G</dt><dd>Grenade</dd>
                  <dt>T</dt><dd>Artillery strike</dd>
                  <dt>C</dt><dd>Class special (smoke, flash, flare, shield, UAV)</dd>
                  <dt>E</dt><dd>Sniper: build / climb tower</dd>
                  <dt>B (hold)</dt><dd>Sniper: dismantle tower</dd>
                  <dt>F</dt><dd>Full screen</dd>
                  <dt>N</dt><dd>Team chat</dd>
                  <dt>V (hold)</dt><dd>Talk (after Join voice)</dd>
                  <dt>Tab (hold)</dt><dd>Scoreboard · click 🔊 to mute a player</dd>
                </dl>
              )}
            </aside>
          </div>
          {game.error && <p className="status" role="alert">{game.error}</p>}
        </section>
      )}
    </div>
  );
}
