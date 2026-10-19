// Quiet, synthesized rifle shots. Nothing is downloaded: the sound is built in the browser from noise and a low thump,
// so there are no files or licences to worry about. Only gunfire plays, kept low, and fainter the farther away it is.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let muted = false;
let volume = 0.22; // master level: deliberately low
let recent: number[] = [];

try {
  muted = localStorage.getItem('trenches-muted') === '1';
} catch {
  /* private window: not remembered */
}

/** Call from a click (joining the game). Browsers only allow sound after a user action. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null; // no sound, the game still works
  }
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('trenches-muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** A grenade going off, `dist` pixels away. Deeper and a little longer than a rifle shot, still quiet. */
export function playBoom(dist: number, big = false) {
  if (muted || !ctx || !noise || ctx.state !== 'running') return;
  const m = big ? 2.2 : 1; // an artillery shell is much bigger and longer
  const v = (volume * 1.2 * m) / (1 + dist / (big ? 900 : 420));
  if (v < 0.012) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = (big ? 0.34 : 0.5) + Math.random() * 0.06;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 500 / (1 + dist / 600) + 160;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 1.1 : 0.55));
  src.connect(low).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + (big ? 1.2 : 0.6));
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(big ? 55 : 75, t);
  osc.frequency.exponentialRampToValueAtTime(big ? 20 : 28, t + (big ? 0.8 : 0.35));
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(v * 0.9, t + 0.01);
  og.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 1.0 : 0.4));
  osc.connect(og).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + (big ? 1.05 : 0.45));
}

/** The gun firing, heard from `dist` px away: a flat crack and a heavy thump. */
export function playCannon(dist: number) {
  if (muted || !ctx || !noise || ctx.state !== 'running') return;
  const v = (volume * 1.4) / (1 + dist / 1100);
  if (v < 0.012) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.7;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900 / (1 + dist / 900) + 200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.5);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(95, t);
  osc.frequency.exponentialRampToValueAtTime(34, t + 0.3);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(v, t + 0.01);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  osc.connect(og).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.55);
}

/** The shell coming down: a falling whistle lasting `secs`, louder the closer it lands. */
export function playWhistle(dist: number, secs: number) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const v = (volume * 0.5) / (1 + dist / 500);
  if (v < 0.008) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(2100, t);
  osc.frequency.exponentialRampToValueAtTime(520, t + secs);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + secs * 0.7);
  g.gain.linearRampToValueAtTime(0.0001, t + secs);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + secs + 0.05);
}

/** A soft double click for picking up a resupply. */
export function playPickup() {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  for (const [i, hz] of [520, 780].entries()) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + i * 0.09);
    g.gain.exponentialRampToValueAtTime(volume * 0.5, t + i * 0.09 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.12);
    o.connect(g).connect(ctx.destination);
    o.start(t + i * 0.09);
    o.stop(t + i * 0.09 + 0.15);
  }
}

/** One rifle shot, `dist` pixels away from you. Far shots are quieter and duller. */
/** `kind`: 0 rifle, 1 SMG (lighter and snappier), 2 pistol (thin). */
export function playShot(dist: number, kind = 0) {
  if (muted || !ctx || !noise || ctx.state !== 'running') return;
  const now = performance.now();
  recent = recent.filter((t) => now - t < 150);
  if (recent.length >= 8) return; // a crowd firing at once must not turn into a wall of noise
  recent.push(now);

  const v = (volume * [1, 0.7, 0.75][kind]) / (1 + dist / 260);
  if (v < 0.01) return;
  const t = ctx.currentTime;
  const near = 1 / (1 + dist / 400);

  // The crack: a short burst of noise, shaped by distance.
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.9 + Math.random() * 0.25 + [0, 0.35, 0.55][kind];
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 700 + 1800 * near;
  band.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + [0.16, 0.08, 0.11][kind] + (1 - near) * 0.12);
  src.connect(band).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.35);

  // The thump: a low tone that drops quickly.
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(130, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(v * 0.7, t + 0.004);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  osc.connect(og).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.2);
}

/** A quiet mechanical click: a very short filtered noise burst at `when` (seconds from now). */
function click(when: number, hz: number, v: number, len = 0.035) {
  if (!ctx || !noise) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 1.5;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = hz;
  f.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + len + 0.02);
}

/** Reloading, heard from `dist` px away. Rifle: bolt open, rounds loaded, bolt shut. SMG/pistol: magazine out, slap in. */
export function playReload(dist: number, kind = 0) {
  if (muted || !ctx || !noise || ctx.state !== 'running') return;
  const v = (volume * 0.9) / (1 + dist / 220);
  if (v < 0.01) return;
  if (kind === 0) {
    click(0, 1400, v); // bolt lifts
    click(0.12, 900, v * 0.8, 0.05); // and draws back
    for (let i = 0; i < 4; i++) click(0.6 + i * 0.28, 2200, v * 0.7, 0.025); // rounds pushed into the magazine
    click(1.75, 1000, v, 0.05); // bolt forward
    click(1.85, 1700, v * 0.9, 0.04); // and locked down
  } else {
    click(0.05, 1200, v, 0.04); // release
    click(0.35, 800, v * 0.7, 0.07); // magazine drops out
    click(1.2, 1000, v * 0.8, 0.07); // new magazine
    click(1.35, 1900, v, 0.045); // seated
    click(1.8, 1500, v * 0.8, 0.04); // slide / cocking
  }
}
