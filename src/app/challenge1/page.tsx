"use client";

import { useState, useEffect, useMemo } from "react";
import Background from "../components/Background";
import StaggeredMenu from "../components/Menu";
import { SlideTabs } from "@/app/components/SlideTabs";
import ConnectButtonCustom from "@/app/components/ConnectButton";
import { useAccount } from "wagmi";
import TokensList from "../components/TokensList";
import {
  fetchIndividualBalancesViem,
  fetchBalancesMulticallViem,
  fetchNativeToken,
  discoverOwnedTokens,
  mergeTokenData,
  isLikelyValidToken,
  fetchSmartContractBalances,
} from "@/app/lib/portfolio";
import { isAddress } from "viem"; // via viem docs: https://viem.sh/docs/utilities/address#isaddress
import NetworkSelector, {
  type NetworkKey,
} from "@/app/components/NetworkSelector";
import { getAlchemyClient } from "@/app/lib/alchemy";
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query"; // via TanStack Query v5: https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5#removal-of-keeppreviousdata
import { filterPortfolioTokens } from "@/app/lib/portfolio";
import { resolveEnsAddress, resolveEnsName } from "@/app/lib/ens";
import {
  fetchErc20Prices,
  fetchNativeEthPrice,
  fetchTokenLogos,
} from "@/app/lib/prices";

const approaches = ["Individual", "Batch RPC", "Smart Contract"];

const menuItems = [
  { label: "Home", ariaLabel: "Go to home page", link: "/" },
  { label: "Challenge", ariaLabel: "Challenge 1", link: "/challenge1" },
  { label: "Challenge", ariaLabel: "Challenge 2", link: "/challenge2" },
  { label: "Challenge", ariaLabel: "Challenge 3", link: "/challenge3" },
  { label: "Challenge", ariaLabel: "Challenge 4", link: "/challenge4" },
];

const socialItems = [
  { label: "Twitter", link: "https://twitter.com" },
  { label: "GitHub", link: "https://github.com/alkautsarf/" },
  { label: "LinkedIn", link: "https://linkedin.com/in/alkautsar-f" },
];

async function fetchApproach1Core(net: NetworkKey, address: string) {
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
  const rpcCalls =
    1 /* discovery */ +
    filteredAddrs.length * 4 /* per token */ +
    1; /* native */

  return {
    tokens: finalTokens,
    perf: { ms: elapsedMs, rpc: rpcCalls },
  } as const;
}

