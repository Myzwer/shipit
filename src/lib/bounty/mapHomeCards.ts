import { nextOpeningUtcIso, deriveHomeBoardPhase } from '@/lib/bounty/boardPhase'
import { formatRemainingMs, remainingUntilUtc } from '@/lib/bounty/formatCountdown'
import {
  cocktailTierLabel,
  ingredientTierLabel,
  pointsLabel,
} from '@/lib/bounty/tierLabels'
import { copy, formatCopy } from '@/ui/copy'
import type {
  ActiveBarBounty,
  ActiveCocktailBounty,
  ActiveDailyChallenge,
  ActiveIngredientBounty,
  BarBountyPayload,
  CocktailBountyPayload,
  DailyChallengePayload,
  HomeBoardPhase,
  HomeBountyCardView,
  IngredientBountyPayload,
} from '@/types/bountyHome'
import type { ShipClockState } from '@/types/shipClock'

const CLAIM_TITLE = 'Claim flow arrives in a later phase — Claim It is disabled for now.'

function closedCard(
  id: 'cocktail' | 'ingredient' | 'bar' | 'daily',
  heading: string,
  phase: Extract<HomeBoardPhase, 'pre_open' | 'overnight'>,
  timerValue: string,
): HomeBountyCardView {
  const isPre = phase === 'pre_open'
  return {
    id,
    heading,
    presentation: 'closed',
    tierOrEyebrow: '',
    title: isPre ? copy.bounty.preOpening : copy.bounty.seeYouTomorrow,
    detail: isPre ? copy.bounty.preOpeningDetail : copy.bounty.overnightDetail,
    pointsLabel: '',
    footer: heading,
    timerLabel: copy.bounty.opensIn,
    timerValue,
    claimEnabled: false,
    claimTitle: CLAIM_TITLE,
  }
}

function pausedCard(
  id: 'cocktail' | 'ingredient' | 'bar' | 'daily',
  heading: string,
): HomeBountyCardView {
  return {
    id,
    heading,
    presentation: 'paused',
    tierOrEyebrow: '',
    title: copy.bounty.pausedTitle,
    detail: `${copy.bounty.pausedSecondary} ${copy.bounty.pausedOrganizerNote}`,
    pointsLabel: '',
    footer: heading,
    timerLabel: '',
    timerValue: '',
    claimEnabled: false,
    claimTitle: CLAIM_TITLE,
  }
}

function finaleCard(
  id: 'cocktail' | 'ingredient' | 'bar' | 'daily',
  heading: string,
): HomeBountyCardView {
  return {
    id,
    heading,
    presentation: 'finale',
    tierOrEyebrow: '',
    title: copy.bounty.finaleTitle,
    detail: copy.bounty.finaleDetail,
    pointsLabel: '',
    footer: heading,
    timerLabel: '',
    timerValue: '',
    claimEnabled: false,
    claimTitle: CLAIM_TITLE,
  }
}

function unavailableCard(
  id: 'cocktail' | 'ingredient' | 'bar' | 'daily',
  heading: string,
  title: string,
  detail: string,
): HomeBountyCardView {
  return {
    id,
    heading,
    presentation: 'unavailable',
    tierOrEyebrow: '',
    title,
    detail,
    pointsLabel: '',
    footer: heading,
    timerLabel: '',
    timerValue: '',
    claimEnabled: false,
    claimTitle: CLAIM_TITLE,
  }
}

function loadingCard(
  id: 'cocktail' | 'ingredient' | 'bar' | 'daily',
  heading: string,
): HomeBountyCardView {
  return {
    id,
    heading,
    presentation: 'loading',
    tierOrEyebrow: '',
    title: copy.bounty.loadingTitle,
    detail: '',
    pointsLabel: '',
    footer: heading,
    timerLabel: '',
    timerValue: '',
    claimEnabled: false,
    claimTitle: CLAIM_TITLE,
  }
}

function cocktailActiveCard(
  offer: ActiveCocktailBounty,
  timerValue: string,
): HomeBountyCardView {
  const ingredients = offer.listed_ingredients.map((i) => i.display_label).filter(Boolean)
  const location = formatCopy(copy.bounty.location, { barName: offer.designated_bar_name })
  const detail = ingredients.length
    ? `${ingredients.join(' · ')} · ${location}`
    : location

  return {
    id: 'cocktail',
    heading: copy.bounty.cocktail,
    presentation: 'active',
    tierOrEyebrow: cocktailTierLabel(offer.tier),
    title: offer.drink_name,
    detail,
    pointsLabel: pointsLabel(offer.points),
    footer: copy.bounty.cocktail,
    timerLabel: copy.bounty.timeRemaining,
    timerValue,
    claimEnabled: false,
    claimTitle: CLAIM_TITLE,
  }
}

