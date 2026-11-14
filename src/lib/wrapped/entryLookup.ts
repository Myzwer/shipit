import type { WrappedEntry, WrappedEntryWinner } from '@/types/wrapped'

export function entryById(
  entries: WrappedEntry[] | undefined,
  id: string,
): WrappedEntry | undefined {
  return (entries ?? []).find((e) => e.spec_id === id)
}

export function isAvailable(entry: WrappedEntry | undefined | null): entry is WrappedEntry {
  return Boolean(entry && entry.available)
}

export function numericValue(entry: WrappedEntry | undefined | null): number | null {
  if (!isAvailable(entry)) return null
  if (typeof entry.value_numeric === 'number' && Number.isFinite(entry.value_numeric)) {
    return entry.value_numeric
  }
  const raw = entry.primary?.replace(/,/g, '').replace(/%$/, '').trim()
  if (!raw || !/^-?\d+(\.\d+)?$/.test(raw)) return null
  return Number(raw)
}

export function primaryText(entry: WrappedEntry | undefined | null): string | null {
  if (!isAvailable(entry)) return null
  const text = entry.primary?.trim()
  return text ? text : null
}

export function winnerList(entry: WrappedEntry | undefined | null): WrappedEntryWinner[] {
  if (!isAvailable(entry)) return []
  return (entry.winners ?? []).filter((w) => Boolean(w?.name))
}

export function firstWinnerName(entry: WrappedEntry | undefined | null): string | null {
  return winnerList(entry)[0]?.name ?? null
}

export function formatNumber(n: number): string {
  return Math.round(n) === n
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

export function formatCount(n: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(n)} ${n === 1 ? singular : plural}`
}

export function formatOrdinalPlace(n: number): string {
  const abs = Math.abs(Math.trunc(n))
  const mod100 = abs % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (abs % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

const INITIAL_SUFFIX = /\s[A-Za-z]\.$/

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}

/**
 * Names already shaped like "David F." are kept. Full names only shorten to
 * "First L." when another name in the list shares the same first name;
 * everything else is returned untouched (the server may already disambiguate).
 */
export function disambiguatePlayerName(name: string, allNames: string[]): string {
  const trimmed = name.trim()
  if (!trimmed || INITIAL_SUFFIX.test(trimmed)) return trimmed
  const parts = trimmed.split(/\s+/)
  if (parts.length < 2) return trimmed

  const first = firstName(trimmed).toLowerCase()
  const collisions = allNames.filter((n) => firstName(n).toLowerCase() === first)
  const distinct = new Set(collisions.map((n) => n.trim().toLowerCase()))
  if (distinct.size < 2) return trimmed

  const last = parts[parts.length - 1] ?? ''
  const initial = last.charAt(0).toUpperCase()
  return initial ? `${parts[0]} ${initial}.` : trimmed
}
