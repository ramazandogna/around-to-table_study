<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { still } from './motion';

/**
 * One of the hero's floating chat bubbles. It bobs with its emoji; now and
 * then someone "starts typing" (three dots), the message appears letter by
 * letter like in the game's chat, stays a moment and folds back to the emoji.
 * Visitors who asked for less motion only see the emoji.
 */
const props = defineProps<{ emoji: string; lines: string[]; start: number }>();

const phase = ref<'emoji' | 'typing' | 'text'>('emoji');
const shown = ref('');
let line = 0;
let timer = 0;

const wait = (ms: number, then: () => void) => {
  window.clearTimeout(timer);
  timer = window.setTimeout(then, ms);
};

function rest() {
  phase.value = 'emoji';
  shown.value = '';
  // A while of quiet, a little different each time so the bubbles never move together.
  wait(7000 + Math.random() * 6000, typing);
}

function typing() {
  phase.value = 'typing';
  wait(1100 + Math.random() * 1200, write);
}

function write() {
  const text = props.lines[line++ % props.lines.length] ?? '';
  phase.value = 'text';
  let i = 0;
  const next = () => {
    // Emoji and accents are counted as whole characters.
    shown.value = [...text].slice(0, ++i).join('');
    if (i < [...text].length) wait(38 + Math.random() * 40, next);
    else wait(2600 + text.length * 40, rest);
  };
  next();
}

onMounted(() => {
  if (!still()) wait(props.start, typing);
});
onBeforeUnmount(() => window.clearTimeout(timer));
// A new language starts the lines over.
watch(
  () => props.lines,
  () => {
    line = 0;
    if (phase.value !== 'emoji') rest();
  },
);
</script>

<template>
  <span class="bubble" :class="{ 'bubble--open': phase !== 'emoji' }" aria-hidden="true">
    <span v-if="phase === 'emoji'" class="bubble-emoji">{{ emoji }}</span>
    <span v-else-if="phase === 'typing'" class="bubble-dots"><i /><i /><i /></span>
    <span v-else class="bubble-text">{{ shown }}<span class="bubble-caret" /></span>
  </span>
</template>
