// Gun and grenade sounds are real recordings (src/assets/sfx). They load after the first click; until then, or if a file fails,
// the synthesized versions below play instead. Quiet, synthesized rifle shots. Nothing is downloaded: the sound is built in the browser from noise and a low thump,
// so there are no files or licences to worry about. Only gunfire plays, kept low, and fainter the farther away it is.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let muted = false;
let volume = 0.22; // master level: deliberately low
let recent: number[] = [];

const SFX_URLS: Record<string, string> = {
  ar: new URL('../assets/sfx/ar.mp3', import.meta.url).href,
  smg: new URL('../assets/sfx/smg.mp3', import.meta.url).href,
  pistol: new URL('../assets/sfx/pistol.mp3', import.meta.url).href,
  shotgun: new URL('../assets/sfx/shotgun.mp3', import.meta.url).href,
  reload: new URL('../assets/sfx/reload.mp3', import.meta.url).href,
  shotgun_reload: new URL('../assets/sfx/shotgun_reload.mp3', import.meta.url).href,
  grenade: new URL('../assets/sfx/grenade.mp3', import.meta.url).href,
  helicopter: new URL('../assets/sfx/helicopter.mp3', import.meta.url).href,
  minigun: new URL('../assets/sfx/minigun.mp3', import.meta.url).href,
};
const samples: Record<string, AudioBuffer> = {};

async function loadSamples(c: AudioContext) {
  await Promise.all(
    Object.entries(SFX_URLS).map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        samples[name] = await c.decodeAudioData(await res.arrayBuffer());
      } catch {
        /* that sound stays synthesized */
      }
    }),
  );
}

/** Play a recording `dist` px away: quieter and duller with distance. Returns false if the file is not loaded (so the caller can synthesize). */
function sample(name: string, dist: number, level: number, rate = 1, falloff = 260): boolean {
  const b = samples[name];
  if (!ctx || !b) return false;
  const v = (volume * level) / (1 + dist / falloff);
  if (v < 0.01) return true; // too far to hear: nothing to synthesize either
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400 + 14000 / (1 + dist / 180);
  const g = ctx.createGain();
  g.gain.value = Math.min(1, v * 1.6);
  src.connect(lp).connect(g).connect(ctx.destination);
  src.start();
  return true;
}

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
    if (!Object.keys(samples).length) void loadSamples(ctx);
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
  if (sample('grenade', dist, big ? 2.4 : 1.5, big ? 0.55 : 1, big ? 900 : 420)) return;
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
/** `kind` is the class index (0 Assault, 1 SMG, 2 Medic, 3 Sniper, 4 Shotgunner, 5 Squad Leader); `sidearm` means he fired his pistol. */
export function playShot(dist: number, cls = 0, sidearm = false) {
  if (muted || !ctx || !noise || ctx.state !== 'running') return;
  const now = performance.now();
  recent = recent.filter((t) => now - t < 150);
  if (recent.length >= 8) return; // a crowd firing at once must not turn into a wall of noise
  recent.push(now);
  const gun = sidearm ? 'pistol' : cls === 1 || cls === 2 ? 'smg' : cls === 4 ? 'shotgun' : 'ar';
  if (sample(gun, dist, { pistol: 0.8, smg: 0.75, shotgun: 0.6, ar: cls === 3 ? 1.3 : 1 }[gun], cls === 3 && !sidearm ? 0.85 : 1)) return;
  const kind = sidearm ? 2 : cls > 4 ? 0 : cls;

  const v = (volume * [1, 0.7, 0.75, 1.3, 1.15][kind]) / (1 + dist / 260);
  if (v < 0.01) return;
  const t = ctx.currentTime;
  const near = 1 / (1 + dist / 400);

  // The crack: a short burst of noise, shaped by distance.
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.9 + Math.random() * 0.25 + [0, 0.35, 0.55, -0.1, -0.05][kind];
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 700 + 1800 * near;
  band.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + [0.16, 0.08, 0.11, 0.26, 0.2][kind] + (1 - near) * 0.12);
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
export function playReload(dist: number, kind = 0, shotgun = false) {
  if (muted || !ctx || !noise || ctx.state !== 'running') return;
  if (sample(shotgun ? 'shotgun_reload' : 'reload', dist, 0.9, 1, 220)) return;
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

/** A smoke or flash canister going off: the grenade recording, a little softer and higher than a blast. */
export function playPop(dist: number) {
  if (muted || !ctx || ctx.state !== 'running') return;
  sample('grenade', dist, 0.9, 1.25, 380);
}

/** A kill-streak sting: a short rising run of notes (3 kills, 5 kills, 7 kills = more notes and a deeper hit), a little louder when it is yours. */
export function playStreak(n: number, mine = false) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const notes = n >= 7 ? [392, 523, 659, 784, 1047] : n >= 5 ? [392, 523, 659, 784] : [392, 523, 659];
  const vol = volume * (mine ? 0.7 : 0.4);
  notes.forEach((hz, i) => {
    const o = ctx!.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    const f = ctx!.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    const g = ctx!.createGain();
    const at = t + i * 0.085;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + (i === notes.length - 1 ? 0.5 : 0.14));
    o.connect(f).connect(g).connect(ctx!.destination);
    o.start(at);
    o.stop(at + 0.55);
  });
  if (n >= 5) {
    const o = ctx.createOscillator(); // a low thump under it
    o.type = 'sine';
    o.frequency.setValueAtTime(n >= 7 ? 90 : 120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.5);
  }
}

