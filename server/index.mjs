// The Trenches server: serves the built site, the wallet sign-in nonce, and the multiplayer socket.
import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { applyGuards, checkNetwork } from './guard.mjs';
import { newNonce } from './auth.mjs';
import { attachGame, onlineCount } from './game.mjs';
import { leaderboard } from './stats.mjs';

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

app.get('/api/health', (_req, res) => res.json({ ok: true, rpc: RPC_HOST, online: onlineCount() }));
app.get('/api/leaderboard', (req, res) => {
  const sort = req.query.sort === 'wins' ? 'wins' : 'kills';
  res.json({ sort, rows: leaderboard(sort, Number(req.query.limit) || 10) });
});
app.get('/api/nonce', (_req, res) => res.json(newNonce()));

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
