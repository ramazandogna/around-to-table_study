import {
  guessStageKind,
  STAGE_KINDS,
  STAGE_LIMITS,
  stagePosition,
  type StageKind,
  type StageState,
} from '@att/shared';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { unlockAudio } from '../audio/sound';
import { t } from '../i18n/t';
import { presentingNow, useGameStore } from '../state/store';
import { quadTransform, stageView, type ScreenQuad } from '../world/stageView';
import { loadYouTube, type YTPlayer } from './youtube';

/** YouTube's terms ask its player to stay at least 200 by 200; smaller, the screen becomes a card. */
const MIN_OVERLAY = 200;
/** The page laid over the screen is this big before it is fitted onto it (16:9). */
const BASE_WIDTH = 640;
const BASE_HEIGHT = 360;
/** Off by more than this from the room, a video or sound jumps back in step. */
const DRIFT_SECONDS = 2;
const PLAYING = 1;

/** The room's moment in the video or sound, on this screen's clock. */
function roomSeconds(stage: StageState): number {
  return stagePosition(stage, Date.now() + useGameStore.getState().clockOffset);
}

/**
 * The conference hall's big screen. What the presenter shows is laid over
 * the screen in the room, so everyone watches it there like a TV; when the
 * screen is small on a phone, or someone wants it bigger, it opens as a card.
 * Each viewer can hide it on their own screen. The presenter gets a small
 * panel to put a link up, play, pause and take it down.
 */
export function StageScreen() {
  const area = useGameStore((s) => s.area);
  const stage = useGameStore((s) => s.stage);
  const presenter = usePresenter();
  if (area !== 'conference') return null;
  return (
    <>
      {stage && <Screen stage={stage} />}
      {presenter && <PresenterPanel stage={stage} />}
    </>
  );
}

/**
 * Whether this player presents: as the server said on entry, or because their
 * approved event here has just begun (checked each half minute; the server
 * checks again on every change of the screen).
 */
function usePresenter(): boolean {
  // Re-read when the server says so, when the events change, and each half minute.
  useGameStore((s) => s.presenter);
  useGameStore((s) => s.proposed);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return presentingNow(useGameStore.getState(), now);
}

function Screen({ stage }: { stage: StageState }) {
  const hidden = useGameStore((s) => s.stageHidden);
  const full = useGameStore((s) => s.stageFull);
  const quad = useScreenQuad(!hidden && !full);
  const card = full || !quad || quad.width < MIN_OVERLAY || quad.height < MIN_OVERLAY * 0.56;
  const style: CSSProperties | undefined =
    card || !quad
      ? undefined
      : {
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: quadTransform(quad, BASE_WIDTH, BASE_HEIGHT),
        };
  const { setStageView } = useGameStore.getState();

  if (hidden) {
    return (
      <button
        type="button"
        className="music-on stage-show"
        onClick={() => setStageView({ hidden: false })}
      >
        📺 {t('stage.watch')}
      </button>
    );
  }
  return (
    <section
      className={`stage-screen${card ? ' stage-screen--card' : ''}${full ? ' stage-screen--full' : ''}`}
      style={style}
      aria-label={t('stage.title')}
    >
      <div className="stage-media">
        {stage.kind === 'image' && <Picture key={stage.src} src={stage.src} />}
        {stage.kind === 'youtube' && <Video stage={stage} />}
        {stage.kind === 'audio' && <Sound stage={stage} />}
      </div>
      <footer className="stage-bar">
        <span className="stage-caption">
          {stage.caption || t('stage.by', { name: stage.byName })}
        </span>
        <button
          type="button"
          className="music-button"
          title={t(full ? 'stage.exitFull' : 'stage.full')}
          aria-label={t(full ? 'stage.exitFull' : 'stage.full')}
          onClick={() => setStageView({ full: !full })}
        >
          {full ? '⤡' : '⤢'}
        </button>
        <button
          type="button"
          className="music-button music-button--close"
          title={t('stage.hide')}
          aria-label={t('stage.hide')}
          onClick={() => setStageView({ hidden: true, full: false })}
        >
          ✕
        </button>
      </footer>
    </section>
  );
}

