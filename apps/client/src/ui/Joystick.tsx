import { useRef, useState, type PointerEvent } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';

/** How far the knob travels from the middle, in pixels. */
const REACH = 42;
/** Pushes smaller than this share of the reach count as letting go. */
const DEAD = 0.18;

/**
 * Walking with a thumb, on touch screens: drag the knob the way you want to
 * go, any direction, and let go to stop. Taps on the room stay for talking to
 * people and using things, so a crowd never stands in the way of walking.
 */
export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);

  function move(event: PointerEvent) {
    const frame = base.current?.getBoundingClientRect();
    if (!frame || pointer.current !== event.pointerId) return;
    let x = event.clientX - (frame.left + frame.width / 2);
    let y = event.clientY - (frame.top + frame.height / 2);
    const length = Math.hypot(x, y);
    if (length > REACH) {
      x = (x / length) * REACH;
      y = (y / length) * REACH;
    }
    setKnob({ x, y });
    const share = Math.min(1, length / REACH);
    useGameStore.getState().setStick(share < DEAD ? null : { x: x / REACH, y: y / REACH });
  }

  function release() {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    useGameStore.getState().setStick(null);
  }

  return (
    <div
      ref={base}
      className="joystick"
      role="application"
      aria-label={t('stick.label')}
      onPointerDown={(event) => {
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event);
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <span className="joystick-knob" style={{ translate: `${knob.x}px ${knob.y}px` }} />
    </div>
  );
}
