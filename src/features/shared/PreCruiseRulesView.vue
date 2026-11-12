<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import CruiseCountdown from '@/components/shared/CruiseCountdown.vue'
import GameRulesPanel from '@/features/shared/GameRulesPanel.vue'
import { rulesForGame } from '@/content/precruiseRules'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { copy } from '@/ui/copy'

const props = defineProps<{
  game: 'drinkit' | 'shipit'
}>()

const router = useRouter()
const awards = useAwardsModeStore()
awards.ensureStarted()

const rules = computed(() => rulesForGame(props.game))
const themeClass = computed(() => (props.game === 'drinkit' ? 'theme-drink' : 'theme-ship'))
const gameIcon = computed(() =>
  props.game === 'drinkit' ? 'theme.drink-it' : 'theme.ship-it',
)

const opensAtUtc = computed(() => {
  if (props.game === 'drinkit') {
    return awards.state?.drinkit_opens_at_utc ?? awards.state?.cruise_opens_at_utc ?? null
  }
  return awards.state?.shipit_opens_at_utc ?? awards.state?.cruise_opens_at_utc ?? null
})

function goHome() {
  void router.push({ name: 'game-selection' })
}
</script>

<template>
  <div
    class="precruise-rules min-h-dvh"
    :class="themeClass"
    style="background: var(--theme-gradient-warm)"
    :data-testid="`${game}-rules`"
  >
    <header class="precruise-rules__header" data-testid="rules-header">
      <button
        type="button"
        class="precruise-rules__back"
        :aria-label="copy.precruise.backHome"
        data-testid="rules-back"
        @click="goHome"
      >
        <AppIcon name="header.back" class="text-lg" />
      </button>

      <CruiseCountdown
        class="precruise-rules__countdown"
        compact
        on-header
        :opens-at-utc="opensAtUtc"
        test-id="rules-countdown"
      />
    </header>

    <main class="precruise-rules__main safe-x pb-12 pt-5">
      <div class="mb-4 flex items-center gap-3 px-1">
        <AppIcon
          :name="gameIcon"
          class="text-[2rem] leading-none"
          style="color: var(--theme-ink)"
        />
        <h1
          class="font-display text-[1.85rem] font-extrabold leading-none tracking-[0.05em]"
          style="color: var(--theme-ink)"
        >
          {{ rules.title }}
        </h1>
      </div>

      <GameRulesPanel :game="game" />
    </main>
  </div>
</template>

<style scoped>
.precruise-rules__header {
  position: relative;
  z-index: 10;
  display: grid;
  grid-template-columns: 2.85rem minmax(0, 1fr) 2.85rem;
  align-items: center;
  gap: 0.15rem;
  background: var(--theme-header);
  color: #ffffff;
  padding-top: max(0.55rem, env(safe-area-inset-top));
  padding-bottom: 0.7rem;
  padding-left: max(0.35rem, env(safe-area-inset-left));
  padding-right: max(0.35rem, env(safe-area-inset-right));
}

.precruise-rules__countdown {
  grid-column: 2;
  justify-self: center;
  width: 100%;
  max-width: 18.5rem;
}

.precruise-rules__back {
  display: inline-flex;
  min-height: 2.75rem;
  min-width: 2.75rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #ffffff;
}

.precruise-rules__back:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}

.precruise-rules__main {
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
}
</style>
