"use client";

import { useState, useEffect, useMemo } from "react";
import { SlideTabs } from "@/app/components/SlideTabs";
import ConnectButtonCustom from "@/app/components/ConnectButton";
import { useAccount } from "wagmi";
import TokensList from "../components/TokensList";
import { fetchIndividualBalancesViem, fetchBalancesMulticallViem, fetchNativeToken, discoverOwnedTokens, mergeTokenData, isLikelyValidToken } from "@/app/lib/portfolio";
import { isAddress } from "viem"; // via viem docs: https://viem.sh/docs/utilities/address#isaddress
import NetworkSelector, { type NetworkKey } from "@/app/components/NetworkSelector";
import { getAlchemyClient } from "@/app/lib/alchemy";
import { useQuery, useQueryClient } from "@tanstack/react-query"; // via TanStack Query docs
import { filterPortfolioTokens } from "@/app/lib/portfolio";
import { fetchErc20Prices, fetchNativeEthPrice, fetchTokenLogos } from "@/app/lib/prices";

  const approaches = ["Individual", "Batch RPC", "Smart Contract"];

async function fetchApproach1Core(
  net: NetworkKey,
  address: string
) {
  const client = getAlchemyClient(net);

  const t0 = performance.now();
  // 1) Discover tokens via Alchemy indexer
  const discoveredRaw = await discoverOwnedTokens(client, address);
  // Mark spam by inverse of heuristics (always compute spam; we will still show them)
  const discovered = (discoveredRaw || []).map((t: any) => ({
    ...t,
    spam: !isLikelyValidToken(t),
  }));

  // 2) Filter first
  const filtered = filterPortfolioTokens(discovered as any, net, {
    includeZero: false,
    verifiedOnly: false,
    heuristics: false,
  });

  // 3) Individual RPC calls (per token) via viem
  const filteredAddrs = filtered
    .filter((t) => t.address && t.address !== "native" && !t.spam)
    .map((t) => String(t.address));
  console.log(`[approach1] ${net} filtered ERC20 addresses:`, filteredAddrs);
  const erc20 = await fetchIndividualBalancesViem(net, address, filteredAddrs);

  // Merge by address, prioritizing individual results, but preserve metadata like logo from discovery
  const merged = mergeTokenData(
    filtered.filter((t: any) => t.address && t.address !== "native" && !t.spam),
    erc20
  );

  // Native token
  const native = await fetchNativeToken(client, address, net);
  const spamOnes = filtered.filter((t: any) => t.spam);
  const combined = [native, ...merged, ...spamOnes];

  // Final pass to ensure includeZero also applies to native & post-merge values
  const finalTokens = filterPortfolioTokens(combined as any, net, {
    includeZero: false,
    verifiedOnly: false,
    heuristics: false,
  });

  const elapsedMs = Math.round(performance.now() - t0);
  const rpcCalls = 1 /* discovery */ + filteredAddrs.length * 4 /* per token */ + 1 /* native */;

  return { tokens: finalTokens, perf: { ms: elapsedMs, rpc: rpcCalls } } as const;
}

