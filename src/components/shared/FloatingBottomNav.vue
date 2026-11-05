<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import { copy } from '@/ui/copy'
import type { GameId } from '@/types/game'
import type { SemanticIconKey } from '@/ui/icons'

const props = defineProps<{
  game: GameId
}>()

const route = useRoute()
const router = useRouter()

const homePath = computed(() => (props.game === 'drinkit' ? '/drinkit' : '/shipit'))

const items = computed(() => {
  const actionLabel = props.game === 'drinkit' ? copy.nav.logDrink : copy.nav.challenges
  return [
    {
      key: 'home',
      icon: 'nav.home' as SemanticIconKey,
      label: copy.nav.home,
      path: homePath.value,
      active: route.path === homePath.value,
    },
    {
      key: 'action',
      icon: 'nav.action' as SemanticIconKey,
      label: actionLabel,
      path: homePath.value,
      active: false,
      shellOnly: true,
    },
    {
      key: 'gallery',
      icon: 'nav.gallery' as SemanticIconKey,
      label: copy.nav.gallery,
      path: homePath.value,
      active: false,
      shellOnly: true,
      showDot: true,
    },
    {
      key: 'achievements',
      icon: 'nav.achievements' as SemanticIconKey,
      label: copy.nav.achievements,
      path: homePath.value,
      active: false,
      shellOnly: true,
    },
  ]
})

function onSelect(item: (typeof items.value)[number]) {
  if (item.shellOnly) {
    // Phase 0: Plus / Gallery / Achievements are visual shells only.
    return
  }
  void router.push(item.path)
}
</script>

<template>
  <nav
    class="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4"
    style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
    :aria-label="game === 'drinkit' ? 'Drink It! navigation' : 'Ship It! navigation'"
  >
    <div
      class="pointer-events-auto flex w-full max-w-sm items-center justify-around rounded-2xl px-2 py-3 text-white shadow-lg"
      style="background: var(--theme-nav)"
    >
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        class="relative flex h-11 w-11 items-center justify-center rounded-xl transition"
        :class="item.active ? 'opacity-100' : 'opacity-55 hover:opacity-85'"
        :aria-label="item.label"
        :aria-current="item.active ? 'page' : undefined"
        @click="onSelect(item)"
      >
        <AppIcon
          :name="item.icon"
          :style-variant="item.active ? 'solid' : 'outline'"
          class="text-xl"
        />
        <span
          v-if="item.showDot"
          class="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full"
          style="background: var(--theme-surface)"
          aria-hidden="true"
        />
      </button>
    </div>
  </nav>
</template>
