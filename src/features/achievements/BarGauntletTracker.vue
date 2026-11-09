<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import { getDrinkItCollectionChecklist } from '@/lib/achievements/api'
import type { BarGauntletSummary, CollectionChecklistItem } from '@/types/achievements'
import { copy, formatCopy } from '@/ui/copy'

const props = defineProps<{
  summary: BarGauntletSummary
}>()

const expanded = ref(false)
const loadingChecklist = ref(false)
const checklistError = ref(false)
const items = ref<CollectionChecklistItem[]>([])
const loadedBarKey = ref<string | null>(null)

const personalTarget = computed(
  () => props.summary.personal.live_target || props.summary.live_target,
)
const collectiveTarget = computed(
  () => props.summary.collective.live_target || props.summary.live_target,
)

const personalPct = computed(() => {
  const t = personalTarget.value
  if (!t) return 0
  return Math.min(100, Math.round((props.summary.personal.live_current / t) * 100))
})

const collectivePct = computed(() => {
  const t = collectiveTarget.value
  if (!t) return 0
  return Math.min(100, Math.round((props.summary.collective.live_current / t) * 100))
})

async function ensureChecklist() {
  // Reuse a previously loaded checklist for this bar (including empty menus).
  if (loadedBarKey.value === props.summary.bar_key && !checklistError.value) return
  loadingChecklist.value = true
  checklistError.value = false
  try {
    const res = await getDrinkItCollectionChecklist(props.summary.bar_key)
    items.value = res.items
    loadedBarKey.value = props.summary.bar_key
  } catch {
    checklistError.value = true
    items.value = []
    loadedBarKey.value = null
  } finally {
    loadingChecklist.value = false
  }
}

async function toggleExpanded() {
  expanded.value = !expanded.value
  if (expanded.value) await ensureChecklist()
}

watch(
  () =>
    [
      props.summary.bar_key,
      props.summary.personal.live_current,
      props.summary.collective.live_current,
      props.summary.live_target,
    ] as const,
  () => {
    items.value = []
    loadedBarKey.value = null
    checklistError.value = false
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
    <div class="px-3 py-3">
      <div class="flex gap-3">
        <div class="flex w-10 shrink-0 items-start justify-center pt-1" aria-hidden="true">
          <AppIcon
            name="status.locked"
            style-variant="solid"
            class="text-xl"
            style="color: var(--theme-ink)"
          />
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="text-[0.98rem] font-bold" style="color: var(--theme-ink)">????</h3>
          <p class="mt-0.5 text-sm leading-snug opacity-80" style="color: var(--theme-ink)">
            {{
              formatCopy(copy.achievements.gauntletObjective, {
                bar: summary.bar_name,
              })
            }}
          </p>
        </div>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-4">
        <div data-testid="gauntlet-progress-personal">
          <p class="text-[0.65rem] font-bold uppercase tracking-wide opacity-70">
            {{ copy.achievements.iveEarned }}
          </p>
          <p class="text-sm font-bold tabular-nums" style="color: var(--theme-ink)">
            {{
              formatCopy(copy.achievements.progress, {
                current: summary.personal.live_current,
                target: personalTarget,
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
                target: collectiveTarget,
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
        {{ expanded ? copy.achievements.hideChecklist : copy.achievements.showChecklist }}
      </button>
    </div>

    <div
      v-if="expanded"
      class="border-t px-3 pb-3 pt-2"
      style="border-color: rgba(7, 108, 128, 0.18)"
      data-testid="gauntlet-checklist"
    >
      <p v-if="loadingChecklist" class="text-sm opacity-70">{{ copy.achievements.loadingChecklist }}</p>
      <p v-else-if="checklistError" class="text-sm opacity-70">{{ copy.achievements.checklistFailed }}</p>
      <p v-else-if="items.length === 0" class="text-sm opacity-70">
        {{ copy.achievements.checklistEmpty }}
      </p>
      <div v-else>
        <div
          class="mb-1.5 grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem] items-center gap-2"
          aria-hidden="true"
        >
          <span />
          <span
            class="text-center text-[0.62rem] font-bold uppercase tracking-wide opacity-70"
          >
            {{ copy.achievements.me }}
          </span>
          <span
            class="text-center text-[0.62rem] font-bold uppercase tracking-wide opacity-70"
          >
            {{ copy.achievements.us }}
          </span>
        </div>
        <ul class="space-y-1.5">
          <li
            v-for="item in items"
            :key="item.offering_id"
            class="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem] items-center gap-2 text-sm"
            data-testid="gauntlet-checklist-row"
            :data-concept-key="item.concept_key"
          >
            <span class="min-w-0 truncate font-medium" style="color: var(--theme-ink)">
              {{ item.display_name }}
            </span>
            <span class="flex justify-center" :title="copy.achievements.me">
              <AppIcon
                :name="item.mine ? 'status.completed' : 'status.incomplete'"
                :style-variant="item.mine ? 'solid' : 'outline'"
                class="text-lg"
                :style="{ color: item.mine ? 'var(--theme-ink)' : 'rgba(0,0,0,0.35)' }"
              />
            </span>
            <span class="flex justify-center" :title="copy.achievements.us">
              <AppIcon
                :name="item.everyone ? 'status.completed' : 'status.incomplete'"
                :style-variant="item.everyone ? 'solid' : 'outline'"
                class="text-lg"
                :style="{ color: item.everyone ? 'var(--theme-ink)' : 'rgba(0,0,0,0.35)' }"
              />
            </span>
          </li>
        </ul>
      </div>
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
