import { describe, expect, test } from 'bun:test'
import {
  fetchEspnScore,
  fetchEspnSoccer,
  fetchThesportsdbScore,
  fetchThesportsdbSoccer,
  fetchNbaStatsScore,
  fetchMlbOfficialScore,
  fetchNhlOfficialScore,
  ESPN_SPORT_URLS,
  PROVIDER_REGISTRY,
} from './workflow'

const makeSendRequester = (body: unknown, statusCode = 200) =>
  ({
    sendRequest: () => ({
      result: () => ({
        statusCode,
        body: Buffer.from(JSON.stringify(body)),
      }),
    }),
  }) as any

// ─── ESPN body builders ───────────────────────────────────────

// Real ESPN summary?event= responses nest everything under .header.competitions[0]
// (status.type + competitors), NOT at top level. Fixtures match that shape.
const scoreBody = (
  homeScore: string | undefined,
  awayScore: string | undefined,
  shortDetail = 'Final',
) => ({
  header: {
    competitions: [
      {
        status: { type: { completed: true, shortDetail } },
        competitors: [
          { homeAway: 'home', score: homeScore },
          { homeAway: 'away', score: awayScore },
        ],
      },
    ],
  },
})

// shootoutScore is a JSON number in real responses (e.g. 4.0), not a string.
const soccerBody = (
  homeScore: string | undefined,
  awayScore: string | undefined,
  shortDetail = 'FT',
  shootoutHome?: number,
  shootoutAway?: number,
) => ({
  header: {
    competitions: [
      {
        status: { type: { completed: true, shortDetail } },
        competitors: [
          { homeAway: 'home', score: homeScore, ...(shootoutHome != null ? { shootoutScore: shootoutHome } : {}) },
          { homeAway: 'away', score: awayScore, ...(shootoutAway != null ? { shootoutScore: shootoutAway } : {}) },
        ],
      },
    ],
  },
})

// ─── fetchEspnScore (NBA, MLB, NHL, NFL) ──────────────────────

describe('fetchEspnScore', () => {
  test('returns homeScore, awayScore, and shortDetail for a final game', () => {
    const result = fetchEspnScore(
      makeSendRequester(scoreBody('123', '107')),
      'https://espn.example/scoreboard/401766123',
      '401766123',
      {},
    )

    expect(result).toEqual({ homeScore: 123, awayScore: 107, shortDetail: 'Final' })
  })

  test('passes shortDetail through for overtime variants', () => {
    const result = fetchEspnScore(
      makeSendRequester(scoreBody('110', '108', 'Final/OT')),
      'https://espn.example/scoreboard/401766123',
      '401766123',
      {},
    )

    expect(result.shortDetail).toBe('Final/OT')
  })

  test('throws when ESPN returns non-200', () => {
    expect(() =>
      fetchEspnScore(
        makeSendRequester({ error: 'not found' }, 404),
        'https://espn.example/scoreboard/401766123',
        '401766123',
        {},
      ),
    ).toThrow('ESPN returned HTTP 404 for game 401766123')
  })

  test('throws when game is not yet final', () => {
    const body = scoreBody('12', '10', 'In Progress')
    body.header.competitions[0].status.type.completed = false as any

    expect(() =>
      fetchEspnScore(
        makeSendRequester(body),
        'https://espn.example/scoreboard/401766123',
        '401766123',
        {},
      ),
    ).toThrow('Game 401766123 is not final')
  })

  test('throws when shortDetail is missing', () => {
    expect(() =>
      fetchEspnScore(
        makeSendRequester({
          header: {
            competitions: [{
              status:      { type: { completed: true } },
              competitors: [{ homeAway: 'home', score: '5' }, { homeAway: 'away', score: '3' }],
            }],
          },
        }),
        'https://espn.example/scoreboard/401766123',
        '401766123',
        {},
      ),
    ).toThrow('Missing shortDetail for game 401766123')
  })

  test('throws when competitor structure is missing', () => {
    expect(() =>
      fetchEspnScore(
        makeSendRequester({ header: { competitions: [{ status: { type: { completed: true, shortDetail: 'Final' } }, competitors: [] }] } }),
        'https://espn.example/scoreboard/401766123',
        '401766123',
        {},
      ),
    ).toThrow('Unexpected competitor structure for game 401766123')
  })

  test('throws when home score is missing', () => {
    expect(() =>
      fetchEspnScore(
        makeSendRequester(scoreBody(undefined, '107')),
        'https://espn.example/scoreboard/401766123',
        '401766123',
        {},
      ),
    ).toThrow('Missing score for game 401766123')
  })
})

