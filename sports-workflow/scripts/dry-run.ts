/**
 * Dry-run the multi-provider sports oracle workflow against real APIs,
 * locally, without deploying to the DON. Shows the full reasoning trace
 * for a single game.
 *
 * Usage:
 *   bun run scripts/dry-run.ts <SPORT> <ESPN_ID> [DESCRIPTION_JSON]
 *
 * Examples:
 *   # NBA — Spurs at Thunder, 2026-05-30
 *   bun run scripts/dry-run.ts NBA 401873203 \
 *     '{"label":"SA @ OKC","ids":{"espn":"401873203","thesportsdb":"2478476"}}'
 *
 *   # UCL final — Arsenal vs PSG, 2026-05-30
 *   bun run scripts/dry-run.ts UCL 401862897 \
 *     '{"label":"PSG vs Arsenal","ids":{"espn":"401862897","thesportsdb":"2470477"}}'
 */

import {
  PROVIDER_REGISTRY,
  SPORT_REGISTRY,
  applyAggregation,
  getProviderGameId,
  type ProviderName,
} from '../workflow'

const SCRIPT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

const OUTCOME_LABELS: Record<number, string> = {
  0: 'Unresolved',
  1: 'HomeWins',
  2: 'AwayWins',
  3: 'Draw',
}

interface DryRunArgs {
  sport:       string
  espnId:      bigint
  description: string
}

const parseArgs = (): DryRunArgs => {
  const [sport, espnIdStr, description] = process.argv.slice(2)
  if (!sport || !espnIdStr) {
    console.error('Usage: bun run scripts/dry-run.ts <SPORT> <ESPN_ID> [DESCRIPTION_JSON]')
    console.error('Example: bun run scripts/dry-run.ts NBA 401873203 \'{"ids":{"espn":"401873203","thesportsdb":"2478476"}}\'')
    process.exit(1)
  }
  return {
    sport,
    espnId:      BigInt(espnIdStr),
    description: description ?? '',
  }
}

const loadConfig = async () => {
  const file = Bun.file('./config.staging.json')
  return JSON.parse(await file.text())
}

const indent = (text: string, n = 4) =>
  text.split('\n').map((l) => ' '.repeat(n) + l).join('\n')

const main = async () => {
  const { sport, espnId, description } = parseArgs()

  console.log('━'.repeat(72))
  console.log(`DRY RUN — sport=${sport} espnId=${espnId}`)
  console.log(`description: ${description || '(plain — espn fallback only)'}`)
  console.log('━'.repeat(72))

  const sSpec = SPORT_REGISTRY[sport as keyof typeof SPORT_REGISTRY]
  if (!sSpec) {
    console.error(`Sport "${sport}" not in SPORT_REGISTRY. Valid: ${Object.keys(SPORT_REGISTRY).join(', ')}`)
    process.exit(1)
  }

  const config = await loadConfig()
  const providers = config.sportSources[sport] as ProviderName[] | undefined
  if (!providers?.length) {
    console.error(`No sportSources for ${sport} in config.staging.json`)
    process.exit(1)
  }

  console.log(`\nSport type: ${sSpec.type}`)
  console.log(`Configured providers (${providers.length}): ${providers.join(', ')}`)
  console.log(`Majority threshold: ${Math.floor(providers.length / 2) + 1} of ${providers.length}\n`)

  const sourceOutcomes: number[] = []
  const sourceFailures: { provider: string; reason: string }[] = []

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i]
    const tag      = `[${i + 1}/${providers.length}] ${provider}`
    console.log('─'.repeat(72))

    const providerGameId = getProviderGameId(description, espnId, provider)
    if (!providerGameId) {
      console.log(`${tag} SKIPPED — no providerGameId in description for provider=${provider}`)
      sourceFailures.push({ provider, reason: 'no providerGameId' })
      continue
    }

    const pSpec   = PROVIDER_REGISTRY[provider]
    const fetchFn = sSpec.type === 'score' ? pSpec.fetchScore : pSpec.fetchSoccer
    if (!fetchFn) {
      console.log(`${tag} CONFIG ERROR — provider does not support sport kind ${sSpec.type}`)
      sourceFailures.push({ provider, reason: `does not support ${sSpec.type}` })
      continue
    }

    const url = pSpec.buildUrl(sport, providerGameId)
    console.log(`${tag}`)
    console.log(indent(`URL:    ${url}`))

    try {
      const t0       = Date.now()
      const response = await fetch(url, {
        method:  'GET',
        headers: { 'User-Agent': SCRIPT_USER_AGENT, Accept: 'application/json' },
      })
      const bodyBuf  = new Uint8Array(await response.arrayBuffer())
      const elapsed  = Date.now() - t0

      console.log(indent(`Status: ${response.status} (${elapsed}ms, ${bodyBuf.byteLength} bytes)`))

      // Synthetic requester returns the pre-fetched response when the fetcher
      // calls .result(). This lets us exercise the real fetcher code path.
      const synthetic = {
        sendRequest: () => ({
          result: () => ({ statusCode: response.status, body: bodyBuf }),
        }),
      }

      const result  = fetchFn(synthetic as any, url, providerGameId, {})
      console.log(indent(`Parsed: ${JSON.stringify(result)}`))

      const outcome = (sSpec.computeOutcome as any)(result)
      console.log(indent(`Outcome: ${outcome} (${OUTCOME_LABELS[outcome] ?? 'unknown'})`))
      sourceOutcomes.push(outcome)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.log(indent(`FAILED: ${reason}`))
      sourceFailures.push({ provider, reason })
    }
  }

  console.log('━'.repeat(72))
  console.log('AGGREGATION')
  console.log('━'.repeat(72))
  console.log(`Source outcomes:   ${JSON.stringify(sourceOutcomes)}`)
  console.log(`Source failures:   ${sourceFailures.length}`)
  if (sourceFailures.length > 0) {
    for (const f of sourceFailures) {
      console.log(indent(`${f.provider}: ${f.reason}`))
    }
  }

  if (sourceOutcomes.length === 0) {
    console.log(`\nResult: ALL_SOURCES_FAILED — would NOT write to chain`)
    return
  }

  const finalOutcome = applyAggregation(sourceOutcomes, 'majority', providers.length)
  console.log()

  if (finalOutcome === null) {
    console.log(`Result: NO_CONSENSUS — would NOT write to chain`)
    console.log(indent(`Reason: ${sourceOutcomes.length} surviving outcome(s) < threshold ${Math.floor(providers.length / 2) + 1}`))
  } else {
    console.log(`Result: WOULD SETTLE`)
    console.log(indent(`Outcome: ${finalOutcome} (${OUTCOME_LABELS[finalOutcome]})`))
    console.log(indent(`Would call: writeReport(encodeAbiParameters(['bytes32','uint8'], [compositeKey, ${finalOutcome}]))`))
  }
  console.log('━'.repeat(72))
}

main().catch((err) => {
  console.error('Dry-run crashed:', err)
  process.exit(1)
})
