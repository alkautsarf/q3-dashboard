# Challenge 4 — Greeting Wall (Gas-Lite Multi-Permit)

**Goal:** Extend `GreetingWall` to support greetings with **ETH**, **ERC-20 (via EIP-2612 or Permit2)**, or **free (non-premium)**.  
Messages are stored off-chain (via events) with only a hash on-chain → gas-efficient "Greeting Wall".

---

## Scope & Success Criteria

- **Greeting Input**
  - User enters greeting text.
  - Stored as `keccak256` hash on-chain + emitted as full string in event.
  - Off-chain tools (frontend, explorers) reconstruct full wall.

- **Payment Options**
  - **Free greeting** (non-premium): no ETH, no tokens.  
  - **ETH path** (`setGreetingETH`) payable.  
  - **ERC-20 path** (auto-selects):
    - **EIP-2612 permit** (native support).  
    - **Permit2 signatureTransfer** (fallback for tokens without EIP-2612).  
  - Premium = any non-zero fee (ETH or tokens).

- **Counters**
  - Global `totalCounter`.  
  - Per-user `userGreetingCounter`.  

- **Events**
  - `GreetingLogged(user, fullMessage, messageHash, premium, fee, token)`.  
  - `token == address(0)` for ETH.

- **Gas Efficiency**
  - Only hash stored in contract.  
  - Full greeting emitted via event (8 gas/byte).  
  - Minimal storage writes.

- **Done =**  
  Contract works with free greetings, ETH, and ERC-20 via either permit path.  
  Frontend auto-detects permit type; user only chooses **Free / ETH / ERC-20**.

---

## Architecture

```plaintext
src/
├─ app/
│  └─ challenge4/page.tsx             # Page shell with <GreetingWallUI />
│
├─ app/components/
│  ├─ GreetingForm.tsx                # Left card: connect, input, payment, button
│  ├─ GreetingHistory.tsx             # Right card: latest + scrollable past greetings
│  ├─ TokenSelector.tsx               # Dropdown for ERC-20 token input (allowlist + custom)
│  └─ Shared/GlassCard.tsx            # Wrapper for glassmorphic cards
│
├─ lib/
│  ├─ permitUtils.ts                  # Token validation, detect ERC-2612 vs Permit2, sign messages
│  ├─ greeting.ts                     # Wrappers for setGreetingETH / setGreetingWithPermit / free
│  └─ utils/validators.ts             # Input validation, ENS/address, amounts
│
contracts/
└─ Greeting.sol                   # Frozen contract (multi-path GreetingWall)
```

## Flow Diagram
```
User Input (GreetingForm)
   │
   ▼
Check Payment Method
   │
   ├─ Free → call setGreetingETH(msg.value=0)
   ├─ ETH → call setGreetingETH(msg.value>0)
   └─ ERC-20
        │
        ├─ Detect token supports permit()
        │     └─ Yes → sign EIP-2612 → call setGreetingWithPermit2612
        │
        └─ Otherwise
              └─ sign Permit2 → call setGreetingWithPermit2

   ▼
GreetingWall contract
   │
   └─ Emit GreetingLogged(user, text, hash, premium, fee, token)
        │
        ▼
Frontend (GreetingHistory) queries events → render latest + history
```

## State Diagram

The Greeting Wall follows a simple user-driven flow:
```
[Disconnected]
   │  Connect Wallet
   ▼
[Connected]
   │  Enter Greeting Text
   │  Choose Payment (Free / ETH / ERC-20)
   ▼
[SetGreeting Call]
   │  Contract validates + processes
   │  Emits GreetingLogged event
   ▼
[Updated Wall]
   │  Latest greeting displayed
   │  History pulled from events
   └─ Loop back (user can submit again)
```
---

## Mock UI 🎨

Two-column **glass-style** layout (consistent with Challenge 1 & 2).  
Left = user input. Right = latest greeting + history.

```plaintext
+------------------------------------------------+       +--------------------------------------+
| ✨ Greeting Wall (Left: User Form)              |       | 🕒 Greeting Wall (Right: History)    |
+------------------------------------------------+       +--------------------------------------+
| 🔑 [ Connect Wallet ]   🌐 [ Mainnet ▼ ]        |       | 📌 Latest Greeting                   |
| Connected as: vitalik.eth                      |       | "Hello World!" — vitalik.eth         |
|                                                |       | ⭐ Premium: YES (5 USDC)              |
| 📝 Greeting Message:                           |       +--------------------------------------+
| [ Hello World!                          ]      |       | 📜 History                           |
|                                                |       | - 0x1234… : "gm" (ETH 0.01)          |
| 💳 Payment Method:                             |       | - 0x5678… : "yo" (DAI 2.5)           |
|   (•) Free                                     |       | - 0x9abc… : "Hello" (USDC 10)        |
|   ( ) ETH                                      |       +--------------------------------------+
|   ( ) ERC-20                                   |
|                                                |
| 🪙 Token: [ Custom Address ▼ ]   Amount: [5.0] |
|                                                |
| [ 🖊 Sign Permit ]   [ 🚀 Set Greeting ]        |
|                                                |
| ⚠️ If using ERC-20 without EIP-2612 support:   |
|    → Show [ ✅ Approve Permit2 ] (one-time)     |
|    → After approval → [ 🖊 Sign Permit ] → [ 🚀 Set Greeting ] |
+------------------------------------------------+
```

