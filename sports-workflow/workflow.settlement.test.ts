import { describe, expect } from 'bun:test'
import {
  EvmMock,
  HttpActionsMock,
  newTestRuntime,
  REPORT_METADATA_HEADER_LENGTH,
  test,
  type WriteReportMockInput,
} from '@chainlink/cre-sdk/test'
import {
  bytesToHex,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  type Address,
} from 'viem'
import { newSportsMarketV2Mock } from '../contracts/evm/ts/generated/SportsMarketV2_mock'
import { onSettlementRequested } from './workflow'

const CHAIN_SELECTOR = 16015286601757825753n // ethereum-testnet-sepolia
const SPORTS_MARKET  = '0x000000000000000000000000000000000000dead' as Address

const makeRuntime = () => {
  const runtime = newTestRuntime()
  ;(runtime as any).config = {
    evms: [
      {
        chainSelectorName:   'ethereum-testnet-sepolia',
        sportsMarketAddress: SPORTS_MARKET,
        gasLimit:            '500000',
      },
    ],
    sportSources: {
      NBA: ['espn', 'espn'],
    },
    aggregationMode: 'majority' as const,
  }
  return runtime
}

// Registered, unsettled game — gets tests past the on-chain guards.
const registeredUnsettled = (sport: string, espnId: bigint) => ({
  sport,
  espnId,
  description: 'Test game',
  outcome:     0 as number,
  settledAt:   0n,
})

describe('onSettlementRequested — on-chain guards', () => {
  test('returns not_registered when game.espnId === 0n', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (_sport, _espnId) => ({
      sport:       _sport,
      espnId:      0n,
      description: '',
      outcome:     0,
      settledAt:   0n,
    })

    const result = JSON.parse(
      onSettlementRequested(makeRuntime() as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: 'Pacers at Thunder' },
      } as any),
    )

    expect(result).toEqual({ status: 'not_registered', sport: 'NBA', espnId: '401766123' })
  })

  test('returns already_settled when game.settledAt !== 0n', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => ({
      sport,
      espnId,
      description: 'Pacers at Thunder',
      outcome:     1,
      settledAt:   1710000000n,
    })

    const result = JSON.parse(
      onSettlementRequested(makeRuntime() as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: 'Pacers at Thunder' },
      } as any),
    )

    expect(result).toEqual({
      status:    'already_settled',
      sport:     'NBA',
      espnId:    '401766123',
      outcome:   1,
      settledAt: '1710000000',
    })
  })

  test('throws when sport is not in SPORT_REGISTRY', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    expect(() =>
      onSettlementRequested(makeRuntime() as any, {
        data: { espnId: 401766123n, sport: 'DARTS', description: 'Championship Final' },
      } as any),
    ).toThrow('Unsupported sport: DARTS')
  })

  test('throws when sport has no data sources in config', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    // NHL is in SPORT_REGISTRY but not in this config's sportSources.
    const runtime = newTestRuntime()
    ;(runtime as any).config = {
      evms: [
        {
          chainSelectorName:   'ethereum-testnet-sepolia',
          sportsMarketAddress: SPORTS_MARKET,
          gasLimit:            '500000',
        },
      ],
      sportSources:    {},
      aggregationMode: 'majority' as const,
    }

    expect(() =>
      onSettlementRequested(runtime as any, {
        data: { espnId: 401766888n, sport: 'NHL', description: 'Bruins at Leafs' },
      } as any),
    ).toThrow('No data sources configured for sport: NHL')
  })
})

// ─── ESPN body builders (duplicated from workflow.fetch.test.ts) ─────────────

// Real ESPN summary?event= nests under .header.competitions[0] (status + competitors).
const scoreBody = (
  home:        string | undefined,
  away:        string | undefined,
  shortDetail  = 'Final',
) => ({
  header: { competitions: [{
    status:      { type: { completed: true, shortDetail } },
    competitors: [
      { homeAway: 'home', score: home },
      { homeAway: 'away', score: away },
    ],
  }]},
})

