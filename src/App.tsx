import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Play from './pages/Play';
import { WALLET_LOGIN } from './config';

export default function App() {
  return (
    <>
      <header className="top">
        <a className="brand" href="/">The Trenches</a>
        {WALLET_LOGIN && <WalletMultiButton />}
      </header>
      <main>
        <Play />
      </main>
      <footer className="foot muted small">A browser game. Be kind in the trenches.</footer>
    </>
  );
}
