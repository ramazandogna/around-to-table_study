import type { Activity, Doing, Emote, Mood } from '@att/shared';

export const ACTIVITY_ICON: Record<Activity, string> = {
  focus: '☕',
  reading: '📖',
  online: '💻',
  quiet: '🌙',
};

export const DOING_ICON: Record<Doing, string> = {
  studying: '📚',
  reading: '📖',
  working: '💼',
  writing: '✍️',
  coding: '💻',
  drawing: '🎨',
  resting: '🛋️',
  team: '🤝',
};

export const MOOD_ICON: Record<Mood, string> = {
  happy: '😊',
  calm: '🍃',
  focused: '🎯',
  tired: '😴',
  sad: '🌧️',
  excited: '✨',
  anxious: '😬',
};

export const EMOTE_ICON: Record<Emote, string> = {
  wave: '👋',
  laugh: '😂',
  heart: '❤️',
  sleepy: '💤',
  thinking: '🤔',
  cheer: '🎉',
  sad: '😢',
  coffee: '☕',
};

/** "24:05", or "1:02:09" from an hour up. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(hours ? 2 : 1, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