function Approach1({
  address,
  net,
  hideSpam,
}: {
  address: string;
  net: NetworkKey;
  hideSpam: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: ensName } = useQuery({
    queryKey: ["ens-name", address],
    enabled: Boolean(address) && isAddress(address),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => resolveEnsName(address),
  });
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
    () =>
      hideSpam ? (tokens || []).filter((t: any) => !t.spam) : tokens || [],
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
    placeholderData: keepPreviousData,
    queryFn: async () => fetchErc20Prices(net, contracts),
  });

  const { data: nativePrice, isFetching: isFetchingNative } = useQuery({
    queryKey: ["price-native"],
    enabled: true,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: async () => fetchNativeEthPrice(),
  });

  // No pricing perf caption or live polling (performance-focused)

  const missingLogos = useMemo(
    () =>
      (viewTokens || [])
        .filter(
          (t: any) => t.address && t.address !== "native" && !t.logo && !t.spam
        )
        .map((t: any) => String(t.address).toLowerCase()),
    [viewTokens]
  );

  const { data: logoMap } = useQuery({
    queryKey: ["logos", net, [...missingLogos].sort().join(",")],
    enabled: missingLogos.length > 0,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: async () => fetchTokenLogos(net, missingLogos),
  });

  const items = useMemo(() => {
    const erc20Map = erc20Prices ?? {};
    const NATIVE_ICON = "/icons/eth.svg";
    const explorerBase =
      net === "mainnet"
        ? "https://etherscan.io"
        : net === "base"
        ? "https://basescan.org"
        : "https://arbiscan.io";
    const rows = (viewTokens || []).map((t: any) => {
      const base = {
        symbol: t.symbol ?? "",
        name: t.name ?? undefined,
        balance:
          typeof t.balance === "number" ? t.balance : Number(t.balance ?? 0),
        balanceDisplay:
          typeof t.balanceStr === "string" ? t.balanceStr : undefined,
        icon:
          t.address === "native"
            ? NATIVE_ICON
            : t.logo ||
              (logoMap
                ? (logoMap as any)[String(t.address).toLowerCase()]
                : undefined),
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
            change24h:
              typeof change === "number" ? Number(change.toFixed(2)) : 0,
            usdValue: price * base.balance,
          };
        }
        return { ...base };
      }

      const key = String(t.address).toLowerCase();
      const entry = (erc20Map as any)[key] as
        | { usd?: number; usd_24h_change?: number }
        | undefined;
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
      const av = a.spam
        ? -Infinity
        : typeof a.usdValue === "number"
        ? a.usdValue
        : -Infinity;
      const bv = b.spam
        ? -Infinity
        : typeof b.usdValue === "number"
        ? b.usdValue
        : -Infinity;
      return bv - av;
    });
    return rows;
  }, [
    viewTokens,
    erc20Prices,
    nativePrice,
    logoMap,
    isFetchingErc20,
    isFetchingNative,
    net,
  ]);

  return (
    <div>
      {error && (
        <p className="text-sm text-red-600 mb-2">Failed to fetch balances</p>
      )}
      {isLoading ? (
        <p className="text-sm text-gray-600">Loading balances…</p>
      ) : (
        <>
          {data?.perf && (
            <div className="mb-2 flex justify-end">
              <p className="text-s text-gray-600">
                Approach: Individual — {data.perf.ms}ms, ~{data.perf.rpc} RPC
              </p>
            </div>
          )}
          {/* Pricing perf caption removed for performance */}
          <TokensList
            items={items}
            loadingPrices={isFetchingErc20 || isFetchingNative}
          />
        </>
      )}
    </div>
  );
}

