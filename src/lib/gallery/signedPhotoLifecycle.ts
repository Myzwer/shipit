/**
 * Bounded signed-URL lifecycle for Gallery / Wrapped photos (REP-SIGNED-001).
 * Coalesces concurrent sign requests; proactive refresh before expiry; img-error recovery.
 * Never logs private image URLs.
 */
import { requestGalleryPhotoSignedUrl } from '@/lib/gallery/api'
import type { GameId } from '@/types/game'

export type SignedPhotoState = 'idle' | 'loading' | 'ready' | 'error'

export type SignedPhotoSnapshot = {
  url: string | null
  state: SignedPhotoState
  expiresAtMs: number | null
  permanentFailure: boolean
  failureCode: string | null
}

export type SignedPhotoController = {
  getSnapshot: () => SignedPhotoSnapshot
  subscribe: (listener: () => void) => () => void
  start: () => void
  stop: () => void
  reload: (opts?: { force?: boolean }) => Promise<void>
  onImageError: () => void
  onOnline: () => void
  onVisibility: () => void
}

type SignOutcome =
  | { ok: true; url: string; expiresIn: number }
  | { ok: false; permanent: boolean; code: string | null }

type LoadReason = 'start' | 'proactive' | 'img-error' | 'online' | 'visibility' | 'manual' | 'retry'

const DEFAULT_EXPIRES_SECONDS = 3600
/** Refresh before Storage TTL ends (not continuous / not every render). */
const REFRESH_MARGIN_MS = 90_000
const MIN_REFRESH_DELAY_MS = 5_000
const MAX_IMG_ERROR_RETRIES = 3
const MAX_TRANSIENT_RETRIES = 4
const RETRY_BASE_MS = 1_200

const inflight = new Map<string, Promise<SignOutcome>>()

function signKey(game: GameId, photoId: string, expiresSeconds: number) {
  return `${game}:${photoId}:${expiresSeconds}`
}

