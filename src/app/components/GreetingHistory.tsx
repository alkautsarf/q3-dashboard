"use client";

import React, { useEffect, useMemo, useState } from "react";
import GlassCard from "@/app/components/Shared/GlassCard";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { ARBITRUM_CHAIN_ID, GREETING_ADDRESS, greetingAbi, type GreetingLog } from "@/app/lib/greeting";
import { formatEther } from "viem";

function shortAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function GreetingHistory() {
  const pub = usePublicClient({ chainId: ARBITRUM_CHAIN_ID });
  const [logs, setLogs] = useState<GreetingLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!pub) return;
      setLoading(true);
      setError(null);
      try {
        const latest = await pub.getBlockNumber();
        const from = latest > 100000n ? latest - 100000n : 0n; // last ~100k blocks
        // via viem getLogs: https://viem.sh/docs/actions/public/getLogs
        const lgs = (await pub.getLogs({
          address: GREETING_ADDRESS,
          event: {
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
          } as any,
          fromBlock: from,
          toBlock: latest,
        } as any)) as any[];
        const items = lgs
          .slice(-50)
          .reverse()
          .map((e) => ({ args: e.args as any, blockNumber: e.blockNumber, transactionHash: e.transactionHash })) as GreetingLog[];
        if (mounted) setLogs(items);
      } catch (e: any) {
        if (mounted) setError(String(e?.message || e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [pub]);

  // Live updates via event subscription
  useWatchContractEvent({
    address: GREETING_ADDRESS,
    abi: greetingAbi,
    eventName: "GreetingLogged",
    chainId: ARBITRUM_CHAIN_ID,
    onLogs: (newLogs: any[]) => {
      const mapped = (newLogs || []).map((e) => ({ args: e.args, blockNumber: e.blockNumber, transactionHash: e.transactionHash })) as GreetingLog[];
      setLogs((prev) => [...mapped.reverse(), ...prev].slice(0, 200));
    },
  });

  const latest = logs[0];

  return (
    <div className="w-full space-y-6">
      <GlassCard title="Latest Greeting" className="w-full">
        <div className="space-y-2">
          {latest ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-mono">{shortAddr(latest.args.user)}</div>
                <div className="text-xs text-gray-600">Block {latest.blockNumber?.toString() ?? ""}</div>
              </div>
              <div className="mt-2 text-base break-words">{latest.args.fullMessage}</div>
              <div className="mt-2 text-xs text-gray-600 flex items-center gap-3">
                <span className={`px-2 py-0.5 border border-black rounded ${latest.args.premium ? "bg-[#B8AA98]" : "bg-white"}`}>
                  {latest.args.premium ? "Premium" : "Free"}
                </span>
                {latest.args.premium && (
                  <span>
                    Fee: {latest.args.token === "0x0000000000000000000000000000000000000000" ? `${formatEther(latest.args.fee)} ETH` : `${latest.args.fee.toString()} @ ${shortAddr(latest.args.token)}`}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">No greetings yet.</div>
          )}
        </div>
      </GlassCard>

      <GlassCard title="History" className="w-full">
        <div className="space-y-3">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {loading && <div className="text-sm text-gray-600">Loading…</div>}
        <div className="max-h-[520px] overflow-auto no-scrollbar divide-y divide-gray-300 border border-black rounded">
          {logs.slice(1).map((l, i) => {
            const a = l.args;
            const isEth = a.token === "0x0000000000000000000000000000000000000000";
            return (
              <div key={`${l.transactionHash}-${i}`} className={`p-3 ${i % 2 ? "bg-gray-50" : "bg-white"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-mono">{shortAddr(a.user)}</div>
                  <div className="text-xs text-gray-600">Block {l.blockNumber?.toString() ?? ""}</div>
                </div>
                <div className="mt-2 text-sm break-words">{a.fullMessage}</div>
                <div className="mt-2 text-xs text-gray-600 flex items-center gap-3">
                  <span className={`px-2 py-0.5 border border-black rounded ${a.premium ? "bg-[#B8AA98]" : "bg-white"}`}>
                    {a.premium ? "Premium" : "Free"}
                  </span>
                  {a.premium && (
                    <span>
                      Fee: {isEth ? `${formatEther(a.fee)} ETH` : `${a.fee.toString()} @ ${shortAddr(a.token)}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </GlassCard>
    </div>
  );
}
