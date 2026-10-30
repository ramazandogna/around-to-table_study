import { AREA_RULES, containsLink, looksTurkish, quietCase } from '@att/shared';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';

/**
 * Bottom chat input. Enter focuses it from the game; Escape gives the keyboard back.
 * It follows the area's rules: length, no caps and no links in the library, and a
 * countdown on the send button while the player has to wait.
 */
export function ChatBar() {
  const connection = useGameStore((s) => s.connection);
  const area = useGameStore((s) => s.area);
  const cooldownUntil = useGameStore((s) => s.cooldownUntil[s.area] ?? 0);
  const setTyping = useGameStore((s) => s.setTyping);
  const [text, setText] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  const rules = AREA_RULES[area];
  const waitMs = Math.max(0, cooldownUntil - now);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Dialogs use Enter to confirm.
      const { sitStep, wardrobeOpen } = useGameStore.getState();
      if (sitStep || wardrobeOpen) return;
      if (event.key === 'Enter' && document.activeElement !== input.current) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Refresh the clock whenever the wait changes (also after switching areas), then tick while waiting.
  useEffect(() => {
    const update = () => setNow(Date.now());
    const first = window.setTimeout(update, 0);
    const tick = window.setInterval(() => {
      update();
      if (Date.now() >= cooldownUntil) window.clearInterval(tick);
    }, 250);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(tick);
    };
  }, [cooldownUntil]);

  // The typed text is kept as is and only shown lowercase, so a Turkish word is lowercased
  // correctly even when its Turkish letters come after an "I".
  function change(value: string) {
    setText(value);
    if (!rules.allowCaps && value !== quietCase(value)) {
      useGameStore.getState().setNotice('quiet_caps');
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = (rules.allowCaps ? text : quietCase(text)).trim();
    if (!message || waitMs > 0) return;
    if (!rules.allowLinks && containsLink(message)) {
      useGameStore.getState().setNotice('link_blocked');
      return;
    }
    connection?.say(message);
    useGameStore.getState().setCooldown(area, Date.now() + rules.cooldownMs);
    setText('');
    input.current?.blur();
  }

  const waiting = waitMs > 0;
  const quiet = !rules.allowCaps;
  // The clock empties as the wait runs out; short waits elsewhere are not worth drawing.
  const ring = waiting && rules.cooldownMs >= 10_000 ? waitMs / rules.cooldownMs : 0;

  return (
    <form className="chat-bar" onSubmit={submit}>
      <span className="chat-field">
        <input
          ref={input}
          value={text}
          className={quiet ? 'chat-input--quiet' : undefined}
          lang={quiet && looksTurkish(text) ? 'tr' : undefined}
          maxLength={rules.maxChars}
          placeholder={t(quiet ? 'chat.placeholder.quiet' : 'chat.placeholder')}
          aria-label={t('chat.placeholder')}
          enterKeyHint="send"
          onChange={(e) => change(e.target.value)}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          onKeyDown={(e) => e.key === 'Escape' && input.current?.blur()}
        />
        {text && (
          <span className="chat-count" aria-hidden>
            {rules.maxChars - text.length}
          </span>
        )}
      </span>
      <button
        type="submit"
        disabled={!connection || waiting}
        className={ring ? 'chat-send chat-send--waiting' : 'chat-send'}
        style={ring ? ({ '--wait': ring } as CSSProperties) : undefined}
        aria-label={waiting ? t('chat.wait') : t('chat.send')}
      >
        {waiting ? Math.ceil(waitMs / 1000) : t('chat.send')}
      </button>
    </form>
  );
}
