Disperse.sol — Test Suite Documentation

Purpose
- Provide complete, readable context for the Foundry tests in `test/Disperse.t.sol`.
- Explain what each test validates, which branches are exercised, and why certain constraints are used (especially in fuzzing).

Environment
- Framework: Foundry (forge/anvil)
- Contract under test: `src/Disperse.sol`
- Run commands:
  - `forge build`
  - `forge test -vvv`
  - Coverage: `forge coverage --report summary` (or `--report lcov`)

Contract Summary (under test)
- Functions
  - `disperseEther(address[] recipients, uint256[] values)` — payable; sends ETH to each recipient via `call` and then refunds any leftover to `msg.sender`.
  - `disperseToken(IERC20 token, address[] recipients, uint256[] values)` — pulls tokens once via `transferFrom(sender→this, total)` then fans out with `transfer` per recipient.
- Errors
  - `NothingToSend`, `ArrayLengthMismatch`, `InvalidRecipient`, `InvalidAmount`, `InsufficientMsgValue`, `EthSendFailed`, `TransferFromFailed`, `TransferFailed`, `FeeOnTransferNotSupported`, `Reentrancy`.
- Events
  - `TransferOut(token, to, amount)` per leg, `BatchSent(token, sender, total, count)` summary.
- Helpers/guards
  - `_validateAndSum()` checks arrays and amounts; returns `(len, total)`.
  - `_safeSendETH()` uses low-level `call` and reverts with `EthSendFailed` on failure.
  - `_refundExcessETH()` refunds any leftover balance to `msg.sender` or reverts with `EthSendFailed` if refund fails.
  - `nonReentrant` minimal storage lock.

File Under Test
- `src/app/solidity/challenge-2/test/Disperse.t.sol`

Test Setup
- Deploys a fresh `Disperse` in `setUp()` and creates common actors: `alice` (sender), `bob`, `carol`.
- Re-declares events to use `vm.expectEmit` for event assertions.

ETH Path — Success Cases
- `testDisperseEther_Success_ExactNoRefund`
  - Sends exact `sum(values)` as `msg.value`.
  - Asserts per-leg `TransferOut` and summary `BatchSent` events.
  - Verifies recipients receive the exact amounts and the contract ends with zero balance (no refund path taken).
- `testDisperseEther_Success_WithRefund`
  - Sends `sum(values) + extra` to exercise the refund branch.
  - Verifies recipients receive correct amounts and contract ends with zero balance (leftover refunded to the sender).

ETH Path — Error Cases
- `testDisperseEther_Revert_NothingToSend`
  - Empty arrays → `NothingToSend`.
- `testDisperseEther_Revert_ArrayLengthMismatch`
  - Different array lengths → `ArrayLengthMismatch`.
- `testDisperseEther_Revert_InvalidRecipientZero`
  - Contains `address(0)` → `InvalidRecipient`.
- `testDisperseEther_Revert_InvalidAmountZero`
  - Contains zero amount → `InvalidAmount`.
- `testDisperseEther_Revert_InsufficientMsgValue`
  - `msg.value < sum(values)` → `InsufficientMsgValue(supplied, required)`.
- `testDisperseEther_Revert_EthSendFailed_OnRecipient`
  - Uses `RevertingReceiver` (reverts in `receive()`) as a recipient to force the low-level `call` to fail → `EthSendFailed(to, amount)`.
  - Demonstrates atomicity: entire batch reverts; no partial payouts.
- `testDisperseEther_Revert_EthSendFailed_OnRefund`
  - Uses `RefundRevertingSender`, which reverts in its `receive()` to simulate a refund failure → `EthSendFailed(sender, refund)`.
  - Batch reverts even after payout loop when refund fails.

ETH Path — Fuzz
- `testFuzz_DisperseEther_Succeeds(address a, address b, uint96 x, uint96 y, uint96 extra)`
  - Constraints:
    - `vm.assume(a != 0 && b != 0 && a != b)` to avoid trivial invalid inputs.
    - `vm.assume(a.code.length == 0 && b.code.length == 0)` to restrict to EOAs (contracts may reject ETH or have side effects).
    - `vm.assume(uint160(a) > 0xFF && uint160(b) > 0xFF)` to exclude precompiles (no code but can reject value transfers).
  - Bounds amounts to reasonable ranges and sends `sum + extra`.
  - Asserts balance deltas (not absolute balances) so random pre-existing balances don’t break the test.
  - Asserts the contract ends with zero balance (refund was processed when extra > 0).

ERC‑20 Path — Success & Events
- `testDisperseToken_Success_WithEvents`
  - Uses `MockERC20` and helper `_mintAndApprove()` to mint to `alice` and approve the `Disperse` contract.
  - Asserts `TransferOut` for each leg and `BatchSent` once.
  - Verifies recipients received the amounts and the contract does not retain tokens (drained to zero).

