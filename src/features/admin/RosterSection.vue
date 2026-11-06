<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  applyPlayerAccess,
  createPlayer,
  listRoster,
  listTeams,
  newRosterRequestId,
  reconcileAuthRequest,
  reconcilePlayerAccess,
  resetPassword,
  validateRosterPassword,
  type AdminRosterApplyResult,
  type RosterPlayer,
  type RosterTeam,
} from '@/lib/adminRoster'
import {
  clearPendingRosterAccess,
  clearPendingRosterAuth,
  readPendingRosterAccess,
  readPendingRosterAuth,
  writePendingRosterAccess,
  writePendingRosterAuth,
  type PendingRosterAccess,
  type PendingRosterAuth,
} from '@/lib/pendingAdminRoster'
import { copy } from '@/ui/copy'

type Panel =
  | { mode: 'add' }
  | { mode: 'reset'; playerId: string }
  | { mode: 'edit'; playerId: string }

type Feedback = {
  kind: 'success' | 'error' | 'unknown'
  title: string
  body: string
  source?: 'access' | 'auth'
}

const players = ref<RosterPlayer[]>([])
const teams = ref<RosterTeam[]>([])
const loadStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const loadError = ref('')
const busy = ref(false)
const panel = ref<Panel | null>(null)
const feedback = ref<Feedback | null>(null)
const formError = ref('')
const confirmOpen = ref(false)
const showPassword = ref(false)

const pendingAccess = ref<PendingRosterAccess | null>(null)
const pendingAuth = ref<PendingRosterAuth | null>(null)

// Add Player form
const addName = ref('')
const addPassword = ref('')
const addDrink = ref(true)
const addShip = ref(false)
const addTeam = ref('')

// Reset Password form
const resetPw = ref('')
const resetPwConfirm = ref('')

// Edit access form
const editActive = ref(true)
const editDrink = ref(false)
const editShip = ref(false)
const editTeam = ref('')

const anyPending = computed(() => Boolean(pendingAccess.value || pendingAuth.value))

const editingPlayer = computed(() =>
  panel.value?.mode === 'edit'
    ? (players.value.find((p) => p.player_id === (panel.value as { playerId: string }).playerId) ??
      null)
    : null,
)
const resettingPlayer = computed(() =>
  panel.value?.mode === 'reset'
    ? (players.value.find((p) => p.player_id === (panel.value as { playerId: string }).playerId) ??
      null)
    : null,
)

const createFieldsLocked = computed(() => pendingAuth.value?.kind === 'create_player')
const editLocked = computed(
  () =>
    Boolean(pendingAccess.value) && pendingAccess.value?.playerId === editingPlayer.value?.player_id,
)
const teamLocked = computed(() =>
  Boolean(editingPlayer.value?.has_shipit_history && editingPlayer.value?.team),
)

/** Teams for the edit select, including the player's current team if it is no longer listed. */
const editTeamOptions = computed(() => {
  const current = editingPlayer.value?.team
  if (current && !teams.value.some((t) => t.team_id === current.team_id)) {
    return [...teams.value, { team_id: current.team_id, name: current.name }]
  }
  return teams.value
})

const editDirty = computed(() => {
  const p = editingPlayer.value
  if (!p) return false
  return (
    editActive.value !== p.active ||
    editDrink.value !== p.drinkit_enabled ||
    editShip.value !== p.shipit_enabled ||
    (editTeam.value || null) !== (p.team?.team_id ?? null)
  )
})

const confirmReasons = computed(() => {
  const p = editingPlayer.value
  if (!p) return []
  const out: string[] = []
  if (p.active && !editActive.value) out.push(copy.admin.accessConfirmDisableAccount)
  if (p.drinkit_enabled && !editDrink.value) out.push(copy.admin.accessConfirmRemoveDrinkIt)
  if (p.shipit_enabled && !editShip.value) out.push(copy.admin.accessConfirmRemoveShipIt)
  return out
})