const soccerBody = (
  home:          string | undefined,
  away:          string | undefined,
  shortDetail    = 'FT',
  shootoutHome?: number,
  shootoutAway?: number,
) => ({
  header: { competitions: [{
    status:      { type: { completed: true, shortDetail } },
    competitors: [
      { homeAway: 'home', score: home, ...(shootoutHome != null ? { shootoutScore: shootoutHome } : {}) },
      { homeAway: 'away', score: away, ...(shootoutAway != null ? { shootoutScore: shootoutAway } : {}) },
    ],
  }]},
})

// HttpActionsMock expects ResponseJson: body must be base64-encoded.
const httpBody = (data: unknown, statusCode = 200) => ({
  statusCode,
  body: Buffer.from(JSON.stringify(data)).toString('base64'),
})

// Runtime wired to a single sport (provider names), used for NFL and soccer tests.
const makeRuntimeForSport = (sport: string, providers: string[]) => {
  const runtime = newTestRuntime()
  ;(runtime as any).config = {
    evms: [{ chainSelectorName: 'ethereum-testnet-sepolia', sportsMarketAddress: SPORTS_MARKET, gasLimit: '500000' }],
    sportSources:    { [sport]: providers },
    aggregationMode: 'majority' as const,
  }
  return runtime
}

// ─── CP5: Settlement execution ────────────────────────────────

