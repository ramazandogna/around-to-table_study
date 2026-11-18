import type { AreaId, Weather } from '@att/shared';
import { readJson, writeJson } from '../net/storage';
import { audioOut, isMuted } from './sound';
import {
  bedLevels,
  bedShare,
  cafeGap,
  hasCafe,
  hasPages,
  nearness,
  newPageState,
  nextPageTurn,
  type Beds,
} from './soundscapePlan';

/**
 * Each room's quiet background, made on the spot with Web Audio like the other
 * sounds (no files): the library's room tone, a clock and a page turning now
 * and then for each person really studying there; the smoking room's murmur,
 * coffee machine and glasses; the hall's street, and a door when someone comes
 * in; the conference hall's air. Rain joins in when the building's weather
 * says so.
 *
 * It has its own "Ambience" switch (on by default, and low), follows the
 * game's mute, goes silent while the tab is in the background and falls to
 * near nothing while any music plays. It starts only after the player has
 * touched or typed something, as browsers ask.
 */

const AMBIENCE_KEY = 'att.ambience';
/** The whole soundscape's level under the game's master volume: low, well under the effects. */
const LEVEL = 0.6;
/** How loud each bed is at its full level, before `LEVEL`. */
const BED_GAIN: Beds = { tone: 0.018, murmur: 0.03, traffic: 0.06, rain: 0.03 };
/** Seconds a change of level takes to settle, so nothing jumps. */
const SMOOTH = 0.8;
const TICK_MS = 500;

type Graph = {
  ctx: AudioContext;
  bus: GainNode;
  beds: Record<keyof Beds, GainNode>;
  noise: AudioBuffer;
  sources: AudioScheduledSourceNode[];
};

let on = readJson<boolean>(AMBIENCE_KEY) ?? true;
let graph: Graph | null = null;
let unlocked = false;
let area: AreaId | null = null;
let weather: Weather = 'clear';
let people = 1;
let focusing: string[] = [];
let coffeeDistance = Infinity;
const music = new Set<string>();
const pages = newPageState();
let timer = 0;
let nextTick = 0;
let nextHiss = 0;
let nextClink = 0;
let seconds = 0;
let lastShare = -1;

export function isAmbienceOn(): boolean {
  return on;
}

export function setAmbienceOn(value: boolean): void {
  on = value;
  writeJson(AMBIENCE_KEY, value);
  if (value) wake();
  apply();
}

/** Which room the player is in; null when out of the building. */
export function setSoundRoom(next: AreaId | null): void {
  area = next;
  apply();
}

export function setSoundWeather(next: Weather): void {
  weather = next;
  apply();
}

/** How many people are in the room, and who of them is in a focus block right now. */
export function setRoomPeople(count: number, studying: readonly string[]): void {
  people = count;
  focusing = [...studying];
  apply();
}

/** How far the player stands from the coffee machine, in tiles (Infinity when there is none). */
export function setCoffeeDistance(distance: number): void {
  coffeeDistance = distance;
}

/**
 * Music started or stopped somewhere (`source` names it: the jukebox, the
 * room's calm music, an event's music); the beds duck while any plays.
 */
export function setMusicPlaying(source: string, playing: boolean): void {
  if (playing) music.add(source);
  else music.delete(source);
  apply();
}

/** The street door opening and closing: someone came into the hall. */
export function doorWhoosh(): void {
  const g = live();
  if (!g || area !== 'hall') return;
  burst(g, { from: 300, peak: 1400, length: 1.3, volume: 0.035, type: 'lowpass' });
}

/** The coffee machine at work (now and then, or when someone takes a coffee). */
export function coffeeHiss(volume = 1): void {
  const g = live();
  if (!g || !hasCafe(area ?? 'hall')) return;
  burst(g, { from: 2600, peak: 3200, length: 2.4, volume: 0.014 * volume, type: 'highpass' });
}

/** What the soundscape is doing, for tests and the curious (no sound needed to read it). */
export function soundscapeState(): {
  built: boolean;
  running: boolean;
  share: number;
  area: AreaId | null;
  weather: Weather;
  beds: Beds | null;
  focusing: number;
  music: string[];
} {
  return {
    built: graph !== null,
    running: timer !== 0,
    share: share(),
    area,
    weather,
    beds: area ? bedLevels(area, weather, people) : null,
    focusing: focusing.length,
    music: [...music],
  };
}

/** Waits for the first touch or key, then starts; call once when the game opens. */
export function initSoundscape(): void {
  if (typeof window === 'undefined') return;
  const start = () => {
    unlocked = true;
    window.removeEventListener('pointerdown', start);
    window.removeEventListener('keydown', start);
    wake();
  };
  window.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sleep();
    else wake();
    apply();
  });
}

function share(): number {
  return bedShare({
    on,
    muted: isMuted(),
    hidden: typeof document !== 'undefined' && document.hidden,
    music: music.size > 0,
  });
}

/** The graph, if it is built and should be making sound now. */
function live(): Graph | null {
  if (!graph || share() === 0 || graph.ctx.state !== 'running') return null;
  return graph;
}

function wake(): void {
  if (!unlocked || document.hidden) return;
  if (!graph && on && !isMuted()) graph = build();
  if (!timer) timer = window.setInterval(tick, TICK_MS);
  apply();
}

