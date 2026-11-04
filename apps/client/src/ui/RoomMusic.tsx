import { JUKEBOX, playedSeconds } from '@att/shared';
import { useEffect, useRef, useState } from 'react';
import { unlockAudio } from '../audio/sound';
import { COZY, COZY_ARTIST, COZY_LICENSE, cozyAt } from '../content/cozy';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { loadYouTube, type YTPlayer } from './youtube';

/**
 * The smoking room's music, in one card. Calm piano, guitar and strings play
 * all the time (our own files, the same moment for everyone); when someone
 * queues a YouTube song, that plays instead in YouTube's own player, which
 * its terms ask to stay visible at 200 by 200 at least, and the calm music
 * comes back when the queue is empty.
 *
 * The card opens when the player comes in. "–" tucks it into the corner and
 * the music goes on; "✕" stops it on this screen. Browsers keep sound off
 * until someone touches the page: then a clear "tap to listen" shows rather
 * than silence that looks broken.
 */
export function RoomMusic() {
  const area = useGameStore((s) => s.area);
  const on = useGameStore((s) => s.jukeboxOn);
  if (area === 'hall' || area === 'conference') return on ? <Borrowed /> : <TurnOn />;
  if (area !== 'smoking') return null;
  return on ? <Card /> : <TurnOn />;
}

/** In the hall and the conference hall the smoking room's music plays this much quieter. */
const BORROWED_LEVEL = 0.5;

/**
 * The hall and the conference hall hear the smoking room's calm music, softer,
 * at the same moment as in there; a small note says where it comes from and
 * where to change it (songs people queue play in the smoking room only, in
 * YouTube's own player). The stage's sound or video silences it while on,
 * and the game's mute does too.
 */
function Borrowed() {
  const volume = useGameStore((s) => s.jukeboxVolume);
  const muted = useGameStore((s) => s.muted);
  const stageSound = useGameStore(
    (s) => s.area === 'conference' && !!s.stage && s.stage.kind !== 'image',
  );
  const [blocked, setBlocked] = useState(false);
  const quiet = muted || stageSound;
  return (
    <aside className="music-note" aria-label={t('music.borrowed.label')}>
      {!quiet && (
        <Cozy share={(volume / JUKEBOX.maxVolume) * BORROWED_LEVEL} docked onBlocked={setBlocked} />
      )}
      <span className="music-note-text music-note-text--long">
        ♪ {t(quiet ? 'music.borrowed.paused' : 'music.borrowed')}
      </span>
      <span className="music-note-text music-note-text--short" title={t('music.borrowed')}>
        ♪ {t(quiet ? 'music.borrowed.paused' : 'music.borrowed.short')}
      </span>
      {blocked && !quiet && (
        <button
          type="button"
          className="music-note-tap"
          onClick={() => {
            unlockAudio();
            window.dispatchEvent(new Event('att-music-tap'));
          }}
        >
          ▶
        </button>
      )}
      <button
        type="button"
        className="music-note-off"
        aria-label={t('music.close')}
        title={t('music.close')}
        onClick={() => useGameStore.getState().setJukeboxPrefs({ on: false })}
      >
        ✕
      </button>
    </aside>
  );
}

/** With the music off on this screen: a small button to turn it back on. */
function TurnOn() {
  return (
    <button
      type="button"
      className="music-on"
      onClick={() => useGameStore.getState().setJukeboxPrefs({ on: true })}
    >
      🎵 {t('music.turnOn')}
    </button>
  );
}

/** The cozy list's volume next to YouTube's 0–100: the same quiet room level. */
const COZY_LEVEL = 0.22;

