import { NextResponse } from "next/server";

type PriceEntry = {
  usd: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
  usd_24h_vol?: number;
  last_updated_at?: number;
};

function getKey() {
  return (
    process.env.NEXT_PUBLIC_COINGECKO_API ||
    process.env.NEXT_PUBLIC_COINGECKO_API_KEY ||
    process.env.NEXT_PUBLIC_CG_API_KEY ||
    process.env.NEXT_PUBLIC_CG_KEY ||
    ""
  );
}

// Module-level throttle so all invocations share a minimal gap between upstream calls
let lastRequestAt = 0;
const MIN_GAP_MS = 150; // allow ~6-7 req/sec across workers

async function throttledFetch(url: string, init?: RequestInit, timeoutMs = 7000) {
  const now = Date.now();
  const dt = now - lastRequestAt;
  if (dt < MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_GAP_MS - dt));
  }
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(to);
  }
  lastRequestAt = Date.now();
  return res;
}

// In-memory cache (best-effort) to avoid redundant hits in a short window
const CACHE_TTL_MS = 60_000; // 60s
const cache = new Map<string, { t: number; v: PriceEntry | null }>();

type Progress = {
  platform: string;
  total: number;
  processed: number;
  success: number;
  startAt: number;
  running: boolean;
};
const progressByPlatform = new Map<string, Progress>();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const platform = String(body.platform || "");
    const addresses: string[] = Array.isArray(body.contract_addresses)
      ? body.contract_addresses
      : [];
    if (!platform || !addresses.length) {
      return NextResponse.json(
        { error: "Missing platform or contract_addresses" },
        { status: 400 }
      );
    }

    const list = Array.from(
      new Set(addresses.map((a) => String(a).trim().toLowerCase()).filter(Boolean))
    );

    const headers: Record<string, string> = { accept: "application/json" };
    const key = getKey();
    if (key) headers["x-cg-api-key"] = key;

    const out: Record<string, PriceEntry> = {};

    // init progress
    progressByPlatform.set(platform, {
      platform,
      total: list.length,
      processed: 0,
      success: 0,
      startAt: Date.now(),
      running: true,
    });

    async function fetchOne(addr: string) {
      const cacheKey = `${platform}:${addr}`;
      const c = cache.get(cacheKey);
      if (c && Date.now() - c.t < CACHE_TTL_MS) {
        if (c.v) out[addr] = c.v;
        return;
      }

      const q = new URLSearchParams({
        contract_addresses: addr,
        vs_currencies: "usd",
        include_24hr_change: "true",
        include_market_cap: "true",
        include_24hr_vol: "true",
        include_last_updated_at: "true",
      });
      const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?${q.toString()}`;

      // Try up to 3 times with backoff
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await throttledFetch(url, { headers, cache: "no-store" });
        if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
          const retryAfter = Number(res.headers.get("retry-after")) || 0;
          const wait = retryAfter > 0 ? retryAfter * 1000 : 500 * (attempt + 1);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) break;
        const js = (await res.json()) as Record<string, PriceEntry>;
        const entry = js[addr] || js[addr.toLowerCase()] || null;
        if (entry) {
          out[addr] = entry;
          cache.set(cacheKey, { t: Date.now(), v: entry });
          const prog = progressByPlatform.get(platform);
          if (prog) {
            prog.processed += 1;
            prog.success += 1;
            progressByPlatform.set(platform, prog);
          }
          return;
        }
        break; // got 200 but empty → fallback
      }

      // Fallback: contract detail endpoint
      const dParams = new URLSearchParams({
        localization: "false",
        tickers: "false",
        market_data: "true",
        community_data: "false",
        developer_data: "false",
        sparkline: "false",
      });
      const dUrl = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${addr}?${dParams.toString()}`;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await throttledFetch(dUrl, { headers, cache: "no-store" });
        if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
          const retryAfter = Number(res.headers.get("retry-after")) || 0;
          const wait = retryAfter > 0 ? retryAfter * 1000 : 700 * (attempt + 1);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) break;
        const js = (await res.json()) as any;
        const price: number | undefined = js?.market_data?.current_price?.usd;
        const change: number | undefined =
          js?.market_data?.price_change_percentage_24h_in_currency?.usd ??
          js?.market_data?.price_change_percentage_24h;
        if (typeof price === "number") {
          const entry: PriceEntry = { usd: price };
          if (typeof change === "number") entry.usd_24h_change = change;
          out[addr] = entry;
          cache.set(cacheKey, { t: Date.now(), v: entry });
          const prog = progressByPlatform.get(platform);
          if (prog) {
            prog.processed += 1;
            prog.success += 1;
            progressByPlatform.set(platform, prog);
          }
        } else {
          cache.set(cacheKey, { t: Date.now(), v: null });
          const prog = progressByPlatform.get(platform);
          if (prog) {
            prog.processed += 1;
            progressByPlatform.set(platform, prog);
          }
        }
        break;
      }
    }

    // Run with small concurrency to speed up while respecting throttling
    const CONCURRENCY = 3;
    let idx = 0;
    const worker = async () => {
      while (idx < list.length) {
        const i = idx++;
        const a = list[i];
        await fetchOne(a);
      }
    };
    const workers = Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker());
    await Promise.all(workers);
    const done = progressByPlatform.get(platform);
    if (done) {
      done.running = false;
      progressByPlatform.set(platform, done);
    }
    return NextResponse.json(out);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// Export progress getter for polling
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform") || "";
  if (!platform) return NextResponse.json({ running: false, total: 0, processed: 0, success: 0, startAt: 0 });
  const prog = progressByPlatform.get(platform);
  if (!prog) return NextResponse.json({ running: false, total: 0, processed: 0, success: 0, startAt: 0 });
  return NextResponse.json(prog);
}