describe('onSettlementRequested — settlement execution', () => {
  // (a) Both NBA sources agree: home wins.
  test('NBA home wins: both sources agree, writeReport called with correct payload', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let captured: WriteReportMockInput | undefined
    mock.writeReport = (input) => {
      captured = input
      return { txStatus: 'TX_STATUS_SUCCESS' }
    }

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (_req) => httpBody(scoreBody('110', '107'))

    const result = JSON.parse(
      onSettlementRequested(makeRuntime() as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: 'Pacers at Thunder' },
      } as any),
    )

    expect(result.sport).toBe('NBA')
    expect(result.outcome).toBe(1)
    expect(result.espnId).toBe('401766123')
    expect(typeof result.compositeKey).toBe('string')
    expect(typeof result.txHash).toBe('string')

    // Verify the report payload encodes keccak256(abi.encode(sport, espnId)) and outcome.
    expect(captured).toBeDefined()
    const payloadHex   = bytesToHex(captured!.report.rawReport.slice(REPORT_METADATA_HEADER_LENGTH))
    const expectedKey  = keccak256(encodeAbiParameters(parseAbiParameters('string, uint256'), ['NBA', 401766123n]))
    const expectedPayload = encodeAbiParameters(parseAbiParameters('bytes32, uint8'), [expectedKey, 1])
    expect(payloadHex).toBe(expectedPayload)
  })

  // (b) Two sources return opposite outcomes: majority fails, writeReport not called.
  test('no_consensus: sources disagree, writeReport not called', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let writeReportCalls = 0
    mock.writeReport = (_input) => {
      writeReportCalls++
      return { txStatus: 'TX_STATUS_SUCCESS' }
    }

    let callIdx = 0
    const bodies = [scoreBody('110', '107'), scoreBody('107', '110')]
    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (_req) => httpBody(bodies[callIdx++ % 2])

    const result = JSON.parse(
      onSettlementRequested(makeRuntime() as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: 'Pacers at Thunder' },
      } as any),
    )

    expect(result.status).toBe('no_consensus')
    expect(result.outcomes).toEqual([1, 2])
    expect(writeReportCalls).toBe(0)
  })

  // (c) NFL tied game: outcomeScoreAllowDraw returns 3.
  test('NFL draw: equal scores allowed, writeReport called with outcome 3', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let captured: WriteReportMockInput | undefined
    mock.writeReport = (input) => {
      captured = input
      return { txStatus: 'TX_STATUS_SUCCESS' }
    }

    const httpMock    = HttpActionsMock.testInstance()
    httpMock.sendRequest = (_req) => httpBody(scoreBody('21', '21'))

    const runtime = makeRuntimeForSport('NFL', ['espn', 'espn'])

    const result = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 401836123n, sport: 'NFL', description: 'Chiefs at Eagles' },
      } as any),
    )

    expect(result.outcome).toBe(3)
    expect(captured).toBeDefined()
    const payloadHex   = bytesToHex(captured!.report.rawReport.slice(REPORT_METADATA_HEADER_LENGTH))
    const expectedKey  = keccak256(encodeAbiParameters(parseAbiParameters('string, uint256'), ['NFL', 401836123n]))
    const expectedPayload = encodeAbiParameters(parseAbiParameters('bytes32, uint8'), [expectedKey, 3])
    expect(payloadHex).toBe(expectedPayload)
  })

  // (d) NBA equal scores: per-source try/catch absorbs the data-corruption throw;
  //     all sources fail → all_sources_failed with the error in failures[].
  test('NBA equal scores: all_sources_failed with data corruption in failures', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (_req) => httpBody(scoreBody('110', '110'))

    const result = JSON.parse(
      onSettlementRequested(makeRuntime() as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: 'Pacers at Thunder' },
      } as any),
    )

    expect(result.status).toBe('all_sources_failed')
    expect(result.failures[0].error).toContain('Equal scores at completed=true is data corruption')
  })

  // (e) UCL FT level: both sources agree on 1-1 FT, outcome is Draw (3).
  test('UCL FT draw: outcome 3', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)
    mock.writeReport = (_input) => ({ txStatus: 'TX_STATUS_SUCCESS' })

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (_req) => httpBody(soccerBody('1', '1', 'FT'))

    const runtime = makeRuntimeForSport('UCL', ['espn', 'espn'])

    const result = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 700654321n, sport: 'UCL', description: 'Arsenal v Barca' },
      } as any),
    )

    expect(result.outcome).toBe(3)
  })

  // (f) UCL AET: home leads 2-1 after extra time, outcome is HomeWins (1).
  test('UCL AET home wins: outcome 1', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)
    mock.writeReport = (_input) => ({ txStatus: 'TX_STATUS_SUCCESS' })

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (_req) => httpBody(soccerBody('2', '1', 'AET'))

    const runtime = makeRuntimeForSport('UCL', ['espn', 'espn'])

    const result = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 700654321n, sport: 'UCL', description: 'Arsenal v Barca' },
      } as any),
    )

    expect(result.outcome).toBe(1)
  })

  // (g) UCL FT-Pens: 1-1 after 90 min, home wins 4-3 on penalties, outcome HomeWins (1).
  test('UCL FT-Pens: home wins shootout, outcome 1', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)
    mock.writeReport = (_input) => ({ txStatus: 'TX_STATUS_SUCCESS' })

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (_req) => httpBody(soccerBody('1', '1', 'FT-Pens', 4, 3))

    const runtime = makeRuntimeForSport('UCL', ['espn', 'espn'])

    const result = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 700654321n, sport: 'UCL', description: 'Arsenal v Barca' },
      } as any),
    )

    expect(result.outcome).toBe(1)
  })

  // (h) writeReport returns REVERTED: onSettlementRequested must throw.
  test('writeReport REVERTED: throws Settlement TX failed with errorMessage', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)
    mock.writeReport = (_input) => ({
      txStatus:     'TX_STATUS_REVERTED',
      errorMessage: 'AlreadySettled',
    })

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (_req) => httpBody(scoreBody('110', '107'))

    expect(() =>
      onSettlementRequested(makeRuntime() as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: 'Pacers at Thunder' },
      } as any),
    ).toThrow('Settlement TX failed: AlreadySettled')
  })
})

// ─── Provider body builders (duplicated from workflow.fetch.test.ts) ─────────
// scoreBody / soccerBody already defined above for the ESPN-only CP5 tests.

// Real TheSportsDB uses short status codes in strStatus ("FT"/"AET"/"PEN");
// strProgress is null. strStatus drives both completion and soccer shortDetail.
const tsdbScoreBody = (
  home:      string | null,
  away:      string | null,
  strStatus  = 'FT',
) => ({
  events: [{ intHomeScore: home, intAwayScore: away, strStatus }],
})

const tsdbSoccerBody = (
  home:        string | null,
  away:        string | null,
  strStatus    = 'FT',
  strProgress: string | null = null,
) => ({
  events: [{ intHomeScore: home, intAwayScore: away, strStatus, strProgress }],
})

