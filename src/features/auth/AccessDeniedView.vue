<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { copy } from '@/ui/copy'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const message = computed(() => {
  if (typeof route.query.message === 'string' && route.query.message) {
    return route.query.message
  }
  return copy.login.noGames
})

function goAllowed() {
  void router.replace(session.homePathForMembership())
}
</script>

<template>
  <div
    class="flex min-h-dvh flex-col items-center justify-center px-6 text-center"
    style="background: #f7f4ef; padding: max(2rem, env(safe-area-inset-top)) 1.5rem"
  >
    <p class="max-w-sm text-base leading-relaxed" style="color: #1f2933" role="alert">
      {{ message }}
    </p>
    <button
      type="button"
      class="mt-8 rounded-full px-6 py-3 text-sm font-semibold text-white"
      style="background: #0a5c6b"
      @click="goAllowed"
    >
      {{ copy.access.goHome }}
    </button>
  </div>
</template>
