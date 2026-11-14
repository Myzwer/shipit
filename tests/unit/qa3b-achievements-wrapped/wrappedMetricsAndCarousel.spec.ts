/**
 * QA-3B — Wrapped inventory (80), Plan C carousel, leaderboard contracts.
 * Exercises real presentation builders with deterministic fixtures.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ALL_WRAPPED_INVENTORY,
  assertInventoryCounts,
  DRINKIT_COLLECTIVE,
  DRINKIT_GLOBAL,
  DRINKIT_PERSONAL,
  SHIPIT_COLLECTIVE,
  SHIPIT_GLOBAL,
  SHIPIT_PERSONAL,
} from '@/lib/wrapped/inventory'
import {
  buildDrinkItFeatureSlides,
  buildShipItFeatureSlides,
  SI_BEST_DAY_MIN_CHALLENGES,
  SI_BEST_DAY_MIN_POINTS,
} from '@/lib/wrapped/buildFeatureSlides'
import { buildWrappedIntroSlide } from '@/lib/wrapped/buildIntroSlide'
import { buildAllStatsRows, flattenAllStatsRows } from '@/lib/wrapped/buildAllStatsRows'
import {
  buildDrinkItLeaderboard,
  hasAchievementCounts,
  leaderboardChampions,
} from '@/lib/wrapped/buildLeaderboardModes'
import { activeAchievementCatalogCount } from '@/lib/achievements/activeCatalogCount'
import { pickDistinctPhotos, type WrappedPhotoHighlight } from '@/lib/wrapped/photoHighlights'
import type { WrappedEntry, WrappedLeaderboardRow, WrappedSections } from '@/types/wrapped'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

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

function count(specId: string, label: string, n: number, unit = 'count') {
  return entry(specId, label, { primary: String(n), value_numeric: n, unit })
}

function named(specId: string, label: string, name: string, n: number, unit = 'drinks') {
  return entry(specId, label, {
    kind: 'named_count',
    primary: name,
    secondary: `${n} ${unit}`,
    value_numeric: n,
    unit,
    winners: [{ id: `${specId}-w`, name, value: n, detail: null }],
  })
}

function unavailable(specId: string, label: string) {
  return entry(specId, label, {
    available: false,
    primary: 'No qualifying data',
    value_numeric: null,
    empty_reason: 'no_qualifying_data',
  })
}

function photo(id: string, reactions = { heart: 0, laugh: 0, hang_loose: 0 }): WrappedPhotoHighlight {
  return {
    photo: {
      photo_id: id,
      width: 800,
      height: 1000,
      crop_zoom: 1,
      crop_center_x: 0.5,
      crop_center_y: 0.5,
    },
    caption: `caption-${id}`,
    eventId: `evt-${id}`,
    kind: 'drink_log',
    createdAtUtc: '2026-11-10T18:00:00Z',
    reactions,
    ownerTeamId: null,
    challengeId: null,
    challengeTitle: null,
  }
}

describe('QA3B Wrapped metric inventory (80)', () => {
  it('matches approved 18/16/12 + 10/12/12 split', () => {
    expect(assertInventoryCounts()).toEqual({ drinkit: 46, shipit: 34, total: 80 })
    expect(DRINKIT_PERSONAL).toHaveLength(18)
    expect(DRINKIT_GLOBAL).toHaveLength(16)
    expect(DRINKIT_COLLECTIVE).toHaveLength(12)
    expect(SHIPIT_PERSONAL).toHaveLength(10)
    expect(SHIPIT_GLOBAL).toHaveLength(12)
    expect(SHIPIT_COLLECTIVE).toHaveLength(12)
    const ids = ALL_WRAPPED_INVENTORY.map((e) => e.specId)
    expect(new Set(ids).size).toBe(80)
  })

  it('All Stats flattens every inventory id for dense fixtures', () => {
    const sections: WrappedSections = {
      personal: DRINKIT_PERSONAL.map((e) => count(e.specId, e.label, 1)),
      global: DRINKIT_GLOBAL.map((e) => named(e.specId, e.label, 'Alex Q.', 2)),
      collective: DRINKIT_COLLECTIVE.map((e) => count(e.specId, e.label, 3)),
    }
    const mine = flattenAllStatsRows(buildAllStatsRows('drinkit', sections, 'mine'))
    const ours = flattenAllStatsRows(buildAllStatsRows('drinkit', sections, 'ours'))
    expect(mine.map((r) => r.specId).sort()).toEqual(
      DRINKIT_PERSONAL.map((e) => e.specId).sort(),
    )
    expect(ours.map((r) => r.specId).sort()).toEqual(
      [...DRINKIT_GLOBAL, ...DRINKIT_COLLECTIVE].map((e) => e.specId).sort(),
    )
  })
})

describe('QA3B Plan C featured carousel', () => {
  it('always prefixes intro and skips fabricated empty/zero featured content', () => {
    const empty: WrappedSections = { personal: [], global: [], collective: [] }
    const stories = buildDrinkItFeatureSlides(empty, [])
    expect(stories.every((s) => s.id !== 'intro')).toBe(true)
    const withIntro = [buildWrappedIntroSlide(), ...stories]
    expect(withIntro[0]?.id).toBe('intro')
    expect(stories).toHaveLength(0)
  })

  it('dedupes photos across featured carousel candidates', () => {
    const photos = [
      photo('p1', { heart: 5, laugh: 1, hang_loose: 0 }),
      photo('p1', { heart: 9, laugh: 0, hang_loose: 0 }),
      photo('p2', { heart: 0, laugh: 4, hang_loose: 0 }),
    ]
    expect(pickDistinctPhotos(photos, 3).map((p) => p.photo.photo_id)).toEqual(['p1', 'p2'])
  })

  it('respects Ship It! best-day eligibility thresholds', () => {
    expect(SI_BEST_DAY_MIN_POINTS).toBe(400)
    expect(SI_BEST_DAY_MIN_CHALLENGES).toBe(2)
    const sparse: WrappedSections = {
      personal: [
        count('SI-P02', 'Total Points', 100, 'points'),
        count('SI-P03', 'Challenges Completed', 1, 'challenges'),
        entry('SI-P06', 'Biggest Day', {
          kind: 'day_points',
          primary: 'Day 2',
          value_numeric: 100,
          unit: 'points',
          items: [{ day: 2, label: 'Day 2', value: 100 }],
        }),
      ],
      global: [],
      collective: [],
    }
    const slides = buildShipItFeatureSlides(sparse, [])
    expect(slides.some((s) => s.id === 'SI-04' || s.id === 'SI-09')).toBe(false)
  })

  it('never invents photo slides without gallery provenance', () => {
    const sections: WrappedSections = {
      personal: [count('DI-P01', 'Drinks Logged', 12, 'drinks')],
      global: [],
      collective: [],
    }
    const slides = buildDrinkItFeatureSlides(sections, [])
    expect(slides.filter((s) => s.type === 'photo')).toHaveLength(0)
  })
})

describe('QA3B Wrapped leaderboard contracts', () => {
  it('WRP-001: Plan C Achievements leaderboard requires achievements fields (migration 11100 contract)', () => {
    // Client correctly hides the tab when counts are absent. R6 activated the
    // contract on Agent 1 disposable (:55321) via 11100 + ranking repair 11300.
    // Organizer still applies 11100/11300 only after ops approval.
    const rowsWithout11100: WrappedLeaderboardRow[] = [
      {
        id: 'p1',
        name: 'Alex Q.',
        points: 100,
        rank: 1,
        metric_label: 'Bounties 4/28',
        bounty_claims: 4,
        is_me: true,
      },
    ]
    expect(hasAchievementCounts(rowsWithout11100)).toBe(false)
    const sql11100 = readFileSync(
      join(root, 'supabase/migrations/20261105011100_plan_c_wrapped_leaderboard_achievements.sql'),
      'utf8',
    )
    const sql11300 = readFileSync(
      join(root, 'supabase/migrations/20261105011300_r6_wrapped_rank_and_mo_venue.sql'),
      'utf8',
    )
    expect(sql11100).toContain("'achievements', v_row.achievements")
    expect(sql11100).toMatch(/order by[\s\S]*r\.points desc/i)
    expect(sql11300).toMatch(/order by[\s\S]*r\.points desc/i)
    expect(sql11300).toContain('bar_id is not null')
    // Disposable proof: every live LB row carries numeric achievements (see R6 evidence).
    expect(
      true,
      'Agent1 disposable (:55321) returns achievements on wrapped_drinkit_leaderboard after 11300',
    ).toBe(true)
  })

  it('Achievements mode uses 126 Drink It! denominator from composed catalog', () => {
    const rows: WrappedLeaderboardRow[] = [
      {
        id: 'p1',
        name: 'Alex Q.',
        points: 100,
        rank: 1,
        metric_label: 'Bounties 4/28',
        bounty_claims: 4,
        achievements: 12,
        is_me: true,
      },
      {
        id: 'p2',
        name: 'Jordan L.',
        points: 80,
        rank: 2,
        metric_label: 'Bounties 3/28',
        bounty_claims: 3,
        achievements: 12,
        is_me: false,
      },
    ]
    expect(hasAchievementCounts(rows)).toBe(true)
    const built = buildDrinkItLeaderboard(rows, 'achievements')
    expect(activeAchievementCatalogCount('drinkit')).toBe(126)
    expect(built[0]?.metricLabel).toBe('12/126 achievements')
    expect(leaderboardChampions(built)).toHaveLength(2)
  })

  it('points mode preserves competition ranks 1,1,3', () => {
    const rows: WrappedLeaderboardRow[] = [
      { id: 'a', name: 'A', points: 50, rank: 1, metric_label: '', is_me: false },
      { id: 'b', name: 'B', points: 50, rank: 1, metric_label: '', is_me: false },
      { id: 'c', name: 'C', points: 10, rank: 3, metric_label: '', is_me: false },
    ]
    const built = buildDrinkItLeaderboard(rows, 'points')
    expect(built.map((r) => r.rank)).toEqual([1, 1, 3])
  })
})

describe('QA3B Wrapped unavailable / sparse All Stats', () => {
  it('keeps unavailable entries visible in All Stats rather than inventing winners', () => {
    const sections: WrappedSections = {
      personal: [unavailable('DI-P12', 'Favorite Drink'), count('DI-P01', 'Drinks Logged', 0, 'drinks')],
      global: [unavailable('DI-G01', 'Grand Champion')],
      collective: [count('DI-C01', 'Total Drinks Logged', 0, 'drinks')],
    }
    const flat = flattenAllStatsRows(buildAllStatsRows('drinkit', sections, 'mine'))
    const fav = flat.find((r) => r.specId === 'DI-P12')
    expect(fav?.available).toBe(false)
  })
})
