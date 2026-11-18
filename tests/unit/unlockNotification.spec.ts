import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { nextTick } from 'vue'
import { distinctUnlockCards } from '@/lib/achievements/unlockNotification'
import type { AchievementCard } from '@/types/achievements'
import type { GameId } from '@/types/game'

const { listAchievements, push } = vi.hoisted(() => ({
  listAchievements: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/lib/achievements/api', () => ({
  listAchievements: (...args: unknown[]) => listAchievements(...args),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

import AchievementUnlockPopup from '@/features/achievements/AchievementUnlockPopup.vue'
import { useAchievementCelebrationStore } from '@/stores/achievementCelebration'

const TITLES = {
  old: 'Placeholder Already Earned',
  one: 'Placeholder Alpha',
  two: 'Placeholder Bravo',
  three: 'Placeholder Charlie',
  four: 'Placeholder Delta',
  five: 'Placeholder Echo',
  twin: 'Placeholder Alpha Twin',
} as const

const DESCRIPTIONS = {
  old: 'Lorem ipsum already earned.',
  one: 'Lorem ipsum alpha joke.',
  two: 'Lorem ipsum bravo joke.',
  three: 'Lorem ipsum charlie joke.',
  four: 'Lorem ipsum delta joke.',
  five: 'Lorem ipsum echo joke.',
  twin: 'Lorem ipsum twin joke.',
} as const

function card(
  awardId: string | null,
  title: string,
  description: string,
  earned = true,
): AchievementCard {
  return {
    definition_id: `def-${awardId ?? title}`,
    stable_key: `key-${awardId ?? title}`,
    game: 'drinkit',
    group_key: 'other',
    exclusive: false,
    secret: false,
    icon_key: 'score.achievement',
    title,
    description,
    earned,
    awarded_at_utc: earned ? '2026-11-18T00:00:00.000Z' : null,
    award_id: awardId,
    progress: null,
    exclusive_claimed: false,
    exclusive_owner_name: null,
    masked: false,
    view: 'mine',
  }
}

function catalog(): AchievementCard[] {
  return [
    card('award-old', TITLES.old, DESCRIPTIONS.old, true),
    card('award-1', TITLES.one, DESCRIPTIONS.one, true),
    card('award-1', TITLES.twin, DESCRIPTIONS.twin, true),
    card('award-2', TITLES.two, DESCRIPTIONS.two, true),
    card('award-3', TITLES.three, DESCRIPTIONS.three, true),
    card('award-4', TITLES.four, DESCRIPTIONS.four, true),
    card('award-5', TITLES.five, DESCRIPTIONS.five, true),
    card('award-unearned', 'Placeholder Unearned', 'Lorem ipsum unearned.', false),
  ]
}

function surface(root: ParentNode): string {
  const chunks: string[] = []
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    chunks.push(el.textContent ?? '')
    for (const attr of [...el.attributes]) chunks.push(`${attr.name}=${attr.value}`)
  })
  return chunks.join('\n')
}

function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

describe('distinctUnlockCards', () => {
  it('counts each award id once and keeps first-seen order', () => {
    const cards = distinctUnlockCards([
      card('award-2', TITLES.two, DESCRIPTIONS.two),
      card('award-1', TITLES.one, DESCRIPTIONS.one),
      card('award-1', TITLES.twin, DESCRIPTIONS.twin),
      card(null, 'Placeholder Missing Id', 'Lorem ipsum missing.'),
    ])
    expect(cards.map((row) => row.award_id)).toEqual(['award-2', 'award-1'])
    expect(cards.map((row) => row.title)).toEqual([TITLES.two, TITLES.one])
  })
})

describe('achievement unlock notification', () => {
  let pinia: Pinia
  let wrapper: VueWrapper | null

  beforeEach(() => {
    installMatchMedia()
    sessionStorage.clear()
    listAchievements.mockReset()
    listAchievements.mockResolvedValue({
      ok: true,
      game: 'drinkit',
      view: 'mine',
      finale_revealed: false,
      achievements: catalog(),
    })
    push.mockReset()
    pinia = createPinia()
    setActivePinia(pinia)
    wrapper = null
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    sessionStorage.clear()
  })

  function store() {
    return useAchievementCelebrationStore()
  }

  async function mountPopup(game: GameId = 'drinkit') {
    wrapper = mount(AchievementUnlockPopup, {
      props: { game },
      attachTo: document.body,
      global: {
        plugins: [pinia],
        stubs: { AppIcon: { template: '<span />' } },
      },
    })
    await flushPromises()
    return wrapper
  }

  function popup(): HTMLElement | null {
    return document.querySelector('[data-testid="achievement-unlock-popup"]')
  }

  async function clickTestId(id: string) {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!(el instanceof HTMLElement)) throw new Error(`missing ${id}`)
    el.click()
    await flushPromises()
    await nextTick()
  }

  async function queueMounted(opts: {
    game?: GameId
    submissionId: string
    awardIds: string[]
  }) {
    store().queueFromSubmit({
      game: opts.game ?? 'drinkit',
      submissionId: opts.submissionId,
      awardIds: opts.awardIds,
    })
    await flushPromises()
    await nextTick()
  }

  it('does not open a notification when a submission awards nothing', async () => {
    await mountPopup()
    store().queueFromSubmit({
      game: 'drinkit',
      submissionId: 'sub-zero',
      awardIds: [],
    })
    store().queueFromSubmit({
      game: 'drinkit',
      submissionId: '',
      awardIds: ['award-1'],
    })
    await flushPromises()
    expect(store().pending).toBeNull()
    expect(store().open).toBe(false)
    expect(popup()).toBeNull()
    expect(listAchievements).not.toHaveBeenCalled()
  })

  it('preserves the single-award name, description, and See It action', async () => {
    await mountPopup('drinkit')
    await queueMounted({ submissionId: 'sub-one', awardIds: ['award-1', 'award-1'] })
    const root = popup()
    expect(root).not.toBeNull()
    expect(root?.getAttribute('data-mode')).toBe('single')
    expect(root?.classList.contains('theme-drink')).toBe(true)
    expect(root?.querySelector('[data-testid="achievement-unlock-title"]')?.textContent).toBe(
      'Achievement Unlocked!',
    )
    expect(root?.querySelector('[data-testid="achievement-unlock-item"]')?.textContent).toBe(
      TITLES.one,
    )
    expect(root?.querySelector('[data-testid="achievement-unlock-desc"]')?.textContent).toBe(
      DESCRIPTIONS.one,
    )
    expect(root?.querySelector('[data-testid="achievement-unlock-list"]')).toBeNull()
    expect(surface(root as HTMLElement)).not.toContain(TITLES.twin)
    expect(surface(root as HTMLElement)).not.toContain(DESCRIPTIONS.twin)
    expect(root?.querySelector('[data-testid="achievement-unlock-cta"]')?.textContent).toContain(
      'See It',
    )

    await clickTestId('achievement-unlock-cta')
    expect(push).toHaveBeenCalledWith({
      name: 'drinkit-achievements',
      query: { view: 'mine' },
    })
    expect(store().takeHandoffAwardIds()).toEqual(['award-1'])
    expect(popup()).toBeNull()
  })

  it.each([
    { count: 2, ids: ['award-1', 'award-2'], submissionId: 'sub-two' },
    { count: 3, ids: ['award-1', 'award-2', 'award-3'], submissionId: 'sub-three' },
    {
      count: 5,
      ids: ['award-1', 'award-2', 'award-3', 'award-4', 'award-5'],
      submissionId: 'sub-five',
    },
  ])(
    'shows one count notification for $count awards and hides names',
    async ({ count, ids, submissionId }) => {
      await mountPopup('shipit')
      await queueMounted({
        game: 'shipit',
        submissionId,
        awardIds: ids,
      })
      const root = popup()
      expect(document.querySelectorAll('[data-testid="achievement-unlock-popup"]')).toHaveLength(1)
      expect(root?.getAttribute('data-mode')).toBe('batch')
      expect(root?.classList.contains('theme-ship')).toBe(true)
      expect(root?.querySelector('[data-testid="achievement-unlock-title"]')?.textContent).toBe(
        `You unlocked ${count} achievements!`,
      )
      expect(root?.querySelector('[data-testid="achievement-unlock-item"]')).toBeNull()
      expect(root?.querySelector('[data-testid="achievement-unlock-desc"]')).toBeNull()
      expect(root?.querySelector('[data-testid="achievement-unlock-list"]')).toBeNull()
      const rendered = surface(root as HTMLElement)
      for (const title of Object.values(TITLES)) expect(rendered).not.toContain(title)
      for (const description of Object.values(DESCRIPTIONS)) {
        expect(rendered).not.toContain(description)
      }
      expect(root?.querySelector('[data-testid="achievement-unlock-cta"]')?.textContent).toContain(
        'See All',
      )
      expect(listAchievements).toHaveBeenCalledWith('shipit', 'mine')
    },
  )

  it('uses the same batch summary and See All route in Drink It!', async () => {
    await mountPopup('drinkit')
    await queueMounted({
      game: 'drinkit',
      submissionId: 'sub-drink-batch',
      awardIds: ['award-3', 'award-4', 'award-5'],
    })
    const root = popup()
    expect(root?.classList.contains('theme-drink')).toBe(true)
    expect(root?.querySelector('[data-testid="achievement-unlock-title"]')?.textContent).toBe(
      'You unlocked 3 achievements!',
    )
    expect(root?.querySelector('[data-testid="achievement-unlock-cta"]')?.textContent).toContain(
      'See All',
    )
    const rendered = surface(root as HTMLElement)
    expect(rendered).not.toContain(TITLES.three)
    expect(rendered).not.toContain(DESCRIPTIONS.five)
    await clickTestId('achievement-unlock-cta')
    expect(push).toHaveBeenCalledWith({
      name: 'drinkit-achievements',
      query: { view: 'mine' },
    })
  })

  it('keeps See All on the existing achievements route', async () => {
    await mountPopup('shipit')
    await queueMounted({
      game: 'shipit',
      submissionId: 'sub-see-all',
      awardIds: ['award-2', 'award-3', 'award-2'],
    })
    expect(store().visibleCards.map((row) => row.award_id)).toEqual(['award-2', 'award-3'])
    await clickTestId('achievement-unlock-cta')
    expect(push).toHaveBeenCalledWith({
      name: 'shipit-achievements',
      query: { view: 'mine' },
    })
    expect(store().takeHandoffAwardIds()).toEqual(['award-2', 'award-3'])
    expect(popup()).toBeNull()
  })

  it('still dismisses from the close button, backdrop, and Escape', async () => {
    await mountPopup()
    await queueMounted({
      submissionId: 'sub-dismiss',
      awardIds: ['award-1', 'award-2'],
    })
    expect(popup()).not.toBeNull()
    await flushPromises()
    expect(popup()).not.toBeNull()

    await clickTestId('achievement-unlock-close')
    expect(popup()).toBeNull()
    expect(store().open).toBe(false)
    expect(store().visibleCards).toEqual([])

    await queueMounted({
      submissionId: 'sub-backdrop',
      awardIds: ['award-3', 'award-4'],
    })
    expect(popup()?.textContent).toContain('You unlocked 2 achievements!')
    await clickTestId('achievement-unlock-backdrop')
    expect(popup()).toBeNull()

    await queueMounted({
      submissionId: 'sub-escape',
      awardIds: ['award-4', 'award-5', 'award-1'],
    })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await nextTick()
    expect(popup()).toBeNull()
    expect(store().pending).toBeNull()
  })

  it('does not merge a later submission into an earlier batch', async () => {
    store().queueFromSubmit({
      game: 'drinkit',
      submissionId: 'sub-first',
      awardIds: ['award-1', 'award-2'],
    })
    store().queueFromSubmit({
      game: 'drinkit',
      submissionId: 'sub-second',
      awardIds: ['award-4'],
    })
    expect(store().pending).toMatchObject({
      submissionId: 'sub-second',
      awardIds: ['award-4'],
    })

    await mountPopup('drinkit')
    await store().presentIfPending()
    await nextTick()
    const root = popup()
    expect(root?.getAttribute('data-mode')).toBe('single')
    expect(root?.textContent).toContain(TITLES.four)
    expect(surface(root as HTMLElement)).not.toContain(TITLES.one)
    expect(surface(root as HTMLElement)).not.toContain(TITLES.two)

    await clickTestId('achievement-unlock-close')
    await queueMounted({
      submissionId: 'sub-third',
      awardIds: ['award-2', 'award-3'],
    })
    expect(popup()?.textContent).toContain('You unlocked 2 achievements!')
    expect(surface(popup() as HTMLElement)).not.toContain(TITLES.four)
    expect(store().visibleCards.map((row) => row.award_id)).toEqual(['award-2', 'award-3'])
  })

  it('ignores previously earned and unearned rows when mapping a batch', async () => {
    store().queueFromSubmit({
      game: 'drinkit',
      submissionId: 'sub-map',
      awardIds: ['award-2', 'award-unearned', 'award-2', 'award-missing'],
    })
    expect(store().pending?.awardIds).toEqual(['award-2', 'award-unearned', 'award-missing'])
    await store().presentIfPending()
    expect(store().visibleCards.map((row) => row.award_id)).toEqual(['award-2'])
    expect(store().visibleCards.map((row) => row.title)).toEqual([TITLES.two])
    expect(store().open).toBe(true)
  })
})
