/**
 * Final approved Cruise Wrapped inventory (80 entries).
 * Spec identifiers are stable content/test IDs from
 * CRUISE_WRAPPED_FINAL_IMPLEMENTATION_SPEC.
 */

export type WrappedGame = 'drinkit' | 'shipit'
export type WrappedSection = 'personal' | 'global' | 'collective'

export interface WrappedInventoryEntry {
  specId: string
  game: WrappedGame
  section: WrappedSection
  order: number
  label: string
  /** Count totals may legitimately be 0; favorites/winners use unavailable. */
  zeroIsValid?: boolean
}

export const DRINKIT_PERSONAL: WrappedInventoryEntry[] = [
  { specId: 'DI-P01', game: 'drinkit', section: 'personal', order: 1, label: 'Drinks Logged', zeroIsValid: true },
  { specId: 'DI-P02', game: 'drinkit', section: 'personal', order: 2, label: 'Total Points', zeroIsValid: true },
  { specId: 'DI-P03', game: 'drinkit', section: 'personal', order: 3, label: 'Final Rank' },
  { specId: 'DI-P04', game: 'drinkit', section: 'personal', order: 4, label: 'Achievements Unlocked', zeroIsValid: true },
  { specId: 'DI-P05', game: 'drinkit', section: 'personal', order: 5, label: 'Bounties Completed', zeroIsValid: true },
  { specId: 'DI-P06', game: 'drinkit', section: 'personal', order: 6, label: 'Cocktail Bounties Completed', zeroIsValid: true },
  { specId: 'DI-P07', game: 'drinkit', section: 'personal', order: 7, label: 'Ingredient Bounties Completed', zeroIsValid: true },
  { specId: 'DI-P08', game: 'drinkit', section: 'personal', order: 8, label: 'Bar Bounties Completed', zeroIsValid: true },
  { specId: 'DI-P09', game: 'drinkit', section: 'personal', order: 9, label: 'Daily Challenges Completed', zeroIsValid: true },
  { specId: 'DI-P10', game: 'drinkit', section: 'personal', order: 10, label: 'Different Drinks Tried', zeroIsValid: true },
  { specId: 'DI-P11', game: 'drinkit', section: 'personal', order: 11, label: 'Bars Visited', zeroIsValid: true },
  { specId: 'DI-P12', game: 'drinkit', section: 'personal', order: 12, label: 'Favorite Drink' },
  { specId: 'DI-P13', game: 'drinkit', section: 'personal', order: 13, label: 'Favorite Liquor' },
  { specId: 'DI-P14', game: 'drinkit', section: 'personal', order: 14, label: 'Favorite Ingredient' },
  { specId: 'DI-P15', game: 'drinkit', section: 'personal', order: 15, label: 'Favorite Bar' },
  { specId: 'DI-P16', game: 'drinkit', section: 'personal', order: 16, label: 'Partner in Crime' },
  { specId: 'DI-P17', game: 'drinkit', section: 'personal', order: 17, label: 'Biggest Day' },
  { specId: 'DI-P18', game: 'drinkit', section: 'personal', order: 18, label: 'Most Active Day' },
]

export const DRINKIT_GLOBAL: WrappedInventoryEntry[] = [
  { specId: 'DI-G01', game: 'drinkit', section: 'global', order: 1, label: 'Grand Champion' },
  { specId: 'DI-G02', game: 'drinkit', section: 'global', order: 2, label: 'Most Drinks Logged' },
  { specId: 'DI-G03', game: 'drinkit', section: 'global', order: 3, label: 'Most Bounties Completed' },
  { specId: 'DI-G04', game: 'drinkit', section: 'global', order: 4, label: 'Most Cocktail Bounties Completed' },
  { specId: 'DI-G05', game: 'drinkit', section: 'global', order: 5, label: 'Most Ingredient Bounties Completed' },
  { specId: 'DI-G06', game: 'drinkit', section: 'global', order: 6, label: 'Most Bar Bounties Completed' },
  { specId: 'DI-G07', game: 'drinkit', section: 'global', order: 7, label: 'Most Daily Challenges Completed' },
  { specId: 'DI-G08', game: 'drinkit', section: 'global', order: 8, label: 'Most Achievements Unlocked' },
  { specId: 'DI-G09', game: 'drinkit', section: 'global', order: 9, label: 'Most Bars Visited' },
  { specId: 'DI-G10', game: 'drinkit', section: 'global', order: 10, label: 'Most Different Drinks Tried' },
  { specId: 'DI-G11', game: 'drinkit', section: 'global', order: 11, label: 'Most Adventurous Drinker' },
  { specId: 'DI-G12', game: 'drinkit', section: 'global', order: 12, label: 'Most Frequent Drinking Pair' },
  { specId: 'DI-G13', game: 'drinkit', section: 'global', order: 13, label: 'Earliest Drink Logged' },
  { specId: 'DI-G14', game: 'drinkit', section: 'global', order: 14, label: 'Latest Drink Logged' },
  { specId: 'DI-G15', game: 'drinkit', section: 'global', order: 15, label: 'Highest Single-Day Score' },
  { specId: 'DI-G16', game: 'drinkit', section: 'global', order: 16, label: 'Most Drinks in One Day' },
]

