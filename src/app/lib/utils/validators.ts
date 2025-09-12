// Basic validators and parsers; expanded per Challenge 2 docs.
// via viem utils: https://viem.sh/docs/utilities/isAddress
import { isAddress as viemIsAddress } from "viem";

export function isPositiveNumber(input: string): boolean {
  const n = Number(input);
  return Number.isFinite(n) && n > 0;
}

export function parseRecipientLine(line: string) {
  // Expected format: addressOrENS=amount
  const [lhs, rhs] = line.split("=");
  return { who: lhs?.trim() ?? "", amount: rhs?.trim() ?? "" };
}

export function isAddress(input: string): input is `0x${string}` {
  return viemIsAddress(input as `0x${string}`);
}

