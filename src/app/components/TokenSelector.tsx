"use client";

import React from "react";
import { isAddress } from "viem"; // via viem docs: https://viem.sh/docs/utilities/address#isaddress
import { useChainId } from "wagmi";

type Token = { symbol: string; address: `0x${string}` };

const ALLOWLISTS: Record<number, Token[]> = {
  // Mainnet allowlist (as requested)
  1: [
    { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    { symbol: "ARB", address: "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1" },
    { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" },
  ],
  // Arbitrum allowlist
  42161: [
    { symbol: "USDC", address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
    { symbol: "ARB", address: "0x912ce59144191c1204e64559fe8253a0e49e6548" },
    { symbol: "DAI", address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1" },
  ],
};

export default function TokenSelector({
  value,
  onChange,
  disabled,
  chainId: chainIdProp,
}: {
  value?: `0x${string}` | "";
  onChange: (addr: `0x${string}` | "") => void;
  disabled?: boolean;
  chainId?: number;
}) {
  const activeChainId = chainIdProp ?? useChainId();
  const list = ALLOWLISTS[activeChainId] || [];
  return (
    <div className="flex flex-col gap-2 w-full">
      <label className="text-sm">Token</label>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="px-3 py-2 border-2 border-black rounded-lg bg-white disabled:opacity-50"
          disabled={disabled}
          value={value || ""}
          onChange={(e) => onChange(e.target.value as any)}
        >
          <option value="">Custom Address…</option>
          {list.map((t) => (
            <option key={t.address} value={t.address}>
              {t.symbol}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="0x… (custom)"
          className="min-w-[220px] flex-1 px-3 py-2 border-2 border-black rounded-lg disabled:opacity-50"
          disabled={disabled}
          value={value || ""}
          onChange={(e) => onChange(e.target.value as any)}
        />
      </div>
      {!!value && !isAddress(value) && (
        <div className="text-xs text-red-600">Invalid token address.</div>
      )}
    </div>
  );
}