const nbaStatsBody = (
  home:        number | null,
  away:        number | null,
  gameStatus   = 'Final',
) => ({
  resultSets: [
    {
      name:    'GameSummary',
      headers: ['GAME_ID', 'GAME_STATUS_TEXT', 'HOME_TEAM_ID'],
      rowSet:  [['0022400001', gameStatus, 1234]],
    },
    {
      name:    'LineScore',
      headers: ['GAME_ID', 'TEAM_ABBREVIATION', 'TEAM_ID', 'PTS'],
      // rowSet[0] = visitor (away), rowSet[1] = home
      rowSet:  [
        ['0022400001', 'IND', 5678, away],
        ['0022400001', 'OKC', 1234, home],
      ],
    },
  ],
})

const mlbOfficialBody = (
  homeRuns:          number,
  awayRuns:          number,
  abstractGameState  = 'Final',
  detailedState      = 'Final',
) => ({
  gameData: { status: { abstractGameState, detailedState, statusCode: 'F' } },
  liveData: { linescore: { teams: { home: { runs: homeRuns }, away: { runs: awayRuns } } } },
})

const nhlOfficialBody = (
  home:           number,
  away:           number,
  gameState       = 'OFF',
  lastPeriodType  = 'REG',
) => ({
  gameState,
  homeTeam:    { score: home },
  awayTeam:    { score: away },
  gameOutcome: { lastPeriodType },
})

// ─── CP6c2: Cross-provider settlement scenarios ───────────────
// Multi-provider IDs live in a JSON description; getProviderGameId pulls the
// per-provider id out of description.ids[provider]. httpMock routes by host so
// each provider returns its own body shape.

