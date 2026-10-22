import { useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Play from './pages/Play';
import Splash from './pages/Splash';
import { WALLET_LOGIN } from './config';

export default function App() {
  const [entered, setEntered] = useState(false);
  if (!entered) return <Splash onEnter={() => setEntered(true)} />;
  return (
    <>
      <header className="top">
        <a className="brand" href="/">The Ruins</a>
        {WALLET_LOGIN && <WalletMultiButton />}
      </header>
      <main>
        <Play />
      </main>
      <footer className="foot muted small">A browser game. Be kind out there.</footer>
    </>
  );
}
