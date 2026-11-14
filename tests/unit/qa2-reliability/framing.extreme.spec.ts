/**
 * QA-2 Agent 2 — square framing math for extreme aspect ratios / zoom edges.
 * Image-processing unit tests only (not physical touch-device verification).
 */
import { describe, expect, it } from 'vitest'
import {
  PHOTO_FRAMING_MAX_ZOOM,
  PHOTO_FRAMING_MIN_ZOOM,
  clampFraming,
  cropSide,
  framedImageStyle,
  panFramingByDelta,
  panLimits,
  zoomFramingAt,
} from '@/lib/media/framing'

describe('QA2 framing extreme aspects', () => {
  it('handles ultra-wide panorama at cover zoom', () => {
    const limits = panLimits(4000, 500, 1)
    expect(limits.minY).toBeCloseTo(0.5)
    expect(limits.maxY).toBeCloseTo(0.5)
    expect(limits.minX).toBeLessThan(0.2)
    expect(limits.maxX).toBeGreaterThan(0.8)
    const style = framedImageStyle(4000, 500, { zoom: 1, centerX: 0.5, centerY: 0.5 })
    expect(parseFloat(style.width!)).toBeGreaterThan(100)
    expect(parseFloat(style.height!)).toBe(100)
  })

  it('handles ultra-tall portrait at cover zoom', () => {
    const limits = panLimits(500, 4000, 1)
    expect(limits.minX).toBeCloseTo(0.5)
    expect(limits.maxX).toBeCloseTo(0.5)
    const style = framedImageStyle(500, 4000, { zoom: 1, centerX: 0.5, centerY: 0.5 })
    expect(parseFloat(style.height!)).toBeGreaterThan(100)
    expect(parseFloat(style.width!)).toBe(100)
  })

  it('clamps zoom to [1,4] for extreme requested values', () => {
    expect(clampFraming(1000, 1000, { zoom: 0.1, centerX: 0.5, centerY: 0.5 }).zoom).toBe(
      PHOTO_FRAMING_MIN_ZOOM,
    )
    expect(clampFraming(1000, 1000, { zoom: 99, centerX: 0.5, centerY: 0.5 }).zoom).toBe(
      PHOTO_FRAMING_MAX_ZOOM,
    )
  })

  it('at max zoom, crop side is shortEdge/4', () => {
    expect(cropSide(2000, 1000, PHOTO_FRAMING_MAX_ZOOM)).toBe(250)
    expect(cropSide(900, 1600, PHOTO_FRAMING_MAX_ZOOM)).toBe(225)
  })

  it('pan deltas cannot introduce empty letterbox space', () => {
    const start = clampFraming(3000, 1000, { zoom: 2.5, centerX: 0.5, centerY: 0.5 })
    for (const dx of [-5000, -200, 0, 200, 5000]) {
      const next = panFramingByDelta(3000, 1000, start, 320, dx, dx / 2)
      const limits = panLimits(3000, 1000, next.zoom)
      expect(next.centerX).toBeGreaterThanOrEqual(limits.minX - 1e-9)
      expect(next.centerX).toBeLessThanOrEqual(limits.maxX + 1e-9)
      expect(next.centerY).toBeGreaterThanOrEqual(limits.minY - 1e-9)
      expect(next.centerY).toBeLessThanOrEqual(limits.maxY + 1e-9)
    }
  })

  it('zoomFramingAt keeps center when zooming square image', () => {
    const start = { zoom: 1, centerX: 0.42, centerY: 0.58 }
    const next = zoomFramingAt(1200, 1200, start, 3)
    expect(next.zoom).toBe(3)
    expect(next.centerX).toBeCloseTo(0.42)
    expect(next.centerY).toBeCloseTo(0.58)
  })

  it('square image at zoom 1 has no pan freedom', () => {
    const limits = panLimits(1000, 1000, 1)
    expect(limits.minX).toBeCloseTo(0.5)
    expect(limits.maxX).toBeCloseTo(0.5)
    expect(limits.minY).toBeCloseTo(0.5)
    expect(limits.maxY).toBeCloseTo(0.5)
  })
})