function canOpen(mode: 'add' | 'reset' | 'edit', playerId?: string): boolean {
  if (busy.value) return false
  if (pendingAccess.value) return mode === 'edit' && pendingAccess.value.playerId === playerId
  if (pendingAuth.value) {
    if (pendingAuth.value.kind === 'create_player') return mode === 'add'
    return mode === 'reset' && pendingAuth.value.playerId === playerId
  }
  return true
}

function inputClass() {
  return 'mt-1 min-h-12 w-full rounded-xl border px-3 py-2 text-base disabled:opacity-60'
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function load() {
  loadStatus.value = 'loading'
  loadError.value = ''
  try {
    const [roster, teamRows] = await Promise.all([listRoster(), listTeams()])
    players.value = roster
    teams.value = teamRows
    loadStatus.value = 'ready'
  } catch (err) {
    loadStatus.value = 'error'
    loadError.value = err instanceof Error ? err.message : copy.admin.rosterLoadError
  }
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function closePanel() {
  if (busy.value) return
  panel.value = null
  confirmOpen.value = false
  formError.value = ''
  addPassword.value = ''
  resetPw.value = ''
  resetPwConfirm.value = ''
  showPassword.value = false
}

function openAdd() {
  if (!canOpen('add')) return
  feedback.value = null
  formError.value = ''
  confirmOpen.value = false
  const p = pendingAuth.value
  if (p?.kind === 'create_player') {
    addName.value = p.displayName ?? ''
    addDrink.value = Boolean(p.drinkitEnabled)
    addShip.value = Boolean(p.shipitEnabled)
    addTeam.value = p.teamId ?? ''
  } else {
    addName.value = ''
    addDrink.value = true
    addShip.value = false
    addTeam.value = ''
  }
  addPassword.value = ''
  panel.value = { mode: 'add' }
}

function openReset(player: RosterPlayer) {
  if (!canOpen('reset', player.player_id)) return
  feedback.value = null
  formError.value = ''
  resetPw.value = ''
  resetPwConfirm.value = ''
  panel.value = { mode: 'reset', playerId: player.player_id }
}

function openEdit(player: RosterPlayer) {
  if (!canOpen('edit', player.player_id)) return
  feedback.value = null
  formError.value = ''
  confirmOpen.value = false
  const p = pendingAccess.value?.playerId === player.player_id ? pendingAccess.value : null
  editActive.value = p ? p.active : player.active
  editDrink.value = p ? p.drinkitEnabled : player.drinkit_enabled
  editShip.value = p ? p.shipitEnabled : player.shipit_enabled
  editTeam.value = (p ? p.teamId : player.team?.team_id) ?? ''
  panel.value = { mode: 'edit', playerId: player.player_id }
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

function resolveAccess() {
  pendingAccess.value = null
  clearPendingRosterAccess()
}

function resolveAuth() {
  pendingAuth.value = null
  clearPendingRosterAuth()
}

async function applyAccessOutcome(outcome: AdminRosterApplyResult) {
  if (outcome.status === 'ok') {
    resolveAccess()
    confirmOpen.value = false
    panel.value = null
    feedback.value = { kind: 'success', title: copy.admin.accessSuccess, body: '', source: 'access' }
    await load()
    return
  }
  if (outcome.status === 'failed') {
    resolveAccess()
    confirmOpen.value = false
    feedback.value = {
      kind: 'error',
      title: copy.admin.accessFailureTitle,
      body: outcome.message || copy.admin.accessFailureBody,
      source: 'access',
    }
    if (outcome.code === 'stale') {
      panel.value = null
      await load()
    }
    return
  }
  feedback.value = {
    kind: 'unknown',
    title: copy.admin.accessUnknownTitle,
    body: copy.admin.accessUnknownBody,
    source: 'access',
  }
}

async function applyAuthOutcome(outcome: AdminRosterApplyResult, kind: 'create_player' | 'reset_password') {
  const isCreate = kind === 'create_player'
  if (outcome.status === 'ok') {
    resolveAuth()
    addPassword.value = ''
    resetPw.value = ''
    resetPwConfirm.value = ''
    panel.value = null
    feedback.value = {
      kind: 'success',
      title: isCreate ? copy.admin.createSuccess : copy.admin.resetSuccess,
      body: '',
      source: 'auth',
    }
    await load()
    return
  }
  if (outcome.status === 'failed') {
    resolveAuth()
    addPassword.value = ''
    resetPw.value = ''
    resetPwConfirm.value = ''
    feedback.value = {
      kind: 'error',
      title: isCreate ? copy.admin.createFailureTitle : copy.admin.resetFailureTitle,
      body:
        outcome.message ||
        (isCreate ? copy.admin.createFailureBody : copy.admin.resetFailureBody),
      source: 'auth',
    }
    return
  }
  feedback.value = {
    kind: 'unknown',
    title: isCreate ? copy.admin.createUnknownTitle : copy.admin.resetUnknownTitle,
    body: isCreate ? copy.admin.createUnknownBody : copy.admin.resetUnknownBody,
    source: 'auth',
  }
}

// ---------------------------------------------------------------------------
// Create player
// ---------------------------------------------------------------------------

async function submitCreate() {
  if (busy.value || pendingAccess.value) return
  formError.value = ''
  const name = addName.value.trim()
  if (name.length < 2 || name.length > 80) {
    formError.value = copy.admin.playerNameInvalid
    return
  }
  const pwError = validateRosterPassword(addPassword.value)
  if (pwError) {
    formError.value = pwError
    return
  }
  if (addShip.value && !addTeam.value) {
    formError.value = copy.admin.teamRequired
    return
  }

  // Same request id while a create is unresolved; otherwise mint a new one.
  const clientRequestId =
    pendingAuth.value?.kind === 'create_player'
      ? pendingAuth.value.clientRequestId
      : newRosterRequestId()
  const teamId = addTeam.value || null

  pendingAuth.value = writePendingRosterAuth({
    kind: 'create_player',
    clientRequestId,
    displayName: name,
    drinkitEnabled: addDrink.value,
    shipitEnabled: addShip.value,
    teamId,
  })
  busy.value = true
  feedback.value = null
  try {
    const outcome = await createPlayer({
      clientRequestId,
      displayName: name,
      password: addPassword.value,
      drinkitEnabled: addDrink.value,
      shipitEnabled: addShip.value,
      teamId,
    })
    await applyAuthOutcome(outcome, 'create_player')
  } finally {
    busy.value = false
  }
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

async function submitReset() {
  const player = resettingPlayer.value
  if (!player || busy.value || pendingAccess.value) return
  formError.value = ''
  const pwError = validateRosterPassword(resetPw.value)
  if (pwError) {
    formError.value = pwError
    return
  }
  if (resetPw.value !== resetPwConfirm.value) {
    formError.value = copy.admin.passwordMismatch
    return
  }

  const clientRequestId =
    pendingAuth.value?.kind === 'reset_password' &&
    pendingAuth.value.playerId === player.player_id
      ? pendingAuth.value.clientRequestId
      : newRosterRequestId()

  pendingAuth.value = writePendingRosterAuth({
    kind: 'reset_password',
    clientRequestId,
    playerId: player.player_id,
    displayName: player.display_name,
  })
  busy.value = true
  feedback.value = null
  try {
    const outcome = await resetPassword({
      clientRequestId,
      playerId: player.player_id,
      password: resetPw.value,
    })
    await applyAuthOutcome(outcome, 'reset_password')
  } finally {
    busy.value = false
  }
}

// ---------------------------------------------------------------------------
// Edit access
// ---------------------------------------------------------------------------

function requestSaveAccess() {
  formError.value = ''
  if (editShip.value && !editTeam.value) {
    formError.value = copy.admin.teamRequired
    return
  }
  if (confirmReasons.value.length) {
    confirmOpen.value = true
    return
  }
  void submitAccess()
}

async function submitAccess() {
  const player = editingPlayer.value
  if (!player || busy.value || anyPending.value) return
  const clientRequestId = newRosterRequestId()
  const record = {
    clientRequestId,
    playerId: player.player_id,
    displayName: player.display_name,
    active: editActive.value,
    drinkitEnabled: editDrink.value,
    shipitEnabled: editShip.value,
    teamId: editTeam.value || null,
    expectedFingerprint: player.state_fingerprint,
  }
  // Persist BEFORE the network call so a reload cannot drop the lock.
  pendingAccess.value = writePendingRosterAccess(record)
  confirmOpen.value = false
  busy.value = true
  feedback.value = null
  try {
    const outcome = await applyPlayerAccess(record)
    await applyAccessOutcome(outcome)
  } finally {
    busy.value = false
  }
}

// ---------------------------------------------------------------------------
// Pending recovery
// ---------------------------------------------------------------------------

/** Check Status — ledger lookup only. Never clears pending unless ok/failed is confirmed. */
async function checkStatus() {
  if (busy.value) return
  busy.value = true
  try {
    if (pendingAccess.value) {
      await applyAccessOutcome(await reconcilePlayerAccess(pendingAccess.value.clientRequestId))
    } else if (pendingAuth.value) {
      const kind = pendingAuth.value.kind
      await applyAuthOutcome(await reconcileAuthRequest(pendingAuth.value.clientRequestId), kind)
    }
  } finally {
    busy.value = false
  }
}

/** Retry Same Request — same request id and same intent; never mints a new operation. */
async function retrySame() {
  if (busy.value) return
  if (pendingAccess.value) {
    const p = pendingAccess.value
    busy.value = true
    feedback.value = null
    try {
      await applyAccessOutcome(await applyPlayerAccess(p))
    } finally {
      busy.value = false
    }
    return
  }
  const auth = pendingAuth.value
  if (!auth) return
  // Passwords are never stored; reopen the matching form so the admin can re-enter it.
  if (auth.kind === 'create_player') {
    openAdd()
  } else {
    const player = players.value.find((p) => p.player_id === auth.playerId)
    if (player) openReset(player)
  }
  feedback.value = {
    kind: 'unknown',
    title: auth.kind === 'create_player' ? copy.admin.createUnknownTitle : copy.admin.resetUnknownTitle,
    body: copy.admin.reenterPasswordToRetry,
    source: 'auth',
  }
}

onMounted(async () => {
  await load()
  const access = readPendingRosterAccess()
  const auth = readPendingRosterAuth()
  pendingAccess.value = access
  pendingAuth.value = auth
  if (access) {
    feedback.value = {
      kind: 'unknown',
      title: copy.admin.accessUnknownTitle,
      body: copy.admin.accessUnknownBody,
      source: 'access',
    }
  } else if (auth) {
    const isCreate = auth.kind === 'create_player'
    feedback.value = {
      kind: 'unknown',
      title: isCreate ? copy.admin.createUnknownTitle : copy.admin.resetUnknownTitle,
      body: isCreate ? copy.admin.createUnknownBody : copy.admin.resetUnknownBody,
      source: 'auth',
    }
  }
  if (access || auth) await checkStatus()
})

function teamName(p: RosterPlayer): string {
  return p.team?.name ?? ''
}

const feedbackStyle = computed(() =>
  feedback.value?.kind === 'success'
    ? { background: '#e7f6ef', color: '#1f4d3a' }
    : feedback.value?.kind === 'unknown'
      ? { background: '#fff6e5', color: '#6a4b12' }
      : { background: '#fdeceb', color: '#6b1f1f' },
)
</script>

<template>
  <section class="mt-6 rounded-2xl p-4" style="background: #fff" data-testid="roster-section">
    <div class="flex items-center justify-between gap-2">
      <h2 class="font-display text-base font-bold tracking-wide" style="color: #2f3a44">
        {{ copy.admin.rosterSection }}
      </h2>
      <button
        type="button"
        class="min-h-12 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
        style="background: #0a5c6b"
        data-testid="roster-add-player"
        :disabled="!canOpen('add')"
        @click="openAdd"
      >
        {{ copy.admin.addPlayer }}
      </button>
    </div>

    <!-- Feedback -->
    <div
      v-if="feedback"
      class="mt-4 rounded-2xl px-4 py-3 text-sm"
      :style="feedbackStyle"
      :data-kind="feedback.kind"
      data-testid="roster-feedback"
    >
      <p class="font-semibold">{{ feedback.title }}</p>
      <p v-if="feedback.body" class="mt-1">{{ feedback.body }}</p>
      <div v-if="feedback.kind === 'unknown' && anyPending" class="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-12 rounded-full px-4 text-sm font-semibold"
          style="background: #e8e2da; color: #2f3a44"
          data-testid="roster-check-status"
          :disabled="busy"
          @click="checkStatus"
        >
          {{ copy.admin.checkStatus }}
        </button>
        <button
          type="button"
          class="min-h-12 rounded-full px-4 text-sm font-semibold"
          style="background: #e8e2da; color: #2f3a44"
          data-testid="roster-retry-same"
          :disabled="busy"
          @click="retrySame"
        >
          {{ copy.admin.retrySameRequest }}
        </button>
      </div>
    </div>

    <!-- Add Player -->
    <form
      v-if="panel?.mode === 'add'"
      class="mt-4 rounded-2xl p-4"
      style="background: #f7f4ef; color: #2f3a44"
      data-testid="roster-add-form"
      @submit.prevent="submitCreate"
    >
      <h3 class="font-semibold">{{ copy.admin.addPlayer }}</h3>

      <label class="mt-3 block text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
        {{ copy.admin.playerName }}
        <input
          v-model="addName"
          type="text"
          :class="inputClass()"
          style="border-color: #c9c2b8; color: #2f3a44; background: #fff"
          data-testid="roster-add-name"
          autocomplete="off"
          :disabled="busy || createFieldsLocked"
        />
      </label>

      <label class="mt-3 block text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
        {{ copy.admin.setPassword }}
        <input
          v-model="addPassword"
          :type="showPassword ? 'text' : 'password'"
          :class="inputClass()"
          style="border-color: #c9c2b8; color: #2f3a44; background: #fff"
          data-testid="roster-add-password"
          autocomplete="new-password"
          :disabled="busy"
        />
      </label>
      <div class="mt-1 flex items-center justify-between gap-2 text-xs" style="color: #5a6570">
        <span>{{ copy.admin.passwordHint }}</span>
        <button
          type="button"
          class="min-h-12 px-2 font-semibold underline"
          @click="showPassword = !showPassword"
        >
          {{ showPassword ? copy.admin.hidePassword : copy.admin.showPassword }}
        </button>
      </div>

      <label
        class="mt-2 flex min-h-12 items-center justify-between rounded-xl border bg-white px-3 text-sm font-semibold"
        style="border-color: #c9c2b8"
      >
        {{ copy.admin.drinkItAccess }}
        <input
          v-model="addDrink"
          type="checkbox"
          class="h-6 w-6"
          data-testid="roster-add-drinkit"
          :disabled="busy || createFieldsLocked"
        />
      </label>
      <label
        class="mt-2 flex min-h-12 items-center justify-between rounded-xl border bg-white px-3 text-sm font-semibold"
        style="border-color: #c9c2b8"
      >
        {{ copy.admin.shipItAccess }}
        <input
          v-model="addShip"
          type="checkbox"
          class="h-6 w-6"
          data-testid="roster-add-shipit"
          :disabled="busy || createFieldsLocked"
        />
      </label>

      <label class="mt-3 block text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
        {{ copy.admin.shipItTeam }}
        <select
          v-model="addTeam"
          :class="inputClass()"
          style="border-color: #c9c2b8; color: #2f3a44; background: #fff"
          data-testid="roster-add-team"
          :disabled="busy || createFieldsLocked"
        >
          <option value="">{{ addShip ? copy.admin.selectTeam : copy.admin.noTeam }}</option>
          <option v-for="t in teams" :key="t.team_id" :value="t.team_id">{{ t.name }}</option>
        </select>
      </label>

      <p v-if="formError" class="mt-3 text-sm font-semibold" style="color: #8b2e2e" data-testid="roster-form-error">
        {{ formError }}
      </p>

      <div class="mt-4 grid grid-cols-2 gap-2">
        <button
          type="submit"
          class="min-h-12 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
          style="background: #0a5c6b"
          data-testid="roster-add-submit"
          :disabled="busy || Boolean(pendingAccess)"
        >
          {{ copy.admin.createPlayerAction }}
        </button>
        <button
          type="button"
          class="min-h-12 rounded-full px-5 text-sm font-semibold disabled:opacity-50"
          style="background: #e8e2da; color: #2f3a44"
          data-testid="roster-add-cancel"
          :disabled="busy"
          @click="closePanel"
        >
          {{ copy.admin.cancel }}
        </button>
      </div>
    </form>

    <!-- Reset Password -->
    <form
      v-if="panel?.mode === 'reset' && resettingPlayer"
      class="mt-4 rounded-2xl p-4"
      style="background: #f7f4ef; color: #2f3a44"
      data-testid="roster-reset-form"
      @submit.prevent="submitReset"
    >
      <h3 class="font-semibold">
        {{ copy.admin.resetPassword }} · {{ resettingPlayer.display_name }}
      </h3>

      <label class="mt-3 block text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
        {{ copy.admin.setPassword }}
        <input
          v-model="resetPw"
          :type="showPassword ? 'text' : 'password'"
          :class="inputClass()"
          style="border-color: #c9c2b8; color: #2f3a44; background: #fff"
          data-testid="roster-reset-password"
          autocomplete="new-password"
          :disabled="busy"
        />
      </label>
      <label class="mt-3 block text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
        {{ copy.admin.confirmPassword }}
        <input
          v-model="resetPwConfirm"
          :type="showPassword ? 'text' : 'password'"
          :class="inputClass()"
          style="border-color: #c9c2b8; color: #2f3a44; background: #fff"
          data-testid="roster-reset-password-confirm"
          autocomplete="new-password"
          :disabled="busy"
        />
      </label>
      <div class="mt-1 flex items-center justify-between gap-2 text-xs" style="color: #5a6570">
        <span>{{ copy.admin.passwordHint }}</span>
        <button
          type="button"
          class="min-h-12 px-2 font-semibold underline"
          @click="showPassword = !showPassword"
        >
          {{ showPassword ? copy.admin.hidePassword : copy.admin.showPassword }}
        </button>
      </div>

      <p v-if="formError" class="mt-3 text-sm font-semibold" style="color: #8b2e2e" data-testid="roster-form-error">
        {{ formError }}
      </p>

      <div class="mt-4 grid grid-cols-2 gap-2">
        <button
          type="submit"
          class="min-h-12 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
          style="background: #0a5c6b"
          data-testid="roster-reset-submit"
          :disabled="busy || Boolean(pendingAccess)"
        >
          {{ copy.admin.resetPasswordAction }}
        </button>
        <button
          type="button"
          class="min-h-12 rounded-full px-5 text-sm font-semibold disabled:opacity-50"
          style="background: #e8e2da; color: #2f3a44"
          data-testid="roster-reset-cancel"
          :disabled="busy"
          @click="closePanel"
        >
          {{ copy.admin.cancel }}
        </button>
      </div>
    </form>

    <!-- Edit Access -->
    <div
      v-if="panel?.mode === 'edit' && editingPlayer"
      class="mt-4 rounded-2xl p-4"
      style="background: #f7f4ef; color: #2f3a44"
      data-testid="roster-edit-panel"
    >
      <h3 class="font-semibold">{{ copy.admin.editAccess }} · {{ editingPlayer.display_name }}</h3>

      <label
        class="mt-3 flex min-h-12 items-center justify-between rounded-xl border bg-white px-3 text-sm font-semibold"
        style="border-color: #c9c2b8"
      >
        {{ copy.admin.accountActive }}
        <input
          v-model="editActive"
          type="checkbox"
          class="h-6 w-6"
          data-testid="roster-edit-active"
          :disabled="busy || editLocked"
        />
      </label>
      <label
        class="mt-2 flex min-h-12 items-center justify-between rounded-xl border bg-white px-3 text-sm font-semibold"
        style="border-color: #c9c2b8"
      >
        {{ copy.admin.drinkItAccess }}
        <input
          v-model="editDrink"
          type="checkbox"
          class="h-6 w-6"
          data-testid="roster-edit-drinkit"
          :disabled="busy || editLocked"
        />
      </label>
      <label
        class="mt-2 flex min-h-12 items-center justify-between rounded-xl border bg-white px-3 text-sm font-semibold"
        style="border-color: #c9c2b8"
      >
        {{ copy.admin.shipItAccess }}
        <input
          v-model="editShip"
          type="checkbox"
          class="h-6 w-6"
          data-testid="roster-edit-shipit"
          :disabled="busy || editLocked"
        />
      </label>

      <label class="mt-3 block text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
        {{ copy.admin.shipItTeam }}
        <select
          v-model="editTeam"
          :class="inputClass()"
          style="border-color: #c9c2b8; color: #2f3a44; background: #fff"
          data-testid="roster-edit-team"
          :disabled="busy || editLocked || teamLocked"
        >
          <option value="">{{ editShip ? copy.admin.selectTeam : copy.admin.noTeam }}</option>
          <option v-for="t in editTeamOptions" :key="t.team_id" :value="t.team_id">
            {{ t.name }}
          </option>
        </select>
      </label>
      <p
        v-if="teamLocked"
        class="mt-1 text-xs"
        style="color: #5a6570"
        data-testid="roster-team-locked-reason"
      >
        {{ copy.admin.teamLockedReason }}
      </p>

      <p v-if="formError" class="mt-3 text-sm font-semibold" style="color: #8b2e2e" data-testid="roster-form-error">
        {{ formError }}
      </p>

      <div v-if="confirmOpen" class="mt-4 rounded-2xl p-4" style="background: #fff3f0" data-testid="roster-confirm">
        <p class="font-semibold">{{ copy.admin.accessConfirmTitle }}</p>
        <ul class="mt-2 list-disc pl-5 text-sm">
          <li v-for="reason in confirmReasons" :key="reason">{{ reason }}</li>
        </ul>
        <p class="mt-2 text-xs" style="color: #5a6570">{{ copy.admin.accessConfirmFooter }}</p>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="min-h-12 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
            style="background: #8b2e2e"
            data-testid="roster-confirm-yes"
            :disabled="busy"
            @click="submitAccess"
          >
            {{ copy.admin.saveAccess }}
          </button>
          <button
            type="button"
            class="min-h-12 rounded-full px-5 text-sm font-semibold disabled:opacity-50"
            style="background: #e8e2da; color: #2f3a44"
            data-testid="roster-confirm-cancel"
            :disabled="busy"
            @click="confirmOpen = false"
          >
            {{ copy.admin.cancel }}
          </button>
        </div>
      </div>

      <div v-else class="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          class="min-h-12 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
          style="background: #0a5c6b"
          data-testid="roster-edit-save"
          :disabled="busy || editLocked || !editDirty"
          @click="requestSaveAccess"
        >
          {{ copy.admin.saveAccess }}
        </button>
        <button
          type="button"
          class="min-h-12 rounded-full px-5 text-sm font-semibold disabled:opacity-50"
          style="background: #e8e2da; color: #2f3a44"
          data-testid="roster-edit-cancel"
          :disabled="busy"
          @click="closePanel"
        >
          {{ copy.admin.close }}
        </button>
      </div>
    </div>

    <!-- List -->
    <p
      v-if="loadStatus === 'loading' && !players.length"
      class="mt-4 text-sm"
      style="color: #5a6570"
      data-testid="roster-loading"
    >
      {{ copy.admin.rosterLoading }}
    </p>
    <div
      v-else-if="loadStatus === 'error'"
      class="mt-4 rounded-2xl px-4 py-3 text-sm"
      style="background: #fdeceb; color: #6b1f1f"
      data-testid="roster-load-error"
    >
      <p>{{ loadError || copy.admin.rosterLoadError }}</p>
      <button
        type="button"
        class="mt-2 min-h-12 font-semibold underline"
        data-testid="roster-retry-load"
        @click="load"
      >
        {{ copy.admin.rosterRetryLoad }}
      </button>
    </div>
    <p
      v-else-if="loadStatus === 'ready' && !players.length"
      class="mt-4 text-sm"
      style="color: #5a6570"
      data-testid="roster-empty"
    >
      {{ copy.admin.rosterEmpty }}
    </p>

    <ul v-if="players.length" class="mt-4 grid gap-2" data-testid="roster-list">
      <li
        v-for="p in players"
        :key="p.player_id"
        class="rounded-2xl p-3"
        style="background: #f7f4ef; color: #2f3a44"
        data-testid="roster-row"
        :data-player-id="p.player_id"
      >
        <div class="flex items-start justify-between gap-2">
          <p class="font-semibold">{{ p.display_name }}</p>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
            :style="
              p.active
                ? { background: '#e7f6ef', color: '#1f4d3a' }
                : { background: '#fdeceb', color: '#6b1f1f' }
            "
            data-testid="roster-active-badge"
          >
            {{ p.active ? copy.admin.accountActiveLabel : copy.admin.accountDisabledLabel }}
          </span>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span
            class="rounded-full px-2 py-0.5"
            :style="
              p.drinkit_enabled
                ? { background: '#0a5c6b', color: '#fff' }
                : { background: '#e8e2da', color: '#8a8f94' }
            "
            :aria-label="`${copy.games.drinkIt} ${p.drinkit_enabled ? copy.admin.on : copy.admin.off}`"
            data-testid="roster-drinkit-indicator"
            :data-enabled="p.drinkit_enabled ? 'true' : 'false'"
          >
            {{ copy.games.drinkIt }}
          </span>
          <span
            class="rounded-full px-2 py-0.5"
            :style="
              p.shipit_enabled
                ? { background: '#2f3a44', color: '#fff' }
                : { background: '#e8e2da', color: '#8a8f94' }
            "
            :aria-label="`${copy.games.shipIt} ${p.shipit_enabled ? copy.admin.on : copy.admin.off}`"
            data-testid="roster-shipit-indicator"
            :data-enabled="p.shipit_enabled ? 'true' : 'false'"
          >
            {{ copy.games.shipIt }}
          </span>
          <span v-if="teamName(p)" style="color: #5a6570" data-testid="roster-team-name">
            {{ teamName(p) }}
          </span>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="min-h-12 rounded-full px-3 text-sm font-semibold text-white disabled:opacity-50"
            style="background: #2f3a44"
            data-testid="roster-edit"
            :disabled="!canOpen('edit', p.player_id)"
            @click="openEdit(p)"
          >
            {{ copy.admin.editAccess }}
          </button>
          <button
            type="button"
            class="min-h-12 rounded-full px-3 text-sm font-semibold disabled:opacity-50"
            style="background: #e8e2da; color: #2f3a44"
            data-testid="roster-reset"
            :disabled="!canOpen('reset', p.player_id)"
            @click="openReset(p)"
          >
            {{ copy.admin.resetPassword }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
