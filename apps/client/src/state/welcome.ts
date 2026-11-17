import { t } from '../i18n/t';
import { readJson } from '../net/storage';
import { useGameStore } from './store';
import { formatDuration, todayStats, type Stats } from './stats';

const SHOWN_KEY = 'att.welcomed';

const dayOf = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * One short line for someone coming back: "Welcome back · 25m yesterday ·
 * streak 3". Null for a first visit (the welcome note covers that one).
 */
export function welcomeLine(stats: Stats, introSeen: boolean, now = Date.now()): string | null {
  const earlier = stats.focusMs > 0 ? { day: stats.day, focusMs: stats.focusMs } : stats.prev;
  if (!introSeen && !earlier) return null;
  const parts = [t('welcome.back')];
  if (earlier && earlier.focusMs >= 60_000) {
    const when =
      earlier.day === dayOf(now)
        ? 'today'
        : earlier.day === dayOf(now - 24 * 60 * 60_000)
          ? 'yesterday'
          : 'last';
    parts.push(t(`welcome.${when}`, { time: formatDuration(earlier.focusMs) }));
  }
  if (stats.streak >= 1) parts.push(t('welcome.streak', { n: stats.streak }));
  return parts.join(' · ');
}

/** Says it once per tab, when the character walks in (not again after a reload or a language switch). */
export function sayWelcomeBack(): void {
  try {
    if (sessionStorage.getItem(SHOWN_KEY)) return;
    sessionStorage.setItem(SHOWN_KEY, '1');
  } catch {
    // Without storage it may repeat; harmless.
  }
  const line = welcomeLine(todayStats(), readJson<boolean>('att.intro') === true);
  if (line) useGameStore.getState().setNotice('welcome_back', line);
}
