import { describe, expect, test } from 'bun:test'
import { configSchema } from './workflow'

describe('configSchema', () => {
  test('requires at least one EVM configuration', () => {
    const result = configSchema.safeParse({
      evms:            [],
      sportSources:    { NBA: ['espn', 'thesportsdb'] },
      aggregationMode: 'majority',
    })

    expect(result.success).toBe(false)
  })

  test('rejects sportSources with empty-string keys', () => {
    const result = configSchema.safeParse({
      evms:            [{ chainSelectorName: 'ethereum-testnet-sepolia', sportsMarketAddress: '0xdead' }],
      sportSources:    { '': ['espn', 'thesportsdb'] },
      aggregationMode: 'majority',
    })

    expect(result.success).toBe(false)
  })

  test('rejects sportSources with fewer than 2 providers per sport', () => {
    const result = configSchema.safeParse({
      evms:            [{ chainSelectorName: 'ethereum-testnet-sepolia', sportsMarketAddress: '0xdead' }],
      sportSources:    { NBA: ['espn'] },
      aggregationMode: 'majority',
    })

    expect(result.success).toBe(false)
  })

  test('accepts a valid config with multiple sports and optional gasLimit', () => {
    const result = configSchema.safeParse({
      evms: [
        {
          chainSelectorName:   'ethereum-testnet-sepolia',
          sportsMarketAddress: '0x000000000000000000000000000000000000dead',
          gasLimit:            '500000',
        },
      ],
      sportSources: {
        NBA: ['espn', 'thesportsdb'],
        UCL: ['espn', 'thesportsdb'],
      },
      aggregationMode: 'unanimous',
    })

    expect(result.success).toBe(true)
  })

  test('rejects a provider that does not support the sport kind', () => {
    // apifootball supports only soccer (fetchSoccer); NBA is a score sport
    const result = configSchema.safeParse({
      evms:            [{ chainSelectorName: 'ethereum-testnet-sepolia', sportsMarketAddress: '0xdead' }],
      sportSources:    { NBA: ['espn', 'apifootball'] },
      aggregationMode: 'majority',
    })

    expect(result.success).toBe(false)
  })
})
