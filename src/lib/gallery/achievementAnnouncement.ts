import { copy } from '@/ui/copy'

export type AchievementAnnouncementDisplay = {
  title?: unknown
  description?: unknown
  secret?: unknown
  icon_key?: unknown
  group_key?: unknown
}

/**
 * Resolve Gallery achievement announcement title.
 *
 * Gallery cards only appear for active (earned) awards. Earned secrets must show
 * their real title from the server. "Achievement unlocked" is only for legacy /
 * incomplete payloads that still carry secret masking copy — not for ordinary
 * missing titles on non-secret awards.
 */
export function achievementAnnouncementTitle(
  display: AchievementAnnouncementDisplay | null | undefined,
): string {
  const d = display ?? {}
  const raw = d.title
  if (typeof raw === 'string' && raw.trim()) return raw
  // Incomplete payload: do not invent a secret-masking identity for ordinary awards.
  if (d.secret === true) return copy.achievements.unlockedCompact
  return 'Achievement'
}

/**
 * True only when the feed is still presenting intentional compact masking copy.
 * Earned secrets with real titles return false (show catalog icon + metadata).
 */
export function isSecretMaskedAnnouncement(
  display: AchievementAnnouncementDisplay | null | undefined,
  title: string,
): boolean {
  const secret = display?.secret === true
  return (
    secret &&
    (title === copy.achievements.unlockedCompact || title === 'Achievement unlocked')
  )
}
