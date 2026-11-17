<script setup lang="ts">
import { KeyRound, Play, Search, X } from 'lucide-vue-next';
import { BaseBadge, BaseButton } from 'rei-kit';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CodeAsk from './CodeAsk.vue';
import { gateOpen } from './gate';
import { copy } from './i18n';
import { extra } from './extra';
import { more } from './more';

/**
 * The beta's door, before the game: without this week's access code nobody
 * gets in yet, so a visitor chooses to look at the game's door anyway or to
 * explore the site first. Focus stays inside while it is open, and Escape,
 * the backdrop and the close button close it and give focus back.
 */
const props = defineProps<{
  gameUrl: string;
  address: string;
  askLink: string;
  privacyUrl: string;
}>();

const card = ref<HTMLElement | null>(null);

function explore() {
  gateOpen.value = false;
  document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' });
}

function play() {
  gateOpen.value = false;
  window.location.href = props.gameUrl;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
let opener: HTMLElement | null = null;

const onKey = (event: KeyboardEvent) => {
  if (!gateOpen.value) return;
  if (event.key === 'Escape') {
    gateOpen.value = false;
    return;
  }
  if (event.key !== 'Tab' || !card.value) return;
  // Keep Tab and Shift+Tab inside the card.
  const items = [...card.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null,
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!card.value.contains(active)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
};

watch(gateOpen, async (open) => {
  document.documentElement.classList.toggle('no-scroll', open);
  if (!open) {
    opener?.focus();
    opener = null;
    return;
  }
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  card.value?.querySelector<HTMLElement>('.play-cta')?.focus();
});

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  document.documentElement.classList.remove('no-scroll');
});
</script>

<template>
  <Transition name="gate">
    <div v-if="gateOpen" class="gate-backdrop" @click.self="gateOpen = false">
      <section
        ref="card"
        class="gate-card surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
      >
        <button
          type="button"
          class="gate-close"
          :aria-label="more.gate.close"
          @click="gateOpen = false"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
        <span class="gate-key" aria-hidden="true"><KeyRound class="size-7" /></span>
        <BaseBadge tone="warning">{{ more.gate.badge }}</BaseBadge>
        <h2 id="gate-title" class="pixel text-2xl sm:text-3xl">{{ more.gate.title }}</h2>
        <p class="text-ink-soft">{{ more.gate.text }}</p>
        <CodeAsk :address="address" :link="askLink" />
        <div class="gate-actions">
          <BaseButton variant="secondary" @click="play">
            <Play class="size-4" aria-hidden="true" /> {{ more.gate.play }}
          </BaseButton>
          <BaseButton variant="secondary" @click="explore">
            <Search class="size-4" aria-hidden="true" /> {{ more.gate.explore }}
          </BaseButton>
        </div>
        <p class="gate-trust text-ink-soft">
          {{ copy.hero.trust }}
          <a :href="privacyUrl" class="nav-link">{{ extra.nav.privacy }}</a>
        </p>
      </section>
    </div>
  </Transition>
</template>
