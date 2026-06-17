# Sports Settlement Oracle

Multi-provider sports outcome settlement oracle on Chainlink CRE
(Chainlink Runtime Environment). Aggregates game data from five
independent providers via Byzantine fault-tolerant consensus and
writes verified outcomes to an Ethereum smart contract.

## What it does

Settles team-outcome (HomeWins / AwayWins / Draw) for completed
games across six leagues: NBA, MLB, NHL, NFL, UEFA Champions
League, FIFA World Cup. Refuses to settle on insufficient or
conflicting data — better to remain unsettled than to publish
a wrong answer.

## Architecture

- **Smart contract** (`contracts/evm/src/SportsMarketV2.sol`):
  deployed on Ethereum Sepolia, accepts signed reports via
  Chainlink's Forwarder pattern, sport-namespaced composite keys
  (`keccak256(abi.encode(sport, espnId))`) prevent cross-sport ID
  collisions.
- **Workflow** (`sports-workflow/workflow.ts`): TypeScript on
  Chainlink CRE SDK, multi-provider HTTP fetching with BFT
  consensus, per-source try/catch with structured failure logging,
  graceful degradation when individual providers fail.

## Providers per sport

| Sport | Sources | Official League API |
|-------|---------|---------------------|
| NBA | ESPN, TheSportsDB, NBA Stats | NBA Stats (semi-official) |
| MLB | ESPN, TheSportsDB, MLB.com | Yes (statsapi.mlb.com) |
| NHL | ESPN, TheSportsDB, NHL.com | Yes (api-web.nhle.com) |
| NFL | ESPN, TheSportsDB | No |
| UCL | ESPN, TheSportsDB | No |
| WC  | ESPN, TheSportsDB | No |

## Deployed contract

- Network: Ethereum Sepolia testnet
- Address: `0xc49680982be8ab475Ac643Ea4C1a7d78651562b9`
- Verified source: https://sepolia.etherscan.io/address/0xc49680982be8ab475Ac643Ea4C1a7d78651562b9#code

## Running tests

```
cd sports-workflow
bun install
bun test           # 117 tests, all passing
bun run typecheck  # exits 0
```

## Live dry-run

Exercises the real fetchers against real provider APIs locally,
no DON deployment needed:

```
bun run dry-run NBA 401873203 \
  '{"label":"SA @ OKC","ids":{"espn":"401873203","thesportsdb":"2478476"}}'
```

## Documentation

- `live-deploy-prep.md` — full investigation trail from live-API
  validation, including five real bugs surfaced and patched before
  deployment.

## Tech stack

Solidity · TypeScript · Chainlink CRE SDK · Viem · Zod · Bun ·
Foundry (cast) · Git
