import { useEffect, useState } from 'react';
import { WALLET_LOGIN } from '../config';

type Row = { rank: number; name: string; k: number; d: number; kd: number; r: number; w: number };

// Top soldiers, from the saved stats of players who signed in with a wallet.
export default function Leaderboard() {
  const [sort, setSort] = useState<'kills' | 'wins'>('kills');
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/leaderboard?sort=${sort}&limit=10`)
        .then((r) => r.json())
        .then((d) => alive && setRows(d.rows ?? []))
        .catch(() => alive && setRows([]));
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [sort]);

  return (
    <section className="leaderboard" aria-label="Leaderboard">
      <div className="lb-head">
        <h2>Top soldiers</h2>
        <div className="lb-tabs" role="group" aria-label="Sort by">
          <button type="button" className={sort === 'kills' ? 'on' : ''} aria-pressed={sort === 'kills'} onClick={() => setSort('kills')}>Most kills</button>
          <button type="button" className={sort === 'wins' ? 'on' : ''} aria-pressed={sort === 'wins'} onClick={() => setSort('wins')}>Round wins</button>
        </div>
      </div>
      {rows && rows.length > 0 ? (
        <table>
          <thead>
            <tr><th>#</th><th>Soldier</th><th>Kills</th><th>Deaths</th><th>K/D</th><th>Rounds</th><th>Wins</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rank + r.name}>
                <td>{r.rank}</td>
                <td className="mono">{r.name}</td>
                <td>{r.k}</td>
                <td>{r.d}</td>
                <td>{r.kd}</td>
                <td>{r.r}</td>
                <td>{r.w}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted small">{rows ? 'No scores yet. Be the first on the board.' : 'Loading…'}</p>
      )}
      <p className="muted small">{WALLET_LOGIN ? 'Sign in with your wallet (free, no transaction) to save your stats here. Guests are not ranked.' : 'Only players who sign in with a wallet are ranked.'}</p>
    </section>
  );
}
