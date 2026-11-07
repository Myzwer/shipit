<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import { useAchievementsUnreadStore } from '@/stores/achievementsUnread'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { useGalleryUnreadStore } from '@/stores/galleryUnread'
import { copy } from '@/ui/copy'
import type { GameId } from '@/types/game'
import type { SemanticIconKey } from '@/ui/icons'

const props = defineProps<{
  game: GameId
}>()

const emit = defineEmits<{
  /** Drink It! Plus / Log a Drink — parent may intercept (e.g. wizard Start Over). */
  action: []
}>()

const route = useRoute()
const router = useRouter()
const galleryUnread = useGalleryUnreadStore()
const achievementsUnread = useAchievementsUnreadStore()
const awardsMode = useAwardsModeStore()

onMounted(() => {
  awardsMode.ensureStarted()
  void galleryUnread.refresh(props.game)
  void achievementsUnread.refresh(props.game)
})

const homePath = computed(() => awardsMode.homePathForGame(props.game))
const onWizard = computed(() => route.name === 'drinkit-log')
const onShipChallenges = computed(() => route.name === 'shipit-challenges')
const onGallery = computed(
  () => route.name === 'drinkit-gallery' || route.name === 'shipit-gallery',
)
const onAchievements = computed(
  () => route.name === 'drinkit-achievements' || route.name === 'shipit-achievements',
)
const onWrapped = computed(
  () => route.name === 'drinkit-wrapped' || route.name === 'shipit-wrapped',
)

type NavItem = {
  key: string
  icon: SemanticIconKey
  label: string
  path: string
  active: boolean
  shellOnly: boolean
  isAction?: boolean
  showDot?: boolean
  unreadAria?: string
}

const items = computed((): NavItem[] => {
  if (awardsMode.isAwardsMode) {
    return [
      {
        key: 'wrapped',
        icon: 'nav.wrapped',
        label: copy.nav.wrapped,
        path: homePath.value,
        active: onWrapped.value || route.path === homePath.value,
        shellOnly: false,
      },
      {
        key: 'gallery',
        icon: 'nav.gallery',
        label: copy.nav.gallery,
        path: props.game === 'drinkit' ? '/drinkit/gallery' : '/shipit/gallery',
        active: onGallery.value,
        shellOnly: false,
        showDot: galleryUnread.hasUnread(props.game),
        unreadAria: copy.gallery.unreadAria,
      },
      {
        key: 'achievements',
        icon: 'nav.achievements',
        label: copy.nav.achievements,
        path: props.game === 'drinkit' ? '/drinkit/achievements' : '/shipit/achievements',
        active: onAchievements.value,
        shellOnly: false,
        showDot: achievementsUnread.hasUnread(props.game),
        unreadAria: copy.achievements.unreadAria,
      },
    ]
  }

  const actionLabel = props.game === 'drinkit' ? copy.nav.logDrink : copy.nav.challenges
  return [
    {
      key: 'home',
      icon: 'nav.home',
      label: copy.nav.home,
      path: homePath.value,
      active: route.path === homePath.value,
      shellOnly: false,
    },
    {
      key: 'action',
      icon: 'nav.action',
      label: actionLabel,
      path: props.game === 'drinkit' ? '/drinkit/log' : '/shipit/challenges',
      active: onWizard.value || onShipChallenges.value,
      shellOnly: false,
      isAction: true,
    },
    {
      key: 'gallery',
      icon: 'nav.gallery',
      label: copy.nav.gallery,
      path: props.game === 'drinkit' ? '/drinkit/gallery' : '/shipit/gallery',
      active: onGallery.value,
      shellOnly: false,
      showDot: galleryUnread.hasUnread(props.game),
      unreadAria: copy.gallery.unreadAria,
    },
    {
      key: 'achievements',
      icon: 'nav.achievements',
      label: copy.nav.achievements,
      path: props.game === 'drinkit' ? '/drinkit/achievements' : '/shipit/achievements',
      active: onAchievements.value,
      shellOnly: false,
      showDot: achievementsUnread.hasUnread(props.game),
      unreadAria: copy.achievements.unreadAria,
    },
  ]
})

watch(
  () => awardsMode.isAwardsMode,
  (awards) => {
    if (!awards) return
    // Remap active Home → Wrapped without yanking Gallery / Achievements.
    if (route.name === 'drinkit-home' || route.name === 'shipit-home') {
      void router.replace({
        name: props.game === 'drinkit' ? 'drinkit-wrapped' : 'shipit-wrapped',
      })
    }
  },
)

function onSelect(item: NavItem) {
  if (item.isAction && props.game === 'drinkit') {
    if (onWizard.value) {
      emit('action')
      return
    }
    void router.push({ name: 'drinkit-log' })
    return
  }
  if (item.isAction && props.game === 'shipit') {
    void router.push({ path: '/shipit/challenges' })
    return
  }
  if (item.shellOnly) {
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
    :data-awards-mode="awardsMode.isAwardsMode ? 'true' : 'false'"
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
        :class="
          item.active
            ? 'bg-white/15 opacity-100'
            : 'opacity-55 hover:opacity-85'
        "
        :aria-label="item.showDot && item.unreadAria ? item.unreadAria : item.label"
        :aria-current="item.active ? 'page' : undefined"
        data-testid="nav-item"
        :data-nav="item.key"
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
          :data-testid="item.key === 'achievements' ? 'achievements-unread-dot' : 'gallery-unread-dot'"
          aria-hidden="true"
        />
      </button>
    </div>
  </nav>
</template>
