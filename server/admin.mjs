// Admin passwords: ADMIN_TOKEN and an optional second one, ADMIN_TOKEN_2 (for example one for you and one for a helper, so either can be changed alone).
// Each must be 12+ characters; a shorter one is ignored. The comparison takes the same time however much of it is right.
import crypto from 'node:crypto';

const tokens = () => [process.env.ADMIN_TOKEN, process.env.ADMIN_TOKEN_2].map((t) => String(t || '')).filter((t) => t.length >= 12);

/** Is this string one of the admin passwords? */
export function isAdminToken(got) {
  const g = String(got ?? '');
  let ok = false;
  for (const want of tokens()) {
    // compare hashes, so the lengths always match and nothing leaks through timing
    const a = crypto.createHash('sha256').update(g).digest();
    const b = crypto.createHash('sha256').update(want).digest();
    if (crypto.timingSafeEqual(a, b)) ok = true;
  }
  return ok;
}

/** Are admin routes switched on at all (at least one valid password set)? */
export const adminEnabled = () => tokens().length > 0;