// ─── fetchEspnSoccer (UCL, WC) ────────────────────────────────

describe('fetchEspnSoccer', () => {
  test('returns scores, shortDetail, and zero shootout values for a FT result', () => {
    const result = fetchEspnSoccer(
      makeSendRequester(soccerBody('2', '1')),
      'https://espn.example/soccer/700123',
      '700123',
      {},
    )

    expect(result).toEqual({ homeScore: 2, awayScore: 1, shortDetail: 'FT', shootoutHome: 0, shootoutAway: 0 })
  })

  test('parses shootout scores when present', () => {
    const result = fetchEspnSoccer(
      makeSendRequester(soccerBody('1', '1', 'FT-Pens', 4, 3)),
      'https://espn.example/soccer/700123',
      '700123',
      {},
    )

    expect(result).toEqual({
      homeScore:    1,
      awayScore:    1,
      shortDetail:  'FT-Pens',
      shootoutHome: 4,
      shootoutAway: 3,
    })
  })

  test('throws when ESPN returns non-200', () => {
    expect(() =>
      fetchEspnSoccer(
        makeSendRequester({}, 503),
        'https://espn.example/soccer/700123',
        '700123',
        {},
      ),
    ).toThrow('ESPN returned HTTP 503 for game 700123')
  })

  test('throws when game is not yet final', () => {
    const body = soccerBody('0', '0')
    body.header.competitions[0].status.type.completed = false as any

    expect(() =>
      fetchEspnSoccer(
        makeSendRequester(body),
        'https://espn.example/soccer/700123',
        '700123',
        {},
      ),
    ).toThrow('Game 700123 is not final')
  })
})

// ─── TheSportsDB fixtures ─────────────────────────────────────

// Real TheSportsDB lookupevent responses use short status codes ("FT"/"AET"/"PEN")
// in strStatus, NOT "Match Finished". strProgress is null. The FT/AET/PEN signal
// that drives the soccer shortDetail lives in strStatus.
const tsdbScoreBody = (
  homeScore: string | null,
  awayScore: string | null,
  strStatus = 'FT',
) => ({
  events: [{
    intHomeScore: homeScore,
    intAwayScore: awayScore,
    strStatus,
  }],
})

const tsdbSoccerBody = (
  homeScore: string | null,
  awayScore: string | null,
  strStatus = 'FT',
  strProgress: string | null = null,
) => ({
  events: [{
    intHomeScore: homeScore,
    intAwayScore: awayScore,
    strStatus,
    strProgress,
  }],
})

// ─── fetchThesportsdbScore ────────────────────────────────────

describe('fetchThesportsdbScore', () => {
  test('returns homeScore, awayScore, and shortDetail="Final" for a finished game', () => {
    const result = fetchThesportsdbScore(
      makeSendRequester(tsdbScoreBody('112', '98')),
      'https://thesportsdb.example/lookupevent?id=900001',
      '900001',
      {},
    )

    expect(result).toEqual({ homeScore: 112, awayScore: 98, shortDetail: 'Final' })
  })

  test('throws when HTTP status is not 200', () => {
    expect(() =>
      fetchThesportsdbScore(
        makeSendRequester({}, 503),
        'https://thesportsdb.example/lookupevent?id=900001',
        '900001',
        {},
      ),
    ).toThrow('TheSportsDB returned HTTP 503 for game 900001')
  })

  test('throws when events array is empty', () => {
    expect(() =>
      fetchThesportsdbScore(
        makeSendRequester({ events: [] }),
        'https://thesportsdb.example/lookupevent?id=900001',
        '900001',
        {},
      ),
    ).toThrow('TheSportsDB: no event in response for game 900001')
  })

  test('throws when game is not finished', () => {
    expect(() =>
      fetchThesportsdbScore(
        makeSendRequester(tsdbScoreBody('50', '48', 'Not Started')),
        'https://thesportsdb.example/lookupevent?id=900001',
        '900001',
        {},
      ),
    ).toThrow('TheSportsDB: game 900001 not final (status: Not Started)')
  })

  test('throws when scores are missing (null)', () => {
    expect(() =>
      fetchThesportsdbScore(
        makeSendRequester(tsdbScoreBody(null, null)),
        'https://thesportsdb.example/lookupevent?id=900001',
        '900001',
        {},
      ),
    ).toThrow('TheSportsDB: missing score for game 900001')
  })
})

