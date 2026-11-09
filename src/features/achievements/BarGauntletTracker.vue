<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import {
  getDrinkItCollectionChecklist,
} from '@/lib/achievements/api'
import type {
  BarGauntletSummary,
  CollectionChecklistFilter,
  CollectionChecklistItem,
} from '@/types/achievements'
import { filterCollectionChecklistItems } from '@/types/achievements'
import { copy, formatCopy } from '@/ui/copy'

const props = defineProps<{
  summary: BarGauntletSummary
}>()

const expanded = ref(false)
const checklistFilter = ref<CollectionChecklistFilter>('all')
const loadingChecklist = ref(false)
const checklistError = ref(false)
const items = ref<CollectionChecklistItem[]>([])
const loadedBarKey = ref<string | null>(null)

const personalPct = computed(() => {
  const t = props.summary.personal.live_target || props.summary.live_target
  if (!t) return 0
  return Math.min(100, Math.round((props.summary.personal.live_current / t) * 100))
})

const collectivePct = computed(() => {
  const t = props.summary.collective.live_target || props.summary.live_target
  if (!t) return 0
  return Math.min(100, Math.round((props.summary.collective.live_current / t) * 100))
})

const filteredItems = computed(() =>
  filterCollectionChecklistItems(items.value, checklistFilter.value),
)

const filters: Array<{ key: CollectionChecklistFilter; label: string }> = [
  { key: 'all', label: copy.achievements.checklistAll },
  { key: 'i_need', label: copy.achievements.checklistINeed },
  { key: 'we_need', label: copy.achievements.checklistWeNeed },
]

async function ensureChecklist() {
  if (loadedBarKey.value === props.summary.bar_key && items.value.length > 0) return
  loadingChecklist.value = true
  checklistError.value = false
  try {
    const res = await getDrinkItCollectionChecklist(props.summary.bar_key)
    items.value = res.items
    loadedBarKey.value = props.summary.bar_key
  } catch {
    checklistError.value = true
    items.value = []
  } finally {
    loadingChecklist.value = false
  }
}

async function toggleExpanded() {
  expanded.value = !expanded.value
  if (expanded.value) await ensureChecklist()
}

watch(
  () => props.summary.bar_key,
  () => {
    items.value = []
    loadedBarKey.value = null
    if (expanded.value) void ensureChecklist()
  },
)
</script>

