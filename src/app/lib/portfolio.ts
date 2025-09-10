// src/lib/portfolio.ts
import { Alchemy } from "alchemy-sdk";
import { formatUnits } from "viem"; // via viem docs: https://viem.sh/docs/utilities/formatting#formatunits
import { createPublicClient, http } from "viem";
import { mainnet as viemMainnet, arbitrum as viemArbitrum, base as viemBase } from "viem/chains";

export interface PortfolioToken {
  address: string;
  name: string;
  symbol: string;
  logo?: string;
  balance: number;
  balanceStr?: string;
  decimals?: number;
  spam?: boolean;
}

export async function fetchIndividualBalances(alchemy: Alchemy, address: string) {
  // Inspect raw response to validate shape and values
  try {
    // via alchemy-sdk docs: getTokensForOwner
    const res = await alchemy.core.getTokensForOwner(address);
    // eslint-disable-next-line no-console
    console.log("[portfolio] getTokensForOwner tokens:", res?.tokens?.length ?? 0);
    if (res?.tokens?.length) {
      // Log a small sample to verify fields present
      // eslint-disable-next-line no-console
      console.log(
        "[portfolio] sample token",
        res.tokens.slice(0, 3).map((t: any) => ({
          contractAddress: t.contractAddress,
          name: t.name,
          symbol: t.symbol,
          decimals: t.decimals,
          hasLogo: !!t.logo,
          balance: t.balance,
          rawBalance: t.rawBalance,
        }))
      );
    }

    const mapped = (res.tokens || [])
      .map((t: any) => {
        const decimals =
          typeof t.decimals === "number"
            ? t.decimals
            : t.decimals
            ? Number(t.decimals)
            : undefined;
        // Prefer pre-formatted balance; fallback to rawBalance/decimals
        let balNum = 0;
        if (t.balance !== undefined && t.balance !== null) {
          const n = Number(t.balance);
          balNum = Number.isFinite(n) ? n : 0;
        } else if (
          t.rawBalance !== undefined &&
          decimals !== undefined &&
          Number.isFinite(Number(t.rawBalance))
        ) {
          const divisor = Math.pow(10, decimals);
          balNum = Number(t.rawBalance) / (divisor || 1);
        }
        return {
          address: t.contractAddress,
          name: t.name,
          symbol: t.symbol ?? "",
          logo: t.logo ?? "",
          balance: balNum,
          balanceStr: typeof t.balance === "string" ? t.balance : undefined,
          decimals: decimals,
        } as PortfolioToken;
      })
      .filter((t: PortfolioToken) => (t.balance ?? 0) > 0);

    // eslint-disable-next-line no-console
    console.log("[portfolio] mapped tokens:", mapped.length);
    return mapped;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[portfolio] fetchIndividualBalances error", err);
    throw err;
  }
}

// Discover a user's owned tokens via Alchemy indexer
// via alchemy-sdk docs: https://www.npmjs.com/package/alchemy-sdk
export async function discoverOwnedTokens(
  alchemy: Alchemy,
  address: string
): Promise<PortfolioToken[]> {
  const owned = await alchemy.core.getTokensForOwner(address);
  const tokens = (owned.tokens || []).map((t: any) => ({
    address: t.contractAddress,
    name: t.name,
    symbol: t.symbol ?? "",
    logo: t.logo ?? "",
    // Note: Alchemy already returns human-formatted balance as string
    balance: Number(t.balance ?? 0),
    balanceStr: typeof t.balance === "string" ? t.balance : undefined,
    decimals: typeof t.decimals === "number" ? t.decimals : undefined,
  })) as PortfolioToken[];
  return tokens;
}

