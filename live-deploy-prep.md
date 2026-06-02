# Live Deploy Prep — Sports Oracle

Generated during deploy-access wait window. Date context: ~end of May 2026.
Goal: two real completed games (NBA + UCL) with all per-provider IDs resolved,
real API responses cross-checked against fixtures.

Providers per game:
- ESPN (espnId)
- TheSportsDB (idEvent)
- NBA Stats (GAME_ID) — NBA only

---

## NBA candidate

- **Game:** San Antonio Spurs @ Oklahoma City Thunder (2026-05-30 ET / 2026-05-31 UTC)
- **espnId:** `401873203`
- **thesportsdb idEvent:** `2478476`
- **nba_stats GAME_ID:** ⚠️ UNRESOLVED — endpoint blocked from this environment (see note below)
- **Result:** Away SA **111**, Home OKC **103** — clean Final, no OT. Away win.

### JSON description
```
Away: San Antonio Spurs (SA), idAwayTeam 134879
Home: Oklahoma City Thunder (OKC), idHomeTeam 134887
Final: SA 111 - OKC 103 (away win, regulation)
Venue: Paycom Center
League: NBA 2025-2026 (idLeague 4387)
```

### Evidence — ESPN scoreboard listing (dates=20260530)
```
401873203 | SA @ OKC | Final | completed=true
```

### Evidence — ESPN summary (summary?event=401873203)
NOTE: the `.../scoreboard/<espnId>` path from the original prep prompt returns
`null`. The working endpoint is `.../summary?event=<espnId>`.
```json
{
  "status": {
    "id": "3",
    "name": "STATUS_FINAL",
    "state": "post",
    "completed": true,
    "description": "Final",
    "detail": "Final",
    "shortDetail": "Final"
  },
  "date": "2026-05-31T00:00Z",
  "teams": [
    { "homeAway": "home", "team": "Oklahoma City Thunder", "abbrev": "OKC", "score": "103" },
    { "homeAway": "away", "team": "San Antonio Spurs",     "abbrev": "SA",  "score": "111" }
  ]
}
```

### Evidence — TheSportsDB (searchevents.php?e=Oklahoma_City_Thunder_vs_San_Antonio_Spurs)
```json
{
  "idEvent": "2478476",
  "strEvent": "Oklahoma City Thunder vs San Antonio Spurs",
  "strEventAlternate": "San Antonio Spurs @ Oklahoma City Thunder",
  "strSeason": "2025-2026",
  "strHomeTeam": "Oklahoma City Thunder",
  "intHomeScore": "103",
  "strAwayTeam": "San Antonio Spurs",
  "intAwayScore": "111",
  "dateEvent": "2026-05-31",
  "idHomeTeam": "134887",
  "idAwayTeam": "134879",
  "strVenue": "Paycom Center",
  "strStatus": "FT",
  "strPostponed": "yes"
}
```

### ⚠️ FIXTURE-DIVERGENCE FLAGS (NBA)
1. **TheSportsDB status string is `"FT"`, not `"Match Finished"`.** The original
   prep prompt and any fixture asserting `strStatus === "Match Finished"` will
   NOT match this real response. Confirm what `workflow.ts` actually checks for
   TheSportsDB finality before deploy.
2. **Date convention differs:** ESPN buckets this game under ET date `2026-05-30`
   (`dates=20260530`), while both ESPN's `date` field and TheSportsDB's
   `dateEvent` report UTC `2026-05-31T00:00Z` / `2026-05-31`. Same game. Any
   date-based matching must account for the ET-vs-UTC rollover.
3. **`strPostponed: "yes"`** present on a completed game with final scores — looks
   like a stale/default TheSportsDB field, not an actual postponement (scores +
   FT status confirm it played). Flag so fixture logic doesn't treat it as a veto.

### 🚫 DEPLOY BLOCKER — nba_stats provider unreachable from this environment
- `workflow.ts:530` calls `https://stats.nba.com/stats/boxscoresummaryv2?GameID=${gameId}`.
- From this network, `stats.nba.com` **completes the TLS handshake** (valid
  `*.nba.com` cert, expires Sep 2026) **but then hangs at the HTTP layer** — no
  response body, request times out. Tested with full browser headers
  (User-Agent, Referer, Origin, x-nba-stats-origin, x-nba-stats-token): same hang.
- Akamai-fronted fallback `cdn.nba.com/static/json/staticData/scheduleLeagueV2.json`
  returns **HTTP 403**.