## UI Guidelines

- **Layout**
  - Two glass cards side by side:
    - **Left (GreetingForm)**: connect wallet, enter greeting, select payment, set greeting.
    - **Right (GreetingHistory)**: latest greeting + scrollable history.

- **Payment Selector**
  - Options: **Free**, **ETH**, **ERC-20**.
  - If ERC-20 selected → show token dropdown (allowlist + custom address).
  - Frontend auto-detects token type:
    - **ERC-2612** → directly sign `permit` message (no approval).
    - **Non-2612** → fallback to Permit2:
      - Check allowance via `erc20.allowance(user, Permit2)`.
      - If allowance = 0 → prompt **[Approve Permit2]** (one-time tx per token).
      - After approval, always use signature flow (gasless).
  - Always inform user which permit path (2612 or Permit2) was used.

- **User Flow**
  1. Connect wallet + select network.
  2. Enter greeting text.
  3. Choose payment option:
     - **Free** → call `setGreetingETH` with `msg.value=0`.
     - **ETH** → call `setGreetingETH` with `msg.value > 0`.
     - **ERC-20**:
       - Detect ERC-2612 or Permit2.
       - If Permit2 + no allowance → show **Approve Permit2** first.
       - Then → user signs permit message → call corresponding contract function.
  4. Contract emits `GreetingLogged`.
  5. History updates from on-chain events (via viem).

- **Styling**
  - Must synchronize with the rest of the challenges:
    - Glassmorphic cards consistent with **Challenge 1** and **Challenge 2**.
    - Shared typography, spacing, and Tailwind theme as defined in `AGENTS.md`.
    - Keep structure flexible for future updates.

## Contract Notes

- **ETH Path**
  - Direct `msg.value` payment.
  - Forwards ETH to `FEE_RECEIVER`.
  - Logs greeting in event.

- **ERC-20 EIP-2612 Path**
  - User signs `permit()`.
  - Contract calls `transferFrom` → sends tokens to `FEE_RECEIVER`.
  - Logs greeting.

- **ERC-20 Permit2 Path**
  - User signs Permit2 message.
  - Contract calls `permitTransferFrom` → moves tokens in one tx.
  - Logs greeting.

- **Free Greeting**
  - Same as ETH path but with `msg.value=0`.

- **Storage**
  - Only `lastGreetingHash`, `totalCounter`, and per-user counters.
  - Greeting text not stored, only emitted → gas-lite design.

## Optimization Focus

- **Gas**
  - Single event stores full text, no string in storage.
  - Hash + counters only → minimal state writes.
  - Free greetings = cheapest path.

- **UX**
  - User only chooses **ETH / ERC-20 / Free**.
  - FE auto-detects ERC-2612 vs Permit2.
  - Permit signatures = gasless approval UX.

- **Safety**
  - Custom errors for invalid fee, wrong token, pull failure.
  - Hash check provides integrity for off-chain message reconstruction.
  - No re-entrancy risk (ETH is immediately forwarded).

- **Extensibility**
  - Can add leaderboards or filtering per-token in FE.
  - Contract already supports arbitrary ERC-20s.
  - Events make it indexer-friendly.

## Changelogs

- 2025-09-15
  - feat(ui/challenge4): Implement Greeting Wall page (`/challenge4`) with mobile‑friendly, glass‑style two‑card layout (GreetingForm + GreetingHistory). Arbitrum‑only selector with one‑click switch. Live history via `getLogs` + `useWatchContractEvent` (latest + scrollable past).
  - feat(erc20): Auto‑detect permit path per token. Prefer EIP‑2612 if supported; otherwise fallback to Permit2 signatureTransfer. Token selector with small Arbitrum allowlist + custom address.
  - fix(eip2612): Build correct EIP‑712 domain by validating against token’s `DOMAIN_SEPARATOR()`. Try `version()` then hard‑coded "2"/"1" to match on‑chain separator. If `PERMIT_TYPEHASH()` is non‑standard (e.g., DAI), fallback to Permit2.
  - fix(permit2): Construct Permit2 `PermitTransferFrom` typed‑data with required `spender` set to the Greeting contract address (matches `msg.sender` at execution). Use 256‑bit random `nonce` (unordered nonces) and deadline = latest block timestamp + 1 hour.
  - fix(permit2/allowance): Before signing, check `allowance(owner → Permit2, token)`. If insufficient, send a one‑time MAX approval to the token with Permit2 as spender, wait 1 confirmation, then sign + call. Also expose an explicit “Approve Permit2” button that renders only for non‑2612 tokens without MAX allowance.
  - fix(amount/decimals): Always refresh `decimals` and compute a single `fee = parseUnits(amount, decimals)` used consistently for signature and contract arguments to prevent mismatches.
  - chore(env): Read contract address from `NEXT_PUBLIC_C4_ADDRESS` (Arbitrum).
