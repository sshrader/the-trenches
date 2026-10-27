import { clusterApiUrl } from '@solana/web3.js';

export type Cluster = 'devnet' | 'testnet' | 'mainnet-beta';

const c = import.meta.env.VITE_CLUSTER;
export const CLUSTER: Cluster = c === 'mainnet-beta' || c === 'mainnet' ? 'mainnet-beta' : c === 'testnet' ? 'testnet' : 'devnet';
export const IS_MAINNET = CLUSTER === 'mainnet-beta';
export const RPC_URL: string = import.meta.env.VITE_RPC_URL || clusterApiUrl(CLUSTER);

/** Wallet sign-in is optional and ON by default (guests can still play). Signed-in players get saved stats and a place on the leaderboard.
 *  Set VITE_WALLET_LOGIN=0 to hide it everywhere; on phones and tablets without a wallet app it is hidden automatically. */
const walletOn = import.meta.env.VITE_WALLET_LOGIN !== '0';
/** A phone or tablet browser has no wallet extension, so the wallet buttons are hidden there (the Phantom app's own browser injects one, and still shows them). */
const touchBrowser = (() => {
  try {
    return !!window.matchMedia?.('(pointer: coarse)').matches || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  } catch {
    return false;
  }
})();
const hasInjectedWallet = typeof window !== 'undefined' && !!((window as unknown as { solana?: unknown }).solana || (window as unknown as { phantom?: unknown }).phantom);
export const WALLET_LOGIN = walletOn && (!touchBrowser || hasInjectedWallet);
