import {
  bytesToHex,
  ConsensusAggregationByFields,
  cre,
  getNetwork,
  identical,
  median,
  TxStatus,
  type HTTPSendRequester,
  type Runtime,
} from '@chainlink/cre-sdk'
import {
  type Address,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
} from 'viem'
import { z } from 'zod'
import {
  SportsMarketV2,
  type DecodedLog,
  type SettlementRequestedDecoded,
} from '../contracts/evm/ts/generated/SportsMarketV2'

// ─── Outcome constants ────────────────────────────────────────
const OUTCOME_HOME_WINS = 1
const OUTCOME_AWAY_WINS = 2
const OUTCOME_DRAW      = 3

// ─── Result shapes ────────────────────────────────────────────

interface ScoreResult {
  homeScore:   number
  awayScore:   number
  shortDetail: string
}

interface SoccerResult extends ScoreResult {
  shootoutHome: number
  shootoutAway: number
}

// ─── Provider types ───────────────────────────────────────────

export const PROVIDER_NAMES = [
  'espn', 'thesportsdb', 'nba_stats', 'mlb_official',
  'nhl_official', 'apisports', 'apifootball',
] as const
export type ProviderName = typeof PROVIDER_NAMES[number]

interface ProviderSpec {
  buildUrl(sport: string, gameId: string): string
  fetchScore?:    (req: HTTPSendRequester, url: string, gameId: string, headers: Record<string, string>) => ScoreResult
  fetchSoccer?:   (req: HTTPSendRequester, url: string, gameId: string, headers: Record<string, string>) => SoccerResult
  requiresApiKey: boolean
  secretId?:      string
}

// ─── Shared helpers ───────────────────────────────────────────

export const safeJsonStringify = (obj: unknown): string =>
  JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)

// ─── ESPN fetchers ────────────────────────────────────────────

/** @internal — exported for tests */
export const ESPN_SPORT_URLS: Partial<Record<string, string>> = {
  NBA: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary',
  MLB: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary',
  NHL: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary',
  NFL: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary',
  UCL: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/summary',
  WC:  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary',
}

export const fetchEspnScore = (
  sendRequester: HTTPSendRequester,
  url:           string,
  gameId:        string,
  headers:       Record<string, string>,
): ScoreResult => {
  const response = sendRequester
    .sendRequest({ url, method: 'GET', headers })
    .result()

  if (response.statusCode !== 200)
    throw new Error(`ESPN returned HTTP ${response.statusCode} for game ${gameId}`)

  const body = JSON.parse(Buffer.from(response.body).toString('utf-8'))

  const statusType: { completed?: boolean; shortDetail?: string } =
    body.header?.competitions?.[0]?.status?.type ?? {}

  if (statusType.completed !== true)
    throw new Error(`Game ${gameId} is not final`)

  const shortDetail = statusType.shortDetail ?? ''
  if (!shortDetail)
    throw new Error(`Missing shortDetail for game ${gameId}`)

  const competitors: Array<{ homeAway: string; score?: string }> =
    body.header?.competitions?.[0]?.competitors ?? []

  if (competitors.length < 2)
    throw new Error(`Unexpected competitor structure for game ${gameId}`)

  const home = competitors.find((c) => c.homeAway === 'home')
  const away = competitors.find((c) => c.homeAway === 'away')

  if (!home || !away)
    throw new Error(`Could not identify home/away for game ${gameId}`)
  if (!home.score || !away.score)
    throw new Error(`Missing score for game ${gameId}`)

  return {
    homeScore:   Number.parseInt(home.score, 10),
    awayScore:   Number.parseInt(away.score, 10),
    shortDetail,
  }
}