function Approach1({ address, net, hideSpam }: { address: string; net: NetworkKey; hideSpam: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["portfolio", "individual", net, address],
    enabled: Boolean(address),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30, // 30 minutes in cache
    refetchOnWindowFocus: false,
    queryFn: async () => fetchApproach1Core(net, address),
  });

  const tokens = data?.tokens ?? [];
  const viewTokens = useMemo(
    () => (hideSpam ? (tokens || []).filter((t: any) => !t.spam) : tokens || []),
    [tokens, hideSpam]
  );
  const contracts = useMemo(
    () =>
      (viewTokens || [])
        .filter((t: any) => t.address && t.address !== "native" && !t.spam)
        .map((t: any) => String(t.address).toLowerCase()),
    [viewTokens]
  );

  const { data: erc20Prices, isFetching: isFetchingErc20 } = useQuery({
    queryKey: ["prices-erc20", net, [...contracts].sort().join(",")],
    enabled: contracts.length > 0,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    queryFn: async () => fetchErc20Prices(net, contracts),
  });

  const { data: nativePrice, isFetching: isFetchingNative } = useQuery({
    queryKey: ["price-native"],
    enabled: true,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    placeholderData: () => queryClient.getQueryData(["price-native"]) as any,
    queryFn: async () => fetchNativeEthPrice(),
  });

  // No pricing perf caption or live polling (performance-focused)


  const missingLogos = useMemo(
    () =>
      (viewTokens || [])
        .filter((t: any) => t.address && t.address !== "native" && !t.logo && !t.spam)
        .map((t: any) => String(t.address).toLowerCase()),
    [viewTokens]
  );

  const { data: logoMap } = useQuery({
    queryKey: ["logos", net, [...missingLogos].sort().join(",")],
    enabled: missingLogos.length > 0,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    queryFn: async () => fetchTokenLogos(net, missingLogos),
  });

  const items = useMemo(() => {
    const erc20Map = erc20Prices ?? {};
    const NATIVE_ICON = "/icons/eth.svg";
    const explorerBase = net === "mainnet" ? "https://etherscan.io" : net === "base" ? "https://basescan.org" : "https://arbiscan.io";
    const rows = (viewTokens || []).map((t: any) => {
      const base = {
        symbol: t.symbol ?? "",
        name: t.name ?? undefined,
        balance: typeof t.balance === "number" ? t.balance : Number(t.balance ?? 0),
        balanceDisplay: typeof t.balanceStr === "string" ? t.balanceStr : undefined,
        icon:
          t.address === "native"
            ? NATIVE_ICON
            : t.logo || (logoMap ? (logoMap as any)[String(t.address).toLowerCase()] : undefined),
        href:
          t.address === "native"
            ? "https://www.coingecko.com/en/coins/ethereum"
            : t.address
            ? `${explorerBase}/address/${String(t.address).toLowerCase()}`
            : undefined,
        // Do not skeleton native row; show value as soon as available
        loading: t.address === "native" ? false : isFetchingErc20,
        spam: Boolean(t.spam),
        noPrice: false,
      } as any;

      if (t.address === "native") {
        if (nativePrice && typeof nativePrice.usd === "number") {
          const price = nativePrice.usd;
          const change = nativePrice.usd_24h_change;
          return {
            ...base,
            price,
            change24h: typeof change === "number" ? Number(change.toFixed(2)) : 0,
            usdValue: price * base.balance,
          };
        }
        return { ...base };
      }

      const key = String(t.address).toLowerCase();
      const entry = (erc20Map as any)[key] as { usd?: number; usd_24h_change?: number } | undefined;
      if (entry && typeof entry.usd === "number") {
        const price = entry.usd;
        const change = entry.usd_24h_change;
        return {
          ...base,
          price,
          change24h: typeof change === "number" ? Number(change.toFixed(2)) : 0,
          usdValue: price * base.balance,
        };
      }
      // If ERC20 pricing fetch is not in-flight and no entry exists, mark as noPrice
      return { ...base, noPrice: !isFetchingErc20 };
    });
    // Sort by usdValue desc; undefined or spam at the end
    rows.sort((a: any, b: any) => {
      const av = a.spam ? -Infinity : (typeof a.usdValue === 'number' ? a.usdValue : -Infinity);
      const bv = b.spam ? -Infinity : (typeof b.usdValue === 'number' ? b.usdValue : -Infinity);
      return bv - av;
    });
    return rows;
  }, [viewTokens, erc20Prices, nativePrice, logoMap, isFetchingErc20, isFetchingNative, net]);

  return (
    <div>
      <h2 className="font-heading text-lg mb-2">{address}</h2>
      {error && (
        <p className="text-sm text-red-600 mb-2">Failed to fetch balances</p>
      )}
      {isLoading ? (
        <p className="text-sm text-gray-600">Loading balances…</p>
      ) : (
        <>
          {data?.perf && (
            <div className="mb-2 flex justify-end">
              <p className="text-xs text-gray-600">
                Approach: Individual — {data.perf.ms}ms, ~{data.perf.rpc} RPC
              </p>
            </div>
          )}
          {/* Pricing perf caption removed for performance */}
          <TokensList items={items} loadingPrices={isFetchingErc20 || isFetchingNative} />
        </>
      )}
    </div>
  );
}

