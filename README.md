# Frontline (repo: the-trenches; formerly The Ruins)

A top-down multiplayer shooter that runs in the browser, set across a ruined city, a forest and a container yard. Two crews, Green survivors and Red raiders, hold opposite ends of the map. Use the buildings, wrecks and barricades for cover, hold the plaza in the middle, stay alive. (The game used to be a WWI trench shooter; the name in the UI is just the `The Ruins` text in `App.tsx`, `Splash.tsx`, `Play.tsx` and `index.html`.)

- **Play:** pick a side (or random), move with W A S D, aim with the mouse, hold the left button (or space) to fire, press G to lob one of your 2 grenades to the cursor (it flies over cover; walls still shield the blast), hold Tab for the scoreboard. Pick a class in the lobby: **Assault** (formerly Rifleman, 15-round AR with recoil; three hits kill), **SMG** (20 rounds, fast fire, about five hits to kill, shorter reach) or **Medic** (16-round SMG, heals teammates standing next to them). A medic's healing also builds his kill streak: every 100 HP healed (`CFG.HEAL_POINT`), by medkit or air drop, counts like a kill towards the UAV, drone and heli rewards. The scoreboard shows HP healed this map, and the pause after a map's last round names the top killer and the most healing. Every reload takes 2 s (R reloads early). Each side also has a clinic tent behind the capture point that heals anyone near it (each soldier can use it once every 30 s; a "Tent" timer in the top bar shows the cooldown). Everyone has a health bar over their head. Hold Left Shift or the right mouse button to sprint (1.6x speed for about 2.5 s, then a short recovery; a "Sprint" bar in the top bar shows what is left). Press N for team-only quick chat (1 cover me, 2 I'll cover you, 3 throw a grenade, 4 call in artillery, 5 let's go for the CP); lines appear above the sender and in a small log for teammates only. A key legend sits on the right of the screen (it can be hidden). The top bar shows the team score (kills this round, green – red), the round number and rounds won, plus your own K/D. A medic's healing comes from a medkit of 100 HP that refills at 4 HP per second, so standing next to someone cannot keep them alive forever (the "Medkit" pill shows what is left). In dev, an "Add wounded bot" button spawns a stationary 30 HP teammate to test healing; it gets wounded again 3 s after being fully healed. Set TRAINING_BOT=0 to hide it. "Change class" in the top bar switches class without leaving (at once in your trench, otherwise on your next life). Teams are kept within one player of each other: new joiners go to the smaller side, and if players leave, a dead soldier on the bigger side is moved over (and teams are fully rebalanced between rounds). Press T for your one artillery strike per life: it lands at the cursor (same reach as a grenade) after 3 s and bursts like a big grenade (`CFG.ARTY_*`: kills within 55 px, hurts out to 130 px, hurts your own side too); the enemy only sees its marker and hears the shell for the last 0.75 s (`CFG.ARTY_WARN_S`), while your side knows at once. The map is 120 x 68 tiles: a street grid with ruined buildings you can walk into, burnt-out cars, rubble and barricades (all solid cover). Regenerate it with `node scripts/make-map.mjs`. Each side has 3 resupply crates: walk onto your own side's crate to refill rifle, grenades and artillery strike (30 s to restock). The strike has a cannon shot, a falling-shell whistle and a big explosion.
- **Guests welcome:** a callsign is enough. Everyone is ranked on the **Top soldiers** leaderboard in the lobby (kills, deaths, rounds and wins). Guests are saved under a random id their browser keeps and the name they last played with; wallet sign-in (free message signature, no transaction) is optional and keeps your stats on any device. Set `VITE_WALLET_LOGIN=0` to hide sign-in. Stats are stored in `DATA_DIR/stats.json`, so on Railway add a volume and set `DATA_DIR=/data`.
- **Fair:** teams stay balanced, the map is a mirror image, and the server decides every shot.

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Simulation | `server/sim.mjs` | Movement, bullets, cover, damage, respawn, capture point, rounds. Pure logic with tests. All tuning numbers are at the top. |
| Network | `server/game.mjs` | WebSocket at `/ws`: join, input in, snapshots out (20 per second), kill feed, scoreboard. |
| Stats | `server/stats.mjs` | Saved kills, deaths, rounds and wins per wallet or guest browser id, and the leaderboard (`/api/leaderboard?sort=kills|wins`). Team kills, bots and repeat kills of the same victim within 10 s do not count. |
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


