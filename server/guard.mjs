// Production safety: security headers, per-IP API limit, optional region block, mainnet startup checks.
import fs from 'node:fs';
import path from 'node:path';
import { rateLimit } from './limits.mjs';

const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const BLOCKED = list(process.env.BLOCKED_COUNTRIES).map((c) => c.toUpperCase());

/** Visitor's country from the CDN header (Cloudflare: CF-IPCountry, Vercel, CloudFront). */
export const countryOf = (req) =>
  String(req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['cloudfront-viewer-country'] || '').toUpperCase();

export const blockedCountry = (req) => BLOCKED.length > 0 && BLOCKED.includes(countryOf(req));

export function applyGuards(app) {
  if (process.env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.HSTS) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  if (BLOCKED.length) {
    app.use('/api', (req, res, next) => {
      if (req.path === '/health') return next();
      if (blockedCountry(req)) return res.status(451).json({ error: 'Not available in your region.' });
      next();
    });
  }

  app.use('/api', (req, res, next) => {
    if (!rateLimit(`api:${req.ip}`, Number(process.env.API_PER_MINUTE || 240), 60_000)) {
      return res.status(429).json({ error: 'Too many requests. Slow down.' });
    }
    next();
  });
}

/** Refuses unsafe mainnet setups. Call once at startup. Returns the network name. */
export async function checkNetwork(connection) {
  const mainnet = (await connection.getGenesisHash().catch(() => '')) === MAINNET_GENESIS;
  const wanted = (process.env.SOLANA_CLUSTER || '').toLowerCase();
  if (wanted === 'mainnet-beta' && !mainnet) throw new Error('SOLANA_CLUSTER=mainnet-beta but SOLANA_RPC_URL is not a mainnet RPC.');
  if (mainnet && wanted !== 'mainnet-beta') throw new Error('SOLANA_RPC_URL is MAINNET but SOLANA_CLUSTER is not set to mainnet-beta. Set it on purpose.');
  if (mainnet) {
    const problems = [];
    if (/api\.mainnet-beta\.solana\.com/.test(process.env.SOLANA_RPC_URL || '')) problems.push('Use a paid RPC, not the public mainnet endpoint.');
    // The data folder must be on a mounted volume, not the container's throwaway disk (player data would vanish on redeploy).
    if (process.env.ALLOW_EPHEMERAL_DATA !== '1') {
      try {
        const dir = path.resolve(process.env.DATA_DIR || 'server/data');
        fs.mkdirSync(dir, { recursive: true });
        if (fs.statSync(dir).dev === fs.statSync(path.parse(dir).root).dev) {
          problems.push(`DATA_DIR (${dir}) is not on a mounted volume, so player data would be erased on every redeploy. Attach a volume at that path (set ALLOW_EPHEMERAL_DATA=1 only if your host keeps this disk).`);
        }
      } catch (e) {
        problems.push(`Cannot use DATA_DIR: ${e.message}`);
      }
    }
    if (problems.length) throw new Error('Mainnet config problems:\n - ' + problems.join('\n - '));
    if (BLOCKED.length === 0) console.warn('WARNING: BLOCKED_COUNTRIES is empty. Ask your lawyer whether you need to block regions.');
    if (!process.env.TRUST_PROXY) console.warn('WARNING: TRUST_PROXY is not set. Behind a proxy, rate limits will see one IP for everyone.');
  }
  return mainnet ? 'mainnet-beta' : 'devnet/testnet';
}
