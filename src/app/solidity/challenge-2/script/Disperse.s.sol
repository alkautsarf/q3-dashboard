// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Disperse} from "../src/Disperse.sol";

contract DeployDisperse is Script {
    function run() external {
        // No need for vm.envUint or keys here
        vm.startBroadcast();

        bytes32 salt = keccak256(abi.encodePacked("disperse"));
        Disperse disperse = new Disperse{salt: salt}();

        vm.stopBroadcast();

        console.log("Deployed Disperse at:", address(disperse));
    }
}