import { describe, expect, it } from 'vitest'
import { type EphemTable, sampleTable, subPointToVector, tableCovers } from './ephemTable.ts'

/** Table whose 6 channels are cubic polynomials of the sample index: interpolated exactly. */
function cubicTable(count: number): EphemTable {
  const data = new Float32Array(count * 6)
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 6; k++) data[i * 6 + k] = (k + 1) * (i * i * i * 0.01 - i * i + 3 * i + 5)
  }
  return { source: 'test', startMs: 0, stepMs: 1000, count, data }
}

describe('ephemeris table', () => {
  it('converts sub-points to body-fixed vectors (east-positive longitude)', () => {
    const [x, y, z] = subPointToVector(90, 0, 10)
    expect(x).toBeCloseTo(0, 9)
    expect(y).toBeCloseTo(10, 9)
    expect(z).toBeCloseTo(0, 9)
    expect(subPointToVector(0, -90, 2)[2]).toBeCloseTo(-2, 9)
  })

  it('reproduces cubics exactly between samples', () => {
    const t = cubicTable(20)
    const out = new Float64Array(6)
    const x = 7.3
    expect(sampleTable(t, x * 1000, out)).toBe(true)
    const f = x * x * x * 0.01 - x * x + 3 * x + 5
    for (let k = 0; k < 6; k++) expect(out[k]).toBeCloseTo((k + 1) * f, 4)
  })

  it('needs a neighbour on each side and refuses times outside', () => {
    const t = cubicTable(10)
    expect(tableCovers(t, 999)).toBe(false)
    expect(tableCovers(t, 1000)).toBe(true)
    expect(tableCovers(t, 7000)).toBe(true)
    expect(tableCovers(t, 7001)).toBe(false)
    const out = [0, 0, 0, 0, 0, 0]
    expect(sampleTable(t, 9000, out)).toBe(false)
    expect(out).toEqual([0, 0, 0, 0, 0, 0])
  })
})
