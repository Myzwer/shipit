<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { useRouter } from 'vue-router'
import AchievementCategoryFilter from '@/features/achievements/AchievementCategoryFilter.vue'
import CatalogAdminSection from '@/features/admin/CatalogAdminSection.vue'
import DrinkItAdminSection from '@/features/admin/DrinkItAdminSection.vue'
import OverviewSection from '@/features/admin/OverviewSection.vue'
import RosterSection from '@/features/admin/RosterSection.vue'
import ShipClockSection from '@/features/admin/ShipClockSection.vue'
import { copy } from '@/ui/copy'
import { useSessionStore } from '@/stores/session'

export type AdminSectionKey =
  | 'overview'
  | 'players'
  | 'drinkit'
  | 'shipclock'
  | 'catalog'

const SECTION_OPTIONS: Array<{ key: AdminSectionKey; label: string }> = [
  { key: 'overview', label: copy.admin.sectionOverview },
  { key: 'players', label: copy.admin.sectionPlayers },
  { key: 'drinkit', label: copy.admin.sectionDrinkIt },
  { key: 'shipclock', label: copy.admin.sectionShipClock },
  { key: 'catalog', label: copy.admin.sectionCatalog },
]

const SECTION_COMPONENTS: Record<AdminSectionKey, Component> = {
  overview: OverviewSection,
  players: RosterSection,
  drinkit: DrinkItAdminSection,
  shipclock: ShipClockSection,
  catalog: CatalogAdminSection,
}

const router = useRouter()
const session = useSessionStore()
const section = ref<AdminSectionKey>('overview')

const selectedLabel = computed(
  () => SECTION_OPTIONS.find((o) => o.key === section.value)?.label ?? copy.admin.sectionOverview,
)

const activeComponent = computed(() => SECTION_COMPONENTS[section.value])

function backHome() {
  void router.push(session.homePathForMembership())
}
</script>

<template>
  <div
    class="ui-mint-panel flex min-h-dvh flex-col"
    style="padding-top: env(safe-area-inset-top)"
    data-testid="admin-view"
  >
    <header class="px-4 py-4 text-center text-white" style="background: #2f3a44">
      <h1 class="font-display text-lg font-bold tracking-wide">{{ copy.admin.title }}</h1>
    </header>
    <main class="mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-2">
      <div class="admin-section-filter">
        <AchievementCategoryFilter
          v-model="section"
          :options="SECTION_OPTIONS"
          :label="copy.admin.sectionLabel"
          test-id="admin-section-filter"
        />
      </div>

      <p
        class="mb-1 text-sm font-semibold"
        style="color: #2f3a44"
        data-testid="admin-section-label"
      >
        {{ selectedLabel }}
      </p>

      <!-- KeepAlive preserves pending/reconcile UI state without mounting unopened sections. -->
      <KeepAlive>
        <component :is="activeComponent" :key="section" />
      </KeepAlive>

      <button
        type="button"
        class="mt-10 rounded-full px-6 py-3 text-sm font-semibold text-white"
        style="background: #0a5c6b"
        @click="backHome"
      >
        {{ copy.admin.backHome }}
      </button>
    </main>
  </div>
</template>

<style scoped>
/* Opaque surface so the section menu stays readable over Admin content. */
.admin-section-filter :deep(.achievement-filter__trigger),
.admin-section-filter :deep(.achievement-filter__menu) {
  background: #fff;
  color: #2f3a44;
  box-shadow: 0 8px 24px rgb(47 58 68 / 16%);
}
.admin-section-filter :deep(.achievement-filter__menu) {
  z-index: 50;
}
.admin-section-filter :deep(.achievement-filter__menu li) {
  background: #fff;
}
</style>
