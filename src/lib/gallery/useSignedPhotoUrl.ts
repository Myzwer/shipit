/**
 * Vue binding for signed-photo lifecycle (Gallery + Wrapped).
 */
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import {
  createSignedPhotoController,
  type SignedPhotoState,
} from '@/lib/gallery/signedPhotoLifecycle'
import type { GameId } from '@/types/game'

export function useSignedPhotoUrl(options: {
  game: Ref<GameId> | (() => GameId)
  photoId: Ref<string | null | undefined> | (() => string | null | undefined)
  expiresSeconds?: number
  /** When false, caller starts manually (e.g. PhotoViewer). Default true. */
  autoStart?: boolean
}) {
  const url = ref<string | null>(null)
  const state = ref<SignedPhotoState>('idle')
  const permanentFailure = ref(false)
  const failureCode = ref<string | null>(null)

  const readGame = () =>
    typeof options.game === 'function' ? options.game() : options.game.value
  const readPhotoId = () =>
    typeof options.photoId === 'function' ? options.photoId() : options.photoId.value

  const controller = createSignedPhotoController({
    getGame: readGame,
    getPhotoId: readPhotoId,
    expiresSeconds: options.expiresSeconds,
  })

  function sync() {
    const snap = controller.getSnapshot()
    url.value = snap.url
    state.value = snap.state
    permanentFailure.value = snap.permanentFailure
    failureCode.value = snap.failureCode
  }

  const unsubscribe = controller.subscribe(sync)

  function onWindowOnline() {
    controller.onOnline()
  }

  function onDocVisibility() {
    controller.onVisibility()
  }

  onMounted(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onWindowOnline)
      document.addEventListener('visibilitychange', onDocVisibility)
    }
    if (options.autoStart !== false) controller.start()
    sync()
  })

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onWindowOnline)
      document.removeEventListener('visibilitychange', onDocVisibility)
    }
    controller.stop()
    unsubscribe()
  })

  watch(
    () => [readGame(), readPhotoId()] as const,
    () => {
      controller.stop()
      if (options.autoStart !== false) controller.start()
      sync()
    },
  )

  function onPhotoError() {
    controller.onImageError()
  }

  return {
    url,
    state,
    permanentFailure,
    failureCode,
    onPhotoError,
    reload: () => controller.reload({ force: true }),
    start: () => {
      controller.start()
      sync()
    },
    stop: () => controller.stop(),
  }
}
