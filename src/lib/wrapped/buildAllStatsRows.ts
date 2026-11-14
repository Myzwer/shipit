import { AWARD_ICONS, PERSONAL_ICONS } from '@/lib/wrapped/buildFinalCards'
import {
  entryById,
  formatCount,
  formatNumber,
  formatOrdinalPlace,
  numericValue,
  winnerList,
} from '@/lib/wrapped/entryLookup'
import type { GameId } from '@/types/game'
import type { WrappedEntry, WrappedSections } from '@/types/wrapped'
import type {
  WrappedAllStatsGroup,
  WrappedAllStatsItem,
  WrappedAllStatsMode,
  WrappedAllStatsRow,
} from '@/types/wrappedPlanC'

const COLLECTIVE_ICONS: Record<string, string> = {
  'DI-C01': 'score.cocktail',
  'DI-C02': 'score.layer',
  'DI-C03': 'score.bullseye',
  'DI-C04': 'score.achievement',
  'DI-C05': 'score.cocktail',
  'DI-C06': 'score.bottle',
  'DI-C07': 'score.leaf',
  'DI-C08': 'score.bar',
  'DI-C09': 'score.bar',
  'DI-C10': 'score.calendar',
  'DI-C11': 'score.leaf',
  'DI-C12': 'score.leaderboard',
  'SI-C01': 'score.team',
  'SI-C02': 'score.bullseye',
  'SI-C03': 'score.bullseye',
  'SI-C04': 'score.points',
  'SI-C05': 'score.medal',
  'SI-C06': 'score.medal',
  'SI-C07': 'score.bullseye',
  'SI-C08': 'score.bullseye',
  'SI-C09': 'score.medal',
  'SI-C10': 'score.medal',
  'SI-C11': 'score.calendar',
  'SI-C12': 'score.leaderboard',
}

/** Clarifying microcopy for ambiguous metrics; entry.explanation wins when present. */
const EXPLANATIONS: Record<string, string> = {
  'DI-P16': 'Counted from drinks you logged with this person tagged as a companion.',
  'DI-P17': 'The day you earned the most points.',
  'DI-P18': 'The day you logged the most drinks.',
  'DI-G12': 'Counted from recorded companion tags on drink logs, in either direction.',
  'DI-G13': 'Earliest time of day, in ship time, that a drink was logged.',
  'DI-G14': 'Latest time of day, in ship time, that a drink was logged.',
  'DI-G15': 'The most points one player earned in a single day.',
  'DI-G16': 'The most drinks one player logged in a single day.',
  'SI-P04': 'Share of all available challenges your team completed.',
  'SI-P06': 'The day your team earned the most points.',
  'SI-P07': 'The day your team completed the most challenges.',
  'SI-P10': 'Challenges your team completed that no other team did.',
  'SI-G07': 'Challenges completed by only that team.',
  'SI-G08': 'Distinct days on which the team completed a challenge.',
  'SI-C03': 'Share of all available challenges completed by at least one team.',
}

interface GroupSpec {
  heading: string
  ids: string[]
}

function ids(prefix: string, from: number, to: number): string[] {
  const out: string[] = []
  for (let n = from; n <= to; n += 1) out.push(`${prefix}${String(n).padStart(2, '0')}`)
  return out
}