export async function signGalleryPhotoCoalesced(
  game: GameId,
  photoId: string,
  options?: { expiresSeconds?: number },
): Promise<SignOutcome> {
  const expiresSeconds = options?.expiresSeconds ?? DEFAULT_EXPIRES_SECONDS
  const key = signKey(game, photoId, expiresSeconds)
  const existing = inflight.get(key)
  if (existing) return existing

  const promise = (async (): Promise<SignOutcome> => {
    try {
      return await requestGalleryPhotoSignedUrl(game, photoId, { expiresSeconds })
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, promise)
  return promise
}

/** Test helper — clears coalescing map between cases. */
export function clearSignedPhotoInflightForTests() {
  inflight.clear()
}

export function createSignedPhotoController(options: {
  getGame: () => GameId
  getPhotoId: () => string | null | undefined
  expiresSeconds?: number
  now?: () => number
  /** Inject signer (unit tests / fault injection). */
  sign?: typeof signGalleryPhotoCoalesced
}): SignedPhotoController {
  const expiresSeconds = options.expiresSeconds ?? DEFAULT_EXPIRES_SECONDS
  const now = options.now ?? (() => Date.now())
  const sign = options.sign ?? signGalleryPhotoCoalesced

  let url: string | null = null
  let state: SignedPhotoState = 'idle'
  let expiresAtMs: number | null = null
  let permanentFailure = false
  let failureCode: string | null = null
  let generation = 0
  let stopped = true
  let inFlight = false
  let queuedReason: LoadReason | null = null
  let imgErrorRetries = 0
  let transientRetries = 0
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<() => void>()

  function emit() {
    for (const fn of listeners) fn()
  }

  function getSnapshot(): SignedPhotoSnapshot {
    return { url, state, expiresAtMs, permanentFailure, failureCode }
  }

  function clearRefreshTimer() {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  function clearRetryTimer() {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function scheduleProactiveRefresh() {
    clearRefreshTimer()
    if (stopped || permanentFailure || expiresAtMs == null) return
    const delay = Math.max(MIN_REFRESH_DELAY_MS, expiresAtMs - REFRESH_MARGIN_MS - now())
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void load('proactive')
    }, delay)
  }

  function scheduleTransientRetry(reason: LoadReason) {
    clearRetryTimer()
    if (stopped || permanentFailure) return
    if (transientRetries >= MAX_TRANSIENT_RETRIES) {
      if (!url) state = 'error'
      emit()
      return
    }
    const delay = RETRY_BASE_MS * 2 ** transientRetries
    transientRetries += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      void load(reason === 'img-error' ? 'retry' : reason)
    }, delay)
  }

  async function load(reason: LoadReason, opts?: { force?: boolean }) {
    if (stopped) return
    const photoId = options.getPhotoId()
    if (!photoId) {
      url = null
      state = 'idle'
      expiresAtMs = null
      permanentFailure = false
      failureCode = null
      clearRefreshTimer()
      clearRetryTimer()
      emit()
      return
    }

    if (permanentFailure && !opts?.force) return

    if (inFlight) {
      queuedReason = reason
      return
    }

    inFlight = true
    const myGen = ++generation
    const keepExisting = Boolean(url) && (reason === 'proactive' || reason === 'visibility')
    if (!keepExisting && reason !== 'proactive') {
      state = url ? 'ready' : 'loading'
      if (!url) emit()
      else if (reason === 'img-error') {
        state = 'loading'
        emit()
      }
    } else if (!url) {
      state = 'loading'
      emit()
    }

    try {
      const outcome = await sign(options.getGame(), photoId, { expiresSeconds })
      if (stopped || myGen !== generation) return

      if (outcome.ok) {
        url = outcome.url
        expiresAtMs = now() + outcome.expiresIn * 1000
        state = 'ready'
        permanentFailure = false
        failureCode = null
        imgErrorRetries = 0
        transientRetries = 0
        scheduleProactiveRefresh()
        emit()
        return
      }

      failureCode = outcome.code
      if (outcome.permanent) {
        permanentFailure = true
        url = null
        expiresAtMs = null
        state = 'error'
        clearRefreshTimer()
        emit()
        return
      }

      // Transient failure: keep a still-valid URL when refreshing early.
      if (keepExisting && url) {
        scheduleTransientRetry('retry')
        emit()
        return
      }

      if (!url) state = 'error'
      scheduleTransientRetry(reason === 'img-error' ? 'img-error' : 'retry')
      emit()
    } catch {
      if (stopped || myGen !== generation) return
      failureCode = 'NETWORK'
      if (keepExisting && url) {
        scheduleTransientRetry('retry')
        emit()
        return
      }
      if (!url) state = 'error'
      scheduleTransientRetry('retry')
      emit()
    } finally {
      inFlight = false
      if (!stopped && queuedReason) {
        const next = queuedReason
        queuedReason = null
        void load(next, { force: true })
      }
    }
  }

  function onImageError() {
    if (stopped || permanentFailure) return
    if (imgErrorRetries >= MAX_IMG_ERROR_RETRIES) {
      state = 'error'
      emit()
      return
    }
    imgErrorRetries += 1
    // Current bytes failed — drop URL so UI shows loading/error, then renew.
    url = null
    expiresAtMs = null
    void load('img-error', { force: true })
  }

  function onOnline() {
    if (stopped || permanentFailure) return
    if (state === 'error' || !url) {
      imgErrorRetries = 0
      transientRetries = 0
      void load('online', { force: true })
    }
  }

  function onVisibility() {
    if (stopped || permanentFailure) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    const expiredOrNear =
      expiresAtMs != null && now() >= expiresAtMs - REFRESH_MARGIN_MS
    if (expiredOrNear || state === 'error' || !url) {
      imgErrorRetries = 0
      transientRetries = 0
      void load('visibility', { force: true })
    }
  }

  function start() {
    stopped = false
    imgErrorRetries = 0
    transientRetries = 0
    permanentFailure = false
    failureCode = null
    void load('start')
  }

  function stop() {
    stopped = true
    generation += 1
    inFlight = false
    queuedReason = null
    clearRefreshTimer()
    clearRetryTimer()
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    getSnapshot,
    subscribe,
    start,
    stop,
    reload: async (opts) => {
      permanentFailure = false
      imgErrorRetries = 0
      transientRetries = 0
      await load('manual', { force: opts?.force ?? true })
    },
    onImageError,
    onOnline,
    onVisibility,
  }
}
