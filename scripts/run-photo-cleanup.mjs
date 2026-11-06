/**
 * Phase 5C — service-role photo cleanup runner.
 *
 * Claims expired unbound pending/abandoned photos (default TTL 72h),
 * deletes via Supabase Storage API, then completes/fails the ledger.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… VITE_SUPABASE_URL=… node scripts/run-photo-cleanup.mjs
 *   PHOTO_CLEANUP_TTL_HOURS=72 PHOTO_CLEANUP_LIMIT=25
 *
 * Schedule this during deployment (cron / GitHub Action). Not running until configured.
 * Never embed service-role keys in the browser bundle.
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ttlHours = Number(process.env.PHOTO_CLEANUP_TTL_HOURS || 72)
const limit = Number(process.env.PHOTO_CLEANUP_LIMIT || 25)

if (!url || !serviceKey) {
  console.error('Need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const service = createClient(url, serviceKey, { auth: { persistSession: false } })
const claimToken = randomUUID()

const claimed = await service.rpc('claim_photo_cleanup_batch', {
  p_ttl_hours: ttlHours,
  p_limit: limit,
  p_claim_token: claimToken,
})

if (claimed.error) {
  console.error('claim failed', claimed.error.message)
  process.exit(1)
}

const photos = claimed.data?.photos ?? []
console.log(`claimed ${photos.length} photo(s) ttl=${claimed.data?.ttl_hours}h token=${claimToken}`)

let cleaned = 0
let failed = 0
let missing = 0

for (const row of photos) {
  const { error: removeError } = await service.storage.from(row.bucket).remove([row.storage_path])
  if (removeError) {
    // Missing object → reconcile as cleaned; other errors → failed retryable.
    const msg = removeError.message || ''
    const isMissing = /not found|not exist|404|No such/i.test(msg)
    if (isMissing) {
      const done = await service.rpc('complete_photo_cleanup', {
        p_photo_id: row.photo_id,
        p_claim_token: claimToken,
        p_object_missing: true,
      })
      if (done.error || !done.data?.ok) {
        console.error('complete missing failed', row.photo_id, done.error?.message || done.data)
        failed += 1
      } else {
        missing += 1
        cleaned += 1
      }
      continue
    }
    await service.rpc('fail_photo_cleanup', {
      p_photo_id: row.photo_id,
      p_claim_token: claimToken,
      p_detail: msg,
    })
    failed += 1
    continue
  }

  const done = await service.rpc('complete_photo_cleanup', {
    p_photo_id: row.photo_id,
    p_claim_token: claimToken,
    p_object_missing: false,
  })
  if (done.error || !done.data?.ok) {
    console.error('complete failed', row.photo_id, done.error?.message || done.data)
    failed += 1
  } else {
    cleaned += 1
  }
}

console.log(JSON.stringify({ cleaned, failed, missing, claimed: photos.length }))
process.exit(failed > 0 && cleaned === 0 ? 1 : 0)