One-hit kill, 5 rounds, 3.5 s reload, slow fire (1.8 s), a sidearm pistol (8 rounds, 20 damage; mouse wheel or Q swaps, and the scope only works with the rifle), 1 grenade, no artillery strike, max 1 per side (`CFG.MAX_SNIPERS`). Hold the **right mouse button** to scope: the side's fog opens to `CFG.SCOPE_VISION` (680 px) around him, but he moves at 35% speed and cannot sprint. Each shot reveals him to the enemy through the fog for 3 s (`CFG.SNIPER_REVEAL_S`).

## Class specials (key C)

Every class has a special on **C** (for the Sniper it is the tower). Thrown ones aim like a grenade (the cursor sets the range) and cannot be used inside your own base.

| Class | Special | Details |
| --- | --- | --- |
| **Assault** (was Rifleman) | Smoke grenade | 1 per life, refilled at a crate. A 12 s cloud (140 px radius): enemies cannot see in, out of or through it (except point-blank); your side sees through it, so you can push in under cover. The AR is 15 rounds, 3 hits to kill, 8 shots a second; held on full auto it builds recoil and the shots spread (a cone shows on screen), tapping or bursting stays accurate. |
| **SMG** | Flashbang | 1 per life, refilled at a crate. Enemies within 170 px with a clear line are blinded for 2 s (halved by each repeat flash within 10 s, minimum 0.4 s): white screen and almost no sight. Friends are not affected. |
| **Medic** | Air drop flare | 1 per life, refilled at a crate. The flare lands, 1.5 s later a medical crate drops and heals friendlies within 75 px at 22 HP/s for 10 s. |
| **Shotgunner** | Riot shield | 5 s of stopping bullets (it soaks 200 damage, then breaks and the recharge starts early) that arrive from the front (about 130 degrees), walking at 85%; you can still shoot. 20 s recharge after it ends. Explosions are not stopped. |
| **Squad Leader** (6th class) | UAV | The AR plus a 10-round pistol, 2 grenades, 1 artillery strike. The UAV is called in like an artillery strike (same reach as a grenade): it lifts the fog in a 420 px circle at the cursor for 10 s, showing every enemy in it to your whole side (the enemy gets a warning); 60 s recharge after it ends, and resupply does not refresh it. |

All the numbers are in `CFG` in `server/sim.mjs`.

## Bazooka pickups

Each side has one bazooka crate in its own half, between 10 and 28 tiles from its base edge (`CFG.PICKUP_NEAR`). Only that side can take it, only that side sees it (a pulsing gold marker on its minimap, dimmed while one of its soldiers still holds a bazooka), and only one soldier per side can hold a bazooka at a time. When the crate is taken a new one appears at a different spot on the same side 30 s later (`CFG.PICKUP_RESPAWN_S`). Walk over it to get a bazooka with 2 rockets (`CFG.ROCKETS`): no reload, no resupply, lost when you fall. Mouse wheel or **Q** swaps between it and your main weapon. A rocket flies about 640 px, bursts on the first wall or soldier it touches, kills inside 62 px and hurts out to 125 px (it hurts your own side too).

## Shotgunner class

