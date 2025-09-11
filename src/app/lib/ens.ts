// Lightweight ENS helpers using viem (mainnet)
// via viem docs: https://viem.sh/docs/ens

import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { getAlchemyRpcUrl } from "@/app/lib/alchemy";

let _client: ReturnType<typeof createPublicClient> | null = null;
function getEnsClient() {
  if (_client) return _client;
  const rpc = getAlchemyRpcUrl("mainnet");
  _client = createPublicClient({ chain: mainnet, transport: http(rpc) });
  return _client;
}

export async function resolveEnsAddress(name: string): Promise<string | null> {
  try {
    const client = getEnsClient();
    const addr = await client.getEnsAddress({ name });
    return addr ?? null; // null when not resolvable
  } catch {
    return null;
  }
}

export async function resolveEnsName(address: string): Promise<string | null> {
  try {
    const client = getEnsClient();
    const name = await client.getEnsName({ address: address as `0x${string}` });
    return name ?? null;
  } catch {
    return null;
  }
}

