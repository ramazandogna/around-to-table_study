import {
  ANSWER_MAX,
  BEST_OF,
  CHAIN_MAX,
  COIN,
  parlorTarget,
  parlorTurns,
  RPS,
  type ParlorKind,
  type Table,
  type TableAction,
} from '@att/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { play } from '../audio/sound';
import { t, type MessageKey } from '../i18n/t';
import { useGameStore } from '../state/store';

/**
 * The quick games at the round table (see shared `parlor.ts`): no board, just
 * buttons and the last round as it came out. The scoreboard is the table's
 * seats; the match runs until someone reaches the target.
 */

const send = (kind: ParlorKind, action: TableAction) =>
  useGameStore.getState().connection?.table(kind, action);

const RPS_ICON: Record<string, string> = { rock: '✊', paper: '✋', scissors: '✌️' };
const COIN_ICON: Record<string, string> = { heads: '👑', tails: '🔢' };
const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** Best of three or five, for the games played by rounds; chosen in the lobby. */
export function BestOfPicker({ kind, table }: { kind: ParlorKind; table: Table }) {
  if (kind !== 'rps' && kind !== 'ttt') {
    return (
      <p className="creator-note">
        {t('parlor.target', { n: parlorTarget(kind, table.bestOf ?? 3) })}
      </p>
    );
  }
  return (
    <div className="tags" role="group" aria-label={t('parlor.bestOf')}>
      {BEST_OF.map((n) => (
        <button
          key={n}
          type="button"
          className="tag"
          aria-pressed={(table.bestOf ?? 3) === n}
          onClick={() => send(kind, { a: 'bestOf', n })}
        >
          {t('parlor.bestOfN', { n })}
        </button>
      ))}
    </div>
  );
}

export function ParlorView({
  kind,
  table,
  seat,
}: {
  kind: ParlorKind;
  table: Table;
  seat: number;
}) {
  const match = table.parlor;
  const playing = table.phase === 'playing';
  const myTurn = playing && (!parlorTurns(kind) || table.turn === seat);
  const name = (i: number) => table.players[i]?.name ?? '—';
  const heard = useRef(match?.round ?? 0);
  useEffect(() => {
    if (!match || match.round === heard.current) return;
    heard.current = match.round;
    play(kind === 'duel' ? 'dice' : 'pop');
  }, [kind, match]);
  if (!match) return null;

  return (
    <div className="parlor">
      <p className="parlor-round">
        {t('parlor.round', { n: match.round })} ·{' '}
        {t('parlor.target', { n: parlorTarget(kind, table.bestOf ?? 3) })}
      </p>
      <Reveal kind={kind} table={table} name={name} />
      {playing && seat >= 0 && <Moves kind={kind} table={table} seat={seat} myTurn={myTurn} />}
      {playing && seat < 0 && <p className="creator-note">{t('table.watching')}</p>}
    </div>
  );
}

/** The last round as it came out, in words everyone can read. */
function Reveal({
  kind,
  table,
  name,
}: {
  kind: ParlorKind;
  table: Table;
  name: (i: number) => string;
}) {
  const last = table.parlor?.last;
  const match = table.parlor;
  if (!match) return null;
  if (kind === 'math' || kind === 'emoji') {
    return (
      <>
        <div className={`parlor-prompt parlor-prompt--${kind}`}>{match.prompt}</div>
        {last?.kind === 'answer' && (
          <p className="game-status">
            {t('parlor.answer.right', { name: name(last.player), answer: last.answer })}
          </p>
        )}
        {last?.kind === 'skip' && (
          <p className="game-status">{t('parlor.answer.skip', { answer: last.answer })}</p>
        )}
      </>
    );
  }
  if (!last) {
    return <p className="game-status">{t(`parlor.${kind}.first` as MessageKey)}</p>;
  }
  switch (last.kind) {
    case 'rps':
      return (
        <p className="game-status parlor-reveal">
          {last.picks.map((p, i) => (
            <span key={i}>
              {name(i)} {p ? RPS_ICON[p] : '…'}
            </span>
          ))}
          <b>
            {last.winners.length
              ? t('parlor.point', { name: last.winners.map(name).join(' & ') })
              : t('parlor.draw')}
          </b>
        </p>
      );
    case 'coin':
      return (
        <p className="game-status">
          {t('parlor.coin.result', {
            name: name(last.player),
            call: t(`parlor.coin.${last.call}`),
            side: `${COIN_ICON[last.side]} ${t(`parlor.coin.${last.side}`)}`,
          })}{' '}
          {last.call === last.side ? '✅' : '❌'}
        </p>
      );
    case 'duel':
      return (
        <p className="game-status parlor-reveal">
          {last.rolls.map(([a, b], i) => (
            <span key={i}>
              {name(i)} {DIE_FACES[a]}
              {DIE_FACES[b]} ({a + b})
            </span>
          ))}
          <b>
            {last.winners.length
              ? t('parlor.point', { name: last.winners.map(name).join(' & ') })
              : t('parlor.draw')}
          </b>
        </p>
      );
    case 'ttt':
      return (
        <p className="game-status">
          {last.winner === null
            ? t('parlor.ttt.full')
            : t('parlor.point', { name: name(last.winner) })}
        </p>
      );
    case 'chain':
      return (
        <p className="game-status">
          {t('parlor.chain.said', { name: name(last.player), word: last.word })}
        </p>
      );
    case 'chainMiss':
      return (
        <p className="game-status">
          {t(`parlor.chain.${last.reason}`, { name: name(last.player) })}
        </p>
      );
    default:
      return null;
  }
}

