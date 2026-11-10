/**
 * Pure partition helper mirroring `bar_bounty_crew_partition_sizes` (SQL is authoritative).
 * Used for unit coverage and docs; production assignment runs in Postgres.
 */
export function barBountyCrewPartitionSizes(n: number): number[] {
  if (!Number.isInteger(n) || n < 7) {
    throw new Error('ROSTER_TOO_SMALL')
  }

  const r = n % 4
  let fours: number
  let threes: number
  if (r === 0) {
    threes = 0
    fours = n / 4
  } else if (r === 1) {
    threes = 3
    fours = (n - 9) / 4
  } else if (r === 2) {
    threes = 2
    fours = (n - 6) / 4
  } else {
    threes = 1
    fours = (n - 3) / 4
  }

  if (fours < 0 || !Number.isInteger(fours)) {
    throw new Error('ROSTER_TOO_SMALL')
  }

  return [...Array(fours).fill(4), ...Array(threes).fill(3)]
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Sum of historical co-assignment counts for all within-crew pairs. */
export function partitionRepeatScore(
  order: string[],
  sizes: number[],
  pairCounts: Map<string, number>,
): number {
  let score = 0
  let cursor = 0
  for (const size of sizes) {
    const crew = order.slice(cursor, cursor + size)
    for (let i = 0; i < crew.length; i++) {
      for (let j = i + 1; j < crew.length; j++) {
        score += pairCounts.get(pairKey(crew[i]!, crew[j]!)) ?? 0
      }
    }
    cursor += size
  }
  return score
}
