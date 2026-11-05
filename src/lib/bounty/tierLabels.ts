import type { CocktailBountyTier, IngredientBountyTier } from '@/types/bountyHome'

const COCKTAIL_TIER_LABELS: Record<CocktailBountyTier, string> = {
  familiar: 'Familiar',
  interesting: 'Interesting',
  unusual: 'Unusual',
  adventurous: 'Adventurous',
}

const INGREDIENT_TIER_LABELS: Record<IngredientBountyTier, string> = {
  easy_to_find: 'Easy to Find',
  less_common: 'Less Common',
  hard_to_find: 'Hard to Find',
  elusive: 'Elusive',
}

export function cocktailTierLabel(tier: string): string {
  return COCKTAIL_TIER_LABELS[tier as CocktailBountyTier] ?? tier
}

export function ingredientTierLabel(tier: string): string {
  return INGREDIENT_TIER_LABELS[tier as IngredientBountyTier] ?? tier
}

export function pointsLabel(points: number): string {
  return `${points} Points`
}
