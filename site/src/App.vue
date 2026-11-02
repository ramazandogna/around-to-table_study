<script setup lang="ts">
import {
  Award,
  BookOpen,
  Bug,
  CalendarDays,
  Check,
  ChevronDown,
  Coffee,
  Github,
  Globe,
  KeyRound,
  Mail,
  Menu,
  MessageCircle,
  PawPrint,
  Play,
  ShieldCheck,
  Smartphone,
  SunMoon,
  Timer,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-vue-next';
import { BaseBadge, BaseButton } from 'rei-kit';
import { BaseTooltip } from 'rei-kit/web';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Cursor from './Cursor.vue';
import { extra, PET_ICON, PETS } from './extra';
import { copy, language, LANGUAGES, type Language } from './i18n';
import { fine, still, vMagnetic, vReveal, vTilt } from './motion';
import { listenForSteps, soundOn } from './sound';

/** Where the game lives, and where suggestions go. */
const GAME_URL = 'https://around-the-table.ramazandogna.workers.dev/';
const MAIL = 'doganrmzn40@gmail.com';
const GITHUB = 'https://github.com/ramazandogna';
const REI_KIT = 'https://ramazandogna.github.io/rei-kit/';

const base = import.meta.env.BASE_URL;
const pillarIcons = [Users, Coffee, KeyRound, BookOpen, CalendarDays];
const featureIcons = [Timer, Award, PawPrint, SunMoon, MessageCircle, ShieldCheck];
const shots = ['shot-library.webp', 'shot-smoking.webp', 'shot-hall.webp'];
/** The picture that goes with each reason: the hall, the smoking room, the library… */
const pillarShots = [
  'shot-hall.webp',
  'shot-smoking.webp',
  'shot-library.webp',
  'shot-library.webp',
  'shot-hall.webp',
];

const mail = (subject: string) => `mailto:${MAIL}?subject=${encodeURIComponent(subject)}`;
const suggestLink = computed(() => mail(copy.value.beta.mailSubject));
const bugLink = computed(() => mail(copy.value.beta.bugSubject));

/* ---------- The bar: a menu on phones, and the language list ---------- */

const menuOpen = ref(false);
const langOpen = ref(false);
const langLabel = computed(() => LANGUAGES.find((l) => l.value === language.value)?.label ?? 'EN');
function pick(value: Language) {
  language.value = value;
  langOpen.value = false;
}
const closeAll = (event: Event) => {
  if (!(event.target as Element | null)?.closest('.lang')) langOpen.value = false;
};
const escape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  langOpen.value = false;
  menuOpen.value = false;
};
watch(menuOpen, (open) => document.documentElement.classList.toggle('no-scroll', open));

/* ---------- The bar grows glassier once the page moves ---------- */

const scrolled = ref(false);
const onScroll = () => (scrolled.value = scrollY > 12);

/* ---------- Hero: the building leans toward the pointer ---------- */

const hero = ref<HTMLElement | null>(null);
const lean = (event: PointerEvent) => {
  if (!hero.value || still() || !fine()) return;
  const x = event.clientX / innerWidth - 0.5;
  const y = event.clientY / innerHeight - 0.5;
  hero.value.style.setProperty('--px', `${x * -18}px`);
  hero.value.style.setProperty('--py', `${y * -12}px`);
};

/* ---------- Reasons: one at a time, moving on by itself ---------- */

const REASON_MS = 6000;
const reason = ref(0);
const reasonsPaused = ref(false);
let reasonTimer = 0;
function startReasons() {
  window.clearInterval(reasonTimer);
  if (still()) return;
  reasonTimer = window.setInterval(() => {
    if (!reasonsPaused.value) reason.value = (reason.value + 1) % copy.value.pillars.length;
  }, REASON_MS);
}
function chooseReason(i: number) {
  reason.value = i;
  startReasons();
}

/* ---------- Pets: a hello on hover or tap ---------- */

const petHi = ref<number | null>(null);

/* ---------- Beta steps: lit one after another ---------- */

const step = ref(0);
const stepsHover = ref(false);
let stepTimer = 0;

let stopSteps: (() => void) | null = null;

