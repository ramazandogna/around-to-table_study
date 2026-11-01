import { JUKEBOX, parseYouTubeId, playedSeconds, skipsNeeded, type Playing } from '@att/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
          <span className="field-label">🔉 {t('jukebox.volume')}</span>
          <input
            type="range"
            min={0}
            max={JUKEBOX.maxVolume}
            value={volume}
            onChange={(e) =>
              useGameStore.getState().setJukeboxPrefs({ volume: Number(e.target.value) })
            }
          />
        </label>
      </div>
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

/* ---------- YouTube's embedded player ---------- */

type YTPlayer = {
  loadVideoById: (options: { videoId: string; startSeconds: number }) => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  playVideo: () => void;
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      host?: string;
      width: number;
      height: number;
      videoId: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number; target: YTPlayer }) => void;
      };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<YTNamespace> | null = null;

/** Loads YouTube's player script once. */
function loadYouTube(): Promise<YTNamespace> {
  api ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => (window.YT ? resolve(window.YT) : reject());
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      api = null;
      reject(new Error('YouTube could not be reached'));
    };
    document.head.append(script);
  });
  return api;
}

/** Off by more than this many seconds from the room, the player catches up. */
const DRIFT_SECONDS = 4;
const SIZE = 200;
const PLAYING = 1;

/**
 * Plays the room's song in a small corner card while in the smoking room.
 * The song and where it is come from the server's clock, so a late arrival
 * joins mid-song, in step with everyone.
 */
export function JukeboxPlayer() {
  const area = useGameStore((s) => s.area);
  const playing = useGameStore((s) => s.jukebox.now);
  const on = useGameStore((s) => s.jukeboxOn);
  if (area !== 'smoking' || !playing || !on) return null;
  return <Player />;
}

function Player() {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const loaded = useRef<string | null>(null);
  const playing = useGameStore((s) => s.jukebox.now);
  const volume = useGameStore((s) => s.jukeboxVolume);
  const [failed, setFailed] = useState(false);

  // One player for as long as the card is up; songs change inside it.
  useEffect(() => {
    let live = true;
    const element = document.createElement('div');
    host.current?.append(element);
    loadYouTube()
      .then((YT) => {
        const song = useGameStore.getState().jukebox.now;
        if (!live || !song) return;
        loaded.current = song.id;
        player.current = new YT.Player(element, {
          host: 'https://www.youtube-nocookie.com',
          width: SIZE,
          height: SIZE,
          videoId: song.video,
          playerVars: {
            autoplay: 1,
            start: Math.floor(playedSeconds(song, Date.now())),
            playsinline: 1,
            rel: 0,
            controls: 1,
          },
          events: {
            onReady: (event) => {
              event.target.setVolume(useGameStore.getState().jukeboxVolume);
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (event.data !== PLAYING) return;
              // The first screen to know the song's length tells the room, so it moves on in time.
              const now = useGameStore.getState().jukebox.now;
              const length = event.target.getDuration();
              if (now && now.seconds === null && length > 0) {
                useGameStore.getState().connection?.tuneLength(now.id, length);
              }
            },
          },
        });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      player.current?.destroy();
      player.current = null;
      element.remove();
    };
  }, []);

  // A new song: load it at the room's point in it.
  useEffect(() => {
    const p = player.current;
    if (!p || !playing || loaded.current === playing.id) return;
    loaded.current = playing.id;
    p.loadVideoById({
      videoId: playing.video,
      startSeconds: Math.floor(playedSeconds(playing, Date.now())),
    });
  }, [playing]);

  useEffect(() => player.current?.setVolume(volume), [volume]);

  // Stay with the room: after a pause or a slow load, jump to where everyone is.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const p = player.current;
      const song = useGameStore.getState().jukebox.now;
      if (!p || !song || p.getPlayerState() !== PLAYING) return;
      const expected = playedSeconds(song, Date.now());
      if (Math.abs(p.getCurrentTime() - expected) > DRIFT_SECONDS) p.seekTo(expected, true);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <aside className="panel panel--compact jukebox-card" aria-label={t('jukebox.title')}>
      <header className="jukebox-card-head">
        <span className="jukebox-card-title">🎵 {playing?.title}</span>
        <button
          type="button"
          className="icon-button"
          aria-label={t('jukebox.off')}
          title={t('jukebox.off')}
          onClick={() => useGameStore.getState().setJukeboxPrefs({ on: false })}
        >
          ✕
        </button>
      </header>
      {failed ? (
        <p className="creator-note">{t('jukebox.failed')}</p>
      ) : (
        <div ref={host} className="jukebox-video" />
      )}
    </aside>
  );
}
