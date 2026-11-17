<script setup lang="ts">
import { Check, Copy, Mail } from 'lucide-vue-next';
import { BaseButton } from 'rei-kit';
import { onBeforeUnmount, ref } from 'vue';
import { more } from './more';

/**
 * Asking for this week's code: the mailto, and the address itself with a copy
 * button, for phones that have no mail app.
 */
const props = defineProps<{ address: string; link: string }>();

const copied = ref(false);
const addressNode = ref<HTMLElement | null>(null);
let timer = 0;

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(props.address);
  } catch {
    // No clipboard (or no permission): select the address so it can be copied by hand.
    if (addressNode.value) {
      const range = document.createRange();
      range.selectNodeContents(addressNode.value);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    return;
  }
  copied.value = true;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => (copied.value = false), 2000);
}

onBeforeUnmount(() => window.clearTimeout(timer));
</script>

<template>
  <div class="code-ask">
    <BaseButton as="a" :href="link" class="play-cta">
      <Mail class="size-4" aria-hidden="true" /> {{ more.gate.ask }}
    </BaseButton>
    <div class="code-ask-row">
      <span class="text-ink-soft text-sm">{{ more.gate.codeTitle }}:</span>
      <code ref="addressNode" class="code-ask-address">{{ address }}</code>
      <button type="button" class="code-ask-copy" @click="copyAddress">
        <Check v-if="copied" class="size-4" aria-hidden="true" />
        <Copy v-else class="size-4" aria-hidden="true" />
        {{ copied ? more.gate.copied : more.gate.copy }}
      </button>
      <span class="sr-only" role="status">{{ copied ? more.gate.copied : '' }}</span>
    </div>
  </div>
</template>
