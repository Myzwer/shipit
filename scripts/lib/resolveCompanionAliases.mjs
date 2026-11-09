/**
 * Resolve companion_alias / player_aliases → player UUIDs using:
 *   public alias vocabulary (content/achievements/companionAliases.json)
 *   + private alias→roster_key map (private/roster/companion-alias-map.local.json)
 *   + private roster login_alias (private/roster/roster.local.json)
 *   → players.id
 *
 * Never commits UUIDs or private roster keys into tracked files.
 * Fails closed when a required alias cannot be resolved.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '../..')

export function loadCompanionAliasVocabulary() {
  const doc = JSON.parse(
    readFileSync(join(root, 'content/achievements/companionAliases.json'), 'utf8'),
  )
  const aliases = Array.isArray(doc.aliases) ? doc.aliases : Object.keys(doc.aliases || {})
  return { version: doc.version, aliases }
}

/** @deprecated use loadCompanionAliasVocabulary — kept for test imports during transition */
export function loadCompanionAliasMap() {
  return loadCompanionAliasVocabulary()
}

export function loadPrivateCompanionAliasMap(
  mapPath = join(root, 'private/roster/companion-alias-map.local.json'),
) {
  if (!existsSync(mapPath)) return null
  const doc = JSON.parse(readFileSync(mapPath, 'utf8'))
  return doc?.aliases && typeof doc.aliases === 'object' ? doc.aliases : null
}

export function loadPrivateRosterPlayers(rosterPath = join(root, 'private/roster/roster.local.json')) {
  if (!existsSync(rosterPath)) return null
  const doc = JSON.parse(readFileSync(rosterPath, 'utf8'))
  return Array.isArray(doc.players) ? doc.players : []
}

/**
 * @param {object} opts
 * @param {string[]} opts.publicAliases
 * @param {Record<string, { roster_key: string }>|null} opts.privateAliasMap
 * @param {Array<{ key: string, login_alias: string }>|null} opts.rosterPlayers
 * @param {Map<string, string>} opts.loginAliasToPlayerId
 * @param {string[]} opts.aliases
 */
export function resolveAliasesToPlayerIds({
  publicAliases,
  privateAliasMap,
  rosterPlayers,
  loginAliasToPlayerId,
  aliases,
}) {
  const ids = []
  const unresolved = []
  const publicSet = new Set(publicAliases || [])
  const rosterByKey = new Map((rosterPlayers || []).map((p) => [p.key, p]))

  for (const alias of aliases) {
    if (!publicSet.has(alias)) {
      unresolved.push({ alias, reason: 'unknown_alias' })
      continue
    }
    if (!privateAliasMap || typeof privateAliasMap !== 'object') {
      unresolved.push({ alias, reason: 'private_alias_map_missing' })
      continue
    }
    const entry = privateAliasMap[alias]
    if (!entry?.roster_key) {
      unresolved.push({ alias, reason: 'alias_unmapped' })
      continue
    }
    const rosterPlayer = rosterByKey.get(entry.roster_key)
    if (!rosterPlayer?.login_alias) {
      unresolved.push({ alias, reason: 'roster_entry_missing' })
      continue
    }
    const playerId = loginAliasToPlayerId.get(String(rosterPlayer.login_alias).toLowerCase())
    if (!playerId) {
      unresolved.push({ alias, reason: 'player_row_missing' })
      continue
    }
    ids.push(playerId)
  }

  return { playerIds: ids, unresolved }
}

/** Deep-clone a condition config, replacing player_aliases / companion_alias with UUIDs. */
export function materializeConditionConfig(config, resolveCtx) {
  if (!config || typeof config !== 'object') {
    return { config, unresolved: [] }
  }
  const next = JSON.parse(JSON.stringify(config))
  const unresolved = []

  const applyList = (aliases) => {
    const result = resolveAliasesToPlayerIds({ ...resolveCtx, aliases })
    unresolved.push(...result.unresolved)
    return result.playerIds
  }

  if (Array.isArray(next.player_aliases)) {
    next.player_ids = applyList(next.player_aliases)
    delete next.player_aliases
  }
  if (typeof next.companion_alias === 'string') {
    const ids = applyList([next.companion_alias])
    if (ids[0]) next.companion_player_id = ids[0]
    delete next.companion_alias
  }
  if (Array.isArray(next.conditions)) {
    next.conditions = next.conditions.map((child) => {
      const nested = materializeConditionConfig(child, resolveCtx)
      unresolved.push(...nested.unresolved)
      return nested.config
    })
  }
  return { config: next, unresolved }
}
