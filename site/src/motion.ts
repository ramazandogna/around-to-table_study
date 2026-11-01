import type { Directive } from 'vue';

/** Visitors who asked their system for less motion get a still page. */
export const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** A mouse or a trackpad: the custom cursor, the tilt and the footprints. */
export const fine = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

let seen: IntersectionObserver | null = null;

/** Fades and lifts an element in the first time it scrolls into view; `v-reveal="i"` staggers it. */
export const vReveal: Directive<HTMLElement, number | undefined> = {
  mounted(element, binding) {
    element.classList.add('reveal');
    element.style.setProperty('--delay', `${(binding.value ?? 0) * 90}ms`);
    if (still() || !('IntersectionObserver' in window)) {
      element.classList.add('reveal--in');
      return;
    }
    seen ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('reveal--in');
          seen?.unobserve(entry.target);
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -40px 0px' },
    );
    seen.observe(element);
  },
  unmounted(element) {
    seen?.unobserve(element);
  },
};

type Tilt = HTMLElement & { tiltOff?: () => void };

/** Leans a card toward the pointer, with a glint where the light falls. */
export const vTilt: Directive<Tilt, number | undefined> = {
  mounted(element, binding) {
    if (still() || !fine()) return;
    const most = binding.value ?? 7;
    element.classList.add('tilt');
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      element.style.setProperty('--rx', `${(0.5 - y) * most}deg`);
      element.style.setProperty('--ry', `${(x - 0.5) * most}deg`);
      element.style.setProperty('--gx', `${x * 100}%`);
      element.style.setProperty('--gy', `${y * 100}%`);
    };
    const leave = () => {
      element.style.setProperty('--rx', '0deg');
      element.style.setProperty('--ry', '0deg');
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', leave);
    element.tiltOff = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', leave);
    };
  },
  unmounted(element) {
    element.tiltOff?.();
  },
};

/** Pulls a button a little toward the pointer, as if it wanted to be pressed. */
export const vMagnetic: Directive<Tilt> = {
  mounted(element) {
    if (still() || !fine()) return;
    element.classList.add('magnetic');
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      const x = event.clientX - box.left - box.width / 2;
      const y = event.clientY - box.top - box.height / 2;
      element.style.transform = `translate(${x * 0.18}px, ${y * 0.28}px)`;
    };
    const leave = () => (element.style.transform = '');
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', leave);
    element.tiltOff = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', leave);
    };
  },
  unmounted(element) {
    element.tiltOff?.();
  },
};
