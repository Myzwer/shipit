/**
 * Phase 7A bounded achievement condition schema.
 * Unknown types fail validation. No arbitrary code / JSON-to-SQL.
 */

export const ACHIEVEMENT_CONDITION_TYPES = [
  'event_count',
  'distinct_count',
  'grouped_count',
  'exact_match',
  'tag_match',
  'same_submission_claims',
  'set_completion',
  'category_completion',
  'event_interval',
  'ordered_after',
  'companion_predicate',
  'ship_time_window',
  'cruise_day',
  'recipe_ingredient_count',
  'all',
  'any',
] as const

export type AchievementConditionType = (typeof ACHIEVEMENT_CONDITION_TYPES)[number]

export type EventKind =
  | 'drink_log'
  | 'scavenger_completion'
  | 'daily_completion'
  | 'bounty_claim'

export type DistinctSubject =
  | 'bars'
  | 'drink_concepts'
  | 'cruise_days'
  | 'companions'
  | 'bounty_categories'
  | 'bounty_claim_days'
  | 'scavenger_categories'
  | 'ingredient_tags'
  | 'drink_modes'

export interface ConditionBase {
  type: AchievementConditionType
}

export interface EventCountCondition extends ConditionBase {
  type: 'event_count'
  event: EventKind
  threshold: number
  bounty_category?: 'cocktail' | 'ingredient' | 'bar' | 'daily'
  drink_mode?: 'named_catalog' | 'generic_beer' | 'generic_wine' | 'generic_other' | 'unlisted_named'
  challenge_key?: string
}

export interface DistinctCountCondition extends ConditionBase {
  type: 'distinct_count'
  subject: DistinctSubject
  threshold: number
  /** For ingredient_tags subject: restrict to this tag namespace prefix or exact tags list. */
  tags?: string[]
  /**
   * Event kind for cruise_days (and similar). Drink It! defaults to drink_log;
   * Ship It! defaults to scavenger_completion. Set daily_completion only when
   * the definition explicitly counts Daily days.
   */
  event?: EventKind
  /** For bounty_claim_days: optional category filter (cocktail/ingredient/bar/daily). */
  bounty_category?: 'cocktail' | 'ingredient' | 'bar' | 'daily'
}

export interface GroupedCountCondition extends ConditionBase {
  type: 'grouped_count'
  /** e.g. challenges_same_day, drinks_same_bar_days, distinct_cocktails_at_bar */
  mode:
    | 'events_same_day'
    | 'same_bar_distinct_days'
    | 'distinct_cocktails_one_bar'
    | 'bars_same_day'
    | 'same_cocktail_logs'
    | 'same_cocktail_distinct_bars'
    | 'bounty_categories_same_day'
  event: EventKind
  threshold: number
}

export interface ExactMatchCondition extends ConditionBase {
  type: 'exact_match'
  challenge_key?: string
  drink_mode?: EventCountCondition['drink_mode']
  ingredient_key?: string
  drink_concept_key?: string
}

export interface TagMatchCondition extends ConditionBase {
  type: 'tag_match'
  scope: 'ingredient' | 'drink_concept'
  tags: string[]
  /** all = every tag present on one entity; any = at least one */
  match?: 'all' | 'any'
  threshold?: number
  /** Count distinct matching tags across cruise (for fruit sets). */
  distinct_across_cruise?: boolean
  /**
   * Count drink_log submissions that contain any listed tag (each log once).
   * Used for D-037–D-042 style thresholds.
   */
  count_logs?: boolean
  /**
   * Require one cocktail whose ingredients carry at least `threshold`
   * distinct tags from `tags` (D-063 / D-064).
   */
  min_distinct_on_log?: boolean
}

export interface RecipeIngredientCountCondition extends ConditionBase {
  type: 'recipe_ingredient_count'
  /** Minimum catalog_offering_ingredients rows on one logged offering (D-062). */
  threshold: number
}

export interface SameSubmissionClaimsCondition extends ConditionBase {
  type: 'same_submission_claims'
  min_categories?: number
  require_categories?: Array<'cocktail' | 'ingredient' | 'bar' | 'daily'>
}

export interface SetCompletionCondition extends ConditionBase {
  type: 'set_completion'
  /** all scavenger challenges, or explicit keys */
  scope: 'all_scavenger_challenges' | 'challenge_keys'
  challenge_keys?: string[]
}