// ─── fetchThesportsdbSoccer ───────────────────────────────────

describe('fetchThesportsdbSoccer', () => {
  test('returns FT scores with zero shootout values for a finished FT match', () => {
    const result = fetchThesportsdbSoccer(
      makeSendRequester(tsdbSoccerBody('2', '1', 'FT')),
      'https://thesportsdb.example/lookupevent?id=800001',
      '800001',
      {},
    )

    expect(result).toEqual({ homeScore: 2, awayScore: 1, shortDetail: 'FT', shootoutHome: 0, shootoutAway: 0 })
  })

  test('maps AET strProgress to shortDetail "AET"', () => {
    const result = fetchThesportsdbSoccer(
      makeSendRequester(tsdbSoccerBody('3', '2', 'AET')),
      'https://thesportsdb.example/lookupevent?id=800001',
      '800001',
      {},
    )

    expect(result.shortDetail).toBe('AET')
    expect(result.homeScore).toBe(3)
  })

  test('maps PEN strProgress to shortDetail "FT-Pens" with zero shootout scores', () => {
    const result = fetchThesportsdbSoccer(
      makeSendRequester(tsdbSoccerBody('1', '1', 'PEN')),
      'https://thesportsdb.example/lookupevent?id=800001',
      '800001',
      {},
    )

    expect(result.shortDetail).toBe('FT-Pens')
    expect(result.shootoutHome).toBe(0)
    expect(result.shootoutAway).toBe(0)
  })

  // A completed status with no soccer-result mapping (e.g. "Match Finished",
  // accepted by P4 as complete but not in TSDB_SOCCER_PROGRESS) must throw.
  test('throws on completed status with no soccer-result mapping', () => {
    expect(() =>
      fetchThesportsdbSoccer(
        makeSendRequester(tsdbSoccerBody('1', '0', 'Match Finished')),
        'https://thesportsdb.example/lookupevent?id=800001',
        '800001',
        {},
      ),
    ).toThrow('TheSportsDB: unrecognized soccer status "Match Finished" for game 800001')
  })

  test('throws when game status is not a completion status', () => {
    expect(() =>
      fetchThesportsdbSoccer(
        makeSendRequester(tsdbSoccerBody('0', '0', 'Live')),
        'https://thesportsdb.example/lookupevent?id=800001',
        '800001',
        {},
      ),
    ).toThrow('TheSportsDB: game 800001 not final (status: Live)')
  })
})

// ─── NBA Stats fixtures ───────────────────────────────────────

const nbaStatsBody = (
  homeScore:   number | null,
  awayScore:   number | null,
  gameStatus   = 'Final',
) => ({
  resultSets: [
    {
      name:    'GameSummary',
      headers: ['GAME_ID', 'GAME_STATUS_TEXT', 'HOME_TEAM_ID'],
      rowSet:  [[gameStatus === 'Final' ? '0022400001' : '0022400001', gameStatus, 1234]],
    },
    {
      name:    'LineScore',
      headers: ['GAME_ID', 'TEAM_ABBREVIATION', 'TEAM_ID', 'PTS'],
      // rowSet[0] = visitor (away), rowSet[1] = home
      rowSet:  [
        ['0022400001', 'IND', 5678, awayScore],
        ['0022400001', 'OKC', 1234, homeScore],
      ],
    },
  ],
})

// ─── fetchNbaStatsScore ───────────────────────────────────────

