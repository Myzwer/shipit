import type { WrappedEntryPhoto } from '@/types/wrapped'

export type WrappedTextSegment = { text: string; accent?: boolean; bold?: boolean }
export type WrappedTextBlock = WrappedTextSegment[] | string

export type WrappedSlideTone = 'warm' | 'cool'

export interface WrappedFeatureSlideBase {
  id: string
  eyebrow: string
  tone: WrappedSlideTone
  headline: string
}

export interface WrappedSingleSlide extends WrappedFeatureSlideBase {
  type: 'single'
  icon: string
  lead?: WrappedTextBlock
  heroValue: string
  heroLabel?: string
  paragraphs: WrappedTextBlock[]
  footer?: WrappedTextBlock
}

export interface WrappedDoubleHero {
  value: string
  label?: string
  body: WrappedTextBlock
}

export interface WrappedDoubleSlide extends WrappedFeatureSlideBase {
  type: 'double'
  icon: string
  lead?: WrappedTextBlock
  heroes: [WrappedDoubleHero, WrappedDoubleHero]
  footer?: WrappedTextBlock
}

export interface WrappedPhotoSlide extends WrappedFeatureSlideBase {
  type: 'photo'
  subhead?: string
  photo: WrappedEntryPhoto
  caption?: string
  eventId?: string
}

/** Opening carousel slide — always present, not eligibility-gated. */
export interface WrappedIntroSlide extends WrappedFeatureSlideBase {
  type: 'intro'
  icon: string
  body: string
}

export type WrappedFeatureSlide =
  | WrappedIntroSlide
  | WrappedSingleSlide
  | WrappedDoubleSlide
  | WrappedPhotoSlide

export interface WrappedAllStatsItem {
  label: string
  detail?: string
}

export interface WrappedAllStatsRow {
  specId: string
  label: string
  value: string
  detail?: string
  icon: string
  explanation?: string
  expandable?: boolean
  items?: WrappedAllStatsItem[]
  available: boolean
}

export interface WrappedAllStatsGroup {
  heading: string
  rows: WrappedAllStatsRow[]
}

export type WrappedAllStatsMode = 'mine' | 'ours'

export type DrinkItLeaderboardMode = 'points' | 'achievements'
export type ShipItLeaderboardMode = 'points' | 'challenges'
export type WrappedLeaderboardMode = DrinkItLeaderboardMode | ShipItLeaderboardMode
