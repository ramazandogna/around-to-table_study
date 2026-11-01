import { readJson, writeJson } from '../net/storage';
import { audioOut } from './sound';

/**
 * Music for events, played on the spot like the sounds: a soft lo-fi loop of
 * four jazzy chords with a gentle beat for the weekly meetup, and a brighter
 * one for festive days. Nothing to download or license. It only plays while
 * the player is in a room with an event on, and it has its own switch.
 */
export type MusicStyle = 'lofi' | 'festive';

const MUSIC_KEY = 'att.music';
const LOOKAHEAD_S = 0.6;

/** Four chords as note numbers (MIDI), each a bar long. */
const PROGRESSIONS: Record<MusicStyle, { bpm: number; chords: number[][]; volume: number }> = {
  lofi: {
    bpm: 74,
    chords: [
      [48, 55, 59, 64],
      [45, 52, 55, 60],
      [50, 57, 60, 65],
      [43, 50, 53, 59],
    ],
    volume: 0.05,
  },
  festive: {
    bpm: 108,
    chords: [
      [48, 55, 60, 64],
      [53, 57, 60, 65],
      [55, 59, 62, 67],
      [48, 55, 60, 64],
    ],
    volume: 0.05,
  },
};

let enabled = readJson<boolean>(MUSIC_KEY) ?? true;
let playing: MusicStyle | null = null;
let timer = 0;
let nextBeat = 0;
let beat = 0;
let bus: GainNode | null = null;

const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

export function isMusicOn(): boolean {
  return enabled;
}

export function setMusicOn(on: boolean): void {
  enabled = on;
  writeJson(MUSIC_KEY, on);
  if (!on) stopMusic();
}

/** Starts a style (or keeps it going); does nothing while music or all sound is off. */
export function playMusic(style: MusicStyle): void {
  if (!enabled) return;
  // Already playing: just wake the sound up if it was paused (e.g. after unmuting).
  if (playing === style) return void audioOut();
  stopMusic();
  const out = audioOut();
  if (!out) return;
  const { ctx } = out;
  bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, ctx.currentTime);
  bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2);
  bus.connect(out.out);
  playing = style;
  beat = 0;
  nextBeat = ctx.currentTime + 0.1;
  timer = window.setInterval(() => schedule(ctx), 150);
}

export function stopMusic(): void {
  window.clearInterval(timer);
  timer = 0;
  playing = null;
  if (bus) {
    const fading = bus;
    const ctx = fading.context;
    fading.gain.cancelScheduledValues(ctx.currentTime);
    fading.gain.setValueAtTime(fading.gain.value, ctx.currentTime);
    fading.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    window.setTimeout(() => fading.disconnect(), 1000);
  }
  bus = null;
}

/** Queues the beats that fall in the next moment, so timers never make it stutter. */
function schedule(ctx: BaseAudioContext): void {
  if (!playing || !bus) return;
  const song = PROGRESSIONS[playing];
  const step = 60 / song.bpm / 2;
  while (nextBeat < ctx.currentTime + LOOKAHEAD_S) {
    const chord = song.chords[Math.floor(beat / 8) % song.chords.length] ?? [];
    const inBar = beat % 8;
    if (inBar === 0) {
      // A soft pad for the bar, and the root low under it.
      for (const note of chord.slice(1))
        pad(ctx, frequency(note), nextBeat, step * 7.5, song.volume);
      pad(ctx, frequency((chord[0] ?? 48) - 12), nextBeat, step * 3.5, song.volume * 1.6, 'sine');
    }
    if (inBar === 4)
      pad(ctx, frequency((chord[0] ?? 48) - 12), nextBeat, step * 3.5, song.volume * 1.4, 'sine');
    if (inBar % 4 === 0) kick(ctx, nextBeat, song.volume * 3);
    if (inBar % 2 === 1) hat(ctx, nextBeat, song.volume * (inBar === 3 || inBar === 7 ? 1.4 : 0.8));
    // A few plucked notes from the chord, swung a little, now and then.
    if (playing === 'lofi' && (inBar === 2 || inBar === 5) && Math.random() < 0.7) {
      const note = chord[1 + Math.floor(Math.random() * 3)] ?? 60;
      pad(
        ctx,
        frequency(note + 12),
        nextBeat + step * 0.12,
        step * 1.6,
        song.volume * 0.9,
        'triangle',
      );
    }
    nextBeat += step;
    beat++;
  }
}

function pad(
  ctx: BaseAudioContext,
  hz: number,
  at: number,
  length: number,
  volume: number,
  type: OscillatorType = 'triangle',
): void {
  if (!bus) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  osc.type = type;
  osc.frequency.value = hz;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.06);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(filter).connect(gain).connect(bus);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

function kick(ctx: BaseAudioContext, at: number, volume: number): void {
  if (!bus) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(110, at);
  osc.frequency.exponentialRampToValueAtTime(42, at + 0.18);
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  osc.connect(gain).connect(bus);
  osc.start(at);
  osc.stop(at + 0.25);
}

function hat(ctx: BaseAudioContext, at: number, volume: number): void {
  if (!bus) return;
  const length = Math.floor(ctx.sampleRate * 0.03);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(bus);
  source.start(at);
}
