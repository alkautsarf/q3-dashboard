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
│  ├─ challenge1/page.tsx              # Page shell: Search + tabs + captions (Approach 1 wired)
│  ├─ api/
│  │  └─ prices/
│  │     └─ batch/route.ts            # Server batch for CG token pricing (throttle/retry/cache)
│  │  ├─ native-price/route.ts        # Cached native ETH price (simple/price)
│  │  ├─ token-price/route.ts         # Thin proxy alias for simple/token_price (singular)
│  │  ├─ token-prices/route.ts        # Thin proxy for simple/token_price (plural)
│  │  └─ token-logos/route.ts         # Fetches logo via coins/{platform}/contract/{addr}
│  │  ├─ token-detail/route.ts        # Detail fallback (coins/{platform}/contract/{addr}) pricing
│  │
│  ├─ components/
│  │  ├─ TokensList.tsx               # Presentational table; price skeletons; ‘n/a’ for spam/no-price
│  │  └─ SlideTabs.tsx                # Tab switch (Individual / Batch RPC / Smart Contract)
│  │  └─ NetworkSelector.tsx          # Mainnet/Arbitrum selector (view-only)
│  │  └─ ConnectButton.tsx            # RainbowKit Connect UI wrapper
│  │
│  ├─ lib/
│  │  ├─ portfolio.ts                 # Discovery (Alchemy), spam heuristics, per‑token viem reads, merge
│  │  ├─ prices.ts                    # Client helpers for pricing routes
│  │  └─ alchemy.ts                   # Utilities for Alchemy client + RPC URLs per network
│  │
│  └─ providers.tsx                   # Wagmi + RainbowKit + React Query providers
│
├─ public/icons/eth.svg               # Local ETH icon (monochrome)
```

### API Endpoints (App Router)

- `POST /api/prices/batch`  
  Body: `{ platform: 'ethereum'|'base'|'arbitrum-one', contract_addresses: string[] }`  
  Returns: `{ [addrLower: string]: { usd: number, usd_24h_change?: number, … } }`  
  Behavior: throttled, small concurrency (3 workers), retry/backoff, 60s in‑memory cache; falls back to `coins/{platform}/contract/{addr}` when `simple/token_price` is empty.

- `GET /api/native-price`  
  Returns: `{ usd: number, usd_24h_change?: number, … }` for `ids=ethereum`.  
  Behavior: 60s in‑memory cache; in‑flight request dedupe; on upstream error returns last cached value if present.

- `GET /api/token-price` and `GET /api/token-prices` (debug/proxy)  
  Forwards to CoinGecko `simple/token_price/{platform}` with `x-cg-api-key` header. Normalizes response keys to lowercase.

- `GET /api/token-logos?platform=…&contracts=a,b,c`  
  Batches contract metadata lookups and extracts `image.small|thumb`.

- `GET /api/token-detail?platform=…&address=0x…`  
  Fallback route that returns `{ price, change, logo? }` extracted from `market_data` when simple/token_price returns empty.

### Lib Functions

`src/app/lib/portfolio.ts`
- `discoverOwnedTokens(alchemy, address): PortfolioToken[]`  
  Indexer discovery (per network): `contractAddress, name, symbol, logo, balance, decimals`.
- `isLikelyValidToken(token): boolean`  
  Heuristics: name/symbol present, lengths sane, decimals in range, ASCII symbol, logo exists.
- `filterPortfolioTokens(tokens, net, { includeZero, verifiedOnly, heuristics }): PortfolioToken[]`  
  Drop zeros; optionally apply heuristics.
- `fetchIndividualBalancesViem(net, owner, tokenAddresses?): PortfolioToken[]`  
  Per‑token viem reads: `decimals|symbol|name|balanceOf` (Approach 1 baseline).
- `mergeTokenData(discovered, fresh): PortfolioToken[]`  
  Prefer balance fields from RPC; keep metadata (name/logo) from discovery.
- `fetchNativeToken(alchemy, address, net): PortfolioToken`  
  Gets ETH balance (18 decimals) per selected network.

`src/app/lib/prices.ts`
- `fetchErc20Prices(net, contracts): Record<addr, { usd, usd_24h_change? }>`  
  Calls `/api/prices/batch` once per network; returns a map of lowercase address → price entry.
- `fetchNativeEthPrice(): { usd, usd_24h_change? }`  
  Calls `/api/native-price` (cached/deduped) for ETH.
- `fetchTokenLogos(net, contracts): Record<addr, url>`  
  Calls `/api/token-logos` in small batches (cache‑friendly) to fill missing logos.

### Components

- `TokensList` props:  
  - `items`: array of `{ symbol, name?, href?, balance, balanceDisplay?, price?, change24h?, usdValue?, icon?, spam?, noPrice?, loading? }`  
  - `loadingPrices`: boolean (controls price skeletons only)  
  Behavior:  
  - If `spam || noPrice` → show `n/a` in Price/24h%/USD (Amount always shown).  
  - Formats tiny prices and USD values (e.g., `<0.0001`).

- `NetworkSelector`: view state only (Mainnet/Base/Arbitrum).
- `SlideTabs`: Approach tabs.
- `ConnectButton`: RainbowKit wrapper.


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
- **What (current repo)**: Discover tokens via Alchemy for the selected network, tag spam via heuristics, then for non‑spam ERC‑20s perform per‑token RPC reads (`decimals`, `symbol`, `name`, `balanceOf`) using viem. Merge with discovery metadata.  
- **Why**: Establish a clear baseline (many RPCs); useful for perf comparison against multicall/contract batching.  
- **Output**: `PortfolioToken[]` filtered/sorted as per rules; native ETH included separately.  
- **Note**: The original “allowlist” variant is replaced with indexer‑driven discovery in this repo.

### 2) Batch RPC (Multicall)
- **What (current repo)**: Use `viem` multicall to fetch many balances in fewer RPCs (chunked + concurrent). Metadata from discovery is merged with balances.  
- **Why**: Faster UX, fewer RPCs.  
- **Output**: Same shaped `PortfolioToken[]`.

#### Implementation Notes

- `fetchBalancesMulticallViem` (src/app/lib/portfolio.ts):  
  - Deduplicate addresses (lowercased).  
  - Chunk size ≈ 150 per multicall to avoid oversize payloads.  
  - Concurrency ≈ 3 to improve throughput while respecting provider limits.  
  - `allowFailure: true` so non‑standard tokens don’t break the batch.  
  - Balance formatting uses decimals from discovery.  
- RPC caption shows estimated calls: `1 (discovery) + ceil(nonSpam/chunk) + 1 (native)`.

### 3) Smart-Contract Batch (Solidity)
- **What**: `BalanceReader.sol` view method, loops with `try/catch` to tolerate non-standard ERC-20s, returns batched results.  
- **Why**: Reusable on-chain primitive; single read from dApp; contract can be reused by others.  
- **Output**: Map returned arrays to `PortfolioToken[]`.

> **Note**: `alchemy.core.getTokensForOwner` is an indexer-aggregated call; don’t use it for “Individual”. It can support Batch comparisons if needed.

---

## Prices

- Source: Use CoinGecko simple price (server-side batch) or Alchemy prices if available https://docs.coingecko.com/v3.0.1/reference/authentication.
- Map `contract → priceUSD`, compute `valueUSD = balance * priceUSD`.
- Cache per session; avoid hammering the API on every keystroke.

---

## Filtering & Ordering

- Default: hide `balance === 0`; tag obvious spam via heuristics (logo/name/symbol/decimals) and allow hiding via “Hide Spam Tokens” (view‑only).
- Sort: `valueUSD desc` → fallback `balance desc`.

---

## Perf & Telemetry (lightweight)

- Measure elapsed time per approach (`performance.now()`).
- Approximate RPC call count (1 for multicall/contract; ~N for individual).
- Display a small caption under `TokensList`, e.g.:  
  - “**Approach:** Individual — **<ms>ms**, **~<N> RPC**”.  
  - Pricing caption: removed (perf-focused simplification).

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

- `src/app/challenge1/page.tsx` wired to tabs, captions, and `TokensList`.  
- `src/app/lib/portfolio.ts` (Approach 1 baseline).  
- `src/app/lib/prices.ts` and server routes `src/app/api/prices/batch/route.ts`, `src/app/api/native-price/route.ts` (+ proxies/logos as needed).  
- (Optional) `contracts/BalanceReader.sol` for Approach 3.  
- Short notes in PR/commit: perf snapshot + known trade‑offs.

---

## Out of Scope (for this challenge)

- Historical portfolio, full token discovery/crawling, or pagination.  
- Cross-chain aggregation.  
- Advanced price aggregation/candles/PNL.  
- Complex caching strategies.

---

## TODO Backlog (later)

- ENS resolution for search input.  
- ~~Toggle for zero/spam tokens.~~
- ~~USD value + 24h% (with price source).~~  

---


## Approach 1 — Implementation Notes (What we shipped)

This section documents the concrete behavior of our "Individual RPC" approach.

### Data Flow (high‑level)

- Discovery (indexer): `alchemy.core.getTokensForOwner(address)` to enumerate ERC‑20s and basic metadata per network.
- Filtering (client): show only non‑zero balances; tag each token with a `spam` flag via conservative heuristics (missing name/symbol, extreme lengths, invalid decimals, non‑ASCII symbol, missing logo). Native ETH is always included.
- Per‑token RPC (baseline): for filtered, non‑spam ERC‑20s we call, individually via viem:
  - `decimals()`, `symbol()`, `name()`, `balanceOf(owner)`
  - File: `src/app/lib/portfolio.ts` (`fetchIndividualBalancesViem`)
- Merge: balances from RPC + metadata from discovery (preserve logos/names if RPC lacks them).
- Native ETH: separate balance via `alchemy.core.getBalance`, rendered immediately.

### Pricing (CoinGecko)

- Server batch (no client fan‑out): `POST /api/prices/batch` receives `{ platform, contract_addresses[] }` and executes a throttled queue on the server.
  - Simple route: `simple/token_price/{platform}` per contract; if empty, fallback to `coins/{platform}/contract/{address}` to extract `market_data`.
  - Concurrency: 3 workers; global throttle gap: ~150ms between upstream requests; per‑request timeout: 7s; retry with backoff for 429/5xx/504 (honors `Retry-After`).
  - In‑memory cache (≈60s) dedupes identical requests.
  - Files: `src/app/api/prices/batch/route.ts`, helper client `src/app/lib/prices.ts`.
- Native price: `GET /api/native-price` with in‑memory cache + in‑flight dedupe. Ether (ethereum id) is reused across networks.
  - File: `src/app/api/native-price/route.ts`.
- Spam handling: spam tokens are never priced; UI shows `n/a` for Price/24h%/USD Value while keeping token name and Amount.
- "Hide Spam Tokens" toggle is view‑only (no refetch).

### UI/UX

- Instant feedback:
  - Tokens + Amount render immediately after discovery.
  - Native ETH shows price/24h%/USD immediately (no skeletons, cached placeholder if available).
  - ERC‑20 rows show skeletons for Price/24h%/USD while pricing runs; if a token has no CG data, we mark it `noPrice` and show `n/a` immediately (Amount still displayed).
- Sorting: rows sorted by USD Value descending; unpriced/spam rows sink to the bottom.
- Captions:
  - RPC perf: “Approach: Individual — <ms>ms, ~<N> RPC”.
  - Pricing perf:
    - Live (local progress): “Pricing: <elapsed>ms, <processed>/<total+1> tokens” (+1 accounts for ETH).
    - Static on completion: “Pricing: <ms>ms, <total+1> tokens”.

### Env & Config

- Alchemy key (public for demo): `NEXT_PUBLIC_API` used to configure the Alchemy SDK.
- CoinGecko key: `NEXT_PUBLIC_COINGECKO_API` (also supports `NEXT_PUBLIC_COINGECKO_API_KEY`, `NEXT_PUBLIC_CG_API_KEY`, `NEXT_PUBLIC_CG_KEY`).
  - Sent as `x-cg-api-key` from server routes only.
- No secrets are committed; `.env*` is ignored by git.

### Files (main touchpoints)

- Page + state: `src/app/challenge1/page.tsx` — search, network selector, captions, mapping to `TokensList`.
- ERC‑20 per‑token reads: `src/app/lib/portfolio.ts` (`fetchIndividualBalancesViem`, spam heuristics, merge).
- Pricing helpers: `src/app/lib/prices.ts` (client calls to batch/native/logos).
- Server routes: `src/app/api/prices/batch/route.ts`, `src/app/api/native-price/route.ts`, plus thin proxies for diagnostics (`/api/token-price(s)`, `/api/token-logos`).
- Presentational list: `src/app/components/TokensList.tsx` — price skeletons, `n/a`, tiny‑value formatting.

### Non‑disruptive Guarantees

- Pricing queue is fully server‑side; client makes one call per network and optionally polls local progress for the caption only — never CoinGecko directly.
- Native price is cached and deduped; bursts won’t 429 the endpoint.
- The "Hide Spam Tokens" toggle never triggers new requests; it only filters the rendered rows.
- All perf captions are read‑only; disabling them does not change the fetch pipeline.

### Known Trade‑offs

- Spam heuristics are intentionally conservative; some legitimate tokens without logos may be flagged as spam → they still appear (unless hidden) and remain unpriced.
- Very large portfolios will still stream skeletons until pricing completes; concurrency is capped to remain polite to CG (adjustable if needed).

### Quick Verify

1) `npm run dev` → `/challenge1`
2) Enter a valid address → Search.
3) Switch networks; native ETH appears immediately; ERC‑20s price in batches; watch the pricing caption.
4) Toggle “Hide Spam Tokens” (view‑only) and confirm spam rows disappear/reappear; no refetch.

## Approach 2 — Batch RPC (Multicall) via viem

This approach batches token balance reads using viem multicall to reduce RPC calls significantly while preserving Approach 1’s data model and UI.

### Implementation Notes (What we shipped)

- Discovery & Filter: identical to Approach 1 (Alchemy discovery, hide zeros, spam heuristics, native ETH retained).  
- Multicall for balances: `fetchBalancesMulticallViem(net, owner, tokens)` in `src/app/lib/portfolio.ts`  
  - Deduplicate contract addresses (lowercased).  
  - Chunk contracts (≈150 per multicall) to keep payloads reasonable.  
  - Run chunks with small concurrency (≈3) to improve throughput without spamming RPC.  
  - `allowFailure: true` so non‑standard tokens don’t impact the batch.  
  - Balance formatting uses decimals from discovery; metadata (name/symbol/logo) is merged from discovery.  
- Merge + Native: balances merged with discovery metadata; native ETH fetched separately.  
- Pricing: identical server-side batch (single client call per network).  
- RPC perf caption: shows elapsed time + estimated RPCs (≈ 1 discovery + ceil(nonSpam/chunk) multicalls + 1 native).  
- Pricing perf caption: removed for performance.

### Why this is fast & safe

- Fewer RPCs vs per‑token reads; chunked multicalls reduce payload risk; concurrency increases throughput.  
- Server-side pricing batch with retry/backoff/cache avoids client fan‑out to CoinGecko.  
- No changes to UI/UX; tokens and amounts render immediately; Ether remains immediate; pricing fills in as available.  
- No cross‑approach interference; switching tabs yields identical portfolios.

---

## Approach 3 — Smart‑Contract Batch (Solidity)

This approach uses an on-chain helper to aggregate many ERC‑20 `balanceOf` calls into fewer RPCs while preserving the same UI and data shape.

### Contract

- `BalanceReader.sol` exposes:  
  `function batchBalanceOf(address owner, address[] tokens) external view returns (uint256[] balances)`  
  Tolerant to non‑standard tokens via `try/catch` (0 on failure).  
- Deployed at the same address on Mainnet and Arbitrum using CREATE2:  
  `0xED259223F06eC265A80376251E483657572c10BD`  
  - Configure via `NEXT_PUBLIC_C1_ADDRESS` in `.env`.
- Source: `src/app/solidity/challenge-1/src/BalanceReader.sol` (Foundry project).

### Client Integration (What we shipped)

- Discovery & Filtering: same as other approaches (Alchemy, heuristics, zero hide).  
- Batch read: `fetchSmartContractBalances(net, owner, tokens, readerAddress)` in `src/app/lib/portfolio.ts` calls `batchBalanceOf` via viem:  
  - Deduplicates addresses (lowercased).  
  - Adaptive chunking (`≤12 → N`, `≤60 → 40`, `≤200 → 100`, else `120`).  
  - Formats with decimals from discovery; merge with metadata via `mergeTokenData`.  
- Native ETH, pricing, logos, sorting: identical behavior to Approaches 1 and 2.  
- Perf caption: “Smart Contract — <ms>ms, ~<N> RPC” (≈ 1 discovery + ceil(nonSpam/chunk) + 1 native).

### Quick Verify

1) Ensure `.env` has `NEXT_PUBLIC_C1_ADDRESS=0xED259223F06eC265A80376251E483657572c10BD`.  
2) `npm run dev` → `/challenge1` → search a wallet.  
3) Switch to “Smart Contract” tab; balances should match other tabs and pricing fills in the same way.  
4) Perf caption should show small RPC counts and consistent timing.

---

## Changes & Changelog (recent)

### Networks
- Removed Base from network selector; current networks: Mainnet and Arbitrum.

### UX
- Ether price appears immediately (native price cached/deduped).  
- Tokens without pricing data show `n/a` (Amount always shown).  
- Sorting by USD desc; unpriced/spam rows sink to bottom.

### 2025-09-11
  — perf(batch-rpc): stabilize Approach 2 (Multicall)
  - Cache a viem public client per network to reuse HTTP transport and reduce setup overhead.  
  - Adaptive multicall chunk sizes to reduce calldata and EVM execution overhead for small/medium portfolios: `<=12 → N`, `<=60 → 40`, `<=200 → 100`, else `120`.  
  - Keep `allowFailure: true` and address de-duplication.  
  - Update RPC caption estimate to reflect adaptive chunking.  
  - No API/UX/type changes. Behavior preserved; more consistent timings across different token counts.

### 2025-09-11
  — feat(approach3): Smart‑Contract Batch wired
  - Add Foundry project under `src/app/solidity/challenge-1/` with `BalanceReader.sol` (batchBalanceOf).  
  - Deploy to Mainnet + Arbitrum at the same address via CREATE2; expose `NEXT_PUBLIC_C1_ADDRESS`.  
  - Client: `fetchSmartContractBalances` in `src/app/lib/portfolio.ts` with adaptive chunking + dedupe.  
  - UI: “Smart Contract” tab implemented; identical pricing/logos/sorting and perf caption.


### 2025-09-11
  — ux: hide address heading above holdings table
  - Removed the top-left address/ENS heading in all approaches to declutter the table.  
  - No functional changes; captions and totals remain visible.

### 2025-09-12
  — ui(challenge1): cleaner layout + sticky tabs cursor
  - Remove navbar; move connect button to subtle top-right overlay.  
  - Add compact controls card: search + network selector + spam toggle + approach tabs.  
  - SlideTabs: cursor now persists on the selected tab and returns to it on mouseleave; smooth hover animation retained.  
  - No functional changes to fetching, ENS, or pricing.

### 2025-09-12
  — ui(challenge1): search input prefills with connected identity
  - Auto-fill search with connected ENS (preferred) or address when empty; if ENS resolves later, it replaces the raw address.  
  - Truncate the connected address in the input when not focused (0x1234…abcd), show full value on focus for editing.  
  - Pure UI change; fetching logic and approach behavior unchanged.

### 2025-09-12
  — ui(network-selector): height + animation parity with SlideTabs
  - NetworkSelector uses the same spring cursor animation pattern and blend styling as SlideTabs.  
  - Adjust padding to match tab height visually (px-4 py-2), keeping smooth interactions.  
  - No functional changes to network switching.

### 2025-09-12
  — ui(menu): mobile overlay polish (logo + close alignment)
  - Hide header logo only when the mobile/tablet menu overlay is open to avoid visual overlap, keep it visible on desktop.  
  - Preserve close button position by forcing header alignment to flex-end on small screens when open.  
  - Pure styling changes; no logic or layout shifts on desktop.

### 2025-09-12
  — ui(challenge1): align Connect button with header
  - Move Connect button into the header row and center it vertically for consistent alignment with the page title.  
  - No logic changes — purely layout polish.
