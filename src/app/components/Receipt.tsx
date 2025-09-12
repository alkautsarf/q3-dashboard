"use client";
import React from "react";

type Item = { who: string; amount: string };

type Props = {
  token: string;
  items: Item[];
  total: string;
  userBalance?: string;
  remaining?: string;
  gasBatch?: string;
  gasIndiv?: string;
  onProceed?: () => void;
  onEdit?: () => void;
  onAbort?: () => void;
};

// Presentational receipt (dumb). Data-only via props.
export default function Receipt({ token, items, total, userBalance, remaining, gasBatch, gasIndiv, onProceed, onEdit, onAbort }: Props) {
  return (
    <div className="border border-black">
      <div className="px-4 py-2 border-b border-black bg-gray-100 text-sm">Receipt</div>
      <div className="p-4 space-y-4 text-sm text-black">
        <div className="flex items-center gap-3">
          <span className="text-gray-600">Token</span>
          <span className="px-2 py-0.5 border border-black bg-white">{token}</span>
        </div>
        <div>
          <div className="text-gray-600 mb-2">Recipients</div>
          <ul className="border border-black divide-y divide-gray-300">
            {items.map((it, i) => (
              <li key={i} className="px-4 py-2 flex items-center justify-between">
                <span className="font-mono truncate mr-3">{it.who}</span>
                <span>{it.amount} <span className="text-gray-600">{token}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-black p-3">
            <div className="text-gray-600">Total</div>
            <div className="font-semibold">{total} {token}</div>
          </div>
          <div className="border border-black p-3">
            <div className="text-gray-600">Balance → Remaining</div>
            <div>{userBalance ?? "–"} → {remaining ?? "–"}</div>
          </div>
        </div>
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
        <div className="flex items-center gap-2">
          <button onClick={onProceed} className="px-3 py-1 border border-black bg-white hover:bg-gray-100">Proceed</button>
          <button onClick={onEdit} className="px-3 py-1 border border-black bg-white hover:bg-gray-100">Edit</button>
          <button onClick={onAbort} className="px-3 py-1 border border-black bg-white hover:bg-gray-100">Abort</button>
        </div>
      </div>
    </div>
  );
}
