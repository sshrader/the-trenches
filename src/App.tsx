import { useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Play from './pages/Play';
import Splash from './pages/Splash';
import { WALLET_LOGIN } from './config';

export default function App() {
  // The briefing splash shows on a visitor's first visit only; the "How to play" footer link (/?intro) brings it back.
  const [entered, setEntered] = useState(() => {
    try {
      return localStorage.getItem('ruins-splash-seen') === '1' && !location.search.includes('intro');
    } catch {
      return false;
    }
  });
  const enter = () => {
    try {
      localStorage.setItem('ruins-splash-seen', '1');
    } catch {
      /* private window: the splash will show again next time */
    }
    setEntered(true);
  };
  if (!entered) return <Splash onEnter={enter} />;
  return (
    <>
      <header className="top">
        <a className="brand" href="/">Frontline</a>
        {WALLET_LOGIN && <WalletMultiButton />}
      </header>
      <main>
        <Play />
      </main>
      <footer className="foot muted small">A browser game. Be kind out there. · <a href="/?intro">How to play</a></footer>
    </>
  );
}
