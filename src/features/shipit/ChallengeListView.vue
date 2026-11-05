<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import GameShell from '@/components/shared/GameShell.vue'
import { fetchShipItChallenges, SHIPIT_CATEGORY_OPTIONS } from '@/lib/shipit/api'
import { copy, formatCopy } from '@/ui/copy'
import type {
  ShipItChallengeSection,
  ShipItChallengesPayload,
  ShipItFilter,
} from '@/types/shipit'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref<string | null>(null)
const payload = ref<ShipItChallengesPayload | null>(null)
const noticeOpen = ref(false)

const filter = computed<ShipItFilter>(() => {
  const raw = typeof route.query.category === 'string' ? route.query.category : 'all'
  const match = SHIPIT_CATEGORY_OPTIONS.find((o) => o.value === raw)
  return (match?.value ?? 'all') as ShipItFilter
})

const sections = computed<ShipItChallengeSection[]>(() => payload.value?.sections ?? [])
const lifecycleStatus = computed(() => payload.value?.lifecycle.status ?? 'unconfigured')
const readOnly = computed(() => Boolean(payload.value?.lifecycle.read_only))

async function load() {
  loading.value = true
  error.value = null
  try {
    payload.value = await fetchShipItChallenges(filter.value)
    if (payload.value && payload.value.ok === false) {
      error.value = payload.value.message ?? copy.home.shipUnavailableDetail
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : copy.home.shipUnavailableDetail
    payload.value = null
  } finally {
    loading.value = false
  }
}

function onFilterChange(value: string) {
  const next = (SHIPIT_CATEGORY_OPTIONS.find((o) => o.value === value)?.value ??
    'all') as ShipItFilter
  void router.replace({
    name: 'shipit-challenges',
    query: next === 'all' ? undefined : { category: next },
  })
}

function onChallengeActivate(completed: boolean, submissionReady: boolean) {
  if (completed) return
  // Preserve final interaction contract: unfinished cards are actionable, but
  // Phase 4A cannot complete without the shared photo pipeline.
  if (!submissionReady) {
    noticeOpen.value = true
  }
}

watch(filter, () => {
  void load()
})

onMounted(() => {
  void load()
})
</script>

<template>
  <GameShell game="shipit" :title="copy.shipit.challengesHeading">
    <div class="px-4 pt-4" data-testid="shipit-challenge-list">
      <label class="flex items-center gap-2 text-sm" style="color: var(--theme-ink)">
        <span class="font-medium">{{ copy.shipit.filterBy }}</span>
        <select
          class="min-w-[10rem] flex-1 rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm"
          style="color: var(--theme-ink)"
          data-testid="shipit-challenge-filter"
          :value="filter"
          @change="onFilterChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in SHIPIT_CATEGORY_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>

      <p
        v-if="readOnly"
        class="mt-3 text-center text-sm font-medium"
        style="color: var(--theme-ink)"
        data-testid="shipit-challenges-lifecycle"
        :data-lifecycle="lifecycleStatus"
      >
        {{
          lifecycleStatus === 'finale' || lifecycleStatus === 'post_cruise'
            ? copy.home.shipFinale
            : lifecycleStatus === 'pre_cruise'
              ? copy.home.shipPreCruise
              : copy.home.shipUnconfigured
        }}
      </p>
    </div>

    <p
      v-if="loading"
      class="px-4 pt-6 text-center text-sm"
      style="color: var(--theme-muted)"
      data-testid="shipit-challenges-loading"
    >
      {{ copy.shipit.loading }}
    </p>

    <div
      v-else-if="error"
      class="mx-4 mt-4 rounded-2xl px-4 py-3 text-center text-sm"
      style="background: var(--theme-card); color: var(--theme-ink)"
      data-testid="shipit-challenges-error"
    >
      <p class="font-semibold">{{ copy.home.shipUnavailableTitle }}</p>
      <p class="mt-1" style="color: var(--theme-muted)">{{ error }}</p>
      <button
        type="button"
        class="mt-3 inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white"
        style="background: var(--theme-primary)"
        @click="load"
      >
        {{ copy.home.retryLoad }}
      </button>
    </div>

    <div v-else class="space-y-8 px-4 py-5 pb-8">
      <p
        v-if="!sections.length"
        class="text-center text-sm"
        style="color: var(--theme-muted)"
        data-testid="shipit-challenges-empty"
      >
        {{ copy.shipit.emptyCategory }}
      </p>

      <section
        v-for="section in sections"
        :key="section.category"
        :data-testid="`shipit-section-${section.category}`"
      >
        <div class="mb-3 flex items-start justify-between gap-3">
          <h2 class="font-display text-base font-bold leading-snug" style="color: var(--theme-ink)">
            {{
              formatCopy(copy.shipit.categoryProgress, {
                categoryName: section.label,
                completedCount: section.completed,
              })
            }}
          </h2>
          <span
            class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white"
            style="background: var(--theme-header)"
            data-testid="shipit-category-points"
          >
            {{
              formatCopy(copy.shipit.categoryPoints, {
                points: section.points_per_challenge,
              })
            }}
          </span>
        </div>

        <ul class="space-y-3">
          <li v-for="challenge in section.challenges" :key="challenge.id">
            <button
              type="button"
              class="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left shadow-sm transition"
              :class="
                challenge.completed
                  ? 'cursor-default opacity-55'
                  : 'hover:brightness-[0.98]'
              "
              :style="{
                background: challenge.completed
                  ? 'color-mix(in srgb, var(--theme-card) 70%, #9aa3a0)'
                  : 'var(--theme-card)',
                color: 'var(--theme-ink)',
              }"
              :data-testid="`shipit-challenge-${challenge.canonical_key}`"
              :data-completed="challenge.completed ? 'true' : 'false'"
              :data-actionable="challenge.completed ? 'false' : 'true'"
              :aria-disabled="challenge.completed ? 'true' : undefined"
              @click="onChallengeActivate(challenge.completed, challenge.submission_ready)"
            >
              <span
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                :style="{
                  background: challenge.completed
                    ? 'color-mix(in srgb, var(--theme-primary) 35%, transparent)'
                    : 'color-mix(in srgb, var(--theme-primary) 18%, transparent)',
                  color: 'var(--theme-primary)',
                }"
                aria-hidden="true"
              >
                <AppIcon
                  :name="challenge.completed ? 'status.completed' : 'theme.ship-it'"
                  style-variant="solid"
                  class="text-sm"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block font-semibold leading-snug">{{ challenge.title }}</span>
                <span
                  class="mt-1 block text-sm leading-snug"
                  style="color: var(--theme-muted)"
                >
                  {{ challenge.instructions }}
                </span>
                <span
                  v-if="challenge.completed"
                  class="mt-2 inline-block text-xs font-semibold uppercase tracking-wide"
                  style="color: var(--theme-muted)"
                >
                  {{ copy.shipit.completed }}
                </span>
              </span>
              <AppIcon
                v-if="!challenge.completed"
                name="nav.action"
                class="mt-1 shrink-0 text-sm opacity-50"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
      </section>
    </div>

    <div
      v-if="noticeOpen"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 pb-8 sm:items-center"
      data-testid="shipit-submission-unavailable"
      role="dialog"
      aria-modal="true"
      :aria-label="copy.shipit.submissionSoonTitle"
      @click.self="noticeOpen = false"
    >
      <div
        class="w-full max-w-sm rounded-2xl px-5 py-5 shadow-xl"
        style="background: var(--theme-card); color: var(--theme-ink)"
      >
        <h3 class="font-display text-lg font-bold">{{ copy.shipit.submissionSoonTitle }}</h3>
        <p class="mt-2 text-sm leading-relaxed" style="color: var(--theme-muted)">
          {{ copy.shipit.submissionSoonBody }}
        </p>
        <button
          type="button"
          class="mt-4 w-full rounded-full px-4 py-3 text-sm font-semibold text-white"
          style="background: var(--theme-primary)"
          data-testid="shipit-submission-unavailable-dismiss"
          @click="noticeOpen = false"
        >
          {{ copy.shipit.backToChallenges }}
        </button>
      </div>
    </div>
  </GameShell>
</template>
