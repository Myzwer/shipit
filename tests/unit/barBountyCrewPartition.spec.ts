import { describe, expect, it } from 'vitest'
import {
  barBountyCrewPartitionSizes,
  pairKey,
  partitionRepeatScore,
} from '../../src/lib/bounty/crewPartition'

const EXPECTED: Record<number, number[]> = {
  7: [4, 3],
  8: [4, 4],
  9: [3, 3, 3],
  10: [4, 3, 3],
  11: [4, 4, 3],
  12: [4, 4, 4],
  13: [4, 3, 3, 3],
  14: [4, 4, 3, 3],
  15: [4, 4, 4, 3],
  16: [4, 4, 4, 4],
  17: [4, 4, 3, 3, 3],
}

describe('barBountyCrewPartitionSizes', () => {
  it('matches the B1 table for 7–14 and extends the same rule', () => {
    for (const [n, sizes] of Object.entries(EXPECTED)) {
      expect(barBountyCrewPartitionSizes(Number(n))).toEqual(sizes)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(Number(n))
      expect(sizes.every((s) => s === 3 || s === 4)).toBe(true)
    }
  })

  it('rejects fewer than seven players', () => {
    for (const n of [0, 1, 6]) {
      expect(() => barBountyCrewPartitionSizes(n)).toThrow(/ROSTER_TOO_SMALL/)
    }
  })
})

describe('partitionRepeatScore', () => {
  it('scores repeated pairs and ignores unseen pairs', () => {
    const sizes = [4, 3]
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const history = new Map<string, number>([[pairKey('a', 'b'), 2], [pairKey('e', 'f'), 1]])
    expect(partitionRepeatScore(order, sizes, history)).toBe(3)
    expect(partitionRepeatScore(order, sizes, new Map())).toBe(0)
  })
})
