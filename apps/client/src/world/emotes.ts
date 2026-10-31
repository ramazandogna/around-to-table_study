import type { Emote } from '@att/shared';

/** How long an emote stays over the head. */
const EMOTE_MS = 2600;
const THINKING_FRAME_MS = 280;

type Motion = 'rise' | 'burst' | 'float' | 'fall';

type Effect = {
  /** The bubble image in /emotes, or several shown in turn. */
  bubble: string | readonly string[];
  /** Little icons that fly out of the bubble. */
  particle?: { image: string; motion: Motion; count: number };
  /** How the bubble itself moves. */
  bubbleMotion?: 'shake' | 'bob';
};

/**
 * Each emote is a pixel bubble from Kenney's Emote Pack (CC0) with an effect of
 * its own: hearts rise, stars burst, z's float off, tears drop.
 */
const EFFECTS: Record<Emote, Effect> = {
  wave: { bubble: 'wave', bubbleMotion: 'bob' },
  laugh: { bubble: 'laugh', bubbleMotion: 'shake' },
  heart: { bubble: 'heart', particle: { image: 'p-heart', motion: 'rise', count: 5 } },
  sleepy: { bubble: 'sleepy', particle: { image: 'p-z', motion: 'float', count: 3 } },
  thinking: { bubble: ['thinking1', 'thinking2', 'thinking3'] },
  cheer: { bubble: 'cheer', particle: { image: 'p-star', motion: 'burst', count: 8 } },
  sad: { bubble: 'sad', particle: { image: 'p-drop', motion: 'fall', count: 3 } },
  coffee: { bubble: 'coffee', bubbleMotion: 'bob' },
};

const src = (image: string) => `emotes/${image}.png`;

/** The picture for an emote, for buttons and menus. */
export function emoteImage(emote: Emote): string {
  const { bubble } = EFFECTS[emote];
  return src(typeof bubble === 'string' ? bubble : (bubble.at(-1) ?? ''));
}

/**
 * Shows an emote in `host` (the slot over someone's head). Subtle emotes (in
 * the library) are small and still. Returns a function that removes it early.
 */
export function showEmote(host: HTMLElement, emote: Emote, subtle: boolean): () => void {
  const effect = EFFECTS[emote];
  const frames = typeof effect.bubble === 'string' ? [effect.bubble] : effect.bubble;
  const bubble = document.createElement('img');
  bubble.className = 'emote-bubble';
  bubble.alt = '';
  bubble.src = src(frames[0] ?? '');
  const motion = !subtle && effect.bubbleMotion ? ` emote-bubble--${effect.bubbleMotion}` : '';
  bubble.className += motion;
  host.className = `avatar-emote avatar-emote--${subtle ? 'subtle' : 'big'}`;
  host.replaceChildren(bubble);

  if (!subtle && effect.particle) {
    const { image, motion: kind, count } = effect.particle;
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('img');
      particle.className = `emote-particle emote-particle--${kind}`;
      particle.alt = '';
      particle.src = src(image);
      // Spread them out: sideways, in time, and a little in size.
      const spread = count > 1 ? i / (count - 1) - 0.5 : 0;
      particle.style.setProperty('--dx', `${Math.round(spread * (kind === 'burst' ? 90 : 36))}px`);
      particle.style.setProperty(
        '--dy',
        `${kind === 'burst' ? Math.round(-30 - Math.cos(spread * Math.PI) * 24) : 0}px`,
      );
      particle.style.setProperty('--delay', `${kind === 'burst' ? 0 : i * 0.28}s`);
      particle.style.setProperty('--size', `${12 + ((i * 7) % 3) * 3}px`);
      host.append(particle);
    }
  }

  let frame = 0;
  const animation =
    frames.length > 1
      ? window.setInterval(() => {
          frame = (frame + 1) % frames.length;
          bubble.src = src(frames[frame] ?? '');
        }, THINKING_FRAME_MS)
      : 0;
  const stop = () => {
    window.clearInterval(animation);
    window.clearTimeout(timer);
    host.className = 'avatar-emote';
    host.replaceChildren();
  };
  const timer = window.setTimeout(stop, EMOTE_MS);
  return stop;
}
