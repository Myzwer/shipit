import { loadBountyFixtures, noonDay1Utc, activateReadyCatalogAndSchedule } from '../tests/helpers/bountyFixtures.ts'
import { drinkPayload, lookupOffering, submitAt, playerId, exposeCurrentSlots } from '../tests/helpers/drinkitSubmit.ts'
import { MOBILE_ORDER_BAR_KEY } from '../src/types/drinkLog.ts'

const fixtures = await loadBountyFixtures()
const service = fixtures.service
await activateReadyCatalogAndSchedule(service, 'qa1-mo-diag')
let offeringId
try {
  offeringId = (await lookupOffering(service, 'lido-bar', 'tropical-alibi')).offering_id
} catch {
  const listed = await service.rpc('list_drinkit_mobile_order_drinks')
  offeringId = listed.data?.[0]?.offering_id
}
const at = noonDay1Utc()
await exposeCurrentSlots(service, at)
const author = playerId(fixtures, 'drink_only')
const payload = drinkPayload({ barKey: MOBILE_ORDER_BAR_KEY, offeringId, companions: [] })
const res = await submitAt(service, author, payload, at)
console.log(JSON.stringify({ offeringId, error: res.error, data: res.data }, null, 2))
