import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PHOTO_FRAMING,
  clampFraming,
  cropSide,
  framedImageStyle,
  panFramingByDelta,
  panLimits,
  zoomFramingAt,
} from '@/lib/media/framing'

describe('photo framing math', () => {
  it('defaults to centered cover', () => {
    expect(DEFAULT_PHOTO_FRAMING).toEqual({ zoom: 1, centerX: 0.5, centerY: 0.5 })
  })

  it('at zoom 1 on landscape, only horizontal pan is allowed', () => {
    const limits = panLimits(2000, 1000, 1)
    expect(limits.minY).toBeCloseTo(0.5)
    expect(limits.maxY).toBeCloseTo(0.5)
    expect(limits.minX).toBeCloseTo(0.25)
    expect(limits.maxX).toBeCloseTo(0.75)
  })

  it('at zoom 1 on portrait, only vertical pan is allowed', () => {
    const limits = panLimits(1000, 2000, 1)
    expect(limits.minX).toBeCloseTo(0.5)
    expect(limits.maxX).toBeCloseTo(0.5)
    expect(limits.minY).toBeCloseTo(0.25)
    expect(limits.maxY).toBeCloseTo(0.75)
  })

  it('clamps zoom into [1, 4] and centers into the pan window', () => {
    const f = clampFraming(2000, 1000, { zoom: 9, centerX: 0, centerY: 0 })
    expect(f.zoom).toBe(4)
    expect(f.centerX).toBeGreaterThan(0)
    expect(f.centerY).toBeCloseTo(0.5)
  })

  it('produces size-independent percentage styles', () => {
    const style = framedImageStyle(2000, 1000, { zoom: 1, centerX: 0.5, centerY: 0.5 })
    expect(style.width).toBe('200%')
    expect(style.height).toBe('100%')
    expect(style.left).toBe('-50%')
    expect(style.top).toBe('0%')
  })

  it('pans without introducing empty space', () => {
    const start = clampFraming(2000, 1000, { zoom: 2, centerX: 0.5, centerY: 0.5 })
    const next = panFramingByDelta(2000, 1000, start, 200, 5000, 0)
    const limits = panLimits(2000, 1000, next.zoom)
    expect(next.centerX).toBeGreaterThanOrEqual(limits.minX - 1e-9)
    expect(next.centerX).toBeLessThanOrEqual(limits.maxX + 1e-9)
  })

  it('zooms about the current center and keeps the crop filled', () => {
    const start = { zoom: 1, centerX: 0.5, centerY: 0.5 }
    const next = zoomFramingAt(1600, 900, start, 2)
    expect(next.zoom).toBe(2)
    expect(cropSide(1600, 900, next.zoom)).toBe(450)
    expect(next.centerY).toBeCloseTo(0.5)
  })
})
