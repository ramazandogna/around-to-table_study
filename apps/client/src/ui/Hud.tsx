import { APP_NAME, isRoomArea, type AreaId } from '@att/shared';
import { useEffect, useRef } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { minimap } from '../world/minimap';
import { WorldClock } from './Calendar';
import { FriendsLink } from './Friends';
import { InboxLink } from './Inbox';
import { PhoneLink } from './Phone';
import { StartOver } from './StartOver';
import { StatusDialog } from './StatusDialog';
import { Wardrobe } from './Wardrobe';

const AREA_ICON: Record<AreaId, string> = {
  hall: '🚪',
  library: '📚',
  smoking: '☕',
  room3: '🔑',
  room5: '🔑',
  room9: '🔑',
};

/** The wooden plate in the top left: where you are, who is here, and everything you can open. */
export function HudPlate() {
  const area = useGameStore((s) => s.area);
  const connected = useGameStore((s) => s.connected);
  const playersHere = useGameStore((s) => s.playersHere);
  const studying = useGameStore((s) => s.studying);
  const open = useGameStore((s) => s.plateOpen);
  // In a private room the plate shows its name.
  const roomName = useGameStore((s) => (isRoomArea(s.area) ? s.room?.room.name : undefined));
  const areaName = roomName ?? t(`area.${area}`);
  return (
    <header className={`hud-title panel panel--compact${open ? '' : ' hud-title--folded'}`}>
      {/* On phones the plate starts folded to one small button; desktops never see it. */}
      <button
        type="button"
        className="hud-fold"
        aria-expanded={open}
        aria-label={t(open ? 'hud.fold' : 'hud.unfold')}
        onClick={() => useGameStore.getState().setPlateOpen(!open)}
      >
        <span aria-hidden>{AREA_ICON[area]}</span>
        <span className="hud-fold-count">{connected ? playersHere : '…'}</span>
        <span className="hud-fold-arrow" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>
      <div className="hud-heading">
        <span className="hud-name">
          <img className="hud-logo" src="/logo.png" alt="" />
          {APP_NAME}
        </span>
        <span className="hud-area">
          <span aria-hidden>{AREA_ICON[area]}</span> {areaName}
          <span className="hud-count">
            {connected ? `${playersHere} ${t('hud.here')}` : t('hud.offline')}
            {connected && area === 'library' && ` · ${t('hud.studying', { count: studying })}`}
          </span>
        </span>
      </div>
      <nav className="hud-links" aria-label={t('hud.menu')}>
        <StatusDialog />
        <FriendsLink />
        <PhoneLink />
        <InboxLink />
        <Wardrobe />
        <SoundToggle />
        <IntroLink />
        <StartOver />
      </nav>
    </header>
  );
}

/** Turns every sound in the game off or on; remembered on this device. */
function SoundToggle() {
  const muted = useGameStore((s) => s.muted);
  return (
    <button
      type="button"
      className="hud-link"
      aria-pressed={muted}
      title={t(muted ? 'hud.sound.on' : 'hud.sound.off')}
      onClick={() => {
        const store = useGameStore.getState();
        store.setMuted(!muted);
        store.setNotice(muted ? 'unmuted' : 'muted');
      }}
    >
      <span className="hud-icon" aria-hidden>
        {muted ? '🔇' : '🔊'}
      </span>
      <span className="hud-label">{t(muted ? 'hud.muted' : 'hud.sound')}</span>
    </button>
  );
}

/** Opens the welcome note again. */
function IntroLink() {
  return (
    <button
      type="button"
      className="hud-link"
      onClick={() => useGameStore.getState().setIntroOpen(true)}
    >
      <span className="hud-icon" aria-hidden>
        ❓
      </span>
      <span className="hud-label">{t('hud.about')}</span>
    </button>
  );
}

/**
 * The top right corner: a small map of the room in a wooden frame, and under
 * it how lively the whole building is right now.
 */
export function MapCorner() {
  const area = useGameStore((s) => s.area);
  const world = useGameStore((s) => s.world);
  const open = useGameStore((s) => s.mapOpen);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = host.current;
    if (!frame) return;
    frame.append(minimap.canvas);
    return () => minimap.canvas.remove();
  }, []);

  return (
    <aside className={`map-corner${open ? '' : ' map-corner--folded'}`} aria-label={t('map.title')}>
      {/* On phones the map starts folded to a small button; desktops never see it. */}
      <button
        type="button"
        className="map-fold"
        aria-expanded={open}
        aria-label={t(open ? 'map.fold' : 'map.unfold')}
        onClick={() => useGameStore.getState().setMapOpen(!open)}
      >
        <span aria-hidden>🗺️</span>
        {world && <span className="map-fold-count">{world.online}</span>}
      </button>
      <div className="map-frame">
        <span className="map-tab">{t(`area.${area}`)}</span>
        <div ref={host} className="map-canvas-host" />
      </div>
      {world && (
        <p className="world-stats">
          <span>
            <b>{world.online}</b> {t('world.online')}
          </span>
          <span>
            <b>{world.studying}</b> {t('world.studying')}
          </span>
        </p>
      )}
      <WorldClock />
    </aside>
  );
}