- Net effect: the `nba_stats` GAME_ID could NOT be resolved here, and the
  `boxscoresummaryv2` call may behave the same way from CRE DON node egress.
- **Decision needed before deploy:** confirm DON nodes can reach `stats.nba.com`.
  If not, NBA settlement (`config.*.json` NBA = ["espn","thesportsdb","nba_stats"])
  will silently degrade to 2-of-3 with `nba_stats` always erroring. ESPN +
  TheSportsDB alone agree on this game (111-103), so 2-provider consensus would
  still settle correctly — but verify the consensus threshold tolerates one
  provider hard-failing.
- **GAME_ID format for manual resolution (verify from a browser / allowed network):**
  NBA playoff GAME_IDs are 10 digits — `004` (playoffs) + `25` (2025-26 season)
  + `00` + round + matchup + game. Finals = round `4`, matchup `1`
  (e.g. game N → `00425004 0N`). Do NOT hardcode an unverified value.

### Connectivity evidence
```
$ curl -s -i "https://stats.nba.com/stats/scoreboardv2?...&GameDate=2026-05-30&LeagueID=00" [full browser headers] --max-time 30
(empty — no HTTP status line, connection hangs then times out)

$ curl -sv "https://stats.nba.com/stats/scoreboardv2?..." --max-time 15
* Connected to stats.nba.com (2600:141b:1c00:1584::1f51) port 443
* SSL connection using TLSv1.3 ... ALPN: server accepted http/1.1
* Server certificate: subject CN=*.nba.com; expire date Sep 15 2026
(hangs after handshake — no HTTP response)

$ curl -s "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json" -w "HTTP %{http_code}"
HTTP 403 | size 423 bytes
```

---

## 🔴 URGENT — ESPN URL is broken in the workflow (3 defects, deploy blocker)

The workflow's ESPN integration fails on ALL sports. Three independent defects:

### Defect 1 — Host `site2.api.espn.com` does NOT exist (NXDOMAIN)
All 6 ESPN URLs (`workflow.ts:67-72`) use host `site2.api.espn.com`. That host
does not resolve:
```
$ curl -sv "https://site2.api.espn.com/.../summary?event=401873203"
* Could not resolve host: site2.api.espn.com
$ nslookup site2.api.espn.com
** server can't find site2.api.espn.com: NXDOMAIN
```
Correct host is `site.api.espn.com` (no "2"), which resolves to Akamai:
```
$ nslookup site.api.espn.com  →  a1526.g1.akamai.net  23.223.209.25
```

### Defect 2 — URL form: path-segment returns 404, query-param returns 200
`PROVIDER_REGISTRY.espn.buildUrl` (`workflow.ts:512-516`) builds `${base}/${gameId}`.
Even on the CORRECT host, path-segment 404s; query-param `?event=` works:
```
HTTP 000 | site2 summary/<id>        (NXDOMAIN — host dead)
HTTP 000 | site2 summary?event=<id>  (NXDOMAIN — host dead)
HTTP 404 | site  summary/<id>        (path-segment NOT supported)
HTTP 200 | site  summary?event=<id>  (510 KB) ✅ ONLY working form
```

### Defect 3 — Response shape: data is under `.header.competitions[0]`, NOT top-level
`fetchEspnScore` (`workflow.ts:90-91,100-101`) and `fetchEspnSoccer`
(`workflow.ts:136-137,150`) read:
```js
body.status?.type ?? body.competitions?.[0]?.status?.type   // status
body.competitions?.[0]?.competitors                          // competitors
```
But the real `summary?event=` response nests everything one level down under
`.header`. Probe of the 200 response:
```json
{
  "top_level_status":       "ABSENT",
  "top_level_competitions": "ABSENT",
  "header_status_type": {
    "completed": true, "shortDetail": "Final", "name": "STATUS_FINAL"
  },
  "header_competitors": [
    { "homeAway": "home", "score": "103" },
    { "homeAway": "away", "score": "111" }
  ]
}
```
So the fetcher's existing fallback to `body.competitions[0]` never matches — the
real path is `body.header.competitions[0]`. With the current code, even after
fixing host+URL, `statusType` resolves to `{}` → `completed !== true` → throws
"not final". **Fetcher must read `.header.competitions[0]`.**