describe('onSettlementRequested — cross-provider scenarios', () => {
  const NBA_IDS = JSON.stringify({
    label: 'Lakers vs Celtics',
    ids:   { espn: '401766123', thesportsdb: '2098765', nba_stats: '0022400001' },
  })

  // (i) 2-provider happy: thesportsdb + espn both home wins → outcome 1.
  test('2-provider consensus (thesportsdb + espn): outcome 1, writeReport once', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let writeReportCalls = 0
    mock.writeReport = (_input) => { writeReportCalls++; return { txStatus: 'TX_STATUS_SUCCESS' } }

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (req) => {
      if (req.url.includes('espn.com'))        return httpBody(scoreBody('110', '107'))
      if (req.url.includes('thesportsdb.com')) return httpBody(tsdbScoreBody('110', '107'))
      throw new Error(`No mock for URL: ${req.url}`)
    }

    const runtime = makeRuntimeForSport('NBA', ['thesportsdb', 'espn'])
    const result  = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: NBA_IDS },
      } as any),
    )

    expect(result.outcome).toBe(1)
    expect(writeReportCalls).toBe(1)
  })

  // (ii) 3-provider consensus: espn + thesportsdb + nba_stats all home wins.
  test('3-provider consensus (espn + thesportsdb + nba_stats): outcome 1, writeReport once', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let writeReportCalls = 0
    mock.writeReport = (_input) => { writeReportCalls++; return { txStatus: 'TX_STATUS_SUCCESS' } }

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (req) => {
      if (req.url.includes('espn.com'))        return httpBody(scoreBody('110', '107'))
      if (req.url.includes('thesportsdb.com')) return httpBody(tsdbScoreBody('110', '107'))
      if (req.url.includes('stats.nba.com'))   return httpBody(nbaStatsBody(110, 107))
      throw new Error(`No mock for URL: ${req.url}`)
    }

    const runtime = makeRuntimeForSport('NBA', ['espn', 'thesportsdb', 'nba_stats'])
    const result  = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: NBA_IDS },
      } as any),
    )

    expect(result.outcome).toBe(1)
    expect(writeReportCalls).toBe(1)
  })

  // (iii) Disagreement at length 2: ESPN home, TSDB away → majority impossible.
  test('cross-provider disagreement: no_consensus, writeReport not called', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let writeReportCalls = 0
    mock.writeReport = (_input) => { writeReportCalls++; return { txStatus: 'TX_STATUS_SUCCESS' } }

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (req) => {
      if (req.url.includes('espn.com'))        return httpBody(scoreBody('110', '107')) // home wins → 1
      if (req.url.includes('thesportsdb.com')) return httpBody(tsdbScoreBody('107', '110')) // away wins → 2
      throw new Error(`No mock for URL: ${req.url}`)
    }

    const runtime = makeRuntimeForSport('NBA', ['espn', 'thesportsdb'])
    const result  = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: NBA_IDS },
      } as any),
    )

    expect(result.status).toBe('no_consensus')
    expect(result.outcomes).toEqual([1, 2])
    expect(writeReportCalls).toBe(0)
  })

  // (iv) Single survivor at 2: ESPN 500, TSDB home wins. Threshold is 2 against
  //      the configured count, so a lone survivor cannot reach majority.
  test('single survivor at 2 sources: no_consensus, writeReport not called', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let writeReportCalls = 0
    mock.writeReport = (_input) => { writeReportCalls++; return { txStatus: 'TX_STATUS_SUCCESS' } }

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (req) => {
      if (req.url.includes('espn.com'))        return httpBody(scoreBody('110', '107'), 500)
      if (req.url.includes('thesportsdb.com')) return httpBody(tsdbScoreBody('110', '107'))
      throw new Error(`No mock for URL: ${req.url}`)
    }

    const runtime = makeRuntimeForSport('NBA', ['espn', 'thesportsdb'])
    const result  = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: NBA_IDS },
      } as any),
    )

    expect(result.status).toBe('no_consensus')
    expect(result.outcomes).toEqual([1])
    expect(writeReportCalls).toBe(0)
  })

  // (v) 1-of-3 fails, 2 agree: TSDB 503, ESPN + nba_stats home wins → settle.
  test('1-of-3 fails, 2 agree: outcome 1, writeReport called', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let writeReportCalls = 0
    mock.writeReport = (_input) => { writeReportCalls++; return { txStatus: 'TX_STATUS_SUCCESS' } }

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (req) => {
      if (req.url.includes('espn.com'))        return httpBody(scoreBody('110', '107'))
      if (req.url.includes('thesportsdb.com')) return httpBody(tsdbScoreBody('110', '107'), 503)
      if (req.url.includes('stats.nba.com'))   return httpBody(nbaStatsBody(110, 107))
      throw new Error(`No mock for URL: ${req.url}`)
    }

    const runtime = makeRuntimeForSport('NBA', ['espn', 'thesportsdb', 'nba_stats'])
    const result  = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: NBA_IDS },
      } as any),
    )

    expect(result.outcome).toBe(1)
    expect(writeReportCalls).toBe(1)
  })

  // (vi) Plain-string description: thesportsdb has no providerGameId, so it is
  //      skipped (not failed). Only ESPN's outcome survives → length 1 cannot
  //      reach the configured threshold of 2.
  test('plain-string description: tsdb skipped, no_consensus, writeReport not called', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let writeReportCalls = 0
    mock.writeReport = (_input) => { writeReportCalls++; return { txStatus: 'TX_STATUS_SUCCESS' } }

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (req) => {
      if (req.url.includes('espn.com'))        return httpBody(scoreBody('110', '107'))
      if (req.url.includes('thesportsdb.com')) return httpBody(tsdbScoreBody('110', '107'))
      throw new Error(`No mock for URL: ${req.url}`)
    }

    const runtime = makeRuntimeForSport('NBA', ['espn', 'thesportsdb'])
    const result  = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: 'Lakers vs Celtics' },
      } as any),
    )

    expect(result.status).toBe('no_consensus')
    expect(result.outcomes).toEqual([1])
    expect(writeReportCalls).toBe(0)
  })

  // (vii) all_sources_failed: both providers return non-200.
  test('all_sources_failed: both providers non-200, failures has 2 entries', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let writeReportCalls = 0
    mock.writeReport = (_input) => { writeReportCalls++; return { txStatus: 'TX_STATUS_SUCCESS' } }

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (req) => {
      if (req.url.includes('espn.com'))        return httpBody(scoreBody('110', '107'), 500)
      if (req.url.includes('thesportsdb.com')) return httpBody(tsdbScoreBody('110', '107'), 503)
      throw new Error(`No mock for URL: ${req.url}`)
    }

    const runtime = makeRuntimeForSport('NBA', ['espn', 'thesportsdb'])
    const result  = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: NBA_IDS },
      } as any),
    )

    expect(result.status).toBe('all_sources_failed')
    expect(result.failures).toHaveLength(2)
    expect(writeReportCalls).toBe(0)
  })

  // (viii) NHL shootout end-to-end: ESPN Final/SO + nhl_official SO, home wins 4-3.
  test('NHL shootout: espn + nhl_official agree, outcome 1, writeReport called', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let writeReportCalls = 0
    mock.writeReport = (_input) => { writeReportCalls++; return { txStatus: 'TX_STATUS_SUCCESS' } }

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (req) => {
      if (req.url.includes('espn.com'))        return httpBody(scoreBody('4', '3', 'Final/SO'))
      if (req.url.includes('api-web.nhle.com')) return httpBody(nhlOfficialBody(4, 3, 'OFF', 'SO'))
      throw new Error(`No mock for URL: ${req.url}`)
    }

    const description = JSON.stringify({
      label: 'Bruins vs Leafs',
      ids:   { espn: '401700001', nhl_official: '2024020001' },
    })
    const runtime = makeRuntimeForSport('NHL', ['espn', 'nhl_official'])
    const result  = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 401700001n, sport: 'NHL', description },
      } as any),
    )

    expect(result.outcome).toBe(1)
    expect(writeReportCalls).toBe(1)
  })

  // (ix) MLB extra innings: ESPN "Final/10" + mlb_official "Final (10)", home 5-3.
  //      Validates FINAL_RE matches both the slash and space-paren formats.
  test('MLB extra innings: espn + mlb_official agree, outcome 1, writeReport called', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let writeReportCalls = 0
    mock.writeReport = (_input) => { writeReportCalls++; return { txStatus: 'TX_STATUS_SUCCESS' } }

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (req) => {
      if (req.url.includes('espn.com'))         return httpBody(scoreBody('5', '3', 'Final/10'))
      if (req.url.includes('statsapi.mlb.com')) return httpBody(mlbOfficialBody(5, 3, 'Final', 'Final (10)'))
      throw new Error(`No mock for URL: ${req.url}`)
    }

    const description = JSON.stringify({
      label: 'Yankees vs Red Sox',
      ids:   { espn: '401800001', mlb_official: '716453' },
    })
    const runtime = makeRuntimeForSport('MLB', ['espn', 'mlb_official'])
    const result  = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 401800001n, sport: 'MLB', description },
      } as any),
    )

    expect(result.outcome).toBe(1)
    expect(writeReportCalls).toBe(1)
  })

  // (x) NBA Stats UA path first in the lineup: validates the User-Agent
  //     injection path does not break dispatch wiring.
  test('NBA Stats UA path: nba_stats + espn agree, outcome 1, writeReport called', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const mock    = newSportsMarketV2Mock(SPORTS_MARKET, evmMock)
    mock.getGame  = (sport, espnId) => registeredUnsettled(sport, espnId)

    let writeReportCalls = 0
    mock.writeReport = (_input) => { writeReportCalls++; return { txStatus: 'TX_STATUS_SUCCESS' } }

    const httpMock = HttpActionsMock.testInstance()
    httpMock.sendRequest = (req) => {
      if (req.url.includes('stats.nba.com')) return httpBody(nbaStatsBody(110, 107))
      if (req.url.includes('espn.com'))      return httpBody(scoreBody('110', '107'))
      throw new Error(`No mock for URL: ${req.url}`)
    }

    const runtime = makeRuntimeForSport('NBA', ['nba_stats', 'espn'])
    const result  = JSON.parse(
      onSettlementRequested(runtime as any, {
        data: { espnId: 401766123n, sport: 'NBA', description: NBA_IDS },
      } as any),
    )

    expect(result.outcome).toBe(1)
    expect(writeReportCalls).toBe(1)
  })
})
