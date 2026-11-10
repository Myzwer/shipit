<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  adminListDailyChallenges,
  adminSetDailyChallengeAnnouncement,
  newDailyAnnounceRequestId,
} from '@/lib/admin/dailyChallengeAnnouncements'
import {
  clearPendingDailyAnnouncement,
  readPendingDailyAnnouncement,
  writePendingDailyAnnouncement,
  type PendingDailyAnnouncement,
} from '@/lib/pendingDailyAnnouncement'
import { copy, formatCopy } from '@/ui/copy'
import type { AdminDailyChallengeRow } from '@/types/dailyChallengeAdmin'

const MAX_LEN = 280

const challenges = ref<AdminDailyChallengeRow[]>([])
const cruiseConfigId = ref<string | null>(null)
const loadStatus = ref<'loading' | 'ready' | 'error'>('loading')
const errorBody = ref('')
const drafts = reactive<Record<number, string>>({})
const busyDay = ref<number | null>(null)
const pending = ref<PendingDailyAnnouncement | null>(null)
const feedback = ref<{
  kind: 'success' | 'error' | 'unknown'
  title: string
  body: string
  dayNumber?: number
} | null>(null)

const locked = computed(() => busyDay.value != null || Boolean(pending.value))

function modeLabel(row: AdminDailyChallengeRow): string {
  return row.participation_mode === 'all_hands'
    ? copy.admin.dailyAnnounceModeAllHands
    : copy.admin.dailyAnnounceModeBringFriend
}

function draftFor(day: number): string {
  return drafts[day] ?? ''
}

function setDraft(day: number, value: string) {
  drafts[day] = value.slice(0, MAX_LEN)
}

function charCount(day: number): string {
  return formatCopy(copy.admin.dailyAnnounceChars, { count: draftFor(day).length })
}

function savedAnnouncement(row: AdminDailyChallengeRow): string {
  return row.admin_announcement?.trim() ?? ''
}

function isDirty(row: AdminDailyChallengeRow): boolean {
  const next = draftFor(row.day_number).trim()
  const prev = savedAnnouncement(row)
  return next !== prev
}

function syncDrafts(rows: AdminDailyChallengeRow[]) {
  for (const row of rows) {
    drafts[row.day_number] = row.admin_announcement ?? ''
  }
}

async function load() {
  loadStatus.value = 'loading'
  errorBody.value = ''
  try {
    const result = await adminListDailyChallenges()
    if (!result.ok || !result.challenges) {
      loadStatus.value = 'error'
      errorBody.value = result.code || copy.admin.dailyAnnounceLoadError
      return
    }
    challenges.value = [...result.challenges].sort((a, b) => a.day_number - b.day_number)
    cruiseConfigId.value = result.cruise_config_id ?? null
    syncDrafts(challenges.value)
    loadStatus.value = 'ready'
  } catch (err) {
    loadStatus.value = challenges.value.length ? 'ready' : 'error'
    errorBody.value = err instanceof Error ? err.message : copy.admin.dailyAnnounceLoadError
  }
}

function persistPending(next: PendingDailyAnnouncement) {
  pending.value = next
  writePendingDailyAnnouncement(next)
}

function clearPendingResolved() {
  pending.value = null
  clearPendingDailyAnnouncement()
}

async function applyAnnouncement(dayNumber: number, announcement: string | null, requestId: string) {
  busyDay.value = dayNumber
  feedback.value = null
  persistPending({
    clientRequestId: requestId,
    dayNumber,
    announcement,
    cruiseConfigId: cruiseConfigId.value,
  })
  try {
    const result = await adminSetDailyChallengeAnnouncement({
      dayNumber,
      announcement,
      clientRequestId: requestId,
    })
    if (!result.ok) {
      clearPendingResolved()
      feedback.value = {
        kind: 'error',
        title: copy.admin.dailyAnnounceFailureTitle,
        body:
          result.code === 'ANNOUNCEMENT_TOO_LONG'
            ? copy.admin.dailyAnnounceTooLong
            : result.message || result.code || copy.admin.dailyAnnounceFailureBody,
        dayNumber,
      }
      return
    }
    clearPendingResolved()
    const row = challenges.value.find((c) => c.day_number === dayNumber)
    if (row) {
      row.admin_announcement = result.admin_announcement ?? null
      drafts[dayNumber] = result.admin_announcement ?? ''
    }
    feedback.value = {
      kind: 'success',
      title: result.admin_announcement
        ? copy.admin.dailyAnnounceSaved
        : result.changed === false
          ? copy.admin.dailyAnnounceUnchanged
          : copy.admin.dailyAnnounceCleared,
      body: '',
      dayNumber,
    }
  } catch (err) {
    feedback.value = {
      kind: 'unknown',
      title: copy.admin.dailyAnnounceUnknownTitle,
      body: err instanceof Error ? err.message : copy.admin.dailyAnnounceUnknownBody,
      dayNumber,
    }
  } finally {
    busyDay.value = null
  }
}

async function saveRow(row: AdminDailyChallengeRow) {
  if (row.participation_mode !== 'all_hands' || locked.value) return
  const next = draftFor(row.day_number).trim()
  if (next.length > MAX_LEN) {
    feedback.value = {
      kind: 'error',
      title: copy.admin.dailyAnnounceFailureTitle,
      body: copy.admin.dailyAnnounceTooLong,
      dayNumber: row.day_number,
    }
    return
  }
  if (!isDirty(row)) {
    feedback.value = {
      kind: 'success',
      title: copy.admin.dailyAnnounceUnchanged,
      body: '',
      dayNumber: row.day_number,
    }
    return
  }
  await applyAnnouncement(row.day_number, next || null, newDailyAnnounceRequestId())
}

