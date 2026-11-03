import { AREA_RULES, DANCES, EMOTES, EMPTY_LINES, type Dance } from '@att/shared';
import { useEffect } from 'react';
import { t, type MessageKey } from '../i18n/t';
import { useGameStore, type Radial } from '../state/store';
import { emoteImage } from '../world/emotes';

/** How far the buttons sit from the middle of the ring, in pixels. */
const RADIUS = 78;
/** The ring closes once the mouse wanders this far from its middle. */
const CLOSE_DISTANCE = 128;

type Action = {
  id: string;
  /** An emoji, or an image for emotes. */
  icon: string;
  image?: string;
  label: MessageKey;
  /** Shown instead of `label` when the words are not ours (a person's name). */
  text?: string;
  /** Why it cannot be used here, if it cannot. */
  off?: MessageKey | undefined;
  run: () => void;
};

/**
 * A ring of things to do, around a character. Around your own: dance, smoke,
 * set your status, send a message, show an emote (which opens a second ring of
 * emotes in the same place), change clothes. Around someone else: poke, add as
 * a friend, message, invite, look at their profile, mute or block. It opens on
 * a tap (or when the mouse rests on you) and closes when the mouse moves away.
 */
export function RadialMenu() {
  const radial = useGameStore((s) => s.radial);
  const area = useGameStore((s) => s.area);
  const dancing = useGameStore((s) => s.dancing);
  const smoking = useGameStore((s) => s.smoking);
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
  const actions =
    radial.mode === 'emote'
      ? emoteActions()
      : radial.mode === 'dance'
        ? danceActions(dancing)
        : radial.mode === 'pick'
          ? pickActions(radial)
          : radial.mode === 'person'
            ? personActions(radial)
            : selfActions(radial, { area, dancing, smoking, seated });
  return <Ring radial={radial} actions={actions} />;
}

const DANCE_ICON: Record<Dance, string> = {
  bounce: '💃',
  sway: '🌊',
  robot: '🤖',
  disco: '🕺',
  twist: '🌀',
  cheer: '🙌',
};

/**
 * People standing on top of each other: one button each, to say who was meant.
 * Picking one opens their own ring in the same place.
 */
function pickActions(radial: Radial): Action[] {
  const store = useGameStore.getState();
  return (radial.people ?? []).map((person) => ({
    id: person.id,
    icon: person.name.slice(0, 1).toUpperCase(),
    label: 'radial.pick',
    text: person.name,
    run: () =>
      window.setTimeout(
        () =>
          store.setRadial({
            x: radial.x,
            y: radial.y,
            mode: 'person',
            id: person.id,
            name: person.name,
            lines: person.lines,
          }),
        0,
      ),
  }));
}

/** The six dances, and a stop while one is on. */
function danceActions(dancing: boolean): Action[] {
  const store = useGameStore.getState();
  const moves: Action[] = DANCES.map((dance, move) => ({
    id: dance,
    icon: DANCE_ICON[dance],
    label: `dance.${dance}` as MessageKey,
    run: () => store.setDancing(true, move),
  }));
  return dancing
    ? [
        ...moves,
        { id: 'stop', icon: '🛑', label: 'radial.stop', run: () => store.setDancing(false) },
      ]
    : moves;
}

function emoteActions(): Action[] {
  const store = useGameStore.getState();
  return EMOTES.map((emote) => ({
    id: emote,
    icon: '',
    image: emoteImage(emote),
    label: `emote.${emote}` as MessageKey,
    run: () => store.connection?.emote(emote),
  }));
}

/** What you can do with someone: everything starts from here. */
function personActions(radial: Radial): Action[] {
  const store = useGameStore.getState();
  const id = radial.id ?? '';
  const name = radial.name ?? '';
  const lines = radial.lines ?? EMPTY_LINES;
  const friendship = store.friends.find((f) => f.id === id)?.state ?? null;
  const muted = id in store.mutedPeople;
  const blocked = store.blocked.some((b) => b.id === id);
  const rules = AREA_RULES[store.area];
  const actions: Action[] = [
    {
      id: 'poke',
      icon: '👉',
      label: 'ring.poke',
      run: () => store.connection?.poke(id),
    },
    {
      id: 'friend',
      icon: friendship === 'friend' ? '⭐' : '🤝',
      label:
        friendship === 'friend'
          ? 'ring.friends'
          : friendship === 'incoming'
            ? 'ring.accept'
            : friendship === 'outgoing'
              ? 'ring.asked'
              : 'ring.befriend',
      off: friendship === 'friend' || friendship === 'outgoing' ? 'ring.already' : undefined,
      run: () => {
        store.social?.befriend(id);
        store.setNotice('friend_sent', name);
      },
    },
    {
      id: 'message',
      icon: friendship === 'friend' ? '📱' : '✉️',
      label: friendship === 'friend' ? 'ring.phone' : 'ring.whisper',
      off: friendship !== 'friend' && !rules.dmAllowed ? 'card.whisper.library' : undefined,
      run: () =>
        friendship === 'friend'
          ? store.openPhone(id)
          : store.setSelected({ id, name, lines, view: 'whisper' }),
    },
    ...(store.room
      ? [
          {
            id: 'invite',
            icon: '🔑',
            label: 'ring.invite',
            run: () => {
              const room = store.room?.room;
              if (!room) return;
              store.connection?.invite(id, room.code, room.name);
              store.setNotice('room_invited', name);
            },
          } satisfies Action,
        ]
      : []),
    {
      id: 'profile',
      icon: '🪪',
      label: 'ring.profile',
      run: () => store.setSelected({ id, name, lines, view: 'profile' }),
    },
    {
      id: 'mute',
      icon: muted ? '🔊' : '🔇',
      label: muted ? 'ring.unmute' : 'ring.mute',
      run: () => {
        if (muted) store.unmute(id);
        else store.mute(id, name);
        store.setNotice(muted ? 'unmuted_person' : 'muted_person', name);
      },
    },
    {
      id: 'block',
      icon: '🚫',
      label: blocked ? 'ring.unblock' : 'ring.block',
      run: () =>
        blocked
          ? store.social?.unblock(id)
          : store.ask({
              kind: 'block',
              name,
              answer: (choice) => {
                store.ask(null);
                if (choice !== 'end') return;
                store.social?.block(id);
                store.setNotice('blocked', name);
              },
            }),
    },
  ];
  return actions;
}

