import { Alchemy, Network } from "alchemy-sdk";
// via alchemy-sdk docs: https://www.npmjs.com/package/alchemy-sdk

export type SupportedNetwork = "mainnet" | "base" | "arbitrum";

const networkMap: Record<SupportedNetwork, Network> = {
  mainnet: Network.ETH_MAINNET,
  base: Network.BASE_MAINNET,
  arbitrum: Network.ARB_MAINNET,
};

function apiKeyFor(net: SupportedNetwork): string {
  if (net === "mainnet") {
    return (
      process.env.NEXT_PUBLIC_ALCHEMY_MAINNET_KEY ||
      process.env.NEXT_PUBLIC_API ||
      "demo"
    );
  }
  if (net === "base") {
    return (
      process.env.NEXT_PUBLIC_ALCHEMY_BASE_KEY ||
      process.env.NEXT_PUBLIC_API ||
      "demo"
    );
  }
  if (net === "arbitrum") {
    return (
      process.env.NEXT_PUBLIC_ALCHEMY_ARBITRUM_KEY ||
      process.env.NEXT_PUBLIC_API ||
      "demo"
    );
  }
  return process.env.NEXT_PUBLIC_API || "demo";
}

const cache: Partial<Record<SupportedNetwork, Alchemy>> = {};

export function getAlchemyClient(net: SupportedNetwork): Alchemy {
  if (cache[net]) return cache[net]!;
  const client = new Alchemy({ apiKey: apiKeyFor(net), network: networkMap[net] });
  cache[net] = client;
  return client;
}

export function getAlchemyRpcUrl(net: SupportedNetwork): string {
  const key = apiKeyFor(net);
  const subdomain =
    net === "mainnet" ? "eth-mainnet" : net === "base" ? "base-mainnet" : "arb-mainnet";
  return `https://${subdomain}.g.alchemy.com/v2/${key}`;
}
