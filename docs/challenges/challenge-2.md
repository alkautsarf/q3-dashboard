# Challenge 2 — Multi-Send Tool (Frontend + Contract)

**Goal:** Build a terminal-style tool to send ETH or ERC-20 tokens to one or more recipients in a single transaction. Emphasize gas efficiency, safety, and clean UX.

---

## Scope & Success Criteria

- **Connection**
  - `/connect` opens RainbowKit and connects the wallet.
  - After connection, echo **ENS** (preferred) or raw address in the terminal.
  - `/disconnect` clears **all state** and returns to the connection step.

- **Token Selection**
  - `/token` to choose the asset:
    - `/` lists common allowlist tokens.
    - Or paste a custom ERC-20 contract address.
    - Native **ETH** supported.
  - UI must follow the rules in **AGENTS.md**.

- **Recipient Entry**
  - Supports **one or more recipients** (no minimum). 
  - Line format: `addressOrENS=amount`
    ```
    elpabl0.eth=0.001
    0x1234...=0.05
    ```
  - Each line adds a recipient row.
  - `/done` prints the receipt.
  - `/abort` resets to **token selection** (soft reset).
  - `/disconnect` resets everything (hard reset).

- **Receipt**
  - Show:
    - Token + symbol
    - Recipients with amounts
    - **Total** to send
    - **User balance** and **remaining** after send
    - **Gas comparison**: batch vs individual sends
  - Options: **Proceed / Edit / Abort** (←/→ keys).

- **Validation + Approval Gate**
  - **ETH & ERC-20**: sender **balance ≥ total** (preflight).
  - **ERC-20 approval gate (explicit):**
    - If `allowance(sender, token, contract) < total`, prompt user to approve:
      - Print spender (contract), token, and required amount.
      - On confirm, send approval tx and **wait 1 confirmation**, then **re-check allowance**.
      - If user **rejects** or approval **reverts/insufficient**, remain on **Receipt** and print reason (`ApprovalRejected`, `ApprovalFailed`, `AllowanceTooLow`), **do not** proceed.
    - Only when `allowance ≥ total` can the batch tx be sent.
  - Addresses validated (ENS → 0x). Use custom errors for invalid cases.

- **Transaction**
  - **Single call** per batch:
    - ETH → `disperseEther(recipients, values)` with `msg.value`.
    - ERC-20 → `disperseToken(token, recipients, values)` (after allowance passes the approval gate).
  - **Observability**:
    - Frontend can decode `TransferOut` (per recipient) and `BatchSent` (summary) from the receipt logs for progress/UI.
  - Track status: pending → success/fail.
  - Echo receipt + tx hash.

- **Gas Comparison**
  - Live estimates for:
    - **Batch** contract tx
    - **Individual** N txs
  - Estimates **recompute as recipients are added/edited** and again at confirmation.

- **Help**
  - `/help` lists: `/connect`, `/disconnect`, `/token`, `/done`, `/abort`, `/edit`, `/help`.

**Done =** Terminal flow works E2E for ETH & ERC-20 with correct validation, **explicit approval gate**, live gas estimates, and tx status.

---

## Architecture
```md
src/
├─ app/
│  └─ challenge2/page.tsx             # Page shell with <Terminal /> only
│
├─ app/components/
│  ├─ Terminal.tsx                    # Container: manages all state & orchestrates flow
│  ├─ CommandHandler.tsx              # Logic: parses commands, validation, ENS, balances
│  ├─ Receipt.tsx                     # “Dumb” presentational component (summary before send)
│  ├─ TxStatus.tsx                    # “Dumb” presentational component (tx updates)
│  └─ TerminalLog.tsx (optional)      # Scrollback log (history of user input + system output)
│
├─ lib/
│  ├─ portfolio.ts                    # Shared balance-fetching helpers (challenge1 reuse)
│  ├─ disperse.ts                     # Wrappers for contract interaction (sendNative, sendERC20)
│  └─ utils/validators.ts             # Address/ENS validation, amount checks
│
solidity/challenge-2/src
└─ Disperse.sol                      # Derived from Disperse, with safety checks & events
```

## Flow Diagram
```md
User Input (Terminal)
   │
   ▼
CommandHandler (parse & validate)
   │
   ├─ /connect → RainbowKit modal → update state
   ├─ /token   → set selected token (native/ERC20/custom)
   ├─ 0x…=amt  → add recipient row
   ├─ /done    → finalize → show Receipt
   ├─ /abort   → clear state → back to token selection
   ├─ /disconnect → full reset → back to wallet connect
   └─ /help    → print commands

   ▼
Receipt (summary)
   │
   ├─ If ERC-20 && allowance < total → Approval Gate:
   │     • Prompt approval (token, spender, amount)
   │     • On confirm: send approval tx → wait for 1 conf → re-check allowance
   │     • On reject/revert/insufficient: stay on Receipt, print reason
   │
   └─ If allowance ok (or ETH) → Proceed → call lib/disperse.ts → send batch tx
       │
       ▼
    TxStatus (pending → success/fail)
       │
       └─ Print gas comparison (batch vs indiv)
```
Note: For ERC-20, if allowance is insufficient during validation, prompt user to approve total first; then proceed with single batch tx.

