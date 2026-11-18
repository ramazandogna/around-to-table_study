import { AREA_RULES, isRoomArea, type AreaId } from '@att/shared';
import { useEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { getLanguage, setLanguage, t } from '../i18n/t';
import { unreadMessages } from '../net/social';
import { layerIndex, panelOpen, useGameStore } from '../state/store';
import { minimap } from '../world/minimap';
import { AmbienceToggle } from './AmbienceToggle';
import { WorldClock } from './Calendar';
import { SignOutLink } from './Gate';
import { StatusLink } from './StatusDialog';
import { ExitLink } from './ExitGame';
import { QuestsPanel } from './Goals';
import { useDialog } from './useDialog';

const AREA_ICON: Record<AreaId, string> = {
  hall: '🚪',
  library: '📚',
  smoking: '☕',
  conference: '🎤',
  room3: '🔑',
  room5: '🔑',
  room9: '🔑',
};

const isPhone = () => window.matchMedia('(max-width: 700px)').matches;

/**
 * The top left corner: a slim pill that says where you are and who is here,
 * and the dock with the five things people open most. On a desktop the dock
 * sits in the bottom left; on a phone it folds under the pill, as the menu did.
 * Everything else (status, sound, language, about, exit, sign out) is in the
 * dock's Menu, so nothing is more than two taps away.
 */
export function HudPlate() {
  const area = useGameStore((s) => s.area);
  const connected = useGameStore((s) => s.connected);
  const playersHere = useGameStore((s) => s.playersHere);
  const studying = useGameStore((s) => s.studying);
  const open = useGameStore((s) => s.plateOpen);
  const layers = useGameStore((s) => s.layers);
  const panel = useGameStore(panelOpen);
  const waiting = useGameStore(somethingWaiting);
  // On a phone the open dock would cover the panel that just opened (the calendar's title, a card): it folds.
  useEffect(() => {
    if (panel && isPhone()) useGameStore.getState().setPlateOpen(false);
  }, [panel]);
  // In a private room the pill shows its name.
  const roomName = useGameStore((s) => (isRoomArea(s.area) ? s.room?.room.name : undefined));
  const areaName = roomName ?? t(`area.${area}`);
  const count = connected ? `${playersHere} ${t('hud.here')}` : t('hud.offline');
  return (
    <header
      className={`hud-title${open ? '' : ' hud-title--folded'}`}
      style={{ zIndex: layerIndex(layers, 'plate') }}
    >
      <div className="hud-place panel panel--compact">
        <button
          type="button"
          className="hud-place-main"
          aria-expanded={open}
          aria-controls="hud-dock"
          title={t(open ? 'hud.fold' : 'hud.unfold')}
          onClick={() => useGameStore.getState().setPlateOpen(!open)}
        >
          <span aria-hidden>{AREA_ICON[area]}</span>
          <span className="hud-place-name">{areaName}</span>
          <span className="hud-count">
            <span className="hud-count-full">{count}</span>
            <span className="hud-count-short" aria-hidden>
              {connected ? playersHere : '…'}
            </span>
            {connected && area === 'library' && (
              <span className="hud-count-full">
                {' · '}
                {t('hud.studying', { count: studying })}
              </span>
            )}
          </span>
          <span className="visually-hidden">{t(open ? 'hud.fold' : 'hud.unfold')}</span>
          <span className="hud-fold-arrow" aria-hidden>
            {open ? '▴' : '▾'}
          </span>
          {!open && waiting && <span className="hud-dot" aria-label={t('hud.waiting')} />}
        </button>
        <SoundToggle compact />
      </div>
      <Dock />
    </header>
  );
}

/** Something in the dock is waiting (a message, a request, a new thing to wear): the folded pill says so. */
function somethingWaiting(s: ReturnType<typeof useGameStore.getState>): boolean {
  return (
    s.inboxUnread > 0 ||
    s.wardrobeNew ||
    s.friends.some((f) => f.unread > 0 || f.state === 'incoming')
  );
}

/** The five things in the dock, each with its name under it (on phones beside it). */
function Dock() {
  // On a phone a tap in the dock folds it, so it never covers what the tap opened.
  const fold = (event: MouseEvent) => {
    if (!isPhone()) return;
    // The menu opens its own list; the dock stays for it.
    if ((event.target as HTMLElement).closest('.hud-dock-menu > button')) return;
    window.setTimeout(() => useGameStore.getState().setPlateOpen(false), 0);
  };
  return (
    <nav id="hud-dock" className="hud-dock" aria-label={t('hud.dock')} onClickCapture={fold}>
      <FriendsButton />
      <PhoneButton />
      <GoalsButton />
      <WardrobeButton />
      <MenuButton />
    </nav>
  );
}

function DockButton({
  icon,
  label,
  expanded,
  onClick,
  children,
  className = '',
}: {
  icon: string;
  label: string;
  expanded?: boolean;
  onClick: () => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`hud-link hud-dock-button ${className}`}
      {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
      onClick={onClick}
    >
      <span className="hud-icon" aria-hidden>
        {icon}
      </span>
      <span className="hud-label">{label}</span>
      {children}
    </button>
  );
}

/** Friends, with a badge for requests waiting on you. */
function FriendsButton() {
  const incoming = useGameStore((s) => s.friends.filter((f) => f.state === 'incoming').length);
  const open = useGameStore((s) => s.friendsOpen);
  return (
    <DockButton
      icon="🤝"
      label={t('friends.title')}
      expanded={open}
      onClick={() => useGameStore.getState().setFriendsOpen(!open)}
    >
      {incoming > 0 && <span className="chat-unread hud-badge">{incoming}</span>}
    </DockButton>
  );
}

/**
 * The phone, with the bell inside it: one badge for messages and for
 * everything else that happened (pokes, invites, answers). In the library the
 * phone stays silent, so the tap opens the bell's list instead, which works
 * everywhere; messages wait as a dot.
 */
function PhoneButton() {
  const unread = useGameStore((s) => unreadMessages(s.friends));
  const bell = useGameStore((s) => s.inboxUnread);
  const phoneOpen = useGameStore((s) => s.phoneOpen);
  const inboxOpen = useGameStore((s) => s.inboxOpen);
  const silent = useGameStore((s) => !AREA_RULES[s.area].phone);
  const open = phoneOpen || inboxOpen;

  function toggle() {
    const store = useGameStore.getState();
    if (open) {
      store.closePhone();
      store.setInboxOpen(false);
    } else if (silent) store.setInboxOpen(true);
    else store.openPhone(null);
  }

  const count = (silent ? 0 : unread) + bell;
  return (
    <DockButton icon="📱" label={t('phone.title')} expanded={open} onClick={toggle}>
      {count > 0 ? (
        <span className="chat-unread hud-badge">{count}</span>
      ) : (
        unread > 0 && <span className="hud-dot" aria-label={t('phone.waiting')} />
      )}
    </DockButton>
  );
}

function GoalsButton() {
  const open = useGameStore((s) => s.goalsOpen);
  return (
    <DockButton
      icon="🎯"
      label={t('goals.button')}
      expanded={open}
      onClick={() => useGameStore.getState().setGoalsOpen(true)}
    />
  );
}

/** The wardrobe, with a dot when there is something new to wear (set by whoever unlocks it). */
function WardrobeButton() {
  const fresh = useGameStore((s) => s.wardrobeNew);
  return (
    <DockButton
      icon="👕"
      label={t('hud.wardrobe')}
      onClick={() => {
        const store = useGameStore.getState();
        store.setWardrobeOpen(true);
        store.setWardrobeNew(false);
      }}
    >
      {fresh && <span className="hud-dot" aria-label={t('hud.wardrobe.new')} />}
    </DockButton>
  );
}

/** The rest of the menu, in a small list over (desktop) or beside (phone) the dock. */
function MenuButton() {
  const open = useGameStore((s) => s.menuOpen);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <div className="hud-dock-menu">
      <button
        ref={button}
        type="button"
        className="hud-link hud-dock-button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="hud-menu"
        onClick={() => useGameStore.getState().setMenuOpen(!open)}
      >
        <span className="hud-icon" aria-hidden>
          ☰
        </span>
        <span className="hud-label">{t('hud.menu')}</span>
      </button>
      {open && <MenuList opener={button} />}
    </div>
  );
}

