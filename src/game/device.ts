// Which controls the player uses: a keyboard and mouse, or a touch screen (phone / tablet). Asked once on the first visit, remembered, changeable in the lobby.
export type Device = 'pc' | 'touch';
const KEY = 'frontline-device';

/** A guess from the hardware: a touch screen as the main pointer, or an iPad (which calls itself a Mac). */
export function detectDevice(): Device {
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    const ipad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    if (coarse || ipad || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'touch';
  } catch {
    /* no matchMedia: assume a computer */
  }
  return 'pc';
}

/** What the player chose before, or null if they have not been asked yet. */
export function savedDevice(): Device | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'pc' || v === 'touch' ? v : null;
  } catch {
    return null;
  }
}

export function saveDevice(d: Device) {
  try {
    localStorage.setItem(KEY, d);
  } catch {
    /* private mode: it is asked again next time */
  }
}
