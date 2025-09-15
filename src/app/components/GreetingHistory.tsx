"use client";

import React, { useEffect, useMemo, useState } from "react";
import GlassCard from "@/app/components/Shared/GlassCard";
import { usePublicClient, useWatchContractEvent, useChainId, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import { greetingAddressForChain, greetingAbi, type GreetingLog, erc20Abi } from "@/app/lib/greeting";
import { formatEther, formatUnits } from "viem";

function shortAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

function Addr({ address }: { address: `0x${string}` }) {
  const { data: ens } = useEnsName({ address, chainId: mainnet.id });
  return <span className="font-mono">{ens || shortAddr(address)}</span>;
}

export default function GreetingHistory() {
  const chainId = useChainId();
  const pub = usePublicClient({ chainId });
  const [logs, setLogs] = useState<GreetingLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenMeta, setTokenMeta] = useState<Record<string, { symbol: string; decimals: number }>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!pub) return;
      setLoading(true);
      setError(null);
      try {
        const latest = await pub.getBlockNumber();
        const addr = greetingAddressForChain(chainId);
        const ev: any = {
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
        };
        let items: GreetingLog[] = [];
        if (chainId === 1) {
          // Mainnet: start from known deployment block, scan in safe windows
          const deployStart = 23370639n; // user-specified deployment block
          const step = 900n; // <= 1k per call (Alchemy limit)
          const maxItems = 50;
          let to = latest;
          let acc: any[] = [];
          while (to >= deployStart && acc.length < maxItems) {
            let from = to > step ? to - step + 1n : deployStart;
            if (from < deployStart) from = deployStart;
            const chunk = (await pub.getLogs({ address: addr, event: ev, fromBlock: from, toBlock: to } as any)) as any[];
            acc = [...chunk, ...acc];
            if (from === deployStart) break;
            to = from - 1n;
          }
          items = acc
            .slice(-maxItems)
            .reverse()
            .map((e) => ({ args: e.args as any, blockNumber: e.blockNumber, transactionHash: e.transactionHash })) as GreetingLog[];
        } else {
          // Other chains: single wider range for convenience
          const from = latest > 100000n ? latest - 100000n : 0n;
          const lgs = (await pub.getLogs({ address: addr, event: ev, fromBlock: from, toBlock: latest } as any)) as any[];
          items = lgs
            .slice(-50)
            .reverse()
            .map((e) => ({ args: e.args as any, blockNumber: e.blockNumber, transactionHash: e.transactionHash })) as GreetingLog[];
        }
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
  }, [pub, chainId]);

  // Live updates via event subscription
  useWatchContractEvent({
    address: greetingAddressForChain(chainId),
    abi: greetingAbi,
    eventName: "GreetingLogged",
    chainId,
    onLogs: (newLogs: any[]) => {
      const mapped = (newLogs || []).map((e) => ({ args: e.args, blockNumber: e.blockNumber, transactionHash: e.transactionHash })) as GreetingLog[];
      setLogs((prev) => [...mapped.reverse(), ...prev].slice(0, 200));
    },
  });

  const latest = logs[0];
  const explorerBase = chainId === 1 ? "https://etherscan.io" : chainId === 42161 ? "https://arbiscan.io" : undefined;

  // Fetch ERC-20 metadata for tokens present in logs
  useEffect(() => {
    (async () => {
      if (!pub) return;
      const uniq = new Set<string>();
      for (const l of logs) {
        const t = (l.args.token as string).toLowerCase();
        if (t && t !== "0x0000000000000000000000000000000000000000" && !tokenMeta[t]) uniq.add(t);
      }
      if (uniq.size === 0) return;
      try {
        const entries = await Promise.all(
          Array.from(uniq).map(async (addr) => {
            try {
              const [symbol, decimals] = await Promise.all([
                pub.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: "symbol" }) as Promise<string>,
                pub.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: "decimals" }) as Promise<number>,
              ]);
              return [addr, { symbol, decimals }] as const;
            } catch {
              return [addr, { symbol: "TOKEN", decimals: 18 }] as const;
            }
          })
        );
        setTokenMeta((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      } catch {}
    })();
  }, [logs, pub]);

  function trimDecimals(v: string, max = 6): string {
    if (!v.includes(".")) return v;
    const [i, d] = v.split(".");
    const dd = d.slice(0, max).replace(/0+$/, "");
    return dd.length ? `${i}.${dd}` : i;
  }

  function formatFee(a: { token: string; fee: bigint }): string {
    const isEth = a.token === "0x0000000000000000000000000000000000000000";
    if (isEth) return `${trimDecimals(formatEther(a.fee))} ETH`;
    const meta = tokenMeta[a.token.toLowerCase()];
    if (!meta) return `${a.fee.toString()} @ ${shortAddr(a.token)}`;
    return `${trimDecimals(formatUnits(a.fee, meta.decimals))} ${meta.symbol}`;
  }

  return (
    <div className="w-full space-y-6">
      <GlassCard title="Latest Greeting" className="w-full">
        <div className="space-y-2">
          {latest ? (
            <a
              href={latest.transactionHash && explorerBase ? `${explorerBase}/tx/${latest.transactionHash}` : undefined}
              target="_blank"
              rel="noreferrer noopener"
              className="block "
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm"><Addr address={latest.args.user as `0x${string}`} /></div>
                <div className="text-xs text-gray-600">Block {latest.blockNumber?.toString() ?? ""}</div>
              </div>
              <div className="mt-2 text-base break-words">{latest.args.fullMessage}</div>
              <div className="mt-2 text-xs  flex items-center gap-3">
                <span className={`px-2 py-0.5 border border-black rounded ${latest.args.premium ? "bg-[#B8AA98]" : "bg-white"}`}>
                  {latest.args.premium ? "Premium" : "Free"}
                </span>
                {latest.args.premium && (<span>Fee: {formatFee({ token: latest.args.token as string, fee: latest.args.fee as bigint })}</span>)}
              </div>
            </a>
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
            return (
              <a
                key={`${l.transactionHash}-${i}`}
                className={`block p-3 ${i % 2 ? "bg-gray-50" : "bg-white"} hover:bg-gray-50`}
                href={l.transactionHash && explorerBase ? `${explorerBase}/tx/${l.transactionHash}` : undefined}
                target="_blank"
                rel="noreferrer noopener"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm"><Addr address={a.user as `0x${string}`} /></div>
                  <div className="text-xs text-gray-600">Block {l.blockNumber?.toString() ?? ""}</div>
                </div>
                <div className="mt-2 text-sm break-words">{a.fullMessage}</div>
                <div className="mt-2 text-xs  flex items-center gap-3">
                  <span className={`px-2 py-0.5 border border-black rounded ${a.premium ? "bg-[#B8AA98]" : "bg-white"}`}>
                    {a.premium ? "Premium" : "Free"}
                  </span>
                  {a.premium && (<span>Fee: {formatFee({ token: a.token as string, fee: a.fee as bigint })}</span>)}
                </div>
              </a>
            );
          })}
        </div>
        </div>
      </GlassCard>
    </div>
  );
}
