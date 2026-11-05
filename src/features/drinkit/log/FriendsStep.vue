<script setup lang="ts">
import { copy } from '@/ui/copy'
import type { DrinkitCompanionRow } from '@/types/drinkLog'

defineProps<{
  companions: DrinkitCompanionRow[]
  selectedIds: string[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  showBarReminder: boolean
}>()

const emit = defineEmits<{
  toggle: [playerId: string]
  continue: []
}>()
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

    <p v-if="status === 'loading'" class="mt-6 text-sm" style="color: var(--theme-muted)">Loading…</p>

    <p
      v-else-if="status === 'ready' && !companions.length"
      class="mt-6 text-sm"
      style="color: var(--theme-muted)"
      data-testid="friends-empty"
    >
      {{ copy.wizard.friendsEmpty }}
    </p>

    <ul v-else class="mt-4 space-y-2" data-testid="friends-list">
      <li v-for="c in companions" :key="c.player_id">
        <button
          type="button"
          class="flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left"
          :style="
            selectedIds.includes(c.player_id)
              ? { background: 'var(--theme-primary)', color: '#fff' }
              : { background: 'var(--theme-card)', color: 'var(--theme-ink)' }
          "
          :data-testid="`friend-row-${c.player_id}`"
          :aria-pressed="selectedIds.includes(c.player_id)"
          @click="emit('toggle', c.player_id)"
        >
          <span class="font-semibold">{{ c.display_name }}</span>
          <span v-if="selectedIds.includes(c.player_id)" aria-hidden="true">✓</span>
        </button>
      </li>
    </ul>

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
