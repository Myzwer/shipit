<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

const sessionNotice = computed(() => {
  if (route.query.reason === 'expired') return copy.login.sessionExpired
  return null
})

onMounted(async () => {
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
    class="flex min-h-dvh flex-col"
    style="background: linear-gradient(180deg, #f7edd3 0%, #f3ebe0 45%, #d8f3ef 100%)"
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
        class="rounded-3xl px-5 py-6 shadow-sm"
        style="background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(31, 41, 51, 0.08)"
        @submit.prevent="onSubmit"
      >
        <p
          v-if="sessionNotice"
          class="mb-4 rounded-2xl px-3 py-2 text-sm"
          style="background: #f5e9c8; color: #5b6770"
          role="status"
        >
          {{ sessionNotice }}
        </p>

        <label class="block text-sm font-semibold" style="color: #1f2933" for="login-name">
          {{ copy.login.nameLabel }}
        </label>
        <select
          id="login-name"
          v-model="selectedAlias"
          class="mt-2 w-full appearance-none rounded-2xl border border-black/10 bg-white px-4 py-3 text-base"
          style="color: #1f2933"
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

        <label
          class="mt-5 block text-sm font-semibold"
          style="color: #1f2933"
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
          style="color: #1f2933"
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
          class="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-semibold text-white shadow-md transition disabled:opacity-70"
          style="background: #0a5c6b"
          :disabled="submitting || directoryLoading"
        >
          {{ submitting ? copy.login.submitting : copy.login.submit }}
          <AppIcon v-if="!submitting" name="action.next" />
        </button>
      </form>
    </main>
  </div>
</template>