function Card() {
  const song = useGameStore((s) => s.jukebox.now);
  const volume = useGameStore((s) => s.jukeboxVolume);
  // Opened on coming in, every time; "–" only tucks it away for this visit.
  const [docked, setDocked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const share = volume / JUKEBOX.maxVolume;

  return (
    <aside
      className={`music-card${docked ? ' music-card--docked' : ''}${song ? ' music-card--video' : ''}`}
      aria-label={t('jukebox.title')}
    >
      <header className="music-head">
        <span className="music-title">{song ? `🎵 ${song.title}` : `🎹 ${t('music.cozy')}`}</span>
        <button
          type="button"
          className="music-button"
          aria-label={t(docked ? 'music.open' : 'music.dock')}
          title={t(docked ? 'music.open' : 'music.dock')}
          onClick={() => setDocked(!docked)}
        >
          {docked ? '▢' : '–'}
        </button>
        <button
          type="button"
          className="music-button music-button--close"
          aria-label={t('music.close')}
          title={t('music.close')}
          onClick={() => useGameStore.getState().setJukeboxPrefs({ on: false })}
        >
          ✕
        </button>
      </header>
      {song ? (
        <YouTubeSong share={share} onBlocked={setBlocked} />
      ) : (
        <Cozy share={share} docked={docked} onBlocked={setBlocked} />
      )}
      {blocked && (
        <button
          type="button"
          className="music-tap"
          onClick={() => {
            unlockAudio();
            window.dispatchEvent(new Event('att-music-tap'));
          }}
        >
          ▶ {t('music.tap')}
        </button>
      )}
      {!docked && (
        <button
          type="button"
          className="music-queue"
          onClick={() => useGameStore.getState().setJukeboxOpen(true)}
        >
          {t('music.queue')}
        </button>
      )}
    </aside>
  );
}

/* ---------- The calm list, from our own files ---------- */

/**
 * Each track is fetched whole (one or two megabytes) and played from memory,
 * so the player can jump to where the room is in any browser, whether or not
 * the server answers requests for part of a file.
 */
const tracks = new Map<string, Promise<string>>();

function trackUrl(file: string): Promise<string> {
  let url = tracks.get(file);
  if (!url) {
    url = fetch(`/music/${file}`)
      .then((response) => response.blob())
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => `/music/${file}`);
    tracks.set(file, url);
  }
  return url;
}

