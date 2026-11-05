import type { BarSortMode, DrinkitBarRow } from '@/types/drinkLog'

/** Alphabetical (default) or deck ascending (lower decks first). */
export function sortDrinkitBars(bars: DrinkitBarRow[], mode: BarSortMode): DrinkitBarRow[] {
  const copy = [...bars]
  if (mode === 'deck') {
    copy.sort((a, b) => {
      if (a.deck !== b.deck) return a.deck - b.deck
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    return copy
  }
  copy.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    if (byName !== 0) return byName
    return a.deck - b.deck
  })
  return copy
}
