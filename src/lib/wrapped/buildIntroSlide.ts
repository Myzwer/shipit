import { copy } from '@/ui/copy'
import type { WrappedIntroSlide } from '@/types/wrappedPlanC'

/** Shared first slide for Drink It! and Ship It! featured carousels. */
export function buildWrappedIntroSlide(): WrappedIntroSlide {
  return {
    id: 'intro',
    type: 'intro',
    tone: 'cool',
    eyebrow: '',
    headline: copy.wrapped.introHeadline,
    icon: 'theme.ship-it',
    body: copy.wrapped.introBody,
  }
}
