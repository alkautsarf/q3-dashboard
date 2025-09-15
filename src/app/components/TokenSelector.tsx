"use client";

import React from "react";
import { isAddress } from "viem"; // via viem docs: https://viem.sh/docs/utilities/address#isaddress

type Token = { symbol: string; address: `0x${string}` };

// Small arbitrum allowlist
const ALLOWLIST: Token[] = [
  { symbol: "USDC", address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
  { symbol: "ARB", address: "0x912ce59144191c1204e64559fe8253a0e49e6548" },
  { symbol: "DAI", address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1" },
] as const;

export default function TokenSelector({
  value,
  onChange,
  disabled,
}: {
  value?: `0x${string}` | "";
  onChange: (addr: `0x${string}` | "") => void;
  disabled?: boolean;
}) {
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
          {ALLOWLIST.map((t) => (
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