onMounted(() => {
  stopSteps = listenForSteps();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointerdown', closeAll);
  window.addEventListener('keydown', escape);
  window.addEventListener('pointermove', lean, { passive: true });
  onScroll();
  startReasons();
  if (!still()) {
    stepTimer = window.setInterval(() => {
      if (!stepsHover.value) step.value = (step.value + 1) % copy.value.beta.steps.length;
    }, 2400);
  }
});

onBeforeUnmount(() => {
  stopSteps?.();
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('pointerdown', closeAll);
  window.removeEventListener('keydown', escape);
  window.removeEventListener('pointermove', lean);
  window.clearInterval(reasonTimer);
  window.clearInterval(stepTimer);
});

/** The title, word by word, so it can rise in one after another. */
const titleWords = computed(() => copy.value.hero.title.split(' '));
</script>

<template>
  <Cursor />
  <div class="hero-glow min-h-dvh overflow-x-clip text-ink">
    <!-- The bar: the logo, the way around the page, the language and the game. -->
    <header class="sticky top-0 z-30 px-3 pt-3 sm:px-4">
      <nav
        class="bar surface mx-auto flex max-w-(--measure-page) items-center gap-2 rounded-card px-3 py-2 sm:gap-3 sm:px-4"
        :class="{ 'bar--scrolled': scrolled }"
        aria-label="Around the Table"
      >
        <a href="#top" class="brand flex min-w-0 items-center gap-2" @click="menuOpen = false">
          <span class="brand-head size-9 shrink-0"
            ><img :src="`${base}favicon-64.png`" alt=""
          /></span>
          <span class="pixel truncate text-base sm:text-lg">Around the Table</span>
        </a>

        <div class="ms-auto hidden items-center gap-1 text-sm lg:flex">
          <a href="#rooms" class="nav-link">{{ copy.nav.rooms }}</a>
          <a href="#pets" class="nav-link">{{ extra.nav.pets }}</a>
          <a href="#features" class="nav-link">{{ copy.nav.features }}</a>
          <a href="#beta" class="nav-link">{{ copy.nav.beta }}</a>
          <a :href="suggestLink" class="nav-link">{{ copy.nav.feedback }}</a>
        </div>

        <div class="ms-auto flex shrink-0 items-center gap-1.5 lg:ms-2">
          <!-- The language: one small button and a list, the same on every screen. -->
          <button
            type="button"
            class="lang-button sound-button"
            :aria-label="soundOn ? 'Sound off' : 'Sound on'"
            :aria-pressed="soundOn"
            @click="soundOn = !soundOn"
          >
            <Volume2 v-if="soundOn" class="size-4" aria-hidden="true" />
            <VolumeX v-else class="size-4" aria-hidden="true" />
          </button>
          <div class="lang relative">
            <button
              type="button"
              class="lang-button"
              :aria-label="extra.nav.language"
              :aria-expanded="langOpen"
              aria-haspopup="listbox"
              @click="langOpen = !langOpen"
            >
              <Globe class="size-4" aria-hidden="true" />
              <span class="text-xs font-semibold">{{ langLabel }}</span>
              <ChevronDown
                class="size-3.5 transition-transform"
                :class="{ 'rotate-180': langOpen }"
                aria-hidden="true"
              />
            </button>
            <Transition name="pop">
              <ul
                v-if="langOpen"
                class="lang-list surface"
                role="listbox"
                :aria-label="extra.nav.language"
              >
                <li v-for="l in LANGUAGES" :key="l.value">
                  <button
                    type="button"
                    role="option"
                    class="lang-option"
                    :aria-selected="language === l.value"
                    @click="pick(l.value)"
                  >
                    <span>{{ l.label }}</span>
                    <Check
                      v-if="language === l.value"
                      class="size-4 text-primary"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              </ul>
            </Transition>
          </div>

          <BaseButton v-magnetic as="a" :href="GAME_URL" size="sm" class="play-cta shrink-0">
            <Play class="size-4" aria-hidden="true" />
            <span class="hidden sm:inline">{{ copy.nav.play }}</span>
          </BaseButton>

          <button
            type="button"
            class="lang-button menu-button"
            :aria-label="extra.nav.menu"
            :aria-expanded="menuOpen"
            @click="menuOpen = !menuOpen"
          >
            <X v-if="menuOpen" class="size-5" aria-hidden="true" />
            <Menu v-else class="size-5" aria-hidden="true" />
          </button>
        </div>
      </nav>

      <!-- Phones: the links in a sheet under the bar. -->
      <Transition name="sheet">
        <div
          v-if="menuOpen"
          class="sheet surface mx-auto mt-2 max-w-(--measure-page) rounded-card p-2 lg:hidden"
        >
          <a href="#rooms" class="sheet-link" @click="menuOpen = false">🚪 {{ copy.nav.rooms }}</a>
          <a href="#pets" class="sheet-link" @click="menuOpen = false">🐾 {{ extra.nav.pets }}</a>
          <a href="#features" class="sheet-link" @click="menuOpen = false"
            >✨ {{ copy.nav.features }}</a
          >
          <a href="#beta" class="sheet-link" @click="menuOpen = false">🧪 {{ copy.nav.beta }}</a>
          <a :href="suggestLink" class="sheet-link" @click="menuOpen = false"
            >✉️ {{ copy.nav.feedback }}</a
          >
          <button type="button" class="sheet-link text-start" @click="soundOn = !soundOn">
            {{ soundOn ? '🔊' : '🔇' }} {{ soundOn ? 'Sound on' : 'Sound off' }}
          </button>
        </div>
      </Transition>
    </header>

    <main id="top">
      <!-- Hero: who is inside, what it is, and the doors in. -->
      <section ref="hero" class="hero px-4 pt-10 pb-6 sm:pt-14">
        <div
          class="mx-auto grid max-w-(--measure-page) items-center gap-10 lg:grid-cols-[1fr_1.15fr]"
        >
          <div class="flex flex-col items-start gap-5">
            <div class="hero-in" style="--i: 0">
              <BaseBadge tone="primary"
                ><span class="live-dot" aria-hidden="true" /> {{ copy.hero.badge }}</BaseBadge
              >
            </div>
            <img
              :src="`${base}logo.png`"
              alt="Around the Table"
              class="hero-logo hero-in size-28 sm:size-32"
              style="--i: 1"
            />
            <h1 class="pixel text-4xl leading-tight sm:text-6xl" :key="language">
              <span v-for="(word, i) in titleWords" :key="i" class="word" :style="{ '--i': i + 2 }"
                >{{ word }}&nbsp;</span
              >
            </h1>
            <p class="hero-in text-ink-soft max-w-prose text-lg" style="--i: 5">
              {{ copy.hero.subtitle }}
            </p>
            <div class="hero-in flex flex-wrap gap-3" style="--i: 6">
              <BaseButton
                v-magnetic
                as="a"
                :href="GAME_URL"
                size="lg"
                class="play-cta play-cta--big"
              >
                <Play class="size-5" aria-hidden="true" /> {{ copy.hero.web }}
              </BaseButton>
              <BaseTooltip
                v-for="store in [copy.hero.appStore, copy.hero.googlePlay]"
                :key="store"
                :label="copy.hero.soon"
              >
                <span
                  class="store-soon inline-flex"
                  tabindex="0"
                  :aria-label="`${store}: ${copy.hero.soon}`"
                >
                  <BaseButton
                    variant="secondary"
                    size="lg"
                    disabled
                    aria-hidden="true"
                    tabindex="-1"
                  >
                    <Smartphone class="size-5" aria-hidden="true" /> {{ store }}
                  </BaseButton>
                </span>
              </BaseTooltip>
            </div>
            <p class="hero-in invite text-ink-soft text-sm" style="--i: 7">
              <KeyRound class="size-4 shrink-0" aria-hidden="true" />
              <span>{{ copy.hero.invite }}</span>
            </p>
          </div>

          <div class="hero-art hero-in" style="--i: 3">
            <span class="bubble bubble--a" aria-hidden="true">💬</span>
            <span class="bubble bubble--b" aria-hidden="true">🍅</span>
            <span class="bubble bubble--c" aria-hidden="true">🎵</span>
            <span class="bubble bubble--d" aria-hidden="true">🐾</span>
            <img
              :src="`${base}hero.webp`"
              alt=""
              class="hero-img w-full"
              width="1171"
              height="437"
            />
            <div class="hero-floor" aria-hidden="true" />
          </div>
        </div>
        <a href="#rooms" class="scroll-hint" :aria-label="extra.scroll">
          <span>{{ extra.scroll }}</span
          ><ChevronDown class="size-4" aria-hidden="true" />
        </a>
      </section>

      <!-- What is going on inside, rolling by. -->
      <div class="ticker" aria-hidden="true">
        <div class="ticker-track">
          <span
            v-for="(item, i) in [...extra.ticker, ...extra.ticker]"
            :key="i"
            class="ticker-item"
            >{{ item }}</span
          >
        </div>
      </div>

      <!-- The five reasons: pick one, or watch them go by. -->
      <section id="rooms" class="px-4 py-16">
        <div class="mx-auto max-w-(--measure-page)">
          <h2 v-reveal class="pixel text-3xl sm:text-4xl">{{ copy.pillarsTitle }}</h2>
          <p v-reveal="1" class="text-ink-soft mt-2 mb-8">{{ copy.pillarsLead }}</p>
          <div
            class="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]"
            @pointerenter="reasonsPaused = true"
            @pointerleave="reasonsPaused = false"
          >
            <ol class="grid gap-2" :aria-label="extra.pillarsHint">
              <li v-for="(pillar, i) in copy.pillars" :key="pillar.title" v-reveal="i">
                <button
                  type="button"
                  class="reason surface"
                  :class="{ 'reason--on': reason === i }"
                  :aria-pressed="reason === i"
                  @click="chooseReason(i)"
                  @focus="chooseReason(i)"
                >
                  <span class="reason-icon"
                    ><component :is="pillarIcons[i]" class="size-5" aria-hidden="true"
                  /></span>
                  <span class="min-w-0 flex-1 text-start">
                    <span class="block font-semibold">{{ pillar.title }}</span>
                    <span class="reason-text text-ink-soft block text-sm">{{ pillar.text }}</span>
                  </span>
                  <span class="pixel reason-number">0{{ i + 1 }}</span>
                  <span
                    v-if="reason === i"
                    class="reason-bar"
                    :class="{ 'reason-bar--paused': reasonsPaused }"
                    :style="{ animationDuration: `${REASON_MS}ms` }"
                  />
                </button>
              </li>
            </ol>
            <div v-reveal="2" v-tilt="5" class="reason-view surface">
              <Transition name="swap" mode="out-in">
                <figure :key="reason" class="m-0">
                  <img
                    :src="`${base}${pillarShots[reason]}`"
                    alt=""
                    class="reason-img"
                    width="1280"
                    height="800"
                  />
                  <figcaption class="reason-caption">
                    <span class="pixel text-primary text-2xl">0{{ reason + 1 }}</span>
                    <span>
                      <b class="block text-lg">{{ copy.pillars[reason].title }}</b>
                      <span class="text-ink-soft text-sm">{{ copy.pillars[reason].text }}</span>
                    </span>
                  </figcaption>
                </figure>
              </Transition>
              <span class="glint" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <!-- The pets. -->
      <section id="pets" class="px-4 py-16">
        <div class="mx-auto max-w-(--measure-page)">
          <h2 v-reveal class="pixel text-3xl sm:text-4xl">{{ extra.pets.title }}</h2>
          <p v-reveal="1" class="text-ink-soft mt-2 max-w-prose">{{ extra.pets.lead }}</p>
          <p
            v-reveal="2"
            class="text-accent mt-1 mb-8 flex items-center gap-2 text-sm font-semibold"
          >
            <PawPrint class="size-4" aria-hidden="true" /> {{ extra.pets.hint }}
          </p>
          <ul class="pets grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <li v-for="(pet, i) in PETS" :key="pet" v-reveal="i">
              <button
                type="button"
                class="pet surface"
                :class="[`pet--${pet}`, { 'pet--hi': petHi === i }]"
                @pointerenter="petHi = i"
                @pointerleave="petHi = null"
                @click="petHi = petHi === i ? null : i"
              >
                <span class="pet-face" aria-hidden="true">{{ PET_ICON[pet] }}</span>
                <span class="pet-shadow" aria-hidden="true" />
                <span class="pet-steps" aria-hidden="true"><i>🐾</i><i>🐾</i><i>🐾</i></span>
                <b class="pet-name">{{ extra.pets.list[i].name }}</b>
                <span class="pet-trait">{{ extra.pets.list[i].trait }}</span>
              </button>
            </li>
          </ul>
        </div>
      </section>

      <!-- Screenshots. -->
      <section class="px-4 py-12">
        <div class="mx-auto max-w-(--measure-page)">
          <h2 v-reveal class="pixel mb-6 text-3xl sm:text-4xl">{{ copy.shotsTitle }}</h2>
          <div class="grid gap-4 md:grid-cols-3">
            <figure
              v-for="(shot, i) in shots"
              :key="shot"
              v-reveal="i"
              v-tilt
              class="shot-card surface m-0"
            >
              <div class="overflow-hidden rounded-t-[inherit]">
                <img
                  :src="`${base}${shot}`"
                  :alt="copy.shots[i]"
                  class="shot w-full"
                  loading="lazy"
                  width="1280"
                  height="800"
                />
              </div>
              <figcaption class="px-4 py-3 text-sm">{{ copy.shots[i] }}</figcaption>
              <span class="glint" aria-hidden="true" />
            </figure>
          </div>
        </div>
      </section>

      <!-- What is inside. -->
      <section id="features" class="px-4 py-16">
        <div class="mx-auto max-w-(--measure-page)">
          <h2 v-reveal class="pixel mb-8 text-3xl sm:text-4xl">{{ copy.featuresTitle }}</h2>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article
              v-for="(feature, i) in copy.features"
              :key="feature.title"
              v-reveal="i"
              v-tilt
              class="feature surface"
            >
              <span class="feature-icon"
                ><component :is="featureIcons[i]" class="size-6" aria-hidden="true"
              /></span>
              <h3 class="mt-4 mb-1 font-semibold">{{ feature.title }}</h3>
              <p class="text-ink-soft text-sm">{{ feature.text }}</p>
              <span class="glint" aria-hidden="true" />
            </article>
          </div>
        </div>
      </section>

      <!-- The beta: how to come in, and how to tell us. -->
      <section id="beta" class="px-4 py-16">
        <div v-reveal class="beta surface mx-auto max-w-(--measure-page) rounded-card p-6 sm:p-10">
          <div class="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
            <div class="flex flex-col items-start gap-4">
              <BaseBadge tone="warning">{{ copy.hero.badge }}</BaseBadge>
              <h2 class="pixel text-3xl sm:text-4xl">{{ copy.beta.title }}</h2>
              <p class="text-ink-soft">{{ copy.beta.lead }}</p>
              <div class="flex flex-wrap gap-3">
                <BaseButton v-magnetic as="a" :href="suggestLink">
                  <Mail class="size-4" aria-hidden="true" /> {{ copy.beta.suggest }}
                </BaseButton>
                <BaseButton v-magnetic as="a" :href="bugLink" variant="secondary">
                  <Bug class="size-4" aria-hidden="true" /> {{ copy.beta.bug }}
                </BaseButton>
              </div>
            </div>
            <div>
              <p class="text-ink-soft mb-3 text-sm font-semibold">{{ extra.stepsHint }}</p>
              <ol
                class="steps"
                :style="{ '--done': step }"
                @pointerenter="stepsHover = true"
                @pointerleave="stepsHover = false"
              >
                <li
                  v-for="(s, i) in copy.beta.steps"
                  :key="s.title"
                  class="step"
                  :class="{ 'step--on': step === i, 'step--done': i < step }"
                  tabindex="0"
                  @pointerenter="step = i"
                  @focus="step = i"
                >
                  <span class="step-dot pixel">{{ i + 1 }}</span>
                  <div class="step-body">
                    <h3 class="font-semibold">{{ s.title }}</h3>
                    <p class="text-ink-soft text-sm">{{ s.text }}</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="px-4 pt-6 pb-10">
      <div
        class="text-ink-soft mx-auto flex max-w-(--measure-page) flex-wrap items-center gap-x-6 gap-y-2 text-sm"
      >
        <a :href="GITHUB" class="nav-link flex items-center gap-2" rel="noopener">
          <Github class="size-4" aria-hidden="true" /> {{ copy.footer.made }}
        </a>
        <a :href="suggestLink" class="nav-link flex items-center gap-2 break-all">
          <Mail class="size-4 shrink-0" aria-hidden="true" /> {{ MAIL }}
        </a>
        <a :href="REI_KIT" class="nav-link flex items-center gap-2" rel="noopener">
          <Sparkles class="size-4 shrink-0" aria-hidden="true" /> {{ copy.footer.kit }}
        </a>
        <span>{{ copy.footer.credits }}</span>
      </div>
    </footer>
  </div>
</template>
