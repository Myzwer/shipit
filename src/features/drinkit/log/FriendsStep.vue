<script setup lang="ts">
import { computed } from 'vue'
import { copy } from '@/ui/copy'
import type { DrinkitCompanionRow } from '@/types/drinkLog'

const props = defineProps<{
  companions: DrinkitCompanionRow[]
  selectedIds: string[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  showBarReminder: boolean
  crewMateIds: string[]
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
</script>

<template>
  <section data-testid="wizard-friends-step" class="px-4 pb-28">
    <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)">
      {{ copy.wizard.friendsPrompt }}
    </h2>
    <p class="mt-2 text-sm" style="color: var(--theme-muted)">{{ copy.wizard.friendsHelper }}</p>

    <p
      v-if="showBarReminder"
      class="mt-4 rounded-2xl px-4 py-3 text-sm"
      style="background: var(--theme-card); color: var(--theme-ink)"
      data-testid="bar-bounty-reminder"
      role="note"
    >
      {{ copy.wizard.barReminder }}
    </p>

    <div
      v-if="barPreviewKind !== 'hidden' && barPreviewLabel"
      class="mt-4 rounded-2xl px-4 py-3 text-sm"
      style="background: var(--theme-card); color: var(--theme-ink)"
      data-testid="bar-bounty-points-preview"
      :data-preview-kind="barPreviewKind"
      :data-provisional="barPreviewProvisional ? 'true' : 'false'"
      role="status"
      aria-live="polite"
    >
      <p class="font-semibold">{{ barPreviewLabel }}</p>
      <p
        v-if="barPreviewProvisional && barPreviewKind === 'eligible'"
        class="mt-1 text-xs"
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
        <p
          class="text-[0.7rem] font-bold uppercase tracking-wide"
          style="color: var(--theme-muted)"
        >
          {{ copy.wizard.friendsCrewSection }}
        </p>
        <ul class="mt-2 space-y-2">
          <li v-for="c in crewCompanions" :key="c.player_id">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left"
              :style="
                selectedIds.includes(c.player_id)
                  ? { background: 'var(--theme-primary)', color: '#fff' }
                  : { background: 'var(--theme-card)', color: 'var(--theme-ink)' }
              "
              :data-testid="`friend-row-${c.player_id}`"
              data-crew-mate="true"
              :aria-pressed="selectedIds.includes(c.player_id)"
              @click="emit('toggle', c.player_id)"
            >
              <span class="flex min-w-0 items-center gap-2 font-semibold">
                <span class="truncate">{{ c.display_name }}</span>
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase"
                  :style="
                    selectedIds.includes(c.player_id)
                      ? { background: 'rgba(255,255,255,0.22)' }
                      : { background: 'rgba(7,108,128,0.12)', color: 'var(--theme-primary)' }
                  "
                >
                  {{ copy.wizard.friendsCrewBadge }}
                </span>
              </span>
              <span v-if="selectedIds.includes(c.player_id)" aria-hidden="true">✓</span>
            </button>
          </li>
        </ul>
      </div>

      <div v-if="otherCompanions.length" class="mt-4" data-testid="friends-others-group">
        <p
          v-if="crewCompanions.length"
          class="text-[0.7rem] font-bold uppercase tracking-wide"
          style="color: var(--theme-muted)"
        >
          {{ copy.wizard.friendsOthersSection }}
        </p>
        <ul class="mt-2 space-y-2" data-testid="friends-list">
          <li v-for="c in otherCompanions" :key="c.player_id">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left"
              :style="
                selectedIds.includes(c.player_id)
                  ? { background: 'var(--theme-primary)', color: '#fff' }
                  : { background: 'var(--theme-card)', color: 'var(--theme-ink)' }
              "
              :data-testid="`friend-row-${c.player_id}`"
              data-crew-mate="false"
              :aria-pressed="selectedIds.includes(c.player_id)"
              @click="emit('toggle', c.player_id)"
            >
              <span class="font-semibold">{{ c.display_name }}</span>
              <span v-if="selectedIds.includes(c.player_id)" aria-hidden="true">✓</span>
            </button>
          </li>
        </ul>
      </div>
    </template>

    <!-- Exactly one companion selector — no second Bar-eligible list. -->
    <p
      class="mt-4 text-sm"
      style="color: var(--theme-muted)"
      data-testid="friends-solo-note"
    >
      {{ copy.wizard.friendsSoloNote }}
    </p>

    <button
      type="button"
      class="mt-6 w-full rounded-full py-3 text-sm font-semibold text-white"
      style="background: var(--theme-primary)"
      data-testid="friends-continue"
      @click="emit('continue')"
    >
      {{ copy.wizard.continue }}
    </button>
  </section>
</template>
