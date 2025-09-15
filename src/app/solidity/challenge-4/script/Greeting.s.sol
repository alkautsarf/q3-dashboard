// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Greeting} from "../src/Greeting.sol";

contract DeployGreeting is Script {
    /// @dev deployer address as feeReceiver and PERMIT2 address (same address accross arbitrum and mainnet)
    address feeReceiver = 0x899b0B8f77825c934fe55FF5e2652Bfb0D664337;
    address permit2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function run() external {
        // No need for vm.envUint or keys here
        vm.startBroadcast();

        bytes32 salt = keccak256(abi.encodePacked("greetingV2"));
        Greeting greeting = new Greeting{salt: salt}(feeReceiver, permit2);

        vm.stopBroadcast();

        console.log("Deployed Greeting at:", address(greeting));
    }
}