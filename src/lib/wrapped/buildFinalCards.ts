import type {
  WrappedAwardCardModel,
  WrappedEntry,
  WrappedStatCard,
} from '@/types/wrapped'

const PERSONAL_ICONS: Record<string, string> = {
  'DI-P01': 'theme.drink-it',
  'DI-P02': 'score.leaderboard',
  'DI-P03': 'score.medal',
  'DI-P04': 'score.achievement',
  'DI-P05': 'score.medal',
  'DI-P06': 'theme.drink-it',
  'DI-P07': 'theme.drink-it',
  'DI-P08': 'score.bar',
  'DI-P09': 'score.calendar',
  'DI-P10': 'theme.drink-it',
  'DI-P11': 'score.bar',
  'DI-P12': 'theme.drink-it',
  'DI-P13': 'theme.drink-it',
  'DI-P14': 'theme.drink-it',
  'DI-P15': 'score.bar',
  'DI-P16': 'score.friends',
  'DI-P17': 'score.calendar',
  'DI-P18': 'score.calendar',
  'SI-P01': 'score.medal',
  'SI-P02': 'score.leaderboard',
  'SI-P03': 'score.team',
  'SI-P04': 'score.team',
  'SI-P05': 'score.medal',
  'SI-P06': 'score.calendar',
  'SI-P07': 'score.calendar',
  'SI-P08': 'score.team',
  'SI-P09': 'score.team',
  'SI-P10': 'score.medal',
}

const AWARD_ICONS: Record<string, string> = {
  'DI-G01': 'score.leaderboard',
  'DI-G02': 'theme.drink-it',
  'DI-G03': 'score.medal',
  'DI-G04': 'theme.drink-it',
  'DI-G05': 'theme.drink-it',
  'DI-G06': 'score.bar',
  'DI-G07': 'score.calendar',
  'DI-G08': 'score.achievement',
  'DI-G09': 'score.bar',
  'DI-G10': 'theme.drink-it',
  'DI-G11': 'theme.drink-it',
  'DI-G12': 'score.friends',
  'DI-G13': 'score.calendar',
  'DI-G14': 'score.calendar',
  'DI-G15': 'score.leaderboard',
  'DI-G16': 'theme.drink-it',
  'SI-G01': 'score.leaderboard',
  'SI-G02': 'score.team',
  'SI-G03': 'score.team',
  'SI-G04': 'score.team',
  'SI-G05': 'score.leaderboard',
  'SI-G06': 'score.calendar',
  'SI-G07': 'score.medal',
  'SI-G08': 'score.calendar',
  'SI-G09': 'score.medal',
  'SI-G10': 'score.medal',
  'SI-G11': 'score.team',
  'SI-G12': 'score.leaderboard',
}

function toneForIndex(index: number): 'aqua' | 'cream' {
  return index % 2 === 0 ? 'aqua' : 'cream'
}

function winnerNames(entry: WrappedEntry): string[] {
  return (entry.winners ?? []).map((w) => w.name).filter(Boolean)
}

function formatWinnerPrimary(entry: WrappedEntry): string {
  const names = winnerNames(entry)
  if (!entry.available || names.length === 0) {
    return entry.primary ?? 'No qualifying data'
  }
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} & ${names[1]} (tied)`
  return `${names[0]} + ${names.length - 1} more (tied)`
}

function isNamedKind(kind: string): boolean {
  return [
    'named_count',
    'day_points',
    'day_count',
    'pair',
    'time_of_day',
    'challenge_memory',
    'percent',
    'rank',
  ].includes(kind)
}

/** Personal / team Part 1 cards from final sections.personal. */
export function buildPersonalCards(entries: WrappedEntry[]): WrappedStatCard[] {
  return entries.map((entry, index) => {
    const photoKind = entry.kind === 'challenge_memory'
    const named = isNamedKind(entry.kind) || !entry.available
    const names = winnerNames(entry)
    const primary =
      entry.available
        ? (entry.primary ??
          (names.length ? formatWinnerPrimary(entry) : '0'))
        : (entry.primary ?? 'No qualifying data')

    return {
      kind: photoKind ? 'photo' : named ? 'named' : 'number',
      key: entry.spec_id,
      icon: PERSONAL_ICONS[entry.spec_id] ?? 'score.medal',
      value: primary,
      label: entry.label,
      copy: entry.secondary ?? entry.explanation ?? '',
      chip: named ? entry.label : undefined,
      tone: toneForIndex(index),
      available: entry.available,
      photo: entry.photo ?? null,
      expandableNames: names.length > 2 ? names : undefined,
    }
  })
}

/** Global Part 2 award cards from sections.global. */
export function buildGlobalAwardCards(entries: WrappedEntry[]): WrappedAwardCardModel[] {
  return entries.map((entry, index) => {
    const names = winnerNames(entry)
    const categoryItems =
      entry.kind === 'category_leaders'
        ? (entry.items as Array<Record<string, unknown>> | undefined)?.map((item) => {
            const winners = Array.isArray(item.winners)
              ? (item.winners as Array<{ name?: string }>)
                  .map((w) => w.name)
                  .filter(Boolean)
                  .join(', ')
              : ''
            const count = item.count ?? item.value ?? ''
            return {
              label: String(item.label ?? item.category ?? ''),
              detail: winners
                ? `${winners} · ${count}`
                : String(item.detail ?? 'No qualifying data'),
            }
          })
        : undefined

    return {
      key: entry.spec_id,
      title: entry.label,
      primary: entry.available
        ? formatWinnerPrimary(entry) !== 'No qualifying data'
          ? formatWinnerPrimary(entry)
          : (entry.primary ?? 'No qualifying data')
        : (entry.primary ?? 'No qualifying data'),
      secondary: entry.secondary,
      copy: entry.explanation,
      available: entry.available,
      tone: toneForIndex(index),
      icon: AWARD_ICONS[entry.spec_id] ?? 'score.medal',
      expandableNames: names.length > 2 ? names : undefined,
      items: categoryItems,
      photo: entry.photo ?? null,
    }
  })
}

/** Collective Part 3 cards from sections.collective. */
export function buildCollectiveCards(entries: WrappedEntry[]): WrappedAwardCardModel[] {
  return entries.map((entry, index) => {
    const names = winnerNames(entry)
    const listItems =
      entry.kind === 'list' || entry.kind === 'standings'
        ? (entry.items as Array<Record<string, unknown>> | undefined)?.map((item) => {
            if (entry.kind === 'standings') {
              return {
                label: `#${item.rank ?? ''} ${item.name ?? ''}`.trim(),
                detail: `${item.points ?? 0} points`,
              }
            }
            return {
              label: String(item.title ?? item.name ?? item.label ?? ''),
              detail: String(item.detail ?? ''),
            }
          })
        : entry.kind === 'named_count' && names.length > 2
          ? names.map((name) => ({ label: name, detail: entry.secondary ?? '' }))
          : undefined

    const primary =
      entry.kind === 'standings'
        ? entry.primary ?? 'Final standings'
        : entry.available
          ? entry.primary ??
            (names.length ? formatWinnerPrimary(entry) : '0')
          : (entry.primary ?? 'No qualifying data')

    return {
      key: entry.spec_id,
      title: entry.label,
      primary,
      secondary: entry.secondary,
      copy: entry.explanation,
      available: entry.available,
      tone: toneForIndex(index),
      icon: 'score.medal',
      expandableNames: names.length > 2 ? names : undefined,
      items: listItems,
    }
  })
}

export function sectionEntryIds(entries: WrappedEntry[]): string[] {
  return entries.map((e) => e.spec_id)
}