/** Follows the screen in the room as the camera moves, a frame at a time. */
function useScreenQuad(active: boolean): ScreenQuad | null {
  const [quad, setQuad] = useState<ScreenQuad | null>(() => (active ? stageView.quad() : null));
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = '';
    const tick = () => {
      const next = stageView.quad();
      const key = next
        ? next.corners.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join()
        : '';
      if (key !== last) {
        last = key;
        setQuad(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return active ? quad : null;
}

function Picture({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="stage-failed">{t('stage.failed')}</p>;
  return (
    <img
      className="stage-picture"
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/** A YouTube video in YouTube's own player, kept at the room's moment, paused when the room is. */
function Video({ stage }: { stage: StageState }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  /** The player answers calls only once it is ready. */
  const ready = useRef(false);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let live = true;
    const element = document.createElement('div');
    host.current?.append(element);
    loadYouTube()
      .then((YT) => {
        if (!live) return;
        player.current = new YT.Player(element, {
          host: 'https://www.youtube-nocookie.com',
          width: 640,
          height: 360,
          videoId: stage.src,
          // Only the presenter controls the room's video, so YouTube's own controls stay off.
          playerVars: {
            autoplay: 1,
            start: Math.floor(roomSeconds(stage)),
            playsinline: 1,
            rel: 0,
            controls: 0,
            fs: 0,
            disablekb: 1,
            iv_load_policy: 3,
          },
          events: {
            onReady: (event) => {
              ready.current = true;
              keepInStep(event.target);
            },
            onStateChange: (event) => {
              if (event.data === PLAYING) setBlocked(false);
            },
          },
        });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      ready.current = false;
      player.current?.destroy();
      player.current = null;
      element.remove();
    };
    // One player per video; play, pause and seek happen inside it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.src]);

  // Play, pause and seek from the presenter, and a check now and then that this screen keeps up.
  useEffect(() => {
    const p = player.current;
    if (p && ready.current) keepInStep(p);
    const timer = window.setInterval(() => {
      const current = player.current;
      if (!current || !ready.current) return;
      keepInStep(current);
      const state = useGameStore.getState().stage;
      setBlocked(!!state && state.pausedAt === null && current.getPlayerState() !== PLAYING);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [stage]);

  if (failed) return <p className="stage-failed">{t('stage.failed')}</p>;
  return (
    <>
      <div ref={host} className="stage-video" />
      {blocked && (
        <button
          type="button"
          className="music-tap stage-tap"
          onClick={() => {
            unlockAudio();
            player.current?.unMute();
            player.current?.playVideo();
          }}
        >
          ▶ {t('music.tap')}
        </button>
      )}
    </>
  );
}

function keepInStep(p: YTPlayer): void {
  const stage = useGameStore.getState().stage;
  if (!stage || stage.kind !== 'youtube') return;
  const expected = roomSeconds(stage);
  if (Math.abs(p.getCurrentTime() - expected) > DRIFT_SECONDS) p.seekTo(expected, true);
  if (stage.pausedAt !== null) p.pauseVideo();
  else if (p.getPlayerState() !== PLAYING) p.playVideo();
}

/** A sound for the whole room, with a volume of each listener's own. */
function Sound({ stage }: { stage: StageState }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(0.7);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    const sync = () => {
      const state = useGameStore.getState().stage;
      if (!state || state.kind !== 'audio') return;
      const expected = roomSeconds(state);
      if (element.readyState >= 1 && Math.abs(element.currentTime - expected) > DRIFT_SECONDS) {
        element.currentTime = expected;
      }
      if (state.pausedAt !== null) element.pause();
      else if (element.paused) {
        element
          .play()
          .then(() => setBlocked(false))
          .catch(() => setBlocked(true));
      }
    };
    element.addEventListener('loadedmetadata', sync);
    sync();
    const timer = window.setInterval(sync, 3000);
    return () => {
      element.removeEventListener('loadedmetadata', sync);
      window.clearInterval(timer);
    };
  }, [stage]);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  if (failed) return <p className="stage-failed">{t('stage.failed')}</p>;
  return (
    <div className="stage-sound">
      <span className="stage-sound-icon" aria-hidden>
        🎵
      </span>
      <audio ref={audio} src={stage.src} preload="auto" onError={() => setFailed(true)} />
      <label className="stage-volume">
        {t('stage.volume')}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
        />
      </label>
      {blocked && (
        <button
          type="button"
          className="music-tap"
          onClick={() => {
            unlockAudio();
            void audio.current?.play().then(() => setBlocked(false));
          }}
        >
          ▶ {t('music.tap')}
        </button>
      )}
    </div>
  );
}

/** The presenter's controls: a link to show, and play, pause, start over and clear. */
function PresenterPanel({ stage }: { stage: StageState | null }) {
  const connection = useGameStore((s) => s.connection);
  // On a phone the panel would cover the screen: it starts folded.
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 600px)').matches);
  const [link, setLink] = useState('');
  const [kind, setKind] = useState<StageKind>('image');
  const [picked, setPicked] = useState(false);
  const [caption, setCaption] = useState('');

  function show(event: FormEvent) {
    event.preventDefault();
    const src = link.trim();
    if (!src) return;
    connection?.stageShow(picked ? kind : guessStageKind(src), src, caption.trim());
    setLink('');
    setCaption('');
    setPicked(false);
  }

  if (!open) {
    return (
      <button type="button" className="music-on stage-open" onClick={() => setOpen(true)}>
        🎤 {t('stage.panel')}
      </button>
    );
  }
  const media = stage && stage.kind !== 'image';
  return (
    <aside className="stage-panel panel panel--compact" aria-label={t('stage.panel')}>
      <header className="stage-panel-head">
        <b>🎤 {t('stage.panel')}</b>
        <button
          type="button"
          className="music-button"
          aria-label={t('music.dock')}
          title={t('music.dock')}
          onClick={() => setOpen(false)}
        >
          –
        </button>
      </header>
      <p className="stage-hint">{t('stage.hint')}</p>
      <form className="stage-form" onSubmit={show}>
        <input
          className="text-input"
          value={link}
          maxLength={STAGE_LIMITS.src}
          placeholder={t('stage.link')}
          aria-label={t('stage.link')}
          onChange={(event) => {
            setLink(event.target.value);
            if (!picked) setKind(guessStageKind(event.target.value));
          }}
        />
        <div className="stage-kinds" role="group" aria-label={t('stage.kind')}>
          {STAGE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              className="tag"
              onClick={() => {
                setKind(k);
                setPicked(true);
              }}
            >
              {t(`stage.kind.${k}`)}
            </button>
          ))}
        </div>
        <input
          className="text-input"
          value={caption}
          maxLength={STAGE_LIMITS.caption}
          placeholder={t('stage.caption')}
          aria-label={t('stage.caption')}
          onChange={(event) => setCaption(event.target.value)}
        />
        <button type="submit" className="mini-button mini-button--ok" disabled={!link.trim()}>
          {t('stage.show')}
        </button>
      </form>
      {stage && (
        <div className="stage-controls">
          {media &&
            (stage.pausedAt === null ? (
              <button
                type="button"
                className="mini-button"
                onClick={() => connection?.stageControl('pause')}
              >
                ⏸ {t('stage.pause')}
              </button>
            ) : (
              <button
                type="button"
                className="mini-button"
                onClick={() => connection?.stageControl('play')}
              >
                ▶ {t('stage.play')}
              </button>
            ))}
          {media && (
            <button
              type="button"
              className="mini-button"
              onClick={() => connection?.stageControl('seek', 0)}
            >
              ⏮ {t('stage.restart')}
            </button>
          )}
          <button type="button" className="mini-button" onClick={() => connection?.stageClear()}>
            {t('stage.clear')}
          </button>
        </div>
      )}
      <p className="stage-hosts">{t('stage.hosts')}</p>
    </aside>
  );
}