### Net: ESPN is fully non-functional until all 3 are patched
Confirms the URGENT hypothesis AND more (host was also wrong). Good news: the
correct endpoint returns the exact fields the (patched) fetcher needs — the
`shortDetail`/`completed`/`competitors[].{homeAway,score}` data is all present,
just one level deeper. Soccer shape to be re-verified during UCL prep below
(esp. `shootoutScore` field location).

---

## UCL candidate

- **Game:** Arsenal @ Paris Saint-Germain — **UEFA Champions League FINAL** (2026-05-30)
- **espnId:** `401862897`
- **thesportsdb idEvent:** `2470477`
- **Result:** 1-1 after extra time, **PSG win on penalties 4-3**. (PSG home, ARS away.)
- **Venue:** Puskás Aréna

### JSON description
```
Home: Paris Saint-Germain (PSG) — regulation/AET 1, shootout 4, winner=true
Away: Arsenal (ARS)            — regulation/AET 1, shootout 3, winner=false
Decided on penalties. ESPN status name STATUS_FINAL_PEN.
```

### Evidence — ESPN scoreboard listing (UCL, dates=20260530)
```
401862897 | ARS @ PSG | FT-Pens | completed=true | Arsenal at Paris Saint-Germain
```

### Evidence — ESPN summary (WORKING form: site.api + summary?event=, read .header.*)
**LITERAL shortDetail (verbatim):** `FT-Pens`  ✅ already in `outcomeSoccer` table
(`workflow.ts:229`) — no soccer shortDetail table patch needed for this value.
```json
{
  "header_shortDetail": "FT-Pens",
  "header_completed":   true,
  "header_status_name": "STATUS_FINAL_PEN",
  "competitors": [
    { "homeAway": "home", "score": "1", "shootoutScore": 4.0, "team": "PSG", "winner": true },
    { "homeAway": "away", "score": "1", "shootoutScore": 3.0, "team": "ARS", "winner": false }
  ]
}
```
Note: `shootoutScore` is a JSON **number** (4.0/3.0), not a string. `fetchEspnSoccer`
line 167-168 does `Number.parseInt(home.shootoutScore, 10)` — parseInt coerces the
number to a string first, so it still yields 4/3 correctly. Type annotation
(`shootoutScore?: string`) is a harmless lie; not a runtime bug.

### Evidence — TheSportsDB, ACTUAL workflow endpoint (lookupevent.php?id=2470477)
**LITERAL strStatus (verbatim):** `PEN`  **LITERAL strProgress (verbatim):** `null`
```json
{
  "idEvent": "2470477",
  "strEvent": "Paris Saint-Germain vs Arsenal",
  "strStatus": "PEN",
  "strProgress": null,
  "intHomeScore": "1",
  "intAwayScore": "1",
  "intHomeShootout": null,
  "intAwayShootout": null
}
```

### ⚠️ FIXTURE-DIVERGENCE FLAGS (UCL / soccer)
1. **TheSportsDB `strStatus` = `"PEN"`, NOT `"Match Finished"`.** Same root defect
   as NBA's `"FT"`. `fetchThesportsdbSoccer` (`workflow.ts:356`) throws immediately.
2. **`strProgress` is `null`.** The workflow maps penalty/AET via
   `TSDB_SOCCER_PROGRESS[ev.strProgress]` (`workflow.ts:359`) — but the FT/AET/PEN
   signal actually lives in **`strStatus`**, not `strProgress`. The data model is
   inverted vs the code's assumption. Even after fixing flag #1, this lookup
   returns undefined → throws "unrecognized soccer progress".
3. **TheSportsDB has NO shootout data** (`intHomeShootout`/`intAwayShootout` = null;
   free tier). So even with #1 and #2 fixed, TSDB cannot determine a penalty winner.

### 🔴 SECOND HARD FINDING — the UCL FINAL will NOT settle (2-provider majority + penalties)
Consensus math (`workflow.ts:724` → `applyAggregation(outcomes, "majority", sources.length)`,
`workflow.ts:261-262` → `n = totalSources`, `threshold = floor(n/2)+1`):
- UCL config = `["espn","thesportsdb"]` → `totalSources = 2` → **threshold = 2** (need BOTH).
- For this penalties final: ESPN resolves it (PSG, shootout 4-3) → 1 outcome.
  TheSportsDB cannot resolve a shootout (no data) → abstains/throws → 0 outcomes.
