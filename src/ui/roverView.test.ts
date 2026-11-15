import { describe, expect, it } from 'vitest'
import type { TraversePhase, TraverseSummary } from '../astro/traverse.ts'
import {
  legRemaining,
  outcomeLevel,
  profileCursorM,
  roverFixes,
  roverOutcome,
  roverStateKey,
  sampleDots,
  stateBand,
  stateGlyph,
  tripMarks,
} from './roverView.ts'

/** A good round trip (utility rover at the Shackleton rim); each test changes what it needs. */
const summary = (patch: Partial<TraverseSummary> = {}): TraverseSummary => ({
  reaches: true,
  arrivalMs: 3.5 * 3_600_000,
  samples: 3,
  samplesDone: 3,
  returns: true,
  returnMs: 13.1 * 3_600_000,
  onTime: true,
  marginH: 322.9,
  success: true,
  lengthM: 2780,
  outLengthM: 1390,
  driveH: 7.1,
  outDriveH: 3.5,
  returnDriveH: 3.6,
  waitH: 0,
  outWaitH: 0,
  workH: 6,
  totalH: 13.1,
  minSocPct: 47.1,
  endSocPct: 54.7,
  energyWh: 4000,
  hoursInShadow: 6.5,
  dtePct: 0,
  psrEntryM: 1300,
  ...patch,
})

describe('roverStateKey', () => {
  it('is the phase of the model while the trip is under way', () => {
    for (const phase of ['out', 'wait', 'sample', 'back'] as TraversePhase[])
      expect(roverStateKey(phase, false, summary())).toBe(phase)
  })

  it('ends back at the lander when everything went to plan', () => {
    expect(roverStateKey('done', true, summary())).toBe('done')
    // The last sample of the result is already "done", a frame before the clock says so.
    expect(roverStateKey('done', false, summary())).toBe('done')
  })

  it('ends with the reason of the failure, whatever the last phase was', () => {
    expect(roverStateKey('wait', true, summary({ reason: 'battery' }))).toBe('fail-battery')
    expect(roverStateKey('sample', true, summary({ reason: 'samples' }))).toBe('fail-samples')
    // A late trip did come back: its last phase is "done", yet it is not a success.
    expect(roverStateKey('done', true, summary({ reason: 'late' }))).toBe('fail-late')
    expect(roverStateKey('out', true, summary({ reason: 'no-route' }))).toBe('fail-battery')
  })

  it('does not announce a failure before the playback gets to it', () => {
    expect(roverStateKey('out', false, summary({ reason: 'samples' }))).toBe('out')
    expect(roverStateKey('sample', false, summary({ reason: 'samples' }))).toBe('sample')
    expect(roverStateKey('wait', false, summary({ reason: 'battery' }))).toBe('wait')
  })

  it('carries a band and a glyph only for the final states (never colour alone)', () => {
    expect(stateBand('done')).toBe('ok')
    expect(stateGlyph('done')).toBe('✓')
    for (const key of ['fail-battery', 'fail-samples', 'fail-late'] as const) {
      expect(stateBand(key)).toBe('deficit')
      expect(stateGlyph(key)).toBe('▼')
    }
    for (const key of ['out', 'wait', 'sample', 'back'] as const) {
      expect(stateBand(key)).toBeNull()
      expect(stateGlyph(key)).toBe('')
    }
  })
})

describe('profileCursorM', () => {
  const out = 1390
  it('follows the odometer on the way out and mirrors it on the way back', () => {
    expect(profileCursorM(0, out)).toBe(0)
    expect(profileCursorM(500, out)).toBe(500)
    expect(profileCursorM(out, out)).toBe(out)
    expect(profileCursorM(out + 400, out)).toBe(out - 400)
    expect(profileCursorM(2 * out, out)).toBe(0)
  })

  it('passes the same place at the same cursor position both ways', () => {
    for (const d of [10, 333, 1000, 1389])
      expect(profileCursorM(2 * out - d, out)).toBeCloseTo(profileCursorM(d, out), 9)
  })

  it('stays on the profile whatever it is given', () => {
    expect(profileCursorM(-5, out)).toBe(0)
    expect(profileCursorM(2 * out + 50, out)).toBe(0)
    expect(profileCursorM(NaN, out)).toBe(0)
    expect(profileCursorM(100, 0)).toBe(0)
  })
})

describe('legRemaining', () => {
  it('counts down to the ice on the way out and to the lander on the way back', () => {
    expect(legRemaining(400, 1390, 'out')).toEqual({ to: 'ice', m: 990 })
    expect(legRemaining(1390, 1390, 'out')).toEqual({ to: 'ice', m: 0 })
    expect(legRemaining(1390, 1390, 'back')).toEqual({ to: 'lander', m: 1390 })
    expect(legRemaining(1820, 1390, 'back')).toEqual({ to: 'lander', m: 960 })
    expect(legRemaining(2780, 1390, 'back')).toEqual({ to: 'lander', m: 0 })
  })

  it('has no figure before the telemetry does', () => {
    expect(legRemaining(NaN, NaN, 'out').m).toBeNaN()
  })
})