// Synthetic native token balance per network
export async function fetchNativeToken(
  alchemy: Alchemy,
  address: string,
  net: SupportedNetwork
): Promise<PortfolioToken> {
  try {
    const wei = await alchemy.core.getBalance(address);
    const balanceStr = formatUnits(wei.toString(), 18);
    const balanceNum = Number(balanceStr);
    // Symbol/name are ETH across mainnet, base, and arbitrum
    return {
      address: "native",
      name: "Ether",
      symbol: "ETH",
      balance: Number.isFinite(balanceNum) ? balanceNum : 0,
      balanceStr,
      decimals: 18,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[portfolio] fetchNativeToken error", err);
    return {
      address: "native",
      name: "Ether",
      symbol: "ETH",
      balance: 0,
      balanceStr: "0",
      decimals: 18,
    };
  }
}

// Filtering helpers
import type { SupportedNetwork } from "@/app/lib/alchemy";
import { getAlchemyRpcUrl } from "@/app/lib/alchemy";

export interface FilterOptions {
  includeZero?: boolean; // default false
  verifiedOnly?: boolean; // default true (apply heuristics only)
  heuristics?: boolean; // default true (used when verifiedOnly=false)
}

// Heuristic validity check (inverse is our spam flag)
export function isLikelyValidToken(t: PortfolioToken): boolean {
  if (t.address === "native") return true;
  if (!t.symbol || !t.name) return false;
  const sym = t.symbol.trim();
  const nm = t.name.trim();
  if (sym.length === 0 || nm.length === 0) return false;
  if (sym.length > 12) return false;
  if (nm.length > 50) return false;
  if (t.decimals !== undefined && (t.decimals < 0 || t.decimals > 24)) return false;
  if (!t.logo) return false;
  if (!/^[A-Za-z0-9$+\-_.]{2,}$/.test(sym)) return false;
  return true;
}

export function filterPortfolioTokens(
  tokens: PortfolioToken[],
  net: SupportedNetwork,
  opts: FilterOptions = {}
): PortfolioToken[] {
  const { includeZero = false, verifiedOnly = true, heuristics = true } = opts;

  let result = Array.isArray(tokens) ? [...tokens] : [];

  if (!includeZero) {
    const ZERO_EPS = 1e-6; // treat dust <= 1e-6 as zero for UX
    result = result.filter((t) => {
      const bal = typeof t.balance === "number" && Number.isFinite(t.balance)
        ? t.balance
        : t.balanceStr
        ? Number(t.balanceStr)
        : 0;
      return bal > ZERO_EPS;
    });
  }

  // If "verifiedOnly" is enabled, apply conservative heuristics instead of allowlists.
  if (verifiedOnly || heuristics) {
    result = result.filter((t) => {
      if (t.address === "native") return true; // always include native token
      if (!t.symbol || !t.name) return false;
      const sym = t.symbol.trim();
      const nm = t.name.trim();
      if (sym.length === 0 || nm.length === 0) return false;
      if (sym.length > 12) return false;
      if (nm.length > 50) return false;
      if (t.decimals !== undefined && (t.decimals < 0 || t.decimals > 24)) return false;
      if (!t.logo) return false;
      // ASCII-ish symbols only
      if (!/^[A-Za-z0-9$+\-_.]{2,}$/.test(sym)) return false;
      return true;
    });
  }

  return result;
}

// ------------------------------
// Approach 1: Individual RPC Calls via viem
// ------------------------------

const erc20Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

function viemChainFor(net: SupportedNetwork) {
  switch (net) {
    case "mainnet":
      return viemMainnet;
    case "arbitrum":
      return viemArbitrum;
    case "base":
      return viemBase;
    default:
      return viemMainnet;
  }
}

export async function fetchIndividualBalancesViem(
  net: SupportedNetwork,
  owner: string,
  tokenAddresses?: string[]
): Promise<PortfolioToken[]> {
  const rpcUrl = getAlchemyRpcUrl(net);
  const client = createPublicClient({ chain: viemChainFor(net), transport: http(rpcUrl) });
  const list = (tokenAddresses && tokenAddresses.length
    ? tokenAddresses.map((a) => ({ address: a }))
    : []) as { address: string }[];
  const out: PortfolioToken[] = [];

  for (const token of list) {
    const address = token.address as `0x${string}`;
    try {
      // Individual calls per token (baseline)
      const [decimals, symbol, name, raw] = await Promise.all([
        client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
        client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address, abi: erc20Abi, functionName: "name" }),
        client.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [owner as `0x${string}`] }),
      ]);
      const balanceStr = formatUnits(raw as bigint, Number(decimals) || 18);
      const balance = Number(balanceStr);
      out.push({
        address,
        name: String(name),
        symbol: String(symbol),
        balance,
        balanceStr,
        decimals: Number(decimals),
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[portfolio] token read failed", token.address, e);
      continue;
    }
  }

  return out;
}

