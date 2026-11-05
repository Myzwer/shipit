import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'

export type ProvisionedIdentity = {
  key: string
  display_name: string
  login_alias: string
  player_id: string
  games: string[]
  team: string | null
  is_admin: boolean
}

export type IdentitySummary = {
  supabase_url: string
  identities: ProvisionedIdentity[]
}

export type LocalFixtures = {
  available: boolean
  password: string | null
  summary: IdentitySummary | null
  anonKey: string | null
  serviceRoleKey: string | null
}

export function createLocalClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  })
}

export async function loadLocalFixtures(): Promise<LocalFixtures> {
  const password = process.env.LOCAL_TEST_PASSWORD ?? null
  if (!password) {
    return {
      available: false,
      password: null,
      summary: null,
      anonKey: null,
      serviceRoleKey: null,
    }
  }

  try {
    const raw = await readFile(join(process.cwd(), '.local', 'test-identities.json'), 'utf8')
    const summary = JSON.parse(raw) as IdentitySummary

    let anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || null
    let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null

    if (!anonKey || !serviceRoleKey) {
      const envText = execSync('npx supabase status -o env', { encoding: 'utf8' })
      anonKey ??= envText.match(/^ANON_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '') ?? null
      serviceRoleKey ??=
        envText.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '') ?? null
    }

    return {
      available: Boolean(
        summary?.supabase_url && anonKey && summary.identities.length >= 4,
      ),
      password,
      summary,
      anonKey,
      serviceRoleKey,
    }
  } catch {
    return {
      available: false,
      password,
      summary: null,
      anonKey: null,
      serviceRoleKey: null,
    }
  }
}

export function identity(summary: IdentitySummary, key: string) {
  const row = summary.identities.find((i) => i.key === key)
  if (!row) throw new Error(`missing identity ${key}`)
  return row
}

export async function signInAs(
  fixtures: LocalFixtures,
  key: string,
): Promise<SupabaseClient> {
  if (!fixtures.available || !fixtures.summary || !fixtures.anonKey || !fixtures.password) {
    throw new Error('local fixtures unavailable')
  }
  const row = identity(fixtures.summary, key)
  const client = createLocalClient(fixtures.summary.supabase_url, fixtures.anonKey)
  const { error } = await client.auth.signInWithPassword({
    email: row.login_alias,
    password: fixtures.password,
  })
  if (error) throw error
  return client
}