- `sourceOutcomes = [HOME_WINS]`, length 1; `threshold = 2`; `1 < 2` → returns `null`
  → **NO SETTLEMENT.** This is NOT fixed by the ESPN/TSDB patches.

This differs from the NBA case: NBA has 3 sources so ESPN+TSDB (2/3) still settle.
UCL with only 2 sources, where one structurally can't do shootouts, cannot reach
quorum on any penalty-decided match. **Decision needed (see Known Limitations).**

---

## ✅ PRE-DEPLOY PATCHES NEEDED (workflow.ts)

These are REQUIRED for EITHER game to settle. Without P4, even NBA fails to reach
2/3 (TSDB throws on "FT" + nba_stats unreachable → only ESPN → 1 < 2).

**P1 — ESPN host (NXDOMAIN).** `workflow.ts:67-72`: replace `site2.api.espn.com`
with `site.api.espn.com` in all 6 ESPN_SPORT_URLS. *(Critical: host does not exist.)*

**P2 — ESPN URL form.** `workflow.ts:515`: `buildUrl` returns `${base}/${gameId}`
(path-segment → 404). Change to query-param `${base}?event=${gameId}` (→ 200).

**P3 — ESPN response shape.** `fetchEspnScore` (`workflow.ts:90-91, 100-101`) and
`fetchEspnSoccer` (`workflow.ts:136-137, 150`) read top-level `body.status` /
`body.competitions[0]`. Real data is nested under `body.header.competitions[0]`.
Add/replace with the `.header.competitions[0]` path (status.type + competitors).

**P4 — TheSportsDB status check too narrow (BOTH basketball + soccer).**
`workflow.ts:325` and `workflow.ts:356` reject anything `!== 'Match Finished'`.
Real `strStatus` values are short codes: `"FT"` (NBA), `"PEN"` (UCL) — never
"Match Finished". Broaden to accept the real completion set (e.g. FT, AET, PEN;
keep "Match Finished" too for safety).

**P5 — TheSportsDB soccer status source.** `fetchThesportsdbSoccer` (`workflow.ts:359`)
derives shortDetail from `strProgress`, which is `null`. The FT/AET/PEN signal is
in `strStatus`. Re-point the `TSDB_SOCCER_PROGRESS` mapping at `strStatus` (and
reconcile with P4 so the same field drives both the finality check and the
shortDetail mapping).

Minor / optional:
- `fetchEspnSoccer` shootoutScore type annotation says `string`; real value is a
  number. parseInt handles both — cosmetic only.

---

## 📋 KNOWN LIMITATIONS (not patches — design/ops decisions)

**L1 — NBA Stats unreachable.** `stats.nba.com` hangs post-TLS from this env;
`cdn.nba.com` 403. NBA has 3 sources, so after P1-P4 the ESPN+TSDB 2/3 majority
settles NBA correctly; `nba_stats` simply abstains. GAME_ID left unresolved
(blocked here). Verify DON-node egress to stats.nba.com separately, but it is
NOT a blocker. *Correctly architected graceful degradation.*

**L2 — UCL penalty final cannot settle on 2 providers. DECISION NEEDED.**
As shown above, any penalty-decided UCL match cannot reach 2/2 quorum because
TheSportsDB free tier has no shootout data. Options:
  (a) **Pick a regulation (non-penalty) UCL match for the live demo** — e.g. a
      2026 semifinal leg with a decisive FT result; ESPN+TSDB would agree 2/2.
      (Semifinals are ~late Apr/early May 2026 — not yet pulled; can do on request.)
  (b) **Add a 3rd UCL source (apifootball = CP7)** so 2/3 can settle when TSDB
      abstains. Future work.
  (c) **Accept non-settlement as correct behavior** — the oracle returns "no
      consensus" rather than a wrong answer. Defensible, but not a "settled" demo.
Recommendation: for a clean live-deploy demo, use (a) a regulation match, OR
demo NBA (which settles 2/3 after patches) and document the UCL final as a
known 2-provider limitation.

---

## CP6.5 — Patches applied

Method: red→green discipline. Fixtures updated FIRST to match real API shapes,
tests run RED (30 fail / 45 pass) to prove the bugs, THEN P1-P5 applied to
`workflow.ts`, tests run GREEN (75 pass / 0 fail), typecheck clean.