export const fetchEspnSoccer = (
  sendRequester: HTTPSendRequester,
  url:           string,
  gameId:        string,
  headers:       Record<string, string>,
): SoccerResult => {
  const response = sendRequester
    .sendRequest({ url, method: 'GET', headers })
    .result()

  if (response.statusCode !== 200)
    throw new Error(`ESPN returned HTTP ${response.statusCode} for game ${gameId}`)

  const body = JSON.parse(Buffer.from(response.body).toString('utf-8'))

  const statusType: { completed?: boolean; shortDetail?: string } =
    body.header?.competitions?.[0]?.status?.type ?? {}

  if (statusType.completed !== true)
    throw new Error(`Game ${gameId} is not final`)

  const shortDetail = statusType.shortDetail ?? ''
  if (!shortDetail)
    throw new Error(`Missing shortDetail for game ${gameId}`)

  const competitors: Array<{
    homeAway:       string
    score?:         string
    shootoutScore?: string
  }> = body.header?.competitions?.[0]?.competitors ?? []

  if (competitors.length < 2)
    throw new Error(`Unexpected competitor structure for game ${gameId}`)

  const home = competitors.find((c) => c.homeAway === 'home')
  const away = competitors.find((c) => c.homeAway === 'away')

  if (!home || !away)
    throw new Error(`Could not identify home/away for game ${gameId}`)
  if (!home.score || !away.score)
    throw new Error(`Missing score for game ${gameId}`)

  return {
    homeScore:    Number.parseInt(home.score,  10),
    awayScore:    Number.parseInt(away.score,  10),
    shortDetail,
    shootoutHome: home.shootoutScore != null ? Number.parseInt(home.shootoutScore, 10) : 0,
    shootoutAway: away.shootoutScore != null ? Number.parseInt(away.shootoutScore, 10) : 0,
  }
}

// ─── Aggregation configs ──────────────────────────────────────

const scoreAgg = ConsensusAggregationByFields<ScoreResult>({
  homeScore:   median,
  awayScore:   median,
  shortDetail: identical,
})

const soccerAgg = ConsensusAggregationByFields<SoccerResult>({
  homeScore:    median,
  awayScore:    median,
  shortDetail:  identical,
  shootoutHome: median,
  shootoutAway: median,
})

// ─── Outcome functions ────────────────────────────────────────

// Matches "Final", "Final/OT", "Final/SO", "Final/10", "Final (10)" but not
// "Finals"/"Finalized". \b stops a word char from immediately following "Final".
const FINAL_RE = /^Final\b/

const outcomeScoreNoDraw = (result: ScoreResult): number => {
  if (!FINAL_RE.test(result.shortDetail))
    throw new Error(`Unexpected shortDetail "${result.shortDetail}" (expected /^Final/)`)
  if (result.homeScore > result.awayScore) return OUTCOME_HOME_WINS
  if (result.awayScore > result.homeScore) return OUTCOME_AWAY_WINS
  throw new Error(
    `Equal scores at completed=true is data corruption: ${result.homeScore}-${result.awayScore} (shortDetail="${result.shortDetail}")`,
  )
}

const outcomeScoreAllowDraw = (result: ScoreResult): number => {
  if (!FINAL_RE.test(result.shortDetail))
    throw new Error(`Unexpected shortDetail "${result.shortDetail}" (expected /^Final/)`)
  if (result.homeScore > result.awayScore) return OUTCOME_HOME_WINS
  if (result.awayScore > result.homeScore) return OUTCOME_AWAY_WINS
  return OUTCOME_DRAW
}

const outcomeSoccer = (result: ScoreResult): number => {
  const r = result as SoccerResult
  const { homeScore, awayScore, shortDetail, shootoutHome, shootoutAway } = r

  if (shortDetail === 'FT') {
    if (homeScore > awayScore) return OUTCOME_HOME_WINS
    if (awayScore > homeScore) return OUTCOME_AWAY_WINS
    return OUTCOME_DRAW
  }

  if (shortDetail === 'AET') {
    if (homeScore > awayScore) return OUTCOME_HOME_WINS
    if (awayScore > homeScore) return OUTCOME_AWAY_WINS
    throw new Error(`AET ended level (${homeScore}-${awayScore}) — data should show penalty result`)
  }

  if (
    shortDetail === 'FT-Pens'   ||
    shortDetail === 'Pens'      ||
    shortDetail === 'FT (Pens)'
  ) {
    if (shootoutHome > shootoutAway) return OUTCOME_HOME_WINS
    if (shootoutAway > shootoutHome) return OUTCOME_AWAY_WINS
    throw new Error(
      `Penalty shootout ended level (${shootoutHome}-${shootoutAway}) — data error`,
    )
  }

  throw new Error(
    `Unrecognized soccer shortDetail: "${shortDetail}" — verify ESPN API string and update outcomeSoccer`,
  )
}

// ─── Aggregation helper ───────────────────────────────────────