## State Diagram
The terminal interface follows a finite state machine pattern.
Each state defines what input is valid and which transitions are possible.
```md
[Disconnected]
   │  /connect
   ▼
[Connected]
   │  echo ENS or address
   │  /token
   ▼
[TokenSelected]
   │  user enters "addr=amt"
   │  /done → move to Receipt
   │  /abort → reset to TokenSelected
   │  /disconnect → back to Disconnected
   ▼
[RecipientsAdded]
   │  build recipient list in real time
   │  print running receipt
   │  /done → Receipt
   │  /abort → reset to TokenSelected
   │  /disconnect → Disconnected
   ▼
[Receipt]
   │  preflight: balances, totals, gas estimates
   │  if ERC-20 && allowance < total → NeedsApproval
   │
   ├─ Proceed (ETH or allowance ok) → TxStatus
   ├─ Edit → back to RecipientsAdded
   └─ Abort → TokenSelected
   ▼
[NeedsApproval]
   │  prompt approval (spender, amount)
   │
   ├─ Confirm → AwaitingApprovalTx
   ├─ Reject  → back to Receipt (print ApprovalRejected)
   └─ /abort  → TokenSelected
   ▼
[AwaitingApprovalTx]
   │  wait for 1 confirmation
   │
   ├─ success → RecheckAllowance
   ├─ fail    → Receipt (print ApprovalFailed)
   └─ timeout/replaced → Receipt (print ApprovalUnknown)
   ▼
[RecheckAllowance]
   │  if allowance < total → Receipt (print AllowanceTooLow)
   │  else → Receipt (now Proceed is enabled)
   ▼
[TxStatus]
   │  print: pending → success/fail
   │  print: gas comparison (batch vs indiv)
   │  auto-return to TokenSelected after finish
```

## Contract Notes (updated)

- **ETH path (`disperseEther`)**
  - Uses low-level `call{value: amt}("")` for each recipient; reverts on failure with `EthSendFailed(to, amt)`.
  - Requires `msg.value ≥ total`; otherwise `InsufficientMsgValue(supplied, required)`.
  - Refunds any leftover ETH to `msg.sender` after the loop.
  - Emits per-leg `TransferOut(address(0), to, amount)` and a batch summary `BatchSent(address(0), sender, total, count)`.
  - No `receive()`/`fallback` implemented → direct ETH sends to the contract **revert** (prevents trapped funds).

- **ERC-20 path (`disperseToken`)**
  - **Single approval model**: user must `approve(contract, total)` first.
  - Pulls once via `transferFrom(sender → contract, total)`; reverts `TransferFromFailed()` on `false`.
  - Strictly **blocks fee-on-transfer** tokens by checking `balanceOf(this)` delta equals `total`; else `FeeOnTransferNotSupported()`.
  - Fans out with `transfer(to, value)` per recipient; reverts `TransferFailed()` on `false`.
  - Emits `TransferOut(token, to, amount)` per leg and `BatchSent(token, sender, total, count)` once.

- **Validation (shared)**
  - `_validateAndSum(recipients, values)` enforces:
    - Non-empty arrays; matching lengths → else `NothingToSend()` / `ArrayLengthMismatch()`
    - No zero recipients → `InvalidRecipient()`
    - No zero amounts → `InvalidAmount()`
    - Returns `(len, total)` used for preflight checks.

- **Reentrancy**
  - Minimal storage-based guard (`_locked`) with `nonReentrant` modifier; reverts `Reentrancy()` if re-entered.

- **Atomicity**
  - Any failed leg reverts the **entire** batch (ETH or ERC-20), ensuring all-or-nothing semantics.

## Optimization Focus

- **Gas**
  - Checked math for `total += amt` (safety); use `unchecked { ++i; }` only for the loop index.
  - One `transferFrom` pull for ERC-20, many `transfer` outs.
  - No persistent storage writes beyond the tiny reentrancy flag.

- **UX**
  - Terminal flow reduces clicks.
  - **Explicit approval gate** with clear outcomes (rejected, failed, insufficient).
  - Live gas comparison (batch vs individual) before sending.
  - Clear receipt and single tx status for the batch.

- **Safety**
  - No `receive()` prevents accidental deposits.
  - Strict return-value checks on ERC-20 `transfer/transferFrom`.
  - Fee-on-transfer tokens explicitly unsupported to keep accounting exact.

- **Extensibility**
  - Logic isolated in `CommandHandler` and `lib/` modules.
  - Presentational components (`Receipt`, `TxStatus`) are dumb → easy to re-skin.
  - Token allowlist + custom token address support.

---

## Changelogs

- 2025-09-12
  - Add comprehensive Foundry test suite for `src/app/solidity/challenge-2/src/Disperse.sol` at `src/app/solidity/challenge-2/test/Disperse.t.sol`.
    - Covers ETH path: success (exact, with refund), validation errors, recipient refund failure, and fuzzing.
    - Covers ERC‑20 path: success with events, `TransferFromFailed`, `TransferFailed`, `FeeOnTransferNotSupported`, and reentrancy surface via malicious token.
    - Adds robust fuzz constraints (EOA-only and exclude precompiles) and asserts balance deltas to avoid flaky cases.
    - Introduces helper mock tokens and receivers to exercise all branches.
  - Add test documentation at `src/app/solidity/challenge-2/docs/testing.md` explaining each case and coverage notes.
  - Adjust tests to pass tokens as `IERC20(address(token))` to match the interface declared in `Disperse.sol` and avoid invalid explicit casts.