140 HP (`hp` on the class), a pump shotgun that fires 8 pellets in a spread (`pellets`, `spread`): 5 shells, one shot every 450 ms (quicker than the rifle's 700 ms, slower than the SMG's 110 ms), pellets reach about 240 px (full damage out to 100 px), so it is deadly up close and weak at range. It also carries a 12-round pistol with its own ammo; mouse wheel or **Q** cycles main weapon, pistol and (if you hold one) the bazooka. He sprints 1.5x as long as other classes (`staminaX` on the class). Medics and the clinic tent heal him up to 140. Rockets and artillery still kill him inside their lethal ring.


**Sniper aids:** rounds pierce barricades and rubble; enemies picked out by a scoped teammate pulse as red dots on the minimap. The intro splash shows once per visitor (footer link "How to play" or `/?intro` shows it again).

**Sniper nests:** each side has two sandbag pockets (marked with a scope reticle on the ground) on the long north and south avenues, with the lane in front cleared of cover and wrecks. Sniper rounds pierce sandbags, so a sniper in a nest is covered from the front and can shoot down the whole avenue. Defined in `scripts/make-map.mjs` (`nests`).


**Gear bar:** the bottom of the game window shows health, sprint and one slot per item (weapon and rounds, grenades, artillery, plus the sniper nest, medic medkit, bazooka and clinic timer when they apply). Icons are drawn in `src/game/HudBar.tsx`; put your own artwork in `src/assets/hud/` (see the README there) and it replaces the drawing automatically.

**Exit protection:** stepping out of your own base grants 1 s of invincibility (the same shield shown after a respawn), at most once every 6 s, so the doorway cannot be camped (`CFG.EXIT_PROTECT_*`).

**Scope view:** while a sniper holds the scope, the camera slides toward where he aims (`SCOPE_PAN`) and pulls back slightly (`SCOPE_ZOOM`), and the fog opens in a long narrow beam along his aim (`CFG.SCOPE_VISION` 1000 px reach, `CFG.SCOPE_HALF` 0.3 rad each side) on top of his normal sight circle. Enemies outside the beam and outside normal sight stay hidden, for him and his team.

## Voice chat (opt in)
In the top bar choose **Join team voice** (only your side hears you) or **Join all-player voice** (everyone who joined that channel hears everyone, enemies included; it is a separate room from the team channels). The browser asks for your microphone. Hold **V** to talk, or tick **Open mic**. Leave with **Leave voice**; changing sides (team channel only), leaving the game or closing the tab also leaves it. In the team channel enemies cannot hear it: the game server only relays the connection setup between people who joined the same channel, and the audio then goes browser to browser (WebRTC, free STUN servers, no recording and no audio passes through the server). `src/game/useVoice.ts` (client) and the `vjoin` / `vleave` / `vsig` messages in `server/game.mjs`.
Needs a secure page: https (Railway) or localhost. On a plain `http://192.168...` address the browser blocks the microphone. Players behind very strict networks may not connect, since there is no relay (TURN) server.

**Muting:** hold Tab, then click the speaker beside a player on the scoreboard to mute their voice and their chat for the rest of your session (click again to unmute). It only affects what you hear and read.

**Scoring the plaza:** holding the middle plaza alone earns your side points: 1 per second with one soldier inside, +0.5 per second for each extra soldier (up to 6). If both sides are in it, nobody scores. The first side to 100 points wins the round (`CFG.POINTS_TO_WIN`, `POINT_RATE`, `POINT_EXTRA`); if time runs out, the side with more points wins. The bar in the top row shows both scores.

**Sniper rounds** now fly at 2600 px/s (was 1000), with the lifetime shortened so the reach stays the same, so they are hard to dodge.


