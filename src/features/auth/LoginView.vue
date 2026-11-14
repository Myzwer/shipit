<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import { fetchLoginDirectory } from '@/lib/supabase'
import { useSessionStore } from '@/stores/session'
import type { LoginDirectoryRow } from '@/types/database'
import { copy } from '@/ui/copy'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const directory = ref<LoginDirectoryRow[]>([])
const directoryError = ref(false)
const directoryLoading = ref(true)

const selectedAlias = ref('')
const password = ref('')
const submitting = ref(false)
const formError = ref<string | null>(null)

const nameOpen = ref(false)
const nameRootEl = ref<HTMLElement | null>(null)
const nameListEl = ref<HTMLElement | null>(null)
const nameActiveIndex = ref(0)

const sessionNotice = computed(() => {
  if (route.query.reason === 'expired') return copy.login.sessionExpired
  return null
})

const selectedRow = computed(
  () => directory.value.find((row) => row.login_alias === selectedAlias.value) ?? null,
)

const nameTriggerLabel = computed(
  () => selectedRow.value?.display_name ?? copy.login.namePlaceholder,
)

onMounted(async () => {
  document.addEventListener('pointerdown', onNameDocumentPointer)
  directoryLoading.value = true
  directoryError.value = false
  try {
    directory.value = await fetchLoginDirectory()
  } catch {
    directoryError.value = true
    directory.value = []
  } finally {
    directoryLoading.value = false
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onNameDocumentPointer)
})

watch(selectedAlias, () => {
  nameActiveIndex.value = Math.max(
    0,
    directory.value.findIndex((row) => row.login_alias === selectedAlias.value),
  )
})

function closeNameMenu() {
  nameOpen.value = false
}

function openNameMenu() {
  if (directoryLoading.value || submitting.value || !directory.value.length) return
  nameOpen.value = true
  nameActiveIndex.value = Math.max(
    0,
    directory.value.findIndex((row) => row.login_alias === selectedAlias.value),
  )
  void nextTick(() => {
    nameListEl.value?.focus()
    scrollNameActiveIntoView()
  })
}

function toggleNameMenu() {
  if (nameOpen.value) closeNameMenu()
  else openNameMenu()
}

function selectName(alias: string) {
  selectedAlias.value = alias
  closeNameMenu()
}

function scrollNameActiveIntoView() {
  const el = nameListEl.value?.querySelector<HTMLElement>(
    `[data-option-index="${nameActiveIndex.value}"]`,
  )
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest' })
  }
}

function onNameTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (!nameOpen.value) openNameMenu()
  } else if (event.key === 'Escape') {
    closeNameMenu()
  }
}

function onNameListKeydown(event: KeyboardEvent) {
  if (!directory.value.length) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeNameMenu()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    nameActiveIndex.value = (nameActiveIndex.value + 1) % directory.value.length
    scrollNameActiveIntoView()
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    nameActiveIndex.value =
      (nameActiveIndex.value - 1 + directory.value.length) % directory.value.length
    scrollNameActiveIntoView()
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    nameActiveIndex.value = 0
    scrollNameActiveIntoView()
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    nameActiveIndex.value = directory.value.length - 1
    scrollNameActiveIntoView()
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const row = directory.value[nameActiveIndex.value]
    if (row) selectName(row.login_alias)
  }
}

function onNameDocumentPointer(event: PointerEvent) {
  if (!nameOpen.value || !nameRootEl.value) return
  if (!nameRootEl.value.contains(event.target as Node)) closeNameMenu()
}