const GROUPS: Record<GameId, Record<WrappedAllStatsMode, GroupSpec[]>> = {
  drinkit: {
    mine: [
      { heading: 'Your Week', ids: ['DI-P01', 'DI-P10', 'DI-P11'] },
      { heading: 'The Competition', ids: ids('DI-P', 2, 4) },
      { heading: 'Bounties', ids: ids('DI-P', 5, 9) },
      { heading: 'Your Favorites', ids: ids('DI-P', 12, 16) },
      { heading: 'Your Best Days', ids: ids('DI-P', 17, 18) },
    ],
    ours: [
      { heading: 'Crew Totals', ids: ['DI-C01', 'DI-C02', 'DI-C03', 'DI-C04', 'DI-C11', 'DI-C12'] },
      { heading: 'Crew Favorites', ids: ids('DI-C', 5, 10) },
      { heading: 'Crew Awards', ids: ids('DI-G', 1, 12) },
      { heading: 'Records', ids: ids('DI-G', 13, 16) },
    ],
  },
  shipit: {
    mine: [
      { heading: 'Your Team', ids: [...ids('SI-P', 1, 5), 'SI-P10'] },
      { heading: 'Your Best Days', ids: ids('SI-P', 6, 7) },
      { heading: 'Memories', ids: ids('SI-P', 8, 9) },
    ],
    ours: [
      { heading: 'Team Awards', ids: ['SI-G01', 'SI-G02', 'SI-G07', 'SI-G08', 'SI-G09', 'SI-G10'] },
      { heading: 'Records', ids: ['SI-G03', 'SI-G04', 'SI-G05', 'SI-G06', 'SI-G11', 'SI-G12'] },
      { heading: 'Challenge Favorites', ids: ['SI-C05', 'SI-C06', 'SI-C09', 'SI-C10', 'SI-C11'] },
      { heading: 'Whole Hunt', ids: ['SI-C01', 'SI-C02', 'SI-C03', 'SI-C04', 'SI-C07', 'SI-C08'] },
      { heading: 'Final Standings', ids: ['SI-C12'] },
    ],
  },
}

const FALLBACK_HEADING = 'More'
const TIED_PAIR_KINDS = new Set(['pair', 'adjacent_gap'])

/** Title-cased singular/plural pairs keyed by entry.unit. */
const UNIT_DISPLAY: Record<string, [string, string]> = {
  drink: ['Drink', 'Drinks'],
  drinks: ['Drink', 'Drinks'],
  point: ['Point', 'Points'],
  points: ['Point', 'Points'],
  bar: ['Bar', 'Bars'],
  bars: ['Bar', 'Bars'],
  achievement: ['Achievement', 'Achievements'],
  achievements: ['Achievement', 'Achievements'],
  bounty: ['Bounty', 'Bounties'],
  bounties: ['Bounty', 'Bounties'],
  challenge: ['Challenge', 'Challenges'],
  challenges: ['Challenge', 'Challenges'],
  ingredient: ['Ingredient', 'Ingredients'],
  ingredients: ['Ingredient', 'Ingredients'],
  visit: ['Visit', 'Visits'],
  visits: ['Visit', 'Visits'],
  team: ['Team', 'Teams'],
  teams: ['Team', 'Teams'],
  player: ['Player', 'Players'],
  players: ['Player', 'Players'],
}

/**
 * Metric-specific count nouns when the raw unit is too generic
 * (e.g. DI-P06 unit is "bounties" but the result should read "Cocktail Bounties").
 */
const COUNT_DISPLAY_UNITS: Record<string, [string, string]> = {
  'DI-P06': ['Cocktail Bounty', 'Cocktail Bounties'],
  'DI-P07': ['Ingredient Bounty', 'Ingredient Bounties'],
  'DI-P08': ['Bar Bounty', 'Bar Bounties'],
  'DI-P09': ['Daily Challenge', 'Daily Challenges'],
  'DI-G04': ['Cocktail Bounty', 'Cocktail Bounties'],
  'DI-G05': ['Ingredient Bounty', 'Ingredient Bounties'],
  'DI-G06': ['Bar Bounty', 'Bar Bounties'],
  'DI-G07': ['Daily Challenge', 'Daily Challenges'],
}

/** Specs whose secondary count is better phrased as shared companion context. */
const PARTNER_SPEC_IDS = new Set(['DI-P16', 'DI-G12'])

function iconFor(specId: string): string {
  return (
    PERSONAL_ICONS[specId] ?? AWARD_ICONS[specId] ?? COLLECTIVE_ICONS[specId] ?? 'score.medal'
  )
}