function selfActions(
  radial: Radial,
  state: { area: keyof typeof AREA_RULES; dancing: boolean; smoking: boolean; seated: boolean },
): Action[] {
  const { area, dancing, smoking, seated } = state;
  const rules = AREA_RULES[area];
  const store = useGameStore.getState();
  return [
    {
      id: 'dance',
      icon: dancing ? '🛑' : '💃',
      label: dancing ? 'radial.stop' : 'radial.dance',
      off: !rules.dance ? 'radial.dance.off' : seated ? 'radial.dance.seated' : undefined,
      // The six dances open as a ring of their own (with a stop while one is on).
      run: () => window.setTimeout(() => store.setRadial({ ...radial, mode: 'dance' }), 0),
    },
    // Only where people smoke, right beside the dance.
    ...(rules.smoke
      ? [
          {
            id: 'smoke',
            icon: smoking ? '🚭' : '🚬',
            label: smoking ? 'radial.smoke.stop' : 'radial.smoke',
            off: seated ? 'radial.dance.seated' : undefined,
            run: () => store.setSmoking(!smoking),
          } satisfies Action,
        ]
      : []),
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
      off: rules.phone ? undefined : 'radial.message.off',
      run: () => store.openPhone(null),
    },
    {
      id: 'emote',
      icon: '😊',
      label: 'radial.emote',
      // The emotes open as a ring of their own, around the character.
      run: () => window.setTimeout(() => store.setRadial({ ...radial, mode: 'emote' }), 0),
    },
    {
      id: 'profile',
      icon: '🪪',
      label: 'radial.profile',
      run: () => {
        const session = store.session;
        if (session) {
          store.setSelected({
            id: session.id,
            name: session.name,
            lines: store.lines,
            view: 'profile',
          });
        }
      },
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
}

function Ring({ radial, actions }: { radial: Radial; actions: Action[] }) {
  const store = useGameStore.getState();
  return (
    <div
      className={`radial radial--${radial.mode ?? 'self'}`}
      style={{ left: radial.x, top: radial.y }}
      role="menu"
      aria-label={radial.mode === 'person' ? (radial.name ?? '') : t('radial.title')}
    >
      <span className="radial-ring" aria-hidden />
      {actions.map((action, i) => {
        // More buttons need a wider ring. Start at the top and go round clockwise.
        const radius = Math.max(RADIUS, actions.length * 11);
        const angle = -Math.PI / 2 + (i / actions.length) * Math.PI * 2;
        const disabled = action.off !== undefined;
        return (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            className="radial-button"
            style={{
              translate: `${Math.cos(angle) * radius}px ${Math.sin(angle) * radius}px`,
              animationDelay: `${i * 25}ms`,
            }}
            aria-disabled={disabled}
            title={action.off ? t(action.off) : (action.text ?? t(action.label))}
            // In a crowd's chooser, pointing at a name rings that person on the floor.
            {...(radial.mode === 'pick'
              ? {
                  onPointerEnter: () => store.setRingFor(action.id),
                  onFocus: () => store.setRingFor(action.id),
                  onPointerLeave: () => store.setRingFor(null),
                }
              : {})}
            onClick={() => {
              if (action.off) {
                store.setNotice('off', t(action.off));
                return;
              }
              store.setRadial(null);
              action.run();
            }}
          >
            <span className="radial-icon" aria-hidden>
              {action.image ? <img src={action.image} alt="" /> : action.icon}
            </span>
            <span className="radial-label">{action.text ?? t(action.label)}</span>
          </button>
        );
      })}
    </div>
  );
}