async function onSubmit() {
  formError.value = null

  if (!selectedAlias.value) {
    formError.value = copy.login.missingName
    return
  }
  if (!password.value) {
    formError.value = copy.login.missingPassword
    return
  }

  submitting.value = true
  const submittedPassword = password.value
  // Clear password from the input as soon as we hand it to Auth.
  password.value = ''

  try {
    const result = await session.signIn(selectedAlias.value, submittedPassword)
    if (!result.ok) {
      formError.value =
        result.kind === 'network'
          ? copy.login.networkFailure
          : result.kind === 'invalid_credentials'
            ? copy.login.invalidCredentials
            : copy.login.networkFailure
      return
    }

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      await router.replace(redirect)
      return
    }
    await router.replace(session.homePathForMembership())
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    class="theme-drink flex min-h-dvh flex-col"
    style="background: linear-gradient(to right, #ffe2a3, #fff1d4) top / 100% 58% no-repeat, linear-gradient(to right, #b7e6e1, #e0f5ee)"
  >
    <main
      class="safe-x mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10"
      style="padding-top: max(2.5rem, env(safe-area-inset-top))"
    >
      <div class="mb-8 text-center">
        <AppIcon
          name="theme.ship-it"
          class="mx-auto text-[2.75rem] leading-none"
          style="color: #2f3a44"
        />
        <h1
          class="font-display mt-4 text-[2.15rem] font-extrabold tracking-[0.02em]"
          style="color: #1f2933"
        >
          {{ copy.login.heading }}
        </h1>
      </div>

      <form
        class="rounded-[1.35rem] px-5 py-6 shadow-md"
        style="background: rgba(255, 255, 255, 0.82); border: 1px solid rgba(31, 41, 51, 0.08)"
        data-testid="login-form"
        @submit.prevent="onSubmit"
      >
        <p
          v-if="sessionNotice"
          class="mb-4 rounded-2xl px-3 py-2 text-sm"
          style="background: linear-gradient(to right, #ffe2a3, #fff1d4); color: #5b6770"
          role="status"
        >
          {{ sessionNotice }}
        </p>

        <div ref="nameRootEl" class="login-name relative">
          <label
            id="login-name-label"
            class="block text-sm font-semibold"
            style="color: var(--theme-ink)"
            for="login-name-trigger"
          >
            {{ copy.login.nameLabel }}
          </label>

          <!-- Native select kept for Playwright/e2e selectOption compatibility. -->
          <select
            id="login-name"
            v-model="selectedAlias"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            :disabled="directoryLoading || submitting"
            required
          >
            <option disabled value="">{{ copy.login.namePlaceholder }}</option>
            <option
              v-for="row in directory"
              :key="row.login_alias"
              :value="row.login_alias"
            >
              {{ row.display_name }}
            </option>
          </select>

          <button
            id="login-name-trigger"
            type="button"
            class="login-name__trigger mt-2 flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left text-base font-semibold"
            style="
              background: var(--theme-gradient-cool);
              color: var(--theme-ink);
              box-shadow: var(--theme-card-shadow, var(--shadow-card));
            "
            data-testid="login-name-trigger"
            :aria-expanded="nameOpen"
            aria-haspopup="listbox"
            aria-labelledby="login-name-label"
            :disabled="directoryLoading || submitting || !directory.length"
            @click="toggleNameMenu"
            @keydown="onNameTriggerKeydown"
          >
            <span
              class="min-w-0 truncate"
              :class="selectedRow ? '' : 'font-medium opacity-70'"
            >
              {{ directoryLoading ? 'Loading…' : nameTriggerLabel }}
            </span>
            <AppIcon
              name="action.expand"
              class="shrink-0 text-sm opacity-70 transition"
              :class="nameOpen ? 'rotate-180' : ''"
            />
          </button>

          <ul
            v-if="nameOpen"
            ref="nameListEl"
            class="login-name__menu absolute left-0 right-0 z-40 mt-1.5 max-h-72 overflow-auto rounded-2xl py-1 outline-none"
            style="
              background: var(--theme-gradient-cool);
              color: var(--theme-ink);
              box-shadow: var(--theme-card-shadow, var(--shadow-card));
            "
            role="listbox"
            tabindex="-1"
            aria-labelledby="login-name-label"
            data-testid="login-name-menu"
            @keydown="onNameListKeydown"
          >
            <li
              v-for="(row, index) in directory"
              :key="row.login_alias"
              role="option"
              class="flex min-h-11 cursor-pointer items-center px-4 text-base font-medium"
              :class="index === nameActiveIndex ? 'login-name__option--active' : ''"
              :aria-selected="row.login_alias === selectedAlias"
              :data-option-index="index"
              :data-testid="`login-name-option-${row.login_alias}`"
              @mouseenter="nameActiveIndex = index"
              @click="selectName(row.login_alias)"
            >
              <span class="flex-1">{{ row.display_name }}</span>
              <AppIcon
                v-if="row.login_alias === selectedAlias"
                name="status.completed"
                style-variant="solid"
                class="text-sm"
                style="color: var(--theme-primary)"
              />
            </li>
          </ul>
        </div>

        <label
          class="mt-5 block text-sm font-semibold"
          style="color: var(--theme-ink)"
          for="login-password"
        >
          {{ copy.login.passwordLabel }}
        </label>
        <input
          id="login-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-base"
          style="color: var(--theme-ink)"
          :disabled="submitting"
        />

        <p
          v-if="formError || directoryError"
          class="mt-4 text-sm font-medium"
          style="color: #9f1239"
          role="alert"
        >
          {{ formError || copy.login.networkFailure }}
        </p>

        <button
          type="submit"
          class="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-semibold text-white shadow-md transition disabled:opacity-70"
          style="background: var(--theme-primary)"
          data-testid="login-submit"
          :disabled="submitting || directoryLoading"
        >
          {{ submitting ? copy.login.submitting : copy.login.submit }}
          <AppIcon v-if="!submitting" name="action.next" />
        </button>
      </form>
    </main>
  </div>
</template>

<style scoped>
.login-name__option--active {
  background: rgba(7, 108, 128, 0.14);
}

.login-name__menu [aria-selected='true'] {
  font-weight: 700;
}
</style>