function titleCaseWords(raw: string): string {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function displayUnitPair(unit: string | null, specId?: string): [string, string] | null {
  if (specId && COUNT_DISPLAY_UNITS[specId]) return COUNT_DISPLAY_UNITS[specId]
  if (!unit) return null
  const mapped = UNIT_DISPLAY[unit.toLowerCase()]
  if (mapped) return mapped
  const singular =
    unit.endsWith('ies') && unit.length > 3
      ? `${unit.slice(0, -3)}y`
      : unit.endsWith('s') && unit.length > 1
        ? unit.slice(0, -1)
        : unit
  return [titleCaseWords(singular), titleCaseWords(unit)]
}

/** Presentation count: `9 Drinks`, `1 Cocktail Bounty`. */
function formatDisplayCount(n: number, unit: string | null, specId?: string): string {
  const pair = displayUnitPair(unit, specId)
  if (!pair || (!pair[0] && !pair[1])) return formatNumber(n)
  return `${formatNumber(n)} ${n === 1 ? pair[0] : pair[1]}`
}

/** Title-case a secondary like "7 drinks" → "7 Drinks"; leave other phrases alone. */
function formatSecondaryCount(secondary: string | null | undefined, unit: string | null, specId?: string): string | undefined {
  if (!secondary) return undefined
  const trimmed = secondary.trim()
  const match = trimmed.match(/^([\d,]+(?:\.\d+)?)\s+(.+)$/)
  if (!match) return trimmed
  const n = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(n)) return trimmed
  const pair = displayUnitPair(unit ?? match[2], specId)
  if (!pair) return `${formatNumber(n)} ${titleCaseWords(match[2])}`
  return `${formatNumber(n)} ${n === 1 ? pair[0] : pair[1]}`
}

function formatRankValue(entry: WrappedEntry): string {
  const n = numericValue(entry)
  if (n === null) return entry.primary ?? 'No qualifying data'
  return `${formatOrdinalPlace(n)} Place`
}

function formatRankDetail(secondary: string | null, noun: 'player' | 'team'): string | undefined {
  if (!secondary) return undefined
  const match = secondary.trim().match(/^of\s+(\d+)$/i)
  if (!match) return secondary
  const n = Number(match[1])
  const label = n === 1 ? noun : `${noun}s`
  return `Out of ${formatNumber(n)} ${label}.`
}

function formatPartnerDetail(entry: WrappedEntry): string | undefined {
  const n = entry.value_numeric
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return formatSecondaryCount(entry.secondary, entry.unit, entry.spec_id)
  }
  return `Shared ${formatCount(n, 'drink')} together.`
}

function contextualDetail(entry: WrappedEntry): string | undefined {
  if (PARTNER_SPEC_IDS.has(entry.spec_id)) return formatPartnerDetail(entry)
  return formatSecondaryCount(entry.secondary, entry.unit, entry.spec_id)
}

