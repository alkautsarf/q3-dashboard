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
    const address = searchParams.get("address");
    if (!platform || !address) {
      return NextResponse.json(
        { error: "Missing platform or address" },
        { status: 400 }
      );
    }
    const headers: Record<string, string> = { accept: "application/json" };
    const key = getKey();
    if (key) headers["x-cg-api-key"] = key;

    const params = new URLSearchParams({
      localization: "false",
      tickers: "false",
      market_data: "true",
      community_data: "false",
      developer_data: "false",
      sparkline: "false",
    });
    const url = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${address.toLowerCase()}?${params.toString()}`;
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
    // Extract price + 24h% and image
    const price: number | undefined = json?.market_data?.current_price?.usd;
    const change: number | undefined =
      json?.market_data?.price_change_percentage_24h_in_currency?.usd ??
      json?.market_data?.price_change_percentage_24h;
    const logo: string | undefined = json?.image?.small || json?.image?.thumb;
    return NextResponse.json({ price, change, logo });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
