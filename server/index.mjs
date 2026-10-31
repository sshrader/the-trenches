// The Trenches server: serves the built site, the wallet sign-in nonce, and the multiplayer socket.
import { isAdminToken } from './admin.mjs';
import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { applyGuards, checkNetwork } from './guard.mjs';
import { newNonce } from './auth.mjs';
import { attachGame, onlineCount, lobbyRoster, getBotSettings, setBotSettings } from './game.mjs';
import { leaderboard } from './stats.mjs';
import { siteMiddleware } from './site.mjs';

const PORT = Number(process.env.PORT || 8787);
const RPC = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');
// Show only the host of the RPC anywhere it is displayed or logged: the URL usually contains a secret API key.
const RPC_HOST = (() => {
  try {
    return new URL(RPC).host;
  } catch {
    return 'invalid';
  }
})();

const app = express();
applyGuards(app);
app.use(siteMiddleware); // synxer.dev (see SITE_HOSTS) gets the main page; every other host gets the game

app.get('/api/health', (_req, res) => res.json({ ok: true, rpc: RPC_HOST, online: onlineCount() }));
app.get('/api/roster', (_req, res) => res.json(lobbyRoster()));
app.get('/api/leaderboard', (req, res) => {
  const sort = req.query.sort === 'wins' ? 'wins' : 'kills';
  res.json({ sort, rows: leaderboard(sort, Number(req.query.limit) || 10) });
});
app.get('/api/nonce', (_req, res) => res.json(newNonce()));

// Admin: fill-in bots. Needs ADMIN_TOKEN (or the optional ADMIN_TOKEN_2) set on the server and sent as the x-admin-token header; without one these routes do not exist.
//   curl -H "x-admin-token: $ADMIN_TOKEN" https://your-site/api/admin/bots
//   curl -X POST -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" -d '{"enabled":true,"size":5}' https://your-site/api/admin/bots
const adminOk = (req) => isAdminToken(req.headers['x-admin-token']); // ADMIN_TOKEN or ADMIN_TOKEN_2
app.get('/api/admin/bots', (req, res) => (adminOk(req) ? res.json(getBotSettings()) : res.status(404).json({ error: 'not found' })));
app.post('/api/admin/bots', express.json({ limit: '1kb' }), (req, res) => {
  if (!adminOk(req)) return res.status(404).json({ error: 'not found' });
  res.json(setBotSettings({ enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined, size: req.body?.size, level: req.body?.level }));
});

// The built client. Anything that is not a file falls back to the app.
const DIST = path.resolve('dist');
if (await fs.stat(DIST).then(() => true, () => false)) {
  app.use(express.static(DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

const server = http.createServer(app);
attachGame(server);

// The game itself does not need the chain. Only check the network when an RPC or cluster is configured (wallet sign-in
// needs no RPC either), so a misconfigured mainnet deployment still refuses to start.
const network =
  process.env.SOLANA_RPC_URL || process.env.SOLANA_CLUSTER
    ? await checkNetwork(new Connection(RPC, 'confirmed')).catch((e) => {
        console.error(e.message);
        process.exit(1);
      })
    : 'no chain configured';
server.listen(PORT, () => console.log(`The Trenches on http://localhost:${PORT}  (${network})`));
