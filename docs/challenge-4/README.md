# 📗 Challenge 4 — Greeting Wall

### Goal
A **gas-lite greeting wall** where users can post messages **Free**, with **ETH**, or with **ERC-20** using **EIP-2612 Permit** or **Permit2 signatureTransfer**.  
Only a **hash** of the message is stored on-chain; the **full message** is emitted via events and reconstructed off-chain.

---

## ✅ Scope & Success Criteria
- Post greetings through three paths: **Free**, **ETH**, **ERC-20 (Permit 2612 / Permit2)**.
- Contract stores **hash + counters**; frontend renders history from **events**.
- Auto-detects whether a token supports **EIP-2612**; otherwise falls back to **Permit2**.
- Clear UX for approvals/signatures; robust error surfacing.

---

## 🏗 Architecture
```
src/
├─ app/
│  ├─ challenge4/
│  │  └─ page.tsx                # Page shell: form + history
│  │
│  ├─ components/
│  │  ├─ GreetingForm.tsx        # Compose message, choose payment path
│  │  ├─ GreetingHistory.tsx     # Reads/streams GreetingLogged events
│  │  └─ TokenPicker.tsx         # ERC-20 selector (allowlist + custom)
│  │
│  ├─ lib/
│  │  ├─ greeting.ts             # Contract wrappers for all paths
│  │  ├─ permit.ts               # Detect EIP-2612 vs Permit2, build/sign payloads
│  │  ├─ tokens.ts               # Token metadata helpers (decimals/symbol/logo)
│  │  └─ formats.ts              # Hashing (keccak256), msg validation/sizing
│  │
│  └─ providers.tsx              # Wagmi + RainbowKit + React Query providers
│
└─ solidity/
└─ challenge-4/
└─ src/Greeting.sol        # Greeting Wall contract
```

---

## 🔄 Frontend Data Flow

1. **Compose**  
   - User types a message `text` (client trims, bounds length) → `hash = keccak256(text)`.
   - User chooses **Free**, **ETH**, or **ERC-20** (select token + amount).

2. **Path Selection & Prep**  
   - **Free** → no value, just call the ETH entrypoint with `msg.value = 0`.
   - **ETH** → parse input to wei; call with `msg.value = amount`.
   - **ERC-20** → **auto-detect permit path**:
     - **Try EIP-2612**: probe `DOMAIN_SEPARATOR()`, `nonces(owner)`, and `permit(...)` ABI; construct EIP-712 payload, **sign**, then call the 2612 entrypoint with signature.
     - **Else Permit2**: check `allowance(owner → Permit2, token)`; if 0, prompt **one-time** approval to **Permit2**; build **PermitTransferFrom** struct, **sign**, call Permit2 entrypoint.

3. **Contract Call**  
   - Submit the appropriate function (see **Smart Contract Integration**).
   - The contract **emits `GreetingLogged(...)`** including the **full message string**; only its **hash** is stored.

4. **History Rendering**  
   - Subscribe to or query **`GreetingLogged`** events.
   - Display newest first; verify integrity by comparing `keccak256(emittedMessage)` with on-chain `messageHash`.

---

## 🔗 Smart Contract Integration

- **Free / ETH**
  - `setGreetingETH(string message)` with `msg.value == 0` for free, or `> 0` for premium.
  - ETH is **forwarded** to the fee receiver inside the call.

- **EIP-2612**
  - Build EIP-712 typed data using token `name/symbol/chainId/contract` domain.
  - `permit(owner, spender, value, deadline, v, r, s)` is **validated on-chain**, then the contract pulls tokens and emits the greeting.

- **Permit2**
  - Ensure user has approved **Permit2** once for the token.
  - Sign **PermitTransferFrom** (amount, nonce, deadline), then call the Permit2 entrypoint which transfers the tokens and emits the greeting.

> Contract interface & parameters are documented in the contract README:  
> **[solidity/challenge-4/README.md](/src/app/solidity/challenge-4/README.md)**

---

## 🎨 UX / UI Notes
- **Inline path awareness** — the primary CTA updates to “Post Free”, “Post with ETH”, or “Post with TOKEN via Permit”.
- **Signature prompts** clearly label which standard is used (**2612** or **Permit2**), with a fallback note when 2612 probing fails.
- **Event-first history** — the wall updates optimistically from the tx, then confirms with the event stream.
- **Character bounds** — enforce a sane maximum (e.g., 280–500) to keep events light.

---

## 🧩 Permit Detection & Signing (Front-End)

1. **Detect EIP-2612**  
   - Safe optional reads for `DOMAIN_SEPARATOR()`, `nonces(owner)`, and `permit(...)`.
   - Some tokens have quirks (e.g., `DAI` style permit); helper handles ABI variants.
   - If any probe fails, **fallback to Permit2**.

2. **EIP-2612 Build & Sign**  
   - Domain: `{ name, version?, chainId, verifyingContract }`.
   - Types: `Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)`.
   - Sign with `walletClient.signTypedData(...)`; pass `(v, r, s)` to contract.

3. **Permit2 Build & Sign**  
   - Ensure `allowance(owner → Permit2, token)`; if 0 → **approve MAX** once.
   - Build `PermitTransferFrom` struct (token, amount, nonce, deadline).
   - Sign with `signTypedData` per Permit2 schema; pass signature bytes to contract.

---

## 🔒 Safety & Gas Considerations
- **Gas-lite**: message string is **not stored**, only `hash` is; the full text is in the **event**, reducing storage costs.
- **Immediate ETH forwarding** minimizes balance retention and reduces reentrancy surface.
- **Permit2 one-time approval** avoids repetitive allowances while preserving per-transfer signatures.
- **Integrity**: UI verifies that `keccak256(message)` equals on-chain `messageHash`.
- **Validation**: reject empty messages; bound length; handle non-ASCII safely; show clear errors for signature expiry or invalid domain.

---

## 🧪 Testing Checklist
- Free greeting (value = 0).  
- ETH greeting (value > 0) — forward to fee receiver.  
- ERC-20 greeting with **EIP-2612** (happy path + expired/invalid sig).  
- ERC-20 greeting with **Permit2** (first-time approval + subsequent no-approval flow).  
- Event integrity: emitted string’s `keccak256` equals stored hash.  
- Edge cases: empty/oversized message, unknown token, user rejects signature/tx.

---

## 📄 Contract Docs
See **[Greeting.sol docs](/src/app/solidity/challenge-4/README.md)** for function signatures, events, deployment, and integration details.