function ingredientActiveCard(
  offer: ActiveIngredientBounty,
  timerValue: string,
): HomeBountyCardView {
  const barOrBars = offer.known_bar_count === 1 ? 'bar' : 'bars'
  return {
    id: 'ingredient',
    heading: copy.bounty.ingredient,
    presentation: 'active',
    tierOrEyebrow: ingredientTierLabel(offer.tier),
    title: offer.display_name,
    detail: formatCopy(copy.bounty.availableAt, {
      barCount: offer.known_bar_count,
      barOrBars,
    }),
    pointsLabel: pointsLabel(offer.points),
    footer: copy.bounty.ingredient,
    timerLabel: copy.bounty.timeRemaining,
    timerValue,
    claimEnabled: false,
    claimTitle: CLAIM_TITLE,
  }
}

function availableUntilLabel(cruiseDay: number | null | undefined): string {
  return cruiseDay === 7 ? '6:00 PM' : '11:00 PM'
}

function barActiveCard(offer: ActiveBarBounty): HomeBountyCardView {
  return {
    id: 'bar',
    heading: copy.bounty.bar,
    presentation: 'active',
    tierOrEyebrow: copy.bounty.barCompanionEyebrow,
    title: offer.bar_display_name,
    detail: copy.bounty.barDetail,
    pointsLabel: copy.bounty.barPointsRange,
    footer: copy.bounty.bar,
    timerLabel: formatCopy(copy.bounty.availableUntilTemplate, {
      time: availableUntilLabel(offer.cruise_day),
    }),
    timerValue: '',
    claimEnabled: false,
    claimTitle: CLAIM_TITLE,
  }
}

function dailyActiveCard(offer: ActiveDailyChallenge): HomeBountyCardView {
  const bits: string[] = [offer.instructions]
  if (offer.location_name) bits.push(`Location: ${offer.location_name}`)
  if (offer.meeting_time_ship_local) {
    bits.push(`Meet at ${formatMeetingTime(offer.meeting_time_ship_local)}`)
  }
  if (offer.is_all_hands) bits.push('All-Hands')

  return {
    id: 'daily',
    heading: copy.bounty.daily,
    presentation: 'active',
    tierOrEyebrow: offer.is_all_hands ? 'All-Hands' : copy.bounty.dailyEyebrow,
    title: offer.title,
    detail: bits.join(' · '),
    pointsLabel: pointsLabel(offer.points),
    footer: copy.bounty.daily,
    timerLabel: formatCopy(copy.bounty.availableUntilTemplate, {
      time: availableUntilLabel(offer.cruise_day),
    }),
    timerValue: '',
    claimEnabled: false,
    claimTitle: CLAIM_TITLE,
  }
}

/** Format Postgres `time` / `HH:MM:SS` as 12-hour Ship Time label. */
function formatMeetingTime(raw: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(raw)
  if (!m) return raw
  let h = Number(m[1])
  const min = m[2]
  const period = h >= 12 ? 'PM' : 'AM'
  h = h % 12 === 0 ? 12 : h % 12
  return `${h}:${min} ${period}`
}

function countdownValue(
  targetUtc: string | null,
  clock: ShipClockState | null,
  fetchedAtMs: number | null,
  nowMs: number,
): string {
  if (!targetUtc || !clock?.at_utc || fetchedAtMs == null) return '—'
  const ms = remainingUntilUtc(targetUtc, clock.at_utc, fetchedAtMs, nowMs)
  if (ms > 36 * 60 * 60_000) return '—'
  return formatRemainingMs(ms)
}

