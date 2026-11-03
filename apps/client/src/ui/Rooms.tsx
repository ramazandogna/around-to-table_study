import {
  DEFAULT_ROOM_RULES,
  normalizeRoomCode,
  roomArea,
  ROOM_NAME_MAX,
  ROOM_PASSWORD,
  ROOM_SIZES,
  roomInviteMark,
  type RoomInfo,
  type RoomRules,
  type RoomSize,
} from '@att/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { createRoom, enterRoom, findRoom, openRooms, roomLink, type RoomError } from '../net/rooms';
import { useGameStore } from '../state/store';
import { Dialog, Panel } from './Panel';

type Tab = 'open' | 'code' | 'create';

/** Room sizes beyond the free ones, shown as what is coming. */
const LATER = ['room.later.big', 'room.later.decor'] as const;

/**
 * The reception's private rooms: the open ones anyone may join, joining one by
 * its code (and password), and opening your own for 3, 5 or 9 people.
 */
export function RoomsPanel() {
  const open = useGameStore((s) => s.roomsOpen);
  const prefilled = useGameStore((s) => s.roomCode);
  if (!open) return null;
  return <RoomsDialog prefilled={prefilled} />;
}

function RoomsDialog({ prefilled }: { prefilled: string | null }) {
  const session = useGameStore((s) => s.session);
  const [tab, setTab] = useState<Tab>(
    prefilled ? 'code' : useGameStore.getState().roomsAtDesk ? 'create' : 'open',
  );
  const [error, setError] = useState<RoomError | null>(null);
  const [busy, setBusy] = useState(false);
  const atDesk = useGameStore((s) => s.roomsAtDesk);
  const [created, setCreated] = useState<{ room: RoomInfo; password: string } | null>(null);
  const close = () => useGameStore.getState().closeRooms();
  const token = session?.token ?? '';

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && close();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);

  /** Gets the pass and goes: the world takes the elevator up. */
  async function go(code: string, password = '') {
    setBusy(true);
    setError(null);
    const ticket = await enterRoom(token, code, password);
    setBusy(false);
    if (typeof ticket === 'string') {
      setError(ticket);
      if (ticket === 'wrong_password') setTab('code');
      return;
    }
    const store = useGameStore.getState();
    store.closeRooms();
    store.setRoom(ticket);
  }

  return (
    <Dialog>
      <Panel title={t('room.title')} className="panel--dialog panel--rooms">
        <div className="creator-tabs" role="tablist">
          {(['open', 'code', 'create'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              className="tag"
              aria-selected={option === tab}
              aria-pressed={option === tab}
              onClick={() => {
                setTab(option);
                setError(null);
              }}
            >
              {t(`room.tab.${option}`)}
            </button>
          ))}
        </div>
        {tab === 'open' && <OpenRooms token={token} busy={busy} onJoin={(code) => void go(code)} />}
        {tab === 'code' && (
          <JoinByCode
            token={token}
            prefilled={prefilled}
            busy={busy}
            onJoin={(code, password) => void go(code, password)}
          />
        )}
        {tab === 'create' &&
          (created ? (
            <KeyHandover
              room={created.room}
              locked={created.password !== ''}
              busy={busy}
              onGo={() => void go(created.room.code, created.password)}
            />
          ) : atDesk ? (
            <CreateRoom
              token={token}
              busy={busy}
              onError={setError}
              onCreated={(room, password) => setCreated({ room, password })}
            />
          ) : (
            <div className="room-desk">
              <p className="creator-note">{t('room.atDesk')}</p>
              <button
                type="button"
                className="panel-ok"
                onClick={() => useGameStore.getState().walkToDesk()}
              >
                🛎️ {t('room.toDesk')}
              </button>
            </div>
          ))}
        {error && <p className="panel-error">{t(`room.error.${error}`)}</p>}
        <div className="panel-actions">
          <button
            type="button"
            className="panel-button"
            onClick={() => {
              close();
              useGameStore.getState().setIntroOpen(true);
            }}
          >
            {t('room.about')}
          </button>
          <button type="button" className="panel-ok" onClick={close}>
            {t('room.close')}
          </button>
        </div>
      </Panel>
    </Dialog>
  );
}

