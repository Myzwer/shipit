/**
 * Per-challenge Ship It! icon assignments (Phase S4).
 *
 * Keyed by stable `canonical_key` from the scavenger catalog — not by category.
 * Icons are chosen from what each challenge asks players to photograph or do.
 * Invalid / missing keys fall back to `theme.ship-it`.
 */
import type { SemanticIconKey } from '@/ui/icons'
import scavengerDevChallenges from '../../../supabase/seed/scavenger_dev_challenges.json'

export const SHIPIT_CHALLENGE_ICON_FALLBACK: SemanticIconKey = 'theme.ship-it'

/**
 * Stable challenge ID → semantic icon key.
 * Intentional duplicates (at most twice) are noted in comments.
 */
export const SHIPIT_CHALLENGE_ICONS: Readonly<Record<string, SemanticIconKey>> = {
  // Classic Ship Landmarks
  'the-piazza-grandeur': 'shipit.stairs',
  'movies-under-the-stars': 'shipit.film',
  'under-the-dome': 'shipit.dome',
  'miniature-masterpiece': 'theme.ship-it', // scale model of a Princess ship
  'lotus-spa-zen': 'shipit.spa',
  'front-row-center': 'shipit.theater',
  'casino-neon': 'shipit.dice',
  'art-critic': 'shipit.palette',
  'gym-buffs': 'shipit.fitness', // treadmill running — intentional reuse w/ deck-dance-move
  'guest-services': 'shipit.concierge',

  // Food & Drink Discoveries
  'international-cafe': 'score.coffee',
  'omalleys-irish-pub': 'score.beer',
  'poolside-slice': 'shipit.pizza',
  'soft-serve-swirl': 'shipit.ice-cream',
  'buffet-multi-tasker': 'score.utensils', // intentional reuse w/ main-dining (plated food)
  'tropical-paradise': 'score.cocktail',
  'main-dining-elegance': 'score.utensils',
  'sweet-treat': 'shipit.cake',
  'good-spirits-mixology': 'score.whiskey',
  'room-service-delivery': 'shipit.concierge', // intentional reuse w/ guest-services (service)

  // Quirky Details & Hidden Artifacts
  'carpet-compass': 'score.compass',
  'stateroom-door-flair': 'shipit.door',
  'elevator-map': 'shipit.elevator',
  'nautical-rose': 'score.compass', // intentional reuse — compass rose motif
  'safety-first': 'shipit.life-ring',
  'deck-13-mystery': 'shipit.mystery',
  'high-wind-warning': 'status.warning',
  'towel-zoo': 'shipit.paw',
  'lounge-spotlight': 'shipit.microphone',
  'ocean-wake': 'shipit.water',

  // Interactive Crew & Activity Challenges
  'the-cruise-guide': 'shipit.clipboard',
  'crew-high-five': 'shipit.handshake',
  'captains-portrait': 'shipit.captain',
  'trivia-masters': 'shipit.brain',
  'live-music-backdrop': 'score.music',
  'ocean-lookout': 'shipit.binoculars',
  'deck-dance-move': 'shipit.fitness', // intentional reuse w/ gym-buffs (active movement)
  'bingo-champion': 'shipit.ticket',
  'souvenir-selection': 'shipit.gift',
  'the-youth-club-entry': 'shipit.children',

  // Creative Team & Action Shots
  'wind-tunnel': 'shipit.wind',
  'sunset-silhouette': 'shipit.sunset',
  'king-of-the-world': 'shipit.pose',
  'triple-match': 'shipit.shirt',
  'mid-air-jump': 'shipit.jump',
  'chair-squeeze': 'shipit.chair',
  'shadow-art': 'score.friends',
  'comically-lost': 'shipit.map',
  'bridge-wing-peek': 'shipit.binoculars', // intentional reuse — spotting / lookout
  'victory-dance': 'score.leaderboard',
}

export type ShipItChallengeIconResolution =
  | { ok: true; icon_key: SemanticIconKey; source: 'assigned' }
  | { ok: true; icon_key: SemanticIconKey; source: 'fallback'; reason: 'missing' | 'unknown' }

/** Resolve the challenge-card content icon (available state). Completed UI still uses status.completed. */
export function resolveShipItChallengeIcon(
  canonicalKey: string | null | undefined,
): ShipItChallengeIconResolution {
  if (!canonicalKey) {
    return { ok: true, icon_key: SHIPIT_CHALLENGE_ICON_FALLBACK, source: 'fallback', reason: 'missing' }
  }
  const assigned = SHIPIT_CHALLENGE_ICONS[canonicalKey]
  if (!assigned) {
    return { ok: true, icon_key: SHIPIT_CHALLENGE_ICON_FALLBACK, source: 'fallback', reason: 'unknown' }
  }
  return { ok: true, icon_key: assigned, source: 'assigned' }
}

export function listShipItChallengeIconCoverage(): {
  total_challenges: number
  assigned: number
  missing_keys: string[]
  unique_icons: number
  reuse_counts: Array<{ icon_key: string; count: number; keys: string[] }>
  over_reused: Array<{ icon_key: string; count: number; keys: string[] }>
} {
  const catalogKeys = (scavengerDevChallenges as Array<{ canonical_key: string }>).map(
    (row) => row.canonical_key,
  )
  const missing: string[] = []
  const byIcon = new Map<string, string[]>()

  for (const key of catalogKeys) {
    const icon = SHIPIT_CHALLENGE_ICONS[key]
    if (!icon) {
      missing.push(key)
      continue
    }
    const list = byIcon.get(icon) ?? []
    list.push(key)
    byIcon.set(icon, list)
  }

  const reuseCounts = [...byIcon.entries()]
    .map(([icon_key, keys]) => ({ icon_key, count: keys.length, keys }))
    .sort((a, b) => b.count - a.count || a.icon_key.localeCompare(b.icon_key))

  return {
    total_challenges: catalogKeys.length,
    assigned: catalogKeys.length - missing.length,
    missing_keys: missing,
    unique_icons: byIcon.size,
    reuse_counts: reuseCounts.filter((row) => row.count > 1),
    over_reused: reuseCounts.filter((row) => row.count > 2),
  }
}
