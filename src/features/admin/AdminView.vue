<script setup lang="ts">
import { useRouter } from 'vue-router'
import BountySkipSection from '@/features/admin/BountySkipSection.vue'
import GameStatusSection from '@/features/admin/GameStatusSection.vue'
import RosterSection from '@/features/admin/RosterSection.vue'
import ShipClockSection from '@/features/admin/ShipClockSection.vue'
import VoidSubmissionSection from '@/features/admin/VoidSubmissionSection.vue'
import { copy } from '@/ui/copy'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()

function backHome() {
  void router.push(session.homePathForMembership())
}
</script>

<template>
  <div
    class="flex min-h-dvh flex-col"
    style="background: #f7f4ef; padding-top: env(safe-area-inset-top)"
    data-testid="admin-view"
  >
    <header class="px-4 py-4 text-center text-white" style="background: #2f3a44">
      <h1 class="font-display text-lg font-bold tracking-wide">{{ copy.admin.title }}</h1>
    </header>
    <main class="mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-2">
      <RosterSection />
      <ShipClockSection />
      <GameStatusSection />
      <BountySkipSection />
      <VoidSubmissionSection />

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
