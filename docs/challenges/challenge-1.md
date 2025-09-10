# Challenge 1 — Portfolio Indexer (3 Approaches)

**Goal:** Display an address’s ERC-20 portfolio with three fetching strategies, compare UX/perf, and keep the UI consistent across approaches.

---

## Scope & Success Criteria

- **Search**: Input 0x… (ENS optional later). If empty, use connected wallet.
- **Tabs/Switch**: 3 approaches → same visual output.
- **List**: Animated `TokensList` shows *logo, symbol, name, balance (formatted), USD (optional), 24h% (optional)*.
- **Filtering**: Hide zero balances and obvious spam by default (toggle later).
- **Ordering**: Desc by USD value; fallback desc by balance.
- **Perf**: Show timing + call count per approach (caption).
- **No mixed concerns**: Fetch/format in `src/lib`, presentation in components.

Done = All above working for mainnet with a small allowlist; stable for any valid address.

---

## Architecture

```src/
├─ app/
│  └─ challenge1/page.tsx            # Page shell: Search + SlideTabs + Approach sections
│
├─ app/components/
│  ├─ TokensList.tsx                 # Animated list (pure presentational)
│  └─ SlideTabs.tsx                  # Already built (switch)
│
├─ lib/
│  ├─ portfolio.ts                   # ALL fetching/formatting lives here
│  └─ tokenLists/
│     └─ mainnetTop.ts               # Small allowlist (WETH, USDC, USDT, DAI, WBTC, …)
│
contracts/
└─ BalanceReader.sol                 # For approach 3 (view-only batch reader)
```

---

## Libraries & Policy (MANDATORY)

**Use official docs first**:
- viem — https://viem.sh/docs/getting-started  
- wagmi (React) — https://wagmi.sh/react/getting-started  
- RainbowKit — https://rainbowkit.com/docs/introduction  
- alchemy-sdk — https://www.npmjs.com/package/alchemy-sdk 
- coingeckoAPI - https://docs.coingecko.com/v3.0.1/reference/authentication 

If not covered: search reputable sources (maintainers, official repos).  
If still unclear: propose a short plan, get approval, then implement minimal diffs.

---

## Data Interfaces

- **`PortfolioToken`** *(TS type in `portfolio.ts`)*  
  `address, symbol, name, logo?, balance(number), priceUSD?, valueUSD?, change24hPct?`
- **`FetchOptions`**: `includeZero? (false)`, `withPrices? (false)`

Return **already-shaped** arrays for the UI. Components remain dumb/presentational.

---

## Approaches (What to Implement)

### 1) Individual RPC Calls (baseline)
- **What**: For each token in allowlist, call `balanceOf` (+ metadata) **per token**.  
- **Why**: Establish slow/naïve baseline for perf comparison.  
- **Output**: `PortfolioToken[]` filtered/sorted as per rules.

### 2) Batch RPC (Multicall)
- **What**: Use `viem` multicall to fetch many balances (and optional metadata) **in one RPC**.  
- **Why**: Faster UX, fewer RPCs.  
- **Output**: Same shaped `PortfolioToken[]`.

### 3) Smart-Contract Batch (Solidity)
- **What**: `BalanceReader.sol` view method, loops with `try/catch` to tolerate non-standard ERC-20s, returns batched results.  
- **Why**: Reusable on-chain primitive; single read from dApp; contract can be reused by others.  
- **Output**: Map returned arrays to `PortfolioToken[]`.

> **Note**: `alchemy.core.getTokensForOwner` is an indexer-aggregated call; don’t use it for “Individual”. It can support Batch comparisons if needed.

---

## Prices (Optional but Nice)

- Source: Use Coingecko simple price or Alchemy prices if available https://docs.coingecko.com/v3.0.1/reference/authentication.
- Map `contract → priceUSD`, compute `valueUSD = balance * priceUSD`.
- Cache per session; avoid hammering the API on every keystroke.

---

## Filtering & Ordering

- Default: hide `balance === 0` and obvious spam (indexer flags if available).
- Provide a UI toggle later (“Show zero/spam”).
- Sort: `valueUSD desc` → fallback `balance desc`.

---

## Perf & Telemetry (lightweight)

- Measure elapsed time per approach (`performance.now()`).
- Approximate RPC call count (1 for multicall/contract; ~N for individual).
- Display a small caption under `TokensList`, e.g.:  
  “**Approach:** Multicall — **120ms**, **1 RPC**”.

---

## UX Details

- **Search bar** above the switch; validate `isAddress`.  
- **Effective address**: `inputAddress` if valid else connected wallet else none.  
- **Empty states**: Not connected / Invalid address / No tokens.  
- **Errors**: Show terse message; console log details.

---

## Testing Checklist

- Valid address with multiple tokens (happy path).  
- Address with dust + spam (filtering works).  
- Invalid address (graceful error).  
- Empty portfolio (empty state).  
- Compare latency between approaches on same address.  

---

## Deliverables

- `src/lib/portfolio.ts` with three exported functions (one per approach).  
- `src/lib/tokenLists/mainnetTop.ts` allowlist.  
- `src/app/challenge1/page.tsx` wired to switch approaches and render `TokensList`.  
- (Optional) `contracts/BalanceReader.sol` + minimal ABI on the frontend.  
- Short notes in PR/commit: perf snapshot + known trade-offs.

---

## Out of Scope (for this challenge)

- Historical portfolio, full token discovery/crawling, or pagination.  
- Cross-chain aggregation.  
- Advanced price aggregation/candles/PNL.  
- Complex caching strategies.

---

## TODO Backlog (later)

- ENS resolution for search input.  
- Toggle for zero/spam tokens.  
- USD value + 24h% (with price source).  
- Accessibility and keyboard navigation polish.  