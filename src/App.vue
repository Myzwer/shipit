<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'
import { RouterView } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const ready = computed(() => session.status !== 'initializing')

function onVisibility() {
  if (document.visibilityState === 'visible' && session.isAuthenticated) {
    void session.refreshProfile()
  }
}

onMounted(() => {
  void session.init()
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div
    v-if="!ready"
    class="flex min-h-dvh items-center justify-center"
    style="background: #f7f4ef"
    aria-busy="true"
  >
    <p class="text-sm font-medium" style="color: #5b6770">Loading…</p>
  </div>
  <RouterView v-else />
</template>
