/**
 * CLI-friendly seed: align local cruise so now() falls in open bounty hours.
 *
 *   SEED_HOUR=13 SEED_DAY=1 SEED_PAUSED=0 npx vitest run --fileParallelism=false tests/helpers/runSeedNowAligned.ts
 */
import { expect, it } from 'vitest'
import { loadBountyFixtures } from './bountyFixtures'
import { seedNowAlignedSchedule } from './nowAlignedCruise'

const cli = process.env.SEED_CLI === '1'

it.skipIf(!cli)('seeds now-aligned development bounty schedule', async () => {
  const fixtures = await loadBountyFixtures()
  const targetHour = Number(process.env.SEED_HOUR ?? 13)
  const cruiseDay = Number(process.env.SEED_DAY ?? 1)
  const paused = process.env.SEED_PAUSED === '1' || process.env.SEED_PAUSED === 'true'

  const result = await seedNowAlignedSchedule(fixtures.service!, {
    targetHour,
    targetMinute: 15,
    cruiseDay,
    seed: `cli-seed-h${targetHour}-d${cruiseDay}`,
  })

  if (paused) {
    const { error } = await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    expect(error).toBeNull()
  }

  console.log(
    JSON.stringify(
      {
        day1: result.day1,
        offsetMinutes: result.offsetMinutes,
        targetHour: result.targetHour,
        cruiseDay: result.cruiseDay,
        paused,
        cocktail_slots: result.schedule.cocktail_slots,
        ingredient_slots: result.schedule.ingredient_slots,
      },
      null,
      2,
    ),
  )

  expect(result.schedule.cocktail_slots).toBe(72)
  expect(result.schedule.ingredient_slots).toBe(39)
}, 120_000)
