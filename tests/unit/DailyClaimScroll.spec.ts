import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { defineComponent } from 'vue'
import DailyClaimView from '@/features/drinkit/DailyClaimView.vue'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { useSessionStore } from '@/stores/session'

vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}))

vi.mock('@/lib/bounty/fetchHomeBounties', () => ({
  fetchHomeBountySnapshot: vi.fn(async () => ({
    cocktail: null,
    ingredient: null,
    bar: null,
    daily: {
      status: 'active',
      challenge_id: 'daily-1',
      cruise_day: 1,
      title: 'Tequila Shot',
      instructions: 'Take a shot.',
      location_name: 'Lido Bar',
      meeting_time_ship_local: null,
      is_all_hands: true,
      participation_mode: 'all_hands',
      admin_announcement: null,
      photo_required: true,
      points: 50,
      public_end_utc: '',
    },
  })),
}))

vi.mock('@/lib/media/stagePhoto', () => ({
  setPhotoFraming: vi.fn(async (_id: string, framing: unknown) => framing),
}))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
    }),
  }
})

const GameShellStub = defineComponent({
  name: 'GameShell',
  template: `<div data-testid="game-shell-stub"><slot name="header-actions" /><slot /></div>`,
})

const PhotoCaptureStub = defineComponent({
  name: 'PhotoCapture',
  emits: ['staged', 'local-ready', 'framing', 'busy'],
  mounted() {
    this.$emit('local-ready', { previewUrl: 'blob:mock', width: 120, height: 120 })
    this.$emit('framing', { zoom: 1, centerX: 0.5, centerY: 0.5 })
    this.$emit('staged', {
      photoId: 'photo-1',
      bucket: 'game-photos',
      storagePath: 'x',
      status: 'staged',
      mimeType: 'image/jpeg',
      width: 120,
      height: 120,
      byteSize: 10,
      framing: { zoom: 1, centerX: 0.5, centerY: 0.5 },
    })
    this.$emit('busy', false)
  },
  template: '<div data-testid="photo-capture-stub" />',
})

async function settleScroll() {
  await flushPromises()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await flushPromises()
}

describe('Daily Challenge step scroll reset', () => {
  let pinia: Pinia
  let wrapper: VueWrapper | undefined
  let scrollTop = 0
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    localStorage.clear()
    scrollTop = 0
    Object.defineProperty(document.documentElement, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value
      },
    })
    if (typeof HTMLElement.prototype.scrollTo !== 'function') {
      HTMLElement.prototype.scrollTo = function scrollTo() {}
    }
    scrollTo = vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(function (
      this: HTMLElement,
      options?: ScrollToOptions | number,
    ) {
      if (options && typeof options === 'object') this.scrollTop = options.top ?? 0
    })

    pinia = createPinia()
    setActivePinia(pinia)
    const session = useSessionStore()
    session.profile = {
      player_id: 'p1',
      display_name: 'Josh LastName',
      auth_user_id: 'a1',
      is_admin: false,
    } as never
    useAwardsModeStore().ensureStarted()

    wrapper = mount(DailyClaimView, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
        stubs: {
          AppIcon: true,
          GameShell: GameShellStub,
          PhotoCapture: PhotoCaptureStub,
          FramedPhoto: true,
          PhotoFramingEditor: true,
          Teleport: true,
        },
      },
    })
    await flushPromises()
  })

  afterEach(() => {
    wrapper?.unmount()
    scrollTo?.mockRestore()
    localStorage.clear()
  })

  async function reachCapture() {
    await wrapper!.get('[data-testid="daily-confirm-yes"]').trigger('click')
    await settleScroll()
    expect(wrapper!.find('[data-testid="daily-capture-step"]').exists()).toBe(true)
  }

  async function reachReview() {
    await reachCapture()
    await wrapper!.get('[data-testid="daily-caption"]').setValue('Scroll QA caption')
    scrollTo.mockClear()
    scrollTop = 680
    await wrapper!.get('[data-testid="daily-continue-review"]').trigger('click')
    await settleScroll()
  }

  it('resets scroll to the top when moving Photo → Review', async () => {
    await reachReview()
    expect(wrapper!.find('[data-testid="daily-review-step"]').exists()).toBe(true)
    expect(wrapper!.find('[data-testid="daily-review-title"]').exists()).toBe(true)
    expect(scrollTop).toBe(0)
    expect(scrollTo).toHaveBeenCalled()
    for (const call of scrollTo.mock.calls) {
      expect(call[0]).toEqual({ top: 0, left: 0, behavior: 'auto' })
    }
  })

  it('preserves caption and photo when Edit Caption returns to Photo', async () => {
    await reachReview()
    scrollTop = 420
    await wrapper!.get('[data-testid="review-edit-caption"]').trigger('click')
    await settleScroll()

    expect(wrapper!.find('[data-testid="daily-capture-step"]').exists()).toBe(true)
    expect((wrapper!.get('[data-testid="daily-caption"]').element as HTMLTextAreaElement).value).toBe(
      'Scroll QA caption',
    )
  })
})
