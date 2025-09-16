"use client";
import React from "react";
import { useWaitForTransactionReceipt } from "wagmi"; // via wagmi docs: useWaitForTransactionReceipt

type Props = {
  txHash: `0x${string}`;
  chainId: number;
  label?: string; // e.g., "Approval" | "Batch"
  gasBatch?: string;
  gasIndiv?: string;
  onSettled?: (result: "success" | "error") => void;
};

// Monitor tx progress and show explorer link.
export default function TxStatus({ txHash, chainId, label = "Transaction", gasBatch, gasIndiv, onSettled }: Props) {
  const wait = useWaitForTransactionReceipt({ hash: txHash, chainId });
  const status = wait.status === "success" ? "success" : wait.status === "error" ? "fail" : wait.status === "pending" ? "pending" : "idle";
  const color = status === "success" ? "text-green-600" : status === "fail" ? "text-red-600" : "text-black";

  React.useEffect(() => {
    if (!onSettled) return;
    if (wait.status === "success") onSettled("success");
    else if (wait.status === "error") onSettled("error");
  }, [wait.status, onSettled]);

  const explorerBase = chainId === 1 ? "https://etherscan.io/tx/" : chainId === 42161 ? "https://arbiscan.io/tx/" : undefined;
  const explorerLabel = chainId === 1 ? "Etherscan" : chainId === 42161 ? "Arbiscan" : "Explorer";
  const url = explorerBase ? `${explorerBase}${txHash}` : undefined;

  return (
    <div className="border border-black">
      <div className="px-4 py-2 border-b border-black bg-[#B8AA98] text-sm">{label}</div>
      <div className="p-4 space-y-3 text-sm">
        <div className={color}>Status: {status}</div>
        <div className="font-mono truncate">{txHash}</div>
        {url && (
          <div>
            <a className="text-blue-600 underline" href={url} target="_blank" rel="noreferrer noopener">
              View on {explorerLabel}
            </a>
          </div>
        )}
        {(gasBatch || gasIndiv) && (
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
        )}
      </div>
    </div>
  );
}