export function mapHomeBountyCards(input: {
  cocktail: CocktailBountyPayload | null
  ingredient: IngredientBountyPayload | null
  bar?: BarBountyPayload | null
  daily?: DailyChallengePayload | null
  clock: ShipClockState | null
  fetchStatus: 'loading' | 'ready' | 'unavailable' | 'error' | 'stale' | 'idle'
  fetchedAtMs: number | null
  nowMs?: number
}): { phase: HomeBoardPhase; cards: HomeBountyCardView[] } {
  const nowMs = input.nowMs ?? Date.now()
  const phase = deriveHomeBoardPhase({
    cocktail: input.cocktail,
    ingredient: input.ingredient,
    clock: input.clock,
    fetchStatus: input.fetchStatus,
  })
  const headings = {
    cocktail: copy.bounty.cocktail,
    ingredient: copy.bounty.ingredient,
    bar: copy.bounty.bar,
    daily: copy.bounty.daily,
  } as const

  if (phase === 'loading') {
    return {
      phase,
      cards: [
        loadingCard('cocktail', headings.cocktail),
        loadingCard('ingredient', headings.ingredient),
        loadingCard('bar', headings.bar),
        loadingCard('daily', headings.daily),
      ],
    }
  }

  if (phase === 'paused') {
    return {
      phase,
      cards: [
        pausedCard('cocktail', headings.cocktail),
        pausedCard('ingredient', headings.ingredient),
        pausedCard('bar', headings.bar),
        pausedCard('daily', headings.daily),
      ],
    }
  }

  if (phase === 'finale') {
    return {
      phase,
      cards: [
        finaleCard('cocktail', headings.cocktail),
        finaleCard('ingredient', headings.ingredient),
        finaleCard('bar', headings.bar),
        finaleCard('daily', headings.daily),
      ],
    }
  }

  if (phase === 'error' || phase === 'unavailable') {
    const title =
      input.fetchStatus === 'stale' ? copy.bounty.staleTitle : copy.bounty.unavailableTitle
    const detail =
      input.fetchStatus === 'stale' ? copy.bounty.staleDetail : copy.bounty.unavailableDetail
    return {
      phase,
      cards: [
        unavailableCard('cocktail', headings.cocktail, title, detail),
        unavailableCard('ingredient', headings.ingredient, title, detail),
        unavailableCard('bar', headings.bar, title, detail),
        unavailableCard('daily', headings.daily, title, detail),
      ],
    }
  }

  if (phase === 'pre_open' || phase === 'overnight') {
    const openUtc = input.clock ? nextOpeningUtcIso(input.clock) : null
    const timer = countdownValue(openUtc, input.clock, input.fetchedAtMs, nowMs)
    return {
      phase,
      cards: [
        closedCard('cocktail', headings.cocktail, phase, timer),
        closedCard('ingredient', headings.ingredient, phase, timer),
        closedCard('bar', headings.bar, phase, timer),
        closedCard('daily', headings.daily, phase, timer),
      ],
    }
  }

  const cocktail =
    input.cocktail?.status === 'active'
      ? cocktailActiveCard(
          input.cocktail,
          countdownValue(
            input.cocktail.public_end_utc,
            input.clock,
            input.fetchedAtMs,
            nowMs,
          ),
        )
      : unavailableCard(
          'cocktail',
          headings.cocktail,
          copy.bounty.unavailableTitle,
          copy.bounty.unavailableDetail,
        )

  const ingredient =
    input.ingredient?.status === 'active'
      ? ingredientActiveCard(
          input.ingredient,
          countdownValue(
            input.ingredient.public_end_utc,
            input.clock,
            input.fetchedAtMs,
            nowMs,
          ),
        )
      : unavailableCard(
          'ingredient',
          headings.ingredient,
          copy.bounty.unavailableTitle,
          copy.bounty.unavailableDetail,
        )

  const bar =
    input.bar?.status === 'active'
      ? barActiveCard(input.bar)
      : unavailableCard(
          'bar',
          headings.bar,
          copy.bounty.unavailableTitle,
          copy.bounty.unavailableDetail,
        )

  const daily =
    input.daily?.status === 'active'
      ? dailyActiveCard(input.daily)
      : unavailableCard(
          'daily',
          headings.daily,
          copy.bounty.unavailableTitle,
          copy.bounty.unavailableDetail,
        )

  return {
    phase,
    cards: [cocktail, ingredient, bar, daily],
  }
}

/** Earliest public boundary that should trigger a server refresh. */
export function nextRefreshBoundaryUtc(input: {
  cocktail: CocktailBountyPayload | null
  ingredient: IngredientBountyPayload | null
  bar?: BarBountyPayload | null
  daily?: DailyChallengePayload | null
  clock: ShipClockState | null
  phase: HomeBoardPhase
}): string | null {
  if (input.phase === 'active') {
    const ends: number[] = []
    if (input.cocktail?.status === 'active') {
      ends.push(Date.parse(input.cocktail.public_end_utc))
    }
    if (input.ingredient?.status === 'active') {
      ends.push(Date.parse(input.ingredient.public_end_utc))
    }
    if (input.bar?.status === 'active') {
      ends.push(Date.parse(input.bar.public_end_utc))
    }
    if (input.daily?.status === 'active') {
      ends.push(Date.parse(input.daily.public_end_utc))
    }
    const valid = ends.filter((n) => Number.isFinite(n))
    if (!valid.length) return null
    return new Date(Math.min(...valid)).toISOString()
  }
  if ((input.phase === 'pre_open' || input.phase === 'overnight') && input.clock) {
    return nextOpeningUtcIso(input.clock)
  }
  return null
}
