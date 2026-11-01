<script setup lang="ts">
import {
  Award,
  BookOpen,
  Bug,
  CalendarDays,
  Coffee,
  Github,
  KeyRound,
  Mail,
  MessageCircle,
  PawPrint,
  Play,
  ShieldCheck,
  Smartphone,
  SunMoon,
  Timer,
  Users,
} from 'lucide-vue-next';
import { BaseBadge, BaseButton, BaseCard, SegmentedControl } from 'rei-kit';
import { BaseTooltip } from 'rei-kit/web';
import { computed } from 'vue';
import { copy, language, LANGUAGES } from './i18n';

/** Where the game lives, and where suggestions go. */
const GAME_URL = 'https://around-the-table.ramazandogna.workers.dev/';
const MAIL = 'doganrmzn40@gmail.com';
const GITHUB = 'https://github.com/ramazandogna';

const base = import.meta.env.BASE_URL;
const pillarIcons = [Users, Coffee, KeyRound, BookOpen, CalendarDays];
const featureIcons = [Timer, Award, PawPrint, SunMoon, MessageCircle, ShieldCheck];
const shots = ['shot-library.webp', 'shot-smoking.webp', 'shot-hall.webp'];

const mail = (subject: string) => `mailto:${MAIL}?subject=${encodeURIComponent(subject)}`;
const suggestLink = computed(() => mail(copy.value.beta.mailSubject));
const bugLink = computed(() => mail(copy.value.beta.bugSubject));
</script>

