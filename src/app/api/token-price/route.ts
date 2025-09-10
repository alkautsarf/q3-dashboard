// Alias for `/api/token-prices` to avoid 404s from older clients
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform");
    const rawContracts =
      searchParams.get("contract_addresses") || searchParams.get("contracts");
    if (!platform || !rawContracts) {
      return NextResponse.json(
        { error: "Missing platform or contracts" },
        { status: 400 }
      );
    }

    const headers: Record<string, string> = { accept: "application/json" };
    const key = getKey();
    if (key) headers["x-cg-api-key"] = key;

    const list = Array.from(
      new Set(
        rawContracts
          .split(",")
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean)
      )
    );

    const params = new URLSearchParams({
      contract_addresses: list.join(","),
      vs_currencies: "usd",
      include_24hr_change: "true",
      include_market_cap: "true",
      include_24hr_vol: "true",
      include_last_updated_at: "true",
    });
    const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?${params.toString()}`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      const status = res.status;
      const body = await res.text();
      return new NextResponse(body || `Upstream error ${status}`, {
        status,
        headers: { "content-type": res.headers.get("content-type") || "text/plain" },
      });
    }
    const json = await res.json();
    const norm: Record<string, unknown> = {};
    Object.entries(json || {}).forEach(([k, v]) => {
      norm[String(k).toLowerCase()] = v;
    });
    return NextResponse.json(norm);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
