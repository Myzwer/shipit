/**
 * QA-2 Agent 2 — static contracts for submit double-tap + orphaned media cleanup.
 * These assert the reliability behaviors cruise guests need; failures = confirmed defects.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../../..')

function src(rel: string) {
  return readFileSync(resolve(ROOT, rel), 'utf8')
}

describe('QA2 submit re-entry guards', () => {
  it('Drink It log wizard rejects submit while already submitting (BUSY)', () => {
    const body = src('src/stores/drinkLogWizard.ts')
    expect(body).toMatch(/submitStatus\.value === 'submitting'/)
    expect(body).toMatch(/code:\s*'BUSY'/)
  })

  it('Ship It scavenger performSubmit returns early if already submitting', () => {
    const body = src('src/features/shipit/ScavengerSubmitView.vue')
    const fn = body.slice(body.indexOf('async function performSubmit'))
    const head = fn.slice(0, 500)
    expect(head).toMatch(/if\s*\(\s*submitting\.value\s*\)\s*return/)
  })

  it('Drink It Daily performSubmit returns early if already submitting', () => {
    const body = src('src/features/drinkit/DailyClaimView.vue')
    const fn = body.slice(body.indexOf('async function performSubmit'))
    const head = fn.slice(0, 600)
    expect(head).toMatch(/if\s*\(\s*submitting\.value\s*\)\s*return/)
  })
})

describe('QA2 staged photo abandon on discard', () => {
  it('Scavenger start-over / discard abandons staged remote photo', () => {
    const body = src('src/features/shipit/ScavengerSubmitView.vue')
    expect(body).toMatch(/abandonPhotoUpload/)
    const startOver = body.slice(body.indexOf('function confirmStartOver'))
    expect(startOver.slice(0, 800)).toMatch(/abandonPhotoUpload|abandon/)
  })

  it('Scavenger discard-on-leave cleans remote staged photo', () => {
    const body = src('src/features/shipit/ScavengerSubmitView.vue')
    const unmount = body.slice(body.indexOf('onBeforeUnmount'))
    expect(unmount.slice(0, 900)).toMatch(/abandonPhotoUpload|abandon/)
  })

  it('PhotoCapture remove path still abandons remote (control)', () => {
    const body = src('src/components/shared/PhotoCapture.vue')
    expect(body).toMatch(/abandonPhotoUpload/)
    expect(body).toMatch(/async function abandonCurrent/)
  })

  it('Drink log wizard reset abandons staged remote photo', () => {
    const body = src('src/stores/drinkLogWizard.ts')
    const reset = body.slice(body.indexOf('function resetAll'))
    expect(reset.slice(0, 1200)).toMatch(/abandonPhotoUpload/)
  })
})

describe('QA2 drink submit unknown classification', () => {
  it('classifies network/timeout/empty-code RPC errors as unknown (not silent success)', () => {
    const body = src('src/lib/drinkLog/api.ts')
    expect(body).toMatch(/kind: 'unknown'/)
    expect(body).toMatch(/timeout/)
    expect(body).toMatch(/network/)
    expect(body).toMatch(/result\.ok === true/)
  })
})
