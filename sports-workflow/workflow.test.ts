import { describe, expect } from 'bun:test'
import { newTestRuntime, test } from '@chainlink/cre-sdk/test'
import {
  applyAggregation,
  initWorkflow,
  onSettlementRequested,
} from './workflow'

const SPORTS_MARKET = '0x000000000000000000000000000000000000dead'

const makeConfig = () => ({
  evms: [
    {
      chainSelectorName:   'ethereum-testnet-sepolia',
      sportsMarketAddress: SPORTS_MARKET,
      gasLimit:            '500000',
    },
  ],
  sportSources: {
    NBA: ['espn', 'espn'] as const,
  },
  aggregationMode: 'majority' as const,
})

// ─── Unit: applyAggregation ───────────────────────────────────

describe('applyAggregation — majority', () => {
  test('2-of-2 agree: returns consensus', () => {
    expect(applyAggregation([1, 1], 'majority')).toBe(1)
  })

  test('2 sources disagree: returns null', () => {
    expect(applyAggregation([1, 2], 'majority')).toBeNull()
  })

  test('2-of-3 agree: returns consensus', () => {
    expect(applyAggregation([1, 1, 2], 'majority')).toBe(1)
  })

  test('3-way split (1 each): returns null', () => {
    expect(applyAggregation([1, 2, 3], 'majority')).toBeNull()
  })

  test('3-of-3 agree: returns consensus', () => {
    expect(applyAggregation([2, 2, 2], 'majority')).toBe(2)
  })

  test('empty array: returns null', () => {
    expect(applyAggregation([], 'majority')).toBeNull()
  })
})

describe('applyAggregation — unanimous', () => {
  test('all agree: returns consensus', () => {
    expect(applyAggregation([1, 1, 1], 'unanimous')).toBe(1)
  })

  test('any disagreement: returns null', () => {
    expect(applyAggregation([1, 1, 2], 'unanimous')).toBeNull()
  })

  test('2-of-2 agree: returns consensus', () => {
    expect(applyAggregation([2, 2], 'unanimous')).toBe(2)
  })
})

// ─── Integration: initWorkflow ────────────────────────────────

describe('initWorkflow', () => {
  test('returns exactly one log trigger handler bound to onSettlementRequested', () => {
    const handlers = initWorkflow(makeConfig())

    expect(handlers).toHaveLength(1)
    expect(handlers[0].fn).toBe(onSettlementRequested)

    const trigger = handlers[0].trigger as {
      adapt: (raw: any) => any
      configAsAny: () => any
    }
    expect(typeof trigger.adapt).toBe('function')
    expect(typeof trigger.configAsAny).toBe('function')
  })
})