<template>
  <article
    class="gauntlet-tracker overflow-hidden rounded-2xl"
    data-testid="gauntlet-tracker"
    :data-bar-key="summary.bar_key"
  >
    <div class="flex gap-3 px-3 py-3">
      <div class="flex w-10 shrink-0 items-start justify-center pt-1" aria-hidden="true">
        <AppIcon name="status.locked" style-variant="solid" class="text-xl" style="color: var(--theme-ink)" />
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="text-[0.98rem] font-bold" style="color: var(--theme-ink)">
          {{ summary.bar_name }}
        </h3>
        <p class="mt-0.5 text-sm opacity-80" style="color: var(--theme-ink)">
          {{
            formatCopy(copy.achievements.gauntletObjective, {
              bar: summary.bar_name,
            })
          }}
        </p>

        <div class="mt-3 grid grid-cols-2 gap-3">
          <div data-testid="gauntlet-progress-personal">
            <p class="text-[0.65rem] font-bold uppercase tracking-wide opacity-70">
              {{ copy.achievements.iveEarned }}
            </p>
            <p class="text-sm font-bold tabular-nums" style="color: var(--theme-ink)">
              {{
                formatCopy(copy.achievements.progress, {
                  current: summary.personal.live_current,
                  target: summary.personal.live_target || summary.live_target,
                })
              }}
            </p>
            <div
              class="mt-1 h-2 overflow-hidden rounded-full"
              style="background: rgba(7, 108, 128, 0.18)"
            >
              <div
                class="h-full rounded-full"
                style="background: var(--theme-primary)"
                :style="{ width: `${personalPct}%` }"
              />
            </div>
          </div>
          <div data-testid="gauntlet-progress-collective">
            <p class="text-[0.65rem] font-bold uppercase tracking-wide opacity-70">
              {{ copy.achievements.weveEarned }}
            </p>
            <p class="text-sm font-bold tabular-nums" style="color: var(--theme-ink)">
              {{
                formatCopy(copy.achievements.progress, {
                  current: summary.collective.live_current,
                  target: summary.collective.live_target || summary.live_target,
                })
              }}
            </p>
            <div
              class="mt-1 h-2 overflow-hidden rounded-full"
              style="background: rgba(7, 108, 128, 0.18)"
            >
              <div
                class="h-full rounded-full"
                style="background: var(--theme-primary)"
                :style="{ width: `${collectivePct}%` }"
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          class="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold"
          style="color: var(--theme-primary)"
          data-testid="gauntlet-toggle-checklist"
          :aria-expanded="expanded"
          @click="toggleExpanded"
        >
          <AppIcon
            name="action.expand"
            class="transition"
            :class="expanded ? 'rotate-180' : ''"
          />
          {{
            expanded
              ? copy.achievements.hideChecklist
              : copy.achievements.showChecklist
          }}
        </button>
      </div>
    </div>

    <div
      v-if="expanded"
      class="border-t px-3 pb-3 pt-2"
      style="border-color: rgba(7, 108, 128, 0.18)"
      data-testid="gauntlet-checklist"
    >
      <div class="mb-2 flex flex-wrap gap-1.5" role="tablist" :aria-label="copy.achievements.checklistFilter">
        <button
          v-for="f in filters"
          :key="f.key"
          type="button"
          role="tab"
          class="rounded-full px-2.5 py-1 text-xs font-semibold"
          :style="
            checklistFilter === f.key
              ? { background: 'var(--theme-primary)', color: '#fff' }
              : { background: 'rgba(7, 108, 128, 0.12)', color: 'var(--theme-ink)' }
          "
          :aria-selected="checklistFilter === f.key"
          :data-testid="`gauntlet-filter-${f.key}`"
          @click="checklistFilter = f.key"
        >
          {{ f.label }}
        </button>
      </div>

      <p v-if="loadingChecklist" class="text-sm opacity-70">{{ copy.achievements.loadingChecklist }}</p>
      <p v-else-if="checklistError" class="text-sm opacity-70">{{ copy.achievements.checklistFailed }}</p>
      <p v-else-if="filteredItems.length === 0" class="text-sm opacity-70">
        {{ copy.achievements.checklistEmpty }}
      </p>
      <ul v-else class="space-y-1.5">
        <li
          v-for="item in filteredItems"
          :key="item.offering_id"
          class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-sm"
          data-testid="gauntlet-checklist-row"
          :data-concept-key="item.concept_key"
        >
          <span class="min-w-0 truncate font-medium" style="color: var(--theme-ink)">
            {{ item.display_name }}
          </span>
          <span
            class="inline-flex w-10 flex-col items-center gap-0.5"
            :title="copy.achievements.me"
          >
            <span class="text-[0.55rem] font-bold uppercase opacity-60">{{ copy.achievements.me }}</span>
            <AppIcon
              :name="item.mine ? 'status.completed' : 'status.unselected'"
              style-variant="solid"
              class="text-base"
              :style="{ color: item.mine ? 'var(--theme-ink)' : 'rgba(0,0,0,0.25)' }"
            />
          </span>
          <span
            class="inline-flex w-10 flex-col items-center gap-0.5"
            :title="copy.achievements.us"
          >
            <span class="text-[0.55rem] font-bold uppercase opacity-60">{{ copy.achievements.us }}</span>
            <AppIcon
              :name="item.everyone ? 'status.completed' : 'status.unselected'"
              style-variant="solid"
              class="text-base"
              :style="{ color: item.everyone ? 'var(--theme-ink)' : 'rgba(0,0,0,0.25)' }"
            />
          </span>
        </li>
      </ul>
    </div>
  </article>
</template>

<style scoped>
.gauntlet-tracker {
  box-shadow: var(--theme-card-shadow, var(--shadow-card));
  background: var(--theme-gradient-cool);
  color: var(--theme-ink);
}
</style>
