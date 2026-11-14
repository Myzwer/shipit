import { describe, expect, it } from 'vitest'
import { buildAllStatsRows, flattenAllStatsRows } from '@/lib/wrapped/buildAllStatsRows'
import {
  buildDrinkItFeatureSlides,
  buildShipItFeatureSlides,
} from '@/lib/wrapped/buildFeatureSlides'
import { buildWrappedIntroSlide } from '@/lib/wrapped/buildIntroSlide'
import {
  buildDrinkItLeaderboard,
  buildShipItLeaderboard,
  hasAchievementCounts,
} from '@/lib/wrapped/buildLeaderboardModes'
import {
  disambiguatePlayerName,
  formatCount,
  formatOrdinalPlace,
} from '@/lib/wrapped/entryLookup'
import {
  byLaugh,
  pickDistinctPhotos,
  toPhotoHighlight,
  type WrappedPhotoHighlight,
} from '@/lib/wrapped/photoHighlights'
import {
  DRINKIT_COLLECTIVE,
  DRINKIT_GLOBAL,
  DRINKIT_PERSONAL,
  SHIPIT_COLLECTIVE,
  SHIPIT_GLOBAL,
  SHIPIT_PERSONAL,
  type WrappedInventoryEntry,
} from '@/lib/wrapped/inventory'
import type { GalleryFeedEvent } from '@/types/gallery'
import type {
  WrappedEntry,
  WrappedLeaderboardRow,
  WrappedSections,
} from '@/types/wrapped'
import type { WrappedFeatureSlide, WrappedTextBlock } from '@/types/wrappedPlanC'

function entry(specId: string, label: string, overrides: Partial<WrappedEntry> = {}): WrappedEntry {
  return {
    spec_id: specId,
    label,
    available: true,
    kind: 'count',
    primary: '1',
    secondary: null,
    value_numeric: 1,
    unit: 'count',
    winners: [],
    items: [],
    photo: null,
    explanation: null,
    empty_reason: null,
    ...overrides,
  }
}

function count(specId: string, label: string, n: number, unit: string): WrappedEntry {
  return entry(specId, label, { primary: String(n), value_numeric: n, unit })
}

function named(
  specId: string,
  label: string,
  name: string,
  n: number,
  unit: string,
  detail: string | null = null,
): WrappedEntry {
  return entry(specId, label, {
    kind: 'named_count',
    primary: name,
    secondary: `${n} ${unit}`,
    value_numeric: n,
    unit,
    winners: [{ id: `${specId}-w`, name, value: n, detail }],
  })
}

function day(specId: string, label: string, dayNo: number, n: number, unit: string): WrappedEntry {
  return entry(specId, label, {
    kind: 'day_points',
    primary: `Day ${dayNo}`,
    secondary: `${n} ${unit}`,
    value_numeric: n,
    unit,
    items: [{ day: dayNo, label: `Day ${dayNo}`, value: n }],
  })
}

function unavailable(specId: string, label: string): WrappedEntry {
  return entry(specId, label, {
    available: false,
    primary: 'No qualifying data',
    value_numeric: null,
    empty_reason: 'no_qualifying_data',
  })
}

function emptySections(): WrappedSections {
  return { personal: [], global: [], collective: [] }
}

function drinkItSections(overrides: Partial<Record<string, WrappedEntry>> = {}): WrappedSections {
  const base: WrappedEntry[] = [
    count('DI-P01', 'Drinks Logged', 12, 'drinks'),
    count('DI-P10', 'Different Drinks Tried', 7, 'drinks'),
    named('DI-P12', 'Favorite Drink', 'Gin Fizz', 4, 'drinks'),
    named('DI-P13', 'Favorite Liquor', 'GIN', 6, 'drinks'),
    named('DI-P14', 'Favorite Ingredient', 'Lime', 5, 'drinks'),
    count('DI-P11', 'Bars Visited', 5, 'bars'),
    named('DI-P15', 'Favorite Bar', 'Crow’s Nest', 3, 'visits'),
    named('DI-P16', 'Partner in Crime', 'John L.', 2, 'drinks'),
    count('DI-P02', 'Total Points', 480, 'points'),
    entry('DI-P03', 'Final Rank', { kind: 'rank', primary: '2', secondary: 'of 11', value_numeric: 2 }),
    count('DI-P04', 'Achievements Unlocked', 3, 'achievements'),
    count('DI-P05', 'Bounties Completed', 5, 'bounties'),
    day('DI-P17', 'Biggest Day', 3, 200, 'points'),
    day('DI-P18', 'Most Active Day', 4, 6, 'drinks'),
  ]
  const personal = base.map((e) => overrides[e.spec_id] ?? e)
  return { ...emptySections(), personal }
}

