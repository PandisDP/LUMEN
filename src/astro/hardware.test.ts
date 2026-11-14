import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LIMITS,
  classifySite,
  decodeLimits,
  encodeLimits,
  sanitizeLimits,
} from './hardware.ts'

describe('classifySite', () => {
  const L = DEFAULT_LIMITS // 15°, 120 h, 30 %

  it('passes a comfortable site', () => {
    expect(classifySite(L, { slopeP90Deg: 5, longestDarkH: 10, dtePct: 90 }).verdict).toBe('good')
  })

  it('fails on any exceeded limit and lists every one', () => {
    const v = classifySite(L, { slopeP90Deg: 16, longestDarkH: 500, dtePct: 10 })
    expect(v.verdict).toBe('bad')
    expect(v.failed).toEqual(['slope', 'night', 'dte'])
  })

  it('flags limits met with less than 20 % to spare', () => {
    // 13° > 12° (80 % of 15°); 100 h > 96 h; 35 % < 36 %.
    const v = classifySite(L, { slopeP90Deg: 13, longestDarkH: 100, dtePct: 35 })
    expect(v.verdict).toBe('warn')
    expect(v.tight).toEqual(['slope', 'night', 'dte'])
  })

  it('is inclusive at the limit and ignores an unknown slope', () => {
    expect(classifySite(L, { slopeP90Deg: 15, longestDarkH: 0, dtePct: 100 }).failed).toEqual([])
    expect(classifySite(L, { longestDarkH: 0, dtePct: 100 }).verdict).toBe('good')
  })

  it('a PSR (endless night) is a no-go with default limits', () => {
    expect(classifySite(L, { slopeP90Deg: 6, longestDarkH: 336, dtePct: 0 }).failed).toContain(
      'night',
    )
  })
})

describe('limits encoding', () => {
  it('round-trips through the URL form', () => {
    const l = { maxSlopeDeg: 8, maxNightH: 50, minDtePct: 60, roverMaxSlopeDeg: 25 }
    expect(decodeLimits(encodeLimits(l))).toEqual(l)
  })

  it('clamps out-of-range values and rejects malformed input', () => {
    expect(sanitizeLimits({ maxSlopeDeg: 99, minDtePct: -5 })).toMatchObject({
      maxSlopeDeg: 30,
      minDtePct: 0,
    })
    expect(sanitizeLimits({ maxNightH: 'abc' }).maxNightH).toBe(DEFAULT_LIMITS.maxNightH)
    expect(decodeLimits('5')).toBeNull()
  })
})