function Moves({
  kind,
  table,
  seat,
  myTurn,
}: {
  kind: ParlorKind;
  table: Table;
  seat: number;
  myTurn: boolean;
}) {
  const match = table.parlor;
  if (!match) return null;
  const waiting = match.ready[seat];

  switch (kind) {
    case 'rps':
      return waiting ? (
        <p className="creator-note">{t('parlor.waitOthers')}</p>
      ) : (
        <div className="parlor-choices">
          {RPS.map((pick) => (
            <button
              key={pick}
              type="button"
              className="parlor-choice"
              onClick={() => send(kind, { a: 'pick', choice: pick })}
            >
              <span aria-hidden>{RPS_ICON[pick]}</span>
              {t(`parlor.rps.${pick}`)}
            </button>
          ))}
        </div>
      );
    case 'coin':
      return myTurn ? (
        <div className="parlor-choices">
          {COIN.map((side) => (
            <button
              key={side}
              type="button"
              className="parlor-choice"
              onClick={() => send(kind, { a: 'pick', choice: side })}
            >
              <span aria-hidden>{COIN_ICON[side]}</span>
              {t(`parlor.coin.${side}`)}
            </button>
          ))}
        </div>
      ) : (
        <p className="creator-note">
          {t('parlor.theirTurn', { name: table.players[table.turn]?.name ?? '' })}
        </p>
      );
    case 'duel':
      return waiting ? (
        <p className="creator-note">{t('parlor.waitOthers')}</p>
      ) : (
        <button
          type="button"
          className="panel-ok game-button"
          onClick={() => send(kind, { a: 'roll' })}
        >
          🎲 {t('parlor.duel.roll')}
        </button>
      );
    case 'ttt':
      return (
        <>
          <div className="ttt-board" role="grid" aria-label={t('table.ttt.title')}>
            {match.board.map((cell, i) => (
              <button
                key={i}
                type="button"
                className={`ttt-cell ttt-cell--${cell || 'empty'}`}
                disabled={!myTurn || !!cell}
                aria-label={cell || t('parlor.ttt.empty')}
                onClick={() => send(kind, { a: 'cell', i })}
              >
                {cell === 'x' ? '✕' : cell === 'o' ? '◯' : ''}
              </button>
            ))}
          </div>
          <p className="creator-note">
            {myTurn
              ? t('parlor.ttt.yours', { mark: seat === match.starter ? '✕' : '◯' })
              : t('parlor.theirTurn', { name: table.players[table.turn]?.name ?? '' })}
          </p>
        </>
      );
    case 'chain':
      return <ChainInput table={table} myTurn={myTurn} />;
    case 'math':
    case 'emoji':
      // A new prompt starts with an empty field.
      return <AnswerInput key={match.round} kind={kind} />;
  }
}

function ChainInput({ table, myTurn }: { table: Table; myTurn: boolean }) {
  const [text, setText] = useState('');
  const words = table.parlor?.words ?? [];
  const last = words[words.length - 1];
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    send('chain', { a: 'word', text: text.trim() });
    setText('');
  }
  return (
    <>
      {words.length > 0 && <p className="parlor-words">{words.slice(-6).join(' → ')}</p>}
      {myTurn ? (
        <form className="whisper" onSubmit={submit}>
          <input
            value={text}
            maxLength={CHAIN_MAX}
            autoFocus
            placeholder={
              last
                ? t('parlor.chain.next', { letter: last[last.length - 1] ?? '' })
                : t('parlor.chain.any')
            }
            aria-label={t('parlor.chain.word')}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => useGameStore.getState().setTyping(true)}
            onBlur={() => useGameStore.getState().setTyping(false)}
          />
          <button type="submit" className="mini-button mini-button--ok">
            {t('parlor.say')}
          </button>
        </form>
      ) : (
        <p className="creator-note">
          {t('parlor.theirTurn', { name: table.players[table.turn]?.name ?? '' })}
        </p>
      )}
    </>
  );
}

/** Everyone answers at once; a wrong answer just clears the field. */
function AnswerInput({ kind }: { kind: 'math' | 'emoji' }) {
  const [text, setText] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    send(kind, { a: 'answer', text: text.trim() });
    setText('');
  }
  return (
    <form className="whisper" onSubmit={submit}>
      <input
        value={text}
        maxLength={ANSWER_MAX}
        autoFocus
        inputMode={kind === 'math' ? 'numeric' : 'text'}
        placeholder={t(`parlor.${kind}.placeholder`)}
        aria-label={t('parlor.answer')}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => useGameStore.getState().setTyping(true)}
        onBlur={() => useGameStore.getState().setTyping(false)}
      />
      <button type="submit" className="mini-button mini-button--ok">
        {t('parlor.answer')}
      </button>
    </form>
  );
}
