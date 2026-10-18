import { clusterApiUrl } from '@solana/web3.js';

export type Cluster = 'devnet' | 'testnet' | 'mainnet-beta';

const c = import.meta.env.VITE_CLUSTER;
export const CLUSTER: Cluster = c === 'mainnet-beta' || c === 'mainnet' ? 'mainnet-beta' : c === 'testnet' ? 'testnet' : 'devnet';
export const IS_MAINNET = CLUSTER === 'mainnet-beta';
export const RPC_URL: string = import.meta.env.VITE_RPC_URL || clusterApiUrl(CLUSTER);

/** Wallet sign-in is OFF until you set VITE_WALLET_LOGIN=1. With it off, nobody sees a wallet button and everyone plays as a guest. */
export const WALLET_LOGIN = import.meta.env.VITE_WALLET_LOGIN === '1';
