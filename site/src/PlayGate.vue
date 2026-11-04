<script setup lang="ts">
import { KeyRound, Mail, Play, Search, X } from 'lucide-vue-next';
import { BaseBadge, BaseButton } from 'rei-kit';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { gateOpen } from './gate';
import { more } from './more';

/**
 * The beta's door, before the game: without this week's access code nobody
 * gets in yet, so a visitor chooses to look at the game's door anyway or to
 * explore the site first. Escape, the backdrop and the close button close it.
 */
const props = defineProps<{ gameUrl: string; askLink: string }>();

const card = ref<HTMLElement | null>(null);

function explore() {
  gateOpen.value = false;
  document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' });
}

function play() {
  gateOpen.value = false;
  window.location.href = props.gameUrl;
}

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') gateOpen.value = false;
};

watch(gateOpen, async (open) => {
  document.documentElement.classList.toggle('no-scroll', open);
  if (!open) return;
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
        <div class="gate-actions">
          <BaseButton size="lg" class="play-cta" @click="play">
            <Play class="size-5" aria-hidden="true" /> {{ more.gate.play }}
          </BaseButton>
          <BaseButton size="lg" variant="secondary" @click="explore">
            <Search class="size-5" aria-hidden="true" /> {{ more.gate.explore }}
          </BaseButton>
        </div>
        <a :href="askLink" class="gate-ask nav-link">
          <Mail class="size-4 shrink-0" aria-hidden="true" /> {{ more.gate.ask }}
        </a>
      </section>
    </div>
  </Transition>
</template>