export const applyAggregation = (
  outcomes:        number[],
  aggregationMode: 'majority' | 'unanimous',
  totalSources?:   number,
): number | null => {
  if (outcomes.length === 0) return null

  if (aggregationMode === 'unanimous') {
    return outcomes.every((o) => o === outcomes[0]) ? outcomes[0] : null
  }

  // Majority is computed against the configured source count, not just the
  // survivors. Otherwise a single surviving source would trivially win
  // consensus alone, defeating the purpose of multi-source aggregation.
  const n         = totalSources ?? outcomes.length
  const threshold = Math.floor(n / 2) + 1
  const counts    = new Map<number, number>()
  for (const o of outcomes) counts.set(o, (counts.get(o) ?? 0) + 1)
  for (const [outcome, count] of counts) {
    if (count >= threshold) return outcome
  }
  return null
}

// ─── Stub fetchers (replaced per-provider in CP6b/CP6c) ──────

const stubScore = (name: string) =>
  (_req: HTTPSendRequester, _url: string, gameId: string, _h: Record<string, string>): ScoreResult => {
    throw new Error(`${name}: fetchScore not yet implemented for game ${gameId}`)
  }

const stubSoccer = (name: string) =>
  (_req: HTTPSendRequester, _url: string, gameId: string, _h: Record<string, string>): SoccerResult => {
    throw new Error(`${name}: fetchSoccer not yet implemented for game ${gameId}`)
  }

// ─── TheSportsDB fetchers ────────────────────────────────────

interface TsdbEvent {
  intHomeScore?: string | null
  intAwayScore?: string | null
  strStatus?:    string | null
  strProgress?:  string | null
}

const SCORE_RE = /^\d+$/

const parseTsdbEvent = (body: unknown, gameId: string): TsdbEvent => {
  const ev = ((body as any)?.events ?? [])[0] as TsdbEvent | undefined
  if (!ev) throw new Error(`TheSportsDB: no event in response for game ${gameId}`)
  return ev
}

const tsdbScores = (ev: TsdbEvent, gameId: string) => {
  const rawHome = String(ev.intHomeScore ?? '')
  const rawAway = String(ev.intAwayScore ?? '')
  if (!SCORE_RE.test(rawHome) || !SCORE_RE.test(rawAway))
    throw new Error(`TheSportsDB: missing score for game ${gameId}`)
  return {
    homeScore: Number.parseInt(rawHome, 10),
    awayScore: Number.parseInt(rawAway, 10),
  }
}

export const fetchThesportsdbScore = (
  sendRequester: HTTPSendRequester,
  url:           string,
  gameId:        string,
  headers:       Record<string, string>,
): ScoreResult => {
  const response = sendRequester.sendRequest({ url, method: 'GET', headers }).result()

  if (response.statusCode !== 200)
    throw new Error(`TheSportsDB returned HTTP ${response.statusCode} for game ${gameId}`)

  const body = JSON.parse(Buffer.from(response.body).toString('utf-8'))
  const ev   = parseTsdbEvent(body, gameId)

  if (!TSDB_COMPLETE_STATUSES.has(ev.strStatus ?? ''))
    throw new Error(`TheSportsDB: game ${gameId} not final (status: ${ev.strStatus})`)

  return { ...tsdbScores(ev, gameId), shortDetail: 'Final' }
}

// TheSportsDB completion statuses. Real responses use short codes ("FT"/"AET"/
// "PEN") in strStatus, never "Match Finished" — the latter is kept as a safety net.
const TSDB_COMPLETE_STATUSES = new Set(['Match Finished', 'FT', 'AET', 'PEN'])

// Maps TheSportsDB strStatus to canonical soccer shortDetail. (strProgress is null
// in real responses; the FT/AET/PEN signal lives in strStatus — same field as the
// completion check above.)
// 'PEN' → 'FT-Pens': shootout scores are NOT present on the free tier.
// fetchThesportsdbSoccer returns shootoutHome/Away = 0; outcomeSoccer will throw
// (0 === 0) for 'FT-Pens' games, caught by the per-source try/catch. The
// outcome for that game then falls to other providers via majority aggregation.
const TSDB_SOCCER_PROGRESS: Partial<Record<string, string>> = {
  FT:  'FT',
  AET: 'AET',
  PEN: 'FT-Pens',
}

