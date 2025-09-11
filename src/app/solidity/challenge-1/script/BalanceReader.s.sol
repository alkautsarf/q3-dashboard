// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BalanceReader} from "../src/BalanceReader.sol";

contract DeployBalanceReader is Script {
    function run() external {
        // No need for vm.envUint or keys here
        vm.startBroadcast();

        bytes32 salt = keccak256(abi.encodePacked("balance-reader-v1"));
        BalanceReader reader = new BalanceReader{salt: salt}();

        vm.stopBroadcast();

        console.log("Deployed BalanceReader at:", address(reader));
    }
}