// ---------- attack helicopter: a rotor loop while one is flying, and a minigun loop while it fires ----------
type Loop = { src: AudioBufferSourceNode; g: GainNode };
const loops: Record<string, Loop | undefined> = {};
const lastHeard: Record<string, number> = {};
let watchdog: ReturnType<typeof setInterval> | null = null;

function stopLoop(name: string) {
  const l = loops[name];
  if (!l) return;
  loops[name] = undefined;
  try {
    if (ctx) l.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    l.src.stop((ctx?.currentTime ?? 0) + 0.3);
  } catch {
    /* already stopped */
  }
}

/** Keep a looping recording going at the level that `dist` px away and `level` give; it stops by itself when it is no longer refreshed. */
function keepLoop(name: string, dist: number, level: number) {
  const b = samples[name];
  if (muted || !ctx || !b || ctx.state !== 'running') return stopLoop(name);
  lastHeard[name] = performance.now();
  const v = Math.min(1, ((volume * level) / (1 + dist / 380)) * 1.6);
  let l = loops[name];
  if (!l) {
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.loopStart = 0.05; // mp3 padding at either end would click
    src.loopEnd = Math.max(0.2, b.duration - 0.05);
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g).connect(ctx.destination);
    src.start(0, 0.05);
    l = loops[name] = { src, g };
  }
  l.g.gain.setTargetAtTime(v, ctx.currentTime, 0.06);
  watchdog ??= setInterval(() => {
    const t = performance.now();
    for (const n of Object.keys(loops)) if (loops[n] && t - (lastHeard[n] ?? 0) > (n === 'minigun' ? 200 : 600)) stopLoop(n);
  }, 100);
}

/** Call with how far away the nearest flying helicopter is (px), or null when none is in sight. */
export function heliRotor(dist: number | null) {
  if (dist === null) stopLoop('helicopter');
  else keepLoop('helicopter', dist, 1.5);
}

/** A helicopter minigun shot was heard `dist` px away. */
export function heliGun(dist: number) {
  keepLoop('minigun', dist, 1.1);
}

/** The train's warning: two blasts of a deep horn. */
export function playTrainHorn() {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  for (const [at, len] of [[0, 0.7], [0.9, 1.1]]) {
    for (const hz of [196, 247, 294]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.linearRampToValueAtTime(volume * 0.16, t + at + 0.05);
      g.gain.setValueAtTime(volume * 0.16, t + at + len - 0.12);
      g.gain.linearRampToValueAtTime(0.0001, t + at + len);
      o.connect(f).connect(g).connect(ctx.destination);
      o.start(t + at);
      o.stop(t + at + len + 0.05);
    }
  }
}

/** The train going past: a low rumble of filtered noise that swells and fades over about 4 s. */
export function playTrainPass() {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const secs = 4.2;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; // brown-ish noise
    d[i] = last * 6;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 260;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(volume * 0.9, t + 1.2);
  g.gain.linearRampToValueAtTime(volume * 0.9, t + 2.8);
  g.gain.linearRampToValueAtTime(0.0001, t + secs);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}
