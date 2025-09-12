"use client";
import React from "react";
import TerminalLog from "./TerminalLog";
import Receipt from "./Receipt";
import TxStatus from "./TxStatus";
import { parseRecipientLine, isAddress } from "../lib/utils/validators";
import { useAccount, useDisconnect, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit"; // via RainbowKit docs
import { arbitrum } from "wagmi/chains";
import type { Address, PublicClient } from "viem";
import { formatUnits } from "viem";
import {
  estimateBatchNative,
  estimateBatchErc20,
  estimateIndivNative,
  estimateIndivErc20,
  approveErc20,
  checkAllowance,
  getErc20Meta,
  toUnits,
  sendNative,
  sendErc20,
  getDisperseAddress,
} from "../lib/disperse";

type Recipient = { who: string; amount: string };

const greige = "#A59682"; // accent per AGENTS.md

export default function Terminal() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const [selectedChainId, setSelectedChainId] = React.useState<number>(arbitrum.id);
  const publicClient = usePublicClient({ chainId: selectedChainId }); // via wagmi docs: usePublicClient
  const { writeContractAsync } = useWriteContract(); // via wagmi docs

  const [input, setInput] = React.useState("");
  const [lines, setLines] = React.useState<{ id: number; content: React.ReactNode }[]>([
    { id: 1, content: <span className="text-gray-600">Type /help to view available commands.</span> },
  ]);
  const [recipients, setRecipients] = React.useState<Recipient[]>([]);
  const [tokenAddress, setTokenAddress] = React.useState<Address | null>(null); // null => ETH
  const [tokenDecimals, setTokenDecimals] = React.useState<number>(18);
  const [tokenSymbol, setTokenSymbol] = React.useState<string>("ETH");
  const [tokenLabel, setTokenLabel] = React.useState<string>("ETH");
  const [stage, setStage] = React.useState<"editing" | "receipt" | "tx">("editing");
  const [gasBatch, setGasBatch] = React.useState<string | undefined>();
  const [gasIndiv, setGasIndiv] = React.useState<string | undefined>();
  const [userBalance, setUserBalance] = React.useState<string | undefined>();
  const [remaining, setRemaining] = React.useState<string | undefined>();
  const [totalDisplay, setTotalDisplay] = React.useState<string>("0");
  const [txHash, setTxHash] = React.useState<`0x${string}` | undefined>();
  const [txStatus, setTxStatus] = React.useState<"idle" | "pending" | "success" | "fail">("idle");
  const idRef = React.useRef(2);
  const [clock, setClock] = React.useState<string>("");

  const formatTime = React.useCallback((d: Date) => {
    // Deterministic 24h clock + date: HH:MM:SS DD-MMM-YY
    const pad2 = (n: number) => n.toString().padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    const ss = pad2(d.getSeconds());
    const dd = pad2(d.getDate());
    const mmm = months[d.getMonth()];
    const yy = pad2(d.getFullYear() % 100);
    return `${hh}:${mm}:${ss} ${dd}-${mmm}-${yy}`;
  }, []);

  React.useEffect(() => {
    // via React docs: https://react.dev/reference/react/useEffect
    setClock(formatTime(new Date()));
    const id = setInterval(() => setClock(formatTime(new Date())), 1000);
    return () => clearInterval(id);
  }, [formatTime]);

  function pushNode(content: React.ReactNode) {
    setLines((s) => [...s, { id: idRef.current++, content }]);
  }
  function push(text: string) {
    pushNode(<span>{text}</span>);
  }

  // Track receipt updates for tx hash
  const wait = useWaitForTransactionReceipt({ hash: txHash, chainId: selectedChainId });
  React.useEffect(() => {
    if (!txHash) return;
    if (wait.status === "success") {
      setTxStatus("success");
      pushNode(<span className="text-green-600">BatchSent success: <span className="font-mono">{txHash}</span></span>);
    } else if (wait.status === "error") {
      setTxStatus("fail");
      pushNode(<span className="text-red-600">Transaction failed.</span>);
    }
  }, [wait.status, txHash]);

  function onEnter(cmd: string) {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    pushNode(
      <span>
        <span className="text-green-600">❯ </span>
        <span className="text-black">{trimmed}</span>
      </span>
    );

    if (trimmed === "/help") {
      pushNode(
        <span>
          <span className="text-cyan-600">/connect</span>, <span className="text-cyan-600">/disconnect</span>, <span className="text-cyan-600">/network</span>, <span className="text-cyan-600">/token</span>, <span className="text-cyan-600">/done</span>, <span className="text-cyan-600">/abort</span>, <span className="text-cyan-600">/edit</span>, <span className="text-cyan-600">/help</span>
        </span>
      );
      return;
    }
    if (trimmed.startsWith("/network")) {
      const arg = trimmed.split(/\s+/)[1]?.toLowerCase();
      if (!arg) {
        pushNode(<span>Network: <span className="text-purple-600">arbitrum</span> (default)</span>);
        return;
      }
      if (arg === "arbitrum") {
        setSelectedChainId(arbitrum.id);
        pushNode(<span>Switched network to <span className="text-purple-600">arbitrum</span>.</span>);
      } else {
        pushNode(<span className="text-red-600">Unsupported network. Use "/network arbitrum".</span>);
      }
      return;
    }
    if (trimmed.startsWith("/token")) {
      const arg = trimmed.split(/\s+/)[1] ?? "ETH";
      const lower = arg.toLowerCase();
      if (arg === "/") {
        pushNode(
          <span className="text-gray-700">Allowlist (arbitrum): ETH, USDC (0xaf88d065e77c8cc2239327c5edb3a432268e5831), WETH (0x82af49447d8a07e3bd95bd0d56f35241523fbab1)</span>
        );
        return;
      }
      if (lower === "eth") {
        setTokenAddress(null);
        setTokenDecimals(18);
        setTokenSymbol("ETH");
        setTokenLabel("ETH");
        pushNode(<span>Token selected: <span className="text-purple-600 font-medium">ETH</span></span>);
        return;
      }
      if (!isAddress(lower)) {
        pushNode(<span className="text-red-600">Invalid token address. Use /token 0x…</span>);
        return;
      }
      const addr = lower as Address;
      (async () => {
        try {
          const c = publicClient as unknown as PublicClient;
          const { symbol, decimals } = await getErc20Meta(c, addr);
          setTokenAddress(addr);
          setTokenDecimals(decimals);
          setTokenSymbol(symbol);
          setTokenLabel(symbol.toUpperCase());
          pushNode(
            <span>
              Token selected: <span className="text-purple-600 font-medium">{symbol}</span> <span className="text-gray-600">({decimals}d)</span>
            </span>
          );
        } catch (e) {
          pushNode(<span className="text-red-600">Failed to read token metadata.</span>);
        }
      })();
      return;
    }
    if (trimmed === "/abort") {
      setRecipients([]);
      pushNode(
        <span className="text-gray-600">Aborted — recipients cleared. Back to token selection.</span>
      );
      return;
    }
    if (trimmed === "/done") {
      (async () => {
        try {
          if (!address) {
            pushNode(<span className="text-red-600">Connect wallet first with /connect.</span>);
            return;
          }
          const pub = publicClient as unknown as PublicClient;
          const addrs: Address[] = [];
          const vals: bigint[] = [];
          const decimals = tokenAddress ? tokenDecimals : 18;
          const errors: string[] = [];
          for (const r of recipients) {
            let who: Address | null = null;
            try {
              if (r.who.endsWith(".eth")) {
                // ENS disabled per request
                who = null;
              } else if (isAddress(r.who)) {
                who = r.who as Address;
              }
            } catch {}
            if (!who) {
              errors.push(`Invalid address (ENS disabled): ${r.who}`);
              continue;
            }
            try {
              const amt = toUnits(r.amount, decimals);
              addrs.push(who);
              vals.push(amt);
            } catch {
              errors.push(`Invalid amount: ${r.amount}`);
            }
          }
          if (errors.length) errors.forEach((m) => pushNode(<span className="text-red-600">{m}</span>));
          if (addrs.length === 0) {
            pushNode(<span className="text-red-600">No valid recipients.</span>);
            return;
          }
          const total = vals.reduce((a, b) => a + b, 0n);
          setTotalDisplay(formatUnits(total, decimals));
          // Balances
          let bal = 0n;
          if (!tokenAddress) {
            bal = await pub.getBalance({ address });
          } else {
            bal = (await pub.readContract({ address: tokenAddress, abi: [{ type: "function", stateMutability: "view", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] }], functionName: "balanceOf", args: [address] })) as bigint;
          }
          setUserBalance(formatUnits(bal, decimals));
          setRemaining(formatUnits(bal - total, decimals));
          // Gas
          const contract = getDisperseAddress();
          const batch = tokenAddress
            ? await estimateBatchErc20(pub, { contract, from: address, token: tokenAddress, recipients: addrs, values: vals })
            : await estimateBatchNative(pub, { contract, from: address, recipients: addrs, values: vals, value: total });
          const indiv = tokenAddress
            ? await estimateIndivErc20(pub, { from: address, token: tokenAddress, recipients: addrs, values: vals })
            : await estimateIndivNative(pub, { from: address, recipients: addrs, values: vals });
          setGasBatch(batch.toString());
          setGasIndiv(indiv.toString());
          pushNode(
            <Receipt
              token={tokenSymbol}
              items={recipients}
              total={formatUnits(total, decimals)}
              userBalance={formatUnits(bal, decimals)}
              remaining={formatUnits(bal - total, decimals)}
              gasBatch={batch.toString()}
              gasIndiv={indiv.toString()}
              onProceed={async () => {
                try {
                  if (!address) return;
                  const pubClient = publicClient as unknown as PublicClient;
                  const contract = getDisperseAddress();
                  setTxStatus("pending");
                  if (tokenAddress) {
                    const allowance = await checkAllowance(pubClient, { token: tokenAddress, owner: address, spender: contract });
                    if (allowance < total) {
                      pushNode(<span className="text-gray-600">Approval needed for {tokenSymbol}. Requesting…</span>);
                      const tx = await approveErc20(writeContractAsync, { token: tokenAddress, owner: address, spender: contract, amount: total, chainId: selectedChainId });
                      pushNode(<span className="text-gray-600">Approval tx: <span className="font-mono">{tx}</span></span>);
                      const rc = await pubClient.waitForTransactionReceipt({ hash: tx });
                      if (rc.status !== "success") {
                        pushNode(<span className="text-red-600">ApprovalFailed</span>);
                        setTxStatus("fail");
                        return;
                      }
                    }
                    const hash = await sendErc20(writeContractAsync, { contract, from: address, token: tokenAddress, recipients: addrs, values: vals, chainId: selectedChainId });
                    setTxHash(hash);
                    pushNode(<TxStatus status="pending" txHash={hash} gasBatch={batch.toString()} gasIndiv={indiv.toString()} />);
                  } else {
                    const hash = await sendNative(writeContractAsync, { contract, from: address, recipients: addrs, values: vals, value: total, chainId: selectedChainId });
                    setTxHash(hash);
                    pushNode(<TxStatus status="pending" txHash={hash} gasBatch={batch.toString()} gasIndiv={indiv.toString()} />);
                  }
                  setStage("tx");
                } catch (err: any) {
                  pushNode(<span className="text-red-600">{String(err?.shortMessage || err?.message || err)}</span>);
                  setTxStatus("fail");
                }
              }}
              onEdit={() => {
                setStage("editing");
                pushNode(<span className="text-gray-600">Back to editing.</span>);
              }}
              onAbort={() => {
                setRecipients([]);
                setStage("editing");
                pushNode(<span className="text-gray-600">Aborted — recipients cleared.</span>);
              }}
            />
          );
          setStage("receipt");
        } catch (e: any) {
          pushNode(<span className="text-red-600">Failed to compile receipt: {String(e?.message || e)}</span>);
        }
      })();
      return;
    }
    if (trimmed === "/clear") {
      setLines([]);
      return;
    }

    // Otherwise treat as a recipient line: address=amount (ENS disabled)
    const parsed = parseRecipientLine(trimmed);
    if (!parsed.who || !parsed.amount) {
      pushNode(<span className="text-red-600">Invalid line. Use address=amount or /help.</span>);
      return;
    }
    if (parsed.who.endsWith(".eth")) {
      pushNode(<span className="text-red-600">ENS is disabled for recipients. Paste a 0x address.</span>);
      return;
    }
    if (!isAddress(parsed.who)) {
      pushNode(<span className="text-red-600">Invalid address. Paste a checksummed 0x… address.</span>);
      return;
    }
    setRecipients((rs) => [...rs, { who: parsed.who, amount: parsed.amount }]);
    pushNode(
      <span>
        Added: <span className="font-mono text-blue-700">{parsed.who}</span> = <span className="text-emerald-700">{parsed.amount}</span> <span className="text-purple-600">{tokenSymbol}</span>
      </span>
    );
  }

  return (
    <div className="glass-panel w-full overflow-hidden">
      {/* Single terminal pane: log + inline prompt */}
      <TerminalLog
        lines={lines}
        inputValue={input}
        placeholder={isConnected ? `Connected: ${address?.slice(0,6)}…${address?.slice(-4)} • ${selectedChainId === arbitrum.id ? 'arb' : 'net'}` : "Type /help to view available commands."}
        onChange={setInput}
        onEnter={() => {
          const trimmed = input.trim();
          if (!trimmed) return;
          if (trimmed === "/connect") {
            pushNode(<span className="text-gray-600">Opening wallet connect modal…</span>);
            openConnectModal?.();
          } else if (trimmed === "/disconnect") {
            if (isConnected) {
              disconnect();
              pushNode(<span className="text-gray-600">Disconnected.</span>);
            } else {
              pushNode(<span className="text-gray-600">Already disconnected.</span>);
            }
          } else {
            onEnter(input);
          }
          setInput("");
        }}
      />
      {/* Bottom status bar */}
      <div className="w-full bg-[#A59682] text-black font-mono text-xs px-2 py-1 flex items-center justify-between">
        <div>[{selectedChainId === arbitrum.id ? "arb" : "net"}] 0:disperse</div>
        <div className="opacity-80">{clock}</div>
      </div>
    </div>
  );
}