function Cozy({
  share,
  docked,
  onBlocked,
}: {
  share: number;
  docked: boolean;
  onBlocked: (blocked: boolean) => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(() => cozyAt(Date.now()).index);
  const track = COZY[index] ?? COZY[0];

  // One audio element for the visit; it follows the clock from track to track.
  useEffect(() => {
    const element = new Audio();
    element.preload = 'auto';
    audio.current = element;
    let file = '';
    const play = () => {
      const now = cozyAt(Date.now());
      setIndex(now.index);
      void trackUrl(now.track.file).then((url) => {
        if (audio.current !== element) return;
        if (file !== now.track.file) {
          file = now.track.file;
          element.src = url;
        }
        // Where the room is now (the file may have taken a moment to arrive).
        const seek = () => {
          const offset = cozyAt(Date.now()).offset;
          if (Math.abs(element.currentTime - offset) > 3) element.currentTime = offset;
        };
        if (element.readyState >= 1) seek();
        else element.addEventListener('loadedmetadata', seek, { once: true });
        element
          .play()
          .then(() => onBlocked(false))
          .catch(() => onBlocked(true));
      });
    };
    element.addEventListener('ended', play);
    window.addEventListener('att-music-tap', play);
    // The first touch anywhere is enough for browsers that waited for one.
    const firstTouch = () => {
      if (element.paused) play();
    };
    window.addEventListener('pointerdown', firstTouch);
    play();
    return () => {
      element.removeEventListener('ended', play);
      window.removeEventListener('att-music-tap', play);
      window.removeEventListener('pointerdown', firstTouch);
      element.pause();
      element.removeAttribute('src');
      audio.current = null;
      onBlocked(false);
    };
  }, [onBlocked]);

  useEffect(() => {
    if (audio.current) audio.current.volume = Math.min(1, COZY_LEVEL * share);
  }, [share]);

  if (docked || !track) return null;
  return (
    <div className="music-cozy">
      <span className="music-record" aria-hidden>
        <img src="/favicon-64.png" alt="" />
      </span>
      <span className="music-now">
        <b>{track.title}</b>
        <span>
          {COZY_ARTIST} · {COZY_LICENSE}
        </span>
      </span>
    </div>
  );
}

/* ---------- A queued song, in YouTube's embedded player ---------- */

/** Off by more than this many seconds from the room, the player catches up. */
const DRIFT_SECONDS = 4;
/** YouTube's terms: the embedded player stays at least 200 by 200. */
const SIZE = 200;
const PLAYING = 1;
/** How long a song may take to start before the card asks for a tap. */
const START_GRACE_MS = 2500;

function YouTubeSong({
  share,
  onBlocked,
}: {
  share: number;
  onBlocked: (blocked: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const loaded = useRef<string | null>(null);
  const song = useGameStore((s) => s.jukebox.now);
  const [failed, setFailed] = useState(false);

  // One player for as long as songs keep coming; songs change inside it.
  useEffect(() => {
    let live = true;
    const element = document.createElement('div');
    host.current?.append(element);
    const check = window.setInterval(() => {
      const p = player.current;
      if (p) onBlocked(p.getPlayerState() !== PLAYING);
    }, START_GRACE_MS);
    const tap = () => {
      player.current?.unMute();
      player.current?.playVideo();
    };
    window.addEventListener('att-music-tap', tap);
    loadYouTube()
      .then((YT) => {
        const now = useGameStore.getState().jukebox.now;
        if (!live || !now) return;
        loaded.current = now.id;
        player.current = new YT.Player(element, {
          host: 'https://www.youtube-nocookie.com',
          width: SIZE,
          height: SIZE,
          videoId: now.video,
          // No controls of YouTube's own: the room's volume is set here, and no
          // fullscreen can swallow the screen.
          playerVars: {
            autoplay: 1,
            start: Math.floor(playedSeconds(now, Date.now())),
            playsinline: 1,
            rel: 0,
            controls: 0,
            fs: 0,
            disablekb: 1,
            iv_load_policy: 3,
          },
          events: {
            onReady: (event) => {
              event.target.setVolume(useGameStore.getState().jukeboxVolume);
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (event.data !== PLAYING) return;
              onBlocked(false);
              // The first screen to know the song's length tells the room, so it moves on in time.
              const current = useGameStore.getState().jukebox.now;
              const length = event.target.getDuration();
              if (current && current.seconds === null && length > 0) {
                useGameStore.getState().connection?.tuneLength(current.id, length);
              }
            },
          },
        });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      window.clearInterval(check);
      window.removeEventListener('att-music-tap', tap);
      player.current?.destroy();
      player.current = null;
      element.remove();
      onBlocked(false);
    };
  }, [onBlocked]);

  // A new song: load it at the room's point in it.
  useEffect(() => {
    const p = player.current;
    if (!p || !song || loaded.current === song.id) return;
    loaded.current = song.id;
    p.loadVideoById({
      videoId: song.video,
      startSeconds: Math.floor(playedSeconds(song, Date.now())),
    });
  }, [song]);

  useEffect(() => {
    player.current?.setVolume(Math.round(share * JUKEBOX.maxVolume));
  }, [share]);

  // Stay with the room: after a pause or a slow load, jump to where everyone is.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const p = player.current;
      const now = useGameStore.getState().jukebox.now;
      if (!p || !now || p.getPlayerState() !== PLAYING) return;
      const expected = playedSeconds(now, Date.now());
      if (Math.abs(p.getCurrentTime() - expected) > DRIFT_SECONDS) p.seekTo(expected, true);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  return failed ? (
    <p className="creator-note">{t('jukebox.failed')}</p>
  ) : (
    <div ref={host} className="music-video" />
  );
}
