import { useEffect } from 'react';
import { CLASSES } from '../game/useGame';
import { unlockAudio } from '../game/audio';

const art = new URL('../assets/splash-art.svg', import.meta.url).href;

const KEYS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Aim'],
  ['Click / Space', 'Fire'],
  ['Shift / Right-click', 'Sprint'],
  ['R', 'Reload'],
  ['G', 'Grenade (2 per life)'],
  ['T', 'Artillery strike (1 per life)'],
  ['Q / Mouse wheel', 'Swap to the bazooka (when you have one)'],
  ['Right-click (Sniper)', 'Scope'],
  ['Enter', 'Chat (Tab: all/team)'],
  ['N', 'Team quick chat'],
  ['F', 'Full screen'],
  ['Tab (hold)', 'Scoreboard'],
];

const OBJECTIVES = [
  'Hold the plaza in the middle of the ruined city. Stand in the circle with no enemy inside it and the bar fills for your side.',
  'Fill the bar all the way to win the round. If the 6 minute clock runs out first, whoever is ahead on the bar wins.',
  'Use cover: walls, wrecked cars, barriers and rubble all stop bullets. Grenades fly over cover, and blasts hurt your own side too. Each side has a bazooka crate near its base: grab it for two rockets.',
  'Heal at your clinic tent or from a Medic, and restock at your crates. You respawn 4 seconds after you fall.',
  'Your base is a safe zone (the shaded strip): nobody can hurt you there and the enemy cannot enter, but you cannot fire from inside it either.',
];

// The first screen: artwork, a short briefing in three steps, and one big button to enter.
export default function Splash({ onEnter }: { onEnter: () => void }) {
  const enter = () => {
    unlockAudio(); // a click, so the browser allows sound from here on
    onEnter();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') enter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="splash">
      <div className="splash-art" style={{ backgroundImage: `url(${art})` }}>
        <div className="splash-title">
          <p className="eyebrow">Browser multiplayer shooter</p>
          <h1>The Ruins</h1>
          <p className="splash-tag">Survivors versus Raiders. One plaza in the middle. Hold the block.</p>
        </div>
      </div>

      <div className="splash-brief">
        <section className="brief-card" aria-labelledby="b-keys">
          <span className="step">1</span>
          <h2 id="b-keys">Hot keys</h2>
          <dl>
            {KEYS.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <span className="chev" aria-hidden="true">›</span>
        <section className="brief-card wide" aria-labelledby="b-classes">
          <span className="step">2</span>
          <h2 id="b-classes">Classes</h2>
          <ul className="cols">
            {CLASSES.map((c) => (
              <li key={c.id}>
                <b>{c.label}</b>
                <span>{c.blurb}</span>
              </li>
            ))}
          </ul>
        </section>
        <span className="chev" aria-hidden="true">›</span>
        <section className="brief-card" aria-labelledby="b-obj">
          <span className="step">3</span>
          <h2 id="b-obj">Objectives</h2>
          <ul className="obj">
            {OBJECTIVES.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="splash-go">
        <button className="enter" onClick={enter} autoFocus>Enter Game</button>
        <p className="muted small">or press Enter</p>
      </div>
    </div>
  );
}
