import type { PhotoSubmitContract, StagedPhotoRef } from '@/types/media'
import { buildPhotoSubmitContract } from '@/lib/media/stagePhoto'

/** Drink It! ordinary log — photo optional; submit_drink binds photo_id atomically. */
export function drinkLogPhotoContract(
  staged: StagedPhotoRef | null,
  previewUrl: string | null,
): PhotoSubmitContract {
  return buildPhotoSubmitContract({
    purpose: 'drink_log',
    game: 'drinkit',
    required: false,
    staged,
    previewUrl,
  })
}

/** Drink It! Daily Challenge — photo mandatory (submit wiring is later phase). */
export function dailyChallengePhotoContract(
  staged: StagedPhotoRef | null,
  previewUrl: string | null,
): PhotoSubmitContract {
  return buildPhotoSubmitContract({
    purpose: 'daily',
    game: 'drinkit',
    required: true,
    staged,
    previewUrl,
  })
}

/** Ship It! scavenger — photo mandatory (submit_scavenger wiring is later phase). */
export function scavengerPhotoContract(
  staged: StagedPhotoRef | null,
  previewUrl: string | null,
): PhotoSubmitContract {
  return buildPhotoSubmitContract({
    purpose: 'scavenger',
    game: 'shipit',
    required: true,
    staged,
    previewUrl,
  })
}

export function photoReadyForSubmit(contract: PhotoSubmitContract): boolean {
  if (!contract.required) return true
  return Boolean(contract.stagedPhotoId)
}