function OpenRooms({
  token,
  busy,
  onJoin,
}: {
  token: string;
  busy: boolean;
  onJoin: (code: string) => void;
}) {
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  useEffect(() => {
    let live = true;
    void openRooms(token).then(
      (result) => live && setRooms(typeof result === 'string' ? [] : result),
    );
    return () => {
      live = false;
    };
  }, [token]);
  if (!rooms) return <p className="panel-text">{t('room.loading')}</p>;
  if (rooms.length === 0) return <p className="panel-text">{t('room.none')}</p>;
  return (
    <ul className="room-list">
      {rooms.map((room) => (
        <li key={room.code} className="room-line">
          <span className="room-name">🔑 {room.name}</span>
          <span className="room-meta">{t('room.people', { n: room.people, of: room.size })}</span>
          <button
            type="button"
            className="mini-button"
            disabled={busy || room.people >= room.size}
            onClick={() => onJoin(room.code)}
          >
            {room.people >= room.size ? t('room.full') : t('room.join')}
          </button>
        </li>
      ))}
    </ul>
  );
}

function JoinByCode({
  token,
  prefilled,
  busy,
  onJoin,
}: {
  token: string;
  prefilled: string | null;
  busy: boolean;
  onJoin: (code: string, password: string) => void;
}) {
  const [code, setCode] = useState(prefilled ?? '');
  const [password, setPassword] = useState('');
  const [lookup, setLookup] = useState<{ code: string; room: RoomInfo | null } | null>(null);
  const valid = normalizeRoomCode(code);
  // What the reception knows about the code typed, once it has answered for that code.
  const found = lookup && lookup.code === valid ? lookup.room : null;

  useEffect(() => {
    if (!valid) return;
    let live = true;
    void findRoom(token, valid).then(
      (room) => live && setLookup({ code: valid, room: typeof room === 'string' ? null : room }),
    );
    return () => {
      live = false;
    };
  }, [token, valid]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) onJoin(valid, password);
  }

  return (
    <form className="room-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">{t('room.code')}</span>
        <input
          value={code}
          maxLength={8}
          autoCapitalize="characters"
          placeholder="ABC123"
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      {found && (
        <p className="panel-text">
          🔑 {found.name} · {t('room.people', { n: found.people, of: found.size })}
          {found.locked && ` · 🔒 ${t('room.locked')}`}
        </p>
      )}
      {(!found || found.locked) && (
        <label className="field">
          <span className="field-label">{t('room.password')}</span>
          <input
            type="password"
            value={password}
            maxLength={ROOM_PASSWORD.max}
            placeholder={t('room.password.ifAny')}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      <button type="submit" className="panel-ok" disabled={!valid || busy}>
        {t('room.join')}
      </button>
    </form>
  );
}

function CreateRoom({
  token,
  busy,
  onError,
  onCreated,
}: {
  token: string;
  busy: boolean;
  onError: (error: RoomError | null) => void;
  onCreated: (room: RoomInfo, password: string) => void;
}) {
  const name = useGameStore((s) => s.session?.name ?? '');
  const [title, setTitle] = useState(() => t('room.defaultName', { name }));
  const [size, setSize] = useState<RoomSize>(5);
  const [password, setPassword] = useState('');
  const [rules, setRules] = useState<RoomRules>(DEFAULT_ROOM_RULES);
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    onError(null);
    const room = await createRoom(token, title, size, password, rules);
    setWorking(false);
    if (typeof room === 'string') onError(room);
    else onCreated(room, password);
  }

  return (
    <form className="room-form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span className="field-label">{t('room.name')}</span>
        <input value={title} maxLength={ROOM_NAME_MAX} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="room-sizes" role="radiogroup" aria-label={t('room.size')}>
        {ROOM_SIZES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            className="pet-card"
            aria-checked={option === size}
            onClick={() => setSize(option)}
          >
            <span className="pet-card-icon" aria-hidden>
              {option === 3 ? '☕' : option === 5 ? '📚' : '🏛️'}
            </span>
            {t('room.forPeople', { n: option })}
            <span className="room-size-hint">{t(`room.size.${option}`)}</span>
          </button>
        ))}
        {LATER.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            className="pet-card"
            aria-checked={false}
            disabled
          >
            <span className="pet-card-icon" aria-hidden>
              ✨
            </span>
            {t(key)}
            <span className="pet-card-soon">{t('room.premium')}</span>
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field-label">{t('room.password')}</span>
        <input
          type="password"
          value={password}
          maxLength={ROOM_PASSWORD.max}
          placeholder={t('room.password.optional')}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <p className="creator-note">{t(password ? 'room.private.note' : 'room.open.note')}</p>
      <div className="room-sizes" role="radiogroup" aria-label={t('room.type')}>
        {ROOM_TYPES.map(({ id, icon, rules: preset }) => (
          <button
            key={id}
            type="button"
            role="radio"
            className="pet-card"
            aria-checked={rules.sound === preset.sound && rules.games === preset.games}
            onClick={() => setRules({ ...rules, ...preset })}
          >
            <span className="pet-card-icon" aria-hidden>
              {icon}
            </span>
            {t(`room.type.${id}`)}
            <span className="room-size-hint">{t(`room.type.${id}.hint`)}</span>
          </button>
        ))}
      </div>
      <RuleSwitches rules={rules} onChange={setRules} />
      <button type="submit" className="panel-ok" disabled={busy || working}>
        {t('room.create')}
      </button>
    </form>
  );
}

