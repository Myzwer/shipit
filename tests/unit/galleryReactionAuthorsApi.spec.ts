import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))

describe('fetchGalleryReactionAuthors', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('calls get_gallery_reaction_authors and normalizes groups', async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        event_id: 'e1',
        game: 'drinkit',
        groups: [
          { emoji: 'hang_loose', authors: ['Zed', 'Ann'] },
          { emoji: 'heart', authors: ['Bea'] },
        ],
      },
      error: null,
    })
    const { fetchGalleryReactionAuthors } = await import('@/lib/gallery/api')
    const result = await fetchGalleryReactionAuthors('e1')
    expect(rpc).toHaveBeenCalledWith('get_gallery_reaction_authors', { p_event_id: 'e1' })
    expect(result.groups.map((g) => g.emoji)).toEqual(['heart', 'laugh', 'hang_loose'])
    expect(result.groups[0].authors).toEqual(['Bea'])
    expect(result.groups[2].authors).toEqual(['Ann', 'Zed'])
    expect(JSON.stringify(result)).not.toMatch(/login_alias|auth_user_id|email/)
  })

  it('rejects unauthorized / missing event payloads', async () => {
    rpc.mockResolvedValue({
      data: { ok: false, code: 'GAME_MEMBERSHIP_REQUIRED' },
      error: null,
    })
    const { fetchGalleryReactionAuthors } = await import('@/lib/gallery/api')
    await expect(fetchGalleryReactionAuthors('e2')).rejects.toMatchObject({
      code: 'GAME_MEMBERSHIP_REQUIRED',
    })
  })
})