// ---------------------
// Approach 2 Component
// ---------------------
function Approach2({ address, net, hideSpam }: { address: string; net: NetworkKey; hideSpam: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["portfolio", "batch", net, address],
    enabled: Boolean(address),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const client = getAlchemyClient(net);
      const t0 = performance.now();
      const discoveredRaw = await discoverOwnedTokens(client, address);
      const discovered = (discoveredRaw || []).map((t: any) => ({ ...t, spam: !isLikelyValidToken(t) }));
      const filtered = filterPortfolioTokens(discovered as any, net, { includeZero: false, verifiedOnly: false, heuristics: false });

      const nonSpam = filtered.filter((t: any) => t.address && t.address !== "native" && !t.spam);
      const balances = await fetchBalancesMulticallViem(
        net,
        address,
        nonSpam.map((t: any) => ({ address: t.address as string, decimals: t.decimals }))
      );
      const merged = mergeTokenData(nonSpam as any, balances);
      const native = await fetchNativeToken(client, address, net);
      const spamOnes = filtered.filter((t: any) => t.spam);
      const combined = [native, ...merged, ...spamOnes];
      const finalTokens = filterPortfolioTokens(combined as any, net, { includeZero: false, verifiedOnly: false, heuristics: false });
      const elapsedMs = Math.round(performance.now() - t0);
      const MULTICALL_BATCH = 150;
      const approxRpc = 1 /* discovery */ + Math.max(1, Math.ceil(nonSpam.length / MULTICALL_BATCH)) /* multicall chunks */ + 1 /* native */;
      return { tokens: finalTokens, perf: { ms: elapsedMs, rpc: approxRpc } } as const;
    },
  });

  const tokens = data?.tokens ?? [];
  const viewTokens = useMemo(() => (hideSpam ? (tokens || []).filter((t: any) => !t.spam) : tokens || []), [tokens, hideSpam]);
  const contracts = useMemo(
    () =>
      (viewTokens || [])
        .filter((t: any) => t.address && t.address !== "native" && !t.spam)
        .map((t: any) => String(t.address).toLowerCase()),
    [viewTokens]
  );

  // Pricing perf caption removed (perf-focused)
  const contractsKey = useMemo(() => [...contracts].sort().join(","), [contracts]);
  const { data: erc20Prices, isFetching: isFetchingErc20 } = useQuery({
    queryKey: ["prices-erc20", net, contractsKey],
    enabled: (() => {
      if (contracts.length === 0) return false;
      const st = queryClient.getQueryState(["prices-erc20", net, contractsKey]);
      return !st || st.status !== "success";
    })(),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    placeholderData: () => queryClient.getQueryData(["prices-erc20", net, contractsKey]) as any,
    queryFn: async () => {
      return fetchErc20Prices(net, contracts);
    },
  });

  // Read cached perf for consistency (no fetch)
  // Pricing perf caption removed; no cached perf reads

  const { data: nativePrice, isFetching: isFetchingNative } = useQuery({
    queryKey: ["price-native"],
    enabled: true,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    placeholderData: () => queryClient.getQueryData(["price-native"]) as any,
    queryFn: async () => fetchNativeEthPrice(),
  });

  // No live polling for pricing progress

  const missingLogos = useMemo(
    () =>
      (viewTokens || [])
        .filter((t: any) => t.address && t.address !== "native" && !t.logo && !t.spam)
        .map((t: any) => String(t.address).toLowerCase()),
    [viewTokens]
  );

  const { data: logoMap } = useQuery({
    queryKey: ["logos", net, [...missingLogos].sort().join(",")],
    enabled: missingLogos.length > 0,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    queryFn: async () => fetchTokenLogos(net, missingLogos),
  });

  const items = useMemo(() => {
    const erc20Map = erc20Prices ?? {};
    const NATIVE_ICON = "/icons/eth.svg";
    const explorerBase = net === "mainnet" ? "https://etherscan.io" : net === "base" ? "https://basescan.org" : "https://arbiscan.io";
    const totalTokensIncludingEth = (viewTokens || []).filter((t: any) => t.address && t.address !== "native" && !t.spam).length + 1;
    const rows = (viewTokens || []).map((t: any) => {
      const base = {
        symbol: t.symbol ?? "",
        name: t.name ?? undefined,
        balance: typeof t.balance === "number" ? t.balance : Number(t.balance ?? 0),
        balanceDisplay: typeof t.balanceStr === "string" ? t.balanceStr : undefined,
        icon:
          t.address === "native"
            ? NATIVE_ICON
            : t.logo || (logoMap ? (logoMap as any)[String(t.address).toLowerCase()] : undefined),
        href:
          t.address === "native"
            ? "https://www.coingecko.com/en/coins/ethereum"
            : t.address
            ? `${explorerBase}/address/${String(t.address).toLowerCase()}`
            : undefined,
        loading: t.address === "native" ? false : isFetchingErc20,
        spam: Boolean(t.spam),
        noPrice: false,
      } as any;

      if (t.address === "native") {
        if (nativePrice && typeof nativePrice.usd === "number") {
          const price = nativePrice.usd;
          const change = nativePrice.usd_24h_change;
          return { ...base, price, change24h: typeof change === "number" ? Number(change.toFixed(2)) : 0, usdValue: price * base.balance };
        }
        return { ...base };
      }

      const key = String(t.address).toLowerCase();
      const entry = (erc20Map as any)[key] as { usd?: number; usd_24h_change?: number } | undefined;
      if (entry && typeof entry.usd === "number") {
        const price = entry.usd;
        const change = entry.usd_24h_change;
        return { ...base, price, change24h: typeof change === "number" ? Number(change.toFixed(2)) : 0, usdValue: price * base.balance };
      }
      return { ...base, noPrice: !isFetchingErc20 };
    });

    rows.sort((a: any, b: any) => {
      const av = a.spam ? -Infinity : typeof a.usdValue === "number" ? a.usdValue : -Infinity;
      const bv = b.spam ? -Infinity : typeof b.usdValue === "number" ? b.usdValue : -Infinity;
      return bv - av;
    });
    return rows;
  }, [viewTokens, erc20Prices, nativePrice, logoMap, isFetchingErc20, isFetchingNative, net]);

  const totalTokensIncludingEth = useMemo(() => {
    const ercCount = (viewTokens || []).filter((t: any) => t.address && t.address !== "native" && !t.spam).length;
    return ercCount + 1;
  }, [viewTokens]);

  return (
    <div>
      <h2 className="font-heading text-lg mb-2">{address}</h2>
      {error && <p className="text-sm text-red-600 mb-2">Failed to fetch balances</p>}
      {isLoading ? (
        <p className="text-sm text-gray-600">Loading balances…</p>
      ) : (
        <>
          {data?.perf && (
            <div className="mb-2 flex justify-end">
              <p className="text-xs text-gray-600">Approach: Batch RPC — {data.perf.ms}ms, ~{data.perf.rpc} RPC</p>
            </div>
          )}
          {/* Pricing perf caption removed for performance */}
          <TokensList items={items} loadingPrices={isFetchingErc20 || isFetchingNative} />
        </>
      )}
    </div>
  );
}

