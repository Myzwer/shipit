<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameShell from '@/components/shared/GameShell.vue'
import { fetchShipItPhotoSignedUrl, fetchShipItSubmission } from '@/lib/shipit/submit'
import { copy, formatCopy } from '@/ui/copy'

const route = useRoute()
const router = useRouter()

const status = ref<'loading' | 'ready' | 'error'>('loading')
const title = ref('')
const teamName = ref('')
const points = ref(0)
const caption = ref<string | null>(null)
const submissionId = ref('')
const photoUrl = ref<string | null>(null)

onMounted(async () => {
  const id = typeof route.query.submission === 'string' ? route.query.submission : ''
  if (!id) {
    status.value = 'error'
    return
  }
  try {
    const data = await fetchShipItSubmission(id)
    if (!data || data.ok !== true) {
      status.value = 'error'
      return
    }
    submissionId.value = String(data.submission_id ?? id)
    const display = (data.display ?? {}) as Record<string, unknown>
    title.value = String(display.title ?? 'Challenge')
    teamName.value = String(display.team_name ?? '')
    caption.value = typeof data.caption === 'string' ? data.caption : null
    const result = (data.result ?? {}) as Record<string, unknown>
    points.value = Number(result.awarded_points ?? display.points ?? 0) || 0
    const photoId = typeof data.photo_id === 'string' ? data.photo_id : null
    if (photoId) {
      photoUrl.value = await fetchShipItPhotoSignedUrl(photoId)
    }
    status.value = 'ready'
  } catch {
    status.value = 'error'
  }
})
</script>

<template>
  <GameShell game="shipit" :title="copy.nav.gallery" :show-switch="false">
    <section class="px-4 py-6" data-testid="shipit-gallery-stub">
      <p v-if="status === 'loading'" class="text-sm" style="color: var(--theme-muted)">Loading…</p>
      <p v-else-if="status === 'error'" class="text-sm" style="color: var(--theme-ink)">
        {{ copy.bounty.unavailableDetail }}
      </p>
      <article
        v-else
        class="rounded-3xl px-4 py-5"
        style="background: var(--theme-card); color: var(--theme-ink)"
        data-testid="shipit-gallery-card"
        :data-submission-id="submissionId"
      >
        <img
          v-if="photoUrl"
          :src="photoUrl"
          alt=""
          class="aspect-square w-full rounded-2xl object-cover"
          data-testid="shipit-gallery-photo"
        />
        <div
          v-else
          class="flex aspect-square w-full items-center justify-center rounded-2xl text-center text-sm font-semibold uppercase tracking-wide text-white"
          style="background: var(--theme-header)"
        >
          {{ copy.wizard.noPhoto }}
        </div>
        <h2 class="font-display mt-4 text-xl font-bold" data-testid="shipit-gallery-title">
          {{ title }}
        </h2>
        <p class="mt-1 text-sm" style="color: var(--theme-muted)" data-testid="shipit-gallery-team">
          {{ teamName }}
        </p>
        <p class="mt-2 text-sm" data-testid="shipit-gallery-caption">
          {{ caption?.trim() || copy.wizard.noCaption }}
        </p>
        <p class="mt-3 font-display text-lg font-bold" data-testid="shipit-gallery-points">
          {{ formatCopy(copy.wizard.galleryStubPoints, { points }) }}
        </p>
      </article>

      <button
        type="button"
        class="mt-6 w-full rounded-full py-3 text-sm font-semibold text-white"
        style="background: var(--theme-primary)"
        data-testid="shipit-gallery-home"
        @click="router.push({ name: 'shipit-home' })"
      >
        {{ copy.wizard.galleryBackHome }}
      </button>
    </section>
  </GameShell>
</template>