// ---------------------
// Approach 2 Component
// ---------------------
function Approach2({
  address,
  net,
  hideSpam,
}: {
  address: string;
  net: NetworkKey;
  hideSpam: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: ensName } = useQuery({
    queryKey: ["ens-name", address],
    enabled: Boolean(address) && isAddress(address),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => resolveEnsName(address),
  });
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
      const discovered = (discoveredRaw || []).map((t: any) => ({
        ...t,
        spam: !isLikelyValidToken(t),
      }));
      const filtered = filterPortfolioTokens(discovered as any, net, {
        includeZero: false,
        verifiedOnly: false,
        heuristics: false,
      });

      const nonSpam = filtered.filter(
        (t: any) => t.address && t.address !== "native" && !t.spam
      );
      const balances = await fetchBalancesMulticallViem(
        net,
        address,
        nonSpam.map((t: any) => ({
          address: t.address as string,
          decimals: t.decimals,
        }))
      );
      const merged = mergeTokenData(nonSpam as any, balances);
      const native = await fetchNativeToken(client, address, net);
      const spamOnes = filtered.filter((t: any) => t.spam);
      const combined = [native, ...merged, ...spamOnes];
      const finalTokens = filterPortfolioTokens(combined as any, net, {
        includeZero: false,
        verifiedOnly: false,
        heuristics: false,
      });
      const elapsedMs = Math.round(performance.now() - t0);
      // Keep caption estimate aligned with lib's adaptive batch sizing
      const chooseBatchSize = (n: number) =>
        n <= 12 ? n : n <= 60 ? 40 : n <= 200 ? 100 : 120;
      const MULTICALL_BATCH = chooseBatchSize(nonSpam.length);
      const approxRpc =
        1 /* discovery */ +
        Math.max(
          1,
          Math.ceil(nonSpam.length / MULTICALL_BATCH)
        ) /* multicall chunks */ +
        1; /* native */
      return {
        tokens: finalTokens,
        perf: { ms: elapsedMs, rpc: approxRpc },
      } as const;
    },
  });

  const tokens = data?.tokens ?? [];
  const viewTokens = useMemo(
    () =>
      hideSpam ? (tokens || []).filter((t: any) => !t.spam) : tokens || [],
    [tokens, hideSpam]
  );
  const contracts = useMemo(
    () =>
      (viewTokens || [])
        .filter((t: any) => t.address && t.address !== "native" && !t.spam)
        .map((t: any) => String(t.address).toLowerCase()),
    [viewTokens]
  );

  // Pricing perf caption removed (perf-focused)
  const contractsKey = useMemo(
    () => [...contracts].sort().join(","),
    [contracts]
  );
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
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
    queryFn: async () => fetchNativeEthPrice(),
  });

  // No live polling for pricing progress

  const missingLogos = useMemo(
    () =>
      (viewTokens || [])
        .filter(
          (t: any) => t.address && t.address !== "native" && !t.logo && !t.spam
        )
        .map((t: any) => String(t.address).toLowerCase()),
    [viewTokens]
  );

  const { data: logoMap } = useQuery({
    queryKey: ["logos", net, [...missingLogos].sort().join(",")],
    enabled: missingLogos.length > 0,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: async () => fetchTokenLogos(net, missingLogos),
  });

  const items = useMemo(() => {
    const erc20Map = erc20Prices ?? {};
    const NATIVE_ICON = "/icons/eth.svg";
    const explorerBase =
      net === "mainnet"
        ? "https://etherscan.io"
        : net === "base"
        ? "https://basescan.org"
        : "https://arbiscan.io";
    const totalTokensIncludingEth =
      (viewTokens || []).filter(
        (t: any) => t.address && t.address !== "native" && !t.spam
      ).length + 1;
    const rows = (viewTokens || []).map((t: any) => {
      const base = {
        symbol: t.symbol ?? "",
        name: t.name ?? undefined,
        balance:
          typeof t.balance === "number" ? t.balance : Number(t.balance ?? 0),
        balanceDisplay:
          typeof t.balanceStr === "string" ? t.balanceStr : undefined,
        icon:
          t.address === "native"
            ? NATIVE_ICON
            : t.logo ||
              (logoMap
                ? (logoMap as any)[String(t.address).toLowerCase()]
                : undefined),
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
          return {
            ...base,
            price,
            change24h:
              typeof change === "number" ? Number(change.toFixed(2)) : 0,
            usdValue: price * base.balance,
          };
        }
        return { ...base };
      }

      const key = String(t.address).toLowerCase();
      const entry = (erc20Map as any)[key] as
        | { usd?: number; usd_24h_change?: number }
        | undefined;
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
      return { ...base, noPrice: !isFetchingErc20 };
    });

    rows.sort((a: any, b: any) => {
      const av = a.spam
        ? -Infinity
        : typeof a.usdValue === "number"
        ? a.usdValue
        : -Infinity;
      const bv = b.spam
        ? -Infinity
        : typeof b.usdValue === "number"
        ? b.usdValue
        : -Infinity;
      return bv - av;
    });
    return rows;
  }, [
    viewTokens,
    erc20Prices,
    nativePrice,
    logoMap,
    isFetchingErc20,
    isFetchingNative,
    net,
  ]);

  const totalTokensIncludingEth = useMemo(() => {
    const ercCount = (viewTokens || []).filter(
      (t: any) => t.address && t.address !== "native" && !t.spam
    ).length;
    return ercCount + 1;
  }, [viewTokens]);

  return (
    <div>
      {error && (
        <p className="text-sm text-red-600 mb-2">Failed to fetch balances</p>
      )}
      {isLoading ? (
        <p className="text-sm text-gray-600">Loading balances…</p>
      ) : (
        <>
          {data?.perf && (
            <div className="mb-2 flex justify-end">
              <p className="text-s text-gray-600">
                Approach: Batch RPC — {data.perf.ms}ms, ~{data.perf.rpc} RPC
              </p>
            </div>
          )}
          {/* Pricing perf caption removed for performance */}
          <TokensList
            items={items}
            loadingPrices={isFetchingErc20 || isFetchingNative}
          />
        </>
      )}
    </div>
  );
}

