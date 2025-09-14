// viem + wagmi interaction helpers for Disperse contract.
// via wagmi docs: https://wagmi.sh/react/api/hooks/useWriteContract
// via viem docs: https://viem.sh/docs/actions/public/estimateContractGas
import type { Address, PublicClient } from "viem";
import { parseUnits } from "viem";

export type DisperseRecipient = { address: Address; amount: bigint };

export const disperseAbi = [
  // events
  {
    type: "event",
    name: "TransferOut",
    inputs: [
      { name: "token", type: "address", indexed: false },
      { name: "to", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BatchSent",
    inputs: [
      { name: "token", type: "address", indexed: false },
      { name: "sender", type: "address", indexed: false },
      { name: "total", type: "uint256", indexed: false },
      { name: "count", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  // functions
  {
    type: "function",
    stateMutability: "payable",
    name: "disperseEther",
    inputs: [
      { name: "recipients", type: "address[]" },
      { name: "values", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "disperseToken",
    inputs: [
      { name: "token", type: "address" },
      { name: "recipients", type: "address[]" },
      { name: "values", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

export const erc20Abi = [
  { type: "function", stateMutability: "view", name: "decimals", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", stateMutability: "view", name: "symbol", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", stateMutability: "view", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "nonpayable", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "nonpayable", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export function getDisperseAddress(): Address {
  const addr = process.env.NEXT_PUBLIC_C2_ADDRESS as Address | undefined;
  if (!addr) throw new Error("Missing NEXT_PUBLIC_C2_ADDRESS");
  return addr;
}

export async function estimateBatchNative(
  client: PublicClient,
  args: { contract: Address; from: Address; recipients: Address[]; values: bigint[]; value: bigint }
): Promise<bigint> {
  return client.estimateContractGas({
    address: args.contract,
    abi: disperseAbi,
    functionName: "disperseEther",
    account: args.from,
    args: [args.recipients, args.values],
    value: args.value,
  });
}

export async function estimateBatchErc20(
  client: PublicClient,
  args: { contract: Address; from: Address; token: Address; recipients: Address[]; values: bigint[] }
): Promise<bigint> {
  return client.estimateContractGas({
    address: args.contract,
    abi: disperseAbi,
    functionName: "disperseToken",
    account: args.from,
    args: [args.token, args.recipients, args.values],
  });
}

export async function estimateIndivNative(
  client: PublicClient,
  args: { from: Address; recipients: Address[]; values: bigint[] }
): Promise<bigint> {
  let total = BigInt(0);
  for (let i = 0; i < args.recipients.length; i++) {
    const g = await client.estimateGas({ to: args.recipients[i], account: args.from, value: args.values[i] });
    total += g;
  }
  return total;
}

export async function estimateIndivErc20(
  client: PublicClient,
  args: { from: Address; token: Address; recipients: Address[]; values: bigint[] }
): Promise<bigint> {
  let total = BigInt(0);
  for (let i = 0; i < args.recipients.length; i++) {
    const g = await client.estimateContractGas({
      address: args.token,
      abi: erc20Abi,
      functionName: "transfer",
      account: args.from,
      args: [args.recipients[i], args.values[i]],
    });
    total += g;
  }
  return total;
}

export async function sendNative(
  writeContractAsync: (args: any) => Promise<`0x${string}`>,
  args: { contract: Address; from: Address; recipients: Address[]; values: bigint[]; value: bigint; chainId?: number }
): Promise<`0x${string}`> {
  return writeContractAsync({
    address: args.contract,
    abi: disperseAbi,
    functionName: "disperseEther",
    args: [args.recipients, args.values],
    value: args.value,
    chainId: args.chainId,
  });
}

export async function sendErc20(
  writeContractAsync: (args: any) => Promise<`0x${string}`>,
  args: { contract: Address; from: Address; token: Address; recipients: Address[]; values: bigint[]; chainId?: number }
): Promise<`0x${string}`> {
  return writeContractAsync({
    address: args.contract,
    abi: disperseAbi,
    functionName: "disperseToken",
    args: [args.token, args.recipients, args.values],
    chainId: args.chainId,
  });
}

export async function approveErc20(
  writeContractAsync: (args: any) => Promise<`0x${string}`>,
  args: { token: Address; owner: Address; spender: Address; amount: bigint; chainId?: number }
): Promise<`0x${string}`> {
  return writeContractAsync({
    address: args.token,
    abi: erc20Abi,
    functionName: "approve",
    args: [args.spender, args.amount],
    chainId: args.chainId,
  });
}

export async function checkAllowance(
  client: PublicClient,
  args: { token: Address; owner: Address; spender: Address }
): Promise<bigint> {
  return client.readContract({
    address: args.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [args.owner, args.spender],
  }) as Promise<bigint>;
}

export async function getErc20Meta(
  client: PublicClient,
  token: Address
): Promise<{ symbol: string; decimals: number }> {
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }) as Promise<string>,
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }) as Promise<number>,
  ]);
  return { symbol, decimals };
}

export function toUnits(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}
