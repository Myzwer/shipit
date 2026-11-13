import type { BarSortMode, DrinkitBarRow } from '@/types/drinkLog'

function isVirtualBar(bar: DrinkitBarRow): boolean {
  return bar.is_virtual === true
}

/** Alphabetical (default) or deck ascending (lower decks first). Virtual sources always last. */
export function sortDrinkitBars(bars: DrinkitBarRow[], mode: BarSortMode): DrinkitBarRow[] {
  const copy = [...bars]
  if (mode === 'deck') {
    copy.sort((a, b) => {
      const av = isVirtualBar(a) ? 1 : 0
      const bv = isVirtualBar(b) ? 1 : 0
      if (av !== bv) return av - bv
      if (a.deck !== b.deck) return a.deck - b.deck
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    return copy
  }
  copy.sort((a, b) => {
    const av = isVirtualBar(a) ? 1 : 0
    const bv = isVirtualBar(b) ? 1 : 0
    if (av !== bv) return av - bv
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    if (byName !== 0) return byName
    return a.deck - b.deck
  })
  return copy
}
