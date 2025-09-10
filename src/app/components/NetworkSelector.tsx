"use client";

import React from "react";
import type { SupportedNetwork } from "@/app/lib/alchemy";

export type NetworkKey = SupportedNetwork;

interface NetworkSelectorProps {
  value: NetworkKey;
  onChange: (next: NetworkKey) => void;
}

const labels: Record<NetworkKey, string> = {
  mainnet: "Mainnet",
  base: "Base",
  arbitrum: "Arbitrum",
};

export function NetworkSelector({ value, onChange }: NetworkSelectorProps) {
  const options: NetworkKey[] = ["mainnet", "base", "arbitrum"];
  return (
    <div className="flex items-center gap-2 border border-gray-400 rounded-full p-1 bg-white">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-3 py-1 text-sm rounded-full transition cursor-pointer ${
            value === opt ? "bg-black text-white" : "text-black hover:bg-gray-100"
          }`}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  );
}

export default NetworkSelector;
