// Some Solana libraries expect Node's Buffer to exist in the browser.
// The trailing slash matters: 'buffer' alone resolves to Node's built-in module, which Vite
// strips out for the browser. 'buffer/' loads the npm package of the same name.
import { Buffer } from 'buffer/';

const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;
