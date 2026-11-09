import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import LogWizardView from '@/features/drinkit/log/LogWizardView.vue'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { useDrinkLogWizardStore } from '@/stores/drinkLogWizard'
import type { DrinkitBarRow } from '@/types/drinkLog'

vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}))

vi.mock('@/lib/drinkLog/api', () => ({
  listDrinkitBars: vi.fn(async () => []),
  listDrinkitBarDrinks: vi.fn(async () => []),
  listDrinkitCompanions: vi.fn(async () => []),
  previewDrinkClaims: vi.fn(),
  submitDrink: vi.fn(),
  fetchBarBountyReminder: vi.fn(async () => null),
  fetchMyDrinkSubmission: vi.fn(),
  fetchCurrentBarBounty: vi.fn(),
  buildSubmitPayload: vi.fn(),
  buildDrinkPayloadDrink: vi.fn(),
}))

const bar: DrinkitBarRow = {
  bar_id: 'bar-1',
  canonical_key: 'test-bar',
  name: 'Test Bar',
  deck: 5,
}

describe('Drink It log wizard navigation', () => {
  let pinia: Pinia
  let router: Router
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
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/drinkit',
          name: 'drinkit-home',
          component: { template: '<div data-testid="home-page">Home</div>' },
        },
        { path: '/drinkit/log', name: 'drinkit-log', component: LogWizardView },
        {
          path: '/drinkit/gallery',
          name: 'drinkit-gallery',
          component: { template: '<div data-testid="gallery-page">Gallery</div>' },
        },
        {
          path: '/drinkit/achievements',
          name: 'drinkit-achievements',
          component: { template: '<div data-testid="achievements-page">Achievements</div>' },
        },
        {
          path: '/drinkit/wrapped',
          name: 'drinkit-wrapped',
          component: { template: '<div data-testid="wrapped-page">Wrapped</div>' },
        },
      ],
    })
    await router.push('/drinkit/log')
    await router.isReady()
    wrapper = mount(RouterView, {
      attachTo: document.body,
      global: {
        plugins: [pinia, router],
        stubs: { AppIcon: true },
      },
    })
    await flushPromises()
  })

  afterEach(() => {
    if (pinia) {
      setActivePinia(pinia)
      useAwardsModeStore().stop()
    }
    wrapper?.unmount()
    scrollTo?.mockRestore()
    localStorage.clear()
  })

  function wizard() {
    return useDrinkLogWizardStore()
  }

  async function draftOnDrink() {
    const store = wizard()
    store.selectedBar = bar
    store.step = 'drink'
    store.drinkSearch = 'cola'
    await flushPromises()
  }

  it('hides the back arrow on BAR and keeps Exit', async () => {
    expect(wrapper!.find('[data-testid="wizard-back"]').exists()).toBe(false)
    expect(wrapper!.find('[data-testid="wizard-back-spacer"]').exists()).toBe(true)
    expect(wrapper!.find('[data-testid="wizard-exit"]').exists()).toBe(true)

    await draftOnDrink()
    expect(wrapper!.find('[data-testid="wizard-back"]').exists()).toBe(true)
    expect(wrapper!.find('[data-testid="wizard-back-spacer"]').exists()).toBe(false)
    expect(wrapper!.find('[data-testid="wizard-exit"]').exists()).toBe(true)
  })

  it('returns to the previous step and keeps selections', async () => {
    await draftOnDrink()
    await wrapper!.get('[data-testid="wizard-back"]').trigger('click')
    const store = wizard()
    expect(store.step).toBe('bar')
    expect(store.selectedBar?.canonical_key).toBe('test-bar')
    expect(store.drinkSearch).toBe('cola')
    expect(wrapper!.find('[data-testid="wizard-back"]').exists()).toBe(false)

    store.selectedDrink = { mode: 'generic_beer', displayName: 'Beer' }
    store.step = 'friends'
    await flushPromises()
    await wrapper!.get('[data-testid="wizard-back"]').trigger('click')
    expect(store.step).toBe('drink')
    expect(store.selectedDrink?.displayName).toBe('Beer')
    expect(store.selectedBar?.canonical_key).toBe('test-bar')
  })

  it('resets scroll to the top when the step changes', async () => {
    scrollTop = 720
    wizard().step = 'drink'
    await flushPromises()
    expect(scrollTop).toBe(0)
    expect(scrollTo).toHaveBeenCalled()
    for (const call of scrollTo.mock.calls) {
      expect(call[0]).toEqual({ top: 0, left: 0, behavior: 'auto' })
    }

    scrollTo.mockClear()
    scrollTop = 540
    wizard().goBack()
    await flushPromises()
    expect(wizard().step).toBe('bar')
    expect(scrollTop).toBe(0)

    wizard().selectedBar = bar
    wizard().step = 'drink'
    await flushPromises()
    scrollTo.mockClear()
    scrollTop = 430
    await wrapper!.get('[data-testid="wizard-step-bar"]').trigger('click')
    await flushPromises()
    expect(wizard().step).toBe('bar')
    expect(wizard().selectedBar?.canonical_key).toBe('test-bar')
    expect(scrollTop).toBe(0)
  })

  it.each([
    ['home', 'drinkit-home', 'home-page'],
    ['gallery', 'drinkit-gallery', 'gallery-page'],
    ['achievements', 'drinkit-achievements', 'achievements-page'],
  ] as const)(
    'leaves the BAR step via %s without a confirmation',
    async (nav, routeName, pageId) => {
      wizard().selectedBar = bar
      expect(wizard().step).toBe('bar')
      await wrapper!.get(`[data-nav="${nav}"]`).trigger('click')
      await flushPromises()

      expect(wrapper!.find('[data-testid="modal-exit"]').exists()).toBe(false)
      expect(router.currentRoute.value.name).toBe(routeName)
      expect(wrapper!.find(`[data-testid="${pageId}"]`).exists()).toBe(true)
      expect(wizard().active).toBe(false)
      expect(wizard().selectedBar).toBeNull()
    },
  )

  it.each([
    ['home', 'drinkit-home', 'home-page'],
    ['gallery', 'drinkit-gallery', 'gallery-page'],
    ['achievements', 'drinkit-achievements', 'achievements-page'],
  ] as const)(
    'Exit and Discard after tapping %s finishes that navigation',
    async (nav, routeName, pageId) => {
      await draftOnDrink()
      await wrapper!.get(`[data-nav="${nav}"]`).trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.name).toBe('drinkit-log')
      expect(wrapper!.find('[data-testid="modal-exit"]').exists()).toBe(true)
      expect(wizard().selectedBar?.canonical_key).toBe('test-bar')

      await wrapper!.get('[data-testid="modal-primary"]').trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.name).toBe(routeName)
      expect(wrapper!.find(`[data-testid="${pageId}"]`).exists()).toBe(true)
      expect(wizard().active).toBe(false)
      expect(wizard().selectedBar).toBeNull()
    },
  )

  it('returning to BAR then leaving skips the confirmation', async () => {
    await draftOnDrink()
    await wrapper!.get('[data-testid="wizard-back"]').trigger('click')
    await flushPromises()
    expect(wizard().step).toBe('bar')
    expect(wizard().selectedBar?.canonical_key).toBe('test-bar')

    await wrapper!.get('[data-nav="home"]').trigger('click')
    await flushPromises()
    expect(wrapper!.find('[data-testid="modal-exit"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('drinkit-home')
    expect(wizard().active).toBe(false)
    expect(wizard().selectedBar).toBeNull()
  })

  it('header Exit on BAR goes home without a confirmation', async () => {
    wizard().selectedBar = bar
    await wrapper!.get('[data-testid="wizard-exit"]').trigger('click')
    await flushPromises()
    expect(wrapper!.find('[data-testid="modal-exit"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('drinkit-home')
    expect(wizard().active).toBe(false)
    expect(wizard().selectedBar).toBeNull()
  })

  it('browser Back from BAR leaves without a confirmation', async () => {
    wrapper?.unmount()
    await router.push('/drinkit')
    await router.push('/drinkit/log')
    await flushPromises()
    wrapper = mount(RouterView, {
      attachTo: document.body,
      global: {
        plugins: [pinia, router],
        stubs: { AppIcon: true },
      },
    })
    await flushPromises()
    wizard().selectedBar = bar
    expect(wizard().step).toBe('bar')

    await router.back()
    await flushPromises()
    expect(wrapper!.find('[data-testid="modal-exit"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('drinkit-home')
    expect(wizard().active).toBe(false)
    expect(wizard().selectedBar).toBeNull()
  })

  it('Exit and Discard from the header goes home and clears the draft', async () => {
    await draftOnDrink()
    await wrapper!.get('[data-testid="wizard-exit"]').trigger('click')
    expect(wrapper!.find('[data-testid="modal-exit"]').exists()).toBe(true)
    await wrapper!.get('[data-testid="modal-primary"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('drinkit-home')
    expect(wizard().active).toBe(false)
    expect(wizard().selectedBar).toBeNull()
  })

  it('Keep Editing cancels the pending navigation and keeps the draft', async () => {
    await draftOnDrink()
    await wrapper!.get('[data-nav="gallery"]').trigger('click')
    await flushPromises()
    await wrapper!.get('[data-testid="modal-secondary"]').trigger('click')

    expect(wrapper!.find('[data-testid="modal-exit"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('drinkit-log')
    expect(wizard().step).toBe('drink')
    expect(wizard().selectedBar?.canonical_key).toBe('test-bar')
    expect(wizard().drinkSearch).toBe('cola')
    expect(wizard().active).toBe(true)
  })

  it('rapid nav taps open one dialog and resume the latest destination', async () => {
    await draftOnDrink()
    await wrapper!.get('[data-nav="gallery"]').trigger('click')
    await wrapper!.get('[data-nav="home"]').trigger('click')
    await wrapper!.get('[data-nav="achievements"]').trigger('click')
    await flushPromises()

    expect(wrapper!.findAll('[data-testid="modal-exit"]')).toHaveLength(1)
    expect(router.currentRoute.value.name).toBe('drinkit-log')

    await wrapper!.get('[data-testid="modal-primary"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('drinkit-achievements')
    expect(wizard().active).toBe(false)
  })

  it('a second Exit and Discard click does not navigate twice', async () => {
    await draftOnDrink()
    await wrapper!.get('[data-testid="wizard-exit"]').trigger('click')
    const primary = wrapper!.get('[data-testid="modal-primary"]')
    await Promise.all([primary.trigger('click'), primary.trigger('click')])
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('drinkit-home')
    expect(wizard().active).toBe(false)
  })

  it('does not prompt or discard when staying on the log route', async () => {
    await draftOnDrink()
    await router.push({ name: 'drinkit-log', query: { from: 'plus' } })
    await flushPromises()
    expect(wrapper!.find('[data-testid="modal-exit"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('drinkit-log')
    expect(wizard().selectedBar?.canonical_key).toBe('test-bar')
    expect(wizard().active).toBe(true)
  })

  it('keeps the draft when the confirmed navigation is aborted', async () => {
    await draftOnDrink()
    router.beforeEach((to) => {
      if (to.name === 'drinkit-gallery') return false
    })
    await wrapper!.get('[data-nav="gallery"]').trigger('click')
    await flushPromises()
    expect(wrapper!.find('[data-testid="modal-exit"]').exists()).toBe(true)

    await wrapper!.get('[data-testid="modal-primary"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('drinkit-log')
    expect(wrapper!.find('[data-testid="modal-exit"]').exists()).toBe(false)
    expect(wizard().active).toBe(true)
    expect(wizard().step).toBe('drink')
    expect(wizard().selectedBar?.canonical_key).toBe('test-bar')
    expect(wizard().drinkSearch).toBe('cola')
  })

  it('blocks leave while an unknown submit is unresolved', async () => {
    await draftOnDrink()
    wizard().formLockedForUnknown = true
    await wrapper!.get('[data-nav="gallery"]').trigger('click')
    await flushPromises()
    expect(wrapper!.find('[data-testid="modal-unknown"]').exists()).toBe(true)
    expect(wrapper!.find('[data-testid="modal-exit"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('drinkit-log')
    expect(wizard().formLockedForUnknown).toBe(true)
    expect(wizard().selectedBar?.canonical_key).toBe('test-bar')
  })

  it('browser Back asks, and Exit and Discard returns to the previous page', async () => {
    wrapper?.unmount()
    await router.push('/drinkit')
    await router.push('/drinkit/log')
    await flushPromises()
    wrapper = mount(RouterView, {
      attachTo: document.body,
      global: {
        plugins: [pinia, router],
        stubs: { AppIcon: true },
      },
    })
    await flushPromises()
    await draftOnDrink()

    await router.back()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('drinkit-log')
    expect(wrapper!.find('[data-testid="modal-exit"]').exists()).toBe(true)

    await wrapper!.get('[data-testid="modal-secondary"]').trigger('click')
    expect(wizard().selectedBar?.canonical_key).toBe('test-bar')

    await router.back()
    await flushPromises()
    await wrapper!.get('[data-testid="modal-primary"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('drinkit-home')
    expect(wizard().active).toBe(false)
  })
})
