<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import FloatingBottomNav from '@/components/shared/FloatingBottomNav.vue'
import SectionHeaderBar from '@/components/shared/SectionHeaderBar.vue'
import ShipTimeIndicator from '@/components/shared/ShipTimeIndicator.vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { useSessionStore } from '@/stores/session'
import { copy } from '@/ui/copy'
import type { GameId } from '@/types/game'

const props = withDefaults(
  defineProps<{
    game: GameId
    title: string
    /** Dual-game header switch; defaults on. Pass false to hide. */
    showSwitch?: boolean
    /** Player-facing Home screens hide the general ship-time row. */
    showShipTime?: boolean
    /**
     * Horizontal content inset (`safe-x`). Defaults on.
     * Wrapped passes false so intro bands and stat tiles can span edge-to-edge.
     */
    contentInset?: boolean
    /** Home applies larger non-sticky header chrome without restyling other screens. */
    tone?: 'default' | 'home'
    /**
     * Sticky magenta header. Defaults to pinned except on Home tone.
     * Daily Details passes false so the bar scrolls with the page.
     */
    headerPinned?: boolean
  }>(),
  { showSwitch: true, showShipTime: true, contentInset: true, tone: 'default' },
)

const headerIsPinned = computed(() =>
  props.headerPinned !== undefined ? props.headerPinned : props.tone !== 'home',
)

const router = useRouter()
const session = useSessionStore()
const awardsMode = useAwardsModeStore()

const themeClass = computed(() => (props.game === 'drinkit' ? 'theme-drink' : 'theme-ship'))
const switchLabel = computed(() =>
  props.game === 'drinkit' ? copy.switchTo.shipIt : copy.switchTo.drinkIt,
)

onMounted(() => {
  session.setCurrentGame(props.game)
  awardsMode.ensureStarted()
})

onUnmounted(() => {
  session.setCurrentGame(null)
})

function switchGame() {
  const target: GameId = props.game === 'drinkit' ? 'shipit' : 'drinkit'
  void router.push(awardsMode.homePathForGame(target))
}
</script>

<template>
  <div
    :class="[themeClass, props.tone === 'home' ? 'theme-home' : '', 'min-h-dvh']"
    :style="{ background: 'var(--theme-gradient-warm)' }"
  >
    <SectionHeaderBar
      :title="title"
      :compact="props.tone === 'home'"
      :pinned="headerIsPinned"
    >
      <template #actions>
        <slot name="header-actions" />
        <button
          v-if="showSwitch !== false && session.isDualGame"
          type="button"
          class="inline-flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10"
          :aria-label="switchLabel"
          data-testid="switch-game"
          @click="switchGame"
        >
          <AppIcon name="header.switch-game" class="text-xl" />
        </button>
      </template>
    </SectionHeaderBar>

    <ShipTimeIndicator v-if="showShipTime" />

    <main
      class="safe-bottom mx-auto w-full max-w-lg"
      :class="[
        props.tone === 'home' || props.contentInset === false ? '' : 'safe-x',
      ]"
    >
      <slot />
    </main>

    <FloatingBottomNav :game="game" />
  </div>
</template>