function MenuList({ opener }: { opener: RefObject<HTMLButtonElement | null> }) {
  const list = useRef<HTMLDivElement>(null);
  const close = () => useGameStore.getState().setMenuOpen(false);
  useDialog(list, close);

  // A tap anywhere else closes the list (the Menu button toggles it itself).
  useEffect(() => {
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (list.current?.contains(target) || opener.current?.contains(target)) return;
      useGameStore.getState().setMenuOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [opener]);

  // Choosing something closes the list once the choice has run; focus goes back to Menu, so the
  // dialog it opens hands focus back there when it closes.
  const choose = (event: MouseEvent) => {
    if (!(event.target as HTMLElement).closest('button')) return;
    opener.current?.focus({ preventScroll: true });
    close();
  };

  return (
    <div
      ref={list}
      id="hud-menu"
      className="hud-menu panel panel--compact"
      role="group"
      aria-label={t('hud.menu')}
      tabIndex={-1}
      onClick={choose}
    >
      <StatusLink />
      <SoundToggle />
      <AmbienceToggle />
      <LanguageToggle />
      <IntroLink />
      <ExitLink />
      <SignOutLink />
    </div>
  );
}

/** Turns every sound in the game off or on; remembered on this device. */
function SoundToggle({ compact = false }: { compact?: boolean }) {
  const muted = useGameStore((s) => s.muted);
  const label = t(muted ? 'hud.sound.on' : 'hud.sound.off');
  return (
    <button
      type="button"
      className={compact ? 'hud-place-sound' : 'hud-link'}
      aria-pressed={muted}
      title={label}
      {...(compact ? { 'aria-label': label } : {})}
      onClick={() => {
        const store = useGameStore.getState();
        store.setMuted(!muted);
        store.setNotice(muted ? 'unmuted' : 'muted');
      }}
    >
      <span className="hud-icon" aria-hidden>
        {muted ? '🔇' : '🔊'}
      </span>
      {!compact && <span className="hud-label">{t(muted ? 'hud.muted' : 'hud.sound')}</span>}
    </button>
  );
}

/** English or Türkçe; switching reloads so every sign changes too. */
function LanguageToggle() {
  const next = getLanguage() === 'en' ? 'tr' : 'en';
  return (
    <button
      type="button"
      className="hud-link"
      title={next === 'tr' ? 'Türkçe' : 'English'}
      onClick={() => setLanguage(next)}
    >
      <span className="hud-icon" aria-hidden>
        🌐
      </span>
      <span className="hud-label">{next === 'tr' ? 'Türkçe' : 'English'}</span>
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
      <QuestsPanel />
    </aside>
  );
}
