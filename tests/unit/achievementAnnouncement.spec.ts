import { describe, expect, it } from 'vitest'
import {
  achievementAnnouncementTitle,
  isSecretMaskedAnnouncement,
} from '@/lib/gallery/achievementAnnouncement'
import { copy } from '@/ui/copy'

describe('achievementAnnouncementTitle (QA-ACH-GALLERY-001)', () => {
  it('keeps ordinary earned titles and icons metadata as provided', () => {
    expect(
      achievementAnnouncementTitle({
        title: '15 Minutes of Fame',
        description: 'Log a drink',
        secret: false,
        icon_key: 'fas fa-medal',
      }),
    ).toBe('15 Minutes of Fame')
    expect(
      isSecretMaskedAnnouncement(
        { title: '15 Minutes of Fame', secret: false, icon_key: 'fas fa-medal' },
        '15 Minutes of Fame',
      ),
    ).toBe(false)
  })

  it('reveals legitimately earned secrets when the server sends real metadata', () => {
    const display = {
      title: 'Secret Handshake',
      description: 'You found it',
      secret: true,
      icon_key: 'fas fa-user-secret',
    }
    expect(achievementAnnouncementTitle(display)).toBe('Secret Handshake')
    expect(isSecretMaskedAnnouncement(display, 'Secret Handshake')).toBe(false)
  })

  it('treats legacy compact masking copy as masked only when secret', () => {
    expect(
      achievementAnnouncementTitle({
        title: 'Achievement unlocked',
        secret: true,
        icon_key: null,
      }),
    ).toBe('Achievement unlocked')
    expect(
      isSecretMaskedAnnouncement({ secret: true }, copy.achievements.unlockedCompact),
    ).toBe(true)
  })

  it('does not present incomplete non-secret awards as secret masks', () => {
    expect(achievementAnnouncementTitle({ secret: false })).toBe('Achievement')
    expect(achievementAnnouncementTitle({})).toBe('Achievement')
    expect(isSecretMaskedAnnouncement({ secret: false }, 'Achievement')).toBe(false)
    expect(isSecretMaskedAnnouncement({}, copy.achievements.unlockedCompact)).toBe(false)
  })
})