describe('sampleDots', () => {
  it('fills one mark per completed sample', () => {
    expect(sampleDots(0, 3)).toBe('○○○')
    expect(sampleDots(2, 3)).toBe('●●○')
    expect(sampleDots(3, 3)).toBe('●●●')
    expect(sampleDots(7, 3)).toBe('●●●')
    expect(sampleDots(0, 0)).toBe('')
  })
})

describe('tripMarks', () => {
  const t0 = 1_000_000
  const h = 3_600_000
  it('gives the arrival at the ice and the departure from it, since departure', () => {
    const marks = tripMarks({
      t: [t0, t0 + h, t0 + 2 * h, t0 + 4 * h, t0 + 5 * h],
      phase: ['out', 'out', 'sample', 'back', 'done'],
      summary: summary({ arrivalMs: t0 + 2 * h }),
    })
    expect(marks).toEqual({ arrivalMs: 2 * h, leaveMs: 4 * h })
  })

  it('has no departure for a trip that ends at the ice, and nothing for one that never arrives', () => {
    expect(
      tripMarks({
        t: [t0, t0 + h, t0 + 2 * h],
        phase: ['out', 'sample', 'sample'],
        summary: summary({ arrivalMs: t0 + h, reason: 'samples' }),
      }),
    ).toEqual({ arrivalMs: h, leaveMs: null })
    expect(
      tripMarks({
        t: [t0, t0 + h],
        phase: ['out', 'wait'],
        summary: summary({ arrivalMs: null, reaches: false, reason: 'battery' }),
      }),
    ).toEqual({ arrivalMs: null, leaveMs: null })
  })
})

describe('roverOutcome', () => {
  it('is fine only when the whole mission is, minimum battery included', () => {
    expect(roverOutcome(summary(), 20)).toBe('ok')
    // `success` does not look at the battery: the planner's minimum does.
    expect(roverOutcome(summary({ minSocPct: 15 }), 20)).toBe('low-battery')
    expect(roverOutcome(summary({ minSocPct: 15 }), 10)).toBe('ok')
  })

  it('names why a trip fails, first failure first', () => {
    const dead = { reaches: false, returns: false, onTime: false, success: false, samplesDone: 0 }
    expect(roverOutcome(summary({ ...dead, reason: 'no-route' }), 20)).toBe('no-route')
    expect(roverOutcome(summary({ ...dead, reason: 'battery' }), 20)).toBe('battery-out')
    expect(
      roverOutcome(
        summary({
          samplesDone: 1,
          returns: false,
          onTime: false,
          success: false,
          reason: 'samples',
        }),
        20,
      ),
    ).toBe('samples')
    expect(
      roverOutcome(
        summary({ returns: false, onTime: false, success: false, reason: 'battery' }),
        20,
      ),
    ).toBe('no-return')
    expect(
      roverOutcome(summary({ onTime: false, success: false, marginH: -5, reason: 'late' }), 20),
    ).toBe('late')
  })

  it('maps onto the three levels: good, at the limit, bad', () => {
    expect(outcomeLevel('ok')).toBe('good')
    expect(outcomeLevel('low-battery')).toBe('warn')
    for (const o of ['no-route', 'battery-out', 'samples', 'no-return', 'late'] as const)
      expect(outcomeLevel(o)).toBe('bad')
  })
})

describe('roverFixes', () => {
  const micro = { roverId: 'rover' as const, samples: 3, sampleH: 2 }
  const utility = { roverId: 'csa-rover' as const, samples: 3, sampleH: 2 }

  it('offers less work at the ice and, with the micro-rover, the utility rover', () => {
    expect(roverFixes('samples', micro)).toEqual(['fewerSamples', 'utilityRover'])
    expect(roverFixes('samples', utility)).toEqual(['fewerSamples'])
    expect(roverFixes('no-return', micro)).toEqual(['fewerSamples', 'utilityRover'])
    expect(roverFixes('late', utility)).toEqual(['fewerSamples'])
    expect(roverFixes('low-battery', utility)).toEqual(['fewerSamples'])
  })

  it('shortens the last sample when there is none left to drop', () => {
    expect(roverFixes('samples', { ...micro, samples: 1 })).toEqual([
      'shorterSamples',
      'utilityRover',
    ])
    expect(roverFixes('samples', { ...utility, samples: 1, sampleH: 0.5 })).toEqual([])
  })

  it('does not blame the sampling for a rover that dies on the way out', () => {
    expect(roverFixes('battery-out', micro)).toEqual(['utilityRover'])
    expect(roverFixes('battery-out', utility)).toEqual([])
  })

  it('has nothing to fix when it went well or there is no route', () => {
    expect(roverFixes('ok', micro)).toEqual([])
    expect(roverFixes('no-route', micro)).toEqual([])
  })
})