export const fetchThesportsdbSoccer = (
  sendRequester: HTTPSendRequester,
  url:           string,
  gameId:        string,
  headers:       Record<string, string>,
): SoccerResult => {
  const response = sendRequester.sendRequest({ url, method: 'GET', headers }).result()

  if (response.statusCode !== 200)
    throw new Error(`TheSportsDB returned HTTP ${response.statusCode} for game ${gameId}`)

  const body = JSON.parse(Buffer.from(response.body).toString('utf-8'))
  const ev   = parseTsdbEvent(body, gameId)

  if (!TSDB_COMPLETE_STATUSES.has(ev.strStatus ?? ''))
    throw new Error(`TheSportsDB: game ${gameId} not final (status: ${ev.strStatus})`)

  const shortDetail = TSDB_SOCCER_PROGRESS[ev.strStatus ?? '']
  if (!shortDetail)
    throw new Error(
      `TheSportsDB: unrecognized soccer status "${ev.strStatus}" for game ${gameId}`,
    )

  return { ...tsdbScores(ev, gameId), shortDetail, shootoutHome: 0, shootoutAway: 0 }
}

// ─── NBA Stats fetcher ────────────────────────────────────────

interface NbaResultSet {
  name:    string
  headers: string[]
  rowSet:  unknown[][]
}

const NBA_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export const fetchNbaStatsScore = (
  sendRequester: HTTPSendRequester,
  url:           string,
  gameId:        string,
  headers:       Record<string, string>,
): ScoreResult => {
  const requestHeaders = { ...headers, 'User-Agent': NBA_USER_AGENT }
  const response = sendRequester
    .sendRequest({ url, method: 'GET', headers: requestHeaders })
    .result()

  if (response.statusCode === 403)
    throw new Error(`nba_stats: User-Agent rejected for game ${gameId}`)
  if (response.statusCode !== 200)
    throw new Error(`nba_stats returned HTTP ${response.statusCode} for game ${gameId}`)

  const body       = JSON.parse(Buffer.from(response.body).toString('utf-8'))
  const resultSets = (body.resultSets ?? []) as NbaResultSet[]
  const findRS     = (name: string) => resultSets.find((rs) => rs.name === name)

  // ── Completion check (GameSummary) ────────────────────────────
  const gameSummary = findRS('GameSummary')
  if (!gameSummary || gameSummary.rowSet.length === 0)
    throw new Error(`nba_stats: missing GameSummary for game ${gameId}`)

  const statusCol = gameSummary.headers.indexOf('GAME_STATUS_TEXT')
  if (statusCol === -1)
    throw new Error(`nba_stats: missing GAME_STATUS_TEXT column for game ${gameId}`)

  const gameStatus = String(gameSummary.rowSet[0][statusCol] ?? '').trim()
  if (!/^Final/.test(gameStatus))
    throw new Error(`nba_stats: game ${gameId} not final (status: ${gameStatus})`)

  // ── Scores (LineScore) ────────────────────────────────────────
  const lineScore = findRS('LineScore')
  if (!lineScore)
    throw new Error(`nba_stats: missing LineScore resultSet for game ${gameId}`)
  if (lineScore.rowSet.length < 2)
    throw new Error(`nba_stats: LineScore has fewer than 2 rows for game ${gameId}`)

  const ptsCol = lineScore.headers.indexOf('PTS')
  if (ptsCol === -1)
    throw new Error(`nba_stats: missing PTS column in LineScore for game ${gameId}`)

  // rowSet[0] = visitor (away), rowSet[1] = home
  const visitorPts = lineScore.rowSet[0][ptsCol]
  const homePts    = lineScore.rowSet[1][ptsCol]
  const awayScore  = visitorPts == null ? NaN : Number.parseInt(String(visitorPts), 10)
  const homeScore  = homePts    == null ? NaN : Number.parseInt(String(homePts),    10)

  if (isNaN(homeScore) || isNaN(awayScore))
    throw new Error(`nba_stats: missing scores in LineScore for game ${gameId}`)

  return { homeScore, awayScore, shortDetail: gameStatus }
}

// ─── MLB Official fetcher ─────────────────────────────────────