export const DRINKIT_COLLECTIVE: WrappedInventoryEntry[] = [
  { specId: 'DI-C01', game: 'drinkit', section: 'collective', order: 1, label: 'Total Drinks Logged', zeroIsValid: true },
  { specId: 'DI-C02', game: 'drinkit', section: 'collective', order: 2, label: 'Total Different Drinks Tried', zeroIsValid: true },
  { specId: 'DI-C03', game: 'drinkit', section: 'collective', order: 3, label: 'Total Bounties Completed', zeroIsValid: true },
  { specId: 'DI-C04', game: 'drinkit', section: 'collective', order: 4, label: 'Total Achievements Unlocked', zeroIsValid: true },
  { specId: 'DI-C05', game: 'drinkit', section: 'collective', order: 5, label: 'Most Popular Drink' },
  { specId: 'DI-C06', game: 'drinkit', section: 'collective', order: 6, label: 'Most Popular Liquor' },
  { specId: 'DI-C07', game: 'drinkit', section: 'collective', order: 7, label: 'Most Popular Ingredient' },
  { specId: 'DI-C08', game: 'drinkit', section: 'collective', order: 8, label: 'Most Popular Bar' },
  { specId: 'DI-C09', game: 'drinkit', section: 'collective', order: 9, label: 'Least Visited Bar' },
  { specId: 'DI-C10', game: 'drinkit', section: 'collective', order: 10, label: 'Most Popular Drinking Day' },
  { specId: 'DI-C11', game: 'drinkit', section: 'collective', order: 11, label: 'Total Unique Ingredients Tried', zeroIsValid: true },
  { specId: 'DI-C12', game: 'drinkit', section: 'collective', order: 12, label: 'Total Points Earned', zeroIsValid: true },
]

export const SHIPIT_PERSONAL: WrappedInventoryEntry[] = [
  { specId: 'SI-P01', game: 'shipit', section: 'personal', order: 1, label: 'Final Rank' },
  { specId: 'SI-P02', game: 'shipit', section: 'personal', order: 2, label: 'Total Points', zeroIsValid: true },
  { specId: 'SI-P03', game: 'shipit', section: 'personal', order: 3, label: 'Challenges Completed', zeroIsValid: true },
  { specId: 'SI-P04', game: 'shipit', section: 'personal', order: 4, label: 'Completion Percentage' },
  { specId: 'SI-P05', game: 'shipit', section: 'personal', order: 5, label: 'Most Completed Category' },
  { specId: 'SI-P06', game: 'shipit', section: 'personal', order: 6, label: 'Biggest Day' },
  { specId: 'SI-P07', game: 'shipit', section: 'personal', order: 7, label: 'Most Active Day' },
  { specId: 'SI-P08', game: 'shipit', section: 'personal', order: 8, label: 'First Challenge Completed' },
  { specId: 'SI-P09', game: 'shipit', section: 'personal', order: 9, label: 'Last Challenge Completed' },
  { specId: 'SI-P10', game: 'shipit', section: 'personal', order: 10, label: 'Exclusive Challenges', zeroIsValid: true },
]

