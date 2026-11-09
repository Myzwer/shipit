/**
 * Stage A3 — Drinking with Davids (automatically evaluated, non-scoring).
 * Companion identities use companion_alias tokens; loaders resolve via private roster.
 * Never commit player UUIDs in this file.
 */
import type { WorkingAchievementDefinition } from './workingCatalog'

const EITHER_DAVID = ['companion-david-f', 'companion-david-b'] as const
const POOL_BARS = ['lido-bar', 'the-mix', 'promenade-bars', 'star-bar'] as const

export const DRINKING_WITH_DAVIDS_CATEGORY = {
  key: 'drinking-with-davids',
  name: 'Drinking with Davids',
  groupKey: 'drinking_with_davids' as const,
  allViewOrder: 1,
}

export const DRINKING_WITH_DAVIDS_ACHIEVEMENTS: WorkingAchievementDefinition[] = [
  {
    snapshotRef: 'A3-DWD-001',
    stableKey: 'working-drinkit-dwd-margarita-kickoff',
    game: 'drinkit',
    ownerType: 'player',
    groupKey: 'drinking_with_davids',
    title: 'Margarita Kickoff',
    displayDescription:
      'Log an eligible Margarita with David F. or David B., any day. Separate from Bon Voyage! / first-drink awards.',
    secret: false,
    exclusive: false,
    readiness: 'enabled',
    conditionType: 'same_log',
    conditionConfig: {
      player_aliases: [...EITHER_DAVID],
      drink_tag: 'margarita',
    },
    dependencies: ['private roster aliases companion-david-f and companion-david-b'],
    blockers: [],
    enabledInDev: true,
    testOnly: true,
    visibilityNote: 'PROVISIONAL — secret/public not final',
    iconKey: 'score.friends',
  },
  {
    snapshotRef: 'A3-DWD-002',
    stableKey: 'working-drinkit-dwd-fireball-shot',
    game: 'drinkit',
    ownerType: 'player',
    groupKey: 'drinking_with_davids',
    title: 'Fireball Shot',
    displayDescription: 'Log Fireball Shot at Princess Live! with David F. or David B.',
    secret: false,
    exclusive: false,
    readiness: 'enabled',
    conditionType: 'same_log',
    conditionConfig: {
      player_aliases: [...EITHER_DAVID],
      drink_concept_key: 'fireball-shot',
      bar_key: 'princess-live',
    },
    dependencies: ['private roster aliases companion-david-f and companion-david-b'],
    blockers: [],
    enabledInDev: true,
    testOnly: true,
    visibilityNote: 'PROVISIONAL — secret/public not final',
    iconKey: 'score.friends',
  },
  {
    snapshotRef: 'A3-DWD-003',
    stableKey: 'working-drinkit-dwd-sambuca-shot',
    game: 'drinkit',
    ownerType: 'player',
    groupKey: 'drinking_with_davids',
    title: 'Sambuca Shot',
    displayDescription: 'Log Sambuca Shot at Princess Live! with David F. or David B.',
    secret: false,
    exclusive: false,
    readiness: 'enabled',
    conditionType: 'same_log',
    conditionConfig: {
      player_aliases: [...EITHER_DAVID],
      drink_concept_key: 'sambuca-shot',
      bar_key: 'princess-live',
    },
    dependencies: ['private roster aliases companion-david-f and companion-david-b'],
    blockers: [],
    enabledInDev: true,
    testOnly: true,
    visibilityNote: 'PROVISIONAL — secret/public not final',
    iconKey: 'score.friends',
  },
  {
    snapshotRef: 'A3-DWD-004',
    stableKey: 'working-drinkit-dwd-sunset-toast',
    game: 'drinkit',
    ownerType: 'player',
    groupKey: 'drinking_with_davids',
    title: 'Sunset Toast',
    displayDescription:
      'Log any eligible drink between 5:00 PM and 7:00 PM ship time with David F. or David B.',
    secret: false,
    exclusive: false,
    readiness: 'enabled',
    conditionType: 'same_log',
    conditionConfig: {
      player_aliases: [...EITHER_DAVID],
      hour_start: 17,
      hour_end: 19,
    },
    dependencies: ['private roster aliases companion-david-f and companion-david-b'],
    blockers: [],
    enabledInDev: true,
    testOnly: true,
    visibilityNote: 'PROVISIONAL — secret/public not final',
    iconKey: 'score.calendar',
  },
  {
    snapshotRef: 'A3-DWD-005',
    stableKey: 'working-drinkit-dwd-jimmy-buffett-toast',
    game: 'drinkit',
    ownerType: 'player',
    groupKey: 'drinking_with_davids',
    title: 'Jimmy Buffett Toast',
    displayDescription:
      'Log Loaded Corona at an authorized pool bar with David F. specifically.',
    secret: false,
    exclusive: false,
    readiness: 'enabled',
    conditionType: 'same_log',
    conditionConfig: {
      player_aliases: ['companion-david-f'],
      drink_concept_key: 'loaded-corona',
      bar_keys: [...POOL_BARS],
    },
    dependencies: ['private roster alias companion-david-f'],
    blockers: [],
    enabledInDev: true,
    testOnly: true,
    visibilityNote: 'PROVISIONAL — secret/public not final',
    iconKey: 'score.friends',
  },
]
