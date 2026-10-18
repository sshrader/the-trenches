# The Trenches

A top-down multiplayer shooter that runs in the browser. Two armies, Green and Red, dig in on either side of no-man's land. Use cover, hold the capture point in the middle, stay alive.

- **Play:** pick a side (or random), move with W A S D, aim with the mouse, hold the left button (or space) to fire, press G to lob one of your 2 grenades to the cursor (it flies over cover; walls still shield the blast), hold Tab for the scoreboard.
- **Guests welcome:** a callsign is enough. Wallet sign-in (free message signature, no transaction) is built but hidden until you set `VITE_WALLET_LOGIN=1`.
- **Fair:** teams stay balanced, the map is a mirror image, and the server decides every shot.

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Simulation | `server/sim.mjs` | Movement, bullets, cover, damage, respawn, capture point, rounds. Pure logic with tests. All tuning numbers are at the top. |
| Network | `server/game.mjs` | WebSocket at `/ws`: join, input in, snapshots out (20 per second), kill feed, scoreboard. |
| Sign-in | `server/auth.mjs` | One-time nonce, the wallet signs it, the server verifies the signature. |
| Server | `server/index.mjs` | Serves the built site, `/api/nonce`, `/api/health`. |
| Map | `shared/map.json` | Made by `node scripts/make-map.mjs`. Edit that script to change the battlefield. |
| Client | `src/` | React lobby and HUD, canvas renderer in `src/game/`. |
| Parked | `scripts/` (coin), `docs/` | The Pawpad coin tooling. Nothing in the game uses it. |

## Run it

```
npm install
npm test             # simulation checks (plain Node, no browser needed)
npm run typecheck
npm run dev          # http://localhost:5173
```

Open two browser windows, join opposite sides, and walk toward the middle. This code was written without being compiled or run in a browser, so expect a few small fixes on the first try.

## Put it online (Railway)

Same setup as Pawpad: connect the repo, build `npm install && npm run build`, start `npm start`, health check `/api/health`, then add your domain. Set `TRUST_PROXY=1` and `HSTS=1`. No volume is needed yet because nothing is saved.

## Capacity

The server sends every soldier to every player 20 times a second. One small instance is fine for a few dozen players in one battle. For more, you need to send only what each player can see, and run several battles (rooms).

## Next

See `docs/PROJECT_NOTES.md`.
