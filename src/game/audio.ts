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
export function playBoom(dist: number) {
  if (muted || !ctx || !noise || ctx.state !== 'running') return;
  const v = (volume * 1.2) / (1 + dist / 420);
  if (v < 0.012) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.5 + Math.random() * 0.1;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 500 / (1 + dist / 600) + 160;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  src.connect(low).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.6);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(75, t);
  osc.frequency.exponentialRampToValueAtTime(28, t + 0.35);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(v * 0.9, t + 0.01);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  osc.connect(og).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.45);
}

/** One rifle shot, `dist` pixels away from you. Far shots are quieter and duller. */
export function playShot(dist: number) {
  if (muted || !ctx || !noise || ctx.state !== 'running') return;
  const now = performance.now();
  recent = recent.filter((t) => now - t < 150);
  if (recent.length >= 8) return; // a crowd firing at once must not turn into a wall of noise
  recent.push(now);

  const v = volume / (1 + dist / 260);
  if (v < 0.01) return;
  const t = ctx.currentTime;
  const near = 1 / (1 + dist / 400);

  // The crack: a short burst of noise, shaped by distance.
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.9 + Math.random() * 0.25;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 700 + 1800 * near;
  band.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16 + (1 - near) * 0.12);
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