function highlight(
  id: string,
  createdAt: string,
  reactions: { heart?: number; laugh?: number; hang_loose?: number } = {},
  extra: Partial<WrappedPhotoHighlight> = {},
): WrappedPhotoHighlight {
  return {
    photo: { photo_id: `photo-${id}`, width: 100, height: 100 },
    caption: `caption ${id}`,
    eventId: `event-${id}`,
    kind: 'drink_log',
    createdAtUtc: createdAt,
    reactions: { heart: 0, laugh: 0, hang_loose: 0, ...reactions },
    ownerTeamId: null,
    challengeId: null,
    challengeTitle: null,
    ...extra,
  }
}

function ids(slides: WrappedFeatureSlide[]): string[] {
  return slides.map((s) => s.id)
}

function blockText(block: WrappedTextBlock | undefined): string {
  if (!block) return ''
  return typeof block === 'string' ? block : block.map((s) => s.text).join('')
}

function slideText(slide: WrappedFeatureSlide): string {
  if (slide.type === 'photo') {
    return [slide.headline, slide.subhead, slide.caption].filter(Boolean).join(' ')
  }
  if (slide.type === 'double') {
    return [
      slide.headline,
      blockText(slide.lead),
      ...slide.heroes.flatMap((h) => [h.value, h.label ?? '', blockText(h.body)]),
      blockText(slide.footer),
    ].join(' ')
  }
  return [
    slide.headline,
    blockText(slide.lead),
    slide.heroValue,
    slide.heroLabel ?? '',
    ...slide.paragraphs.map(blockText),
    blockText(slide.footer),
  ].join(' ')
}

