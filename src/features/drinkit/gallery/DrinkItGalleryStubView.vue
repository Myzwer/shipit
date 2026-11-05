<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameShell from '@/components/shared/GameShell.vue'
import { fetchMyDrinkSubmission } from '@/lib/drinkLog/api'
import { copy, formatCopy } from '@/ui/copy'

const route = useRoute()
const router = useRouter()

const status = ref<'loading' | 'ready' | 'error'>('loading')
const drinkName = ref('')
const barName = ref('')
const points = ref(0)
const caption = ref<string | null>(null)
const submissionId = ref('')

onMounted(async () => {
  const id = typeof route.query.submission === 'string' ? route.query.submission : ''
  if (!id) {
    status.value = 'error'
    return
  }
  try {
    const data = await fetchMyDrinkSubmission(id)
    if (!data || data.ok !== true) {
      status.value = 'error'
      return
    }
    submissionId.value = String(data.submission_id ?? id)
    const display = (data.display ?? {}) as Record<string, unknown>
    drinkName.value = String(display.drink_name ?? 'Drink')
    barName.value = String(display.bar_name ?? '')
    caption.value = typeof data.caption === 'string' ? data.caption : null
    const result = (data.result ?? {}) as Record<string, unknown>
    points.value = Number(result.awarded_points ?? 0) || 0
    status.value = 'ready'
  } catch {
    status.value = 'error'
  }
})
</script>

<template>
  <GameShell game="drinkit" :title="copy.wizard.galleryTitle" :show-switch="false">
    <section class="px-4 py-6" data-testid="gallery-stub">
      <p v-if="status === 'loading'" class="text-sm" style="color: var(--theme-muted)">Loading…</p>
      <p v-else-if="status === 'error'" class="text-sm" style="color: var(--theme-ink)">
        {{ copy.bounty.unavailableDetail }}
      </p>
      <article
        v-else
        class="rounded-3xl px-4 py-5"
        style="background: var(--theme-card); color: var(--theme-ink)"
        data-testid="gallery-submission-card"
        :data-submission-id="submissionId"
      >
        <div
          class="flex aspect-square w-full items-center justify-center rounded-2xl text-center text-sm font-semibold uppercase tracking-wide text-white"
          style="background: var(--theme-header)"
        >
          {{ copy.wizard.noPhoto }}
        </div>
        <h2 class="font-display mt-4 text-xl font-bold">{{ copy.wizard.galleryStubHeading }}</h2>
        <p class="mt-2 font-semibold" data-testid="gallery-drink">{{ drinkName }}</p>
        <p class="text-sm" style="color: var(--theme-muted)" data-testid="gallery-bar">{{ barName }}</p>
        <p class="mt-2 text-sm" data-testid="gallery-caption">
          {{ caption?.trim() || copy.wizard.noCaption }}
        </p>
        <p class="mt-3 font-display text-lg font-bold" data-testid="gallery-points">
          <template v-if="points > 0">
            {{ formatCopy(copy.wizard.galleryStubPoints, { points }) }}
          </template>
          <template v-else>{{ copy.wizard.galleryStubOrdinary }}</template>
        </p>
      </article>

      <button
        type="button"
        class="mt-6 w-full rounded-full py-3 text-sm font-semibold text-white"
        style="background: var(--theme-primary)"
        data-testid="gallery-back-home"
        @click="router.push('/drinkit')"
      >
        {{ copy.wizard.galleryBackHome }}
      </button>
    </section>
  </GameShell>
</template>
