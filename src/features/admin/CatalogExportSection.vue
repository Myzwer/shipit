<script setup lang="ts">
import { ref } from 'vue'
import { downloadExportJson, exportCurrentGameData } from '@/lib/adminAddDrink'
import { copy } from '@/ui/copy'

const busy = ref(false)
const feedback = ref<{ kind: 'success' | 'error'; title: string; body: string } | null>(null)

async function runExport() {
  if (busy.value) return
  busy.value = true
  feedback.value = null
  try {
    const payload = await exportCurrentGameData()
    const filename = downloadExportJson(payload)
    feedback.value = { kind: 'success', title: copy.admin.exportSuccess, body: filename }
  } catch (err) {
    feedback.value = {
      kind: 'error',
      title: copy.admin.exportFailureTitle,
      body: err instanceof Error && err.message ? err.message : copy.admin.exportFailureBody,
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mt-6 rounded-2xl p-4" style="background: #fff" data-testid="catalog-export-section">
    <h2 class="font-display text-base font-bold tracking-wide" style="color: #2f3a44">
      {{ copy.admin.exportSection }}
    </h2>
    <p class="mt-2 text-sm" style="color: #5a6570" data-testid="export-note">
      {{ copy.admin.exportNote }}
    </p>

    <div
      v-if="feedback"
      class="mt-4 rounded-2xl px-4 py-3 text-sm"
      :style="
        feedback.kind === 'success'
          ? { background: '#e7f6ef', color: '#1f4d3a' }
          : { background: '#fdeceb', color: '#6b1f1f' }
      "
      :data-kind="feedback.kind"
      data-testid="export-feedback"
    >
      <p class="font-semibold">{{ feedback.title }}</p>
      <p v-if="feedback.body" class="mt-1 break-all">{{ feedback.body }}</p>
    </div>

    <button
      type="button"
      class="mt-4 min-h-12 w-full rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
      style="background: #0a5c6b"
      data-testid="export-run"
      :disabled="busy"
      @click="runExport"
    >
      {{ busy ? copy.admin.exportingAction : copy.admin.exportAction }}
    </button>
  </section>
</template>
