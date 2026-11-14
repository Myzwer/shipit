/** Compact companion list: "A", "A & B", "A, B & C". */
export function formatNaturalNameList(names: string[]): string {
  const cleaned = names.map((n) => n.trim()).filter(Boolean)
  if (cleaned.length === 0) return ''
  if (cleaned.length === 1) return cleaned[0]!
  if (cleaned.length === 2) return `${cleaned[0]} & ${cleaned[1]}`
  return `${cleaned.slice(0, -1).join(', ')} & ${cleaned[cleaned.length - 1]}`
}

/** Dedupe display names; drop blanks and optional author self-attribution. */
export function sanitizeCompanionNames(
  raw: unknown,
  options?: { excludeName?: string | null },
): string[] {
  if (!Array.isArray(raw)) return []
  const exclude = options?.excludeName?.trim().toLowerCase() ?? ''
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const name = item.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (exclude && key === exclude) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

export type CompactCompanionByline =
  | { mode: 'none' }
  | { mode: 'one'; name: string }
  | { mode: 'two'; names: [string, string] }
  | { mode: 'many'; first: string; remaining: number; all: string[] }

/** Compact byline companion shape: 0 / 1 / 2 / first+remaining. */
export function compactCompanionByline(names: string[]): CompactCompanionByline {
  const cleaned = names.map((n) => n.trim()).filter(Boolean)
  if (cleaned.length === 0) return { mode: 'none' }
  if (cleaned.length === 1) return { mode: 'one', name: cleaned[0]! }
  if (cleaned.length === 2) return { mode: 'two', names: [cleaned[0]!, cleaned[1]!] }
  return {
    mode: 'many',
    first: cleaned[0]!,
    remaining: cleaned.length - 1,
    all: cleaned,
  }
}
