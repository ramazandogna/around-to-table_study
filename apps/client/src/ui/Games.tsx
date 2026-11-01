import { useEffect, useRef, useState } from 'react';
import { play } from '../audio/sound';
import { t } from '../i18n/t';
import { readJson, writeJson } from '../net/storage';
import { useGameStore } from '../state/store';
import { Dialog, Panel } from './Panel';

/**
 * The smoking room's machines: a paper-plane arcade game and a claw machine.
 * Both are one-tap games, so they work as well on a phone, and both are a
 * reason to hang around and talk: a good score or a prize is told to the
 * room. Coins are free; there is nothing to buy.
 */
export function Games() {
  const game = useGameStore((s) => s.game);
  const close = () => useGameStore.getState().setGame(null);

  useEffect(() => {
    if (!game) return;
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && close();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [game]);

  if (!game) return null;
  return (
    <Dialog>
      <Panel title={t(`game.${game}.title`)} className="panel--dialog panel--game">
        {game === 'arcade' ? <PlaneGame /> : <ClawGame />}
        <div className="panel-actions">
          <button type="button" className="panel-button" onClick={close}>
            {t('game.leave')}
          </button>
        </div>
      </Panel>
    </Dialog>
  );
}

/** Tells the room, through the player's own chat bubble. */
function announce(text: string) {
  const store = useGameStore.getState();
  store.connection?.say(text);
  store.connection?.emote('cheer');
}

const GW = 300;
const GH = 360;

/* ---------- Paper Plane: tap to fly through the gaps in stacks of books ---------- */

const BEST_KEY = 'att.best.plane';
/** A best this good is worth telling the room about. */
const BRAG_SCORE = 5;

type Stack = { x: number; gap: number; passed: boolean };

function PlaneGame() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'ready' | 'flying' | 'over'>('ready');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => readJson<number>(BEST_KEY) ?? 0);
  const world = useRef({ y: GH / 2, vy: 0, stacks: [] as Stack[], time: 0, score: 0 });
  const flap = useRef<() => void>(() => {});

  useEffect(() => {
    const g = canvas.current?.getContext('2d');
    if (!g) return;
    let frame = 0;
    let last = performance.now();
    let running = state === 'flying';
    const w = world.current;
    if (state === 'ready') Object.assign(w, { y: GH / 2, vy: 0, stacks: [], time: 0, score: 0 });

    flap.current = () => {
      if (state === 'over') return;
      if (state === 'ready') setState('flying');
      w.vy = -230;
      play('click');
    };

    const end = () => {
      running = false;
      setState('over');
      play('poke');
      const previous = readJson<number>(BEST_KEY) ?? 0;
      if (w.score > previous) {
        writeJson(BEST_KEY, w.score);
        setBest(w.score);
        if (w.score >= BRAG_SCORE) announce(t('game.arcade.say', { score: w.score }));
      }
    };

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (running) {
        w.time += dt;
        w.vy += 620 * dt;
        w.y += w.vy * dt;
        if (w.stacks.length === 0 || (w.stacks.at(-1)?.x ?? 0) < GW - 150) {
          w.stacks.push({ x: GW + 30, gap: 90 + Math.random() * (GH - 220), passed: false });
        }
        for (const stack of w.stacks) {
          stack.x -= 110 * dt;
          if (!stack.passed && stack.x < 60) {
            stack.passed = true;
            w.score++;
            setScore(w.score);
            play('pop');
          }
          const inColumn = stack.x < 84 && stack.x + 46 > 56;
          if (inColumn && (w.y - 10 < stack.gap - 52 || w.y + 10 > stack.gap + 52)) end();
        }
        w.stacks = w.stacks.filter((s) => s.x > -60);
        // The ceiling only stops the plane; the floor ends the flight.
        if (w.y < 10) {
          w.y = 10;
          w.vy = Math.max(0, w.vy);
        }
        if (w.y > GH - 18) end();
      }
      draw(g, w);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      if (state === 'over') setState('ready');
      else flap.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  return (
    <div className="game">
      <canvas
        ref={canvas}
        width={GW}
        height={GH}
        className="game-screen"
        onPointerDown={() => (state === 'over' ? setState('ready') : flap.current())}
      />
      <p className="game-status">
        {state === 'ready'
          ? t('game.arcade.ready')
          : state === 'over'
            ? t('game.arcade.over', { score })
            : t('game.arcade.score', { score })}
        {' · '}
        {t('game.arcade.best', { best })}
      </p>
    </div>
  );
}

function draw(
  g: CanvasRenderingContext2D,
  w: { y: number; vy: number; stacks: Stack[]; time: number },
) {
  const sky = g.createLinearGradient(0, 0, 0, GH);
  sky.addColorStop(0, '#2b3a67');
  sky.addColorStop(1, '#f29e4c');
  g.fillStyle = sky;
  g.fillRect(0, 0, GW, GH);
  const spines = ['#c0392b', '#2e6fd8', '#3f9b5a', '#d9a23a', '#8a5ab8', '#e2dccb'];
  for (const stack of w.stacks) {
    for (const [top, bottom] of [
      [0, stack.gap - 52],
      [stack.gap + 52, GH],
    ] as const) {
      for (let y = top, i = 0; y < bottom; y += 14, i++) {
        g.fillStyle = spines[(i + Math.floor(stack.x)) % spines.length] ?? '#ccc';
        g.fillRect(stack.x + (i % 3) * 2, y, 44, Math.min(13, bottom - y));
      }
    }
  }
  // The plane, nose tipped by its speed.
  g.save();
  g.translate(70, w.y);
  g.rotate(Math.max(-0.5, Math.min(0.8, w.vy / 400)));
  g.fillStyle = '#fbf3dc';
  g.beginPath();
  g.moveTo(16, 0);
  g.lineTo(-14, -9);
  g.lineTo(-8, 0);
  g.lineTo(-14, 9);
  g.closePath();
  g.fill();
  g.strokeStyle = '#8a7a5a';
  g.stroke();
  g.restore();
}

/* ---------- The claw machine: drop the swinging claw on a plush ---------- */

const PRIZES = ['🧸', '🐸', '🦊', '🐙', '🐧', '🦄', '🐢', '🐰'];
const PRIZES_KEY = 'att.prizes';
/** How often a caught prize slips out on the way up. */
const SLIP_CHANCE = 0.35;
const FLOOR = GH - 46;

type Claw = {
  phase: 'coin' | 'swing' | 'down' | 'up' | 'home';
  x: number;
  y: number;
  time: number;
  holding: number | null;
  slips: boolean;
};

function ClawGame() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState(t('game.claw.insert'));
  const [collection, setCollection] = useState<string[]>(
    () => readJson<string[]>(PRIZES_KEY) ?? [],
  );
  const claw = useRef<Claw>({
    phase: 'coin',
    x: GW / 2,
    y: 40,
    time: 0,
    holding: null,
    slips: false,
  });
  const [firstPile] = useState(() =>
    Array.from({ length: 9 }, (_, i) => ({
      prize: Math.floor(Math.random() * PRIZES.length),
      x: 70 + (i % 5) * 44 + (Math.random() - 0.5) * 12,
      y: FLOOR - Math.floor(i / 5) * 22,
    })),
  );
  const pile = useRef(firstPile);
  const [phase, setPhase] = useState<Claw['phase']>('coin');

  useEffect(() => {
    const g = canvas.current?.getContext('2d');
    if (!g) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const c = claw.current;
      c.time += dt;
      if (c.phase === 'swing') c.x = GW / 2 + 1 + Math.sin(c.time * 1.9) * (GW / 2 - 50);
      if (c.phase === 'down') {
        c.y += 170 * dt;
        const target = pile.current
          .filter((p) => Math.abs(p.x - c.x) < 18)
          .sort((a, b) => a.y - b.y)[0];
        if (c.y >= (target ? target.y - 20 : FLOOR - 10)) {
          c.phase = 'up';
          setPhase('up');
          if (target) {
            c.holding = target.prize;
            c.slips = Math.random() < SLIP_CHANCE;
            pile.current = pile.current.filter((p) => p !== target);
          }
          play('click');
        }
      }
      if (c.phase === 'up') {
        c.y -= 140 * dt;
        if (c.holding !== null && c.slips && c.y < FLOOR - 120) {
          pile.current.push({ prize: c.holding, x: c.x, y: FLOOR });
          c.holding = null;
          setMessage(t('game.claw.slip'));
          play('poke');
        }
        if (c.y <= 40) {
          c.y = 40;
          c.phase = 'home';
          setPhase('home');
        }
      }
      if (c.phase === 'home') {
        c.x -= 160 * dt;
        if (c.x <= 34) {
          c.x = 34;
          if (c.holding !== null) {
            const prize = PRIZES[c.holding] ?? '🧸';
            const next = [...(readJson<string[]>(PRIZES_KEY) ?? []), prize].slice(-24);
            writeJson(PRIZES_KEY, next);
            setCollection(next);
            setMessage(t('game.claw.won', { prize }));
            play('chime');
            announce(t('game.claw.say', { prize }));
            pile.current.push({
              prize: Math.floor(Math.random() * PRIZES.length),
              x: 70 + Math.random() * 180,
              y: FLOOR,
            });
          } else if (!c.slips) {
            setMessage(t('game.claw.miss'));
          }
          c.holding = null;
          c.phase = 'coin';
          setPhase('coin');
        }
      }
      drawClaw(g, c, pile.current);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  const press = () => {
    const c = claw.current;
    if (c.phase === 'coin') {
      c.phase = 'swing';
      c.time = 0;
      setPhase('swing');
      setMessage(t('game.claw.aim'));
      play('pop');
    } else if (c.phase === 'swing') {
      c.phase = 'down';
      setPhase('down');
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      press();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="game">
      <canvas ref={canvas} width={GW} height={GH} className="game-screen" onPointerDown={press} />
      <p className="game-status">{message}</p>
      <button
        type="button"
        className="panel-ok game-button"
        disabled={phase !== 'coin' && phase !== 'swing'}
        onClick={press}
      >
        {phase === 'swing' ? t('game.claw.drop') : t('game.claw.coin')}
      </button>
      {collection.length > 0 && (
        <p className="game-collection" aria-label={t('game.claw.collection')}>
          {collection.join(' ')}
        </p>
      )}
    </div>
  );
}

function drawClaw(
  g: CanvasRenderingContext2D,
  c: Claw,
  pile: readonly { prize: number; x: number; y: number }[],
) {
  g.fillStyle = '#ffe6f0';
  g.fillRect(0, 0, GW, GH);
  // Glass reflections and the prize chute on the left.
  g.fillStyle = 'rgba(255, 255, 255, 0.5)';
  g.fillRect(GW - 40, 10, 8, GH - 80);
  g.fillStyle = '#d85a8a';
  g.fillRect(0, FLOOR - 40, 56, GH - FLOOR + 40);
  g.fillStyle = '#5a2a3a';
  g.fillRect(8, FLOOR - 32, 40, 28);
  g.font = '26px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const p of pile) g.fillText(PRIZES[p.prize] ?? '🧸', p.x, p.y);
  // Rail, cable and claw.
  g.fillStyle = '#7a7a86';
  g.fillRect(20, 24, GW - 40, 6);
  g.strokeStyle = '#3a3a44';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(c.x, 30);
  g.lineTo(c.x, c.y);
  g.stroke();
  const open = c.phase === 'down' || c.phase === 'swing' || c.phase === 'coin' ? 10 : 4;
  g.lineWidth = 4;
  g.strokeStyle = '#c9c9d4';
  g.beginPath();
  g.moveTo(c.x - open, c.y + 16);
  g.lineTo(c.x, c.y);
  g.lineTo(c.x + open, c.y + 16);
  g.stroke();
  if (c.holding !== null) g.fillText(PRIZES[c.holding] ?? '🧸', c.x, c.y + 24);
}
