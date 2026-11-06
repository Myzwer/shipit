/**
 * Track which submissions already showed an unlock celebration.
 * Uses sessionStorage so refresh does not re-popup; survives lost-response
 * retry by keying on immutable submission_id from the receipt.
 */
export const CELEBRATED_SUBMISSIONS_KEY = 'star-princess.achievementCelebrations.v1'

function canUseStorage(): boolean {
  return typeof sessionStorage !== 'undefined'
}

export function readCelebratedSubmissionIds(
  storage: Storage | null = canUseStorage() ? sessionStorage : null,
): Set<string> {
  if (!storage) return new Set()
  try {
    const raw = storage.getItem(CELEBRATED_SUBMISSIONS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0))
  } catch {
    return new Set()
  }
}

export function markSubmissionCelebrated(
  submissionId: string,
  storage: Storage | null = canUseStorage() ? sessionStorage : null,
): void {
  if (!storage || !submissionId) return
  const set = readCelebratedSubmissionIds(storage)
  set.add(submissionId)
  storage.setItem(CELEBRATED_SUBMISSIONS_KEY, JSON.stringify([...set]))
}

export function wasSubmissionCelebrated(
  submissionId: string,
  storage: Storage | null = canUseStorage() ? sessionStorage : null,
): boolean {
  return readCelebratedSubmissionIds(storage).has(submissionId)
}