// ------------------------------
// Approach 2: Batch RPC (Multicall) via viem
// ------------------------------

/**
 * Fetch balances in a single multicall for many ERC‑20 tokens.
 * Metadata (name/symbol/decimals) is expected to come from discovery; this
 * method focuses on balances to reduce RPCs.
 */
export async function fetchBalancesMulticallViem(
  net: SupportedNetwork,
  owner: string,
  tokens: { address: string; decimals?: number }[]
): Promise<PortfolioToken[]> {
  if (!tokens?.length) return [];
  const rpcUrl = getAlchemyRpcUrl(net);
  const client = createPublicClient({ chain: viemChainFor(net), transport: http(rpcUrl) });

  // De‑duplicate addresses (lowercased) to prevent wasted calls.
  const uniqMap = new Map<string, { address: string; decimals?: number }>();
  for (const t of tokens) {
    const k = t.address.toLowerCase();
    if (!uniqMap.has(k)) uniqMap.set(k, t);
  }
  const uniq = Array.from(uniqMap.values());

  // Chunk contracts to avoid overly-large multicalls on some RPCs.
  const BATCH_SIZE = 150;
  const chunks: { address: string; decimals?: number }[][] = [];
  for (let i = 0; i < uniq.length; i += BATCH_SIZE) chunks.push(uniq.slice(i, i + BATCH_SIZE));

  const out: PortfolioToken[] = [];
  // Small concurrency to improve throughput while staying polite to RPC provider.
  const CONCURRENCY = 3;
  let index = 0;
  const worker = async () => {
    while (index < chunks.length) {
      const i = index++;
      const batch = chunks[i];
      const contracts = batch.map((t) => ({
        address: t.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [owner as `0x${string}`],
      }));

      const results = await client.multicall({ contracts, allowFailure: true });
      for (let j = 0; j < batch.length; j++) {
        const meta = batch[j];
        const r = results[j];
        if (!r || r.status !== "success") continue;
        const raw = r.result as bigint;
        const dec = typeof meta.decimals === "number" ? meta.decimals : 18;
        const balanceStr = formatUnits(raw, dec);
        const balance = Number(balanceStr);
        out.push({ address: meta.address, name: "", symbol: "", balance, balanceStr, decimals: dec });
      }
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

// Merge two token arrays by address (lowercased). Prefer values from `fresh`
// for balance-related fields, and preserve presentational metadata from
// `discovered` when available (logo, symbol, name).
export function mergeTokenData(
  discovered: PortfolioToken[],
  fresh: PortfolioToken[]
): PortfolioToken[] {
  const discMap = new Map<string, PortfolioToken>(
    (discovered || []).map((t) => [t.address.toLowerCase(), t])
  );
  const freshMap = new Map<string, PortfolioToken>(
    (fresh || []).map((t) => [t.address.toLowerCase(), t])
  );

  // Only keep addresses that were discovered (preserve ordering)
  const merged: PortfolioToken[] = [];
  for (const t of discovered || []) {
    const key = t.address.toLowerCase();
    const a = discMap.get(key);
    const b = freshMap.get(key);
    if (!a && !b) continue;
    const combined: PortfolioToken = {
      address: (b?.address || a?.address) as string,
      name: (b?.name || a?.name) as string,
      symbol: (b?.symbol || a?.symbol) as string,
      logo: a?.logo || b?.logo,
      balance: (b?.balance ?? a?.balance ?? 0) as number,
      balanceStr: b?.balanceStr || a?.balanceStr,
      decimals: b?.decimals ?? a?.decimals,
    };
    merged.push(combined);
  }
  return merged;
}

// Placeholder for other approaches
export async function fetchBatchBalances(/* args */) {
  return [];
}

export async function fetchSmartContractBalances(/* args */) {
  return [];
}
