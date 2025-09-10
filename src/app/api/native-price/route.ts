import { NextResponse } from "next/server";

function getKey() {
  return (
    process.env.NEXT_PUBLIC_COINGECKO_API ||
    process.env.NEXT_PUBLIC_COINGECKO_API_KEY ||
    process.env.NEXT_PUBLIC_CG_API_KEY ||
    process.env.NEXT_PUBLIC_CG_KEY ||
    ""
  );
}

// Simple in-memory cache + in-flight request dedupe
let cached: any | null = null;
let cachedAt = 0;
let pending: Promise<NextResponse> | null = null;
const TTL_MS = 60_000; // 60s cache for native price

export async function GET() {
  try {
    const now = Date.now();
    if (cached && now - cachedAt < TTL_MS) {
      return NextResponse.json(cached);
    }
    if (pending) {
      return await pending;
    }

    const run = async () => {
      const headers: Record<string, string> = { accept: "application/json" };
      const key = getKey();
      if (key) headers["x-cg-api-key"] = key;
      const params = new URLSearchParams({
        ids: "ethereum",
        vs_currencies: "usd",
        include_24hr_change: "true",
        include_market_cap: "true",
        include_24hr_vol: "true",
        include_last_updated_at: "true",
      });
      const url = `https://api.coingecko.com/api/v3/simple/price?${params.toString()}`;
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) {
        // On upstream error, serve last cached value if present
        if (cached) return NextResponse.json(cached);
        const status = res.status;
        const body = await res.text();
        return new NextResponse(body || `Upstream error ${status}`, {
          status,
          headers: { "content-type": res.headers.get("content-type") || "text/plain" },
        });
      }
      const json = await res.json();
      const payload = json?.ethereum ?? { usd: 0 };
      cached = payload;
      cachedAt = Date.now();
      return NextResponse.json(payload);
    };

    pending = run();
    const resp = await pending;
    pending = null;
    return resp;
  } catch (err: any) {
    pending = null;
    if (cached) return NextResponse.json(cached);
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
