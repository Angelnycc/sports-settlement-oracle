// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";

/**
 * @title SportsMarketV2
 * @notice Prediction market resolver with sport-namespaced game IDs.
 *
 *         V2 improvements over V1:
 *           - Composite storage key: keccak256(abi.encode(sport, espnId))
 *             eliminates cross-sport ID collisions.
 *           - Explicit sport allowlist — requestSettlement reverts loudly
 *             on unknown sports rather than silently registering them.
 *           - Outcome enum includes Draw, valid for soccer at FT.
 *           - getAllowedSports() enumerates the live allowlist via _sportList.
 *
 *         Flow:
 *           1. Owner deploys with initial sport allowlist (e.g. ["NBA","UCL","WC"]).
 *           2. Any caller invokes requestSettlement(sport, espnId, description).
 *           3. Contract emits SettlementRequested, waking the CRE workflow.
 *           4. Workflow fetches from sport-specific APIs, reaches BFT consensus,
 *              and calls back via a cryptographically signed report.
 *           5. _processReport decodes (bytes32 compositeKey, uint8 outcome)
 *              and records the final outcome on-chain.
 */
contract SportsMarketV2 is ReceiverTemplate {

    // ── Enums ────────────────────────────────────────────────────────────────

    /**
     * @notice Draw is valid for soccer at FT; never valid after AET/penalties
     *         or for basketball. The workflow enforces this per-sport;
     *         _processReport accepts all three non-zero values unconditionally.
     */
    enum Outcome { Unresolved, HomeWins, AwayWins, Draw }

    // ── Structs ──────────────────────────────────────────────────────────────

    struct Game {
        string  sport;        // e.g. "NBA", "UCL", "WC"
        uint256 espnId;       // existence sentinel: 0 means not registered
        string  description;  // human-readable label, e.g. "France vs Argentina"
        Outcome outcome;      // Unresolved until _processReport writes it
        uint256 settledAt;    // 0 until resolved; doubles as settled-check sentinel
    }

    // ── State ────────────────────────────────────────────────────────────────

    /// @dev keccak256(abi.encode(sport, espnId)) → Game.
    ///      Workflow must compute the same key:
    ///      keccak256(encodeAbiParameters(['string','uint256'], [sport, espnId]))
    mapping(bytes32 => Game) public games;

    /// @dev sport name → allowed; updated atomically with _sportList.
    mapping(string => bool) public sportAllowed;

    /// @dev Parallel list kept in sync with sportAllowed for getAllowedSports().
    ///      swap-and-pop removal means order is not guaranteed after removes.
    string[] private _sportList;

    // ── Errors ───────────────────────────────────────────────────────────────

    error AlreadySettled(string sport, uint256 espnId);
    error UnknownSport(string sport);
    error GameNotRegistered(bytes32 key);
    error InvalidOutcome(uint8 outcome);

    // ── Events ───────────────────────────────────────────────────────────────

    /**
     * @dev sport is intentionally NOT indexed.
     *
     *      Solidity stores indexed dynamic types (string, bytes) as
     *      keccak256(value) in the topic — the original string is
     *      unrecoverable from the log. The CRE workflow needs the sport
     *      string to route API fetches, so it must be in the ABI-decoded
     *      non-indexed data section.
     *
     *      espnId IS indexed (uint256 survives indexing intact) to allow
     *      efficient per-game event filtering at the DON trigger level.
     */
    event SettlementRequested(uint256 indexed espnId, string sport, string description);
    event GameSettled(uint256 indexed espnId, string sport, Outcome outcome, uint256 settledAt);
    event SportAdded(string sport);
    event SportRemoved(string sport);

    // ── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param forwarder     Chainlink Forwarder address — cannot be zero.
     *                      Only this address may call onReport().
     * @param initialSports Initial allowlist, e.g. ["NBA", "UCL", "WC"].
     */
    constructor(address forwarder, string[] memory initialSports)
        ReceiverTemplate(forwarder)
    {
        for (uint256 i = 0; i < initialSports.length; i++) {
            _addSport(initialSports[i]);
        }
    }

    // ── Public write ─────────────────────────────────────────────────────────

    /**
     * @notice Request CRE to resolve a game's outcome.
     * @param sport       Allowlisted sport name, e.g. "WC".
     *                    Reverts with UnknownSport if not in allowlist.
     * @param espnId      ESPN event ID. Must be non-zero (0 is the
     *                    "not registered" sentinel used by _processReport).
     * @param description Human-readable label, e.g. "France vs Argentina".
     * @dev   Calling again for the same (sport, espnId) before settlement
     *        updates the description and re-emits SettlementRequested —
     *        this is intentional: it supports retry flows where the first
     *        workflow invocation failed (e.g. game was not yet final).
     *        Reverts only if the game is already settled (settledAt != 0).
     */
    function requestSettlement(
        string calldata sport,
        uint256 espnId,
        string calldata description
    ) external {
        if (!sportAllowed[sport]) revert UnknownSport(sport);
        bytes32 key = _gameKey(sport, espnId);
        if (games[key].settledAt != 0) revert AlreadySettled(sport, espnId);

        games[key] = Game({
            sport:       sport,
            espnId:      espnId,
            description: description,
            outcome:     Outcome.Unresolved,
            settledAt:   0
        });

        emit SettlementRequested(espnId, sport, description);
    }

    // ── Public read ──────────────────────────────────────────────────────────

    /**
     * @notice Read game state.
     *         outcome == Unresolved (0) means not yet settled.
     *         espnId == 0 in the returned struct means the game was never registered.
     */
    function getGame(string calldata sport, uint256 espnId)
        external view returns (Game memory)
    {
        return games[_gameKey(sport, espnId)];
    }

    /**
     * @notice Returns the current allowlist as a string array.
     *         Order is stable until removeSport is called;
     *         swap-and-pop means order may change after any removal.
     */
    function getAllowedSports() external view returns (string[] memory) {
        return _sportList;
    }

    // ── Owner admin ──────────────────────────────────────────────────────────

    /**
     * @notice Add a sport to the allowlist.
     *         Idempotent: no-ops silently if the sport is already present.
     *         NOTE: pair any addSport call with a workflow config update to add
     *         the sport's fetch URLs to sportSources — otherwise the workflow
     *         will throw when it tries to route the sport and finds no URLs.
     */
    function addSport(string calldata sport) external onlyOwner {
        if (sportAllowed[sport]) return;
        _addSport(sport);
    }

    /**
     * @notice Remove a sport from the allowlist.
     *         Idempotent: no-ops silently if the sport is not present.
     *         Does NOT retroactively affect games already registered under
     *         this sport — those can still be settled via _processReport.
     *         New requestSettlement calls for this sport will revert.
     */
    function removeSport(string calldata sport) external onlyOwner {
        if (!sportAllowed[sport]) return;
        sportAllowed[sport] = false;

        // Swap-and-pop: O(n) scan to find index, O(1) removal.
        // Acceptable for allowlists of <100 sports.
        uint256 len = _sportList.length;
        for (uint256 i = 0; i < len; i++) {
            if (keccak256(bytes(_sportList[i])) == keccak256(bytes(sport))) {
                _sportList[i] = _sportList[len - 1];
                _sportList.pop();
                break;
            }
        }
        emit SportRemoved(sport);
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    /// @dev Shared path for constructor and addSport to avoid code duplication.
    function _addSport(string memory sport) internal {
        sportAllowed[sport] = true;
        _sportList.push(sport);
        emit SportAdded(sport);
    }

    /**
     * @dev Composite key: keccak256(abi.encode(sport, espnId)).
     *
     *      ALWAYS use abi.encode, never abi.encodePacked, for composite keys
     *      involving dynamic types. abi.encodePacked("NB", 65) and
     *      abi.encodePacked("NBA", 5) produce identical bytes — abi.encode
     *      prefixes each dynamic type with its length, making them distinct.
     *
     *      The workflow must compute the identical value:
     *        keccak256(encodeAbiParameters(
     *          parseAbiParameters('string, uint256'),
     *          [sport, espnId]
     *        ))
     *      viem's encodeAbiParameters follows the ABI spec and matches
     *      Solidity's abi.encode for (string, uint256) tuples.
     */
    function _gameKey(string memory sport, uint256 espnId)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encode(sport, espnId));
    }

    /**
     * @dev Called by ReceiverTemplate.onReport() after Forwarder signature check.
     *
     *      Report layout (workflow must encode identically):
     *        abi.encode(bytes32 compositeKey, uint8 outcome)
     *
     *      compositeKey = keccak256(abi.encode(sport, espnId)) for the game.
     *      outcome: 1 = HomeWins, 2 = AwayWins, 3 = Draw.
     *
     *      Guards:
     *        - GameNotRegistered: espnId == 0 in storage (game never registered).
     *        - AlreadySettled: settledAt != 0 (idempotent double-settlement guard).
     *        - InvalidOutcome: outcome outside [1, 3].
     */
    function _processReport(bytes calldata report) internal override {
        (bytes32 compositeKey, uint8 outcome) = abi.decode(report, (bytes32, uint8));

        Game storage game = games[compositeKey];

        if (game.espnId == 0)       revert GameNotRegistered(compositeKey);
        if (game.settledAt != 0)    revert AlreadySettled(game.sport, game.espnId);
        if (outcome < 1 || outcome > 3) revert InvalidOutcome(outcome);

        game.outcome   = Outcome(outcome);
        game.settledAt = block.timestamp;

        emit GameSettled(game.espnId, game.sport, Outcome(outcome), block.timestamp);
    }
}
