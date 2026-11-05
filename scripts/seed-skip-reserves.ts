/**
 * Activate catalog with Skip reserves (80 cocktails / 45 ingredients) aligned near "now".
 *   npx vite-node scripts/seed-skip-reserves.ts
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { buildScheduleReadyCatalog } from '../tests/fixtures/catalog/builders'

function envFromSupabase() {
  const text = execSync('npx supabase status -o env', { encoding: 'utf8' })
  const get = (k: string) => text.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.replace(/^"|"$/g, '')
  return {
    url: process.env.VITE_SUPABASE_URL || get('API_URL'),
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || get('SERVICE_ROLE_KEY'),
  }
}

const { url, service: key } = envFromSupabase()
if (!url || !key) throw new Error('Need Supabase URL + service role')

const service = createClient(url, key, { auth: { persistSession: false } })
const catalog = buildScheduleReadyCatalog(80, 45)

const day1 = new Date()
const noon = new Date(day1)
noon.setHours(12, 0, 0, 0)
const offsetMin = Math.round((noon.getTime() - Date.now()) / 60000)

const { error: clockErr } = await service.rpc('dev_seed_cruise_clock', {
  p_day1_ship_date: day1.toISOString().slice(0, 10),
  p_base_offset_minutes: offsetMin,
  p_label: 'development-only',
})
if (clockErr) throw clockErr
await service.rpc('dev_set_drinkit_paused', { p_paused: false })

const { error: aErr } = await service.rpc('dev_activate_catalog_fixture', { p_payload: catalog })
if (aErr) throw aErr
const { error: sErr } = await service.rpc('dev_generate_bounty_schedule', {
  p_seed: `skip-reserves-${Date.now()}`,
})
if (sErr) throw sErr
await service.rpc('dev_seed_daily_assignments')

// Expose current slots at now
const now = new Date().toISOString()
await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: now })
await service.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: now })

const cock = await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: now })
console.log(
  JSON.stringify({
    ok: true,
    cocktail: cock.data?.status,
    drink: cock.data?.drink_name,
    offsetMin,
  }),
)
