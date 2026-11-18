import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/t';
import { readJson, writeJson } from '../net/storage';
import { useGameStore } from '../state/store';
import { markCoachSeen } from './Coach';

/** Kept with the character's progress (see PROGRESS_KEYS), so each new character gets it once. */
export const GUIDE_KEY = 'att.guide';

/** The three first steps, each ticked once it happened; `done` ends the guide for good. */
type Steps = { found?: boolean; sat?: boolean; started?: boolean; done?: boolean };

const STEPS = ['found', 'sat', 'started'] as const;
const LABEL = { found: 'guide.find', sat: 'guide.sit', started: 'guide.start' } as const;

/** How long the finished checklist stays with all three ticks before it goes. */
const DONE_MS = 4000;

function readSteps(): Steps {
  const saved = readJson<Steps>(GUIDE_KEY);
  if (saved) return saved;
  // A character who has sat down to study before (it remembers its last sit) needs no guide.
  return readJson('att.lastSit') ? { done: true } : {};
}

/** Whether the guide still runs for the playing character: the hall's and library's tips wait for it. */
export function guideActive(): boolean {
  return !readSteps().done;
}

/**
 * The first five minutes for a new character: a chip at the edge of the hall
 * pointing at the Library door until they sit there, and a three-step list
 * (find the library, sit down, start a block) that ticks itself. When all
 * three are done it shows the ticks for a moment and never comes back.
 */
export function Guide() {
  const [steps, setSteps] = useState<Steps>(readSteps);
  const area = useGameStore((s) => s.area);
  const introOpen = useGameStore((s) => s.introOpen);
  const sitting = useGameStore((s) => s.sitStep !== null);

  // Ticks each step as it happens, from the store. Written at once, so a sit
  // somewhere else first (which leaves a last sit behind) does not end the guide.
  useEffect(() => {
    if (steps.done) return;
    if (!readJson(GUIDE_KEY)) writeJson(GUIDE_KEY, {});
    const tick = (s: ReturnType<typeof useGameStore.getState>) => {
      if (s.area !== 'library') return;
      setSteps((now) => {
        const next = {
          ...now,
          found: true,
          sat: now.sat || s.seated,
          started: now.started || (s.seated && (s.timer !== null || s.study !== null)),
        };
        if (next.found === now.found && next.sat === now.sat && next.started === now.started) {
          return now;
        }
        writeJson(GUIDE_KEY, next);
        return next;
      });
    };
    tick(useGameStore.getState());
    return useGameStore.subscribe(tick);
  }, [steps.done]);

  const all = STEPS.every((step) => steps[step]);
  useEffect(() => {
    if (!all || steps.done) return;
    const timer = window.setTimeout(() => finish(setSteps), DONE_MS);
    return () => window.clearTimeout(timer);
  }, [all, steps.done]);

  if (steps.done || introOpen) return null;
  return (
    <>
      {area === 'hall' && !steps.sat && <LibraryArrow />}
      {(area === 'hall' || area === 'library') && !sitting && (
        <div className="coach guide panel panel--compact" role="note" aria-live="polite">
          <div className="guide-body">
            <p className="guide-title">{t('guide.title')}</p>
            <ol className="guide-steps">
              {STEPS.map((step) => (
                <li
                  key={step}
                  className={steps[step] ? 'guide-step guide-step--done' : 'guide-step'}
                >
                  <span aria-hidden>{steps[step] ? '✅' : '⬜'}</span> {t(LABEL[step])}
                </li>
              ))}
            </ol>
          </div>
          <button
            type="button"
            className="mini-button mini-button--ok"
            onClick={() => finish(setSteps)}
          >
            {t('coach.ok')}
          </button>
        </div>
      )}
    </>
  );
}

/** Ends the guide for this character; the hall's and library's own tips are not needed after it. */
function finish(setSteps: (steps: Steps) => void): void {
  const done = { ...readSteps(), done: true };
  writeJson(GUIDE_KEY, done);
  markCoachSeen('hall');
  markCoachSeen('library');
  setSteps(done);
}

/** Space kept clear at the screen's edges for the HUD (pill, dock, right column), in px. */
function edges(): { top: number; right: number; bottom: number; left: number } {
  const phone = window.matchMedia('(max-width: 700px)').matches;
  return phone
    ? { top: 110, right: 16, bottom: 210, left: 16 }
    : { top: 64, right: 256, bottom: 110, left: 16 };
}

/**
 * A small chip that points at the Library door's sign: under it when the sign
 * is on screen, at the nearest edge (arrow turned toward it) when it is not.
 * It follows the camera every frame and never takes a tap.
 */
function LibraryArrow() {
  const chip = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const name = t('area.library');
    let frame = 0;
    const place = () => {
      frame = requestAnimationFrame(place);
      const el = chip.current;
      if (!el || !arrow.current) return;
      const sign = [...document.querySelectorAll<HTMLElement>('.world-sign--door')].find(
        (s) => s.textContent === name && s.style.display !== 'none',
      );
      if (!sign) {
        el.style.visibility = 'hidden';
        return;
      }
      const r = sign.getBoundingClientRect();
      const sx = r.left + r.width / 2;
      const sy = r.top + r.height / 2;
      const e = edges();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const minX = e.left + w / 2;
      const maxX = window.innerWidth - e.right - w / 2;
      const minY = e.top + h / 2;
      const maxY = window.innerHeight - e.bottom - h / 2;
      // Under the sign when it is in view, else clamped to the edge nearest it.
      const x = Math.min(maxX, Math.max(minX, sx));
      const y = Math.min(maxY, Math.max(minY, r.bottom + 10 + h / 2));
      const angle = (Math.atan2(sy - y, sx - x) * 180) / Math.PI;
      el.style.visibility = 'visible';
      el.style.transform = `translate(${Math.round(x - w / 2)}px, ${Math.round(y - h / 2)}px)`;
      arrow.current.style.rotate = `${Math.round(angle)}deg`;
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, []);

  // Drawn straight into the page: the bottom bar's layout rules must not move it.
  return createPortal(
    <div ref={chip} className="guide-arrow" aria-hidden>
      <span ref={arrow} className="guide-arrow-head">
        ➜
      </span>
      {t('guide.arrow')}
    </div>,
    document.body,
  );
}