function sleep(): void {
  window.clearInterval(timer);
  timer = 0;
}

/** Builds the beds once: looped noise through filters, each into its own level. */
function build(): Graph | null {
  const out = audioOut();
  if (!out) return null;
  const { ctx } = out;
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(out.out);
  // Four seconds of soft noise, looped by every bed (each filters it its own way).
  const length = ctx.sampleRate * 4;
  const noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    // A little brown in it, so it sounds like air rather than hiss.
    brown = (brown + 0.02 * white) / 1.02;
    data[i] = white * 0.5 + brown * 3;
  }
  const sources: AudioScheduledSourceNode[] = [];
  const bed = (filters: { type: BiquadFilterType; frequency: number; q?: number }[]) => {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    // Each bed starts at a different place in the loop, so they never line up.
    source.start(0, Math.random() * 4);
    sources.push(source);
    let node: AudioNode = source;
    for (const f of filters) {
      const filter = ctx.createBiquadFilter();
      filter.type = f.type;
      filter.frequency.value = f.frequency;
      if (f.q !== undefined) filter.Q.value = f.q;
      node.connect(filter);
      node = filter;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain).connect(bus);
    return gain;
  };
  const beds = {
    tone: bed([{ type: 'lowpass', frequency: 280 }]),
    murmur: bed([
      { type: 'bandpass', frequency: 420, q: 0.9 },
      { type: 'lowpass', frequency: 900 },
    ]),
    traffic: bed([{ type: 'lowpass', frequency: 130 }]),
    rain: bed([
      { type: 'highpass', frequency: 900 },
      { type: 'lowpass', frequency: 5200 },
    ]),
  };
  // Talk rises and falls, and the traffic comes in waves.
  const sway = (target: AudioParam, rate: number, depth: number) => {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const amount = ctx.createGain();
    amount.gain.value = depth;
    lfo.connect(amount).connect(target);
    lfo.start();
    sources.push(lfo);
  };
  sway(beds.murmur.gain, 0.23, BED_GAIN.murmur * 0.35);
  sway(beds.traffic.gain, 0.06, BED_GAIN.traffic * 0.4);
  return { ctx, bus, beds, noise, sources };
}

/** Sets every level to what the room, the weather, the switch and the music say. */
function apply(): void {
  const g = graph;
  if (!g) return;
  const now = g.ctx.currentTime;
  g.bus.gain.setTargetAtTime(LEVEL * share(), now, SMOOTH / 3);
  const levels = area ? bedLevels(area, weather, people) : null;
  for (const key of Object.keys(g.beds) as (keyof Beds)[]) {
    const level = levels ? levels[key] * BED_GAIN[key] : 0;
    g.beds[key].gain.setTargetAtTime(level, now, SMOOTH);
  }
}

/** Twice a second: the clock, the pages, the café's little noises. */
function tick(): void {
  seconds += TICK_MS / 1000;
  // Sound turned back on (the switch, or the game's mute): build or wake the graph.
  if (on && !isMuted()) {
    if (!graph) graph = build();
    else if (graph.ctx.state === 'suspended') audioOut();
  }
  const level = share();
  if (level !== lastShare) {
    lastShare = level;
    apply();
  }
  const g = live();
  if (!g || !area) return;
  if (hasPages(area)) {
    if (seconds >= nextTick) {
      // A wall clock, very quiet: tick… tock.
      nextTick = Math.floor(seconds) + 1;
      blip(g, Math.floor(seconds) % 2 ? 2100 : 1800, 0.004);
    }
    if (nextPageTurn(pages, performance.now(), focusing)) pageTurn(g);
  }
  if (hasCafe(area)) {
    if (nextHiss === 0) nextHiss = seconds + cafeGap('hiss');
    if (nextClink === 0) nextClink = seconds + cafeGap('clink');
    if (seconds >= nextHiss) {
      nextHiss = seconds + cafeGap('hiss');
      coffeeHiss(nearness(coffeeDistance));
    }
    if (seconds >= nextClink) {
      nextClink = seconds + cafeGap('clink');
      blip(g, 2350, 0.008, 0.35);
      blip(g, 3130, 0.005, 0.3, 0.07);
    }
  }
}

/** A short, soft tone: the clock's tick, a glass. */
function blip(g: Graph, frequency: number, volume: number, length = 0.03, at = 0): void {
  const start = g.ctx.currentTime + at;
  const osc = g.ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = frequency;
  const gain = g.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(g.bus);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** A page turning: a quick papery swish rising through the middle. */
function pageTurn(g: Graph): void {
  burst(g, { from: 900, peak: 3200, length: 0.45, volume: 0.02, type: 'bandpass' });
}

/** A burst of the noise through a filter that sweeps up and back: swishes, whooshes, hisses. */
function burst(
  g: Graph,
  {
    from,
    peak,
    length,
    volume,
    type,
  }: { from: number; peak: number; length: number; volume: number; type: BiquadFilterType },
): void {
  const { ctx } = g;
  const start = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = g.noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(peak, start + length * 0.4);
  filter.frequency.exponentialRampToValueAtTime(from, start + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + length * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  source.connect(filter).connect(gain).connect(g.bus);
  source.start(start, Math.random() * 3);
  source.stop(start + length + 0.05);
}
