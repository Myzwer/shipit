<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import { copy } from '@/ui/copy'

const router = useRouter()

function launch(path: '/drinkit' | '/shipit') {
  void router.push(path)
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <section
      class="relative flex flex-1 flex-col items-center justify-center gap-6 px-6"
      style="background: #d8f3ef; padding-top: env(safe-area-inset-top)"
    >
      <AppIcon name="theme.drink-it" class="text-5xl" style="color: #334155" />
      <h1 class="font-display text-center text-4xl font-extrabold tracking-wide text-slate-800">
        {{ copy.selection.drinkHeadline }}
      </h1>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full px-8 py-3 text-base font-semibold text-white shadow-md transition"
        style="background: #0a5c6b"
        @click="launch('/drinkit')"
      >
        {{ copy.selection.launch }}
        <AppIcon name="action.next" />
      </button>
    </section>

    <section
      class="relative flex flex-1 flex-col items-center justify-center gap-6 px-6"
      style="background: #f3e4c9; padding-bottom: env(safe-area-inset-bottom)"
    >
      <AppIcon name="theme.ship-it" class="text-5xl" style="color: #334155" />
      <h1 class="font-display text-center text-4xl font-extrabold tracking-wide text-slate-800">
        {{ copy.selection.shipHeadline }}
      </h1>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full px-8 py-3 text-base font-semibold text-white shadow-md transition"
        style="background: #1d4f91"
        @click="launch('/shipit')"
      >
        {{ copy.selection.launch }}
        <AppIcon name="action.next" />
      </button>
    </section>
  </div>
</template>