export const fetchMlbOfficialScore = (
  sendRequester: HTTPSendRequester,
  url:           string,
  gameId:        string,
  headers:       Record<string, string>,
): ScoreResult => {
  const response = sendRequester.sendRequest({ url, method: 'GET', headers }).result()

  if (response.statusCode !== 200)
    throw new Error(`mlb_official returned HTTP ${response.statusCode} for game ${gameId}`)

  const body     = JSON.parse(Buffer.from(response.body).toString('utf-8'))
  const gameData = body.gameData
  if (!gameData?.status)
    throw new Error(`mlb_official: missing gameData.status for game ${gameId}`)

  const { abstractGameState, detailedState } = gameData.status
  if (abstractGameState !== 'Final')
    throw new Error(
      `mlb_official: game ${gameId} not final (state: ${detailedState ?? abstractGameState})`,
    )

  const teams = body.liveData?.linescore?.teams
  if (!teams?.home || !teams?.away)
    throw new Error(`mlb_official: missing linescore teams for game ${gameId}`)

  const homeRuns = teams.home.runs
  const awayRuns = teams.away.runs
  if (!Number.isInteger(homeRuns) || !Number.isInteger(awayRuns))
    throw new Error(`mlb_official: missing runs in linescore for game ${gameId}`)

  return { homeScore: homeRuns, awayScore: awayRuns, shortDetail: detailedState ?? 'Final' }
}

// ─── NHL Official fetcher ─────────────────────────────────────

const NHL_COMPLETE_STATES = new Set(['OFF', 'FINAL'])

export const fetchNhlOfficialScore = (
  sendRequester: HTTPSendRequester,
  url:           string,
  gameId:        string,
  headers:       Record<string, string>,
): ScoreResult => {
  const response = sendRequester.sendRequest({ url, method: 'GET', headers }).result()

  if (response.statusCode !== 200)
    throw new Error(`nhl_official returned HTTP ${response.statusCode} for game ${gameId}`)

  const body      = JSON.parse(Buffer.from(response.body).toString('utf-8'))
  const gameState = body.gameState
  if (!gameState)
    throw new Error(`nhl_official: missing gameState for game ${gameId}`)
  if (!NHL_COMPLETE_STATES.has(gameState))
    throw new Error(`nhl_official: game ${gameId} not final (gameState: ${gameState})`)

  const homeScore = body.homeTeam?.score
  const awayScore = body.awayTeam?.score
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore))
    throw new Error(`nhl_official: missing score for game ${gameId}`)

  const lastPeriodType = body.gameOutcome?.lastPeriodType
  const shortDetail =
    lastPeriodType === 'OT' ? 'Final/OT' :
    lastPeriodType === 'SO' ? 'Final/SO' :
    'Final'

  return { homeScore, awayScore, shortDetail }
}

// ─── Provider registry ────────────────────────────────────────
// Declared above configSchema so superRefine() can reference it.

/** @internal — exported for tests */
export const PROVIDER_REGISTRY: Record<ProviderName, ProviderSpec> = {
  espn: {
    buildUrl: (sport, gameId) => {
      const base = ESPN_SPORT_URLS[sport]
      if (!base) throw new Error(`ESPN: no URL configured for sport "${sport}"`)
      return `${base}?event=${gameId}`
    },
    fetchScore:    fetchEspnScore,
    fetchSoccer:   fetchEspnSoccer,
    requiresApiKey: false,
  },
  thesportsdb: {
    buildUrl:      (_sport, gameId) =>
      `https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=${gameId}`,
    fetchScore:    fetchThesportsdbScore,
    fetchSoccer:   fetchThesportsdbSoccer,
    requiresApiKey: false,
  },
  nba_stats: {
    buildUrl:      (_sport, gameId) =>
      `https://stats.nba.com/stats/boxscoresummaryv2?GameID=${gameId}`,
    fetchScore:    fetchNbaStatsScore,
    requiresApiKey: false,
  },
  mlb_official: {
    buildUrl:      (_sport, gameId) =>
      `https://statsapi.mlb.com/api/v1.1/game/${gameId}/feed/live`,
    fetchScore:    fetchMlbOfficialScore,
    requiresApiKey: false,
  },
  nhl_official: {
    buildUrl:      (_sport, gameId) =>
      `https://api-web.nhle.com/v1/gamecenter/${gameId}/landing`,
    fetchScore:    fetchNhlOfficialScore,
    requiresApiKey: false,
  },
  apisports: {
    buildUrl:      (_sport, gameId) =>
      `https://v1.american-football.api-sports.io/games?id=${gameId}`,
    fetchScore:    stubScore('apisports'),
    requiresApiKey: true,
    secretId:      'APISPORTS_KEY',
  },
  apifootball: {
    buildUrl:      (_sport, gameId) =>
      `https://v3.football.api-sports.io/fixtures?id=${gameId}`,
    fetchSoccer:   stubSoccer('apifootball'),
    requiresApiKey: true,
    secretId:      'APIFOOTBALL_KEY',
  },
}