describe('Plan C Drink It! feature slides', () => {
  it('skips DI-01 when personal drinks are unavailable', () => {
    const sections = drinkItSections({ 'DI-P01': unavailable('DI-P01', 'Drinks Logged') })
    expect(ids(buildDrinkItFeatureSlides(sections, []))).not.toContain('DI-01')
  })

  it('skips DI-01 for zero drinks rather than boasting a zero', () => {
    const sections = drinkItSections({ 'DI-P01': count('DI-P01', 'Drinks Logged', 0, 'drinks') })
    expect(ids(buildDrinkItFeatureSlides(sections, []))).not.toContain('DI-01')
  })

  it('substitutes live values with correct grammar and no placeholder leakage', () => {
    const slides = buildDrinkItFeatureSlides(drinkItSections(), [], { eligibleBarTotal: 13 })
    expect(ids(slides)).toEqual(['DI-01', 'DI-02', 'DI-04', 'DI-05', 'DI-07'])

    const week = slides[0]
    expect(week?.type).toBe('single')
    if (week?.type === 'single') {
      expect(week.heroValue).toBe('12')
      expect(blockText(week.paragraphs[0])).toBe(
        'And you branched out! You tried 7 different drinks across the week!',
      )
    }

    const taste = slides.find((s) => s.id === 'DI-02')
    expect(taste?.type === 'single' && taste.heroLabel).toBe('Your favorite drink!')
    expect(taste?.type === 'single' && blockText(taste.paragraphs[0])).toBe(
      "You drank 4 of 'em!",
    )
    expect(taste?.type === 'single' && taste.paragraphs).toHaveLength(1)

    const hangouts = slides.find((s) => s.id === 'DI-04')
    expect(hangouts?.type === 'single' && hangouts.heroValue).toBe('5')
    expect(hangouts?.type === 'single' && hangouts.heroLabel).toBe('bars!')
    expect(hangouts?.type === 'single' && blockText(hangouts.paragraphs[0])).toMatch(
      /kept coming back to .+ where you enjoyed 3 drinks!/,
    )
    expect(slideText(hangouts!)).not.toMatch(/bestie|Partner|John/i)

    const competition = slides.find((s) => s.id === 'DI-05')
    expect(competition?.type === 'single' && blockText(competition.paragraphs[0])).toBe(
      'You finished in 2nd place, completing 5 bounties along the way!',
    )
    expect(slideText(competition!)).not.toMatch(/achievement/i)

    for (const slide of slides) {
      expect(slideText(slide)).not.toMatch(/undefined|null|\[object|<stat>|NaN/)
    }
  })

  it('skips favorite drink when logged fewer than twice', () => {
    const sections = drinkItSections({
      'DI-P12': named('DI-P12', 'Favorite Drink', 'Gin Fizz', 1, 'drinks'),
    })
    expect(ids(buildDrinkItFeatureSlides(sections, []))).not.toContain('DI-02')
  })

  it('omits the favorite-bar sentence when it was only logged once', () => {
    const sections = drinkItSections({
      'DI-P15': named('DI-P15', 'Favorite Bar', "Crow's Nest", 1, 'visits'),
    })
    const hangouts = buildDrinkItFeatureSlides(sections, []).find((s) => s.id === 'DI-04')
    expect(hangouts?.type === 'single' && hangouts.paragraphs).toHaveLength(0)
  })

  it('never features Partner in Crime on hangouts', () => {
    const hangouts = buildDrinkItFeatureSlides(drinkItSections(), []).find((s) => s.id === 'DI-04')
    expect(slideText(hangouts!)).not.toMatch(/bestie|Partner|John/i)
  })

  it('alternates warm and cool tones across included slides only', () => {
    const sections = drinkItSections({ 'DI-P12': unavailable('DI-P12', 'Favorite Drink') })
    const slides = buildDrinkItFeatureSlides(sections, [])
    expect(ids(slides)).toEqual(['DI-01', 'DI-04', 'DI-05', 'DI-07'])
    expect(slides.map((s) => s.tone)).toEqual(['warm', 'cool', 'warm', 'cool'])
  })

  it('builds a shared intro slide outside eligibility gating', () => {
    const intro = buildWrappedIntroSlide()
    expect(intro).toMatchObject({
      id: 'intro',
      type: 'intro',
      tone: 'cool',
      headline: 'What a Lovely Cruise',
      body: 'We did a lot this week. Swipe to see it all.',
      icon: 'theme.ship-it',
    })
    // Builders stay eligibility-only; the view prepends intro (UI totals 16 / 13).
    expect(ids(buildDrinkItFeatureSlides(drinkItSections(), []))).not.toContain('intro')
    expect(ids(buildShipItFeatureSlides(shipItSections(), []))).not.toContain('intro')
  })

  it('combines best days into one featured day when both records share a date', () => {
    const sections = drinkItSections({
      'DI-P17': day('DI-P17', 'Biggest Day', 3, 200, 'points'),
      'DI-P18': day('DI-P18', 'Most Active Day', 3, 6, 'drinks'),
    })
    const slide = buildDrinkItFeatureSlides(sections, []).find((s) => s.id === 'DI-07')
    expect(slide?.type).toBe('single')
    if (slide?.type === 'single') {
      expect(slide.headline).toBe('Now THAT was a day!')
      expect(slide.heroValue).toBe('Day 3')
      expect(blockText(slide.paragraphs[0])).toBe(
        'You earned 200 points and enjoyed 6 drinks!',
      )
    }
  })

  it('skips best days when the busiest day has fewer than two drinks', () => {
    const sections = drinkItSections({
      'DI-P18': day('DI-P18', 'Most Active Day', 4, 1, 'drinks'),
    })
    expect(ids(buildDrinkItFeatureSlides(sections, []))).not.toContain('DI-07')
  })

  it('skips DI-13 when the most-reacted photo was already featured as DI-06', () => {
    const first = highlight('first', '2026-11-01T12:00:00Z')
    const star = highlight('star', '2026-11-02T12:00:00Z', { laugh: 5, heart: 1 })
    const runnerUp = highlight('runner', '2026-11-03T12:00:00Z', { laugh: 2 })
    const slides = buildDrinkItFeatureSlides(emptySections(), [first, star, runnerUp])
    expect(ids(slides)).toContain('DI-06')
    expect(ids(slides)).not.toContain('DI-13')
  })

  it('keeps DI-06 and DI-08 distinct and requires at least one laugh', () => {
    const first = highlight('first', '2026-11-01T12:00:00Z')
    const a = highlight('a', '2026-11-02T12:00:00Z', { laugh: 4 })
    const b = highlight('b', '2026-11-03T12:00:00Z', { laugh: 2 })
    const none = highlight('none', '2026-11-04T12:00:00Z', { heart: 0 })
    const slides = buildDrinkItFeatureSlides(emptySections(), [first, a, b, none])
    const photoIds = slides.flatMap((s) => (s.type === 'photo' ? [s.photo.photo_id] : []))
    expect(new Set(photoIds).size).toBe(photoIds.length)
    expect(slides.find((s) => s.id === 'DI-06')).toMatchObject({ photo: { photo_id: 'photo-a' } })
    expect(slides.find((s) => s.id === 'DI-08')).toMatchObject({ photo: { photo_id: 'photo-b' } })
    expect(ids(slides)).not.toContain('DI-15')
  })

  it('picks the earliest photo for DI-03 and carries caption plus event id', () => {
    const late = highlight('late', '2026-11-05T12:00:00Z')
    const early = highlight('early', '2026-11-01T12:00:00Z')
    const slide = buildDrinkItFeatureSlides(emptySections(), [late, early]).find(
      (s) => s.id === 'DI-03',
    )
    expect(slide).toMatchObject({
      type: 'photo',
      caption: 'caption early',
      eventId: 'event-early',
    })
  })

  it('skips DI-03 when the gallery fetch was capped', () => {
    const slides = buildDrinkItFeatureSlides(
      emptySections(),
      [highlight('a', '2026-11-01T12:00:00Z')],
      { photoPoolComplete: false },
    )
    expect(ids(slides)).not.toContain('DI-03')
  })
})

function shipItSections(overrides: Partial<Record<string, WrappedEntry>> = {}): WrappedSections {
  const personal: WrappedEntry[] = [
    entry('SI-P01', 'Final Rank', { kind: 'rank', primary: '1', secondary: 'of 6', value_numeric: 1 }),
    count('SI-P02', 'Total Points', 900, 'points'),
    count('SI-P03', 'Challenges Completed', 9, 'challenges'),
    entry('SI-P04', 'Completion Percentage', { kind: 'percent', primary: '18%', value_numeric: 18 }),
    day('SI-P06', 'Biggest Day', 2, 450, 'points'),
    day('SI-P07', 'Most Active Day', 3, 4, 'challenges'),
  ].map((e) => overrides[e.spec_id] ?? e)
  const collective: WrappedEntry[] = [
    count('SI-C07', 'Uncompleted Challenges', 5, 'challenges'),
    entry('SI-C08', 'Uncompleted Challenge List', {
      kind: 'list',
      primary: '5',
      value_numeric: 5,
      items: [{ title: 'Find the duck', category: 'classic_ship_landmarks' }],
    }),
  ].map((e) => overrides[e.spec_id] ?? e)
  return { personal, global: [], collective }
}

describe('Plan C Ship It! feature slides', () => {
  it('shows SI-04 at exactly 400 points and 2 challenges', () => {
    const sections = shipItSections({
      'SI-P06': day('SI-P06', 'Biggest Day', 2, 400, 'points'),
      'SI-P07': day('SI-P07', 'Most Active Day', 3, 2, 'challenges'),
    })
    expect(ids(buildShipItFeatureSlides(sections, []))).toContain('SI-04')
  })

  it('skips SI-04 below the points threshold', () => {
    const sections = shipItSections({ 'SI-P06': day('SI-P06', 'Biggest Day', 2, 399, 'points') })
    expect(ids(buildShipItFeatureSlides(sections, []))).not.toContain('SI-04')
  })

  it('skips SI-04 below the challenge threshold', () => {
    const sections = shipItSections({ 'SI-P07': day('SI-P07', 'Most Active Day', 3, 1, 'challenges') })
    expect(ids(buildShipItFeatureSlides(sections, []))).not.toContain('SI-04')
  })

  it('skips SI-01 when the team completed zero challenges', () => {
    const sections = shipItSections({
      'SI-P03': count('SI-P03', 'Challenges Completed', 0, 'challenges'),
    })
    expect(ids(buildShipItFeatureSlides(sections, []))).not.toContain('SI-01')
  })

  it('uses the celebratory SI-12 variant when nothing is left unfinished', () => {
    const sections = shipItSections({
      'SI-C07': count('SI-C07', 'Uncompleted Challenges', 0, 'challenges'),
      'SI-C08': entry('SI-C08', 'Uncompleted Challenge List', {
        kind: 'list',
        primary: 'Every challenge was completed!',
        value_numeric: 0,
      }),
    })
    const slide = buildShipItFeatureSlides(sections, []).find((s) => s.id === 'SI-12')
    expect(slide?.type).toBe('single')
    if (slide?.type === 'single') {
      expect(slide.headline).toBe('Wait... you did WHAT?!')
      expect(slide.heroValue).toBe('0')
      expect(slide.heroLabel).toBe('challenges left unfinished!')
      expect(blockText(slide.paragraphs[0])).toBe(
        'Between all the teams, we managed to complete every single challenge!',
      )
      expect(slide.footer).toBeUndefined()
    }
  })

  it('uses the standard SI-12 copy when challenges remain, with singular grammar', () => {
    const normal = buildShipItFeatureSlides(shipItSections(), []).find((s) => s.id === 'SI-12')
    expect(normal?.type === 'single' && normal.headline).toBe("You can't win 'em all!")
    expect(normal?.type === 'single' && blockText(normal.paragraphs[0])).toBe(
      "These were the challenges nobody managed to complete. There's always next time!",
    )

    const one = buildShipItFeatureSlides(
      shipItSections({ 'SI-C07': count('SI-C07', 'Uncompleted Challenges', 1, 'challenges') }),
      [],
    ).find((s) => s.id === 'SI-12')
    expect(one?.type === 'single' && one.heroLabel).toBe('challenge left unfinished!')
  })

  it('skips SI-12 when there is no eligible challenge universe', () => {
    const sections = shipItSections({
      'SI-C08': unavailable('SI-C08', 'Uncompleted Challenge List'),
    })
    expect(ids(buildShipItFeatureSlides(sections, []))).not.toContain('SI-12')
  })

  it('skips SI-11 when it is the same photo as SI-02', () => {
    const photo = { photo_id: 'photo-only', width: 10, height: 10 }
    const sections = shipItSections()
    sections.personal.push(
      entry('SI-P08', 'First Challenge Completed', { kind: 'challenge_memory', photo }),
      entry('SI-P09', 'Last Challenge Completed', { kind: 'challenge_memory', photo }),
    )
    const slides = buildShipItFeatureSlides(sections, [])
    expect(ids(slides)).toContain('SI-02')
    expect(ids(slides)).not.toContain('SI-11')
  })

  it('matches SI-05 to a scavenger photo of the most popular challenge and skips otherwise', () => {
    const sections = shipItSections()
    sections.collective.push(
      entry('SI-C05', 'Most Popular Challenge', {
        kind: 'named_count',
        primary: 'Find the duck',
        value_numeric: 3,
        winners: [{ id: 'challenge-1', name: 'Find the duck', value: 3, detail: null }],
      }),
    )
    const match = highlight(
      'duck',
      '2026-11-05T12:00:00Z',
      {},
      { kind: 'scavenger', challengeId: 'challenge-1' },
    )
    const other = highlight(
      'other',
      '2026-11-06T12:00:00Z',
      {},
      { kind: 'scavenger', challengeId: 'challenge-2' },
    )
    expect(
      buildShipItFeatureSlides(sections, [match, other]).find((s) => s.id === 'SI-05'),
    ).toMatchObject({ photo: { photo_id: 'photo-duck' } })
    expect(ids(buildShipItFeatureSlides(sections, [other]))).not.toContain('SI-05')
  })

  it('skips records cards below the global thresholds', () => {
    const sections = shipItSections()
    sections.global.push(
      entry('SI-G05', 'Highest Single-Day Score', {
        kind: 'day_points',
        value_numeric: 399,
        winners: [{ id: 't1', name: 'Team One', value: 399, detail: 'Day 2' }],
      }),
      entry('SI-G06', 'Most Challenges in One Day', {
        kind: 'day_count',
        value_numeric: 5,
        winners: [{ id: 't1', name: 'Team One', value: 5, detail: 'Day 2' }],
      }),
    )
    expect(ids(buildShipItFeatureSlides(sections, []))).not.toContain('SI-09')
  })

  it('only uses the all-challenges category copy when totals prove completion', () => {
    const sections = shipItSections()
    sections.personal.push(
      entry('SI-P05', 'Most Completed Category', {
        kind: 'named_count',
        primary: 'Ship Landmarks',
        value_numeric: 4,
        unit: 'challenges',
        winners: [{ id: 'landmarks', name: 'Ship Landmarks', value: 4, detail: null }],
      }),
      count('SI-P10', 'Exclusive Challenges', 0, 'challenges'),
    )
    const partial = buildShipItFeatureSlides(sections, []).find((s) => s.id === 'SI-03')
    expect(partial?.type === 'single' && blockText(partial.paragraphs[0])).toBe(
      'You knocked out 4 challenges in this category!',
    )
    expect(partial?.type === 'single' && partial.paragraphs).toHaveLength(1)
    expect(slideText(partial!)).not.toMatch(/exclusive/i)

    const full = buildShipItFeatureSlides(sections, [], {
      categoryChallengeTotals: { landmarks: 4 },
    }).find((s) => s.id === 'SI-03')
    expect(full?.type === 'single' && blockText(full.paragraphs[0])).toBe(
      'You completed all 4 challenges in this category!',
    )
  })

  it('drops points and rank from the team adventure card', () => {
    const slide = buildShipItFeatureSlides(shipItSections(), []).find((s) => s.id === 'SI-01')
    expect(slide?.type === 'single' && slide.paragraphs).toHaveLength(1)
    expect(slide?.type === 'single' && blockText(slide.paragraphs[0])).toBe(
      "That's 18% of all available challenges!",
    )
    expect(slideText(slide!)).not.toMatch(/place|points/i)
  })

  it('combines SI-04 into one featured day when both records share a date', () => {
    const sections = shipItSections({
      'SI-P06': day('SI-P06', 'Biggest Day', 2, 450, 'points'),
      'SI-P07': day('SI-P07', 'Most Active Day', 2, 4, 'challenges'),
    })
    const slide = buildShipItFeatureSlides(sections, []).find((s) => s.id === 'SI-04')
    expect(slide?.type).toBe('single')
    if (slide?.type === 'single') {
      expect(slide.heroValue).toBe('Day 2')
      expect(blockText(slide.paragraphs[0])).toBe(
        'You earned 450 points and completed 4 challenges!',
      )
    }
  })
})

function row(
  id: string,
  name: string,
  rank: number,
  points: number,
  extra: Partial<WrappedLeaderboardRow> = {},
): WrappedLeaderboardRow {
  return { id, name, rank, points, metric_label: 'Bounties 1/28', ...extra }
}

describe('Plan C leaderboard modes', () => {
  const rows: WrappedLeaderboardRow[] = [
    row('a', 'Alex', 1, 500, { achievements: 2, bounty_claims: 4 }),
    row('b', 'Blake', 2, 400, { achievements: 7 }),
    row('c', 'Casey', 3, 300, { achievements: 7 }),
    row('d', 'Drew', 4, 100, { achievements: 1 }),
  ]

  it('keeps server ranks in Drink It! points mode', () => {
    const out = buildDrinkItLeaderboard(rows, 'points')
    expect(out.map((r) => [r.name, r.rank, r.points])).toEqual([
      ['Alex', 1, 500],
      ['Blake', 2, 400],
      ['Casey', 3, 300],
      ['Drew', 4, 100],
    ])
    expect(out[0]?.metricLabel).toBe('Bounties 1/28')
  })

  it('re-ranks Drink It! by achievements with competition ranks', () => {
    const out = buildDrinkItLeaderboard(rows, 'achievements')
    const total = out[0]?.metricLabel.match(/\/(\d+)/)?.[1]
    expect(total).toBeTruthy()
    expect(Number(total)).toBeGreaterThan(0)
    expect(out.map((r) => [r.name, r.rank, r.points, r.metricLabel])).toEqual([
      ['Blake', 1, 7, `7/${total} achievements`],
      ['Casey', 1, 7, `7/${total} achievements`],
      ['Alex', 3, 2, `2/${total} achievements`],
      ['Drew', 4, 1, `1/${total} achievement`],
    ])
  })

  it('treats missing achievement data as zero and reports it as unavailable', () => {
    const bare = [row('a', 'Alex', 1, 500), row('b', 'Blake', 2, 400)]
    expect(hasAchievementCounts(bare)).toBe(false)
    expect(hasAchievementCounts(bare, { a: 1, b: 2 })).toBe(true)
    const out = buildDrinkItLeaderboard(bare, 'achievements', { a: 1, b: 3 })
    expect(out.map((r) => r.name)).toEqual(['Blake', 'Alex'])
  })

  it('orders Ship It! challenges by completed then points, sharing ranks on ties', () => {
    const teams = [
      row('t1', 'Team One', 1, 900, { completed: 8, members: ['Jane Doe'] }),
      row('t2', 'Team Two', 2, 800, { completed: 10 }),
      row('t3', 'Team Three', 3, 700, { completed: 8 }),
    ]
    const challenges = buildShipItLeaderboard(teams, 'challenges')
    expect(challenges.map((r) => [r.name, r.rank, r.points, r.metricLabel])).toEqual([
      ['Team Two', 1, 10, '800 points'],
      ['Team One', 2, 8, '900 points'],
      ['Team Three', 2, 8, '700 points'],
    ])
    expect(challenges[1]?.members).toEqual(['Jane Doe'])

    const points = buildShipItLeaderboard(teams, 'points')
    expect(points.map((r) => [r.name, r.rank, r.points, r.metricLabel])).toEqual([
      ['Team One', 1, 900, 'Challenges: 8'],
      ['Team Two', 2, 800, 'Challenges: 10'],
      ['Team Three', 3, 700, 'Challenges: 8'],
    ])
  })
})

function galleryEvent(id: string, overrides: Partial<GalleryFeedEvent> = {}): GalleryFeedEvent {
  return {
    event_id: id,
    kind: 'drink_log',
    created_at_utc: '2026-11-02T12:00:00Z',
    created_ship_local: null,
    owner_player_id: null,
    owner_player_name: null,
    owner_team_id: null,
    owner_team_name: null,
    submission_id: null,
    caption: null,
    photo_id: `photo-${id}`,
    display: {},
    reactions: { heart: 0, laugh: 0, hang_loose: 0 },
    my_reaction: null,
    ...overrides,
  }
}

describe('Plan C photo highlights', () => {
  it('excludes achievements and posts without a real photo', () => {
    expect(toPhotoHighlight(galleryEvent('a', { kind: 'achievement' }))).toBeNull()
    expect(toPhotoHighlight(galleryEvent('b', { photo_id: null }))).toBeNull()
    expect(toPhotoHighlight(galleryEvent('c'))).not.toBeNull()
  })

  it('maps framing and dimensions onto the wrapped photo', () => {
    const mapped = toPhotoHighlight(
      galleryEvent('f', {
        photo_width: 800,
        photo_height: 600,
        photo_framing: { zoom: 2, center_x: 0.4, center_y: 0.6 },
        caption: '  hello  ',
      }),
    )
    expect(mapped?.photo).toEqual({
      photo_id: 'photo-f',
      width: 800,
      height: 600,
      crop_zoom: 2,
      crop_center_x: 0.4,
      crop_center_y: 0.6,
    })
    expect(mapped?.caption).toBe('hello')
  })

  it('breaks reaction ties by newest upload, then event id', () => {
    const older = highlight('a', '2026-11-01T12:00:00Z', { laugh: 3 })
    const newer = highlight('b', '2026-11-02T12:00:00Z', { laugh: 3 })
    const sameTimeLowId = highlight('0', '2026-11-02T12:00:00Z', { laugh: 3 })
    expect(byLaugh([older, newer, sameTimeLowId]).map((h) => h.eventId)).toEqual([
      'event-0',
      'event-b',
      'event-a',
    ])
  })

  it('dedupes by photo id', () => {
    const first = highlight('a', '2026-11-01T12:00:00Z', { laugh: 3 })
    const dupe = { ...highlight('z', '2026-11-02T12:00:00Z', { laugh: 2 }), photo: first.photo }
    const other = highlight('b', '2026-11-03T12:00:00Z', { laugh: 1 })
    expect(pickDistinctPhotos([first, dupe, other], 2).map((h) => h.eventId)).toEqual([
      'event-a',
      'event-b',
    ])
  })
})

describe('Plan C entry helpers', () => {
  it('formats counts, ordinals and names', () => {
    expect(formatCount(1, 'drink')).toBe('1 drink')
    expect(formatCount(2, 'drink')).toBe('2 drinks')
    expect(formatCount(1200, 'bounty', 'bounties')).toBe('1,200 bounties')
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(formatOrdinalPlace)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '103rd',
    ])
    expect(disambiguatePlayerName('David F.', ['David F.', 'David B.'])).toBe('David F.')
    expect(disambiguatePlayerName('David Fox', ['David Fox', 'David Bell'])).toBe('David F.')
    expect(disambiguatePlayerName('David', ['David', 'Dana'])).toBe('David')
    expect(disambiguatePlayerName('Dana Fox', ['Dana Fox', 'David Bell'])).toBe('Dana Fox')
  })
})

