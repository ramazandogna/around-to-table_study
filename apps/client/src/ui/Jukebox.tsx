import { JUKEBOX, parseYouTubeId, playedSeconds, skipsNeeded, type Playing } from '@att/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { useNow } from './Calendar';
import { Dialog, Panel } from './Panel';

/**
 * The smoking room's jukebox. People queue YouTube songs; everyone in the room
 * hears the same song at the same point, quietly, in YouTube's own embedded
 * player. YouTube's terms ask for the player to stay visible (at least 200 by
 * 200 pixels), so it sits in a corner while a song plays; anyone can switch it
 * off on their own screen.
 */

export function JukeboxPanel() {
  const open = useGameStore((s) => s.jukeboxOpen);
  const close = () => useGameStore.getState().setJukeboxOpen(false);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && close();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);
  if (!open) return null;
  return (
    <Dialog>
      <Panel title={`📻 ${t('jukebox.title')}`} className="panel--dialog panel--jukebox">
        <Queue />
        <div className="panel-actions">
          <button type="button" className="panel-ok" onClick={close}>
            {t('table.close')}
          </button>
        </div>
      </Panel>
    </Dialog>
  );
}

function Queue() {
  const state = useGameStore((s) => s.jukebox);
  const myId = useGameStore((s) => s.session?.id ?? '');
  const people = useGameStore((s) => s.playersHere);
  const on = useGameStore((s) => s.jukeboxOn);
  const volume = useGameStore((s) => s.jukeboxVolume);
  const [link, setLink] = useState('');
  const now = useNow(1000);
  const connection = useGameStore((s) => s.connection);
  const valid = parseYouTubeId(link) !== null;
  const playing = state.now;

  function add(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    connection?.queueTune(link);
    useGameStore.getState().setNotice('tune_added');
    setLink('');
  }

  return (
    <div className="jukebox">
      {playing ? (
        <div className="jukebox-now">
          <p className="field-label">{t('jukebox.now')}</p>
          <p className="jukebox-title">🎵 {playing.title}</p>
          <p className="creator-note">
            {t('jukebox.by', { name: playing.byName })} · {progress(playing, now)}
          </p>
          <button
            type="button"
            className="mini-button"
            onClick={() => connection?.skipTune(playing.id)}
          >
            {playing.by === myId
              ? t('jukebox.skipMine')
              : t('jukebox.skip', { n: playing.skips.length, of: skipsNeeded(people) })}
          </button>
        </div>
      ) : (
        <p className="panel-text">{t('jukebox.empty')}</p>
      )}

      <div className="jukebox-mine">
        <label className="check">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => useGameStore.getState().setJukeboxPrefs({ on: e.target.checked })}
          />
          {t('jukebox.listen')}
        </label>
        <label className="field jukebox-volume">
          <span className="field-label">🎧 {t('jukebox.volume')}</span>
          <input
            type="range"
            min={0}
            max={JUKEBOX.maxVolume}
            value={volume}
            onChange={(e) =>
              useGameStore.getState().setJukeboxPrefs({ volume: Number(e.target.value) })
            }
          />
          <span className="creator-note">
            {t('jukebox.volume.mine', {
              n: Math.round((volume / JUKEBOX.maxVolume) * 100),
            })}
          </span>
        </label>
      </div>

      {state.queue.length > 0 && (
        <>
          <p className="field-label">{t('jukebox.next')}</p>
          <ol className="room-list">
            {state.queue.map((tune) => (
              <li key={tune.id} className="room-line">
                <span className="room-name">{tune.title}</span>
                <span className="room-meta">{tune.byName}</span>
                {tune.by === myId && (
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => connection?.skipTune(tune.id)}
                  >
                    {t('jukebox.remove')}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      <form className="whisper" onSubmit={add}>
        <input
          value={link}
          maxLength={200}
          placeholder={t('jukebox.placeholder')}
          aria-label={t('jukebox.placeholder')}
          onChange={(e) => setLink(e.target.value)}
          onFocus={() => useGameStore.getState().setTyping(true)}
          onBlur={() => useGameStore.getState().setTyping(false)}
        />
        <button type="submit" className="mini-button mini-button--ok" disabled={!valid}>
          {t('jukebox.add')}
        </button>
      </form>
      <p className="creator-note">{t('jukebox.rules', { n: JUKEBOX.perPerson })}</p>
    </div>
  );
}

function progress(playing: Playing, now: number): string {
  const played = Math.floor(playedSeconds(playing, now));
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return playing.seconds
    ? `${clock(Math.min(played, Math.floor(playing.seconds)))} / ${clock(Math.floor(playing.seconds))}`
    : clock(played);
}
