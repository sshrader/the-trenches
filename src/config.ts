import { clusterApiUrl } from '@solana/web3.js';

export type Cluster = 'devnet' | 'testnet' | 'mainnet-beta';

const c = import.meta.env.VITE_CLUSTER;
export const CLUSTER: Cluster = c === 'mainnet-beta' || c === 'mainnet' ? 'mainnet-beta' : c === 'testnet' ? 'testnet' : 'devnet';
export const IS_MAINNET = CLUSTER === 'mainnet-beta';
export const RPC_URL: string = import.meta.env.VITE_RPC_URL || clusterApiUrl(CLUSTER);

/** Wallet sign-in is optional and ON by default (guests can still play). Signed-in players get saved stats and a place on the leaderboard.
 *  Set VITE_WALLET_LOGIN=0 to hide it. */
export const WALLET_LOGIN = import.meta.env.VITE_WALLET_LOGIN !== '0';
