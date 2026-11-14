import { AWARD_ICONS, PERSONAL_ICONS } from '@/lib/wrapped/buildFinalCards'
import {
  disambiguatePlayerName,
  entryById,
  formatCount,
  formatNumber,
  formatOrdinalPlace,
  isAvailable,
  numericValue,
  primaryText,
  winnerList,
} from '@/lib/wrapped/entryLookup'
import {
  byEarliest,
  byHangLoose,
  byHeart,
  byLaugh,
  byNewest,
  byTotalReactions,
  pickDistinctPhotos,
  type WrappedPhotoHighlight,
} from '@/lib/wrapped/photoHighlights'
import type { WrappedEntry, WrappedEntryPhoto, WrappedSections } from '@/types/wrapped'
import type {
  WrappedDoubleSlide,
  WrappedFeatureSlide,
  WrappedPhotoSlide,
  WrappedSingleSlide,
  WrappedTextBlock,
  WrappedTextSegment,
} from '@/types/wrappedPlanC'

export const SI_BEST_DAY_MIN_POINTS = 400
export const SI_BEST_DAY_MIN_CHALLENGES = 2
export const SI_OVERACHIEVER_MIN = 2

export interface WrappedFeatureSlideOptions {
  /**
   * Drink It! DI-04 denominator: bars in the authorized active catalog.
   * Never hard-coded; when absent the card shows the visited count alone.
   */
  eligibleBarTotal?: number | null
  /**
   * Ship It! SI-03: enabled challenges per category key (SI-P05 winner id).
   * Needed to know a category was fully completed; when absent the
   * "all challenges" variant is never shown.
   */
  categoryChallengeTotals?: Record<string, number>
  /**
   * False when the gallery fetch was capped before reaching the oldest events,
   * which makes "earliest photo" untrustworthy (DI-03 is then skipped).
   */
  photoPoolComplete?: boolean
  /** Extra roster names used when disambiguating first names. */
  playerNames?: string[]
}

type SlideDraft =
  | Omit<WrappedSingleSlide, 'tone'>
  | Omit<WrappedDoubleSlide, 'tone'>
  | Omit<WrappedPhotoSlide, 'tone'>

type Step = () => SlideDraft | null
type Part = string | WrappedTextSegment

interface ResolvedWinners {
  names: string[]
  value: number | null
  tied: boolean
  ids: string[]
}

function text(...parts: Part[]): WrappedTextSegment[] {
  return parts.map((p) => (typeof p === 'string' ? { text: p } : p))
}

