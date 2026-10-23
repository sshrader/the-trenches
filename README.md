# The Ruins (repo: the-trenches)

A top-down multiplayer shooter that runs in the browser, set in a ruined city. Two crews, Green survivors and Red raiders, hold opposite ends of the map. Use the buildings, wrecks and barricades for cover, hold the plaza in the middle, stay alive. (The game used to be a WWI trench shooter; the name in the UI is just the `The Ruins` text in `App.tsx`, `Splash.tsx`, `Play.tsx` and `index.html`.)

- **Play:** pick a side (or random), move with W A S D, aim with the mouse, hold the left button (or space) to fire, press G to lob one of your 2 grenades to the cursor (it flies over cover; walls still shield the blast), hold Tab for the scoreboard. Pick a class in the lobby: **Rifleman** (8 rounds, two hits kill, longest reach, slow fire), **SMG** (20 rounds, fast fire, about five hits to kill, shorter reach) or **Medic** (10-round pistol, heals teammates standing next to them). Every reload takes 2 s (R reloads early). Each side also has a clinic tent behind the capture point that heals anyone near it (each soldier can use it once every 30 s; a "Tent" timer in the top bar shows the cooldown). Everyone has a health bar over their head. Hold Left Shift or the right mouse button to sprint (1.6x speed for about 2.5 s, then a short recovery; a "Sprint" bar in the top bar shows what is left). Press N for team-only quick chat (1 cover me, 2 I'll cover you, 3 throw a grenade, 4 call in artillery, 5 let's go for the CP); lines appear above the sender and in a small log for teammates only. A key legend sits on the right of the screen (it can be hidden). The top bar shows the team score (kills this round, green – red), the round number and rounds won, plus your own K/D. A medic's healing comes from a medkit of 100 HP that refills at 4 HP per second, so standing next to someone cannot keep them alive forever (the "Medkit" pill shows what is left). In dev, an "Add wounded bot" button spawns a stationary 30 HP teammate to test healing; it gets wounded again 3 s after being fully healed. Set TRAINING_BOT=0 to hide it. "Change class" in the top bar switches class without leaving (at once in your trench, otherwise on your next life). Teams are kept within one player of each other: new joiners go to the smaller side, and if players leave, a dead soldier on the bigger side is moved over (and teams are fully rebalanced between rounds). Press T for your one artillery strike per life: it lands at the cursor (same reach as a grenade) after 3 s and bursts like a big grenade (`CFG.ARTY_*`: kills within 55 px, hurts out to 130 px, hurts your own side too). The map is 120 x 68 tiles: a street grid with ruined buildings you can walk into, burnt-out cars, rubble and barricades (all solid cover). Regenerate it with `node scripts/make-map.mjs`. Each side has 3 resupply crates: walk onto your own side's crate to refill rifle, grenades and artillery strike (30 s to restock). The strike has a cannon shot, a falling-shell whistle and a big explosion.
- **Guests welcome:** a callsign is enough. Wallet sign-in (free message signature, no transaction) is optional and saves your stats: kills, deaths, rounds and wins, shown on the **Top soldiers** leaderboard in the lobby. Guests are not ranked. Set `VITE_WALLET_LOGIN=0` to hide sign-in. Stats are stored in `DATA_DIR/stats.json`, so on Railway add a volume and set `DATA_DIR=/data`.
- **Fair:** teams stay balanced, the map is a mirror image, and the server decides every shot.

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Simulation | `server/sim.mjs` | Movement, bullets, cover, damage, respawn, capture point, rounds. Pure logic with tests. All tuning numbers are at the top. |
| Network | `server/game.mjs` | WebSocket at `/ws`: join, input in, snapshots out (20 per second), kill feed, scoreboard. |
| Stats | `server/stats.mjs` | Saved kills, deaths, rounds and wins per signed-in wallet, and the leaderboard (`/api/leaderboard?sort=kills|wins`). Team kills, bots and repeat kills of the same victim within 10 s do not count. |
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

## Spawn protection

Each side's spawn trench plus a 32 px strip in front of it is a safe zone (`CFG.BASE_PAD`). Enemies cannot walk in, soldiers inside take no damage from bullets, grenades, rockets or artillery, and (with `CFG.BASE_NO_FIRE`) cannot shoot, throw or call a strike from inside. The shaded, dashed-edge strip on the map shows it.

## Fog of war

A side only sees enemies, bullets and blasts within `CFG.VISION` (420 px) of one of its living soldiers, and the server never sends anything outside that, so it cannot be cheated from the browser. Teammates are always visible. The client dims everything outside your side's sight. The camera is also zoomed out a little (`VIEW_W`/`VIEW_H` in `GameCanvas.tsx`).

## Chat
Press Enter to type a message to **everyone**; Tab inside the box switches to **team-only**; Enter sends, Esc cancels (game keys are paused while typing). Messages are limited to 120 characters and rate-limited server-side. N still opens the one-key team quick chat.

## Sniper class
Sniper rounds punch through light cover (barricades and rubble) but still stop at buildings, wrecks and the map edge, so a sniper can shoot through the clutter that blocks everyone else.


One-hit kill, 5 rounds, 3 s reload, slow fire (1.3 s), 1 grenade, no artillery strike, max 2 per side (`CFG.MAX_SNIPERS`). Hold the **right mouse button** to scope: the side's fog opens to `CFG.SCOPE_VISION` (680 px) around him, but he moves at 35% speed and cannot sprint. Each shot reveals him to the enemy through the fog for 1.6 s (`CFG.SNIPER_REVEAL_S`).

## Bazooka pickups

Each side has one bazooka crate in its own half, between 10 and 28 tiles from its base edge (`CFG.PICKUP_NEAR`). Only that side can take it, only that side sees it (a pulsing gold marker on its minimap, dimmed while one of its soldiers still holds a bazooka), and only one soldier per side can hold a bazooka at a time. When the crate is taken a new one appears at a different spot on the same side 30 s later (`CFG.PICKUP_RESPAWN_S`). Walk over it to get a bazooka with 2 rockets (`CFG.ROCKETS`): no reload, no resupply, lost when you fall. Mouse wheel or **Q** swaps between it and your main weapon. A rocket flies about 640 px, bursts on the first wall or soldier it touches, kills inside 62 px and hurts out to 125 px (it hurts your own side too).

## Shotgunner class

140 HP (`hp` on the class), a pump shotgun that fires 8 pellets in a spread (`pellets`, `spread`): 5 shells, one shot every 450 ms (quicker than the rifle's 700 ms, slower than the SMG's 110 ms), pellets reach only about 200 px, so it is deadly up close and weak at range. It also carries a 12-round pistol with its own ammo; mouse wheel or **Q** cycles main weapon, pistol and (if you hold one) the bazooka. He sprints 1.5x as long as other classes (`staminaX` on the class). Medics and the clinic tent heal him up to 140. Rockets and artillery still kill him inside their lethal ring.


**Sniper aids:** rounds pierce barricades and rubble; enemies picked out by a scoped teammate pulse as red dots on the minimap. The intro splash shows once per visitor (footer link "How to play" or `/?intro` shows it again).

**Sniper nests:** each side has two sandbag pockets (marked with a scope reticle on the ground) on the long north and south avenues, with the lane in front cleared of cover and wrecks. Sniper rounds pierce sandbags, so a sniper in a nest is covered from the front and can shoot down the whole avenue. Defined in `scripts/make-map.mjs` (`nests`).
