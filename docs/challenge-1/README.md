# 📗 Challenge 1 — Multi-Read Dashboard / Portfolio Indexer (3 Approaches)

### Goal  
Display an address’s ERC-20 portfolio using three fetching strategies while keeping the UI identical. Compare performance and UX across:  
1. Individual per-token RPC calls  
2. Batched multicall RPC  
3. Smart contract batch read (`BalanceReader.sol`)

---

## ✅ Scope & Success Criteria  
- Input: address (ENS or raw 0x; fallback to connected wallet)  
- Output: consistent token list with balances, USD value, 24h% change  
- Features:  
  - Hide zero balances + obvious spam  
  - Sort by USD value (fallback: balance)  
  - Show perf captions (ms elapsed + estimated RPCs)  
- Success = all three approaches render the same portfolio correctly for Mainnet + Arbitrum

---

## 🏗 Architecture  
```
src/
├─ app/
│  ├─ challenge1/
│  │  └─ page.tsx                 # Page shell: search + tabs + captions
│  │
│  ├─ api/
│  │  ├─ prices/
│  │  │  └─ batch/route.ts        # Server batch for token pricing (throttle/retry/cache)
│  │  ├─ native-price/route.ts    # Cached ETH price
│  │  ├─ token-price/route.ts     # Proxy for single token price
│  │  ├─ token-prices/route.ts    # Proxy for multiple token prices
│  │  ├─ token-logos/route.ts     # Fetches logos via CoinGecko
│  │  └─ token-detail/route.ts    # Fallback for full token metadata (market_data)
│  │
│  ├─ components/
│  │  ├─ TokensList.tsx           # Table: logo, symbol, balance, USD, 24h%
│  │  ├─ SlideTabs.tsx            # Switcher for the 3 approaches
│  │  ├─ NetworkSelector.tsx      # Mainnet/Arbitrum selector
│  │  └─ ConnectButton.tsx        # RainbowKit connect UI
│  │
│  ├─ lib/
│  │  ├─ portfolio.ts             # Discovery, spam heuristics, balance fetchers, merging
│  │  ├─ prices.ts                # Client helpers for price endpoints
│  │  └─ alchemy.ts               # Alchemy client utilities
│  │
│  └─ providers.tsx               # Wagmi + RainbowKit + React Query providers
│
├─ public/
│  └─ icons/eth.svg               # ETH icon
│
└─ solidity/
└─ challenge-1/
├─ src/BalanceReader.sol          # Smart contract for batched balance reads
└─ test/BalanceReader.t.sol       # Foundry tests for BalanceReader
```
---

## 🔄 Frontend Data Flow  
1. **Discovery** → Alchemy SDK enumerates owned ERC-20s  
2. **Filter** → Apply spam heuristics (bad decimals, missing name/logo, non-ASCII)  
3. **Balance Reads**:  
   - *Approach 1*: viem per-token `decimals/symbol/name/balanceOf`  
   - *Approach 2*: viem multicall (chunked, concurrent, `allowFailure: true`)  
   - *Approach 3*: `BalanceReader.sol` contract view, tolerant to reverts  
4. **Native ETH** → fetched separately (Alchemy core)  
5. **Pricing** → server-side CoinGecko batching (see below)  
6. **Render** → `TokensList` displays rows with skeleton loaders until pricing resolved  

---

## 💲 Pricing Fetching Mechanism  

### Server Routes (App Router)  
- **`POST /api/prices/batch`**  
  - Input: `{ platform, contract_addresses[] }`  
  - Calls CoinGecko `simple/token_price/{platform}` once per batch  
  - Retries with backoff, throttled concurrency (≈3 workers), short cache (~60s)  
  - If CG returns empty → fallback to `coins/{platform}/contract/{addr}` (`market_data`)  
- **`GET /api/native-price`**  
  - Cached ETH price (from CoinGecko `ids=ethereum`)  
  - Cache + in-flight dedupe ensures stable data  
- **`GET /api/token-logos`**  
  - Small-batch lookups for logos via CG `coins/{platform}/contract/{addr}`  
- **`GET /api/token-detail`**  
  - Fallback endpoint for full metadata when batch price fails  

### Client Helpers (`lib/prices.ts`)  
- `fetchErc20Prices(net, contracts)` → calls `/api/prices/batch`  
- `fetchNativeEthPrice()` → calls `/api/native-price`  
- `fetchTokenLogos(net, contracts)` → fills missing logos  

### UI Behavior  
- **Balances render first** (from discovery & RPC/contract calls)  
- **Price skeletons** animate until resolved  
- If no price found → show `n/a` in Price/24h%/USD column  
- Native ETH → price shown immediately from cached endpoint  

---

## 🔗 Smart Contract Integration  
- Approach 3 calls [`BalanceReader.sol`](/src/app/solidity/challenge-1/README.md)  
- Configured via env var `NEXT_PUBLIC_C1_ADDRESS`  
- Same address deployed on Mainnet + Arbitrum using CREATE2  

---

## 🎨 UX / UI Notes  
- Token list + amounts render immediately, before pricing  
- Spam/no-price tokens → show `n/a` for Price/24h%/USD (amount still shown)  
- Sorting: USD value desc, spam/unpriced sink to bottom  
- Captions under table:  
  - `Approach: Individual — 1,200ms, ~45 RPCs`  
  - `Approach: Multicall — 400ms, ~3 RPCs`  
  - `Approach: Smart Contract — 350ms, ~2 RPCs`

---

## 🚀 Performance Notes
- In most cases, **smart contract batching** is faster than **multicall**, which is faster than **individual RPC calls**.  
- For small queries (e.g., only a few tokens), the results may vary — sometimes **multicall** or even **individual calls** can match or outperform batching due to lower overhead.  

---

## 🔒 Safety & Gas Considerations  
- Server routes batch CoinGecko calls → prevent client fan-out and protect API keys  
- Spam heuristics conservative → never suppress balances, only price  
- `BalanceReader.sol` uses try/catch → non-standard tokens don’t break batch  
- Events/logs only, no heavy on-chain storage  

---

## 🧪 Testing Checklist  
- Valid address with multiple tokens  
- Address with dust + spam tokens  
- Empty address (shows empty state)  
- Compare latency across tabs  
- Invalid address (error handling)  

---

## 📄 Contract Docs  
See [BalanceReader.sol docs](../../solidity/challenge-1/README.md) for interface, deployment, and integration details.  