function live(value: string): WrappedTextSegment {
  return { text: value, accent: true, bold: true }
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

function personalIcon(id: string): string {
  return PERSONAL_ICONS[id] ?? 'score.medal'
}

function awardIcon(id: string): string {
  return AWARD_ICONS[id] ?? PERSONAL_ICONS[id] ?? 'score.medal'
}

function resolveWinners(entry: WrappedEntry | undefined, max: number): ResolvedWinners | null {
  const winners = winnerList(entry)
  if (winners.length === 0 || winners.length > max) return null
  const first = winners[0]
  return {
    names: winners.map((w) => w.name),
    ids: winners.map((w) => w.id),
    value: first?.value ?? numericValue(entry),
    tied: winners.length > 1,
  }
}

function positiveCount(entry: WrappedEntry | undefined): number | null {
  const n = numericValue(entry)
  return n !== null && n > 0 ? n : null
}

function dayLabels(entry: WrappedEntry | undefined): string[] | null {
  if (!isAvailable(entry)) return null
  const fromItems = (entry.items as Array<{ label?: unknown }>)
    .map((item) => (typeof item?.label === 'string' ? item.label : ''))
    .filter(Boolean)
  const fromPrimary = primaryText(entry)?.split(', ').filter(Boolean) ?? []
  const labels = fromItems.length ? fromItems : fromPrimary
  return labels.length > 0 && labels.length <= 2 ? labels : null
}

function collectNames(sections: WrappedSections, extra: string[] | undefined): string[] {
  const names = new Set<string>(extra ?? [])
  for (const entry of [...sections.personal, ...sections.global, ...sections.collective]) {
    if (!isAvailable(entry)) continue
    for (const w of entry.winners ?? []) {
      if (w?.name && !w.name.includes(' & ')) names.add(w.name)
    }
    if (entry.kind === 'pair') {
      for (const item of entry.items as Array<{ players?: Array<{ name?: string }> }>) {
        for (const p of item?.players ?? []) if (p?.name) names.add(p.name)
      }
    }
  }
  return [...names]
}

function pairNames(entry: WrappedEntry | undefined): string[] | null {
  if (!isAvailable(entry)) return null
  const items = entry.items as Array<{ players?: Array<{ name?: string }> }>
  const players = items[0]?.players
  const fromItems = (players ?? []).map((p) => p?.name ?? '').filter(Boolean)
  if (fromItems.length === 2) return fromItems
  const split = winnerList(entry)[0]?.name.split(' & ') ?? []
  return split.length === 2 ? split : null
}

function photoSlide(
  base: { id: string; eyebrow: string; headline: string; subhead: string },
  highlight: WrappedPhotoHighlight | undefined,
  used: Set<string>,
): SlideDraft | null {
  if (!highlight || used.has(highlight.photo.photo_id)) return null
  used.add(highlight.photo.photo_id)
  return {
    type: 'photo',
    ...base,
    photo: highlight.photo,
    caption: highlight.caption ?? undefined,
    eventId: highlight.eventId || undefined,
  }
}

function entryPhotoSlide(
  base: { id: string; eyebrow: string; headline: string; subhead: string },
  photo: WrappedEntryPhoto | null | undefined,
  photos: WrappedPhotoHighlight[],
  used: Set<string>,
): SlideDraft | null {
  if (!photo?.photo_id) return null
  const match = photos.find((h) => h.photo.photo_id === photo.photo_id)
  return photoSlide(base, match ?? { ...emptyHighlight(photo) }, used)
}

function emptyHighlight(photo: WrappedEntryPhoto): WrappedPhotoHighlight {
  return {
    photo,
    caption: null,
    eventId: '',
    kind: 'scavenger',
    createdAtUtc: '',
    reactions: { heart: 0, laugh: 0, hang_loose: 0 },
    ownerTeamId: null,
    challengeId: null,
    challengeTitle: null,
  }
}

function runSteps(steps: Step[]): WrappedFeatureSlide[] {
  const out: WrappedFeatureSlide[] = []
  for (const step of steps) {
    const draft = step()
    if (!draft) continue
    out.push({ ...draft, tone: out.length % 2 === 0 ? 'warm' : 'cool' })
  }
  return out
}

// ---------------------------------------------------------------------------
// Drink It!
// ---------------------------------------------------------------------------

export function buildDrinkItFeatureSlides(
  sections: WrappedSections,
  photos: WrappedPhotoHighlight[],
  options: WrappedFeatureSlideOptions = {},
): WrappedFeatureSlide[] {
  const P = (id: string) => entryById(sections.personal, id)
  const G = (id: string) => entryById(sections.global, id)
  const C = (id: string) => entryById(sections.collective, id)
  const allNames = collectNames(sections, options.playerNames)
  const player = (name: string) => disambiguatePlayerName(name, allNames)
  const used = new Set<string>()
  const photoPoolComplete = options.photoPoolComplete ?? true

  const di01: Step = () => {
    const logs = positiveCount(P('DI-P01'))
    if (logs === null) return null
    const different = positiveCount(P('DI-P10'))
    return {
      type: 'single',
      id: 'DI-01',
      eyebrow: 'Your Week',
      icon: personalIcon('DI-P01'),
      headline: "You've been busy 👀",
      lead: 'Good thing the drinks were free!',
      heroValue: formatNumber(logs),
      heroLabel: logs === 1 ? 'drink enjoyed!' : 'drinks enjoyed!',
      paragraphs:
        different === null
          ? []
          : [
              text(
                'And you branched out! You tried ',
                live(formatCount(different, 'different drink')),
                ' across the week!',
              ),
            ],
    }
  }

  const di02: Step = () => {
    // Feature only when a drink was logged at least twice.
    const fav = resolveWinners(P('DI-P12'), 2)
    if (!fav || fav.value === null || fav.value < 2) return null
    const count = fav.value

    return {
      type: 'single',
      id: 'DI-02',
      eyebrow: "You've Got Taste",
      icon: personalIcon('DI-P12'),
      headline: "You've got taste!",
      lead: 'You tried plenty of drinks this week, but one kept calling your name...',
      heroValue: joinNames(fav.names),
      heroLabel: fav.tied ? 'One of your favorites!' : 'Your favorite drink!',
      paragraphs: [
        fav.tied
          ? text('You drank ', live(`${formatNumber(count)} of each`), '!')
          : text('You drank ', live(`${formatNumber(count)} of 'em`), '!'),
      ],
    }
  }

  const di03: Step = () => {
    if (!photoPoolComplete) return null
    return photoSlide(
      {
        id: 'DI-03',
        eyebrow: 'First uploaded photo',
        headline: 'Remember this?',
        subhead: 'Back when we were all skinny and sober?',
      },
      byEarliest(photos)[0],
      used,
    )
  }

  const di04: Step = () => {
    const bars = positiveCount(P('DI-P11'))
    if (bars === null) return null
    // Featured hangouts use bars visited alone; /eligible total stays in All Stats.

    const favBar = resolveWinners(P('DI-P15'), 2)
    const paragraphs: WrappedTextBlock[] = []

    // Only boast a favorite hangout when it was logged more than once.
    if (favBar && favBar.value !== null && favBar.value >= 2) {
      paragraphs.push(
        text(
          'And you kept coming back to ',
          live(joinNames(favBar.names)),
          ', where you enjoyed ',
          live(formatCount(favBar.value, 'drink')),
          favBar.tied ? ' at each!' : '!',
        ),
      )
    }

    return {
      type: 'single',
      id: 'DI-04',
      eyebrow: 'Your Hangouts',
      icon: personalIcon('DI-P11'),
      headline: "You've been EVERYWHERE!",
      lead: 'You managed to visit:',
      heroValue: formatNumber(bars),
      heroLabel: bars === 1 ? 'bar!' : 'bars!',
      paragraphs,
    }
  }

  const di05: Step = () => {
    const points = positiveCount(P('DI-P02'))
    if (points === null) return null
    const rank = numericValue(P('DI-P03'))
    const bounties = positiveCount(P('DI-P05'))

    const paragraphs: WrappedTextBlock[] = []
    if (rank !== null && rank > 0 && bounties !== null) {
      paragraphs.push(
        text(
          'You finished in ',
          live(`${formatOrdinalPlace(rank)} place`),
          ', completing ',
          live(formatCount(bounties, 'bounty', 'bounties')),
          ' along the way!',
        ),
      )
    } else if (rank !== null && rank > 0) {
      paragraphs.push(text('You finished in ', live(`${formatOrdinalPlace(rank)} place`), '!'))
    } else if (bounties !== null) {
      paragraphs.push(
        text('You completed ', live(formatCount(bounties, 'bounty', 'bounties')), ' along the way!'),
      )
    }

    return {
      type: 'single',
      id: 'DI-05',
      eyebrow: 'The Competition',
      icon: personalIcon('DI-P02'),
      headline: 'You came to play!',
      lead: "You weren't just here for the drinks. You had points to earn!",
      heroValue: formatNumber(points),
      heroLabel: points === 1 ? 'total point!' : 'total points!',
      paragraphs,
    }
  }

  const di06: Step = () =>
    photoSlide(
      {
        id: 'DI-06',
        eyebrow: 'Funniest Photo',
        headline: "Lol we're still laughing at this one 😂",
        subhead: 'You all agreed, this was classic.',
      },
      pickDistinctPhotos(byLaugh(photos), 1)[0],
      used,
    )

  const di07: Step = () => {
    const biggest = dayLabels(P('DI-P17'))
    const busiest = dayLabels(P('DI-P18'))
    const points = positiveCount(P('DI-P17'))
    const drinks = positiveCount(P('DI-P18'))
    // Need a scoring day plus at least two drinks on the busiest day.
    if (!biggest || !busiest || points === null || drinks === null || drinks < 2) return null

    const sameDay =
      biggest.length === 1 && busiest.length === 1 && biggest[0] === busiest[0]
    if (sameDay) {
      return {
        type: 'single',
        id: 'DI-07',
        eyebrow: 'Your Best Days',
        icon: personalIcon('DI-P17'),
        headline: 'Now THAT was a day!',
        heroValue: biggest[0]!,
        paragraphs: [
          text(
            'You earned ',
            live(formatCount(points, 'point')),
            ' and enjoyed ',
            live(formatCount(drinks, 'drink')),
            '!',
          ),
        ],
      }
    }

    return {
      type: 'double',
      id: 'DI-07',
      eyebrow: 'Your Best Days',
      icon: personalIcon('DI-P17'),
      headline: 'Some days just hit different!',
      heroes: [
        {
          value: biggest.join(' & '),
          body:
            biggest.length > 1
              ? text(
                  'Your biggest scoring days! You earned ',
                  live(formatCount(points, 'point')),
                  ' on each.',
                )
              : text(
                  'Your biggest scoring day! You earned ',
                  live(formatCount(points, 'point')),
                  '.',
                ),
        },
        {
          value: busiest.join(' & '),
          body:
            busiest.length > 1
              ? text(
                  'Your busiest drinking days! You enjoyed ',
                  live(formatCount(drinks, 'drink')),
                  ' on each!',
                )
              : text(
                  'Your busiest drinking day! You enjoyed ',
                  live(formatCount(drinks, 'drink')),
                  '!',
                ),
        },
      ],
    }
  }

  const di08: Step = () =>
    photoSlide(
      {
        id: 'DI-08',
        eyebrow: 'Still Laughing',
        headline: 'And we can’t forget this nonsense',
        subhead: 'Was it the caption or the photo that made you smile?',
      },
      pickDistinctPhotos(byLaugh(photos), 2)[1],
      used,
    )

  const di09: Step = () => {
    const drinks = positiveCount(C('DI-C01'))
    if (drinks === null) return null
    const different = positiveCount(C('DI-C02'))

    return {
      type: 'single',
      id: 'DI-09',
      eyebrow: 'What a Crew!',
      icon: awardIcon('DI-G02'),
      headline: "You weren't the only one having fun!",
      lead: 'The whole crew was busy exploring those cocktail menus!',
      heroValue: formatNumber(drinks),
      heroLabel: drinks === 1 ? 'total drink across the crew!' : 'total drinks across the crew!',
      paragraphs:
        different === null
          ? []
          : [
              text(
                'And between everyone, we tried ',
                live(formatCount(different, 'different drink')),
                '!',
              ),
            ],
    }
  }

  const di10: Step = () => {
    // Skip unless a drink was logged more than once; skip overcrowded ties.
    const drink = resolveWinners(C('DI-C05'), 2)
    if (!drink || drink.value === null || drink.value < 2) return null
    const name = drink.names[0]
    if (!name) return null

    return {
      type: 'single',
      id: 'DI-10',
      eyebrow: "The People's Favorites",
      icon: personalIcon('DI-P15'),
      headline: 'The people have spoken!',
      lead: drink.tied
        ? 'Everyone had their favorites, and a few cocktails came out on top...'
        : 'Everyone had their favorites, but one cocktail came out on top...',
      heroValue: name,
      heroLabel: drink.tied ? "One of the crew's favorites!" : "The crew's favorite drink!",
      paragraphs: [
        text(
          'We enjoyed ',
          live(`${formatNumber(drink.value)} of them`),
          ' throughout the cruise!',
        ),
      ],
    }
  }

  const di11: Step = () =>
    photoSlide(
      {
        id: 'DI-11',
        eyebrow: 'All the Love',
        headline: 'Awww we loved this one ❤️',
        subhead: 'This one is going on the fridge.',
      },
      byHeart(photos)[0],
      used,
    )

  const di12: Step = () => {
    // Skip multi-pair ties; require at least three shared drinks.
    const entry = G('DI-G12')
    const winners = winnerList(entry)
    if (winners.length !== 1) return null
    const names = pairNames(entry)
    const count = winners[0]?.value ?? null
    if (!names || count === null || count < 3) return null

    return {
      type: 'single',
      id: 'DI-12',
      eyebrow: 'The Dynamic Duo',
      icon: awardIcon('DI-G12'),
      headline: 'Some people were practically inseparable!',
      lead: "And the crew's most frequent drinking pair was...",
      heroValue: joinNames(names.map(player)),
      heroLabel: `Shared ${formatCount(count, 'drink')} together!`,
      paragraphs: [],
    }
  }

  const di13: Step = () =>
    photoSlide(
      {
        id: 'DI-13',
        eyebrow: 'The Crowd Favorite',
        headline: 'We took a LOT of photos this week.',
        subhead: "But let's be real. This one was everyone’s favorite.",
      },
      byTotalReactions(photos)[0],
      used,
    )

  const di14: Step = () => {
    const early = G('DI-G13')
    const late = G('DI-G14')
    const earlyWinners = winnerList(early)
    const lateWinners = winnerList(late)
    if (earlyWinners.length !== 1 || lateWinners.length !== 1) return null
    const earlyTime = primaryText(early)
    const lateTime = primaryText(late)
    const earlyDay = /\d+/.exec(earlyWinners[0]?.detail ?? '')?.[0]
    const lateDay = /\d+/.exec(lateWinners[0]?.detail ?? '')?.[0]
    const earlyName = earlyWinners[0]?.name
    const lateName = lateWinners[0]?.name
    if (!earlyTime || !lateTime || !earlyDay || !lateDay || !earlyName || !lateName) return null

    return {
      type: 'double',
      id: 'DI-14',
      eyebrow: 'Early Birds & Night Owls',
      icon: awardIcon('DI-G13'),
      headline: 'Some started early. Others stayed late!',
      heroes: [
        {
          value: player(earlyName),
          body: text(
            'Our early bird! Enjoying a drink at ',
            live(earlyTime),
            ' on Day ',
            live(earlyDay),
            '!',
          ),
        },
        {
          value: player(lateName),
          body: text(
            'Our night owl! Enjoying a drink at ',
            live(lateTime),
            ' on Day ',
            live(lateDay),
            '!',
          ),
        },
      ],
    }
  }

  const di15: Step = () =>
    photoSlide(
      {
        id: 'DI-15',
        eyebrow: 'Good Vibrations',
        headline: 'Now THIS is cruise life!',
        subhead: 'This photo really captured the spirit of cruising 🤙',
      },
      byHangLoose(photos)[0],
      used,
    )

  return runSteps([
    di01, di02, di03, di04, di05, di06, di07, di08,
    di09, di10, di11, di12, di13, di14, di15,
  ])
}

// ---------------------------------------------------------------------------
// Ship It!
// ---------------------------------------------------------------------------

interface CategoryPick {
  name: string
  count: number
  complete: boolean
}

/**
 * Ties between top categories cannot be broken from the payload (no chronology),
 * so a fully completed category is preferred when totals are supplied; otherwise
 * the server's deterministic winner order decides.
 */
function pickCategory(
  entry: WrappedEntry | undefined,
  totals: Record<string, number> | undefined,
): CategoryPick | null {
  const candidates = winnerList(entry).map((w) => {
    const count = w.value ?? 0
    return { name: w.name, count, complete: totals?.[w.id] === count && count > 0 }
  })
  const pick = candidates.find((c) => c.complete) ?? candidates[0]
  return pick && pick.count >= 2 ? pick : null
}

export function buildShipItFeatureSlides(
  sections: WrappedSections,
  photos: WrappedPhotoHighlight[],
  options: WrappedFeatureSlideOptions = {},
): WrappedFeatureSlide[] {
  const P = (id: string) => entryById(sections.personal, id)
  const G = (id: string) => entryById(sections.global, id)
  const C = (id: string) => entryById(sections.collective, id)
  const used = new Set<string>()

  const si01: Step = () => {
    const completed = positiveCount(P('SI-P03'))
    if (completed === null) return null
    const percent = numericValue(P('SI-P04'))

    return {
      type: 'single',
      id: 'SI-01',
      eyebrow: "Your Team's Adventure",
      icon: personalIcon('SI-P03'),
      headline: 'Well, somebody understood the assignment!',
      lead: 'You and your team certainly kept busy this week!',
      heroValue: formatNumber(completed),
      heroLabel: completed === 1 ? 'challenge completed!' : 'challenges completed!',
      paragraphs:
        percent === null
          ? []
          : [
              text(
                "That's ",
                live(`${formatNumber(percent)}% of all available challenges!`),
              ),
            ],
    }
  }

  const si02: Step = () =>
    entryPhotoSlide(
      {
        id: 'SI-02',
        eyebrow: 'Where It All Began',
        headline: 'Remember where it all started?',
        subhead: 'Little did you know what you were getting yourselves into...',
      },
      P('SI-P08')?.available ? P('SI-P08')?.photo : null,
      photos,
      used,
    )

  const si03: Step = () => {
    const category = pickCategory(P('SI-P05'), options.categoryChallengeTotals)
    if (!category) return null

    return {
      type: 'single',
      id: 'SI-03',
      eyebrow: 'Your Specialty',
      icon: personalIcon('SI-P05'),
      headline: 'You had a type!',
      lead: 'Of all the challenges out there, your team had a clear favorite...',
      heroValue: category.name,
      heroLabel: 'Your most completed category!',
      paragraphs: [
        category.complete
          ? text(
              'You completed all ',
              live(formatCount(category.count, 'challenge')),
              ' in this category!',
            )
          : text(
              'You knocked out ',
              live(formatCount(category.count, 'challenge')),
              ' in this category!',
            ),
      ],
    }
  }

  const si04: Step = () => {
    const biggest = dayLabels(P('SI-P06'))
    const busiest = dayLabels(P('SI-P07'))
    const points = numericValue(P('SI-P06'))
    const challenges = numericValue(P('SI-P07'))
    if (!biggest || !busiest || points === null || challenges === null) return null
    if (points < SI_BEST_DAY_MIN_POINTS || challenges < SI_BEST_DAY_MIN_CHALLENGES) return null

    const sameDay =
      biggest.length === 1 && busiest.length === 1 && biggest[0] === busiest[0]
    if (sameDay) {
      return {
        type: 'single',
        id: 'SI-04',
        eyebrow: 'Your Best Days',
        icon: personalIcon('SI-P06'),
        headline: 'Some days you found all the things!',
        heroValue: biggest[0]!,
        paragraphs: [
          text(
            'You earned ',
            live(formatCount(points, 'point')),
            ' and completed ',
            live(formatCount(challenges, 'challenge')),
            '!',
          ),
        ],
      }
    }

    return {
      type: 'double',
      id: 'SI-04',
      eyebrow: 'Your Best Days',
      icon: personalIcon('SI-P06'),
      headline: 'Some days you found all the things!',
      heroes: [
        {
          value: biggest.join(' & '),
          body:
            biggest.length > 1
              ? text(
                  'Your biggest scoring days! You earned ',
                  live(formatCount(points, 'point')),
                  ' on each.',
                )
              : text(
                  'Your biggest scoring day! You earned ',
                  live(formatCount(points, 'point')),
                  '.',
                ),
        },
        {
          value: busiest.join(' & '),
          body:
            busiest.length > 1
              ? text(
                  'Your busiest days! You completed ',
                  live(formatCount(challenges, 'challenge')),
                  ' on each!',
                )
              : text(
                  'Your busiest day! You completed ',
                  live(formatCount(challenges, 'challenge')),
                  '!',
                ),
        },
      ],
    }
  }

  /**
   * Gallery scavenger events carry the accepted submission's display snapshot,
   * including challenge_id, so a popular challenge's photo can be matched by id.
   * Candidates are limited to completions of the most popular challenge(s).
   */
  const si05: Step = () => {
    const popular = resolveWinners(C('SI-C05'), 6)
    if (!popular || popular.value === null || popular.value < 2) return null
    const ids = new Set(popular.ids)
    const candidates = byNewest(
      photos.filter((h) => h.kind === 'scavenger' && h.challengeId !== null && ids.has(h.challengeId)),
    )
    return photoSlide(
      {
        id: 'SI-05',
        eyebrow: 'Everybody Got In on the Fun',
        headline: 'Apparently, great minds think alike!',
        subhead: 'Some challenges really caught on around the ship!',
      },
      candidates.find((h) => !used.has(h.photo.photo_id)),
      used,
    )
  }

  const si06: Step = () => {
    const total = positiveCount(C('SI-C01'))
    if (total === null) return null
    const unique = positiveCount(C('SI-C02'))

    return {
      type: 'single',
      id: 'SI-06',
      eyebrow: 'What a Crew!',
      icon: personalIcon('SI-P03'),
      headline: "Y'all really went for it!",
      lead: 'Turns out there was a LOT of scavenger hunting happening!',
      heroValue: formatNumber(total),
      heroLabel: total === 1 ? 'total challenge completion!' : 'total challenge completions!',
      paragraphs:
        unique === null
          ? []
          : [
              text(
                'Between all the teams, we conquered ',
                live(formatCount(unique, 'different challenge')),
                '!',
              ),
            ],
    }
  }

  const si07: Step = () => {
    // Skip overcrowded ties; require at least two completing teams.
    const challenge = resolveWinners(C('SI-C05'), 2)
    const name = challenge?.names[0]
    if (!challenge || !name || challenge.value === null || challenge.value < 2) return null

    return {
      type: 'single',
      id: 'SI-07',
      eyebrow: 'The Crowd Favorites',
      icon: awardIcon('SI-G09'),
      headline: 'The people have spoken!',
      lead: 'Some challenges were just too good (or too easy!) to pass up...',
      heroValue: name,
      heroLabel: challenge.tied
        ? "One of the crew's favorites!"
        : "The crew's favorite challenge!",
      paragraphs: [
        text('A whopping ', live(formatCount(challenge.value, 'team')), ' completed this one!'),
      ],
    }
  }

  /**
   * SI-G10 usually carries no photo, so the highest-value completion's photo is
   * matched from the gallery by owning team + challenge title (the entry's detail
   * lists the max-points titles per team). Most recent upload wins ties.
   */
  const si08: Step = () => {
    const entry = G('SI-G10')
    const winners = winnerList(entry)
    if (winners.length === 0) return null

    const base = {
      id: 'SI-08',
      eyebrow: 'Big Points, Big Memories',
      headline: 'Now THAT was worth the effort!',
      subhead: 'Some challenges were worth every second of the adventure!',
    }
    if (entry?.photo?.photo_id) return entryPhotoSlide(base, entry.photo, photos, used)

    const titlesByTeam = new Map<string, Set<string>>()
    for (const w of winners) {
      titlesByTeam.set(
        w.id,
        new Set((w.detail ?? '').split('; ').map((t) => t.trim()).filter(Boolean)),
      )
    }
    const candidates = byNewest(
      photos.filter(
        (h) =>
          h.kind === 'scavenger' &&
          h.ownerTeamId !== null &&
          h.challengeTitle !== null &&
          titlesByTeam.get(h.ownerTeamId)?.has(h.challengeTitle) === true,
      ),
    )
    return photoSlide(base, candidates.find((h) => !used.has(h.photo.photo_id)), used)
  }

  const si09: Step = () => {
    const score = resolveWinners(G('SI-G05'), 2)
    const daily = resolveWinners(G('SI-G06'), 2)
    if (!score || !daily || score.value === null || daily.value === null) return null
    if (score.value < SI_BEST_DAY_MIN_POINTS || daily.value < SI_BEST_DAY_MIN_CHALLENGES) return null

    return {
      type: 'double',
      id: 'SI-09',
      eyebrow: 'Record Breakers',
      icon: awardIcon('SI-G05'),
      headline: 'Somebody came to WIN!',
      heroes: [
        {
          value: joinNames(score.names),
          body: text(
            score.tied ? 'Absolutely crushed it, each earning ' : 'Absolutely crushed it, earning ',
            live(formatCount(score.value, 'point')),
            ' in a single day!',
          ),
        },
        {
          value: joinNames(daily.names),
          body: text(
            daily.tied
              ? "Weren't messing around either, each completing "
              : "Wasn't messing around either, completing ",
            live(formatCount(daily.value, 'challenge')),
            ' in one day!',
          ),
        },
      ],
    }
  }

  const si10: Step = () => {
    // Feature when any exclusive exists and the most active team spanned ≥2 days.
    // resolveWinners(..., 2) skips overcrowded multi-team ties.
    const exclusive = resolveWinners(G('SI-G07'), 2)
    const days = resolveWinners(G('SI-G08'), 2)
    if (!exclusive || !days || exclusive.value === null || days.value === null) return null
    if (exclusive.value < 1 || days.value < SI_OVERACHIEVER_MIN) return null

    return {
      type: 'double',
      id: 'SI-10',
      eyebrow: 'The Overachievers',
      icon: awardIcon('SI-G07'),
      headline: "Some teams just don't know when to quit!",
      heroes: [
        {
          value: joinNames(exclusive.names),
          body: text(
            exclusive.tied ? 'Each completed ' : 'Completed ',
            live(formatCount(exclusive.value, 'exclusive challenge')),
            ' that no other team managed to finish!',
          ),
        },
        {
          value: joinNames(days.names),
          body: text(
            days.tied
              ? 'Kept putting in WORK, each completing challenges on '
              : 'Kept putting in WORK, completing challenges on ',
            live(formatCount(days.value, 'different day')),
            '!',
          ),
        },
      ],
    }
  }

  const si11: Step = () =>
    entryPhotoSlide(
      {
        id: 'SI-11',
        eyebrow: 'One Last Memory',
        headline: 'And just like that, it was over.',
        subhead: 'One last challenge. One last memory. What a week!',
      },
      P('SI-P09')?.available ? P('SI-P09')?.photo : null,
      photos,
      used,
    )

  const si12: Step = () => {
    const remaining = C('SI-C07')
    const list = C('SI-C08')
    const count = numericValue(remaining)
    if (count === null || !isAvailable(list)) return null

    if (count === 0) {
      return {
        type: 'single',
        id: 'SI-12',
        eyebrow: 'The Ones That Got Away',
        icon: personalIcon('SI-P04'),
        headline: 'Wait... you did WHAT?!',
        heroValue: '0',
        heroLabel: 'challenges left unfinished!',
        paragraphs: [
          'Between all the teams, we managed to complete every single challenge!',
        ],
      }
    }

    return {
      type: 'single',
      id: 'SI-12',
      eyebrow: 'The Ones That Got Away',
      icon: personalIcon('SI-P04'),
      headline: "You can't win 'em all!",
      lead: "Or can you? Let's see how we did...",
      heroValue: formatNumber(count),
      heroLabel: count === 1 ? 'challenge left unfinished!' : 'challenges left unfinished!',
      paragraphs: [
        count === 1
          ? "This was the challenge nobody managed to complete. There's always next time!"
          : "These were the challenges nobody managed to complete. There's always next time!",
      ],
    }
  }

  return runSteps([si01, si02, si03, si04, si05, si06, si07, si08, si09, si10, si11, si12])
}
