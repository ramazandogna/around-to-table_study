import { ref, watch } from 'vue';

/**
 * The game's footsteps on the page: a soft pat when the pointer lands on
 * something that moves, and a firmer step on a click. Made the way the game
 * makes them (a short burst of filtered noise), so nothing is downloaded.
 * Browsers keep sound off until the first click or tap, so the first hover
 * sounds stay silent; the speaker in the bar turns them all off.
 */
const KEY = 'att-site.sound';

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export const soundOn = ref(stored());
watch(soundOn, (on) => {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Not kept; on next time.
  }
});

let ctx: AudioContext | null = null;
let side = 0;
let last = 0;

function out(): AudioContext | null {
  if (!soundOn.value) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx.state === 'running' ? ctx : null;
}

function thump(volume: number, pitch: number, type: BiquadFilterType): void {
  const a = out();
  if (!a) return;
  const length = Math.floor(a.sampleRate * 0.06);
  const buffer = a.createBuffer(1, length, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const source = a.createBufferSource();
  source.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = pitch;
  const gain = a.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(a.destination);
  source.start();
}

/** A soft step, the game's "soft" footsteps; never more than one every 90 ms. */
export function softStep(): void {
  const now = performance.now();
  if (now - last < 90) return;
  last = now;
  side = 1 - side;
  thump(0.1, 650 + side * 140, 'lowpass');
}

/** A firmer step for a click: the game's wooden floor. */
export function clickStep(): void {
  side = 1 - side;
  thump(0.22, 1300 + side * 180, 'bandpass');
}

/** What counts as alive on the page: links, buttons and the moving cards. */
const ALIVE = 'a, button, .pet, .reason, .step, .feature, .shot-card, [tabindex="0"]';

/** Listens once for the whole page. */
export function listenForSteps(): () => void {
  let current: Element | null = null;
  const over = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const target = (event.target as Element | null)?.closest(ALIVE) ?? null;
    if (target && target !== current) softStep();
    current = target;
  };
  const down = (event: PointerEvent) => {
    if ((event.target as Element | null)?.closest(ALIVE)) clickStep();
    else out();
  };
  window.addEventListener('pointerover', over, { passive: true });
  window.addEventListener('pointerdown', down, { passive: true });
  return () => {
    window.removeEventListener('pointerover', over);
    window.removeEventListener('pointerdown', down);
  };
}