// ─── Sport registry ───────────────────────────────────────────
// Declared above configSchema so superRefine() can reference it.

interface SportSpec {
  type:           'score' | 'soccer'
  aggregation:    any
  computeOutcome: (result: ScoreResult) => number
}

/** @internal — exported for tests and the dry-run script */
export const SPORT_REGISTRY = {
  NBA: { type: 'score',  aggregation: scoreAgg,  computeOutcome: outcomeScoreNoDraw    },
  MLB: { type: 'score',  aggregation: scoreAgg,  computeOutcome: outcomeScoreNoDraw    },
  NHL: { type: 'score',  aggregation: scoreAgg,  computeOutcome: outcomeScoreNoDraw    },
  NFL: { type: 'score',  aggregation: scoreAgg,  computeOutcome: outcomeScoreAllowDraw },
  UCL: { type: 'soccer', aggregation: soccerAgg, computeOutcome: outcomeSoccer         },
  WC:  { type: 'soccer', aggregation: soccerAgg, computeOutcome: outcomeSoccer         },
} as const satisfies Record<string, SportSpec>

// ─── Provider game-ID extraction ──────────────────────────────

export const getProviderGameId = (
  description: string,
  espnId:      bigint,
  provider:    ProviderName,
): string | null => {
  try {
    const parsed = JSON.parse(description) as {
      label?: string
      ids?:   Record<string, string | null>
    }
    if (parsed && typeof parsed === 'object' && parsed.ids && typeof parsed.ids === 'object') {
      const id = parsed.ids[provider]
      return typeof id === 'string' ? id : null
    }
  } catch {
    // plain-string description — V1 compat path
  }
  return provider === 'espn' ? espnId.toString() : null
}

// ─── Config schema ────────────────────────────────────────────
// PROVIDER_REGISTRY and SPORT_REGISTRY must be declared above this.

export const configSchema = z
  .object({
    evms: z
      .array(
        z.object({
          chainSelectorName:   z.string(),
          sportsMarketAddress: z.string(),
          gasLimit:            z.string().optional(),
        }),
      )
      .min(1),
    sportSources: z.record(
      z.string().min(1),
      z.array(z.enum(PROVIDER_NAMES)).min(2).max(8),
    ),
    aggregationMode: z.enum(['majority', 'unanimous']).default('majority'),
  })
  .superRefine((cfg, ctx) => {
    for (const [sport, providers] of Object.entries(cfg.sportSources)) {
      const sSpec = SPORT_REGISTRY[sport as keyof typeof SPORT_REGISTRY]
      if (!sSpec) continue
      for (const p of providers) {
        const pSpec  = PROVIDER_REGISTRY[p as ProviderName]
        const needed = sSpec.type === 'score' ? pSpec.fetchScore : pSpec.fetchSoccer
        if (!needed) {
          ctx.addIssue({
            code:    z.ZodIssueCode.custom,
            message: `Provider "${p}" does not support sport "${sport}" (kind: ${sSpec.type})`,
            path:    ['sportSources', sport],
          })
        }
      }
    }
  })

export type Config = z.infer<typeof configSchema>

// ─── Callback ─────────────────────────────────────────────────

