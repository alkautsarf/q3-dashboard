// viem + wagmi interaction helpers for Disperse contract.
// via docs/challenges/challenge-2.md (to be implemented)
export type DisperseRecipient = { address: `0x${string}`; amount: bigint };

export async function estimateBatchNative() {
  // TODO: implement with viem's estimateContractGas
  return null as unknown as bigint;
}

export async function estimateBatchErc20() {
  // TODO: implement with viem's estimateContractGas
  return null as unknown as bigint;
}

export async function sendNative() {
  // TODO: implement batch send via disperseEther
  return null as unknown as string; // tx hash
}

export async function sendErc20() {
  // TODO: implement batch send via disperseToken
  return null as unknown as string; // tx hash
}

export async function approveErc20() {
  // TODO: implement approval flow
  return null as unknown as string; // tx hash
}

export async function checkAllowance() {
  // TODO: implement allowance check via viem readContract
  return 0n;
}

