// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// Simple batch balance reader for ERC-20 tokens
// via challenge docs (Approach 3): docs/challenges/challenge-1.md

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

contract BalanceReader {
    /// Returns ERC-20 balances for `owner` across `tokens` using a single call.
    /// Tolerates non-standard tokens (revert/missing method) by returning 0 for that index.
    function batchBalanceOf(
        address owner,
        address[] calldata tokens
    ) external view returns (uint256[] memory balances) {
        uint256 len = tokens.length;
        balances = new uint256[](len);
        for (uint256 i; i < len; ) {
            address token = tokens[i];
            uint256 bal = 0;
            if (token != address(0)) {
                // try/catch ensures non-standard tokens don't bubble up reverts
                try IERC20(token).balanceOf(owner) returns (uint256 r) {
                    bal = r;
                } catch {
                    bal = 0;
                }
            }
            balances[i] = bal;
            unchecked {
                ++i;
            }
        }
    }
}
