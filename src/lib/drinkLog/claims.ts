import type {
  PreviewCategoryOption,
  PreviewCategoryState,
  PreviewPayload,
  SelectedClaimChoice,
} from '@/types/drinkLog'

function optionKey(opt: PreviewCategoryOption): string {
  if (opt.offer_id) return `${opt.category}:offer:${opt.offer_id}`
  if (opt.assignment_id) return `${opt.category}:bar:${opt.assignment_id}`
  return `${opt.category}:unknown`
}

function pickDefaultOption(options: PreviewCategoryOption[]): PreviewCategoryOption | null {
  if (!options.length) return null
  // Prefer current over grace_previous when both present.
  const current = options.find((o) => o.source === 'current')
  return current ?? options[0] ?? null
}

export function buildDefaultSelections(preview: PreviewPayload): SelectedClaimChoice[] {
  const cats = preview.categories
  if (!cats) return []
  const out: SelectedClaimChoice[] = []
  for (const key of ['cocktail', 'ingredient', 'bar'] as const) {
    const state = cats[key]
    if (!state || state.status !== 'eligible') continue
    const opt = pickDefaultOption(state.options ?? [])
    if (!opt) continue
    out.push({
      category: key,
      offer_id: typeof opt.offer_id === 'string' ? opt.offer_id : undefined,
      assignment_id: typeof opt.assignment_id === 'string' ? opt.assignment_id : undefined,
      points: Number(opt.points) || 0,
      optionKey: optionKey(opt),
    })
  }
  return out
}

/**
 * Preserve manual deselections across preview refreshes when eligibility is unchanged.
 * Drop selections that are no longer eligible; never silently re-add a manually deselected category
 * unless that category's eligible option set changed identity.
 */
export function reconcileSelections(input: {
  preview: PreviewPayload
  previous: SelectedClaimChoice[]
  manuallyDeselected: Set<string>
}): SelectedClaimChoice[] {
  const defaults = buildDefaultSelections(input.preview)
  const prevByCat = new Map(input.previous.map((c) => [c.category, c]))
  const out: SelectedClaimChoice[] = []

  for (const def of defaults) {
    if (input.manuallyDeselected.has(def.category)) {
      const prev = prevByCat.get(def.category)
      // Keep deselection while the eligible option identity is unchanged (or never was selected).
      if (!prev || prev.optionKey === def.optionKey) continue
      // Option identity changed — clear manual deselect and take the new default.
      input.manuallyDeselected.delete(def.category)
    }
    const prev = prevByCat.get(def.category)
    if (prev && prev.optionKey !== def.optionKey && def.category !== 'bar') {
      // Offer changed — use new default option.
      out.push(def)
      continue
    }
    if (prev && isStillEligible(input.preview, prev)) {
      out.push({
        ...prev,
        points: def.points,
        optionKey: def.optionKey,
        offer_id: def.offer_id,
        assignment_id: def.assignment_id,
      })
    } else {
      out.push(def)
    }
  }
  return out
}

function isStillEligible(preview: PreviewPayload, choice: SelectedClaimChoice): boolean {
  const state = preview.categories?.[choice.category]
  if (!state || state.status !== 'eligible') return false
  return (state.options ?? []).some((o) => optionKey(o) === choice.optionKey || matchesChoice(o, choice))
}

function matchesChoice(opt: PreviewCategoryOption, choice: SelectedClaimChoice): boolean {
  if (choice.category === 'bar') return opt.assignment_id === choice.assignment_id
  return opt.offer_id === choice.offer_id
}

export function categoryState(
  preview: PreviewPayload | null,
  category: 'cocktail' | 'ingredient' | 'bar',
): PreviewCategoryState | null {
  return preview?.categories?.[category] ?? null
}

export function hasManuallyUnselectedEligible(input: {
  preview: PreviewPayload | null
  selected: SelectedClaimChoice[]
}): boolean {
  if (!input.preview?.categories) return false
  const selectedCats = new Set(input.selected.map((s) => s.category))
  for (const key of ['cocktail', 'ingredient', 'bar'] as const) {
    const state = input.preview.categories[key]
    if (state?.status === 'eligible' && !selectedCats.has(key)) return true
  }
  return false
}

export function selectedClaimsForSubmit(selected: SelectedClaimChoice[]) {
  return selected.map((c) => {
    if (c.category === 'bar') {
      return { category: 'bar' as const, assignment_id: c.assignment_id }
    }
    return { category: c.category, offer_id: c.offer_id }
  })
}
