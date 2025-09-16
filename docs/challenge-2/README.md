# 📗 Challenge 2 — Multi-Send Tool

### Goal
A **terminal-style interface** that allows users to send ETH or ERC-20 tokens to multiple recipients in a **single transaction**.  
The app enforces a clean **approval gate** for ERC-20 transfers, shows **gas comparisons** vs individual sends, and provides detailed transaction status updates.

---

## ✅ Scope & Success Criteria
- Input: connected wallet + recipient list (`addressOrENS=amount` per line).  
- Output: single batch transaction distributing ETH or ERC-20.  
- Features:  
  - Works with ETH or any ERC-20.  
  - Enforces allowance approval (ERC-20 only).  
  - Receipt screen shows summary + balance check.  
  - Gas comparison vs individual transfers.  
  - Transaction status with explorer links.  
- Success = multiple recipients funded atomically in one transaction.

---

## 🏗 Architecture
```
src/
├─ app/
│  ├─ challenge2/
│  │  └─ page.tsx             # Page shell with terminal-style UI
│  │
│  ├─ components/
│  │  ├─ Terminal.tsx         # Core UI container (command-line experience)
│  │  ├─ CommandHandler.tsx   # Parses /connect, /token, recipient input
│  │  ├─ Receipt.tsx          # Displays summary: token, recipients, totals, balance
│  │  └─ TxStatus.tsx         # Monitors pending/success/failure + explorer links
│  │
│  ├─ lib/
│  │  ├─ disperse.ts          # Helper functions for approvals + batch sending
│  │  ├─ validators.ts        # Validates recipient addresses and amounts
│  │  └─ utils.ts             # Utility functions (parsing, ENS resolution, etc.)
│  │
│  └─ providers.tsx           # Wagmi + RainbowKit + React Query providers
│
└─ solidity/
└─ challenge-2/
└─ src/Disperse.sol     # Batch send contract (ETH + ERC-20)
```

---

## 🔄 Frontend Data Flow
1. **Wallet connect** → User connects via RainbowKit.  
2. **Token selection** → User chooses ETH or ERC-20 (allowlist or custom).  
3. **Recipient entry** → Terminal input in format:  
    ```
    0xabc123…=1.5
    vitalik.eth=2.0
    ```
4. **Validation** → ENS resolution, amount parsing, address checks.  
5. **Receipt** → Summary page with:  
- Token, recipients, amounts, totals.  
- User balance + remaining balance.  
- Gas comparison (batch vs N individual sends).  
6. **Approval Gate (ERC-20 only)** →  
- If allowance < required total → prompt for `approve(contract, total)`.  
- Wait for 1 confirmation.  
- Re-check allowance.  
7. **Transaction Execution** → Call `disperseEther` or `disperseToken`.  
8. **Status** →  
- Pending → show spinner + explorer link.  
- Success → mark each recipient complete.  
- Failure → surface error reason.  

---

## 🎨 UX / UI Notes
- Command-driven interface (`/connect`, `/token`, `/done`) mimics CLI feel.  
- Receipt shows totals, balances, gas cost side-by-side.  
- Pending tx shows link to Etherscan/Arbiscan.  
- Failures handled gracefully:
- Rejecting approval → stays on Receipt.  
- Insufficient allowance → cannot proceed.  
- Contract revert → error surfaced in terminal.

---

## 💲 Pricing & Gas Handling
- Gas estimates fetched via `publicClient.estimateGas()` before sending.  
- UI displays comparison:  
  - Batch transaction gas  
  - N × single transfer gas (for perspective)  
- ETH refunds: leftover ETH is returned to sender.  
- ERC-20: total pulled once via `transferFrom` → distributed internally.  

### ETH Transfers
- For a single recipient, **individual transfers** are cheaper.  
- Batch overhead is higher at small sizes but amortizes as recipients increase.  
- **Break-even point:** Batch becomes cheaper at **6 or more recipients**.  
  - For ≤5 recipients, individual transfers cost less gas.

| Recipients | Batch Gas | Individual Gas | Cheaper     |
|------------|-----------|----------------|-------------|
| 1          | 67,106    | 24,538         | Individual  |
| 2          | 81,392    | 48,976         | Individual  |
| 6          | 138,536   | 147,228        | Batch       |

---

### ERC-20 Transfers
- Higher fixed cost (approval + pull via `transferFrom`).  
- **Break-even point:** Batch becomes cheaper at **4 or more recipients**.  
  - For 1–3 recipients, individual transfers cost less gas.

| Recipients | Batch Gas | Individual Gas | Cheaper     |
|------------|-----------|----------------|-------------|
| 1          | 122,980   | 44,382         | Individual  |
| 2          | 132,385   | 88,764         | Individual  |
| 4          | 151,195   | 177,528        | Batch       |

---

### Performance Notes
- **ETH**: batching is efficient only when sending to many recipients (≥6). For small numbers, individual transfers are cheaper.  
- **ERC-20**: batching becomes efficient earlier (≥4).  
- In all cases, **gas efficiency depends on the number of recipients** — batch is not always the optimal choice.
  
---

## 🔒 Safety & Considerations
- **Validation**: rejects zero addresses, zero amounts, mismatched arrays.  
- **Allowance flow**: always re-checks allowance after approval.  
- **Unsupported tokens**: fee-on-transfer tokens explicitly rejected.  
- **Atomicity**: all transfers succeed or entire tx reverts.  

---

## 🧪 Testing Checklist
- ETH batch send → multiple recipients.  
- ERC-20 batch send → requires approval first.  
- Reject approval → stays on Receipt.  
- Wrong input format → validation error.  
- ENS address resolution.  
- Gas estimates shown correctly.  
- Refund logic: leftover ETH returned to sender.  
- Failures (invalid recipient, insufficient balance) handled gracefully.  

---

## 📄 Contract Docs
See [Disperse.sol docs](/src/app/solidity/challenge-2/README.md) for the contract interface, deployment, and integration details.