// ---------------------
// Approach 3 Component
// ---------------------
function Approach3() {
  return (
    <div>
      <h2 className="font-heading text-lg mb-2">Approach 3: Smart Contract</h2>
      <p className="font-body text-black">
        Here you will implement batch balance fetch via a Solidity contract.
      </p>
    </div>
  );
}

// ---------------------
// Main Page
// ---------------------
export default function Challenge1Page() {
  const [active, setActive] = useState(0);
  // Search text (what user types)
  const [searchText, setSearchText] = useState("");
  // Address to query (set only on Search submit)
  const [queryAddress, setQueryAddress] = useState<string>("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkKey>("mainnet");
  const { address: connectedAddress } = useAccount();
  const [hideSpam, setHideSpam] = useState(true);
  // removed Show zero balances feature for now

  const effectiveAddress = queryAddress;

  // Prefetch Approach 1 for all networks on search submit to make switching instant.
  const qMain = useQuery({
    queryKey: ["portfolio", "individual", "mainnet", effectiveAddress],
    enabled: Boolean(effectiveAddress),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    queryFn: async () => fetchApproach1Core("mainnet", effectiveAddress!),
  });
  const qArb = useQuery({
    queryKey: ["portfolio", "individual", "arbitrum", effectiveAddress],
    enabled: Boolean(effectiveAddress),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    queryFn: async () => fetchApproach1Core("arbitrum", effectiveAddress!),
  });

  return (
    <div className="min-h-screen bg-white text-black font-body">
      {/* Navbar */}
      <nav className="flex justify-between items-center px-6 py-4 border-b border-gray-400">
        <h1 className="font-heading text-xl">Challenge 1: Portfolio Indexer</h1>
        <ConnectButtonCustom />
      </nav>

      <main className="p-6">
        {/* 🔎 Global Search Bar + Switch */}
        <div className="flex items-center justify-between mb-6 gap-4">
          {/* Search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearchError(null);
              const trimmed = searchText.trim();
              if (trimmed && isAddress(trimmed)) {
                setQueryAddress(trimmed);
                return;
              }
              if (!trimmed && connectedAddress) {
                setQueryAddress(connectedAddress);
                return;
              }
              setQueryAddress("");
              setSearchError("Enter a valid address or connect a wallet");
            }}
            className="flex items-center gap-2 flex-1"
          >
            <input
              type="text"
              placeholder="Enter wallet address..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full md:w-[400px] px-4 py-2 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition cursor-pointer"
            >
              Search
            </button>
          </form>
          {searchError && (
            <p className="text-xs text-red-600 ml-2">{searchError}</p>
          )}

          {/* Network Selector + Filter + Switch (SlideTabs) */}
          <div className="flex items-center gap-4 shrink-0">
            <NetworkSelector value={network} onChange={setNetwork} />
            <label className="flex items-center gap-2 text-sm text-black">
              <input
                type="checkbox"
                className="accent-black cursor-pointer"
                checked={hideSpam}
                onChange={(e) => setHideSpam(e.target.checked)}
              />
              Hide Spam Tokens
            </label>
            <SlideTabs tabs={approaches} onTabClick={(index) => setActive(index)} />
          </div>
        </div>

        {/* Render approaches */}
        {active === 0 && effectiveAddress && (
          <Approach1 address={effectiveAddress} net={network} hideSpam={hideSpam} />
        )}
        {active === 1 && effectiveAddress && (
          <Approach2 address={effectiveAddress} net={network} hideSpam={hideSpam} />
        )}
        {active === 2 && <Approach3 />}
      </main>
    </div>
  );
}
