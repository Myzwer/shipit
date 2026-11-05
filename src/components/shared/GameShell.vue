<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import FloatingBottomNav from '@/components/shared/FloatingBottomNav.vue'
import SectionHeaderBar from '@/components/shared/SectionHeaderBar.vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import { useSessionStore } from '@/stores/session'
import { copy } from '@/ui/copy'
import type { GameId } from '@/types/game'

const props = defineProps<{
  game: GameId
  title: string
  showSwitch?: boolean
}>()

const router = useRouter()
const session = useSessionStore()

const themeClass = computed(() => (props.game === 'drinkit' ? 'theme-drink' : 'theme-ship'))
const switchLabel = computed(() =>
  props.game === 'drinkit' ? copy.switchTo.shipIt : copy.switchTo.drinkIt,
)

onMounted(() => {
  session.setCurrentGame(props.game)
})

onUnmounted(() => {
  session.setCurrentGame(null)
})

function switchGame() {
  void router.push(props.game === 'drinkit' ? '/shipit' : '/drinkit')
}
</script>

<template>
  <div :class="[themeClass, 'min-h-dvh']" :style="{ background: 'var(--theme-page)' }">
    <SectionHeaderBar :title="title">
      <template v-if="showSwitch !== false && session.isDualGame" #actions>
        <button
          type="button"
          class="rounded-full p-2 text-white/90 transition hover:bg-white/10"
          :aria-label="switchLabel"
          @click="switchGame"
        >
          <AppIcon name="header.switch-game" class="text-lg" />
        </button>
      </template>
    </SectionHeaderBar>

    <main class="safe-x safe-bottom mx-auto w-full max-w-lg">
      <slot />
    </main>

    <FloatingBottomNav :game="game" />
  </div>
</template>
