/**
 * Permanent Other Drinks — application-owned ordinary-log options.
 * Catalog-independent: never sourced from imported bar menus.
 */
export type OtherDrinksSection = 'general' | 'shots' | 'custom'

export type OtherDrinksLogMode = 'generic_beer' | 'generic_wine' | 'unlisted_named'

export interface OtherDrinksOption {
  /** Stable app key (not a catalog offering id). */
  id: string
  /** Player-facing label. */
  label: string
  section: OtherDrinksSection
  sectionLabel: string
  logMode: OtherDrinksLogMode
  /** Unlisted kind when logMode is unlisted_named. */
  unlistedDrinkKind?: 'named_cocktail' | 'beer' | 'wine' | 'other_alcoholic'
  /**
   * Optional drink_concepts.canonical_key for achievement / historical identity.
   * Never invents an offering; server may attach concept_id when the concept exists.
   */
  drinkConceptKey?: string
}

const GENERAL = 'General'
const SHOTS = 'Shots'
const CUSTOM = 'Custom drinks'

/** Fixed launch order — all 16 at every physical bar. */
export const OTHER_DRINKS_OPTIONS: readonly OtherDrinksOption[] = [
  { id: 'wine', label: 'Wine', section: 'general', sectionLabel: GENERAL, logMode: 'generic_wine' },
  { id: 'beer', label: 'Beer', section: 'general', sectionLabel: GENERAL, logMode: 'generic_beer' },
  {
    id: 'loaded-corona',
    label: 'Loaded Corona',
    section: 'general',
    sectionLabel: GENERAL,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'other_alcoholic',
    drinkConceptKey: 'loaded-corona',
  },
  {
    id: 'princess-cooler',
    label: 'Princess Cooler',
    section: 'general',
    sectionLabel: GENERAL,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'other_alcoholic',
    drinkConceptKey: 'princess-ultimate-cooler',
  },
  {
    id: 'tequila-shot',
    label: 'Tequila Shot',
    section: 'shots',
    sectionLabel: SHOTS,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'other_alcoholic',
    drinkConceptKey: 'tequila-shot',
  },
  {
    id: 'sambuca-shot',
    label: 'Sambuca Shot',
    section: 'shots',
    sectionLabel: SHOTS,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'other_alcoholic',
    drinkConceptKey: 'sambuca-shot',
  },
  {
    id: 'fireball-shot',
    label: 'Fireball Shot',
    section: 'shots',
    sectionLabel: SHOTS,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'other_alcoholic',
    drinkConceptKey: 'fireball-shot',
  },
  {
    id: 'vodka-shot',
    label: 'Vodka Shot',
    section: 'shots',
    sectionLabel: SHOTS,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'other_alcoholic',
  },
  {
    id: 'custom-rum',
    label: 'Rum — Custom Drink',
    section: 'custom',
    sectionLabel: CUSTOM,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'named_cocktail',
  },
  {
    id: 'custom-tequila',
    label: 'Tequila — Custom Drink',
    section: 'custom',
    sectionLabel: CUSTOM,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'named_cocktail',
  },
  {
    id: 'custom-gin',
    label: 'Gin — Custom Drink',
    section: 'custom',
    sectionLabel: CUSTOM,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'named_cocktail',
  },
  {
    id: 'custom-vodka',
    label: 'Vodka — Custom Drink',
    section: 'custom',
    sectionLabel: CUSTOM,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'named_cocktail',
  },
  {
    id: 'custom-whiskey',
    label: 'Whiskey — Custom Drink',
    section: 'custom',
    sectionLabel: CUSTOM,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'named_cocktail',
  },
  {
    id: 'custom-bourbon',
    label: 'Bourbon — Custom Drink',
    section: 'custom',
    sectionLabel: CUSTOM,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'named_cocktail',
  },
  {
    id: 'custom-tennessee-whiskey',
    label: 'Tennessee Whiskey — Custom Drink',
    section: 'custom',
    sectionLabel: CUSTOM,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'named_cocktail',
  },
  {
    id: 'custom-scotch',
    label: 'Scotch — Custom Drink',
    section: 'custom',
    sectionLabel: CUSTOM,
    logMode: 'unlisted_named',
    unlistedDrinkKind: 'named_cocktail',
  },
] as const

/** Concept keys that must not duplicate in the photographed menu list. */
export const OTHER_DRINKS_MENU_HIDE_CONCEPT_KEYS: ReadonlySet<string> = new Set(
  OTHER_DRINKS_OPTIONS.map((o) => o.drinkConceptKey).filter((k): k is string => !!k),
)

export function getOtherDrinksOption(id: string): OtherDrinksOption | undefined {
  return OTHER_DRINKS_OPTIONS.find((o) => o.id === id)
}

export function otherDrinksGrouped(): Array<{
  section: OtherDrinksSection
  sectionLabel: string
  options: OtherDrinksOption[]
}> {
  const order: OtherDrinksSection[] = ['general', 'shots', 'custom']
  return order.map((section) => {
    const options = OTHER_DRINKS_OPTIONS.filter((o) => o.section === section)
    return { section, sectionLabel: options[0]?.sectionLabel ?? section, options }
  })
}