describe('Plan C All Stats rows', () => {
  function sectionsFor(
    personal: WrappedInventoryEntry[],
    global: WrappedInventoryEntry[],
    collective: WrappedInventoryEntry[],
  ): WrappedSections {
    const toEntry = (i: WrappedInventoryEntry) => entry(i.specId, i.label)
    return {
      personal: personal.map(toEntry),
      global: global.map(toEntry),
      collective: collective.map(toEntry),
    }
  }

  it('surfaces every Drink It! metric exactly once (18 mine, 28 ours)', () => {
    const sections = sectionsFor(DRINKIT_PERSONAL, DRINKIT_GLOBAL, DRINKIT_COLLECTIVE)
    const mine = flattenAllStatsRows(buildAllStatsRows('drinkit', sections, 'mine'))
    const ours = flattenAllStatsRows(buildAllStatsRows('drinkit', sections, 'ours'))
    expect(mine.map((r) => r.specId).sort()).toEqual(DRINKIT_PERSONAL.map((e) => e.specId).sort())
    expect(ours).toHaveLength(28)
    expect(new Set(ours.map((r) => r.specId)).size).toBe(28)
    expect(buildAllStatsRows('drinkit', sections, 'ours').map((g) => g.heading)).toEqual([
      'Crew Totals',
      'Crew Favorites',
      'Crew Awards',
      'Records',
    ])
  })

  it('surfaces every Ship It! metric exactly once (10 mine, 24 ours)', () => {
    const sections = sectionsFor(SHIPIT_PERSONAL, SHIPIT_GLOBAL, SHIPIT_COLLECTIVE)
    const mine = flattenAllStatsRows(buildAllStatsRows('shipit', sections, 'mine'))
    const ours = flattenAllStatsRows(buildAllStatsRows('shipit', sections, 'ours'))
    expect(mine).toHaveLength(10)
    expect(ours).toHaveLength(24)
    expect(ours.some((r) => r.specId === 'SI-C12')).toBe(true)
  })

  it('formats tied winners, standings and unavailable rows', () => {
    const sections: WrappedSections = {
      personal: [],
      global: [
        entry('DI-G02', 'Most Drinks Logged', {
          kind: 'winners',
          primary: 'Cindy, Dan',
          secondary: '7 drinks',
          unit: 'drinks',
          winners: [
            { id: '1', name: 'Cindy', value: 7, detail: null },
            { id: '2', name: 'Dan', value: 7, detail: null },
          ],
        }),
        unavailable('DI-G12', 'Most Frequent Drinking Pair'),
      ],
      collective: [
        entry('SI-C12', 'Final Team Standings', {
          kind: 'standings',
          primary: '2',
          value_numeric: 2,
          items: [
            { rank: 1, id: 'a', name: 'Team One', points: 900 },
            { rank: 2, id: 'b', name: 'Team Two', points: 800 },
          ],
        }),
      ],
    }
    const drinkRows = flattenAllStatsRows(buildAllStatsRows('drinkit', sections, 'ours'))
    expect(drinkRows.find((r) => r.specId === 'DI-G02')).toMatchObject({
      value: 'Cindy & Dan (tied)',
      detail: '7 Drinks',
    })
    expect(drinkRows.find((r) => r.specId === 'DI-G12')).toMatchObject({
      value: 'No qualifying data',
      available: false,
    })

    const shipRows = flattenAllStatsRows(buildAllStatsRows('shipit', sections, 'ours'))
    const standings = shipRows.find((r) => r.specId === 'SI-C12')
    expect(standings?.value).toBe('2 Teams')
    expect(standings?.expandable).toBe(true)
    expect(standings?.items?.[0]).toEqual({ label: '1. Team One', detail: '900 Points' })
  })

  it('presents count, rank, and named results as self-explanatory values', () => {
    const sections: WrappedSections = {
      personal: [
        count('DI-P01', 'Drinks Logged', 9, 'drinks'),
        count('DI-P02', 'Total Points', 1450, 'points'),
        count('DI-P06', 'Cocktail Bounties Completed', 4, 'bounties'),
        count('DI-P04', 'Achievements Unlocked', 1, 'achievements'),
        entry('DI-P03', 'Final Rank', {
          kind: 'rank',
          primary: '3',
          secondary: 'of 11',
          value_numeric: 3,
          unit: 'rank',
        }),
        named('DI-P16', 'Partner in Crime', 'Katie', 7, 'drinks'),
        named('DI-P15', 'Favorite Bar', 'Crooners', 42, 'drinks'),
      ],
      global: [],
      collective: [
        named('DI-C08', 'Most Popular Bar', 'Crooners', 42, 'drinks'),
      ],
    }

    const mine = flattenAllStatsRows(buildAllStatsRows('drinkit', sections, 'mine'))
    const drinks = mine.find((r) => r.specId === 'DI-P01')
    expect(drinks?.value).toBe('9 Drinks')
    expect(drinks?.detail).toBeUndefined()
    expect(mine.find((r) => r.specId === 'DI-P02')).toMatchObject({ value: '1,450 Points' })
    expect(mine.find((r) => r.specId === 'DI-P06')).toMatchObject({ value: '4 Cocktail Bounties' })
    expect(mine.find((r) => r.specId === 'DI-P04')).toMatchObject({ value: '1 Achievement' })
    expect(mine.find((r) => r.specId === 'DI-P03')).toMatchObject({
      value: '3rd Place',
      detail: 'Out of 11 players.',
    })
    expect(mine.find((r) => r.specId === 'DI-P16')).toMatchObject({
      value: 'Katie',
      detail: 'Shared 7 drinks together.',
    })
    expect(mine.find((r) => r.specId === 'DI-P15')).toMatchObject({
      value: 'Crooners',
      detail: '42 Drinks',
    })

    const ours = flattenAllStatsRows(buildAllStatsRows('drinkit', sections, 'ours'))
    expect(ours.find((r) => r.specId === 'DI-C08')).toMatchObject({
      value: 'Crooners',
      detail: '42 Drinks',
    })
  })
})
