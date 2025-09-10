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
    const contracts = searchParams.get("contracts");
    if (!platform || !contracts) {
      return NextResponse.json(
        { error: "Missing platform or contracts" },
        { status: 400 }
      );
    }
    const headers: Record<string, string> = { accept: "application/json" };
    const key = getKey();
    if (key) headers["x-cg-api-key"] = key;
    const list = Array.from(
      new Set(contracts.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean))
    );
    const out: Record<string, string> = {};
    for (const addr of list) {
      try {
        const url = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${addr}`;
        const res = await fetch(url, { headers, cache: "force-cache" });
        if (!res.ok) continue;
        const json = (await res.json()) as any;
        const logo: string | undefined = json?.image?.small || json?.image?.thumb;
        if (logo) out[addr] = logo;
      } catch {
        // ignore
      }
    }
    return NextResponse.json(out);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
