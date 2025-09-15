// Greeting contract helpers (Arbitrum only)
// via wagmi docs: useWriteContract / usePublicClient
import type { Address } from "viem";

export const ARBITRUM_CHAIN_ID = 42161;
export const GREETING_ADDRESS = (process.env.NEXT_PUBLIC_C4_ADDRESS || "0x0000000000000000000000000000000000000000") as Address;
// Uniswap Permit2 (same address on mainnet & arbitrum). Use lowercase to satisfy viem address validation.
export const PERMIT2_ADDRESS = "0x000000000022d473030f116ddee9f6b43ac78ba3" as Address;

// Minimal ABI for UI interactions
export const greetingAbi = [
  {
    type: "function",
    name: "setGreetingETH",
    stateMutability: "payable",
    inputs: [{ name: "newGreeting", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setGreetingWithPermit2612",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "fee", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
      { name: "newGreeting", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setGreetingWithPermit2",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "fee", type: "uint256" },
      {
        name: "permit",
        type: "tuple",
        components: [
          {
            name: "permitted",
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
      { name: "newGreeting", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "GreetingLogged",
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "fullMessage", type: "string" },
      { indexed: false, name: "messageHash", type: "bytes32" },
      { indexed: false, name: "premium", type: "bool" },
      { indexed: false, name: "fee", type: "uint256" },
      { indexed: true, name: "token", type: "address" },
    ],
    anonymous: false,
  },
] as const;

export type GreetingLog = {
  args: {
    user: Address;
    fullMessage: string;
    messageHash: `0x${string}`;
    premium: boolean;
    fee: bigint;
    token: Address;
  };
  blockNumber?: bigint;
  transactionHash?: `0x${string}`;
};

export function greetingAddressForChain(_chainId: number): Address {
  // Address is identical across chains via CREATE2; return single constant.
  return GREETING_ADDRESS;
}

// Minimal ERC20 ABI (name, symbol, decimals, allowance, approve, nonces)
export const erc20Abi = [
  { type: "function", stateMutability: "view", name: "name", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", stateMutability: "view", name: "version", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", stateMutability: "view", name: "symbol", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", stateMutability: "view", name: "decimals", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", stateMutability: "view", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "nonpayable", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "view", name: "nonces", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "DOMAIN_SEPARATOR", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", stateMutability: "view", name: "PERMIT_TYPEHASH", inputs: [], outputs: [{ type: "bytes32" }] },
] as const;