**Sniper tower (the sniper's special, C):** away from a tower, C builds a raised platform where the sniper stands and puts him on it; C again climbs down, and C beside a free tower of his side climbs it (so a teammate sniper can use it too). On a tower he is fixed in place and his rounds fly over low cover (barricades, rubble, wrecks) but still stop at buildings and the map edge. He can still be shot by anyone with a clear line. A tower is taken down when its builder dies, leaves or changes class (unless another sniper is on it, in which case it passes to him), when the round ends, or once nobody has been standing on it for 20 s (`CFG.TOWER_IDLE_S`); one tower per sniper at a time (to build another, stand beside your tower and hold **B** for 5 s to dismantle it; you can build again straight away), none inside the bases, and none within 150 px of another. The two sandbag pockets on the map (marked with a reticle) are still there as fixed sniper spots.

## Sounds

Gunfire, reloads and grenade blasts use recordings in `src/assets/sfx` (ar, smg, pistol, shotgun, reload, shotgun_reload, grenade; short mp3s trimmed from the originals). They load after the first click and get quieter and duller with distance. AR and Sniper rifle shots use `ar`, any pistol (Medic, or a sidearm) uses `pistol`, the Shotgunner reloads with `shotgun_reload` and everyone else with `reload`; frag, rocket, artillery, smoke and flash all use `grenade` (artillery pitched down). If a file fails to load, the old synthesized sound plays instead. Replace a file with the same name to change a sound.

## Test settings

`CFG.FRIENDLY_FIRE` (bullets and rockets in flight hurt your own side, never yourself) is now **off**; `CFG.FRIENDLY_FLASH` (flashbangs blind your side and you) is still **on** in `server/sim.mjs` while we test. Grenade, rocket and artillery blasts still hurt friends (`CFG.FRIENDLY_BLASTS`), but the attack drone's blast spares your side. Teamkills give no kill credit.

## Rounds fade in the fog

Every gun except the Sniper rifle loses power once a round flies past your sight range (`CFG.FADE_START`, 420 px, the same as `VISION`): it loses 25% of its damage every 64 px (2 tiles) and disappears when it reaches 0, so the AR is full strength to 420 px, then 75%, 50%, 25% and nothing from 612 px. That ends blind spraying down a street. Sniper rounds keep full damage for their whole flight. Tune it with `FADE_START`, `FADE_STEP` and `FADE_LOSS` in `server/sim.mjs`.

**Bodies:** when a soldier falls where you can see it, a body (sprawled soldier, dropped weapon, blood pool and splatter that darkens as it dries) stays on the ground for 60 s, then fades over 5 s. Bodies are drawn under the fog, so you only see ones in your line of sight, and a new round clears them. It is a client-side effect (`corpses` in `useGame.ts`, `drawCorpse` in `GameCanvas.tsx`).

## Maps and rounds

**Hardpoint** (the default mode): the scoring zone is not fixed. Each map lists five `hardpoints` (centre, west, north, east, south), and the live zone moves to the next one every 45 s (`CFG.HARDPOINT_S`), looping, starting at the centre each round. The next zone is outlined in yellow on the field and the minimap for the last 5 s (`CFG.HARDPOINT_WARN_S`). Scoring is unchanged: a side holding the zone alone scores 1 point per second plus 0.5 for each extra soldier (up to 6), a contested zone scores nothing, and 100 points win the round. The zones are in `shared/*.json` (and in the `make-*.mjs` generators); the snapshot field `hz` carries the live zone and the next one. `MODE=capture` turns it off and keeps the zone on the central plaza.

The server plays a **best of three** on each map, then moves to the next one (the order is `city,forest,industry` and loops; set `MAP_ORDER=forest,city` to start elsewhere). A side that wins two rounds ends the map early. Round wins start again on the new map, everyone respawns in their base, and the pause after the last round names the next map. `CFG.ROUNDS_PER_MAP`, `CFG.MAP_EARLY_END` and `CFG.END_MAP_S` in `server/sim.mjs` control it. The server names the current map in every snapshot (`r.mp`; `r.mr`/`r.mt` are the round on the map and the series length; `r.nx` is the next map during the final pause) and the client has all maps bundled (`src/game/maps.ts`).

To add a map: write a generator that outputs `shared/<id>.json` (same 120×68 grid, bases, tents, crates, nests and capture point as the others), add it to `MAPS` in `server/game.mjs` and `src/game/maps.ts`, and give it a `theme` so the client knows how to paint it.

**The industry yard** (`node scripts/make-industry.mjs` -> `shared/industry.json`): a container port. Rows of shipping containers (solid, stop bullets), concrete barriers, pallet stacks, drums and wrecked trucks make the cover; asphalt lanes and rail tracks run across the yard, and a warehouse in the middle has open floor inside.

**The train** (Industry only; the map's `train` entry): every 70 s (`CFG.TRAIN_EVERY_S`, the first at 40 s into a round) a train crosses one of the two rail tracks, alternating north and south and east and west. The track flashes yellow with a banner and a horn for the 5 s before it arrives (`CFG.TRAIN_WARN_S`); it then takes about 4 s to cross. Anyone on the rails takes 80 damage once per pass (`CFG.TRAIN_DMG`, kill feed: "was run over by the train"), and the cars stop bullets (not helicopter fire).

The Hardpoint zones stay clear of the clinic tents, so a tent's healing never sits inside a zone.

**Touch controls (phone / tablet).** The first visit asks "How are you playing?" (PC, or Mobile / Tablet; the choice is guessed from the hardware and remembered in `localStorage`, and the lobby has a switch). In touch mode the battlefield fills the screen and `src/game/TouchControls.tsx` draws a floating left stick (move: walking speed however far you push it; sprint only while the sprint button is toggled on). The rest of the screen is the target: touch where you want to shoot and the soldier aims there and fires while your finger is down (a quick tap is one shot, dragging sweeps the aim). A light aim assist moves the aim onto an enemy he can see within about 64 px of where you touch. With no finger on the battlefield he faces the way he walks, or the way he last aimed. For a grenade, an artillery strike or a thrown special (smoke, flashbang, medic flare, squad leader UAV; the shield and the sniper's tower act at once) press **G**, **T** or **C** (the button lights up and a banner says where to tap), then tap the battlefield where it should land; you are back to shooting afterwards. Other buttons: reload, class special, streak reward, weapon swap, sprint latch and (snipers) scope, plus a scoreboard button and a menu (change class, sound, leave). While flying a drone or helicopter, touch aims the crosshair and shoots (or explodes the drone). The touches write into the same input the keyboard and mouse do, so the server is unchanged; the assist lives in `GameCanvas.tsx`. On touch, a 💬 button opens the typing box (with ALL / TEAM and Send buttons, kept at the top so the on-screen keyboard does not cover it), ⚡ opens the five quick team lines as tap buttons, the menu has Join team voice / Join all-player voice / Leave voice and an open-mic switch, and a 🎙 button appears to hold while talking (when the mic is not open). Chat lines show at the top left. `src/game/device.ts` holds the choice.

**The forest** (`node scripts/make-forest.mjs` -> `shared/forest.json`): grass and dirt tracks, a creek you can wade, trees (solid, stop every bullet), boulders and fallen logs (solid cover; sniper rounds punch through them, and a sniper on a tower shoots over them), and **bushes**. A soldier standing in a bush is hidden from the enemy until an enemy soldier gets within `CFG.BUSH_REVEAL` (110 px), a UAV covers him, or he fires (revealed for `CFG.BUSH_FIRE_REVEAL_S`, 1.5 s). His own side always sees him. Bullets pass through bushes.

## Fill-in bots (5v5)

An admin setting, off by default. With `BOTS=1` (and `BOT_TEAM_SIZE`, default 5) each side is topped up with bots until it has that many soldiers **counting the people on it**, so a lone player gets a 5v5 (four bots with them, five against). Bots only exist while at least one person is online; each one makes way when a person takes the side's place, and they disappear when the setting is turned off. Bots build a mixed squad (assault, medic, SMG, sniper, shotgunner, squad leader), walk to the plaza, spread around it, fight from range suited to their weapon, use their class special and grenades, fall back to the clinic tent when hurt, and only act on what their side can see (fog, smoke and bushes apply to them too). They never appear on the scoreboard or in the stats. **Level:** `BOT_LEVEL` (`easy` by default, `normal`, `hard`), or `/bots easy`, `/bots normal`, `/bots hard` in chat (also `/bots 5 easy`, or `"level"` in the `/api/admin/bots` call). Easy bots take about a second to react to a new enemy, aim about three and a half times as badly, never lead a moving target, fire in shorter bursts, pick fights from closer, rarely throw grenades or call artillery, and walk 20% slower; normal is how they played before. The numbers are the `LEVELS` table in `server/bots.mjs`. The code is `server/bots.mjs`.

To switch it while the server is running, set `ADMIN_TOKEN` (12+ characters) on the server and call:

```
curl -H "x-admin-token: $ADMIN_TOKEN" https://your-site/api/admin/bots                      # current setting
curl -X POST -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" \
     -d '{"enabled":true,"size":5}' https://your-site/api/admin/bots
```

**From the game's chat** (needs the same `ADMIN_TOKEN`): type `/admin your-token` once (only you see the reply, and the line is never shown to other players), then `/bots 5` for 5v5, `/bots 0` for no bots, `/bots` to see the current setting, `/map forest`, `/map city` or `/map industry` to switch map (round wins reset to 0:0), and `/restart` to start the match again (round wins 0:0, round 1, fresh timer, same map). `/reward uav`, `/reward drone`, `/reward heli` or `/reward all` puts that kill-streak reward on your own Z key for testing (private, and lost when you die like a normal one). The map and restart commands are announced to everyone in chat. Five wrong passwords lock the sender's address out for a minute.

The change lasts until the server restarts (then `BOTS` / `BOT_TEAM_SIZE` apply again). Without `ADMIN_TOKEN` the route does not exist.

## Kill streaks and the idle kick

**Kill streaks:** every soldier (bots too) keeps a count of kills since he last died. At 3, 5 and 7 the server announces it to everyone (`CFG.STREAK_CALLOUTS`): a banner at the top of the screen ("Wolf is on a 5 kill streak!", yellow, orange, red) and a short rising sting, louder when it is you. Dying ends the streak, and a new round starts everyone at zero. 

**Rewards (Z key):** people (not bots) who reach 3, 5 or 7 kills in a row earn a reward, shown as a slot on the hotkey bar. Z spends the best one held; an unused reward is lost when you die or a round restarts. While you fly a drone or helicopter your soldier stands still and can be shot.

| Kills | Reward | What it does |
|---|---|---|
| 3 | UAV | 8 s: the whole map's fog lifts and every enemy shows on screen and the minimap (`CFG.BIGUAV_S`) |
| 5 | Attack drone | 15 s (`CFG.DRONE_S`): WASD flies it over everything, the camera rides it, and it lights the fog and shows enemies (screen and minimap) like a UAV. Left click or Z explodes it (blast spares your side). The enemy sees no drone, marker or warning |
| 7 | Attack helicopter | 15 s (`CFG.HELI_S`): WASD to fly over everything, mouse to aim, hold click for the minigun, right click (or G) for rockets. Enemies who can see it see it |

**Idle kick:** a person who has not moved, fired, scoped, pressed an action key or moved the mouse for 60 s is removed (15 s before that, a "Move or you will be removed" warning appears in chat). They land back in the lobby with a message saying why. `IDLE_KICK_S` changes the time (0 turns it off). Bots are never kicked.

**Auto-balance:** the sides are kept within one person of each other. A dead soldier on the bigger side was always moved over; now, if the sides stay two or more apart for `CFG.AUTO_BALANCE_S` (15 s) — say 1 v 5 after a team leaves — someone is moved from the bigger side every 3 s until it is even: a dead soldier first, then one standing in his own base, then the newest arrival. The mover respawns in his new base and everyone sees "Auto-balance: NAME moved to Red to even the teams." in chat. Bots do not count (they fill up to the set size on their own), and `AUTO_BALANCE_S` = 0 turns it off.
