<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import GameShell from '@/components/shared/GameShell.vue'
import AchievementCategoryFilter from '@/features/achievements/AchievementCategoryFilter.vue'
import { fetchShipItChallenges, SHIPIT_CATEGORY_OPTIONS } from '@/lib/shipit/api'
import { resolveShipItChallengeIcon } from '@/lib/shipit/challengeIcons'
import { copy, formatCopy } from '@/ui/copy'
import type { SemanticIconKey } from '@/ui/icons'
import type {
  ShipItChallengeSection,
  ShipItChallengesPayload,
  ShipItFilter,
} from '@/types/shipit'

function challengeCardIcon(canonicalKey: string, completed: boolean): SemanticIconKey {
  if (completed) return 'status.completed'
  return resolveShipItChallengeIcon(canonicalKey).icon_key
}

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

const filterOptions = SHIPIT_CATEGORY_OPTIONS.map((opt) => ({
  key: opt.value,
  label: opt.label,
}))

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

function onChallengeActivate(
  completed: boolean,
  submissionReady: boolean,
  challengeId: string,
) {
  if (completed) return
  if (!submissionReady) {
    noticeOpen.value = true
    return
  }
  void router.push({ name: 'shipit-submit', params: { challengeId } })
}

watch(filter, () => {
  void load()
})

onMounted(() => {
  void load()
})
</script>

<template>
  <GameShell
    game="shipit"
    tone="home"
    :show-ship-time="false"
    :title="copy.shipit.challengesHeading"
  >
    <div class="challenge-list px-4 pt-4" data-testid="shipit-challenge-list">
      <AchievementCategoryFilter
        :model-value="filter"
        :options="filterOptions"
        :label="copy.shipit.filterBy"
        test-id="shipit-challenge-filter"
        @update:model-value="onFilterChange"
      />

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
      style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
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

    <div v-else class="space-y-6 px-4 pb-8 pt-4">
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
        <div class="challenge-section-heading mb-2 flex items-start justify-between gap-3">
          <h2
            class="challenge-section-title min-w-0 flex-1 font-display text-[1.05rem] font-bold leading-snug"
            style="color: var(--theme-ink)"
          >
            {{
              formatCopy(copy.shipit.categoryProgress, {
                categoryName: section.label,
                completedCount: section.completed,
              })
            }}
          </h2>
          <span
            class="challenge-section-points shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white"
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

        <ul class="space-y-2.5">
          <li v-for="challenge in section.challenges" :key="challenge.id">
            <button
              type="button"
              class="challenge-card flex w-full items-center gap-3 px-3 py-2.5 text-left transition"
              :class="
                challenge.completed
                  ? 'challenge-card--completed cursor-default'
                  : 'challenge-card--available hover:brightness-[0.98]'
              "
              :data-testid="`shipit-challenge-${challenge.canonical_key}`"
              :data-completed="challenge.completed ? 'true' : 'false'"
              :data-actionable="challenge.completed ? 'false' : 'true'"
              :aria-disabled="challenge.completed ? 'true' : undefined"
              @click="
                onChallengeActivate(challenge.completed, challenge.submission_ready, challenge.id)
              "
            >
              <span
                class="challenge-card__icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                :class="
                  challenge.completed
                    ? 'challenge-card__icon--completed'
                    : 'challenge-card__icon--available'
                "
                :data-challenge-icon="
                  challengeCardIcon(challenge.canonical_key, challenge.completed)
                "
                aria-hidden="true"
              >
                <AppIcon
                  :name="challengeCardIcon(challenge.canonical_key, challenge.completed)"
                  style-variant="solid"
                  class="text-[0.85rem]"
                />
              </span>
              <span class="challenge-card__body min-w-0 flex-1">
                <span
                  class="challenge-card__title block text-[0.98rem] font-bold leading-snug"
                  :class="challenge.completed ? 'challenge-card__title--completed' : ''"
                >
                  {{ challenge.title }}
                </span>
                <span
                  class="challenge-card__desc mt-0.5 block text-[0.82rem] leading-snug"
                  :class="challenge.completed ? 'challenge-card__desc--completed' : ''"
                >
                  {{ challenge.instructions }}
                </span>
              </span>
              <AppIcon
                v-if="!challenge.completed"
                name="action.open-row"
                class="challenge-card__arrow shrink-0 text-sm opacity-50"
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
        style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
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

<style scoped>
.challenge-card {
  min-height: 2.85rem;
  border-radius: var(--theme-card-radius, 1.15rem);
  box-shadow: var(--theme-card-shadow, var(--shadow-card));
  color: var(--theme-ink);
}

.challenge-card--available {
  background: var(--theme-gradient-cool);
}

.challenge-card--completed {
  /* Muted/desaturated completed treatment from Challenges mockup */
  background: #e6e2d8;
  color: #6b7280;
}

.challenge-card__icon--available {
  background: color-mix(in srgb, var(--theme-primary) 16%, transparent);
  color: var(--theme-primary);
}

.challenge-card__icon--completed {
  background: color-mix(in srgb, var(--theme-header) 22%, transparent);
  color: var(--theme-header);
}

.challenge-card__title {
  color: var(--theme-ink);
}

.challenge-card__title--completed,
.challenge-card__desc--completed {
  color: #7a828a;
}

.challenge-card__desc {
  color: var(--theme-muted);
}

.challenge-card:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: 2px;
}

.challenge-card--completed:focus-visible {
  outline-color: color-mix(in srgb, var(--theme-header) 55%, transparent);
}
</style>
