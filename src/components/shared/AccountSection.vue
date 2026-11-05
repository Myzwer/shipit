<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { copy, formatCopy } from '@/ui/copy'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{
  /** Show Ship It! team line when the player has a team. */
  showTeam?: boolean
}>()

const session = useSessionStore()
const router = useRouter()

async function logOut() {
  await session.signOut()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="mt-4 rounded-2xl px-4 py-3" style="background: var(--theme-card)">
    <h3 class="text-sm font-semibold uppercase tracking-wide" style="color: var(--theme-muted)">
      {{ copy.home.account }}
    </h3>
    <p class="mt-1 text-sm" style="color: var(--theme-ink)">
      {{ formatCopy(copy.home.signedInAs, { playerName: session.displayName }) }}
    </p>
    <p
      v-if="props.showTeam && session.teamName"
      class="text-sm"
      style="color: var(--theme-muted)"
    >
      {{ formatCopy(copy.home.teamLine, { teamName: session.teamName }) }}
    </p>

    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        class="text-sm font-semibold underline-offset-2 hover:underline"
        style="color: var(--theme-primary)"
        @click="logOut"
      >
        {{ copy.home.logOut }}
      </button>
      <RouterLink
        v-if="session.isAdmin"
        :to="{ name: 'admin' }"
        class="text-sm font-semibold underline-offset-2 hover:underline"
        style="color: var(--theme-primary)"
      >
        {{ copy.home.admin }}
      </RouterLink>
    </div>
  </div>
</template>
