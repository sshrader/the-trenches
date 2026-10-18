/**
 * Creates THE coin: one token and its bonding-curve pool, on the curve config you made with `npm run dbc-config`.
 *
 *   npm run launch-token -- --check            show what will be created, verify the metadata link, send nothing
 *   npm run launch-token -- --confirm-mainnet  really create it
 *
 * Reads from .env: COIN_NAME, COIN_SYMBOL, COIN_URI (https link to the metadata JSON), DBC_CONFIG, PARTNER_KEYPAIR.
 * The name, symbol and link are PERMANENT: the config locks the token's metadata. The link must keep working forever,
 * so host it somewhere that will (this site's /token.json is fine as long as the site stays up; IPFS is sturdier).
 */
import 'dotenv/config';
import { Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { connect, loadPartner, requireMainnetConfirm } from './common';

const env = (k: string) => (process.env[k] || '').trim();
const name = env('COIN_NAME');
const symbol = env('COIN_SYMBOL').toUpperCase();
const uri = env('COIN_URI');
const config = env('DBC_CONFIG');

if (!name || name.length > 32) throw new Error('COIN_NAME is required (up to 32 characters).');
if (!/^[A-Z0-9]{2,10}$/.test(symbol)) throw new Error('COIN_SYMBOL must be 2-10 letters or numbers.');
if (!/^https:\/\//.test(uri) || uri.length > 200) throw new Error('COIN_URI must be an https link of at most 200 characters.');
if (!config) throw new Error('DBC_CONFIG is empty. Run `npm run dbc-config` first.');

// The wallet apps and explorers read this file. Make sure it exists and looks right BEFORE it becomes permanent.
const res = await fetch(uri).catch(() => null);
if (!res || !res.ok) throw new Error(`Could not load ${uri}. Deploy the site with public/token.json first, then try again.`);
const meta = (await res.json().catch(() => null)) as { name?: string; symbol?: string; image?: string } | null;
if (!meta || !meta.image) throw new Error('The metadata file has no "image" field.');
const img = await fetch(meta.image).catch(() => null);
if (!img || !img.ok) throw new Error(`The image ${meta.image} does not load.`);

console.log('\nCoin to create');
console.log(`  name     ${name}`);
console.log(`  ticker   ${symbol}`);
console.log(`  link     ${uri}`);
console.log(`  image    ${meta.image}`);
console.log(`  config   ${config}`);
if (meta.name && meta.name !== name) console.log(`  NOTE: the metadata file says name "${meta.name}", not "${name}". Wallets may show either.`);
if (meta.symbol && meta.symbol !== symbol) console.log(`  NOTE: the metadata file says ticker "${meta.symbol}", not "${symbol}".`);

if (process.argv.includes('--check')) {
  console.log('\n--check: nothing was sent.');
  process.exit(0);
}

const partner = loadPartner();
const { connection, mainnet } = await connect();
console.log(`Creator wallet ${partner.publicKey.toBase58()}`);
console.log('\nThe name, ticker and link above are permanent once this runs.');
requireMainnetConfirm(mainnet, 'Creating the coin');

const mint = Keypair.generate();
const tx = await new DynamicBondingCurveClient(connection, 'confirmed').creator.createPool({
  baseMint: mint.publicKey,
  config: new PublicKey(config),
  name,
  symbol,
  uri,
  payer: partner.publicKey,
  poolCreator: partner.publicKey,
});
tx.feePayer = partner.publicKey;
const signature = await sendAndConfirmTransaction(connection, tx, [partner, mint], { commitment: 'confirmed' });

console.log(`\nCreated. Transaction: ${signature}`);
console.log(`\nAdd this to .env and to Railway (then redeploy):\n\nVITE_COIN_MINT=${mint.publicKey.toBase58()}\n`);
