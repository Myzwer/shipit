/**
 * Phase 2C.12 — exclusive First-to-Find All-view must not mark non-winners as earned.
 * Static contract against the forward migration (no DB required).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(
  join(root, 'supabase/migrations/20261105011900_phase2c12_exclusive_claimed_earned_fix.sql'),
  'utf8',
)

describe('Phase 2C.12 exclusive claimed earned attribution', () => {
  it('redefines achievement_card_payload with viewer-owner earned matching', () => {
    expect(migration).toMatch(/create or replace function public\.achievement_card_payload/i)
    expect(migration).toMatch(/p_award\.owner_player_id is not distinct from p_owner_player/)
    expect(migration).toMatch(/p_award\.owner_team_id is not distinct from p_owner_team/)
    expect(migration).toMatch(/v_earned\s*:=/)
    // Award identity only when truly earned (prevents All-view false earned badges).
    expect(migration).toMatch(
      /'award_id',\s*case when v_earned then p_award\.id else null end/,
    )
    expect(migration).toMatch(
      /'awarded_at_utc',\s*case when v_earned then p_award\.awarded_at_utc else null end/,
    )
  })

  it('does not change exclusive grant semantics or revoke hosted awards', () => {
    expect(migration).not.toMatch(/achievement_grant_award/i)
    expect(migration).not.toMatch(/delete from public\.achievement_awards/i)
    expect(migration).not.toMatch(/update public\.achievement_awards/i)
  })
})