async function clearRow(row: AdminDailyChallengeRow) {
  if (row.participation_mode !== 'all_hands' || locked.value) return
  drafts[row.day_number] = ''
  await applyAnnouncement(row.day_number, null, newDailyAnnounceRequestId())
}

async function retryPending() {
  if (!pending.value) return
  await applyAnnouncement(
    pending.value.dayNumber,
    pending.value.announcement,
    pending.value.clientRequestId,
  )
}

onMounted(async () => {
  const stored = readPendingDailyAnnouncement()
  if (stored) {
    pending.value = stored
    feedback.value = {
      kind: 'unknown',
      title: copy.admin.dailyAnnounceUnknownTitle,
      body: copy.admin.dailyAnnounceUnknownBody,
      dayNumber: stored.dayNumber,
    }
  }
  await load()
})
</script>

<template>
  <section
    class="mt-8 rounded-2xl p-4"
    style="background: #fff"
    data-testid="daily-announcements-section"
  >
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="font-display text-base font-bold" style="color: #2f3a44">
          {{ copy.admin.dailyAnnounceSection }}
        </h2>
        <p class="mt-1 text-xs leading-relaxed" style="color: #5c6670">
          {{ copy.admin.dailyAnnounceNote }}
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-full px-3 py-2 text-xs font-semibold"
        style="background: #e8e2d9; color: #2f3a44"
        data-testid="daily-announce-refresh"
        :disabled="loadStatus === 'loading' || locked"
        @click="load"
      >
        {{ copy.admin.dailyAnnounceRefresh }}
      </button>
    </div>

    <p
      v-if="loadStatus === 'loading' && !challenges.length"
      class="mt-3 text-sm"
      style="color: #5c6670"
      data-testid="daily-announce-loading"
    >
      Loading…
    </p>

    <p
      v-else-if="loadStatus === 'error' && !challenges.length"
      class="mt-3 text-sm"
      style="color: #8b2942"
      data-testid="daily-announce-error"
    >
      {{ errorBody || copy.admin.dailyAnnounceLoadError }}
    </p>

    <div
      v-if="feedback"
      class="mt-3 rounded-xl px-3 py-2 text-sm"
      :style="{
        background: feedback.kind === 'error' ? '#f8e8ec' : feedback.kind === 'unknown' ? '#f7efe6' : '#e8f3f1',
        color: '#2f3a44',
      }"
      data-testid="daily-announce-feedback"
    >
      <p class="font-semibold">{{ feedback.title }}</p>
      <p v-if="feedback.body" class="mt-1 text-xs" style="color: #5c6670">{{ feedback.body }}</p>
      <button
        v-if="feedback.kind === 'unknown' && pending"
        type="button"
        class="mt-2 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
        style="background: #0a5c6b"
        data-testid="daily-announce-retry"
        :disabled="busyDay != null"
        @click="retryPending"
      >
        {{ copy.admin.dailyAnnounceRetry }}
      </button>
    </div>

    <ul v-if="challenges.length" class="mt-3 space-y-3" data-testid="daily-announce-list">
      <li
        v-for="row in challenges"
        :key="row.challenge_id"
        class="rounded-xl px-3 py-3"
        style="background: #f4f7f8"
        :data-testid="`daily-announce-day-${row.day_number}`"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <p class="text-sm font-semibold" style="color: #2f3a44">
            {{ formatCopy(copy.admin.dailyAnnounceDay, { day: row.day_number }) }}
            · {{ row.title }}
          </p>
          <p class="text-xs font-semibold uppercase tracking-wide" style="color: #5c6670">
            {{ modeLabel(row) }}
          </p>
        </div>
        <p v-if="row.location_name" class="mt-1 text-xs" style="color: #5c6670">
          {{ row.location_name }}
        </p>

        <template v-if="row.participation_mode === 'all_hands'">
          <label class="mt-3 block text-xs font-semibold" style="color: #5c6670">
            {{ copy.admin.dailyAnnounceModeAllHands }}
            <textarea
              class="mt-1 w-full resize-none rounded-xl px-3 py-2 text-sm outline-none"
              style="background: #fff; color: #2f3a44"
              rows="2"
              :value="draftFor(row.day_number)"
              :placeholder="copy.admin.dailyAnnouncePlaceholder"
              :disabled="locked"
              :data-testid="`daily-announce-input-${row.day_number}`"
              @input="setDraft(row.day_number, ($event.target as HTMLTextAreaElement).value)"
            />
          </label>
          <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs" style="color: #5c6670">{{ charCount(row.day_number) }}</p>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-full px-3 py-1.5 text-xs font-semibold"
                style="background: #e8e2d9; color: #2f3a44"
                :disabled="locked || !savedAnnouncement(row)"
                :data-testid="`daily-announce-clear-${row.day_number}`"
                @click="clearRow(row)"
              >
                {{ copy.admin.dailyAnnounceClear }}
              </button>
              <button
                type="button"
                class="rounded-full px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                style="background: #0a5c6b"
                :disabled="locked || !isDirty(row)"
                :data-testid="`daily-announce-save-${row.day_number}`"
                @click="saveRow(row)"
              >
                {{
                  busyDay === row.day_number
                    ? copy.admin.dailyAnnounceSaving
                    : copy.admin.dailyAnnounceSave
                }}
              </button>
            </div>
          </div>
        </template>
        <p v-else class="mt-2 text-xs leading-relaxed" style="color: #5c6670">
          {{ copy.admin.dailyAnnounceBringFriendNote }}
        </p>
      </li>
    </ul>
  </section>
</template>
