import {
  DARTS_PER_TURN,
  isParlor,
  isRoomArea,
  maxPlayers,
  parlorTurns,
  minPlayers,
  PIG_GOAL,
  TABLE_GAMES,
  TURN_MS,
  type Table,
  type TableAction,
  type TableKind,
} from '@att/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { play } from '../audio/sound';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { drawDartboard } from '../world/smokingProps';
import { useNow } from './Calendar';
import { Dialog, Panel } from './Panel';
import { BestOfPicker, ParlorView } from './ParlorGames';

/**
 * The smoking room's table games, for two to four people: darts at the
 * cabinet, and Pig (dice) or Higher-lower (a number) at the round table. The
 * server deals and rolls; this panel shows the table, whose turn it is, and
 * the buttons for the player's own turn. Anyone in the room can watch.
 */

const ICON: Record<TableKind, string> = {
  darts: '🎯',
  pig: '🎲',
  guess: '🔢',
  rps: '✊',
  coin: '🪙',
  duel: '🎲',
  ttt: '⭕',
  chain: '🔤',
  math: '➗',
  emoji: '🤔',
};
/** Colours of each seat's darts and name, in seat order. */
const SEAT_COLOURS = ['#e65f4f', '#4f7fd8', '#5cc37c', '#f2b340'];

const send = (kind: TableKind, action: TableAction) =>
  useGameStore.getState().connection?.table(kind, action);

export function TableGames() {
  const open = useGameStore((s) => s.tableOpen);
  const close = () => useGameStore.getState().setTableOpen(null);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && close();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);

  if (!open) return null;
  return (
    <Dialog>
      <Panel
        title={open === 'menu' ? t('table.title') : `${ICON[open]} ${t(`table.${open}.title`)}`}
        className="panel--dialog panel--game panel--table"
      >
        {open === 'menu' ? <Menu /> : <TableView kind={open} />}
        <div className="panel-actions">
          {open !== 'menu' && (
            <button
              type="button"
              className="panel-button"
              onClick={() => useGameStore.getState().setTableOpen('menu')}
            >
              {t('table.games')}
            </button>
          )}
          <button type="button" className="panel-ok" onClick={close}>
            {t('table.close')}
          </button>
        </div>
      </Panel>
    </Dialog>
  );
}

/** The three games, each with who is at it. */
function Menu() {
  const tables = useGameStore((s) => s.tables);
  // A private room's table has the dice and the number game; darts need the smoking room's board.
  const area = useGameStore((s) => s.area);
  const kinds = isRoomArea(area) ? TABLE_GAMES.filter((k) => k !== 'darts') : TABLE_GAMES;
  return (
    <>
      <MenuGroup
        title={t('table.group.board')}
        kinds={kinds.filter((k) => !isParlor(k))}
        tables={tables}
      />
      <MenuGroup title={t('table.group.quick')} kinds={kinds.filter(isParlor)} tables={tables} />
    </>
  );
}

