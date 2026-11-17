import { describe, expect, it } from 'vitest'
import {
  normalizeReactionAuthorGroups,
  reactionAuthorGroupLabel,
  reactionAuthorsAreEmpty,
  REACTION_AUTHOR_ORDER,
} from '@/lib/gallery/reactionAuthors'

describe('reaction author grouping', () => {
  it('orders Love / Laugh / Live (heart, laugh, hang_loose)', () => {
    expect(REACTION_AUTHOR_ORDER).toEqual(['heart', 'laugh', 'hang_loose'])
    expect(reactionAuthorGroupLabel('heart')).toBe('Love')
    expect(reactionAuthorGroupLabel('laugh')).toBe('Laugh')
    expect(reactionAuthorGroupLabel('hang_loose')).toBe('Live')
  })

  it('alphabetizes names within each group and dedupes', () => {
    const groups = normalizeReactionAuthorGroups([
      { emoji: 'laugh', authors: ['Jordan', 'Dan', 'Josh', 'Jordan'] },
      { emoji: 'hang_loose', authors: ['Megan'] },
      { emoji: 'heart', authors: ['Katie', 'Cindy'] },
    ])
    expect(groups.map((g) => g.emoji)).toEqual(['heart', 'laugh', 'hang_loose'])
    expect(groups[0].authors).toEqual(['Cindy', 'Katie'])
    expect(groups[1].authors).toEqual(['Dan', 'Jordan', 'Josh'])
    expect(groups[2].authors).toEqual(['Megan'])
  })

  it('fills missing groups as empty and reports empty state', () => {
    const groups = normalizeReactionAuthorGroups([])
    expect(groups).toEqual([
      { emoji: 'heart', authors: [] },
      { emoji: 'laugh', authors: [] },
      { emoji: 'hang_loose', authors: [] },
    ])
    expect(reactionAuthorsAreEmpty(groups)).toBe(true)
  })

  it('ignores private-looking fields and non-string authors', () => {
    const groups = normalizeReactionAuthorGroups([
      {
        emoji: 'heart',
        authors: ['Alex', null, 12, ''],
        login_alias: 'secret',
        auth_user_id: 'uuid',
        email: 'a@b.c',
      },
    ])
    expect(groups[0].authors).toEqual(['Alex'])
    expect(JSON.stringify(groups)).not.toMatch(/login_alias|auth_user_id|email|secret|@/)
  })
})