describe('fetchNbaStatsScore', () => {
  test('returns homeScore and awayScore for a Final game', () => {
    const result = fetchNbaStatsScore(
      makeSendRequester(nbaStatsBody(119, 110)),
      'https://stats.nba.com/stats/boxscoresummaryv2?GameID=0022400001',
      '0022400001',
      {},
    )

    expect(result).toEqual({ homeScore: 119, awayScore: 110, shortDetail: 'Final' })
  })

  test('passes through "Final/OT" game status as shortDetail', () => {
    const result = fetchNbaStatsScore(
      makeSendRequester(nbaStatsBody(125, 122, 'Final/OT')),
      'https://stats.nba.com/stats/boxscoresummaryv2?GameID=0022400001',
      '0022400001',
      {},
    )

    expect(result.shortDetail).toBe('Final/OT')
  })

  test('throws HTTP 403 error', () => {
    expect(() =>
      fetchNbaStatsScore(
        makeSendRequester({}, 403),
        'https://stats.nba.com/stats/boxscoresummaryv2?GameID=0022400001',
        '0022400001',
        {},
      ),
    ).toThrow('nba_stats: User-Agent rejected for game 0022400001')
  })

  test('throws when game is not yet final', () => {
    expect(() =>
      fetchNbaStatsScore(
        makeSendRequester(nbaStatsBody(55, 48, '3rd Qtr')),
        'https://stats.nba.com/stats/boxscoresummaryv2?GameID=0022400001',
        '0022400001',
        {},
      ),
    ).toThrow('nba_stats: game 0022400001 not final (status: 3rd Qtr)')
  })

  test('throws when PTS column is missing from LineScore', () => {
    const body = {
      resultSets: [
        {
          name:    'GameSummary',
          headers: ['GAME_STATUS_TEXT'],
          rowSet:  [['Final']],
        },
        {
          name:    'LineScore',
          headers: ['GAME_ID', 'TEAM_ABBREVIATION'],
          rowSet:  [['001', 'IND'], ['001', 'OKC']],
        },
      ],
    }

    expect(() =>
      fetchNbaStatsScore(
        makeSendRequester(body),
        'https://stats.nba.com/stats/boxscoresummaryv2?GameID=0022400001',
        '0022400001',
        {},
      ),
    ).toThrow('nba_stats: missing PTS column in LineScore for game 0022400001')
  })
})

// ─── MLB Official fixtures ────────────────────────────────────

const mlbOfficialBody = (
  homeRuns:          number,
  awayRuns:          number,
  abstractGameState = 'Final',
  detailedState     = 'Final',
) => ({
  gameData: {
    status: { abstractGameState, detailedState, statusCode: 'F' },
  },
  liveData: {
    linescore: {
      teams: {
        home: { runs: homeRuns },
        away: { runs: awayRuns },
      },
    },
  },
})

// ─── fetchMlbOfficialScore ────────────────────────────────────

describe('fetchMlbOfficialScore', () => {
  test('returns homeScore, awayScore, and shortDetail for a Final game', () => {
    const result = fetchMlbOfficialScore(
      makeSendRequester(mlbOfficialBody(5, 3)),
      'https://statsapi.mlb.com/api/v1.1/game/716453/feed/live',
      '716453',
      {},
    )

    expect(result).toEqual({ homeScore: 5, awayScore: 3, shortDetail: 'Final' })
  })

  test('passes through "Final (10)" as shortDetail for extra-innings game', () => {
    const result = fetchMlbOfficialScore(
      makeSendRequester(mlbOfficialBody(4, 3, 'Final', 'Final (10)')),
      'https://statsapi.mlb.com/api/v1.1/game/716453/feed/live',
      '716453',
      {},
    )

    expect(result.shortDetail).toBe('Final (10)')
  })

  test('throws when HTTP status is not 200', () => {
    expect(() =>
      fetchMlbOfficialScore(
        makeSendRequester({}, 404),
        'https://statsapi.mlb.com/api/v1.1/game/716453/feed/live',
        '716453',
        {},
      ),
    ).toThrow('mlb_official returned HTTP 404 for game 716453')
  })

  test('throws when game is not final (abstractGameState != Final)', () => {
    expect(() =>
      fetchMlbOfficialScore(
        makeSendRequester(mlbOfficialBody(2, 1, 'Live', 'In Progress')),
        'https://statsapi.mlb.com/api/v1.1/game/716453/feed/live',
        '716453',
        {},
      ),
    ).toThrow('mlb_official: game 716453 not final (state: In Progress)')
  })

  test('throws when linescore home runs is missing', () => {
    const body = {
      gameData: { status: { abstractGameState: 'Final', detailedState: 'Final' } },
      liveData:  { linescore: { teams: { home: {}, away: { runs: 3 } } } },
    }

    expect(() =>
      fetchMlbOfficialScore(
        makeSendRequester(body),
        'https://statsapi.mlb.com/api/v1.1/game/716453/feed/live',
        '716453',
        {},
      ),
    ).toThrow('mlb_official: missing runs in linescore for game 716453')
  })
})

