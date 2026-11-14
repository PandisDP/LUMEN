import { describe, expect, it } from 'vitest'
import { complement, findWindows, longest, stateAt } from './windows.ts'

const signal = (values: number[]) => ({ startMs: 0, stepMs: 10, values })

describe('findWindows', () => {
  it('finds windows and interpolates their edges', () => {
    const w = findWindows(signal([0, 0, 1, 1, 0, 0]), 0.5)
    expect(w).toHaveLength(1)
    expect(w[0].startMs).toBeCloseTo(15)
    expect(w[0].endMs).toBeCloseTo(35)
    expect(w[0].openStart).toBe(false)
    expect(w[0].openEnd).toBe(false)
  })

  it('flags windows cut by the start or the end of the series', () => {
    const w = findWindows(signal([1, 1, 0, 0, 1]), 0.5)
    expect(w).toHaveLength(2)
    expect(w[0].openStart).toBe(true)
    expect(w[1].openEnd).toBe(true)
  })

  it('respects an index range', () => {
    expect(findWindows(signal([1, 1, 0, 0, 1]), 0.5, 2, 4)).toEqual([])
  })
})

describe('window helpers', () => {
  const w = findWindows(signal([0, 1, 1, 0, 0, 0, 1, 0]), 0.5)

  it('complement returns the gaps', () => {
    const gaps = complement(w, 0, 70)
    expect(gaps.map((g) => [g.startMs, g.endMs])).toEqual([
      [0, 5],
      [25, 55],
      [65, 70],
    ])
    expect(longest(gaps)?.startMs).toBe(25)
  })

  it('stateAt gives the current state and the next change', () => {
    expect(stateAt(w, 10)).toEqual({ on: true, nextChangeMs: 25 })
    expect(stateAt(w, 30)).toEqual({ on: false, nextChangeMs: 55 })
    expect(stateAt(w, 69)).toEqual({ on: false, nextChangeMs: null })
  })
})
