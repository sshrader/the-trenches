/**
 * Sends ALL the SOL in the key-file wallet (PARTNER_KEYPAIR) to another address of yours, minus the network fee.
 * Use it to get money back out of the deployer wallet, e.g. if you decide not to launch.
 *
 *   npm run sweep -- <your-address>            preview only, nothing is sent
 *   npm run sweep -- <your-address> --send     really send it
 *
 * The destination can also be set as SWEEP_TO in .env. Check it carefully: a sent transaction can't be undone.
 */
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { connect, loadPartner } from './common';

const arg = process.argv.slice(2).find((a) => !a.startsWith('--')) || process.env.SWEEP_TO || '';
if (!arg) throw new Error('Give the address to send the SOL to: npm run sweep -- <address>');
let to: PublicKey;
try {
  to = new PublicKey(arg.trim());
} catch {
  throw new Error(`"${arg}" is not a valid Solana address.`);
}

const from = loadPartner();
if (to.equals(from.publicKey)) throw new Error('The destination is the same wallet you are sweeping from.');

const { connection } = await connect();
const balance = await connection.getBalance(from.publicKey, 'confirmed');
console.log(`From:     ${from.publicKey.toBase58()}  (${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
console.log(`To:       ${to.toBase58()}`);

const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports: balance }));
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
tx.recentBlockhash = blockhash;
tx.feePayer = from.publicKey;
const fee = (await connection.getFeeForMessage(tx.compileMessage(), 'confirmed')).value ?? 5000;
const amount = balance - fee;
if (amount <= 0) {
  console.log('Nothing to sweep: the balance does not cover the network fee.');
  process.exit(0);
}
console.log(`Sending:  ${(amount / LAMPORTS_PER_SOL).toFixed(6)} SOL  (network fee ${(fee / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);

if (!process.argv.includes('--send')) {
  console.log('\nPreview only, nothing was sent. Check the To address, then add --send to do it.');
  process.exit(0);
}

const real = new Transaction().add(SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports: amount }));
real.recentBlockhash = blockhash;
real.lastValidBlockHeight = lastValidBlockHeight;
real.feePayer = from.publicKey;
const sig = await sendAndConfirmTransaction(connection, real, [from], { commitment: 'confirmed' });
console.log(`Done. Signature: ${sig}`);