/**
 * Three kinds of room, as presets of the rules below them: a silent one
 * (no sounds, no game table), one to chat in, one with the game table.
 */
const ROOM_TYPES = [
  { id: 'silent', icon: '🤫', rules: { sound: false, games: false } },
  { id: 'chat', icon: '💬', rules: { sound: true, games: false } },
  { id: 'game', icon: '🎲', rules: { sound: true, games: true } },
] as const;

/**
 * The receptionist hands over the key: the room's code, its link to copy and
 * share, and the way up when the player is ready.
 */
function KeyHandover({
  room,
  locked,
  busy,
  onGo,
}: {
  room: RoomInfo;
  locked: boolean;
  busy: boolean;
  onGo: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="room-key">
      <span className="room-key-icon" aria-hidden>
        🔑
      </span>
      <p>
        <b>{t('room.keyTitle', { name: room.name })}</b>
      </p>
      <p className="creator-note">
        {t(locked ? 'room.share.locked' : 'room.share.open', { code: room.code })}
      </p>
      <code className="phone-link">{roomLink(room.code)}</code>
      <div className="phone-foot">
        <button
          type="button"
          className="mini-button"
          onClick={() =>
            void navigator.clipboard?.writeText(roomLink(room.code)).then(() => setCopied(true))
          }
        >
          {copied ? t('room.copied') : t('room.copy')}
        </button>
        <button type="button" className="panel-ok" disabled={busy} onClick={onGo}>
          ⬆️ {t('room.goUp')}
        </button>
      </div>
    </div>
  );
}

