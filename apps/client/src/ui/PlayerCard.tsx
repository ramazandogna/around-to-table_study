import { AREA_RULES, BADGES, earnedBadges, type Profile } from '@att/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { dateLocale, t, type MessageKey } from '../i18n/t';
import { formatDuration } from '../state/stats';
import { useGameStore, type Selected } from '../state/store';
import { DOING_ICON, MOOD_ICON, VIBE_ICON } from '../state/study';
import { Panel } from './Panel';

/**
 * Someone's card: their status lines, what they have put in (focus blocks
 * today, this week, this month and this year, the kinds of sessions, time in
 * the building, friends, messages, since when) and the badges that earned.
 * It opens from the ring around a person (or your own), or on the whisper.
 */
export function PlayerCard() {
  const selected = useGameStore((s) => s.selected);
  // A fresh card (and empty whisper) for each person.
  return selected ? <Card key={selected.id} {...selected} /> : null;
}

const joined = new Intl.DateTimeFormat(dateLocale(), {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function Card({ id, name, lines, view }: Selected) {
  const area = useGameStore((s) => s.area);
  const connection = useGameStore((s) => s.connection);
  const social = useGameStore((s) => s.social);
  const myId = useGameStore((s) => s.session?.id);
  const role = useGameStore((s) => s.role);
  const profile = useGameStore((s) => (s.profile?.id === id ? s.profile : null));
  const cooldownUntil = useGameStore((s) => s.cooldownUntil[s.area] ?? 0);
  const store = useGameStore.getState();
  const rules = AREA_RULES[area];
  const [whispering, setWhispering] = useState(view === 'whisper');
  const [text, setText] = useState('');
  const close = () => store.setSelected(null);
  const mine = id === myId;

  // The numbers come from the server, fresh each time the card opens.
  useEffect(() => {
    useGameStore.getState().openProfile(id);
    social?.profile(id);
  }, [social, id]);

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
      {profile?.role === 'admin' && <p className="card-role">🛡️ {t('card.admin')}</p>}
      <ul className="card-lines">
        {lines.vibe && (
          <li className="card-vibe">
            {VIBE_ICON[lines.vibe]} {t(`vibe.${lines.vibe}`)}
          </li>
        )}
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
      ) : profile ? (
        <Stats profile={profile} />
      ) : (
        <p className="creator-note">{t('card.loading')}</p>
      )}
      {mine && (
        <p className="creator-note card-id">
          {t('card.yourId')} <code>{id}</code>
        </p>
      )}
      {!mine && role === 'admin' && profile && (
        <button
          type="button"
          className="mini-button"
          onClick={() => {
            social?.role(id, profile.role !== 'admin');
            social?.profile(id);
          }}
        >
          🛡️ {t(profile.role === 'admin' ? 'card.unadmin' : 'card.makeAdmin')}
        </button>
      )}
    </Panel>
  );
}

/** The numbers, then the badges (earned ones lit, the rest faint, to aim for). */
function Stats({ profile }: { profile: Profile }) {
  const earned = new Set(earnedBadges(profile).map((b) => b.id));
  const { blocks, kinds } = profile;
  return (
    <div className="card-stats">
      <p className="field-label">🍅 {t('card.blocks')}</p>
      <dl className="stat-grid">
        {(['today', 'week', 'month', 'year', 'total'] as const).map((period) => (
          <div key={period}>
            <dt>{t(`card.period.${period}`)}</dt>
            <dd>{blocks[period]}</dd>
          </div>
        ))}
      </dl>
      <p className="card-kinds">
        {t('card.kinds', {
          pomodoro: kinds.pomodoro,
          deep: kinds.deep,
          marathon: kinds.marathon,
          custom: kinds.custom,
        })}
      </p>
      <dl className="stat-list">
        <div>
          <dt>⏱ {t('card.focus')}</dt>
          <dd>{formatDuration(profile.focusMs)}</dd>
        </div>
        <div>
          <dt>🏠 {t('card.time')}</dt>
          <dd>{formatDuration(profile.timeMs)}</dd>
        </div>
        <div>
          <dt>🔥 {t('card.streak')}</dt>
          <dd>{t('card.days', { n: profile.bestStreak })}</dd>
        </div>
        <div>
          <dt>🤝 {t('card.friends')}</dt>
          <dd>{profile.friends}</dd>
        </div>
        <div>
          <dt>💬 {t('card.messages')}</dt>
          <dd>{profile.messages}</dd>
        </div>
        <div>
          <dt>📅 {t('card.joined')}</dt>
          <dd>{joined.format(profile.joinedAt)}</dd>
        </div>
      </dl>
      <p className="field-label">🏅 {t('card.badges')}</p>
      <ul className="badge-row">
        {BADGES.map((badge) => (
          <li
            key={badge.id}
            className={`badge${earned.has(badge.id) ? ' badge--earned' : ''}`}
            title={`${t(`badge.${badge.id}` as MessageKey)} · ${t(`badge.${badge.id}.how` as MessageKey)}`}
          >
            {badge.icon}
          </li>
        ))}
      </ul>
    </div>
  );
}
