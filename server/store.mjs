// A tiny JSON-file store. Good enough for a prototype. Swap for Postgres/SQLite later.
import fs from 'node:fs/promises';
import path from 'node:path';

// DATA_DIR lets tests use a temporary folder.
const dir = () => path.resolve(process.env.DATA_DIR || 'server/data');

let queue = Promise.resolve();

async function read(name, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir(), name), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

// Updates run one at a time so two requests cannot overwrite each other.
export function update(name, fallback, fn) {
  const run = async () => {
    await fs.mkdir(dir(), { recursive: true });
    const data = await read(name, fallback);
    const next = await fn(data);
    await fs.writeFile(path.join(dir(), name), JSON.stringify(next, null, 2));
    return next;
  };
  const result = queue.then(run);
  queue = result.catch(() => {});
  return result;
}

export const get = (name, fallback) => read(name, fallback);
