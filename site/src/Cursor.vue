<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { fine, still } from './motion';

/**
 * The game's cursor: a small lamp-orange dot with a ring that trails behind
 * and swells over anything clickable, and paw prints left where it walks, the
 * way a pet follows a player around the building. Mouse and trackpad only;
 * touch screens keep their own.
 */
const on = ref(false);
const dot = ref<HTMLElement | null>(null);
const ring = ref<HTMLElement | null>(null);
const trail = ref<HTMLElement | null>(null);

/** How far the pointer travels between two paw prints, in pixels. */
const STRIDE = 64;
const PRINT_MS = 1100;

let frame = 0;
let off: (() => void) | null = null;

onMounted(() => {
  if (!fine()) return;
  on.value = true;
  document.documentElement.classList.add('own-cursor');
  let x = innerWidth / 2;
  let y = innerHeight / 2;
  let rx = x;
  let ry = y;
  let lastX = x;
  let lastY = y;
  let left = false;

  const print = (angle: number) => {
    if (still() || !trail.value) return;
    const paw = document.createElement('span');
    paw.className = 'paw-print';
    paw.textContent = '🐾';
    // Left and right feet, a little to each side of the way it goes.
    const side = (left ? -1 : 1) * 9;
    left = !left;
    const px = x + Math.cos(angle + Math.PI / 2) * side;
    const py = y + Math.sin(angle + Math.PI / 2) * side;
    paw.style.transform = `translate(${px}px, ${py}px) rotate(${angle + Math.PI / 2}rad)`;
    trail.value.append(paw);
    window.setTimeout(() => paw.remove(), PRINT_MS);
  };

  const move = (event: PointerEvent) => {
    x = event.clientX;
    y = event.clientY;
    const dx = x - lastX;
    const dy = y - lastY;
    if (Math.hypot(dx, dy) > STRIDE) {
      print(Math.atan2(dy, dx));
      lastX = x;
      lastY = y;
    }
    const target = event.target as Element | null;
    const busy = !!target?.closest('a, button, [role="button"], .pet, .reason, .step, input');
    ring.value?.classList.toggle('cursor-ring--busy', busy);
  };
  const down = () => ring.value?.classList.add('cursor-ring--down');
  const up = () => ring.value?.classList.remove('cursor-ring--down');
  const gone = () => dot.value?.parentElement?.classList.add('cursor--away');
  const back = () => dot.value?.parentElement?.classList.remove('cursor--away');

  const tick = () => {
    rx += (x - rx) * 0.18;
    ry += (y - ry) * 0.18;
    if (dot.value) dot.value.style.transform = `translate(${x}px, ${y}px)`;
    if (ring.value) ring.value.style.transform = `translate(${rx}px, ${ry}px)`;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  document.addEventListener('pointerleave', gone);
  document.addEventListener('pointerenter', back);
  off = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerdown', down);
    window.removeEventListener('pointerup', up);
    document.removeEventListener('pointerleave', gone);
    document.removeEventListener('pointerenter', back);
  };
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  off?.();
  document.documentElement.classList.remove('own-cursor');
});
</script>

<template>
  <div v-if="on" class="cursor" aria-hidden="true">
    <div ref="trail" />
    <span ref="ring" class="cursor-ring" />
    <span ref="dot" class="cursor-dot" />
  </div>
</template>