### Patches to workflow.ts
| Patch | Location | Change |
|-------|----------|--------|
| **P1** | `ESPN_SPORT_URLS`, 6 entries | Host `site2.api.espn.com` → `site.api.espn.com` (the "2" host is NXDOMAIN). |
| **P2** | `PROVIDER_REGISTRY.espn.buildUrl` | URL form `${base}/${gameId}` → `${base}?event=${gameId}` (path-segment 404s; query-param 200s). |
| **P3** | `fetchEspnScore` + `fetchEspnSoccer` | Read status/competitors from `body.header?.competitions?.[0]` instead of top-level `body.status` / `body.competitions[0]`. Old non-existent fallback paths dropped; `.header` kept optional-chained. |
| **P4** | new `TSDB_COMPLETE_STATUSES` set + `fetchThesportsdbScore` + `fetchThesportsdbSoccer` | Completion check now `!TSDB_COMPLETE_STATUSES.has(ev.strStatus)` (set = {Match Finished, FT, AET, PEN}) instead of `!== 'Match Finished'`. "Match Finished" kept as safety net. |
| **P5** | `fetchThesportsdbSoccer` | Soccer shortDetail derived from `ev.strStatus` (not the always-null `ev.strProgress`); `TSDB_SOCCER_PROGRESS` keys unchanged (FT→FT, AET→AET, PEN→FT-Pens); error message reworded "soccer progress …strProgress" → "soccer status …strStatus". |

### Fixtures updated (workflow.fetch.test.ts AND workflow.settlement.test.ts)
Both files have parallel body builders; both were updated identically so the
end-to-end settlement tests (which run the real fetchers) stay green.
- `scoreBody` / `soccerBody`: wrapped real shape under `.header.competitions[0]`
  with `status.type` **nested inside** the competition (not a sibling). NOTE: the
  task's Step-1 sketch showed `{header:{status,competitions}}`, but the real API
  (verified) and P3 both require `header.competitions[0].status.type`, so fixtures
  match the real/P3 shape.
- `soccerBody`: `shootoutScore` arg type `string` → `number` (real value is `4.0`);
  caller `('1','1','FT-Pens','4','3')` → `(...,4,3)` in both files.
- `tsdbScoreBody`: default `strStatus` `'Match Finished'` → `'FT'`.
- `tsdbSoccerBody`: param order now `(home, away, strStatus='FT', strProgress=null)`
  — `strStatus` carries the result signal, `strProgress` defaults null.
- Direct-manipulation tests retargeted to `body.header.competitions[0].status.type.completed`.
- Inline ESPN error-path bodies (missing-shortDetail, missing-competitor) rewrapped
  under `.header.competitions[0]` (missing-competitor now uses a present competition
  with empty `competitors: []` so it reaches the competitor-count check, not the
  status check).

### Test assertions that needed updates (with reasoning)
1. **`fetchThesportsdbSoccer` "unrecognized" test** — renamed to "throws on
   completed status with no soccer-result mapping". After P4+P5 the only way to
   reach the mapping-failure branch is a status that IS complete but NOT in
   `TSDB_SOCCER_PROGRESS` — i.e. `'Match Finished'`. Expected message updated to
   `unrecognized soccer status "Match Finished"`.
2. **`fetchThesportsdbSoccer` "not final" test** — arg changed from
   `('0','0','FT','Live')` (old: strProgress=FT, strStatus=Live) to `('0','0','Live')`
   (new: strStatus=Live) to match the new param order. Expected message unchanged.

### Final results
- `bun test`: **75 pass / 0 fail** (108 expect() calls) — same test count as before; no tests added/removed.
- `bun run typecheck` (`tsc --noEmit`): **clean**.
- Red baseline before patches (fixtures only): 30 fail / 45 pass — confirms the patches fix real bugs, not tautological tests.

### Diff
```
workflow.fetch.test.ts      | 84 +++++++-----------
workflow.settlement.test.ts | 39 ++++++------
workflow.ts                 | 38 +++++------
3 files changed, 95 insertions(+), 66 deletions(-)
```
workflow.ts net: +1 line (added `TSDB_COMPLETE_STATUSES` + comments, removed an
ESPN fallback expression).

### Nothing surfaced beyond the 5 patches
- `shootoutScore` number-vs-string: confirmed cosmetic only — `Number.parseInt`
  coerces the number; the fetcher reads from an `any` JSON body so no typecheck
  impact. Left as-is per the patch plan.
- L1 (NBA Stats unreachable) and L2 (UCL penalty-final 2-provider non-settlement)
  remain Known Limitations, untouched (out of CP6.5 scope).

---