export const onSettlementRequested = (
  runtime: Runtime<Config>,
  log:     DecodedLog<SettlementRequestedDecoded>,
): string => {
  const { espnId, sport, description } = log.data
  const config    = runtime.config
  const evmConfig = config.evms[0]

  const network = getNetwork({ chainFamily: 'evm', chainSelectorName: evmConfig.chainSelectorName })
  if (!network) throw new Error(`Network not found: ${evmConfig.chainSelectorName}`)

  const evmClient    = new cre.capabilities.EVMClient(network.chainSelector.selector)
  const sportsMarket = new SportsMarketV2(evmClient, evmConfig.sportsMarketAddress as Address)

  // ── On-chain pre-checks ─────────────────────────────────────
  const game = sportsMarket.getGame(runtime, sport, espnId)
  if (game.espnId === 0n)
    return safeJsonStringify({ status: 'not_registered', sport, espnId: espnId.toString() })
  if (game.settledAt !== 0n)
    return safeJsonStringify({
      status:    'already_settled',
      sport,
      espnId:    espnId.toString(),
      outcome:   game.outcome,
      settledAt: game.settledAt.toString(),
    })

  // ── Sport routing ───────────────────────────────────────────
  if (!(sport in SPORT_REGISTRY))
    throw new Error(`Unsupported sport: ${sport}`)

  const sSpec   = SPORT_REGISTRY[sport as keyof typeof SPORT_REGISTRY]
  const sources = config.sportSources[sport]
  if (!sources || sources.length === 0)
    throw new Error(`No data sources configured for sport: ${sport}`)

  runtime.log(`[${sport}/${espnId}] ${description}: fetching from ${sources.length} provider(s)`)

  // ── Per-provider fetch with fault isolation ─────────────────
  const httpClient     = new cre.capabilities.HTTPClient()
  const sourceOutcomes: number[] = []
  const sourceFailures: { provider: string; gameId: string; error: string }[] = []

  for (const provider of sources) {
    const providerGameId = getProviderGameId(description as string, espnId, provider)
    if (!providerGameId) {
      runtime.log(`[${sport}/${espnId}] ${provider}: no gameId in description — skipping`)
      continue
    }

    try {
      const pSpec   = PROVIDER_REGISTRY[provider]
      const fetchFn = sSpec.type === 'score' ? pSpec.fetchScore : pSpec.fetchSoccer
      // fetchFn existence guaranteed by configSchema.superRefine() at workflow init
      const headers: Record<string, string> = {}
      // TODO (CP7): resolve API keys for apisports / apifootball
      //   const key = runtime.getSecret({ id: pSpec.secretId! }).result().value
      //   headers[headerName] = key
      const url    = pSpec.buildUrl(sport, providerGameId)
      const result = httpClient
        .sendRequest(runtime, (req) => fetchFn!(req, url, providerGameId, headers), sSpec.aggregation)()
        .result()

      runtime.log(`[${sport}/${espnId}] ${provider}: ${JSON.stringify(result)}`)
      sourceOutcomes.push(sSpec.computeOutcome(result))
    } catch (err) {
      sourceFailures.push({ provider, gameId: providerGameId, error: String(err) })
      runtime.log(`[${sport}/${espnId}] ${provider} failed: ${err}`)
    }
  }

  if (sourceOutcomes.length === 0)
    return safeJsonStringify({
      status:   'all_sources_failed',
      sport,
      espnId:   espnId.toString(),
      failures: sourceFailures,
    })

  // ── Cross-source agreement ──────────────────────────────────
  const finalOutcome = applyAggregation(sourceOutcomes, config.aggregationMode, sources.length)
  if (finalOutcome === null)
    return safeJsonStringify({
      status:          'no_consensus',
      sport,
      espnId:          espnId.toString(),
      outcomes:        sourceOutcomes,
      aggregationMode: config.aggregationMode,
    })

  // ── Encode report (SportsMarketV2._processReport layout) ───
  const compositeKey = keccak256(
    encodeAbiParameters(parseAbiParameters('string, uint256'), [sport, espnId]),
  )
  const reportPayload = encodeAbiParameters(
    parseAbiParameters('bytes32, uint8'),
    [compositeKey, finalOutcome],
  )

  const resp = sportsMarket.writeReport(runtime, reportPayload, {
    gasLimit: evmConfig.gasLimit ?? '500000',
  })

  if (resp.txStatus !== TxStatus.SUCCESS)
    throw new Error(`Settlement TX failed: ${resp.errorMessage ?? resp.txStatus}`)

  return safeJsonStringify({
    espnId:       espnId.toString(),
    sport,
    outcome:      finalOutcome,
    compositeKey,
    txHash:       bytesToHex(resp.txHash ?? new Uint8Array(32)),
  })
}

// ─── Workflow init ────────────────────────────────────────────

export function initWorkflow(config: Config) {
  const evmConfig = config.evms[0]

  const network = getNetwork({
    chainFamily:       'evm',
    chainSelectorName: evmConfig.chainSelectorName,
  })
  if (!network) throw new Error(`Network not found: ${evmConfig.chainSelectorName}`)

  const evmClient    = new cre.capabilities.EVMClient(network.chainSelector.selector)
  const sportsMarket = new SportsMarketV2(evmClient, evmConfig.sportsMarketAddress as Address)

  return [cre.handler(sportsMarket.logTriggerSettlementRequested(), onSettlementRequested)]
}