// ─── NHL Official fixtures ────────────────────────────────────

const nhlOfficialBody = (
  homeScore:     number,
  awayScore:     number,
  gameState      = 'OFF',
  lastPeriodType = 'REG',
) => ({
  gameState,
  homeTeam:    { score: homeScore },
  awayTeam:    { score: awayScore },
  gameOutcome: { lastPeriodType },
})

// ─── fetchNhlOfficialScore ────────────────────────────────────

describe('fetchNhlOfficialScore', () => {
  test('returns scores and shortDetail="Final" for a REG game (gameState=OFF)', () => {
    const result = fetchNhlOfficialScore(
      makeSendRequester(nhlOfficialBody(4, 3)),
      'https://api-web.nhle.com/v1/gamecenter/2024020001/landing',
      '2024020001',
      {},
    )

    expect(result).toEqual({ homeScore: 4, awayScore: 3, shortDetail: 'Final' })
  })

  test('returns shortDetail="Final/OT" for an OT game', () => {
    const result = fetchNhlOfficialScore(
      makeSendRequester(nhlOfficialBody(3, 2, 'OFF', 'OT')),
      'https://api-web.nhle.com/v1/gamecenter/2024020001/landing',
      '2024020001',
      {},
    )

    expect(result.shortDetail).toBe('Final/OT')
  })

  test('returns shortDetail="Final/SO" and correct winner for a shootout game', () => {
    // SO: winning team gets +1 in final score; 4 > 3 so home wins
    const result = fetchNhlOfficialScore(
      makeSendRequester(nhlOfficialBody(4, 3, 'OFF', 'SO')),
      'https://api-web.nhle.com/v1/gamecenter/2024020001/landing',
      '2024020001',
      {},
    )

    expect(result.shortDetail).toBe('Final/SO')
    expect(result.homeScore).toBeGreaterThan(result.awayScore)
  })

  test('accepts gameState="FINAL" as a completion signal', () => {
    const result = fetchNhlOfficialScore(
      makeSendRequester(nhlOfficialBody(2, 1, 'FINAL')),
      'https://api-web.nhle.com/v1/gamecenter/2024020001/landing',
      '2024020001',
      {},
    )

    expect(result.homeScore).toBe(2)
    expect(result.awayScore).toBe(1)
  })

  test('throws when gameState is "LIVE"', () => {
    expect(() =>
      fetchNhlOfficialScore(
        makeSendRequester(nhlOfficialBody(1, 0, 'LIVE')),
        'https://api-web.nhle.com/v1/gamecenter/2024020001/landing',
        '2024020001',
        {},
      ),
    ).toThrow('nhl_official: game 2024020001 not final (gameState: LIVE)')
  })

  test('throws when HTTP status is not 200', () => {
    expect(() =>
      fetchNhlOfficialScore(
        makeSendRequester({}, 404),
        'https://api-web.nhle.com/v1/gamecenter/2024020001/landing',
        '2024020001',
        {},
      ),
    ).toThrow('nhl_official returned HTTP 404 for game 2024020001')
  })

  test('throws when homeTeam.score is missing', () => {
    const body = {
      gameState:   'OFF',
      homeTeam:    {},
      awayTeam:    { score: 3 },
      gameOutcome: { lastPeriodType: 'REG' },
    }

    expect(() =>
      fetchNhlOfficialScore(
        makeSendRequester(body),
        'https://api-web.nhle.com/v1/gamecenter/2024020001/landing',
        '2024020001',
        {},
      ),
    ).toThrow('nhl_official: missing score for game 2024020001')
  })
})

