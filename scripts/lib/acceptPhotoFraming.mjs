/**
 * After setInputFiles on PhotoCapture, accept the framing overlay default.
 * Safe no-op when the editor is not shown (already-accepted / older builds).
 *
 * @param {import('playwright').Page} page
 * @param {{ timeout?: number }} [opts]
 */
export async function acceptPhotoFraming(page, opts = {}) {
  const timeout = opts.timeout ?? 8000
  const editor = page.locator('[data-testid="photo-framing-editor"]')
  try {
    await editor.waitFor({ state: 'visible', timeout })
  } catch {
    return false
  }
  await page.locator('[data-testid="photo-framing-use"]').click()
  await editor.waitFor({ state: 'hidden', timeout }).catch(() => {})
  return true
}
