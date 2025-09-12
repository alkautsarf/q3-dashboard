"use client";
import React from "react";

type Props = {
  status: "idle" | "pending" | "success" | "fail";
  txHash?: string;
  gasBatch?: string;
  gasIndiv?: string;
};

// Presentational (dumb) tx progress: pending → success/fail.
export default function TxStatus({ status, txHash, gasBatch, gasIndiv }: Props) {
  const color = status === "success" ? "text-green-600" : status === "fail" ? "text-red-600" : "text-black";
  return (
    <div className="border border-black">
      <div className="px-4 py-2 border-b border-black bg-[#B8AA98] text-sm">Transaction</div>
      <div className="p-4 space-y-3 text-sm">
        <div className={color}>Status: {status}</div>
        {txHash && (
          <div className="font-mono truncate">{txHash}</div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-black p-3">
            <div className="text-gray-600">Gas (Batch)</div>
            <div>{gasBatch ?? "–"}</div>
          </div>
          <div className="border border-black p-3">
            <div className="text-gray-600">Gas (Individual)</div>
            <div>{gasIndiv ?? "–"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