// ─── Regression tests — CP6.5 patches (P1-P5) ─────────────────
// One test per patched bug. Each asserts the fix AND would fail on a revert.

describe('Regression tests — CP6.5 patches', () => {
  // R-P1: ESPN host must be site.api.espn.com, never the NXDOMAIN site2 host.
  test('R-P1: all ESPN_SPORT_URLS use site.api.espn.com (not site2)', () => {
    const urls = Object.values(ESPN_SPORT_URLS).filter((u): u is string => u != null)
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      expect(url).toContain('site.api.espn.com')
      expect(url).not.toContain('site2.api.espn.com')
    }
  })

  // R-P2: buildUrl must use ?event= query-param, not a trailing path-segment.
  test('R-P2: espn.buildUrl uses ?event= query-param form', () => {
    const url = PROVIDER_REGISTRY.espn.buildUrl('NBA', '401873203')
    expect(url).toContain('?event=401873203')
    expect(url).not.toMatch(/\/401873203$/)
  })

  // R-P3: fetcher reads header-nested shape only; top-level shape is rejected.
  test('R-P3: fetchEspnScore rejects top-level shape (no .header)', () => {
    const topLevelBody = {
      status:       { type: { completed: true, shortDetail: 'Final' } },
      competitions: [{ competitors: [
        { homeAway: 'home', score: '110' },
        { homeAway: 'away', score: '107' },
      ]}],
    }
    expect(() =>
      fetchEspnScore(makeSendRequester(topLevelBody), 'https://espn.example', 'g1', {}),
    ).toThrow('is not final')
  })

  test('R-P3: fetchEspnScore accepts header-nested shape', () => {
    const result = fetchEspnScore(
      makeSendRequester(scoreBody('110', '107')),
      'https://espn.example',
      'g1',
      {},
    )
    expect(result).toEqual({ homeScore: 110, awayScore: 107, shortDetail: 'Final' })
  })

  // R-P4: completion status set accepts real codes; rejects in-progress states.
  test('R-P4: fetchThesportsdbScore accepts all completion statuses', () => {
    for (const status of ['FT', 'AET', 'PEN', 'Match Finished']) {
      const result = fetchThesportsdbScore(
        makeSendRequester(tsdbScoreBody('10', '8', status)),
        'https://thesportsdb.example',
        'g1',
        {},
      )
      expect(result.homeScore).toBe(10)
    }
  })

  test('R-P4: fetchThesportsdbScore rejects non-completion statuses', () => {
    for (const status of ['Live', 'Not Started', 'In Progress', 'Postponed']) {
      expect(() =>
        fetchThesportsdbScore(
          makeSendRequester(tsdbScoreBody('10', '8', status)),
          'https://thesportsdb.example',
          'g1',
          {},
        ),
      ).toThrow(`not final (status: ${status})`)
    }
  })

  // R-P5: soccer reads strStatus; strProgress cannot override it.
  test('R-P5: fetchThesportsdbSoccer reads strStatus (PEN + null strProgress)', () => {
    const result = fetchThesportsdbSoccer(
      makeSendRequester(tsdbSoccerBody('1', '1', 'PEN')),
      'https://thesportsdb.example',
      'g1',
      {},
    )
    expect(result.shortDetail).toBe('FT-Pens')
  })

  test('R-P5: strProgress="FT" cannot override strStatus="Live"', () => {
    expect(() =>
      fetchThesportsdbSoccer(
        makeSendRequester(tsdbSoccerBody('1', '1', 'Live', 'FT')),
        'https://thesportsdb.example',
        'g1',
        {},
      ),
    ).toThrow('not final (status: Live)')
  })
})

// ─── Hardening — edge cases (E1-E7) ───────────────────────────

