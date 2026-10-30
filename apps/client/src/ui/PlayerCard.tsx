import { AREA_RULES } from '@att/shared';
import { useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { useGameStore, type Selected } from '../state/store';
import { DOING_ICON, MOOD_ICON } from '../state/study';
import { Choice, Panel } from './Panel';

const FRIEND_LABEL = {
  none: 'card.friend',
  incoming: 'card.friend.accept',
  outgoing: 'card.friend.sent',
  friend: 'card.friend.done',
} as const;

/** What you can do with someone after tapping them: poke, whisper and, later, friends and groups. */
export function PlayerCard() {
  const selected = useGameStore((s) => s.selected);
  // A fresh card (and empty whisper) for each person.
  return selected ? <Card key={selected.id} {...selected} /> : null;
}

function Card({ id, name, lines }: Selected) {
  const area = useGameStore((s) => s.area);
  const connection = useGameStore((s) => s.connection);
  const social = useGameStore((s) => s.social);
  const friendship = useGameStore((s) => s.friends.find((f) => f.id === id)?.state ?? null);
  const cooldownUntil = useGameStore((s) => s.cooldownUntil[s.area] ?? 0);
  const store = useGameStore.getState();
  const rules = AREA_RULES[area];
  const [whispering, setWhispering] = useState(false);
  const [text, setText] = useState('');
  const close = () => store.setSelected(null);

  function poke() {
    connection?.poke(id);
    close();
  }

  function whisper(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    if (Date.now() < cooldownUntil) {
      store.setNotice('rate_limited');
      return;
    }
    connection?.whisper(id, message);
    store.setCooldown(area, Date.now() + rules.cooldownMs);
    store.setTyping(false);
    close();
  }

  return (
    <Panel title={name} className="panel--compact player-card">
      <button
        type="button"
        className="icon-button player-card-close"
        aria-label={t('card.close')}
        onClick={close}
      >
        ✕
      </button>
      <ul className="card-lines">
        {lines.announcement && <li>📣 {lines.announcement}</li>}
        {lines.doing && (
          <li>
            {DOING_ICON[lines.doing]} {t(`doing.${lines.doing}`)}
            {lines.doingNote && ` · ${lines.doingNote}`}
          </li>
        )}
        {lines.mood && (
          <li>
            {MOOD_ICON[lines.mood]} {t(`mood.${lines.mood}`)}
            {lines.moodNote && ` · ${lines.moodNote}`}
          </li>
        )}
      </ul>
      {whispering ? (
        <form className="whisper" onSubmit={whisper}>
          <input
            autoFocus
            value={text}
            maxLength={rules.maxChars}
            placeholder={t('card.whisper.placeholder', { name })}
            aria-label={t('card.whisper')}
            enterKeyHint="send"
            onChange={(e) => setText(e.target.value)}
            onFocus={() => store.setTyping(true)}
            onBlur={() => store.setTyping(false)}
            onKeyDown={(e) => e.key === 'Escape' && setWhispering(false)}
          />
          <button type="submit" className="panel-ok">
            {t('card.send')}
          </button>
        </form>
      ) : (
        <div className="choice-list">
          <Choice icon="👉" label={t('card.poke')} hint={t('card.poke.hint')} onSelect={poke} />
          <Choice
            icon="✉️"
            label={t('card.whisper')}
            hint={t(rules.dmAllowed ? 'card.whisper.hint' : 'card.whisper.library')}
            disabled={!rules.dmAllowed}
            onSelect={() => setWhispering(true)}
          />
          <Choice
            icon={friendship === 'friend' ? '⭐' : '🤝'}
            label={t(FRIEND_LABEL[friendship ?? 'none'])}
            hint={t(`${FRIEND_LABEL[friendship ?? 'none']}.hint`)}
            disabled={friendship === 'friend' || friendship === 'outgoing'}
            onSelect={() => {
              social?.befriend(id);
              close();
            }}
          />
          <Choice
            icon="👥"
            label={t('card.group')}
            hint={t('card.soon')}
            disabled
            onSelect={close}
          />
        </div>
      )}
    </Panel>
  );
}
