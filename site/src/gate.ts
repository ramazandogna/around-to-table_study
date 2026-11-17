import { ref } from 'vue';

/** Whether the beta's door (see PlayGate) is open; every "play" button opens it. */
export const gateOpen = ref(false);

/**
 * A play link's click: the door first. The links point at #beta, so a
 * ctrl/middle click, no script or a slow page still ends at the beta section
 * and never cold at the game's door; those clicks are left to the browser.
 */
export function openGate(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  gateOpen.value = true;
}