export interface CategoryCompletionCondition extends ConditionBase {
  type: 'category_completion'
  mode: 'one_per_category' | 'full_any_category'
}

export interface EventIntervalCondition extends ConditionBase {
  type: 'event_interval'
  event: EventKind
  max_minutes?: number
  min_minutes?: number
  /** Require same bar_id on both events */
  same_bar?: boolean
  /** Require same drink_concept_id on both events */
  same_drink_concept?: boolean
}

export interface OrderedAfterCondition extends ConditionBase {
  type: 'ordered_after'
  /** After claiming Cocktail bounty on a concept, later log same concept again */
  mode: 'repeat_drink_after_cocktail_claim'
}

export interface CompanionPredicateCondition extends ConditionBase {
  type: 'companion_predicate'
  mode:
    | 'min_companions'
    | 'distinct_companions'
    | 'same_companion_distinct_bars'
    | 'named_companion'
  threshold?: number
  /** Test-only / out-of-band player UUID — never commit real roster maps. */
  companion_player_id?: string
  require_drink_mode?: EventCountCondition['drink_mode']
  require_ingredient_tag?: string
  require_drink_concept_tag?: string
  ship_hour_start?: number
  ship_hour_end?: number
}

export interface ShipTimeWindowCondition extends ConditionBase {
  type: 'ship_time_window'
  before_hour?: number
  after_hour?: number
  /** Inclusive local hour range [start, end) */
  hour_start?: number
  hour_end?: number
  port_day_only?: boolean
  event: EventKind
}

export interface CruiseDayCondition extends ConditionBase {
  type: 'cruise_day'
  which: 'first' | 'final' | 'thanksgiving'
  event: EventKind
}

export interface AllCondition extends ConditionBase {
  type: 'all'
  conditions: AchievementCondition[]
}

export interface AnyCondition extends ConditionBase {
  type: 'any'
  conditions: AchievementCondition[]
}

export type AchievementCondition =
  | EventCountCondition
  | DistinctCountCondition
  | GroupedCountCondition
  | ExactMatchCondition
  | TagMatchCondition
  | RecipeIngredientCountCondition
  | SameSubmissionClaimsCondition
  | SetCompletionCondition
  | CategoryCompletionCondition
  | EventIntervalCondition
  | OrderedAfterCondition
  | CompanionPredicateCondition
  | ShipTimeWindowCondition
  | CruiseDayCondition
  | AllCondition
  | AnyCondition

const MAX_NESTING = 4

export function validateAchievementCondition(
  input: unknown,
  depth = 0,
): { ok: true; condition: AchievementCondition } | { ok: false; error: string } {
  if (depth > MAX_NESTING) return { ok: false, error: 'CONDITION_NESTING_TOO_DEEP' }
  if (!input || typeof input !== 'object') return { ok: false, error: 'CONDITION_REQUIRED' }
  const c = input as Record<string, unknown>
  const type = c.type
  if (typeof type !== 'string' || !(ACHIEVEMENT_CONDITION_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: `UNKNOWN_CONDITION_TYPE:${String(type)}` }
  }
  if (type === 'all' || type === 'any') {
    const kids = c.conditions
    if (!Array.isArray(kids) || kids.length === 0 || kids.length > 8) {
      return { ok: false, error: 'COMPOSITE_CONDITIONS_INVALID' }
    }
    for (const kid of kids) {
      const inner = validateAchievementCondition(kid, depth + 1)
      if (!inner.ok) return inner
    }
  }
  if (type === 'event_count' && (typeof c.threshold !== 'number' || c.threshold < 1)) {
    return { ok: false, error: 'EVENT_COUNT_THRESHOLD' }
  }
  if (type === 'tag_match' && (!Array.isArray(c.tags) || c.tags.length === 0)) {
    return { ok: false, error: 'TAG_MATCH_REQUIRES_TAGS' }
  }
  if (
    type === 'recipe_ingredient_count' &&
    (typeof c.threshold !== 'number' || c.threshold < 1)
  ) {
    return { ok: false, error: 'RECIPE_INGREDIENT_COUNT_THRESHOLD' }
  }
  return { ok: true, condition: input as AchievementCondition }
}
