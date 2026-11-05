import { describe, expect, it } from 'vitest'
import {
  dailyChallengePhotoContract,
  drinkLogPhotoContract,
  photoReadyForSubmit,
  scavengerPhotoContract,
} from '@/lib/media/contracts'
import type { StagedPhotoRef } from '@/types/media'

const staged: StagedPhotoRef = {
  photoId: '11111111-1111-1111-1111-111111111111',
  bucket: 'game-photos',
  storagePath: 'p/drinkit/x.jpg',
  status: 'staged',
  mimeType: 'image/jpeg',
  width: 10,
  height: 10,
  byteSize: 100,
}

describe('photo integration contracts', () => {
  it('marks ordinary drink log photo optional', () => {
    const c = drinkLogPhotoContract(null, null)
    expect(c.required).toBe(false)
    expect(c.purpose).toBe('drink_log')
    expect(photoReadyForSubmit(c)).toBe(true)
  })

  it('requires staged id for daily and scavenger', () => {
    expect(photoReadyForSubmit(dailyChallengePhotoContract(null, null))).toBe(false)
    expect(photoReadyForSubmit(scavengerPhotoContract(null, null))).toBe(false)
    expect(photoReadyForSubmit(dailyChallengePhotoContract(staged, 'blob:x'))).toBe(true)
    expect(photoReadyForSubmit(scavengerPhotoContract(staged, 'blob:x'))).toBe(true)
    expect(scavengerPhotoContract(staged, null).game).toBe('shipit')
    expect(dailyChallengePhotoContract(staged, null).game).toBe('drinkit')
  })
})