describe('Hardening — HTTP failures and robustness', () => {
  // Every fetcher, invoked with a failing status code, should surface that code.
  const httpFailCases: Array<{ label: string; run: (code: number) => unknown }> = [
    { label: 'fetchEspnScore',        run: (c) => fetchEspnScore(makeSendRequester({}, c), 'u', 'g', {}) },
    { label: 'fetchEspnSoccer',       run: (c) => fetchEspnSoccer(makeSendRequester({}, c), 'u', 'g', {}) },
    { label: 'fetchThesportsdbScore', run: (c) => fetchThesportsdbScore(makeSendRequester({}, c), 'u', 'g', {}) },
    { label: 'fetchThesportsdbSoccer',run: (c) => fetchThesportsdbSoccer(makeSendRequester({}, c), 'u', 'g', {}) },
    { label: 'fetchNbaStatsScore',    run: (c) => fetchNbaStatsScore(makeSendRequester({}, c), 'u', 'g', {}) },
    { label: 'fetchMlbOfficialScore', run: (c) => fetchMlbOfficialScore(makeSendRequester({}, c), 'u', 'g', {}) },
    { label: 'fetchNhlOfficialScore', run: (c) => fetchNhlOfficialScore(makeSendRequester({}, c), 'u', 'g', {}) },
  ]

  // E1 (429 rate-limit) + E2 (502/503/504 service-degraded).
  for (const code of [429, 502, 503, 504]) {
    for (const { label, run } of httpFailCases) {
      test(`E1/E2: ${label} surfaces HTTP ${code}`, () => {
        expect(() => run(code)).toThrow(String(code))
      })
    }
  }

  // E3: malformed JSON body (e.g. CDN returns HTML for a 502 but claims 200).
  test('E3: fetchEspnScore throws on malformed JSON body', () => {
    const badRequester = {
      sendRequest: () => ({
        result: () => ({ statusCode: 200, body: Buffer.from('not json {') }),
      }),
    } as any
    expect(() => fetchEspnScore(badRequester, 'u', 'g', {})).toThrow()
  })

  // E4: score robustness — string vs number scores both parse identically.
  test('E4: fetchEspnScore handles both string and number scores', () => {
    const numericBody = {
      header: { competitions: [{
        status:      { type: { completed: true, shortDetail: 'Final' } },
        competitors: [
          { homeAway: 'home', score: 110 },
          { homeAway: 'away', score: 107 },
        ],
      }]},
    }
    const fromString = fetchEspnScore(makeSendRequester(scoreBody('110', '107')), 'u', 'g', {})
    const fromNumber = fetchEspnScore(makeSendRequester(numericBody), 'u', 'g', {})
    expect(fromNumber).toEqual(fromString)
    expect(fromNumber).toEqual({ homeScore: 110, awayScore: 107, shortDetail: 'Final' })
  })

  // E5: NHL shootout winner convention (winning team has +1 in final score).
  test('E5: fetchNhlOfficialScore SO game — home (4) beats away (3)', () => {
    const result = fetchNhlOfficialScore(
      makeSendRequester(nhlOfficialBody(4, 3, 'OFF', 'SO')),
      'u',
      'g',
      {},
    )
    expect(result.shortDetail).toBe('Final/SO')
    expect(result.homeScore).toBeGreaterThan(result.awayScore)
  })

  // E6: both TSDB no-event paths (empty array and missing key) throw the same error.
  test('E6: fetchThesportsdbScore throws on empty events array', () => {
    expect(() =>
      fetchThesportsdbScore(makeSendRequester({ events: [] }), 'u', 'g', {}),
    ).toThrow('no event in response')
  })

  test('E6: fetchThesportsdbScore throws on missing events key', () => {
    expect(() =>
      fetchThesportsdbScore(makeSendRequester({}), 'u', 'g', {}),
    ).toThrow('no event in response')
  })

  // E7: unknown extra response fields must not break parsing (forward-compat).
  test('E7: fetchEspnScore ignores unknown extra fields', () => {
    const bodyWithExtras = {
      ...scoreBody('110', '107'),
      boxscore:    { teams: [] },
      gameSummary: { note: 'future field' },
      pickcenter:  [],
    }
    const result = fetchEspnScore(makeSendRequester(bodyWithExtras), 'u', 'g', {})
    expect(result).toEqual({ homeScore: 110, awayScore: 107, shortDetail: 'Final' })
  })
})
