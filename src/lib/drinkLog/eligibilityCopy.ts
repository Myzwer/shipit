import { copy } from '@/ui/copy'

/**
 * Map server preview/submit reason codes to player-facing copy.
 * Authoritative reasons come from drinkit_evaluate_eligibility — do not invent rules here.
 */
export function eligibilityReasonLabel(reason: string | null | undefined): string {
  const code = (reason ?? '').trim()
  switch (code) {
    case 'companion_required':
      return copy.wizard.reasonCompanion
    case 'solo_or_no_crewmate_selected':
    case 'not_in_todays_roster':
    case 'crew_unavailable':
      return copy.wizard.reasonCrewmate
    case 'category_used_today':
      return copy.wizard.alreadyClaimed
    case 'drink_or_bar_mismatch':
    case 'not_featured_bar':
    case 'featured_cocktail_bar_or_name_mismatch':
    case 'ingredient_not_in_offering':
    case 'no_bar_assignment':
      return copy.wizard.reasonWrongDrinkOrBar
    case 'named_catalog_required':
      return copy.wizard.reasonNamedCatalog
    case 'nonalcoholic':
      return copy.wizard.reasonGenericUnavailable
    case 'no_public_slot':
    case 'no_active_offer':
    case 'missed_while_paused':
    case 'drinkit_paused':
    case 'pre_open':
    case 'overnight':
    case 'outside_cruise':
      return copy.wizard.reasonNotOpen
    case 'photo_required':
      return copy.wizard.reasonPhotoRequired
    default:
      return copy.wizard.reasonGenericUnavailable
  }
}