export const SHIPIT_GLOBAL: WrappedInventoryEntry[] = [
  { specId: 'SI-G01', game: 'shipit', section: 'global', order: 1, label: 'Grand Champions' },
  { specId: 'SI-G02', game: 'shipit', section: 'global', order: 2, label: 'Most Challenges Completed' },
  { specId: 'SI-G03', game: 'shipit', section: 'global', order: 3, label: 'First Challenge Completed' },
  { specId: 'SI-G04', game: 'shipit', section: 'global', order: 4, label: 'Last Challenge Completed' },
  { specId: 'SI-G05', game: 'shipit', section: 'global', order: 5, label: 'Highest Single-Day Score' },
  { specId: 'SI-G06', game: 'shipit', section: 'global', order: 6, label: 'Most Challenges in One Day' },
  { specId: 'SI-G07', game: 'shipit', section: 'global', order: 7, label: 'Most Exclusive Challenges' },
  { specId: 'SI-G08', game: 'shipit', section: 'global', order: 8, label: 'Most Active Days' },
  { specId: 'SI-G09', game: 'shipit', section: 'global', order: 9, label: 'Category Leaders' },
  { specId: 'SI-G10', game: 'shipit', section: 'global', order: 10, label: 'Highest-Value Challenge Completed' },
  { specId: 'SI-G11', game: 'shipit', section: 'global', order: 11, label: 'Closest Teams' },
  { specId: 'SI-G12', game: 'shipit', section: 'global', order: 12, label: 'Largest Lead' },
]

export const SHIPIT_COLLECTIVE: WrappedInventoryEntry[] = [
  { specId: 'SI-C01', game: 'shipit', section: 'collective', order: 1, label: 'Total Challenges Completed', zeroIsValid: true },
  { specId: 'SI-C02', game: 'shipit', section: 'collective', order: 2, label: 'Unique Challenges Completed', zeroIsValid: true },
  { specId: 'SI-C03', game: 'shipit', section: 'collective', order: 3, label: 'Overall Completion Percentage' },
  { specId: 'SI-C04', game: 'shipit', section: 'collective', order: 4, label: 'Total Points Earned', zeroIsValid: true },
  { specId: 'SI-C05', game: 'shipit', section: 'collective', order: 5, label: 'Most Popular Challenge' },
  { specId: 'SI-C06', game: 'shipit', section: 'collective', order: 6, label: 'Least Popular Completed Challenge' },
  { specId: 'SI-C07', game: 'shipit', section: 'collective', order: 7, label: 'Uncompleted Challenges', zeroIsValid: true },
  { specId: 'SI-C08', game: 'shipit', section: 'collective', order: 8, label: 'Uncompleted Challenge List' },
  { specId: 'SI-C09', game: 'shipit', section: 'collective', order: 9, label: 'Most Popular Category' },
  { specId: 'SI-C10', game: 'shipit', section: 'collective', order: 10, label: 'Least Popular Category' },
  { specId: 'SI-C11', game: 'shipit', section: 'collective', order: 11, label: 'Most Active Day' },
  { specId: 'SI-C12', game: 'shipit', section: 'collective', order: 12, label: 'Final Team Standings' },
]

export const DRINKIT_WRAPPED_INVENTORY: WrappedInventoryEntry[] = [
  ...DRINKIT_PERSONAL,
  ...DRINKIT_GLOBAL,
  ...DRINKIT_COLLECTIVE,
]

export const SHIPIT_WRAPPED_INVENTORY: WrappedInventoryEntry[] = [
  ...SHIPIT_PERSONAL,
  ...SHIPIT_GLOBAL,
  ...SHIPIT_COLLECTIVE,
]

export const ALL_WRAPPED_INVENTORY: WrappedInventoryEntry[] = [
  ...DRINKIT_WRAPPED_INVENTORY,
  ...SHIPIT_WRAPPED_INVENTORY,
]

export const EXCLUDED_WRAPPED_LABELS = [
  'Most Adventurous Drink',
  'Photos Uploaded',
  'Drinking Buddies',
  'Most Social Drinks',
  'Most Photos Uploaded',
  'Total Photos Uploaded',
  'Total Unique Bars Visited',
  'Categories Explored',
  'Challenges by Category',
  'Highest-Value Challenge',
  'Total Photos Submitted',
] as const

export function inventoryForGame(game: WrappedGame): WrappedInventoryEntry[] {
  return game === 'drinkit' ? DRINKIT_WRAPPED_INVENTORY : SHIPIT_WRAPPED_INVENTORY
}

export function inventoryIdsForGame(game: WrappedGame): string[] {
  return inventoryForGame(game).map((e) => e.specId)
}

export function assertInventoryCounts(): {
  drinkit: number
  shipit: number
  total: number
} {
  return {
    drinkit: DRINKIT_WRAPPED_INVENTORY.length,
    shipit: SHIPIT_WRAPPED_INVENTORY.length,
    total: ALL_WRAPPED_INVENTORY.length,
  }
}
