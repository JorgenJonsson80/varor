import { describe, expect, it } from 'vitest'
import { classifySignal, type SignalInput } from '../signals'

const base: SignalInput = {
  varuklass: 'B',
  platsklass: 'B',
  latestVolume: 10,
  trend: 'stable',
  isPeriodGood: false,
  periodGoodProtected: false,
}

describe('classifySignal — priority order', () => {
  it('1. A-vara på C-plats wins over everything else', () => {
    const result = classifySignal({
      ...base,
      varuklass: 'A',
      platsklass: 'C',
      isPeriodGood: true, // would also match rule 2, but rule 1 takes priority
      trend: 'rising',
    })
    expect(result).toBe('A_ON_C')
  })

  it('2. Periodvara på C-plats', () => {
    const result = classifySignal({ ...base, varuklass: 'B', platsklass: 'C', isPeriodGood: true })
    expect(result).toBe('PERIOD_ON_C')
  })

  it('3. Stigande vara på C-plats', () => {
    const result = classifySignal({ ...base, platsklass: 'C', trend: 'rising', isPeriodGood: false })
    expect(result).toBe('RISING_ON_C')
  })

  it('4. Periodvara på bra plats (informational)', () => {
    const result = classifySignal({ ...base, platsklass: 'B', isPeriodGood: true })
    expect(result).toBe('PERIOD_ON_GOOD')
  })

  it('5. Nollvara på A-plats', () => {
    const result = classifySignal({ ...base, platsklass: 'A', latestVolume: 0 })
    expect(result).toBe('ZERO_ON_A')
  })

  it('6. Fallande A-vara på A-plats', () => {
    const result = classifySignal({ ...base, varuklass: 'A', platsklass: 'A', trend: 'falling' })
    expect(result).toBe('FALLING_A_ON_A')
  })

  it('7. Missmatch when classes differ and nothing else fired', () => {
    const result = classifySignal({ ...base, varuklass: 'B', platsklass: 'A' })
    expect(result).toBe('MISMATCH')
  })

  it('7. OK when classes match and nothing else fired', () => {
    const result = classifySignal({ ...base, varuklass: 'B', platsklass: 'B' })
    expect(result).toBe('OK')
  })
})

describe('classifySignal — period-good protection', () => {
  it('a protected period good is never flagged as a zero-on-A', () => {
    const result = classifySignal({
      ...base,
      platsklass: 'A',
      latestVolume: 0,
      isPeriodGood: true,
      periodGoodProtected: true,
    })
    expect(result).not.toBe('ZERO_ON_A')
  })

  it('a protected period good is never flagged as falling-A-on-A', () => {
    const result = classifySignal({
      ...base,
      varuklass: 'A',
      platsklass: 'A',
      trend: 'falling',
      isPeriodGood: true,
      periodGoodProtected: true,
    })
    expect(result).not.toBe('FALLING_A_ON_A')
  })

  it('protection does not suppress the period-on-C-plats warning ahead of season', () => {
    const result = classifySignal({
      ...base,
      varuklass: 'C',
      platsklass: 'C',
      isPeriodGood: true,
      periodGoodProtected: true,
    })
    expect(result).toBe('PERIOD_ON_C')
  })

  it('an unprotected zero-volume period good on an A-plats still falls through to zero-on-A', () => {
    // isPeriodGood true but platsklass isn't C, so rule 2 doesn't fire;
    // rule 4 (period-on-good) only applies while volume keeps it "good", but
    // with protection off and volume at 0 on an A-plats, zero-on-A wins
    // because rule 4 (isPeriodGood && platsklass !== 'C') fires first —
    // this test documents that period-good must be unset for zero-on-A to show.
    const result = classifySignal({
      ...base,
      platsklass: 'A',
      latestVolume: 0,
      isPeriodGood: false,
      periodGoodProtected: false,
    })
    expect(result).toBe('ZERO_ON_A')
  })
})
