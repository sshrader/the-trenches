// Wallet sign-in without a transaction: the wallet signs a one-time message, the server checks the signature.
import crypto from 'node:crypto';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';

const TTL_MS = 5 * 60_000;
const nonces = new Map(); // nonce -> expiry

export const loginMessage = (nonce) => `The Trenches sign-in\nThis only proves you own this wallet. It costs nothing and sends no transaction.\nNonce: ${nonce}`;

export function newNonce() {
  const nonce = crypto.randomBytes(16).toString('hex');
  nonces.set(nonce, Date.now() + TTL_MS);
  return { nonce, message: loginMessage(nonce) };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of nonces) if (exp < now) nonces.delete(k);
}, 60_000).unref();

/** Returns the wallet address (base58) when the signature is valid for an unused nonce, else null. One use per nonce. */
export function verifyLogin({ wallet, nonce, signature }) {
  try {
    const exp = nonces.get(String(nonce));
    if (!exp || exp < Date.now()) return null;
    nonces.delete(String(nonce)); // one-time
    const pub = new PublicKey(String(wallet));
    const sig = Buffer.from(String(signature), 'base64');
    if (sig.length !== 64) return null;
    const ok = nacl.sign.detached.verify(new TextEncoder().encode(loginMessage(nonce)), sig, pub.toBytes());
    return ok ? pub.toBase58() : null;
  } catch {
    return null;
  }
}
