import { MAX_CHAT_LENGTH } from '@att/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';

/** Bottom chat input. Enter focuses it from the game; Escape gives the keyboard back. */
export function ChatBar() {
  const connection = useGameStore((s) => s.connection);
  const setTyping = useGameStore((s) => s.setTyping);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Dialogs use Enter to confirm.
      if (useGameStore.getState().sitStep) return;
      if (event.key === 'Enter' && document.activeElement !== input.current) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (message) connection?.say(message);
    setText('');
    input.current?.blur();
  }

  return (
    <form className="chat-bar" onSubmit={submit}>
      <input
        ref={input}
        value={text}
        maxLength={MAX_CHAT_LENGTH}
        placeholder={t('chat.placeholder')}
        aria-label={t('chat.placeholder')}
        enterKeyHint="send"
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setTyping(true)}
        onBlur={() => setTyping(false)}
        onKeyDown={(e) => e.key === 'Escape' && input.current?.blur()}
      />
      <button type="submit" disabled={!connection}>
        {t('chat.send')}
      </button>
    </form>
  );
}
