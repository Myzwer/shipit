/**
 * Shared Wrapped presentation layout primitives.
 * Content inventory stays in inventory.ts / final implementation spec.
 * This module only decides how approved entries are sized on screen.
 */

import type { WrappedEntry, WrappedStatCardKind } from '@/types/wrapped'

export type WrappedStatLayout = 'compact' | 'text' | 'featured'

/**
 * Spec IDs that are always text-heavy / name-forward and need full width,
 * even when the value happens to be short.
 */
export const FULL_WIDTH_PERSONAL_IDS = new Set([
  'DI-P12', // Favorite Drink
  'DI-P13', // Favorite Liquor
  'DI-P14', // Favorite Ingredient
  'DI-P15', // Favorite Bar
  'DI-P16', // Partner in Crime
  'DI-P17', // Biggest Day
  'DI-P18', // Most Active Day
  'SI-P05', // Most Completed Category
  'SI-P06', // Biggest Day
  'SI-P07', // Most Active Day
])

/** Photo / memory milestones — featured full-width panels. */
export const FEATURED_PERSONAL_IDS = new Set([
  'SI-P08', // First Challenge Completed
  'SI-P09', // Last Challenge Completed
])

/** Compact numeric / rank / percent tiles (half-width when paired). */
export const COMPACT_PERSONAL_IDS = new Set([
  'DI-P01',
  'DI-P02',
  'DI-P03',
  'DI-P04',
  'DI-P05',
  'DI-P06',
  'DI-P07',
  'DI-P08',
  'DI-P09',
  'DI-P10',
  'DI-P11',
  'SI-P01',
  'SI-P02',
  'SI-P03',
  'SI-P04',
  'SI-P10',
])

const LONG_VALUE_CHARS = 22

export function resolvePersonalLayout(
  entry: WrappedEntry,
  kind: WrappedStatCardKind,
  options?: { expandableCount?: number; value?: string | null },
): WrappedStatLayout {
  if (kind === 'photo' || FEATURED_PERSONAL_IDS.has(entry.spec_id)) {
    return 'featured'
  }

  if (FULL_WIDTH_PERSONAL_IDS.has(entry.spec_id)) {
    return 'text'
  }

  const expandableCount = options?.expandableCount ?? 0
  const value = options?.value ?? entry.primary ?? ''
  if (expandableCount > 1 || value.length > LONG_VALUE_CHARS) {
    return 'text'
  }

  if (COMPACT_PERSONAL_IDS.has(entry.spec_id)) {
    return 'compact'
  }

  // Safe default for any future personal entry: prefer readable full width.
  return kind === 'number' ? 'compact' : 'text'
}

export function isFullWidthLayout(layout: WrappedStatLayout): boolean {
  return layout !== 'compact'
}

/** Sequential alternating tones for full-width personal panels. */
export function toneForPersonalIndex(index: number): 'aqua' | 'cream' {
  return index % 2 === 0 ? 'aqua' : 'cream'
}

/**
 * Checkerboard tone for a compact half-width cell.
 * Row 0: mint / tan, Row 1: tan / mint, and so on.
 */
export function toneForCompactCell(row: number, col: number): 'aqua' | 'cream' {
  return (row + col) % 2 === 0 ? 'aqua' : 'cream'
}

/**
 * Pack compact tiles into pairs. A leftover compact before a full-width
 * panel (or at the end) spans the full row so we never leave an empty cell.
 */
export function assignPersonalSpans<T extends { layout: WrappedStatLayout }>(
  cards: T[],
): Array<T & { span: 'half' | 'full' }> {
  const out: Array<T & { span: 'half' | 'full' }> = []
  let i = 0
  while (i < cards.length) {
    const cur = cards[i]!
    if (cur.layout !== 'compact') {
      out.push({ ...cur, span: 'full' })
      i += 1
      continue
    }
    const next = cards[i + 1]
    if (next && next.layout === 'compact') {
      out.push({ ...cur, span: 'half' }, { ...next, span: 'half' })
      i += 2
    } else {
      out.push({ ...cur, span: 'full' })
      i += 1
    }
  }
  return out
}

/**
 * Assign presentation tones after spans are known.
 * Compact half-pairs use a row/column checkerboard so adjacent rows
 * do not form uninterrupted mint/tan stripes. Full-width panels
 * (text, featured, orphan compact) keep sequential stream tones.
 */
export function assignPersonalTones<
  T extends { layout: WrappedStatLayout; span: 'half' | 'full' },
>(cards: T[]): Array<T & { tone: 'aqua' | 'cream' }> {
  const out: Array<T & { tone: 'aqua' | 'cream' }> = []
  let compactRow = 0
  let i = 0
  while (i < cards.length) {
    const cur = cards[i]!
    if (cur.layout === 'compact' && cur.span === 'half') {
      const next = cards[i + 1]
      out.push({ ...cur, tone: toneForCompactCell(compactRow, 0) })
      if (next && next.layout === 'compact' && next.span === 'half') {
        out.push({ ...next, tone: toneForCompactCell(compactRow, 1) })
        i += 2
      } else {
        i += 1
      }
      compactRow += 1
      continue
    }
    out.push({ ...cur, tone: toneForPersonalIndex(i) })
    i += 1
  }
  return out
}