ERC‑20 Path — Error Cases
- `testDisperseToken_Revert_NothingToSend`
  - Empty arrays → `NothingToSend`.
- `testDisperseToken_Revert_ArrayLengthMismatch`
  - Different array lengths → `ArrayLengthMismatch`.
- `testDisperseToken_Revert_InvalidRecipientZero`
  - `address(0)` → `InvalidRecipient`.
- `testDisperseToken_Revert_InvalidAmountZero`
  - Zero amount → `InvalidAmount`.
- `testDisperseToken_Revert_TransferFromFailed_ReturnsFalse`
  - Uses `FalseTransferFromToken` which always returns `false` in `transferFrom` → `TransferFromFailed`.
- `testDisperseToken_Revert_FeeOnTransferNotSupported`
  - Uses `FeeOnTransferToken` which credits `value - fee` to the receiver on `transferFrom`.
  - The contract checks `after - before == total`; mismatch → `FeeOnTransferNotSupported`.
- `testDisperseToken_Revert_TransferFailed_ReturnsFalse`
  - Uses `FalseTransferToken` returning `false` from `transfer` → `TransferFailed`.

ERC‑20 Path — Fuzz
- `testFuzz_DisperseToken_Succeeds(uint8 count, uint96 a0, uint96 a1, uint96 a2)`
  - Randomizes 1–3 recipients with bounded positive amounts.
  - Uses `MockERC20` with large mint + approval.
  - Calls `disperseToken` and asserts:
    - Contract token balance returns to zero (no trapped tokens).
    - Each recipient’s balance increases by the requested amount.

Reentrancy Surface
- `testReentrancy_Guard_OnTokenTransfer`
  - Uses `ReentrantOnTransferToken`, whose `transfer()` tries to call `Disperse.disperseToken()` during the fan-out loop.
  - The `nonReentrant` guard in `Disperse` prevents re-entry (`_locked` storage flag).
  - Expectation: outer `disperseToken` reverts due to re-entrant inner call; test sets `vm.expectRevert()` and calls once.

Helper Contracts (Mocks)
- `RevertingReceiver` — reverts in `receive()` to simulate a recipient that rejects ETH; used to trigger `EthSendFailed` during payout.
- `RefundRevertingSender` — proxies a call to `disperseEther` and reverts in its `receive()`; used to trigger `EthSendFailed` during refund.
- `MockERC20` — minimal ERC‑20 with `mint`, `approve`, `transfer`, `transferFrom` for controlled behavior; base for the other mocks.
- `FalseTransferFromToken` — overrides `transferFrom` to always return `false`.
- `FalseTransferToken` — overrides `transfer` to always return `false`.
- `FeeOnTransferToken` — credits less than requested on `transferFrom`, simulating fee-on-transfer; used to ensure the contract rejects such tokens.
- `ReentrantOnTransferToken` — in `transfer()`, optionally attempts to call `disperseToken` again; validates the `nonReentrant` guard.

Type Casting Note
- The contract’s `IERC20` interface is declared inside `Disperse.sol`. Test mocks are concrete contracts, not declared as inheriting that exact interface. Solidity forbids explicit casts between unrelated contract types.
- The tests therefore pass the token as `IERC20(address(token))` (cast via address), which is allowed.

Coverage Notes
- `_validateAndSum()`
  - Covered branches: empty arrays, length mismatch, zero recipient, zero amount, and successful accumulation.
- `_safeSendETH()`
  - Covered both outcomes: success and failure (via `RevertingReceiver`).
- `_refundExcessETH()`
  - Covered: no refund path (exact value), refund path (extra value), and refund failure (via `RefundRevertingSender`).
- `disperseEther()`
  - Success with and without refund, event emissions, and reverts from validation and payout/refund legs.
- `disperseToken()`
  - Success path, `TransferFromFailed`, `FeeOnTransferNotSupported`, `TransferFailed`, and `Reentrancy` through `ReentrantOnTransferToken`.

Troubleshooting Fuzz Failures
- If you see failures due to unexpected balances, remember the test asserts deltas, not absolute balances.
- If the fuzzer picks precompile addresses (e.g., `0x…0001`), ETH sends will fail. The test excludes precompiles with `vm.assume(uint160(addr) > 0xFF)` and EOAs with `addr.code.length == 0`.

How This Suite Guarantees High Confidence
- Success + error + fuzzing + reentrancy coverage ensures behavior is correct across a wide input space and that every revert condition is exercised.
- Events are asserted where meaningful so off-chain consumers can rely on them.
- All temporary balances are drained (ETH and tokens), preventing trapped funds.

