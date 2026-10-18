// Protects the free model quota. Everything here is in memory and resets when the server restarts.

const hits = new Map();

// Allow at most `max` calls per `windowMs` for this key (for example one visitor's IP address).
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (!v.some((t) => now - t < 3_600_000)) hits.delete(k);
}, 600_000).unref();

// A shared daily allowance of model calls. Lore posts pass a reserve so chat always has room.
let day = '';
let used = 0;
const today = () => new Date().toISOString().slice(0, 10);

export function takeBudget(dailyLimit, reserveFraction = 0) {
  if (day !== today()) {
    day = today();
    used = 0;
  }
  if (used >= dailyLimit * (1 - reserveFraction)) return false;
  used += 1;
  return true;
}

export const budgetUsed = () => (day === today() ? used : 0);