function prettyCategory(key: unknown): string | undefined {
  if (typeof key !== 'string' || !key) return undefined
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function itemRecords(entry: WrappedEntry): Array<Record<string, unknown>> {
  return Array.isArray(entry.items) ? (entry.items as Array<Record<string, unknown>>) : []
}

function categoryLeaderItems(entry: WrappedEntry): WrappedAllStatsItem[] {
  return itemRecords(entry).map((item) => {
    const winners = Array.isArray(item.winners)
      ? (item.winners as Array<{ name?: string }>)
          .map((w) => w.name)
          .filter(Boolean)
          .join(', ')
      : ''
    const count = item.count ?? item.value ?? ''
    return {
      label: String(item.label ?? item.category ?? ''),
      detail: winners ? `${winners} · ${count}` : 'No qualifying data',
    }
  })
}

function winnerItems(entry: WrappedEntry): WrappedAllStatsItem[] {
  return winnerList(entry).map((w) => ({
    label: w.name,
    detail:
      w.detail ??
      (w.value !== null
        ? formatDisplayCount(w.value, entry.unit, entry.spec_id)
        : undefined),
  }))
}

function baseRow(entry: WrappedEntry): WrappedAllStatsRow {
  const explanation = entry.explanation ?? EXPLANATIONS[entry.spec_id]
  return {
    specId: entry.spec_id,
    label: entry.label,
    value: '',
    icon: iconFor(entry.spec_id),
    available: entry.available,
    ...(explanation ? { explanation } : {}),
  }
}

function withItems(row: WrappedAllStatsRow, items: WrappedAllStatsItem[]): WrappedAllStatsRow {
  return items.length ? { ...row, items, expandable: true } : row
}

function winnerValue(entry: WrappedEntry, row: WrappedAllStatsRow): WrappedAllStatsRow {
  const winners = winnerList(entry)
  const detail = contextualDetail(entry)
  const primary = entry.primary ?? 'No qualifying data'

  if (entry.kind === 'time_of_day') {
    return { ...row, value: primary, detail: entry.secondary ?? undefined }
  }

  if (winners.length <= 1) {
    return { ...row, value: primary, detail }
  }

  if (TIED_PAIR_KINDS.has(entry.kind)) {
    const noun = entry.kind === 'pair' ? 'pairs' : 'results'
    return withItems(
      { ...row, value: `${winners.length} tied ${noun}`, detail },
      winnerItems(entry),
    )
  }

  const names = winners.map((w) => w.name)
  const value =
    names.length === 2
      ? `${names[0]} & ${names[1]} (tied)`
      : `${names[0]} + ${names.length - 1} more (tied)`
  return withItems({ ...row, value, detail }, names.length > 2 ? winnerItems(entry) : [])
}

export function buildAllStatsRow(entry: WrappedEntry): WrappedAllStatsRow {
  const row = baseRow(entry)
  if (!entry.available) {
    return { ...row, value: entry.primary ?? 'No qualifying data' }
  }

  switch (entry.kind) {
    case 'count': {
      const n = numericValue(entry) ?? 0
      const items: WrappedAllStatsItem[] = itemRecords(entry)
        .map((item) => ({
          label: String(item.title ?? item.label ?? ''),
          detail: prettyCategory(item.category),
        }))
        .filter((item) => item.label)
      return withItems(
        { ...row, value: formatDisplayCount(n, entry.unit, entry.spec_id) },
        items,
      )
    }
    case 'percent': {
      const n = numericValue(entry)
      return {
        ...row,
        value: n !== null ? `${formatNumber(n)}%` : (entry.primary ?? 'No qualifying data'),
      }
    }
    case 'rank': {
      const noun = entry.spec_id.startsWith('SI-') ? 'team' : 'player'
      return {
        ...row,
        value: formatRankValue(entry),
        detail: formatRankDetail(entry.secondary, noun),
      }
    }
    case 'standings': {
      const items = itemRecords(entry).map((item) => ({
        label: `${item.rank ?? ''}. ${item.name ?? ''}`.trim(),
        detail: formatDisplayCount(Number(item.points ?? 0), 'points'),
      }))
      const n = numericValue(entry) ?? items.length
      return withItems({ ...row, value: formatDisplayCount(n, 'teams') }, items)
    }
    case 'list': {
      const items = itemRecords(entry)
        .map((item) => ({
          label: String(item.title ?? item.name ?? item.label ?? ''),
          detail: prettyCategory(item.category),
        }))
        .filter((item) => item.label)
      if (items.length === 0) return { ...row, value: entry.primary ?? 'No qualifying data' }
      return withItems({ ...row, value: formatDisplayCount(items.length, 'challenges') }, items)
    }
    case 'category_leaders':
      return withItems(
        { ...row, value: entry.primary ?? 'Category Leaders' },
        categoryLeaderItems(entry),
      )
    default:
      return winnerValue(entry, row)
  }
}

export function buildAllStatsRows(
  game: GameId,
  sections: WrappedSections,
  mode: WrappedAllStatsMode,
): WrappedAllStatsGroup[] {
  const pool =
    mode === 'mine' ? sections.personal : [...sections.global, ...sections.collective]
  const groups: WrappedAllStatsGroup[] = []
  const placed = new Set<string>()

  for (const spec of GROUPS[game][mode]) {
    const rows: WrappedAllStatsRow[] = []
    for (const id of spec.ids) {
      const entry = entryById(pool, id)
      if (!entry) continue
      placed.add(id)
      rows.push(buildAllStatsRow(entry))
    }
    if (rows.length) groups.push({ heading: spec.heading, rows })
  }

  const leftovers = pool.filter((e) => !placed.has(e.spec_id)).map(buildAllStatsRow)
  if (leftovers.length) groups.push({ heading: FALLBACK_HEADING, rows: leftovers })

  return groups
}

export function flattenAllStatsRows(groups: WrappedAllStatsGroup[]): WrappedAllStatsRow[] {
  return groups.flatMap((g) => g.rows)
}
