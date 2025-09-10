// Lightweight Coingecko price helpers (client-side fetch)
// Docs: https://www.coingecko.com/en/api/documentation

import type { SupportedNetwork } from "@/app/lib/alchemy";

type PriceEntry = {
  usd: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
  usd_24h_vol?: number;
  last_updated_at?: number;
};

function platformFor(net: SupportedNetwork): string {
  switch (net) {
    case "mainnet":
      return "ethereum";
    case "arbitrum":
      return "arbitrum-one";
    case "base":
      return "base";
    default:
      return "ethereum";
  }
}

export async function fetchErc20Prices(
  net: SupportedNetwork,
  contracts: string[]
): Promise<Record<string, PriceEntry>> {
  const uniq = Array.from(new Set(contracts.map((c) => c.toLowerCase())));
  if (!uniq.length) return {};
  const platform = platformFor(net);

  // Single server-side batch handles throttling, retries, and fallback.
  const res = await fetch("/api/prices/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ platform, contract_addresses: uniq }),
  });
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn("[prices] batch failed", res.status);
    return {};
  }
  const out = (await res.json()) as Record<string, PriceEntry>;
  // eslint-disable-next-line no-console
  console.log(`[coingecko] received ${Object.keys(out).length} price entries for ${platform}`);
  return out || {};
}

export async function fetchNativeEthPrice(): Promise<PriceEntry> {
  const res = await fetch("/api/native-price", { cache: "no-store" });
  if (!res.ok) throw new Error(`Coingecko simple/price error: ${res.status}`);
  const data = (await res.json()) as PriceEntry;
  return data ?? { usd: 0 };
}

// Fetch token logos for contracts missing a logo via Coingecko
// Returns map of lowercase contract -> logo URL (small/thumb)
export async function fetchTokenLogos(
  net: SupportedNetwork,
  contracts: string[]
): Promise<Record<string, string>> {
  if (!contracts.length) return {};
  const platform = platformFor(net);
  const out: Record<string, string> = {};
  const chunkSize = 50;
  for (let i = 0; i < contracts.length; i += chunkSize) {
    const chunk = contracts.slice(i, i + chunkSize).map((a) => a.toLowerCase());
    try {
      const params = new URLSearchParams({ platform, contracts: chunk.join(",") });
      const res = await fetch(`/api/token-logos?${params.toString()}`, {
        cache: "force-cache",
      });
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, string>;
      Object.assign(out, json);
    } catch {
      // ignore batch failures
    }
  }
  return out;
}
