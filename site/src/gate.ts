import { ref } from 'vue';

/** Whether the beta's door (see PlayGate) is open; every "play" button opens it. */
export const gateOpen = ref(false);

/** A play link's click: the door first, instead of the game straight away. */
export function openGate(event: Event): void {
  event.preventDefault();
  gateOpen.value = true;
}