/** The room's rules as small switches: sounds, pets, a game table. */
function RuleSwitches({
  rules,
  onChange,
}: {
  rules: RoomRules;
  onChange: (rules: RoomRules) => void;
}) {
  return (
    <fieldset className="room-rules">
      <legend className="field-label">{t('room.rules')}</legend>
      {(['sound', 'pets', 'games'] as const).map((rule) => (
        <label key={rule} className="check">
          <input
            type="checkbox"
            checked={rules[rule]}
            onChange={(e) => onChange({ ...rules, [rule]: e.target.checked })}
          />
          {t(`room.rule.${rule}`)}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * The owner's window: the room's rules, who is inside (to send someone out, or
 * ban them for good), who is banned, and closing the room.
 */
export function RoomAdmin() {
  const open = useGameStore((s) => s.roomAdminOpen);
  const ticket = useGameStore((s) => s.room);
  const current = useGameStore((s) => s.roomRules);
  const people = useGameStore((s) => s.roomPeople);
  const banned = useGameStore((s) => s.roomBans);
  const social = useGameStore((s) => s.social);
  const code = ticket?.room.code;
  useEffect(() => {
    if (open && code) social?.roomBans(code);
  }, [open, code, social]);
  if (!open || !ticket || !code) return null;
  const store = useGameStore.getState();
  const rules = current ?? ticket.room.rules;
  const close = () => store.setRoomAdminOpen(false);
  return (
    <Dialog>
      <Panel title={`🗝️ ${ticket.room.name}`} className="panel--dialog panel--rooms">
        <RuleSwitches
          rules={rules}
          onChange={(next) => {
            // Shown at once; the room confirms it to everyone inside.
            store.setRoomRules(next);
            social?.roomRules(code, next);
          }}
        />
        <p className="field-label">{t('room.admin.people')}</p>
        {people.length === 0 ? (
          <p className="board-empty">{t('room.admin.nobody')}</p>
        ) : (
          <ul className="room-list">
            {people.map((person) => (
              <li key={person.id} className="room-line">
                <span className="room-name">{person.name}</span>
                <button
                  type="button"
                  className="mini-button"
                  title={t('room.admin.kick.hint')}
                  onClick={() => {
                    social?.roomOut(code, person.id, false);
                    store.setNotice('off', t('room.admin.kicked', { name: person.name }));
                  }}
                >
                  🚪 {t('room.admin.kick')}
                </button>
                <button
                  type="button"
                  className="mini-button"
                  title={t('room.admin.ban.hint')}
                  onClick={() => {
                    social?.roomOut(code, person.id, true);
                    store.setNotice('off', t('room.admin.banned', { name: person.name }));
                  }}
                >
                  ⛔ {t('room.admin.ban')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {banned.length > 0 && (
          <>
            <p className="field-label">{t('room.admin.bannedList')}</p>
            <ul className="room-list">
              {banned.map((person) => (
                <li key={person.id} className="room-line">
                  <span className="room-name">{person.name}</span>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => social?.roomUnban(code, person.id)}
                  >
                    {t('room.admin.unban')}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="panel-actions">
          <button
            type="button"
            className="panel-button"
            onClick={() =>
              store.ask({
                kind: 'closeRoom',
                name: ticket.room.name,
                answer: (choice) => {
                  store.ask(null);
                  if (choice !== 'end') return;
                  social?.roomClose(code);
                  close();
                },
              })
            }
          >
            🗝️ {t('room.admin.close')}
          </button>
          <button type="button" className="panel-ok" onClick={close}>
            {t('table.close')}
          </button>
        </div>
      </Panel>
    </Dialog>
  );
}

/**
 * While in a private room: its code on the HUD, to copy a link or to send it
 * to a friend's phone. Its owner also gets the room's settings.
 */
export function RoomChip() {
  const ticket = useGameStore((s) => s.room);
  const area = useGameStore((s) => s.area);
  const friends = useGameStore((s) => s.friends);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const myId = useGameStore((s) => s.session?.id);
  if (!ticket) return null;
  const { room } = ticket;
  const owner = room.owner === myId;
  const online = friends.filter((f) => f.state === 'friend');
  const inside = area === roomArea(room.size);

  return (
    <div className="room-chip">
      <button type="button" className="room-chip-button" onClick={() => setOpen(!open)}>
        🔑 {room.name} · <b>{room.code}</b>
      </button>
      {open && (
        <div className="panel panel--compact room-chip-sheet">
          <p className="panel-text">
            {t(room.locked ? 'room.share.locked' : 'room.share.open', { code: room.code })}
          </p>
          {owner && (
            <button
              type="button"
              className="mini-button mini-button--ok"
              onClick={() => {
                setOpen(false);
                useGameStore.getState().setRoomAdminOpen(true);
              }}
            >
              ⚙️ {t('room.admin.open')}
            </button>
          )}
          {!inside && (
            <div className="tags">
              <button
                type="button"
                className="mini-button mini-button--ok"
                onClick={() => {
                  setOpen(false);
                  // A fresh copy of the ticket takes the elevator up again.
                  useGameStore.getState().setRoom({ ...ticket });
                }}
              >
                ⬆️ {t('room.goBack')}
              </button>
              <button
                type="button"
                className="mini-button"
                onClick={() => useGameStore.getState().setRoom(null)}
              >
                {t('room.forget')}
              </button>
            </div>
          )}
          <button
            type="button"
            className="mini-button"
            onClick={() => {
              void navigator.clipboard?.writeText(roomLink(room.code)).then(() => setCopied(true));
            }}
          >
            {copied ? t('room.copied') : t('room.copy')}
          </button>
          {online.length > 0 && <p className="field-label">{t('room.inviteFriend')}</p>}
          <div className="tags">
            {online.map((friend) => (
              <button
                key={friend.id}
                type="button"
                className="tag"
                onClick={() => {
                  const store = useGameStore.getState();
                  store.social?.dm(
                    friend.id,
                    `${t('room.inviteText', { name: room.name })} ${roomInviteMark(room.code)}`,
                  );
                  store.setNotice('room_invited', friend.name);
                }}
              >
                📱 {friend.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** "ayse invites you to 'Exam crew'": join or let it go. */
export function InviteToast() {
  const invite = useGameStore((s) => s.invite);
  if (!invite) return null;
  const store = useGameStore.getState();
  return (
    <div className="panel panel--compact invite-toast" role="alert">
      <p className="panel-text">{t('room.invited', { name: invite.from, room: invite.name })}</p>
      <div className="panel-actions">
        <button type="button" className="panel-button" onClick={() => store.setInvite(null)}>
          {t('room.invited.no')}
        </button>
        <button
          type="button"
          className="panel-ok"
          onClick={() => {
            store.setInvite(null);
            store.openRooms(invite.code);
          }}
        >
          {t('room.invited.yes')}
        </button>
      </div>
    </div>
  );
}
