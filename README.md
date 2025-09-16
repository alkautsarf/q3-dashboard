# 🌐 Q3 Dashboard — Production Monorepo

High-performance Ethereum challenges with real contracts, real frontends, and real tests.  
Each challenge is fully documented and production-ready.

**Live App**: https://q3-dashboard-main.vercel.app/

---

## ✨ Highlights
- **Challenge 1 — Multi-Read Dashboard:** fast portfolio indexing; compares **smart-contract batching vs multicall vs individual** calls (small sets may vary).
- **Challenge 2 — Multi-Send Tool:** batch ETH/ERC-20 distribution with **gas break-even** guidance (ETH ≥ **6** recipients, ERC-20 ≥ **4**).
- **Challenge 4 — Greeting Wall:** gas-lite social contract (Free / ETH / **EIP-2612** / **Permit2**), stores only **hash** on-chain and emits full text via events.

---

## 📚 Documentation Index
- **Challenge 1**
  - Frontend/System → [`docs/challenge-1/README.md`](./docs/challenge-1/README.md)
  - Solidity → [`solidity/challenge-1/README.md`](./src/app/solidity/challenge-1/README.md)
- **Challenge 2**
  - Frontend/System → [`docs/challenge-2/README.md`](./docs/challenge-2/README.md)
  - Solidity → [`solidity/challenge-2/README.md`](./src/app/solidity/challenge-2/README.md)
- **Challenge 3**
  - Placeholder → [`docs/challenge-3/README.md`](./docs/challenge-3/README.md)
- **Challenge 4**
  - Frontend/System → [`docs/challenge-4/README.md`](./docs/challenge-4/README.md)
  - Solidity → [`solidity/challenge-4/README.md`](./src/app/solidity/challenge-4/README.md)

> **Requirements & Environment Variables:** see **[`docs/QUICKSTART.md`](./docs/QUICKSTART.md)**.

---

## 🧠 Architecture Notes (High-Level)
- **C1 (Indexer):** three strategies—**individual** RPC, **multicall**, **SC batching**. Typically **SC batching > multicall > individual**; for very small token sets, results can vary.
- **C2 (Disperse):** atomic batch transfers with refunds and strict validation. Gas break-even (empirical): **ETH ≥ 6**, **ERC-20 ≥ 4** recipients.
- **C4 (Greeting Wall):** **event-first** storage (full text in events; on-chain stores hash); supports **Free / ETH / 2612 / Permit2** with immediate forwarding to `FEE_RECEIVER`.

---

## 🧪 Testing Overview
- Foundry test suites per challenge (`solidity/challenge-*/test`).
- Includes **positive**, **negative**, and **fuzz** tests:
  - Invalid signatures (2612 & Permit2), expired deadlines, wrong domain/owner.
  - ETH forwarding success/failure and no retained balances.
  - Invariants: counters update only on success; `lastGreetingHash == keccak256(fullMessage)`.

**Coverage (src only):**
```bash
forge coverage --exclude-tests --nmco script/<CONTRACT_NAME>.s.sol
```

## 📦 Tech Stack
- Solidity / Foundry (forge-std)
- Next.js + React + TypeScript
- wagmi + viem (wallet/RPC)
- EIP-2612 & Permit2 (approval-less ERC-20 flows)
  
## ✅ Status
- Challenge 1 — **Finalized**
- Challenge 2 — **Finalized**
- Challenge 3 — **Placeholder**
- Challenge 4 — **Finalized**

---

## ⚠️ Known Issues

### Challenge 1 — Multi-Read Dashboard
- **Rendering delay is from price fetching, not balance fetching.**  
  - Wallet balances and token amounts are fetched quickly via batching/multicall.  
  - However, prices come from the **CoinGecko API**, which adds latency:  
    1. The frontend collects all unique token addresses.  
    2. It queries CoinGecko’s API for price data.  
    3. The UI merges price data with balances before rendering the table.  
  - This external API call is the bottleneck — especially noticeable when fetching prices for many tokens — so table rendering can take a few seconds even though balance fetching is efficient.

---

### Challenge 2 — Multi-Send Tool
- **Optimized for multiple recipients, not single transfers.**  
  - The smart contract and UI are built to support dispersing funds across many recipients efficiently.  
  - However, in terms of **UX performance and gas efficiency**, batch transfers are only better at scale:  
    - **ETH transfers:** Batch becomes cheaper at **6 or more** recipients.  
    - **ERC-20 transfers:** Batch becomes cheaper at **4 or more** recipients.  
  - For fewer recipients, the batch path incurs higher overhead than sending individually.  
  - This is expected behavior: batch overhead amortizes as the number of recipients grows.  

---

## 📄 License

MIT © 2025 alkautsarf/elpabl0.eth
