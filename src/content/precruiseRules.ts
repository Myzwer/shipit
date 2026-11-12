/**
 * Approved PC1 player rules — structured from the organizer Markdown.
 * Source of truth: content/precruise/PC1_Player_Rules_Approved_Copy.md
 */
import rulesMd from '../../content/precruise/PC1_Player_Rules_Approved_Copy.md?raw'
import {
  parsePlayerRulesMarkdown,
  type GameRulesContent,
  type RulesCategoryKey,
} from '@/lib/precruise/parsePlayerRules'

const parsed = parsePlayerRulesMarkdown(rulesMd)

function requireGame(game: 'drinkit' | 'shipit'): GameRulesContent {
  const found = parsed.find((g) => g.game === game)
  if (!found) {
    throw new Error(`Missing approved pre-cruise rules for ${game}`)
  }
  return found
}

export const drinkItPreCruiseRules = requireGame('drinkit')
export const shipItPreCruiseRules = requireGame('shipit')

export const PRECRUISE_RULE_CATEGORY_OPTIONS: {
  key: RulesCategoryKey
  label: string
}[] = [
  { key: 'quick', label: 'Quick Rules' },
  { key: 'full', label: 'Full Rules' },
  { key: 'strategy', label: 'Strategy Guide' },
  { key: 'faq', label: 'FAQ' },
]

export function rulesForGame(game: 'drinkit' | 'shipit'): GameRulesContent {
  return game === 'drinkit' ? drinkItPreCruiseRules : shipItPreCruiseRules
}
