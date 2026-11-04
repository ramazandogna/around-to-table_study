import { earnedBadges, type Profile } from '@att/shared';
import { useEffect, useState } from 'react';
import { t, type MessageKey } from '../i18n/t';
import {
  canCreate,
  createAnother,
  deleteCharacter,
  listCharacters,
  MAX_CHARACTERS,
  switchTo,
  type Character,
} from '../net/characters';
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

/**
 * Out of the world: the characters this device keeps (up to two), each with
 * what they did in the building. "Join" goes straight back in as the one just
 * played; the other one swaps in (the page starts again); an empty slot makes
 * a new character, and a character can be deleted here for good.
 */
export function CharacterSelect() {
  const [characters, setCharacters] = useState(listCharacters);
  const [deleting, setDeleting] = useState<Character | null>(null);
  const empty = MAX_CHARACTERS - characters.length;

  function enter(character: Character) {
    if (character.active) useGameStore.getState().setLobby(false);
    else switchTo(character.id);
  }

  function confirmDelete(character: Character) {
    deleteCharacter(character.id);
    setDeleting(null);
    const left = listCharacters();
    if (character.active) {
      // The live one is gone: play the other one, or make someone new.
      const other = left[0];
      if (other) switchTo(other.id);
      else location.reload();
      return;
    }
    setCharacters(left);
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
              onEnter={() => enter(character)}
              onDelete={() => setDeleting(character)}
            />
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <li key={`empty-${i}`} className="lobby-card lobby-card--empty">
              <button
                type="button"
                className="lobby-new"
                disabled={!canCreate()}
                onClick={createAnother}
              >
                <span className="lobby-new-plus" aria-hidden>
                  ＋
                </span>
                {t('lobby.create')}
              </button>
            </li>
          ))}
        </ul>
        <p className="lobby-note">{t('lobby.note', { max: MAX_CHARACTERS })}</p>
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
                onClick={() => confirmDelete(deleting)}
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
  onEnter,
  onDelete,
}: {
  character: Character;
  onEnter: () => void;
  onDelete: () => void;
}) {
  const [face, setFace] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    if (character.look) void portrait(character.look).then((url) => live && setFace(url));
    void fetch(`/api/profile?token=${encodeURIComponent(character.token)}`)
      .then((response) =>
        response.ok ? (response.json() as Promise<{ profile?: Profile }>) : null,
      )
      .then((body) => live && body?.profile && setProfile(body.profile))
      .catch(() => {
        // Offline or an old session: the numbers kept on this device are shown instead.
      });
    return () => {
      live = false;
    };
  }, [character]);

  const stats = todayStats(now, character.read('att.stats'));
  const goal = dailyGoal(character.read<{ minutes?: number }>('att.goal')?.minutes);
  const goals = loadGoals(now, character.read<Goals>('att.goals'));
  const quest = currentGoal(goals);
  const studied = Math.max(profile?.focusMs ?? 0, stats.totalMs ?? 0);
  const played = Math.max(profile?.timeMs ?? 0, timePlayed(character.read<number>('att.played')));
  const badges = profile ? earnedBadges(profile) : [];
  const share = Math.min(1, stats.focusMs / (goal * 60_000));

  return (
    <li className={`lobby-card${character.active ? ' lobby-card--active' : ''}`}>
      <div className="lobby-face">
        {face ? <img src={face} alt="" /> : <span aria-hidden>🙂</span>}
      </div>
      <h3 className="lobby-name">{character.name}</h3>
      {character.active && <p className="lobby-last">{t('lobby.last')}</p>}
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
          {t(character.active ? 'lobby.join' : 'lobby.enter')}
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
