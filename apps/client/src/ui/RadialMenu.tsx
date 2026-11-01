import { AREA_RULES } from '@att/shared';
import { useEffect } from 'react';
import { t, type MessageKey } from '../i18n/t';
import { useGameStore } from '../state/store';

/** How far the buttons sit from the middle of the ring, in pixels. */
const RADIUS = 78;
/** The ring closes once the mouse wanders this far from its middle. */
const CLOSE_DISTANCE = 128;

type Action = {
  id: string;
  icon: string;
  label: MessageKey;
  /** Why it cannot be used here, if it cannot. */
  off?: MessageKey | undefined;
  run: () => void;
};

/**
 * A ring of things to do around your own character: dance, set your status,
 * send a message, show an emote, change clothes. It opens when the mouse
 * rests on you (or you tap yourself) and closes when the mouse moves away.
 */
export function RadialMenu() {
  const radial = useGameStore((s) => s.radial);
  const area = useGameStore((s) => s.area);
  const dancing = useGameStore((s) => s.dancing);
  const seated = useGameStore((s) => s.seated);

  useEffect(() => {
    if (!radial) return;
    const away = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      if (Math.hypot(event.clientX - radial.x, event.clientY - radial.y) > CLOSE_DISTANCE) {
        useGameStore.getState().setRadial(null);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useGameStore.getState().setRadial(null);
    };
    window.addEventListener('pointermove', away);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointermove', away);
      window.removeEventListener('keydown', escape);
    };
  }, [radial]);

  if (!radial) return null;
  const rules = AREA_RULES[area];
  const store = useGameStore.getState();
  const actions: Action[] = [
    {
      id: 'dance',
      icon: dancing ? '🛑' : '💃',
      label: dancing ? 'radial.stop' : 'radial.dance',
      off: !rules.dance ? 'radial.dance.off' : seated ? 'radial.dance.seated' : undefined,
      run: () => store.setDancing(!dancing),
    },
    {
      id: 'status',
      icon: '💭',
      label: 'radial.status',
      run: () => store.setStatusOpen(true),
    },
    {
      id: 'message',
      icon: '📱',
      label: 'radial.message',
      off: rules.dmAllowed ? undefined : 'radial.message.off',
      run: () => store.openPhone(null),
    },
    {
      id: 'emote',
      icon: '😊',
      label: 'radial.emote',
      run: () => store.setEmoteOpen(true),
    },
    {
      id: 'wardrobe',
      icon: '👕',
      label: 'radial.wardrobe',
      run: () => store.setWardrobeOpen(true),
    },
    {
      id: 'about',
      icon: '❓',
      label: 'radial.about',
      run: () => store.setIntroOpen(true),
    },
  ];

  return (
    <div
      className="radial"
      style={{ left: radial.x, top: radial.y }}
      role="menu"
      aria-label={t('radial.title')}
    >
      <span className="radial-ring" aria-hidden />
      {actions.map((action, i) => {
        // Start at the top and go round clockwise.
        const angle = -Math.PI / 2 + (i / actions.length) * Math.PI * 2;
        const disabled = action.off !== undefined;
        return (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            className="radial-button"
            style={{
              translate: `${Math.cos(angle) * RADIUS}px ${Math.sin(angle) * RADIUS}px`,
              animationDelay: `${i * 25}ms`,
            }}
            aria-disabled={disabled}
            title={action.off ? t(action.off) : t(action.label)}
            onClick={() => {
              if (action.off) {
                store.setNotice(action.id === 'dance' ? 'no_dance' : 'phone_silent');
                return;
              }
              store.setRadial(null);
              action.run();
            }}
          >
            <span className="radial-icon" aria-hidden>
              {action.icon}
            </span>
            <span className="radial-label">{t(action.label)}</span>
          </button>
        );
      })}
    </div>
  );
}