<template>
  <div class="hero-glow min-h-dvh text-ink">
    <!-- The bar: the logo, the way around the page, the language and the game. -->
    <header class="sticky top-0 z-20 px-4 pt-3">
      <nav
        class="surface mx-auto flex max-w-(--measure-page) flex-wrap items-center gap-3 rounded-card px-4 py-2"
        aria-label="Around the Table"
      >
        <a href="#top" class="flex items-center gap-2">
          <img :src="`${base}favicon-64.png`" alt="" class="size-9 rounded-cell" />
          <span class="pixel text-lg">Around the Table</span>
        </a>
        <div class="ms-auto hidden items-center gap-4 text-sm md:flex">
          <a href="#features" class="hover:text-primary">{{ copy.nav.features }}</a>
          <a href="#rooms" class="hover:text-primary">{{ copy.nav.rooms }}</a>
          <a href="#beta" class="hover:text-primary">{{ copy.nav.beta }}</a>
          <a :href="suggestLink" class="hover:text-primary">{{ copy.nav.feedback }}</a>
        </div>
        <div class="ms-auto flex items-center gap-2 md:ms-0">
          <div class="w-68 shrink-0 text-xs">
            <SegmentedControl v-model="language" :options="LANGUAGES" aria-label="Language" />
          </div>
          <BaseButton as="a" :href="GAME_URL" size="sm" class="shrink-0">
            <Play class="size-4" aria-hidden="true" /> {{ copy.nav.play }}
          </BaseButton>
        </div>
      </nav>
    </header>

    <main id="top">
      <!-- Hero: who is inside, what it is, and the doors in. -->
      <section class="px-4 pt-12 pb-10">
        <div class="mx-auto grid max-w-(--measure-page) items-center gap-10 lg:grid-cols-2">
          <div class="flex flex-col items-start gap-5">
            <BaseBadge tone="primary">{{ copy.hero.badge }}</BaseBadge>
            <img :src="`${base}logo.png`" alt="Around the Table" class="size-28 drop-shadow-lg" />
            <h1 class="pixel text-4xl leading-tight sm:text-5xl">{{ copy.hero.title }}</h1>
            <p class="text-ink-soft max-w-prose text-lg">{{ copy.hero.subtitle }}</p>
            <div class="flex flex-wrap gap-3">
              <BaseButton as="a" :href="GAME_URL" size="lg">
                <Play class="size-5" aria-hidden="true" /> {{ copy.hero.web }}
              </BaseButton>
              <BaseTooltip :label="copy.hero.soon">
                <span
                  class="store-soon inline-flex"
                  tabindex="0"
                  :aria-label="`${copy.hero.appStore}: ${copy.hero.soon}`"
                >
                  <BaseButton
                    variant="secondary"
                    size="lg"
                    disabled
                    aria-hidden="true"
                    tabindex="-1"
                  >
                    <Smartphone class="size-5" aria-hidden="true" /> {{ copy.hero.appStore }}
                  </BaseButton>
                </span>
              </BaseTooltip>
              <BaseTooltip :label="copy.hero.soon">
                <span
                  class="store-soon inline-flex"
                  tabindex="0"
                  :aria-label="`${copy.hero.googlePlay}: ${copy.hero.soon}`"
                >
                  <BaseButton
                    variant="secondary"
                    size="lg"
                    disabled
                    aria-hidden="true"
                    tabindex="-1"
                  >
                    <Smartphone class="size-5" aria-hidden="true" /> {{ copy.hero.googlePlay }}
                  </BaseButton>
                </span>
              </BaseTooltip>
            </div>
            <p class="text-ink-soft flex items-center gap-2 text-sm">
              <KeyRound class="size-4" aria-hidden="true" /> {{ copy.hero.invite }}
            </p>
          </div>
          <img
            :src="`${base}hero.webp`"
            alt=""
            class="w-full drop-shadow-2xl"
            width="1171"
            height="437"
          />
        </div>
      </section>

      <!-- The five pillars. -->
      <section id="rooms" class="px-4 py-14">
        <div class="mx-auto max-w-(--measure-page)">
          <h2 class="pixel text-3xl">{{ copy.pillarsTitle }}</h2>
          <p class="text-ink-soft mt-2 mb-8">{{ copy.pillarsLead }}</p>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <BaseCard v-for="(pillar, i) in copy.pillars" :key="pillar.title" padding="lg">
              <component :is="pillarIcons[i]" class="text-primary mb-3 size-7" aria-hidden="true" />
              <h3 class="mb-2 font-semibold">{{ pillar.title }}</h3>
              <p class="text-ink-soft text-sm">{{ pillar.text }}</p>
            </BaseCard>
          </div>
        </div>
      </section>

      <!-- Screenshots. -->
      <section class="px-4 py-10">
        <div class="mx-auto max-w-(--measure-page)">
          <h2 class="pixel mb-6 text-3xl">{{ copy.shotsTitle }}</h2>
          <div class="grid gap-4 md:grid-cols-3">
            <BaseCard v-for="(shot, i) in shots" :key="shot" padding="none" class="overflow-hidden">
              <img
                :src="`${base}${shot}`"
                :alt="copy.shots[i]"
                class="shot w-full"
                loading="lazy"
                width="1280"
                height="800"
              />
              <p class="px-4 py-3 text-sm">{{ copy.shots[i] }}</p>
            </BaseCard>
          </div>
        </div>
      </section>

      <!-- What is inside. -->
      <section id="features" class="px-4 py-14">
        <div class="mx-auto max-w-(--measure-page)">
          <h2 class="pixel mb-8 text-3xl">{{ copy.featuresTitle }}</h2>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <BaseCard v-for="(feature, i) in copy.features" :key="feature.title" padding="lg">
              <div class="flex items-start gap-3">
                <component
                  :is="featureIcons[i]"
                  class="text-accent mt-0.5 size-6 shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <h3 class="mb-1 font-semibold">{{ feature.title }}</h3>
                  <p class="text-ink-soft text-sm">{{ feature.text }}</p>
                </div>
              </div>
            </BaseCard>
          </div>
        </div>
      </section>

      <!-- The beta: how to come in, and how to tell us. -->
      <section id="beta" class="px-4 py-14">
        <BaseCard padding="lg" class="mx-auto max-w-(--measure-page)">
          <div class="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
            <div class="flex flex-col items-start gap-4">
              <BaseBadge tone="warning">{{ copy.hero.badge }}</BaseBadge>
              <h2 class="pixel text-3xl">{{ copy.beta.title }}</h2>
              <p class="text-ink-soft">{{ copy.beta.lead }}</p>
              <div class="flex flex-wrap gap-3">
                <BaseButton as="a" :href="suggestLink">
                  <Mail class="size-4" aria-hidden="true" /> {{ copy.beta.suggest }}
                </BaseButton>
                <BaseButton as="a" :href="bugLink" variant="secondary">
                  <Bug class="size-4" aria-hidden="true" /> {{ copy.beta.bug }}
                </BaseButton>
              </div>
            </div>
            <ol class="grid gap-3">
              <li
                v-for="(step, i) in copy.beta.steps"
                :key="step.title"
                class="control flex gap-4 rounded-card p-4"
              >
                <span class="pixel text-primary text-2xl">{{ i + 1 }}</span>
                <div>
                  <h3 class="font-semibold">{{ step.title }}</h3>
                  <p class="text-ink-soft text-sm">{{ step.text }}</p>
                </div>
              </li>
            </ol>
          </div>
        </BaseCard>
      </section>
    </main>

    <footer class="px-4 pt-6 pb-10">
      <div
        class="text-ink-soft mx-auto flex max-w-(--measure-page) flex-wrap items-center gap-x-6 gap-y-2 text-sm"
      >
        <a :href="GITHUB" class="hover:text-primary flex items-center gap-2" rel="noopener">
          <Github class="size-4" aria-hidden="true" /> {{ copy.footer.made }}
        </a>
        <a :href="suggestLink" class="hover:text-primary flex items-center gap-2">
          <Mail class="size-4" aria-hidden="true" /> {{ MAIL }}
        </a>
        <span>{{ copy.footer.credits }}</span>
      </div>
    </footer>
  </div>
</template>
