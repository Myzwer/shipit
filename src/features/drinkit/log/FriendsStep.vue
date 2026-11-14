<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import { copy } from '@/ui/copy'
import type { DrinkitCompanionRow } from '@/types/drinkLog'

const props = defineProps<{
  companions: DrinkitCompanionRow[]
  selectedIds: string[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  showBarReminder: boolean
  /** Assigned crewmate player ids for today's Bar Bounty (excludes self). */
  crewMateIds: string[]
  /** Exact / provisional points banner. */
  barPreviewLabel: string | null
  barPreviewKind: 'eligible' | 'need_crewmate' | 'claimed' | 'unavailable' | 'checking' | 'hidden'
  barPreviewProvisional: boolean
}>()

const emit = defineEmits<{
  toggle: [playerId: string]
  continue: []
}>()

const crewIdSet = computed(() => new Set(props.crewMateIds))

const crewCompanions = computed(() =>
  props.companions.filter((c) => crewIdSet.value.has(c.player_id)),
)

const otherCompanions = computed(() =>
  props.companions.filter((c) => !crewIdSet.value.has(c.player_id)),
)

const bannerClass = computed(() => {
  if (props.barPreviewKind === 'eligible') return 'is-eligible'
  if (props.barPreviewKind === 'claimed') return 'is-claimed'
  if (props.barPreviewKind === 'need_crewmate') return 'is-need'
  return 'is-muted'
})
</script>

<template>
  <section data-testid="wizard-friends-step" class="px-4 pb-32 pt-3">
    <h2 class="wizard-prompt">
      {{ copy.wizard.friendsPrompt }}
    </h2>
    <p class="mt-1.5 text-sm" style="color: var(--theme-muted)">{{ copy.wizard.friendsHelper }}</p>

    <p
      v-if="showBarReminder"
      class="mt-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm"
      style="color: var(--theme-ink)"
      data-testid="bar-bounty-reminder"
      role="note"
    >
      {{ copy.wizard.barReminder }}
    </p>

    <div
      v-if="barPreviewKind !== 'hidden' && barPreviewLabel"
      class="friends-bar-preview mt-3 rounded-2xl px-4 py-3 text-sm shadow-sm"
      :class="bannerClass"
      data-testid="bar-bounty-points-preview"
      :data-preview-kind="barPreviewKind"
      :data-provisional="barPreviewProvisional ? 'true' : 'false'"
      role="status"
      aria-live="polite"
    >
      <p class="font-semibold">{{ barPreviewLabel }}</p>
      <p
        v-if="barPreviewProvisional && barPreviewKind === 'eligible'"
        class="mt-0.5 text-xs"
        style="color: var(--theme-muted)"
      >
        {{ copy.wizard.barPreviewProvisionalNote }}
      </p>
    </div>

    <p v-if="status === 'loading'" class="mt-6 text-sm" style="color: var(--theme-muted)">Loading…</p>

    <p
      v-else-if="status === 'ready' && !companions.length"
      class="mt-6 text-sm"
      style="color: var(--theme-muted)"
      data-testid="friends-empty"
    >
      {{ copy.wizard.friendsEmpty }}
    </p>

    <template v-else-if="status === 'ready'">
      <div v-if="crewCompanions.length" class="mt-4" data-testid="friends-crew-group">
        <p class="friends-group-label">{{ copy.wizard.friendsCrewSection }}</p>
        <ul class="mt-2 space-y-2.5">
          <li v-for="c in crewCompanions" :key="c.player_id">
            <button
              type="button"
              class="wizard-choice"
              :class="selectedIds.includes(c.player_id) ? 'is-selected' : ''"
              :data-testid="`friend-row-${c.player_id}`"
              data-crew-mate="true"
              :aria-pressed="selectedIds.includes(c.player_id)"
              @click="emit('toggle', c.player_id)"
            >
              <AppIcon name="score.friends" class="wizard-choice-icon text-sm" />
              <span class="wizard-choice-title flex min-w-0 flex-1 items-center gap-2">
                <span class="truncate">{{ c.display_name }}</span>
                <span class="friends-crew-badge shrink-0">{{ copy.wizard.friendsCrewBadge }}</span>
              </span>
              <AppIcon
                v-if="selectedIds.includes(c.player_id)"
                name="status.selected"
                style-variant="solid"
                class="text-lg"
                style="color: var(--theme-primary)"
              />
            </button>
          </li>
        </ul>
      </div>

      <div v-if="otherCompanions.length" class="mt-4" data-testid="friends-others-group">
        <p v-if="crewCompanions.length" class="friends-group-label">
          {{ copy.wizard.friendsOthersSection }}
        </p>
        <ul class="mt-2 space-y-2.5" data-testid="friends-list">
          <li v-for="c in otherCompanions" :key="c.player_id">
            <button
              type="button"
              class="wizard-choice"
              :class="selectedIds.includes(c.player_id) ? 'is-selected' : ''"
              :data-testid="`friend-row-${c.player_id}`"
              data-crew-mate="false"
              :aria-pressed="selectedIds.includes(c.player_id)"
              @click="emit('toggle', c.player_id)"
            >
              <AppIcon name="score.friends" class="wizard-choice-icon text-sm" />
              <span class="wizard-choice-title">{{ c.display_name }}</span>
              <AppIcon
                v-if="selectedIds.includes(c.player_id)"
                name="status.selected"
                style-variant="solid"
                class="text-lg"
                style="color: var(--theme-primary)"
              />
            </button>
          </li>
        </ul>
      </div>
    </template>

    <p class="mt-3 text-sm" style="color: var(--theme-muted)" data-testid="friends-solo-note">
      {{ copy.wizard.friendsSoloNote }}
    </p>

    <button
      type="button"
      class="ui-primary-btn mt-5 w-full"
      data-testid="friends-continue"
      @click="emit('continue')"
    >
      {{ copy.wizard.continue }}
    </button>
  </section>
</template>

<style scoped>
.friends-group-label {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--theme-muted);
}

.friends-crew-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.12rem 0.45rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--theme-primary) 14%, white);
  color: var(--theme-primary);
}

.friends-bar-preview {
  color: var(--theme-ink);
  background: white;
}

.friends-bar-preview.is-eligible {
  background: color-mix(in srgb, var(--theme-primary) 10%, white);
}

.friends-bar-preview.is-claimed {
  background: color-mix(in srgb, var(--theme-accent) 18%, white);
}

.friends-bar-preview.is-need,
.friends-bar-preview.is-muted {
  background: white;
}
</style>
