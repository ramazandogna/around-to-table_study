import { readJson, writeJson } from '../net/storage';

/**
 * Small sounds made on the spot with Web Audio, so there are no files to load
 * and nothing to license: a glassy clink for friends, a phone buzz for
 * messages, soft footsteps, a pop for emotes, a chime when the library grows.
 */
export type SoundName = 'clink' | 'phone' | 'step' | 'pop' | 'poke' | 'chime' | 'click';

const MUTED_KEY = 'att.muted';

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readJson<boolean>(MUTED_KEY) ?? false;
let stepSide = 0;

/** Browsers only start audio after the player has touched or typed something. */
function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (muted || typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume();
  return master ? { ctx: context, out: master } : null;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  writeJson(MUTED_KEY, value);
  if (value) void context?.suspend();
}

/** Wakes audio up on the first touch or key, so the first real sound is not lost. */
export function unlockAudio(): void {
  if (!muted && context?.state !== 'running') audio();
}

type Tone = {
  frequency: number;
  /** Seconds after now. */
  at?: number;
  duration: number;
  volume: number;
  type?: OscillatorType;
  /** Where the pitch glides to. */
  to?: number;
};

function tone({ ctx, out }: { ctx: AudioContext; out: GainNode }, t: Tone): void {
  const start = ctx.currentTime + (t.at ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = t.type ?? 'sine';
  osc.frequency.setValueAtTime(t.frequency, start);
  if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(t.volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + t.duration);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + t.duration + 0.02);
}

/** A short burst of filtered noise, for footsteps on wood. */
function thump({ ctx, out }: { ctx: AudioContext; out: GainNode }, volume: number, pitch: number) {
  const length = Math.floor(ctx.sampleRate * 0.06);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = pitch;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(out);
  source.start();
}

export function play(name: SoundName): void {
  const a = audio();
  if (!a) return;
  switch (name) {
    case 'clink':
      // Two glasses touching: bright partials that ring out.
      tone(a, { frequency: 1568, duration: 0.5, volume: 0.22, type: 'triangle' });
      tone(a, { frequency: 2349, duration: 0.42, volume: 0.12 });
      tone(a, { frequency: 2093, at: 0.09, duration: 0.6, volume: 0.18, type: 'triangle' });
      tone(a, { frequency: 3136, at: 0.09, duration: 0.4, volume: 0.08 });
      break;
    case 'phone':
      for (const at of [0, 0.16]) {
        tone(a, { frequency: 880, at, duration: 0.12, volume: 0.16, type: 'square' });
        tone(a, { frequency: 1320, at: at + 0.06, duration: 0.08, volume: 0.08, type: 'square' });
      }
      break;
    case 'step':
      stepSide = 1 - stepSide;
      thump(a, 0.18, 700 + stepSide * 160);
      break;
    case 'pop':
      tone(a, { frequency: 520, duration: 0.12, volume: 0.18, to: 980 });
      break;
    case 'poke':
      tone(a, { frequency: 330, duration: 0.09, volume: 0.2, type: 'triangle', to: 520 });
      tone(a, { frequency: 520, at: 0.1, duration: 0.12, volume: 0.16, type: 'triangle', to: 330 });
      break;
    case 'chime':
      [523, 659, 784, 1047].forEach((frequency, i) =>
        tone(a, { frequency, at: i * 0.11, duration: 0.7, volume: 0.14, type: 'triangle' }),
      );
      break;
    case 'click':
      tone(a, { frequency: 1200, duration: 0.04, volume: 0.08, type: 'square', to: 800 });
      break;
  }
}