function MenuGroup({
  title,
  kinds,
  tables,
}: {
  title: string;
  kinds: readonly TableKind[];
  tables: Partial<Record<TableKind, Table>>;
}) {
  if (kinds.length === 0) return null;
  return (
    <>
      <h4 className="table-group">{title}</h4>
      <ul className="table-menu">
        {kinds.map((kind) => {
          const table = tables[kind];
          const state = !table
            ? t('table.state.free')
            : table.phase === 'lobby'
              ? t('table.state.lobby', { n: table.players.length, of: maxPlayers(kind) })
              : table.phase === 'playing'
                ? t('table.state.playing')
                : t('table.state.over');
          return (
            <li key={kind}>
              <button
                type="button"
                className="pet-card table-card"
                onClick={() => useGameStore.getState().setTableOpen(kind)}
              >
                <span className="pet-card-icon" aria-hidden>
                  {ICON[kind]}
                </span>
                <b>{t(`table.${kind}.title`)}</b>
                <span className="room-size-hint">{t(`table.${kind}.short`)}</span>
                <span className="table-card-state">{state}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function TableView({ kind }: { kind: TableKind }) {
  const table = useGameStore((s) => s.tables[kind]);
  const myId = useGameStore((s) => s.session?.id ?? '');
  useWinnerCheer(kind, table, myId);

  if (!table) {
    return (
      <div className="table-view">
        <p className="panel-text">{t(`table.${kind}.rules`)}</p>
        <button
          type="button"
          className="panel-ok game-button"
          onClick={() => send(kind, { a: 'open' })}
        >
          {t('table.open')}
        </button>
      </div>
    );
  }
  const seat = table.players.findIndex((p) => p.id === myId);
  const seated = seat >= 0;
  return (
    <div className="table-view">
      <Seats table={table} myId={myId} />
      {table.phase === 'lobby' && <Lobby kind={kind} table={table} seated={seated} />}
      {table.phase !== 'lobby' && kind === 'darts' && <Darts table={table} seat={seat} />}
      {table.phase !== 'lobby' && kind === 'pig' && <Pig table={table} seat={seat} />}
      {table.phase !== 'lobby' && kind === 'guess' && <Guess table={table} seat={seat} />}
      {table.phase !== 'lobby' && isParlor(kind) && (
        <ParlorView kind={kind} table={table} seat={seat} />
      )}
      {table.phase === 'playing' && <TurnClock kind={kind} table={table} seated={seated} />}
      {table.phase === 'over' && <Over kind={kind} table={table} />}
      {seated && table.phase !== 'over' && (
        <button type="button" className="mini-button" onClick={() => send(kind, { a: 'leave' })}>
          {t('table.leave')}
        </button>
      )}
    </div>
  );
}

/** Who sits at the table, their points, and an arrow at whose turn it is. */
function Seats({ table, myId }: { table: Table; myId: string }) {
  // The quick games played all at once have no "whose turn".
  const turns = !isParlor(table.kind) || parlorTurns(table.kind);
  const isTurn = (i: number) => turns && table.phase === 'playing' && table.turn === i;
  return (
    <ol className="table-seats">
      {table.players.map((player, i) => (
        <li
          key={player.id}
          className={`table-seat${isTurn(i) ? ' table-seat--turn' : ''}`}
          style={{ borderColor: SEAT_COLOURS[i] }}
        >
          <span className="table-seat-name">
            {isTurn(i) ? '▶ ' : ''}
            {player.id === table.host ? '👑 ' : ''}
            {player.id === myId ? t('table.you') : player.name}
          </span>
          <b className="table-seat-score">
            {table.kind === 'guess' ? '' : (table.scores[i] ?? 0)}
            {table.winners.includes(player.id) ? ' 🏆' : ''}
          </b>
        </li>
      ))}
    </ol>
  );
}

function Lobby({ kind, table, seated }: { kind: TableKind; table: Table; seated: boolean }) {
  const missing = Math.max(0, minPlayers(kind) - table.players.length);
  const full = table.players.length >= maxPlayers(kind);
  return (
    <>
      <p className="panel-text">{t(`table.${kind}.rules`)}</p>
      {isParlor(kind) && <BestOfPicker kind={kind} table={table} />}
      <p className="game-status">
        {missing > 0
          ? t('table.waiting', { n: missing })
          : kind === 'darts' && table.players.length === 1
            ? t('table.solo')
            : t('table.ready')}
      </p>
      <div className="tags">
        {!seated && (
          <button
            type="button"
            className="panel-ok"
            disabled={full}
            onClick={() => send(kind, { a: 'join' })}
          >
            {full ? t('table.full') : t('table.join')}
          </button>
        )}
        {seated && (
          <button
            type="button"
            className="panel-ok"
            disabled={missing > 0}
            onClick={() => send(kind, { a: 'start' })}
          >
            {t('table.start')}
          </button>
        )}
      </div>
      {seated && missing > 0 && <p className="creator-note">{t('table.invite')}</p>}
    </>
  );
}

/** How long the turn has left; a turn left alone is played for the absent player. */
function TurnClock({ kind, table, seated }: { kind: TableKind; table: Table; seated: boolean }) {
  // The turn started on the server's clock, so count on it too (a phone's clock may be off).
  const offset = useGameStore((s) => s.clockOffset);
  const now = useNow(500) + offset;
  const left = Math.max(0, table.turnStartedAt + TURN_MS - now);
  const nudged = useRef(0);
  useEffect(() => {
    // Anyone at the table may ask the server to move a stuck turn on; it checks its own clock.
    if (left > 0 || !seated || nudged.current === table.turnStartedAt) return;
    nudged.current = table.turnStartedAt;
    const timer = window.setTimeout(() => send(kind, { a: 'nudge' }), 1500);
    return () => window.clearTimeout(timer);
  }, [left, seated, kind, table.turnStartedAt]);
  return (
    <p className="table-clock" aria-live="off">
      ⏱ {Math.ceil(left / 1000)}s
    </p>
  );
}

function Over({ kind, table }: { kind: TableKind; table: Table }) {
  const names = table.players
    .filter((p) => table.winners.includes(p.id))
    .map((p) => p.name)
    .join(' & ');
  return (
    <>
      <p className="game-status table-winner">
        {table.players.length === 1
          ? `🎯 ${t('table.score', { n: table.scores[0] ?? 0 })}`
          : `🏆 ${t('table.won', { name: names || '—' })}`}
      </p>
      <button
        type="button"
        className="panel-ok game-button"
        onClick={() => send(kind, { a: 'open' })}
      >
        {t('table.again')}
      </button>
    </>
  );
}

/** The winner tells the room once, through their own bubble, with a cheer. */
function useWinnerCheer(kind: TableKind, table: Table | undefined, myId: string) {
  const told = useRef<string | null>(null);
  useEffect(() => {
    if (!table || table.phase !== 'over' || !table.winners.includes(myId)) return;
    if (table.players.length < 2) return;
    const key = `${table.turnStartedAt}:${table.winners.join(',')}`;
    if (told.current === key) return;
    told.current = key;
    const store = useGameStore.getState();
    store.connection?.say(`🏆 ${t('table.brag', { game: t(`table.${kind}.title`) })}`);
    store.connection?.emote('cheer');
    play('finish');
  }, [kind, table, myId]);
}

/* ---------- Darts: the aim sways across the board; a tap throws ---------- */

const BOARD = 260;
/** The board's double ring is this share of the canvas half-width (as drawn by drawDartboard). */
const BOARD_RADIUS = 0.8;

/** Where the aim is at a time: a quick, uneven sway that gets quicker with every dart. */
function aimAt(time: number, dart: number): { x: number; y: number } {
  const speed = 1 + dart * 0.25;
  return {
    x: 0.78 * Math.sin(time * 2.1 * speed) * Math.cos(time * 0.7),
    y: 0.78 * Math.sin(time * 2.9 * speed + 1.3),
  };
}

function Darts({ table, seat }: { table: Table; seat: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const board = useRef<HTMLCanvasElement | null>(null);
  const start = useRef(0);
  const [aiming, setAiming] = useState(false);
  const mine = table.darts.filter((d) => d.player === seat).length;
  const myTurn = table.phase === 'playing' && table.turn === seat;
  const heard = useRef(table.darts.length);

  // A thud for every dart that lands, the player's or anyone else's.
  useEffect(() => {
    if (table.darts.length > heard.current) play('dart');
    heard.current = table.darts.length;
  }, [table.darts.length]);

  useEffect(() => {
    if (!board.current) {
      const off = document.createElement('canvas');
      off.width = off.height = BOARD;
      const context = off.getContext('2d');
      if (context) drawDartboard(context, BOARD);
      board.current = off;
    }
    start.current = performance.now();
    let frame = 0;
    const draw = () => {
      const context = canvas.current?.getContext('2d');
      const art = board.current;
      if (context && art) {
        context.clearRect(0, 0, BOARD, BOARD);
        context.drawImage(art, 0, 0);
        const toScreen = (x: number, y: number) => ({
          x: BOARD / 2 + x * BOARD_RADIUS * (BOARD / 2),
          y: BOARD / 2 - y * BOARD_RADIUS * (BOARD / 2),
        });
        for (const dart of table.darts) {
          if (Math.hypot(dart.x, dart.y) > 1.4) continue;
          const p = toScreen(dart.x, dart.y);
          context.fillStyle = SEAT_COLOURS[dart.player] ?? '#fff';
          context.strokeStyle = '#111';
          context.lineWidth = 2;
          context.beginPath();
          context.arc(p.x, p.y, 5, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        }
        if (myTurn) {
          const aim = aimAt((performance.now() - start.current) / 1000, mine);
          const p = toScreen(aim.x, aim.y);
          context.strokeStyle = '#ffffff';
          context.lineWidth = 2;
          context.beginPath();
          context.arc(p.x, p.y, 11, 0, Math.PI * 2);
          context.moveTo(p.x - 16, p.y);
          context.lineTo(p.x + 16, p.y);
          context.moveTo(p.x, p.y - 16);
          context.lineTo(p.x, p.y + 16);
          context.stroke();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [table.darts, myTurn, mine]);

  function shoot() {
    if (!myTurn || aiming) return;
    const aim = aimAt((performance.now() - start.current) / 1000, mine);
    setAiming(true);
    send('darts', { a: 'throw', x: aim.x, y: aim.y });
    // One dart at a time: the next is ready once the server has this one.
    window.setTimeout(() => setAiming(false), 350);
  }

  const last = table.darts[table.darts.length - 1];
  return (
    <>
      <canvas
        ref={canvas}
        width={BOARD}
        height={BOARD}
        className="dart-board"
        aria-label={t('table.darts.title')}
        onPointerDown={shoot}
      />
      <p className="game-status">
        {myTurn
          ? t('table.darts.yours', { n: DARTS_PER_TURN - mine })
          : last
            ? t('table.darts.last', { score: last.score })
            : t('table.watching')}
      </p>
      {myTurn && (
        <button type="button" className="panel-ok game-button" onClick={shoot}>
          🎯 {t('table.darts.throw')}
        </button>
      )}
    </>
  );
}

/* ---------- Pig: roll as often as you dare ---------- */

const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function Pig({ table, seat }: { table: Table; seat: number }) {
  const myTurn = table.phase === 'playing' && table.turn === seat;
  const rolled = useRef(table.roll);
  useEffect(() => {
    if (table.roll !== null && table.roll !== rolled.current) play('dice');
    rolled.current = table.roll;
  }, [table.roll, table.turnStartedAt, table.pot]);
  const busted = table.roll === 1;
  return (
    <>
      <div className="pig-die" aria-live="polite">
        {table.roll ? DIE_FACES[table.roll] : '🎲'}
      </div>
      <p className="game-status">
        {busted ? t('table.pig.bust') : t('table.pig.pot', { pot: table.pot, goal: PIG_GOAL })}
      </p>
      {myTurn && (
        <div className="tags">
          <button type="button" className="panel-ok" onClick={() => send('pig', { a: 'roll' })}>
            🎲 {t('table.pig.roll')}
          </button>
          <button
            type="button"
            className="panel-button"
            disabled={table.pot === 0}
            onClick={() => send('pig', { a: 'hold' })}
          >
            ✋ {t('table.pig.hold')}
          </button>
        </div>
      )}
      {!myTurn && table.phase === 'playing' && (
        <p className="creator-note">{t('table.watching')}</p>
      )}
    </>
  );
}

/* ---------- Higher-lower: find the number ---------- */

function Guess({ table, seat }: { table: Table; seat: number }) {
  const myTurn = table.phase === 'playing' && table.turn === seat;
  const [value, setValue] = useState('');
  const n = Number(value);
  const valid = value !== '' && Number.isInteger(n) && n >= table.low && n <= table.high;
  const last = table.guess;
  const who = last ? table.players[last.player]?.name : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    send('guess', { a: 'guess', n });
    setValue('');
  }

  return (
    <>
      <div
        className="guess-range"
        aria-label={t('table.guess.range', { low: table.low, high: table.high })}
      >
        <span>{table.low}</span>
        <span className="guess-bar" />
        <span>{table.high}</span>
      </div>
      {last && who && (
        <p className="game-status">{t(`table.guess.${last.hint}`, { name: who, n: last.n })}</p>
      )}
      {myTurn && table.phase === 'playing' && (
        <form className="whisper" onSubmit={submit}>
          <input
            type="number"
            inputMode="numeric"
            min={table.low}
            max={table.high}
            value={value}
            autoFocus
            placeholder={`${table.low}–${table.high}`}
            aria-label={t('table.guess.try')}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => useGameStore.getState().setTyping(true)}
            onBlur={() => useGameStore.getState().setTyping(false)}
          />
          <button type="submit" className="mini-button mini-button--ok" disabled={!valid}>
            {t('table.guess.try')}
          </button>
        </form>
      )}
      {!myTurn && table.phase === 'playing' && (
        <p className="creator-note">{t('table.watching')}</p>
      )}
    </>
  );
}