// ---------------------
// Approach 3 Component
// ---------------------
function Approach3({
  address,
  net,
  hideSpam,
}: {
  address: string;
  net: NetworkKey;
  hideSpam: boolean;
}) {
  const queryClient = useQueryClient();
  const reader = process.env.NEXT_PUBLIC_C1_ADDRESS;
  const { data: ensName } = useQuery({
    queryKey: ["ens-name", address],
    enabled: Boolean(address) && isAddress(address),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => resolveEnsName(address),
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ["portfolio", "contract", net, address],
    enabled: Boolean(address) && Boolean(reader),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!reader) throw new Error("BalanceReader address not configured");
      const client = getAlchemyClient(net);
      const t0 = performance.now();
      const discoveredRaw = await discoverOwnedTokens(client, address);
      const discovered = (discoveredRaw || []).map((t: any) => ({
        ...t,
        spam: !isLikelyValidToken(t),
      }));
      const filtered = filterPortfolioTokens(discovered as any, net, {
        includeZero: false,
        verifiedOnly: false,
        heuristics: false,
      });

      const nonSpam = filtered.filter(
        (t: any) => t.address && t.address !== "native" && !t.spam
      );
      const balances = await fetchSmartContractBalances(
        net,
        address,
        nonSpam.map((t: any) => ({
          address: t.address as string,
          decimals: t.decimals,
        })),
        reader as string
      );
      const merged = mergeTokenData(nonSpam as any, balances);
      const native = await fetchNativeToken(client, address, net);
      const spamOnes = filtered.filter((t: any) => t.spam);
      const combined = [native, ...merged, ...spamOnes];
      const finalTokens = filterPortfolioTokens(combined as any, net, {
        includeZero: false,
        verifiedOnly: false,
        heuristics: false,
      });
      const elapsedMs = Math.round(performance.now() - t0);
      const chooseBatchSize = (n: number) =>
        n <= 12 ? n : n <= 60 ? 40 : n <= 200 ? 100 : 120;
      const approxRpc =
        1 /* discovery */ +
        Math.max(
          1,
          Math.ceil(nonSpam.length / chooseBatchSize(nonSpam.length))
        ) /* contract batches */ +
        1; /* native */
      return {
        tokens: finalTokens,
        perf: { ms: elapsedMs, rpc: approxRpc },
      } as const;
    },
  });

  const tokens = data?.tokens ?? [];
  const viewTokens = useMemo(
    () =>
      hideSpam ? (tokens || []).filter((t: any) => !t.spam) : tokens || [],
    [tokens, hideSpam]
  );
  const contracts = useMemo(
    () =>
      (viewTokens || [])
        .filter((t: any) => t.address && t.address !== "native" && !t.spam)
        .map((t: any) => String(t.address).toLowerCase()),
    [viewTokens]
  );

  const contractsKey = useMemo(
    () => [...contracts].sort().join(","),
    [contracts]
  );
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
    placeholderData: keepPreviousData,
    queryFn: async () => fetchErc20Prices(net, contracts),
  });

  const { data: nativePrice, isFetching: isFetchingNative } = useQuery({
    queryKey: ["price-native"],
    enabled: true,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: async () => fetchNativeEthPrice(),
  });

  const missingLogos = useMemo(
    () =>
      (viewTokens || [])
        .filter(
          (t: any) => t.address && t.address !== "native" && !t.logo && !t.spam
        )
        .map((t: any) => String(t.address).toLowerCase()),
    [viewTokens]
  );

  const { data: logoMap } = useQuery({
    queryKey: ["logos", net, [...missingLogos].sort().join(",")],
    enabled: missingLogos.length > 0,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: async () => fetchTokenLogos(net, missingLogos),
  });

  const items = useMemo(() => {
    const erc20Map = erc20Prices ?? {};
    const NATIVE_ICON = "/icons/eth.svg";
    const explorerBase =
      net === "mainnet"
        ? "https://etherscan.io"
        : net === "base"
        ? "https://basescan.org"
        : "https://arbiscan.io";
    const rows = (viewTokens || []).map((t: any) => {
      const base = {
        symbol: t.symbol ?? "",
        name: t.name ?? undefined,
        balance:
          typeof t.balance === "number" ? t.balance : Number(t.balance ?? 0),
        balanceDisplay:
          typeof t.balanceStr === "string" ? t.balanceStr : undefined,
        icon:
          t.address === "native"
            ? NATIVE_ICON
            : t.logo ||
              (logoMap
                ? (logoMap as any)[String(t.address).toLowerCase()]
                : undefined),
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
          return {
            ...base,
            price,
            change24h:
              typeof change === "number" ? Number(change.toFixed(2)) : 0,
            usdValue: price * base.balance,
          };
        }
        return { ...base };
      }

      const key = String(t.address).toLowerCase();
      const entry = (erc20Map as any)[key] as
        | { usd?: number; usd_24h_change?: number }
        | undefined;
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
      return { ...base, noPrice: !isFetchingErc20 };
    });

    rows.sort((a: any, b: any) => {
      const av = a.spam
        ? -Infinity
        : typeof a.usdValue === "number"
        ? a.usdValue
        : -Infinity;
      const bv = b.spam
        ? -Infinity
        : typeof b.usdValue === "number"
        ? b.usdValue
        : -Infinity;
      return bv - av;
    });
    return rows;
  }, [
    viewTokens,
    erc20Prices,
    nativePrice,
    logoMap,
    isFetchingErc20,
    isFetchingNative,
    net,
  ]);

  return (
    <div>
      {(!reader || error) && (
        <p className="text-sm text-red-600 mb-2">
          {!reader
            ? "Missing BalanceReader address"
            : "Failed to fetch balances"}
        </p>
      )}
      {isLoading ? (
        <p className="text-sm text-gray-600">Loading balances…</p>
      ) : (
        <>
          {data?.perf && (
            <div className="mb-2 flex justify-end">
              <p className="text-s text-gray-600">
                Approach: Smart Contract — {data.perf.ms}ms, ~{data.perf.rpc}{" "}
                RPC
              </p>
            </div>
          )}
          <TokensList
            items={items}
            loadingPrices={isFetchingErc20 || isFetchingNative}
          />
        </>
      )}
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

  // Use connected wallet as default effective address when no explicit query submitted
  const effectiveAddress = useMemo(
    () =>
      queryAddress && queryAddress.length > 0
        ? queryAddress
        : connectedAddress ?? "",
    [queryAddress, connectedAddress]
  );

  // Resolve ENS for connected wallet (used as small label in navbar)
  const { data: connectedEns } = useQuery({
    queryKey: ["ens-name", connectedAddress],
    enabled: Boolean(connectedAddress) && isAddress(connectedAddress as string),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => resolveEnsName(connectedAddress as string),
  });

  // Prefill search with connected identity (ENS preferred), without stomping user input.
  // If the field currently shows the raw connected address and ENS resolves later, update to ENS.
  useEffect(() => {
    if (!connectedAddress) return;
    setSearchText((prev) => {
      if (connectedEns) {
        if (!prev || prev === connectedAddress) return connectedEns;
        return prev;
      }
      return prev && prev.trim().length > 0 ? prev : connectedAddress;
    });
  }, [connectedAddress, connectedEns]);

  // Truncate address visually in the input when not focused; keep full value in state.
  const [searchFocused, setSearchFocused] = useState(false);
  const displaySearchText = useMemo(() => {
    if (searchFocused) return searchText;
    if (connectedEns && searchText === connectedEns) return searchText;
    if (
      connectedAddress &&
      isAddress(searchText) &&
      searchText.toLowerCase() === connectedAddress.toLowerCase()
    ) {
      return `${searchText.slice(0, 6)}…${searchText.slice(-4)}`;
    }
    return searchText;
  }, [searchText, searchFocused, connectedAddress, connectedEns]);

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
    <div className="relative min-h-screen bg-white text-black font-body">
      {/* Overlay Staggered Menu */}
      <div className="fixed inset-0 z-40 pointer-events-none">
        <StaggeredMenu
          position="right"
          items={menuItems}
          socialItems={socialItems}
          displaySocials={true}
          displayItemNumbering={true}
          menuButtonColor="#000"
          openMenuButtonColor="#fff"
          changeMenuColorOnOpen={true}
          colors={["#B8AA98", "#A59682"]}
          logoUrl="/logo/q3.png"
          accentColor="#A59682"
          onMenuOpen={() => console.log("Menu opened")}
          onMenuClose={() => console.log("Menu closed")}
        />
      </div>

      {/* Animated background behind content */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Background
          particleColors={["#000000", "#000000"]}
          particleCount={250}
          particleSpread={10}
          speed={0.1}
          particleBaseSize={100}
          moveParticlesOnHover={true}
          alphaParticles={true}
          disableRotation={false}
        />
      </div>

      <main className="relative z-10 p-6">
        {/* Header + Connect */}
        <div className="max-w-6xl mx-auto mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Challenge 1 — Multi-Read Dashboard
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Search any address, compare approaches, and inspect holdings.
            </p>
          </div>
          <div className="shrink-0 flex items-center">
            <ConnectButtonCustom />
          </div>
        </div>

        {/* Controls Card */}
        <div className="max-w-6xl mx-auto mb-6 border-2 border-black rounded-xl p-4 bg-white/80 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Search */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSearchError(null);
                const trimmed = searchText.trim();
                if (trimmed) {
                  if (isAddress(trimmed)) {
                    setQueryAddress(trimmed);
                    return;
                  }
                  const resolved = await resolveEnsAddress(trimmed);
                  if (resolved && isAddress(resolved)) {
                    setQueryAddress(resolved);
                    return;
                  }
                  setSearchError("Invalid address or ENS name");
                  return;
                }
                if (!trimmed && connectedAddress) {
                  setQueryAddress(connectedAddress);
                  return;
                }
                setQueryAddress("");
                setSearchError("Enter a valid address or connect a wallet");
              }}
              className="flex items-center gap-2 flex-1 min-w-[260px]"
            >
              <input
                type="text"
                placeholder="Enter wallet address..."
                value={displaySearchText}
                onChange={(e) => setSearchText(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="w-full md:w-[420px] px-4 py-2 border-2 border-black rounded-lg focus:outline-none focus:ring-black"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-black text-white rounded-lg hover:opacity-90 transition cursor-pointer border-2 border-black"
              >
                Search
              </button>
              {searchError && (
                <p className="text-xs text-red-600 ml-2">{searchError}</p>
              )}
            </form>

            {/* Network + Filter + Tabs */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-black rounded-full  px-3 py-1">
                <input
                  type="checkbox"
                  className="accent-black cursor-pointer"
                  checked={hideSpam}
                  onChange={(e) => setHideSpam(e.target.checked)}
                />
                Hide Spam Tokens
              </label>
              <NetworkSelector value={network} onChange={setNetwork} />

              <SlideTabs
                tabs={approaches}
                onTabClick={(index) => setActive(index)}
              />
            </div>
          </div>

          {/* Helper text */}
          {!effectiveAddress && (
            <div className="mt-2 text-xs text-gray-600">
              Tip: connect a wallet or paste an address to begin.
            </div>
          )}
        </div>

        {/* Render approaches */}
        <div className="max-w-6xl mx-auto">
          {active === 0 && effectiveAddress && (
            <Approach1
              address={effectiveAddress}
              net={network}
              hideSpam={hideSpam}
            />
          )}
          {active === 1 && effectiveAddress && (
            <Approach2
              address={effectiveAddress}
              net={network}
              hideSpam={hideSpam}
            />
          )}
          {active === 2 && effectiveAddress && (
            <Approach3
              address={effectiveAddress}
              net={network}
              hideSpam={hideSpam}
            />
          )}
        </div>
      </main>
    </div>
  );
}
