/**
 * Gallery reaction bar — short tap vs long-press author details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReactionBar from '@/features/gallery/ReactionBar.vue'
import type { GalleryReactionCounts } from '@/types/gallery'

const setGalleryReaction = vi.fn()
const fetchGalleryReactionAuthors = vi.fn()

vi.mock('@/lib/gallery/api', () => ({
  setGalleryReaction: (...args: unknown[]) => setGalleryReaction(...args),
  fetchGalleryReactionAuthors: (...args: unknown[]) => fetchGalleryReactionAuthors(...args),
}))

vi.mock('@/stores/session', () => ({
  useSessionStore: () => ({
    signOut: vi.fn(),
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
}))

const counts: GalleryReactionCounts = { heart: 1, laugh: 0, hang_loose: 2 }

function mountBar(overrides?: { myReaction?: 'heart' | 'laugh' | 'hang_loose' | null }) {
  return mount(ReactionBar, {
    props: {
      eventId: 'evt-1',
      reactions: { ...counts },
      myReaction: overrides?.myReaction ?? null,
      tone: 'pill',
    },
    attachTo: document.body,
  })
}

function pointer(el: Element, type: string, init: Partial<PointerEventInit> = {}) {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'touch',
      clientX: 10,
      clientY: 10,
      button: 0,
      ...init,
    }),
  )
}

describe('ReactionBar short tap vs long-press', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setGalleryReaction.mockReset()
    fetchGalleryReactionAuthors.mockReset()
    setGalleryReaction.mockResolvedValue({
      my_reaction: 'heart',
      reactions: { heart: 2, laugh: 0, hang_loose: 2 },
    })
    fetchGalleryReactionAuthors.mockResolvedValue({
      ok: true,
      event_id: 'evt-1',
      groups: [
        { emoji: 'heart', authors: ['Cindy', 'Katie'] },
        { emoji: 'laugh', authors: ['Dan', 'Jordan', 'Josh'] },
        { emoji: 'hang_loose', authors: ['Megan'] },
      ],
    })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('short tap toggles reaction and does not open modal', async () => {
    const w = mountBar()
    const btn = w.get('[data-testid="gallery-react-heart"]').element
    pointer(btn, 'pointerdown')
    pointer(btn, 'pointerup')
    await w.get('[data-testid="gallery-react-heart"]').trigger('click')
    await flushPromises()

    expect(setGalleryReaction).toHaveBeenCalledWith('evt-1', 'heart')
    expect(fetchGalleryReactionAuthors).not.toHaveBeenCalled()
    expect(w.find('[data-testid="gallery-reaction-authors-modal"]').exists()).toBe(false)
    w.unmount()
  })

  it('long-press opens modal without toggling reaction', async () => {
    const w = mountBar()
    const btn = w.get('[data-testid="gallery-react-laugh"]').element
    pointer(btn, 'pointerdown')
    await vi.advanceTimersByTimeAsync(560)
    await flushPromises()
    await nextTick()

    expect(fetchGalleryReactionAuthors).toHaveBeenCalledWith('evt-1')
    expect(setGalleryReaction).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="gallery-reaction-authors-modal"]')).toBeTruthy()

    // Synthetic click after hold must not toggle.
    pointer(btn, 'pointerup')
    btn.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    await flushPromises()
    expect(setGalleryReaction).not.toHaveBeenCalled()
    w.unmount()
  })

  it('lists Love, Laugh, Live with correct authors', async () => {
    const w = mountBar()
    const btn = w.get('[data-testid="gallery-react-heart"]').element
    pointer(btn, 'pointerdown')
    await vi.advanceTimersByTimeAsync(560)
    await flushPromises()
    await nextTick()

    const body = document.querySelector('[data-testid="gallery-reaction-authors-body"]')
    expect(body).toBeTruthy()
    const text = body!.textContent ?? ''
    const loveIdx = text.indexOf('Love')
    const laughIdx = text.indexOf('Laugh')
    const liveIdx = text.indexOf('Live')
    expect(loveIdx).toBeGreaterThanOrEqual(0)
    expect(laughIdx).toBeGreaterThan(loveIdx)
    expect(liveIdx).toBeGreaterThan(laughIdx)

    expect(
      document.querySelector('[data-testid="gallery-reaction-authors-list-heart"]')?.textContent,
    ).toContain('Cindy')
    expect(
      document.querySelector('[data-testid="gallery-reaction-authors-list-heart"]')?.textContent,
    ).toContain('Katie')
    expect(
      document.querySelector('[data-testid="gallery-reaction-authors-list-laugh"]')?.textContent,
    ).toContain('Josh')
    expect(
      document.querySelector('[data-testid="gallery-reaction-authors-list-laugh"]')?.textContent,
    ).toContain('Jordan')
    expect(
      document.querySelector('[data-testid="gallery-reaction-authors-list-laugh"]')?.textContent,
    ).toContain('Dan')
    expect(
      document.querySelector('[data-testid="gallery-reaction-authors-list-hang_loose"]')
        ?.textContent,
    ).toContain('Megan')
    w.unmount()
  })

  it('shows empty state when no reactions', async () => {
    fetchGalleryReactionAuthors.mockResolvedValueOnce({
      ok: true,
      event_id: 'evt-1',
      groups: [
        { emoji: 'heart', authors: [] },
        { emoji: 'laugh', authors: [] },
        { emoji: 'hang_loose', authors: [] },
      ],
    })
    const w = mountBar()
    await w.get('[data-testid="gallery-reaction-authors-open"]').trigger('click')
    await flushPromises()
    await nextTick()
    expect(
      document.querySelector('[data-testid="gallery-reaction-authors-empty"]')?.textContent,
    ).toMatch(/No reactions/)
    w.unmount()
  })

  it('keyboard/assistive control opens modal without reacting', async () => {
    const w = mountBar()
    await w.get('[data-testid="gallery-reaction-authors-open"]').trigger('click')
    await flushPromises()
    await nextTick()
    expect(fetchGalleryReactionAuthors).toHaveBeenCalledWith('evt-1')
    expect(setGalleryReaction).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="gallery-reaction-authors-modal"]')).toBeTruthy()
    w.unmount()
  })

  it('Escape and Close dismiss modal and restore focus path', async () => {
    const w = mountBar()
    const openBtn = w.get('[data-testid="gallery-reaction-authors-open"]')
    ;(openBtn.element as HTMLButtonElement).focus()
    await openBtn.trigger('click')
    await flushPromises()
    await nextTick()

    const closeEl = document.querySelector(
      '[data-testid="gallery-reaction-authors-close"]',
    ) as HTMLButtonElement | null
    expect(closeEl).toBeTruthy()
    expect(document.activeElement).toBe(closeEl)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(document.querySelector('[data-testid="gallery-reaction-authors-modal"]')).toBeNull()

    await openBtn.trigger('click')
    await flushPromises()
    await nextTick()
    document.querySelector('[data-testid="gallery-reaction-authors-close"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    await nextTick()
    expect(document.querySelector('[data-testid="gallery-reaction-authors-modal"]')).toBeNull()
    w.unmount()
  })

  it('movement during hold cancels long-press and preserves tap', async () => {
    const w = mountBar()
    const btn = w.get('[data-testid="gallery-react-hang_loose"]').element
    pointer(btn, 'pointerdown', { clientX: 10, clientY: 10 })
    pointer(btn, 'pointermove', { clientX: 40, clientY: 10 })
    await vi.advanceTimersByTimeAsync(600)
    await flushPromises()
    expect(fetchGalleryReactionAuthors).not.toHaveBeenCalled()

    pointer(btn, 'pointerup', { clientX: 40, clientY: 10 })
    await w.get('[data-testid="gallery-react-hang_loose"]').trigger('click')
    await flushPromises()
    expect(setGalleryReaction).toHaveBeenCalledWith('evt-1', 'hang_loose')
    w.unmount()
  })

  it('aria labels mention press-and-hold for reaction details', () => {
    const w = mountBar()
    const label = w.get('[data-testid="gallery-react-heart"]').attributes('aria-label') ?? ''
    expect(label.toLowerCase()).toContain('hold')
    expect(label.toLowerCase()).toContain('reacted')
    w.unmount()
  })
})
