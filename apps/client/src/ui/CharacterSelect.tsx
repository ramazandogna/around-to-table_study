import { earnedBadges } from '@att/shared';
import { useEffect, useState } from 'react';
import { t, type MessageKey } from '../i18n/t';
import {
  deleteCharacter,
  isError,
  loadProgress,
  playingId,
  setPlayingId,
  type ServerCharacter,
} from '../net/account';
import { enterAs, refreshAccount, signOut } from '../net/enter';
import { readJson } from '../net/storage';
import { useGameStore } from '../state/store';
import {
  currentGoal,
  dailyGoal,
  formatDuration,
  loadGoals,
  timePlayed,
  todayStats,
  type Goals,
} from '../state/stats';
import { portrait } from '../world/portrait';
import { Dialog, Panel } from './Panel';

/** Characters per account (the server holds the same limit). */
export const MAX_CHARACTERS = 2;

/**
 * Out of the world: the account's characters (up to two), each with what they
 * did in the building. Choosing one plays as it (on any device: they live on
 * the server); an empty slot makes a new one; one can be deleted for good.
 */
export function CharacterSelect() {
  const characters = useGameStore((s) => s.characters);
  const account = useGameStore((s) => s.account);
  const [deleting, setDeleting] = useState<ServerCharacter | null>(null);
  const [busy, setBusy] = useState(false);
  const empty = Math.max(0, MAX_CHARACTERS - characters.length);
  const live = playingId();

  async function enter(character: ServerCharacter) {
    if (busy) return;
    setBusy(true);
    await enterAs(character);
    setBusy(false);
  }

  async function confirmDelete(character: ServerCharacter) {
    setDeleting(null);
    const result = await deleteCharacter(character.id);
    if (isError(result)) return useGameStore.getState().setNotice('offline');
    if (live === character.id) {
      // Its progress was in this browser: gone with it.
      setPlayingId(null);
      loadProgress(null);
      useGameStore.setState({ session: null, presence: null });
    }
    await refreshAccount();
  }

  return (
    <main className="gate lobby">
      <Panel title={`🏛️ ${t('lobby.title')}`} className="panel--dialog lobby-panel">
        <p className="panel-text">{t('lobby.text')}</p>
        <ul className="lobby-cards">
          {characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              active={character.id === live}
              onEnter={() => void enter(character)}
              onDelete={() => setDeleting(character)}
            />
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <li key={`empty-${i}`} className="lobby-card lobby-card--empty">
              <button
                type="button"
                className="lobby-new"
                onClick={() => useGameStore.getState().setGate('create')}
              >
                <span className="lobby-new-plus" aria-hidden>
                  ＋
                </span>
                {t('lobby.create')}
              </button>
            </li>
          ))}
        </ul>
        <div className="lobby-foot">
          <p className="lobby-note">
            {t('lobby.signedIn', { email: account?.email ?? '' })} ·{' '}
            {t('lobby.note', { max: MAX_CHARACTERS })}
          </p>
          <button type="button" className="mini-button" onClick={() => void signOut()}>
            {t('account.signOut')}
          </button>
        </div>
      </Panel>
      {deleting && (
        <Dialog>
          <Panel title={t('lobby.delete.title', { name: deleting.name })} className="panel--dialog">
            <p className="panel-text">{t('lobby.delete.text')}</p>
            <div className="panel-actions">
              <button type="button" className="panel-button" onClick={() => setDeleting(null)}>
                {t('lobby.delete.cancel')}
              </button>
              <button
                type="button"
                className="panel-ok lobby-delete-confirm"
                onClick={() => void confirmDelete(deleting)}
              >
                {t('lobby.delete.confirm')}
              </button>
            </div>
          </Panel>
        </Dialog>
      )}
    </main>
  );
}

function CharacterCard({
  character,
  active,
  onEnter,
  onDelete,
}: {
  character: ServerCharacter;
  active: boolean;
  onEnter: () => void;
  onDelete: () => void;
}) {
  const [face, setFace] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    if (character.look) void portrait(character.look).then((url) => live && setFace(url));
    return () => {
      live = false;
    };
  }, [character.look]);

  // The one played in this browser has fresher numbers here than on the server.
  const read = <T,>(key: string): T | null => {
    if (active) return readJson<T>(key);
    const raw = character.save?.[key];
    try {
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };
  const profile = character.profile;
  const stats = todayStats(now, read('att.stats'));
  const goal = dailyGoal(read<{ minutes?: number }>('att.goal')?.minutes);
  const quest = currentGoal(loadGoals(now, read<Goals>('att.goals')));
  const studied = Math.max(profile?.focusMs ?? 0, stats.totalMs ?? 0);
  const played = Math.max(profile?.timeMs ?? 0, timePlayed(read<number>('att.played')));
  const badges = profile ? earnedBadges(profile) : [];
  const share = Math.min(1, stats.focusMs / (goal * 60_000));

  return (
    <li className={`lobby-card${active ? ' lobby-card--active' : ''}`}>
      <div className="lobby-face">
        {face ? <img src={face} alt="" /> : <span aria-hidden>🙂</span>}
      </div>
      <h3 className="lobby-name">{character.name}</h3>
      {active && <p className="lobby-last">{t('lobby.last')}</p>}
      <p className="lobby-badges" aria-label={t('lobby.badges')}>
        {badges.length > 0 ? (
          badges.map((badge) => (
            <span key={badge.id} title={t(`badge.${badge.id}` as MessageKey)}>
              {badge.icon}
            </span>
          ))
        ) : (
          <span className="lobby-muted">{t('lobby.noBadges')}</span>
        )}
      </p>
      <dl className="lobby-stats">
        <div>
          <dt>⏳ {t('lobby.played')}</dt>
          <dd>{formatDuration(played)}</dd>
        </div>
        <div>
          <dt>📚 {t('lobby.studied')}</dt>
          <dd>{formatDuration(studied)}</dd>
        </div>
        <div>
          <dt>🔥 {t('lobby.streak')}</dt>
          <dd>{stats.streak}</dd>
        </div>
        <div>
          <dt>🎯 {t('lobby.goal')}</dt>
          <dd>
            {formatDuration(stats.focusMs)} / {formatDuration(goal * 60_000)}
          </dd>
        </div>
      </dl>
      <span className="goal-track lobby-goal" aria-hidden>
        <span className="goal-fill" style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
      {quest && (
        <p className="lobby-quest">
          {t('lobby.quest')} <b>{goalName(quest)}</b>
        </p>
      )}
      <div className="lobby-actions">
        <button type="button" className="panel-ok lobby-enter" onClick={onEnter}>
          {t(active ? 'lobby.join' : 'lobby.enter')}
        </button>
        <button type="button" className="panel-button lobby-delete" onClick={onDelete}>
          🗑️ {t('lobby.delete')}
        </button>
      </div>
    </li>
  );
}

/** A goal's name: the ready-made one in the player's language, or their own words. */
export function goalName(goal: { preset: string | null; text: string }): string {
  return goal.preset ? t(`goal.preset.${goal.preset}` as MessageKey) : goal.text;
}
