// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {SportsMarketV2} from "../src/SportsMarketV2.sol";

/**
 * @title DeployV2Script
 * @notice Forge Script — deploys SportsMarketV2 with the Sepolia CRE Forwarder
 *         and an initial sport allowlist of ["NBA", "UCL", "WC"].
 *
 *         Run from contracts/evm/:
 *
 *           source ../../.env
 *           forge script script/DeployV2.s.sol \
 *             --broadcast \
 *             --private-key "$PRIVATE_KEY" \
 *             --rpc-url "$SEPOLIA_RPC_URL"
 *
 *         Dry-run (no broadcast, prints address simulation):
 *           forge script script/DeployV2.s.sol --rpc-url "$SEPOLIA_RPC_URL"
 *
 *         After deployment, update sports-workflow/config.staging.json:
 *           "sportsMarketAddress": "<address printed below>"
 *
 *         To add further sports without redeploying:
 *           cast send <ADDRESS> "addSport(string)" "MLB" \
 *             --private-key "$PRIVATE_KEY" --rpc-url "$SEPOLIA_RPC_URL"
 */
contract DeployV2Script is Script {

    /// @dev Sepolia CRE Forwarder — the only address ReceiverTemplate will
    ///      accept onReport() calls from. Update to the correct forwarder
    ///      address before deploying to any other network.
    address private constant SEPOLIA_CRE_FORWARDER =
        0xF8344CFd5c43616a4366C34E3EEE75af79a74482;

    function run() external {
        string[] memory sports = new string[](3);
        sports[0] = "NBA";
        sports[1] = "UCL";
        sports[2] = "WC";

        vm.startBroadcast();
        SportsMarketV2 market = new SportsMarketV2(SEPOLIA_CRE_FORWARDER, sports);
        vm.stopBroadcast();

        console.log("SportsMarketV2 deployed to:", address(market));
        console.log("Forwarder:                 ", SEPOLIA_CRE_FORWARDER);
        console.log("Initial sports:             NBA | UCL | WC");
        console.log("  sports[0]:", sports[0]);
        console.log("  sports[1]:", sports[1]);
        console.log("  sports[2]:", sports[2]);
    }
}
