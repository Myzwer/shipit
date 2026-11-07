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
  }>(),
  { showSwitch: true },
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
  <div :class="[themeClass, 'min-h-dvh']" :style="{ background: 'var(--theme-page)' }">
    <SectionHeaderBar :title="title">
      <template #actions>
        <button
          v-if="showSwitch !== false && session.isDualGame"
          type="button"
          class="rounded-full p-2 text-white/90 transition hover:bg-white/10"
          :aria-label="switchLabel"
          @click="switchGame"
        >
          <AppIcon name="header.switch-game" class="text-lg" />
        </button>
      </template>
    </SectionHeaderBar>

    <ShipTimeIndicator />

    <main class="safe-x safe-bottom mx-auto w-full max-w-lg">
      <slot />
    </main>

    <FloatingBottomNav :game="game" />
  </div>
</template>
