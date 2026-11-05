<script setup lang="ts">
import { useRouter } from 'vue-router'
import { copy } from '@/ui/copy'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()

async function logOut() {
  await session.signOut()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div
    class="flex min-h-dvh flex-col items-center justify-center px-6 text-center"
    style="background: #f7f4ef; padding: max(2rem, env(safe-area-inset-top)) 1.5rem"
  >
    <h1 class="font-display text-2xl font-bold" style="color: #1f2933">
      {{ copy.unavailable.title }}
    </h1>
    <p class="mt-4 max-w-sm text-base leading-relaxed" style="color: #5b6770">
      {{ copy.login.noGames }}
    </p>
    <button
      type="button"
      class="mt-8 rounded-full px-6 py-3 text-sm font-semibold text-white"
      style="background: #0a5c6b"
      @click="logOut"
    >
      {{ copy.home.logOut }}
    </button>
  </div>
</template>
