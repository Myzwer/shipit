/**
 * Authenticated session + membership profile (Phase 1B).
 * Game access and is_admin come only from get_my_session_profile / Auth — never client claims.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import {
  fetchMySessionProfile,
  isSupabaseConfigured,
  supabase,
} from '@/lib/supabase'
import { classifyLoginError, type LoginFailureKind } from '@/lib/authErrors'
import type { GameId, SessionProfile } from '@/types/database'

export type SessionStatus = 'initializing' | 'anonymous' | 'authenticated'

export const useSessionStore = defineStore('session', () => {
  const status = ref<SessionStatus>('initializing')
  const authSession = ref<Session | null>(null)
  const profile = ref<SessionProfile | null>(null)
  const profileNetworkError = ref(false)
  const currentGame = ref<GameId | null>(null)
  const bootstrapped = ref(false)

  let initPromise: Promise<void> | null = null
  let authSubscription: { unsubscribe: () => void } | null = null

  const displayName = computed(() => profile.value?.display_name ?? '')
  const isAdmin = computed(() => Boolean(profile.value?.is_admin))
  const enabledGames = computed<GameId[]>(() =>
    (profile.value?.games ?? [])
      .filter((g) => g.enabled)
      .map((g) => g.game)
      .sort(),
  )
  const isDualGame = computed(() => enabledGames.value.length === 2)
  const hasDrinkIt = computed(() => enabledGames.value.includes('drinkit'))
  const hasShipIt = computed(() => enabledGames.value.includes('shipit'))
  const teamName = computed(() => profile.value?.team?.name ?? null)
  const isAuthenticated = computed(() => status.value === 'authenticated')

  function setCurrentGame(game: GameId | null) {
    currentGame.value = game
  }

  function hasGame(game: GameId) {
    return enabledGames.value.includes(game)
  }

  function homePathForMembership(): string {
    const games = enabledGames.value
    if (games.length === 0) return '/unavailable'
    if (games.length === 1) return games[0] === 'drinkit' ? '/drinkit' : '/shipit'
    return '/'
  }

  async function loadProfile(options: { clearOnNull?: boolean } = {}) {
    const { clearOnNull = true } = options
    if (!supabase) {
      profile.value = null
      return
    }
    try {
      const next = await fetchMySessionProfile()
      profileNetworkError.value = false
      if (next) {
        profile.value = next
      } else if (clearOnNull) {
        profile.value = null
      }
    } catch {
      profileNetworkError.value = true
      // Keep prior profile on transient network failure — do not force logout.
    }
  }

  async function applySession(session: Session | null) {
    authSession.value = session
    if (!session) {
      status.value = 'anonymous'
      profile.value = null
      profileNetworkError.value = false
      return
    }
    status.value = 'authenticated'
    await loadProfile({ clearOnNull: true })
  }

  async function init() {
    if (bootstrapped.value) return
    if (initPromise) return initPromise

    initPromise = (async () => {
      if (!isSupabaseConfigured || !supabase) {
        status.value = 'anonymous'
        bootstrapped.value = true
        return
      }

      const { data, error } = await supabase.auth.getSession()
      if (error) {
        // Soft failure: treat as anonymous only if we have no usable session.
        status.value = 'anonymous'
      } else {
        await applySession(data.session)
      }

      const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'INITIAL_SESSION') return
        await applySession(session)
      })
      authSubscription = listener.subscription
      bootstrapped.value = true
    })()

    try {
      await initPromise
    } finally {
      initPromise = null
    }
  }

  async function signIn(
    loginAlias: string,
    password: string,
  ): Promise<{ ok: true } | { ok: false; kind: LoginFailureKind }> {
    if (!supabase) return { ok: false, kind: 'network' }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginAlias,
        password,
      })
      if (error) return { ok: false, kind: classifyLoginError(error) }
      await applySession(data.session)
      return { ok: true }
    } catch (error) {
      return { ok: false, kind: classifyLoginError(error) }
    }
  }

  async function signOut() {
    if (supabase) {
      await supabase.auth.signOut()
    }
    authSession.value = null
    profile.value = null
    profileNetworkError.value = false
    status.value = 'anonymous'
  }

  async function refreshProfile() {
    if (!authSession.value) return
    await loadProfile({ clearOnNull: true })
  }

  function dispose() {
    authSubscription?.unsubscribe()
    authSubscription = null
    bootstrapped.value = false
  }

  return {
    status,
    authSession,
    profile,
    profileNetworkError,
    currentGame,
    bootstrapped,
    displayName,
    isAdmin,
    enabledGames,
    isDualGame,
    hasDrinkIt,
    hasShipIt,
    teamName,
    isAuthenticated,
    setCurrentGame,
    hasGame,
    homePathForMembership,
    init,
    signIn,
    signOut,
    refreshProfile,
    dispose,
  }
})
